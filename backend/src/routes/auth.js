const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");
const { signToken } = require("../utils/jwt");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

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

router.post("/set-password", async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "token and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

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
