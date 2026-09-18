const { z } = require("zod");
const { requiredString } = require("./common");

// Shared by both the policy application and policy quotation intake schemas
// — a quotation collects exactly the same customer/vehicle/coverage inputs
// an application does, it just never carries payment information.

const addressInputSchema = z.object({
  address_line_1: requiredString("address_line_1"),
  address_line_2: z.string().optional(),
  barangay: z.string().optional(),
  city: requiredString("city"),
  province: requiredString("province"),
  postal_code: z.string().optional(),
  country: z.string().optional(),
  existing_address_id: z.string().nullable().optional(),
  // Only meaningful for a risk address on a Property application/quotation —
  // VALUE_PERCENTAGE coverage pricing for Property prices off this. The UI
  // sends "" for a blank value field — treat that as omitted, same as
  // vehicleInputSchema's estimated_value.
  estimated_value: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().nonnegative().optional()),
});

const vehicleInputSchema = z.object({
  plate_number: requiredString("plate_number"),
  mv_file_no: requiredString("mv_file_no"),
  // The one vehicle identifier deliberately left optional — a real-world
  // engine number (this schedule's own "Authentication No." — see
  // "Scheduled Vehicle table" under PDF generation) is often illegible or
  // simply unavailable off a Philippine OR/CR, unlike every other vehicle
  // field below, which are all now required.
  engine_number: z.string().optional(),
  chassis_number: requiredString("chassis_number"),
  // The Motor ProductVariant this vehicle is (or, for a brand-new one, is
  // about to be) insured under — see Vehicle.product_variant_id. Always sent
  // in full, same "reused rows carry their real values too" convention as
  // plate_number above: for an existing vehicle the route only ever reads
  // this off the DB row itself (never trusts a client-sent change here — see
  // PATCH /vehicles/:id for the one legitimate way to actually change it),
  // for a brand-new one it's what gets written. Every vehicle on one
  // application/quotation must resolve to the same variant as the filing's
  // own product_variant_id — checked by the route, since it needs a DB
  // lookup a schema can't do.
  product_variant_id: z.string().uuid("product_variant_id must be a valid UUID"),
  make: requiredString("make"),
  model: requiredString("model"),
  // The UI sends "" for a blank year field — treated the same way an empty
  // string is everywhere else (never a valid value to coerce), so it fails
  // the same "required" message rather than a confusing NaN/type error.
  year_model: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number({ error: "year_model is required" }).int()
  ),
  vehicle_type: requiredString("vehicle_type"),
  color: requiredString("color"),
  // Required — feeds the policy schedule's "1 DRIVER AND N OCCUPANTS OR
  // PASSENGERS" endorsement line (N = no_of_seats - 1).
  no_of_seats: z.coerce.number({ error: "no_of_seats is required" }).int().positive("no_of_seats must be a positive whole number"),
  // The UI sends "" for a blank value field — treat that as omitted.
  // initial_assessment_date is deliberately not accepted here — it's only
  // ever finalized once a policy for this vehicle is actually approved (see
  // routes/policyApproval.js's approveApplicationRecord), never at intake.
  estimated_value: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().nonnegative().optional()),
  existing_vehicle_id: z.string().nullable().optional(),
  // Set once the agent has confirmed a plate match against a vehicle on file
  // for a different customer/company — tells the route to move ownership to
  // this application's party instead of requiring it to already be theirs.
  reassign_owner: z.boolean().optional(),
});

