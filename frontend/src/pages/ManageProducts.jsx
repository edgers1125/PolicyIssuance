import { useEffect, useRef, useState } from "react";
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
  Paper,
  TextField,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Divider,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreFromTrashIcon from "@mui/icons-material/RestoreFromTrash";
import EditIcon from "@mui/icons-material/Edit";
import { useAuth } from "../context/AuthContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
import {
  listInsuranceClasses,
  createInsuranceClass,
  updateInsuranceClass,
  createProductVariant,
  updateProductVariant,
  createProductCoverage,
  updateCoverage,
  createAllowablePeriod,
  batchDeleteCatalogItems,
} from "../api/client";
import { NumberField } from "../components/NumberField";
import { CoveragePricingEditor } from "../components/CoveragePricingEditor";
import { formatPHP, formatRate } from "../utils/currency";
import { formatPeriodLabel } from "../utils/coveragePeriods";

const PRICING_MODE_OPTIONS = [
  { value: "PERCENTAGE", label: "Percentage of coverage amount" },
  { value: "VALUE_PERCENTAGE", label: "Percentage of vehicle value" },
  { value: "FLAT_TIER", label: "Fixed insured-value tiers" },
  { value: "VEHICLE_SEATS_BASED", label: "Vehicle seat count" },
];

function percentDisplayToRate(display) {
  return display === "" || display === null || display === undefined ? null : Number(display) / 100;
}
function rateToPercentDisplay(rate) {
  return rate === null || rate === undefined ? "" : String(Number(rate) * 100);
}

const emptyClassForm = { class_name: "", description: "" };
const emptyVariantForm = {
  variant_code: "",
  variant_name: "",
  description: "",
  deductible_rate: "",
  minimum_deductible_amount: "",
  misc_fee: "",
};
const emptyCoverageForm = {
  coverage_code: "",
  coverage_name: "",
  maximum_coverage: "",
  clause: "",
  pricing_mode: "PERCENTAGE",
  is_misc: false,
};
const emptyEditVariantForm = {
  variant_code: "",
  variant_name: "",
  deductible_rate: "",
  minimum_deductible_amount: "",
  misc_fee: "",
  gross_target_coverage_id: "",
};
const emptyEditCoverageForm = { coverage_code: "", coverage_name: "", clause: "", is_misc: false };

