import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { emitConversationMessage, emitConversationReceipt, emitConversationUpdated, } from "../../lib/socket.js";
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
    const { type, participantEmails, entityId, entityName } = req.body;
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
    emitConversationUpdated(created, created.participantEmails);
    return res.status(201).json(created);
});
conversationsRouter.get("/:id/messages", async (req, res) => {
    const viewerEmail = String(req.query.email || "").trim().toLowerCase();
    const conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
    });
    if (!conversation)
        return res.status(404).json({ error: "Conversation not found" });
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
            await prisma.$transaction(pendingDelivered.map((m) => prisma.message.update({
                where: { id: m.id },
                data: {
                    status: "delivered",
                    deliveredAt,
                },
            })));
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
    const { senderEmail, senderName, text } = req.body;
    if (!senderEmail || !senderName || !text) {
        return res.status(400).json({ error: "senderEmail, senderName and text are required" });
    }
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
    const conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
    });
    const unreadCounts = (conversation?.unreadCounts || {});
    for (const email of conversation?.participantEmails || []) {
        if (email === senderEmail)
            continue;
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
    emitConversationMessage(req.params.id, message, conversation?.participantEmails || []);
    emitConversationUpdated(updatedConversation, updatedConversation.participantEmails);
    return res.status(201).json(message);
});
conversationsRouter.post("/:id/read", async (req, res) => {
    const email = String(req.body.email || "");
    if (!email)
        return res.status(400).json({ error: "email is required" });
    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conversation)
        return res.status(404).json({ error: "Conversation not found" });
    const unreadCounts = (conversation.unreadCounts || {});
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
        await prisma.$transaction(pendingRead.map((m) => prisma.message.update({
            where: { id: m.id },
            data: {
                readBy: [...m.readBy, email],
                status: "read",
                readAt,
            },
        })));
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
