"use strict";

const os = require("node:os");

function sanitizeEvent(event) {
  const payload = event && event.payload || {};
  return {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    payload: {
      jobId: payload.jobId,
      cardId: payload.cardId,
      summaryId: payload.summaryId,
      status: payload.status,
      reason: payload.reason,
      providerMode: payload.providerMode
    }
  };
}

async function buildSupportBundle(store, readiness) {
  const snapshot = await store.snapshot();
  const schema = await store.schemaInfo();
  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpus: os.cpus().length,
      memoryBytes: os.totalmem()
    },
    schema,
    readiness,
    counts: {
      users: snapshot.users.length,
      workspaces: snapshot.workspaces.length,
      summaries: snapshot.summaries.length,
      batchJobs: snapshot.batchJobs.length,
      reminders: snapshot.reminders.length,
      notifications: snapshot.notifications.length,
      openAlerts: snapshot.systemAlerts.filter((item) => !item.acknowledged).length
    },
    recentEvents: snapshot.events.slice(0, 50).map(sanitizeEvent),
    privacy: "Credentials, session tokens, user identities, source text, summaries, and card contents are excluded."
  };
}

module.exports = { buildSupportBundle };
