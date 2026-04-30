import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const todayDay = DAYS[new Date().getDay()];

    // Find all in_progress leagues scheduled for today's weekday
    const allLeagues = await base44.asServiceRole.entities.Competition.filter({
      type: "league",
      status: "in_progress",
      weekly_day: todayDay,
    });

    const results = [];

    for (const league of allLeagues) {
      const totalWeeks = league.league_weeks || 0;
      const currentWeek = league.current_week || 0;

      if (totalWeeks > 0 && currentWeek >= totalWeeks) {
        // League is over — mark completed
        await base44.asServiceRole.entities.Competition.update(league.id, { status: "completed" });
        results.push({ league_id: league.id, action: "completed" });
        continue;
      }

      // Get entries
      const entries = await base44.asServiceRole.entities.CompetitionEntry.filter({
        competition_id: league.id,
        status: "confirmed",
      });

      if (entries.length < 2) {
        results.push({ league_id: league.id, action: "skipped", reason: "not enough players" });
        continue;
      }

      // Generate round-robin pairs for this week
      // Use a rotation based on currentWeek so matchups rotate each week
      const players = [...entries];
      const nextWeek = currentWeek + 1;
      const matches = [];

      // Round-robin rotation: fix player[0], rotate the rest
      const rotated = [...players];
      for (let r = 0; r < currentWeek; r++) {
        const last = rotated.pop();
        rotated.splice(1, 0, last);
      }

      for (let i = 0; i < Math.floor(rotated.length / 2); i++) {
        const p1 = rotated[i];
        const p2 = rotated[rotated.length - 1 - i];
        matches.push({
          competition_id: league.id,
          round: nextWeek,
          round_name: `Week ${nextWeek}`,
          player1_email: p1.player_email,
          player1_name: p1.player_name,
          player2_email: p2.player_email,
          player2_name: p2.player_name,
          status: "scheduled",
          match_order: i + 1,
        });
      }

      await base44.asServiceRole.entities.CompetitionMatch.bulkCreate(matches);
      await base44.asServiceRole.entities.Competition.update(league.id, { current_week: nextWeek });

      results.push({ league_id: league.id, action: "fixtures_generated", week: nextWeek, matches: matches.length });
    }

    return Response.json({ success: true, processed: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});