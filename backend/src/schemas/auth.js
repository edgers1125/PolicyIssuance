const { z } = require("zod");
const { requiredString } = require("./common");

const loginSchema = z.object({
  email: requiredString("email"),
  password: requiredString("password"),
});

const forgotPasswordSchema = z.object({
  email: requiredString("email"),
});

const setPasswordSchema = z.object({
  token: requiredString("token"),
  password: z.string({ error: "password is required" }).min(8, "Password must be at least 8 characters"),
});

module.exports = { loginSchema, forgotPasswordSchema, setPasswordSchema };
