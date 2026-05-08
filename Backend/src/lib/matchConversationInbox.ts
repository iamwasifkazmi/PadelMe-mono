import { prisma } from "./prisma.js";
import { dedupeEmailsCi } from "./emailsCi.js";
import { emitConversationUpdated } from "./socket.js";

/**
 * Keeps a Conversation row (type "match", entityId = matchId) in sync with ChatMessage
 * so the Messages inbox can list match threads alongside DMs.
 */
export async function syncMatchConversationInbox(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, title: true, players: true },
  });
  if (!match?.players?.length) return;

  const latest = await prisma.chatMessage.findFirst({
    where: { matchId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return;

  const participants = dedupeEmailsCi(match.players);
  const excerpt = latest.text.length > 140 ? `${latest.text.slice(0, 137)}…` : latest.text;

  const unreadCounts: Record<string, number> = {};
  for (const email of participants) {
    const n = await prisma.chatMessage.count({
      where: {
        matchId,
        senderEmail: { not: email },
        NOT: { readBy: { has: email } },
      },
    });
    unreadCounts[email] = n;
  }

  const existing = await prisma.conversation.findFirst({
    where: { type: "match", entityId: matchId },
  });

  const payload = {
    participantEmails: participants,
    entityName: match.title?.trim() || "Match chat",
    lastMessageText: excerpt,
    lastMessageAt: latest.createdAt,
    lastMessageBy: latest.senderEmail,
    unreadCounts,
  };

  const conv = existing
    ? await prisma.conversation.update({
        where: { id: existing.id },
        data: payload,
      })
    : await prisma.conversation.create({
        data: {
          type: "match",
          entityId: matchId,
          ...payload,
        },
      });

  emitConversationUpdated(conv, conv.participantEmails);
}

/** Backfill inbox rows for matches that already have chat but no Conversation yet. */
export async function ensureMissingMatchInboxesForViewer(viewerEmail: string): Promise<void> {
  const viewer = String(viewerEmail || "").trim();
  if (!viewer) return;

  const matches = await prisma.match.findMany({
    where: { players: { has: viewer } },
    select: { id: true },
    take: 200,
  });
  if (matches.length === 0) return;

  const ids = matches.map((m) => m.id);
  const existing = new Set(
    (
      await prisma.conversation.findMany({
        where: { type: "match", entityId: { in: ids } },
        select: { entityId: true },
      })
    )
      .map((c) => c.entityId)
      .filter(Boolean) as string[],
  );

  const missing = ids.filter((id) => !existing.has(id));
  if (missing.length === 0) return;

  const withAnyMessage = await prisma.chatMessage.findMany({
    where: { matchId: { in: missing } },
    distinct: ["matchId"],
    select: { matchId: true },
  });
  for (const row of withAnyMessage) {
    await syncMatchConversationInbox(row.matchId);
  }
}
