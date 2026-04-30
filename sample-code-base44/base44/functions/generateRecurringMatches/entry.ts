import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { parentMatchId, startDate } = await req.json();

    if (!parentMatchId || !startDate) {
      return Response.json({ error: 'Missing parentMatchId or startDate' }, { status: 400 });
    }

    const parent = await base44.entities.Match.filter({ id: parentMatchId }, "-created_date", 1).then(r => r[0]);
    if (!parent) {
      return Response.json({ error: 'Parent match not found' }, { status: 404 });
    }

    const pattern = parent.recurrence_pattern;
    if (!pattern) {
      return Response.json({ error: 'No recurrence pattern' }, { status: 400 });
    }

    const occurrences = [];
    let currentDate = new Date(startDate);
    const startDateObj = new Date(startDate);
    let count = 0;
    const maxOccurrences = 52; // prevent infinite loop

    while (count < maxOccurrences) {
      // Check end conditions
      if (pattern.end_rule === 'on_date' && currentDate > new Date(pattern.end_date)) break;
      if (pattern.end_rule === 'after_count' && count >= pattern.end_count) break;

      // For weekly/biweekly, check if day is in pattern.days
      if ((pattern.frequency === 'weekly' || pattern.frequency === 'biweekly') && pattern.days) {
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDate.getDay()];
        if (!pattern.days.includes(dayName)) {
          advanceDate(currentDate, pattern.frequency);
          continue;
        }
      }

      // Create occurrence
      const occurrenceDate = currentDate.toISOString().split('T')[0];
      const occurrence = await base44.entities.Match.create({
        title: parent.title,
        date: occurrenceDate,
        time: parent.time,
        duration_minutes: parent.duration_minutes,
        location_name: parent.location_name,
        location_address: parent.location_address,
        location_lat: parent.location_lat,
        location_lng: parent.location_lng,
        skill_level: parent.skill_level,
        max_players: parent.max_players,
        match_type: parent.match_type,
        scoring_mode: parent.scoring_mode,
        num_sets: parent.num_sets,
        games_per_set: parent.games_per_set,
        tiebreak_rule: parent.tiebreak_rule,
        notes: parent.notes,
        tags: parent.tags,
        status: 'open',
        players: parent.player_group_mode === 'fixed' ? [...(parent.fixed_players || [])] : [],
        team_a: parent.player_group_mode === 'fixed' ? [...(parent.team_a || [])] : [],
        team_b: parent.player_group_mode === 'fixed' ? [...(parent.team_b || [])] : [],
        parent_match_id: parentMatchId,
        occurrence_number: count + 1,
        occurrence_date: occurrenceDate,
        player_group_mode: parent.player_group_mode,
        fixed_players: parent.fixed_players,
      });

      occurrences.push(occurrence.id);
      count++;
      advanceDate(currentDate, pattern.frequency);
    }

    return Response.json({ success: true, occurrences_created: occurrences.length, occurrence_ids: occurrences });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function advanceDate(date, frequency) {
  if (frequency === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'biweekly') {
    date.setDate(date.getDate() + 14);
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  }
}