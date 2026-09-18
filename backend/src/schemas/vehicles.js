const { z } = require("zod");
const { requiredString } = require("./common");

const updateVehicleSchema = z.object({
  plate_number: requiredString("plate_number"),
  mv_file_no: requiredString("mv_file_no"),
  // Deliberately optional — same "often illegible/unavailable" reasoning as
  // vehicleInputSchema's own engine_number.
  engine_number: z.string().optional(),
  chassis_number: requiredString("chassis_number"),
  // The one legitimate way to actually change which Motor ProductVariant a
  // vehicle is insured under (see Vehicle.product_variant_id) — the route
  // re-validates it's still a Motor-class variant. Optional: omitted leaves
  // the vehicle's current variant untouched (every other field here is
  // always sent in full regardless), so an edit that isn't about the variant
  // doesn't need to also resend it.
  product_variant_id: z.string().uuid("product_variant_id must be a valid UUID").optional(),
  make: requiredString("make"),
  model: requiredString("model"),
  // The UI sends "" for a blank year field — same "required" message as an
  // omitted one, not a confusing NaN/type error.
  year_model: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number({ error: "year_model is required" }).int()
  ),
  vehicle_type: requiredString("vehicle_type"),
  color: requiredString("color"),
  no_of_seats: z.coerce.number({ error: "no_of_seats is required" }).int().positive("no_of_seats must be a positive whole number"),
  // The UI sends "" for a blank value field — treat that as omitted.
  // initial_assessment_date is deliberately not accepted here — it's only
  // ever finalized once a policy for this vehicle is actually approved (see
  // routes/policyApproval.js's approveApplicationRecord).
  estimated_value: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().nonnegative().optional()),
});

const lookupVehicleQuerySchema = z.object({
  plate_number: requiredString("plate_number"),
});

module.exports = { updateVehicleSchema, lookupVehicleQuerySchema };
