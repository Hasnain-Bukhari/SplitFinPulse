const currencyCodes = Intl.supportedValuesOf("currency");
const supportedCurrencyCodes = new Set(currencyCodes);

export function isSupportedCurrencyCode(value: string): boolean {
  return supportedCurrencyCodes.has(value);
}

export function listSupportedCurrencyCodes(): readonly string[] {
  return currencyCodes;
}
