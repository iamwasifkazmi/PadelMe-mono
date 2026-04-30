/**
 * Central Recommendation Engine
 * Weighted scoring for players, matches, and friend suggestions.
 * All weights are configurable via WEIGHTS config objects.
 */

// ── Configurable Weights ───────────────────────────────────────────────────────

export const PLAYER_WEIGHTS = {
  location: 0.35,
  skill: 0.20,
  availability: 0.15,
  trust: 0.15,
  social: 0.10,
  activity: 0.05,
};

export const MATCH_WEIGHTS = {
  distance: 0.30,
  time: 0.25,
  skill: 0.20,
  joinability: 0.15,
  social: 0.10,
};

export const FRIEND_SUGGESTION_WEIGHTS = {
  recentPlay: 0.30,
  location: 0.25,
  skill: 0.20,
  trust: 0.15,
  activityOverlap: 0.10,
};

// Context-specific weight overrides
export const CONTEXT_WEIGHTS = {
  discover: { ...PLAYER_WEIGHTS },
  instant_play: { location: 0.50, skill: 0.15, availability: 0.20, trust: 0.10, social: 0.03, activity: 0.02 },
  fill_match: { location: 0.20, skill: 0.35, availability: 0.25, trust: 0.15, social: 0.05, activity: 0.00 },
  friend_suggestions: FRIEND_SUGGESTION_WEIGHTS,
};

// ── Haversine Distance ─────────────────────────────────────────────────────────

export function calcDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Subscores (all return 0–100) ───────────────────────────────────────────────

export function locationScore(distanceKm, sameVenue = false, sameTown = false) {
  if (distanceKm === null || distanceKm === undefined) {
    return sameTown ? 75 : 40; // neutral fallback
  }
  let score;
  if (distanceKm <= 5) score = 100;
  else if (distanceKm <= 10) score = 85;
  else if (distanceKm <= 20) score = 65;
  else if (distanceKm <= 50) score = 40;
  else score = 15;
  if (sameVenue) score = Math.min(100, score + 10);
  return score;
}

const SKILL_ORDER = ["beginner", "intermediate", "advanced"];

export function skillScore(userSkill, candidateSkill) {
  if (!userSkill || !candidateSkill) return 50; // neutral
  if (userSkill === "any" || candidateSkill === "any") return 80;
  const uIdx = SKILL_ORDER.indexOf(userSkill);
  const cIdx = SKILL_ORDER.indexOf(candidateSkill);
  if (uIdx === -1 || cIdx === -1) return 50;
  const diff = Math.abs(uIdx - cIdx);
  if (diff === 0) return 100;
  if (diff === 1) return 85;
  if (diff === 2) return 65;
  return 40;
}

/**
 * Score based on ELO compatibility if both players have ELO ratings.
 * 0-100 difference = 100, 100-200 = 80, 200-300 = 60, 300+ = 30
 */
export function eloSkillScore(userELO, candidateELO) {
  if (!userELO || !candidateELO) return 50;
  const gap = Math.abs(userELO - candidateELO);
  if (gap <= 100) return 100;
  if (gap <= 200) return 80;
  if (gap <= 300) return 60;
  return 30;
}

export function skillScoreForMatch(userSkill, matchSkillLevel) {
  if (!matchSkillLevel || matchSkillLevel === "any") return 100;
  if (!userSkill) return 50;
  return skillScore(userSkill, matchSkillLevel);
}

export function availabilityScore(viewer, candidate) {
  if (!viewer || !candidate) return 40;
  const vDays = new Set(viewer.availability_days || []);
  const cDays = new Set(candidate.availability_days || []);
  const vTimes = new Set(viewer.availability_times || []);
  const cTimes = new Set(candidate.availability_times || []);
  const dayOverlap = [...vDays].some(d => cDays.has(d));
  const timeOverlap = [...vTimes].some(t => cTimes.has(t));
  if (dayOverlap && timeOverlap) return 100;
  if (dayOverlap) return 70;
  if (timeOverlap) return 60;
  if (!vDays.size || !cDays.size) return 40; // no data — neutral
  return 10;
}

export function trustScore(candidate) {
  if (!candidate) return 30;
  const rating = candidate.average_rating || 0;
  const reliability = candidate.reliability_score ?? 100;
  const verified = candidate.id_verified ? 20 : candidate.photo_verified ? 10 : 0;
  // rating: 0-5 → 0-50
  const ratingPts = (rating / 5) * 50;
  // reliability: 0-100 → 0-30
  const reliabilityPts = (reliability / 100) * 30;
  return Math.round(ratingPts + reliabilityPts + verified);
}

export function socialScore(viewerEmail, candidateEmail, friendRequests) {
  if (!viewerEmail || !candidateEmail) return 20;
  const accepted = friendRequests.find(
    r => r.status === "accepted" &&
      ((r.requester_email === viewerEmail && r.recipient_email === candidateEmail) ||
       (r.recipient_email === viewerEmail && r.requester_email === candidateEmail))
  );
  if (accepted) return 100;
  // pending requests = some relationship
  const pending = friendRequests.find(
    r => r.status === "pending" &&
      ((r.requester_email === viewerEmail && r.recipient_email === candidateEmail) ||
       (r.recipient_email === viewerEmail && r.requester_email === candidateEmail))
  );
  if (pending) return 60;
  return 20;
}

