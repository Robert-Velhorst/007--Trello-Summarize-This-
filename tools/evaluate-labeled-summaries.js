"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = "summarize-this-labeled-evaluation-v1";

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function asStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function outputText(output) {
  if (typeof output === "string") return normalizedText(output);
  if (!output || typeof output !== "object") return "";
  const values = [];
  ["about", "currentStatus", "history", "summary", "text"].forEach((key) => {
    if (output[key] !== undefined) values.push(output[key]);
  });
  ["nextActions", "blockers", "waitingOn", "unclearPoints", "unresolvedQuestions"].forEach((key) => {
    if (!Array.isArray(output[key])) return;
    output[key].forEach((item) => values.push(item && typeof item === "object" ? (item.text || item.claim || "") : item));
  });
  return normalizedText(values.join("\n"));
}

function evaluateCase(item) {
  if (!item || typeof item !== "object") throw new Error("Each evaluation case must be an object.");
  const expected = item.expected && typeof item.expected === "object" ? item.expected : {};
  const actualText = outputText(item.output);
  const requiredPhrases = asStringList(expected.requiredPhrases);
  const forbiddenPhrases = asStringList(expected.forbiddenPhrases);
  const matchedRequired = requiredPhrases.filter((phrase) => actualText.includes(normalizedText(phrase)));
  const matchedForbidden = forbiddenPhrases.filter((phrase) => actualText.includes(normalizedText(phrase)));
  const expectedReview = typeof expected.reviewRequired === "boolean" ? expected.reviewRequired : null;
  const actualReview = item.output && typeof item.output === "object" && typeof item.output.reviewRequired === "boolean"
    ? item.output.reviewRequired
    : null;

  return {
    id: String(item.id || "").trim() || "unnamed-case",
    requiredPhrases: requiredPhrases.length,
    matchedRequired: matchedRequired.length,
    unmatchedRequired: requiredPhrases.filter((phrase) => !matchedRequired.includes(phrase)),
    forbiddenPhrases: forbiddenPhrases.length,
    forbiddenMatches: matchedForbidden,
    reviewSignalEvaluated: expectedReview !== null && actualReview !== null,
    reviewSignalMatched: expectedReview !== null && actualReview !== null ? expectedReview === actualReview : null
  };
}

function percent(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

function evaluateLabeledDataset(dataset) {
  if (!dataset || typeof dataset !== "object") throw new Error("Evaluation input must be a JSON object.");
  if (dataset.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Expected schemaVersion \"${SCHEMA_VERSION}\".`);
  }
  const cases = Array.isArray(dataset.cases) ? dataset.cases : [];
  if (!cases.length) throw new Error("Evaluation input must contain at least one labeled case.");
  const caseResults = cases.map(evaluateCase);
  const requiredTotal = caseResults.reduce((sum, item) => sum + item.requiredPhrases, 0);
  const requiredMatched = caseResults.reduce((sum, item) => sum + item.matchedRequired, 0);
  const forbiddenTotal = caseResults.reduce((sum, item) => sum + item.forbiddenPhrases, 0);
  const forbiddenViolations = caseResults.reduce((sum, item) => sum + item.forbiddenMatches.length, 0);
  const reviewEvaluated = caseResults.filter((item) => item.reviewSignalEvaluated);
  const reviewMatched = reviewEvaluated.filter((item) => item.reviewSignalMatched).length;

  return {
    schemaVersion: "summarize-this-labeled-evaluation-report-v1",
    evaluatedCases: caseResults.length,
    metrics: {
      requiredPhraseCoveragePercent: percent(requiredMatched, requiredTotal),
      requiredPhraseCount: requiredTotal,
      requiredPhraseMatches: requiredMatched,
      forbiddenPhraseViolationRatePercent: percent(forbiddenViolations, forbiddenTotal),
      forbiddenPhraseCount: forbiddenTotal,
      forbiddenPhraseViolations: forbiddenViolations,
      reviewSignalAgreementPercent: percent(reviewMatched, reviewEvaluated.length),
      reviewSignalCases: reviewEvaluated.length
    },
    limitations: [
      "These are deterministic phrase-coverage and review-signal checks, not a semantic correctness or model-accuracy measurement.",
      "Only independently reviewed, representative labeled cases can support a production evaluation claim.",
      "Do not convert this report into an accuracy percentage without a documented evaluation design and human review."
    ],
    cases: caseResults
  };
}

function readDataset(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: node tools/evaluate-labeled-summaries.js <labeled-cases.json>");
  }
  process.stdout.write(`${JSON.stringify(evaluateLabeledDataset(readDataset(inputPath)), null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Evaluation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SCHEMA_VERSION,
  evaluateLabeledDataset,
  evaluateCase,
  outputText
};
