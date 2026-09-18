-- ApplicationStatus loses its never-used multi-step values (DRAFT,
-- FOR_EDIT_MANAGER, FOR_EDIT_UNDERWRITING, PENDING_MANAGER_APPROVAL,
-- PENDING_UNDERWRITING_APPROVAL — nothing ever walked an application
-- through them, approval has always been single-stage) and gains
-- UNDER_REVIEW, set automatically the moment an approver opens a SUBMITTED
-- application (routes/policyApproval.js's GET /:id). Postgres has no
-- "DROP VALUE" for enums, so this recreates the type — safe here since no
-- row on file uses any of the values being removed.
CREATE TYPE "ApplicationStatus_new" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');
ALTER TABLE "PolicyApplication" ALTER COLUMN "status" TYPE "ApplicationStatus_new" USING ("status"::text::"ApplicationStatus_new");
DROP TYPE "ApplicationStatus";
ALTER TYPE "ApplicationStatus_new" RENAME TO "ApplicationStatus";
