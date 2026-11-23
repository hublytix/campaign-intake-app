import { assertSameOrigin, errorJson, json, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { deleteCampaign, getCampaign } from "@/lib/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await context.params;
  const campaign = getCampaign(id, session.orgId);
  if (!campaign) return errorJson("Campaign not found.", 404);
  return json({ campaign });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    if (!getCampaign(id, session.orgId)) return errorJson("Campaign not found.", 404);
    deleteCampaign(id, session.orgId);
    return json({ ok: true });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Delete failed.", statusOf(error));
  }
}
