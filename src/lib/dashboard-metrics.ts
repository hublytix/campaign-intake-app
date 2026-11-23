export interface MetricTask {
  completed: boolean;
  checkInStatus: string;
  checkInSentAt?: string | null;
}

export interface MetricCampaign {
  status: string;
  asanaProjectCreated?: boolean;
  tasks: MetricTask[];
}

const ANSWERED_STATUSES = new Set(["done", "delayed", "blocked"]);
const ACTIVE_SETUP_STATUSES = new Set(["live", "setting_up", "approved"]);
const INACTIVE_STATUSES = new Set(["draft", "rejected"]);

export function isCheckInAnswered(task: MetricTask): boolean {
  return Boolean(task.completed) || ANSWERED_STATUSES.has(task.checkInStatus);
}

export function isCheckInRequested(task: MetricTask): boolean {
  return (
    Boolean(task.checkInSentAt) ||
    task.checkInStatus !== "pending" ||
    Boolean(task.completed)
  );
}

export function checkInAnsweredMetrics(campaigns: MetricCampaign[]): {
  answered: number;
  requested: number;
} {
  const tasks = campaigns
    .filter((campaign) => !INACTIVE_STATUSES.has(campaign.status))
    .flatMap((campaign) => campaign.tasks);
  const requestedTasks = tasks.filter(isCheckInRequested);
  return {
    answered: requestedTasks.filter(isCheckInAnswered).length,
    requested: requestedTasks.length,
  };
}

export function approvedOrInProgressCount(campaigns: MetricCampaign[]): number {
  return campaigns.filter((campaign) => ACTIVE_SETUP_STATUSES.has(campaign.status)).length;
}

export function approvedOrInProgressLabel(campaigns: MetricCampaign[]): string {
  const hasRealLive = campaigns.some(
    (campaign) => campaign.status === "live" && campaign.asanaProjectCreated,
  );
  return hasRealLive ? "Live or in setup" : "Approved or in progress";
}

export function hasLocalTaskProgress(campaign: MetricCampaign): boolean {
  return campaign.tasks.some(
    (task) => task.completed || task.checkInStatus !== "pending",
  );
}

export function displayCampaignStatus(campaign: MetricCampaign): { key: string; label: string } {
  if (campaign.status === "setting_up") {
    return { key: "setting_up", label: "In progress" };
  }
  if (campaign.status === "approved") {
    return { key: "approved", label: "Approved" };
  }
  if (campaign.status === "live" && !campaign.asanaProjectCreated) {
    return hasLocalTaskProgress(campaign)
      ? { key: "setting_up", label: "In progress" }
      : { key: "approved", label: "Approved" };
  }
  const label = campaign.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { key: campaign.status, label };
}

export function localSetupStatus(input: {
  allDone: boolean;
  blocked: boolean;
  delayed: boolean;
  asanaProjectCreated: boolean;
  hasProgress: boolean;
}): "launched" | "blocked" | "delayed" | "live" | "setting_up" | "approved" {
  if (input.allDone) return "launched";
  if (input.blocked) return "blocked";
  if (input.delayed) return "delayed";
  if (input.asanaProjectCreated) return "live";
  return input.hasProgress ? "setting_up" : "approved";
}
