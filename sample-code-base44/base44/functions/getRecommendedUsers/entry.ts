import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { limit = 6, expandRadius = false } = payload;

    // Get all users
    const allUsers = await base44.entities.User.list('-created_date', 1000);
    
    // Get friend emails so private users who are friends can still appear
    const friendRequests = await base44.entities.FriendRequest.filter({ status: 'accepted' }, '-created_date', 500);
    const friendEmails = new Set(
      friendRequests
        .filter((r) => r.requester_email === user.email || r.recipient_email === user.email)
        .map((r) => r.requester_email === user.email ? r.recipient_email : r.requester_email)
    );

    // Filter out current user and private profiles (unless they're a friend)
    const otherUsers = allUsers.filter((u) => {
      if (u.email === user.email) return false;
      if (u.profile_visibility === 'private' && !friendEmails.has(u.email)) return false;
      return true;
    });

    // Score and rank users
    const scored = otherUsers
      .map((candidate) => {
        let score = 0;

        // Location scoring (highest weight)
        if (user.location && candidate.location) {
          const userCity = user.location.split(',')[0].trim().toLowerCase();
          const candCity = candidate.location.split(',')[0].trim().toLowerCase();

          if (userCity === candCity) {
            score += 100; // Same city
          } else if (!expandRadius) {
            // Calculate rough distance (simplified: penalize different cities)
            score -= 50;
          }
        }

        // Travel radius (if both have locations)
        if (user.travel_radius_km && candidate.location) {
          const radius = user.travel_radius_km || 10;
          // Bonus if within radius (simplified check)
          if (radius >= 20) {
            score += 30; // User willing to travel far
          }
        }

        // Sport matching (only recommend users with shared sports)
        const userSports = user.sports || [];
        const candSports = candidate.sports || [];
        const sharedSports = userSports.filter((s) => candSports.includes(s));

        if (sharedSports.length === 0) {
          score -= 1000; // Filter out completely
        } else {
          score += sharedSports.length * 50; // Bonus for each shared sport
        }

        // Skill level matching (within ±2 levels)
        const userSkill = user.skill_level || 5;
        const candSkill = candidate.skill_level || 5;
        const skillDiff = Math.abs(userSkill - candSkill);

        if (skillDiff <= 2) {
          score += 60;
        } else if (skillDiff <= 3) {
          score += 20;
        } else {
          score -= 30;
        }

        // Availability matching
        const userDays = user.availability_days || [];
        const candDays = candidate.availability_days || [];
        const sharedDays = userDays.filter((d) => candDays.includes(d));
        score += sharedDays.length * 10;

        // Trust and quality
        const userRating = candidate.average_rating || 0;
        if (userRating >= 4.5) {
          score += 40;
        } else if (userRating >= 4.0) {
          score += 20;
        }

        // Verification bonus
        if (candidate.photo_verified) {
          score += 25;
        }
        if (candidate.id_verified) {
          score += 30;
        }

        // Recent activity (prefer recently active users)
        if (candidate.updated_date) {
          const daysSinceUpdate = (new Date() - new Date(candidate.updated_date)) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate < 7) {
            score += 15;
          }
        }

        // Filter out low scores (no match at all)
        if (score < 0) {
          return null;
        }

        return { ...candidate, recommendationScore: score };
      })
      .filter(Boolean)
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, limit);

    return Response.json({ recommendations: scored });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});