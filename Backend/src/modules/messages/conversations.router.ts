import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const conversationsRouter = Router();

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
  const created = await prisma.conversation.create({
    data: {
      type,
      participantEmails,
      entityId,
      entityName,
    },
  });
  return res.status(201).json(created);
});

conversationsRouter.get("/:id/messages", async (req, res) => {
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
  const message = await prisma.message.create({
    data: {
      conversationId: req.params.id,
      senderEmail,
      senderName,
      text,
    },
  });
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
  });
  const unreadCounts = ((conversation?.unreadCounts as Record<string, number> | null) || {});
  for (const email of conversation?.participantEmails || []) {
    if (email === senderEmail) continue;
    unreadCounts[email] = (unreadCounts[email] || 0) + 1;
  }
  await prisma.conversation.update({
    where: { id: req.params.id },
    data: {
      lastMessageText: text,
      lastMessageBy: senderEmail,
      lastMessageAt: new Date(),
      unreadCounts,
    },
  });
  return res.status(201).json(message);
});

conversationsRouter.post("/:id/read", async (req, res) => {
  const email = String(req.body.email || "");
  if (!email) return res.status(400).json({ error: "email is required" });
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  const unreadCounts = ((conversation.unreadCounts as Record<string, number> | null) || {});
  unreadCounts[email] = 0;
  const updated = await prisma.conversation.update({
    where: { id: req.params.id },
    data: { unreadCounts },
  });
  return res.json(updated);
});
