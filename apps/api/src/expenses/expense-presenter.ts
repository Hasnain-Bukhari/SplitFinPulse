type RevisionLike = {
  id: string;
  revision: number;
  action: string;
  actorId: string;
  description: string;
  totalMinor: bigint;
  currency: string;
  expenseDate: Date;
  notes: string | null;
  splitMethod: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  exchangeRateSet: {
    id: string;
    status: string;
    source: string;
    baseCurrency: string;
    effectiveDate: Date;
    capturedAt: Date;
    quotes: Array<{
      quoteCurrency: string;
      numerator: string;
      denominator: string;
    }>;
  } | null;
  createdAt: Date;
  actor: { id: string; name: string; avatarUrl: string | null };
  payers: Array<{
    userId: string;
    amountMinor: bigint;
    user: { id: string; name: string; avatarUrl: string | null };
  }>;
  splits: Array<{
    userId: string;
    amountMinor: bigint;
    inputValue: string | null;
    user: { id: string; name: string; avatarUrl: string | null };
  }>;
  ledgerEntries: Array<{
    sequence: number;
    debtorId: string;
    creditorId: string;
    amountMinor: bigint;
    currency: string;
    debtor: { id: string; name: string; avatarUrl: string | null };
    creditor: { id: string; name: string; avatarUrl: string | null };
  }>;
};

export const presentRevision = (row: RevisionLike) => ({
  id: row.id,
  revisionNumber: row.revision,
  action: row.action,
  actor: row.actor,
  description: row.description,
  totalMinor: row.totalMinor.toString(),
  currency: row.currency,
  expenseDate: row.expenseDate.toISOString().slice(0, 10),
  notes: row.notes,
  splitMethod: row.splitMethod,
  category: row.categoryName
    ? { id: row.categoryId, name: row.categoryName, icon: row.categoryIcon }
    : null,
  valuation: row.exchangeRateSet
    ? {
        id: row.exchangeRateSet.id,
        status: row.exchangeRateSet.status,
        source: row.exchangeRateSet.source,
        baseCurrency: row.exchangeRateSet.baseCurrency,
        effectiveDate: row.exchangeRateSet.effectiveDate
          .toISOString()
          .slice(0, 10),
        capturedAt: row.exchangeRateSet.capturedAt,
        quotes: row.exchangeRateSet.quotes,
      }
    : null,
  createdAt: row.createdAt,
  payers: row.payers.map((item) => ({
    userId: item.userId,
    user: item.user,
    amountMinor: item.amountMinor.toString(),
  })),
  splits: row.splits.map((item) => ({
    userId: item.userId,
    user: item.user,
    owedMinor: item.amountMinor.toString(),
    ...(item.inputValue ? { input: item.inputValue } : {}),
  })),
  ledgerEntries: row.ledgerEntries.map((item) => ({
    sequence: item.sequence,
    debtorId: item.debtorId,
    debtor: item.debtor,
    creditorId: item.creditorId,
    creditor: item.creditor,
    amountMinor: item.amountMinor.toString(),
    currency: item.currency,
  })),
});

export const revisionInclude = {
  exchangeRateSet: {
    include: { quotes: { orderBy: { quoteCurrency: "asc" as const } } },
  },
  actor: { select: { id: true, name: true, avatarUrl: true } },
  payers: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { userId: "asc" as const },
  },
  splits: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { userId: "asc" as const },
  },
  ledgerEntries: {
    include: {
      debtor: { select: { id: true, name: true, avatarUrl: true } },
      creditor: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { sequence: "asc" as const },
  },
};
