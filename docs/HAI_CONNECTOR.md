# HAI Connector

Summarize This exposes a disabled-by-default, read-only JSON feed for HAI. The feed contains only summaries that a signed-in user explicitly reviewed, saved, and approved for HAI.

## Security Boundary

- Each user has a separate capability URL. The database stores only its HMAC hash.
- Generating a new URL immediately revokes the previous URL.
- Revocation is available from Power-Up settings.
- Unapproved summaries, original card text, API keys, backend sessions, and other users' records are never returned.
- Trello source links are restricted to `https://trello.com/c/...`; query strings and fragments are removed.
- The connector is read-only. It cannot change Trello, execute HAI work, or bypass HAI review and approval controls.
- Rotating/revoking the capability URL or withdrawing summary approval blocks future reads. It does not remotely erase records HAI has already imported; review and remove those separately through HAI's owner-authorized controls when needed.

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

For Robert's Hetzner-hosted backend (the current hosting target):

1. Complete the deployment and data acceptance checks in [Hetzner deployment](HETZNER_DEPLOYMENT.md).
2. Use `https://<APP_DOMAIN>/api` as the Power-Up backend API base and sign in to that backend.
3. Generate the capability URL there so it uses the public HTTPS hostname, not a Windows loopback URL.
4. Add only that API hostname, without a scheme or path, to HAI's `CONNECTED_SOURCE_HTTP_ALLOWED_HOSTS`. Preserve existing allowed hosts for unrelated connected sources; do not use a wildcard or relax private-address checks.
5. Under the HAI owner's authenticated session, create the `json-feed` source and run its normal reviewed sync. Verify record counts, exact reviewed text, project assignment and cursor behavior before retiring the old tunnel.

A hosted HAI instance cannot reach a backend at `127.0.0.1` on Robert's PC: loopback refers to the HAI host itself. Use the public Hetzner hostname for this cross-host integration. The Trello connector iframe remains on its existing static host.

For an optional legacy Windows host reached through ngrok (not required for Hetzner):

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

The format targets both HAI ingestion paths. `provider` and `itemType` use HAI account-feed enum values; optional metadata is omitted because HAI's Connected Sources and account-feed parsers use different metadata representations. HAI Connected Sources advances `nextCursor`, while the account-feed envelope reads `cursor`, so both names carry the same opaque approval-order/ID value. A cursor-free request starts with the oldest approved page; subsequent requests use the last delivered record's cursor. The source-level check below covers decoding compatibility, not complete hosted ingestion.

New approvals use a strictly increasing logical timestamp for cursor ordering, allocated in the same store transaction as approval. The persisted high-water mark survives removal of old summaries and a backend restart. `receivedAt` remains the actual wall-clock approval time; do not infer real event times from the cursor. Existing records without a logical timestamp retain their legacy approval-time cursor until reapproved. Repeating an already-active approval does not republish unchanged content; revoking and then reapproving allocates a new cursor.

## Verify Against HAI Source

With Docker running, the local `golang:1.25.13` image already available, and a checkout of HAI's backend, run:

```powershell
node tools/verify-hai-consumers.js "C:\path\to\HAI\backend"
```

The verifier runs the real Summarize This HTTP E2E scenario against an isolated local store, captures only synthetic approved feed records and an empty continuation page, and checks them against HAI's actual account-feed parser and Connected Sources JSON types. It extracts Go declarations using Go's AST, rather than recreating the parser in JavaScript. The account-feed operation-conversion functions are outside this probe and are omitted from the extracted package.

Only four HAI source files are copied to temporary staging, and their SHA-256 values are reported. The HAI checkout is not edited. The consumer check runs in a bounded container with networking disabled; no source is created in HAI, no credentials are supplied, and temporary files/container are cleaned up. This is an opt-in cross-repository check, not part of the default suite, which cannot assume another private checkout exists.

Passing it proves parser/schema compatibility for these synthetic cases, not HAI HTTP allowlisting, source normalization, database import, operational review, deletion propagation, or live connectivity. Those require the owner-authorized hosted acceptance run.
