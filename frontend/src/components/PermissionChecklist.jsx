import { Paper, Typography, FormGroup, FormControlLabel, Checkbox, Stack } from "@mui/material";
import { groupPermissions } from "../utils/permissionGroups";

export function PermissionChecklist({ permissions, checkedIds, onToggle }) {
  const groups = groupPermissions(permissions);

  return (
    <Stack spacing={2}>
      {groups.map((group) => (
        <Paper key={group.name} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            {group.name}
          </Typography>
          <FormGroup>
            {group.items.map((perm) => (
              <FormControlLabel
                key={perm.id}
                sx={{ alignItems: "flex-start", py: 0.5 }}
                control={
                  <Checkbox
                    checked={checkedIds.includes(perm.id)}
                    onChange={() => onToggle(perm.id)}
                    sx={{ pt: 0.25 }}
                  />
                }
                label={
                  <>
                    <Typography variant="body2">{perm.permission_name}</Typography>
                    {perm.description && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {perm.description}
                      </Typography>
                    )}
                  </>
                }
              />
            ))}
          </FormGroup>
        </Paper>
      ))}
    </Stack>
  );
}
