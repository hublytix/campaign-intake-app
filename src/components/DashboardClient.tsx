"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api-client";
import type { AppMode } from "@/lib/types";
import {
  approvedOrInProgressCount,
  approvedOrInProgressLabel,
  checkInAnsweredMetrics,
  displayCampaignStatus,
} from "@/lib/dashboard-metrics";
import { ConfirmDialog } from "./ConfirmDialog";

type Task = {
  id: string;
  name: string;
  dueDate: string;
  ownerName: string | null;
  completed: boolean;
  checkInStatus: string;
  checkInNote: string | null;
  checkInSentAt: string | null;
};

type Campaign = {
  id: string;
  fullName: string;
  shortName: string;
  type: string;
  region: string;
  launchDate: string;
  status: string;
  approverRole: string | null;
  brief: string;
  isSample: boolean;
  asanaProjectCreated: boolean;
  asanaProjectUrl: string | null;
  tasks: Task[];
};

interface Bootstrap {
  mode: AppMode;
  campaigns: Campaign[];
}

const STATUS_CLASS: Record<string, string> = {
  blocked: "bg-red-50 text-red-700",
  delayed: "bg-amber-50 text-amber-800",
  live: "bg-blue-50 text-blue-800",
  launched: "bg-emerald-50 text-emerald-800",
  awaiting_approval: "bg-gray-100 text-gray-700",
  draft: "bg-gray-100 text-gray-600",
  rejected: "bg-gray-100 text-gray-500",
  setting_up: "bg-indigo-50 text-indigo-800",
  approved: "bg-blue-50 text-blue-800",
};

