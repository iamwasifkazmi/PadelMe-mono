/**
 * recalculatePlayerStats
 *
 * Admin-only function. Rebuilds a player's PlayerStats aggregate from scratch
 * by reading all their PlayerRecentForm entries. Safe to run multiple times
 * (idempotent). Used when:
 *   - a confirmed score is overridden
 *   - a disputed match is later confirmed
 *   - a match is cancelled after being confirmed by error
 *   - duplicate results were inserted
 *
 * Payload: { user_email: string }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_ELO = 1000;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

  const { user_email } = await req.json();
  if (!user_email) return Response.json({ error: 'user_email required' }, { status: 400 });

  // Load all recent form entries for this player (source of truth)
  const formEntries = await base44.asServiceRole.entities.PlayerRecentForm.filter(
    { user_email }, '-match_date', 200
  );

  // Load the user record for current elo (we won't touch elo here — that's handled by updatePlayerStats)
  const allUsers = await base44.asServiceRole.entities.User.list();
  const u = allUsers.find(u => u.email === user_email);
  if (!u) return Response.json({ error: 'User not found' }, { status: 404 });

  // Aggregate from form entries
  let matchesPlayed = 0, matchesWon = 0, matchesLost = 0;
  let gamesWon = 0, gamesLost = 0;
  let setsWon = 0, setsLost = 0;
  let currentStreak = 0, bestStreak = 0;
  let lastMatchAt = null;
  let tournamentsEntered = 0;

  for (const entry of formEntries) {
    matchesPlayed++;
    const isWin = entry.result === 'W';
    if (isWin) {
      matchesWon++;
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      matchesLost++;
      currentStreak = 0;
    }
    if (entry.event_type === 'tournament' || entry.event_type === 'competition') {
      tournamentsEntered++;
    }
    if (!lastMatchAt || entry.match_date > lastMatchAt) {
      lastMatchAt = entry.match_date;
    }
  }

  const winPct = matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0;

  const newStats = {
    user_id:          u.id,
    user_email,
    matches_played:   matchesPlayed,
    matches_won:      matchesWon,
    matches_lost:     matchesLost,
    match_win_pct:    winPct,
    games_won:        gamesWon,
    games_lost:       gamesLost,
    game_difference:  gamesWon - gamesLost,
    sets_won:         setsWon,
    sets_lost:        setsLost,
    set_difference:   setsWon - setsLost,
    current_win_streak: currentStreak,
    best_win_streak:    bestStreak,
    elo_rating:         u.elo_rating || DEFAULT_ELO,
    elo_peak:           u.elo_rating || DEFAULT_ELO,
    skill_label:        u.skill_label || 'beginner',
    last_match_at:      lastMatchAt,
    competitions_entered: tournamentsEntered,
    updated_at:         new Date().toISOString(),
  };

  // Upsert PlayerStats
  const existing = await base44.asServiceRole.entities.PlayerStats.filter(
    { user_email }, '-updated_at', 1
  );

  let auditPrev = {};
  if (existing[0]) {
    auditPrev = {
      matches_played: existing[0].matches_played,
      matches_won:    existing[0].matches_won,
      elo_rating:     existing[0].elo_rating,
    };
    await base44.asServiceRole.entities.PlayerStats.update(existing[0].id, newStats);
  } else {
    await base44.asServiceRole.entities.PlayerStats.create(newStats);
  }

  // Audit log
  await base44.asServiceRole.entities.StatsAuditLog.create({
    user_id:         u.id,
    user_email,
    match_id:        'RECALCULATION',
    action_type:     'stats_recalculated',
    previous_values: auditPrev,
    new_values:      { matches_played: matchesPlayed, matches_won: matchesWon },
    triggered_by:    user.email,
    notes:           `Full recalculation from ${formEntries.length} form entries`,
  });

  return Response.json({ success: true, stats: newStats });
});