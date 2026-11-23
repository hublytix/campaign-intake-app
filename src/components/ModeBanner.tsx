import type { AppMode } from "@/lib/types";

export function ModeBanner({
  mode,
  missing,
}: {
  mode: AppMode;
  missing: string[];
}) {
  if (mode === "demo") {
    return (
      <div
        role="status"
        className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950"
      >
        <strong className="font-semibold">Demo mode.</strong> Asana OAuth is not
        configured, so this app is using example and locally saved data only. It
        will not create a real Asana project.
      </div>
    );
  }
  if (mode === "misconfigured") {
    return (
      <div
        role="alert"
        className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-950"
      >
        <strong className="font-semibold">Configuration incomplete.</strong>{" "}
        Real Asana access is blocked because these variables are missing:{" "}
        {missing.join(", ")}. Demo mode is also disabled while any real-mode
        variable is set.
      </div>
    );
  }
  return (
    <div
      role="status"
      className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-950"
    >
      <strong className="font-semibold">Real mode.</strong> Asana writes stay in
      your allowed test workspace and only run after you confirm them. This app
      is unpublished and is not listed in the Asana App Directory.
    </div>
  );
}
