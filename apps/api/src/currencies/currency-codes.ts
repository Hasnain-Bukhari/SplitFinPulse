export const currencyCatalog = [
  ["AED", "UAE Dirham", 2],
  ["AUD", "Australian Dollar", 2],
  ["BDT", "Bangladeshi Taka", 2],
  ["BHD", "Bahraini Dinar", 3],
  ["BRL", "Brazilian Real", 2],
  ["CAD", "Canadian Dollar", 2],
  ["CHF", "Swiss Franc", 2],
  ["CLP", "Chilean Peso", 0],
  ["CNY", "Chinese Yuan", 2],
  ["COP", "Colombian Peso", 2],
  ["CZK", "Czech Koruna", 2],
  ["DKK", "Danish Krone", 2],
  ["EGP", "Egyptian Pound", 2],
  ["EUR", "Euro", 2],
  ["GBP", "British Pound", 2],
  ["HKD", "Hong Kong Dollar", 2],
  ["HUF", "Hungarian Forint", 2],
  ["IDR", "Indonesian Rupiah", 2],
  ["ILS", "Israeli New Shekel", 2],
  ["INR", "Indian Rupee", 2],
  ["ISK", "Icelandic Króna", 0],
  ["JPY", "Japanese Yen", 0],
  ["JOD", "Jordanian Dinar", 3],
  ["KRW", "South Korean Won", 0],
  ["KWD", "Kuwaiti Dinar", 3],
  ["LKR", "Sri Lankan Rupee", 2],
  ["MAD", "Moroccan Dirham", 2],
  ["MXN", "Mexican Peso", 2],
  ["MYR", "Malaysian Ringgit", 2],
  ["NGN", "Nigerian Naira", 2],
  ["NOK", "Norwegian Krone", 2],
  ["NZD", "New Zealand Dollar", 2],
  ["OMR", "Omani Rial", 3],
  ["PHP", "Philippine Peso", 2],
  ["PKR", "Pakistani Rupee", 2],
  ["PLN", "Polish Złoty", 2],
  ["QAR", "Qatari Riyal", 2],
  ["RON", "Romanian Leu", 2],
  ["RSD", "Serbian Dinar", 2],
  ["SAR", "Saudi Riyal", 2],
  ["SEK", "Swedish Krona", 2],
  ["SGD", "Singapore Dollar", 2],
  ["THB", "Thai Baht", 2],
  ["TRY", "Turkish Lira", 2],
  ["TWD", "New Taiwan Dollar", 2],
  ["UAH", "Ukrainian Hryvnia", 2],
  ["USD", "US Dollar", 2],
  ["VND", "Vietnamese Đồng", 0],
  ["ZAR", "South African Rand", 2],
] as const;

const metadata = new Map<
  string,
  { code: string; name: string; minorUnit: number }
>(
  currencyCatalog.map(([code, name, minorUnit]) => [
    code,
    { code, name, minorUnit },
  ]),
);

export function isSupportedCurrencyCode(value: string): boolean {
  return metadata.has(value);
}

export function listSupportedCurrencyCodes(): readonly string[] {
  return currencyCatalog.map(([code]) => code);
}

export function listCurrencyMetadata() {
  return currencyCatalog.map(([code, name, minorUnit]) => ({
    code,
    name,
    minorUnit,
  }));
}

export function currencyMinorUnit(code: string): number {
  return metadata.get(code)?.minorUnit ?? 2;
}
