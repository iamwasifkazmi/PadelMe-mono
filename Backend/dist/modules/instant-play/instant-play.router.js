import { Router } from "express";
import { MatchStatus, MatchType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
export const instantPlayRouter = Router();
instantPlayRouter.post("/join", async (req, res) => {
    const { userEmail, userName, matchType = MatchType.doubles, locationName, skillLevel = "any", } = req.body;
    if (!userEmail)
        return res.status(400).json({ error: "userEmail is required" });
    const openInstant = await prisma.match.findFirst({
        where: {
            status: MatchStatus.open,
            isInstant: true,
            matchType: matchType || MatchType.doubles,
        },
        orderBy: { createdAt: "asc" },
    });
    if (openInstant && !openInstant.players.includes(userEmail)) {
        const players = [...openInstant.players, userEmail];
        const updated = await prisma.match.update({
            where: { id: openInstant.id },
            data: {
                players,
                status: players.length >= openInstant.maxPlayers ? MatchStatus.full : MatchStatus.open,
            },
        });
        return res.json({ status: "matched", matchId: updated.id });
    }
    const requestRow = await prisma.instantPlayRequest.create({
        data: {
            userEmail,
            userName,
            skillLevel,
            locationName,
            matchType: matchType || MatchType.doubles,
            status: "waiting",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
    });
    const waiting = await prisma.instantPlayRequest.findMany({
        where: { status: "waiting", matchType: matchType || MatchType.doubles },
        orderBy: { createdAt: "asc" },
        take: 4,
    });
    const needed = (matchType === MatchType.singles ? 2 : 4);
    if (waiting.length >= needed) {
        const selected = waiting.slice(0, needed);
        const emails = selected.map((r) => r.userEmail);
        const createdMatch = await prisma.match.create({
            data: {
                title: "⚡ Instant Padel",
                date: new Date(),
                timeLabel: new Date().toTimeString().slice(0, 5),
                locationName: locationName || "Nearby Court",
                skillLevel,
                maxPlayers: needed,
                players: emails,
                status: MatchStatus.open,
                isInstant: true,
                matchType: matchType || MatchType.doubles,
            },
        });
        await prisma.instantPlayRequest.updateMany({
            where: { id: { in: selected.map((r) => r.id) } },
            data: { status: "matched", matchedMatchId: createdMatch.id },
        });
        return res.json({ status: "matched", matchId: createdMatch.id, requestId: requestRow.id });
    }
    return res.json({ status: "waiting", requestId: requestRow.id });
});
instantPlayRouter.post("/join-match", async (req, res) => {
    const matchId = String(req.body.matchId || "");
    const userEmail = String(req.body.userEmail || "");
    if (!matchId || !userEmail) {
        return res.status(400).json({ error: "matchId and userEmail are required" });
    }
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.players.includes(userEmail))
        return res.json({ status: "matched", matchId });
    if (match.players.length >= match.maxPlayers)
        return res.status(409).json({ error: "Match full" });
    const players = [...match.players, userEmail];
    await prisma.match.update({
        where: { id: matchId },
        data: {
            players,
            status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
        },
    });
    return res.json({ status: "matched", matchId });
});
instantPlayRouter.get("/status/:requestId", async (req, res) => {
    const request = await prisma.instantPlayRequest.findUnique({
        where: { id: req.params.requestId },
    });
    if (!request)
        return res.status(404).json({ error: "Request not found" });
    if (request.expiresAt && request.expiresAt < new Date() && request.status === "waiting") {
        await prisma.instantPlayRequest.update({
            where: { id: request.id },
            data: { status: "expired" },
        });
        return res.json({ status: "expired" });
    }
    return res.json({ status: request.status, matchId: request.matchedMatchId });
});
instantPlayRouter.post("/cancel", async (req, res) => {
    const requestId = String(req.body.requestId || "");
    if (!requestId)
        return res.status(400).json({ error: "requestId is required" });
    await prisma.instantPlayRequest.update({
        where: { id: requestId },
        data: { status: "expired" },
    });
    res.json({ status: "cancelled" });
});
instantPlayRouter.post("/confirm", async (req, res) => {
    const requestId = String(req.body.requestId || "");
    if (!requestId)
        return res.status(400).json({ error: "requestId is required" });
    await prisma.instantPlayRequest.update({
        where: { id: requestId },
        data: { status: "confirmed" },
    });
    res.json({ status: "confirmed" });
});
instantPlayRouter.post("/decline", async (req, res) => {
    const requestId = String(req.body.requestId || "");
    if (!requestId)
        return res.status(400).json({ error: "requestId is required" });
    await prisma.instantPlayRequest.update({
        where: { id: requestId },
        data: { status: "declined" },
    });
    res.json({ status: "declined" });
});
