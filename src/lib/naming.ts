import type { CampaignType } from "./types";

export const TYPE_NAME_TOKEN: Record<CampaignType, string> = {
  event: "Event",
  content_asset: "Content",
  growth_play: "Growth",
};

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleHyphen(value: string): string {
  return value
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

export function fiscalYearToken(launchDate: Date): string {
  const year = launchDate.getUTCFullYear();
  return `FY${String(year).slice(-2)}`;
}

export function quarterToken(launchDate: Date): string {
  const month = launchDate.getUTCMonth();
  return `Q${Math.floor(month / 3) + 1}`;
}

export interface NameTokens {
  launchDate: Date;
  region: string;
  type: CampaignType | string;
  shortName: string;
  quarter?: string;
  owner?: string;
  channel?: string;
  medium?: string;
}

function typeToken(type: string): string {
  if (type in TYPE_NAME_TOKEN) {
    return TYPE_NAME_TOKEN[type as CampaignType];
  }
  return type
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function tokenMap(input: NameTokens): Record<string, string> {
  const fy = fiscalYearToken(input.launchDate);
  const type = typeToken(input.type);
  const quarter = input.quarter || quarterToken(input.launchDate);
  return {
    FY: fy,
    fy,
    Region: input.region,
    region: input.region,
    Type: type,
    type,
    Name: titleHyphen(input.shortName),
    name: input.shortName.trim(),
    Quarter: quarter,
    quarter,
    Owner: input.owner ?? "",
    owner: input.owner ?? "",
    channel: input.channel ?? "linkedin",
    medium: input.medium ?? "paid-social",
  };
}

export function applyNamePattern(
  pattern: string,
  input: NameTokens,
  maxLength = 50,
): string {
  const tokens = tokenMap(input);
  let value = pattern.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) => {
    return tokens[key] ?? tokens[key.toLowerCase()] ?? "";
  });
  value = value.replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
  if (value.length > maxLength) value = value.slice(0, maxLength).trim();
  return value;
}

export const DEFAULT_NAME_PATTERN = "{FY}-{Region}-{Type}-{Name}";
export const DEFAULT_UTM_PATTERN =
  "utm_source={channel}&utm_medium={medium}&utm_campaign={name_slug}";

export function applyUtmPattern(pattern: string, input: NameTokens): string {
  const campaignName = applyNamePattern(DEFAULT_NAME_PATTERN, input, 80);
  const tokens: Record<string, string> = {
    ...tokenMap(input),
    name_slug: slugify(campaignName),
    campaign: slugify(campaignName),
  };
  return pattern.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) => {
    return tokens[key] ?? "";
  });
}

export function normalizeCampaignName(name: string): string {
  return slugify(name);
}
