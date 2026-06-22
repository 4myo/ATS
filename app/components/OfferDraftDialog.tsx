import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, FolderOpen, Loader2, Palette, Save, Upload, Wand2 } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Progress } from "./ui/progress";
import { useI18n } from "../lib/i18n";
import {
  createOfferDocument,
  emptyOfferInputs,
  offerDocumentStyles,
  offerTemplates,
  offerTextPatterns,
  readOfferPresets,
  saveOfferPreset,
  selectAutomaticOfferPreset,
  type OfferDocument,
  type OfferInputs,
  type SavedOfferPreset,
} from "../lib/offerDocument";

type OfferDraftDialogProps = {
  candidateName?: string;
  jobTitle?: string;
  candidateEmail?: string | null;
  draftKey?: string;
  error?: string | null;
  initialInputs?: OfferInputs | null;
  isGenerating: boolean;
  open: boolean;
  presetOnly?: boolean;
  onPresetSaved?: () => void;
  onOpenChange: (open: boolean) => void;
  onGenerate?: (inputs: OfferInputs) => Promise<OfferDocument | null>;
};

const companyDefaultsKey = "smart-ats-offer-wizard-defaults-v1";

export function OfferDraftDialog({
  candidateName,
  jobTitle,
  candidateEmail,
  draftKey,
  error,
  initialInputs,
  isGenerating,
  open,
  presetOnly = false,
  onPresetSaved,
  onOpenChange,
  onGenerate,
}: OfferDraftDialogProps) {
  const { t, tt } = useI18n();
  const [inputs, setInputs] = useState<OfferInputs>(emptyOfferInputs);
  const [step, setStep] = useState(1);
  const [presets, setPresets] = useState<SavedOfferPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLoadedDraftKey(null);
      return;
    }
    const readStorage = (storage: Storage, key?: string) => {
      if (!key) return null;
      try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) as Partial<OfferInputs> : null; } catch { return null; }
    };
    const defaults = typeof window === "undefined" ? null : readStorage(window.localStorage, companyDefaultsKey);
    const draft = typeof window === "undefined" ? null : readStorage(window.sessionStorage, draftKey);
    setInputs({ ...emptyOfferInputs, ...(defaults ?? {}), ...(initialInputs ?? {}), recipientEmail: candidateEmail || initialInputs?.recipientEmail || "", ...(draft ?? {}) });
    setPresets(readOfferPresets());
    setPresetName("");
    setStep(draft ? 3 : presetOnly ? 1 : 0);
    setLoadedDraftKey(draftKey ?? null);
  }, [candidateEmail, draftKey, initialInputs, open, presetOnly]);

  useEffect(() => {
    if (!open || !draftKey || loadedDraftKey !== draftKey || typeof window === "undefined") return;
    window.sessionStorage.setItem(draftKey, JSON.stringify(inputs));
  }, [draftKey, inputs, loadedDraftKey, open]);

  const preview = useMemo(
    () => createOfferDocument({ candidateName: candidateName || tt("Kandidat"), jobTitle: jobTitle || tt("Delovno mesto"), inputs }),
    [candidateName, inputs, jobTitle, tt],
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const updateInput = (key: keyof OfferInputs, value: string) => setInputs((current) => ({ ...current, [key]: value }));

  const handleGenerate = async () => {
    if (presetOnly) {
      if (!presetName.trim()) return;
      saveOfferPreset(presetName, inputs);
      onPresetSaved?.();
      onOpenChange(false);
      return;
    }
    if (typeof window !== "undefined") {
      const defaults = { companyName: inputs.companyName, signer: inputs.signer, templateId: inputs.templateId, styleId: inputs.styleId, tone: inputs.tone, patternId: inputs.patternId };
      window.localStorage.setItem(companyDefaultsKey, JSON.stringify(defaults));
    }
    const document = await onGenerate?.(inputs);
    if (document) {
      if (draftKey && typeof window !== "undefined") window.sessionStorage.removeItem(draftKey);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    if (draftKey && typeof window !== "undefined") window.sessionStorage.removeItem(draftKey);
    onOpenChange(false);
  };

  const steps = [tt("Način"), tt("Predloga"), tt("Stil in ton"), tt("Podatki in pregled")];

  const useAutomaticSetup = () => {
    setInputs((current) => ({ ...selectAutomaticOfferPreset(jobTitle || "", current), recipientEmail: candidateEmail || current.recipientEmail }));
    setStep(3);
  };

  const useSavedPreset = (preset: SavedOfferPreset) => {
    setInputs((current) => ({ ...current, ...preset.inputs, recipientEmail: candidateEmail || current.recipientEmail }));
    setStep(3);
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    saveOfferPreset(presetName, inputs);
    setPresets(readOfferPresets());
    setPresetName("");
  };

  const handleSignatureUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSignatureError(null);
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 500_000) {
      setSignatureError(tt("Uporabi PNG ali JPG sliko, manjšo od 500 KB."));
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setInputs((current) => ({ ...current, signatureMode: "image", signatureImageDataUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[94vh] max-h-[94vh] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto_auto] overflow-hidden border-border bg-card p-0 text-card-foreground sm:max-w-6xl">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle>{presetOnly ? tt("Nova predloga ponudbe") : tt("Čarovnik ponudbe")}</DialogTitle>
          <DialogDescription>{presetOnly ? tt("Nastavi stalne podatke, besedilo in formalni stil za ponovno uporabo.") : candidateName ? `${candidateName} · ${jobTitle || t("offerInputDialogSubtitle")}` : t("offerInputDialogSubtitle")}</DialogDescription>
        </DialogHeader>

        <ol className="grid grid-cols-4 border-b border-border bg-muted/20 px-6">
          {steps.map((label, index) => {
            const number = index;
            return <li key={label} className={`flex items-center gap-2 border-b-2 py-3 text-sm ${step === number ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step > number ? "bg-emerald-500 text-white" : step === number ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{step > number ? <Check className="h-3.5 w-3.5" /> : number + 1}</span>
              <span className="hidden sm:inline">{label}</span>
            </li>;
          })}
        </ol>

        <div className="border-b border-border px-6 py-2.5">
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>{tt("Napredek")}</span><span>{Math.round(((step + 1) / steps.length) * 100)}%</span></div>
          <Progress value={((step + 1) / steps.length) * 100} className="h-1.5" />
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 py-5">
          {step === 0 ? (
            <div className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-3">
                <button type="button" onClick={useAutomaticSetup} className="rounded-xl border border-border bg-background p-5 text-left hover:border-primary/60"><Wand2 className="mb-7 h-7 w-7 text-primary"/><h3 className="font-semibold">{tt("Samodejna izbira")}</h3><p className="mt-2 text-sm text-muted-foreground">{tt("Sistem izbere najprimernejšo poslovno predlogo glede na delovno mesto.")}</p></button>
                <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-border bg-background p-5 text-left hover:border-primary/60"><FileText className="mb-7 h-7 w-7 text-primary"/><h3 className="font-semibold">{tt("Ročni čarovnik")}</h3><p className="mt-2 text-sm text-muted-foreground">{tt("Ročno izberi predlogo, dokumentni stil, ton in besedilni vzorec.")}</p></button>
                <div className="rounded-xl border border-border bg-muted/20 p-5"><FolderOpen className="mb-7 h-7 w-7 text-primary"/><h3 className="font-semibold">{tt("Shranjene predloge")}</h3><p className="mt-2 text-sm text-muted-foreground">{presets.length ? tt("Izberi že pripravljeno predlogo spodaj.") : tt("Predlogo lahko shraniš v zadnjem koraku čarovnika.")}</p></div>
              </div>
              {presets.length ? <section><Label>{tt("Predloge podjetja")}</Label><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{presets.map((preset) => <button key={preset.id} type="button" onClick={() => useSavedPreset(preset)} className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-left hover:border-primary/60"><span><strong className="block text-sm">{preset.name}</strong><span className="text-xs text-muted-foreground">{offerTemplates.find((item) => item.id === preset.inputs.templateId)?.name || tt("Predloga podjetja")}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground"/></button>)}</div></section> : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {offerTemplates.map((template) => {
                const selected = inputs.templateId === template.id;
                return <button key={template.id} type="button" onClick={() => updateInput("templateId", template.id)} className={`min-h-44 rounded-xl border p-5 text-left transition-colors ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background hover:border-primary/50"}`}>
                  <div className="mb-8 flex items-start justify-between"><FileText className={`h-7 w-7 ${selected ? "text-primary" : "text-muted-foreground"}`} />{selected ? <Check className="h-5 w-5 text-primary" /> : null}</div>
                  <h3 className="font-semibold text-foreground">{tt(template.name)}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tt(template.description)}</p>
                </button>;
              })}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-7">
              <section><div className="mb-3 flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{tt("Vizualni stil dokumenta")}</h3></div><div className="grid gap-3 md:grid-cols-3">
                {offerDocumentStyles.map((style) => <button key={style.id} type="button" onClick={() => updateInput("styleId", style.id)} className={`rounded-lg border p-4 text-left ${inputs.styleId === style.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background"}`}><div className={`mb-4 h-16 rounded border bg-white p-2 ${style.id === "official" ? "border-t-2 border-t-slate-800" : style.id === "modern" ? "border-t-4 border-t-teal-700" : style.id === "classic" ? "font-serif" : "border-transparent"}`}><div className="h-1.5 w-2/3 bg-slate-700"/><div className="mt-3 h-1 w-full bg-slate-200"/><div className="mt-1.5 h-1 w-4/5 bg-slate-200"/></div><span className="font-semibold">{style.name}</span><p className="mt-1 text-xs text-muted-foreground">{tt(style.description)}</p></button>)}
              </div></section>
              <div className="grid gap-4 md:grid-cols-2"><div className="grid gap-2"><Label>{tt("Ton besedila")}</Label><Select value={inputs.tone || "warm"} onValueChange={(value) => updateInput("tone", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="warm">{t("offerToneWarm")}</SelectItem><SelectItem value="formal">{t("offerToneFormal")}</SelectItem><SelectItem value="direct">{t("offerToneDirect")}</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>{tt("Besedilni vzorec")}</Label><Select value={inputs.patternId || "balanced"} onValueChange={(value) => updateInput("patternId", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{offerTextPatterns.map((pattern) => <SelectItem key={pattern.id} value={pattern.id}>{tt(pattern.name)}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{tt(offerTextPatterns.find((item) => item.id === inputs.patternId)?.description || offerTextPatterns[0].description)}</p></div></div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
              <Accordion type="multiple" defaultValue={["company"]} className="rounded-lg border border-border bg-background px-4">
                <AccordionItem value="company">
                  <AccordionTrigger><span><strong>{tt("Pošiljatelj in podjetje")}</strong><small className="mt-1 block font-normal text-muted-foreground">{inputs.companyName || tt("Dodaj uradne podatke podjetja")}</small></span></AccordionTrigger>
                  <AccordionContent className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{t("offerCompanyName")}</Label><Input value={inputs.companyName ?? ""} onChange={(e) => updateInput("companyName", e.target.value)} /></div><div className="grid gap-2"><Label>{t("offerSigner")}</Label><Input value={inputs.signer ?? ""} onChange={(e) => updateInput("signer", e.target.value)} /></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{tt("Naslov podjetja")}</Label><Input value={inputs.companyAddress ?? ""} onChange={(e) => updateInput("companyAddress", e.target.value)} /></div><div className="grid gap-2"><Label>{tt("Poštna številka in kraj")}</Label><Input value={inputs.companyPostal ?? ""} onChange={(e) => updateInput("companyPostal", e.target.value)} /></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{tt("E-pošta pošiljatelja")}</Label><Input type="email" value={inputs.senderEmail ?? ""} onChange={(e) => updateInput("senderEmail", e.target.value)} /></div><div className="grid gap-2"><Label>{tt("Telefon pošiljatelja")}</Label><Input value={inputs.senderPhone ?? ""} onChange={(e) => updateInput("senderPhone", e.target.value)} /></div></div>
                    <div className="grid gap-4 sm:grid-cols-3"><div className="grid gap-2"><Label>{tt("Davčna številka")}</Label><Input value={inputs.companyTaxId ?? ""} onChange={(e) => updateInput("companyTaxId", e.target.value)} /></div><div className="grid gap-2"><Label>{tt("Matična številka")}</Label><Input value={inputs.companyRegistrationId ?? ""} onChange={(e) => updateInput("companyRegistrationId", e.target.value)} /></div><div className="grid gap-2"><Label>{tt("Besedilo noge")}</Label><Input value={inputs.footerText ?? ""} onChange={(e) => updateInput("footerText", e.target.value)} /></div></div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="recipient">
                  <AccordionTrigger><span><strong>{tt("Prejemnik in dokument")}</strong><small className="mt-1 block font-normal text-muted-foreground">{candidateName || tt("Podatki prejemnika in reference")}</small></span></AccordionTrigger>
                  <AccordionContent className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{tt("Naslov prejemnika")}</Label><Input value={inputs.recipientAddress ?? ""} onChange={(e) => updateInput("recipientAddress", e.target.value)} /></div><div className="grid gap-2"><Label>{tt("Poštna številka in kraj")}</Label><Input value={inputs.recipientPostal ?? ""} onChange={(e) => updateInput("recipientPostal", e.target.value)} /></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{tt("E-pošta prejemnika")}</Label><Input type="email" value={inputs.recipientEmail ?? ""} onChange={(e) => updateInput("recipientEmail", e.target.value)} /></div><div className="grid gap-2"><Label>{tt("Referenčna številka")}</Label><Input value={inputs.referenceNumber ?? ""} onChange={(e) => updateInput("referenceNumber", e.target.value)} /></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{tt("Kraj izdaje")}</Label><Input value={inputs.documentPlace ?? ""} onChange={(e) => updateInput("documentPlace", e.target.value)} /></div><div className="grid gap-2"><Label>{tt("Datum dokumenta")}</Label><Input type="date" value={inputs.documentDate ?? ""} onChange={(e) => updateInput("documentDate", e.target.value)} /></div></div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="terms">
                  <AccordionTrigger><span><strong>{tt("Pogoji ponudbe")}</strong><small className="mt-1 block font-normal text-muted-foreground">{inputs.salary || tt("Plačilo, pogodba, datumi in ugodnosti")}</small></span></AccordionTrigger>
                  <AccordionContent className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{t("offerSalary")} {!presetOnly ? "*" : ""}</Label><Input value={inputs.salary ?? ""} onChange={(e) => updateInput("salary", e.target.value)} /></div><div className="grid gap-2"><Label>{t("offerBonus")}</Label><Input value={inputs.bonus ?? ""} onChange={(e) => updateInput("bonus", e.target.value)} /></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{t("offerContractType")}</Label><Input value={inputs.contractType ?? ""} onChange={(e) => updateInput("contractType", e.target.value)} /></div><div className="grid gap-2"><Label>{t("offerWorkModel")}</Label><Input value={inputs.workModel ?? ""} onChange={(e) => updateInput("workModel", e.target.value)} /></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{t("offerStartDate")}</Label><Input type="date" min={todayIso} value={inputs.startDate ?? ""} onChange={(e) => updateInput("startDate", e.target.value)} /></div><div className="grid gap-2"><Label>{t("offerAcceptanceDeadline")}</Label><Input type="date" min={todayIso} value={inputs.acceptanceDeadline ?? ""} onChange={(e) => updateInput("acceptanceDeadline", e.target.value)} /></div></div>
                    <div className="grid gap-2"><Label>{t("offerBenefits")}</Label><Textarea value={inputs.benefits ?? ""} onChange={(e) => updateInput("benefits", e.target.value)} /></div><div className="grid gap-2"><Label>{t("offerExtraNotes")}</Label><Textarea value={inputs.extraNotes ?? ""} onChange={(e) => updateInput("extraNotes", e.target.value)} /></div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="signature">
                  <AccordionTrigger><span><strong>{tt("Elektronski podpis")}</strong><small className="mt-1 block font-normal text-muted-foreground">{inputs.signatureMode === "typed" ? tt("Tipkan podpis") : inputs.signatureMode === "image" ? tt("Naložena slika podpisa") : tt("Brez elektronskega podpisa")}</small></span></AccordionTrigger>
                  <AccordionContent className="grid gap-4">
                    <div className="grid gap-2"><Label>{tt("Način podpisa")}</Label><Select value={inputs.signatureMode || "none"} onValueChange={(value) => updateInput("signatureMode", value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{tt("Brez podpisa")}</SelectItem><SelectItem value="typed">{tt("Tipkano ime")}</SelectItem><SelectItem value="image">{tt("Naloži sliko podpisa")}</SelectItem></SelectContent></Select></div>
                    {inputs.signatureMode === "typed" ? <div className="grid gap-2"><Label>{tt("Podpisano ime")}</Label><Input value={inputs.signatureTypedName ?? ""} onChange={(e) => updateInput("signatureTypedName", e.target.value)} placeholder={inputs.signer || tt("Ime in priimek")}/></div> : null}
                    {inputs.signatureMode === "image" ? <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 text-sm font-medium hover:bg-muted/40"><Upload className="h-4 w-4"/>{inputs.signatureImageDataUrl ? tt("Zamenjaj sliko podpisa") : tt("Naloži PNG ali JPG")}<Input type="file" accept="image/png,image/jpeg" onChange={handleSignatureUpload} className="sr-only"/></label> : null}
                    {signatureError ? <p className="text-xs text-red-500">{signatureError}</p> : null}
                    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>{tt("Funkcija podpisnika")}</Label><Input value={inputs.signatureTitle ?? ""} onChange={(e) => updateInput("signatureTitle", e.target.value)} /></div><div className="grid gap-2"><Label>{tt("Datum podpisa")}</Label><Input type="date" value={inputs.signatureDate ?? ""} onChange={(e) => updateInput("signatureDate", e.target.value)} /></div></div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{tt("To je vizualni elektronski podpis v dokumentu in ni kvalificiran digitalni podpis s certifikatom.")}</p>
                    <div className="rounded-lg border border-border bg-muted/25 p-3"><Label>{tt("Shrani za naslednjič")}</Label><div className="mt-2 flex gap-2"><Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={tt("Ime predloge")} /><Button type="button" variant="outline" onClick={handleSavePreset} disabled={!presetName.trim()} className="shrink-0 gap-2"><Save className="h-4 w-4"/>{tt("Shrani")}</Button></div></div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <aside className="lg:sticky lg:top-0 lg:self-start"><div className="mb-2 flex items-center justify-between"><Label>{tt("Dvostranski predogled")}</Label><span className="text-xs text-muted-foreground">{tt("2 strani · A4")}</span></div><div className="max-h-[58vh] space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-3"><div className="aspect-[210/297] bg-white p-6 text-slate-900 shadow-sm"><div className="flex justify-between border-b-2 border-slate-800 pb-3 text-[8px] font-semibold uppercase"><span>{inputs.companyName || tt("Podjetje")}</span><span>{tt("Poslovni dokument")}</span></div><div className="mt-12 grid grid-cols-2 gap-8 text-[8px]"><div><strong>{tt("Pošiljatelj")}</strong><p className="mt-2">{inputs.companyName}<br/>{inputs.companyAddress}<br/>{inputs.companyPostal}</p></div><div><strong>{tt("Prejemnik")}</strong><p className="mt-2">{candidateName}<br/>{inputs.recipientAddress}<br/>{inputs.recipientPostal}</p></div></div><h2 className="mt-14 text-lg font-semibold">{preview.title}</h2><div className="mt-8 grid grid-cols-3 border-t pt-3 text-[7px]"><span>{inputs.documentPlace}</span><span>{inputs.documentDate}</span><span>{inputs.referenceNumber}</span></div><div className="mt-auto text-right text-[7px] text-slate-500">1 / 2</div></div><div className={`aspect-[210/297] bg-white p-6 text-slate-900 shadow-sm ${inputs.styleId === "classic" ? "font-serif" : "font-sans"}`}><div className="flex justify-between border-b-2 border-slate-800 pb-3 text-[8px] font-semibold uppercase"><span>{inputs.companyName || tt("Podjetje")}</span><span>{inputs.referenceNumber}</span></div><h2 className="my-6 text-base font-semibold">{preview.title}</h2><pre className="whitespace-pre-wrap [font-family:inherit] text-[7px] leading-relaxed">{preview.content}</pre><div className="mt-8 grid grid-cols-2 gap-8 text-[7px]"><span className="border-t pt-2">{inputs.signatureMode === "image" && inputs.signatureImageDataUrl ? <img src={inputs.signatureImageDataUrl} alt={tt("Elektronski podpis")} className="mb-1 max-h-10 max-w-28 object-contain"/> : inputs.signatureMode === "typed" && inputs.signatureTypedName ? <span className="mb-1 block font-serif text-sm italic">{inputs.signatureTypedName}</span> : null}{inputs.signer}<br/>{inputs.signatureTitle}</span><span className="border-t pt-2">{tt("Prejemnik / podpis")}</span></div></div></div></aside>
            </div>
          ) : null}
        </div>

        {error ? <p className="px-6 text-sm text-red-500">{error}</p> : null}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <div>{step > (presetOnly ? 1 : 0) ? <Button type="button" variant="ghost" onClick={() => setStep((value) => value === 3 && !presetOnly ? 0 : value - 1)} disabled={isGenerating} className="gap-2"><ArrowLeft className="h-4 w-4" />{tt("Nazaj")}</Button> : <Button type="button" variant="ghost" onClick={handleCancel}>{t("cancel")}</Button>}</div>
          {step < 3 ? <Button type="button" onClick={() => setStep((value) => value + 1)} className="gap-2">{tt("Nadaljuj")}<ArrowRight className="h-4 w-4" /></Button> : <Button type="button" onClick={handleGenerate} disabled={isGenerating || (presetOnly ? !presetName.trim() : !inputs.salary?.trim())} className="gap-2">{isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : presetOnly ? <Save className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{presetOnly ? tt("Shrani predlogo") : tt("Ustvari dokument")}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
