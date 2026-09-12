-- Merge CustomerVehicle/CompanyVehicle into PartyVehicle, and
-- CustomerAddress/CompanyAddress into PartyAddress. Each merged table keeps
-- the original rows' ids and both nullable party FKs, with exactly one set.

-- PartyVehicle
CREATE TABLE "PartyVehicle" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "company_id" UUID,
    "vehicle_id" UUID NOT NULL,
    "ownership_start_date" DATE,
    "ownership_end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyVehicle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PartyVehicle_exactly_one_party" CHECK (
        ("customer_id" IS NOT NULL AND "company_id" IS NULL) OR
        ("customer_id" IS NULL AND "company_id" IS NOT NULL)
    )
);

CREATE INDEX "PartyVehicle_customer_id_idx" ON "PartyVehicle"("customer_id");
CREATE INDEX "PartyVehicle_company_id_idx" ON "PartyVehicle"("company_id");

ALTER TABLE "PartyVehicle" ADD CONSTRAINT "PartyVehicle_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartyVehicle" ADD CONSTRAINT "PartyVehicle_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartyVehicle" ADD CONSTRAINT "PartyVehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PartyVehicle" ("id", "customer_id", "company_id", "vehicle_id", "ownership_start_date", "ownership_end_date", "created_at")
SELECT "id", "customer_id", NULL, "vehicle_id", "ownership_start_date", "ownership_end_date", "created_at" FROM "CustomerVehicle";

INSERT INTO "PartyVehicle" ("id", "customer_id", "company_id", "vehicle_id", "ownership_start_date", "ownership_end_date", "created_at")
SELECT "id", NULL, "company_id", "vehicle_id", "ownership_start_date", "ownership_end_date", "created_at" FROM "CompanyVehicle";

DROP TABLE "CustomerVehicle";
DROP TABLE "CompanyVehicle";

-- PartyAddress
CREATE TABLE "PartyAddress" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "company_id" UUID,
    "address_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyAddress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PartyAddress_exactly_one_party" CHECK (
        ("customer_id" IS NOT NULL AND "company_id" IS NULL) OR
        ("customer_id" IS NULL AND "company_id" IS NOT NULL)
    )
);

CREATE INDEX "PartyAddress_customer_id_idx" ON "PartyAddress"("customer_id");
CREATE INDEX "PartyAddress_company_id_idx" ON "PartyAddress"("company_id");

ALTER TABLE "PartyAddress" ADD CONSTRAINT "PartyAddress_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartyAddress" ADD CONSTRAINT "PartyAddress_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartyAddress" ADD CONSTRAINT "PartyAddress_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PartyAddress" ("id", "customer_id", "company_id", "address_id", "is_primary", "created_at")
SELECT "id", "customer_id", NULL, "address_id", "is_primary", "created_at" FROM "CustomerAddress";

INSERT INTO "PartyAddress" ("id", "customer_id", "company_id", "address_id", "is_primary", "created_at")
SELECT "id", NULL, "company_id", "address_id", "is_primary", "created_at" FROM "CompanyAddress";

DROP TABLE "CustomerAddress";
DROP TABLE "CompanyAddress";
