export type OfferDocument = {
  id: string;
  title: string;
  content: string;
  inputs?: OfferInputs | null;
  status?: string | null;
  created_at?: string | null;
};

export type OfferInputs = {
  salary?: string;
  bonus?: string;
  contractType?: string;
  startDate?: string;
  workModel?: string;
  benefits?: string;
  acceptanceDeadline?: string;
  signer?: string;
  companyName?: string;
  extraNotes?: string;
  tone?: string;
};

export const emptyOfferInputs: OfferInputs = {
  salary: "",
  bonus: "",
  contractType: "",
  startDate: "",
  workModel: "",
  benefits: "",
  acceptanceDeadline: "",
  signer: "",
  companyName: "",
  extraNotes: "",
  tone: "warm",
};

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "offer-document";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const downloadOfferText = (document: OfferDocument) => {
  const blob = new Blob([document.content], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");

  anchor.href = url;
  anchor.download = `${sanitizeFileName(document.title)}.txt`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const openPrintableOffer = (document: OfferDocument) => {
  const printableHtml = `<!doctype html>
<html lang="sl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      body {
        color: #111827;
        font-family: Arial, sans-serif;
        line-height: 1.55;
        margin: 0;
        padding: 48px;
      }
      * {
        box-sizing: border-box;
      }
      main {
        margin: 0 auto;
        max-width: 760px;
      }
      h1 {
        font-size: 24px;
        margin: 0 0 24px;
      }
      pre {
        font-family: inherit;
        white-space: pre-wrap;
        word-break: break-word;
      }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(document.title)}</h1>
      <pre>${escapeHtml(document.content)}</pre>
    </main>
    <script>
      window.addEventListener("load", () => {
        window.setTimeout(() => window.print(), 350);
      });
    </script>
  </body>
</html>`;

  const blob = new Blob([printableHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank");

  if (!printWindow) {
    URL.revokeObjectURL(url);
    return false;
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return true;
};
