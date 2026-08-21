import { Temporal } from "@js-temporal/polyfill";

export type RecurrenceRule = {
  unit: "DAY" | "WEEK" | "MONTH" | "YEAR";
  interval: number;
  weekdays: number[];
  anchorDate: string;
  localTime: string;
  timezone: string;
  endDate?: string;
};

export type RecurrenceOccurrence = {
  occurrenceKey: string;
  localDate: string;
  localTime: string;
  scheduledFor: string;
};

export function nextOccurrences(
  rule: RecurrenceRule,
  from: Temporal.Instant,
  limit: number,
): RecurrenceOccurrence[] {
  validateRule(rule);
  const anchor = Temporal.PlainDate.from(rule.anchorDate);
  const end = rule.endDate ? Temporal.PlainDate.from(rule.endDate) : undefined;
  const time = Temporal.PlainTime.from(rule.localTime);
  const results: RecurrenceOccurrence[] = [];
  let date = anchor;
  const maximumDays = 366 * 400;
  for (
    let scanned = 0;
    scanned < maximumDays && results.length < limit;
    scanned += 1
  ) {
    if (end && Temporal.PlainDate.compare(date, end) > 0) break;
    if (matches(rule, anchor, date)) {
      const zoned = date.toZonedDateTime({
        timeZone: rule.timezone,
        plainTime: time,
      });
      const instant = zoned.toInstant();
      if (Temporal.Instant.compare(instant, from) >= 0) {
        results.push({
          occurrenceKey: `${date.toString()}T${time.toString({ smallestUnit: "minute" })}[${rule.timezone}]`,
          localDate: date.toString(),
          localTime: time.toString({ smallestUnit: "minute" }),
          scheduledFor: instant.toString(),
        });
      }
    }
    date = date.add({ days: 1 });
  }
  return results;
}

function matches(
  rule: RecurrenceRule,
  anchor: Temporal.PlainDate,
  date: Temporal.PlainDate,
): boolean {
  const days = anchor.until(date, { largestUnit: "day" }).days;
  if (days < 0) return false;
  if (rule.unit === "DAY") return days % rule.interval === 0;
  if (rule.unit === "WEEK") {
    return (
      Math.floor(days / 7) % rule.interval === 0 &&
      rule.weekdays.includes(date.dayOfWeek)
    );
  }
  const months = (date.year - anchor.year) * 12 + date.month - anchor.month;
  if (rule.unit === "MONTH") {
    if (months < 0 || months % rule.interval !== 0) return false;
    return date.day === Math.min(anchor.day, date.daysInMonth);
  }
  const years = date.year - anchor.year;
  if (years < 0 || years % rule.interval !== 0 || date.month !== anchor.month)
    return false;
  return date.day === Math.min(anchor.day, date.daysInMonth);
}

export function validateRule(rule: RecurrenceRule): void {
  if (
    !Number.isInteger(rule.interval) ||
    rule.interval < 1 ||
    rule.interval > 365
  ) {
    throw new Error("INVALID_RECURRENCE");
  }
  try {
    const anchor = Temporal.PlainDate.from(rule.anchorDate);
    Temporal.PlainTime.from(rule.localTime);
    anchor.toZonedDateTime({
      timeZone: rule.timezone,
      plainTime: rule.localTime,
    });
    if (
      rule.endDate &&
      Temporal.PlainDate.compare(
        Temporal.PlainDate.from(rule.endDate),
        anchor,
      ) < 0
    ) {
      throw new Error("INVALID_RECURRENCE");
    }
  } catch {
    throw new Error("INVALID_RECURRENCE");
  }
  if (rule.unit === "WEEK") {
    if (
      !rule.weekdays.length ||
      rule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
    ) {
      throw new Error("INVALID_RECURRENCE");
    }
  } else if (rule.weekdays.length) {
    throw new Error("INVALID_RECURRENCE");
  }
}
