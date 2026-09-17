const path = require("path");
const { FONT_BODY, FONT_BODY_BOLD } = require("./theme");

// Single source of truth for the Bethel letterhead — every *Pdf.js builder in
// this folder calls drawLetterhead() once at the very top of its first page,
// so a rebrand or contact-detail change only ever needs one edit here rather
// than three copy-pasted header blocks.
const LOGO_PATH = path.join(__dirname, "assets/bethel-logo.png");

// Matches frontend/src/theme.js's MUI palette (primary.main / secondary.main)
// — the same navy/gold estimated from the Bethel shield logo, kept in sync so
// the printed letterhead and the in-app BrandMark read as the same brand.
const NAVY = "#1E3A6E";
const GOLD = "#B8860B";

const SMALL_PRINT_LINES = [
  'Formerly "Bethel General Insurance and Surety Corporation"',
  "Unit 200 2nd Flr Valero Street Salcedo Village Makati City 1227",
  "Marketing: (0929)313 0246 | Claims (0948) 935 9950 | Tel No. (02) 8 817-2002-2005",
  "Email: info@bethelgen.com | VAT Reg. Tin: 000-745-041-00000",
];

// Draws the masthead at (x, y) spanning `width` and returns the y-coordinate
// where the rest of the document's content should start. Left side: shield
// logo + "BETHEL" / "Life and General Insurance Corporation" wordmark — the
// logo is vertically centered against that two-line text block as a whole
// (measured via heightOfString rather than assumed font metrics, so this
// stays correct if either line's font size ever changes), and sits close
// beside it (a tight LOGO_TEXT_GAP, not a wide margin) so the mark reads as
// one lockup rather than two separately-placed elements. Right side,
// right-aligned: the small-print former name, address, and contact details.
// A single navy rule closes off the block underneath both columns.
const LOGO_TEXT_GAP = 6;
const WORDMARK_LINE_GAP = 1;

function drawLetterhead(doc, x, y, width) {
  const leftWidth = width * 0.55;
  const rightX = x + width * 0.55;
  const rightWidth = width * 0.45;

  const logoSize = 42;
  const textX = x + logoSize + LOGO_TEXT_GAP;
  const textWidth = leftWidth - logoSize - LOGO_TEXT_GAP;

  doc.font(FONT_BODY_BOLD).fontSize(20);
  const titleHeight = doc.heightOfString("BETHEL", { width: textWidth, lineBreak: false });
  doc.font(FONT_BODY_BOLD).fontSize(10.5);
  const subtitleHeight = doc.heightOfString("Life and General Insurance Corporation", { width: textWidth });
  const textBlockHeight = titleHeight + WORDMARK_LINE_GAP + subtitleHeight;

  // Whichever of the logo/text block is shorter gets nudged down so both are
  // centered on the same horizontal axis, rather than both simply starting
  // flush at `y` (which only lines up their tops, not their true centers).
  const textTopY = y + Math.max(0, (logoSize - textBlockHeight) / 2);
  const logoY = y + Math.max(0, (textBlockHeight - logoSize) / 2);

  doc.image(LOGO_PATH, x, logoY, { width: logoSize });

  doc.font(FONT_BODY_BOLD).fontSize(20).fillColor(NAVY);
  doc.text("BETHEL", textX, textTopY, { width: textWidth, lineBreak: false });
  doc.font(FONT_BODY_BOLD).fontSize(10.5).fillColor(GOLD);
  doc.text("Life and General Insurance Corporation", textX, textTopY + titleHeight + WORDMARK_LINE_GAP, { width: textWidth });

  doc.font(FONT_BODY).fontSize(7).fillColor("#444444");
  let lineY = y + 1;
  for (const line of SMALL_PRINT_LINES) {
    doc.text(line, rightX, lineY, { width: rightWidth, align: "right" });
    lineY = doc.y + 1;
  }

  const bottomY = Math.max(logoY + logoSize, textTopY + textBlockHeight, lineY) + 6;
  doc
    .moveTo(x, bottomY)
    .lineTo(x + width, bottomY)
    .strokeColor(NAVY)
    .lineWidth(1.3)
    .stroke();

  doc.fillColor("#111111").font(FONT_BODY).strokeColor("#111111").lineWidth(1);
  return bottomY + 10;
}

module.exports = { drawLetterhead };
