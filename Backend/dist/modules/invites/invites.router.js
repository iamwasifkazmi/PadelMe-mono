import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
export const invitesRouter = Router();
invitesRouter.get("/event/:eventId", async (req, res) => {
    const invites = await prisma.invite.findMany({
        where: { eventId: req.params.eventId },
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    return res.json(invites);
});
invitesRouter.post("/create", async (req, res) => {
    const senderEmail = String(req.body.senderEmail || "");
    const receiverEmail = String(req.body.receiverEmail || "");
    const eventId = String(req.body.eventId || "");
    if (!senderEmail || !receiverEmail) {
        return res.status(400).json({ error: "senderEmail and receiverEmail are required" });
    }
    const token = String(req.body.token || `inv_${Math.random().toString(36).slice(2, 10)}`);
    const created = await prisma.invite.create({
        data: {
            senderEmail,
            receiverEmail,
            eventId: eventId || undefined,
            token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
    });
    return res.status(201).json(created);
});
invitesRouter.post("/bulk-create", async (req, res) => {
    const senderEmail = String(req.body.senderEmail || "");
    const eventId = String(req.body.eventId || "");
    const receiverEmails = Array.isArray(req.body.receiverEmails)
        ? req.body.receiverEmails.map((e) => String(e || "")).filter(Boolean)
        : [];
    if (!senderEmail || !eventId || receiverEmails.length === 0) {
        return res.status(400).json({ error: "senderEmail, eventId and receiverEmails are required" });
    }
    const created = await Promise.all(receiverEmails.map((receiverEmail) => prisma.invite.create({
        data: {
            senderEmail,
            receiverEmail,
            eventId,
            token: `inv_${Math.random().toString(36).slice(2, 10)}`,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
    })));
    return res.status(201).json(created);
});
invitesRouter.get("/by-token/:token", async (req, res) => {
    const invite = await prisma.invite.findUnique({ where: { token: req.params.token } });
    if (!invite)
        return res.status(404).json({ error: "Invite not found" });
    return res.json(invite);
});
invitesRouter.post("/accept", async (req, res) => {
    const token = String(req.body.token || "");
    const email = String(req.body.email || "");
    if (!token || !email)
        return res.status(400).json({ error: "token and email are required" });
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite)
        return res.status(404).json({ error: "Invite not found" });
    if (invite.status === "accepted")
        return res.json(invite);
    if (invite.expiresAt && invite.expiresAt < new Date()) {
        await prisma.invite.update({
            where: { id: invite.id },
            data: { status: "expired" },
        });
        return res.status(410).json({ error: "Invite expired" });
    }
    const updated = await prisma.invite.update({
        where: { id: invite.id },
        data: {
            status: "accepted",
            receiverEmail: email,
        },
    });
    return res.json(updated);
});