export function activityScore(candidate) {
  if (!candidate?.updated_date) return 10;
  const diffMs = Date.now() - new Date(candidate.updated_date).getTime();
  const hours = diffMs / 3600000;
  if (hours < 1) return 100;
  if (hours < 24) return 80;
  if (hours < 168) return 50; // 7 days
  if (hours < 720) return 25; // 30 days
  return 10;
}

export function timeScoreForMatch(match) {
  if (!match?.date) return 20;
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  if (match.date < today) return 0; // past
  if (match.date === today) {
    // within 1h?
    if (match.time) {
      const [h, m] = match.time.split(":").map(Number);
      const matchMs = new Date().setHours(h, m, 0, 0);
      const diffH = (matchMs - Date.now()) / 3600000;
      if (diffH >= 0 && diffH <= 1) return 100;
    }
    return match.is_instant ? 100 : 80;
  }
  if (match.date === tomorrow) return 60;
  if (match.date <= weekOut) return 40;
  return 20;
}

export function joinabilityScore(match, viewerEmail) {
  if (!match) return 0;
  const spots = (match.max_players || 2) - (match.players?.length || 0);
  if (spots <= 0) return 0;
  if (match.visibility === "invite_only") {
    return match.invited_emails?.includes(viewerEmail) ? 70 : 0;
  }
  if (spots === 1) return 100;
  return 80;
}

export function socialScoreForMatch(match, friendEmails) {
  if (!match || !friendEmails) return 0;
  const friendsInMatch = (match.players || []).filter(e => friendEmails.has(e)).length;
  if (friendsInMatch >= 2) return 100;
  if (friendsInMatch === 1) return 70;
  return 0;
}

// ── Master Scorer: Player ──────────────────────────────────────────────────────

export function scorePlayer(viewer, candidate, friendRequests, userLat, userLng, weights = PLAYER_WEIGHTS) {
  const dist = calcDistance(userLat, userLng, candidate.location_lat, candidate.location_lng);

  const loc   = locationScore(dist);
  const skill = skillScore(viewer?.skill_label || viewer?.skill_level, candidate?.skill_label || candidate?.skill_level);
  const avail = availabilityScore(viewer, candidate);
  const trust = trustScore(candidate);
  const social = socialScore(viewer?.email, candidate?.email, friendRequests);
  const activity = activityScore(candidate);

  const total = Math.round(
    loc      * weights.location +
    skill    * weights.skill +
    avail    * weights.availability +
    trust    * weights.trust +
    social   * weights.social +
    activity * weights.activity
  );

  return {
    total,
    subscores: { loc, skill, avail, trust, social, activity },
    _distance: dist,
  };
}

// ── Master Scorer: Match ───────────────────────────────────────────────────────

export function scoreMatch(match, viewer, userLat, userLng, friendEmails, weights = MATCH_WEIGHTS) {
  const dist = calcDistance(userLat, userLng, match.location_lat, match.location_lng);

  const distance   = locationScore(dist);
  const time       = timeScoreForMatch(match);
  const skill      = skillScoreForMatch(viewer?.skill_label || viewer?.skill_level, match.skill_level);
  const joinable   = joinabilityScore(match, viewer?.email);
  const social     = socialScoreForMatch(match, friendEmails);

  const total = Math.round(
    distance  * weights.distance +
    time      * weights.time +
    skill     * weights.skill +
    joinable  * weights.joinability +
    social    * weights.social
  );

  return {
    total,
    subscores: { distance, time, skill, joinable, social },
    _distance: dist,
  };
}

// ── Tie-Breaker Sort ───────────────────────────────────────────────────────────

export function tieBreakSort(a, b) {
  // 1. Total score descending
  if (b._score !== a._score) return b._score - a._score;
  // 2. Nearest distance
  const aDist = a._distance ?? 9999;
  const bDist = b._distance ?? 9999;
  if (aDist !== bDist) return aDist - bDist;
  // 3. Highest reliability
  const aRel = a.reliability_score ?? 100;
  const bRel = b.reliability_score ?? 100;
  if (aRel !== bRel) return bRel - aRel;
  // 4. Most recently active
  const aAct = a.updated_date ? new Date(a.updated_date).getTime() : 0;
  const bAct = b.updated_date ? new Date(b.updated_date).getTime() : 0;
  return bAct - aAct;
}

// ── "Why Recommended" Labels ───────────────────────────────────────────────────

/**
 * Returns up to 3 short label strings explaining why this player is recommended.
 */
