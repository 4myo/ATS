export interface PdfConversionResult {
  imageUrl: string;
  file: File | null;
  ocrText?: string;
  error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadPromise) return loadPromise;

  isLoading = true;
  console.log("Loading PDF.js...");

  loadPromise = import("pdfjs-dist")
    .then((lib) => {
      const pdfjs = lib.default || lib;

      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }

      pdfjsLib = pdfjs;
      isLoading = false;
      return pdfjs;
    })
    .catch((err) => {
      console.error("Error loading PDF.js:", err);
      isLoading = false;
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

export async function convertPdfToImage(
  file: File,
): Promise<PdfConversionResult> {
  try {
    const { createWorker } = await import("tesseract.js");
    const lib = await loadPdfJs();

    const arrayBuffer = await file.arrayBuffer();

    const pdf = await lib
      .getDocument({
        data: arrayBuffer,
        cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/standard_fonts/`,
      })
      .promise;

    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    if (context) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
    }

    await page.render({ canvasContext: context!, viewport }).promise;

    const dataUrl = canvas.toDataURL("image/png");
    const originalName = file.name.replace(/\.pdf$/i, "");
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageFile = new File([blob], `${originalName}.png`, {
      type: "image/png",
    });

    let ocrText = "";
    try {
      const worker = await createWorker("eng");
      const result = await worker.recognize(dataUrl);
      ocrText = result.data.text ?? "";
      await worker.terminate();
    } catch (ocrError) {
      console.warn("OCR failed:", ocrError);
    }

    return {
      imageUrl: dataUrl,
      file: imageFile,
      ocrText,
    };
  } catch (err) {
    console.error("Error during PDF conversion:", err);
    return {
      imageUrl: "",
      file: null,
      error: `Failed to convert PDF: ${err}`,
    };
  }
}

export async function extractPdfText(file: File): Promise<string> {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib
    .getDocument({
      data: arrayBuffer,
      cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/standard_fonts/`,
    })
    .promise;

  const textParts: string[] = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as Array<{ str?: string }>)
      .map((item) => item.str ?? "")
      .join(" ");
    textParts.push(pageText);
  }

  return textParts.join("\n");
}
