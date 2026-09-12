// A thrown error that already knows the HTTP status/body it should produce —
// lets a shared helper (e.g. coveragePricing.js) signal a client error from
// deep inside a loop without threading `res` through every function, while
// every route's existing catch-and-call-next(err) still works unchanged for
// anything else that throws.
class HttpError extends Error {
  constructor(status, body) {
    super(typeof body === "string" ? body : body.error);
    this.status = status;
    this.body = typeof body === "string" ? { error: body } : body;
  }
}

// Route handlers already do `catch (err) { next(err); }` — this is the one
// line they add to also honor an HttpError's intended status/body first.
function sendIfHttpError(err, res) {
  if (err instanceof HttpError) {
    res.status(err.status).json(err.body);
    return true;
  }
  return false;
}

module.exports = { HttpError, sendIfHttpError };
