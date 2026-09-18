const path = require("path");

// Shared plumbing for every PDFKit document builder in this folder — fonts,
// colors, and low-level drawing helpers. Each *Pdf.js file (quotationPdf.js,
// policyApplicationPdf.js, ...) owns its own full page layout so one document
// type can be edited without any risk of changing another's — this file only
// holds the pieces that are genuinely identical across all of them (the
// Bethel letterhead, the signature block, currency formatting).

const LOGO_PATH = path.join(__dirname, "assets/bethel-logo.png");
// Never served over HTTP — index.js registers no express.static anywhere
// under src/, so this file is reachable only by this process's own
// filesystem reads (here and in drawSignatureBlock below), never by a public
// URL. Keep it that way: do not add a static mount for src/pdf/assets.
const MANAGER_SIGNATURE_PATH = path.join(__dirname, "assets/manager_signature.png");
const BRANCH_HEAD_NAME = "JOHN CALVIN NAVARRO";

// Body text uses PDFKit's standard-14 Times-Roman/Times-Bold — real AFM
// fonts with PDFKit's own well-tested kerning table — NOT the embedded
// DejaVu Serif TTF used below for currency. An earlier version of this file
// unified everything onto DejaVu Serif to fix a *different* problem (price
// text visually mismatching the surrounding body font); that traded one
// visible defect for a much worse one: DejaVu Serif's embedded kerning data
// (applied by fontkit's glyph-layout engine regardless of the `features`
// option passed to `.text()` — confirmed by testing `{features: []}`, a full
// feature opt-out, which changed nothing) produces wildly oversized position
// adjustments for ordinary letter pairs in body-length text (e.g. "PARTY"
// rendering with visible gaps inside the word, confirmed by inspecting the
// PDF's own decompressed content stream: TJ adjustments of 100-175 units,
// versus Times-Bold's normal 30-75-unit kerning for the same text) — visible
// specifically in pdf.js's in-app canvas preview (components/PdfViewer.jsx),
// not in every PDF reader, which is why it looked fine when re-checked in a
// native viewer but "bad" in the app's own inline preview. Short numeric/
// currency strings (digits, peso sign, comma, period) never trigger this —
// tested and confirmed clean — so DejaVu Serif stays scoped to currency only,
// same as before that unification attempt.
const FONTS_DIR = path.join(__dirname, "assets/fonts");
const FONT_BODY = "Times-Roman";
const FONT_BODY_BOLD = "Times-Bold";
const FONT_WATERMARK = "Helvetica-Bold";
// A compact, professional body size for a dense legal/insurance form — most
// printed policy schedules run 9-10pt body text, not a web page's 12px.
const BASE_FONT_SIZE = 9.5;

// WinAnsi-encoded Times-Roman/Times-Bold have no glyph for the Philippine
// Peso sign (₱) — it silently prints as "±" — so currency amounts alone are
// drawn in this bundled DejaVu Serif instead (confirmed safe for
// digit/symbol strings — see the font-choice note above). The whole
// "₱1,234.56" run is always drawn in one font (never split glyph-by-glyph
// with Times-Roman) so its baseline stays self-consistent.
const FONT_PESO = path.join(FONTS_DIR, "DejaVuSerif.ttf");
const FONT_PESO_BOLD = path.join(FONTS_DIR, "DejaVuSerif-Bold.ttf");
// DejaVu Serif's glyphs render visibly larger than Times-Roman/Times-Bold's
// at the same nominal point size — this corrects a peso amount's fontSize
// down so it sits flush with the Times-set label text around/beside it.
const PESO_FONT_SIZE_SCALE = 0.87;

function registerFonts(doc) {
  doc.registerFont("Peso", FONT_PESO);
  doc.registerFont("Peso-Bold", FONT_PESO_BOLD);
}

function formatMoney(amount) {
  return Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDateTime(value) {
  if (!value) return { date: "", time: "" };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }),
    time: d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
  };
}

// Right-aligns a peso amount within [x, x+width] — the whole "₱1,234.56"
// string is drawn in the (size-corrected) Peso font, then restores the body
// font/base size. Every call site sets BASE_FONT_SIZE immediately before
// drawing currency (there's no larger/smaller-than-base amount anywhere in
// these documents), so this restores to that fixed size rather than trying
// to introspect PDFKit's current size (not part of its public API).
function drawCurrency(doc, amount, x, y, width, { bold = false } = {}) {
  const restoreFont = bold ? FONT_BODY_BOLD : FONT_BODY;
  const pesoFont = bold ? "Peso-Bold" : "Peso";
  const text = `₱${formatMoney(amount)}`;

  doc.font(pesoFont).fontSize(BASE_FONT_SIZE * PESO_FONT_SIZE_SCALE).text(text, x, y, { width, align: "right" });
  doc.font(restoreFont).fontSize(BASE_FONT_SIZE);
}

