/**
 * Central Notification System
 * 
 * All notification creation goes through this file.
 * Usage: import { createNotification, NOTIF_TYPES } from "@/lib/notifications";
 */

import { base44 } from "@/api/base44Client";

// ── Type definitions ──────────────────────────────────────────────────────────

export const NOTIF_TYPES = {
  // Social
  FRIEND_REQUEST:               "friend_request",
  FRIEND_REQUEST_ACCEPTED:      "friend_request_accepted",
  FRIEND_REQUEST_DECLINED:      "friend_request_declined",
  NEW_MESSAGE:                  "new_message",
  // Match
  MATCH_INVITE:                 "match_invite",
  MATCH_INVITE_ACCEPTED:        "match_invite_accepted",
  MATCH_INVITE_DECLINED:        "match_invite_declined",
  MATCH_STARTING_SOON:          "match_starting_soon",
  MATCH_STARTED:                "match_started",
  MATCH_FOUND:                  "match_found",
  MATCH_ALMOST_FULL:            "match_almost_full",
  MATCH_CANCELLED:              "match_cancelled",
  // Score
  SCORE_SUBMITTED:              "score_submitted",
  SCORE_VALIDATION_REQUIRED:    "score_validation_required",
  SCORE_CONFIRMED:              "score_confirmed",
  SCORE_DISPUTED:               "score_disputed",
  SCORE_OVERRIDDEN:             "score_overridden",
  // Recurring
  RECURRING_MATCH_UPCOMING:     "recurring_match_upcoming",
  RECURRING_MATCH_CHANGED:      "recurring_match_changed",
  RECURRING_MATCH_CANCELLED:    "recurring_match_cancelled",
  // Competition
  TOURNAMENT_INVITE:            "tournament_invite",
  COMPETITION_INVITE:           "competition_invite",
  TOURNAMENT_REG_CONFIRMED:     "tournament_registration_confirmed",
  COMPETITION_REG_CONFIRMED:    "competition_registration_confirmed",
  TOURNAMENT_STARTED:           "tournament_started",
  LEAGUE_FIXTURE_AVAILABLE:     "league_fixture_available",
  COMPETITION_RESULT_CONFIRMED: "competition_result_confirmed",
  // System
  VERIFICATION_APPROVED:        "verification_approved",
  VERIFICATION_REJECTED:        "verification_rejected",
  SUBSCRIPTION_REQUIRED:        "subscription_required",
  SUBSCRIPTION_SUCCESS:         "subscription_success",
};

// Priority mapping per type
const PRIORITY_MAP = {
  friend_request:               "normal",
  friend_request_accepted:      "normal",
  friend_request_declined:      "low",
  new_message:                  "high",
  match_invite:                 "high",
  match_invite_accepted:        "normal",
  match_invite_declined:        "normal",
  match_starting_soon:          "high",
  match_started:                "high",
  match_found:                  "high",
  match_almost_full:            "normal",
  match_cancelled:              "high",
  score_submitted:              "normal",
  score_validation_required:    "high",
  score_confirmed:              "normal",
  score_disputed:               "high",
  score_overridden:             "high",
  recurring_match_upcoming:     "normal",
  recurring_match_changed:      "high",
  recurring_match_cancelled:    "high",
  tournament_invite:            "high",
  competition_invite:           "high",
  tournament_registration_confirmed: "normal",
  competition_registration_confirmed: "normal",
  tournament_started:           "high",
  league_fixture_available:     "normal",
  competition_result_confirmed: "normal",
  verification_approved:        "high",
  verification_rejected:        "high",
  subscription_required:        "normal",
  subscription_success:         "normal",
};

// Action URL builders
export const buildActionUrl = {
  match:        (id) => `/match/${id}`,
  competition:  (id) => `/competition/${id}`,
  conversation: (id) => `/conversation/${id}`,
  player:       (id) => `/player/${id}`,
  friends:      ()   => `/friends`,
  notifications:()   => `/notifications`,
};

