"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend } from "@/lib/api-client";
import { resolveApprover } from "@/lib/approvals";
import { applyNamePattern, applyUtmPattern } from "@/lib/naming";
import { isFieldRequired } from "@/lib/validation";
import type { OrgSettings } from "@/lib/defaults";
import type { AppMode, CampaignType } from "@/lib/types";
import { TYPE_BLURBS, TYPE_LABELS, tasksForLaunch } from "@/lib/templates";
import { ConfirmDialog } from "./ConfirmDialog";

interface Bootstrap {
  mode: AppMode;
  settings: OrgSettings;
  regions: Array<{ value: string; label: string }>;
  connection: { connected: boolean; workspaceName: string | null };
}

const TYPES: CampaignType[] = ["event", "content_asset", "growth_play"];

export function IntakeClient() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [type, setType] = useState<CampaignType>("event");
  const [shortName, setShortName] = useState("");
  const [region, setRegion] = useState("NA");
  const [launchDate, setLaunchDate] = useState("2027-02-18");
  const [budgetUsd, setBudgetUsd] = useState("0");
  const [venue, setVenue] = useState("");
  const [brief, setBrief] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestKeyRef = useRef(crypto.randomUUID());
  const inFlightRef = useRef(false);

  useEffect(() => {
    apiGet<Bootstrap>("/api/bootstrap").then(setBootstrap).catch((err: Error) => {
      setMessage(err.message);
    });
  }, []);

  const preview = useMemo(() => {
    if (!bootstrap) return null;
    const settings = bootstrap.settings;
    const input = {
      launchDate: new Date(`${launchDate || "2027-01-01"}T00:00:00Z`),
      region,
      type,
      shortName: shortName || "Campaign",
    };
    return {
      name: applyNamePattern(settings.namePattern, input, settings.maxNameLength),
      utm: applyUtmPattern(settings.utmPattern, input),
      tasks: tasksForLaunch(type, launchDate || "2027-01-01", settings.templates[type]),
      approval: resolveApprover(settings.approvalRules, {
        type,
        budgetUsd: Number(budgetUsd || 0),
      }),
    };
  }, [bootstrap, shortName, region, type, launchDate, budgetUsd]);

  async function persistDraft() {
    const result = await apiSend<{ campaign: { id: string } }>("/api/campaigns", "POST", {
      id: pendingId,
      idempotencyKey: requestKeyRef.current,
      shortName,
      type,
      region,
      launchDate,
      budgetUsd,
      venue,
      brief,
    });
    setPendingId(result.campaign.id);
    return result.campaign.id;
  }

  async function submit(id: string, confirm: boolean) {
    return apiSend<{ message: string; asanaProjectCreated: boolean; campaign: { id: string; status: string } }>(
      `/api/campaigns/${id}/submit`,
      "POST",
      { confirm, idempotencyKey: requestKeyRef.current },
    );
  }

  async function runExclusive(work: () => Promise<void>) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setErrors({});
    setMessage(null);
    setBusy(true);
    try {
      await work();
    } catch (err) {
      const e = err as Error & { errors?: Record<string, string> };
      setErrors(e.errors ?? {});
      setMessage(e.message);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  async function onSaveDraft() {
    await runExclusive(async () => {
      await persistDraft();
      setMessage("Draft saved locally. It has not been submitted and no Asana project was created.");
    });
  }

  async function onSubmitRequest() {
    await runExclusive(async () => {
      const id = await persistDraft();
      if (preview?.approval.needed) {
        const result = await submit(id, false);
        setMessage(result.message);
        setConfirmOpen(false);
        setChecked(false);
        return;
      }
      setConfirmOpen(true);
    });
  }

  async function onConfirm() {
    if (!pendingId) return;
    setBusy(true);
    try {
      const result = await submit(pendingId, true);
      setMessage(result.message);
      setConfirmOpen(false);
      setChecked(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!bootstrap || !preview) {
    return <p className="text-sm text-gray-500">{message || "Loading form…"}</p>;
  }

  const optionalTag = (fieldId: string) =>
    isFieldRequired(fieldId, bootstrap.settings.formFields) ? null : (
      <span className="font-normal text-gray-500"> (optional)</span>
    );

  const fieldError = (name: string) =>
    errors[name] ? (
      <p className="mt-1 text-xs text-red-700" role="alert">
        {errors[name]}
      </p>
    ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">New campaign request</h1>
        <p className="mt-2 text-sm text-gray-500">
          Takes about 3 minutes. Setup starts as soon as it is approved.
        </p>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-gray-900">Campaign type</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {TYPES.map((value) => (
              <label
                key={value}
                className={`cursor-pointer rounded-xl border p-4 text-sm ${
                  type === value ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  className="sr-only"
                  checked={type === value}
                  onChange={() => setType(value)}
                />
                <span className="block font-semibold">{TYPE_LABELS[value]}</span>
                <span className="mt-1 block text-gray-500">{TYPE_BLURBS[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-6 block text-sm font-medium">
          Campaign name
          <input
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={shortName}
            onChange={(event) => setShortName(event.target.value)}
            placeholder="Fall Summit"
          />
          <span className="mt-1 block text-xs text-gray-500">
            A short name; we add the year, region and type for you.
          </span>
          {fieldError("shortName")}
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Region
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            >
              {bootstrap.regions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            {fieldError("region")}
          </label>
          <label className="block text-sm font-medium">
            Launch date
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={launchDate}
              onChange={(event) => setLaunchDate(event.target.value)}
            />
            {fieldError("launchDate")}
          </label>
          <label className="block text-sm font-medium">
            Budget (USD){optionalTag("budgetUsd")}
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={budgetUsd}
              onChange={(event) => setBudgetUsd(event.target.value)}
            />
            {fieldError("budgetUsd")}
          </label>
        </div>

        {type === "event" ? (
          <label className="mt-4 block text-sm font-medium">
            Venue and dates on site{optionalTag("venue")}
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
            />
            {fieldError("venue")}
          </label>
        ) : null}

        <label className="mt-4 block text-sm font-medium">
          Brief{optionalTag("brief")}
          <textarea
            className="mt-1 min-h-28 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="Goal, audience, key message, anything the team should know"
          />
          {fieldError("brief")}
        </label>

        {pendingId ? (
          <p className="mt-4 text-xs text-gray-500">Editing the saved draft. Further saves and submit keep the same request.</p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-800" role="status">
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onSaveDraft}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSubmitRequest}
            className="btn-primary px-4 py-2.5"
          >
            Submit request
          </button>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">What gets set up</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Name</dt>
              <dd className="mt-1 font-medium break-all">{preview.name}</dd>
              <dd className="text-xs text-gray-500">{preview.name.length} of {bootstrap.settings.maxNameLength} characters</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">UTM campaign</dt>
              <dd className="mt-1 break-all font-mono text-xs text-gray-600">{preview.utm}</dd>
            </div>
          </dl>
          <ul className="mt-4 list-disc space-y-2 pl-4 text-sm text-gray-700">
            <li>Asana project from the {TYPE_LABELS[type]} template, dates counted back from launch</li>
            {bootstrap.mode !== "real" ? (
              <li>Demo mode: saved locally only, no Asana project created</li>
            ) : (
              <li>Created in the allowed test workspace after confirmation</li>
            )}
            <li>Owners get in-app check-ins before each due date</li>
          </ul>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Approval</h2>
          <p className="mt-2 text-sm text-gray-600">
            {preview.approval.needed
              ? `Goes to the ${preview.approval.approverRole} first. You will get a status update in this app when it is decided.`
              : "No approval is needed for this request. Setup can start after you confirm."}
          </p>
        </section>
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        title={bootstrap.mode === "real" ? "Create this in Asana?" : "Submit in demo mode?"}
        confirmLabel={bootstrap.mode === "real" ? "Create Asana project" : "Save locally"}
        disabled={bootstrap.mode === "real" ? !checked : false}
        onClose={() => {
          setConfirmOpen(false);
          setChecked(false);
        }}
        onConfirm={onConfirm}
      >
        {bootstrap.mode === "real" ? (
          <>
            <p>
              This will create a project named <strong>{preview.name}</strong> in your allowed
              Asana test workspace
              {bootstrap.connection.workspaceName ? ` (${bootstrap.connection.workspaceName})` : ""}.
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              I confirm I want to create this Asana project and its tasks.
            </label>
          </>
        ) : (
          <p>
            Demo mode will save this campaign locally and will not create an Asana project.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
