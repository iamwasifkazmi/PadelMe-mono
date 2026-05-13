import { Router } from "express";
import { CommunityPostKind } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
export const communityRouter = Router();
const KINDS = new Set([
    CommunityPostKind.feedback,
    CommunityPostKind.idea,
    CommunityPostKind.general,
]);
communityRouter.get("/posts", async (req, res) => {
    const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));
    const kind = String(req.query.kind || "").trim().toLowerCase();
    const where = kind && KINDS.has(kind) ? { kind: kind } : {};
    const rows = await prisma.communityPost.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        include: {
            author: { select: { email: true, fullName: true, photoUrl: true } },
        },
    });
    res.json(rows);
});
communityRouter.post("/posts", async (req, res) => {
    const emailRaw = String(req.body.email || "").trim();
    const body = String(req.body.body || "").trim();
    const titleRaw = req.body.title != null ? String(req.body.title).trim() : "";
    const kindRaw = String(req.body.kind || "general").trim().toLowerCase();
    if (!emailRaw)
        return res.status(400).json({ error: "email is required" });
    if (body.length < 4) {
        return res.status(400).json({ error: "Please add a little more detail (at least a few words)." });
    }
    if (body.length > 4000) {
        return res.status(400).json({ error: "Message is too long (max 4000 characters)." });
    }
    if (titleRaw.length > 200) {
        return res.status(400).json({ error: "Title is too long (max 200 characters)." });
    }
    const kind = KINDS.has(kindRaw) ? kindRaw : CommunityPostKind.general;
    const user = await prisma.user.findFirst({
        where: { email: { equals: emailRaw, mode: "insensitive" } },
    });
    if (!user)
        return res.status(404).json({ error: "User not found" });
    const row = await prisma.communityPost.create({
        data: {
            authorEmail: user.email,
            kind,
            title: titleRaw.length ? titleRaw : null,
            body,
        },
        include: {
            author: { select: { email: true, fullName: true, photoUrl: true } },
        },
    });
    res.status(201).json(row);
});
