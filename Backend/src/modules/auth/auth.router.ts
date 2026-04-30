import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const registerSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  fullName: z.string().min(2).max(80),
});

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
});

const verifyRegisterSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  code: z.string().length(6),
});

const resetSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  code: z.string().length(6),
  newPassword: z.string().min(8),
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "noreply@padelme.app";
const OTP_EXPIRES_MINUTES = Number(process.env.OTP_EXPIRES_MINUTES || 10);

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

export const authRouter = Router();

function signToken(user: { id: string; email: string; fullName?: string | null }) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      fullName: user.fullName || "",
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

async function sendOtpEmail(email: string, code: string, purpose: "registration" | "reset") {
  const isRegistration = purpose === "registration";
  const subject = isRegistration ? "Verify your PadelMe account" : "PadelMe password reset code";
  const text = isRegistration
    ? `Your PadelMe account verification code is ${code}. It expires in ${OTP_EXPIRES_MINUTES} minutes.`
    : `Your PadelMe reset code is ${code}. It expires in ${OTP_EXPIRES_MINUTES} minutes.`;

  if (!transporter) {
    // eslint-disable-next-line no-console
    console.log(`[DEV OTP] ${email} -> ${code}`);
    return;
  }

  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject,
    text,
    html: `<p>Your PadelMe ${isRegistration ? "verification" : "reset"} code is <strong>${code}</strong>.</p><p>It expires in ${OTP_EXPIRES_MINUTES} minutes.</p>`,
  });
}

async function issueEmailVerificationOtp(email: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.emailVerificationOtp.create({
    data: {
      userEmail: email,
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000),
    },
  });
  await sendOtpEmail(email, code, "registration");
}

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid registration payload" });
  }

  const { email, password, fullName } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash && existing?.isEmailVerified) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: {
          passwordHash,
          fullName: fullName || existing.fullName,
          authProvider: "local",
          isEmailVerified: false,
        },
      })
    : await prisma.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          authProvider: "local",
          isEmailVerified: false,
          location: "Dubai",
          skillLabel: "intermediate",
        },
      });

  await issueEmailVerificationOtp(email);

  return res.status(201).json({
    requiresVerification: true,
    email: user.email,
  });
});

authRouter.post("/resend-register-otp", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email is required" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return res.status(404).json({ error: "User not found" });
  if (user.isEmailVerified) return res.status(409).json({ error: "Email already verified" });

  await issueEmailVerificationOtp(email);
  return res.json({ success: true });
});

authRouter.post("/verify-register-otp", async (req, res) => {
  const parsed = verifyRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid verification payload" });
  }

  const { email, code } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    return res.status(400).json({ error: "Invalid verification request" });
  }

  const otp = await prisma.emailVerificationOtp.findFirst({
    where: {
      userEmail: email,
      code,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return res.status(400).json({ error: "Invalid or expired code" });

  await prisma.$transaction([
    prisma.user.update({
      where: { email },
      data: { isEmailVerified: true },
    }),
    prisma.emailVerificationOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    }),
  ]);

  const updated = await prisma.user.findUnique({ where: { email } });
  if (!updated) return res.status(404).json({ error: "User not found" });
  const token = signToken(updated);
  return res.json({
    token,
    user: {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
    },
  });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid login payload" });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (!user.isEmailVerified) {
    return res.status(403).json({ error: "Please verify your email with OTP before logging in" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    },
  });
});

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid forgot password payload" });
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.json({ success: true });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.passwordResetOtp.create({
    data: {
      userEmail: email,
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000),
    },
  });
  await sendOtpEmail(email, code, "reset");
  return res.json({ success: true });
});

authRouter.post("/reset-password", async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid reset payload" });
  }

  const { email, code, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: "Invalid reset request" });

  const otp = await prisma.passwordResetOtp.findFirst({
    where: {
      userEmail: email,
      code,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return res.status(400).json({ error: "Invalid or expired code" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { email },
      data: { passwordHash, authProvider: "local" },
    }),
    prisma.passwordResetOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    }),
  ]);

  return res.json({ success: true });
});

authRouter.get("/me", async (req, res) => {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email?: string };
    const email = String(decoded.email || "").toLowerCase();
    if (!email) return res.status(401).json({ error: "Invalid token" });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});
