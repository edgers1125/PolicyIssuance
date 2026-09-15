const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { signToken } = require("../utils/jwt");
const { validateBody } = require("../middleware/validate");
const { loginSchema, forgotPasswordSchema, setPasswordSchema } = require("../schemas/auth");
const { sendMail } = require("../lib/mailer");

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

router.post("/login", validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken({ userId: user.id, email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        status: user.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond the same way whether or not the email is on file,
    // so this endpoint can't be used to enumerate registered users.
    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");

      await prisma.user.update({
        where: { id: user.id },
        data: {
          invite_token: resetToken,
          invite_token_expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      const resetLink = `${process.env.FRONTEND_URL}/set-password?token=${resetToken}`;

      // Always log the link too, regardless of send outcome — the same
      // fallback the invite flow relies on when SMTP is down.
      console.log(`[email] Password reset link for ${email}: ${resetLink}`);

      // A send failure here (e.g. SMTP not configured) must NOT change the
      // response — this route always replies with the same generic message
      // whether or not the account exists, and letting a mail error surface
      // only on the "user exists" path would itself be an enumeration leak.
      try {
        await sendMail({
          to: email,
          subject: "Reset your Bethel Policy Issuance password",
          html: `
            <div style="font-family:Arial,sans-serif;color:#111">
              <p>We received a request to reset your Bethel Policy Issuance password.</p>
              <p><a href="${resetLink}">Click here to choose a new password</a>. This link expires in 1 hour.</p>
              <p>If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
          text: [
            "We received a request to reset your Bethel Policy Issuance password.",
            "",
            `Choose a new password: ${resetLink}`,
            "",
            "This link expires in 1 hour. If you didn't request this, you can safely ignore this email.",
          ].join("\n"),
        });
      } catch (mailErr) {
        console.error(`[email] Failed to send password reset email to ${email}:`, mailErr.message || mailErr);
      }
    }

    res.json({ message: "If an account with that email exists, a password reset link has been sent." });
  } catch (err) {
    next(err);
  }
});

router.post("/set-password", validateBody(setPasswordSchema), async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const user = await prisma.user.findUnique({ where: { invite_token: token } });

    if (!user || !user.invite_token_expires_at || user.invite_token_expires_at < new Date()) {
      return res.status(400).json({ error: "This invite link is invalid or has expired" });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        status: "ACTIVE",
        email_verified_at: new Date(),
        invite_token: null,
        invite_token_expires_at: null,
      },
    });

    res.json({ message: "Password set. You can now log in." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
