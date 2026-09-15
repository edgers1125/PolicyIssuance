const nodemailer = require("nodemailer");
const { HttpError } = require("./httpError");

// Built lazily (and cached) instead of at module load, so a server without
// SMTP configured can still boot — it only fails the specific request that
// needed to send mail, not the whole process.
let transporter;

function getTransporter() {
  if (transporter !== undefined) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Without this, nodemailer can't determine a real hostname inside a
    // Docker container's network namespace and falls back to identifying
    // itself to the server as "EHLO [127.0.0.1]" — a loopback address no
    // legitimate mail client would ever claim to be. Receiving servers treat
    // that as a strong spam signal: the message gets accepted by the relay
    // (250 OK) but silently never delivered, with no bounce. Using the
    // sending domain here is what a normal, non-containerized mail client
    // would present.
    name: (SMTP_FROM || SMTP_USER).split("@")[1] || undefined,
  });
  return transporter;
}

async function sendMail({ to, subject, html, text, attachments }) {
  const t = getTransporter();
  if (!t) {
    throw new HttpError(503, "Email sending isn't configured on this server (missing SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS)");
  }
  // A pure-HTML, single-part message (no text/plain alternative) is a real
  // spam-filter signal on its own — always send multipart/alternative.
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
    attachments,
  });
  // The SMTP server accepting the message (a resolved promise) only means it
  // queued it — logging the actual response line is the only visibility we
  // have into what really happened without access to the mail server itself.
  console.log(`[mailer] sent to=${to} messageId=${info.messageId} accepted=${JSON.stringify(info.accepted)} rejected=${JSON.stringify(info.rejected)} response=${info.response}`);
}

module.exports = { sendMail };