const coverageSelectionSchema = z.object({
  coverage_id: requiredString("coverage_id"),
  // .positive() (not .nonnegative()) is deliberate: a selected coverage with
  // a 0 coverage_amount/premium_amount isn't a real selection, it's an
  // unfilled-in one — and 0 is exactly what an empty form field coerces to
  // (Number("") === 0), so .nonnegative() let a coverage the agent never
  // actually priced sail through as if it were a valid ₱0.00 selection.
  // This is on top of, not instead of, resolveCoverageRows's own DB-backed
  // pricing checks (see lib/coveragePricing.js) — this only catches the
  // shape-level "was anything entered at all" case.
  coverage_amount: z.coerce.number({ error: "coverage_amount is required" }).positive("coverage_amount must be greater than 0"),
  premium_amount: z.coerce.number({ error: "premium_amount is required" }).positive("premium_amount must be greater than 0"),
  // Indices into the `vehicles` array this coverage applies to — null/omitted
  // means the whole policy/quotation (every vehicle); a non-empty array
  // means exactly those vehicles (e.g. [0, 2] for vehicle 1 and 3 of a
  // 3-vehicle fleet). An empty array is rejected — a specific selection has
  // to name at least one vehicle.
  vehicle_indices: z.array(z.coerce.number().int().nonnegative()).nonempty().nullable().optional(),
});

// coverage_end_at is never entered directly — the client derives it from
// coverage_start_at plus whichever allowable period (in whole days) the
// agent picked. Which day counts are actually valid for the coverages
// selected is a DB-dependent check the route enforces separately; this just
// rejects a value that couldn't possibly be start-plus-N-whole-days.
function refineWholeDayPeriod(data) {
  const diffMs = data.coverage_end_at.getTime() - data.coverage_start_at.getTime();
  return diffMs > 0 && diffMs % (24 * 60 * 60 * 1000) === 0;
}
const wholeDayPeriodRefinement = {
  message: "coverage_end_at must be a whole number of days after coverage_start_at",
  path: ["coverage_end_at"],
};

// Exactly one of customer_id/company_id — never both, never neither. Which
// one is set is what determines insured_type server-side.
function refineExactlyOneParty(data) {
  return Boolean(data.customer_id) !== Boolean(data.company_id);
}
const exactlyOnePartyRefinement = {
  message: "Provide exactly one of customer_id or company_id",
  path: ["customer_id"],
};

// Shared by createApplicationSchema (filing a fresh application) and
// submitQuotationSchema (converting an existing quotation into one) — a
// quotation never collects payment info itself, so submitting one still has
// to ask for it, the same shape a from-scratch application does.
const PAYMENT_METHODS = ["CASH", "CHECK", "CREDIT_CARD", "BANK_TRANSFER", "ONLINE_PAYMENT"];
const PAYMENT_REMITTANCES = ["DIRECT_TO_BETHEL", "THROUGH_AGENT"];

const paymentFieldsSchema = z.object({
  payment_method: z.enum(PAYMENT_METHODS, { error: "payment_method is required" }),
  payment_remittance: z.enum(PAYMENT_REMITTANCES, { error: "payment_remittance is required" }),
  bethel_payment_method_id: z.string().optional(),
});

function refineBethelPaymentMethod(data) {
  return data.payment_remittance !== "DIRECT_TO_BETHEL" || Boolean(data.bethel_payment_method_id);
}
const bethelPaymentMethodRefinement = {
  message: "bethel_payment_method_id is required when payment goes directly to Bethel",
  path: ["bethel_payment_method_id"],
};

// Shared by createApplicationSchema and createQuotationSchema — the
// "Solve from Gross Total" pricing mode (see lib/coveragePricing.js's
// resolveCoverageRows). "PER_COVERAGE" (the default) is every coverage's
// premium_amount taken exactly as entered, same as before this mode
// existed. "TARGET_GROSS" instead requires target_gross_amount and solves
// the product variant's own configured Gross Target Coverage's premium
// backward from it (400s server-side if that variant has none configured,
// or if that coverage isn't among the ones selected) — every other selected
// coverage's premium_amount is still taken as entered.
const PRICING_INPUT_MODES = ["PER_COVERAGE", "TARGET_GROSS"];
const pricingModeFieldsSchema = z.object({
  pricing_input_mode: z.enum(PRICING_INPUT_MODES).optional().default("PER_COVERAGE"),
  target_gross_amount: z.coerce.number().positive("target_gross_amount must be greater than 0").optional(),
});
function refineTargetGrossAmount(data) {
  return data.pricing_input_mode !== "TARGET_GROSS" || typeof data.target_gross_amount === "number";
}
const targetGrossAmountRefinement = {
  message: "target_gross_amount is required when pricing_input_mode is TARGET_GROSS",
  path: ["target_gross_amount"],
};

