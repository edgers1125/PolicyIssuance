import { TextField } from "@mui/material";

// Displays a plain numeric value with thousands separators (e.g. 1000000 -> "1,000,000")
// while typing, but reports the raw unformatted number back through onChange.
//
// Only the integer part gets the toLocaleString treatment — the decimal part
// (if any) is kept exactly as typed. Running the whole string through
// Number(...).toLocaleString() would silently eat a trailing "." or trailing
// zeros (e.g. "1." -> "1", "1.10" -> "1.1"), which makes it impossible to
// type a value like "1.07" one character at a time: the "." disappears the
// instant it's typed, so the next digit lands as "10" instead of "1.0".
function formatForDisplay(value) {
  if (value === "" || value === null || value === undefined) return "";
  const [intPart, decPart] = String(value).split(".");
  const formattedInt = intPart === "" ? "" : Number(intPart).toLocaleString();
  return decPart === undefined ? formattedInt : `${formattedInt}.${decPart}`;
}

export function NumberField({ value, onChange, ...props }) {
  const displayValue = formatForDisplay(value);

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
