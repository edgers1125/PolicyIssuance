const { PrismaClient } = require("../../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");
const { requireEnv } = require("../utils/env");

const adapter = new PrismaPg({ connectionString: requireEnv("DATABASE_URL") });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
