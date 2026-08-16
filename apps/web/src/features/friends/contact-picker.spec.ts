import { describe, expect, it } from "vitest";
import { selectedContactEmails } from "./contact-picker";

describe("selectedContactEmails", () => {
  it("returns only normalized emails from explicitly selected contacts", () => {
    expect(
      selectedContactEmails([
        { email: [" Friend@Example.com ", "friend@example.com"] },
        {},
        { email: ["second@example.com"] },
      ]),
    ).toEqual(["friend@example.com", "second@example.com"]);
  });

  it("limits contact discovery to twenty selected email addresses", () => {
    const selected = Array.from({ length: 25 }, (_, index) => ({
      email: [`person-${index}@example.com`],
    }));
    expect(selectedContactEmails(selected)).toHaveLength(20);
  });
});
