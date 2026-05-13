import { prisma } from "./prisma.js";
export async function notifyUser(opts) {
    try {
        const matchId = opts.matchId ?? null;
        const relatedEntityType = opts.relatedEntityType != null && opts.relatedEntityType !== ""
            ? opts.relatedEntityType
            : matchId
                ? "match"
                : null;
        const relatedEntityId = opts.relatedEntityId != null && opts.relatedEntityId !== ""
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
    }
    catch (err) {
        console.error("[notifyUser]", err);
        return null;
    }
}
export async function notifyMatchEmails(emails, opts) {
    const seen = new Set();
    await Promise.all(emails.map(async (raw) => {
        const e = raw.trim().toLowerCase();
        if (seen.has(e))
            return;
        seen.add(e);
        await notifyUser({ ...opts, userEmail: raw.trim() });
    }));
}
