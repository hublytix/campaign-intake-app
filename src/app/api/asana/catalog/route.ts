import { inspectEnv } from "@/lib/config";
import { errorJson, json, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { listAsanaCatalog } from "@/lib/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (inspectEnv().mode !== "real") {
      return errorJson("The Asana catalog is available only in real mode.", 409);
    }
    const session = await requireSession();
    return json(await listAsanaCatalog(session.orgId));
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Catalog failed.", statusOf(error));
  }
}
