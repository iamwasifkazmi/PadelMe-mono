/**
 * ELO Rating System Utilities
 * Handles skill calculations, tier mappings, and matchmaking logic.
 */

// ── ELO Tiers ────────────────────────────────────────────────────────────────

export const ELO_TIERS = [
  { min: 1600, max: Infinity, label: "Elite", color: "#FFD700", icon: "👑" },
  { min: 1400, max: 1599, label: "Advanced", color: "#FF6B6B", icon: "🏆" },
  { min: 1200, max: 1399, label: "Intermediate", color: "#4ECDC4", icon: "⚡" },
  { min: 1000, max: 1199, label: "Improver", color: "#45B7D1", icon: "📈" },
  { min: 0, max: 999, label: "Beginner", color: "#95E1D3", icon: "🌱" },
];

export function getELOTier(elo) {
  const tier = ELO_TIERS.find(t => elo >= t.min && elo <= t.max);
  return tier || ELO_TIERS[ELO_TIERS.length - 1];
}

export function getSkillLabel(elo) {
  return getELOTier(elo).label.toLowerCase();
}

// ── ELO Calculation ──────────────────────────────────────────────────────────

/**
 * Calculate expected score for a player against opponent.
 * @param {number} playerELO
 * @param {number} opponentELO
 * @returns {number} Expected score (0-1)
 */
export function calculateExpectedScore(playerELO, opponentELO) {
  return 1 / (1 + Math.pow(10, (opponentELO - playerELO) / 400));
}

/**
 * Calculate ELO change.
 * @param {number} currentELO
 * @param {number} opponentELO
 * @param {number} result - 1 (win), 0 (loss), 0.5 (draw)
 * @param {number} kFactor - 20, 32, or 40
 * @returns {object} { newELO, change, expectedScore }
 */
export function calculateELOChange(currentELO, opponentELO, result, kFactor = 32) {
  const expectedScore = calculateExpectedScore(currentELO, opponentELO);
  const change = Math.round(kFactor * (result - expectedScore));
  const newELO = Math.max(800, currentELO + change); // floor at 800
  return { newELO, change, expectedScore };
}

// ── K-Factor Selection ───────────────────────────────────────────────────────

export function getKFactor(matchType, tags = []) {
  // Tournaments = 40 (higher variance)
  if (tags?.includes("tournament")) return 40;
  // Recurring/leagues = 32 (normal)
  if (matchType === "recurring" || tags?.includes("league")) return 32;
  // Social/casual = 20 (lower variance)
  if (tags?.includes("social")) return 20;
  // Default
  return 32;
}

// ── Skill Matching ───────────────────────────────────────────────────────────

/**
 * Rate skill compatibility between two ELO scores.
 * @param {number} elo1
 * @param {number} elo2
 * @returns {object} { quality, gap, label }
 */
export function rateSkillMatch(elo1, elo2) {
  const gap = Math.abs(elo1 - elo2);
  let quality, label;

  if (gap <= 100) {
    quality = 1.0;
    label = "Excellent match";
  } else if (gap <= 200) {
    quality = 0.8;
    label = "Good match";
  } else if (gap <= 300) {
    quality = 0.6;
    label = "Acceptable";
  } else {
    quality = 0.3;
    label = "Weak match";
  }

  return { quality, gap, label };
}

// ── Doubles ELO ──────────────────────────────────────────────────────────────

/**
 * Calculate team average ELO.
 * @param {Array<number>} playerELOs - array of player ELO ratings
 * @returns {number} Average ELO
 */
export function calculateTeamELO(playerELOs = []) {
  if (playerELOs.length === 0) return 1000;
  return Math.round(playerELOs.reduce((a, b) => a + b, 0) / playerELOs.length);
}

// ── Matchmaking Score ────────────────────────────────────────────────────────

/**
 * Score a potential match for a player.
 * Combines: ELO fit (45%), distance (25%), rating (15%), availability (10%), social (5%)
 * @param {number} playerELO
 * @param {number} matchELO - match or opponent ELO
 * @param {number} distance - km
 * @param {number} starRating - 1-5
 * @param {boolean} isFriend
 * @returns {number} Score 0-100
 */
export function scoreMatchForPlayer(playerELO, matchELO, distance, starRating = 3, isFriend = false) {
  // ELO fit (45%)
  const skillMatch = rateSkillMatch(playerELO, matchELO);
  const eloScore = skillMatch.quality * 100;

  // Distance (25%)
  const distanceScore = Math.max(0, 100 - distance * 2); // 0 km = 100, 50 km = 0

  // Rating / Reliability (15%)
  const ratingScore = (starRating / 5) * 100;

  // Availability (10%) - placeholder, handled elsewhere
  const availScore = 70;

  // Social bonus (5%)
  const socialScore = isFriend ? 100 : 50;

  const total =
    (eloScore * 0.45) +
    (distanceScore * 0.25) +
    (ratingScore * 0.15) +
    (availScore * 0.10) +
    (socialScore * 0.05);

  return Math.round(total);
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Check if a match result should update ELO.
 * @param {object} match
 * @returns {boolean}
 */
export function shouldUpdateELO(match) {
  // Only update if confirmed and not disputed/cancelled
  if (!["completed", "confirmed"].includes(match.status)) return false;
  // Ensure score is validated
  if (match.status === "confirmed" && !match.confirmed_by) return false;
  return true;
}