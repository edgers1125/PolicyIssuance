-- Statutory charges + grand total, frozen per application at submission time.
ALTER TABLE "PolicyApplication" ADD COLUMN "total_premium" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PolicyApplication" ADD COLUMN "doc_stamps" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PolicyApplication" ADD COLUMN "vat" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PolicyApplication" ADD COLUMN "lgt" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PolicyApplication" ADD COLUMN "misc" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "PolicyApplication" ADD COLUMN "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- Best-effort backfill for existing rows: total_premium from their coverages,
-- statutory charges at the standard rates (12.5% DST, 12% VAT, 0.2% LGT).
UPDATE "PolicyApplication" pa
SET
  total_premium = sub.total_premium,
  doc_stamps = ROUND(sub.total_premium * 0.125, 2),
  vat = ROUND(sub.total_premium * 0.12, 2),
  lgt = ROUND(sub.total_premium * 0.002, 2),
  total_amount = sub.total_premium
    + ROUND(sub.total_premium * 0.125, 2)
    + ROUND(sub.total_premium * 0.12, 2)
    + ROUND(sub.total_premium * 0.002, 2)
FROM (
  SELECT application_id, SUM(premium_amount) AS total_premium
  FROM "ApplicationCoverage"
  GROUP BY application_id
) sub
WHERE sub.application_id = pa.id;

ALTER TABLE "PolicyApplication" ALTER COLUMN "total_premium" DROP DEFAULT;
ALTER TABLE "PolicyApplication" ALTER COLUMN "doc_stamps" DROP DEFAULT;
ALTER TABLE "PolicyApplication" ALTER COLUMN "vat" DROP DEFAULT;
ALTER TABLE "PolicyApplication" ALTER COLUMN "lgt" DROP DEFAULT;
ALTER TABLE "PolicyApplication" ALTER COLUMN "total_amount" DROP DEFAULT;
ALTER TABLE "PolicyApplication" ALTER COLUMN "misc" DROP DEFAULT;
