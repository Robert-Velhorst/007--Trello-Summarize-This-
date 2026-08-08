"use strict";

function summarizeText(input, maxCharacters = 180) {
  const normalized = String(input || "").replace(/\s+/g, " ").trim();
  const limit = Math.max(80, Math.min(2000, Number(maxCharacters || 180)));
  const short = normalized.slice(0, limit);
  return short.length < normalized.length ? `${short}...` : short;
}

function buildLocalSummary(input, metadata = {}) {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  if (text.length < 50) {
    const error = new Error("At least 50 characters of explicit source text are required for local summarization.");
    error.code = "SOURCE_TEXT_TOO_SHORT";
    throw error;
  }
  const summary = summarizeText(text, metadata.maxCharacters || 180);
  return {
    summary,
    providerMode: "local",
    confidence: 0.65,
    heuristicConfidence: 0.65,
    measuredEvaluation: null,
    evidence: {
      facts: [{ claim: summary, source: metadata.source || "explicit submitted text" }],
      inferences: [],
      uncertainty: ["This deterministic excerpt does not validate completeness, context, or correctness."],
      unsupportedClaims: []
    },
    guardrails: {
      mode: "local",
      localFallback: true,
      valid: true,
      limitation: "Deterministic local summary only; review the source before acting."
    }
  };
}

module.exports = { buildLocalSummary, summarizeText };
