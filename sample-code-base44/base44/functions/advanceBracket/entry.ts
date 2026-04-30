import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { competition_id, confirmed_match_id } = await req.json();

    // Get all matches for this competition
    const allMatches = await base44.asServiceRole.entities.CompetitionMatch.filter({ competition_id });

    // Group by round
    const rounds = {};
    for (const m of allMatches) {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    }

    const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);
    const maxRound = roundNumbers[roundNumbers.length - 1];

    // Find which round the confirmed match belongs to
    const confirmedMatch = allMatches.find(m => m.id === confirmed_match_id);
    if (!confirmedMatch) {
      return Response.json({ error: 'Match not found' }, { status: 404 });
    }

    const currentRound = confirmedMatch.round;
    const currentRoundMatches = rounds[currentRound] || [];

    // Check if all matches in current round are confirmed
    const allConfirmed = currentRoundMatches.every(m => m.status === 'confirmed');

    if (!allConfirmed) {
      return Response.json({ status: 'waiting', message: 'Other matches in this round still pending' });
    }

    // Collect winners from this round — supports both singles and doubles
    const winners = currentRoundMatches.map(m => {
      const isDoubles = m.team_a_emails?.length > 0;
      if (isDoubles) {
        const winEmails = m.winner_team === 'team_a' ? (m.team_a_emails || []) : (m.team_b_emails || []);
        const winName = m.winner_team === 'team_a' ? m.player1_name : m.player2_name;
        return { email: winEmails[0], name: winName, emails: winEmails, isDoubles: true };
      }
      return {
        email: m.winner_email,
        name: m.winner_email === m.player1_email ? m.player1_name : m.player2_name,
        emails: [m.winner_email],
        isDoubles: false,
      };
    });

    // Create next round matches
    const nextRound = currentRound + 1;
    const nextMatches = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (winners[i] && winners[i + 1]) {
        const matchData = {
          competition_id,
          round: nextRound,
          player1_email: winners[i].email,
          player1_name: winners[i].name,
          player2_email: winners[i + 1].email,
          player2_name: winners[i + 1].name,
          status: 'scheduled',
          match_order: Math.floor(i / 2) + 1,
        };
        if (winners[i].isDoubles) {
          matchData.team_a_emails = winners[i].emails;
          matchData.team_b_emails = winners[i + 1].emails;
        }
        nextMatches.push(matchData);
      } else if (winners[i]) {
        // Bye - auto-advance
        const byeData = {
          competition_id,
          round: nextRound,
          player1_email: winners[i].email,
          player1_name: winners[i].name,
          player2_email: null,
          player2_name: 'BYE',
          winner_email: winners[i].email,
          status: 'confirmed',
          match_order: Math.floor(i / 2) + 1,
        };
        if (winners[i].isDoubles) {
          byeData.team_a_emails = winners[i].emails;
          byeData.winner_team = 'team_a';
        }
        nextMatches.push(byeData);
      }
    }

    if (nextMatches.length > 0) {
      await base44.asServiceRole.entities.CompetitionMatch.bulkCreate(nextMatches);
    }

    // If final just completed (only 1 match in the advancing round and it's a bye or final)
    const realMatches = nextMatches.filter(m => m.status !== 'confirmed');
    if (realMatches.length === 0) {
      await base44.asServiceRole.entities.Competition.update(competition_id, { status: 'completed' });
      return Response.json({ status: 'completed', message: 'Tournament completed!' });
    }

    return Response.json({ status: 'advanced', round: nextRound, matches_created: nextMatches.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});