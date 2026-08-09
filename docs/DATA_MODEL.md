# Data Model, Ownership, and Persistence Design

Date: 2026-07-23 (Phase 005)

## Data Model

### Trello Card (input — read-only)

| Field | Source | Notes |
|---|---|---|
| id | Trello API | Unique card identifier |
| name | Trello API | Card title |
| desc | Trello API | Card description |
| due / dueComplete | Trello API | Due date and completion status |
| labels | Trello API | Array of {name, color} |
| members | Trello API | Array of {fullName, id} |
| checklists | Trello API | Array of {name, checkItems[]} |
| attachments | Trello API | Array of {name, mimeType, url} |
| actions (comments/activity) | Trello API | Array of {type, data, date, memberCreator} |
| customFieldItems | Trello API | Array of {name, value} |
| listContext.cards | Trello API | Sampled neighboring cards (bounded) |

### Analysis Run (private ledger — member-private Trello storage)

```
{
  runId: string,
  cardId: string,
  cardTitle: string,
  timestamp: ISO8601 string,
  provider: string,
  model: string,
  outputMode: string,
  outputLanguage: string,
  qualityScore: number (0-100),
  summary: { about, status, history, nextSteps, insights, risks, recommendations },
  evidence: [...],
  reviewState: "pending" | "approved" | "rejected",
  feedbackRating: "correct" | "wrong" | null,
  correctionText: string | null,
  exportedAt: ISO8601 string | null,
  costRecord: { provider, model, tokens, cost, createdAt } | null,
  timingRecord: { phases[], totalMs, createdAt } | null
}
```

### Settings (member-private Trello storage)

```
{
  provider: string,
  apiKeys: { openai, anthropic, google } — stored locally, never transmitted to server,
  proxy: { enabled, endpoint },
  analysisMode: "auto" | "local" | "consensus",
  outputMode: string,
  outputLanguage: "en" | "nl",
  maxOutputTokens: number,
  defaultCopyFormat: string,
  budget: { warningPercent, providerMonthlyLimits },
  promptTemplates: [...],
  selectedPromptTemplateId: string | null,
  customInstructions: string,
  promptContext: { commentLimit, listContextEnabled },
  extractTextAttachments: boolean,
  requireSensitiveAiApproval: boolean
}
```

### Backend User (local JSON runtime store — not production persistence)

```
{
  id: UUID,
  email: string,
  passwordHash: string (asynchronous scrypt hash),
  passwordSalt: string,
  workspaceId: string,
  name: string,
  role: "user" | "admin",
  credits: number,
  suspended: boolean,
  createdAt: ISO8601
}
```

### Workspace And Operations

`workspaces` have one owner and `memberships` assign `owner`, `editor`, or `viewer`. Summaries, jobs, reminders, notifications, and local analytics carry `userId` and `workspaceId`. Batch jobs also retain execution mode, explicit approval, retry/lease metadata, and bounded card attempts. Store metadata records schema version and applied migrations.

## Ownership Model

| Data | Owner | Access |
|---|---|---|
| Card context | Trello (read-only) | Power-Up reads; never writes without approval |
| Settings | Member-private (Trello) | Only the individual Trello member can read/write |
| Ledger history | Member-private (Trello) | Only the individual Trello member can read/write |
| Export records | Member-private (Trello) | Only the individual Trello member can read/write |
| Backend users | Local JSON runtime store | Server-side; isolated per session; unsuitable for production deployment |
| Backend credits | Local JSON runtime store | Per-user; not shared; not payment-provider reconciled |
| Workspace summaries | Local JSON runtime store | Readable only by current workspace members; membership changes are owner-controlled |

## Persistence

| Data | Persistence | Notes |
|---|---|---|
| Settings | Trello member-private storage | Survives browser restarts |
| Ledger history | Trello member-private storage | Survives browser restarts |
| Backend state | Local JSON runtime file | Survives restart; serialized writes plus an exclusive runtime lock prevent multi-process overwrite |
| Local backups | Private `backups/` directory | SHA-256 verified, schema validated, newest 20 retained; not offsite DR |
| AI provider keys | Trello member-private storage | Never sent to any server by default |
