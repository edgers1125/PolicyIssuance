// Permissions come back from the API already sorted by group_name, then name.
// group_name is derived server-side from the permission code's dot-prefix
// (e.g. "MANAGE_USERS.ADD_USER" groups under "Manage Users"), not a stored value.
export function groupPermissions(permissions) {
  const groups = [];
  for (const perm of permissions) {
    const last = groups[groups.length - 1];
    if (last && last.name === perm.group_name) {
      last.items.push(perm);
    } else {
      groups.push({ name: perm.group_name, items: [perm] });
    }
  }
  return groups;
}
