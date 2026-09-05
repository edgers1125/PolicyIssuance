const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { ensurePermission, getUserPermissionCodes } = require("../middleware/permissions");
const { validateBody } = require("../middleware/validate");
const { createPaymentMethodSchema } = require("../schemas/paymentMethods");

const router = express.Router();

router.use(requireAuth);

// Any authenticated user can see the list — an agent needs it to fill out a
// policy application; only managing (add/remove) it needs the special grant.
router.get("/", async (req, res, next) => {
  try {
    const methods = await prisma.authorizedPaymentMethod.findMany({
      orderBy: { name: "asc" },
    });
    res.json(methods);
  } catch (err) {
    next(err);
  }
});

router.post("/", validateBody(createPaymentMethodSchema), async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "MANAGE_PAYMENT_METHODS")) return;

    const { name } = req.body;

    const existing = await prisma.authorizedPaymentMethod.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: "This payment method already exists" });
    }

    const method = await prisma.authorizedPaymentMethod.create({ data: { name } });
    res.status(201).json(method);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (!ensurePermission(res, actingPermissions, "MANAGE_PAYMENT_METHODS")) return;

    const { id } = req.params;
    const method = await prisma.authorizedPaymentMethod.findUnique({ where: { id } });
    if (!method) {
      return res.status(404).json({ error: "Payment method not found" });
    }

    const inUse = await prisma.policyApplication.findFirst({ where: { bethel_payment_method_id: id } });
    if (inUse) {
      return res
        .status(409)
        .json({ error: "This payment method is used by at least one policy application and can't be removed" });
    }

    await prisma.authorizedPaymentMethod.delete({ where: { id } });
    res.json({ message: "Payment method removed" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
