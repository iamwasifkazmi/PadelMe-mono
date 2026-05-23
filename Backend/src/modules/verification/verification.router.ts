import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuthUser } from "../../lib/jwtAuth.js";
import { uploadVerificationImage } from "../../lib/supabaseStorage.js";

export const verificationRouter = Router();

verificationRouter.get("/status", async (req, res) => {
  const userEmail = String(req.query.email || "");
  if (!userEmail) return res.status(400).json({ error: "email query is required" });
  const item = await prisma.iDVerification.findFirst({
    where: { userEmail },
    orderBy: { createdAt: "desc" },
  });
  if (!item) return res.json({ status: "not_submitted" });
  return res.json(item);
});

/** Upload ID or selfie; returns public URL (Supabase when configured, else echoes data URL). */
verificationRouter.post("/upload", async (req, res) => {
  const authUser = await requireAuthUser(req);
  const email = String(req.body.email || authUser?.email || "").trim().toLowerCase();
  const kind = req.body.kind === "selfie" ? "selfie" : "id";
  const image = String(req.body.image || "");

  if (!email) return res.status(400).json({ error: "email is required" });
  if (!image.trim()) return res.status(400).json({ error: "image is required" });
  if (authUser && authUser.email.toLowerCase() !== email) {
    return res.status(403).json({ error: "Cannot upload for another user" });
  }

  try {
    const url = await uploadVerificationImage(email, kind, image);
    return res.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return res.status(500).json({ error: msg });
  }
});

verificationRouter.post("/submit", async (req, res) => {
  const authUser = await requireAuthUser(req);
  const userEmail = String(req.body.email || authUser?.email || "").trim();
  let idPhotoUrl = String(req.body.idPhotoUrl || "");
  let selfieUrl = String(req.body.selfieUrl || "");
  if (!userEmail) return res.status(400).json({ error: "email is required" });
  if (authUser && authUser.email.toLowerCase() !== userEmail.toLowerCase()) {
    return res.status(403).json({ error: "Cannot submit for another user" });
  }

  try {
    if (idPhotoUrl.trim()) {
      idPhotoUrl = await uploadVerificationImage(userEmail, "id", idPhotoUrl);
    }
    if (selfieUrl.trim()) {
      selfieUrl = await uploadVerificationImage(userEmail, "selfie", selfieUrl);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return res.status(500).json({ error: msg });
  }

  const existing = await prisma.iDVerification.findFirst({
    where: { userEmail },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const updated = await prisma.iDVerification.update({
      where: { id: existing.id },
      data: {
        idPhotoUrl: idPhotoUrl || existing.idPhotoUrl || undefined,
        selfieUrl: selfieUrl || existing.selfieUrl || undefined,
        status: "pending",
        reviewNotes: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    });
    return res.json(updated);
  }

  const created = await prisma.iDVerification.create({
    data: {
      userEmail,
      idPhotoUrl: idPhotoUrl || undefined,
      selfieUrl: selfieUrl || undefined,
      status: "pending",
    },
  });
  return res.status(201).json(created);
});

/** Mark profile photo verified when user has a photo (Base44 photo_verified). */
verificationRouter.post("/confirm-photo", async (req, res) => {
  const authUser = await requireAuthUser(req);
  const email = String(req.body.email || authUser?.email || "").trim();
  if (!email) return res.status(400).json({ error: "email is required" });

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.photoUrl?.trim()) {
    return res.status(400).json({ error: "Add a profile photo first" });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { photoVerified: true },
  });
  return res.json({ photoVerified: updated.photoVerified });
});
