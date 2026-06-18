import type { Recommendation } from "./api";

export type RecommendationNarrative = {
  bestFor: string;
  notIdealFor: string[];
  examples: Array<{ task: string; fit: string; why: string }>;
  summary: string;
  recommendedContext: number | null;
  maxTestedContext: number | null;
  contextWindowNote: string | null;
};

export function getRecommendationNarrative(recommendation: Recommendation | undefined): RecommendationNarrative | null {
  if (!recommendation?.details) {
    return null;
  }
  return {
    bestFor: recommendation.details.best_for,
    notIdealFor: recommendation.details.not_ideal_for,
    examples: recommendation.details.examples,
    summary: recommendation.details.summary,
    recommendedContext: recommendation.details.recommended_context ?? null,
    maxTestedContext: recommendation.details.max_tested_context ?? null,
    contextWindowNote: recommendation.details.context_window_note ?? null
  };
}
