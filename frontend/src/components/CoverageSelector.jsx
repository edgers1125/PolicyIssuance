import { useEffect, useState } from "react";
import { TextField, MenuItem } from "@mui/material";

// Same cascade as the Policy Application form: insurance class, then product
// variant, then coverage — instead of one long flattened dropdown.
export function CoverageSelector({ coverages, value, onChange }) {
  const selected = coverages.find((c) => c.id === value);
  const [className, setClassName] = useState(selected?.class_name || "");
  const [variantName, setVariantName] = useState(selected?.variant_name || "");

  // Stay in sync if the selected coverage was changed from outside (e.g. reset).
  useEffect(() => {
    if (selected && (selected.class_name !== className || selected.variant_name !== variantName)) {
      setClassName(selected.class_name);
      setVariantName(selected.variant_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const classNames = [...new Set(coverages.map((c) => c.class_name))];
  const variantNames = [...new Set(coverages.filter((c) => c.class_name === className).map((c) => c.variant_name))];
  const coveragesInVariant = coverages.filter(
    (c) => c.class_name === className && c.variant_name === variantName
  );

  function handleClassChange(newClassName) {
    setClassName(newClassName);
    const firstVariant = coverages.find((c) => c.class_name === newClassName)?.variant_name || "";
    setVariantName(firstVariant);
    const firstCoverage = coverages.find(
      (c) => c.class_name === newClassName && c.variant_name === firstVariant
    );
    if (firstCoverage) onChange(firstCoverage.id);
  }

  function handleVariantChange(newVariantName) {
    setVariantName(newVariantName);
    const firstCoverage = coverages.find((c) => c.class_name === className && c.variant_name === newVariantName);
    if (firstCoverage) onChange(firstCoverage.id);
  }

  return (
    <>
      <TextField select label="Insurance class" value={className} onChange={(e) => handleClassChange(e.target.value)} fullWidth>
        {classNames.map((name) => (
          <MenuItem key={name} value={name}>
            {name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="Product variant"
        value={variantName}
        onChange={(e) => handleVariantChange(e.target.value)}
        fullWidth
        disabled={!className}
      >
        {variantNames.map((name) => (
          <MenuItem key={name} value={name}>
            {name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        label="Coverage"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        fullWidth
        disabled={!variantName}
      >
        {coveragesInVariant.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.coverage_name}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}
