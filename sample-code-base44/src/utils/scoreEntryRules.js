/**
 * Determines whether a participant may submit a score for a competition match,
 * based on match lifecycle status, scheduled time, buffer, and deadline.
 *
 * Returns:
 *   { allowed: boolean, reason: string | null, lateSubmission: boolean }
 */
export function getScoreEntryStatus(match, competitionType = "tournament", hasEntryFee = false) {
  if (!match) return { allowed: false, reason: "Match not found", lateSubmission: false };

  const { status, scheduled_date, scheduled_time } = match;

  // Must be in a submittable status
  const submittableStatuses = ["in_progress", "awaiting_score"];
  if (!submittableStatuses.includes(status)) {
    if (status === "scheduled" || status === "check_in_open") {
      // Check if start time has passed even if status hasn't been updated yet
      const startMs = getStartMs(scheduled_date, scheduled_time);
      if (!startMs || Date.now() < startMs) {
        return { allowed: false, reason: "Match hasn't started yet", lateSubmission: false };
      }
      // Start time passed but status not updated — allow with a note
      // (organiser hasn't manually advanced yet)
      return { allowed: false, reason: "Waiting for organiser to open score entry", lateSubmission: false };
    }
    if (status === "pending_validation" || status === "confirmed") {
      return { allowed: false, reason: null, lateSubmission: false };
    }
    return { allowed: false, reason: null, lateSubmission: false };
  }

  // Check start time
  const startMs = getStartMs(scheduled_date, scheduled_time);
  if (startMs) {
    // Buffer: default 0 min for casual, 30 min for league/tournament/paid
    const bufferMin = match.score_buffer_minutes ?? (competitionType !== "casual" || hasEntryFee ? 30 : 0);
    const openAt = startMs + bufferMin * 60 * 1000;

    if (Date.now() < openAt) {
      const minutesLeft = Math.ceil((openAt - Date.now()) / 60000);
      return {
        allowed: false,
        reason: bufferMin > 0
          ? `Score entry opens ${minutesLeft} min after match start`
          : "Match hasn't started yet",
        lateSubmission: false,
      };
    }

    // Deadline: default 12h for casual, 12h for tournaments, 6h for paid
    const deadlineHours = match.score_deadline_hours ?? (hasEntryFee ? 6 : 12);
    const deadlineMs = startMs + deadlineHours * 60 * 60 * 1000;

    if (Date.now() > deadlineMs) {
      return {
        allowed: false,
        reason: "Submission window has closed — organiser/admin action required",
        lateSubmission: true,
      };
    }
  }

  // For paid competitions: require check-in by both players
  if (hasEntryFee && !(match.checked_in_p1 && match.checked_in_p2)) {
    return {
      allowed: false,
      reason: "Both players must check in before submitting a score",
      lateSubmission: false,
    };
  }

  return { allowed: true, reason: null, lateSubmission: false };
}

/** Parse scheduled_date + scheduled_time into a ms timestamp. Returns null if unparseable. */
function getStartMs(scheduled_date, scheduled_time) {
  if (!scheduled_date) return null;
  const dateStr = scheduled_time
    ? `${scheduled_date}T${scheduled_time}`
    : `${scheduled_date}T00:00`;
  const ms = Date.parse(dateStr);
  return isNaN(ms) ? null : ms;
}

/** Returns true if the match has passed its score submission deadline */
export function isPastDeadline(match, hasEntryFee = false) {
  const startMs = getStartMs(match?.scheduled_date, match?.scheduled_time);
  if (!startMs) return false;
  const deadlineHours = match.score_deadline_hours ?? (hasEntryFee ? 6 : 12);
  return Date.now() > startMs + deadlineHours * 60 * 60 * 1000;
}