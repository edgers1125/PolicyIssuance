require("dotenv").config();
const express = require("express");
const cors = require("cors");

const prisma = require("./lib/prisma");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const customersRouter = require("./routes/customers");
const companiesRouter = require("./routes/companies");
const catalogRouter = require("./routes/catalog");
const policyApplicationsRouter = require("./routes/policyApplications");
const { requireAuth } = require("./middleware/auth");
const { getUserPermissionCodes } = require("./middleware/permissions");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/customers", customersRouter);
app.use("/companies", companiesRouter);
app.use("/", catalogRouter);
app.use("/policy-applications", policyApplicationsRouter);

app.get("/me", requireAuth, async (req, res, next) => {
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
      },
    });
    const permissionCodes = await getUserPermissionCodes(req.user.userId);
    res.json({ ...user, permissions: Array.from(permissionCodes) });
  } catch (err) {
    next(err);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
