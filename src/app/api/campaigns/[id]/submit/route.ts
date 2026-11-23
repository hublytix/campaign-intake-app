import { assertSameOrigin, errorJson, json, readJson, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { submitCampaign } from "@/lib/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const body = await readJson<{ confirm?: boolean; idempotencyKey?: string }>(request);
    const result = await submitCampaign({
      id,
      confirm: Boolean(body.confirm),
      idempotencyKey: body.idempotencyKey,
      orgId: session.orgId,
    });
    return json(result);
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Submit failed.", statusOf(error, 400));
  }
}
