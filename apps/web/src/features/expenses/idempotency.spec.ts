import { describe, expect, it, vi } from "vitest";
import {
  createIdempotencyKeyTracker,
  expenseDraftFingerprint,
} from "./idempotency";

describe("expense idempotency key tracking", () => {
  it("reuses a key for the same canonical draft", () => {
    const generate = vi.fn().mockReturnValueOnce("key-1");
    const tracker = createIdempotencyKeyTracker(generate);
    expect(tracker.forInput({ totalMinor: "1000" })).toBe("key-1");
    expect(tracker.forInput({ totalMinor: "1000" })).toBe("key-1");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("rotates after a draft change or successful reset", () => {
    const generate = vi
      .fn()
      .mockReturnValueOnce("key-1")
      .mockReturnValueOnce("key-2")
      .mockReturnValueOnce("key-3");
    const tracker = createIdempotencyKeyTracker(generate);
    expect(tracker.forInput({ totalMinor: "1000" })).toBe("key-1");
    expect(tracker.forInput({ totalMinor: "1001" })).toBe("key-2");
    tracker.reset();
    expect(tracker.forInput({ totalMinor: "1001" })).toBe("key-3");
  });

  it("detects a draft changed after its authoritative preview", () => {
    const previewed = expenseDraftFingerprint({
      totalMinor: "1000",
      splitMethod: "EQUAL",
      participants: [{ userId: "user-1" }],
    });
    const changed = expenseDraftFingerprint({
      totalMinor: "1000",
      splitMethod: "EQUAL",
      participants: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    expect(changed).not.toBe(previewed);
  });
});
