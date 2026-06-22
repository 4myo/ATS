import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { useI18n } from "../lib/i18n";
import { downloadOfferPdf, openPrintableOffer, type OfferDocument } from "../lib/offerDocument";

type OfferPreviewDialogProps = {
  candidateName?: string;
  document: OfferDocument | null;
  open: boolean;
  onDocumentChange?: (document: OfferDocument) => void;
  onOpenChange: (open: boolean) => void;
};

export function OfferPreviewDialog({ candidateName, document, open, onOpenChange }: OfferPreviewDialogProps) {
  const { t, tt } = useI18n();
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!document) return;
    setIsDownloading(true);
    setError(null);
    try {
      await downloadOfferPdf(document);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : tt("PDF datoteke ni bilo mogoče ustvariti."));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle>{document?.title}</DialogTitle>
          <DialogDescription>{candidateName ? `${t("candidate")}: ${candidateName}` : t("offerDocumentPreview")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="rounded-lg border border-border bg-background p-6 shadow-sm">
            <pre className="whitespace-pre-wrap [font-family:inherit] text-sm leading-relaxed text-foreground">{document?.content}</pre>
          </div>
          {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          {document ? <>
            <Button type="button" variant="outline" onClick={() => openPrintableOffer(document)} className="gap-2"><Printer className="h-4 w-4"/>{tt("Natisni PDF")}</Button>
            <Button type="button" onClick={() => void handleDownload()} disabled={isDownloading} className="gap-2">{isDownloading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}{isDownloading ? tt("Ustvarjam PDF …") : tt("Shrani PDF")}</Button>
          </> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
