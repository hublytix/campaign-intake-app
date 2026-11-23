import { describe, expect, it } from "vitest";
import { DEFAULT_APPROVAL_RULES, resolveApprover } from "./approvals";

describe("resolveApprover", () => {
  it("uses the first matching rule, budget before type", () => {
    const highBudget = resolveApprover(DEFAULT_APPROVAL_RULES, {
      type: "event",
      budgetUsd: 25000,
    });
    expect(highBudget.needed).toBe(true);
    expect(highBudget.approverRole).toBe("Head of Marketing");

    const event = resolveApprover(DEFAULT_APPROVAL_RULES, {
      type: "event",
      budgetUsd: 0,
    });
    expect(event.approverRole).toBe("Events director");
  });

  it("does not require approval when no rule matches", () => {
    const result = resolveApprover(DEFAULT_APPROVAL_RULES, {
      type: "content_asset",
      budgetUsd: 100,
    });
    expect(result.needed).toBe(false);
    expect(result.approverRole).toBeNull();
  });
});
