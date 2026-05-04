import { prisma } from "./prisma.js";

export async function notifyUser(opts: {
  userEmail: string;
  type: string;
  title: string;
  body?: string;
  matchId?: string | null;
}) {
  try {
    return await prisma.notification.create({
      data: {
        userEmail: opts.userEmail.trim(),
        type: opts.type,
        title: opts.title,
        body: opts.body ?? null,
        matchId: opts.matchId ?? null,
        relatedEntityType: opts.matchId ? "match" : null,
        relatedEntityId: opts.matchId ?? null,
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
