import type { CampaignInput, CampaignType, ValidatedCampaignInput } from "./types";
import { isIsoDate } from "./dates";

const TYPES: CampaignType[] = ["event", "content_asset", "growth_play"];

export interface ValidationFailure {
  ok: false;
  errors: Record<string, string>;
}

export interface ValidationSuccess {
  ok: true;
  value: ValidatedCampaignInput;
}

export type ValidationResult = ValidationFailure | ValidationSuccess;

export function validateCampaignInput(input: CampaignInput): ValidationResult {
  const errors: Record<string, string> = {};
  const shortName = (input.shortName ?? "").trim();
  if (!shortName) errors.shortName = "Enter a short campaign name.";
  else if (shortName.length > 80) errors.shortName = "Keep the short name under 80 characters.";

  const type = String(input.type ?? "").trim() as CampaignType;
  if (!TYPES.includes(type)) errors.type = "Choose Event, Content asset, or Growth play.";

  const region = (input.region ?? "").trim();
  if (!region) errors.region = "Choose a region.";

  const launchDate = String(input.launchDate ?? "").trim();
  if (!launchDate) errors.launchDate = "Choose a launch date.";
  else if (!isIsoDate(launchDate)) errors.launchDate = "Launch date must be a valid calendar date.";

  let budgetUsd = 0;
  if (input.budgetUsd === "" || input.budgetUsd === null || input.budgetUsd === undefined) {
    budgetUsd = 0;
  } else {
    budgetUsd = Number(input.budgetUsd);
    if (!Number.isFinite(budgetUsd)) errors.budgetUsd = "Budget must be a number.";
    else if (budgetUsd < 0) errors.budgetUsd = "Budget cannot be negative.";
  }

  const brief = (input.brief ?? "").trim();
  if (!brief) errors.brief = "Add a short brief for the team.";

  const venue = (input.venue ?? "").trim();

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { shortName, type, region, launchDate, budgetUsd, venue, brief },
  };
}
