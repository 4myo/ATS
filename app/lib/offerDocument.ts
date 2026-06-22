export type OfferTemplateId = "standard" | "executive" | "concise";
export type OfferStyleId = "official" | "modern" | "classic" | "minimal";
export type OfferPatternId = "balanced" | "benefits-first" | "terms-first";
export type OfferTone = "warm" | "formal" | "direct";

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
  tone?: OfferTone | string;
  templateId?: OfferTemplateId | string;
  styleId?: OfferStyleId | string;
  patternId?: OfferPatternId | string;
  companyAddress?: string;
  companyPostal?: string;
  companyTaxId?: string;
  companyRegistrationId?: string;
  senderEmail?: string;
  senderPhone?: string;
  recipientAddress?: string;
  recipientPostal?: string;
  recipientEmail?: string;
  documentPlace?: string;
  documentDate?: string;
  referenceNumber?: string;
  signatureTitle?: string;
  footerText?: string;
  signatureMode?: "none" | "typed" | "image" | string;
  signatureTypedName?: string;
  signatureImageDataUrl?: string;
  signatureDate?: string;
};

export type SavedOfferPreset = {
  id: string;
  name: string;
  inputs: OfferInputs;
  createdAt: string;
};

export const offerTemplates = [
  {
    id: "standard" as const,
    name: "Standardna ponudba",
    description: "Uravnotežen poslovni dokument za večino zaposlitev.",
  },
  {
    id: "executive" as const,
    name: "Vodstvena ponudba",
    description: "Bolj reprezentativen dokument s poudarkom na odgovornosti in paketu.",
  },
  {
    id: "concise" as const,
    name: "Kratka ponudba",
    description: "Jedrnata ponudba z bistvenimi pogoji na eni strani.",
  },
];

export const offerDocumentStyles = [
  { id: "official" as const, name: "Uradni dokument", description: "Dvostranska pogodbeno-poslovna postavitev s črtami, glavo in nogo." },
  { id: "modern" as const, name: "Modern", description: "Čist poslovni izgled z barvnim poudarkom." },
  { id: "classic" as const, name: "Classic", description: "Tradicionalna tipografija za formalne dokumente." },
  { id: "minimal" as const, name: "Minimal", description: "Nevtralen izgled z veliko praznega prostora." },
];

export const offerTextPatterns = [
  { id: "balanced" as const, name: "Uravnoteženo", description: "Vrstni red: uvod, pogoji, ugodnosti, potrditev." },
  { id: "benefits-first" as const, name: "Najprej vrednost", description: "V ospredju so vloga, način dela in ugodnosti." },
  { id: "terms-first" as const, name: "Najprej pogoji", description: "Plačilo in pogodbeni pogoji so predstavljeni takoj." },
];

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
  templateId: "standard",
  styleId: "modern",
  patternId: "balanced",
  companyAddress: "",
  companyPostal: "",
  companyTaxId: "",
  companyRegistrationId: "",
  senderEmail: "",
  senderPhone: "",
  recipientAddress: "",
  recipientPostal: "",
  recipientEmail: "",
  documentPlace: "",
  documentDate: "",
  referenceNumber: "",
  signatureTitle: "",
  footerText: "",
  signatureMode: "none",
  signatureTypedName: "",
  signatureImageDataUrl: "",
  signatureDate: "",
};

export const offerPresetStorageKey = "smart-ats-offer-presets-v1";

