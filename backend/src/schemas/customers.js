const { z } = require("zod");
const { requiredString, requiredEmail } = require("./common");

// Used for both create and update — this API has never allowed a partial
// customer edit, every field below is required on both.
const customerInputSchema = z.object({
  first_name: requiredString("first_name"),
  last_name: requiredString("last_name"),
  middle_name: z.string().optional(),
  // The UI sends "" for a blank date picker — treat that the same as omitted
  // rather than rejecting it as an invalid date.
  birthday: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.date({ error: "birthday must be a valid date" }).optional()
  ),
  gender: z.string().optional(),
  email: requiredEmail(),
  mobile_number: z.string().optional(),
});

module.exports = { customerInputSchema };
