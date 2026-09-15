-- AlterTable
ALTER TABLE "PolicyApplication" ADD COLUMN     "source_quotation_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "PolicyApplication_source_quotation_id_key" ON "PolicyApplication"("source_quotation_id");

-- AddForeignKey
ALTER TABLE "PolicyApplication" ADD CONSTRAINT "PolicyApplication_source_quotation_id_fkey" FOREIGN KEY ("source_quotation_id") REFERENCES "PolicyQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
