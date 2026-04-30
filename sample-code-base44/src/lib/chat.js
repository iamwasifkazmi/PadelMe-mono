import { base44 } from "@/api/base44Client";

/**
 * Find or create a direct conversation between two users.
 */
export async function getOrCreateDirectConversation(currentUser, targetUser) {
  const all = await base44.entities.Conversation.filter({ type: "direct" }, "-created_date", 200);
  const existing = all.find((c) => {
    const p = c.participant_emails || [];
    return p.includes(currentUser.email) && p.includes(targetUser.email);
  });
  if (existing) return existing;

  return await base44.entities.Conversation.create({
    type: "direct",
    entity_id: targetUser.email,
    entity_name: targetUser.name || targetUser.full_name,
    participant_emails: [currentUser.email, targetUser.email],
    last_message_at: new Date().toISOString(),
    unread_counts: {},
  });
}

/**
 * Find or create a match group chat.
 */
export async function getOrCreateMatchConversation(match, currentUser) {
  const all = await base44.entities.Conversation.filter({ type: "match", entity_id: match.id }, "-created_date", 5);
  if (all.length > 0) return all[0];

  const participants = Array.from(new Set([
    match.created_by,
    ...(match.players || []),
    ...(match.invited_emails || []),
    currentUser.email,
  ])).filter(Boolean);

  return await base44.entities.Conversation.create({
    type: "match",
    entity_id: match.id,
    entity_name: match.title,
    participant_emails: participants,
    last_message_at: new Date().toISOString(),
    unread_counts: {},
  });
}

/**
 * Find or create a competition group chat.
 */
export async function getOrCreateCompetitionConversation(competition, currentUser) {
  const all = await base44.entities.Conversation.filter({ type: "competition", entity_id: competition.id }, "-created_date", 5);
  if (all.length > 0) return all[0];

  const participants = Array.from(new Set([
    competition.host_email,
    ...(competition.participants || []),
    currentUser.email,
  ])).filter(Boolean);

  return await base44.entities.Conversation.create({
    type: "competition",
    entity_id: competition.id,
    entity_name: competition.name,
    participant_emails: participants,
    last_message_at: new Date().toISOString(),
    unread_counts: {},
  });
}

/**
 * Send a message and update conversation metadata.
 */
export async function sendMessage(conversationId, sender, text, allParticipants) {
  // Create message
  await base44.entities.Message.create({
    conversation_id: conversationId,
    sender_email: sender.email,
    sender_name: sender.name || sender.full_name,
    sender_avatar: sender.photo_url || "",
    text: text.trim(),
    read_by: [sender.email],
  });

  // Build unread counts increment
  const unreadPatch = {};
  (allParticipants || []).forEach((email) => {
    if (email !== sender.email) unreadPatch[email] = 1;
  });

  // Update conversation preview
  await base44.entities.Conversation.update(conversationId, {
    last_message_text: text.trim().slice(0, 100),
    last_message_at: new Date().toISOString(),
    last_message_by: sender.email,
  });
}

/**
 * Mark all unread messages in a conversation as read for a user.
 * Also updates message status to "read" and sets read_at timestamp.
 */
export async function markConversationRead(conversationId, userEmail) {
  const msgs = await base44.entities.Message.filter({ conversation_id: conversationId }, "-created_date", 200);
  const unread = msgs.filter((m) => !m.read_by?.includes(userEmail));
  const now = new Date().toISOString();
  await Promise.all(
    unread.map((m) =>
      base44.entities.Message.update(m.id, {
        read_by: [...(m.read_by || []), userEmail],
        status: "read",
        read_at: now,
      })
    )
  );
}

/**
 * Mark messages as delivered (opened app but not yet in conversation).
 */
export async function markMessagesDelivered(conversationId, userEmail) {
  const msgs = await base44.entities.Message.filter({ conversation_id: conversationId }, "-created_date", 100);
  const undelivered = msgs.filter(
    (m) => m.sender_email !== userEmail && m.status === "sent"
  );
  const now = new Date().toISOString();
  await Promise.all(
    undelivered.map((m) =>
      base44.entities.Message.update(m.id, {
        status: "delivered",
        delivered_at: now,
      })
    )
  );
}

export function getConversationDisplayName(conv, currentUserEmail) {
  if (conv.type === "direct") {
    return conv.entity_name || "Direct Message";
  }
  return conv.entity_name || (conv.type === "match" ? "Match Chat" : "Competition Chat");
}

export function getConversationIcon(type) {
  if (type === "direct") return "👤";
  if (type === "match") return "🎾";
  if (type === "competition") return "🏆";
  return "💬";
}