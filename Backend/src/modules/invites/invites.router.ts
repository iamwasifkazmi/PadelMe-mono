import { Router } from "express";
import { MatchStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { dedupeEmailsCi, playersIncludesCi } from "../../lib/emailsCi.js";

async function eventSummaryForEventId(eventId: string | null | undefined) {
  if (!eventId) return null;
  const m = await prisma.match.findUnique({ where: { id: eventId } });
  if (m) {
    return {
      kind: "match" as const,
      id: m.id,
      title: m.title,
      subtitle: [m.locationName, m.timeLabel].filter(Boolean).join(" · ") || undefined,
    };
  }
  const c = await prisma.competition.findUnique({ where: { id: eventId } });
  if (c) {
    return {
      kind: "competition" as const,
      id: c.id,
      title: c.name,
      subtitle: c.locationName || undefined,
    };
  }
  return null;
}

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
  const senderEmail = String(req.body.senderEmail || "").trim();
  let receiverEmail = String(req.body.receiverEmail || "").trim();
  const eventIdRaw = String(req.body.eventId || "").trim();
  const eventId = eventIdRaw || undefined;
  if (!senderEmail) {
    return res.status(400).json({ error: "senderEmail is required" });
  }
  const token = String(req.body.token || `inv_${Math.random().toString(36).slice(2, 10)}`);
  if (!receiverEmail) {
    if (!eventId) {
      return res.status(400).json({
        error: "receiverEmail is required unless creating a share-link invite with eventId",
      });
    }
    receiverEmail = `share.${token.replace(/[^a-zA-Z0-9]/g, "")}@invite.mipadel`;
  }
  const created = await prisma.invite.create({
    data: {
      senderEmail,
      receiverEmail,
      eventId,
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
    ? req.body.receiverEmails.map((e: unknown) => String(e || "")).filter(Boolean)
    : [];

  if (!senderEmail || !eventId || receiverEmails.length === 0) {
    return res.status(400).json({ error: "senderEmail, eventId and receiverEmails are required" });
  }

  const created = await Promise.all(
    receiverEmails.map((receiverEmail: string) =>
      prisma.invite.create({
        data: {
          senderEmail,
          receiverEmail,
          eventId,
          token: `inv_${Math.random().toString(36).slice(2, 10)}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ),
  );

  return res.status(201).json(created);
});

invitesRouter.get("/by-token/:token", async (req, res) => {
  const invite = await prisma.invite.findUnique({ where: { token: req.params.token } });
  if (!invite) return res.status(404).json({ error: "Invite not found" });

  const eventSummary = await eventSummaryForEventId(invite.eventId);
  return res.json({ ...invite, eventSummary });
});

invitesRouter.post("/accept", async (req, res) => {
  const token = String(req.body.token || "");
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!token || !email) return res.status(400).json({ error: "token and email are required" });

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return res.status(404).json({ error: "Invite not found" });
  if (invite.status === "accepted") {
    const eventSummary = await eventSummaryForEventId(invite.eventId);
    return res.json({ ...invite, alreadyAccepted: true, eventSummary });
  }
  if (invite.status === "declined") {
    return res.status(409).json({ error: "Invite was declined" });
  }
  if (invite.status === "expired") {
    return res.status(410).json({ error: "Invite expired" });
  }
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

  if (updated.eventId) {
    const joiner = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    const canonicalEmail = (joiner?.email ?? email).trim();
    const match = await prisma.match.findUnique({ where: { id: updated.eventId } });
    if (
      match &&
      !playersIncludesCi(match.players, canonicalEmail) &&
      dedupeEmailsCi(match.players).length < match.maxPlayers
    ) {
      const players = dedupeEmailsCi([...match.players, canonicalEmail]);
      await prisma.match.update({
        where: { id: match.id },
        data: {
          players,
          status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
        },
      });
    } else {
      const comp = await prisma.competition.findUnique({ where: { id: updated.eventId } });
      if (comp && !playersIncludesCi(comp.participants, canonicalEmail)) {
        await prisma.competition.update({
          where: { id: comp.id },
          data: { participants: dedupeEmailsCi([...comp.participants, canonicalEmail]) },
        });
      }
    }
  }

  const eventSummary = await eventSummaryForEventId(updated.eventId);
  return res.json({ ...updated, eventSummary });
});

invitesRouter.post("/decline", async (req, res) => {
  const token = String(req.body.token || "");
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!token || !email) return res.status(400).json({ error: "token and email are required" });

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return res.status(404).json({ error: "Invite not found" });
  if (invite.status === "accepted") {
    return res.status(409).json({ error: "Invite already accepted" });
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    return res.status(410).json({ error: "Invite expired" });
  }
  if (invite.status === "declined") {
    return res.json(invite);
  }

  const updated = await prisma.invite.update({
    where: { id: invite.id },
    data: { status: "declined" },
  });
  return res.json(updated);
});
