import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Initialize PlayerStats for a new user with default ELO of 1000.
 * Called via entity automation when User is created.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_email } = await req.json();

    if (!user_email) return Response.json({ error: "user_email required" }, { status: 400 });

    // Check if stats already exist
    const existing = await base44.entities.PlayerStats.filter({ user_email }, "-created_date", 1).then(r => r[0]);
    if (existing) {
      return Response.json({ skip: true, reason: "Stats already exist" });
    }

    // Create initial stats
    const user = await base44.entities.User.filter({ email: user_email }, "-created_date", 1).then(r => r[0]);
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    await base44.entities.PlayerStats.create({
      user_id: user.id,
      user_email: user.email,
      matches_played: 0,
      matches_won: 0,
      matches_lost: 0,
      elo_rating: 1000,
      elo_peak: 1000,
      skill_label: "improver",
      reliability_score: 100,
    });

    return Response.json({ success: true, user_email, elo: 1000 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});