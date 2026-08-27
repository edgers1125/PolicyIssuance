// Permissions come back from the API already sorted by page_group, then name.
export function groupPermissions(permissions) {
  const groups = [];
  for (const perm of permissions) {
    const last = groups[groups.length - 1];
    if (last && last.name === perm.page_group) {
      last.items.push(perm);
    } else {
      groups.push({ name: perm.page_group, items: [perm] });
    }
  }
  return groups;
}
