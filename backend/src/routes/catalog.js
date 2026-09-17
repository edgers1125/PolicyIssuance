const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const {
  requirePermission,
  requireAnyPermission,
  ensurePermission,
  ensureAnyPermission,
  getUserPermissionCodes,
  INTAKE_PERMISSIONS,
} = require("../middleware/permissions");
const { validateBody, validateParams } = require("../middleware/validate");
const {
  updateCoverageSchema,
  productVariantIdParamSchema,
  updateProductVariantSchema,
  insuranceClassIdParamSchema,
  updateInsuranceClassSchema,
  createInsuranceClassSchema,
  createProductVariantSchema,
  createProductCoverageSchema,
  batchDeleteSchema,
} = require("../schemas/catalog");

const router = express.Router();

// Feeds both PolicyApplication.jsx (CREATE_APPLICATION) and
// QuotationCreator.jsx (QUOTATION_TRACKER.CREATE_QUOTATION/
// ADMIN_CREATE_QUOTATION) — see INTAKE_PERMISSIONS (middleware/permissions.js).
router.get(
  "/product-catalog",
  requireAuth,
  requireAnyPermission(INTAKE_PERMISSIONS),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { agent_id: true },
      });
      // Never matches a real agent id — lets the nested `where: { agent_id }`
      // filters below run unconditionally instead of branching the whole
      // query shape on whether this user even has an agent profile.
      const agentId = user?.agent_id ?? "no-agent-profile";

      const classes = await prisma.insuranceClass.findMany({
        where: { status: "ACTIVE" },
        orderBy: { class_name: "asc" },
        select: {
          id: true,
          class_name: true,
          product_variants: {
            where: { status: "ACTIVE" },
            orderBy: { variant_name: "asc" },
            select: {
              id: true,
              variant_code: true,
              variant_name: true,
              // Feeds the policy schedule's Section III Deductible/Authorized
              // Repair Limit line (see pdf/theme.js) — null until an admin
              // sets it via Settings → Vehicle Rates.
              deductible_rate: true,
              // The flat "Miscellaneous" charge every application/quotation
              // filed under this variant carries — read straight off here at
              // creation (routes/policyApplications.js's/policyQuotations.js's
              // POST /), exposed here too just so the intake wizards can
              // preview it before submitting.
              misc_fee: true,
              product_coverages: {
                where: { status: "ACTIVE" },
                orderBy: { coverage_name: "asc" },
                select: {
                  id: true,
                  coverage_code: true,
                  coverage_name: true,
                  maximum_coverage: true,
                  clause: true,
                  pricing_mode: true,
                  // Whether this coverage's premium folds into Miscellaneous
                  // instead of the Premium total — see ProductCoverage.is_misc
                  // and lib/coveragePricing.js's resolveCoverageRows, which is
                  // what actually enforces the split at submission time; this
                  // is exposed here just so the intake wizards can preview it.
                  is_misc: true,
                  // Pricing (standard rate, both tier tables, and this
                  // agent's overrides of each) lives per allowable period,
                  // not flat on the coverage — a coverage can charge
                  // differently for its 180-day period than its 365-day one.
                  allowable_periods: {
                    orderBy: { coverage_in_days: "asc" },
                    select: {
                      coverage_in_days: true,
                      percentage_pricing: { select: { standard_rate: true } },
                      value_percentage_tiers: { orderBy: { min_value: "asc" } },
                      tier_based_prices: { orderBy: { coverage_amount: "asc" } },
                      agent_netrates: {
                        where: { agent_id: agentId },
                        select: { netrate: true, maximum_coverage: true },
                      },
                      agent_value_percentage_tiers: {
                        where: { agent_id: agentId },
                        orderBy: { min_value: "asc" },
                      },
                      agent_flat_tier_prices: {
                        where: { agent_id: agentId },
                        orderBy: { coverage_amount: "asc" },
                      },
                      seats_based_pricing: { select: { threshold_seats: true } },
                      agent_seats_based_pricing: {
                        where: { agent_id: agentId },
                        select: { threshold_seats: true },
                      },
                      seats_tier_prices: { orderBy: { insured_amount_per_occupant: "asc" } },
                      agent_seats_tier_prices: {
                        where: { agent_id: agentId },
                        orderBy: { insured_amount_per_occupant: "asc" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Every agent gets every coverage — an agent-specific override (if one
      // exists) replaces the product's own standard rate/cap for that same
      // period, it doesn't gate access.
      const withRates = classes.map((cls) => ({
        ...cls,
        product_variants: cls.product_variants.map((variant) => ({
          ...variant,
          product_coverages: variant.product_coverages.map((cov) => {
            const { allowable_periods, ...coverageFields } = cov;
            return {
              ...coverageFields,
              allowable_periods: allowable_periods.map((p) => {
                const override = p.agent_netrates[0];
                const valueTierOverride = p.agent_value_percentage_tiers;
                const flatTierOverride = p.agent_flat_tier_prices;
                const value_percentage_tiers = valueTierOverride.length > 0 ? valueTierOverride : p.value_percentage_tiers;
                const tier_based_prices = flatTierOverride.length > 0 ? flatTierOverride : p.tier_based_prices;
                // An agent's own seats-based override (if set) fully replaces
                // the coverage's own default threshold/tier menu for this
                // period — same "override wins outright" rule as every other
                // mode, just split across two independent tables (a scalar
                // threshold, and a tier list) the way VALUE_PERCENTAGE/
                // FLAT_TIER never needed to.
                const seatsPricing = p.agent_seats_based_pricing[0] || p.seats_based_pricing || null;
                const seatTierOverride = p.agent_seats_tier_prices;
                const seats_tier_prices = seatTierOverride.length > 0 ? seatTierOverride : p.seats_tier_prices;
                // A CoverageAllowablePeriod can exist (created via "add
                // allowable period") before anyone has actually set a price
                // for it via Settings → Coverage Pricing — rate/tiers used to
                // silently fall back to 0/empty in that case, which let the
                // wizard forms treat an unpriced coverage as a real ₱0.00
                // rate instead of flagging it as not yet configured. has_pricing
                // tells the client (and is re-checked authoritatively by
                // resolveCoverageRows/the createSchema on submit) whether
                // there's actually something to price this coverage with,
                // per whichever mode it uses.
                const has_pricing =
                  cov.pricing_mode === "PERCENTAGE"
                    ? Boolean(override) || Boolean(p.percentage_pricing)
                    : cov.pricing_mode === "VALUE_PERCENTAGE"
                      ? value_percentage_tiers.length > 0
                      : cov.pricing_mode === "VEHICLE_SEATS_BASED"
                        ? Boolean(seatsPricing) && seats_tier_prices.length > 0
                        : tier_based_prices.length > 0;
                return {
                  coverage_in_days: p.coverage_in_days,
                  // Only meaningful for PERCENTAGE-mode coverages — a
                  // VALUE_PERCENTAGE/FLAT_TIER one has no percentage_pricing
                  // row at all, so this is null (unused either way). Left
                  // null rather than defaulted to 0 when unconfigured, so it
                  // can never be mistaken for a real (if low) rate.
                  rate: override ? override.netrate : (p.percentage_pricing?.standard_rate ?? null),
                  effective_maximum_coverage:
                    override && override.maximum_coverage !== null ? override.maximum_coverage : cov.maximum_coverage,
                  is_custom_rate: Boolean(override),
                  // An agent's own tier table (if set) replaces the coverage's
                  // default tiers for this period entirely — the client never
                  // needs to know whether a tier came from the coverage or an
                  // agent override, it just prices off whatever's here.
                  value_percentage_tiers,
                  tier_based_prices,
                  has_custom_tiers: valueTierOverride.length > 0 || flatTierOverride.length > 0,
                  // Only meaningful for VEHICLE_SEATS_BASED coverages — null
                  // (rather than 0) whenever nothing's configured yet, same
                  // reasoning as `rate` above. seats_tier_prices is the
                  // "Insured amount for each occupant" dropdown's own options
                  // (each { insured_amount_per_occupant, rate_per_excess_seat }).
                  seats_threshold: seatsPricing ? seatsPricing.threshold_seats : null,
                  seats_tier_prices,
                  has_pricing,
                };
              }),
            };
          }),
        })),
      }));

      res.json(withRates);
    } catch (err) {
      next(err);
    }
  }
);

// Nested class -> variant -> coverage tree for Settings -> Manage Products
// (create/delete each tier). Simpler than GET /product-catalog above (no
// agent-specific pricing overlay) and gated on its own
// MANAGE_SETTINGS.MANAGE_PRODUCTS permission rather than the intake
// permissions that endpoint needs — an admin managing the catalog's shape may
// hold neither CREATE_APPLICATION nor QUOTATION_TRACKER.*.
router.get(
  "/insurance-classes",
  requireAuth,
  requirePermission("MANAGE_SETTINGS.MANAGE_PRODUCTS"),
  async (req, res, next) => {
    try {
      const classes = await prisma.insuranceClass.findMany({
        where: { status: "ACTIVE" },
        orderBy: { class_name: "asc" },
        select: {
          id: true,
          class_name: true,
          description: true,
          product_variants: {
            where: { status: "ACTIVE" },
            orderBy: { variant_name: "asc" },
            select: {
              id: true,
              variant_code: true,
              variant_name: true,
              description: true,
              deductible_rate: true,
              misc_fee: true,
              product_coverages: {
                where: { status: "ACTIVE" },
                orderBy: { coverage_name: "asc" },
                select: {
                  id: true,
                  coverage_code: true,
                  coverage_name: true,
                  maximum_coverage: true,
                  clause: true,
                  pricing_mode: true,
                  is_misc: true,
                  // The set of periods this coverage is offered at — the
                  // embedded pricing editor picks one before showing/editing
                  // its rate/tiers, same as Manage Coverage Pricing's own.
                  allowable_periods: {
                    select: { id: true, coverage_in_days: true },
                    orderBy: { coverage_in_days: "asc" },
                  },
                },
              },
            },
          },
        },
      });
      res.json(classes);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/insurance-classes",
  requireAuth,
  requirePermission("MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_CLASS"),
  validateBody(createInsuranceClassSchema),
  async (req, res, next) => {
    try {
      const { class_name, description } = req.body;

      const existing = await prisma.insuranceClass.findUnique({ where: { class_name } });
      if (existing) {
        return res.status(409).json({ error: "An insurance class with this name already exists" });
      }

      const created = await prisma.insuranceClass.create({
        data: { class_name, description, status: "ACTIVE" },
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  }
);

// Settings → Manage Products' "Edit" action on a class row — renaming/
// re-describing, not adding/removing, so gated on EDIT_DETAILS rather than
// ADD_CLASS.
router.patch(
  "/insurance-classes/:id",
  requireAuth,
  requirePermission("MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_DETAILS"),
  validateParams(insuranceClassIdParamSchema),
  validateBody(updateInsuranceClassSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { class_name, description } = req.body;

      const insuranceClass = await prisma.insuranceClass.findUnique({ where: { id } });
      if (!insuranceClass) {
        return res.status(404).json({ error: "Insurance class not found" });
      }

      if (class_name !== undefined && class_name !== insuranceClass.class_name) {
        const existing = await prisma.insuranceClass.findUnique({ where: { class_name } });
        if (existing) {
          return res.status(409).json({ error: "An insurance class with this name already exists" });
        }
      }

      const updated = await prisma.insuranceClass.update({
        where: { id },
        data: { class_name, description },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// Flat list of every active coverage, for the Settings pages that edit clause
// text or the standard rate/max directly on the product (not per-agent).
router.get("/coverages", requireAuth, async (req, res, next) => {
  try {
    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (
      !actingPermissions.has("MANAGE_SETTINGS.EDIT_CLAUSES") &&
      !actingPermissions.has("MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING")
    ) {
      return res.status(403).json({
        error:
          "Missing required permission: MANAGE_SETTINGS.EDIT_CLAUSES or MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING",
      });
    }

    const coverages = await prisma.productCoverage.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ product_variant: { variant_name: "asc" } }, { coverage_name: "asc" }],
      select: {
        id: true,
        coverage_code: true,
        coverage_name: true,
        maximum_coverage: true,
        clause: true,
        pricing_mode: true,
        is_misc: true,
        product_variant: {
          select: { variant_name: true, insurance_class: { select: { class_name: true } } },
        },
        // The set of periods this coverage is offered at — the Manage
        // Coverage Pricing page picks one before showing/editing its
        // rate/tiers, since those are scoped per period now.
        allowable_periods: {
          select: { id: true, coverage_in_days: true },
          orderBy: { coverage_in_days: "asc" },
        },
      },
    });

    res.json(
      coverages.map((c) => ({
        id: c.id,
        coverage_code: c.coverage_code,
        coverage_name: c.coverage_name,
        class_name: c.product_variant.insurance_class.class_name,
        variant_name: c.product_variant.variant_name,
        maximum_coverage: c.maximum_coverage,
        clause: c.clause,
        pricing_mode: c.pricing_mode,
        is_misc: c.is_misc,
        allowable_periods: c.allowable_periods,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.patch("/coverages/:id", requireAuth, validateBody(updateCoverageSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { coverage_code, coverage_name, clause, maximum_coverage, is_misc } = req.body;

    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (clause !== undefined && !ensurePermission(res, actingPermissions, "MANAGE_SETTINGS.EDIT_CLAUSES")) return;
    if (
      maximum_coverage !== undefined &&
      !ensureAnyPermission(res, actingPermissions, [
        "MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING",
        "MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_PRICING",
      ])
    ) {
      return;
    }
    if (
      (coverage_code !== undefined || coverage_name !== undefined || is_misc !== undefined) &&
      !ensurePermission(res, actingPermissions, "MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_DETAILS")
    ) {
      return;
    }

    const coverage = await prisma.productCoverage.findUnique({ where: { id } });
    if (!coverage) {
      return res.status(404).json({ error: "Coverage not found" });
    }

    if (coverage_code !== undefined && coverage_code !== coverage.coverage_code) {
      const existing = await prisma.productCoverage.findUnique({ where: { coverage_code } });
      if (existing) {
        return res.status(409).json({ error: "A coverage with this code already exists" });
      }
    }

    const updated = await prisma.productCoverage.update({
      where: { id },
      data: { coverage_code, coverage_name, clause, maximum_coverage, is_misc },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Settings → Manage Products' "Add Coverage" action — creates just the
// catalog row; allowable periods and their rate/tier tables are configured
// afterward via Settings → Manage Coverage Pricing, same as any other coverage.
router.post(
  "/product-coverages",
  requireAuth,
  requirePermission("MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_COVERAGE"),
  validateBody(createProductCoverageSchema),
  async (req, res, next) => {
    try {
      const { product_variant_id, coverage_code, coverage_name, maximum_coverage, clause, pricing_mode, is_misc } = req.body;

      const variant = await prisma.productVariant.findUnique({ where: { id: product_variant_id } });
      if (!variant || variant.status !== "ACTIVE") {
        return res.status(400).json({ error: "product_variant_id must reference an active product variant" });
      }

      const existing = await prisma.productCoverage.findUnique({ where: { coverage_code } });
      if (existing) {
        return res.status(409).json({ error: "A coverage with this code already exists" });
      }

      const created = await prisma.productCoverage.create({
        data: {
          product_variant_id,
          coverage_code,
          coverage_name,
          maximum_coverage,
          clause,
          pricing_mode,
          is_misc,
          status: "ACTIVE",
        },
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  }
);

// Settings → Manage Products' "Add Product Variant" action. deductible_rate/
// misc_fee are both required here (unlike PATCH below, which can clear
// either back to null) — see createProductVariantSchema.
router.post(
  "/product-variants",
  requireAuth,
  requirePermission("MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_VARIANT"),
  validateBody(createProductVariantSchema),
  async (req, res, next) => {
    try {
      const { insurance_class_id, variant_code, variant_name, description, deductible_rate, misc_fee } = req.body;

      const insuranceClass = await prisma.insuranceClass.findUnique({ where: { id: insurance_class_id } });
      if (!insuranceClass || insuranceClass.status !== "ACTIVE") {
        return res.status(400).json({ error: "insurance_class_id must reference an active insurance class" });
      }

      const existing = await prisma.productVariant.findUnique({ where: { variant_code } });
      if (existing) {
        return res.status(409).json({ error: "A product variant with this code already exists" });
      }

      const created = await prisma.productVariant.create({
        data: {
          insurance_class_id,
          variant_code,
          variant_name,
          description,
          deductible_rate,
          misc_fee,
          status: "ACTIVE",
        },
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  }
);

// Field-gated (same pattern as PATCH /coverages/:id above): variant_code/
// variant_name need MANAGE_PRODUCTS.EDIT_DETAILS (renaming/re-coding a
// variant is a product-definition change, separate from pricing); either
// rate needs MANAGE_COVERAGE_PRICING or MANAGE_PRODUCTS.EDIT_PRICING —
// Settings → Vehicle Rates and the embedded Manage Products rate editor both
// write here.
router.patch(
  "/product-variants/:id",
  requireAuth,
  validateParams(productVariantIdParamSchema),
  validateBody(updateProductVariantSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { variant_code, variant_name, deductible_rate, misc_fee } = req.body;

      const actingPermissions = await getUserPermissionCodes(req.user.userId);
      if (
        (deductible_rate !== undefined || misc_fee !== undefined) &&
        !ensureAnyPermission(res, actingPermissions, [
          "MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING",
          "MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_PRICING",
        ])
      ) {
        return;
      }
      if (
        (variant_code !== undefined || variant_name !== undefined) &&
        !ensurePermission(res, actingPermissions, "MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_DETAILS")
      ) {
        return;
      }

      const variant = await prisma.productVariant.findUnique({ where: { id } });
      if (!variant) {
        return res.status(404).json({ error: "Product variant not found" });
      }

      if (variant_code !== undefined && variant_code !== variant.variant_code) {
        const existing = await prisma.productVariant.findUnique({ where: { variant_code } });
        if (existing) {
          return res.status(409).json({ error: "A product variant with this code already exists" });
        }
      }

      const updated = await prisma.productVariant.update({
        where: { id },
        data: { variant_code, variant_name, deductible_rate, misc_fee },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// Settings → Manage Products' "Save" action on staged/pending deletions —
// every tier (class/variant/coverage) and allowable periods are removed
// together in one request/transaction, whatever the mix, rather than one
// request per item: the page lets an admin mark several rows across several
// tiers for deletion before committing anything, so this is what actually
// makes that "final" and batched, as opposed to each row's own delete icon
// firing immediately. Field-gated per array, same idiom as the field-gated
// PATCH routes above — only the arrays that are non-empty need their
// matching permission; a caller who only marked coverages for deletion never
// needs ADD_CLASS/ADD_VARIANT, for instance.
router.patch("/manage-products/batch-delete", requireAuth, validateBody(batchDeleteSchema), async (req, res, next) => {
  try {
    const { class_ids, variant_ids, coverage_ids, period_ids } = req.body;
    if (class_ids.length + variant_ids.length + coverage_ids.length + period_ids.length === 0) {
      return res.status(400).json({ error: "Nothing to delete" });
    }

    const actingPermissions = await getUserPermissionCodes(req.user.userId);
    if (class_ids.length > 0 && !ensurePermission(res, actingPermissions, "MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_CLASS")) {
      return;
    }
    if (
      variant_ids.length > 0 &&
      !ensurePermission(res, actingPermissions, "MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_VARIANT")
    ) {
      return;
    }
    if (
      coverage_ids.length > 0 &&
      !ensurePermission(res, actingPermissions, "MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_COVERAGE")
    ) {
      return;
    }
    if (
      period_ids.length > 0 &&
      !ensureAnyPermission(res, actingPermissions, [
        "MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING",
        "MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_PRICING",
      ])
    ) {
      return;
    }

    // Cascade: every variant under a to-be-deleted class, and every coverage
    // under a to-be-deleted variant (whether directly requested or
    // cascade-implied from a class), is deactivated too — same cascade the
    // old single-item DELETE routes applied individually, just unioned
    // across however many classes/variants this one batch marks.
    const cascadeVariantIds = class_ids.length
      ? (
          await prisma.productVariant.findMany({
            where: { insurance_class_id: { in: class_ids } },
            select: { id: true },
          })
        ).map((v) => v.id)
      : [];
    const allVariantIds = Array.from(new Set([...variant_ids, ...cascadeVariantIds]));

    const cascadeCoverageIds = allVariantIds.length
      ? (
          await prisma.productCoverage.findMany({
            where: { product_variant_id: { in: allVariantIds } },
            select: { id: true },
          })
        ).map((c) => c.id)
      : [];
    const allCoverageIds = Array.from(new Set([...coverage_ids, ...cascadeCoverageIds]));

    await prisma.$transaction([
      ...(period_ids.length
        ? [
            prisma.coveragePercentageBasedPricing.deleteMany({
              where: { coverage_allowable_period_id: { in: period_ids } },
            }),
            prisma.coverageValuePercentageTier.deleteMany({
              where: { coverage_allowable_period_id: { in: period_ids } },
            }),
            prisma.coverageTierBasedPricing.deleteMany({
              where: { coverage_allowable_period_id: { in: period_ids } },
            }),
            prisma.agentNetrate.deleteMany({ where: { coverage_allowable_period_id: { in: period_ids } } }),
            prisma.agentValuePercentageTier.deleteMany({
              where: { coverage_allowable_period_id: { in: period_ids } },
            }),
            prisma.agentFlatTierPricing.deleteMany({
              where: { coverage_allowable_period_id: { in: period_ids } },
            }),
            prisma.coverageAllowablePeriod.deleteMany({ where: { id: { in: period_ids } } }),
          ]
        : []),
      ...(allCoverageIds.length
        ? [prisma.productCoverage.updateMany({ where: { id: { in: allCoverageIds } }, data: { status: "INACTIVE" } })]
        : []),
      ...(allVariantIds.length
        ? [prisma.productVariant.updateMany({ where: { id: { in: allVariantIds } }, data: { status: "INACTIVE" } })]
        : []),
      ...(class_ids.length
        ? [prisma.insuranceClass.updateMany({ where: { id: { in: class_ids } }, data: { status: "INACTIVE" } })]
        : []),
    ]);

    res.json({
      message: "Deleted",
      deleted_class_ids: class_ids,
      deleted_variant_ids: allVariantIds,
      deleted_coverage_ids: allCoverageIds,
      deleted_period_ids: period_ids,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
