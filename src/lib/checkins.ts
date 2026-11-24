import type { TaskCheckInStatus } from "./types";

export type CheckInReplyStatus = Extract<TaskCheckInStatus, "done" | "delayed" | "blocked">;

export interface ParsedCheckInReply {
  status: CheckInReplyStatus;
  note: string | null;
}

export interface CheckInStory {
  gid: string;
  text: string;
  createdAt: string;
  isComment: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The comment posted on the Asana task. Mentioning the owner by gid makes Asana
 * notify them in their inbox.
 */
export function buildCheckInHtml(input: {
  ownerGid: string;
  taskName: string;
  dueDate: string;
  campaignName: string;
}): string {
  return (
    "<body>" +
    `<a data-asana-gid="${escapeHtml(input.ownerGid)}"/> quick check-in on ` +
    `<strong>${escapeHtml(input.taskName)}</strong> for ${escapeHtml(input.campaignName)}, ` +
    `due ${escapeHtml(input.dueDate)}. ` +
    "Please reply to this comment starting with <strong>done</strong>, <strong>delayed</strong> " +
    "or <strong>blocked</strong>, plus a short note if useful. " +
    "(Sent by Campaign Intake.)" +
    "</body>"
  );
}

const KEYWORDS: Array<[RegExp, CheckInReplyStatus]> = [
  [/^(done|complete|completed|finished)\b/i, "done"],
  [/^(delayed|late|behind)\b/i, "delayed"],
  [/^(blocked|stuck)\b/i, "blocked"],
];

/**
 * Reads a reply such as "delayed - waiting on the venue contract".
 * Leading @mentions and punctuation are ignored. Returns null when the reply
 * doesn't start with a known status word.
 */
export function parseCheckInReply(text: string): ParsedCheckInReply | null {
  let rest = text.trim();
  // Asana renders mentions in plain text as "@Name"; skip any leading ones.
  rest = rest.replace(/^(@[\w.'-]+(\s+[A-Z][\w.'-]*)?[\s,:]*)+/, "").trim();
  for (const [pattern, status] of KEYWORDS) {
    const match = rest.match(pattern);
    if (!match) continue;
    const note = rest
      .slice(match[0].length)
      .replace(/^[\s:,.!\-–—]+/, "")
      .trim();
    return { status, note: note || null };
  }
  return null;
}

/**
 * Picks the newest comment, posted after the check-in, that starts with a status word.
 */
export function findCheckInReply(
  stories: CheckInStory[],
  input: { sentAt: string; checkInStoryGid: string | null },
): (ParsedCheckInReply & { storyGid: string }) | null {
  const sentAt = Date.parse(input.sentAt);
  const candidates = stories
    .filter((story) => story.isComment && story.gid !== input.checkInStoryGid)
    .filter((story) => Number.isNaN(sentAt) || Date.parse(story.createdAt) > sentAt)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const story of candidates) {
    const parsed = parseCheckInReply(story.text);
    if (parsed) return { ...parsed, storyGid: story.gid };
  }
  return null;
}
