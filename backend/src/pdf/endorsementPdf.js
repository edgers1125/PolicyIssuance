const PDFDocument = require("pdfkit");
const {
  FONT_BODY,
  FONT_BODY_BOLD,
  BASE_FONT_SIZE,
  registerFonts,
  fmtDate,
  drawCurrency,
  drawLogoWatermark,
  drawDiagonalStamp,
  drawSignatureBlock,
  SIGNATURE_BLOCK_HEIGHT,
  labelValue,
} = require("./theme");
const { drawLetterhead } = require("./letterhead");

// Plain-English narrative for one EndorsementChange line — printed as the
// numbered amendment list under "It is HEREBY DECLARED AND AGREED...".
// vehicle_label/coverage_label are pre-resolved by the caller (routes/
// endorsements.js, routes/policies.js) from this policy's own PolicyVehicle/
// PolicyCoverage snapshot rows — this file does no DB lookups of its own,
// matching every other *Pdf.js builder's "props already carry everything"
// contract.
const VEHICLE_FIELD_LABELS = {
  VEHICLE_MODEL: "model",
  VEHICLE_MV_FILE: "MV file number",
  VEHICLE_PLATE_NO: "plate number",
  VEHICLE_TYPE: "type",
  VEHICLE_MAKE: "make",
  VEHICLE_COLOR: "color",
  VEHICLE_ENGINE_NO: "engine number",
  VEHICLE_CHASSIS_NO: "chassis number",
};

// The standard endorsement title Bethel's own printed endorsement forms use
// for each change type — printed as this amendment's numbered heading
// ("1. CORRECT PLATE NUMBER"), with describeChange()'s own plain-English
// From/To narrative printed indented underneath it. Chosen from Bethel's
// fixed list of endorsement titles for motor car policies.
const CHANGE_TITLES = {
  POLICY_EFFECTIVE_DATE: "CORRECT PERIOD OF INSURANCE",
  INSURED_NAME_DETAILS: "CORRECT ASSURED",
  INSURED_ADDRESS_DETAILS: "CORRECT ADDRESS",
  VEHICLE_MODEL: "CORRECT MODEL",
  VEHICLE_MV_FILE: "CORRECT MV NUMBER",
  VEHICLE_PLATE_NO: "CORRECT PLATE NUMBER",
  VEHICLE_TYPE: "CORRECT DESCRIPTION OF VEHICLE",
  VEHICLE_MAKE: "CORRECT DESCRIPTION OF VEHICLE",
  VEHICLE_COLOR: "CORRECT COLOR",
  VEHICLE_ENGINE_NO: "CORRECT MOTOR NUMBER",
  VEHICLE_CHASSIS_NO: "CORRECT CHASSIS NUMBER",
  EDIT_CLAUSE: "AMEND CLAUSE",
  REMOVE_CLAUSE: "DELETION OF COVERAGE",
  ADD_COVERAGE: "ADDITIONAL COVERAGE",
  CANCEL_POLICY: "CANCELLATION OF POLICY",
};

function changeTitle(c) {
  return CHANGE_TITLES[c.change_type] || "OTHERS";
}

function describeChange(c) {
  const from = c.change_from || "—";
  const to = c.change_to || "—";
  switch (c.change_type) {
    case "POLICY_EFFECTIVE_DATE":
      return `The effective date of this policy is corrected (From: ${fmtDate(from) || from} To: ${fmtDate(to) || to})`;
    case "INSURED_NAME_DETAILS":
      return `The name of the insured is corrected (From: "${from}" To: "${to}")`;
    case "INSURED_ADDRESS_DETAILS":
      return `The address of the insured is corrected (From: "${from}" To: "${to}")`;
    case "EDIT_CLAUSE":
      return `The clause of the ${c.coverage_label || "coverage"} is amended (From: "${from}" To: "${to}")`;
    case "REMOVE_CLAUSE":
      return `The ${c.coverage_label || "coverage"} is removed from this policy (${from})`;
    case "ADD_COVERAGE":
      return to;
    case "CANCEL_POLICY":
      return `This policy is cancelled effective the date above.${c.remarks ? ` Reason: ${c.remarks}` : ""}`;
    default: {
      const fieldLabel = VEHICLE_FIELD_LABELS[c.change_type];
      if (fieldLabel) {
        return `The ${fieldLabel} of the vehicle${c.vehicle_label ? ` (${c.vehicle_label})` : ""} is corrected (From: "${from}" To: "${to}")`;
      }
      return `Changed (From: "${from}" To: "${to}")`;
    }
  }
}

