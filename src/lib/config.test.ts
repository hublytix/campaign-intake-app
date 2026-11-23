import { describe, expect, it } from "vitest";
import { REAL_MODE_REQUIRED, inspectEnv, resolveAppMode } from "./config";

const empty = {
  ASANA_CLIENT_ID: undefined,
  ASANA_CLIENT_SECRET: undefined,
  TOKEN_ENCRYPTION_KEY: undefined,
  SESSION_SECRET: undefined,
  ASANA_ALLOWED_WORKSPACE_GID: undefined,
};

const complete = {
  ASANA_CLIENT_ID: "client-id",
  ASANA_CLIENT_SECRET: "client-secret",
  TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  SESSION_SECRET: "b".repeat(64),
  ASANA_ALLOWED_WORKSPACE_GID: "123456789",
};

describe("resolveAppMode", () => {
  it("uses demo mode when no real-mode variables are set", () => {
    expect(resolveAppMode(empty)).toBe("demo");
  });

  it("uses real mode when every required variable is set", () => {
    expect(resolveAppMode(complete)).toBe("real");
  });

  it("fails closed as misconfigured when only some variables are set", () => {
    expect(
      resolveAppMode({ ...empty, ASANA_CLIENT_ID: "client-id" }),
    ).toBe("misconfigured");
    expect(
      resolveAppMode({ ...complete, ASANA_CLIENT_SECRET: "  " }),
    ).toBe("misconfigured");
  });

  it("treats whitespace-only values as absent", () => {
    expect(
      resolveAppMode({
        ...empty,
        ASANA_CLIENT_ID: "  ",
        SESSION_SECRET: "\t",
      }),
    ).toBe("demo");
  });
});

describe("inspectEnv", () => {
  it("reports missing names without exposing secret values", () => {
    const report = inspectEnv({
      ...empty,
      ASANA_CLIENT_ID: "super-secret-value",
    });
    expect(report.mode).toBe("misconfigured");
    expect(report.present).toEqual(["ASANA_CLIENT_ID"]);
    expect(report.missing).toEqual(
      REAL_MODE_REQUIRED.filter((name) => name !== "ASANA_CLIENT_ID"),
    );
    const dumped = JSON.stringify(report);
    expect(dumped).not.toContain("super-secret-value");
  });

  it("parses an allow-list of workspace GIDs in real mode", () => {
    const report = inspectEnv({
      ...complete,
      ASANA_ALLOWED_WORKSPACE_GID: "111, 222,,333",
    });
    expect(report.mode).toBe("real");
    expect(report.allowedWorkspaceGids).toEqual(["111", "222", "333"]);
  });
});
