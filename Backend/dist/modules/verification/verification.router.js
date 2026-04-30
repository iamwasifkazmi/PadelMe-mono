import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
export const verificationRouter = Router();
verificationRouter.get("/status", async (req, res) => {
    const userEmail = String(req.query.email || "");
    if (!userEmail)
        return res.status(400).json({ error: "email query is required" });
    const item = await prisma.iDVerification.findFirst({
        where: { userEmail },
        orderBy: { createdAt: "desc" },
    });
    if (!item)
        return res.json({ status: "not_submitted" });
    return res.json(item);
});
verificationRouter.post("/submit", async (req, res) => {
    const userEmail = String(req.body.email || "");
    const idPhotoUrl = String(req.body.idPhotoUrl || "");
    const selfieUrl = String(req.body.selfieUrl || "");
    if (!userEmail)
        return res.status(400).json({ error: "email is required" });
    const existing = await prisma.iDVerification.findFirst({
        where: { userEmail },
        orderBy: { createdAt: "desc" },
    });
    if (existing) {
        const updated = await prisma.iDVerification.update({
            where: { id: existing.id },
            data: {
                idPhotoUrl: idPhotoUrl || existing.idPhotoUrl || undefined,
                selfieUrl: selfieUrl || existing.selfieUrl || undefined,
                status: "pending",
                reviewNotes: null,
                reviewedBy: null,
                reviewedAt: null,
            },
        });
        return res.json(updated);
    }
    const created = await prisma.iDVerification.create({
        data: {
            userEmail,
            idPhotoUrl: idPhotoUrl || undefined,
            selfieUrl: selfieUrl || undefined,
            status: "pending",
        },
    });
    return res.status(201).json(created);
});
