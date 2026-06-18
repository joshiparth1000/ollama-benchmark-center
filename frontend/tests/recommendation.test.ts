import { describe, expect, it } from "vitest";

import { getRecommendationNarrative } from "../src/recommendation";

describe("recommendation narrative", () => {
  it("normalizes backend recommendation details for the ui", () => {
    const narrative = getRecommendationNarrative({
      config: { num_gpu: 1 },
      metrics: { gen_tps: 18 },
      reason: "Selected because it was fast.",
      details: {
        best_for: "Interactive assistants and drafting.",
        not_ideal_for: ["Very large batch serving."],
        examples: [{ task: "Draft an email", fit: "Good fit", why: "Short writing is a natural match." }],
        summary: "This is a strong everyday choice.",
        recommended_context: 32768,
        max_tested_context: 65536,
        context_window_note: "This benchmark tried up to 65,536 tokens."
      }
    });

    expect(narrative).toEqual({
      bestFor: "Interactive assistants and drafting.",
      notIdealFor: ["Very large batch serving."],
      examples: [{ task: "Draft an email", fit: "Good fit", why: "Short writing is a natural match." }],
      summary: "This is a strong everyday choice.",
      recommendedContext: 32768,
      maxTestedContext: 65536,
      contextWindowNote: "This benchmark tried up to 65,536 tokens."
    });
  });
});
