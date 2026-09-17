-- A Vehicle now carries its own fixed Motor ProductVariant (see that
-- column's own schema comment) — the intake wizard derives a Motor filing's
-- product_variant_id from its vehicle(s) instead of asking the agent to pick
-- one as its own step; Property is unaffected (no vehicles to derive from).

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "product_variant_id" UUID;

-- CreateIndex
CREATE INDEX "Vehicle_product_variant_id_idx" ON "Vehicle"("product_variant_id");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill every existing vehicle from its own most recent Motor history —
-- an issued Policy first (the most authoritative record), then a still-
-- pending PolicyApplication, then a PolicyQuotation, newest event first
-- across all three combined. A vehicle only ever exists because of a Motor
-- filing (Property has none), so this should reach every row on file.
WITH vehicle_variant_history AS (
  SELECT pv.vehicle_id, p.product_variant_id, p.issue_date AS event_date
  FROM "PolicyVehicle" pv
  JOIN "Policy" p ON p.id = pv.policy_id
  UNION ALL
  SELECT pav.vehicle_id, pa.product_variant_id, pa.application_date AS event_date
  FROM "PolicyApplicationVehicle" pav
  JOIN "PolicyApplication" pa ON pa.id = pav.policy_application_id
  UNION ALL
  SELECT pqv.vehicle_id, pq.product_variant_id, pq.quotation_date AS event_date
  FROM "PolicyQuotationVehicle" pqv
  JOIN "PolicyQuotation" pq ON pq.id = pqv.policy_quotation_id
),
ranked AS (
  SELECT vehicle_id, product_variant_id,
         ROW_NUMBER() OVER (PARTITION BY vehicle_id ORDER BY event_date DESC) AS rn
  FROM vehicle_variant_history
)
UPDATE "Vehicle" v
SET product_variant_id = r.product_variant_id
FROM ranked r
WHERE r.vehicle_id = v.id AND r.rn = 1;
