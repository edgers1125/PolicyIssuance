const { z } = require("zod");
const { requiredString } = require("./common");

const createPaymentMethodSchema = z.object({
  name: requiredString("name"),
});

module.exports = { createPaymentMethodSchema };
