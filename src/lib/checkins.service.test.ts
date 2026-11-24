import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { ensureDefaultOrg, getDb, openDatabase, resetDbForTests } from "./db";
import { getCampaign, persistTokens, refreshCampaignStatus, saveDraft, sendCheckIn } from "./service";

const REAL_ENV = {
  ASANA_CLIENT_ID: "client",
  ASANA_CLIENT_SECRET: "secret",
  TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  SESSION_SECRET: "b".repeat(64),
  ASANA_ALLOWED_WORKSPACE_GID: "ws1",
};

function isolate(mode: "demo" | "real") {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cia-checkin-"));
  for (const [key, value] of Object.entries(REAL_ENV)) {
    if (mode === "real") process.env[key] = value;
    else delete process.env[key];
  }
  resetDbForTests(path.join(dir, "test.sqlite"));
}

function liveCampaignWithTask(opts: { asanaTaskGid?: string | null; ownerGid?: string | null }) {
  const campaign = saveDraft({
    shortName: "Spring Summit",
    type: "event",
    region: "NA",
    launchDate: "2027-05-05",
    budgetUsd: 0,
    brief: "Test brief",
  })!;
  const campaignId = String(campaign.id);
  const taskId = String(campaign.tasks[0].id);
  getDb()
    .prepare("UPDATE campaigns SET status = 'live', asana_project_gid = 'proj1' WHERE id = ?")
    .run(campaignId);
  getDb()
    .prepare("UPDATE campaign_tasks SET asana_task_gid = ?, owner_gid = ?, owner_name = ? WHERE id = ?")
    .run(opts.asanaTaskGid ?? null, opts.ownerGid ?? null, opts.ownerGid ? "Priya" : null, taskId);
  return { campaignId, taskId, taskName: String(campaign.tasks[0].name) };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("database upgrade", () => {
  it("adds the check-in columns to a database created before they existed", () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "cia-old-")), "old.sqlite");
    const old = new DatabaseSync(file);
    old.exec(
      "CREATE TABLE campaign_tasks (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, org_id TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL, due_date TEXT NOT NULL, offset_days INTEGER NOT NULL, owner_gid TEXT, owner_name TEXT, asana_task_gid TEXT, completed INTEGER NOT NULL DEFAULT 0, check_in_status TEXT NOT NULL DEFAULT 'pending', check_in_note TEXT, check_in_sent_at TEXT)",
    );
    old.close();
    const db = openDatabase(file);
    const columns = (db.prepare("PRAGMA table_info(campaign_tasks)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    );
    db.close();
    expect(columns).toContain("check_in_story_gid");
    expect(columns).toContain("check_in_reply_gid");
  });
});

describe("check-ins in demo mode", () => {
  beforeEach(() => isolate("demo"));

  it("records the check-in locally and says nothing was sent", async () => {
    const { campaignId, taskId } = liveCampaignWithTask({});
    const result = await sendCheckIn({ campaignId, taskId });
    expect(result.sentToAsana).toBe(false);
    expect(result.message).toMatch(/Nothing was sent to Asana/);
    const task = result.campaign!.tasks.find((t) => t.id === taskId)!;
    expect(task.checkInSentAt).toBeTruthy();
    expect(task.checkInStatus).toBe("no_reply");
  });
});

describe("check-ins in real mode", () => {
  beforeEach(() => {
    isolate("real");
    ensureDefaultOrg();
    persistTokens("org_local", { access_token: "tok", expires_in: 3600 }, "ws1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(REAL_ENV)) delete process.env[key];
  });

  it("refuses when the task isn't in Asana or has no owner", async () => {
    const noTask = liveCampaignWithTask({ asanaTaskGid: null, ownerGid: "u1" });
    await expect(sendCheckIn(noTask)).rejects.toThrow(/isn't in Asana yet/);
    getDb().prepare("DELETE FROM campaign_tasks").run();
    getDb().prepare("DELETE FROM campaigns").run();
    const noOwner = liveCampaignWithTask({ asanaTaskGid: "t1", ownerGid: null });
    await expect(sendCheckIn(noOwner)).rejects.toThrow(/Assign an owner/);
  });

  it("asks to reconnect Asana when commenting isn't permitted", async () => {
    const ids = liveCampaignWithTask({ asanaTaskGid: "t1", ownerGid: "u1" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ errors: [{ message: "Forbidden" }] }), { status: 403 }),
      ),
    );
    await expect(sendCheckIn(ids)).rejects.toThrow(/reconnect Asana/);
    const task = getCampaign(ids.campaignId)!.tasks.find((t) => t.id === ids.taskId)!;
    expect(task.checkInSentAt).toBeNull();
  });

  it("posts a comment mentioning the owner, then applies their reply on refresh", async () => {
    const { campaignId, taskId, taskName } = liveCampaignWithTask({ asanaTaskGid: "t1", ownerGid: "u1" });
    const calls: Array<{ url: string; method: string; body: string }> = [];
    const replyAt = new Date(Date.now() + 60_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: String(init?.body ?? "") });
        if (url.endsWith("/tasks/t1/stories") && method === "POST") {
          return jsonResponse({ data: { gid: "story-checkin" } });
        }
        if (url.includes("/projects/proj1/tasks")) {
          return jsonResponse({
            data: [{ gid: "t1", name: taskName, completed: false, due_on: null, assignee: { gid: "u1", name: "Priya" } }],
          });
        }
        if (url.includes("/tasks/t1/stories")) {
          return jsonResponse({
            data: [
              { gid: "story-checkin", text: "Priya quick check-in…", created_at: replyAt, resource_subtype: "comment_added" },
              { gid: "story-reply", text: "blocked - waiting on legal", created_at: replyAt, resource_subtype: "comment_added" },
            ],
          });
        }
        throw new Error(`Unexpected request ${method} ${url}`);
      }),
    );

    const sent = await sendCheckIn({ campaignId, taskId });
    expect(sent.sentToAsana).toBe(true);
    const post = calls.find((c) => c.method === "POST")!;
    expect(JSON.parse(post.body).data.html_text).toContain('<a data-asana-gid="u1"/>');

    await refreshCampaignStatus(campaignId);
    const task = getCampaign(campaignId)!.tasks.find((t) => t.id === taskId)!;
    expect(task.checkInStatus).toBe("blocked");
    expect(task.checkInNote).toBe("waiting on legal");
    expect(task.checkInReplyGid).toBe("story-reply");
    expect(getCampaign(campaignId)!.status).toBe("blocked");
  });
});
