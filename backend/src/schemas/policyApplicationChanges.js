const { z } = require("zod");
const { updateAddressSchema } = require("./addresses");

// Mirrors the Prisma ApplicationChangeType enum (enums.prisma) — kept as a
// plain array here (rather than importing the generated Prisma enum) since
// every other schema file in this project defines its own z.enum literally.
const APPLICATION_CHANGE_TYPES = [
  "INSURED_FROM_DATE",
  "INSURED_NAME_DETAILS",
  "INSURED_ADDRESS_DETAILS",
  "VEHICLE_MODEL",
  "VEHICLE_MV_FILE",
  "VEHICLE_PLATE_NO",
  "VEHICLE_TYPE",
  "VEHICLE_MAKE",
  "VEHICLE_COLOR",
  "VEHICLE_ENGINE_NO",
  "VEHICLE_CHASSIS_NO",
  "ADD_CLAUSE",
  "REMOVE_CLAUSE",
];

// Which change types need which reference id — used by both this schema's
// refinement and routes/policyApproval.js's handler.
const VEHICLE_CHANGE_TYPES = new Set([
  "VEHICLE_MODEL",
  "VEHICLE_MV_FILE",
  "VEHICLE_PLATE_NO",
  "VEHICLE_TYPE",
  "VEHICLE_MAKE",
  "VEHICLE_COLOR",
  "VEHICLE_ENGINE_NO",
  "VEHICLE_CHASSIS_NO",
]);
const CLAUSE_CHANGE_TYPES = new Set(["ADD_CLAUSE", "REMOVE_CLAUSE"]);

// change_from is never accepted from the client — the route always computes
// it itself from whatever's currently on file, so the audit trail can't be
// spoofed. new_value's meaning depends on change_type: the new field value
// for VEHICLE_*/INSURED_FROM_DATE/INSURED_NAME_DETAILS (the latter a full
// "Last, First Middle" string the client composes from separate First/
// Middle/Last inputs — see formatInsuredName in routes/policyApplications.js),
// the clause text to append for ADD_CLAUSE, or the exact text to remove for
// REMOVE_CLAUSE (the route 400s if it isn't actually found in the clause).
// INSURED_ADDRESS_DETAILS is the one change type that doesn't use new_value
// at all — an address has too many independently-editable columns (line 1/2,
// barangay, city, province, postal code, country) to cram into one string,
// so it gets its own structured new_address instead, reusing
// updateAddressSchema (schemas/addresses.js — the same shape PATCH
// /addresses/:id already accepts) minus estimated_value, which only applies
// to a Property policy's risk address, never the insured party's own address.
const createApplicationChangeSchema = z
  .object({
    change_type: z.enum(APPLICATION_CHANGE_TYPES, { error: "change_type is invalid" }),
    application_vehicle_id: z.string().uuid("application_vehicle_id must be a valid UUID").optional(),
    application_coverage_id: z.string().uuid("application_coverage_id must be a valid UUID").optional(),
    new_value: z.string().optional(),
    new_address: updateAddressSchema.omit({ estimated_value: true }).optional(),
    effective_date: z.coerce.date({ error: "effective_date must be a valid date" }).optional(),
    remarks: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (VEHICLE_CHANGE_TYPES.has(data.change_type) && !data.application_vehicle_id) {
      ctx.addIssue({
        code: "custom",
        path: ["application_vehicle_id"],
        message: "application_vehicle_id is required for this change type",
      });
    }
    if (CLAUSE_CHANGE_TYPES.has(data.change_type) && !data.application_coverage_id) {
      ctx.addIssue({
        code: "custom",
        path: ["application_coverage_id"],
        message: "application_coverage_id is required for this change type",
      });
    }
    if (data.change_type === "INSURED_ADDRESS_DETAILS") {
      if (!data.new_address) {
        ctx.addIssue({ code: "custom", path: ["new_address"], message: "new_address is required for this change type" });
      }
    } else if (!data.new_value || !data.new_value.trim()) {
      ctx.addIssue({ code: "custom", path: ["new_value"], message: "new_value is required for this change type" });
    }
  });

module.exports = {
  APPLICATION_CHANGE_TYPES,
  VEHICLE_CHANGE_TYPES,
  CLAUSE_CHANGE_TYPES,
  createApplicationChangeSchema,
};
