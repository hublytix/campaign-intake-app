import type { CampaignType, ScheduledTask, StarterTask } from "./types";
import { addDays, toIsoDate } from "./dates";

export const STARTER_TEMPLATES: Record<CampaignType, StarterTask[]> = {
  event: [
    { key: "venue_booked", name: "Venue booked", offsetDays: -60 },
    { key: "invite_email_live", name: "Invite email live", offsetDays: -30 },
    { key: "booth_assets_shipped", name: "Booth assets shipped", offsetDays: -10 },
  ],
  content_asset: [
    { key: "outline_approved", name: "Outline approved", offsetDays: -28 },
    { key: "design_done", name: "Design done", offsetDays: -10 },
    { key: "landing_page_live", name: "Landing page live", offsetDays: -2 },
  ],
  growth_play: [
    { key: "audience_list_pulled", name: "Audience list pulled", offsetDays: -21 },
    { key: "kickoff_complete", name: "Kickoff complete", offsetDays: -14 },
    { key: "sequences_live", name: "Sequences live", offsetDays: 0 },
  ],
};

export const TYPE_LABELS: Record<CampaignType, string> = {
  event: "Event",
  content_asset: "Content asset",
  growth_play: "Growth play",
};

export const TYPE_BLURBS: Record<CampaignType, string> = {
  event: "Field event, booth, webinar",
  content_asset: "Report, guide, video",
  growth_play: "Expansion or reactivation push",
};

export function tasksForLaunch(
  type: CampaignType,
  launchDate: Date | string,
  overrides?: StarterTask[],
): ScheduledTask[] {
  const starters = overrides ?? STARTER_TEMPLATES[type];
  const launch = toIsoDate(launchDate);
  return starters.map((task) => ({
    ...task,
    dueDate: addDays(launch, task.offsetDays),
  }));
}
