import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "./db";
import { getCampaign, saveDraft, submitCampaign } from "./service";

function isolate() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cia-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  // force demo mode
  for (const key of [
    "ASANA_CLIENT_ID",
    "ASANA_CLIENT_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "SESSION_SECRET",
    "ASANA_ALLOWED_WORKSPACE_GID",
  ]) {
    delete process.env[key];
  }
  resetDbForTests(process.env.DATABASE_PATH);
}

describe("campaign service in demo mode", () => {
  beforeEach(isolate);

  it("saves a draft and records starter tasks", () => {
    const campaign = saveDraft({
      shortName: "Fall Summit",
      type: "event",
      region: "NA",
      launchDate: "2027-02-18",
      budgetUsd: 0,
      brief: "A test brief",
    });
    expect(campaign?.fullName).toBe("FY27-NA-Event-Fall-Summit");
    expect(campaign?.status).toBe("draft");
    expect(campaign?.tasks).toHaveLength(3);
    expect(campaign?.asanaProjectCreated).toBe(false);
  });

  it("sends high-budget events for approval and never creates an Asana project in demo", async () => {
    const campaign = saveDraft({
      shortName: "Fall Summit",
      type: "event",
      region: "NA",
      launchDate: "2027-02-18",
      budgetUsd: 25000,
      brief: "A test brief",
    });
    const result = await submitCampaign({ id: campaign!.id as string, confirm: true });
    expect(result.campaign?.status).toBe("awaiting_approval");
    expect(result.asanaProjectCreated).toBe(false);
    expect(result.message).toMatch(/No Asana project/i);
  });

  it("saves locally in demo without claiming an Asana project was created", async () => {
    const campaign = saveDraft({
      shortName: "Ops Report",
      type: "content_asset",
      region: "EMEA",
      launchDate: "2026-12-02",
      budgetUsd: 0,
      brief: "A test brief",
    });
    const result = await submitCampaign({ id: campaign!.id as string, confirm: true });
    expect(result.asanaProjectCreated).toBe(false);
    expect("asanaProjectGid" in result ? result.asanaProjectGid : null).toBeNull();
    expect(result.message).toMatch(/demo mode/i);
    expect(getCampaign(campaign!.id as string)?.asanaProjectGid).toBeFalsy();
  });

  it("rejects a duplicate active campaign with the same name and date", async () => {
    const first = saveDraft({
      shortName: "Ops Report",
      type: "content_asset",
      region: "EMEA",
      launchDate: "2026-12-02",
      budgetUsd: 0,
      brief: "A test brief",
    });
    await submitCampaign({ id: first!.id as string, confirm: true });
    const second = saveDraft({
      shortName: "Ops Report",
      type: "content_asset",
      region: "EMEA",
      launchDate: "2026-12-02",
      budgetUsd: 0,
      brief: "A test brief",
    });
    await expect(
      submitCampaign({ id: second!.id as string, confirm: true }),
    ).rejects.toThrow(/already exists/i);
  });
});
