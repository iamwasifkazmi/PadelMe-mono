import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { distanceKmBetweenUsers } from "../../lib/geo.js";
import { dedupeEmailsCi, emailsEqual } from "../../lib/emailsCi.js";
export const friendsRouter = Router();
friendsRouter.get("/", async (req, res) => {
    const emailRaw = String(req.query.email || "").trim();
    if (!emailRaw)
        return res.status(400).json({ error: "email query is required" });
    const viewer = await prisma.user.findFirst({
        where: { email: { equals: emailRaw, mode: "insensitive" } },
        select: { email: true, locationLat: true, locationLng: true },
    });
    const viewerEmail = viewer?.email ?? emailRaw;
    const requests = await prisma.friendRequest.findMany({
        where: {
            OR: [
                { requesterEmail: { equals: viewerEmail, mode: "insensitive" } },
                { recipientEmail: { equals: viewerEmail, mode: "insensitive" } },
            ],
        },
        orderBy: { createdAt: "desc" },
        take: 500,
    });
    const accepted = requests.filter((r) => r.status === "accepted");
    const friendEmailsRaw = accepted.map((r) => emailsEqual(r.requesterEmail, viewerEmail) ? r.recipientEmail : r.requesterEmail);
    const friendEmails = dedupeEmailsCi(friendEmailsRaw);
    const friends = friendEmails.length > 0
        ? await prisma.user.findMany({
            where: {
                OR: friendEmails.map((fe) => ({
                    email: { equals: fe, mode: "insensitive" },
                })),
            },
        })
        : [];
    const friendsSeen = new Set();
    const friendsUnique = friends.filter((f) => {
        const k = f.email.trim().toLowerCase();
        if (friendsSeen.has(k))
            return false;
        friendsSeen.add(k);
        return true;
    });
    const friendsWithDistance = friendsUnique.map((f) => ({
        ...f,
        distanceKm: distanceKmBetweenUsers(viewer?.locationLat, viewer?.locationLng, f.locationLat, f.locationLng),
    }));
    res.json({ friends: friendsWithDistance, requests });
});
friendsRouter.post("/requests", async (req, res) => {
    const requesterEmail = String(req.body.requesterEmail || "");
    const recipientEmail = String(req.body.recipientEmail || "");
    if (!requesterEmail || !recipientEmail) {
        return res.status(400).json({ error: "requesterEmail and recipientEmail are required" });
    }
    if (requesterEmail === recipientEmail) {
        return res.status(400).json({ error: "Cannot send request to yourself" });
    }
    const existing = await prisma.friendRequest.findFirst({
        where: {
            OR: [
                { requesterEmail, recipientEmail },
                { requesterEmail: recipientEmail, recipientEmail: requesterEmail },
            ],
        },
    });
    if (existing)
        return res.status(409).json({ error: "Friend request already exists" });
    const created = await prisma.friendRequest.create({
        data: {
            requesterEmail,
            recipientEmail,
            status: "pending",
        },
    });
    return res.status(201).json(created);
});
friendsRouter.patch("/requests/:id", async (req, res) => {
    const status = String(req.body.status || "");
    if (!["accepted", "declined", "pending"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }
    const updated = await prisma.friendRequest.update({
        where: { id: req.params.id },
        data: { status },
    });
    return res.json(updated);
});
