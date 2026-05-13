import { MatchType } from "@prisma/client";
import { effectiveTeamsAtStart } from "./matchTeams.js";
function normGender(g) {
    if (!g)
        return null;
    return g.trim().toLowerCase();
}
function normRequirement(raw) {
    return (raw || "any").trim().toLowerCase();
}
function normVerification(raw) {
    return (raw || "none").trim().toLowerCase();
}
export function userToEligibilityProfile(user) {
    return {
        email: user.email,
        fullName: user.fullName,
        gender: user.gender,
        age: user.age,
        skillLevel: user.skillLevel ?? null,
        averageRating: user.averageRating ?? null,
        photoVerified: user.photoVerified,
        idVerified: user.idVerified,
    };
}
export function stubProfileForEmail(email) {
    return {
        email,
        fullName: email.split("@")[0],
        gender: null,
        age: null,
        skillLevel: 5,
        averageRating: null,
        photoVerified: false,
        idVerified: false,
    };
}
/**
 * Base44 parity: per-player gender, age, inverted skill band, avg rating, verification.
 */
export function playerMeetsMatchEligibility(match, player) {
    const name = player.fullName || player.email.split("@")[0];
    const genderReq = normRequirement(match.genderRequirement);
    if (genderReq && genderReq !== "any" && genderReq !== "mixed") {
        const g = normGender(player.gender);
        if (g && g !== genderReq) {
            return { ok: false, reason: `${name} does not meet gender requirement` };
        }
    }
    if (match.ageMin != null && player.age != null && player.age < match.ageMin) {
        return { ok: false, reason: `${name} is below minimum age requirement` };
    }
    if (match.ageMax != null && player.age != null && player.age > match.ageMax) {
        return { ok: false, reason: `${name} exceeds maximum age requirement` };
    }
    const playerSkill = player.skillLevel ?? 5;
    if (match.skillRangeMin != null && playerSkill < match.skillRangeMin) {
        return { ok: false, reason: `${name} skill level is too high` };
    }
    if (match.skillRangeMax != null && playerSkill > match.skillRangeMax) {
        return { ok: false, reason: `${name} skill level is too low` };
    }
    if (match.minRatingThreshold != null) {
        const playerRating = player.averageRating ?? 0;
        if (playerRating < match.minRatingThreshold) {
            return { ok: false, reason: `${name} does not meet minimum rating requirement` };
        }
    }
    const ver = normVerification(match.verificationRequirement);
    if (ver !== "none") {
        if (ver === "photo" && !player.photoVerified) {
            return { ok: false, reason: `${name} has not verified their profile` };
        }
        if (ver === "id" && !player.idVerified) {
            return { ok: false, reason: `${name} has not verified their ID` };
        }
    }
    return { ok: true };
}
export function validateRosterEligibility(match, profilesByEmail) {
    const players = match.players || [];
    const emailsLower = new Set();
    for (const e of players) {
        const key = e.trim().toLowerCase();
        if (emailsLower.has(key)) {
            return { valid: false, reason: "Duplicate players in roster" };
        }
        emailsLower.add(key);
    }
    for (const email of players) {
        const prof = profilesByEmail.get(email.trim().toLowerCase()) ?? stubProfileForEmail(email);
        const r = playerMeetsMatchEligibility(match, prof);
        if (!r.ok)
            return { valid: false, reason: r.reason };
    }
    if (match.matchType !== MatchType.mixed_doubles) {
        return { valid: true, reason: "" };
    }
    const { teamA, teamB } = effectiveTeamsAtStart(match);
    for (const team of [teamA, teamB]) {
        const teamProfiles = team.map((em) => {
            const p = profilesByEmail.get(em.trim().toLowerCase());
            return p ?? stubProfileForEmail(em);
        });
        const maleCount = teamProfiles.filter((p) => normGender(p.gender) === "male").length;
        const femaleCount = teamProfiles.filter((p) => normGender(p.gender) === "female").length;
        if (maleCount !== 1 || femaleCount !== 1) {
            return { valid: false, reason: "Mixed doubles requires 1 male and 1 female per team" };
        }
    }
    return { valid: true, reason: "" };
}