/**
 * Create a notification for one or more recipients.
 * 
 * @param {object} params
 * @param {string|string[]} params.userEmail - Recipient email(s)
 * @param {string} params.type - NOTIF_TYPES value
 * @param {string} params.title - Short title
 * @param {string} params.body - Body text
 * @param {string} [params.relatedEntityType] - 'match'|'competition'|'conversation'|'user'|'friend_request'|'score'
 * @param {string} [params.relatedEntityId] - Entity ID
 * @param {string} [params.relatedUserEmail] - Triggering user email
 * @param {string} [params.relatedUserName] - Triggering user display name
 * @param {string} [params.actionUrl] - In-app route
 * @param {string} [params.senderEmail] - Do not notify this email (the sender)
 */
export async function createNotification({
  userEmail,
  type,
  title,
  body,
  relatedEntityType,
  relatedEntityId,
  relatedUserEmail,
  relatedUserName,
  actionUrl,
  senderEmail,
}) {
  const recipients = Array.isArray(userEmail) ? userEmail : [userEmail];

  const records = recipients
    .filter((email) => email && email !== senderEmail)
    .map((email) => ({
      user_email: email,
      type,
      title,
      body,
      related_entity_type: relatedEntityType || null,
      related_entity_id: relatedEntityId || null,
      related_user_email: relatedUserEmail || null,
      related_user_name: relatedUserName || null,
      action_url: actionUrl || null,
      is_read: false,
      priority: PRIORITY_MAP[type] || "normal",
      // Legacy field for backwards compat
      match_id: relatedEntityType === "match" ? relatedEntityId : null,
    }));

  if (records.length === 0) return;

  if (records.length === 1) {
    await base44.entities.Notification.create(records[0]);
  } else {
    await base44.entities.Notification.bulkCreate(records);
  }
}

// ── Pre-built notification creators ──────────────────────────────────────────

export async function notifyFriendRequest(toEmail, fromUser) {
  await createNotification({
    userEmail: toEmail,
    type: NOTIF_TYPES.FRIEND_REQUEST,
    title: "New friend request",
    body: `${fromUser.full_name || fromUser.name} sent you a friend request`,
    relatedEntityType: "user",
    relatedEntityId: fromUser.id,
    relatedUserEmail: fromUser.email,
    relatedUserName: fromUser.full_name || fromUser.name,
    actionUrl: buildActionUrl.friends(),
    senderEmail: fromUser.email,
  });
}

export async function notifyFriendRequestAccepted(toEmail, fromUser) {
  await createNotification({
    userEmail: toEmail,
    type: NOTIF_TYPES.FRIEND_REQUEST_ACCEPTED,
    title: "Friend request accepted",
    body: `${fromUser.full_name || fromUser.name} accepted your friend request`,
    relatedEntityType: "user",
    relatedEntityId: fromUser.id,
    relatedUserEmail: fromUser.email,
    relatedUserName: fromUser.full_name || fromUser.name,
    actionUrl: buildActionUrl.player(fromUser.id),
    senderEmail: fromUser.email,
  });
}

export async function notifyNewMessage(toEmail, fromUser, conversationId) {
  await createNotification({
    userEmail: toEmail,
    type: NOTIF_TYPES.NEW_MESSAGE,
    title: "New message",
    body: `${fromUser.full_name || fromUser.name} sent you a message`,
    relatedEntityType: "conversation",
    relatedEntityId: conversationId,
    relatedUserEmail: fromUser.email,
    relatedUserName: fromUser.full_name || fromUser.name,
    actionUrl: buildActionUrl.conversation(conversationId),
    senderEmail: fromUser.email,
  });
}

export async function notifyMatchInvite(toEmails, fromUser, match) {
  await createNotification({
    userEmail: toEmails,
    type: NOTIF_TYPES.MATCH_INVITE,
    title: "Match invite",
    body: `You've been invited to ${match.title}${match.location_name ? ` at ${match.location_name}` : ""}${match.time ? ` at ${match.time}` : ""}`,
    relatedEntityType: "match",
    relatedEntityId: match.id,
    relatedUserEmail: fromUser.email,
    relatedUserName: fromUser.full_name || fromUser.name,
    actionUrl: buildActionUrl.match(match.id),
    senderEmail: fromUser.email,
  });
}

