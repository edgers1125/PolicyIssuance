const { z } = require("zod");
const { requiredString } = require("./common");

const updateAddressSchema = z.object({
  address_line_1: requiredString("address_line_1"),
  address_line_2: z.string().optional(),
  barangay: z.string().optional(),
  city: requiredString("city"),
  province: requiredString("province"),
  postal_code: z.string().optional(),
  country: z.string().optional(),
});

module.exports = { updateAddressSchema };
