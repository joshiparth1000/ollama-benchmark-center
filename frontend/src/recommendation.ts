import type { Recommendation } from "./api";

export type RecommendationNarrative = {
  bestFor: string;
  notIdealFor: string[];
  examples: Array<{ task: string; fit: string; why: string }>;
  summary: string;
};

export function getRecommendationNarrative(recommendation: Recommendation | undefined): RecommendationNarrative | null {
  if (!recommendation?.details) {
    return null;
  }
  return {
    bestFor: recommendation.details.best_for,
    notIdealFor: recommendation.details.not_ideal_for,
    examples: recommendation.details.examples,
    summary: recommendation.details.summary
  };
}
