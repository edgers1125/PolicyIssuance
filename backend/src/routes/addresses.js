const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permissions");
const { validateBody } = require("../middleware/validate");
const { getCurrentAgentId } = require("../lib/agent");
const { updateAddressSchema } = require("../schemas/addresses");

const router = express.Router();

router.use(requireAuth, requirePermission("CREATE_APPLICATION"));

// An address isn't owned directly by an agent — it's reached through whichever
// customer/company it's on file for, and that party has to be one of this agent's.
async function agentCanEditAddress(agentId, addressId) {
  const viaCustomer = await prisma.customerAddress.findFirst({
    where: {
      address_id: addressId,
      customer: { customer_agents: { some: { agent_id: agentId } } },
    },
  });
  if (viaCustomer) return true;

  const viaCompany = await prisma.companyAddress.findFirst({
    where: {
      address_id: addressId,
      company: { company_agents: { some: { agent_id: agentId } } },
    },
  });
  return Boolean(viaCompany);
}

router.patch("/:id", validateBody(updateAddressSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const agentId = await getCurrentAgentId(req.user.userId);
    if (!agentId) {
      return res.status(400).json({ error: "Your account isn't linked to an agent profile" });
    }

    const allowed = await agentCanEditAddress(agentId, id);
    if (!allowed) {
      return res.status(403).json({ error: "This address isn't connected to your agent account" });
    }

    const { address_line_1, address_line_2, barangay, city, province, postal_code, country } = req.body;

    const address = await prisma.address.update({
      where: { id },
      data: {
        address_line_1,
        address_line_2: address_line_2 || null,
        barangay: barangay || null,
        city,
        province,
        postal_code: postal_code || null,
        country: country || "Philippines",
      },
    });

    res.json(address);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
