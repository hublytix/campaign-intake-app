import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUrlSafe } from "./crypto";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS asana_connections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE,
  workspace_gid TEXT,
  workspace_name TEXT,
  asana_user_gid TEXT,
  asana_user_name TEXT,
  asana_user_email TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  access_token_expires_at TEXT,
  scopes TEXT,
  connected_at TEXT,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS settings (
  org_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  short_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  type TEXT NOT NULL,
  region TEXT NOT NULL,
  launch_date TEXT NOT NULL,
  budget_usd REAL NOT NULL,
  venue TEXT,
  brief TEXT NOT NULL,
  utm TEXT,
  status TEXT NOT NULL,
  approver_role TEXT,
  approval_comment TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  asana_project_gid TEXT,
  asana_project_url TEXT,
  asana_setup_attempted INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_idempotency
  ON campaigns(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS campaign_tasks (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  due_date TEXT NOT NULL,
  offset_days INTEGER NOT NULL,
  owner_gid TEXT,
  owner_name TEXT,
  asana_task_gid TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  check_in_status TEXT NOT NULL DEFAULT 'pending',
  check_in_note TEXT,
  check_in_sent_at TEXT,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  payload_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

let singleton: DatabaseSync | null = null;
let singletonPath: string | null = null;

export function databasePath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.sqlite");
}

export function openDatabase(filePath: string): DatabaseSync {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

export function getDb(): DatabaseSync {
  const filePath = databasePath();
  if (!singleton || singletonPath !== filePath) {
    singleton?.close?.();
    singleton = openDatabase(filePath);
    singletonPath = filePath;
  }
  return singleton;
}

export function resetDbForTests(filePath: string): DatabaseSync {
  if (singleton) {
    try {
      singleton.close();
    } catch {
      // ignore
    }
  }
  process.env.DATABASE_PATH = filePath;
  singleton = openDatabase(filePath);
  singletonPath = filePath;
  return singleton;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = "id"): string {
  return `${prefix}_${randomUrlSafe(16)}`;
}

export const DEFAULT_ORG_ID = "org_local";

export function ensureDefaultOrg(db: DatabaseSync = getDb()): string {
  const existing = db.prepare("SELECT id FROM organizations WHERE id = ?").get(DEFAULT_ORG_ID);
  if (!existing) {
    db.prepare("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)").run(
      DEFAULT_ORG_ID,
      "Local workspace",
      nowIso(),
    );
  }
  return DEFAULT_ORG_ID;
}
