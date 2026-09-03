import { TextField } from "@mui/material";

// Displays a plain numeric value with thousands separators (e.g. 1000000 -> "1,000,000")
// while typing, but reports the raw unformatted number back through onChange.
export function NumberField({ value, onChange, ...props }) {
  const displayValue = value === "" || value === null || value === undefined ? "" : Number(value).toLocaleString();

  function handleChange(e) {
    const raw = e.target.value.replace(/,/g, "");
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
      onChange(raw);
    }
  }

  return (
    <TextField
      {...props}
      type="text"
      value={displayValue}
      onChange={handleChange}
      slotProps={{ ...props.slotProps, htmlInput: { inputMode: "decimal", ...props.slotProps?.htmlInput } }}
    />
  );
}
