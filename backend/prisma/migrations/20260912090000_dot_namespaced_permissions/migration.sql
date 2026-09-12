-- Rename permission codes to a dot-namespaced hierarchy: a code with no dot
-- (e.g. MANAGE_USERS) is a top-level, page-access permission; "PARENT.CHILD"
-- (e.g. MANAGE_USERS.ADD_USER) is a sub-permission scoped under that page.
-- This replaces the separate page_group/is_page_access columns below, since
-- both are now derivable straight from the code string itself.
UPDATE "Permission" SET permission_code = 'MANAGE_USERS.ADD_USER' WHERE permission_code = 'ADD_USER';
UPDATE "Permission" SET permission_code = 'MANAGE_USERS.EDIT_ROLE' WHERE permission_code = 'EDIT_ROLE';
UPDATE "Permission" SET permission_code = 'MANAGE_USERS.EDIT_SPECIAL_PERMISSIONS' WHERE permission_code = 'EDIT_SPECIAL_PERMISSIONS';
UPDATE "Permission" SET permission_code = 'MANAGE_USERS.EDIT_USER_DETAILS' WHERE permission_code = 'EDIT_USER_DETAILS';
UPDATE "Permission" SET permission_code = 'MANAGE_AGENTS.VIEW_AGENT_PREMIUMS' WHERE permission_code = 'VIEW_AGENT_PREMIUMS';
UPDATE "Permission" SET permission_code = 'MANAGE_AGENTS.MANAGE_AGENT_RATES' WHERE permission_code = 'MANAGE_AGENT_RATES';
UPDATE "Permission" SET permission_code = 'CREATE_APPLICATION.AGENT_ISSUANCE' WHERE permission_code = 'AGENT_ISSUANCE';
UPDATE "Permission" SET permission_code = 'MANAGE_SETTINGS.EDIT_ROLE_PERMISSIONS' WHERE permission_code = 'EDIT_ROLE_PERMISSIONS';
UPDATE "Permission" SET permission_code = 'MANAGE_SETTINGS.CREATE_ROLE' WHERE permission_code = 'CREATE_ROLE';
UPDATE "Permission" SET permission_code = 'MANAGE_SETTINGS.EDIT_CLAUSES' WHERE permission_code = 'EDIT_CLAUSES';
UPDATE "Permission" SET permission_code = 'MANAGE_SETTINGS.MANAGE_PAYMENT_METHODS' WHERE permission_code = 'MANAGE_PAYMENT_METHODS';
UPDATE "Permission" SET permission_code = 'MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING' WHERE permission_code = 'MANAGE_COVERAGE_PRICING';
-- MANAGE_USERS, MANAGE_AGENTS, CREATE_APPLICATION, VIEW_POLICIES,
-- MANAGE_INLEASE, APPROVE_APPLICATION, MANAGE_SETTINGS already have no dot
-- and stay exactly as-is — they were already top-level page-access codes.

-- EDIT_COVERAGE_DEFAULTS is superseded entirely by
-- MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING (max-coverage editing already
-- lives on that page) — drop the now-redundant permission and its grants.
DELETE FROM "RolePermission" WHERE permission_id IN (SELECT id FROM "Permission" WHERE permission_code = 'EDIT_COVERAGE_DEFAULTS');
DELETE FROM "UserPermission" WHERE permission_id IN (SELECT id FROM "Permission" WHERE permission_code = 'EDIT_COVERAGE_DEFAULTS');
DELETE FROM "Permission" WHERE permission_code = 'EDIT_COVERAGE_DEFAULTS';

-- Grouping and page-access are now derived straight from permission_code
-- (no dot = page-access permission; "PARENT.CHILD" = sub-permission of
-- PARENT) instead of being tracked in separate columns.
ALTER TABLE "Permission" DROP COLUMN "page_group";
ALTER TABLE "Permission" DROP COLUMN "is_page_access";
