import { assertSameOrigin, errorJson, json, readJson, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { getSettings, saveSettings } from "@/lib/service";
import type { OrgSettings } from "@/lib/defaults";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  return json({ settings: getSettings(session.orgId) });
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const body = await readJson<Partial<OrgSettings>>(request);
    return json({ settings: saveSettings(body, session.orgId) });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Save failed.", statusOf(error, 400));
  }
}
