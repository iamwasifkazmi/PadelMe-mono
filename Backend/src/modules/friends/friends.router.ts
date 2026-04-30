import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const friendsRouter = Router();

friendsRouter.get("/", async (req, res) => {
  const email = String(req.query.email || "");
  if (!email) return res.status(400).json({ error: "email query is required" });

  const requests = await prisma.friendRequest.findMany({
    where: {
      OR: [{ requesterEmail: email }, { recipientEmail: email }],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const accepted = requests.filter((r) => r.status === "accepted");
  const friendEmails = accepted.map((r) =>
    r.requesterEmail === email ? r.recipientEmail : r.requesterEmail,
  );

  const friends = friendEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: friendEmails } },
      })
    : [];

  res.json({ friends, requests });
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
  if (existing) return res.status(409).json({ error: "Friend request already exists" });

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

