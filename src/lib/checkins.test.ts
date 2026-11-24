import { describe, expect, it } from "vitest";
import { buildCheckInHtml, findCheckInReply, parseCheckInReply } from "./checkins";

describe("buildCheckInHtml", () => {
  it("mentions the owner and escapes task and campaign text", () => {
    const html = buildCheckInHtml({
      ownerGid: "123",
      taskName: "Venue <booked> & signed",
      dueDate: "2027-03-07",
      campaignName: "FY27-NA-Event-Summit",
    });
    expect(html.startsWith("<body>")).toBe(true);
    expect(html.endsWith("</body>")).toBe(true);
    expect(html).toContain('<a data-asana-gid="123"/>');
    expect(html).toContain("Venue &lt;booked&gt; &amp; signed");
    expect(html).not.toContain("<booked>");
  });
});

describe("parseCheckInReply", () => {
  it("reads the status word and the note", () => {
    expect(parseCheckInReply("delayed - waiting on the venue contract")).toEqual({
      status: "delayed",
      note: "waiting on the venue contract",
    });
    expect(parseCheckInReply("Done")).toEqual({ status: "done", note: null });
    expect(parseCheckInReply("BLOCKED: legal review")).toEqual({ status: "blocked", note: "legal review" });
  });

  it("accepts common synonyms", () => {
    expect(parseCheckInReply("finished, shipped yesterday")?.status).toBe("done");
    expect(parseCheckInReply("behind by a week")?.status).toBe("delayed");
    expect(parseCheckInReply("stuck on budget")?.status).toBe("blocked");
  });

  it("skips a leading @mention", () => {
    expect(parseCheckInReply("@Priya done, assets uploaded")).toEqual({
      status: "done",
      note: "assets uploaded",
    });
  });

  it("ignores replies that don't start with a status word", () => {
    expect(parseCheckInReply("I think it is done")).toBeNull();
    expect(parseCheckInReply("")).toBeNull();
    expect(parseCheckInReply("doneish")).toBeNull();
  });
});

describe("findCheckInReply", () => {
  const sentAt = "2027-01-10T10:00:00.000Z";

  it("returns the newest matching comment after the check-in", () => {
    const reply = findCheckInReply(
      [
        { gid: "s0", text: "done", createdAt: "2027-01-09T10:00:00.000Z", isComment: true },
        { gid: "check", text: "Please reply with done", createdAt: "2027-01-10T10:00:01.000Z", isComment: true },
        { gid: "s1", text: "delayed, need a week", createdAt: "2027-01-11T10:00:00.000Z", isComment: true },
        { gid: "s2", text: "thanks!", createdAt: "2027-01-12T10:00:00.000Z", isComment: true },
        { gid: "s3", text: "done", createdAt: "2027-01-13T10:00:00.000Z", isComment: false },
      ],
      { sentAt, checkInStoryGid: "check" },
    );
    expect(reply).toEqual({ status: "delayed", note: "need a week", storyGid: "s1" });
  });

  it("returns null when nobody has replied yet", () => {
    expect(
      findCheckInReply(
        [{ gid: "check", text: "done or delayed?", createdAt: "2027-01-10T10:00:01.000Z", isComment: true }],
        { sentAt, checkInStoryGid: "check" },
      ),
    ).toBeNull();
  });
});
