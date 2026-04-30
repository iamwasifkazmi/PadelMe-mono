import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * updateRatingSummary
 * Recalculates a player's PlayerRatingSummary from all their received ratings.
 * Called after a new rating is submitted, or on a schedule to reveal blind ratings.
 *
 * Payload: { rated_email: string }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { rated_email } = await req.json();
    if (!rated_email) return Response.json({ error: 'rated_email required' }, { status: 400 });

    // Fetch all revealed/expired ratings for this player
    const allRatings = await base44.asServiceRole.entities.Rating.filter({ rated_email });

    if (allRatings.length === 0) {
      return Response.json({ message: 'No ratings found', total: 0 });
    }

    // Calculate averages
    const totalRatings = allRatings.length;
    const sumOverall = allRatings.reduce((s, r) => s + (r.overall || 0), 0);
    const averageRating = Math.round((sumOverall / totalRatings) * 10) / 10;

    // Tag counts
    const tagCounts = {};
    allRatings.forEach((r) => {
      (r.tags || []).forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Role-split averages
    const teammateRatings = allRatings.filter((r) => r.role === 'teammate');
    const opponentRatings = allRatings.filter((r) => r.role === 'opponent');
    const teammateAvg = teammateRatings.length
      ? Math.round((teammateRatings.reduce((s, r) => s + r.overall, 0) / teammateRatings.length) * 10) / 10
      : null;
    const opponentAvg = opponentRatings.length
      ? Math.round((opponentRatings.reduce((s, r) => s + r.overall, 0) / opponentRatings.length) * 10) / 10
      : null;

    // Find or create the summary record
    const existing = await base44.asServiceRole.entities.PlayerRatingSummary.filter({ user_email: rated_email });
    const summaryData = {
      user_email: rated_email,
      average_rating: averageRating,
      total_ratings: totalRatings,
      tag_reliable_count: tagCounts['reliable'] || 0,
      tag_good_attitude_count: tagCounts['good_attitude'] || 0,
      tag_skill_accurate_count: tagCounts['skill_accurate'] || 0,
      tag_would_play_again_count: tagCounts['would_play_again'] || 0,
      updated_at: new Date().toISOString(),
    };

    if (existing.length > 0) {
      await base44.asServiceRole.entities.PlayerRatingSummary.update(existing[0].id, summaryData);
    } else {
      // Look up user_id
      const users = await base44.asServiceRole.entities.User.filter({ email: rated_email });
      if (users.length > 0) summaryData.user_id = users[0].id;
      await base44.asServiceRole.entities.PlayerRatingSummary.create(summaryData);
    }

    // Also update the User entity's average_rating field for easy access
    const userRecords = await base44.asServiceRole.entities.User.filter({ email: rated_email });
    if (userRecords.length > 0) {
      await base44.asServiceRole.entities.User.update(userRecords[0].id, { average_rating: averageRating });
    }

    return Response.json({ success: true, averageRating, totalRatings, teammateAvg, opponentAvg, tagCounts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});