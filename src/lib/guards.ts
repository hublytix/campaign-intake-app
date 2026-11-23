import type { AppMode, DuplicateCandidate } from "./types";

export function assertWorkspaceAllowed(
  workspaceGid: string,
  allowedWorkspaceGids: string[],
): void {
  if (!allowedWorkspaceGids.length) {
    throw new Error("An Asana workspace allow-list is required.");
  }
  if (!allowedWorkspaceGids.includes(workspaceGid)) {
    throw new Error("That Asana workspace is not in the allow-list.");
  }
}

export interface WriteGateInput {
  mode: AppMode;
  confirmed: boolean;
  alreadyHasProject: boolean;
  workspaceGid: string;
  allowedWorkspaceGids: string[];
}

export interface WriteGateResult {
  allowed: boolean;
  reason?: string;
}

export function canWriteToAsana(input: WriteGateInput): WriteGateResult {
  if (input.mode !== "real") {
    return {
      allowed: false,
      reason:
        input.mode === "demo"
          ? "Demo mode cannot create Asana projects."
          : "Asana writes are disabled until configuration is complete.",
    };
  }
  if (!input.confirmed) {
    return {
      allowed: false,
      reason: "Confirm that you want to create a project in Asana.",
    };
  }
  if (input.alreadyHasProject) {
    return {
      allowed: false,
      reason: "An Asana project already exists for this campaign.",
    };
  }
  try {
    assertWorkspaceAllowed(input.workspaceGid, input.allowedWorkspaceGids);
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : "Workspace is not allowed.",
    };
  }
  return { allowed: true };
}

export function demoAsanaResult(): {
  asanaProjectCreated: false;
  asanaProjectGid: null;
  message: string;
} {
  return {
    asanaProjectCreated: false,
    asanaProjectGid: null,
    message:
      "Saved in demo mode only. No Asana project was created, and none will be until OAuth is fully configured.",
  };
}

export function findDuplicateCampaign(
  existing: DuplicateCandidate[],
  incoming: { normalizedName: string; launchDate: string; ignoreId?: string },
): DuplicateCandidate | null {
  return (
    existing.find(
      (campaign) =>
        campaign.id !== incoming.ignoreId &&
        campaign.status !== "rejected" &&
        campaign.normalizedName === incoming.normalizedName &&
        campaign.launchDate === incoming.launchDate,
    ) ?? null
  );
}
