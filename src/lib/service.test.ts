import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "./db";
import { decideCampaign, getCampaign, listCampaigns, recordCheckIn, saveDraft, submitCampaign } from "./service";

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

  it("updates the same draft on save, then submits and approves that id", async () => {
    const payload = {
      shortName: "QA Retest Event",
      type: "event",
      region: "NA",
      launchDate: "2027-02-18",
      budgetUsd: 0,
      brief: "First save",
      idempotencyKey: "qa-retest-event-key",
    };
    const first = saveDraft(payload);
    const second = saveDraft({
      ...payload,
      id: first!.id,
      brief: "Edited brief after save",
    });
    expect(second!.id).toBe(first!.id);
    expect(second!.brief).toBe("Edited brief after save");
    expect(
      listCampaigns().filter((campaign) => campaign.shortName === "QA Retest Event"),
    ).toHaveLength(1);

    const submitted = await submitCampaign({ id: first!.id as string, confirm: true });
    expect(submitted.campaign?.id).toBe(first!.id);
    expect(submitted.campaign?.status).toBe("awaiting_approval");
    const again = await submitCampaign({ id: first!.id as string, confirm: true });
    expect(again.campaign?.id).toBe(first!.id);
    expect(again.campaign?.status).toBe("awaiting_approval");

    const approved = await decideCampaign({
      id: first!.id as string,
      decision: "approve",
      confirm: true,
    });
    expect(approved.campaign?.id).toBe(first!.id);
    expect(approved.asanaProjectCreated).toBe(false);
    expect(approved.campaign?.status).toBe("approved");
    expect(approved.campaign?.status).not.toBe("live");
  });

  it("reuses one draft for repeated and concurrent saves with the same idempotency key", async () => {
    const payload = {
      shortName: "Idempotent Event",
      type: "event",
      region: "NA",
      launchDate: "2027-03-01",
      budgetUsd: 0,
      brief: "First click",
      idempotencyKey: "same-form-session",
    };
    const first = saveDraft(payload);
    const second = saveDraft({ ...payload, brief: "Second click" });
    expect(second!.id).toBe(first!.id);
    expect(second!.brief).toBe("Second click");
    const concurrent = await Promise.all([
      Promise.resolve(saveDraft({ ...payload, brief: "A" })),
      Promise.resolve(saveDraft({ ...payload, brief: "B" })),
    ]);
    expect(new Set(concurrent.map((campaign) => campaign!.id))).toEqual(new Set([first!.id]));
    expect(
      listCampaigns().filter((campaign) => campaign.shortName === "Idempotent Event"),
    ).toHaveLength(1);

    await submitCampaign({ id: first!.id as string, confirm: false });
    const other = saveDraft({
      shortName: "Idempotent Event",
      type: "event",
      region: "NA",
      launchDate: "2027-03-01",
      budgetUsd: 0,
      brief: "A distinct second request",
      idempotencyKey: "a-different-form",
    });
    await expect(
      submitCampaign({ id: other!.id as string, confirm: false }),
    ).rejects.toThrow(/already exists/i);
  });

  it("updates the check-in answered metric after a pending task is marked done", async () => {
    const { checkInAnsweredMetrics } = await import("./dashboard-metrics");
    const campaign = saveDraft({
      shortName: "Ops Report Metric",
      type: "content_asset",
      region: "EMEA",
      launchDate: "2026-12-02",
      budgetUsd: 0,
      brief: "Metric coverage",
    });
    const submitted = await submitCampaign({ id: campaign!.id as string, confirm: true });
    const beforeTasks = submitted.campaign!.tasks as Array<{
      id: string;
      completed: boolean;
      checkInStatus: string;
      checkInSentAt: string | null;
    }>;
    const before = checkInAnsweredMetrics([
      { status: String(submitted.campaign!.status), asanaProjectCreated: false, tasks: beforeTasks },
    ]);
    expect(before).toEqual({ answered: 0, requested: 0 });

    const updated = recordCheckIn({
      campaignId: campaign!.id as string,
      taskId: beforeTasks[0]!.id,
      status: "done",
    });
    const afterTasks = updated!.tasks as Array<{
      id: string;
      completed: boolean;
      checkInStatus: string;
      checkInSentAt: string | null;
    }>;
    expect(afterTasks[0]?.completed).toBe(true);
    expect(afterTasks[0]?.checkInStatus).toBe("done");
    const after = checkInAnsweredMetrics([
      { status: String(updated!.status), asanaProjectCreated: false, tasks: afterTasks },
    ]);
    expect(after).toEqual({ answered: 1, requested: 1 });
  });
});
