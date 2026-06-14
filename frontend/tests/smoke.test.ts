import { describe, expect, it } from "vitest";

describe("frontend smoke", () => {
  it("has a healthy test harness", () => {
    expect("ollama benchmark center").toContain("benchmark");
  });
});
