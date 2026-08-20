import { createWorker } from "tesseract.js";
import languageData from "@tesseract.js-data/eng";

export type ReceiptSuggestions = {
  merchant: string | null;
  expenseDate: string | null;
  totalText: string | null;
  currencyHint: string | null;
  confidence: string;
};

export class LocalReceiptOcr {
  async extract(path: string): Promise<ReceiptSuggestions> {
    const worker = await createWorker("eng", undefined, {
      langPath: languageData.langPath,
      gzip: languageData.gzip,
    });
    try {
      const result = await worker.recognize(path);
      return parseReceiptText(result.data.text, result.data.confidence);
    } finally {
      await worker.terminate();
    }
  }
}

export function parseReceiptText(
  text: string,
  confidence = 0,
): ReceiptSuggestions {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const merchant =
    lines
      .find(
        (line) =>
          /[A-Za-z]{3}/.test(line) && !/(?:total|tax|date|receipt)/i.test(line),
      )
      ?.slice(0, 200) ?? null;
  const totalCandidates = lines.flatMap((line) => {
    const match = line.match(
      /(?:grand\s+)?total\D{0,12}((?:\d{1,3}(?:[, ]\d{3})*|\d+)(?:\.\d{1,3})?)/i,
    );
    return match?.[1] ? [match[1].replace(/[, ]/g, "")] : [];
  });
  const dateMatch = text.match(
    /\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/,
  );
  const currency =
    text
      .match(/\b(USD|EUR|GBP|THB|JPY|KWD|AUD|CAD|SGD|INR|PKR)\b/i)?.[1]
      ?.toUpperCase() ?? null;
  return {
    merchant,
    expenseDate: dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]!.padStart(2, "0")}-${dateMatch[3]!.padStart(2, "0")}`
      : null,
    totalText: totalCandidates.at(-1) ?? null,
    currencyHint: currency,
    confidence: Math.max(0, Math.min(100, confidence)).toFixed(1),
  };
}
