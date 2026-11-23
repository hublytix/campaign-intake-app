"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api-client";
import { applyNamePattern, applyUtmPattern } from "@/lib/naming";
import type { OrgSettings } from "@/lib/defaults";
import type { AppMode, CampaignType } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

interface Bootstrap {
  mode: AppMode;
  missing: string[];
  connection: {
    connected: boolean;
    workspaceGid: string | null;
    workspaceName: string | null;
    asanaUserName: string | null;
  };
  settings: OrgSettings;
  regions: Array<{ value: string; label: string }>;
}

const STEPS = [
  "Connect tools",
  "Form fields",
  "Naming and UTMs",
  "Templates",
  "Approvers and pings",
];

export function SetupClient() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);

  async function reload() {
    const bootstrap = await apiGet<Bootstrap>("/api/bootstrap");
    setData(bootstrap);
    setSettings(bootstrap.settings);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  const preview = useMemo(() => {
    if (!settings) return { name: "", utm: "" };
    const input = {
      launchDate: new Date("2027-02-18T00:00:00Z"),
      region: "NA",
      type: "event" as const,
      shortName: "Fall Summit",
    };
    return {
      name: applyNamePattern(settings.namePattern, input, settings.maxNameLength),
      utm: applyUtmPattern(settings.utmPattern, input),
    };
  }, [settings]);

  async function save() {
    if (!settings) return;
    setError(null);
    try {
      const result = await apiSend<{ settings: OrgSettings }>("/api/settings", "PUT", settings);
      setSettings(result.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  if (!data || !settings) {
    return <p className="text-sm text-gray-500">{error || "Loading setup…"}</p>;
  }

  const asanaReady = data.mode === "real";

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-900">Setup</p>
        <p className="mt-1 text-xs text-gray-500">About 10 minutes · local unpublished app</p>
        <ol className="mt-4 space-y-3">
          {STEPS.map((label, index) => (
            <li key={label} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold">
                {index + 1}
              </span>
              <span className="pt-0.5 text-gray-700">{label}</span>
            </li>
          ))}
        </ol>
      </aside>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Set up campaign intake</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Pick options; nobody builds a workflow. Requesters see one form, and every
            campaign gets the same names, UTMs and kickoff.
          </p>
        </div>
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">1. Connect tools</h2>
          <p className="mt-1 text-sm text-gray-500">
            OAuth only, least-privilege scopes. This app stores IDs, names, dates and
            statuses, plus the fields a requester types. It does not store file contents
            or contacts from other systems.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Asana</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Create projects from templates with real dates and owners.
                  </p>
                  {data.connection.connected ? (
                    <p className="mt-2 text-sm text-gray-700">
                      Workspace: {data.connection.workspaceName || data.connection.workspaceGid}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    data.connection.connected
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {data.connection.connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {asanaReady ? (
                  <a
                    className="btn-primary px-3 py-2"
                    href="/api/asana/oauth/start?returnPath=/setup"
                  >
                    {data.connection.connected ? "Reconnect Asana" : "Connect Asana"}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-500"
                  >
                    Connect Asana
                  </button>
                )}
                {data.connection.connected ? (
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
                    onClick={() => setDisconnectOpen(true)}
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
              {!asanaReady ? (
                <p className="mt-3 text-xs leading-5 text-gray-500">
                  Connection is disabled in {data.mode} mode. See README and{" "}
                  <code>.env.example</code> for the variables this app uses. This chat&apos;s
                  Asana connector is never used as the product&apos;s OAuth credentials.
                </p>
              ) : null}
            </article>
            {["HubSpot", "Microsoft Teams", "SharePoint", "Salesforce"].map((name) => (
              <article key={name} className="rounded-xl border border-dashed border-gray-200 p-4 opacity-70">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{name}</h3>
                    <p className="mt-1 text-sm text-gray-500">Not in this Asana-only version.</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                    Later
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">2. Form fields</h2>
          <p className="mt-1 text-sm text-gray-500">
            What requesters fill in. Fields can show only for some campaign types.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="pb-2 font-medium">Field</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Shows for</th>
                  <th className="pb-2 font-medium">Required</th>
                </tr>
              </thead>
              <tbody>
                {settings.formFields.map((field, index) => (
                  <tr key={field.id} className="border-t border-gray-100">
                    <td className="py-3">{field.label}</td>
                    <td className="py-3 capitalize text-gray-600">{field.type.replace("_", " ")}</td>
                    <td className="py-3 text-gray-600">
                      {field.showsFor === "all" ? "All types" : field.showsFor}
                    </td>
                    <td className="py-3">
                      <input
                        type="checkbox"
                        checked={field.required}
                        aria-label={`${field.label} required`}
                        onChange={(event) => {
                          const formFields = settings.formFields.map((item, i) =>
                            i === index ? { ...item, required: event.target.checked } : item,
                          );
                          setSettings({ ...settings, formFields });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm ring-1 ring-blue-100">
          <h2 className="text-lg font-semibold">3. Naming and UTMs</h2>
          <p className="mt-1 text-sm text-gray-500">
            Applied the same way in Asana and every link this app generates.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Name pattern</span>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={settings.namePattern}
                onChange={(event) => setSettings({ ...settings, namePattern: event.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Maximum length</span>
              <input
                type="number"
                min={8}
                max={80}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                value={settings.maxNameLength}
                onChange={(event) =>
                  setSettings({ ...settings, maxNameLength: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <label className="mt-4 block text-sm">
            <span className="font-medium text-gray-700">UTM pattern</span>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
              value={settings.utmPattern}
              onChange={(event) => setSettings({ ...settings, utmPattern: event.target.value })}
            />
          </label>
          <div className="mt-4 rounded-lg bg-gray-50 px-3 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</p>
            <p className="mt-1 font-medium">{preview.name}</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-600">{preview.utm}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">4. Templates</h2>
          <p className="mt-1 text-sm text-gray-500">
            Three starters. Task dates are offsets from the launch date. Deck and file
            generation are not included in this version.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {(
              [
                ["event", "Event"],
                ["content_asset", "Content asset"],
                ["growth_play", "Growth play"],
              ] as Array<[CampaignType, string]>
            ).map(([type, label]) => (
              <article key={type} className="rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold">{label}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {settings.templates[type].map((task, index) => (
                    <li key={task.key} className="flex items-center justify-between gap-2">
                      <span>{task.name}</span>
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        L
                        <input
                          type="number"
                          className="w-16 rounded border border-gray-300 px-1 py-0.5 text-right"
                          value={task.offsetDays}
                          aria-label={`${task.name} offset`}
                          onChange={(event) => {
                            const templates = { ...settings.templates };
                            templates[type] = templates[type].map((item, i) =>
                              i === index
                                ? { ...item, offsetDays: Number(event.target.value) }
                                : item,
                            );
                            setSettings({ ...settings, templates });
                          }}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">5. Approvers and pings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Rules run top to bottom; the first match wins. Approvers decide in this app,
            not in Teams.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Approver</th>
                </tr>
              </thead>
              <tbody>
                {settings.approvalRules.map((rule, index) => (
                  <tr key={rule.id} className="border-t border-gray-100">
                    <td className="py-3">
                      {rule.when === "budget_over"
                        ? `Budget is over ${rule.budgetUsd ?? 0}`
                        : rule.when === "type_is"
                          ? `Type is ${rule.type}`
                          : "Anything else"}
                    </td>
                    <td className="py-3">
                      <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5"
                        value={rule.approverRole ?? ""}
                        placeholder="No approval needed"
                        aria-label={`Approver for rule ${index + 1}`}
                        onChange={(event) => {
                          const approvalRules = settings.approvalRules.map((item, i) =>
                            i === index
                              ? { ...item, approverRole: event.target.value || null }
                              : item,
                          );
                          setSettings({ ...settings, approvalRules });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="text-sm text-red-700 hover:underline"
            onClick={() => setDeleteOpen(true)}
          >
            Delete all local data
          </button>
          <button
            type="button"
            onClick={save}
            className="btn-primary px-4 py-2.5"
          >
            {saved ? "Saved" : "Save setup"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect Asana?"
        confirmLabel="Disconnect"
        danger
        onClose={() => setDisconnectOpen(false)}
        onConfirm={async () => {
          try {
            await apiSend("/api/asana/disconnect", "POST", {});
            await reload();
            setDisconnectOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Disconnect failed.");
          }
        }}
      >
        Stored access and refresh tokens will be revoked where possible and deleted
        from this app. Campaign records stay on this machine.
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete all local data?"
        confirmLabel="Delete everything"
        danger
        disabled={!deleteChecked}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteChecked(false);
        }}
        onConfirm={async () => {
          try {
            await apiSend("/api/data/delete", "POST", { confirm: true });
            await reload();
            setDeleteOpen(false);
            setDeleteChecked(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed.");
          }
        }}
      >
        <p>This removes local campaigns, settings and stored Asana tokens for this workspace.</p>
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={deleteChecked}
            onChange={(event) => setDeleteChecked(event.target.checked)}
          />
          I understand this cannot be undone from the app.
        </label>
      </ConfirmDialog>
    </div>
  );
}
