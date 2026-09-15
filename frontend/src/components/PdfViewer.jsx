import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, Alert } from "@mui/material";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Renders a PDF blob URL inline — used everywhere a dialog needs to show a
// PDFKit-generated document (a plain <iframe src="/api/..."> can't work here
// since the endpoint requires an Authorization header, which only a JS
// fetch() can attach; the caller fetches the PDF as a Blob and passes the
// resulting object URL in here).
//
// This renders each page onto its own <canvas> via pdfjs-dist rather than
// embedding the browser's native PDF plugin in an <iframe> (the previous
// approach). That wasn't cosmetic: on mobile Chrome, the native plugin
// running inside a nested <iframe> frequently doesn't accept touch-drag
// scrolling at all — only mouse-wheel/scrollbar drag, which a touchscreen
// has neither of. A canvas rendered directly into this component's own DOM
// has no nested browsing context to fight with — it scrolls exactly like
// any other page content, touch included.
export function PdfViewer({ url, loading, error, height = "70vh" }) {
  const containerRef = useRef(null);
  const [pageCanvases, setPageCanvases] = useState([]);
  const [renderError, setRenderError] = useState("");
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!url) {
      setPageCanvases([]);
      return;
    }
    let cancelled = false;
    let pdfDoc = null;
    setRendering(true);
    setRenderError("");
    setPageCanvases([]);

    async function renderAll() {
      const containerWidth = containerRef.current?.clientWidth || 700;
      pdfDoc = await pdfjsLib.getDocument({ url }).promise;
      if (cancelled) return;

      const canvases = [];
      for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(pageNumber);
        const unscaledViewport = page.getViewport({ scale: 1 });
        // Fit the page to the container's actual width (capped at 1.5x so a
        // narrow phone screen doesn't force a blurry upscale) rather than a
        // fixed scale — the same document has to read clearly from a phone
        // to a desktop dialog.
        const scale = Math.min(containerWidth / unscaledViewport.width, 1.5);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.display = "block";
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context, viewport }).promise;
        if (cancelled) return;
        canvases.push(canvas);
      }
      if (!cancelled) setPageCanvases(canvases);
    }

    renderAll()
      .catch((err) => {
        if (!cancelled) setRenderError(err.message || "Failed to render PDF");
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
      // Guarded rather than a bare call: if the loading task's promise
      // never actually resolved to a document (e.g. the dialog closed
      // before the fetch finished, or it rejected), pdfDoc can be set to
      // something other than a real PDFDocumentProxy — nothing to destroy.
      if (pdfDoc && typeof pdfDoc.destroy === "function") pdfDoc.destroy();
    };
  }, [url]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }
  if (!url) return null;

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height,
        overflowY: "auto",
        overflowX: "hidden",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "action.hover",
        p: 1,
      }}
    >
      {renderError && <Alert severity="error">{renderError}</Alert>}
      {rendering && pageCanvases.length === 0 && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center" }}>
        {pageCanvases.map((canvas, i) => (
          <Box
            key={i}
            sx={{ width: "100%", maxWidth: canvas.width, boxShadow: 1 }}
            ref={(node) => {
              if (node && node.firstChild !== canvas) {
                node.replaceChildren(canvas);
              }
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
