-- AlterTable
ALTER TABLE "Permission" ALTER COLUMN "page_group" DROP DEFAULT;

-- CreateTable
CREATE TABLE "CustomerAgent" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAgent" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerAgent_agent_id_idx" ON "CustomerAgent"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAgent_customer_id_agent_id_key" ON "CustomerAgent"("customer_id", "agent_id");

-- CreateIndex
CREATE INDEX "CompanyAgent_agent_id_idx" ON "CompanyAgent"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAgent_company_id_agent_id_key" ON "CompanyAgent"("company_id", "agent_id");

-- AddForeignKey
ALTER TABLE "CustomerAgent" ADD CONSTRAINT "CustomerAgent_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAgent" ADD CONSTRAINT "CustomerAgent_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAgent" ADD CONSTRAINT "CompanyAgent_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAgent" ADD CONSTRAINT "CompanyAgent_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
