import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { nextOccurrences } from "./recurrence";

describe("recurrence", () => {
  it("clamps monthly schedules to month end", () => {
    const rows = nextOccurrences(
      {
        unit: "MONTH",
        interval: 1,
        weekdays: [],
        anchorDate: "2024-01-31",
        localTime: "09:00",
        timezone: "UTC",
      },
      Temporal.Instant.from("2024-01-01T00:00:00Z"),
      3,
    );
    expect(rows.map((row) => row.localDate)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
    ]);
  });

  it("uses the compatible DST gap behavior", () => {
    const [row] = nextOccurrences(
      {
        unit: "DAY",
        interval: 1,
        weekdays: [],
        anchorDate: "2024-03-10",
        localTime: "02:30",
        timezone: "America/New_York",
      },
      Temporal.Instant.from("2024-03-10T00:00:00Z"),
      1,
    );
    expect(row?.scheduledFor).toBe("2024-03-10T07:30:00Z");
  });

  it("uses the earlier offset when a wall time occurs twice", () => {
    const [row] = nextOccurrences(
      {
        unit: "DAY",
        interval: 1,
        weekdays: [],
        anchorDate: "2024-11-03",
        localTime: "01:30",
        timezone: "America/New_York",
      },
      Temporal.Instant.from("2024-11-03T00:00:00Z"),
      1,
    );
    expect(row?.scheduledFor).toBe("2024-11-03T05:30:00Z");
  });

  it("supports interval weeks with multiple ISO weekdays", () => {
    const rows = nextOccurrences(
      {
        unit: "WEEK",
        interval: 2,
        weekdays: [1, 5],
        anchorDate: "2026-08-17",
        localTime: "09:00",
        timezone: "UTC",
      },
      Temporal.Instant.from("2026-08-17T00:00:00Z"),
      4,
    );
    expect(rows.map((row) => row.localDate)).toEqual([
      "2026-08-17",
      "2026-08-21",
      "2026-08-31",
      "2026-09-04",
    ]);
  });

  it("clamps leap-day yearly schedules and honors an inclusive end date", () => {
    const rows = nextOccurrences(
      {
        unit: "YEAR",
        interval: 1,
        weekdays: [],
        anchorDate: "2024-02-29",
        localTime: "09:00",
        timezone: "UTC",
        endDate: "2026-02-28",
      },
      Temporal.Instant.from("2024-01-01T00:00:00Z"),
      5,
    );
    expect(rows.map((row) => row.localDate)).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
    ]);
  });
});
