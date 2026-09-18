-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "gross_target_coverage_id" UUID;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_gross_target_coverage_id_fkey" FOREIGN KEY ("gross_target_coverage_id") REFERENCES "ProductCoverage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
