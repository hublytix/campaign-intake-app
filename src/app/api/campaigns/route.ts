import { assertSameOrigin, errorJson, json, readJson, statusOf } from "@/lib/http";
import { requireSession } from "@/lib/route-helpers";
import { listCampaigns, saveDraft } from "@/lib/service";
import type { CampaignInput } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireSession();
  return json({ campaigns: listCampaigns(session.orgId) });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const body = await readJson<CampaignInput>(request);
    const campaign = saveDraft(body, session.orgId);
    return json({ campaign }, 201);
  } catch (error) {
    const extra =
      error && typeof error === "object" && "errors" in error
        ? { errors: (error as { errors: unknown }).errors }
        : undefined;
    return errorJson(
      error instanceof Error ? error.message : "Could not save draft.",
      statusOf(error, 400),
      extra,
    );
  }
}
