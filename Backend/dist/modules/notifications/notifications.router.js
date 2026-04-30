import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
export const notificationsRouter = Router();
notificationsRouter.get("/", async (req, res) => {
    const email = String(req.query.email || "");
    if (!email)
        return res.status(400).json({ error: "email query is required" });
    const notifications = await prisma.notification.findMany({
        where: { userEmail: email },
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    res.json(notifications);
});
notificationsRouter.patch("/:id/read", async (req, res) => {
    const updated = await prisma.notification.update({
        where: { id: req.params.id },
        data: { isRead: true },
    });
    res.json(updated);
});
notificationsRouter.patch("/read-all", async (req, res) => {
    const email = String(req.body.email || "");
    if (!email)
        return res.status(400).json({ error: "email is required" });
    const result = await prisma.notification.updateMany({
        where: { userEmail: email, isRead: false },
        data: { isRead: true },
    });
    res.json({ updated: result.count });
});
