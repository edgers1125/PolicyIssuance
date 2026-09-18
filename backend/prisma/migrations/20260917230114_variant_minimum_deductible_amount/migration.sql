-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "minimum_deductible_amount_snapshot" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "minimum_deductible_amount" DECIMAL(18,2);
