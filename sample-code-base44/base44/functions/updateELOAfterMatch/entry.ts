import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Calculate ELO changes after a confirmed match.
 * Called by entity automation when Match status → "completed" or "confirmed".
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { match_id } = await req.json();

    if (!match_id) return Response.json({ error: "match_id required" }, { status: 400 });

    // Fetch the match
    const match = await base44.entities.Match.filter({ id: match_id }, "-created_date", 1).then(r => r[0]);
    if (!match) return Response.json({ error: "Match not found" }, { status: 404 });

    // Only update if confirmed and not disputed/cancelled
    if (!["completed", "confirmed"].includes(match.status)) {
      return Response.json({ skip: true, reason: "Match not completed/confirmed" });
    }

    // Determine K-factor based on match type
    const getKFactor = () => {
      if (match.is_recurring) return 32; // recurring = normal
      if (match.tags?.includes("tournament")) return 40; // tournament
      if (match.tags?.includes("social")) return 20; // social/casual
      return 32; // default
    };
    const K = getKFactor();

    const updateELO = async (playerEmail, result) => {
      const playerStats = await base44.entities.PlayerStats.filter({ user_email: playerEmail }, "-created_date", 1).then(r => r[0]);
      if (!playerStats) return;

      const oldELO = playerStats.elo_rating || 1000;
      const opponentELO = getOpponentELO(playerEmail, match);
      const expectedScore = 1 / (1 + Math.pow(10, (opponentELO - oldELO) / 400));
      const eloChange = Math.round(K * (result - expectedScore));
      const newELO = Math.max(800, oldELO + eloChange); // min 800 floor

      await base44.entities.PlayerStats.update(playerStats.id, {
        elo_rating: newELO,
        elo_peak: Math.max(playerStats.elo_peak || 1000, newELO),
        skill_label: getSkillLabel(newELO),
      });

      // Log the change
      await base44.entities.StatsAuditLog.create({
        user_email: playerEmail,
        match_id: match.id,
        action_type: "stats_updated",
        previous_values: { elo_rating: oldELO, skill_label: getSkillLabel(oldELO) },
        new_values: { elo_rating: newELO, skill_label: getSkillLabel(newELO), change: eloChange },
        triggered_by: "system",
        notes: `ELO: ${oldELO} → ${newELO} (${eloChange > 0 ? "+" : ""}${eloChange})`,
      });
    };

    const getSkillLabel = (elo) => {
      if (elo >= 1600) return "elite";
      if (elo >= 1400) return "advanced";
      if (elo >= 1200) return "intermediate";
      if (elo >= 1000) return "improver";
      return "beginner";
    };

    const getOpponentELO = (playerEmail, match) => {
      // Singles
      if (match.match_type === "singles" || !match.team_a) {
        const players = match.players || [];
        const opponentEmail = players.find(p => p !== playerEmail);
        // For now, assume opponent ELO 1000 if not found (fetch actual if needed)
        return 1000;
      }

      // Doubles: get team opponent average
      const isTeamA = match.team_a?.includes(playerEmail);
      const opponentTeam = isTeamA ? match.team_b : match.team_a;
      if (!opponentTeam || opponentTeam.length === 0) return 1000;
      
      // Placeholder: return 1000 (in production, fetch actual player ELOs)
      return 1000;
    };

    // Determine result for each player
    if (match.match_type === "singles" || !match.team_a) {
      // Singles
      const winner = match.winner_email;
      for (const email of match.players || []) {
        const result = email === winner ? 1 : 0;
        await updateELO(email, result);
      }
    } else {
      // Doubles: update both teams
      const winningTeam = match.winner_team; // "team_a" or "team_b"
      for (const email of match.team_a || []) {
        const result = winningTeam === "team_a" ? 1 : 0;
        await updateELO(email, result);
      }
      for (const email of match.team_b || []) {
        const result = winningTeam === "team_b" ? 1 : 0;
        await updateELO(email, result);
      }
    }

    return Response.json({ success: true, match_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});