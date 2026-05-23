import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuthUser } from "../../lib/jwtAuth.js";
import { removePushDevice, upsertPushDevice } from "../../lib/pushNotifications.js";
export const notificationsRouter = Router();
const pushTokenBody = z.object({
    token: z.string().min(1),
    platform: z.enum(["ios", "android"]),
});
notificationsRouter.post("/push-token", async (req, res) => {
    const user = await requireAuthUser(req);
    if (!user)
        return res.status(401).json({ error: "Unauthorized" });
    const parsed = pushTokenBody.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "token and platform (ios|android) required" });
    const device = await upsertPushDevice({
        userEmail: user.email,
        token: parsed.data.token,
        platform: parsed.data.platform,
    });
    res.json({ ok: true, id: device?.id });
});
notificationsRouter.post("/push-token/unregister", async (req, res) => {
    const user = await requireAuthUser(req);
    if (!user)
        return res.status(401).json({ error: "Unauthorized" });
    const token = String(req.body?.token || "").trim();
    if (!token)
        return res.status(400).json({ error: "token is required" });
    const owned = await prisma.pushDevice.findFirst({
        where: { token, userEmail: user.email },
    });
    if (owned)
        await removePushDevice(token);
    res.json({ ok: true });
});
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