// A peso amount flowing inline with label text on a continued-text run
// (as opposed to drawCurrency's own right-aligned column) — the Section III
// deductible/towing/authorized-repair-limit line is the one place this
// happens. `continued` defaults true (more label text follows on the same
// line); pass false for a trailing amount that ends the line.
function drawCurrencyInline(doc, amount, { bold = false, continued = true } = {}) {
  const restoreFont = bold ? FONT_BODY_BOLD : FONT_BODY;
  const pesoFont = bold ? "Peso-Bold" : "Peso";
  const text = amount !== null && amount !== undefined ? `₱${formatMoney(amount)}` : "—";

  doc.font(pesoFont).fontSize(BASE_FONT_SIZE * PESO_FONT_SIZE_SCALE).text(text, { continued });
  doc.font(restoreFont).fontSize(BASE_FONT_SIZE);
}

// Both watermark layers (the faint logo and, on quotations, the red
// diagonal stamp on top of it) are anchored the same way: translate the
// origin to the exact page-center point once, then draw everything else
// relative to that shared (0,0) — rather than each layer independently
// recomputing width/2, height/2 through its own positioning math (absolute
// image placement vs. a rotate-around-a-separately-named-origin text box).
// One shared anchor guarantees the two layers stack concentrically instead
// of drifting apart under different position types.
function withPageCenterOrigin(doc, draw) {
  const { width, height } = doc.page;
  doc.save();
  doc.translate(width / 2, height / 2);
  draw(width, height);
  doc.restore();
}

// Faint centered logo behind the page content — every document in this
// folder carries it (it's the Bethel letterhead watermark), regardless of
// whether it also gets a diagonal stamp on top.
function drawLogoWatermark(doc) {
  const logoWidth = doc.page.width * 0.6;
  // Scale height from the logo's own aspect ratio rather than reusing
  // logoWidth — the two only look alike because the current asset happens
  // to be near-square; a differently-shaped logo would center off-axis.
  const { width: imgWidth, height: imgHeight } = doc.openImage(LOGO_PATH);
  const logoHeight = logoWidth * (imgHeight / imgWidth);
  withPageCenterOrigin(doc, () => {
    doc.opacity(0.06);
    doc.image(LOGO_PATH, -logoWidth / 2, -logoHeight / 2, { width: logoWidth });
  });
}

// The red diagonal stamp (e.g. "POLICY NOT IN EFFECT / QUOTATION ONLY") —
// only some document types use one, so it's kept separate from the logo.
function drawDiagonalStamp(doc, text) {
  withPageCenterOrigin(doc, (width) => {
    doc.rotate(-38);
    doc.opacity(0.28);
    doc.font(FONT_WATERMARK).fontSize(46).fillColor("#b91c1c");
    // Center the text block itself on the origin — measure its actual
    // rendered height instead of a hardcoded offset, so it stays centered
    // if the stamp text ever gains/loses a line.
    const textOptions = { width, align: "center", lineGap: 4 };
    const textHeight = doc.heightOfString(text, textOptions);
    doc.text(text, -width / 2, -textHeight / 2, textOptions);
  });
  doc.opacity(1).fillColor("#111111");
}

// Vertical layout of the block, as y-offsets from its own anchor — named
// rather than left as magic numbers, since the floating signature (below)
// needs a known-clear gap between the company-name line (ends ~y+14) and the
// printed-name line, and every caller needs the block's total height to
// reserve enough room above the page's bottom margin before drawing it.
const SIG_NAME_Y = 50;
const SIG_RULE_Y = SIG_NAME_Y + 14;
const SIG_BRANCH_HEAD_Y = SIG_RULE_Y + 3;
const SIG_AUTHORIZED_Y = SIG_BRANCH_HEAD_Y + 10;
// Total space a caller should reserve below the block's own y anchor — its
// full content (through "AUTHORIZED SIGNATURE") plus a small bottom buffer.
const SIGNATURE_BLOCK_HEIGHT = SIG_AUTHORIZED_Y + 21;

