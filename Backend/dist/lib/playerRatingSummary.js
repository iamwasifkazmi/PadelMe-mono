import { prisma } from "./prisma.js";
const TAG_KEYS = [
    "reliable",
    "good_attitude",
    "skill_accurate",
    "would_play_again",
];
/** Recalculate PlayerRatingSummary + User.averageRating (Base44 updateRatingSummary). */
export async function syncPlayerRatingSummary(ratedEmail) {
    const canonical = ratedEmail.trim().toLowerCase();
    const user = await prisma.user.findFirst({
        where: { email: { equals: canonical, mode: "insensitive" } },
    });
    if (!user)
        return null;
    const ratings = await prisma.rating.findMany({
        where: {
            ratedEmail: user.email,
            isRevealed: true,
        },
    });
    if (ratings.length === 0) {
        await prisma.playerRatingSummary.deleteMany({ where: { userEmail: user.email } });
        await prisma.user.update({
            where: { id: user.id },
            data: { averageRating: null },
        });
        return { averageRating: null, totalRatings: 0 };
    }
    const totalRatings = ratings.length;
    const sumOverall = ratings.reduce((s, r) => s + r.overall, 0);
    const averageRating = Math.round((sumOverall / totalRatings) * 10) / 10;
    const tagCounts = {};
    for (const key of TAG_KEYS)
        tagCounts[key] = 0;
    for (const r of ratings) {
        for (const tag of r.tags) {
            const norm = String(tag).trim().toLowerCase();
            if (TAG_KEYS.includes(norm)) {
                tagCounts[norm] = (tagCounts[norm] || 0) + 1;
            }
        }
    }
    const summaryData = {
        userId: user.id,
        userEmail: user.email,
        averageRating,
        totalRatings,
        tagReliableCount: tagCounts.reliable || 0,
        tagGoodAttitudeCount: tagCounts.good_attitude || 0,
        tagSkillAccurateCount: tagCounts.skill_accurate || 0,
        tagWouldPlayAgainCount: tagCounts.would_play_again || 0,
    };
    await prisma.playerRatingSummary.upsert({
        where: { userEmail: user.email },
        create: summaryData,
        update: summaryData,
    });
    await prisma.user.update({
        where: { id: user.id },
        data: { averageRating },
    });
    return { averageRating, totalRatings, tagCounts };
}
