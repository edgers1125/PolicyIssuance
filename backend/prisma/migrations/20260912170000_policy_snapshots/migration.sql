-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "company_name_snapshot" VARCHAR(255),
ADD COLUMN     "customer_name_snapshot" VARCHAR(255);

-- AlterTable
ALTER TABLE "PolicyCoverage" ADD COLUMN     "clause_snapshot" TEXT NOT NULL,
ADD COLUMN     "coverage_code_snapshot" VARCHAR(50) NOT NULL,
ADD COLUMN     "coverage_name_snapshot" VARCHAR(255) NOT NULL;
