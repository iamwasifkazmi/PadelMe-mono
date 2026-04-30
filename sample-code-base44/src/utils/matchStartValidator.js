// Validates if a match meets minimum start requirements
export function validateMatchStart(match, allUsers = []) {
  if (!match) return { valid: false, reason: "Match data missing" };

  const isDoubles = match.match_type === "doubles" || match.match_type === "mixed_doubles";
  const isMixedDoubles = match.match_type === "mixed_doubles";
  const players = match.players || [];
  const teamA = match.team_a || [];
  const teamB = match.team_b || [];

  // Check minimum player count
  const minRequired = isDoubles ? 4 : 2;
  if (players.length < minRequired) {
    const missing = minRequired - players.length;
    if (isDoubles) {
      if (teamA.length < 2) return { valid: false, reason: `Team A needs ${2 - teamA.length} more player(s)` };
      if (teamB.length < 2) return { valid: false, reason: `Team B needs ${2 - teamB.length} more player(s)` };
      return { valid: false, reason: `Waiting for ${missing} more player(s)` };
    }
    return { valid: false, reason: `Waiting for ${missing} more player(s)` };
  }

  // Check team completeness for doubles
  if (isDoubles) {
    if (teamA.length < 2) return { valid: false, reason: `Team A needs ${2 - teamA.length} more player(s)` };
    if (teamB.length < 2) return { valid: false, reason: `Team B needs ${2 - teamB.length} more player(s)` };
  }

  // Check for duplicate players
  const allTeamPlayers = [...teamA, ...teamB];
  if (new Set(allTeamPlayers).size !== allTeamPlayers.length) {
    return { valid: false, reason: "A player cannot be on multiple teams" };
  }

  // Check for players in both teams (singles shouldn't have teams)
  if (!isDoubles && (teamA.length > 0 || teamB.length > 0)) {
    if (teamA.length !== 1 || teamB.length !== 1) {
      return { valid: false, reason: "Teams misconfigured for singles match" };
    }
  }

  // Validate eligibility criteria for each player
  const playerProfiles = players.map((email) => {
    const user = allUsers.find((u) => u.email === email);
    return user || { email, full_name: email.split("@")[0] };
  });

  for (const player of playerProfiles) {
    // Gender requirement
    if (match.gender_requirement && match.gender_requirement !== "any") {
      if (player.gender && player.gender !== match.gender_requirement && match.gender_requirement !== "mixed") {
        return { valid: false, reason: `${player.full_name} does not meet gender requirement` };
      }
    }

    // Age restrictions
    if (match.age_min && player.age && player.age < match.age_min) {
      return { valid: false, reason: `${player.full_name} is below minimum age requirement` };
    }
    if (match.age_max && player.age && player.age > match.age_max) {
      return { valid: false, reason: `${player.full_name} exceeds maximum age requirement` };
    }

    // Skill level range (inverted: 1 = elite, 10 = beginner)
    if (match.skill_range_min || match.skill_range_max) {
      const playerSkill = player.skill_level || 5;
      if (match.skill_range_min && playerSkill < match.skill_range_min) {
        return { valid: false, reason: `${player.full_name} skill level is too high` };
      }
      if (match.skill_range_max && playerSkill > match.skill_range_max) {
        return { valid: false, reason: `${player.full_name} skill level is too low` };
      }
    }

    // Rating requirement
    if (match.min_rating_threshold) {
      const playerRating = player.avg_reliability || 0;
      if (playerRating < match.min_rating_threshold) {
        return { valid: false, reason: `${player.full_name} does not meet minimum rating requirement` };
      }
    }

    // Verification requirement
    if (match.verification_requirement && match.verification_requirement !== "none") {
      if (match.verification_requirement === "photo" && !player.photo_verified) {
        return { valid: false, reason: `${player.full_name} has not verified their profile` };
      }
      if (match.verification_requirement === "id" && !player.id_verified) {
        return { valid: false, reason: `${player.full_name} has not verified their ID` };
      }
    }
  }

  // Mixed doubles: check gender balance per team
  if (isMixedDoubles) {
    for (const team of [teamA, teamB]) {
      const teamProfiles = team.map((email) =>
        allUsers.find((u) => u.email === email) || { email, full_name: email.split("@")[0], gender: "unknown" }
      );
      const maleCount = teamProfiles.filter((p) => p.gender === "male").length;
      const femaleCount = teamProfiles.filter((p) => p.gender === "female").length;
      if (maleCount !== 1 || femaleCount !== 1) {
        return { valid: false, reason: "Mixed doubles requires 1 male and 1 female per team" };
      }
    }
  }

  return { valid: true, reason: "" };
}