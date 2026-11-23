import { assertSameOrigin, errorJson, json, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { refreshCampaignStatus } from "@/lib/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const campaign = await refreshCampaignStatus(id, session.orgId);
    return json({ campaign });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Refresh failed.", statusOf(error));
  }
}
