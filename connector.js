// Summarize This Trello Power-Up connector.
// Defines the card button, settings popup, and lightweight status badge.

/* global TrelloPowerUp */

(function () {
  "use strict";

  var BUILD_ID = "20260814.1";
  var POPUP_URL = "./popup.html?v=" + BUILD_ID;
  var SETTINGS_URL = "./settings-powerup.html?v=" + BUILD_ID;
  var ICON_URL = "./icon.svg?v=" + BUILD_ID;
  var AUTHORIZE_URL = "./authorize.html?v=" + BUILD_ID;
  var DEFAULT_APP_NAME = "Summarize This";

  function runtimeConfig() {
    var root = typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this);
    var config = root && root.SummarizeThisTrelloConfig ? root.SummarizeThisTrelloConfig : {};
    var appKey = typeof config.appKey === "string" ? config.appKey.trim() : "";
    var appName = typeof config.appName === "string" && config.appName.trim()
      ? config.appName.trim()
      : DEFAULT_APP_NAME;

    return {
      appKey: appKey,
      appName: appName,
      hasAppKey: Boolean(appKey)
    };
  }

  function initializeOptions() {
    var config = runtimeConfig();
    var options = {
      appName: config.appName
    };

    if (config.hasAppKey) {
      options.appKey = config.appKey;
    }

    return options;
  }

  function hasAnyKey(settings) {
    var keys = settings && settings.apiKeys ? settings.apiKeys : {};
    return Boolean(keys.openai || keys.anthropic || keys.google);
  }

  function hasUsableProxy(settings) {
    var proxy = settings && settings.proxy ? settings.proxy : {};
    return Boolean(proxy.enabled && proxy.endpoint);
  }

  function canAnalyze(settings) {
    return settings && (settings.analysisMode === "local" || hasAnyKey(settings) || hasUsableProxy(settings));
  }

  function loadSettings(t) {
    return t.get("member", "private", "summarizeThisSettings")
      .then(function (settings) {
        return settings || {};
      })
      .catch(function () {
        return {};
      });
  }

  function readPrivateObject(t, key, fallback) {
    return t.get("member", "private", key)
      .then(function (value) {
        return value || fallback;
      })
      .catch(function () {
        return fallback;
      });
  }

  function readCurrentCardId(t) {
    if (!t || typeof t.card !== "function") {
      return Promise.resolve("");
    }

    return t.card("id")
      .then(function (card) {
        return card && card.id ? card.id : "";
      })
      .catch(function () {
        return "";
      });
  }

  function latestRunForCard(historyByCard, cardId) {
    var runs = historyByCard && cardId ? historyByCard[cardId] : null;
    return Array.isArray(runs) && runs.length ? runs[0] : null;
  }

  function badgeForRun(run) {
    if (!run) {
      return {
        text: "Summary ready",
        color: "green"
      };
    }

    if (run.status && run.status !== "completed") {
      return {
        text: "Analysis failed",
        color: "red"
      };
    }

    var confidence = run.result && run.result.confidence ? run.result.confidence : {};
    var overall = Number(confidence.overall);
    if (confidence.reviewNeeded) {
      return {
        text: "Review needed",
        color: "yellow"
      };
    }

    if (Number.isFinite(overall) && overall > 0) {
      return {
        text: Math.round(overall) + "% confidence",
        color: overall >= 70 ? "green" : "yellow"
      };
    }

    return {
      text: "Analyzed",
      color: "green"
    };
  }

  TrelloPowerUp.initialize({
    "card-buttons": function (t) {
      try {
        return [{
          icon: ICON_URL,
          text: "Summarize This",
          callback: function (t) {
            return t.popup({
              title: "Summarize This",
              url: POPUP_URL,
              height: 720
            });
          }
        }];
      } catch (_error) {
        return [];
      }
    },

    "card-detail-badges": function (t) {
      var fallbackBadge = [{ text: "Summarize This", color: "light-gray", refresh: 300 }];

      try {
        return loadSettings(t).then(function (settings) {
          var ready = canAnalyze(settings);
          if (!ready) {
            return [{
              text: "Setup needed",
              color: "yellow",
              refresh: 300
            }];
          }

          return readCurrentCardId(t)
            .then(function (cardId) {
              if (!cardId) return null;
              return readPrivateObject(t, "summarizeThisLedgerHistory", {})
                .then(function (historyByCard) {
                  return latestRunForCard(historyByCard, cardId);
                });
            })
            .then(function (run) {
              var badge = badgeForRun(run);
              return [{
                text: badge.text,
                color: badge.color,
                refresh: 300
              }];
            });
        }).catch(function () {
          return fallbackBadge;
        });
      } catch (_error) {
        return fallbackBadge;
      }
    },

    "show-settings": function (t) {
      return t.popup({
        title: "Summarize This Settings",
          url: SETTINGS_URL,
        height: 620
      });
    },

    "authorization-status": function (t) {
      if (!runtimeConfig().hasAppKey || !t || typeof t.getRestApi !== "function") {
        return Promise.resolve({ authorized: false });
      }

      return Promise.resolve(t.getRestApi()).then(function (rest) {
        if (!rest || typeof rest.getToken !== "function") {
          return { authorized: false };
        }

        return Promise.resolve(rest.getToken()).then(function (token) {
          return { authorized: Boolean(token) };
        });
      }).catch(function () {
        return { authorized: false };
      });
    },

    "show-authorization": function (t) {
      return t.popup({
        title: "Authorize Summarize this",
        url: AUTHORIZE_URL,
        height: 620
      });
    }
  }, initializeOptions());
})();
