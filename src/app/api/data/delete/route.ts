import { assertSameOrigin, errorJson, json, readJson, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { deleteAllOrgData } from "@/lib/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const body = await readJson<{ confirm?: boolean }>(request);
    if (!body.confirm) {
      return errorJson("Confirm that you want to delete all local data for this workspace.", 400);
    }
    await deleteAllOrgData(session.orgId);
    return json({
      ok: true,
      message: "Local campaigns, settings and stored Asana tokens were deleted.",
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Delete failed.", statusOf(error));
  }
}
