const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { signToken } = require("../utils/jwt");
const { validateBody } = require("../middleware/validate");
const { loginSchema, forgotPasswordSchema, setPasswordSchema } = require("../schemas/auth");

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

      // No email provider configured yet — log the link so the reset flow
      // can be tested end-to-end without real email delivery.
      console.log(`[mock email] Password reset link for ${email}: ${resetLink}`);
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