export const readOfferPresets = (): SavedOfferPreset[] => {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(offerPresetStorageKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};

export const saveOfferPreset = (name: string, inputs: OfferInputs) => {
  const preset: SavedOfferPreset = {
    id: globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}`,
    name: name.trim() || "Nova predloga",
    inputs: { ...inputs, salary: "", bonus: "", startDate: "", acceptanceDeadline: "", recipientAddress: "", recipientPostal: "", recipientEmail: "", referenceNumber: "" },
    createdAt: new Date().toISOString(),
  };
  const presets = [preset, ...readOfferPresets()].slice(0, 20);
  window.localStorage.setItem(offerPresetStorageKey, JSON.stringify(presets));
  return preset;
};

export const selectAutomaticOfferPreset = (jobTitle: string, defaults: OfferInputs = {}) => {
  const executive = /(vodj|direktor|head|lead|manager|chief)/i.test(jobTitle);
  return {
    ...emptyOfferInputs,
    ...defaults,
    templateId: executive ? "executive" : "standard",
    styleId: "official",
    tone: executive ? "formal" : "warm",
    patternId: executive ? "terms-first" : "balanced",
  } satisfies OfferInputs;
};

const valueOr = (value: string | undefined, fallback: string) => value?.trim() || fallback;

const formatDate = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "long", year: "numeric" }).format(date);
};

export const createOfferDocument = ({
  candidateName,
  jobTitle,
  inputs,
}: {
  candidateName: string;
  jobTitle: string;
  inputs: OfferInputs;
}): Omit<OfferDocument, "id"> => {
  const company = valueOr(inputs.companyName, "naše podjetje");
  const signer = valueOr(inputs.signer, "Kadrovska služba");
  const salary = valueOr(inputs.salary, "po dogovoru");
  const contract = valueOr(inputs.contractType, "po dogovoru");
  const workModel = valueOr(inputs.workModel, "po dogovoru");
  const startDate = formatDate(inputs.startDate, "po dogovoru");
  const deadline = formatDate(inputs.acceptanceDeadline, "dogovorjenega roka");
  const template = (inputs.templateId || "standard") as OfferTemplateId;
  const pattern = (inputs.patternId || "balanced") as OfferPatternId;
  const tone = (inputs.tone || "warm") as OfferTone;

  const opening = tone === "formal"
    ? `Spoštovani ${candidateName},\n\nna podlagi zaključenega izbirnega postopka vam ${company} posreduje ponudbo za delovno mesto ${jobTitle}.`
    : tone === "direct"
      ? `${candidateName},\n\nponujamo vam zaposlitev na delovnem mestu ${jobTitle} v podjetju ${company}.`
      : `Pozdravljeni ${candidateName},\n\nveseli nas, da vam lahko ponudimo delovno mesto ${jobTitle} v podjetju ${company}. Verjamemo, da bomo skupaj ustvarili uspešno zgodbo.`;

  const terms = `POGOJI SODELOVANJA\n• Vrsta pogodbe: ${contract}\n• Predviden začetek: ${startDate}\n• Plačilo: ${salary}\n${inputs.bonus?.trim() ? `• Variabilni del / bonus: ${inputs.bonus.trim()}\n` : ""}• Način dela: ${workModel}`;
  const benefits = inputs.benefits?.trim()
    ? `UGODNOSTI IN PODPORA\n${inputs.benefits.trim()}`
    : `UGODNOSTI IN PODPORA\nPodrobnosti dodatnih ugodnosti bomo uskladili ob podpisu pogodbe.`;
  const role = template === "executive"
    ? `VLOGA IN ODGOVORNOST\nV tej vlogi boste pomembno prispevali k poslovnim ciljem podjetja ter prevzeli odgovornost za rezultate na področju ${jobTitle}.`
    : `VLOGA\nDelovno mesto: ${jobTitle}\nPodjetje: ${company}`;
  const notes = inputs.extraNotes?.trim() ? `DODATNI DOGOVORI\n${inputs.extraNotes.trim()}` : "";
  const closing = tone === "formal"
    ? `Prosimo, da ponudbo pisno potrdite do ${deadline}. Končna zaposlitev se uredi s podpisom pogodbe o zaposlitvi.\n\nS spoštovanjem,\n${signer}\n${company}`
    : tone === "direct"
      ? `Ponudbo potrdite do ${deadline}. Po potrditvi pripravimo pogodbo in naslednje korake.\n\n${signer}\n${company}`
      : `Prosimo, sporočite svojo odločitev do ${deadline}. Z veseljem odgovorimo na vprašanja in skupaj uskladimo naslednje korake.\n\nLep pozdrav,\n${signer}\n${company}`;

  const orderedSections = pattern === "benefits-first"
    ? [role, benefits, terms, notes]
    : pattern === "terms-first"
      ? [terms, role, benefits, notes]
      : [role, terms, benefits, notes];

  const body = template === "concise"
    ? [opening, terms, notes, closing]
    : [opening, ...orderedSections, closing];

  return {
    title: `Ponudba za zaposlitev – ${candidateName}`,
    content: body.filter(Boolean).join("\n\n"),
    inputs: { ...inputs, templateId: template, patternId: pattern, tone },
    status: "draft",
  };
};

const sanitizeFileName = (value: string) => value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, "-").slice(0, 80) || "offer-document";
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const printableStyles: Record<OfferStyleId, { font: string; accent: string; heading: string; border: string }> = {
  official: { font: "Arial, sans-serif", accent: "#172033", heading: "25px", border: "2px solid #172033" },
  modern: { font: "Arial, sans-serif", accent: "#0f766e", heading: "28px", border: "4px solid #0f766e" },
  classic: { font: "Georgia, serif", accent: "#1f2937", heading: "26px", border: "1px solid #9ca3af" },
  minimal: { font: "Arial, sans-serif", accent: "#111827", heading: "23px", border: "0" },
};

export const downloadOfferText = (document: OfferDocument) => {
  const blob = new Blob([document.content], { type: "text/plain;charset=utf-8" });
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
  const styleId = (document.inputs?.styleId || "modern") as OfferStyleId;
  const style = printableStyles[styleId] || printableStyles.modern;
  const company = escapeHtml(document.inputs?.companyName?.trim() || "");
  const input = document.inputs || {};
  const line = (...values: Array<string | undefined>) => escapeHtml(values.filter(Boolean).join(", "));
  const documentDate = formatDate(input.documentDate, new Intl.DateTimeFormat("sl-SI").format(new Date()));
  const safeSignatureImage = input.signatureMode === "image" && /^data:image\/(png|jpeg);base64,/i.test(input.signatureImageDataUrl || "")
    ? input.signatureImageDataUrl
    : "";
  const signatureMarkup = safeSignatureImage
    ? `<img class="signature-image" src="${safeSignatureImage}" alt="Elektronski podpis"/>`
    : input.signatureMode === "typed" && input.signatureTypedName?.trim()
      ? `<div class="typed-signature">${escapeHtml(input.signatureTypedName.trim())}</div>`
      : "";
  const printableHtml = `<!doctype html><html lang="sl"><head><meta charset="utf-8"/><title>${escapeHtml(document.title)}</title><style>
    @page { size:A4; margin:0 } *{box-sizing:border-box} body{color:#111827;font-family:${style.font};line-height:1.55;margin:0;background:#e5e7eb}.page{position:relative;width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:22mm 20mm 20mm}.page-break{break-after:page}.rule{height:2px;background:${style.accent};margin:7mm 0}.document-header{display:flex;justify-content:space-between;gap:12mm;align-items:flex-start;color:${style.accent}}.company{font-weight:800;letter-spacing:.05em;text-transform:uppercase}.small{font-size:10px;color:#6b7280}.address-grid{display:grid;grid-template-columns:1fr 1fr;gap:22mm;margin-top:42mm}.address-label{border-bottom:1px solid #9ca3af;padding-bottom:2mm;margin-bottom:4mm;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}.address{font-size:14px;line-height:1.7}.cover-title{margin-top:45mm;font-size:30px;color:${style.accent};max-width:140mm}.reference{margin-top:12mm;border-top:1px solid #d1d5db;padding-top:5mm;display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;font-size:11px}.content{border-top:${style.border};padding-top:8mm}h1{color:${style.accent};font-size:${style.heading};line-height:1.2;margin:0 0 10mm}pre{font-family:inherit;font-size:13px;white-space:pre-wrap;word-break:break-word;margin:0;padding-bottom:25mm}.footer{position:absolute;left:20mm;right:20mm;bottom:10mm;border-top:1px solid #9ca3af;padding-top:3mm;display:flex;justify-content:space-between;gap:8mm;font-size:9px;color:#6b7280}.signature{margin-top:15mm;display:grid;grid-template-columns:1fr 1fr;gap:20mm}.signature-line{border-top:1px solid #374151;padding-top:2mm;font-size:10px}.signature-image{display:block;max-width:48mm;max-height:18mm;object-fit:contain;margin:0 0 2mm}.typed-signature{font-family:"Segoe Script","Brush Script MT",cursive;font-size:24px;line-height:1.1;margin:0 0 3mm}.signature-date{color:#6b7280;font-size:9px;margin-top:1mm}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}
  </style></head><body><section class="page page-break"><div class="document-header"><div><div class="company">${company}</div><div class="small">${line(input.companyAddress, input.companyPostal)}</div></div><div class="small">POSLOVNI DOKUMENT</div></div><div class="rule"></div><div class="address-grid"><div><div class="address-label">Pošiljatelj</div><div class="address"><strong>${company}</strong><br>${line(input.companyAddress)}<br>${line(input.companyPostal)}<br>${line(input.senderEmail)}<br>${line(input.senderPhone)}</div></div><div><div class="address-label">Prejemnik</div><div class="address"><strong>${escapeHtml(document.title.replace(/^.*–\s*/, ""))}</strong><br>${line(input.recipientAddress)}<br>${line(input.recipientPostal)}<br>${line(input.recipientEmail)}</div></div></div><h1 class="cover-title">${escapeHtml(document.title)}</h1><div class="reference"><div><strong>Kraj</strong><br>${line(input.documentPlace) || "—"}</div><div><strong>Datum</strong><br>${documentDate}</div><div><strong>Referenca</strong><br>${line(input.referenceNumber) || "—"}</div></div><div class="footer"><span>${line(input.footerText) || company}</span><span>${line(input.companyTaxId && `Davčna št.: ${input.companyTaxId}`, input.companyRegistrationId && `Matična št.: ${input.companyRegistrationId}`)}</span><span>1 / 2</span></div></section><section class="page"><div class="document-header"><div class="company">${company}</div><div class="small">${line(input.referenceNumber)}</div></div><div class="content"><h1>${escapeHtml(document.title)}</h1><pre>${escapeHtml(document.content)}</pre><div class="signature"><div class="signature-line">${signatureMarkup}${line(input.signer)}<br>${line(input.signatureTitle)}<div class="signature-date">${input.signatureMode !== "none" ? `Elektronsko podpisano ${formatDate(input.signatureDate, documentDate)}` : ""}</div></div><div class="signature-line">Prejemnik / podpis</div></div></div><div class="footer"><span>${line(input.footerText) || company}</span><span>${line(input.senderEmail, input.senderPhone)}</span><span>2 / 2</span></div></section><script>window.addEventListener("load",()=>window.setTimeout(()=>window.print(),350));</script></body></html>`;
  const blob = new Blob([printableHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!printWindow) { URL.revokeObjectURL(url); return false; }
  printWindow.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
};