// Draws one endorsement's full content onto the CURRENT page of `doc`,
// starting at the top margin — the caller is responsible for having already
// called doc.addPage() (or, for the very first page of a standalone
// document, relying on PDFKit's own initial page). Shared by
// buildEndorsementPdf below (a standalone document — the Client Policies
// page's preview/download, and the Endorsement Approval review dialog's own
// PDF) and pdf/policyPdf.js's buildPolicyPdf (which appends one of these
// pages per approved endorsement right after the main policy schedule, in
// the same file — see that builder's own note).
//
// props: { endorsementNumber, policyNumber, classNameLabel, variantName,
// insuredName, insuredAddress, agentCode, dateIssued, effectiveDate,
// expiryDate, totalPremium, docStamps, vat, lgt, misc, totalAmount, changes,
// stampText, signed }
function drawEndorsementPage(doc, props) {
  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Drawn first, before any real layout — drawDiagonalStamp's own .text()
  // call runs inside a rotated/translated CTM (see theme.js's
  // withPageCenterOrigin), and PDFKit's text-flow cursor (doc.x/doc.y) is a
  // plain instance property, not part of the graphics state doc.restore()
  // reverts — so calling this any later would leave doc.y holding a
  // meaningless coordinate from inside that rotated space, corrupting every
  // position computed off it afterward (the whole info block collapsing up
  // into the letterhead). Every other builder in this app (quotationPdf.js,
  // policyApplicationPdf.js) draws its own stamp this same way, first thing,
  // before drawLetterhead.
  if (props.stampText) {
    drawDiagonalStamp(doc, props.stampText);
  }

  const titleTop = drawLetterhead(doc, left, doc.page.margins.top, pageWidth);

  doc.font(FONT_BODY_BOLD).fontSize(13).fillColor("#111111");
  doc.text("ENDORSEMENT", left, titleTop, { width: pageWidth, align: "center" });
  doc.fontSize(BASE_FONT_SIZE);
  const classLine = `${(props.classNameLabel || "").toUpperCase()}${
    props.variantName ? ` — ${props.variantName.toUpperCase()}` : ""
  }`;
  doc.text(classLine, left, doc.y + 3, { width: pageWidth, align: "center" });
  doc.moveDown(1.6);

  // Same two-column info block shape as pdf/policyPdf.js's own header — see
  // that file's note on the 55%/45% split — just with an extra "Endorsement
  // No." row under "Policy No." and "Others" in place of "Miscellaneous"
  // (this template's own wording for that charge line).
  const rightColX = left + pageWidth * 0.55;
  const rightColWidth = pageWidth * 0.45;
  const leftColWidth = pageWidth * 0.55 - 16;
  const infoTop = doc.y;
  const ROW_GAP = 8;

  labelValue(doc, "Policy No :", props.policyNumber, left, infoTop, leftColWidth);
  let leftY = doc.y + ROW_GAP;
  labelValue(doc, "Endorsement No :", props.endorsementNumber, left, leftY, leftColWidth);
  leftY = doc.y + ROW_GAP;
  labelValue(doc, "Insured :", props.insuredName, left, leftY, leftColWidth);
  labelValue(doc, "Address :", props.insuredAddress, left, doc.y + ROW_GAP, leftColWidth);
  labelValue(doc, "Agent Code:", props.agentCode, left, doc.y + ROW_GAP, leftColWidth);
  const leftBottom = doc.y;

  labelValue(doc, "Date issued:", fmtDate(props.dateIssued), rightColX, infoTop, rightColWidth);
  let rightY = doc.y + ROW_GAP;

  const chargeRows = [
    ["Premium", props.totalPremium],
    ["Doc. Stamps", props.docStamps],
    ["V.A.T.", props.vat],
    ["L.G.T.", props.lgt],
    ["Others", props.misc],
  ];
  doc.fontSize(BASE_FONT_SIZE);
  for (const [label, amount] of chargeRows) {
    doc.font(FONT_BODY).text(label, rightColX, rightY, { width: rightColWidth * 0.5 });
    drawCurrency(doc, amount, rightColX + rightColWidth * 0.5, rightY, rightColWidth * 0.5);
    rightY += 14;
  }
  doc
    .moveTo(rightColX, rightY)
    .lineTo(rightColX + rightColWidth, rightY)
    .strokeColor("#111111")
    .lineWidth(1)
    .stroke();
  rightY += 3;
  doc.font(FONT_BODY_BOLD).text("Total Php.", rightColX, rightY, { width: rightColWidth * 0.5 });
  drawCurrency(doc, props.totalAmount, rightColX + rightColWidth * 0.5, rightY, rightColWidth * 0.5, { bold: true });
  const rightBottom = doc.y + 16;

  doc.y = Math.max(leftBottom, rightBottom);
  doc.x = left;

  function sectionRule() {
    doc.moveDown(0.7);
    doc
      .moveTo(left, doc.y)
      .lineTo(left + pageWidth, doc.y)
      .strokeColor("#999999")
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.6);
  }

  sectionRule();
  doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).fillColor("#111111");
  doc.text("This endorsement is effective: ", left, doc.y, { continued: true, width: pageWidth });
  doc.font(FONT_BODY).text(`${fmtDate(props.effectiveDate)}   and expires   ${fmtDate(props.expiryDate)}`);

  sectionRule();
  doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).text("This policy is subject to the following amendments:", left, doc.y, {
    width: pageWidth,
  });
  doc.moveDown(0.5);
  doc
    .font(FONT_BODY)
    .text(
      `It is HEREBY DECLARED AND AGREED that effective ${fmtDate(props.effectiveDate)}, the following amendments are deemed included under this policy.`,
      left,
      doc.y,
      { width: pageWidth, align: "justify" }
    );
  doc.moveDown(0.8);

  // Each amendment prints as a numbered title line ("1. CORRECT PLATE
  // NUMBER") naming the standard endorsement title for this change type,
  // then — indented, on its own line below — describeChange()'s own
  // plain-English From/To narrative.
  const changes = Array.isArray(props.changes) ? props.changes : [];
  const indentX = left + 20;
  const indentWidth = pageWidth - 20;
  changes.forEach((c, i) => {
    doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).text(`${i + 1}. ${changeTitle(c)}`, left, doc.y, { width: pageWidth });
    doc.moveDown(0.5);
    doc.font(FONT_BODY).text(describeChange(c), indentX, doc.y, { width: indentWidth });
    if (c.remarks) {
      doc.font(FONT_BODY).fontSize(8).fillColor("#444444").text(`Remarks: ${c.remarks}`, indentX, doc.y, {
        width: indentWidth,
      });
      doc.fontSize(BASE_FONT_SIZE).fillColor("#111111");
    }
    doc.moveDown(0.8);
  });

  doc.moveDown(0.3);
  doc
    .font(FONT_BODY_BOLD)
    .fontSize(BASE_FONT_SIZE)
    .text("EXCEPT AS HEREIN VARIED, all other terms and conditions remain the same.", left, doc.y, { width: pageWidth });

  doc.moveDown(0.8);
  doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).text("IMPORTANT NOTICE TO THE ASSURED.", left, doc.y, { width: pageWidth });
  doc.moveDown(0.3);
  doc
    .font(FONT_BODY)
    .fontSize(8)
    .text(
      "The Insurance Code (P.D. 612 and OIC Circular #80) requires the assured's conformity to this endorsement. Please sign on the space provided for and return one signed copy to us within thirty (30) days. Your failure to do so will mean your conformity to this endorsement.",
      left,
      doc.y,
      { width: pageWidth, align: "justify" }
    );
  doc.fontSize(BASE_FONT_SIZE);

  const sigWidth = 200;
  const conformeX = left;
  const sigX = left + pageWidth - sigWidth;
  const sigFloor = doc.page.height - doc.page.margins.bottom - (SIGNATURE_BLOCK_HEIGHT + 24);
  const sigCeiling = doc.page.height - doc.page.margins.bottom - (SIGNATURE_BLOCK_HEIGHT + 8);
  const sigY = Math.min(Math.max(doc.y + 30, sigFloor), sigCeiling);

  doc.font(FONT_BODY).fontSize(BASE_FONT_SIZE).fillColor("#111111");
  doc
    .moveTo(conformeX, sigY + 40)
    .lineTo(conformeX + sigWidth, sigY + 40)
    .strokeColor("#111111")
    .lineWidth(1)
    .stroke();
  doc.text("Conforme:", conformeX, sigY, { width: sigWidth });

  // signed: true — only ever passed once this endorsement is actually
  // APPROVED (see routes/endorsements.js), same convention as
  // pdf/policyPdf.js's own signature block.
  drawSignatureBlock(doc, sigX, sigY, sigWidth, { signed: props.signed });
}

