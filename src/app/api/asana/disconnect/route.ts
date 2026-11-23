import { assertSameOrigin, errorJson, json, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { disconnectAsana, getConnectionPublic } from "@/lib/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    await disconnectAsana(session.orgId);
    return json({
      connection: getConnectionPublic(session.orgId),
      message: "Asana was disconnected and stored tokens were removed.",
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Disconnect failed.", statusOf(error));
  }
}
