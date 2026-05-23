import { Router } from "express";
import { MatchStatus, MatchType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { requireAuthUser, isAdminUser } from "../../lib/jwtAuth.js";
export const adminRouter = Router();
async function requireAdmin(req, res) {
    const user = await requireAuthUser(req);
    if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return null;
    }
    if (!isAdminUser(user)) {
        res.status(403).json({ error: "Admin access required" });
        return null;
    }
    return user;
}
adminRouter.get("/id-verifications", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin)
        return;
    const status = String(req.query.status || "pending").trim().toLowerCase();
    const where = status === "all"
        ? {}
        : { status: status === "approved" || status === "rejected" ? status : "pending" };
    const rows = await prisma.iDVerification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    return res.json(rows);
});
adminRouter.patch("/id-verifications/:id", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin)
        return;
    const id = String(req.params.id || "");
    const status = String(req.body.status || "").trim().toLowerCase();
    const reviewNotes = req.body.reviewNotes != null ? String(req.body.reviewNotes) : undefined;
    const reviewedBy = String(req.body.reviewedBy || admin.email);
    if (status !== "approved" && status !== "rejected") {
        return res.status(400).json({ error: "status must be approved or rejected" });
    }
    const existing = await prisma.iDVerification.findUnique({ where: { id } });
    if (!existing)
        return res.status(404).json({ error: "Verification request not found" });
    const updated = await prisma.iDVerification.update({
        where: { id },
        data: {
            status,
            reviewNotes: reviewNotes ?? existing.reviewNotes,
            reviewedBy,
            reviewedAt: new Date(),
        },
    });
    if (status === "approved") {
        await prisma.user.updateMany({
            where: { email: { equals: existing.userEmail, mode: "insensitive" } },
            data: { idVerified: true },
        });
    }
    else if (status === "rejected") {
        await prisma.user.updateMany({
            where: { email: { equals: existing.userEmail, mode: "insensitive" } },
            data: { idVerified: false },
        });
    }
    return res.json(updated);
});
adminRouter.get("/test/summary", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin)
        return;
    const [open, inProgress, completed, users, pendingReviews] = await Promise.all([
        prisma.match.count({ where: { status: MatchStatus.open } }),
        prisma.match.count({ where: { status: MatchStatus.in_progress } }),
        prisma.match.count({ where: { status: MatchStatus.completed } }),
        prisma.user.count(),
        prisma.iDVerification.count({ where: { status: "pending" } }),
    ]);
    return res.json({ open, inProgress, completed, users, pendingReviews });
});
adminRouter.post("/test/create-dummy-matches", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin)
        return;
    const hostEmail = String(req.body.hostEmail || admin.email).trim();
    const count = Math.min(10, Math.max(1, Number(req.body.count) || 3));
    const host = await prisma.user.findFirst({
        where: { email: { equals: hostEmail, mode: "insensitive" } },
    });
    if (!host)
        return res.status(404).json({ error: "Host not found" });
    const created = [];
    const base = new Date();
    base.setDate(base.getDate() + 2);
    for (let i = 0; i < count; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        const m = await prisma.match.create({
            data: {
                title: `[TEST] Padel Match ${i + 1}`,
                date: d,
                timeLabel: "18:00",
                locationName: "Test Venue",
                locationLat: 51.5,
                locationLng: -0.12,
                maxPlayers: 4,
                players: [host.email],
                confirmedPlayerEmails: [host.email],
                status: MatchStatus.open,
                hostId: host.id,
                matchType: MatchType.doubles,
            },
        });
        created.push(m.id);
    }
    return res.json({ ok: true, created });
});
