import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, tasksForLaunch } from "./templates";

describe("starter templates", () => {
  it("defines generic Event, Content asset and Growth play starters", () => {
    expect(Object.keys(STARTER_TEMPLATES).sort()).toEqual(
      ["content_asset", "event", "growth_play"],
    );
    const allNames = Object.values(STARTER_TEMPLATES)
      .flat()
      .map((task) => task.name.toLowerCase())
      .join(" | ");
    expect(allNames).not.toMatch(/deck|pptx|sharepoint|file contents/);
  });

  it("schedules Event tasks backward from the launch date", () => {
    const tasks = tasksForLaunch("event", new Date("2027-02-18T00:00:00Z"));
    const venue = tasks.find((task) => task.name === "Venue booked");
    expect(venue?.dueDate).toBe("2026-12-20");
    expect(venue?.offsetDays).toBe(-60);
    const invite = tasks.find((task) => task.name === "Invite email live");
    expect(invite?.dueDate).toBe("2027-01-19");
  });

  it("uses a kickoff task instead of deck generation for growth plays", () => {
    const tasks = tasksForLaunch("growth_play", new Date("2027-01-06T00:00:00Z"));
    expect(tasks.map((task) => task.name)).toContain("Kickoff complete");
    expect(tasks.some((task) => /deck/i.test(task.name))).toBe(false);
  });
});
