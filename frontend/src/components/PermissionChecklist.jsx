import { Paper, List, ListSubheader, ListItem, ListItemIcon, ListItemText, Checkbox, Divider, Box } from "@mui/material";
import { groupPermissions } from "../utils/permissionGroups";

export function PermissionChecklist({ permissions, checkedIds, onToggle }) {
  const groups = groupPermissions(permissions);

  return (
    <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
      <List disablePadding subheader={<li />}>
        {groups.map((group, groupIndex) => (
          <Box component="li" key={group.name} sx={{ listStyle: "none" }}>
            {groupIndex > 0 && <Divider />}
            <ul style={{ padding: 0, margin: 0 }}>
              <ListSubheader
                sx={{ bgcolor: "action.hover", fontWeight: 700, lineHeight: "40px" }}
              >
                {group.name}
              </ListSubheader>
              {group.items.map((perm, index) => (
                <Box key={perm.id}>
                  {index > 0 && <Divider component="li" />}
                  <ListItem disablePadding>
                    <ListItemIcon sx={{ pl: 1 }}>
                      <Checkbox
                        edge="start"
                        checked={checkedIds.includes(perm.id)}
                        onChange={() => onToggle(perm.id)}
                      />
                    </ListItemIcon>
                    <ListItemText
                      sx={{ py: 1.5, pr: 2 }}
                      primary={`${perm.permission_name} (${perm.permission_code}):`}
                      secondary={`Description: ${perm.description || "—"}`}
                    />
                  </ListItem>
                </Box>
              ))}
            </ul>
          </Box>
        ))}
      </List>
    </Paper>
  );
}
