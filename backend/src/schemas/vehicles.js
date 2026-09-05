const { z } = require("zod");
const { requiredString } = require("./common");

const updateVehicleSchema = z.object({
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
});

const lookupVehicleQuerySchema = z.object({
  plate_number: requiredString("plate_number"),
});

module.exports = { updateVehicleSchema, lookupVehicleQuerySchema };
