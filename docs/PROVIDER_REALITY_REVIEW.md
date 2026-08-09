# Provider Reality Review

Date: 2026-07-23 (Phase 012)

## Configured Providers

### OpenAI
- **Models:** gpt-4o, gpt-4o-mini
- **Status:** Implemented in `ai-providers.js`. Requires `OPENAI_API_KEY`.
- **Account required:** Yes — https://platform.openai.com
- **Billing:** Per-token. The Power-Up retains provider-reported token use; it does not infer a monetary amount from a hardcoded rate table. Cost records require an explicitly trusted cost feed.
- **Limitations:** Rate limits apply. No image content from card attachments.

### Anthropic
- **Models:** claude-3-5-sonnet, claude-3-haiku
- **Status:** Implemented. Requires `ANTHROPIC_API_KEY`.
- **Account required:** Yes — https://console.anthropic.com
- **Billing:** Per-token.

### Google AI (Gemini)
- **Models:** gemini-1.5-flash, gemini-1.5-pro
- **Status:** Implemented. Requires `GOOGLE_API_KEY`.
- **Account required:** Yes — https://aistudio.google.com
- **Billing:** Free tier available; paid tier for higher quotas.

### Cloudflare Worker Proxy
- **Status:** Reference implementation in `proxy/cloudflare-worker.mjs`.
- **Account required:** Yes — Cloudflare account + Workers plan.
- **Deployment:** `npx wrangler deploy` from `proxy/` directory.

### Local Rule-Based (Built-In)
- **Status:** Always available. No external account required.
- **Output quality:** Structural summary from card metadata only. Not AI-generated.
- **Labeled as:** "Local rules" in all output metadata and popup UI.

## Fallback Chain

```
User selects provider
  → Direct provider call
  → If fails: proxy call (if configured)
  → If fails or no keys: local rule-based analysis
```

## Honesty Constraints

- The local rule-based analysis is always labeled "Local rules" — never presented as AI output.
- Provider errors are displayed with sanitized messages, not swallowed silently.
- Confidence is a heuristic quality signal, not a measured accuracy percentage.
- No provider is presented as available when it is not configured.

## Account Readiness Status (Current)

| Provider | Keys Configured | Verified Live |
|---|---|---|
| OpenAI | No (requires user config) | Not verified |
| Anthropic | No (requires user config) | Not verified |
| Google AI | No (requires user config) | Not verified |
| Proxy | No (requires deployment) | Not verified |
| Local rules | Always available | Verified in test suite |
