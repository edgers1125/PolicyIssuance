const prisma = require("./prisma");
const { HttpError } = require("./httpError");

// The four vehicle identifiers that are unique at the DB level
// (plate_number, mv_file_no, chassis_number always; engine_number whenever
// it's actually set — see Vehicle's own schema comments) — checked here
// case-insensitively (the DB's own unique indexes are plain/case-sensitive,
// so this is a stricter, friendlier pre-check in front of them, not a
// replacement; the DB index still catches an exact-case race). Each label is
// this schedule's own printed name for the field (see the PDF "Scheduled
// Vehicle table"/endorsement-title comments) so a 409 reads the way an agent
// actually sees the field on the form/document, not the raw column name.
const IDENTIFIER_FIELDS = [
  { field: "plate_number", label: "Plate No." },
  { field: "mv_file_no", label: "MV File No." },
  { field: "engine_number", label: "Motor No." },
  { field: "chassis_number", label: "Serial No." },
];

// Throws HttpError(409) naming the first colliding identifier if any of
// plate_number/mv_file_no/engine_number/chassis_number already belongs to a
// different vehicle. `excludeVehicleId` is this same vehicle's own id when
// correcting/reassigning an already-on-file row (so it doesn't flag itself).
// Blank/omitted fields are skipped — a create/update that doesn't touch a
// given identifier has nothing new to collide.
async function assertVehicleIdentifiersUnique(values, { excludeVehicleId } = {}) {
  for (const { field, label } of IDENTIFIER_FIELDS) {
    const value = values[field];
    if (!value) continue;
    const duplicate = await prisma.vehicle.findFirst({
      where: {
        [field]: { equals: value, mode: "insensitive" },
        ...(excludeVehicleId ? { id: { not: excludeVehicleId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new HttpError(409, { error: `${label} "${value}" is already on file for another vehicle` });
    }
  }
}

module.exports = { assertVehicleIdentifiersUnique };
