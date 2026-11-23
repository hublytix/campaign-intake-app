import { assertSameOrigin, errorJson, json, readJson, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { recordCheckIn, sendCheckIn } from "@/lib/service";
import type { TaskCheckInStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const body = await readJson<{
      taskId?: string;
      action?: "send" | "reply";
      status?: TaskCheckInStatus;
      note?: string;
    }>(request);
    if (!body.taskId) return errorJson("A task is required.", 400);
    if (body.action === "send") {
      return json({ campaign: sendCheckIn({ campaignId: id, taskId: body.taskId, orgId: session.orgId }) });
    }
    if (!body.status) return errorJson("A check-in status is required.", 400);
    return json({
      campaign: recordCheckIn({
        campaignId: id,
        taskId: body.taskId,
        status: body.status,
        note: body.note,
        orgId: session.orgId,
      }),
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Check-in failed.", statusOf(error));
  }
}
