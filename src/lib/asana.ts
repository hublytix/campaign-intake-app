import { assertWorkspaceAllowed } from "./guards";
import { safeErrorMessage } from "./logger";

export const ASANA_AUTHORIZE_URL = "https://app.asana.com/-/oauth_authorize";
export const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";
export const ASANA_REVOKE_URL = "https://app.asana.com/-/oauth_revoke";
export const ASANA_API_BASE = "https://app.asana.com/api/1.0";

export interface AuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
}

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const url = new URL(ASANA_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", input.scopes.join(" "));
  return url.toString();
}

export class AsanaApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AsanaApiError";
    this.status = status;
  }
  toJSON() {
    return { name: this.name, status: this.status, message: this.message };
  }
}

type FetchImpl = typeof fetch;

export interface AsanaClientOptions {
  accessToken: string;
  allowedWorkspaceGids?: string[];
  fetchImpl?: FetchImpl;
}

export interface AsanaWorkspace {
  gid: string;
  name: string;
}

export interface AsanaUser {
  gid: string;
  name: string;
  email?: string;
}

export interface AsanaProjectTemplate {
  gid: string;
  name: string;
}

export interface CreateProjectInput {
  workspaceGid: string;
  name: string;
  teamGid?: string;
  templateGid?: string;
  notes?: string;
}

export interface CreatedProject {
  gid: string;
  name: string;
  permalinkUrl?: string;
}

export interface CreateTaskInput {
  projectGid: string;
  name: string;
  dueOn: string;
  assigneeGid?: string;
  notes?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export class AsanaClient {
  private readonly accessToken: string;
  private readonly allowedWorkspaceGids: string[];
  private readonly fetchImpl: FetchImpl;

  constructor(options: AsanaClientOptions) {
    this.accessToken = options.accessToken;
    this.allowedWorkspaceGids = options.allowedWorkspaceGids ?? [];
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await this.fetchImpl(`${ASANA_API_BASE}${path}`, {
      ...init,
      headers,
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const record = asRecord(body);
      const errors = record.errors;
      const first = Array.isArray(errors) ? asRecord(errors[0]) : {};
      const message = String(first.message ?? `Asana request failed with ${response.status}`);
      throw new AsanaApiError(response.status, safeErrorMessage(message));
    }
    return body as T;
  }

  async getWorkspace(gid: string): Promise<AsanaWorkspace> {
    const result = await this.request<{ data: AsanaWorkspace }>(`/workspaces/${gid}`);
    return result.data;
  }

  async listWorkspaces(): Promise<AsanaWorkspace[]> {
    const result = await this.request<{ data: AsanaWorkspace[] }>("/workspaces");
    return result.data ?? [];
  }

  async listUsers(workspaceGid: string): Promise<AsanaUser[]> {
    assertWorkspaceAllowed(workspaceGid, this.allowedWorkspaceGids);
    const result = await this.request<{ data: AsanaUser[] }>(
      `/workspaces/${workspaceGid}/users?opt_fields=name,email`,
    );
    return result.data ?? [];
  }

  async listProjectTemplates(workspaceGid: string): Promise<AsanaProjectTemplate[]> {
    assertWorkspaceAllowed(workspaceGid, this.allowedWorkspaceGids);
    const result = await this.request<{ data: AsanaProjectTemplate[] }>(
      `/project_templates?workspace=${encodeURIComponent(workspaceGid)}`,
    );
    return result.data ?? [];
  }

  async createProject(input: CreateProjectInput): Promise<CreatedProject> {
    if (this.allowedWorkspaceGids.length) {
      assertWorkspaceAllowed(input.workspaceGid, this.allowedWorkspaceGids);
    }
    if (input.templateGid) {
      const result = await this.request<{ data: { gid?: string; new_project?: CreatedProject } }>(
        `/project_templates/${input.templateGid}/instantiateProject`,
        {
          method: "POST",
          body: JSON.stringify({
            data: {
              name: input.name,
              public: false,
              team: input.teamGid,
            },
          }),
        },
      );
      const data = result.data as CreatedProject & { new_project?: CreatedProject };
      return data.new_project ?? data;
    }
    const result = await this.request<{ data: CreatedProject }>("/projects", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: input.name,
          workspace: input.workspaceGid,
          team: input.teamGid,
          notes: input.notes,
          default_view: "list",
        },
      }),
    });
    return result.data;
  }

  async createTask(input: CreateTaskInput): Promise<{ gid: string }> {
    const result = await this.request<{ data: { gid: string } }>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: input.name,
          projects: [input.projectGid],
          due_on: input.dueOn,
          assignee: input.assigneeGid,
          notes: input.notes,
        },
      }),
    });
    return result.data;
  }

  async listProjectTasks(projectGid: string): Promise<
    Array<{ gid: string; name: string; completed: boolean; due_on: string | null; assignee?: AsanaUser | null }>
  > {
    const result = await this.request<{
      data: Array<{
        gid: string;
        name: string;
        completed: boolean;
        due_on: string | null;
        assignee?: AsanaUser | null;
      }>;
    }>(`/projects/${projectGid}/tasks?opt_fields=name,completed,due_on,assignee,assignee.name`);
    return result.data ?? [];
  }

  async updateTask(
    taskGid: string,
    patch: { completed?: boolean; due_on?: string; assignee?: string },
  ): Promise<void> {
    await this.request(`/tasks/${taskGid}`, {
      method: "PUT",
      body: JSON.stringify({ data: patch }),
    });
  }
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  data?: { gid?: string; name?: string; email?: string };
}

export async function exchangeCodeForTokens(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  fetchImpl?: FetchImpl;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  });
  const response = await (input.fetchImpl ?? fetch)(ASANA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new AsanaApiError(response.status, "Asana token exchange failed.");
  }
  return JSON.parse(text) as TokenResponse;
}

export async function refreshAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: FetchImpl;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
  const response = await (input.fetchImpl ?? fetch)(ASANA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!response.ok) {
    throw new AsanaApiError(response.status, "Asana token refresh failed.");
  }
  return (await response.json()) as TokenResponse;
}

export async function revokeAsanaToken(input: {
  clientId: string;
  clientSecret: string;
  token: string;
  fetchImpl?: FetchImpl;
}): Promise<void> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    token: input.token,
  });
  await (input.fetchImpl ?? fetch)(ASANA_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}
