/**
 * PDFs are generated server-side and are immutable (ADR-FE-015: "no font/layout drift"). This
 * package only previews/downloads/prints a signed URL the caller already fetched via
 * `@ai-sales/api-client` — it never renders a PDF client-side, and never knows about API paths.
 */
export interface PdfPreviewAdapter {
  preview(signedUrl: string): void;
  download(signedUrl: string, filename: string): void;
}

export function createWebPdfPreviewAdapter(): PdfPreviewAdapter {
  return {
    preview(signedUrl) {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    },
    download(signedUrl, filename) {
      const link = document.createElement("a");
      link.href = signedUrl;
      link.download = filename;
      link.rel = "noopener noreferrer";
      link.click();
    },
  };
}
