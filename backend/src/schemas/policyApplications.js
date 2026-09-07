const { z } = require("zod");
const { requiredString } = require("./common");

const PAYMENT_METHODS = ["CASH", "CHECK", "CREDIT_CARD", "BANK_TRANSFER", "ONLINE_PAYMENT"];
const PAYMENT_REMITTANCES = ["DIRECT_TO_BETHEL", "THROUGH_AGENT"];

const addressInputSchema = z.object({
  address_line_1: requiredString("address_line_1"),
  address_line_2: z.string().optional(),
  barangay: z.string().optional(),
  city: requiredString("city"),
  province: requiredString("province"),
  postal_code: z.string().optional(),
  country: z.string().optional(),
  existing_address_id: z.string().nullable().optional(),
});

const vehicleInputSchema = z.object({
  plate_number: requiredString("plate_number"),
  mv_file_no: requiredString("mv_file_no"),
  engine_number: requiredString("engine_number"),
  chassis_number: requiredString("chassis_number"),
  make: z.string().optional(),
  model: z.string().optional(),
  // The UI sends "" for a blank year field — treat that as omitted rather
  // than an invalid number.
  year_model: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().optional()),
  vehicle_type: z.string().optional(),
  color: z.string().optional(),
  // The UI sends "" for a blank value field — treat that as omitted.
  // initial_assessment_date is deliberately not accepted here — it's stamped
  // automatically by the route the first time a value is recorded.
  estimated_value: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().nonnegative().optional()),
  existing_vehicle_id: z.string().nullable().optional(),
  // Set once the agent has confirmed a plate match against a vehicle on file
  // for a different customer/company — tells the route to move ownership to
  // this application's party instead of requiring it to already be theirs.
  reassign_owner: z.boolean().optional(),
});

const coverageSelectionSchema = z.object({
  coverage_id: requiredString("coverage_id"),
  coverage_amount: z.coerce.number({ error: "coverage_amount is required" }).nonnegative(),
  premium_amount: z.coerce.number({ error: "premium_amount is required" }).nonnegative(),
  // Indices into the `vehicles` array this coverage applies to — null/omitted
  // means the whole policy (every vehicle on the application); a non-empty
  // array means exactly those vehicles (e.g. [0, 2] for vehicle 1 and 3 of a
  // 3-vehicle fleet). An empty array is rejected — a specific selection has
  // to name at least one vehicle.
  vehicle_indices: z.array(z.coerce.number().int().nonnegative()).nonempty().nullable().optional(),
});

// Whether each class needs a vehicle, a risk address, etc. depends on a DB
// lookup (the product variant's insurance class) that a static schema can't
// perform — that part of the requirement stays as a business-logic check in
// the route. This schema only pins down the *shape* of whatever was sent.
const createApplicationSchema = z
  .object({
    insured_type: z.enum(["INDIVIDUAL", "CORPORATE"]),
    customer_id: z.string().optional(),
    company_id: z.string().optional(),
    product_variant_id: requiredString("product_variant_id"),
    coverage_start_at: z.coerce.date({ error: "coverage_start_at is required and must be a valid date" }),
    coverage_end_at: z.coerce.date({ error: "coverage_end_at is required and must be a valid date" }),
    coverages: z.array(coverageSelectionSchema).min(1, "At least one coverage must be selected"),
    vehicles: z.array(vehicleInputSchema).optional(),
    risk_address: addressInputSchema.optional(),
    insured_address: addressInputSchema.optional(),
    remarks: z.string().optional(),
    misc: z.coerce.number().optional(),
    send_policy_to_email: z.boolean().optional(),
    payment_method: z.enum(PAYMENT_METHODS),
    payment_remittance: z.enum(PAYMENT_REMITTANCES),
    bethel_payment_method_id: z.string().optional(),
  })
  .refine((data) => data.insured_type !== "INDIVIDUAL" || Boolean(data.customer_id), {
    message: "customer_id is required for an individual application",
    path: ["customer_id"],
  })
  .refine((data) => data.insured_type !== "CORPORATE" || Boolean(data.company_id), {
    message: "company_id is required for a corporate application",
    path: ["company_id"],
  })
  .refine((data) => data.coverage_end_at > data.coverage_start_at, {
    message: "coverage_end_at must be after coverage_start_at",
    path: ["coverage_end_at"],
  })
  .refine((data) => data.payment_remittance !== "DIRECT_TO_BETHEL" || Boolean(data.bethel_payment_method_id), {
    message: "bethel_payment_method_id is required when payment goes directly to Bethel",
    path: ["bethel_payment_method_id"],
  });

module.exports = { createApplicationSchema };
