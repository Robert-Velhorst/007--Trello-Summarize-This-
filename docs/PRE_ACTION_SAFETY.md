# Pre-Action Safety Review Screen

Date: 2026-07-23 (Phase 062)

## Safety Review Design

1. **Comment Post Approval:** Before any comment is posted to a Trello card, the UI presents a preview of the comment draft along with an explicit checkbox: `"I have reviewed this draft and approve posting it to the card."`
2. **Sensitive Card Warning:** If `detectSensitiveSignals()` flags the card as containing sensitive categories (financial, legal, client PII), a visual warning header is displayed before sending context to an AI provider.
3. **Budget Warning:** If projected provider spend exceeds budget limits, a confirmation warning is displayed prior to provider invocation.
4. **Ambiguous Comment Outcome:** If the Trello request could have been sent but no success response is confirmed, the exact draft is marked ambiguous in member-private storage and cannot be reposted until the user verifies the card manually.
