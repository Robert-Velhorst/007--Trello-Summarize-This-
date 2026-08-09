// Shared Trello Power-Up runtime configuration.
// Trello app keys are public identifiers. Keeping the value in one place
// prevents drift across connector, popup, and authorization flows.

(function (root) {
  "use strict";

  var existing = root.SummarizeThisTrelloConfig || {};
  var appKey = typeof existing.appKey === "string"
    ? existing.appKey.trim()
    : "710f51778ec3e0eff7be947779695aed";
  var appName = typeof existing.appName === "string" && existing.appName.trim()
    ? existing.appName.trim()
    : "Summarize This";

  root.SummarizeThisTrelloConfig = {
    appKey: appKey,
    appName: appName
  };
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this)));
