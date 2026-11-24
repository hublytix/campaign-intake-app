import type { CampaignInput, CampaignType, ValidatedCampaignInput } from "./types";
import { isIsoDate } from "./dates";

const TYPES: CampaignType[] = ["event", "content_asset", "growth_play"];

/** Fields the naming, template and due-date logic depend on. Always required. */
export const LOCKED_REQUIRED_FIELDS = ["shortName", "type", "launchDate"] as const;

export interface FormFieldRule {
  id: string;
  required: boolean;
}

const DEFAULT_REQUIRED: Record<string, boolean> = {
  region: true,
  budgetUsd: true,
  venue: false,
  brief: true,
};

export function isFieldRequired(fieldId: string, formFields?: readonly FormFieldRule[]): boolean {
  if ((LOCKED_REQUIRED_FIELDS as readonly string[]).includes(fieldId)) return true;
  const field = formFields?.find((item) => item.id === fieldId);
  if (field) return Boolean(field.required);
  return DEFAULT_REQUIRED[fieldId] ?? false;
}

export interface ValidationFailure {
  ok: false;
  errors: Record<string, string>;
}

export interface ValidationSuccess {
  ok: true;
  value: ValidatedCampaignInput;
}

export type ValidationResult = ValidationFailure | ValidationSuccess;

export function validateCampaignInput(
  input: CampaignInput,
  formFields?: readonly FormFieldRule[],
): ValidationResult {
  const errors: Record<string, string> = {};
  const required = (fieldId: string) => isFieldRequired(fieldId, formFields);
  const shortName = (input.shortName ?? "").trim();
  if (!shortName) errors.shortName = "Enter a short campaign name.";
  else if (shortName.length > 80) errors.shortName = "Keep the short name under 80 characters.";

  const type = String(input.type ?? "").trim() as CampaignType;
  if (!TYPES.includes(type)) errors.type = "Choose Event, Content asset, or Growth play.";

  const region = (input.region ?? "").trim();
  if (!region && required("region")) errors.region = "Choose a region.";

  const launchDate = String(input.launchDate ?? "").trim();
  if (!launchDate) errors.launchDate = "Choose a launch date.";
  else if (!isIsoDate(launchDate)) errors.launchDate = "Launch date must be a valid calendar date.";

  let budgetUsd = 0;
  if (input.budgetUsd === "" || input.budgetUsd === null || input.budgetUsd === undefined) {
    if (required("budgetUsd")) errors.budgetUsd = "Enter a budget (0 is fine).";
    budgetUsd = 0;
  } else {
    budgetUsd = Number(input.budgetUsd);
    if (!Number.isFinite(budgetUsd)) errors.budgetUsd = "Budget must be a number.";
    else if (budgetUsd < 0) errors.budgetUsd = "Budget cannot be negative.";
  }

  const brief = (input.brief ?? "").trim();
  if (!brief && required("brief")) errors.brief = "Add a short brief for the team.";

  const venue = (input.venue ?? "").trim();
  if (!venue && type === "event" && required("venue")) {
    errors.venue = "Add the venue and dates on site.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { shortName, type, region, launchDate, budgetUsd, venue, brief },
  };
}
