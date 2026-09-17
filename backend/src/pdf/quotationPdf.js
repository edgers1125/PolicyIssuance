const PDFDocument = require("pdfkit");
const {
  FONT_BODY,
  FONT_BODY_BOLD,
  BASE_FONT_SIZE,
  registerFonts,
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
} = require("./theme");
const { drawLetterhead } = require("./letterhead");

const WATERMARK_TEXT = "POLICY NOT IN EFFECT\nQUOTATION ONLY";

function drawWatermark(doc) {
  drawLogoWatermark(doc);
  drawDiagonalStamp(doc, WATERMARK_TEXT);
}

// Renders a quotation as a PDF Buffer — a server-side counterpart to
// frontend/src/components/PolicySchedulePreview.jsx with isQuotation=true.
// `props` is that same component's prop shape (applicationNumber,
// classNameLabel, variantName, insuredName, insuredAddress, agentCode,
// coverageStartAt, coverageEndAt, vehicles, coverages, totalPremium,
// docStamps, vat, lgt, misc, totalAmount, remarks) — used identically
// whether the quotation is already saved or still a live draft, so this file
// never needs to know which.
function buildQuotationPdf(props) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "legal", margin: 40, bufferPages: true });
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
    registerFonts(doc);
    // Embedded in the PDF bytes itself (not an HTTP header), so it survives
    // the frontend's fetch-as-Blob/object-URL round trip and becomes the
    // browser's own pre-filled Save-As name — a Content-Disposition header
    // on the HTTP response gets discarded the moment the frontend turns the
    // response into a Blob to attach the Authorization header (see
    // components/PdfViewer.jsx / api/client.js's requestBlob).
    doc.info.Title = props.applicationNumber || "Quotation";
    // Every page (including ones PDFKit adds automatically when content
    // overflows) carries the same watermark as the on-screen/print preview —
    // a quotation must never be mistakable for an issued policy.
    doc.on("pageAdded", () => drawWatermark(doc));

    const left = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    drawWatermark(doc);

    const titleTop = drawLetterhead(doc, left, doc.page.margins.top, pageWidth);

    // Title block — bold then the class/variant line at the base
    // size/weight, matching the HTML's two centered header lines.
    doc.font(FONT_BODY_BOLD).fontSize(13).fillColor("#111111");
    doc.text("QUOTATION", left, titleTop, { width: pageWidth, align: "center" });
    doc.fontSize(BASE_FONT_SIZE);
    const classLine = `${(props.classNameLabel || "").toUpperCase()}${
      props.variantName ? ` — ${props.variantName.toUpperCase()}` : ""
    }`;
    doc.text(classLine, left, doc.y + 3, { width: pageWidth, align: "center" });
    doc.moveDown(1.6);

    // Two-column info block — left 55% (Quotation No / Insured / Address /
    // Agent Code), right 45% (Date Prepared + the charges table), matching
    // the HTML's 55%/45% split table.
    const rightColX = left + pageWidth * 0.55;
    const rightColWidth = pageWidth * 0.45;
    const leftColWidth = pageWidth * 0.55 - 16;
    const infoTop = doc.y;
    const ROW_GAP = 8;

    labelValue(doc, "Quotation No :", props.applicationNumber, left, infoTop, leftColWidth);
    labelValue(doc, "Insured :", props.insuredName, left, doc.y + ROW_GAP, leftColWidth);
    labelValue(doc, "Address :", props.insuredAddress, left, doc.y + ROW_GAP, leftColWidth);
    labelValue(doc, "Agent Code:", props.agentCode, left, doc.y + ROW_GAP, leftColWidth);
    const leftBottom = doc.y;

    labelValue(doc, "Date Prepared:", fmtDate(new Date()), rightColX, infoTop, rightColWidth);
    let rightY = doc.y + ROW_GAP;

    const chargeRows = [
      ["Premium", props.totalPremium],
      ["Doc. Stamps", props.docStamps],
      ["V.A.T.", props.vat],
      ["L.G.T.", props.lgt],
      ["Miscellaneous", props.misc],
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
    drawCurrency(doc, props.totalAmount, rightColX + rightColWidth * 0.5, rightY, rightColWidth * 0.5, {
      bold: true,
    });
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
    // Printed above Period of Insurance whenever this quotation was
    // auto-detected as continuing an already-issued policy (see
    // lib/policyConflicts.js, enforce:false — never client-supplied).
    if (props.renewingPolicyNumber) {
      doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).fillColor("#111111");
      doc.text("Renewing/Replacing : ", left, doc.y, { continued: true, width: pageWidth });
      doc.font(FONT_BODY).text(props.renewingPolicyNumber);
      doc.moveDown(0.3);
    }
    const from = fmtDateTime(props.coverageStartAt);
    const to = fmtDateTime(props.coverageEndAt);
    doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).fillColor("#111111");
    doc.text("Period of Insurance : ", left, doc.y, { continued: true, width: pageWidth });
    doc.font(FONT_BODY).text(`${from.date} (${from.time})   To   ${to.date} (${to.time})`);

    const vehicles = Array.isArray(props.vehicles) ? props.vehicles : [];
    if (vehicles.length > 0) {
      sectionRule();
      doc
        .font(FONT_BODY_BOLD)
        .fontSize(BASE_FONT_SIZE)
        .text(`SCHEDULED VEHICLE${vehicles.length > 1 ? "S" : ""}`, left, doc.y, { width: pageWidth });
      doc.moveDown(0.4);
      // Two columns × four rows — Model/MV File No., Body/Serial No.,
      // Make/Authentication No., Plate No./Color. "Model" reads year_model
      // (this schedule's own convention, matching how "Model" on a PH
      // OR/CR reads as the model *year* rather than the model name) and
      // "Body"/"Serial No."/"Authentication No." are this document's own
      // labels for vehicle_type/chassis_number/engine_number respectively —
      // same underlying Vehicle fields as before, just relabeled/regrouped.
      const half = pageWidth / 2;
      vehicles.forEach((v, i) => {
        if (vehicles.length > 1) {
          doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).text(`Vehicle ${i + 1}`, left, doc.y, { width: pageWidth });
          doc.moveDown(0.2);
        }
        const rowY = doc.y;
        labelValue(doc, "Model:", v.year_model || "—", left, rowY, half);
        labelValue(doc, "MV File No.:", v.mv_file_no, left + half, rowY, half);
        const rowY2 = doc.y + 5;
        labelValue(doc, "Body:", v.vehicle_type || "—", left, rowY2, half);
        labelValue(doc, "Serial No.:", v.chassis_number, left + half, rowY2, half);
        const rowY3 = doc.y + 5;
        labelValue(doc, "Make:", [v.make, v.model].filter(Boolean).join(" ") || "—", left, rowY3, half);
        labelValue(doc, "Authentication No.:", v.engine_number, left + half, rowY3, half);
        const rowY4 = doc.y + 5;
        labelValue(doc, "Plate No.:", v.plate_number, left, rowY4, half);
        labelValue(doc, "Color:", v.color || "—", left + half, rowY4, half);
        doc.y += 8;
      });
    }

    const coverages = Array.isArray(props.coverages) ? props.coverages : [];
    // VALUE_PERCENTAGE coverages (Motor's own-damage/comprehensive-type
    // coverage, priced off the vehicle's depreciated value — see
    // lib/coveragePricing.js) get their own Section III treatment; every
    // other pricing mode (PERCENTAGE, FLAT_TIER) is a plain Coverage/Amount/
    // Premium row under Section IVA/IVB/PA/AOG & Others, same table shape as
    // before this split existed.
    const valueCoverages = coverages.filter((c) => c.pricing_mode === "VALUE_PERCENTAGE");
    const otherCoverages = coverages.filter((c) => c.pricing_mode !== "VALUE_PERCENTAGE");

    const covCol1 = left;
    const covCol2 = left + pageWidth * 0.55;
    const covCol3 = left + pageWidth * 0.775;
    const covColWidths = [pageWidth * 0.55, pageWidth * 0.225, pageWidth * 0.225];

    // Coverage/Amount Covered/Premium header row — shared by Section III's
    // own table below and the SECTION IVA/IVB/PA/AOG & Others table, so both
    // render as the exact same tabular format rather than Section III using
    // a separate stacked label/value layout.
    function drawCoverageTableHeader() {
      doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE);
      const headerY = doc.y;
      doc.text("Coverage", covCol1, headerY, { width: covColWidths[0] });
      doc.text("Amount Covered", covCol2, headerY, { width: covColWidths[1], align: "right" });
      doc.text("Premium", covCol3, headerY, { width: covColWidths[2], align: "right" });
      doc.moveDown(0.4);
      doc
        .moveTo(left, doc.y)
        .lineTo(left + pageWidth, doc.y)
        .strokeColor("#111111")
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.4);
    }

    // Section I/II is fixed boilerplate — third-party-liability coverage is
    // baked into the base Motor Car policy rather than priced/itemized as its
    // own row the way the other sections' coverages are.
    sectionRule();
    doc
      .font(FONT_BODY_BOLD)
      .fontSize(BASE_FONT_SIZE)
      .text("SECTION I/II - THIRD PARTY LIABILITY (Subject to the Schedule of Indemnities) PREMIUMS", left, doc.y, {
        width: pageWidth,
      });

    if (valueCoverages.length > 0) {
      sectionRule();
      doc
        .font(FONT_BODY_BOLD)
        .fontSize(BASE_FONT_SIZE)
        .text("SECTION III  Insured's Estimate of Value of Scheduled Vehicle", left, doc.y, { width: pageWidth });
      doc.moveDown(0.5);
      drawCoverageTableHeader();

      doc.font(FONT_BODY).fontSize(BASE_FONT_SIZE);
      for (const c of valueCoverages) {
        const rowY = doc.y;
        doc.font(FONT_BODY).text(c.name, covCol1, rowY, { width: covColWidths[0] });
        drawCurrency(doc, c.amount, covCol2, rowY, covColWidths[1]);
        drawCurrency(doc, c.premium, covCol3, rowY, covColWidths[2]);
        doc.moveDown(0.6);

        doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).text("Limit on Accessories", left, doc.y, { width: pageWidth });
        doc.moveDown(0.2);
        doc.font(FONT_BODY).text("- Standard Built-in Accessories", left, doc.y, { width: pageWidth });

        // Divider between the accessories line and the deductible line below it.
        doc.moveDown(0.3);
        doc
          .moveTo(left, doc.y)
          .lineTo(left + pageWidth, doc.y)
          .strokeColor("#999999")
          .lineWidth(1)
          .stroke();
        doc.moveDown(0.3);

        const { deductible, authorizedRepairLimit } = computeDeductibleFigures(c.amount, props.deductibleRate);
        doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).text("Deductible: ", left, doc.y, { continued: true });
        drawCurrencyInline(doc, deductible, { bold: true });
        doc.text("   |   Towing: ", { continued: true });
        drawCurrencyInline(doc, TOWING_AMOUNT, { bold: true });
        doc.text("   |   Authorized Repair Limit: ", { continued: true });
        drawCurrencyInline(doc, authorizedRepairLimit, { bold: true, continued: false });
        // Tight trailing gap — sectionRule() (below, before SECTION IVA)
        // already adds its own leading gap before drawing its own divider,
        // so this just needs to clear the text, not add a second full gap.
        doc.moveDown(0.3);
      }
    }

    sectionRule();
    doc.font(FONT_BODY_BOLD).fontSize(BASE_FONT_SIZE).text("SECTION IVA, IVB, PA, AOG & OTHERS", left, doc.y, { width: pageWidth });
    doc.moveDown(0.4);
    doc
      .moveTo(left, doc.y)
      .lineTo(left + pageWidth, doc.y)
      .strokeColor("#999999")
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.4);
    drawCoverageTableHeader();

    doc.font(FONT_BODY).fontSize(BASE_FONT_SIZE);
    if (otherCoverages.length === 0) {
      doc.text("None", covCol1, doc.y, { width: covColWidths[0] });
      doc.moveDown(0.5);
    }
    for (const c of otherCoverages) {
      const rowY = doc.y;
      doc.font(FONT_BODY).text(c.name, covCol1, rowY, { width: covColWidths[0] });
      drawCurrency(doc, c.amount, covCol2, rowY, covColWidths[1]);
      drawCurrency(doc, c.premium, covCol3, rowY, covColWidths[2]);
      doc.moveDown(0.5);
    }

    if (props.remarks) {
      sectionRule();
      doc
        .font(FONT_BODY_BOLD)
        .fontSize(BASE_FONT_SIZE)
        .text("Remarks: ", left, doc.y, { continued: true, width: pageWidth });
      doc.font(FONT_BODY).text(props.remarks);
    }

    // Forms & Endorsements and the sea-faring-vessels notice are Motor-
    // specific boilerplate — only meaningful when there's an actual vehicle
    // on the schedule (a Property quotation/application has neither). Reuses
    // the same `vehicles` array the SCHEDULED VEHICLE(S) section above built.
    if (vehicles.length > 0) {
      sectionRule();
      doc
        .font(FONT_BODY_BOLD)
        .fontSize(BASE_FONT_SIZE)
        .text("FORMS AND ENDORSEMENTS MADE PART OF THIS POLICY AT THE TIME OF ISSUE", left, doc.y, { width: pageWidth });
      doc.moveDown(0.4);
      const seats = Number(vehicles[0]?.no_of_seats);
      const occupants = Number.isFinite(seats) && seats > 0 ? seats - 1 : "—";
      doc
        .font(FONT_BODY)
        .text(`1 DRIVER AND ${occupants} OCCUPANTS OR PASSENGERS AT Php. 50,000.00 EACH`, left, doc.y, { width: pageWidth });

      doc.moveDown(0.8);
      doc
        .font(FONT_BODY)
        .fontSize(8)
        .text(
          "PLEASE BE ADVISED THAT THE STANDARD MOTOR CAR POLICY COVERAGE IS SUSPENDED WHILST THE SUBJECT MOTOR CAR IS ON BOARD SEA-FARING VESSELS SAILING INTER-ISLAND WITHIN THE PHILS. IT IS THEREFORE RECOMMENDED THAT YOU SECURE A MARINE CARGO POLICY TO COVER YOUR MOTOR CAR AGAINST LOSS OR DAMAGE OCCURING DURING THE ABOVE MENTIONED TRANSIT.",
          left,
          doc.y,
          { width: pageWidth, align: "justify" }
        );
      doc.fontSize(BASE_FONT_SIZE);
    }

    const issuedOn = fmtDate(new Date());
    doc.moveDown(0.8);
    doc
      .font(FONT_BODY)
      .fontSize(BASE_FONT_SIZE)
      .text(
        `IN WITNESS WHEREOF, a duly authorized officer of the company has set his hand hereunto in MARIKINA Philippines this ${issuedOn}.`,
        left,
        doc.y,
        { width: pageWidth }
      );

    // Signature block anchored near the bottom of whichever page the content
    // ended on, same placement as the on-screen preview's first page.
    const sigWidth = 240;
    const sigX = left + pageWidth - sigWidth;
    // Anchored near the bottom of whichever page the content ended on
    // (matching the on-screen preview's own placement) — but capped at
    // sigCeiling so long content can never push it low enough to collide
    // with the small "ID No./Agent Code/Time/Date" print line fixed just
    // above the bottom margin below it (a real risk once the block grew
    // taller to make room for a floating signature — see drawSignatureBlock).
    const sigFloor = doc.page.height - doc.page.margins.bottom - (SIGNATURE_BLOCK_HEIGHT + 24);
    const sigCeiling = doc.page.height - doc.page.margins.bottom - (SIGNATURE_BLOCK_HEIGHT + 16);
    const sigY = Math.min(Math.max(doc.y + 24, sigFloor), sigCeiling);
    doc.font(FONT_BODY).fontSize(8);
    doc.text(
      "Documentary Stamps to the value shown herein have been properly affixed and cancelled on the duplicate copy of the Policy.",
      left,
      sigY,
      { width: pageWidth - sigWidth - 20 }
    );
    drawSignatureBlock(doc, sigX, sigY, sigWidth);

    // Small bottom-left print — the physical form's own "ID No./Agent-Code/
    // Time/Date" line. There's no separate "ID No." concept in this system,
    // so that segment is left blank for hand entry same as Towing above;
    // Agent Code/Time/Date are the actual values behind this document.
    const preparedAt = fmtDateTime(new Date());
    doc
      .font(FONT_BODY)
      .fontSize(7)
      .text(
        `ID No.: ____________ / Agent Code: ${props.agentCode || "—"} / Time: ${preparedAt.time} / Date: ${preparedAt.date}`,
        left,
        doc.page.height - doc.page.margins.bottom - 10,
        { width: pageWidth }
      );

    const clausedCoverages = coverages.filter((c) => c.clause);
    if (clausedCoverages.length > 0) {
      doc.addPage();
      doc.font(FONT_BODY_BOLD).fontSize(12).text("Warranties and Clauses", left, doc.page.margins.top, {
        width: pageWidth,
        align: "center",
      });
      doc.moveDown(1.2);
      doc
        .font(FONT_BODY)
        .fontSize(9)
        .text(
          `ATTACH TO AND FORMING PART OF BETHEL GENERAL INSURANCE AND SURETY CORP. QUOTATION NO.: ${props.applicationNumber}`,
          left,
          doc.y,
          { width: pageWidth }
        );
      doc.moveDown(1.4);

      for (const c of clausedCoverages) {
        doc
          .font(FONT_BODY_BOLD)
          .fontSize(BASE_FONT_SIZE)
          .text(`${c.name.toUpperCase()} CLAUSE`, left, doc.y, { width: pageWidth });
        doc.moveDown(0.3);
        doc
          .font(FONT_BODY)
          .fontSize(BASE_FONT_SIZE)
          .text(c.clause, left, doc.y, { width: pageWidth, align: "justify" });
        doc.moveDown(1.2);
      }

      const clauseSigY = Math.min(doc.y + 24, doc.page.height - doc.page.margins.bottom - (SIGNATURE_BLOCK_HEIGHT + 8));
      drawSignatureBlock(doc, left + pageWidth - sigWidth, clauseSigY, sigWidth);
    }

    doc.end();
  });
}

module.exports = { buildQuotationPdf };
