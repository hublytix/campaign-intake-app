import { describe, expect, it } from "vitest";
import { applyNamePattern, applyUtmPattern, fiscalYearToken, slugify } from "./naming";

describe("slugify", () => {
  it("lowercases and hyphenates a campaign short name", () => {
    expect(slugify("Fall Summit")).toBe("fall-summit");
  });
});

describe("fiscalYearToken", () => {
  it("uses the launch year as FY plus two digits", () => {
    expect(fiscalYearToken(new Date("2027-02-18T00:00:00Z"))).toBe("FY27");
  });
});

describe("applyNamePattern", () => {
  it("builds the mockup-style campaign name and respects max length", () => {
    const name = applyNamePattern(
      "{FY}-{Region}-{Type}-{Name}",
      {
        launchDate: new Date("2027-02-18T00:00:00Z"),
        region: "NA",
        type: "event",
        shortName: "Fall Summit",
        quarter: "Q1",
        owner: "Jordan Lee",
      },
      50,
    );
    expect(name).toBe("FY27-NA-Event-Fall-Summit");
    expect(name.length).toBeLessThanOrEqual(50);
  });

  it("truncates names that exceed the maximum length", () => {
    const name = applyNamePattern(
      "{Name}",
      {
        launchDate: new Date("2027-01-01T00:00:00Z"),
        region: "NA",
        type: "event",
        shortName: "A very long campaign name that should be cut",
      },
      10,
    );
    expect(name).toBe("A-Very-Lon");
  });
});

describe("applyUtmPattern", () => {
  it("fills the campaign slug into the UTM pattern", () => {
    const utm = applyUtmPattern(
      "utm_source={channel}&utm_medium={medium}&utm_campaign={name_slug}",
      {
        launchDate: new Date("2027-02-18T00:00:00Z"),
        region: "NA",
        type: "event",
        shortName: "Fall Summit",
        channel: "linkedin",
        medium: "paid-social",
      },
    );
    expect(utm).toBe(
      "utm_source=linkedin&utm_medium=paid-social&utm_campaign=fy27-na-event-fall-summit",
    );
  });
});
