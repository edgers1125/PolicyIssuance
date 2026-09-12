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

module.exports = {
  addressInputSchema,
  vehicleInputSchema,
  coverageSelectionSchema,
  refineWholeDayPeriod,
  wholeDayPeriodRefinement,
  refineExactlyOneParty,
  exactlyOnePartyRefinement,
};
