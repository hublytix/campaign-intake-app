import { resolveApprover } from "./approvals";
import {
  AsanaClient,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeAsanaToken,
} from "./asana";
import { ASANA_SCOPES, asanaRedirectUri, inspectEnv, resolveAppMode } from "./config";
import { decryptSecret, encryptSecret, randomUrlSafe } from "./crypto";
import { defaultSettings, type OrgSettings } from "./defaults";
import { DEFAULT_ORG_ID, ensureDefaultOrg, getDb, newId, nowIso } from "./db";
import { localSetupStatus } from "./dashboard-metrics";
import { demoAsanaResult, findDuplicateCampaign, canWriteToAsana } from "./guards";
import { getTokenKey } from "./keys";
import { applyNamePattern, applyUtmPattern, normalizeCampaignName } from "./naming";
import { tasksForLaunch } from "./templates";
import type {
  CampaignType,
  DuplicateCandidate,
  TaskCheckInStatus,
  ValidatedCampaignInput,
} from "./types";
import { LOCKED_REQUIRED_FIELDS, validateCampaignInput } from "./validation";

export interface ConnectionPublic {
  connected: boolean;
  workspaceGid: string | null;
  workspaceName: string | null;
  asanaUserName: string | null;
  asanaUserGid: string | null;
  connectedAt: string | null;
}

function settingsRow(orgId: string): OrgSettings {
  const row = getDb()
    .prepare("SELECT payload_json FROM settings WHERE org_id = ?")
    .get(orgId) as { payload_json: string } | undefined;
  if (!row) return defaultSettings();
  return { ...defaultSettings(), ...JSON.parse(row.payload_json) };
}

export function getSettings(orgId = DEFAULT_ORG_ID): OrgSettings {
  ensureDefaultOrg();
  return settingsRow(orgId);
}