export function playerReasonLabels(subscores, candidate, dist, isFriend) {
  const reasons = [];

  // Social (highest priority)
  if (isFriend) {
    reasons.push({ label: "Your friend", icon: "🤝", priority: 100 });
  }

  // Location
  if (dist !== null && dist !== undefined) {
    if (dist < 2) reasons.push({ label: "Very nearby", icon: "📍", priority: subscores.loc });
    else if (dist <= 10) reasons.push({ label: "Nearby", icon: "📍", priority: subscores.loc });
  } else if (subscores.loc >= 75) {
    reasons.push({ label: "Near your area", icon: "📍", priority: subscores.loc });
  }

  // Skill
  if (subscores.skill >= 90) reasons.push({ label: "Same skill level", icon: "⚡", priority: subscores.skill });
  else if (subscores.skill >= 75) reasons.push({ label: "Similar skill", icon: "⚡", priority: subscores.skill });

  // Activity
  if (subscores.activity >= 80) reasons.push({ label: "Active today", icon: "🟢", priority: subscores.activity });
  else if (subscores.activity >= 50) reasons.push({ label: "Active this week", icon: "🕐", priority: subscores.activity });

  // Trust
  if (subscores.trust >= 80) reasons.push({ label: "Highly rated", icon: "⭐", priority: subscores.trust });
  else if (subscores.trust >= 60) {
    if (candidate?.reliability_score >= 90) reasons.push({ label: "Reliable player", icon: "✅", priority: subscores.trust });
  }

  // Availability
  if (subscores.avail >= 90) reasons.push({ label: "Available same times", icon: "📅", priority: subscores.avail });

  // Verification
  if (candidate?.id_verified) reasons.push({ label: "ID Verified", icon: "🛡️", priority: 70 });

  // Sort by priority, return top 3
  reasons.sort((a, b) => b.priority - a.priority);
  return reasons.slice(0, 3);
}

/**
 * Returns up to 3 short label strings explaining why this match is recommended.
 */
export function matchReasonLabels(subscores, match, dist, friendsInMatch = 0) {
  const reasons = [];

  if (friendsInMatch > 0) {
    reasons.push({ label: `${friendsInMatch} friend${friendsInMatch > 1 ? "s" : ""} joined`, icon: "🤝", priority: 100 });
  }

  if (subscores.time >= 100) reasons.push({ label: "Starts very soon", icon: "⚡", priority: subscores.time });
  else if (subscores.time >= 80) reasons.push({ label: "Today", icon: "📅", priority: subscores.time });
  else if (subscores.time >= 60) reasons.push({ label: "Tomorrow", icon: "📅", priority: subscores.time });

  if (dist !== null && dist <= 5) reasons.push({ label: "Very close", icon: "📍", priority: subscores.distance });
  else if (dist !== null && dist <= 15) reasons.push({ label: "Near you", icon: "📍", priority: subscores.distance });

  if (subscores.skill >= 90) reasons.push({ label: "Perfect skill match", icon: "🎯", priority: subscores.skill });
  else if (subscores.skill >= 70) reasons.push({ label: "Matches your level", icon: "🎯", priority: subscores.skill });

  const spots = (match.max_players || 2) - (match.players?.length || 0);
  if (spots === 1) reasons.push({ label: "Last spot!", icon: "🔥", priority: 85 });
  else if (spots > 1) reasons.push({ label: `${spots} spots left`, icon: "✅", priority: 60 });

  reasons.sort((a, b) => b.priority - a.priority);
  return reasons.slice(0, 3);
}

// ── Rank Players ──────────────────────────────────────────────────────────────

/**
 * Full pipeline: filter → score → label → sort
 */
export function rankPlayers({
  candidates,
  viewer,
  friendRequests = [],
  hiddenEmails = new Set(),
  friendEmails = new Set(),
  userLat,
  userLng,
  distanceFilterKm = 999,
  skillFilter = "",
  query = "",
  weights = PLAYER_WEIGHTS,
}) {
  return candidates
    .filter(c => {
      if (!c || c.email === viewer?.email) return false;
      if (hiddenEmails.has(c.email)) return false;
      if (c.profile_visibility === "private" && !friendEmails.has(c.email)) return false;
      if (skillFilter && c.skill_label !== skillFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!c.full_name?.toLowerCase().includes(q) && !c.location?.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .map(c => {
      const { total, subscores, _distance } = scorePlayer(viewer, c, friendRequests, userLat, userLng, weights);
      // Distance hard filter
      if (userLat && userLng && _distance !== null && _distance > distanceFilterKm) return null;
      const isFriend = friendEmails.has(c.email);
      const reasons = playerReasonLabels(subscores, c, _distance, isFriend);
      return { ...c, _score: total, _subscores: subscores, _distance, _reasons: reasons, _isFriend: isFriend };
    })
    .filter(Boolean)
    .sort(tieBreakSort);
}

// ── Rank Matches ──────────────────────────────────────────────────────────────

export function rankMatches({
  matches,
  viewer,
  friendEmails = new Set(),
  userLat,
  userLng,
  weights = MATCH_WEIGHTS,
}) {
  return matches
    .map(m => {
      const { total, subscores, _distance } = scoreMatch(m, viewer, userLat, userLng, friendEmails, weights);
      const friendsInMatch = (m.players || []).filter(e => friendEmails.has(e)).length;
      const reasons = matchReasonLabels(subscores, m, _distance, friendsInMatch);
      return { ...m, _score: total, _subscores: subscores, _distance, _reasons: reasons };
    })
    .sort((a, b) => b._score - a._score);
}