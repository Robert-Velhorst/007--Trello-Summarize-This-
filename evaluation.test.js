"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { evaluateLabeledDataset, SCHEMA_VERSION } = require("./tools/evaluate-labeled-summaries");

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "labeled-evaluation.synthetic.json"), "utf8"));
const report = evaluateLabeledDataset(fixture);

assert.equal(report.schemaVersion, "summarize-this-labeled-evaluation-report-v1");
assert.equal(report.evaluatedCases, 2);
assert.equal(report.metrics.requiredPhraseCount, 3);
assert.equal(report.metrics.requiredPhraseMatches, 3);
assert.equal(report.metrics.requiredPhraseCoveragePercent, 100);
assert.equal(report.metrics.forbiddenPhraseViolations, 0);
assert.equal(report.metrics.reviewSignalCases, 2);
assert.equal(report.metrics.reviewSignalAgreementPercent, 50);
assert.match(report.limitations.join(" "), /not a semantic correctness or model-accuracy measurement/i);
assert.throws(() => evaluateLabeledDataset({ schemaVersion: SCHEMA_VERSION, cases: [] }), /at least one labeled case/i);

console.log("Labeled evaluation tests passed.");
