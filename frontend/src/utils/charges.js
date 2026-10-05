// Client-side mirror (non-authoritative, live-preview only) of
// backend/src/lib/coveragePricing.js's round2/computeChargeTotals — the server
// always recomputes. Shared by PolicyApplication.jsx, QuotationCreator.jsx and
// EditQuotationDialog.jsx so the three Charges blocks can't drift apart.

export const DOC_STAMPS_RATE = 0.125;
export const VAT_RATE = 0.12;
export const LGT_RATE = 0.002;

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// `rows` is anything carrying { premium_amount, is_misc }. Doc stamps/VAT/LGT
// tax the FULL premium sum; an is_misc coverage's premium only moves from the
// Premium line into Miscellaneous (on top of the variant's own misc_fee).
export function computeChargeTotals(rows, miscFee) {
  const grossPremium = round2(rows.reduce((sum, r) => sum + (Number(r.premium_amount) || 0), 0));
  const totalPremium = round2(
    rows.filter((r) => !r.is_misc).reduce((sum, r) => sum + (Number(r.premium_amount) || 0), 0)
  );
  const miscFromCoverages = round2(grossPremium - totalPremium);
  const docStamps = round2(grossPremium * DOC_STAMPS_RATE);
  const vat = round2(grossPremium * VAT_RATE);
  const lgt = round2(grossPremium * LGT_RATE);
  const misc = round2((Number(miscFee) || 0) + miscFromCoverages);
  const totalAmount = round2(totalPremium + docStamps + vat + lgt + misc);
  return { grossPremium, totalPremium, docStamps, vat, lgt, misc, totalAmount };
}

// VEHICLE_SEATS_BASED floor: nothing owed up to the threshold; the excess is
// charged per bracket "or fraction thereof" (a partial bracket counts as a
// whole one), matching the backend.
export function seatsBracketCharge(totalInsured, thresholdAmount, bracketAmount, bracketPrice) {
  const excess = Math.max(0, Number(totalInsured) - (Number(thresholdAmount) || 0));
  const size = Number(bracketAmount);
  if (!(excess > 0) || !(size > 0)) return 0;
  return Math.ceil(excess / size) * (Number(bracketPrice) || 0);
}
