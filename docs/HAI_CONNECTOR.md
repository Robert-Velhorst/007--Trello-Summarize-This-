# HAI Connector

Summarize This exposes a disabled-by-default, read-only JSON feed for HAI. The feed contains only summaries that a signed-in user explicitly reviewed, saved, and approved for HAI.

## Security Boundary

- Each user has a separate capability URL. The database stores only its HMAC hash.
- Generating a new URL immediately revokes the previous URL.
- Revocation is available from Power-Up settings.
- Unapproved summaries, original card text, API keys, backend sessions, and other users' records are never returned.
- Trello source links are restricted to `https://trello.com/c/...`; query strings and fragments are removed.
- The connector is read-only. It cannot change Trello, execute HAI work, or bypass HAI review and approval controls.

## Enable the Backend

Set `HAI_CONNECTOR_ENABLED=true` for a server deployment. The Windows installer enables the connector for its private loopback backend.

In Power-Up settings:

1. Set the backend API base. The Windows app prefers `http://127.0.0.1:18787/api`; when that port is occupied, its launcher selects a safe fallback and opens the UI with the effective API base.
2. Create an account or sign in.
3. Select **Generate or rotate URL**.
4. Copy the URL once and store it as a secret.
5. On a card result, review the exact summary, select the backend-save approval, optionally select the HAI approval, and save.

## Connect HAI

Create an owner-scoped HAI connected source with connector key `json-feed` and use the generated capability URL as `syncTarget`.

For a Windows host reached through ngrok:

1. Open **Configure ngrok domain** once and save the reserved HTTPS domain, then start **Share Backend with ngrok** from the Summarize This Start menu folder.
2. Use the ngrok HTTPS hostname in the Power-Up backend API base, followed by `/api`.
3. Generate a new HAI connector URL so it uses that HTTPS hostname.
4. Add only the ngrok hostname to HAI's `CONNECTED_SOURCE_HTTP_ALLOWED_HOSTS` setting.
5. Create the `json-feed` source in HAI and run its normal reviewed sync.

HAI app authorization remains authoritative. Summarize This deliberately does not reuse, request, or store an HAI login token to create the source silently.

## Feed Contract

The endpoint returns:

```json
{
  "items": [
    {
      "externalId": "summarize-this:summary-id",
      "title": "Reviewed Trello summary",
      "content": "Exact reviewed summary text",
      "sourceUri": "https://trello.com/c/card-id/card-name",
      "itemType": "card",
      "provider": "trello",
      "accountLabel": "summarize-this",
      "projectKey": "trello-summaries",
      "receivedAt": "2026-08-09T00:00:00.000Z"
    }
  ],
  "cursor": "approval-time|summary-id",
  "nextCursor": "approval-time|summary-id"
}
```

The contract is accepted by both HAI JSON readers. `provider` and `itemType` use HAI account-feed enum values; optional metadata is omitted because HAI's Connected Sources and account-feed parsers use different metadata representations. HAI Connected Sources advances `nextCursor`, while the account-feed envelope reads `cursor`, so both names carry the same stable approval-time value. A cursor-free request starts with the oldest approved page and subsequent requests receive every later page without gaps.
