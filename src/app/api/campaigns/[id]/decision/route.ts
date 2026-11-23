import { assertSameOrigin, errorJson, json, readJson, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { decideCampaign } from "@/lib/service";

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
      decision?: "approve" | "reject";
      comment?: string;
      confirm?: boolean;
    }>(request);
    if (body.decision !== "approve" && body.decision !== "reject") {
      return errorJson("Choose approve or reject.", 400);
    }
    const result = await decideCampaign({
      id,
      decision: body.decision,
      comment: body.comment,
      confirm: body.confirm,
      orgId: session.orgId,
    });
    return json(result);
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Decision failed.", statusOf(error, 400));
  }
}
