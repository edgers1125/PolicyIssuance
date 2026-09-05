// Turns a Zod schema into Express middleware: on success, req.body is replaced
// with the parsed (and coerced/defaulted) value so routes can trust its shape;
// on failure, responds 400 with the first validation issue, matching the
// `{ error: "<message>" }` shape every route in this app already returns.
function formatZodError(error) {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: formatZodError(result.error) });
    }
    req.body = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: formatZodError(result.error) });
    }
    req.query = result.data;
    next();
  };
}

module.exports = { validateBody, validateQuery };
