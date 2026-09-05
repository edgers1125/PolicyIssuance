const { z } = require("zod");

// A non-empty string that gives the same clear "X is required" message
// whether the field is missing entirely or sent as an empty string — the
// bare z.string().min(1) combo instead reports a generic type error when
// the field is missing, since the length check never runs on `undefined`.
function requiredString(label) {
  const message = `${label} is required`;
  return z.string({ error: message }).min(1, message);
}

function requiredEmail(label = "email") {
  return requiredString(label).email(`${label} must be a valid email address`);
}

module.exports = { requiredString, requiredEmail };