// Renders a standalone EndorsementRequest as a PDF Buffer — the Client
// Policies page's preview-before-submit and post-submit "here's your
// endorsement" popup, and the Endorsement Approval review dialog's own PDF.
// `props.stampText` (e.g. "ENDORSEMENT PENDING APPROVAL"/"ENDORSEMENT
// REJECTED") draws the same red diagonal stamp mechanism as every other
// pre-final document in this app, `null` for an already-APPROVED one;
// `props.signed` draws the real branch-head signature (true only once
// APPROVED).
function buildEndorsementPdf(props) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "legal", margin: 40, bufferPages: true });
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
    registerFonts(doc);
    doc.info.Title = props.endorsementNumber || "Endorsement";
    // Redraws only the logo watermark on an overflow page PDFKit adds
    // automatically — not the diagonal stamp, which drawEndorsementPage
    // itself draws once per page it's given (see the appended-into-policy-PDF
    // case in pdf/policyPdf.js, which calls doc.addPage() + drawEndorsementPage
    // once per endorsement, each handling its own stamp).
    doc.on("pageAdded", () => drawLogoWatermark(doc));
    drawLogoWatermark(doc);

    drawEndorsementPage(doc, props);

    doc.end();
  });
}

module.exports = { buildEndorsementPdf, drawEndorsementPage, describeChange, changeTitle };
