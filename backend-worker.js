"use strict";

const os = require("node:os");
const { buildLocalSummary } = require("./backend-summary");
const { createId } = require("./backend-storage");

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_RETRY_BASE_MS = 1_000;

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function isDue(value, now) {
  if (!value) return true;
  const timestamp = Date.parse(String(value));
  return !Number.isFinite(timestamp) || timestamp <= now;
}

function isLeaseAvailable(job, now) {
  return !job.leaseExpiresAt || isDue(job.leaseExpiresAt, now);
}

function workerJobStatus(job) {
  const cards = Array.isArray(job.cards) ? job.cards : [];
  if (!cards.length) return "needs-attention";
  if (cards.every((card) => card.status === "analyzed" || card.status === "copied" || card.status === "skipped")) return "review-required";
  if (cards.some((card) => card.status === "retry-wait")) return "retry-wait";
  if (cards.some((card) => card.status === "failed" || card.status === "blocked")) return "needs-attention";
  if (cards.some((card) => card.status === "running")) return "running";
  return "queued";
}

function workerEvent(type, payload, createdAt = nowIso()) {
  return {
    id: createId("event"),
    type,
    payload,
    createdAt,
    updatedAt: createdAt
  };
}

async function processDueReminders(store, options = {}) {
  const now = Number(options.now || Date.now());
  const reminders = await store.list("reminders");
  const due = reminders.filter((item) => item.status === "scheduled" && isDue(item.dueAt, now));
  if (due.length) await store.transaction((state) => {
    for (const reminder of due) {
      state.notifications.unshift({
      id: createId("notification"),
      userId: reminder.userId,
      workspaceId: reminder.workspaceId,
      reminderId: reminder.id,
      channel: "in-app",
      status: "unread",
      title: reminder.title || "Summarize This reminder",
      message: reminder.message,
        createdAt: nowIso(now),
        updatedAt: nowIso(now)
      });
      const storedReminder = state.reminders.find((item) => item.id === reminder.id);
      if (storedReminder) {
        storedReminder.status = "triggered";
        storedReminder.triggeredAt = nowIso(now);
        storedReminder.updatedAt = nowIso(now);
      }
      state.events.unshift(workerEvent("reminder.triggered", { userId: reminder.userId, reminderId: reminder.id, channel: "in-app" }, nowIso(now)));
    }
    state.notifications = state.notifications.slice(0, 1000);
    state.events = state.events.slice(0, 500);
    return { processed: due.length };
  });
  return { processed: due.length };
}

async function processNextBatchJob(store, options = {}) {
  const now = Number(options.now || Date.now());
  const workerId = String(options.workerId || `${os.hostname()}:${process.pid}`);
  const processor = options.processor || ((card) => buildLocalSummary(card.inputText, { source: "explicit batch card text" }));
  const jobs = await store.list("batchJobs");
  const job = jobs
    .filter((item) => item.executionMode === "local-worker" && item.executionApproved && ["queued", "retry-wait"].includes(item.status) && isDue(item.nextAttemptAt, now) && isLeaseAvailable(item, now))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
  if (!job) return { processed: false, reason: "no-eligible-job" };

  job.status = "running";
  job.workerId = workerId;
  job.leaseExpiresAt = nowIso(now + Number(options.leaseMs || DEFAULT_LEASE_MS));
  job.startedAt = job.startedAt || nowIso(now);
  job.updatedAt = nowIso(now);
  await store.transaction((state) => {
    const storedJob = state.batchJobs.find((item) => item.id === job.id);
    Object.assign(storedJob, job);
    state.events.unshift(workerEvent("worker.job_leased", { userId: job.userId, jobId: job.id, workerId }, nowIso(now)));
    state.events = state.events.slice(0, 500);
  });

  const maxAttempts = Math.max(1, Math.min(5, Number(job.maxAttempts || 3)));
  const retryBaseMs = Math.max(100, Number(options.retryBaseMs || DEFAULT_RETRY_BASE_MS));
  for (const card of job.cards || []) {
    if (!["pending", "queued", "retry-wait", "failed"].includes(card.status) || !isDue(card.nextAttemptAt, now)) continue;
    if (String(card.inputText || "").trim().length < 50) {
      card.status = "blocked";
      card.error = "Explicit source text is required; the worker does not fetch Trello card content.";
      card.updatedAt = nowIso(now);
      continue;
    }
    card.status = "running";
    card.attempts = Number(card.attempts || 0) + 1;
    card.updatedAt = nowIso(now);
    try {
      card.result = await processor(card, job);
      card.status = "analyzed";
      card.error = null;
      card.nextAttemptAt = null;
      card.analyzedAt = nowIso(now);
    } catch (error) {
      card.error = String(error && error.message || "Worker processing failed").slice(0, 500);
      if (card.attempts >= maxAttempts) {
        card.status = "failed";
        card.nextAttemptAt = null;
      } else {
        card.status = "retry-wait";
        card.nextAttemptAt = nowIso(now + retryBaseMs * Math.pow(2, card.attempts - 1));
      }
    }
    card.updatedAt = nowIso(now);
  }

  job.status = workerJobStatus(job);
  job.nextAttemptAt = (job.cards || []).filter((card) => card.status === "retry-wait").map((card) => card.nextAttemptAt).sort()[0] || null;
  job.leaseExpiresAt = null;
  job.workerId = null;
  job.updatedAt = nowIso(now);
  if (["review-required", "needs-attention"].includes(job.status)) job.finishedAt = nowIso(now);
  await store.transaction((state) => {
    const storedJob = state.batchJobs.find((item) => item.id === job.id);
    Object.assign(storedJob, job);
    state.events.unshift(workerEvent("worker.job_processed", { userId: job.userId, jobId: job.id, status: job.status }, nowIso(now)));
    state.events = state.events.slice(0, 500);
  });
  return { processed: true, job };
}

async function processWorkerCycle(store, options = {}) {
  const reminders = await processDueReminders(store, options);
  const batch = await processNextBatchJob(store, options);
  return { reminders, batch };
}

module.exports = {
  processDueReminders,
  processNextBatchJob,
  processWorkerCycle,
  workerJobStatus
};
