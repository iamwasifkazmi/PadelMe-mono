import { prisma } from "./prisma.js";
import { emailsEqual } from "./emailsCi.js";
export async function userDisplayNameForEmail(raw) {
    const u = await prisma.user.findFirst({
        where: { email: { equals: raw.trim(), mode: "insensitive" } },
        select: { fullName: true, firstName: true, lastName: true, email: true },
    });
    if (u?.fullName?.trim())
        return u.fullName.trim();
    const first = u?.firstName?.trim();
    const last = u?.lastName?.trim();
    if (first && last)
        return `${first} ${last}`;
    if (first)
        return first;
    return raw.split("@")[0] || raw.trim();
}
async function canonicalUserEmail(raw) {
    const u = await prisma.user.findFirst({
        where: { email: { equals: raw.trim(), mode: "insensitive" } },
        select: { email: true },
    });
    return u?.email?.trim() ?? null;
}
/** Notify match organiser when someone joins (direct join or invite accepted). */
export async function notifyHostPlayerJoinedMatch(opts) {
    if (emailsEqual(opts.hostEmail, opts.joinerEmail))
        return;
    const hostCanon = (await canonicalUserEmail(opts.hostEmail)) ?? opts.hostEmail.trim();
    const joinerName = await userDisplayNameForEmail(opts.joinerEmail);
    const title = opts.viaInvite ? "Invite accepted" : "Player joined!";
    const body = opts.viaInvite
        ? `${joinerName} accepted your invite and joined "${opts.matchTitle}"`
        : `${joinerName} joined your match "${opts.matchTitle}"`;
    await notifyUser({
        userEmail: hostCanon,
        type: opts.viaInvite ? "match_invite_accepted" : "match_player_joined",
        title,
        body,
        matchId: opts.matchId,
    });
}
/** Notify competition organiser when an invite is accepted. */
export async function notifyHostCompetitionInviteAccepted(opts) {
    if (emailsEqual(opts.hostEmail, opts.joinerEmail))
        return;
    const hostCanon = (await canonicalUserEmail(opts.hostEmail)) ?? opts.hostEmail.trim();
    const joinerName = await userDisplayNameForEmail(opts.joinerEmail);
    await notifyUser({
        userEmail: hostCanon,
        type: "competition_invite_accepted",
        title: "Invite accepted",
        body: `${joinerName} accepted your invite and joined "${opts.competitionName}"`,
        matchId: null,
        relatedEntityType: "competition",
        relatedEntityId: opts.competitionId,
    });
}
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
