import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const match = await base44.entities.Match.create({
      title: "TEST PADEL Game",
      date: "2026-04-06",
      time: "16:00",
      duration_minutes: 90,
      location_name: "Horsham",
      location_address: "Horsham, UK",
      skill_level: "any",
      max_players: 4,
      players: [],
      status: "open",
      match_type: "doubles",
      is_instant: false,
      tags: ["test"],
    });

    return Response.json({ 
      success: true, 
      match_id: match.id,
      message: "Match created! Share the match ID to invite players." 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});