import { Box, Typography } from "@mui/material";
import bethelLogo from "../assets/bethel-logo.png";

// monochrome (used on the top nav bar's own navy background) renders the
// shield as a flat white silhouette instead of its full-color artwork —
// brightness(0) crushes every pixel to black first (so color/alpha edges
// stay crisp), invert(1) then flips that to white; a plain grayscale filter
// would leave the logo's own colors muddy on a navy backdrop instead of
// reading as a clean reversed-out mark.
export function BrandMark({ size = "large", monochrome = false }) {
  const isLarge = size === "large";
  const shieldSize = isLarge ? 64 : 36;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: isLarge ? 1.5 : 1 }}>
      <Box
        component="img"
        src={bethelLogo}
        alt="Bethel Life and General Insurance Corporation"
        sx={{
          width: shieldSize,
          height: shieldSize,
          objectFit: "contain",
          flexShrink: 0,
          filter: monochrome ? "brightness(0) invert(1)" : "none",
        }}
      />
      <Box sx={{ textAlign: "left" }}>
        <Typography
          sx={{
            fontWeight: 800,
            letterSpacing: 1,
            color: "primary.main",
            fontSize: isLarge ? "1.8rem" : "1.1rem",
            lineHeight: 1,
          }}
        >
          BETHEL
        </Typography>
        <Typography
          sx={{
            color: "secondary.main",
            fontWeight: 700,
            fontSize: isLarge ? "0.65rem" : "0.55rem",
            letterSpacing: 0.5,
            lineHeight: 1.2,
            display: { xs: "none", sm: "block" },
          }}
        >
          Life and General Insurance Corporation
        </Typography>
      </Box>
    </Box>
  );
}
