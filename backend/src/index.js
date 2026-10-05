require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

// Fail fast at boot on every env var the app can't run correctly without —
// same contract as utils/jwt.js's own JWT_SECRET check (which also fires once
// routes/auth.js is required below). lib/prisma.js re-checks DATABASE_URL
// itself and routes/auth.js + routes/users.js re-check FRONTEND_URL, so a
// script that requires those modules directly gets the same protection.
const { requireEnv, requireUrlEnv } = require("./utils/env");
requireEnv("DATABASE_URL");
requireEnv("JWT_SECRET");
requireUrlEnv("FRONTEND_URL");

const prisma = require("./lib/prisma");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const customersRouter = require("./routes/customers");
const companiesRouter = require("./routes/companies");
const agentsRouter = require("./routes/agents");
const vehiclesRouter = require("./routes/vehicles");
const addressesRouter = require("./routes/addresses");
const catalogRouter = require("./routes/catalog");
const coveragePricingRouter = require("./routes/coveragePricing");
const policyApplicationsRouter = require("./routes/policyApplications");
const policyQuotationsRouter = require("./routes/policyQuotations");
const policyApprovalRouter = require("./routes/policyApproval");
const policiesRouter = require("./routes/policies");
const paymentMethodsRouter = require("./routes/paymentMethods");
const inLeaseBacklogRouter = require("./routes/inLeaseBacklog");
const endorsementsRouter = require("./routes/endorsements");
const accountingRouter = require("./routes/accounting");
const { requireAuth } = require("./middleware/auth");
const { getUserPermissionCodes } = require("./middleware/permissions");

const app = express();

app.use(cors());
app.use(express.json());

// Every API route lives under /api — never at the root — because several
// API mounts share a path with a frontend page (/accounting, /endorsements),
// and in UAT/production this same Express process also serves the built
// React app (see below): a browser refresh on /accounting must get the SPA's
// index.html, not the accounting router's 401.
const api = express.Router();

api.use("/auth", authRouter);
api.use("/users", usersRouter);
api.use("/customers", customersRouter);
api.use("/companies", companiesRouter);
api.use("/agents", agentsRouter);
api.use("/vehicles", vehiclesRouter);
api.use("/addresses", addressesRouter);
api.use("/", catalogRouter);
api.use("/", coveragePricingRouter);
api.use("/policy-applications", policyApplicationsRouter);
api.use("/policy-quotations", policyQuotationsRouter);
api.use("/policy-approval", policyApprovalRouter);
api.use("/policies", policiesRouter);
api.use("/payment-methods", paymentMethodsRouter);
api.use("/inlease-backlogs", inLeaseBacklogRouter);
api.use("/endorsements", endorsementsRouter);
api.use("/accounting", accountingRouter);

api.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        full_name: true,
        status: true,
        agent_id: true,
        customer_id: true,
        agent: { select: { agent_code: true, agent_name: true } },
      },
    });
    const permissionCodes = await getUserPermissionCodes(req.user.userId);
    res.json({ ...user, permissions: Array.from(permissionCodes) });
  } catch (err) {
    next(err);
  }
});

// Unmatched /api paths stay JSON 404s rather than falling through to the SPA.
api.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use("/api", api);

// The built React app (frontend/dist), copied to backend/public by the UAT
// Dockerfile. Only ever this one directory is served statically — NEVER add
// an express.static for src/ or any subdirectory of it: src/pdf/assets holds
// the branch head's signature image, which must stay readable only by the
// PDF builders' own filesystem reads (see pdf/theme.js). In local dev this
// directory doesn't exist and Vite serves the frontend instead.
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, "..", "public");
if (fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
  app.use(express.static(FRONTEND_DIST, { index: false }));
  // Client-side routes (/dashboard, /accounting, ...) all resolve to the
  // SPA shell; React Router takes it from there.
  app.get("/{*splat}", (req, res) => res.sendFile(path.join(FRONTEND_DIST, "index.html")));
  console.log(`Serving frontend from ${FRONTEND_DIST}`);
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
