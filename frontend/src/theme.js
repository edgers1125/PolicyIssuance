import { createTheme, responsiveFontSizes } from "@mui/material/styles";

// Estimated from the Bethel General Insurance and Surety Corporation logo
// (navy blue shield/wordmark, orange/gold tagline). Swap these hex values
// for the official brand hex codes if/when you have a style guide.
let theme = createTheme({
  palette: {
    primary: {
      main: "#1E3A6E",
      light: "#3D5FA6",
      dark: "#14284D",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#E0932E",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#F4F6FA",
      paper: "#FFFFFF",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "Arial",
      "sans-serif",
    ].join(","),
  },
});

theme = responsiveFontSizes(theme);

export default theme;
