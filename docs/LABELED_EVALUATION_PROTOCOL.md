# Labeled Evaluation Protocol

Date: 2026-07-30

## Purpose

`tools/evaluate-labeled-summaries.js` evaluates independently reviewed, labeled summary examples. It reports deterministic phrase coverage, forbidden-phrase violations, and review-signal agreement. It does **not** calculate or claim model accuracy, semantic correctness, or production quality by itself.

## Input

Use JSON with `schemaVersion: "summarize-this-labeled-evaluation-v1"` and one or more cases:

```json
{
  "schemaVersion": "summarize-this-labeled-evaluation-v1",
  "cases": [{
    "id": "opaque-case-id",
    "expected": {
      "requiredPhrases": ["approved owner"],
      "forbiddenPhrases": ["deployment completed"],
      "reviewRequired": true
    },
    "output": {
      "about": "...",
      "nextActions": ["..."],
      "reviewRequired": true
    }
  }]
}
```

Do not place sensitive card content in a fixture committed to the repository. Use opaque IDs and run private evaluation data locally or in an approved secure environment.

## Run

```bash
node tools/evaluate-labeled-summaries.js /secure/path/labeled-cases.json
```

The checked-in `fixtures/labeled-evaluation.synthetic.json` exists only to test the harness. It is synthetic and is not evidence of product performance.

## Before Making Any Evaluation Claim

1. Define representative card categories and risk levels.
2. Obtain independent human labels and document labeler instructions.
3. Separate development, tuning, and held-out evaluation sets.
4. Review every forbidden-phrase violation and disagreement, not only aggregate values.
5. Record provider/model, prompt version, date, sample size, exclusions, and limitations.
6. Have a responsible human approve any public statement derived from the evaluation.

Until those steps are complete, confidence remains a review signal—not measured accuracy evidence.
