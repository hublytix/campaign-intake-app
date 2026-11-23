import { inspectEnv } from "@/lib/config";
import { AppShell } from "./AppShell";

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { mode, missing } = inspectEnv();
  return (
    <AppShell mode={mode} missing={missing}>
      {children}
    </AppShell>
  );
}
