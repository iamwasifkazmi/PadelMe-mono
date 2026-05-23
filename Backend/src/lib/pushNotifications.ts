import admin from "firebase-admin";
import type { Notification } from "@prisma/client";
import { prisma } from "./prisma.js";

let firebaseReady = false;

function firebaseProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    "mipadel-7463c"
  );
}

function initFirebaseAdmin(): boolean {
  if (firebaseReady) return true;
  if (admin.apps.length > 0) {
    firebaseReady = true;
    return true;
  }

  const projectId = firebaseProjectId();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const cred = JSON.parse(raw) as admin.ServiceAccount;
      admin.initializeApp({ credential: admin.credential.cert(cred), projectId });
      firebaseReady = true;
      return true;
    } catch (err) {
      console.error("[push] Firebase init from JSON failed:", err);
      return false;
    }
  }

  // Cloud Run / GCP: no JSON key — use the runtime service account (ADC).
  // Grant that SA "Firebase Cloud Messaging Admin" on project mipadel-7463c (see PUSH_NOTIFICATIONS.md).
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
    firebaseReady = true;
    console.info("[push] Firebase Admin using Application Default Credentials, project:", projectId);
    return true;
  } catch (err) {
    console.warn(
      "[push] Firebase not configured (set FIREBASE_SERVICE_ACCOUNT_JSON or run on Cloud Run with FCM IAM):",
      err,
    );
    return false;
  }
}

export function isPushConfigured(): boolean {
  return initFirebaseAdmin();
}

export async function upsertPushDevice(opts: {
  userEmail: string;
  token: string;
  platform: string;
}) {
  const userEmail = opts.userEmail.trim();
  const token = opts.token.trim();
  const platform = opts.platform.trim().toLowerCase();
  if (!userEmail || !token || !platform) return null;
  return prisma.pushDevice.upsert({
    where: { token },
    create: { userEmail, token, platform },
    update: { userEmail, platform, updatedAt: new Date() },
  });
}

export async function removePushDevice(token: string) {
  const t = token.trim();
  if (!t) return;
  await prisma.pushDevice.deleteMany({ where: { token: t } });
}

export async function removePushDevicesForUser(userEmail: string) {
  await prisma.pushDevice.deleteMany({ where: { userEmail: userEmail.trim() } });
}

function pushDataPayload(n: Notification): Record<string, string> {
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
export async function sendPushForNotification(n: Notification): Promise<void> {
  if (!initFirebaseAdmin()) return;

  const devices = await prisma.pushDevice.findMany({
    where: { userEmail: n.userEmail },
    select: { token: true },
  });
  if (!devices.length) return;

  const data = pushDataPayload(n);
  const message: admin.messaging.MulticastMessage = {
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
    const stale: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success && r.error) {
        const code = r.error.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          stale.push(devices[i]!.token);
        } else {
          console.warn("[push] send error:", code, r.error.message);
        }
      }
    });
    if (stale.length) {
      await prisma.pushDevice.deleteMany({ where: { token: { in: stale } } });
    }
  } catch (err) {
    console.error("[push] multicast failed:", err);
  }
}
