import admin from "firebase-admin";
import { prisma } from "./prisma.js";
let firebaseReady = false;
function initFirebaseAdmin() {
    if (firebaseReady)
        return true;
    if (admin.apps.length > 0) {
        firebaseReady = true;
        return true;
    }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw)
        return false;
    try {
        const cred = JSON.parse(raw);
        admin.initializeApp({ credential: admin.credential.cert(cred) });
        firebaseReady = true;
        return true;
    }
    catch (err) {
        console.error("[push] Firebase init failed:", err);
        return false;
    }
}
export function isPushConfigured() {
    return initFirebaseAdmin();
}
export async function upsertPushDevice(opts) {
    const userEmail = opts.userEmail.trim();
    const token = opts.token.trim();
    const platform = opts.platform.trim().toLowerCase();
    if (!userEmail || !token || !platform)
        return null;
    return prisma.pushDevice.upsert({
        where: { token },
        create: { userEmail, token, platform },
        update: { userEmail, platform, updatedAt: new Date() },
    });
}
export async function removePushDevice(token) {
    const t = token.trim();
    if (!t)
        return;
    await prisma.pushDevice.deleteMany({ where: { token: t } });
}
export async function removePushDevicesForUser(userEmail) {
    await prisma.pushDevice.deleteMany({ where: { userEmail: userEmail.trim() } });
}
function pushDataPayload(n) {
    return {
        notificationId: n.id,
        type: n.type,
        title: n.title,
        body: n.body ?? "",
        matchId: n.matchId ?? "",
        relatedEntityType: n.relatedEntityType ?? "",
        relatedEntityId: n.relatedEntityId ?? "",
    };
}
/** Send FCM push to all devices registered for this user. No-op if Firebase is not configured. */
export async function sendPushForNotification(n) {
    if (!initFirebaseAdmin())
        return;
    const devices = await prisma.pushDevice.findMany({
        where: { userEmail: n.userEmail },
        select: { token: true },
    });
    if (!devices.length)
        return;
    const data = pushDataPayload(n);
    const message = {
        tokens: devices.map((d) => d.token),
        notification: {
            title: n.title,
            ...(n.body ? { body: n.body } : {}),
        },
        data,
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    badge: 1,
                },
            },
        },
        android: {
            priority: "high",
        },
    };
    try {
        const res = await admin.messaging().sendEachForMulticast(message);
        const stale = [];
        res.responses.forEach((r, i) => {
            if (!r.success && r.error) {
                const code = r.error.code;
                if (code === "messaging/registration-token-not-registered" ||
                    code === "messaging/invalid-registration-token") {
                    stale.push(devices[i].token);
                }
                else {
                    console.warn("[push] send error:", code, r.error.message);
                }
            }
        });
        if (stale.length) {
            await prisma.pushDevice.deleteMany({ where: { token: { in: stale } } });
        }
    }
    catch (err) {
        console.error("[push] multicast failed:", err);
    }
}
