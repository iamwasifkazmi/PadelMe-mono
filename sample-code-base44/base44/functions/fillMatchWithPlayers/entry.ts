import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { matchId } = await req.json();

    // Get the match
    const match = await base44.entities.Match.filter({ id: matchId }, "-created_date", 1).then(r => r[0]);
    if (!match) {
      return Response.json({ error: 'Match not found' }, { status: 404 });
    }

    // Get all users except the organizer
    const allUsers = await base44.entities.User.list();
    const availableUsers = allUsers.filter(u => u.email !== user.email);

    if (availableUsers.length < 3) {
      return Response.json({ error: 'Not enough users to fill match' }, { status: 400 });
    }

    // Pick 3 random users
    const shuffled = availableUsers.sort(() => Math.random() - 0.5);
    const selectedUsers = shuffled.slice(0, 3);

    // Assign to teams (user as team_a, 2 random as team_b, 1 random as team_a)
    const updatedMatch = await base44.entities.Match.update(matchId, {
      players: [user.email, ...selectedUsers.map(u => u.email)],
      team_a: [user.email, selectedUsers[0].email],
      team_b: [selectedUsers[1].email, selectedUsers[2].email],
      status: "full",
    });

    return Response.json({ 
      success: true,
      players: [user.full_name, ...selectedUsers.map(u => u.full_name)],
      team_a: [user.full_name, selectedUsers[0].full_name],
      team_b: [selectedUsers[1].full_name, selectedUsers[2].full_name],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});