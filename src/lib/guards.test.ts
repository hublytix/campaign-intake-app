import { describe, expect, it } from "vitest";
import {
  assertWorkspaceAllowed,
  canWriteToAsana,
  demoAsanaResult,
  findDuplicateCampaign,
} from "./guards";

describe("assertWorkspaceAllowed", () => {
  it("allows only GIDs on the configured allow-list", () => {
    expect(() => assertWorkspaceAllowed("111", ["111", "222"])).not.toThrow();
    expect(() => assertWorkspaceAllowed("999", ["111", "222"])).toThrow(
      /not in the allow-list/i,
    );
    expect(() => assertWorkspaceAllowed("111", [])).toThrow(/allow-list/i);
  });
});

describe("canWriteToAsana", () => {
  it("blocks writes in demo and misconfigured modes", () => {
    expect(
      canWriteToAsana({
        mode: "demo",
        confirmed: true,
        alreadyHasProject: false,
        workspaceGid: "111",
        allowedWorkspaceGids: ["111"],
      }).allowed,
    ).toBe(false);

    expect(
      canWriteToAsana({
        mode: "misconfigured",
        confirmed: true,
        alreadyHasProject: false,
        workspaceGid: "111",
        allowedWorkspaceGids: ["111"],
      }).allowed,
    ).toBe(false);
  });

  it("requires an explicit confirmation and blocks duplicate Asana creates", () => {
    const base = {
      mode: "real" as const,
      alreadyHasProject: false,
      workspaceGid: "111",
      allowedWorkspaceGids: ["111"],
    };
    const unconfirmed = canWriteToAsana({ ...base, confirmed: false });
    expect(unconfirmed.allowed).toBe(false);
    expect(unconfirmed.reason).toMatch(/confirm/i);

    expect(
      canWriteToAsana({
        ...base,
        confirmed: true,
        alreadyHasProject: true,
      }).allowed,
    ).toBe(false);

    expect(canWriteToAsana({ ...base, confirmed: true }).allowed).toBe(true);
  });
});

describe("demoAsanaResult", () => {
  it("never claims that an Asana project was created", () => {
    const result = demoAsanaResult();
    expect(result.asanaProjectCreated).toBe(false);
    expect(result.asanaProjectGid).toBeNull();
    expect(result.message).toMatch(/demo/i);
    expect(result.message).not.toMatch(/created in asana/i);
  });
});

describe("findDuplicateCampaign", () => {
  const existing = [
    {
      id: "c1",
      normalizedName: "fy27-na-event-fall-summit",
      launchDate: "2027-02-18",
      status: "draft",
    },
    {
      id: "c2",
      normalizedName: "fy27-emea-growth-reactivation",
      launchDate: "2026-11-17",
      status: "rejected",
    },
  ];

  it("detects an active campaign with the same name and launch date", () => {
    const hit = findDuplicateCampaign(existing, {
      normalizedName: "fy27-na-event-fall-summit",
      launchDate: "2027-02-18",
    });
    expect(hit?.id).toBe("c1");
  });

  it("allows a name after a rejected request, and ignores a different date", () => {
    expect(
      findDuplicateCampaign(existing, {
        normalizedName: "fy27-emea-growth-reactivation",
        launchDate: "2026-11-17",
      }),
    ).toBeNull();
    expect(
      findDuplicateCampaign(existing, {
        normalizedName: "fy27-na-event-fall-summit",
        launchDate: "2027-03-01",
      }),
    ).toBeNull();
  });

  it("ignores the campaign being submitted so a saved draft can be sent", () => {
    expect(
      findDuplicateCampaign(existing, {
        normalizedName: "fy27-na-event-fall-summit",
        launchDate: "2027-02-18",
        ignoreId: "c1",
      }),
    ).toBeNull();
  });
});
