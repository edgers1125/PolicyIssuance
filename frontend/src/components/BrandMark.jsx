import { Box, Typography } from "@mui/material";
import bethelLogo from "../assets/bethel-logo.png";

export function BrandMark({ size = "large" }) {
  const isLarge = size === "large";
  const shieldSize = isLarge ? 64 : 36;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: isLarge ? 1.5 : 1 }}>
      <Box
        component="img"
        src={bethelLogo}
        alt="Bethel General Insurance and Surety Corporation"
        sx={{
          width: shieldSize,
          height: shieldSize,
          objectFit: "contain",
          flexShrink: 0,
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
        {isLarge && (
          <Typography
            sx={{
              color: "secondary.main",
              fontWeight: 700,
              fontSize: "0.65rem",
              letterSpacing: 0.5,
              display: { xs: "none", sm: "block" },
            }}
          >
            GENERAL INSURANCE AND SURETY CORP.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
