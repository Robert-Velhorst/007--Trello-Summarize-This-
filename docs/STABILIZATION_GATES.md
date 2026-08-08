# Progressive Stabilization Gates

Date: 2026-07-23 (Phase 089)

## Stabilization Gate Ladder

1. **Gate 1 (Core Contracts):** `node test.js` passes (normalizer, prompt builder, popup contract).
2. **Gate 2 (Backend Contracts):** `node backend.test.js` passes (auth, endpoints, readiness).
3. **Gate 3 (Security & Adversarial):** `node adversarial.test.js` passes (path traversal, XSS, isolation, provider failures).
4. **Gate 4 (Diagnostics):** `node doctor.js` passes its current required-file and operations checks.
5. **Gate 5 (Documentation Integrity):** `docs/` directory complete, zero overclaiming.
