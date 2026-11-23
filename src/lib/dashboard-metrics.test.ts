import { describe, expect, it } from "vitest";
import {
  approvedOrInProgressLabel,
  checkInAnsweredMetrics,
  displayCampaignStatus,
  localSetupStatus,
} from "./dashboard-metrics";

const pending = { completed: false, checkInStatus: "pending", checkInSentAt: null };
const done = { completed: true, checkInStatus: "done", checkInSentAt: "2026-11-23T00:00:00Z" };
const delayed = { completed: false, checkInStatus: "delayed", checkInSentAt: "2026-11-23T00:00:00Z" };
const sent = { completed: false, checkInStatus: "no_reply", checkInSentAt: "2026-11-23T00:00:00Z" };

describe("checkInAnsweredMetrics", () => {
  it("counts replies among requested check-ins, not every task", () => {
    const metrics = checkInAnsweredMetrics([
      {
        status: "delayed",
        asanaProjectCreated: false,
        tasks: [done, delayed, sent, pending],
      },
      {
        status: "draft",
        asanaProjectCreated: false,
        tasks: [done, pending, pending],
      },
    ]);
    expect(metrics).toEqual({ answered: 2, requested: 3 });
  });

  it("increments after a pending late task is marked done", () => {
    const campaign = {
      status: "delayed" as const,
      asanaProjectCreated: false,
      tasks: [delayed, { ...pending }, { ...pending }],
    };
    expect(checkInAnsweredMetrics([campaign])).toEqual({ answered: 1, requested: 1 });
    campaign.tasks[1] = { completed: true, checkInStatus: "done", checkInSentAt: "2026-11-23T00:00:00Z" };
    expect(checkInAnsweredMetrics([campaign])).toEqual({ answered: 2, requested: 2 });
  });

  it("does not increment when an already answered check-in is updated to done", () => {
    const campaign = {
      status: "blocked" as const,
      asanaProjectCreated: false,
      tasks: [
        { completed: false, checkInStatus: "blocked", checkInSentAt: "2026-11-23T00:00:00Z" },
        pending,
        pending,
      ],
    };
    expect(checkInAnsweredMetrics([campaign])).toEqual({ answered: 1, requested: 1 });
    campaign.tasks[0] = { completed: true, checkInStatus: "done", checkInSentAt: "2026-11-23T00:00:00Z" };
    expect(checkInAnsweredMetrics([campaign])).toEqual({ answered: 1, requested: 1 });
  });
});

describe("displayCampaignStatus", () => {
  it("does not show Live for approved local demo campaigns", () => {
    expect(
      displayCampaignStatus({
        status: "live",
        asanaProjectCreated: false,
        tasks: [pending, pending, pending],
      }).label,
    ).toBe("Approved");
    expect(
      displayCampaignStatus({
        status: "live",
        asanaProjectCreated: false,
        tasks: [done, pending, pending],
      }).label,
    ).toBe("In progress");
    expect(
      displayCampaignStatus({
        status: "live",
        asanaProjectCreated: true,
        tasks: [pending],
      }).label,
    ).toBe("Live");
  });

  it("uses a non-live label when no real Asana project exists", () => {
    expect(
      approvedOrInProgressLabel([
        { status: "live", asanaProjectCreated: false, tasks: [] },
        { status: "approved", asanaProjectCreated: false, tasks: [] },
      ]),
    ).toBe("Approved or in progress");
    expect(localSetupStatus({
      allDone: false,
      blocked: false,
      delayed: false,
      asanaProjectCreated: false,
      hasProgress: false,
    })).toBe("approved");
    expect(localSetupStatus({
      allDone: false,
      blocked: false,
      delayed: false,
      asanaProjectCreated: false,
      hasProgress: true,
    })).toBe("setting_up");
  });
});
