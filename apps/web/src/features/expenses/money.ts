export function currencyMinorUnit(currency: string, supplied?: number): number {
  if (supplied !== undefined) return supplied;
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits;
    if (typeof digits !== "number")
      throw new Error(`No minor-unit metadata for ${currency}`);
    return digits;
  } catch {
    throw new Error(`Unknown currency ${currency}`);
  }
}

export function decimalToMinor(
  value: string,
  minorUnit: number,
): string | null {
  const normalized = value.trim();
  if (minorUnit === 0) {
    if (!/^(?:0|[1-9]\d*)$/.test(normalized)) return null;
    return BigInt(normalized).toString();
  }
  const pattern = new RegExp(`^(?:0|[1-9]\\d*)(?:\\.(\\d{1,${minorUnit}}))?$`);
  const match = normalized.match(pattern);
  if (!match) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(minorUnit) +
    BigInt(fraction.padEnd(minorUnit, "0"))
  ).toString();
}

export function minorToDecimal(value: string, minorUnit: number): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  if (minorUnit === 0) return `${sign}${absolute}`;
  const scale = 10n ** BigInt(minorUnit);
  return `${sign}${absolute / scale}.${(absolute % scale).toString().padStart(minorUnit, "0")}`;
}

export function formatMinor(
  value: string,
  currency: string,
  minorUnit = currencyMinorUnit(currency),
  locale = "en-US",
): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const scale = 10n ** BigInt(minorUnit);
  const integer = new Intl.NumberFormat(locale, {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(absolute / scale);
  if (!minorUnit) return `${sign}${currency} ${integer}`;
  const decimal =
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
    })
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? ".";
  const digits = Array.from({ length: 10 }, (_, digit) =>
    new Intl.NumberFormat(locale, { useGrouping: false }).format(digit),
  );
  const fraction = (absolute % scale)
    .toString()
    .padStart(minorUnit, "0")
    .replace(/\d/g, (digit) => digits[Number(digit)]!);
  return `${sign}${currency} ${integer}${decimal}${fraction}`;
}

export function addMinor(values: string[]): string {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

export function randomIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function expenseCurrencyDefault(
  current: string,
  candidate: string | undefined,
  userOverridden: boolean,
): string {
  return userOverridden || !candidate ? current : candidate;
}
