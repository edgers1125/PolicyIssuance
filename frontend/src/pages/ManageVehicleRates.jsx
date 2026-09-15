import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Box,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  Stack,
  TextField,
  MenuItem,
  InputAdornment,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useAuth } from "../context/AuthContext";
import { listProductVariants, updateProductVariant } from "../api/client";
import { NumberField } from "../components/NumberField";

// Percentage-shaped fields (0.10 stored/sent, shown as "10") — same
// convention as agent netrates/value-percentage tiers elsewhere in the app.
function rateToPercentDisplay(rate) {
  return rate === null || rate === undefined ? "" : Number(rate) * 100;
}
function percentDisplayToRate(display) {
  return display === "" || display === null || display === undefined ? null : Number(display) / 100;
}

const emptyForm = { deductible_rate: "", authorized_repair_limit_rate: "" };

export function ManageVehicleRates() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [variants, setVariants] = useState([]);
  const [variantId, setVariantId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [original, setOriginal] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    listProductVariants(token)
      .then((data) => {
        setVariants(data);
        if (data.length > 0) {
          selectVariant(data[0]);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function selectVariant(variant) {
    setVariantId(variant.id);
    const next = {
      deductible_rate: rateToPercentDisplay(variant.deductible_rate),
      authorized_repair_limit_rate: rateToPercentDisplay(variant.authorized_repair_limit_rate),
    };
    setForm(next);
    setOriginal(next);
    setSaved(false);
    setError("");
  }

  function handleVariantChange(newVariantId) {
    const variant = variants.find((v) => v.id === newVariantId);
    if (variant) selectVariant(variant);
  }

  const isDirty = useMemo(
    () => form.deductible_rate !== original.deductible_rate || form.authorized_repair_limit_rate !== original.authorized_repair_limit_rate,
    [form, original]
  );

  function handleCancel() {
    setForm(original);
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        deductible_rate: percentDisplayToRate(form.deductible_rate),
        authorized_repair_limit_rate: percentDisplayToRate(form.authorized_repair_limit_rate),
      };
      const updated = await updateProductVariant(token, variantId, payload);
      setOriginal(form);
      setSaved(true);
      setVariants((prev) =>
        prev.map((v) =>
          v.id === variantId
            ? { ...v, deductible_rate: updated.deductible_rate, authorized_repair_limit_rate: updated.authorized_repair_limit_rate }
            : v
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate("/settings")} edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Vehicle Rates
        </Typography>
      </Box>

      <Stack spacing={2}>
        <TextField
          select
          label="Product variant"
          value={variantId}
          onChange={(e) => handleVariantChange(e.target.value)}
          fullWidth
        >
          {variants.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.class_name} — {v.variant_name}
            </MenuItem>
          ))}
        </TextField>

        <NumberField
          label="Deductible rate"
          value={form.deductible_rate}
          onChange={(value) => setForm({ ...form, deductible_rate: value })}
          fullWidth
          helperText="% of the vehicle's current (depreciated) value — printed on the policy schedule's Section III Deductible line"
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
        />

        <NumberField
          label="Authorized repair limit rate"
          value={form.authorized_repair_limit_rate}
          onChange={(value) => setForm({ ...form, authorized_repair_limit_rate: value })}
          fullWidth
          helperText="% of the computed Deductible — printed on the policy schedule's Section III Authorized Repair Limit line"
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
        />

        <Box sx={{ display: "flex", gap: 2 }}>
          <Button variant="contained" onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          {isDirty && (
            <Button onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          )}
        </Box>

        {saved && !isDirty && <Alert severity="success">Saved.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Container>
  );
}
