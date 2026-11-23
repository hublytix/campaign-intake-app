import { assertSameOrigin, errorJson, json, readJson, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { assignTaskOwner } from "@/lib/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const body = await readJson<{ taskId?: string; ownerGid?: string; ownerName?: string }>(request);
    if (!body.taskId) return errorJson("A task is required.", 400);
    return json({
      campaign: assignTaskOwner({
        campaignId: id,
        taskId: body.taskId,
        ownerGid: body.ownerGid,
        ownerName: body.ownerName,
        orgId: session.orgId,
      }),
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Update failed.", statusOf(error));
  }
}
