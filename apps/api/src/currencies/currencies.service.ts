import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import {
  currencyMinorUnit,
  isSupportedCurrencyCode,
  listCurrencyMetadata,
} from "./currency-codes";
import type { CreateValuationDto } from "./currencies.dto";
import {
  FrankfurterV2Provider,
  type ExchangeRateProvider,
} from "./exchange-rate-provider";

type Database = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CurrenciesService {
  private readonly provider: ExchangeRateProvider = new FrankfurterV2Provider();
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list() {
    return { items: listCurrencyMetadata() };
  }

  async createValuation(userId: string, input: CreateValuationDto) {
    this.requireCurrency(input.baseCurrency);
    input.quoteCurrencies?.forEach((code) => this.requireCurrency(code));
    const effectiveDate = this.date(input.effectiveDate);
    const manual = input.manualRates ?? [];
    manual.forEach((row) => this.requireCurrency(row.quoteCurrency));
    if (new Set(manual.map((row) => row.quoteCurrency)).size !== manual.length)
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_MANUAL_RATE",
        "Choose each manual quote currency once",
      );
    let source = manual[0]?.sourceLabel?.trim() || "MANUAL";
    let status: "AVAILABLE" | "MANUAL" | "UNAVAILABLE" = manual.length
      ? "MANUAL"
      : "AVAILABLE";
    let payloadHash: string | undefined;
    let rates = manual.map((row) => ({
      quoteCurrency: row.quoteCurrency,
      rateDecimal: row.rateDecimal,
    }));
    if (!manual.length) {
      const currentDate = new Date().toISOString().slice(0, 10);
      const cached = await this.prisma.exchangeRateSet.findFirst({
        where: {
          baseCurrency: input.baseCurrency,
          effectiveDate,
          status: "AVAILABLE",
          payloadHash: { not: null },
          ...(input.effectiveDate === currentDate
            ? { capturedAt: { gte: new Date(Date.now() - 60 * 60_000) } }
            : {}),
        },
        include: { quotes: true },
        orderBy: { capturedAt: "desc" },
      });
      const requested = new Set(input.quoteCurrencies ?? []);
      if (
        cached &&
        [...requested].every(
          (quoteCurrency) =>
            quoteCurrency === input.baseCurrency ||
            cached.quotes.some(
              (quote) => quote.quoteCurrency === quoteCurrency,
            ),
        )
      ) {
        const copy = await this.prisma.exchangeRateSet.create({
          data: {
            baseCurrency: cached.baseCurrency,
            status: cached.status,
            source: cached.source,
            effectiveDate: cached.effectiveDate,
            capturedAt: cached.capturedAt,
            payloadHash: cached.payloadHash,
            createdById: userId,
            expiresAt: new Date(Date.now() + 10 * 60_000),
            quotes: {
              create: cached.quotes.map((quote) => ({
                quoteCurrency: quote.quoteCurrency,
                numerator: quote.numerator,
                denominator: quote.denominator,
              })),
            },
          },
          include: { quotes: true },
        });
        return this.present(copy, input.amountMinor);
      }
      try {
        const result = await this.provider.rates(
          input.baseCurrency,
          input.effectiveDate,
          input.quoteCurrencies,
        );
        source = result.source;
        payloadHash = result.payloadHash;
        rates = result.rates.filter((rate) =>
          isSupportedCurrencyCode(rate.quoteCurrency),
        );
      } catch {
        status = "UNAVAILABLE";
        source = "UNAVAILABLE";
        rates = [];
      }
    }
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const created = await this.prisma.exchangeRateSet.create({
      data: {
        baseCurrency: input.baseCurrency,
        status,
        source,
        effectiveDate,
        payloadHash: payloadHash ?? null,
        createdById: userId,
        expiresAt,
        quotes: {
          create: [
            {
              quoteCurrency: input.baseCurrency,
              numerator: "1",
              denominator: "1",
            },
            ...rates
              .filter((rate) => rate.quoteCurrency !== input.baseCurrency)
              .map((rate) => ({
                quoteCurrency: rate.quoteCurrency,
                ...this.decimalToRational(rate.rateDecimal),
              })),
          ],
        },
      },
    });
    const row = await this.prisma.exchangeRateSet.findUniqueOrThrow({
      where: { id: created.id },
      include: { quotes: true },
    });
    return this.present(row, input.amountMinor);
  }

  async snapshotForWrite(
    database: Database,
    userId: string,
    baseCurrency: string,
    effectiveDate: string,
    valuationId?: string,
  ) {
    if (valuationId) {
      const row = await database.exchangeRateSet.findFirst({
        where: {
          id: valuationId,
          createdById: userId,
          baseCurrency,
          effectiveDate: this.date(effectiveDate),
        },
        include: { quotes: true },
      });
      if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now()))
        throw new ApiException(
          HttpStatus.CONFLICT,
          "FX_QUOTE_EXPIRED",
          "Refresh the currency valuation before saving",
        );
      return row;
    }
    return database.exchangeRateSet.create({
      data: {
        baseCurrency,
        status: "UNAVAILABLE",
        source: "NOT_REQUESTED",
        effectiveDate: this.date(effectiveDate),
        createdById: userId,
        quotes: {
          create: {
            quoteCurrency: baseCurrency,
            numerator: "1",
            denominator: "1",
          },
        },
      },
      include: { quotes: true },
    });
  }

  convert(
    amountMinor: bigint,
    numerator: bigint,
    denominator: bigint,
    baseMinorUnit: number,
    quoteMinorUnit: number,
  ) {
    const scaledNumerator =
      amountMinor * numerator * 10n ** BigInt(quoteMinorUnit);
    const scaledDenominator = denominator * 10n ** BigInt(baseMinorUnit);
    const quotient = scaledNumerator / scaledDenominator;
    const remainder = scaledNumerator % scaledDenominator;
    const doubled = remainder * 2n;
    return (
      quotient +
      (doubled > scaledDenominator ||
      (doubled === scaledDenominator && quotient % 2n !== 0n)
        ? 1n
        : 0n)
    );
  }

  minorUnit(code: string) {
    this.requireCurrency(code);
    return currencyMinorUnit(code);
  }

  private decimalToRational(value: string) {
    const [whole, fraction = ""] = value.split(".");
    let numerator = BigInt(`${whole}${fraction}`);
    let denominator = 10n ** BigInt(fraction.length);
    const divisor = this.gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
    return {
      numerator: numerator.toString(),
      denominator: denominator.toString(),
    };
  }

  private gcd(a: bigint, b: bigint): bigint {
    while (b) [a, b] = [b, a % b];
    return a;
  }
  private requireCurrency(code: string) {
    if (!isSupportedCurrencyCode(code))
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURRENCY",
        "Unsupported currency code",
      );
  }
  private date(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_VALUATION_DATE",
        "Invalid valuation date",
      );
    return date;
  }
  private present(
    row: {
      id: string;
      baseCurrency: string;
      status: string;
      source: string;
      effectiveDate: Date;
      capturedAt: Date;
      expiresAt: Date | null;
      quotes: Array<{
        quoteCurrency: string;
        numerator: string;
        denominator: string;
      }>;
    },
    amountMinor?: string,
  ) {
    return {
      valuationId: row.id,
      baseCurrency: row.baseCurrency,
      status: row.status,
      source: row.source,
      effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
      capturedAt: row.capturedAt,
      expiresAt: row.expiresAt,
      quotes: row.quotes,
      convertedPreviews: amountMinor
        ? row.quotes.map((quote) => ({
            currency: quote.quoteCurrency,
            amountMinor: this.convert(
              BigInt(amountMinor),
              BigInt(quote.numerator),
              BigInt(quote.denominator),
              this.minorUnit(row.baseCurrency),
              this.minorUnit(quote.quoteCurrency),
            ).toString(),
          }))
        : [],
    };
  }
}
