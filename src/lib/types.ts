export type CampaignType = "event" | "content_asset" | "growth_play";

export type CampaignStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "setting_up"
  | "live"
  | "delayed"
  | "blocked"
  | "launched";

export type TaskCheckInStatus = "pending" | "done" | "delayed" | "blocked" | "no_reply";

export type AppMode = "demo" | "real" | "misconfigured";

export interface CampaignInput {
  shortName: string;
  type: CampaignType | string;
  region: string;
  launchDate: string;
  budgetUsd: number | string;
  venue?: string;
  brief: string;
}

export interface ValidatedCampaignInput {
  shortName: string;
  type: CampaignType;
  region: string;
  launchDate: string;
  budgetUsd: number;
  venue: string;
  brief: string;
}

export interface StarterTask {
  key: string;
  name: string;
  offsetDays: number;
}

export interface ScheduledTask extends StarterTask {
  dueDate: string;
}

export interface ApprovalRule {
  id: string;
  when: "budget_over" | "type_is" | "always" | "fallback";
  budgetUsd?: number;
  type?: CampaignType;
  approverRole: string | null;
}

export interface ApproverDecision {
  needed: boolean;
  approverRole: string | null;
  ruleId: string | null;
}

export interface DuplicateCandidate {
  id: string;
  normalizedName: string;
  launchDate: string;
  status: string;
}