function sameForm(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function ManageProducts() {
  const { token, permissions } = useAuth();
  const navigate = useNavigate();
  const perms = permissions || [];
  const can = {
    addClass: perms.includes("MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_CLASS"),
    addVariant: perms.includes("MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_VARIANT"),
    addCoverage: perms.includes("MANAGE_SETTINGS.MANAGE_PRODUCTS.ADD_COVERAGE"),
    editDetails: perms.includes("MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_DETAILS"),
    editPricing:
      perms.includes("MANAGE_SETTINGS.MANAGE_PRODUCTS.EDIT_PRICING") ||
      perms.includes("MANAGE_SETTINGS.MANAGE_COVERAGE_PRICING"),
    editClauses: perms.includes("MANAGE_SETTINGS.EDIT_CLAUSES"),
  };
  const canEditVariant = can.editDetails || can.editPricing;
  const canEditCoverage = can.editDetails || can.editClauses || can.editPricing;

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  // Deletion (any tier, including allowable periods) is staged, not
  // immediate — clicking a delete icon just marks that row, and nothing is
  // actually removed until "Save Deletions" commits every marked id in one
  // request/transaction (see batchDeleteCatalogItems / PATCH
  // /manage-products/batch-delete). This lets an admin mark several rows
  // across several tiers in one pass before committing anything.
  const [pendingDeleteClassIds, setPendingDeleteClassIds] = useState(new Set());
  const [pendingDeleteVariantIds, setPendingDeleteVariantIds] = useState(new Set());
  const [pendingDeleteCoverageIds, setPendingDeleteCoverageIds] = useState(new Set());
  const [pendingDeletePeriodIds, setPendingDeletePeriodIds] = useState(new Set());
  const [savingDeletes, setSavingDeletes] = useState(false);

  // Create/edit dialogs — each one's `open` boolean is tracked separately
  // from its "target" (the class/variant/coverage it's scoped to, or `null`
  // for a page-level one like Add Insurance Class): closing a dialog
  // (Cancel/X/backdrop) only ever flips `open` back to false — it never
  // clears the target or the in-progress form, and every <Dialog> below is
  // `keepMounted` so React never destroys that state either. Reopening the
  // same dialog (even for the same record) shows whatever was last typed;
  // the draft is only replaced when the openXxx() function below is called
  // for a genuinely different target (tracked via a ref, since that
  // decision has to happen once per click, not on every render), or cleared
  // entirely after a successful save.
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [classForm, setClassForm] = useState(emptyClassForm);

  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [variantDialogClass, setVariantDialogClass] = useState(null);
  const [variantForm, setVariantForm] = useState(emptyVariantForm);
  const lastVariantClassIdRef = useRef(null);

  const [coverageDialogOpen, setCoverageDialogOpen] = useState(false);
  const [coverageDialogVariant, setCoverageDialogVariant] = useState(null);
  const [coverageForm, setCoverageForm] = useState(emptyCoverageForm);
  const lastCoverageVariantIdRef = useRef(null);

  // One edit dialog per tier — the fields shown inside each are gated by
  // permission (`can.*` above), not the dialog itself: a caller with only
  // one of two applicable permissions still gets the same "Edit" dialog,
  // just with fewer fields in it.
  const [editClassOpen, setEditClassOpen] = useState(false);
  const [editClassTarget, setEditClassTarget] = useState(null);
  const [editClassForm, setEditClassForm] = useState(emptyClassForm);
  const [editClassOriginalForm, setEditClassOriginalForm] = useState(emptyClassForm);
  const lastEditClassIdRef = useRef(null);

  const [editVariantOpen, setEditVariantOpen] = useState(false);
  const [editVariantTarget, setEditVariantTarget] = useState(null);
  const [editVariantForm, setEditVariantForm] = useState(emptyEditVariantForm);
  const [editVariantOriginalForm, setEditVariantOriginalForm] = useState(emptyEditVariantForm);
  const lastEditVariantIdRef = useRef(null);

  // Edit Coverage — a single Save commits both the details/clause section
  // and (if dirty) the embedded CoveragePricingEditor's own pricing section
  // together, then closes; a single Cancel reverts both back to their
  // last-loaded values, staying open; Close just leaves (draft kept).
  const [editCoverageOpen, setEditCoverageOpen] = useState(false);
  const [editCoverageTarget, setEditCoverageTarget] = useState(null);
  const [editCoverageForm, setEditCoverageForm] = useState(emptyEditCoverageForm);
  const [editCoverageOriginalForm, setEditCoverageOriginalForm] = useState(emptyEditCoverageForm);
  const lastEditCoverageIdRef = useRef(null);
  const [pricingDirty, setPricingDirty] = useState(false);
  const pricingEditorRef = useRef(null);

  // Adding an allowable period stays an immediate create (same as every
  // other "Add" action on this page) — only removal is staged, below.
  const [addPeriodOpen, setAddPeriodOpen] = useState(false);
  const [addPeriodCoverage, setAddPeriodCoverage] = useState(null);
  const [addPeriodDraft, setAddPeriodDraft] = useState("");
  const lastAddPeriodCoverageIdRef = useRef(null);

  const isClassFormDirty = classDialogOpen && !sameForm(classForm, emptyClassForm);
  const isVariantFormDirty = variantDialogOpen && !sameForm(variantForm, emptyVariantForm);
  const isCoverageFormDirty = coverageDialogOpen && !sameForm(coverageForm, emptyCoverageForm);
  const isEditClassDirty = editClassOpen && !sameForm(editClassForm, editClassOriginalForm);
  const isEditVariantDirty = editVariantOpen && !sameForm(editVariantForm, editVariantOriginalForm);
  const isEditCoverageDetailsDirty = !sameForm(editCoverageForm, editCoverageOriginalForm);
  const isEditCoverageDirty = editCoverageOpen && (isEditCoverageDetailsDirty || pricingDirty);
  const isAddPeriodDirty = addPeriodOpen && Boolean(addPeriodDraft);

  // Registered with the app-wide unsaved-changes guard (see AppLayout's
  // sidebar navigation) so switching pages while any of these dialogs has
  // unsaved input warns first, same as a browser refresh/close-tab would.
  useUnsavedChanges("manage-products", [
    isClassFormDirty,
    isVariantFormDirty,
    isCoverageFormDirty,
    isEditClassDirty,
    isEditVariantDirty,
    isEditCoverageDirty,
    isAddPeriodDirty,
  ].some(Boolean));

  // Pre-filled to "Active Only" — INACTIVE rows are soft-deleted (see
  // PATCH /manage-products/batch-delete), so hiding them by default matches
  // this page's usual "manage what's currently offered" purpose; switching
  // to "All"/"Inactive Only" is for auditing what's been removed.
  const [statusFilter, setStatusFilter] = useState("ACTIVE");

  function loadClasses() {
    setLoading(true);
    return listInsuranceClasses(token, statusFilter)
      .then(setClasses)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter]);

  // --- Create: Insurance Class ---
  // No target to key a draft off (this dialog is page-level, not scoped to
  // any record) — the form is only ever reset after a successful create, so
  // a Cancel/X/backdrop close and reopen always shows what was last typed.
  function openClassDialog() {
    setDialogError("");
    setClassDialogOpen(true);
  }
  async function handleCreateClass() {
    setDialogSaving(true);
    setDialogError("");
    try {
      await createInsuranceClass(token, {
        class_name: classForm.class_name.trim(),
        description: classForm.description.trim() || undefined,
      });
      setClassDialogOpen(false);
      setClassForm(emptyClassForm);
      await loadClasses();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setDialogSaving(false);
    }
  }

  // --- Edit: Insurance Class (one form — only field group today is "details") ---
  function openEditClass(cls) {
    if (lastEditClassIdRef.current !== cls.id) {
      const fresh = { class_name: cls.class_name, description: cls.description || "" };
      setEditClassForm(fresh);
      setEditClassOriginalForm(fresh);
      lastEditClassIdRef.current = cls.id;
    }
    setDialogError("");
    setEditClassTarget(cls);
    setEditClassOpen(true);
  }
  function handleCancelEditClass() {
    setEditClassForm(editClassOriginalForm);
    setDialogError("");
  }
  async function handleEditClass() {
    setDialogSaving(true);
    setDialogError("");
    try {
      await updateInsuranceClass(token, editClassTarget.id, {
        class_name: editClassForm.class_name.trim(),
        description: editClassForm.description.trim() || undefined,
      });
      setEditClassOpen(false);
      await loadClasses();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setDialogSaving(false);
    }
  }

  // --- Create: Product Variant ---
  function openVariantDialog(insuranceClass) {
    if (lastVariantClassIdRef.current !== insuranceClass.id) {
      setVariantForm(emptyVariantForm);
      lastVariantClassIdRef.current = insuranceClass.id;
    }
    setDialogError("");
    setVariantDialogClass(insuranceClass);
    setVariantDialogOpen(true);
  }
  async function handleCreateVariant() {
    setDialogSaving(true);
    setDialogError("");
    try {
      await createProductVariant(token, {
        insurance_class_id: variantDialogClass.id,
        variant_code: variantForm.variant_code.trim(),
        variant_name: variantForm.variant_name.trim(),
        description: variantForm.description.trim() || undefined,
        deductible_rate: percentDisplayToRate(variantForm.deductible_rate),
        minimum_deductible_amount: Number(variantForm.minimum_deductible_amount),
        misc_fee: Number(variantForm.misc_fee),
      });
      setVariantDialogOpen(false);
      setVariantForm(emptyVariantForm);
      await loadClasses();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setDialogSaving(false);
    }
  }

  // --- Edit: Product Variant (one form — details section + rates section,
  // each shown only when the caller holds the matching permission) ---
  function openEditVariant(variant) {
    if (lastEditVariantIdRef.current !== variant.id) {
      const fresh = {
        variant_code: variant.variant_code,
        variant_name: variant.variant_name,
        deductible_rate: rateToPercentDisplay(variant.deductible_rate),
        minimum_deductible_amount:
          variant.minimum_deductible_amount === null || variant.minimum_deductible_amount === undefined
            ? ""
            : String(variant.minimum_deductible_amount),
        misc_fee: variant.misc_fee === null || variant.misc_fee === undefined ? "" : String(variant.misc_fee),
        gross_target_coverage_id: variant.gross_target_coverage_id || "",
      };
      setEditVariantForm(fresh);
      setEditVariantOriginalForm(fresh);
      lastEditVariantIdRef.current = variant.id;
    }
    setDialogError("");
    setEditVariantTarget(variant);
    setEditVariantOpen(true);
  }
  function handleCancelEditVariant() {
    setEditVariantForm(editVariantOriginalForm);
    setDialogError("");
  }
  async function handleEditVariant() {
    setDialogSaving(true);
    setDialogError("");
    try {
      const payload = {};
      if (can.editDetails) {
        payload.variant_code = editVariantForm.variant_code.trim();
        payload.variant_name = editVariantForm.variant_name.trim();
      }
      if (can.editPricing) {
        payload.deductible_rate = percentDisplayToRate(editVariantForm.deductible_rate);
        payload.minimum_deductible_amount =
          editVariantForm.minimum_deductible_amount === "" ? null : Number(editVariantForm.minimum_deductible_amount);
        payload.misc_fee = editVariantForm.misc_fee === "" ? null : Number(editVariantForm.misc_fee);
        payload.gross_target_coverage_id = editVariantForm.gross_target_coverage_id || null;
      }
      await updateProductVariant(token, editVariantTarget.id, payload);
      setEditVariantOpen(false);
      await loadClasses();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setDialogSaving(false);
    }
  }

  // --- Create: Coverage ---
  function openCoverageDialog(variant) {
    if (lastCoverageVariantIdRef.current !== variant.id) {
      setCoverageForm(emptyCoverageForm);
      lastCoverageVariantIdRef.current = variant.id;
    }
    setDialogError("");
    setCoverageDialogVariant(variant);
    setCoverageDialogOpen(true);
  }
  async function handleCreateCoverage() {
    setDialogSaving(true);
    setDialogError("");
    try {
      await createProductCoverage(token, {
        product_variant_id: coverageDialogVariant.id,
        coverage_code: coverageForm.coverage_code.trim(),
        coverage_name: coverageForm.coverage_name.trim(),
        maximum_coverage: Number(coverageForm.maximum_coverage),
        clause: coverageForm.clause.trim(),
        pricing_mode: coverageForm.pricing_mode,
        is_misc: coverageForm.is_misc,
      });
      setCoverageDialogOpen(false);
      setCoverageForm(emptyCoverageForm);
      await loadClasses();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setDialogSaving(false);
    }
  }

  // --- Edit: Coverage — one Save commits whichever of the details/clause
  // section (PATCH /coverages/:id) and the embedded CoveragePricingEditor's
  // own pricing section are actually dirty, then closes the whole dialog;
  // one Cancel reverts both back to their last-loaded values and stays
  // open; Close just leaves (the draft is kept, same as every dialog here). ---
  function openEditCoverage(cov, variant, cls) {
    if (lastEditCoverageIdRef.current !== cov.id) {
      const fresh = {
        coverage_code: cov.coverage_code,
        coverage_name: cov.coverage_name,
        clause: cov.clause || "",
        is_misc: Boolean(cov.is_misc),
      };
      setEditCoverageForm(fresh);
      setEditCoverageOriginalForm(fresh);
      lastEditCoverageIdRef.current = cov.id;
    }
    setDialogError("");
    setEditCoverageTarget({ ...cov, __ctx: variant, __cls: cls });
    setEditCoverageOpen(true);
  }
  function handleCancelEditCoverage() {
    setEditCoverageForm(editCoverageOriginalForm);
    pricingEditorRef.current?.cancel();
    setDialogError("");
  }
  async function handleSaveEditCoverage() {
    setDialogSaving(true);
    setDialogError("");
    try {
      if ((can.editDetails || can.editClauses) && isEditCoverageDetailsDirty) {
        const payload = {};
        if (can.editDetails) {
          payload.coverage_code = editCoverageForm.coverage_code.trim();
          payload.coverage_name = editCoverageForm.coverage_name.trim();
          payload.is_misc = editCoverageForm.is_misc;
        }
        if (can.editClauses) {
          payload.clause = editCoverageForm.clause;
        }
        await updateCoverage(token, editCoverageTarget.id, payload);
        setEditCoverageOriginalForm(editCoverageForm);
      }
      if (can.editPricing && pricingDirty) {
        const ok = await pricingEditorRef.current?.save();
        if (!ok) return;
      }
      await loadClasses();
      setEditCoverageOpen(false);
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setDialogSaving(false);
    }
  }

  // --- Allowable periods (row-level add/remove) ---
  function openAddPeriod(cov) {
    if (lastAddPeriodCoverageIdRef.current !== cov.id) {
      setAddPeriodDraft("");
      lastAddPeriodCoverageIdRef.current = cov.id;
    }
    setDialogError("");
    setAddPeriodCoverage(cov);
    setAddPeriodOpen(true);
  }
  async function handleAddPeriod() {
    const days = Number(addPeriodDraft);
    if (!Number.isInteger(days) || days <= 0) {
      setDialogError("Enter a whole number of days greater than 0");
      return;
    }
    setDialogSaving(true);
    setDialogError("");
    try {
      await createAllowablePeriod(token, addPeriodCoverage.id, days);
      setAddPeriodOpen(false);
      setAddPeriodDraft("");
      await loadClasses();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setDialogSaving(false);
    }
  }
  // --- Staged deletes: toggle a row's id in/out of the relevant pending set;
  // nothing is actually deleted until handleSaveDeletes commits the whole
  // batch. Marking a class/variant also visually (and, on Save, actually)
  // cascades to everything under it — isVariantPending/isCoveragePending
  // below fold that in, so a coverage under a pending variant already shows
  // as pending even though its own id was never added to any set. ---
  function toggleSetId(setter, id) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const toggleClassDelete = (id) => toggleSetId(setPendingDeleteClassIds, id);
  const toggleVariantDelete = (id) => toggleSetId(setPendingDeleteVariantIds, id);
  const toggleCoverageDelete = (id) => toggleSetId(setPendingDeleteCoverageIds, id);
  const togglePeriodDelete = (id) => toggleSetId(setPendingDeletePeriodIds, id);

  function isClassPending(cls) {
    return pendingDeleteClassIds.has(cls.id);
  }
  function isVariantPending(cls, variant) {
    return pendingDeleteVariantIds.has(variant.id) || isClassPending(cls);
  }
  function isCoveragePending(cls, variant, cov) {
    return pendingDeleteCoverageIds.has(cov.id) || isVariantPending(cls, variant);
  }

  const totalPendingDeletes =
    pendingDeleteClassIds.size + pendingDeleteVariantIds.size + pendingDeleteCoverageIds.size + pendingDeletePeriodIds.size;

  function discardPendingDeletes() {
    setPendingDeleteClassIds(new Set());
    setPendingDeleteVariantIds(new Set());
    setPendingDeleteCoverageIds(new Set());
    setPendingDeletePeriodIds(new Set());
  }

  async function handleSaveDeletes() {
    setSavingDeletes(true);
    setError("");
    try {
      await batchDeleteCatalogItems(token, {
        class_ids: Array.from(pendingDeleteClassIds),
        variant_ids: Array.from(pendingDeleteVariantIds),
        coverage_ids: Array.from(pendingDeleteCoverageIds),
        period_ids: Array.from(pendingDeletePeriodIds),
      });
      discardPendingDeletes();
      await loadClasses();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDeletes(false);
    }
  }

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 6, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <IconButton onClick={() => navigate("/settings")} edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Manage Products
        </Typography>
        {can.addClass && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openClassDialog}>
            Add Insurance Class
          </Button>
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Create, edit, or remove insurance classes, product variants, and coverages — each "Edit" opens one form
        whose fields depend on your own permissions. Deleting anything is staged: mark as many rows as you like,
        then Save to commit them all together.
      </Typography>

      <TextField
        select
        label="Status"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        size="small"
        sx={{ minWidth: 220, mb: 3 }}
        helperText="Inactive rows are soft-deleted (Save Deletions) — shown here only for reference."
      >
        <MenuItem value="ACTIVE">Active only</MenuItem>
        <MenuItem value="INACTIVE">Inactive only</MenuItem>
        <MenuItem value="ALL">All</MenuItem>
      </TextField>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {totalPendingDeletes > 0 && (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ mb: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={discardPendingDeletes} disabled={savingDeletes}>
                Discard
              </Button>
              <Button size="small" variant="contained" color="warning" onClick={handleSaveDeletes} disabled={savingDeletes}>
                {savingDeletes ? "Saving..." : "Save Deletions"}
              </Button>
            </Stack>
          }
        >
          {totalPendingDeletes} item{totalPendingDeletes === 1 ? "" : "s"} marked for deletion — nothing is removed
          until you save.
        </Alert>
      )}

      {classes.length === 0 && <Alert severity="info">No insurance classes yet.</Alert>}

      <Stack spacing={2}>
        {classes.map((cls) => {
          const classPending = isClassPending(cls);
          return (
          <Paper key={cls.id} sx={{ borderRadius: 3, p: 2, opacity: classPending ? 0.5 : 1 }}>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5, flexWrap: "wrap" }}>
              <Box sx={{ flexGrow: 1, minWidth: 160 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, textDecoration: classPending ? "line-through" : "none" }}>
                  {cls.class_name}{" "}
                  {cls.status === "INACTIVE" && <Chip size="small" color="default" label="Inactive" />}
                </Typography>
                {cls.description && (
                  <Typography variant="body2" color="text.secondary">
                    {cls.description}
                  </Typography>
                )}
                {classPending && (
                  <Typography variant="caption" color="warning.main">
                    Marked for deletion, along with everything under it
                  </Typography>
                )}
              </Box>
              {can.editDetails && (
                <IconButton size="small" onClick={() => openEditClass(cls)} title="Edit class" disabled={classPending}>
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
              {can.addVariant && (
                <Button size="small" startIcon={<AddIcon />} onClick={() => openVariantDialog(cls)} disabled={classPending}>
                  Add Variant
                </Button>
              )}
              {can.addClass && (
                <IconButton
                  edge="end"
                  onClick={() => toggleClassDelete(cls.id)}
                  title={classPending ? "Undo delete" : "Mark for deletion"}
                  color={classPending ? "default" : "error"}
                >
                  {classPending ? <RestoreFromTrashIcon /> : <DeleteIcon />}
                </IconButton>
              )}
            </Box>

            {cls.product_variants.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, ml: 1 }}>
                No product variants yet.
              </Typography>
            ) : (
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                {cls.product_variants.map((variant) => {
                  const variantPending = isVariantPending(cls, variant);
                  const variantDirectlyPending = pendingDeleteVariantIds.has(variant.id);
                  return (
                  <Paper
                    key={variant.id}
                    variant="outlined"
                    sx={{ borderRadius: 2, p: 1.5, ml: { xs: 0, sm: 2 }, opacity: variantPending ? 0.5 : 1 }}
                  >
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5, flexWrap: "wrap" }}>
                      <Box sx={{ flexGrow: 1, minWidth: 160 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 600, textDecoration: variantPending ? "line-through" : "none" }}
                        >
                          {variant.variant_name}{" "}
                          <Typography component="span" variant="body2" color="text.secondary">
                            ({variant.variant_code})
                          </Typography>
                          {variant.status === "INACTIVE" && <Chip size="small" color="default" label="Inactive" sx={{ ml: 1 }} />}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
                          <Chip
                            size="small"
                            label={`Deductible: ${variant.deductible_rate !== null ? formatRate(variant.deductible_rate) : "not set"}`}
                          />
                          <Chip
                            size="small"
                            label={`Min. deductible: ${variant.minimum_deductible_amount !== null ? formatPHP(variant.minimum_deductible_amount) : "not set"}`}
                          />
                          <Chip
                            size="small"
                            label={`Misc. fee: ${variant.misc_fee !== null ? formatPHP(variant.misc_fee) : "not set"}`}
                          />
                          {variant.gross_target_coverage_id && (
                            <Chip
                              size="small"
                              color="info"
                              label={`Gross target: ${
                                variant.product_coverages.find((c) => c.id === variant.gross_target_coverage_id)
                                  ?.coverage_name || "configured"
                              }`}
                            />
                          )}
                        </Stack>
                        {variantPending && (
                          <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.5 }}>
                            {variantDirectlyPending
                              ? "Marked for deletion, along with everything under it"
                              : "Will be removed with its insurance class"}
                          </Typography>
                        )}
                      </Box>
                      {canEditVariant && (
                        <IconButton
                          size="small"
                          onClick={() => openEditVariant(variant)}
                          title="Edit variant"
                          disabled={variantPending}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                      {can.addCoverage && (
                        <Button
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => openCoverageDialog(variant)}
                          disabled={variantPending}
                        >
                          Add Coverage
                        </Button>
                      )}
                      {can.addVariant && (
                        <IconButton
                          edge="end"
                          onClick={() => toggleVariantDelete(variant.id)}
                          title={variantDirectlyPending ? "Undo delete" : "Mark for deletion"}
                          color={variantDirectlyPending ? "default" : "error"}
                          disabled={variantPending && !variantDirectlyPending}
                        >
                          {variantDirectlyPending ? <RestoreFromTrashIcon /> : <DeleteIcon />}
                        </IconButton>
                      )}
                    </Box>

                    {variant.product_coverages.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, ml: 1 }}>
                        No coverages yet.
                      </Typography>
                    ) : (
                      <Stack spacing={1} sx={{ mt: 1.5 }}>
                        {variant.product_coverages.map((cov, idx) => {
                          const coveragePending = isCoveragePending(cls, variant, cov);
                          const coverageDirectlyPending = pendingDeleteCoverageIds.has(cov.id);
                          return (
                          <Box key={cov.id} sx={{ opacity: coveragePending ? 0.5 : 1 }}>
                            {idx > 0 && <Divider sx={{ mb: 1 }} />}
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                flexWrap: "wrap",
                                ml: { xs: 0, sm: 2 },
                              }}
                            >
                              <Box sx={{ flexGrow: 1, minWidth: 160 }}>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 600, textDecoration: coveragePending ? "line-through" : "none" }}
                                >
                                  {cov.coverage_name}{" "}
                                  <Typography component="span" variant="caption" color="text.secondary">
                                    ({cov.coverage_code})
                                  </Typography>
                                  {cov.status === "INACTIVE" && <Chip size="small" color="default" label="Inactive" sx={{ ml: 1 }} />}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  Max: {formatPHP(cov.maximum_coverage)} ·{" "}
                                  {PRICING_MODE_OPTIONS.find((m) => m.value === cov.pricing_mode)?.label || cov.pricing_mode}
                                </Typography>
                                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
                                  {(cov.allowable_periods || []).length === 0 && (
                                    <Chip size="small" variant="outlined" label="No allowable periods yet" />
                                  )}
                                  {(cov.allowable_periods || []).map((p) => {
                                    const periodPending = pendingDeletePeriodIds.has(p.id);
                                    return (
                                      <Chip
                                        key={p.id}
                                        size="small"
                                        variant={periodPending ? "filled" : "outlined"}
                                        color={periodPending ? "warning" : "default"}
                                        label={formatPeriodLabel(p.coverage_in_days)}
                                        sx={{ textDecoration: periodPending ? "line-through" : "none" }}
                                        onDelete={can.editPricing ? () => togglePeriodDelete(p.id) : undefined}
                                        deleteIcon={periodPending ? <RestoreFromTrashIcon /> : undefined}
                                      />
                                    );
                                  })}
                                  {can.editPricing && (
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      icon={<AddIcon fontSize="small" />}
                                      label="Add period"
                                      onClick={() => openAddPeriod(cov)}
                                    />
                                  )}
                                </Stack>
                              </Box>
                              {canEditCoverage && (
                                <IconButton
                                  size="small"
                                  onClick={() => openEditCoverage(cov, variant, cls)}
                                  title="Edit coverage"
                                  disabled={coveragePending}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              )}
                              {can.addCoverage && (
                                <IconButton
                                  size="small"
                                  onClick={() => toggleCoverageDelete(cov.id)}
                                  title={coverageDirectlyPending ? "Undo delete" : "Mark for deletion"}
                                  color={coverageDirectlyPending ? "default" : "error"}
                                  disabled={coveragePending && !coverageDirectlyPending}
                                >
                                  {coverageDirectlyPending ? (
                                    <RestoreFromTrashIcon fontSize="small" />
                                  ) : (
                                    <DeleteIcon fontSize="small" />
                                  )}
                                </IconButton>
                              )}
                            </Box>
                          </Box>
                          );
                        })}
                      </Stack>
                    )}
                  </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>
          );
        })}
      </Stack>

      {/* Add Insurance Class */}
      <Dialog open={classDialogOpen} onClose={() => setClassDialogOpen(false)} fullWidth maxWidth="xs" keepMounted>
        <DialogTitle>Add Insurance Class</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <TextField
              label="Class name"
              value={classForm.class_name}
              onChange={(e) => setClassForm({ ...classForm, class_name: e.target.value })}
              fullWidth
              autoFocus
            />
            <TextField
              label="Description (optional)"
              value={classForm.description}
              onChange={(e) => setClassForm({ ...classForm, description: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClassDialogOpen(false)} disabled={dialogSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateClass}
            disabled={dialogSaving || !classForm.class_name.trim()}
          >
            {dialogSaving ? "Adding..." : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Insurance Class — one form, one permission group (EDIT_DETAILS) */}
      <Dialog open={editClassOpen} onClose={() => setEditClassOpen(false)} fullWidth maxWidth="xs" keepMounted>
        <DialogTitle>Edit Class{editClassTarget ? ` — ${editClassTarget.class_name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            {can.editDetails ? (
              <>
                <TextField
                  label="Class name"
                  value={editClassForm.class_name}
                  onChange={(e) => setEditClassForm({ ...editClassForm, class_name: e.target.value })}
                  fullWidth
                  autoFocus
                />
                <TextField
                  label="Description (optional)"
                  value={editClassForm.description}
                  onChange={(e) => setEditClassForm({ ...editClassForm, description: e.target.value })}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </>
            ) : (
              <Alert severity="info">You don't have permission to edit any fields on this class.</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditClassOpen(false)} disabled={dialogSaving}>
            Close
          </Button>
          {can.editDetails && isEditClassDirty && (
            <Button onClick={handleCancelEditClass} disabled={dialogSaving}>
              Cancel
            </Button>
          )}
          {can.editDetails && (
            <Button
              variant="contained"
              onClick={handleEditClass}
              disabled={dialogSaving || !isEditClassDirty || !editClassForm.class_name.trim()}
            >
              {dialogSaving ? "Saving..." : "Save"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Product Variant */}
      <Dialog open={variantDialogOpen} onClose={() => setVariantDialogOpen(false)} fullWidth maxWidth="xs" keepMounted>
        <DialogTitle>Add Product Variant{variantDialogClass ? ` — ${variantDialogClass.class_name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <TextField
              label="Variant code"
              value={variantForm.variant_code}
              onChange={(e) => setVariantForm({ ...variantForm, variant_code: e.target.value })}
              fullWidth
              autoFocus
            />
            <TextField
              label="Variant name"
              value={variantForm.variant_name}
              onChange={(e) => setVariantForm({ ...variantForm, variant_name: e.target.value })}
              fullWidth
            />
            <TextField
              label="Description (optional)"
              value={variantForm.description}
              onChange={(e) => setVariantForm({ ...variantForm, description: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
            <NumberField
              label="Deductible rate"
              value={variantForm.deductible_rate}
              onChange={(value) => setVariantForm({ ...variantForm, deductible_rate: value })}
              fullWidth
              helperText="% of the vehicle's current (depreciated) value — the authorized repair limit is this plus a fixed ₱500 towing amount"
              slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
            />
            <NumberField
              label="Minimum deductible amount"
              value={variantForm.minimum_deductible_amount}
              onChange={(value) => setVariantForm({ ...variantForm, minimum_deductible_amount: value })}
              fullWidth
              helperText="Floor under the deductible rate's own computed figure — the printed deductible is whichever is higher"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
            />
            <NumberField
              label="Miscellaneous fee"
              value={variantForm.misc_fee}
              onChange={(value) => setVariantForm({ ...variantForm, misc_fee: value })}
              fullWidth
              helperText="Flat charge every application/quotation filed under this variant carries — 0 if none"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVariantDialogOpen(false)} disabled={dialogSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateVariant}
            disabled={
              dialogSaving ||
              !variantForm.variant_code.trim() ||
              !variantForm.variant_name.trim() ||
              variantForm.deductible_rate === "" ||
              variantForm.minimum_deductible_amount === "" ||
              variantForm.misc_fee === ""
            }
          >
            {dialogSaving ? "Adding..." : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Product Variant — one form: details section (EDIT_DETAILS) +
          rates section (EDIT_PRICING or MANAGE_COVERAGE_PRICING), each shown
          only when held; saved together in one PATCH. */}
      <Dialog open={editVariantOpen} onClose={() => setEditVariantOpen(false)} fullWidth maxWidth="xs" keepMounted>
        <DialogTitle>Edit Variant{editVariantTarget ? ` — ${editVariantTarget.variant_name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            {can.editDetails && (
              <>
                <TextField
                  label="Variant code"
                  value={editVariantForm.variant_code}
                  onChange={(e) => setEditVariantForm({ ...editVariantForm, variant_code: e.target.value })}
                  fullWidth
                  autoFocus
                />
                <TextField
                  label="Variant name"
                  value={editVariantForm.variant_name}
                  onChange={(e) => setEditVariantForm({ ...editVariantForm, variant_name: e.target.value })}
                  fullWidth
                />
              </>
            )}
            {can.editDetails && can.editPricing && <Divider />}
            {can.editPricing && (
              <>
                <NumberField
                  label="Deductible rate"
                  value={editVariantForm.deductible_rate}
                  onChange={(value) => setEditVariantForm({ ...editVariantForm, deductible_rate: value })}
                  fullWidth
                  helperText="% of the vehicle's current (depreciated) value — the authorized repair limit is this plus a fixed ₱500 towing amount"
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                />
                <NumberField
                  label="Minimum deductible amount"
                  value={editVariantForm.minimum_deductible_amount}
                  onChange={(value) => setEditVariantForm({ ...editVariantForm, minimum_deductible_amount: value })}
                  fullWidth
                  helperText="Floor under the deductible rate's own computed figure — the printed deductible is whichever is higher"
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                />
                <NumberField
                  label="Miscellaneous fee"
                  value={editVariantForm.misc_fee}
                  onChange={(value) => setEditVariantForm({ ...editVariantForm, misc_fee: value })}
                  fullWidth
                  helperText="Flat charge every application/quotation filed under this variant carries — blank clears back to unconfigured (₱0)"
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                />
                <TextField
                  select
                  label="Gross Target Coverage (optional)"
                  value={editVariantForm.gross_target_coverage_id}
                  onChange={(e) => setEditVariantForm({ ...editVariantForm, gross_target_coverage_id: e.target.value })}
                  fullWidth
                  helperText="Lets the intake wizards solve this coverage's premium backward from an agent-entered target gross total, instead of it being entered directly. Only vehicle-value-based coverages are eligible."
                >
                  <MenuItem value="">None — always priced/entered normally</MenuItem>
                  {(editVariantTarget?.product_coverages || [])
                    .filter((c) => c.pricing_mode === "VALUE_PERCENTAGE")
                    .map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.coverage_name}
                      </MenuItem>
                    ))}
                </TextField>
              </>
            )}
            {!canEditVariant && <Alert severity="info">You don't have permission to edit any fields on this variant.</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditVariantOpen(false)} disabled={dialogSaving}>
            Close
          </Button>
          {canEditVariant && isEditVariantDirty && (
            <Button onClick={handleCancelEditVariant} disabled={dialogSaving}>
              Cancel
            </Button>
          )}
          {canEditVariant && (
            <Button variant="contained" onClick={handleEditVariant} disabled={dialogSaving || !isEditVariantDirty}>
              {dialogSaving ? "Saving..." : "Save"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Coverage */}
      <Dialog open={coverageDialogOpen} onClose={() => setCoverageDialogOpen(false)} fullWidth maxWidth="xs" keepMounted>
        <DialogTitle>Add Coverage{coverageDialogVariant ? ` — ${coverageDialogVariant.variant_name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <TextField
              label="Coverage code"
              value={coverageForm.coverage_code}
              onChange={(e) => setCoverageForm({ ...coverageForm, coverage_code: e.target.value })}
              fullWidth
              autoFocus
            />
            <TextField
              label="Coverage name"
              value={coverageForm.coverage_name}
              onChange={(e) => setCoverageForm({ ...coverageForm, coverage_name: e.target.value })}
              fullWidth
            />
            <NumberField
              label="Maximum coverage"
              value={coverageForm.maximum_coverage}
              onChange={(value) => setCoverageForm({ ...coverageForm, maximum_coverage: value })}
              fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
            />
            <TextField
              select
              label="Pricing mode"
              value={coverageForm.pricing_mode}
              onChange={(e) => setCoverageForm({ ...coverageForm, pricing_mode: e.target.value })}
              fullWidth
            >
              {PRICING_MODE_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Clause text"
              value={coverageForm.clause}
              onChange={(e) => setCoverageForm({ ...coverageForm, clause: e.target.value })}
              fullWidth
              multiline
              minRows={4}
              helperText="Printed on the policy schedule's 'Warranties and Clauses' page whenever this coverage is selected. Allowable periods and their rate/tier pricing are set afterward, from this same page's Edit action."
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={coverageForm.is_misc}
                  onChange={(e) => setCoverageForm({ ...coverageForm, is_misc: e.target.checked })}
                />
              }
              label="Fold this coverage's premium into Miscellaneous instead of Premium"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCoverageDialogOpen(false)} disabled={dialogSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateCoverage}
            disabled={
              dialogSaving ||
              !coverageForm.coverage_code.trim() ||
              !coverageForm.coverage_name.trim() ||
              !coverageForm.maximum_coverage ||
              !coverageForm.clause.trim()
            }
          >
            {dialogSaving ? "Adding..." : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Coverage — one dialog: details section (EDIT_DETAILS) + clause
          section (EDIT_CLAUSES) share a single PATCH; pricing — maximum
          coverage, allowable periods, pricing mode, rate/tiers (EDIT_PRICING
          or MANAGE_COVERAGE_PRICING) — is the embedded CoveragePricingEditor,
          driven here via its own ref rather than its own Save/Cancel row
          (`hideActions`), since this dialog now has a single, unified
          Save/Cancel/Close bar at the bottom for both sections together —
          Save commits whichever section(s) are dirty and closes, Cancel
          reverts both and stays open, Close just leaves (draft kept). */}
      <Dialog open={editCoverageOpen} onClose={() => setEditCoverageOpen(false)} fullWidth maxWidth="sm" keepMounted>
        <DialogTitle>Edit Coverage{editCoverageTarget ? ` — ${editCoverageTarget.coverage_name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            {(can.editDetails || can.editClauses) && (
              <>
                {can.editDetails && (
                  <>
                    <TextField
                      label="Coverage code"
                      value={editCoverageForm.coverage_code}
                      onChange={(e) => setEditCoverageForm({ ...editCoverageForm, coverage_code: e.target.value })}
                      fullWidth
                      autoFocus
                    />
                    <TextField
                      label="Coverage name"
                      value={editCoverageForm.coverage_name}
                      onChange={(e) => setEditCoverageForm({ ...editCoverageForm, coverage_name: e.target.value })}
                      fullWidth
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={editCoverageForm.is_misc}
                          onChange={(e) => setEditCoverageForm({ ...editCoverageForm, is_misc: e.target.checked })}
                        />
                      }
                      label="Fold this coverage's premium into Miscellaneous instead of Premium"
                    />
                  </>
                )}
                {can.editClauses && (
                  <TextField
                    label="Clause text"
                    value={editCoverageForm.clause}
                    onChange={(e) => setEditCoverageForm({ ...editCoverageForm, clause: e.target.value })}
                    fullWidth
                    multiline
                    minRows={4}
                    helperText="Printed on the policy schedule's 'Warranties and Clauses' page whenever this coverage is selected."
                  />
                )}
              </>
            )}

            {(can.editDetails || can.editClauses) && can.editPricing && <Divider />}

            {can.editPricing && editCoverageTarget && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                  Pricing
                </Typography>
                <CoveragePricingEditor
                  ref={pricingEditorRef}
                  key={editCoverageTarget.id}
                  token={token}
                  coverage={editCoverageTarget}
                  contextLabel={`Insurance class: ${editCoverageTarget.__cls?.class_name} · Product variant: ${editCoverageTarget.__ctx?.variant_name} · Coverage: ${editCoverageTarget.coverage_name}`}
                  onChanged={loadClasses}
                  onDirtyChange={setPricingDirty}
                  hideActions
                />
              </Box>
            )}

            {!canEditCoverage && (
              <Alert severity="info">You don't have permission to edit any fields on this coverage.</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCoverageOpen(false)} disabled={dialogSaving}>
            Close
          </Button>
          {canEditCoverage && isEditCoverageDirty && (
            <Button onClick={handleCancelEditCoverage} disabled={dialogSaving}>
              Cancel
            </Button>
          )}
          {canEditCoverage && (
            <Button
              variant="contained"
              onClick={handleSaveEditCoverage}
              disabled={
                dialogSaving ||
                !isEditCoverageDirty ||
                (can.editDetails &&
                  isEditCoverageDetailsDirty &&
                  (!editCoverageForm.coverage_code.trim() || !editCoverageForm.coverage_name.trim()))
              }
            >
              {dialogSaving ? "Saving..." : "Save"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Allowable Period — the row-level "+" chip's dialog */}
      <Dialog open={addPeriodOpen} onClose={() => setAddPeriodOpen(false)} fullWidth maxWidth="xs" keepMounted>
        <DialogTitle>Add Allowable Period{addPeriodCoverage ? ` — ${addPeriodCoverage.coverage_name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <NumberField
              label="Number of days"
              value={addPeriodDraft}
              onChange={setAddPeriodDraft}
              fullWidth
              autoFocus
              helperText="A brand-new period starts with no pricing configured — set its rate/tiers next via this coverage's Edit action."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddPeriodOpen(false)} disabled={dialogSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleAddPeriod} disabled={dialogSaving || !addPeriodDraft}>
            {dialogSaving ? "Adding..." : "Add period"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
