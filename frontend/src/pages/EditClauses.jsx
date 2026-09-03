import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Typography, Box, Button, IconButton, Alert, CircularProgress, Stack, TextField } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useAuth } from "../context/AuthContext";
import { listCoverages, updateCoverage } from "../api/client";
import { CoverageSelector } from "../components/CoverageSelector";

export function EditClauses() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [coverages, setCoverages] = useState([]);
  const [coverageId, setCoverageId] = useState("");
  const [clause, setClause] = useState("");
  const [originalClause, setOriginalClause] = useState("");
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
          setClause(data[0].clause);
          setOriginalClause(data[0].clause);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function handleCoverageChange(newCoverageId) {
    const coverage = coverages.find((c) => c.id === newCoverageId);
    setCoverageId(newCoverageId);
    setClause(coverage ? coverage.clause : "");
    setOriginalClause(coverage ? coverage.clause : "");
    setSaved(false);
    setError("");
  }

  const isDirty = useMemo(() => clause !== originalClause, [clause, originalClause]);

  function handleCancel() {
    setClause(originalClause);
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateCoverage(token, coverageId, { clause });
      setOriginalClause(clause);
      setSaved(true);
      setCoverages((prev) => prev.map((c) => (c.id === coverageId ? { ...c, clause } : c)));
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
          Edit Clauses
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
          label="Clause text"
          value={clause}
          onChange={(e) => setClause(e.target.value)}
          fullWidth
          multiline
          minRows={10}
          helperText="Printed on the policy schedule's 'Warranties and Clauses' page whenever this coverage is selected."
        />
      </Stack>
    </Container>
  );
}
