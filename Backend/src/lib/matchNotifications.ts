import { prisma } from "./prisma.js";

export async function notifyUser(opts: {
  userEmail: string;
  type: string;
  title: string;
  body?: string;
  /** Match-related notifications (detail, scores, etc.). */
  matchId?: string | null;
  /** e.g. `conversation` for DMs when `matchId` is null */
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}) {
  try {
    const matchId = opts.matchId ?? null;
    const relatedEntityType =
      opts.relatedEntityType != null && opts.relatedEntityType !== ""
        ? opts.relatedEntityType
        : matchId
          ? "match"
          : null;
    const relatedEntityId =
      opts.relatedEntityId != null && opts.relatedEntityId !== ""
        ? opts.relatedEntityId
        : matchId ?? null;

    return await prisma.notification.create({
      data: {
        userEmail: opts.userEmail.trim(),
        type: opts.type,
        title: opts.title,
        body: opts.body ?? null,
        matchId,
        relatedEntityType,
        relatedEntityId,
        priority: "normal",
      },
    });
  } catch (err) {
    console.error("[notifyUser]", err);
    return null;
  }
}

export async function notifyMatchEmails(
  emails: string[],
  opts: Omit<Parameters<typeof notifyUser>[0], "userEmail"> & { matchId: string },
) {
  const seen = new Set<string>();
  await Promise.all(
    emails.map(async (raw) => {
      const e = raw.trim().toLowerCase();
      if (seen.has(e)) return;
      seen.add(e);
      await notifyUser({ ...opts, userEmail: raw.trim() });
    }),
  );
}
