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

  it("accepts an empty brief, budget or region when the admin made them optional", () => {
    const fields = [
      { id: "brief", required: false },
      { id: "budgetUsd", required: false },
      { id: "region", required: false },
    ];
    const result = validateCampaignInput({ ...valid, brief: "", budgetUsd: "", region: "" }, fields);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.budgetUsd).toBe(0);
  });

  it("rejects an empty budget when it is required", () => {
    const result = validateCampaignInput({ ...valid, budgetUsd: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.budgetUsd).toBeTruthy();
  });

  it("requires the venue for events only when the admin made it required", () => {
    const fields = [{ id: "venue", required: true }];
    const event = validateCampaignInput({ ...valid, venue: "" }, fields);
    expect(event.ok).toBe(false);
    if (!event.ok) expect(event.errors.venue).toBeTruthy();
    expect(validateCampaignInput({ ...valid, type: "content_asset", venue: "" }, fields).ok).toBe(true);
    expect(validateCampaignInput({ ...valid, venue: "" }).ok).toBe(true);
  });

  it("keeps name, type and launch date required even if settings say optional", () => {
    const fields = [
      { id: "shortName", required: false },
      { id: "type", required: false },
      { id: "launchDate", required: false },
    ];
    for (const field of ["shortName", "type", "launchDate"] as const) {
      const result = validateCampaignInput({ ...valid, [field]: "" }, fields);
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