function label(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DashboardClient() {
  const [mode, setMode] = useState<AppMode>("demo");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState<"all" | "late" | "awaiting_approval" | "launched">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [approveChecked, setApproveChecked] = useState(false);
  const [reply, setReply] = useState<{ campaignId: string; task: Task } | null>(null);

  async function reload() {
    const data = await apiGet<Bootstrap>("/api/bootstrap");
    setMode(data.mode);
    setCampaigns(data.campaigns);
  }

  useEffect(() => {
    reload().catch((err: Error) => setMessage(err.message));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const visible = useMemo(() => {
    return campaigns.filter((campaign) => {
      if (filter === "all") return true;
      if (filter === "launched") return campaign.status === "launched";
      if (filter === "awaiting_approval") return campaign.status === "awaiting_approval";
      return campaign.status === "delayed" || campaign.status === "blocked";
    });
  }, [campaigns, filter]);

  const lateTasks = campaigns.flatMap((campaign) =>
    campaign.tasks
      .filter((task) => {
        if (["draft", "rejected"].includes(campaign.status)) return false;
        return (
          task.checkInStatus === "blocked" ||
          task.checkInStatus === "delayed" ||
          task.checkInStatus === "no_reply" ||
          (!task.completed && task.dueDate < today && campaign.status !== "launched")
        );
      })
      .map((task) => ({ campaign, task })),
  );

  const checkins = checkInAnsweredMetrics(campaigns);
  const counts = {
    inProgress: approvedOrInProgressCount(campaigns),
    awaiting: campaigns.filter((c) => c.status === "awaiting_approval").length,
    late: campaigns.filter((c) => ["delayed", "blocked"].includes(c.status)).length,
    checkins,
    inProgressLabel: approvedOrInProgressLabel(campaigns),
  };

  async function refreshAll() {
    setMessage(null);
    try {
      for (const campaign of campaigns) {
        if (["draft", "awaiting_approval", "rejected"].includes(campaign.status)) continue;
        await apiSend(`/api/campaigns/${campaign.id}/refresh`, "POST", {});
      }
      await reload();
      setMessage(
        mode === "real"
          ? "Status and check-in replies refreshed from Asana."
          : "Status refreshed.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Refresh failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            {mode === "demo" ? "Sample and locally saved data · no Asana projects created" : "Allowed test workspace only"}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={refreshAll}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh status
          </button>
          <Link
            href="/intake"
            className="btn-primary px-4 py-2"
          >
            New request
          </Link>
        </div>
      </div>

      {message ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm" role="status">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Approved or in progress", counts.inProgress, counts.inProgressLabel],
          ["Awaiting approval", counts.awaiting, "Awaiting approval"],
          ["Late or blocked", counts.late, "Late or blocked"],
          [
            "Check-ins answered",
            `${counts.checkins.answered} of ${counts.checkins.requested}`,
            "Check-ins answered",
          ],
        ].map(([fallbackLabel, value, labelText], index) => (
          <article
            key={String(fallbackLabel)}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${
              index === 2 && counts.late ? "border-red-200" : "border-gray-200"
            }`}
          >
            <p className="text-sm text-gray-500">{labelText}</p>
            <p className={`mt-2 text-3xl font-semibold ${index === 2 && counts.late ? "text-red-700" : ""}`}>
              {value}
            </p>
            {index === 3 ? (
              <p className="mt-1 text-xs text-gray-500">Of check-ins sent or replied, excluding drafts</p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Every campaign</h2>
            <div className="flex rounded-full bg-gray-100 p-1 text-sm">
              {(["all", "late", "awaiting_approval", "launched"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-full px-3 py-1 ${filter === value ? "bg-gray-900 text-white" : "text-gray-600"}`}
                >
                  {value === "awaiting_approval" ? "Awaiting approval" : label(value)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 font-medium">Launch</th>
                  <th className="pb-2 font-medium">Tasks done</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((campaign) => {
                  const done = campaign.tasks.filter((task) => task.completed).length;
                  return (
                    <tr key={campaign.id} className="border-t border-gray-100 align-top">
                      <td className="py-3">
                        <div className="font-medium">{campaign.fullName}</div>
                        <div className="text-xs text-gray-500">
                          {campaign.asanaProjectCreated
                            ? "Asana project created"
                            : campaign.isSample
                              ? "Sample data"
                              : "Not created in Asana"}
                        </div>
                      </td>
                      <td className="py-3 whitespace-nowrap">{campaign.launchDate}</td>
                      <td className="py-3">
                        {done} of {campaign.tasks.length}
                      </td>
                      <td className="py-3">
                        {(() => {
                          const shown = displayCampaignStatus(campaign);
                          return (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[shown.key] || STATUS_CLASS[campaign.status] || "bg-gray-100"}`}>
                              {shown.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 text-right">
                        {campaign.status === "awaiting_approval" ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="text-sm font-medium text-primary"
                              onClick={() => setApproveId(campaign.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="text-sm font-medium text-red-700"
                              onClick={() => setRejectId(campaign.id)}
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Who&apos;s late</h2>
          <p className="mt-1 text-xs text-gray-500">
            {mode === "real"
              ? "Check-ins are posted as comments on the Asana task. Owners reply there with done, delayed or blocked; refresh to pull replies in."
              : "From in-app check-ins and overdue tasks"}
          </p>
          <div className="mt-4 space-y-3">
            {lateTasks.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing is late right now.</p>
            ) : (
              lateTasks.map(({ campaign, task }) => (
                <article key={task.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{task.ownerName || "Unassigned"} · {task.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[task.checkInStatus] || STATUS_CLASS.delayed}`}>
                      {label(task.checkInStatus === "pending" ? "late" : task.checkInStatus)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {campaign.fullName}
                    {task.checkInNote ? ` · “${task.checkInNote}”` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium"
                      onClick={async () => {
                        setMessage(null);
                        try {
                          const result = await apiSend<{ message: string }>(
                            `/api/campaigns/${campaign.id}/check-in`,
                            "POST",
                            { taskId: task.id, action: "send" },
                          );
                          setMessage(result.message);
                          await reload();
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : "Check-in failed.");
                        }
                      }}
                    >
                      Send check-in
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium"
                      onClick={() => setReply({ campaignId: campaign.id, task })}
                    >
                      Record reply
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(rejectId)}
        title="Reject this request?"
        confirmLabel="Reject"
        danger
        disabled={!rejectComment.trim()}
        onClose={() => {
          setRejectId(null);
          setRejectComment("");
        }}
        onConfirm={async () => {
          if (!rejectId) return;
          const result = await apiSend<{ message: string }>(`/api/campaigns/${rejectId}/decision`, "POST", {
            decision: "reject",
            comment: rejectComment,
          });
          setMessage(result.message);
          setRejectId(null);
          setRejectComment("");
          await reload();
        }}
      >
        <p>A comment is required to reject. No Asana project will be created.</p>
        <label className="mt-3 block text-sm font-medium text-gray-800">
          Comment
          <textarea
            className="mt-1 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={rejectComment}
            onChange={(event) => setRejectComment(event.target.value)}
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(approveId)}
        title={mode === "real" ? "Approve and create in Asana?" : "Approve this request?"}
        confirmLabel={mode === "real" ? "Approve and create" : "Approve"}
        disabled={mode === "real" && !approveChecked}
        onClose={() => {
          setApproveId(null);
          setApproveChecked(false);
        }}
        onConfirm={async () => {
          if (!approveId) return;
          const result = await apiSend<{ message: string }>(`/api/campaigns/${approveId}/decision`, "POST", {
            decision: "approve",
            confirm: true,
          });
          setMessage(result.message);
          setApproveId(null);
          setApproveChecked(false);
          await reload();
        }}
      >
        {mode === "real" ? (
          <>
            <p>Approval will create the Asana project in the allowed test workspace.</p>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={approveChecked}
                onChange={(event) => setApproveChecked(event.target.checked)}
              />
              I confirm I want to create this Asana project.
            </label>
          </>
        ) : (
          <p>In demo mode, approval only updates the local record. No Asana project will be created.</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(reply)}
        title="Record a check-in reply"
        confirmLabel="Save reply"
        onClose={() => setReply(null)}
        onConfirm={async () => {
          if (!reply) return;
          const form = document.getElementById("checkin-form") as HTMLFormElement;
          const status = (form.elements.namedItem("status") as HTMLSelectElement).value;
          const note = (form.elements.namedItem("note") as HTMLTextAreaElement).value;
          await apiSend(`/api/campaigns/${reply.campaignId}/check-in`, "POST", {
            taskId: reply.task.id,
            action: "reply",
            status,
            note,
          });
          setReply(null);
          await reload();
        }}
      >
        {reply ? (
          <form id="checkin-form" className="space-y-3">
            <p>
              {reply.task.name} · {reply.task.dueDate}
            </p>
            <label className="block text-sm font-medium">
              Status
              <select name="status" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
                <option value="done">Done</option>
                <option value="delayed">Delayed</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Note (optional)
              <textarea name="note" className="mt-1 min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
          </form>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
