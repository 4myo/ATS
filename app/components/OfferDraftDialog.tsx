import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { useI18n } from "../lib/i18n";
import {
  emptyOfferInputs,
  type OfferDocument,
  type OfferInputs,
} from "../lib/offerDocument";

type OfferDraftDialogProps = {
  candidateName?: string;
  draftKey?: string;
  error?: string | null;
  initialInputs?: OfferInputs | null;
  isGenerating: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (inputs: OfferInputs) => Promise<OfferDocument | null>;
};

export function OfferDraftDialog({
  candidateName,
  draftKey,
  error,
  initialInputs,
  isGenerating,
  open,
  onOpenChange,
  onGenerate,
}: OfferDraftDialogProps) {
  const { t } = useI18n();
  const [inputs, setInputs] = useState<OfferInputs>(emptyOfferInputs);
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const storedDraft = (() => {
        if (!draftKey || typeof window === "undefined") return null;

        try {
          const raw = window.sessionStorage.getItem(draftKey);
          return raw ? (JSON.parse(raw) as Partial<OfferInputs>) : null;
        } catch {
          return null;
        }
      })();

      setInputs({ ...emptyOfferInputs, ...(initialInputs ?? {}), ...(storedDraft ?? {}) });
      setLoadedDraftKey(draftKey ?? null);
    } else {
      setLoadedDraftKey(null);
    }
  }, [draftKey, initialInputs, open]);

  useEffect(() => {
    if (
      !open ||
      !draftKey ||
      loadedDraftKey !== draftKey ||
      typeof window === "undefined"
    ) {
      return;
    }

    window.sessionStorage.setItem(draftKey, JSON.stringify(inputs));
  }, [draftKey, inputs, loadedDraftKey, open]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const updateInput = (key: keyof OfferInputs, value: string) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  const handleGenerate = async () => {
    const document = await onGenerate(inputs);
    if (document) {
      if (draftKey && typeof window !== "undefined") {
        window.sessionStorage.removeItem(draftKey);
      }
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    if (draftKey && typeof window !== "undefined") {
      window.sessionStorage.removeItem(draftKey);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle>{t("offerInputDialogTitle")}</DialogTitle>
          <DialogDescription>
            {candidateName
              ? `${t("candidate")}: ${candidateName}`
              : t("offerInputDialogSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 overflow-y-auto px-6 py-5 lg:grid-cols-2">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("offerSalary")}</Label>
              <Input
                value={inputs.salary ?? ""}
                onChange={(event) => updateInput("salary", event.target.value)}
                placeholder={t("offerSalaryPlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("offerBonus")}</Label>
              <Input
                value={inputs.bonus ?? ""}
                onChange={(event) => updateInput("bonus", event.target.value)}
                placeholder={t("offerOptionalPlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("offerContractType")}</Label>
              <Input
                value={inputs.contractType ?? ""}
                onChange={(event) => updateInput("contractType", event.target.value)}
                placeholder={t("offerContractTypePlaceholder")}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">
                  {t("offerStartDate")}
                </span>
                <Input
                  type="date"
                  min={todayIso}
                  value={inputs.startDate ?? ""}
                  onChange={(event) => updateInput("startDate", event.target.value)}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">
                  {t("offerAcceptanceDeadline")}
                </span>
                <Input
                  type="date"
                  min={todayIso}
                  value={inputs.acceptanceDeadline ?? ""}
                  onChange={(event) =>
                    updateInput("acceptanceDeadline", event.target.value)
                  }
                />
              </label>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("offerWorkModel")}</Label>
              <Input
                value={inputs.workModel ?? ""}
                onChange={(event) => updateInput("workModel", event.target.value)}
                placeholder={t("offerWorkModelPlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("offerBenefits")}</Label>
              <Textarea
                value={inputs.benefits ?? ""}
                onChange={(event) => updateInput("benefits", event.target.value)}
                placeholder={t("offerBenefitsPlaceholder")}
                className="min-h-20 resize-y"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("offerSigner")}</Label>
                <Input
                  value={inputs.signer ?? ""}
                  onChange={(event) => updateInput("signer", event.target.value)}
                  placeholder={t("offerSignerPlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("offerCompanyName")}</Label>
                <Input
                  value={inputs.companyName ?? ""}
                  onChange={(event) =>
                    updateInput("companyName", event.target.value)
                  }
                  placeholder={t("offerOptionalPlaceholder")}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("offerTone")}</Label>
              <Select
                value={inputs.tone || "warm"}
                onValueChange={(value) => updateInput("tone", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warm">{t("offerToneWarm")}</SelectItem>
                  <SelectItem value="formal">{t("offerToneFormal")}</SelectItem>
                  <SelectItem value="direct">{t("offerToneDirect")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("offerExtraNotes")}</Label>
              <Textarea
                value={inputs.extraNotes ?? ""}
                onChange={(event) => updateInput("extraNotes", event.target.value)}
                placeholder={t("offerExtraNotesPlaceholder")}
                className="min-h-20 resize-y"
              />
            </div>
          </div>
        </div>

        {error ? <p className="px-6 text-sm text-red-500">{error}</p> : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isGenerating}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="gap-2"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t("generateOffer")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
