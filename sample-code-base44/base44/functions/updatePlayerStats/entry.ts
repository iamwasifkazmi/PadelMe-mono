import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const K_FACTOR = 32;
const DEFAULT_ELO = 1000;
const MAX_RECENT_FORM = 10;

// ── Elo helpers ──────────────────────────────────────────────────────────────

function computeElo(winnerElo, loserElo) {
  const expectedWin = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const winnerChange = Math.round(K_FACTOR * (1 - expectedWin));
  const loserChange = Math.round(K_FACTOR * (0 - (1 - expectedWin)));
  return { winnerChange, loserChange };
}

function skillLabelFromElo(elo) {
  if (elo < 900) return 'beginner';
  if (elo < 1100) return 'intermediate';
  return 'advanced';
}

function skillNumericFromElo(elo) {
  const clamped = Math.max(600, Math.min(1400, elo));
  return Math.round(((clamped - 600) / 800) * 9) + 1;
}

function avgElo(emails, allUsers) {
  const elos = emails.map(e => {
    const u = allUsers.find(u => u.email === e);
    return u?.elo_rating || DEFAULT_ELO;
  });
  return elos.reduce((a, b) => a + b, 0) / (elos.length || 1);
}

// ── Score parsing ─────────────────────────────────────────────────────────────
// score may be "6-4, 3-6, 10-8" (sets) or "21-15" (simple)
// Returns { teamAGames, teamBGames, teamASets, teamBSets }
function parseScore(score, winnerIsA) {
  if (!score) return { teamAGames: 0, teamBGames: 0, teamASets: 0, teamBSets: 0 };

  const parts = score.split(',').map(s => s.trim());
  let teamASets = 0, teamBSets = 0, teamAGames = 0, teamBGames = 0;

  for (const part of parts) {
    const match = part.match(/(\d+)[^0-9]+(\d+)/);
    if (!match) continue;
    const a = parseInt(match[1]);
    const b = parseInt(match[2]);
    // Assume score is always written winner-first
    const [winnerGames, loserGames] = winnerIsA ? [a, b] : [b, a];
    teamAGames += winnerIsA ? a : b;
    teamBGames += winnerIsA ? b : a;
    if (winnerGames > loserGames) {
      if (winnerIsA) teamASets++; else teamBSets++;
    } else {
      if (!winnerIsA) teamASets++; else teamBSets++;
    }
  }

  return { teamAGames, teamBGames, teamASets, teamBSets };
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    match_id,
    match_title,
    match_date,
    score,
    event_type = 'casual',     // casual | recurring | tournament | competition
    match_format = 'singles',  // singles | doubles | mixed_doubles
    competition_id,            // optional — for group standings update
    points_win = 3,
    points_loss = 0,
    points_draw = 0,
    // Winner/loser — accept both singular and plural
    winner_email,
    loser_email,
    winner_emails,
    loser_emails,
    // Idempotency guard: skip if this match was already processed
    force_recalculate = false,
  } = body;

  if (!match_id) return Response.json({ error: 'Missing match_id' }, { status: 400 });

  const winners = winner_emails || (winner_email ? [winner_email] : []);
  const losers  = loser_emails  || (loser_email  ? [loser_email]  : []);
  if (!winners.length && !losers.length) {
    return Response.json({ error: 'No participants supplied' }, { status: 400 });
  }

  const allUsers = await base44.asServiceRole.entities.User.list();
  const matchDateStr = match_date || new Date().toISOString().split('T')[0];
  const matchTitleStr = match_title || 'Padel Match';

  // Elo — use team averages for doubles
  const winnerAvgElo = avgElo(winners, allUsers);
  const loserAvgElo  = avgElo(losers, allUsers);
  const { winnerChange, loserChange } = computeElo(winnerAvgElo, loserAvgElo);

  // Parse scores — treat winners as "team A" in score string
  const { teamAGames, teamBGames, teamASets, teamBSets } = parseScore(score, true);

  // ── Process each player ───────────────────────────────────────────────────

  const processPlayer = async (email, isWinner) => {
    const u = allUsers.find(u => u.email === email);
    if (!u) return;

    const eloChange = isWinner ? winnerChange : loserChange;
    const currentElo = u.elo_rating || DEFAULT_ELO;
    const newElo = Math.max(100, currentElo + eloChange);
    const newEloLabel = skillLabelFromElo(newElo);
    const newEloNumeric = skillNumericFromElo(newElo);

    // ── 1. Update User record (fast profile display) ───────────────────────
    const prevHistory = Array.isArray(u.match_history) ? [...u.match_history] : [];
    prevHistory.push({
      match_id,
      date: matchDateStr,
      title: matchTitleStr,
      result: isWinner ? 'win' : 'loss',
      score: score || '',
      elo_change: eloChange,
      elo_after: newElo,
    });
    if (prevHistory.length > 50) prevHistory.splice(0, prevHistory.length - 50);

    await base44.asServiceRole.entities.User.update(u.id, {
      total_matches: (u.total_matches || 0) + 1,
      total_wins:    isWinner ? (u.total_wins   || 0) + 1 : (u.total_wins   || 0),
      total_losses:  isWinner ? (u.total_losses || 0)     : (u.total_losses || 0) + 1,
      elo_rating:    newElo,
      skill_label:   newEloLabel,
      skill_level:   newEloNumeric,
      match_history: prevHistory,
    });

    // ── 2. Upsert PlayerStats aggregate ───────────────────────────────────
    const existing = await base44.asServiceRole.entities.PlayerStats.filter(
      { user_email: email }, '-updated_at', 1
    );
    const prev = existing[0];
    const prevStats = {
      matches_played: prev?.matches_played || 0,
      matches_won:    prev?.matches_won    || 0,
      matches_lost:   prev?.matches_lost   || 0,
      games_won:      prev?.games_won      || 0,
      games_lost:     prev?.games_lost     || 0,
      sets_won:       prev?.sets_won       || 0,
      sets_lost:      prev?.sets_lost      || 0,
      current_win_streak: prev?.current_win_streak || 0,
      best_win_streak:    prev?.best_win_streak    || 0,
      elo_peak:           prev?.elo_peak           || DEFAULT_ELO,
    };

    const matchesPlayed = prevStats.matches_played + 1;
    const matchesWon    = prevStats.matches_won    + (isWinner ? 1 : 0);
    const matchesLost   = prevStats.matches_lost   + (isWinner ? 0 : 1);
    const gamesWon      = prevStats.games_won  + (isWinner ? teamAGames : teamBGames);
    const gamesLost     = prevStats.games_lost + (isWinner ? teamBGames : teamAGames);
    const setsWon       = prevStats.sets_won   + (isWinner ? teamASets  : teamBSets);
    const setsLost      = prevStats.sets_lost  + (isWinner ? teamBSets  : teamASets);
    const streak        = isWinner ? prevStats.current_win_streak + 1 : 0;
    const bestStreak    = Math.max(prevStats.best_win_streak, streak);
    const winPct        = matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0;
    const eloPeak       = Math.max(prevStats.elo_peak, newElo);

    const newStats = {
      user_id:            u.id,
      user_email:         email,
      matches_played:     matchesPlayed,
      matches_won:        matchesWon,
      matches_lost:       matchesLost,
      match_win_pct:      winPct,
      games_won:          gamesWon,
      games_lost:         gamesLost,
      game_difference:    gamesWon - gamesLost,
      sets_won:           setsWon,
      sets_lost:          setsLost,
      set_difference:     setsWon - setsLost,
      current_win_streak: streak,
      best_win_streak:    bestStreak,
      elo_rating:         newElo,
      elo_peak:           eloPeak,
      skill_label:        newEloLabel,
      last_match_at:      matchDateStr,
      updated_at:         new Date().toISOString(),
      // Carry over competition counts
      tournaments_entered: prev?.tournaments_entered || 0,
      tournaments_won:     prev?.tournaments_won     || 0,
      leagues_entered:     prev?.leagues_entered     || 0,
      competitions_entered: event_type === 'competition' || event_type === 'tournament'
        ? (prev?.competitions_entered || 0) + 1
        : (prev?.competitions_entered || 0),
    };

    if (prev) {
      // Audit log — record what changed
      await base44.asServiceRole.entities.StatsAuditLog.create({
        user_id:         u.id,
        user_email:      email,
        match_id,
        action_type:     force_recalculate ? 'stats_recalculated' : 'stats_updated',
        previous_values: prevStats,
        new_values:      { matches_played: matchesPlayed, matches_won: matchesWon, elo_rating: newElo },
        triggered_by:    user.email,
      });
      await base44.asServiceRole.entities.PlayerStats.update(prev.id, newStats);
    } else {
      await base44.asServiceRole.entities.PlayerStats.create(newStats);
    }

    // ── 3. Write PlayerRecentForm entry ───────────────────────────────────
    await base44.asServiceRole.entities.PlayerRecentForm.create({
      user_id:         u.id,
      user_email:      email,
      match_id,
      match_title:     matchTitleStr,
      match_date:      matchDateStr,
      event_type,
      match_format,
      result:          isWinner ? 'W' : 'L',
      opponent_emails: isWinner ? losers : winners,
      score_summary:   score || '',
      elo_change:      eloChange,
      elo_after:       newElo,
    });

    // Prune older form entries — keep latest MAX_RECENT_FORM
    const allForm = await base44.asServiceRole.entities.PlayerRecentForm.filter(
      { user_email: email }, '-match_date', 100
    );
    if (allForm.length > MAX_RECENT_FORM) {
      const toDelete = allForm.slice(MAX_RECENT_FORM);
      await Promise.all(toDelete.map(f => base44.asServiceRole.entities.PlayerRecentForm.delete(f.id)));
    }
  };

  // Run player updates
  await Promise.all([
    ...winners.map(email => processPlayer(email, true)),
    ...losers.map(email => processPlayer(email, false)),
  ]);

  // ── 4. Group standings update (leagues / group stages) ────────────────────
  if (competition_id) {
    const allParticipants = [...winners, ...losers];
    await Promise.all(allParticipants.map(async (email) => {
      const isWinner = winners.includes(email);
      const u = allUsers.find(u => u.email === email);
      if (!u) return;

      const existing = await base44.asServiceRole.entities.GroupStandings.filter(
        { competition_id, user_email: email }, '-updated_at', 1
      );
      const prev = existing[0];

      const played  = (prev?.played || 0) + 1;
      const won     = (prev?.won    || 0) + (isWinner ? 1 : 0);
      const lost    = (prev?.lost   || 0) + (isWinner ? 0 : 1);
      const pts     = (prev?.points || 0) + (isWinner ? points_win : points_loss);
      const gw      = (prev?.games_won  || 0) + (isWinner ? teamAGames : teamBGames);
      const gl      = (prev?.games_lost || 0) + (isWinner ? teamBGames : teamAGames);
      const sw      = (prev?.sets_won   || 0) + (isWinner ? teamASets  : teamBSets);
      const sl      = (prev?.sets_lost  || 0) + (isWinner ? teamBSets  : teamASets);

      const payload = {
        competition_id,
        user_id:    u.id,
        user_email: email,
        player_name: u.full_name || u.name || email,
        played, won, lost, points: pts,
        games_won: gw, games_lost: gl, game_difference: gw - gl,
        sets_won: sw, sets_lost: sl, set_difference: sw - sl,
        updated_at: new Date().toISOString(),
      };

      if (prev) {
        await base44.asServiceRole.entities.GroupStandings.update(prev.id, payload);
      } else {
        await base44.asServiceRole.entities.GroupStandings.create(payload);
      }
    }));
  }

  // ── 5. Mark CompetitionMatch stats_updated ────────────────────────────────
  try {
    const compMatches = await base44.asServiceRole.entities.CompetitionMatch.filter(
      { id: match_id }, '-created_date', 1
    );
    if (compMatches[0] && !compMatches[0].stats_updated) {
      await base44.asServiceRole.entities.CompetitionMatch.update(match_id, { stats_updated: true });
    }
  } catch (_) {
    // Not a competition match — fine
  }

  return Response.json({
    success: true,
    elo_changes: { winners: winnerChange, losers: loserChange },
    processed: { winners, losers },
  });
});