export async function notifyMatchFound(toEmail, matchId) {
  await createNotification({
    userEmail: toEmail,
    type: NOTIF_TYPES.MATCH_FOUND,
    title: "Match found! 🎾",
    body: "A padel game is ready for you nearby. Confirm your spot!",
    relatedEntityType: "match",
    relatedEntityId: matchId,
    actionUrl: buildActionUrl.match(matchId),
  });
}

export async function notifyMatchCancelled(toEmails, match, senderEmail) {
  await createNotification({
    userEmail: toEmails,
    type: NOTIF_TYPES.MATCH_CANCELLED,
    title: "Match cancelled",
    body: `${match.title} has been cancelled`,
    relatedEntityType: "match",
    relatedEntityId: match.id,
    actionUrl: buildActionUrl.match(match.id),
    senderEmail,
  });
}

export async function notifyScoreValidationRequired(toEmail, match) {
  await createNotification({
    userEmail: toEmail,
    type: NOTIF_TYPES.SCORE_VALIDATION_REQUIRED,
    title: "Score needs confirmation",
    body: `Please confirm the score for ${match.title || "your recent match"}`,
    relatedEntityType: "match",
    relatedEntityId: match.id,
    actionUrl: buildActionUrl.match(match.id),
  });
}

export async function notifyScoreConfirmed(toEmails, match) {
  await createNotification({
    userEmail: toEmails,
    type: NOTIF_TYPES.SCORE_CONFIRMED,
    title: "Score confirmed ✅",
    body: `The score for ${match.title || "your match"} has been confirmed`,
    relatedEntityType: "match",
    relatedEntityId: match.id,
    actionUrl: buildActionUrl.match(match.id),
  });
}

export async function notifyScoreDisputed(toEmails, match) {
  await createNotification({
    userEmail: toEmails,
    type: NOTIF_TYPES.SCORE_DISPUTED,
    title: "Score disputed ⚠️",
    body: `A score dispute has been raised for ${match.title || "your match"}`,
    relatedEntityType: "match",
    relatedEntityId: match.id,
    actionUrl: buildActionUrl.match(match.id),
  });
}

export async function notifyCompetitionInvite(toEmails, fromUser, competition) {
  await createNotification({
    userEmail: toEmails,
    type: competition.type === "tournament" ? NOTIF_TYPES.TOURNAMENT_INVITE : NOTIF_TYPES.COMPETITION_INVITE,
    title: competition.type === "tournament" ? "Tournament invite 🏆" : "League invite",
    body: `You've been invited to ${competition.name}`,
    relatedEntityType: "competition",
    relatedEntityId: competition.id,
    relatedUserEmail: fromUser?.email,
    relatedUserName: fromUser?.full_name || fromUser?.name,
    actionUrl: buildActionUrl.competition(competition.id),
    senderEmail: fromUser?.email,
  });
}

export async function notifyCompetitionRegistered(toEmail, competition) {
  await createNotification({
    userEmail: toEmail,
    type: competition.type === "tournament"
      ? NOTIF_TYPES.TOURNAMENT_REG_CONFIRMED
      : NOTIF_TYPES.COMPETITION_REG_CONFIRMED,
    title: "Registration confirmed ✅",
    body: `You're registered for ${competition.name}`,
    relatedEntityType: "competition",
    relatedEntityId: competition.id,
    actionUrl: buildActionUrl.competition(competition.id),
  });
}

export async function notifyLeagueFixture(toEmails, competition, matchId) {
  await createNotification({
    userEmail: toEmails,
    type: NOTIF_TYPES.LEAGUE_FIXTURE_AVAILABLE,
    title: "New fixture available 📅",
    body: `Your next ${competition.name} fixture is ready`,
    relatedEntityType: "competition",
    relatedEntityId: competition.id,
    actionUrl: buildActionUrl.competition(competition.id),
  });
}