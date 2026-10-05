// Fail-fast env lookup, same contract as utils/jwt.js's own JWT_SECRET check:
// a missing required variable throws at module load (i.e. at server boot)
// instead of silently becoming `undefined` somewhere downstream — e.g. an
// invite/reset email link reading "undefined/set-password?token=..." while
// the request itself still returns 200.
function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is not set in the environment`);
  }
  return value.trim();
}

// FRONTEND_URL is only ever used to build links that get emailed out, so it
// must be an absolute http(s) URL; trailing slashes are stripped so callers
// can always append "/set-password?..." without producing "//".
function requireUrlEnv(name) {
  const value = requireEnv(name);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL (got "${value}")`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must be an http(s) URL (got "${value}")`);
  }
  return value.replace(/\/+$/, "");
}

module.exports = { requireEnv, requireUrlEnv };
