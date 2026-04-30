/**
 * Unified Relationship Engine
 *
 * Single source of truth for all social relationship logic across the app.
 * Import and use these helpers everywhere — never compute relationship state inline.
 */

/**
 * Resolve the relationship state between currentUser and targetUser.
 * Priority: blocked > friends > request_sent > request_received > not_connected
 *
 * @param {string} myEmail
 * @param {string} theirEmail
 * @param {Array}  friendRequests  – full FriendRequest list
 * @param {Array}  blockedList     – BlockedUser records where blocker_email === myEmail
 * @param {Array}  blockedMeList   – BlockedUser records where blocked_email === myEmail
 * @returns {'blocked'|'blocked_by'|'friends'|'request_sent'|'request_received'|'not_connected'}
 */
export function resolveRelationship(myEmail, theirEmail, friendRequests = [], blockedList = [], blockedMeList = []) {
  if (!myEmail || !theirEmail || myEmail === theirEmail) return 'not_connected';

  // I blocked them
  if (blockedList.some(b => b.blocked_email === theirEmail)) return 'blocked';
  // They blocked me
  if (blockedMeList.some(b => b.blocker_email === theirEmail)) return 'blocked_by';

  const sent     = friendRequests.find(r => r.requester_email === myEmail   && r.recipient_email === theirEmail);
  const received = friendRequests.find(r => r.requester_email === theirEmail && r.recipient_email === myEmail);

  if (sent?.status === 'accepted' || received?.status === 'accepted') return 'friends';
  if (sent?.status === 'pending')     return 'request_sent';
  if (received?.status === 'pending') return 'request_received';

  return 'not_connected';
}

/**
 * Returns true if myEmail and theirEmail are friends (accepted request either way).
 */
export function areFriends(myEmail, theirEmail, friendRequests = []) {
  return friendRequests.some(
    r => r.status === 'accepted' &&
      ((r.requester_email === myEmail && r.recipient_email === theirEmail) ||
       (r.requester_email === theirEmail && r.recipient_email === myEmail))
  );
}

/**
 * Returns a Set of emails that are friends with myEmail.
 */
export function getFriendEmails(myEmail, friendRequests = []) {
  const emails = new Set();
  friendRequests
    .filter(r => r.status === 'accepted' &&
      (r.requester_email === myEmail || r.recipient_email === myEmail))
    .forEach(r => {
      emails.add(r.requester_email === myEmail ? r.recipient_email : r.requester_email);
    });
  return emails;
}

/**
 * Returns a Set of emails that myEmail has blocked.
 */
export function getBlockedByMeEmails(blockedList = []) {
  return new Set(blockedList.map(b => b.blocked_email));
}

/**
 * Returns a Set of emails that have blocked myEmail.
 */
export function getBlockedMeEmails(blockedMeList = []) {
  return new Set(blockedMeList.map(b => b.blocker_email));
}

/**
 * Returns the combined set of emails that should be hidden from myEmail:
 * users I blocked + users who blocked me.
 */
export function getHiddenEmails(blockedList = [], blockedMeList = []) {
  return new Set([
    ...blockedList.map(b => b.blocked_email),
    ...blockedMeList.map(b => b.blocker_email),
  ]);
}

/**
 * Returns pending requests received by myEmail (where I need to act).
 */
export function getPendingReceived(myEmail, friendRequests = []) {
  return friendRequests.filter(r => r.recipient_email === myEmail && r.status === 'pending');
}

/**
 * Returns pending requests sent by myEmail (waiting for them to act).
 */
export function getPendingSent(myEmail, friendRequests = []) {
  return friendRequests.filter(r => r.requester_email === myEmail && r.status === 'pending');
}

/**
 * Can myEmail send a message to theirEmail?
 * Allowed if friends, or blocked_by check fails only on my side.
 */
export function canMessage(myEmail, theirEmail, friendRequests = [], blockedList = [], blockedMeList = []) {
  const rel = resolveRelationship(myEmail, theirEmail, friendRequests, blockedList, blockedMeList);
  return rel === 'friends';
}