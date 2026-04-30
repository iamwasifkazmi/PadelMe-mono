import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONFIRM_WINDOW_MIN = 10;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function skillClose(a, b) {
  if (a == null || b == null) return true;
  return Math.abs(a - b) <= 2;
}

function maxPlayersFor(matchType) {
  return (matchType === 'doubles' || matchType === 'mixed_doubles') ? 4 : 2;
}

function timeLabel() {
  return new Date().toTimeString().slice(0, 5);
}

async function notifyUser(base44, email, type, title, body, matchId) {
  await base44.asServiceRole.entities.Notification.create({
    user_email: email,
    type,
    title,
    body,
    related_entity_type: 'match',
    related_entity_id: matchId || '',
    match_id: matchId || '',
    is_read: false,
    priority: 'high',
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── JOIN ────────────────────────────────────────────────────────────────────
    if (action === 'join') {
      const {
        match_type = 'doubles',
        time_window = '1h',
        location_name = '',
        location_lat,
        location_lng,
        max_distance_km = 10,
        skill_level = 'any',
        skill_numeric,
      } = body;

      const maxPlayers = maxPlayersFor(match_type);
      const windowMs = time_window === 'now' ? 30 : time_window === '1h' ? 60 : 120;
      const expiresAt = new Date(Date.now() + windowMs * 60 * 1000).toISOString();

      // Expire any stale waiting requests from this user (idempotency)
      const myExisting = await base44.asServiceRole.entities.InstantPlayRequest.filter({ user_email: user.email });
      for (const r of myExisting) {
        if (r.status === 'waiting') {
          await base44.asServiceRole.entities.InstantPlayRequest.update(r.id, { status: 'expired' });
        }
      }

      // ── Step A: Find an existing open instant match to join ──────────────────
      const openMatches = await base44.asServiceRole.entities.Match.filter({ status: 'open', is_instant: true });
      const joinable = openMatches.filter(m => {
        if (m.match_type !== match_type) return false;
        if ((m.players || []).includes(user.email)) return false;
        const spots = (m.max_players || maxPlayers) - (m.players || []).length;
        if (spots <= 0) return false;
        if (location_lat && m.location_lat) {
          const dist = haversineKm(location_lat, location_lng, m.location_lat, m.location_lng);
          if (dist > max_distance_km) return false;
        }
        return true;
      });

      if (joinable.length > 0) {
        // Return top 3 candidates for the user to pick, or auto-join the first
        const top = joinable.slice(0, 3).map(m => ({
          id: m.id,
          title: m.title,
          location_name: m.location_name,
          players_count: (m.players || []).length,
          max_players: m.max_players,
          spots_left: m.max_players - (m.players || []).length,
        }));
        return Response.json({ status: 'options', matches: top });
      }

      // ── Step B: Find compatible waiting requests ─────────────────────────────
      const waitingRequests = await base44.asServiceRole.entities.InstantPlayRequest.filter({ status: 'waiting' });
      const compatible = waitingRequests.filter(r => {
        if (r.user_email === user.email) return false;
        if (r.match_type && r.match_type !== match_type) return false;
        if (!skillClose(skill_numeric, r.skill_numeric)) return false;
        if (location_lat && r.location_lat) {
          const dist = haversineKm(location_lat, location_lng, r.location_lat, r.location_lng);
          const cap = Math.min(max_distance_km, r.max_distance_km || 10);
          if (dist > cap) return false;
        }
        return true;
      });

      // Create my waiting record
      const myRequest = await base44.asServiceRole.entities.InstantPlayRequest.create({
        user_email: user.email,
        user_name: user.full_name,
        sport: 'Padel',
        skill_level,
        skill_numeric,
        time_window,
        location_name,
        location_lat,
        location_lng,
        max_distance_km,
        match_type,
        status: 'waiting',
        expires_at: expiresAt,
      });

      const needed = maxPlayers - 1; // other players needed besides me
      if (compatible.length >= needed) {
        // Enough players — form the match immediately
        const partners = compatible.slice(0, needed);
        const allEmails = [user.email, ...partners.map(r => r.user_email)];
        const allNames = [user.full_name, ...partners.map(r => r.user_name)];

        // Build teams for doubles
        let teamA = [], teamB = [];
        if (match_type === 'doubles' || match_type === 'mixed_doubles') {
          teamA = [allEmails[0], allEmails[1]];
          teamB = [allEmails[2], allEmails[3]];
        }

        const matchTitle = `⚡ Instant Padel – ${location_name || 'Nearby'}`;
        const newMatch = await base44.asServiceRole.entities.Match.create({
          title: matchTitle,
          date: new Date().toISOString().split('T')[0],
          time: timeLabel(),
          duration_minutes: 60,
          location_name: location_name || 'TBD – players to confirm',
          location_address: '',
          skill_level: skill_level || 'any',
          match_type,
          max_players: maxPlayers,
          players: allEmails,
          status: 'open', // will become full/ready once all join
          is_instant: true,
          visibility: 'public',
          scoring_mode: 'simple',
          num_sets: 1,
          tags: ['padel', 'instant'],
          team_a: teamA,
          team_b: teamB,
          team_a_captain_email: teamA[0] || '',
          team_b_captain_email: teamB[0] || '',
          notes: `⚡ Instant match formed automatically. Confirm your spot within ${CONFIRM_WINDOW_MIN} minutes.`,
        });

        // Mark all requests as matched
        const allRequestIds = [myRequest.id, ...partners.map(r => r.id)];
        for (const rid of allRequestIds) {
          await base44.asServiceRole.entities.InstantPlayRequest.update(rid, {
            status: 'matched',
            matched_match_id: newMatch.id,
          });
        }

        // Notify all players
        for (let i = 0; i < allEmails.length; i++) {
          await notifyUser(
            base44, allEmails[i], 'match_found',
            '⚡ Match Ready!',
            `You've been matched with ${allNames.filter((_, j) => j !== i).join(', ')}. Confirm your spot now!`,
            newMatch.id
          );
        }

        return Response.json({ status: 'matched', match_id: newMatch.id, request_id: myRequest.id });
      }

      // ── Step C: Not enough players — notify nearby users ────────────────────
      const allUsers = await base44.asServiceRole.entities.User.list();
      const nearby = allUsers.filter(u => {
        if (u.email === user.email) return false;
        if (!u.location_lat || !location_lat) return false;
        const dist = haversineKm(location_lat, location_lng, u.location_lat, u.location_lng);
        return dist <= max_distance_km;
      });

      const notifiedEmails = [];
      for (const u of nearby.slice(0, 20)) {
        await notifyUser(
          base44, u.email, 'match_nearby',
          '⚡ Player Nearby Wants Padel!',
          `${user.full_name} is looking for a ${match_type} game near ${location_name || 'you'}. Open the app to join!`,
          null
        );
        notifiedEmails.push(u.email);
      }

      await base44.asServiceRole.entities.InstantPlayRequest.update(myRequest.id, {
        notified_users: notifiedEmails,
      });

      return Response.json({ status: 'waiting', request_id: myRequest.id, notified_count: notifiedEmails.length });
    }

    // ── JOIN MATCH: user taps to join a specific existing match ────────────────
    if (action === 'join_match') {
      const { match_id } = body;
      const matches = await base44.asServiceRole.entities.Match.filter({ id: match_id });
      const match = matches[0];
      if (!match) return Response.json({ error: 'Match not found' }, { status: 404 });

      const players = match.players || [];
      if (players.includes(user.email)) {
        // Already in — idempotent
        return Response.json({ status: 'matched', match_id: match.id });
      }
      if (players.length >= match.max_players) {
        return Response.json({ error: 'Match is full' }, { status: 409 });
      }

      const updatedPlayers = [...players, user.email];
      const isFull = updatedPlayers.length >= match.max_players;

      // Add to team if doubles
      let teamUpdate = {};
      if (match.match_type === 'doubles' || match.match_type === 'mixed_doubles') {
        const teamA = match.team_a || [];
        const teamB = match.team_b || [];
        if (teamA.length <= teamB.length) {
          teamUpdate = { team_a: [...teamA, user.email] };
          if (!match.team_a_captain_email) teamUpdate.team_a_captain_email = user.email;
        } else {
          teamUpdate = { team_b: [...teamB, user.email] };
          if (!match.team_b_captain_email) teamUpdate.team_b_captain_email = user.email;
        }
      }

      await base44.asServiceRole.entities.Match.update(match.id, {
        players: updatedPlayers,
        status: isFull ? 'full' : 'open',
        ...teamUpdate,
      });

      // Notify organiser
      await notifyUser(base44, match.created_by, 'join',
        'Player joined your match!',
        `${user.full_name} joined "${match.title}"`,
        match.id
      );

      return Response.json({ status: 'matched', match_id: match.id });
    }

    // ── STATUS: poll for waiting request updates ───────────────────────────────
    if (action === 'status') {
      const { request_id } = body;
      const requests = await base44.asServiceRole.entities.InstantPlayRequest.filter({ id: request_id });
      const r = requests[0];
      if (!r) return Response.json({ error: 'Not found' }, { status: 404 });

      // Auto-expire check
      if (r.status === 'waiting' && new Date(r.expires_at) < new Date()) {
        await base44.asServiceRole.entities.InstantPlayRequest.update(r.id, { status: 'expired' });
        return Response.json({ status: 'expired' });
      }

      return Response.json({ status: r.status, match_id: r.matched_match_id });
    }

    // ── CANCEL ─────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const { request_id } = body;
      if (request_id) {
        await base44.asServiceRole.entities.InstantPlayRequest.update(request_id, { status: 'expired' });
      }
      return Response.json({ status: 'cancelled' });
    }

    // ── CONFIRM ────────────────────────────────────────────────────────────────
    if (action === 'confirm') {
      const { request_id } = body;
      await base44.asServiceRole.entities.InstantPlayRequest.update(request_id, { status: 'confirmed' });
      return Response.json({ status: 'confirmed' });
    }

    // ── DECLINE ────────────────────────────────────────────────────────────────
    if (action === 'decline') {
      const { request_id } = body;
      await base44.asServiceRole.entities.InstantPlayRequest.update(request_id, { status: 'declined' });
      return Response.json({ status: 'declined' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});