export function saveSettings(patch: Partial<OrgSettings>, orgId = DEFAULT_ORG_ID): OrgSettings {
  ensureDefaultOrg();
  const next = { ...settingsRow(orgId), ...patch };
  next.formFields = next.formFields.map((field) =>
    (LOCKED_REQUIRED_FIELDS as readonly string[]).includes(field.id)
      ? { ...field, required: true }
      : field,
  );
  getDb()
    .prepare(
      `INSERT INTO settings (org_id, payload_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
    )
    .run(orgId, JSON.stringify(next), nowIso());
  return next;
}

export function getConnectionPublic(orgId = DEFAULT_ORG_ID): ConnectionPublic {
  const row = getDb()
    .prepare(
      `SELECT workspace_gid, workspace_name, asana_user_name, asana_user_gid, connected_at
       FROM asana_connections WHERE org_id = ?`,
    )
    .get(orgId) as
    | {
        workspace_gid: string | null;
        workspace_name: string | null;
        asana_user_name: string | null;
        asana_user_gid: string | null;
        connected_at: string | null;
      }
    | undefined;
  if (!row?.connected_at) {
    return {
      connected: false,
      workspaceGid: null,
      workspaceName: null,
      asanaUserName: null,
      asanaUserGid: null,
      connectedAt: null,
    };
  }
  return {
    connected: true,
    workspaceGid: row.workspace_gid,
    workspaceName: row.workspace_name,
    asanaUserName: row.asana_user_name,
    asanaUserGid: row.asana_user_gid,
    connectedAt: row.connected_at,
  };
}

interface ConnectionSecret {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  workspaceGid: string;
}

function readConnectionSecret(orgId: string): ConnectionSecret | null {
  if (resolveAppMode() !== "real") return null;
  const row = getDb()
    .prepare(
      `SELECT access_token_encrypted, refresh_token_encrypted, access_token_expires_at, workspace_gid
       FROM asana_connections WHERE org_id = ?`,
    )
    .get(orgId) as
    | {
        access_token_encrypted: string | null;
        refresh_token_encrypted: string | null;
        access_token_expires_at: string | null;
        workspace_gid: string | null;
      }
    | undefined;
  if (!row?.access_token_encrypted || !row.workspace_gid) return null;
  const key = getTokenKey();
  return {
    accessToken: decryptSecret(row.access_token_encrypted, key),
    refreshToken: row.refresh_token_encrypted
      ? decryptSecret(row.refresh_token_encrypted, key)
      : undefined,
    expiresAt: row.access_token_expires_at ?? undefined,
    workspaceGid: row.workspace_gid,
  };
}

async function liveClient(orgId: string): Promise<AsanaClient> {
  const inspection = inspectEnv();
  if (inspection.mode !== "real") {
    throw Object.assign(new Error("Asana is only available in real mode."), { status: 409 });
  }
  const secret = await withFreshToken(orgId);
  if (!secret) {
    throw Object.assign(new Error("Asana is not connected."), { status: 409 });
  }
  return new AsanaClient({
    accessToken: secret.accessToken,
    allowedWorkspaceGids: inspection.allowedWorkspaceGids,
  });
}

async function withFreshToken(orgId: string): Promise<ConnectionSecret | null> {
  const secret = readConnectionSecret(orgId);
  if (!secret) return null;
  const expires = secret.expiresAt ? Date.parse(secret.expiresAt) : 0;
  if (expires && expires - Date.now() > 60_000) return secret;
  if (!secret.refreshToken) return secret;
  const env = process.env;
  const tokens = await refreshAccessToken({
    clientId: env.ASANA_CLIENT_ID!,
    clientSecret: env.ASANA_CLIENT_SECRET!,
    refreshToken: secret.refreshToken,
  });
  persistTokens(orgId, tokens, secret.workspaceGid);
  return readConnectionSecret(orgId);
}

export function persistTokens(
  orgId: string,
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    data?: { gid?: string; name?: string; email?: string };
  },
  workspaceGid: string,
  workspaceName?: string,
): void {
  if (resolveAppMode() !== "real") {
    throw new Error("Refusing to store Asana tokens outside real mode.");
  }
  const key = getTokenKey();
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;
  getDb()
    .prepare(
      `INSERT INTO asana_connections (
         id, org_id, workspace_gid, workspace_name, asana_user_gid, asana_user_name,
         asana_user_email, access_token_encrypted, refresh_token_encrypted,
         access_token_expires_at, scopes, connected_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET
         workspace_gid = excluded.workspace_gid,
         workspace_name = COALESCE(excluded.workspace_name, asana_connections.workspace_name),
         asana_user_gid = COALESCE(excluded.asana_user_gid, asana_connections.asana_user_gid),
         asana_user_name = COALESCE(excluded.asana_user_name, asana_connections.asana_user_name),
         asana_user_email = COALESCE(excluded.asana_user_email, asana_connections.asana_user_email),
         access_token_encrypted = excluded.access_token_encrypted,
         refresh_token_encrypted = excluded.refresh_token_encrypted,
         access_token_expires_at = excluded.access_token_expires_at,
         scopes = excluded.scopes,
         connected_at = excluded.connected_at`,
    )
    .run(
      newId("conn"),
      orgId,
      workspaceGid,
      workspaceName ?? null,
      tokens.data?.gid ?? null,
      tokens.data?.name ?? null,
      tokens.data?.email ?? null,
      encryptSecret(tokens.access_token, key),
      tokens.refresh_token ? encryptSecret(tokens.refresh_token, key) : null,
      expiresAt,
      ASANA_SCOPES.join(" "),
      nowIso(),
    );
  const current = getSettings(orgId);
  if (!current.selectedWorkspaceGid) {
    saveSettings({ selectedWorkspaceGid: workspaceGid }, orgId);
  }
}

export async function completeOAuth(input: {
  code: string;
  verifier: string;
  orgId?: string;
}): Promise<ConnectionPublic> {
  const inspection = inspectEnv();
  if (inspection.mode !== "real") {
    throw Object.assign(new Error("Asana OAuth is disabled until configuration is complete."), {
      status: 409,
    });
  }
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  ensureDefaultOrg();
  const tokens = await exchangeCodeForTokens({
    clientId: process.env.ASANA_CLIENT_ID!,
    clientSecret: process.env.ASANA_CLIENT_SECRET!,
    redirectUri: asanaRedirectUri(),
    code: input.code,
    codeVerifier: input.verifier,
  });
  const client = new AsanaClient({
    accessToken: tokens.access_token,
    allowedWorkspaceGids: inspection.allowedWorkspaceGids,
  });
  const workspaces = await client.listWorkspaces();
  const allowed = workspaces.filter((ws) =>
    inspection.allowedWorkspaceGids.includes(ws.gid),
  );
  if (!allowed.length) {
    throw Object.assign(
      new Error("None of your Asana workspaces are on the configured allow-list."),
      { status: 403 },
    );
  }
  const chosen = allowed[0];
  persistTokens(orgId, tokens, chosen.gid, chosen.name);
  return getConnectionPublic(orgId);
}

export async function disconnectAsana(orgId = DEFAULT_ORG_ID): Promise<void> {
  const row = getDb()
    .prepare(
      `SELECT access_token_encrypted, refresh_token_encrypted FROM asana_connections WHERE org_id = ?`,
    )
    .get(orgId) as
    | { access_token_encrypted: string | null; refresh_token_encrypted: string | null }
    | undefined;
  if (row && resolveAppMode() === "real") {
    try {
      const key = getTokenKey();
      const token = row.refresh_token_encrypted
        ? decryptSecret(row.refresh_token_encrypted, key)
        : row.access_token_encrypted
          ? decryptSecret(row.access_token_encrypted, key)
          : null;
      if (token) {
        await revokeAsanaToken({
          clientId: process.env.ASANA_CLIENT_ID!,
          clientSecret: process.env.ASANA_CLIENT_SECRET!,
          token,
        });
      }
    } catch {
      // still delete locally
    }
  }
  getDb().prepare("DELETE FROM asana_connections WHERE org_id = ?").run(orgId);
}

export async function listAsanaCatalog(orgId = DEFAULT_ORG_ID) {
  const client = await liveClient(orgId);
  const inspection = inspectEnv();
  const workspaces = (await client.listWorkspaces()).filter((ws) =>
    inspection.allowedWorkspaceGids.includes(ws.gid),
  );
  const settings = getSettings(orgId);
  const workspaceGid =
    settings.selectedWorkspaceGid &&
    inspection.allowedWorkspaceGids.includes(settings.selectedWorkspaceGid)
      ? settings.selectedWorkspaceGid
      : workspaces[0]?.gid;
  if (!workspaceGid) {
    return { workspaces, users: [], templates: [] };
  }
  const [users, templates] = await Promise.all([
    client.listUsers(workspaceGid),
    client.listProjectTemplates(workspaceGid).catch(() => []),
  ]);
  return { workspaces, users, templates, workspaceGid };
}

function mapCampaign(row: Record<string, unknown>, tasks: Record<string, unknown>[] = []) {
  return {
    id: row.id,
    shortName: row.short_name,
    fullName: row.full_name,
    normalizedName: row.normalized_name,
    type: row.type,
    region: row.region,
    launchDate: row.launch_date,
    budgetUsd: row.budget_usd,
    venue: row.venue,
    brief: row.brief,
    utm: row.utm,
    status: row.status,
    approverRole: row.approver_role,
    approvalComment: row.approval_comment,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    asanaProjectGid: row.asana_project_gid,
    asanaProjectUrl: row.asana_project_url,
    asanaSetupAttempted: Boolean(row.asana_setup_attempted),
    isSample: Boolean(row.is_sample),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tasks: tasks.map((task) => ({
      id: task.id,
      key: task.key,
      name: task.name,
      dueDate: task.due_date,
      offsetDays: task.offset_days,
      ownerGid: task.owner_gid,
      ownerName: task.owner_name,
      asanaTaskGid: task.asana_task_gid,
      completed: Boolean(task.completed),
      checkInStatus: task.check_in_status,
      checkInNote: task.check_in_note,
      checkInSentAt: task.check_in_sent_at,
    })),
    asanaProjectCreated: Boolean(row.asana_project_gid),
  };
}

export function listCampaigns(orgId = DEFAULT_ORG_ID) {
  ensureDefaultOrg();
  maybeSeedDemo(orgId);
  const rows = getDb()
    .prepare("SELECT * FROM campaigns WHERE org_id = ? ORDER BY launch_date ASC")
    .all(orgId) as Record<string, unknown>[];
  return rows.map((row) =>
    mapCampaign(
      row,
      getDb()
        .prepare("SELECT * FROM campaign_tasks WHERE campaign_id = ? ORDER BY due_date ASC")
        .all(row.id as string) as Record<string, unknown>[],
    ),
  );
}

export function getCampaign(id: string, orgId = DEFAULT_ORG_ID) {
  const row = getDb()
    .prepare("SELECT * FROM campaigns WHERE id = ? AND org_id = ?")
    .get(id, orgId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const tasks = getDb()
    .prepare("SELECT * FROM campaign_tasks WHERE campaign_id = ? ORDER BY due_date ASC")
    .all(id) as Record<string, unknown>[];
  return mapCampaign(row, tasks);
}

function insertTasks(orgId: string, campaignId: string, input: ValidatedCampaignInput, settings: OrgSettings) {
  const scheduled = tasksForLaunch(
    input.type,
    input.launchDate,
    settings.templates[input.type],
  );
  const stmt = getDb().prepare(
    `INSERT INTO campaign_tasks (
       id, campaign_id, org_id, key, name, due_date, offset_days, check_in_status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
  );
  for (const task of scheduled) {
    stmt.run(newId("task"), campaignId, orgId, task.key, task.name, task.dueDate, task.offsetDays);
  }
}

function optionalText(raw: unknown, key: string): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = (raw as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE|CONSTRAINT/i.test(`${code} ${message}`);
}

function findCampaignIdByIdempotencyKey(orgId: string, key: string): string | undefined {
  const row = getDb()
    .prepare("SELECT id FROM campaigns WHERE org_id = ? AND idempotency_key = ?")
    .get(orgId, key) as { id: string } | undefined;
  return row?.id;
}

function draftComputedFields(value: ValidatedCampaignInput, orgId: string) {
  const settings = getSettings(orgId);
  const input = {
    launchDate: new Date(`${value.launchDate}T00:00:00Z`),
    region: value.region,
    type: value.type,
    shortName: value.shortName,
  };
  const fullName = applyNamePattern(settings.namePattern, input, settings.maxNameLength);
  return {
    settings,
    fullName,
    normalizedName: normalizeCampaignName(fullName),
    utm: applyUtmPattern(settings.utmPattern, input),
    decision: resolveApprover(settings.approvalRules, value),
  };
}

function updateDraftRow(input: {
  id: string;
  orgId: string;
  value: ValidatedCampaignInput;
  idempotencyKey?: string;
}) {
  const existing = getCampaign(input.id, input.orgId);
  if (!existing) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  if (existing.status !== "draft") {
    throw Object.assign(new Error("A submitted request cannot be saved as a new draft."), {
      status: 409,
    });
  }
  const computed = draftComputedFields(input.value, input.orgId);
  const ts = nowIso();
  getDb()
    .prepare(
      `UPDATE campaigns SET
         short_name = ?, full_name = ?, normalized_name = ?, type = ?, region = ?,
         launch_date = ?, budget_usd = ?, venue = ?, brief = ?, utm = ?, approver_role = ?,
         idempotency_key = COALESCE(?, idempotency_key), updated_at = ?
       WHERE id = ? AND org_id = ? AND status = 'draft'`,
    )
    .run(
      input.value.shortName,
      computed.fullName,
      computed.normalizedName,
      input.value.type,
      input.value.region,
      input.value.launchDate,
      input.value.budgetUsd,
      input.value.venue,
      input.value.brief,
      computed.utm,
      computed.decision.approverRole,
      input.idempotencyKey ?? null,
      ts,
      input.id,
      input.orgId,
    );
  const typeOrDateChanged =
    existing.type !== input.value.type || existing.launchDate !== input.value.launchDate;
  if (typeOrDateChanged) {
    getDb().prepare("DELETE FROM campaign_tasks WHERE campaign_id = ? AND org_id = ?").run(
      input.id,
      input.orgId,
    );
    insertTasks(input.orgId, input.id, input.value, computed.settings);
  }
  return getCampaign(input.id, input.orgId);
}

export function saveDraft(raw: unknown, orgId = DEFAULT_ORG_ID) {
  const parsed = validateCampaignInput(
    raw as Parameters<typeof validateCampaignInput>[0],
    getSettings(orgId).formFields,
  );
  if (!parsed.ok) {
    throw Object.assign(new Error("Please fix the highlighted fields."), {
      status: 400,
      errors: parsed.errors,
    });
  }
  ensureDefaultOrg();
  const value = parsed.value;
  const requestedId = optionalText(raw, "id");
  const idempotencyKey = optionalText(raw, "idempotencyKey");
  const keyMatch = idempotencyKey ? findCampaignIdByIdempotencyKey(orgId, idempotencyKey) : undefined;
  const existingId = requestedId ?? keyMatch;
  if (requestedId && keyMatch && requestedId !== keyMatch) {
    throw Object.assign(new Error("This request was already processed."), { status: 409 });
  }
  if (existingId) {
    return updateDraftRow({ id: existingId, orgId, value, idempotencyKey });
  }

  const computed = draftComputedFields(value, orgId);
  const id = newId("camp");
  const ts = nowIso();
  try {
    getDb()
      .prepare(
        `INSERT INTO campaigns (
           id, org_id, short_name, full_name, normalized_name, type, region, launch_date,
           budget_usd, venue, brief, utm, status, approver_role, idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      )
      .run(
        id,
        orgId,
        value.shortName,
        computed.fullName,
        computed.normalizedName,
        value.type,
        value.region,
        value.launchDate,
        value.budgetUsd,
        value.venue,
        value.brief,
        computed.utm,
        computed.decision.approverRole,
        idempotencyKey ?? null,
        ts,
        ts,
      );
  } catch (error) {
    if (idempotencyKey && isUniqueViolation(error)) {
      const racedId = findCampaignIdByIdempotencyKey(orgId, idempotencyKey);
      if (racedId) {
        return updateDraftRow({ id: racedId, orgId, value, idempotencyKey });
      }
    }
    throw error;
  }
  insertTasks(orgId, id, value, computed.settings);
  return getCampaign(id, orgId);
}

export async function submitCampaign(input: {
  id: string;
  confirm: boolean;
  idempotencyKey?: string;
  orgId?: string;
}) {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const campaign = getCampaign(input.id, orgId);
  if (!campaign) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  if (campaign.status === "rejected") {
    throw Object.assign(new Error("A rejected request cannot be submitted again."), { status: 409 });
  }

  const duplicates = (
    getDb()
      .prepare(
        "SELECT id, normalized_name AS normalizedName, launch_date AS launchDate, status FROM campaigns WHERE org_id = ?",
      )
      .all(orgId) as unknown as DuplicateCandidate[]
  );
  const duplicate = findDuplicateCampaign(duplicates, {
    normalizedName: campaign.normalizedName as string,
    launchDate: campaign.launchDate as string,
    ignoreId: campaign.id as string,
  });
  if (duplicate) {
    throw Object.assign(
      new Error("A campaign with this name and launch date already exists."),
      { status: 409, duplicateId: duplicate.id },
    );
  }

  if (campaign.status !== "draft") {
    if (campaign.status === "awaiting_approval") {
      return {
        campaign,
        asanaProjectCreated: false,
        message: `Sent for in-app approval to the ${campaign.approverRole}. No Asana project has been created yet.`,
      };
    }
    return {
      campaign,
      asanaProjectCreated: Boolean(campaign.asanaProjectGid),
      asanaProjectGid: campaign.asanaProjectGid ?? null,
      message: campaign.asanaProjectGid
        ? "This request was already processed."
        : demoAsanaResult().message,
    };
  }

  if (input.idempotencyKey) {
    const existing = getDb()
      .prepare("SELECT id FROM campaigns WHERE org_id = ? AND idempotency_key = ?")
      .get(orgId, input.idempotencyKey) as { id: string } | undefined;
    if (existing && existing.id !== input.id) {
      throw Object.assign(new Error("This request was already processed."), { status: 409 });
    }
    getDb()
      .prepare("UPDATE campaigns SET idempotency_key = ?, updated_at = ? WHERE id = ? AND org_id = ?")
      .run(input.idempotencyKey, nowIso(), input.id, orgId);
  }

  const needsApproval = Boolean(campaign.approverRole) && campaign.status === "draft";
  if (needsApproval) {
    getDb()
      .prepare(
        "UPDATE campaigns SET status = 'awaiting_approval', submitted_at = ?, updated_at = ? WHERE id = ? AND org_id = ?",
      )
      .run(nowIso(), nowIso(), input.id, orgId);
    return {
      campaign: getCampaign(input.id, orgId),
      asanaProjectCreated: false,
      message: `Sent for in-app approval to the ${campaign.approverRole}. No Asana project has been created yet.`,
    };
  }

  return provisionCampaign({ ...input, orgId });
}

export async function decideCampaign(input: {
  id: string;
  decision: "approve" | "reject";
  comment?: string;
  confirm?: boolean;
  orgId?: string;
}) {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const campaign = getCampaign(input.id, orgId);
  if (!campaign) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  if (campaign.status !== "awaiting_approval") {
    throw Object.assign(new Error("This campaign is not waiting for approval."), { status: 409 });
  }
  if (input.decision === "reject") {
    if (!input.comment?.trim()) {
      throw Object.assign(new Error("A comment is required to reject."), { status: 400 });
    }
    getDb()
      .prepare(
        "UPDATE campaigns SET status = 'rejected', approval_comment = ?, rejected_at = ?, updated_at = ? WHERE id = ? AND org_id = ?",
      )
      .run(input.comment.trim(), nowIso(), nowIso(), input.id, orgId);
    return {
      campaign: getCampaign(input.id, orgId),
      asanaProjectCreated: false,
      message: "Request rejected. No Asana project was created.",
    };
  }
  getDb()
    .prepare(
      "UPDATE campaigns SET status = 'approved', approval_comment = ?, approved_at = ?, updated_at = ? WHERE id = ? AND org_id = ?",
    )
    .run(input.comment?.trim() ?? null, nowIso(), nowIso(), input.id, orgId);
  return provisionCampaign({ id: input.id, confirm: Boolean(input.confirm), orgId });
}

async function provisionCampaign(input: { id: string; confirm: boolean; orgId: string }) {
  const campaign = getCampaign(input.id, input.orgId);
  if (!campaign) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  const mode = resolveAppMode();
  const inspection = inspectEnv();
  const connection = getConnectionPublic(input.orgId);
  const workspaceGid =
    getSettings(input.orgId).selectedWorkspaceGid || connection.workspaceGid || "";

  if (mode !== "real") {
    getDb()
      .prepare(
        "UPDATE campaigns SET status = 'approved', submitted_at = COALESCE(submitted_at, ?), updated_at = ? WHERE id = ? AND org_id = ?",
      )
      .run(nowIso(), nowIso(), input.id, input.orgId);
    return {
      campaign: getCampaign(input.id, input.orgId),
      ...demoAsanaResult(),
    };
  }

  const gate = canWriteToAsana({
    mode,
    confirmed: input.confirm,
    alreadyHasProject: Boolean(campaign.asanaProjectGid),
    workspaceGid,
    allowedWorkspaceGids: inspection.allowedWorkspaceGids,
  });
  if (!gate.allowed) {
    throw Object.assign(new Error(gate.reason ?? "Asana write blocked."), { status: 400 });
  }

  getDb()
    .prepare("UPDATE campaigns SET status = 'setting_up', asana_setup_attempted = 1, updated_at = ? WHERE id = ? AND org_id = ?")
    .run(nowIso(), input.id, input.orgId);

  const client = await liveClient(input.orgId);
  const settings = getSettings(input.orgId);
  const templateGid = settings.selectedTemplateGids[campaign.type as CampaignType];
  const project = await client.createProject({
    workspaceGid,
    name: String(campaign.fullName),
    teamGid: settings.teamGid ?? undefined,
    templateGid: templateGid || undefined,
    notes: String(campaign.brief),
  });

  for (const task of campaign.tasks) {
    if (templateGid) continue;
    const created = await client.createTask({
      projectGid: project.gid,
      name: String(task.name),
      dueOn: String(task.dueDate),
      assigneeGid: task.ownerGid ? String(task.ownerGid) : undefined,
    });
    getDb()
      .prepare("UPDATE campaign_tasks SET asana_task_gid = ? WHERE id = ?")
      .run(created.gid, String(task.id));
  }

  getDb()
    .prepare(
      "UPDATE campaigns SET status = 'live', asana_project_gid = ?, asana_project_url = ?, submitted_at = COALESCE(submitted_at, ?), updated_at = ? WHERE id = ? AND org_id = ?",
    )
    .run(project.gid, project.permalinkUrl ?? null, nowIso(), nowIso(), input.id, input.orgId);

  if (templateGid) {
    await refreshCampaignStatus(input.id, input.orgId);
  }

  return {
    campaign: getCampaign(input.id, input.orgId),
    asanaProjectCreated: true,
    asanaProjectGid: project.gid,
    message: "Asana project created in the allowed test workspace.",
  };
}

export async function refreshCampaignStatus(id: string, orgId = DEFAULT_ORG_ID) {
  const campaign = getCampaign(id, orgId);
  if (!campaign) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  if (resolveAppMode() !== "real" || !campaign.asanaProjectGid) {
    return deriveLocalStatus(id, orgId);
  }
  const client = await liveClient(orgId);
  const remote = await client.listProjectTasks(String(campaign.asanaProjectGid));
  for (const remoteTask of remote) {
    const local = campaign.tasks.find(
      (task) => task.asanaTaskGid === remoteTask.gid || task.name === remoteTask.name,
    );
    if (!local) continue;
    getDb()
      .prepare(
        "UPDATE campaign_tasks SET asana_task_gid = ?, completed = ?, due_date = COALESCE(?, due_date), owner_name = COALESCE(?, owner_name), owner_gid = COALESCE(?, owner_gid) WHERE id = ?",
      )
      .run(
        remoteTask.gid,
        remoteTask.completed ? 1 : 0,
        remoteTask.due_on,
        remoteTask.assignee?.name ?? null,
        remoteTask.assignee?.gid ?? null,
        String(local.id),
      );
  }
  return deriveLocalStatus(id, orgId);
}

function deriveLocalStatus(id: string, orgId: string) {
  const campaign = getCampaign(id, orgId);
  if (!campaign) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  if (["draft", "awaiting_approval", "rejected"].includes(String(campaign.status))) {
    return campaign;
  }
  const today = new Date().toISOString().slice(0, 10);
  const tasks = campaign.tasks;
  const allDone = tasks.length > 0 && tasks.every((task) => task.completed || task.checkInStatus === "done");
  const blocked = tasks.some((task) => task.checkInStatus === "blocked");
  const delayed = tasks.some(
    (task) =>
      task.checkInStatus === "delayed" ||
      (!task.completed && String(task.dueDate) < today && task.checkInStatus !== "done"),
  );
  const hasProgress = tasks.some(
    (task) => Boolean(task.completed) || String(task.checkInStatus) !== "pending",
  );
  const status = localSetupStatus({
    allDone,
    blocked,
    delayed,
    asanaProjectCreated: Boolean(campaign.asanaProjectCreated),
    hasProgress,
  });
  getDb()
    .prepare("UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ? AND org_id = ?")
    .run(status, nowIso(), id, orgId);
  return getCampaign(id, orgId);
}

export function recordCheckIn(input: {
  campaignId: string;
  taskId: string;
  status: TaskCheckInStatus;
  note?: string;
  orgId?: string;
}) {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const campaign = getCampaign(input.campaignId, orgId);
  if (!campaign) throw Object.assign(new Error("Campaign not found."), { status: 404 });
  const task = campaign.tasks.find((item) => item.id === input.taskId);
  if (!task) throw Object.assign(new Error("Task not found."), { status: 404 });
  const completed = input.status === "done" ? 1 : 0;
  getDb()
    .prepare(
      "UPDATE campaign_tasks SET check_in_status = ?, check_in_note = ?, completed = ?, check_in_sent_at = COALESCE(check_in_sent_at, ?) WHERE id = ? AND org_id = ?",
    )
    .run(input.status, input.note ?? null, completed, nowIso(), input.taskId, orgId);
  return deriveLocalStatus(input.campaignId, orgId);
}

export function sendCheckIn(input: { campaignId: string; taskId: string; orgId?: string }) {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  getDb()
    .prepare("UPDATE campaign_tasks SET check_in_sent_at = ?, check_in_status = CASE WHEN check_in_status = 'pending' THEN 'no_reply' ELSE check_in_status END WHERE id = ? AND org_id = ?")
    .run(nowIso(), input.taskId, orgId);
  return getCampaign(input.campaignId, orgId);
}

export function deleteCampaign(id: string, orgId = DEFAULT_ORG_ID) {
  getDb().prepare("DELETE FROM campaign_tasks WHERE campaign_id = ? AND org_id = ?").run(id, orgId);
  getDb().prepare("DELETE FROM campaigns WHERE id = ? AND org_id = ?").run(id, orgId);
}

export async function deleteAllOrgData(orgId = DEFAULT_ORG_ID) {
  await disconnectAsana(orgId);
  getDb().prepare("DELETE FROM campaign_tasks WHERE org_id = ?").run(orgId);
  getDb().prepare("DELETE FROM campaigns WHERE org_id = ?").run(orgId);
  getDb().prepare("DELETE FROM settings WHERE org_id = ?").run(orgId);
}

export function assignTaskOwner(input: {
  campaignId: string;
  taskId: string;
  ownerGid?: string | null;
  ownerName?: string | null;
  orgId?: string;
}) {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  getDb()
    .prepare("UPDATE campaign_tasks SET owner_gid = ?, owner_name = ? WHERE id = ? AND org_id = ? AND campaign_id = ?")
    .run(input.ownerGid ?? null, input.ownerName ?? null, input.taskId, orgId, input.campaignId);
  return getCampaign(input.campaignId, orgId);
}

function maybeSeedDemo(orgId: string) {
  if (resolveAppMode() !== "demo") return;
  const count = getDb()
    .prepare("SELECT COUNT(*) AS c FROM campaigns WHERE org_id = ?")
    .get(orgId) as { c: number };
  if (count.c > 0) return;
  const samples = [
    {
      shortName: "Fall Summit",
      type: "event",
      region: "NA",
      launchDate: "2027-02-18",
      budgetUsd: 0,
      venue: "",
      brief: "Sample event campaign for exploring the dashboard.",
      status: "blocked",
    },
    {
      shortName: "Ops Report",
      type: "content_asset",
      region: "EMEA",
      launchDate: "2026-12-02",
      budgetUsd: 0,
      venue: "",
      brief: "Sample content campaign.",
      status: "delayed",
    },
    {
      shortName: "Webinar Series",
      type: "content_asset",
      region: "NA",
      launchDate: "2027-01-14",
      budgetUsd: 0,
      venue: "",
      brief: "Sample webinar series.",
      status: "live",
    },
    {
      shortName: "Q1 Expansion",
      type: "growth_play",
      region: "NA",
      launchDate: "2027-01-06",
      budgetUsd: 0,
      venue: "",
      brief: "Sample growth play.",
      status: "live",
    },
    {
      shortName: "Partner Roadshow",
      type: "event",
      region: "APAC",
      launchDate: "2027-03-10",
      budgetUsd: 0,
      venue: "Singapore and Sydney",
      brief: "Roadshow with three partners across Singapore and Sydney to source pipeline in Q1.",
      status: "awaiting_approval",
      approverRole: "Events director",
    },
    {
      shortName: "Reactivation",
      type: "growth_play",
      region: "EMEA",
      launchDate: "2026-11-17",
      budgetUsd: 0,
      venue: "",
      brief: "Sample launched campaign.",
      status: "launched",
    },
  ];
  const settings = getSettings(orgId);
  for (const sample of samples) {
    const saved = saveDraft(sample, orgId);
    if (!saved) continue;
    const full = getCampaign(saved.id as string, orgId);
    getDb()
      .prepare(
        "UPDATE campaigns SET status = ?, approver_role = COALESCE(?, approver_role), is_sample = 1, submitted_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        sample.status,
        "approverRole" in sample ? sample.approverRole ?? null : null,
        nowIso(),
        nowIso(),
        String(saved.id),
      );
    if (sample.status === "launched" && full) {
      for (const task of full.tasks) {
        getDb()
          .prepare("UPDATE campaign_tasks SET completed = 1, check_in_status = 'done' WHERE id = ?")
          .run(String(task.id));
      }
    }
    if (sample.status === "blocked" && full?.tasks[2]) {
      getDb()
        .prepare("UPDATE campaign_tasks SET check_in_status = 'blocked', check_in_note = ?, check_in_sent_at = ? WHERE id = ?")
        .run("Waiting on final logo files", nowIso(), String(full.tasks[2].id));
    }
    if (sample.status === "delayed" && full?.tasks[2]) {
      getDb()
        .prepare("UPDATE campaign_tasks SET check_in_status = 'delayed', check_in_note = ?, check_in_sent_at = ? WHERE id = ?")
        .run("Needs 2 more days for QA", nowIso(), String(full.tasks[2].id));
    }
  }
  void settings;
}

export function newIdempotencyKey(): string {
  return randomUrlSafe(18);
}
