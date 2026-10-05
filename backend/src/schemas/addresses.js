const { z } = require("zod");
const { requiredString } = require("./common");

const updateAddressSchema = z.object({
  address_line_1: requiredString("address_line_1"),
  address_line_2: z.string().optional(),
  barangay: requiredString("barangay"),
  city: requiredString("city"),
  province: requiredString("province"),
  postal_code: requiredString("postal_code"),
  country: z.string().optional(),
  // Only meaningful for a risk address on a Property policy — see
  // Address.estimated_value. The UI sends "" for a blank value field.
  estimated_value: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().nonnegative().optional()),
});

// PATCH /:id — rejects a malformed id with a 400 before it reaches Prisma.
const addressIdParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

module.exports = { updateAddressSchema, addressIdParamSchema };
