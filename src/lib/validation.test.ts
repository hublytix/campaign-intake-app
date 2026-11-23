import { describe, expect, it } from "vitest";
import { validateCampaignInput } from "./validation";

const valid = {
  shortName: "Fall Summit",
  type: "event" as const,
  region: "NA",
  launchDate: "2027-02-18",
  budgetUsd: 0,
  venue: "",
  brief: "Goal, audience, key message",
};

describe("validateCampaignInput", () => {
  it("accepts a complete event request", () => {
    const result = validateCampaignInput(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.shortName).toBe("Fall Summit");
      expect(result.value.budgetUsd).toBe(0);
    }
  });

  it("rejects a missing name, type, region, launch date or brief", () => {
    for (const field of ["shortName", "type", "region", "launchDate", "brief"] as const) {
      const result = validateCampaignInput({ ...valid, [field]: "" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[field]).toBeTruthy();
    }
  });

  it("rejects an invalid launch date and a negative budget", () => {
    expect(validateCampaignInput({ ...valid, launchDate: "not-a-date" }).ok).toBe(false);
    const budget = validateCampaignInput({ ...valid, budgetUsd: -10 });
    expect(budget.ok).toBe(false);
  });
});
