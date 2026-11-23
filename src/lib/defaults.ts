import { DEFAULT_APPROVAL_RULES } from "./approvals";
import { DEFAULT_NAME_PATTERN, DEFAULT_UTM_PATTERN } from "./naming";
import { STARTER_TEMPLATES } from "./templates";
import type { CampaignType } from "./types";

export const DEFAULT_REGIONS = [
  { value: "NA", label: "North America" },
  { value: "EMEA", label: "EMEA" },
  { value: "APAC", label: "APAC" },
  { value: "LATAM", label: "Latin America" },
];

export const DEFAULT_FORM_FIELDS = [
  { id: "shortName", label: "Campaign name", type: "short_text", showsFor: "all", required: true },
  { id: "type", label: "Campaign type", type: "choice", showsFor: "all", required: true },
  { id: "region", label: "Region", type: "choice", showsFor: "all", required: true },
  { id: "launchDate", label: "Launch date", type: "date", showsFor: "all", required: true },
  { id: "budgetUsd", label: "Budget (USD)", type: "number", showsFor: "all", required: true },
  { id: "venue", label: "Venue and dates on site", type: "short_text", showsFor: "event", required: false },
  { id: "brief", label: "Brief", type: "long_text", showsFor: "all", required: true },
];

export function defaultSettings() {
  return {
    formFields: DEFAULT_FORM_FIELDS,
    namePattern: DEFAULT_NAME_PATTERN,
    utmPattern: DEFAULT_UTM_PATTERN,
    maxNameLength: 50,
    templates: STARTER_TEMPLATES as Record<CampaignType, typeof STARTER_TEMPLATES.event>,
    approvalRules: DEFAULT_APPROVAL_RULES,
    selectedWorkspaceGid: null as string | null,
    selectedTemplateGids: {} as Partial<Record<CampaignType, string>>,
    teamGid: null as string | null,
  };
}

export type OrgSettings = ReturnType<typeof defaultSettings>;
