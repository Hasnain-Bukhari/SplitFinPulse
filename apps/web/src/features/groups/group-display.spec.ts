import { describe, expect, it } from "vitest";
import { groupInitials } from "./group-display";

describe("group display", () => {
  it("creates compact initials without exposing an identifier", () => {
    expect(groupInitials("Summer Escape")).toBe("SE");
    expect(groupInitials("  Home  ")).toBe("H");
  });
});