// Shared by both /policy-quotations/preview-pdf and
// /policy-applications/preview-pdf — the exact prop shape
// frontend/src/components/PolicySchedulePreview.jsx already takes (isPreview
// is only meaningful to the application side; the quotation route ignores
// it, since a quotation always carries its watermark regardless). This is a
// read-only, non-persisted render — nothing here is written to the
// database — so it stays permissive rather than mirroring
// createApplicationSchema/createQuotationSchema's strictness, and tolerates
// the extra fields (existing_vehicle_id, estimated_value, ...) the
// frontend's live form state still carries on each vehicle.
const previewVehicleSchema = z
  .object({
    plate_number: z.string().optional(),
    mv_file_no: z.string().optional(),
    engine_number: z.string().optional(),
    chassis_number: z.string().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    year_model: z.union([z.string(), z.number()]).optional(),
    vehicle_type: z.string().optional(),
    color: z.string().optional(),
    no_of_seats: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const previewCoverageSchema = z.object({
  name: z.string().optional(),
  clause: z.string().optional(),
  amount: z.coerce.number().optional().default(0),
  premium: z.coerce.number().optional().default(0),
  // Drives the Section III (vehicle-value) vs. Section IVA/IVB/PA/AOG &
  // Others split on the rendered document — see pdf/theme.js.
  pricing_mode: z.string().optional(),
});

const documentPreviewPropsSchema = z.object({
  applicationNumber: z.string().optional(),
  isPreview: z.boolean().optional(),
  classNameLabel: z.string().optional(),
  variantName: z.string().optional(),
  insuredName: z.string().optional(),
  insuredAddress: z.string().optional(),
  agentCode: z.string().optional(),
  coverageStartAt: z.coerce.date().optional(),
  coverageEndAt: z.coerce.date().optional(),
  vehicles: z.array(previewVehicleSchema).optional().default([]),
  coverages: z.array(previewCoverageSchema).optional().default([]),
  // The filed product variant's own rate (see catalog.prisma's
  // ProductVariant.deductible_rate) — used to compute the Section III
  // Deductible/Authorized Repair Limit line (the repair limit itself is just
  // that deductible plus a fixed towing amount — see pdf/theme.js's
  // TOWING_AMOUNT). Omitted/undefined whenever the variant hasn't configured one.
  deductibleRate: z.coerce.number().nonnegative().optional(),
  // A floor under deductibleRate's own computed figure — see
  // ProductVariant.minimum_deductible_amount and
  // pdf/theme.js's computeDeductibleFigures(), which takes both and prints
  // whichever produces the higher deductible.
  minimumDeductibleAmount: z.coerce.number().nonnegative().optional(),
  totalPremium: z.coerce.number().optional().default(0),
  docStamps: z.coerce.number().optional().default(0),
  vat: z.coerce.number().optional().default(0),
  lgt: z.coerce.number().optional().default(0),
  misc: z.coerce.number().optional().default(0),
  totalAmount: z.coerce.number().optional().default(0),
  remarks: z.string().optional(),
  // The connected prior policy's own number, when this filing is a renewal/
  // replacement of it — drives the "Renewing/Replacing:" line printed above
  // Period of Insurance (see pdf/quotationPdf.js, pdf/policyApplicationPdf.js,
  // pdf/policyPdf.js). Omitted for a brand-new filing with no such connection.
  renewingPolicyNumber: z.string().optional(),
});

module.exports = {
  addressInputSchema,
  vehicleInputSchema,
  coverageSelectionSchema,
  refineWholeDayPeriod,
  wholeDayPeriodRefinement,
  refineExactlyOneParty,
  exactlyOnePartyRefinement,
  paymentFieldsSchema,
  refineBethelPaymentMethod,
  bethelPaymentMethodRefinement,
  documentPreviewPropsSchema,
  PRICING_INPUT_MODES,
  pricingModeFieldsSchema,
  refineTargetGrossAmount,
  targetGrossAmountRefinement,
};
