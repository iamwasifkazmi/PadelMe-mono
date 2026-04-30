import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { matchId } = await req.json();

    const testPlayers = [
      { email: `player1test${Date.now()}@test.com`, name: "Alex Thompson" },
      { email: `player2test${Date.now()}@test.com`, name: "Jamie Chen" },
      { email: `player3test${Date.now()}@test.com`, name: "Sam Robinson" },
    ];

    const match = await base44.entities.Match.filter({ id: matchId }, "-created_date", 1).then(r => r[0]);
    if (!match) {
      return Response.json({ error: 'Match not found' }, { status: 404 });
    }

    const playerEmails = testPlayers.map(p => p.email);

    await base44.entities.Match.update(matchId, {
      players: [user.email, ...playerEmails],
      team_a: [user.email, playerEmails[0]],
      team_b: [playerEmails[1], playerEmails[2]],
      status: "full",
    });

    return Response.json({ 
      success: true,
      message: "Match filled with 3 test players",
      players: [user.full_name, ...testPlayers.map(p => p.name)],
      team_a: [user.full_name, testPlayers[0].name],
      team_b: [testPlayers[1].name, testPlayers[2].name],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});