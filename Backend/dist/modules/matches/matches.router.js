import { Router } from "express";
import { MatchStatus, MatchType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { emitMatchMessage, emitMatchReceipt } from "../../lib/socket.js";
export const matchesRouter = Router();
matchesRouter.get("/", async (req, res) => {
    const status = req.query.status;
    const skill = String(req.query.skill || "").trim().toLowerCase();
    const where = {
        ...(status ? { status } : {}),
        ...(skill ? { skillLevel: skill } : {}),
    };
    const matches = await prisma.match.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    res.json(matches);
});
matchesRouter.post("/", async (req, res) => {
    const body = req.body;
    if (!body.title || !body.date || !body.timeLabel || !body.locationName) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    const host = body.createdByEmail
        ? await prisma.user.findUnique({ where: { email: body.createdByEmail } })
        : null;
    const created = await prisma.match.create({
        data: {
            title: body.title,
            date: new Date(body.date),
            timeLabel: body.timeLabel,
            locationName: body.locationName,
            maxPlayers: body.maxPlayers || 4,
            matchType: body.matchType || MatchType.doubles,
            players: body.createdByEmail ? [body.createdByEmail] : [],
            hostId: host?.id,
        },
    });
    return res.status(201).json(created);
});
matchesRouter.get("/:id", async (req, res) => {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    return res.json(match);
});
matchesRouter.post("/:id/join", async (req, res) => {
    const email = String(req.body.email || "");
    if (!email)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.players.includes(email))
        return res.json(match);
    if (match.players.length >= match.maxPlayers) {
        return res.status(409).json({ error: "Match is full" });
    }
    const players = [...match.players, email];
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            players,
            status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
        },
    });
    return res.json(updated);
});
matchesRouter.post("/:id/submit-score", async (req, res) => {
    const { scoreTeamA, scoreTeamB, winnerTeam } = req.body;
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            scoreTeamA,
            scoreTeamB,
            winnerTeam,
            status: MatchStatus.completed,
        },
    });
    return res.json(updated);
});
matchesRouter.get("/:id/chat-messages", async (req, res) => {
    const viewerEmail = String(req.query.email || "").trim().toLowerCase();
    if (viewerEmail) {
        const pendingDelivered = await prisma.chatMessage.findMany({
            where: {
                matchId: req.params.id,
                senderEmail: { not: viewerEmail },
                status: "sent",
            },
            orderBy: { createdAt: "asc" },
            take: 400,
        });
        if (pendingDelivered.length > 0) {
            const deliveredAt = new Date();
            await prisma.$transaction(pendingDelivered.map((m) => prisma.chatMessage.update({
                where: { id: m.id },
                data: {
                    status: "delivered",
                    deliveredAt,
                },
            })));
            emitMatchReceipt(req.params.id, {
                messageIds: pendingDelivered.map((m) => m.id),
                status: "delivered",
                actorEmail: viewerEmail,
                at: deliveredAt,
            });
        }
    }
    const messages = await prisma.chatMessage.findMany({
        where: { matchId: req.params.id },
        orderBy: { createdAt: "asc" },
        take: 400,
    });
    res.json(messages);
});
matchesRouter.post("/:id/chat-messages", async (req, res) => {
    const { senderEmail, senderName, text } = req.body;
    if (!senderEmail || !senderName || !text) {
        return res
            .status(400)
            .json({ error: "senderEmail, senderName and text are required" });
    }
    const created = await prisma.chatMessage.create({
        data: {
            matchId: req.params.id,
            senderEmail,
            senderName,
            text,
            readBy: [senderEmail],
            status: "sent",
        },
    });
    emitMatchMessage(req.params.id, created);
    return res.status(201).json(created);
});
matchesRouter.post("/:id/chat-read", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email)
        return res.status(400).json({ error: "email is required" });
    const pendingRead = await prisma.chatMessage.findMany({
        where: {
            matchId: req.params.id,
            senderEmail: { not: email },
            NOT: { readBy: { has: email } },
        },
        orderBy: { createdAt: "asc" },
        take: 400,
    });
    if (pendingRead.length === 0)
        return res.json({ success: true, updated: 0 });
    const readAt = new Date();
    await prisma.$transaction(pendingRead.map((m) => prisma.chatMessage.update({
        where: { id: m.id },
        data: {
            readBy: [...m.readBy, email],
            status: "read",
            readAt,
        },
    })));
    emitMatchReceipt(req.params.id, {
        messageIds: pendingRead.map((m) => m.id),
        status: "read",
        actorEmail: email,
        at: readAt,
    });
    return res.json({ success: true, updated: pendingRead.length });
});
