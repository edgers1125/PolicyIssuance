-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "authorized_repair_limit_rate" DECIMAL(7,4),
ADD COLUMN     "deductible_rate" DECIMAL(7,4);

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "no_of_seats" INTEGER NOT NULL DEFAULT 5;
