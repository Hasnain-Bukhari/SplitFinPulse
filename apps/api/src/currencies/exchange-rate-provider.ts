import { createHash } from "node:crypto";

export interface ProviderRateSet {
  effectiveDate: string;
  source: string;
  payloadHash: string;
  rates: Array<{ quoteCurrency: string; rateDecimal: string }>;
}

export interface ExchangeRateProvider {
  rates(
    baseCurrency: string,
    effectiveDate: string,
    quotes?: string[],
  ): Promise<ProviderRateSet>;
}

export class FrankfurterV2Provider implements ExchangeRateProvider {
  private consecutiveFailures = 0;
  private openUntil = 0;

  async rates(
    baseCurrency: string,
    effectiveDate: string,
    quotes: string[] = [],
  ): Promise<ProviderRateSet> {
    if (this.openUntil > Date.now())
      throw new Error("FX_PROVIDER_CIRCUIT_OPEN");
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.request(baseCurrency, effectiveDate, quotes);
        this.consecutiveFailures = 0;
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 3) this.openUntil = Date.now() + 60_000;
    throw lastError;
  }

  private async request(
    baseCurrency: string,
    effectiveDate: string,
    quotes: string[],
  ): Promise<ProviderRateSet> {
    const params = new URLSearchParams({
      base: baseCurrency,
      date: effectiveDate,
    });
    if (quotes.length) params.set("quotes", quotes.join(","));
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rates?${params}`,
      {
        signal: AbortSignal.timeout(4_000),
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) throw new Error(`FX_PROVIDER_${response.status}`);
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error("FX_RESPONSE_TOO_LARGE");
    const value = JSON.parse(text) as unknown;
    const entries = Array.isArray(value)
      ? value
      : value && typeof value === "object" && "rates" in value
        ? Object.entries(
            (value as { rates: Record<string, unknown> }).rates,
          ).map(([quote, rate]) => ({
            quote,
            rate,
            date: (value as { date?: unknown }).date,
          }))
        : [];
    const rates = entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      const quoteCurrency = String(row.quote ?? row.currency ?? "");
      const rate = row.rate;
      const rateDecimal =
        typeof rate === "number"
          ? rate.toString()
          : typeof rate === "string"
            ? rate
            : "";
      return /^[A-Z]{3}$/.test(quoteCurrency) &&
        /^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/.test(rateDecimal)
        ? [{ quoteCurrency, rateDecimal }]
        : [];
    });
    if (!rates.length) throw new Error("FX_PROVIDER_INVALID_RESPONSE");
    const providerDate = entries.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).date === "string",
    ) as Record<string, unknown> | undefined;
    return {
      effectiveDate: String(providerDate?.date ?? effectiveDate),
      source: "FRANKFURTER_V2",
      payloadHash: createHash("sha256").update(text).digest("hex"),
      rates,
    };
  }
}
