import jwt from "jsonwebtoken";
import { prisma } from "./prisma.js";
const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
export function bearerTokenFromRequest(req) {
    const header = String(req.headers.authorization || "");
    return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}
export function verifyBearerToken(token) {
    if (!token)
        return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const email = String(decoded.email || "").trim().toLowerCase();
        const userId = String(decoded.sub || "").trim();
        if (!email || !userId)
            return null;
        return { userId, email };
    }
    catch {
        return null;
    }
}
export async function requireAuthUser(req) {
    const ctx = verifyBearerToken(bearerTokenFromRequest(req));
    if (!ctx)
        return null;
    const user = await prisma.user.findUnique({ where: { email: ctx.email } });
    if (!user)
        return null;
    return user;
}
export function adminEmails() {
    const raw = process.env.ADMIN_EMAILS || "";
    return new Set(raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean));
}
export function isAdminUser(user) {
    if (user.role === "admin")
        return true;
    return adminEmails().has(user.email.trim().toLowerCase());
}
