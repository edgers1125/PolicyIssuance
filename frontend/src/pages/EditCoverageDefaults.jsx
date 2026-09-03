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
  InputAdornment,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useAuth } from "../context/AuthContext";
import { listCoverages, updateCoverage } from "../api/client";
import { CoverageSelector } from "../components/CoverageSelector";
import { NumberField } from "../components/NumberField";

function toForm(coverage) {
  return {
    standard_rate_percent: (Number(coverage.standard_rate) * 100).toString(),
    maximum_coverage: String(coverage.maximum_coverage),
  };
}

function sameValues(a, b) {
  return a.standard_rate_percent === b.standard_rate_percent && a.maximum_coverage === b.maximum_coverage;
}

export function EditCoverageDefaults() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [coverages, setCoverages] = useState([]);
  const [coverageId, setCoverageId] = useState("");
  const [form, setForm] = useState({ standard_rate_percent: "", maximum_coverage: "" });
  const [original, setOriginal] = useState({ standard_rate_percent: "", maximum_coverage: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    listCoverages(token)
      .then((data) => {
        setCoverages(data);
        if (data.length > 0) {
          setCoverageId(data[0].id);
          const values = toForm(data[0]);
          setForm(values);
          setOriginal(values);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function handleCoverageChange(newCoverageId) {
    const coverage = coverages.find((c) => c.id === newCoverageId);
    const values = coverage ? toForm(coverage) : { standard_rate_percent: "", maximum_coverage: "" };
    setCoverageId(newCoverageId);
    setForm(values);
    setOriginal(values);
    setSaved(false);
    setError("");
  }

  const isDirty = useMemo(() => !sameValues(form, original), [form, original]);

  function handleCancel() {
    setForm(original);
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        standard_rate: Number(form.standard_rate_percent) / 100,
        maximum_coverage: Number(form.maximum_coverage),
      };
      const updated = await updateCoverage(token, coverageId, payload);
      setOriginal(form);
      setSaved(true);
      setCoverages((prev) =>
        prev.map((c) =>
          c.id === coverageId
            ? { ...c, standard_rate: updated.standard_rate, maximum_coverage: updated.maximum_coverage }
            : c
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
          Edit Coverage Defaults
        </Typography>
      </Box>

      <Stack spacing={2}>
        <CoverageSelector coverages={coverages} value={coverageId} onChange={handleCoverageChange} />

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

        <TextField
          label="Standard rate"
          type="number"
          value={form.standard_rate_percent}
          onChange={(e) => setForm({ ...form, standard_rate_percent: e.target.value })}
          fullWidth
          helperText="Used whenever an agent doesn't have a custom net rate for this coverage."
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
        />
        <NumberField
          label="Maximum coverage"
          value={form.maximum_coverage}
          onChange={(v) => setForm({ ...form, maximum_coverage: v })}
          fullWidth
          helperText="Used whenever an agent doesn't have a personal maximum for this coverage."
          slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
        />
      </Stack>
    </Container>
  );
}
