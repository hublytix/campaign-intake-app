import { DEFAULT_REGIONS } from "@/lib/defaults";
import { inspectEnv } from "@/lib/config";
import { errorJson, json, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { getConnectionPublic, getSettings, listCampaigns } from "@/lib/service";
import { TYPE_BLURBS, TYPE_LABELS } from "@/lib/templates";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    const inspection = inspectEnv();
    return json({
      mode: inspection.mode,
      missing: inspection.missing,
      present: inspection.present,
      allowedWorkspaceGids: inspection.allowedWorkspaceGids,
      appBaseUrl: inspection.appBaseUrl,
      orgId: session.orgId,
      connection: getConnectionPublic(session.orgId),
      settings: getSettings(session.orgId),
      campaigns: listCampaigns(session.orgId),
      regions: DEFAULT_REGIONS,
      typeLabels: TYPE_LABELS,
      typeBlurbs: TYPE_BLURBS,
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Failed to load.", statusOf(error));
  }
}
