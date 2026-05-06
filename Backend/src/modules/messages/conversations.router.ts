import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import {
  emitConversationMessage,
  emitConversationReceipt,
  emitConversationUpdated,
} from "../../lib/socket.js";

export const conversationsRouter = Router();

function normEmail(e: string) {
  return String(e || "").trim().toLowerCase();
}

/** Ordered unique normalized emails (preserves first-seen order). */
function normalizeParticipantList(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const n = normEmail(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function uniqueNormParticipants(participantEmails: string[]): string[] {
  return [...new Set(participantEmails.map(normEmail).filter(Boolean))];
}

function isDirectPair(type: string, participantEmails: string[]): boolean {
  return type === "direct" && uniqueNormParticipants(participantEmails).length === 2;
}

async function areAcceptedFriends(emailA: string, emailB: string): Promise<boolean> {
  const a = normEmail(emailA);
  const b = normEmail(emailB);
  if (!a || !b || a === b) return false;
  const row = await prisma.friendRequest.findFirst({
    where: {
      status: "accepted",
      OR: [
        {
          AND: [
            { requesterEmail: { equals: a, mode: "insensitive" } },
            { recipientEmail: { equals: b, mode: "insensitive" } },
          ],
        },
        {
          AND: [
            { requesterEmail: { equals: b, mode: "insensitive" } },
            { recipientEmail: { equals: a, mode: "insensitive" } },
          ],
        },
      ],
    },
  });
  return Boolean(row);
}

function isParticipant(conversation: { participantEmails: string[] }, email: string): boolean {
  const v = normEmail(email);
  if (!v) return false;
  return conversation.participantEmails.some((e) => normEmail(e) === v);
}

/** Direct DMs require the two participants to be accepted friends. */
async function assertDirectFriendsPolicy(conversation: {
  type: string;
  participantEmails: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDirectPair(conversation.type, conversation.participantEmails)) {
    return { ok: true };
  }
  const [e1, e2] = uniqueNormParticipants(conversation.participantEmails);
  if (!(await areAcceptedFriends(e1, e2))) {
    return { ok: false, error: "You can only message players on your friends list" };
  }
  return { ok: true };
}

conversationsRouter.get("/", async (req, res) => {
  const email = String(req.query.email || "");
  const conversations = await prisma.conversation.findMany({
    where: email ? { participantEmails: { has: email } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  res.json(conversations);
});

conversationsRouter.post("/", async (req, res) => {
  const { type, participantEmails, entityId, entityName } = req.body as Partial<{
    type: string;
    participantEmails: string[];
    entityId: string;
    entityName: string;
  }>;
  if (!type || !participantEmails?.length) {
    return res.status(400).json({ error: "type and participantEmails are required" });
  }
  const participantsNorm = normalizeParticipantList(participantEmails);
  if (type === "direct") {
    if (participantsNorm.length !== 2) {
      return res
        .status(400)
        .json({ error: "Direct conversations require exactly two different participants" });
    }
    const [e1, e2] = participantsNorm;
    if (!(await areAcceptedFriends(e1, e2))) {
      return res.status(403).json({ error: "You can only message players on your friends list" });
    }
  }
  const created = await prisma.conversation.create({
    data: {
      type,
      participantEmails: participantsNorm.length ? participantsNorm : participantEmails,
      entityId,
      entityName,
    },
  });
  emitConversationUpdated(
    created,
    created.participantEmails,
  );
  return res.status(201).json(created);
});

conversationsRouter.get("/:id/messages", async (req, res) => {
  const viewerEmail = String(req.query.email || "").trim().toLowerCase();
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
  });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  if (isDirectPair(conversation.type, conversation.participantEmails)) {
    if (!viewerEmail) {
      return res.status(400).json({ error: "email is required" });
    }
    if (!isParticipant(conversation, viewerEmail)) {
      return res.status(403).json({ error: "Not a participant" });
    }
    const policy = await assertDirectFriendsPolicy(conversation);
    if (!policy.ok) return res.status(403).json({ error: policy.error });
  } else if (viewerEmail && !isParticipant(conversation, viewerEmail)) {
    return res.status(403).json({ error: "Not a participant" });
  }

  if (viewerEmail) {
    const pendingDelivered = await prisma.message.findMany({
      where: {
        conversationId: req.params.id,
        senderEmail: { not: viewerEmail },
        status: "sent",
      },
      orderBy: { createdAt: "asc" },
      take: 300,
    });
    if (pendingDelivered.length > 0) {
      const deliveredAt = new Date();
      await prisma.$transaction(
        pendingDelivered.map((m) =>
          prisma.message.update({
            where: { id: m.id },
            data: {
              status: "delivered",
              deliveredAt,
            },
          }),
        ),
      );
      emitConversationReceipt(req.params.id, conversation.participantEmails, {
        messageIds: pendingDelivered.map((m) => m.id),
        status: "delivered",
        actorEmail: viewerEmail,
        at: deliveredAt,
      });
    }
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  res.json(messages);
});

conversationsRouter.post("/:id/messages", async (req, res) => {
  const { senderEmail, senderName, text } = req.body as Partial<{
    senderEmail: string;
    senderName: string;
    text: string;
  }>;
  if (!senderEmail || !senderName || !text) {
    return res.status(400).json({ error: "senderEmail, senderName and text are required" });
  }
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
  });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  if (!isParticipant(conversation, senderEmail)) {
    return res.status(403).json({ error: "Not a participant" });
  }
  const policy = await assertDirectFriendsPolicy(conversation);
  if (!policy.ok) return res.status(403).json({ error: policy.error });

  const message = await prisma.message.create({
    data: {
      conversationId: req.params.id,
      senderEmail,
      senderName,
      text,
      readBy: [senderEmail],
      status: "sent",
    },
  });
  const unreadCounts = ((conversation.unreadCounts as Record<string, number> | null) || {});
  for (const email of conversation.participantEmails) {
    if (normEmail(email) === normEmail(senderEmail)) continue;
    unreadCounts[email] = (unreadCounts[email] || 0) + 1;
  }
  const updatedConversation = await prisma.conversation.update({
    where: { id: req.params.id },
    data: {
      lastMessageText: text,
      lastMessageBy: senderEmail,
      lastMessageAt: new Date(),
      unreadCounts,
    },
  });
  emitConversationMessage(req.params.id, message, conversation.participantEmails);
  emitConversationUpdated(updatedConversation, updatedConversation.participantEmails);
  return res.status(201).json(message);
});

conversationsRouter.post("/:id/read", async (req, res) => {
  const email = String(req.body.email || "");
  if (!email) return res.status(400).json({ error: "email is required" });
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  if (!isParticipant(conversation, email)) {
    return res.status(403).json({ error: "Not a participant" });
  }
  const policy = await assertDirectFriendsPolicy(conversation);
  if (!policy.ok) return res.status(403).json({ error: policy.error });
  const unreadCounts = ((conversation.unreadCounts as Record<string, number> | null) || {});
  unreadCounts[email] = 0;
  const updated = await prisma.conversation.update({
    where: { id: req.params.id },
    data: { unreadCounts },
  });
  const pendingRead = await prisma.message.findMany({
    where: {
      conversationId: req.params.id,
      senderEmail: { not: email },
      NOT: { readBy: { has: email } },
    },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  if (pendingRead.length > 0) {
    const readAt = new Date();
    await prisma.$transaction(
      pendingRead.map((m) =>
        prisma.message.update({
          where: { id: m.id },
          data: {
            readBy: [...m.readBy, email],
            status: "read",
            readAt,
          },
        }),
      ),
    );
    emitConversationReceipt(req.params.id, conversation.participantEmails, {
      messageIds: pendingRead.map((m) => m.id),
      status: "read",
      actorEmail: email,
      at: readAt,
    });
  }
  emitConversationUpdated(updated, updated.participantEmails);
  return res.json(updated);
});
