import { inspectEnv } from "@/lib/config";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const { mode, missing, present } = inspectEnv();
  return json({
    ok: mode !== "misconfigured",
    mode,
    missing,
    present,
    asanaProjectWritesEnabled: mode === "real",
  });
}
