import { useEffect, useState } from "react";
import { Download, Printer, Save } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import {
  downloadOfferText,
  openPrintableOffer,
  type OfferDocument,
} from "../lib/offerDocument";
import { logActivityEvent } from "../lib/activityLog";

type OfferPreviewDialogProps = {
  candidateName?: string;
  document: OfferDocument | null;
  open: boolean;
  onDocumentChange?: (document: OfferDocument) => void;
  onOpenChange: (open: boolean) => void;
};

export function OfferPreviewDialog({
  candidateName,
  document,
  open,
  onDocumentChange,
  onOpenChange,
}: OfferPreviewDialogProps) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setContent(document?.content ?? "");
      setError(null);
    }
  }, [document, open]);

  const saveContent = async () => {
    if (!document) return;

    setIsSaving(true);
    setError(null);

    // content is encrypted at rest; write it via the RPC, keep updated_at direct.
    const { error: encError } = await supabase.rpc("offer_document_set_secure", {
      p_id: document.id,
      p_content: content,
      p_inputs: document.inputs ?? {},
    });

    if (encError) {
      setError(encError.message || t("offerDocumentSaveFailed"));
    } else {
      await supabase
        .from("offer_documents")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", document.id);
      const data = { ...document, content } as OfferDocument;
      void logActivityEvent({
        action: "offer_document_updated",
        entityType: "offer_document",
        entityId: data.id,
        entityLabel: data.title,
        toValue: data.status ?? "draft",
      });
      onDocumentChange?.(data);
    }

    setIsSaving(false);
  };

  const activeDocument = document ? { ...document, content } : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle>{document?.title}</DialogTitle>
          <DialogDescription>
            {candidateName
              ? `${t("candidate")}: ${candidateName}`
              : t("offerDocumentPreview")}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-5">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-[420px] resize-y font-sans text-sm leading-relaxed"
          />
          {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          {activeDocument ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={saveContent}
                disabled={isSaving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? t("saving") : t("saveChanges")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => openPrintableOffer(activeDocument)}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                {t("printOrSavePdf")}
              </Button>
              <Button
                type="button"
                onClick={() => downloadOfferText(activeDocument)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {t("downloadTxt")}
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