// Matches SignatureBlock in PolicySchedulePreview.jsx: company/branch-head
// name at body size bold, "BRANCH HEAD"/"AUTHORIZED SIGNATURE" at 10pt.
// `signed: true` (only ever passed for an actually-issued Policy document —
// see pdf/policyPdf.js; a quotation/application is never "duly signed",
// since neither is a final document yet) floats the branch head's scanned
// signature image in the open gap between the company-name line and their
// printed name, the way a wet-ink signature sits above a signature line on
// the physical form — not stamped directly on top of either line's text.
function drawSignatureBlock(doc, x, y, width, { signed = false } = {}) {
  doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).fillColor("#111111");
  doc.text("BETHEL GENERAL INSURANCE AND SURETY CORP.", x, y, { width, align: "center" });
  if (signed) {
    const { width: imgW, height: imgH } = doc.openImage(MANAGER_SIGNATURE_PATH);
    // Sized off a fixed target height (not a fraction of the block's own
    // width, which would let a wide source image balloon tall enough to
    // collide with the lines on either side of it) and capped to the gap's
    // own clear height so it can never overlap them regardless of the
    // source image's own aspect ratio.
    const gapTop = y + 13;
    const gapBottom = y + SIG_NAME_Y - 5;
    const targetHeight = Math.min(32, gapBottom - gapTop);
    const sigImgWidth = Math.min(width * 0.6, targetHeight * (imgW / imgH));
    const sigImgHeight = sigImgWidth * (imgH / imgW);
    const sigCenterY = (gapTop + gapBottom) / 2;
    doc.image(MANAGER_SIGNATURE_PATH, x + (width - sigImgWidth) / 2, sigCenterY - sigImgHeight / 2, {
      width: sigImgWidth,
    });
  }
  doc.text(BRANCH_HEAD_NAME, x, y + SIG_NAME_Y, { width, align: "center" });
  doc
    .moveTo(x + width / 4, y + SIG_RULE_Y)
    .lineTo(x + (width * 3) / 4, y + SIG_RULE_Y)
    .strokeColor("#111111")
    .lineWidth(1)
    .stroke();
  doc.font(FONT_BODY).fontSize(8);
  doc.text("BRANCH HEAD", x, y + SIG_BRANCH_HEAD_Y, { width, align: "center" });
  doc.text("AUTHORIZED SIGNATURE", x, y + SIG_AUTHORIZED_Y, { width, align: "center" });
}

// Bold inline label + regular value on one line, e.g. "Quotation No : value"
// — matches the HTML's <strong>label</strong> value pattern.
function labelValue(doc, label, value, x, y, width) {
  doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).text(label, x, y, { continued: true, width });
  doc.font(FONT_BODY).text(` ${value || "—"}`);
}

// Towing is a fixed amount at every stage (quotation, application, and
// issued policy alike) — never a rate, never configurable — per the same
// "Authorized Repair Limit = Deductible + Towing" formula below.
const TOWING_AMOUNT = 500;

// Section III's Deductible/Authorized Repair Limit figures for one
// VALUE_PERCENTAGE coverage row. `amount` is that row's own coverage_amount
// (already the targeted vehicle's current depreciated value — see
// lib/coveragePricing.js's VALUE_PERCENTAGE branch); deductibleRate and
// minimumDeductibleAmount both come from the filed ProductVariant
// (catalog.prisma) — the printed deductible is whichever of the two
// produces the higher figure (a minimum floor under the percentage-computed
// one, e.g. for a cheaply-valued vehicle), never their sum. Authorized
// repair limit is simply that deductible plus the fixed TOWING_AMOUNT —
// there's no separate rate for it any more. Returns null for both figures
// only when NEITHER deductibleRate nor minimumDeductibleAmount is
// configured, rather than silently computing off an assumed-0 rate.
function computeDeductibleFigures(amount, deductibleRate, minimumDeductibleAmount) {
  const hasDeductibleRate = deductibleRate !== null && deductibleRate !== undefined;
  const hasMinimum = minimumDeductibleAmount !== null && minimumDeductibleAmount !== undefined;
  if (!hasDeductibleRate && !hasMinimum) {
    return { deductible: null, authorizedRepairLimit: null };
  }
  const rateComputed = hasDeductibleRate ? Number(amount) * Number(deductibleRate) : 0;
  const minimum = hasMinimum ? Number(minimumDeductibleAmount) : 0;
  const deductible = Math.max(rateComputed, minimum);
  const authorizedRepairLimit = deductible + TOWING_AMOUNT;
  return { deductible, authorizedRepairLimit };
}

module.exports = {
  FONT_BODY,
  FONT_BODY_BOLD,
  FONT_WATERMARK,
  BASE_FONT_SIZE,
  BRANCH_HEAD_NAME,
  registerFonts,
  formatMoney,
  fmtDate,
  fmtDateTime,
  drawCurrency,
  drawCurrencyInline,
  drawLogoWatermark,
  drawDiagonalStamp,
  drawSignatureBlock,
  SIGNATURE_BLOCK_HEIGHT,
  labelValue,
  computeDeductibleFigures,
  TOWING_AMOUNT,
};
