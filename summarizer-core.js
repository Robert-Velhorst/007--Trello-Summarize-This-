// Shared summarization helpers for the Trello Power-Up and Node tests.

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SummarizeThis = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STOP_WORDS = {
    a: true, an: true, and: true, are: true, as: true, at: true, be: true,
    by: true, for: true, from: true, has: true, have: true, in: true,
    into: true, is: true, it: true, of: true, on: true, or: true, that: true,
    the: true, this: true, to: true, with: true, we: true, will: true
  };

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\s+/g, " ").trim();
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function truncate(value, maxLength) {
    var text = cleanText(value);
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1).trim() + ".";
  }

  function firstSentences(value, count) {
    var text = cleanText(value);
    if (!text) return "";
    var parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    return truncate(parts.slice(0, count).join(" "), 420);
  }

  function normalizeNamedItems(items) {
    return toArray(items).map(function (item) {
      if (typeof item === "string") return cleanText(item);
      return cleanText(item.name || item.fullName || item.username || item.color);
    }).filter(Boolean);
  }

  function normalizeComments(comments) {
    return toArray(comments).map(function (comment) {
      if (typeof comment === "string") {
        return { text: cleanText(comment) };
      }

      var data = comment.data || {};
      var creator = comment.memberCreator || {};
      return {
        text: cleanText(comment.text || data.text || comment.comment),
        date: comment.date || comment.createdAt || "",
        author: cleanText(creator.fullName || creator.username || comment.author)
      };
    }).filter(function (comment) {
      return comment.text;
    });
  }

  function normalizeActions(actions) {
    return toArray(actions).map(function (action, index) {
      if (typeof action === "string") {
        return {
          id: "activity-" + (index + 1),
          type: "activity",
          text: truncate(action, 220),
          date: "",
          author: ""
        };
      }

      var data = action.data || {};
      var creator = action.memberCreator || {};
      var type = cleanText(action.type || data.type || "activity");
      var text = cleanText(
        action.text ||
        data.text ||
        data.comment ||
        ((data.card && data.card.name) || "") ||
        action.summary ||
        action.name ||
        type
      );

      return {
        id: cleanText(action.id || "activity-" + (index + 1)),
        type: type,
        text: truncate(text, 220),
        date: action.date || action.createdAt || "",
        author: cleanText(creator.fullName || creator.username || action.author)
      };
    }).filter(function (action) {
      return action.text || action.type;
    }).slice(0, 25);
  }

  function getAttachmentExtension(attachment) {
    var source = cleanText((attachment && (attachment.name || attachment.url)) || attachment);
    var path = source.split("?")[0].split("#")[0];
    var match = /\.([a-z0-9]{1,8})$/i.exec(path);
    return match ? match[1].toLowerCase() : "";
  }

  function classifyAttachment(attachment) {
    var name = cleanText((attachment && attachment.name) || attachment).toLowerCase();
    var mime = cleanText(attachment && (attachment.mimeType || attachment.type)).toLowerCase();
    var extension = getAttachmentExtension(attachment);

    if (/transcript|captions?|subtitle|minutes|meeting notes/.test(name) || ["vtt", "srt", "txt"].indexOf(extension) !== -1) return "transcript";
    if (/recording|video|audio|zoom|meet|teams|loom|call/.test(name) || /^video\//.test(mime) || /^audio\//.test(mime) || ["mp4", "mov", "m4v", "webm", "mp3", "m4a", "wav", "aac"].indexOf(extension) !== -1) return "recording";
    if (/spreadsheet|excel|csv/.test(mime) || ["xls", "xlsx", "csv", "tsv"].indexOf(extension) !== -1) return "spreadsheet";
    if (/presentation|powerpoint/.test(mime) || ["ppt", "pptx", "key"].indexOf(extension) !== -1) return "presentation";
    if (/pdf|word|document|text/.test(mime) || ["pdf", "doc", "docx", "rtf", "md"].indexOf(extension) !== -1) return "document";
    if (/^image\//.test(mime) || ["png", "jpg", "jpeg", "gif", "webp", "svg"].indexOf(extension) !== -1) return "image";
    if (cleanText(attachment && attachment.url)) return "link";
    return "file";
  }

  function normalizeAttachments(attachments) {
    return toArray(attachments).map(function (attachment, index) {
      if (typeof attachment === "string") {
        attachment = { name: attachment };
      }
      var name = cleanText(attachment.name || "Attachment");
      var mimeType = cleanText(attachment.mimeType || attachment.type);
      var error = cleanText(attachment.error);
      var extractedText = cleanText(attachment.extractedText || attachment.text);
      var extractedTextAvailable = Boolean(extractedText);
      var processed = attachment.processed === true;
      var extractionStatus = cleanText(attachment.extractionStatus);
      var status = error ? "failed" : extractedTextAvailable ? "text-extracted" : extractionStatus || (processed ? "metadata-only" : "not-extracted");
      return {
        id: cleanText(attachment.id || "attachment-" + (index + 1)),
        name: truncate(name, 160),
        mimeType: mimeType,
        extension: getAttachmentExtension(attachment),
        category: classifyAttachment(attachment),
        bytes: toNumber(attachment.bytes || attachment.size),
        processed: processed,
        extractedTextAvailable: extractedTextAvailable,
        extractedTextPreview: truncate(extractedText, 700),
        status: status,
        error: error
      };
    }).filter(function (attachment) {
      return attachment.name;
    }).slice(0, 25);
  }

  function summarizeAttachmentCategories(attachments) {
    var counts = {};
    toArray(attachments).forEach(function (attachment) {
      var category = attachment.category || "file";
      counts[category] = (counts[category] || 0) + 1;
    });
    var parts = Object.keys(counts).sort().map(function (category) {
      return counts[category] + " " + category + (counts[category] === 1 ? "" : "s");
    });
    return parts.length ? parts.join(", ") : "no attachment metadata";
  }

  function compactAttachmentsForPrompt(attachments) {
    return toArray(attachments).slice(0, 12).map(function (attachment) {
      return {
        name: attachment.name,
        category: attachment.category,
        extension: attachment.extension,
        mimeType: attachment.mimeType,
        status: attachment.status,
        extractedTextAvailable: attachment.extractedTextAvailable,
        textPreview: attachment.extractedTextPreview,
        error: attachment.error
      };
    });
  }

  function listContextForPrompt(listContext) {
    if (!listContext || !listContext.sampledCards) return listContext || null;
    function compactCard(card) {
      return {
        id: cleanText(card.id),
        name: cleanText(card.name),
        labels: toArray(card.labels).map(cleanText).filter(Boolean).slice(0, 4),
        due: card.due || null,
        dueComplete: Boolean(card.dueComplete)
      };
    }
    return {
      enabled: listContext.enabled !== false,
      listName: cleanText(listContext.listName),
      totalCards: toNumber(listContext.totalCards),
      sampledCards: toNumber(listContext.sampledCards),
      sampledCardPreview: toArray(listContext.sampledCardPreview).map(compactCard).slice(0, 12),
      currentPosition: listContext.currentPosition || null,
      neighboringCards: toArray(listContext.neighboringCards).map(compactCard).slice(0, 4),
      labelPatterns: toArray(listContext.labelPatterns).map(function (item) {
        return {
          label: cleanText(item.label),
          count: toNumber(item.count)
        };
      }).filter(function (item) {
        return item.label;
      }).slice(0, 6),
      source: cleanText(listContext.source)
    };
  }

  function valueFromCustomField(item) {
    if (!item || typeof item !== "object") return cleanText(item);
    var value = item.value || {};
    if (value.text !== undefined) return cleanText(value.text);
    if (value.number !== undefined) return cleanText(value.number);
    if (value.date !== undefined) return cleanText(value.date);
    if (value.checked !== undefined) return value.checked === "true" || value.checked === true ? "Yes" : "No";
    if (item.valueText !== undefined) return cleanText(item.valueText);
    if (item.valueNumber !== undefined) return cleanText(item.valueNumber);
    if (item.valueDate !== undefined) return cleanText(item.valueDate);
    if (item.valueChecked !== undefined) return item.valueChecked ? "Yes" : "No";
    if (item.value !== undefined && typeof item.value !== "object") return cleanText(item.value);
    if (item.option && item.option.value) return valueFromCustomField(item.option);
    if (item.idValue) return cleanText(item.idValue);
    return "";
  }

  function normalizeCustomFields(fields) {
    return toArray(fields).map(function (field, index) {
      var definition = field.customField || field.field || {};
      var name = cleanText(field.name || field.fieldName || definition.name || field.idCustomField || field.id || "Custom field " + (index + 1));
      var value = valueFromCustomField(field);
      return {
        id: cleanText(field.id || field.idCustomField || "custom-field-" + (index + 1)),
        name: name,
        type: cleanText(field.type || definition.type),
        value: truncate(value, 180)
      };
    }).filter(function (field) {
      return field.name || field.value;
    }).slice(0, 25);
  }

  var DEFAULT_PROMPT_CONTEXT = {
    descriptionCharacters: 2500,
    commentLimit: 12,
    commentCharacters: 700
  };

  var OUTPUT_MODES = {
    "operational-ledger": {
      label: "Operational ledger",
      instruction: "Prioritize balanced card intelligence: status, blockers, next actions, Robert decisions, VA/team handoff, evidence, and validation."
    },
    "status-update": {
      label: "Status update",
      instruction: "Prioritize a concise async status update with current state, progress, top blocker, top next action, and confidence."
    },
    "risk-review": {
      label: "Risk review",
      instruction: "Prioritize deadline, client, financial, legal, quality, communication, missing-information, and unsupported-claim risks."
    },
    "meeting-brief": {
      label: "Meeting brief",
      instruction: "Prioritize a meeting-ready brief: context, what changed, discussion points, decisions needed, and follow-up actions."
    },
    "next-action-checklist": {
      label: "Next-action checklist",
      instruction: "Prioritize concrete next actions with owner, dependency, timing, and whether Robert approval is needed."
    },
    "client-friendly": {
      label: "Client-friendly summary",
      instruction: "Prioritize a clear external-safe summary, avoid internal uncertainty unless it affects the client, and keep wording professional."
    }
  };

  var OUTPUT_LANGUAGES = {
    en: {
      label: "English",
      instruction: "Write all user-facing summary values in English."
    },
    nl: {
      label: "Dutch",
      instruction: "Write all user-facing summary values in Dutch."
    }
  };
  var APP_VERSION = "1.1.0";
  var DEFAULT_UPDATE_MANIFEST_URL = "https://raw.githubusercontent.com/Robert-Velhorst/007--Trello-Summarize-This-/main/update.json";
  var UPDATE_REPO_URL_PREFIX = "https://github.com/Robert-Velhorst/007--Trello-Summarize-This-";

  function boundedNumber(value, fallback, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(Math.round(number), max));
  }

  function normalizeVersionParts(value) {
    var text = cleanText(value).replace(/^v/i, "");
    var match = text.match(/\d+(?:\.\d+){0,3}/);
    if (!match) return [0];
    return match[0].split(".").map(function (part) {
      return Math.max(0, parseInt(part, 10) || 0);
    });
  }

  function compareVersions(left, right) {
    var leftParts = normalizeVersionParts(left);
    var rightParts = normalizeVersionParts(right);
    var length = Math.max(leftParts.length, rightParts.length);

    for (var index = 0; index < length; index += 1) {
      var leftPart = leftParts[index] || 0;
      var rightPart = rightParts[index] || 0;
      if (leftPart > rightPart) return 1;
      if (leftPart < rightPart) return -1;
    }

    return 0;
  }

  function safeUpdateUrl(value, fallback) {
    var url = cleanText(value);
    if (!url) return fallback || "";

    try {
      var parsed = new URL(url);
      var allowedGithub = parsed.protocol === "https:" &&
        parsed.hostname === "github.com" &&
        parsed.href.indexOf(UPDATE_REPO_URL_PREFIX) === 0;
      var allowedRawManifest = parsed.protocol === "https:" &&
        parsed.hostname === "raw.githubusercontent.com" &&
        /^\/Robert-Velhorst\/007--Trello-Summarize-This-\//.test(parsed.pathname);

      return allowedGithub || allowedRawManifest ? parsed.href : fallback || "";
    } catch (_error) {
      return fallback || "";
    }
  }

  function safeTrelloCardUrl(value) {
    var url = cleanText(value);
    if (!url) return "";
    try {
      var parsed = new URL(url);
      var host = parsed.hostname.toLowerCase();
      if ((host === "trello.com" || host === "www.trello.com") && parsed.protocol === "https:" && /^\/c\//.test(parsed.pathname)) {
        return parsed.origin + parsed.pathname;
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function normalizeBatchProgressStatus(value) {
    var status = cleanText(value).toLowerCase();
    var allowed = {
      pending: true,
      opened: true,
      analyzed: true,
      copied: true,
      skipped: true,
      blocked: true
    };
    return allowed[status] ? status : "pending";
  }

  function batchProgressKeyForItem(item) {
    var source = item || {};
    var url = safeTrelloCardUrl(source.cardUrl || source.url);
    if (url) return "url:" + url;
    var id = cleanText(source.cardId || source.id);
    if (id) return "id:" + id;
    var name = cleanText(source.name || source.title || "untitled-card").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 80);
    return "name:" + (name || "untitled-card");
  }

  function normalizeUpdateManifest(input) {
    var source = input && typeof input === "object" ? input : {};
    var version = cleanText(source.version || source.latestVersion || APP_VERSION);
    var releaseNotesUrl = safeUpdateUrl(source.releaseNotesUrl || source.releaseUrl || source.url, UPDATE_REPO_URL_PREFIX + "/releases");
    var downloadUrl = safeUpdateUrl(source.downloadUrl || source.installerUrl || source.assetUrl, "");
    var manifestUrl = safeUpdateUrl(source.manifestUrl || DEFAULT_UPDATE_MANIFEST_URL, DEFAULT_UPDATE_MANIFEST_URL);

    return {
      schemaVersion: cleanText(source.schemaVersion || "summarize-this-update-manifest-v1"),
      version: version,
      releaseDate: cleanText(source.releaseDate || source.publishedAt),
      minimumSupportedVersion: cleanText(source.minimumSupportedVersion || ""),
      releaseNotesUrl: releaseNotesUrl,
      downloadUrl: downloadUrl,
      manifestUrl: manifestUrl,
      message: truncate(source.message || source.summary || "", 240)
    };
  }

  function evaluateUpdateStatus(currentVersion, manifest) {
    var current = cleanText(currentVersion || APP_VERSION);
    var normalized = normalizeUpdateManifest(manifest);
    var comparison = compareVersions(normalized.version, current);
    var minimumComparison = normalized.minimumSupportedVersion
      ? compareVersions(current, normalized.minimumSupportedVersion)
      : 0;

    return {
      currentVersion: current,
      latestVersion: normalized.version,
      updateAvailable: comparison > 0,
      upToDate: comparison <= 0,
      unsupported: minimumComparison < 0,
      releaseDate: normalized.releaseDate,
      releaseNotesUrl: normalized.releaseNotesUrl,
      downloadUrl: normalized.downloadUrl,
      message: normalized.message,
      manifest: normalized
    };
  }

  function normalizePromptContext(options) {
    var input = options && options.promptContext ? options.promptContext : options || {};
    return {
      descriptionCharacters: boundedNumber(input.descriptionCharacters, DEFAULT_PROMPT_CONTEXT.descriptionCharacters, 500, 5000),
      commentLimit: boundedNumber(input.commentLimit, DEFAULT_PROMPT_CONTEXT.commentLimit, 0, 25),
      commentCharacters: boundedNumber(input.commentCharacters, DEFAULT_PROMPT_CONTEXT.commentCharacters, 200, 1500)
    };
  }

  function normalizeOutputMode(value) {
    var key = cleanText(value || "operational-ledger").toLowerCase();
    return OUTPUT_MODES[key] ? key : "operational-ledger";
  }

  function getOutputModeLabel(value) {
    var key = normalizeOutputMode(value);
    return OUTPUT_MODES[key].label;
  }

  function getOutputModeInstruction(value) {
    var key = normalizeOutputMode(value);
    return OUTPUT_MODES[key].instruction;
  }

  function normalizeOutputLanguage(value) {
    var key = cleanText(value || "en").toLowerCase();
    if (key === "english") key = "en";
    if (key === "dutch" || key === "nederlands" || key === "nl-nl") key = "nl";
    return OUTPUT_LANGUAGES[key] ? key : "en";
  }

  function getOutputLanguageLabel(value) {
    var key = normalizeOutputLanguage(value);
    return OUTPUT_LANGUAGES[key].label;
  }

  function getOutputLanguageInstruction(value) {
    var key = normalizeOutputLanguage(value);
    return OUTPUT_LANGUAGES[key].instruction;
  }

  function compactCommentsForPrompt(comments, context) {
    var limits = normalizePromptContext(context);
    return toArray(comments).slice(0, limits.commentLimit).map(function (comment) {
      return {
        text: truncate(comment.text, limits.commentCharacters),
        date: comment.date || "",
        author: comment.author || ""
      };
    });
  }

  function normalizePriorFeedback(records) {
    return toArray(records).map(function (record) {
      return {
        rating: cleanText(record.rating),
        correctionText: truncate(record.correctionText, 260),
        incorrectSections: toArray(record.incorrectSections).map(cleanText).filter(Boolean).slice(0, 8),
        createdAt: record.createdAt || "",
        acceptedAt: record.acceptedAt || null
      };
    }).filter(function (record) {
      return record.rating || record.correctionText || record.incorrectSections.length;
    }).slice(0, 5);
  }

  function normalizeCustomInstructions(value) {
    return truncate(value, 600);
  }

  function normalizePromptTemplates(records) {
    var seen = {};
    return toArray(records).map(function (record, index) {
      var instructions = normalizeCustomInstructions(
        record && (record.instructions || record.customInstructions || record.text)
      );
      var name = truncate(record && record.name ? record.name : "Template " + (index + 1), 60);
      var id = cleanText(record && record.id)
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      if (!id) id = "template-" + (index + 1);
      if (seen[id]) id = id + "-" + (index + 1);
      seen[id] = true;
      return {
        id: id,
        name: name,
        instructions: instructions,
        createdAt: cleanText(record && record.createdAt),
        updatedAt: cleanText(record && record.updatedAt)
      };
    }).filter(function (record) {
      return record.name && record.instructions;
    }).slice(0, 10);
  }

  function normalizePromptTemplateSettings(settings) {
    var source = settings || {};
    var templates = normalizePromptTemplates(source.promptTemplates);
    var selectedId = cleanText(source.selectedPromptTemplateId);
    var selected = templates.filter(function (template) {
      return template.id === selectedId;
    })[0] || null;
    var customInstructions = normalizeCustomInstructions(source.customInstructions);
    if (!customInstructions && selected) customInstructions = selected.instructions;

    return {
      customInstructions: customInstructions,
      selectedPromptTemplateId: selected ? selected.id : "",
      selectedPromptTemplateName: selected ? selected.name : "",
      promptTemplates: templates
    };
  }

  function getObjectName(value) {
    if (!value) return "";
    if (typeof value === "string") return cleanText(value);
    return cleanText(value.name || value.fullName || value.id);
  }

  function normalizeCardData(input) {
    var raw = input || {};
    var base = raw.card && typeof raw.card === "object"
      ? Object.assign({}, raw.card, raw)
      : Object.assign({}, raw);

    delete base.card;

    var card = {
      id: cleanText(base.id),
      name: cleanText(base.name || base.title || "Untitled Trello card"),
      desc: cleanText(base.desc || base.description),
      due: base.due || null,
      dueComplete: Boolean(base.dueComplete),
      labels: normalizeNamedItems(base.labels),
      members: normalizeNamedItems(base.members),
      attachments: normalizeAttachments(base.attachments || base.attachmentDetails),
      checklists: toArray(base.checklists),
      comments: normalizeComments(base.comments),
      actions: normalizeActions(base.actions || base.activity),
      customFields: normalizeCustomFields(base.customFields || base.customFieldItems),
      badges: base.badges || {},
      boardName: cleanText(base.boardName || getObjectName(base.board)),
      listName: cleanText(base.listName || getObjectName(base.list)),
      url: cleanText(base.url || base.shortUrl || base.shortLink),
      dateLastActivity: base.dateLastActivity || base.lastActivity || null
    };

    card.priorFeedback = normalizePriorFeedback(base.priorFeedback || base.feedback || base.previousFeedback);
    card.listContext = normalizeListContext(base.listContext || base.boardListContext, card.id, card.listName);
    card.checklistStats = getChecklistStats(card);
    card.commentCount = card.comments.length || toNumber(card.badges.comments);
    card.attachmentCount = card.attachments.length || toNumber(card.badges.attachments);
    return card;
  }

  function normalizeListContext(input, currentCardId, currentListName) {
    var source = input || {};
    var rawCards = toArray(source.cards || source.listCards || source.neighborCards || source.sampledCardPreview);
    var compactCards = rawCards.map(function (card) {
      return {
        id: cleanText(card.id),
        name: cleanText(card.name || card.title || "Untitled card"),
        labels: normalizeNamedItems(card.labels).slice(0, 6),
        due: card.due || null,
        dueComplete: Boolean(card.dueComplete),
        listName: cleanText(card.listName || getObjectName(card.list)),
        url: safeTrelloCardUrl(card.url || card.shortUrl || card.shortLink)
      };
    }).filter(function (card) {
      return card.name;
    }).slice(0, 25);

    var currentIndex = -1;
    if (currentCardId) {
      currentIndex = compactCards.findIndex(function (card) {
        return card.id === currentCardId;
      });
    }

    var neighbors = [];
    if (currentIndex >= 0) {
      neighbors = compactCards.slice(Math.max(0, currentIndex - 2), currentIndex)
        .concat(compactCards.slice(currentIndex + 1, currentIndex + 3));
    } else {
      neighbors = compactCards.slice(0, 4);
    }

    return {
      enabled: source.enabled !== false,
      listName: cleanText(source.listName || currentListName),
      totalCards: toNumber(source.totalCards) || compactCards.length,
      sampledCards: compactCards.length,
      sampledCardPreview: compactCards.slice(0, 12).map(function (card) {
        return {
          id: card.id,
          name: card.name,
          labels: card.labels.slice(0, 4),
          due: card.due,
          dueComplete: card.dueComplete,
          url: card.url
        };
      }),
      currentPosition: currentIndex >= 0 ? currentIndex + 1 : null,
      neighboringCards: neighbors.map(function (card) {
        return {
          name: card.name,
          labels: card.labels.slice(0, 4),
          due: card.due,
          dueComplete: card.dueComplete,
          url: card.url
        };
      }),
      labelPatterns: topLabelsFromCards(compactCards),
      source: cleanText(source.source || "")
    };
  }

  function topLabelsFromCards(cards) {
    var counts = {};
    cards.forEach(function (card) {
      toArray(card.labels).forEach(function (label) {
        var key = cleanText(label);
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    return Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b);
    }).slice(0, 6).map(function (label) {
      return {
        label: label,
        count: counts[label]
      };
    });
  }

  function createListTrendSignals(input, options) {
    var card = normalizeCardData(input);
    var context = card.listContext || {};
    var previewCards = toArray(context.sampledCardPreview);
    var now = options && options.now ? new Date(options.now) : new Date();
    if (Number.isNaN(now.getTime())) now = new Date();
    var dueSoonDays = toNumber(options && options.dueSoonDays) || 7;
    var dueSoonMs = dueSoonDays * 86400000;
    var counts = {
      sampled: previewCards.length,
      overdue: 0,
      dueSoon: 0,
      dueOpen: 0,
      dueComplete: 0,
      noDue: 0,
      waitingTitleSignals: 0
    };
    var titleSignals = [];
    var signals = [];
    var labelPatterns = toArray(context.labelPatterns);
    var topLabel = labelPatterns[0] || null;

    previewCards.forEach(function (item) {
      var dueDate = item && item.due ? new Date(item.due) : null;
      var dueTime = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.getTime() : null;
      var name = cleanText(item && item.name);
      var lowerName = name.toLowerCase();

      if (item && item.dueComplete) {
        counts.dueComplete += 1;
      } else if (dueTime) {
        counts.dueOpen += 1;
        if (dueTime < now.getTime()) {
          counts.overdue += 1;
        } else if (dueTime - now.getTime() <= dueSoonMs) {
          counts.dueSoon += 1;
        }
      } else {
        counts.noDue += 1;
      }

      if (["waiting", "blocked", "blocker", "approve", "approval", "missing", "client reply", "dependency"].some(function (term) {
        return lowerName.indexOf(term) !== -1;
      })) {
        counts.waitingTitleSignals += 1;
        if (titleSignals.length < 4) titleSignals.push(name);
      }
    });

    if (counts.overdue) {
      signals.push({
        id: "overdue-pressure",
        severity: "high",
        label: "Overdue pressure",
        detail: counts.overdue + " sampled card(s) are overdue.",
        action: "Review overdue cards before adding new list work."
      });
    } else if (counts.dueSoon) {
      signals.push({
        id: "due-soon-pressure",
        severity: "medium",
        label: "Due-soon pressure",
        detail: counts.dueSoon + " sampled card(s) are due within " + dueSoonDays + " day(s).",
        action: "Prioritize due-soon cards in the next review pass."
      });
    }

    if (topLabel && counts.sampled >= 3 && topLabel.count / counts.sampled >= 0.5) {
      signals.push({
        id: "label-concentration",
        severity: "medium",
        label: "Common workstream",
        detail: topLabel.label + " appears on " + topLabel.count + " of " + counts.sampled + " sampled card(s).",
        action: "Group handoff or review work around this label."
      });
    }

    if (counts.waitingTitleSignals) {
      signals.push({
        id: "waiting-title-signals",
        severity: counts.waitingTitleSignals > 1 ? "high" : "medium",
        label: "Waiting or blocker wording",
        detail: counts.waitingTitleSignals + " sampled card title(s) mention waiting, approval, missing input, or blockers.",
        action: "Open these cards for full evidence-backed blocker analysis.",
        examples: titleSignals
      });
    }

    if (context.currentPosition && context.totalCards && context.currentPosition > Math.ceil(context.totalCards * 0.75)) {
      signals.push({
        id: "lower-list-position",
        severity: "low",
        label: "Lower list position",
        detail: "Current card is position " + context.currentPosition + " of " + context.totalCards + ".",
        action: "Check whether higher cards in the list should be cleared first."
      });
    }

    if (!signals.length && counts.sampled) {
      signals.push({
        id: "steady-list",
        severity: "low",
        label: "No urgent list trend",
        detail: "No overdue, due-soon, or waiting-title trend was detected in the bounded sample.",
        action: "Use the individual card analysis as the primary decision source."
      });
    }

    return {
      schemaVersion: "summarize-this-list-trend-signals-v1",
      listName: context.listName || card.listName || "",
      sampledCards: counts.sampled,
      totalCards: context.totalCards || counts.sampled,
      dueCounts: counts,
      labelConcentration: topLabel ? {
        label: topLabel.label,
        count: topLabel.count,
        percent: counts.sampled ? Math.round((topLabel.count / counts.sampled) * 100) : 0
      } : null,
      signals: signals.slice(0, 6),
      privacyNote: "List trend signals use bounded list metadata only: card names, labels, due states, and current position. They do not include neighboring descriptions, comments, attachments, or AI output."
    };
  }

  function createListPlanningBrief(input, options) {
    var card = normalizeCardData(input);
    var context = card.listContext || {};
    var previewCards = toArray(context.sampledCardPreview);
    var neighbors = toArray(context.neighboringCards);
    var now = options && options.now ? new Date(options.now) : new Date();
    if (Number.isNaN(now.getTime())) now = new Date();
    var dueCards = previewCards.filter(function (item) {
      return item && item.due && !item.dueComplete;
    }).map(function (item) {
      return {
        name: item.name,
        due: item.due,
        overdue: new Date(item.due).getTime() < now.getTime()
      };
    }).slice(0, 8);
    var labelPatterns = toArray(context.labelPatterns).slice(0, 6);
    var trendSignals = createListTrendSignals(card, options);
    var nextFocus = [];

    if (dueCards.some(function (item) { return item.overdue; })) {
      nextFocus.push("Review overdue cards in this list before adding new work.");
    }
    toArray(trendSignals.signals).slice(0, 3).forEach(function (signal) {
      if (signal && signal.action && nextFocus.indexOf(signal.action) === -1) {
        nextFocus.push(signal.action);
      }
    });
    if (labelPatterns.length) {
      nextFocus.push("Use common labels to group related handoff work: " + labelPatterns.map(function (item) {
        return item.label + " (" + item.count + ")";
      }).join(", ") + ".");
    }
    if (card.name && context.currentPosition) {
      nextFocus.push("Current card position: " + context.currentPosition + " of " + (context.totalCards || context.sampledCards) + ".");
    }
    if (!nextFocus.length) {
      nextFocus.push("Use this as a lightweight list overview; detailed card bodies were not read.");
    }

    return {
      schemaVersion: "summarize-this-list-planning-brief-v1",
      listName: context.listName || card.listName || "",
      currentCard: card.name,
      currentPosition: context.currentPosition || null,
      totalCards: context.totalCards || context.sampledCards || 0,
      sampledCards: context.sampledCards || previewCards.length || 0,
      neighboringCards: neighbors.map(function (item) {
        return {
          name: item.name,
          labels: toArray(item.labels).slice(0, 4),
          due: item.due || null,
          dueComplete: Boolean(item.dueComplete)
        };
      }).slice(0, 8),
      labelPatterns: labelPatterns,
      dueCards: dueCards,
      trendSignals: trendSignals,
      nextFocus: nextFocus,
      source: context.source || "",
      privacyNote: "This brief uses bounded list metadata only: card names, labels, due states, and current position. It does not include neighboring card descriptions, comments, attachments, or AI output."
    };
  }

  function markdownForListPlanningBrief(brief) {
    var source = brief || {};
    var lines = [
      "# List planning brief",
      "",
      "List: " + (source.listName || "current list"),
      "Current card: " + (source.currentCard || "unknown"),
      "Sampled cards: " + (source.sampledCards || 0) + " of " + (source.totalCards || source.sampledCards || 0)
    ];

    if (source.currentPosition) {
      lines.push("Current position: " + source.currentPosition + " of " + (source.totalCards || source.sampledCards || 0));
    }

    lines.push("", "## Next focus");
    toArray(source.nextFocus).forEach(function (item) {
      lines.push("- " + item);
    });

    lines.push("", "## Nearby cards");
    if (toArray(source.neighboringCards).length) {
      toArray(source.neighboringCards).forEach(function (item) {
        var labels = toArray(item.labels).map(function (label) { return cleanText(label); }).filter(Boolean);
        lines.push("- " + item.name + (labels.length ? " [" + labels.join(", ") + "]" : ""));
      });
    } else {
      lines.push("- No nearby cards were available in the bounded sample.");
    }

    lines.push("", "## Common labels");
    if (toArray(source.labelPatterns).length) {
      toArray(source.labelPatterns).forEach(function (item) {
        lines.push("- " + item.label + ": " + item.count);
      });
    } else {
      lines.push("- No label patterns were available.");
    }

    if (toArray(source.dueCards).length) {
      lines.push("", "## Due signals");
      toArray(source.dueCards).forEach(function (item) {
        lines.push("- " + item.name + ": " + item.due + (item.overdue ? " (overdue)" : ""));
      });
    }

    if (source.trendSignals && toArray(source.trendSignals.signals).length) {
      lines.push("", "## List trend signals");
      toArray(source.trendSignals.signals).forEach(function (item) {
        lines.push("- " + item.label + " (" + item.severity + "): " + item.detail + " Action: " + item.action);
      });
    }

    lines.push("", "Privacy: " + source.privacyNote);
    return lines.join("\n");
  }

  function createBatchAnalysisPlan(input, options) {
    var card = normalizeCardData(input);
    var context = card.listContext || {};
    var now = options && options.now ? new Date(options.now) : new Date();
    if (Number.isNaN(now.getTime())) now = new Date();
    var dueSoonDays = toNumber(options && options.dueSoonDays) || 7;
    var dueSoonMs = dueSoonDays * 86400000;
    var previewCards = toArray(context.sampledCardPreview).slice(0, 12);
    var commonLabels = toArray(context.labelPatterns).slice(0, 6);
    var commonLabelNames = commonLabels.map(function (item) { return item.label; });
    var queue = previewCards.map(function (item, index) {
      var labels = toArray(item.labels).slice(0, 4);
      var dueDate = item.due ? new Date(item.due) : null;
      var dueTime = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.getTime() : null;
      var signals = [];

      if (card.name && item.name === card.name) signals.push("current-card");
      if (item.due && !item.dueComplete) {
        if (dueTime && dueTime < now.getTime()) {
          signals.push("overdue");
        } else if (dueTime && dueTime - now.getTime() <= dueSoonMs) {
          signals.push("due-soon");
        } else {
          signals.push("due-open");
        }
      }
      labels.forEach(function (label) {
        if (commonLabelNames.indexOf(label) !== -1) {
          signals.push("common-label:" + label);
        }
      });

      return {
        queuePosition: index + 1,
        cardId: cleanText(item.id),
        name: cleanText(item.name),
        cardUrl: safeTrelloCardUrl(item.url || item.shortUrl || item.shortLink),
        labels: labels,
        due: item.due || null,
        dueComplete: Boolean(item.dueComplete),
        signals: signals.slice(0, 6),
        requiredApproval: "Review this queue item before any full-card AI analysis or Trello write.",
        recommendedMode: signals.indexOf("overdue") !== -1 || signals.indexOf("due-soon") !== -1
          ? "risk-review"
          : "operational-ledger"
      };
    }).filter(function (item) {
      return item.name;
    });

    var approvalChecklist = [
      "Review selected cards before running batch analysis.",
      "Approve AI handoff explicitly before sending card bodies, comments, or attachments to a provider.",
      "Keep concurrency at 1 until Trello/API rate limits are visible.",
      "Do not post summaries back to Trello without exact draft review and approval."
    ];

    return {
      schemaVersion: "summarize-this-batch-analysis-plan-v1",
      listName: context.listName || card.listName || "",
      currentCard: card.name,
      totalCards: context.totalCards || context.sampledCards || queue.length,
      sampledCards: context.sampledCards || queue.length,
      queueSize: queue.length,
      queue: queue,
      commonLabels: commonLabels,
      approvalRequired: true,
      aiHandoffDefault: "off",
      recommendedConcurrency: 1,
      recommendedDelaySeconds: 2,
      nextSteps: queue.length ? [
        "Use this as the reviewed queue seed for a future full-card batch run.",
        "Start with overdue or due-soon cards, then process common-label groups.",
        "Run a reviewed batch here, or open cards manually when you want to inspect them one by one before exporting or posting results."
      ] : [
        "Enable list context in settings before building a batch analysis plan."
      ],
      approvalChecklist: approvalChecklist,
      privacyNote: "This batch plan uses bounded list metadata only: card names, optional ids, labels, due states, and current position. It does not include card descriptions, comments, attachments, or AI output."
    };
  }

  function clampWholeNumber(value, min, max, fallback) {
    var number = Math.floor(toNumber(value));
    if (!Number.isFinite(number) || number < min) number = fallback;
    if (!Number.isFinite(number)) number = min;
    return Math.max(min, Math.min(max, number));
  }

  function createBatchExecutionReview(plan, options) {
    var source = plan || {};
    var queue = toArray(source.queue);
    var maxSelectable = Math.max(1, Math.min(12, queue.length || 1));
    var selectedCount = clampWholeNumber(options && options.maxCards, 1, maxSelectable, Math.min(3, maxSelectable));
    var concurrency = clampWholeNumber(options && options.concurrency, 1, 3, source.recommendedConcurrency || 1);
    var delaySeconds = clampWholeNumber(options && options.delaySeconds, 0, 30, source.recommendedDelaySeconds || 2);
    var secondsPerCard = clampWholeNumber(options && options.estimatedSecondsPerCard, 10, 180, 35);
    var aiHandoffApproved = Boolean(options && options.aiHandoffApproved);
    var selectedQueue = queue.slice(0, selectedCount);
    var blockedReasons = [];
    var openableCards = selectedQueue.filter(function (item) {
      return safeTrelloCardUrl(item.cardUrl || item.url);
    }).length;

    if (!selectedQueue.length) {
      blockedReasons.push("No reviewed queue items are available.");
    }
    if (!aiHandoffApproved) {
      blockedReasons.push("AI handoff approval is not checked.");
    }

    var estimatedSeconds = selectedQueue.length
      ? Math.ceil((selectedQueue.length * secondsPerCard) / Math.max(1, concurrency))
        + Math.max(0, selectedQueue.length - 1) * delaySeconds
      : 0;

    return {
      schemaVersion: "summarize-this-batch-execution-review-v1",
      sourceSchemaVersion: source.schemaVersion || "",
      listName: source.listName || "",
      selectedCards: selectedQueue.length,
      availableCards: queue.length,
      concurrency: concurrency,
      delaySeconds: delaySeconds,
      estimatedSeconds: estimatedSeconds,
      estimatedMinutes: estimatedSeconds ? Math.max(1, Math.ceil(estimatedSeconds / 60)) : 0,
      aiHandoffApproved: aiHandoffApproved,
      trelloWriteDefault: "off",
      automaticExecution: aiHandoffApproved,
      networkAction: aiHandoffApproved ? "trello-read-and-analyze" : "none",
      openableCards: openableCards,
      executionAllowed: !blockedReasons.length,
      blockedReasons: blockedReasons,
      queue: selectedQueue.map(function (item, index) {
        var cardUrl = safeTrelloCardUrl(item.cardUrl || item.url);
        return {
          queuePosition: item.queuePosition || index + 1,
          cardId: item.cardId || "",
          name: item.name || "Untitled card",
          cardUrl: cardUrl,
          recommendedMode: item.recommendedMode || "operational-ledger",
          signals: toArray(item.signals).slice(0, 6),
          status: aiHandoffApproved ? "ready-for-reviewed-run" : "review-required",
          requiredApproval: item.requiredApproval || "Review this queue item before any full-card AI analysis or Trello write.",
          manualStep: cardUrl
            ? "Run the reviewed batch here, or open this Trello card and run Summarize This manually."
            : "Open this card manually from Trello before running analysis."
        };
      }),
      safetyChecklist: [
        "Fetch full card context before analysis and stop if Trello read errors appear.",
        "Send card bodies, comments, or attachment text to AI only after this approval.",
        "Keep Trello posting off until each exact comment draft is reviewed.",
        "Stop or reduce concurrency if Trello or provider rate limits appear."
      ],
      privacyNote: "This execution review starts from bounded list metadata only. When run, it fetches full card context for the selected queue, analyzes it, stores results privately, and keeps Trello write actions off."
    };
  }

  function markdownForBatchManualRunChecklist(review) {
    var source = review || {};
    var lines = [
      "# Manual batch run checklist",
      "",
      "List: " + (source.listName || "current list"),
      "Selected cards: " + (source.selectedCards || 0) + " of " + (source.availableCards || 0),
      "Concurrency: " + (source.concurrency || 1),
      "Delay between cards: " + (source.delaySeconds || 0) + " seconds",
      "AI handoff approved: " + (source.aiHandoffApproved ? "yes" : "no"),
      "Trello write default: " + (source.trelloWriteDefault || "off"),
      "Automatic execution: " + (source.automaticExecution ? "on" : "off"),
      "",
      "## Queue"
    ];

    if (toArray(source.queue).length) {
      toArray(source.queue).forEach(function (item) {
        var label = item.queuePosition + ". " + cleanText(item.name || "Untitled card");
        var url = safeTrelloCardUrl(item.cardUrl || item.url);
        var linkedLabel = url ? "[" + label + "](" + url + ")" : label;
        lines.push("- " + linkedLabel
          + ": " + cleanText(item.status || "review-required")
          + "; mode " + cleanText(item.recommendedMode || "operational-ledger")
          + ". " + cleanText(item.manualStep || "Open this card manually before analysis."));
      });
    } else {
      lines.push("- No selected queue items are available.");
    }

    lines.push("", "## Safety checklist");
    toArray(source.safetyChecklist).forEach(function (item) {
      lines.push("- " + cleanText(item));
    });

    lines.push("", "Privacy: " + cleanText(source.privacyNote));
    return lines.join("\n");
  }

  function createBatchProgressSnapshot(review, storedProgress) {
    var source = review || {};
    var saved = storedProgress && typeof storedProgress === "object" ? storedProgress : {};
    var counts = {
      pending: 0,
      opened: 0,
      analyzed: 0,
      copied: 0,
      skipped: 0,
      blocked: 0
    };
    var queue = toArray(source.queue).map(function (item) {
      var key = batchProgressKeyForItem(item);
      var status = normalizeBatchProgressStatus(saved[key]);
      counts[status] += 1;
      return {
        key: key,
        queuePosition: item.queuePosition || 0,
        cardId: item.cardId || "",
        name: cleanText(item.name || "Untitled card"),
        cardUrl: safeTrelloCardUrl(item.cardUrl || item.url),
        status: status,
        recommendedMode: cleanText(item.recommendedMode || "operational-ledger")
      };
    });
    var done = counts.analyzed + counts.copied + counts.skipped;
    var needsAttention = counts.pending + counts.opened + counts.blocked;

    return {
      schemaVersion: "summarize-this-batch-progress-v1",
      listName: cleanText(source.listName || ""),
      totalCards: queue.length,
      doneCards: done,
      needsAttentionCards: needsAttention,
      counts: counts,
      queue: queue,
      summary: queue.length
        ? done + " of " + queue.length + " card(s) done; " + needsAttention + " need attention."
        : "No selected batch cards are being tracked."
    };
  }

  function markdownForBatchHandoffReport(review, progressSnapshot) {
    var source = review || {};
    var progress = progressSnapshot || createBatchProgressSnapshot(source, {});
    var lines = [
      "# Batch handoff report",
      "",
      "List: " + (source.listName || progress.listName || "current list"),
      "Selected cards: " + (source.selectedCards || progress.totalCards || 0) + " of " + (source.availableCards || progress.totalCards || 0),
      "Progress: " + cleanText(progress.summary),
      "Pending: " + (progress.counts && progress.counts.pending || 0),
      "Opened: " + (progress.counts && progress.counts.opened || 0),
      "Analyzed: " + (progress.counts && progress.counts.analyzed || 0),
      "Copied/exported: " + (progress.counts && progress.counts.copied || 0),
      "Skipped: " + (progress.counts && progress.counts.skipped || 0),
      "Blocked: " + (progress.counts && progress.counts.blocked || 0),
      "AI handoff approved: " + (source.aiHandoffApproved ? "yes" : "no"),
      "Trello write default: " + (source.trelloWriteDefault || "off"),
      "Automatic execution: " + (source.automaticExecution ? "on" : "off"),
      "",
      "## Per-card status"
    ];

    if (toArray(progress.queue).length) {
      toArray(progress.queue).forEach(function (item) {
        var label = (item.queuePosition || "") + ". " + cleanText(item.name || "Untitled card");
        var url = safeTrelloCardUrl(item.cardUrl || item.url);
        var linkedLabel = url ? "[" + label + "](" + url + ")" : label;
        lines.push("- " + linkedLabel
          + ": " + normalizeBatchProgressStatus(item.status)
          + "; mode " + cleanText(item.recommendedMode || "operational-ledger") + ".");
      });
    } else {
      lines.push("- No selected queue items are available.");
    }

    lines.push(
      "",
      "## Handoff rules",
      "- Use this report as a VA/Sneup handoff snapshot, not as proof that card analysis is complete.",
      "- Open each pending or blocked card and run full evidence-backed analysis before posting anything to Trello.",
      "- Keep Trello posting off until each exact comment draft is reviewed and approved.",
      "- Card links are limited to sanitized Trello card URLs.",
      "",
      "Privacy: " + cleanText(source.privacyNote || "This handoff report uses bounded list metadata and private manual progress only. It does not include card descriptions, comments, attachments, or AI output.")
    );
    return lines.join("\n");
  }

  function markdownForBatchAnalysisPlan(plan) {
    var source = plan || {};
    var lines = [
      "# Batch analysis plan",
      "",
      "List: " + (source.listName || "current list"),
      "Current card: " + (source.currentCard || "unknown"),
      "Queue size: " + (source.queueSize || 0) + " of " + (source.totalCards || source.sampledCards || 0),
      "AI handoff default: " + (source.aiHandoffDefault || "off"),
      "Recommended concurrency: " + (source.recommendedConcurrency || 1),
      "Recommended delay: " + (source.recommendedDelaySeconds || 2) + " seconds",
      "",
      "## Queue"
    ];

    if (toArray(source.queue).length) {
      toArray(source.queue).forEach(function (item) {
        var labels = toArray(item.labels).map(function (label) { return cleanText(label); }).filter(Boolean);
        var signals = toArray(item.signals).map(function (signal) { return cleanText(signal); }).filter(Boolean);
        lines.push("- " + item.queuePosition + ". " + item.name
          + (labels.length ? " [" + labels.join(", ") + "]" : "")
          + (item.due ? " due " + item.due : "")
          + (signals.length ? " (" + signals.join(", ") + ")" : ""));
      });
    } else {
      lines.push("- No queue items were available in the bounded list sample.");
    }

    lines.push("", "## Approval checklist");
    toArray(source.approvalChecklist).forEach(function (item) {
      lines.push("- " + item);
    });

    lines.push("", "## Next steps");
    toArray(source.nextSteps).forEach(function (item) {
      lines.push("- " + item);
    });

    lines.push("", "Privacy: " + source.privacyNote);
    return lines.join("\n");
  }

  function getChecklistStats(card) {
    var total = 0;
    var complete = 0;
    var incompleteItems = [];

    toArray(card.checklists).forEach(function (checklist) {
      toArray(checklist.checkItems || checklist.items).forEach(function (item) {
        total += 1;
        if (item.state === "complete" || item.checked === true) {
          complete += 1;
        } else {
          incompleteItems.push(cleanText(item.name || item.text || "Checklist item"));
        }
      });
    });

    if (total === 0 && card.badges) {
      total = toNumber(card.badges.checkItems);
      complete = toNumber(card.badges.checkItemsChecked);
    }

    var percent = total > 0 ? Math.round((complete / total) * 100) : null;
    return {
      total: total,
      complete: complete,
      incomplete: Math.max(total - complete, 0),
      percent: percent,
      incompleteItems: incompleteItems.slice(0, 8)
    };
  }

  function getDueInfo(card, now, language) {
    var dutch = normalizeOutputLanguage(language) === "nl";
    if (!card.due) {
      return {
        hasDue: false,
        text: dutch ? "Er is geen vervaldatum ingesteld." : "No due date is set.",
        state: "none"
      };
    }

    var dueDate = new Date(card.due);
    if (Number.isNaN(dueDate.getTime())) {
      return {
        hasDue: false,
        text: dutch ? "De vervaldatum kon niet worden gelezen." : "The due date could not be read.",
        state: "unknown"
      };
    }

    if (card.dueComplete) {
      return {
        hasDue: true,
        text: dutch ? "De vervaldatum is gemarkeerd als afgerond." : "The due date is marked complete.",
        state: "complete",
        date: dueDate
      };
    }

    var today = now || new Date();
    var days = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
    if (days < 0) {
      return {
        hasDue: true,
        text: dutch
          ? "Deze kaart is " + Math.abs(days) + " dag" + (Math.abs(days) === 1 ? "" : "en") + " te laat."
          : "This card is overdue by " + Math.abs(days) + " day" + (Math.abs(days) === 1 ? "" : "s") + ".",
        state: "overdue",
        days: days,
        date: dueDate
      };
    }
    if (days === 0) {
      return {
        hasDue: true,
        text: dutch ? "Deze kaart vervalt vandaag." : "This card is due today.",
        state: "due-today",
        days: days,
        date: dueDate
      };
    }
    return {
      hasDue: true,
      text: dutch
        ? "Deze kaart vervalt over " + days + " dag" + (days === 1 ? "" : "en") + "."
        : "This card is due in " + days + " day" + (days === 1 ? "" : "s") + ".",
      state: days <= 3 ? "soon" : "scheduled",
      days: days,
      date: dueDate
    };
  }

  function getActivityAgeInfo(card, now) {
    var reference = now || new Date();
    if (Number.isNaN(reference.getTime())) reference = new Date();
    var dates = [];
    if (card.dateLastActivity) dates.push(card.dateLastActivity);
    card.comments.forEach(function (comment) {
      if (comment.date) dates.push(comment.date);
    });
    card.actions.forEach(function (action) {
      if (action.date) dates.push(action.date);
    });

    var latest = dates.reduce(function (best, value) {
      var date = new Date(value);
      if (Number.isNaN(date.getTime())) return best;
      return !best || date.getTime() > best.getTime() ? date : best;
    }, null);

    if (!latest) {
      return {
        known: false,
        stale: false,
        veryStale: false,
        days: null
      };
    }

    var days = Math.max(0, Math.floor((reference.getTime() - latest.getTime()) / 86400000));
    return {
      known: true,
      latestAt: latest.toISOString(),
      days: days,
      stale: days >= 14,
      veryStale: days >= 30
    };
  }

  function extractKeywords(card) {
    var source = [card.name, card.desc].join(" ").toLowerCase();
    var counts = {};

    source.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).forEach(function (word) {
      if (word.length < 4 || STOP_WORDS[word]) return;
      counts[word] = (counts[word] || 0) + 1;
    });

    return Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a];
    }).slice(0, 6);
  }

  function detectSensitiveSignals(input) {
    var card = normalizeCardData(input);
    var source = [
      card.name,
      card.desc,
      card.boardName,
      card.listName,
      card.labels.join(" "),
      card.members.join(" "),
      card.customFields.map(function (field) { return [field.name, field.value].join(" "); }).join(" "),
      card.attachments.map(function (attachment) { return [attachment.name, attachment.category, attachment.status].join(" "); }).join(" "),
      card.comments.slice(0, 12).map(function (comment) { return comment.text || ""; }).join(" "),
      card.actions.slice(0, 12).map(function (action) { return [action.type, action.text, action.author].join(" "); }).join(" "),
      card.priorFeedback.map(function (item) { return item.correctionText || ""; }).join(" ")
    ].join(" ").toLowerCase();
    var categories = {
      client: ["client", "customer", "account", "proposal", "stakeholder"],
      financial: ["invoice", "payment", "billing", "budget", "amount", "bank", "tax", "credit", "debit", "subscription"],
      legal: ["legal", "contract", "gdpr", "privacy", "compliance", "terms", "lawsuit", "liability"],
      personal: ["personal", "password", "passport", "address", "phone", "email", "medical", "health", "hr", "salary"]
    };
    var matchedCategories = [];
    var matches = [];

    Object.keys(categories).forEach(function (category) {
      categories[category].forEach(function (word) {
        if (source.indexOf(word) === -1) return;
        if (matchedCategories.indexOf(category) === -1) matchedCategories.push(category);
        if (matches.indexOf(word) === -1) matches.push(word);
      });
    });

    return {
      requiresAiApproval: matchedCategories.length > 0,
      categories: matchedCategories,
      matches: matches.slice(0, 12),
      reason: matchedCategories.length
        ? "Card text or metadata contains " + matchedCategories.join(", ") + " signal(s)."
        : "No sensitive AI handoff signal detected."
    };
  }

  function shouldSkipSensitiveAttachmentTextExtraction(input, settings, approved) {
    if (!settings || settings.extractTextAttachments !== true) return false;
    if (settings.requireSensitiveAiApproval === false) return false;
    if (approved) return false;
    return detectSensitiveSignals(input).requiresAiApproval;
  }

  function localSummaryCopy(language) {
    var dutch = normalizeOutputLanguage(language) === "nl";
    return {
      aboutWithDescription: function (name, description) {
        return dutch
          ? "Deze kaart, \"" + name + "\", gaat over " + description
          : "This card, \"" + name + "\", is about " + description;
      },
      aboutWithoutDescription: function (name) {
        return dutch
          ? "Deze kaart heet \"" + name + "\", maar heeft nog geen beschrijving. De analyse is daarom gebaseerd op de titel en beschikbare metadata."
          : "This card is titled \"" + name + "\" but does not yet include a description, so the analysis is based on the title and available metadata.";
      },
      labels: function (labels) {
        return dutch ? " Labels geven aan: " + labels + "." : " Labels indicate: " + labels + ".";
      },
      lastActivity: function (dateText) {
        return dutch ? "Laatste activiteit is geregistreerd op " + dateText + "." : "Last activity was recorded on " + dateText + ".";
      },
      noActivityForDays: function (days) {
        return dutch ? "Er is al " + days + " dagen geen zichtbare kaartactiviteit geregistreerd." : "No visible card activity has been recorded for " + days + " days.";
      },
      commentsAvailable: function (count) {
        return dutch
          ? count + " opmerking" + (count === 1 ? " is" : "en zijn") + " beschikbaar als context."
          : count + " comment" + (count === 1 ? "" : "s") + " " + (count === 1 ? "is" : "are") + " available for context.";
      },
      activityIncluded: function (count) {
        return dutch
          ? count + " recent activiteit-item" + (count === 1 ? " is" : "s zijn") + " meegenomen."
          : count + " recent activity item" + (count === 1 ? "" : "s") + " were included.";
      },
      priorCorrections: function (count) {
        return dutch
          ? count + " eerdere correctie" + (count === 1 ? "" : "s") + " uit reviewfeedback beschikbaar voor deze run."
          : count + " prior correction" + (count === 1 ? "" : "s") + " from review feedback " + (count === 1 ? "is" : "are") + " available for this run.";
      },
      checklistComplete: function (complete, total) {
        return dutch
          ? complete + " van " + total + " checklistitem" + (total === 1 ? "" : "s") + " afgerond."
          : complete + " of " + total + " checklist item" + (total === 1 ? "" : "s") + " " + (complete === 1 ? "is" : "are") + " complete.";
      },
      limitedHistory: dutch
        ? "Er is beperkte activiteitshistorie uit Trello beschikbaar voor deze kaart."
        : "There is limited activity history available from Trello for this card.",
      board: function (name) {
        return dutch ? "Bord: " + name + "." : "Board: " + name + ".";
      },
      list: function (name) {
        return dutch ? "Huidige lijst: " + name + "." : "Current list: " + name + ".";
      },
      checklistProgress: function (percent) {
        return dutch ? "Checklistvoortgang is " + percent + "% afgerond." : "Checklist progress is " + percent + "% complete.";
      },
      addDescriptionStep: dutch
        ? "Voeg een korte beschrijving toe met doel, eigenaar en verwacht resultaat."
        : "Add a short description that states the goal, owner, and expected outcome.",
      assignOwnerStep: dutch
        ? "Wijs een eigenaar toe zodat de volgende actie duidelijk is."
        : "Assign an owner so the next action is clear.",
      setDueDateStep: dutch
        ? "Stel een vervaldatum of reviewdatum in voor het resterende werk."
        : "Set a due date or target review date for the remaining work.",
      confirmCompleteStep: dutch
        ? "Bevestig dat de kaart compleet is of voeg de volgende concrete actie toe."
        : "Confirm the card is complete or add the next concrete action.",
      mainThemes: function (keywords) {
        return dutch ? "Belangrijkste thema's: " + keywords + "." : "Main themes detected: " + keywords + ".";
      },
      checklistInsight: function (percent, incomplete) {
        return dutch
          ? "Checklistvoortgang is " + percent + "%, met " + incomplete + " item" + (incomplete === 1 ? "" : "s") + " open."
          : "Checklist completion is " + percent + "%, with " + incomplete + " item" + (incomplete === 1 ? "" : "s") + " remaining.";
      },
      attachmentsMayContain: function (count) {
        return dutch
          ? count + " bijlage" + (count === 1 ? " kan" : "n kunnen") + " ondersteunende details bevatten."
          : count + " attachment" + (count === 1 ? "" : "s") + " may contain supporting detail.";
      },
      attachmentMetadata: function (categories) {
        return dutch ? "Bijlagemetadata bevat: " + categories + "." : "Attachment metadata includes: " + categories + ".";
      },
      attachmentNotVerified: dutch
        ? "Bijlage-inhoud is niet geverifieerd; voor een of meer bestanden is alleen metadata beschikbaar."
        : "Attachment contents were not verified; only attachment metadata is available for one or more file(s).",
      recentActivity: function (items) {
        return dutch ? "Recente activiteit meegenomen: " + items + "." : "Recent activity included: " + items + ".";
      },
      byAuthor: function (author) {
        return dutch ? " door " + author : " by " + author;
      },
      listContext: function (count, listName) {
        return dutch
          ? "Lijstcontext bevat " + count + " voorbeeldkaart" + (count === 1 ? "" : "en") + " uit " + (listName || "de huidige lijst") + "."
          : "List context includes " + count + " sampled card" + (count === 1 ? "" : "s") + " from " + (listName || "the current list") + ".";
      },
      commonLabels: function (labels) {
        return dutch ? "Veelvoorkomende lijstlabels: " + labels + "." : "Common list labels: " + labels + ".";
      },
      customFields: function (fields) {
        return dutch ? "Custom fields meegenomen: " + fields + "." : "Custom fields included: " + fields + ".";
      },
      priorFeedbackInsight: dutch
        ? "Eerdere gebruikersfeedback is beschikbaar en moet worden gecontroleerd voordat deze analyse als definitief wordt behandeld."
        : "Prior user feedback is available and should be reviewed before treating this analysis as final.",
      sparseMetadata: dutch
        ? "De kaart heeft beperkte metadata, dus behandel de samenvatting als startpunt."
        : "The card has sparse metadata, so the summary should be treated as a starting point.",
      missingDescriptionRisk: dutch
        ? "Ontbrekende beschrijving maakt scope en acceptatiecriteria onduidelijk."
        : "Missing description makes scope and acceptance criteria unclear.",
      noOwnerRisk: dutch
        ? "Er is geen zichtbare eigenaar toegewezen."
        : "No visible owner is assigned.",
      lowChecklistRisk: dutch
        ? "Minder dan de helft van de checklist is afgerond."
        : "Less than half of the checklist is complete.",
      veryStaleRisk: function (days) {
        return dutch
          ? "Er is al " + days + " dagen geen zichtbare kaartactiviteit geregistreerd; bevestig de actuele status voordat je op deze kaart vertrouwt."
          : "No visible card activity has been recorded for " + days + " days; confirm current status before relying on this card.";
      },
      staleRisk: function (days) {
        return dutch
          ? "Er is al " + days + " dagen geen zichtbare kaartactiviteit geregistreerd; de status kan verouderen."
          : "No visible card activity has been recorded for " + days + " days; status may be aging.";
      },
      useNextSteps: dutch
        ? "Gebruik de volgende stappen als directe actielijst voor deze kaart."
        : "Use the next steps as the immediate action list for this card.",
      addConciseDescription: dutch
        ? "Voeg een beknopte kaartbeschrijving toe voordat je AI-analyse voor beslissingen gebruikt."
        : "Add a concise card description before relying on AI analysis for decisions.",
      addStatusComment: dutch
        ? "Voeg een statusopmerking toe wanneer belangrijke context buiten de kaart staat."
        : "Add a status comment when meaningful context lives outside the card.",
      enableListContext: dutch
        ? "Schakel lijstcontext in wanneer deze kaart sprint- of buurkaartvergelijking nodig heeft."
        : "Enable list context when this card needs sprint or neighboring-card comparison.",
      checkPriorCorrections: dutch
        ? "Controleer eerdere correcties en voorkom dat eerder gemelde fouten terugkomen."
        : "Check prior corrections and avoid repeating previously flagged mistakes.",
      reconfirmPriority: dutch
        ? "Bevestig prioriteit opnieuw en werk de vervaldatum bij nadat de eigenaar de kaart heeft beoordeeld."
        : "Reconfirm priority and update the due date after the owner reviews the card.",
      refreshStaleStatus: dutch
        ? "Voeg een actuele statusopmerking toe of verplaats de kaart nadat is bevestigd of het werk nog actief is."
        : "Add a current status comment or move the card after confirming whether the work is still active."
    };
  }

  function buildRuleBasedAnalysis(input, options) {
    var card = normalizeCardData(input);
    var outputLanguage = normalizeOutputLanguage(options && options.outputLanguage);
    var due = getDueInfo(card, options && options.now, outputLanguage);
    var activityAge = getActivityAgeInfo(card, options && options.now);
    var checklist = card.checklistStats;
    var keywords = extractKeywords(card);
    var copy = localSummaryCopy(outputLanguage);
    var nextSteps = [];
    var insights = [];
    var risks = [];
    var recommendations = [];

    var about = card.desc
      ? copy.aboutWithDescription(card.name, firstSentences(card.desc, 2))
      : copy.aboutWithoutDescription(card.name);

    if (card.labels.length) {
      about += copy.labels(card.labels.join(", "));
    }

    var historyParts = [];
    if (card.dateLastActivity) {
      historyParts.push(copy.lastActivity(new Date(card.dateLastActivity).toLocaleDateString()));
    }
    if (activityAge.veryStale) {
      historyParts.push(copy.noActivityForDays(activityAge.days));
    }
    if (card.commentCount) {
      historyParts.push(copy.commentsAvailable(card.commentCount));
    }
    if (card.actions.length) {
      historyParts.push(copy.activityIncluded(card.actions.length));
    }
    if (card.priorFeedback.length) {
      historyParts.push(copy.priorCorrections(card.priorFeedback.length));
    }
    if (checklist.total) {
      historyParts.push(copy.checklistComplete(checklist.complete, checklist.total));
    }
    var history = historyParts.length
      ? historyParts.join(" ")
      : copy.limitedHistory;

    var statusParts = [];
    if (card.boardName) statusParts.push(copy.board(card.boardName));
    if (card.listName) statusParts.push(copy.list(card.listName));
    statusParts.push(due.text);
    if (checklist.total) {
      statusParts.push(copy.checklistProgress(checklist.percent));
    }
    var status = statusParts.join(" ");

    if (checklist.incompleteItems.length) {
      nextSteps = checklist.incompleteItems.slice(0, 5);
    }
    if (!card.desc) {
      nextSteps.push(copy.addDescriptionStep);
    }
    if (!card.members.length) {
      nextSteps.push(copy.assignOwnerStep);
    }
    if (!card.due && checklist.incomplete > 0) {
      nextSteps.push(copy.setDueDateStep);
    }
    if (nextSteps.length === 0) {
      nextSteps.push(copy.confirmCompleteStep);
    }

    if (keywords.length) {
      insights.push(copy.mainThemes(keywords.join(", ")));
    }
    if (checklist.total) {
      insights.push(copy.checklistInsight(checklist.percent, checklist.incomplete));
    }
    if (card.attachmentCount) {
      insights.push(copy.attachmentsMayContain(card.attachmentCount));
      insights.push(copy.attachmentMetadata(summarizeAttachmentCategories(card.attachments)));
      if (card.attachments.some(function (attachment) { return !attachment.extractedTextAvailable; })) {
        risks.push(copy.attachmentNotVerified);
      }
    }
    if (card.actions.length) {
      insights.push(copy.recentActivity(card.actions.slice(0, 3).map(function (action) {
        return action.type + (action.author ? copy.byAuthor(action.author) : "");
      }).join("; ")));
    }
    if (card.listContext && card.listContext.sampledCards) {
      insights.push(copy.listContext(card.listContext.sampledCards, card.listContext.listName));
      if (card.listContext.labelPatterns.length) {
        insights.push(copy.commonLabels(card.listContext.labelPatterns.map(function (item) {
          return item.label + " (" + item.count + ")";
        }).join(", ")));
      }
    }
    if (card.customFields.length) {
      insights.push(copy.customFields(card.customFields.slice(0, 5).map(function (field) {
        return field.name + (field.value ? " = " + field.value : "");
      }).join("; ")));
    }
    if (card.priorFeedback.length) {
      insights.push(copy.priorFeedbackInsight);
    }
    if (insights.length === 0) {
      insights.push(copy.sparseMetadata);
    }

    if (due.state === "overdue" || due.state === "due-today") {
      risks.push(due.text);
    }
    if (!card.desc) {
      risks.push(copy.missingDescriptionRisk);
    }
    if (!card.members.length) {
      risks.push(copy.noOwnerRisk);
    }
    if (checklist.total && checklist.percent < 50) {
      risks.push(copy.lowChecklistRisk);
    }
    if (activityAge.veryStale) {
      risks.push(copy.veryStaleRisk(activityAge.days));
    } else if (activityAge.stale) {
      risks.push(copy.staleRisk(activityAge.days));
    }

    recommendations.push(copy.useNextSteps);
    if (!card.desc) {
      recommendations.push(copy.addConciseDescription);
    }
    if (card.commentCount === 0) {
      recommendations.push(copy.addStatusComment);
    }
    if (!card.listContext || !card.listContext.sampledCards) {
      recommendations.push(copy.enableListContext);
    }
    if (card.priorFeedback.length) {
      recommendations.push(copy.checkPriorCorrections);
    }
    if (due.state === "overdue") {
      recommendations.push(copy.reconfirmPriority);
    }
    if (activityAge.stale) {
      recommendations.push(copy.refreshStaleStatus);
    }

    var qualityScore = scoreDataQuality(card);
    var qualityLevel = qualityScore >= 80 ? "high" : qualityScore >= 60 ? "medium" : "low";

    return {
      summary: {
        about: about,
        history: history,
        status: status,
        nextSteps: nextSteps,
        insights: insights,
        risks: risks,
        recommendations: recommendations,
        confidence: qualityLevel
      },
      metadata: {
        provider: "Local rules",
        model: "built-in summarizer",
        outputLanguage: outputLanguage,
        tokens: 0,
        cost: 0
      },
      qualityScore: qualityScore,
      qualityLevel: qualityLevel,
      source: "local"
    };
  }

  function scoreDataQuality(card) {
    var score = 35;
    if (card.name && card.name !== "Untitled Trello card") score += 5;
    if (card.desc) score += 20;
    if (card.labels.length) score += 8;
    if (card.members.length) score += 8;
    if (card.due) score += 8;
    if (card.checklistStats.total) score += 12;
    if (card.commentCount) score += 7;
    if (card.actions.length) score += 3;
    if (card.attachmentCount) score += 4;
    if (card.customFields.length) score += 4;
    if (card.boardName || card.listName) score += 5;
    return Math.max(35, Math.min(score, 95));
  }

  function buildAIPrompt(input, options) {
    var card = normalizeCardData(input);
    var context = normalizePromptContext(options);
    var outputMode = normalizeOutputMode(options && options.outputMode);
    var outputLanguage = normalizeOutputLanguage(options && options.outputLanguage);
    var promptTemplateSettings = normalizePromptTemplateSettings(options);
    var customInstructions = promptTemplateSettings.customInstructions;
    var comments = compactCommentsForPrompt(card.comments, context);
    var payload = {
      outputMode: {
        key: outputMode,
        label: getOutputModeLabel(outputMode),
        instruction: getOutputModeInstruction(outputMode)
      },
      outputLanguage: {
        key: outputLanguage,
        label: getOutputLanguageLabel(outputLanguage),
        instruction: getOutputLanguageInstruction(outputLanguage)
      },
      promptTemplate: promptTemplateSettings.selectedPromptTemplateId ? {
        id: promptTemplateSettings.selectedPromptTemplateId,
        name: promptTemplateSettings.selectedPromptTemplateName
      } : null,
      customInstructions: customInstructions,
      name: card.name,
      description: truncate(card.desc, context.descriptionCharacters),
      board: card.boardName,
      list: card.listName,
      labels: card.labels.slice(0, 25),
      members: card.members.slice(0, 25),
      due: card.due,
      dueComplete: card.dueComplete,
      listContext: listContextForPrompt(card.listContext),
      customFields: card.customFields,
      activity: card.actions.slice(0, 12),
      attachments: compactAttachmentsForPrompt(card.attachments),
      sensitiveSignals: detectSensitiveSignals(input),
      priorFeedback: card.priorFeedback,
      checklistProgress: card.checklistStats,
      comments: comments,
      attachmentCount: card.attachmentCount,
      url: card.url,
      contextIncluded: {
        descriptionCharacters: Math.min(card.desc.length, context.descriptionCharacters),
        commentLimit: context.commentLimit,
        commentCharacters: context.commentCharacters,
        commentsAvailable: card.comments.length,
        commentsIncluded: comments.length,
        activityItemsAvailable: card.actions.length,
        activityItemsIncluded: Math.min(card.actions.length, 12),
        attachmentsAvailable: card.attachments.length,
        attachmentsIncluded: Math.min(card.attachments.length, 12),
        listContextCards: card.listContext ? card.listContext.sampledCards : 0,
        customFieldsIncluded: card.customFields.length,
        priorFeedbackItems: card.priorFeedback.length
      }
    };

    return [
      "Analyze this Trello card as an evidence-backed operational intelligence ledger for Robert's Trello workflow.",
      "Output mode: " + getOutputModeLabel(outputMode) + ". " + getOutputModeInstruction(outputMode),
      "Output language: " + getOutputLanguageLabel(outputLanguage) + ". " + getOutputLanguageInstruction(outputLanguage) + " Keep JSON field names exactly as specified in the schema.",
      customInstructions ? "User guidance: " + customInstructions : "User guidance: none configured.",
      "Apply user guidance only when it does not conflict with evidence requirements, privacy safeguards, or Trello write-approval rules.",
      "Return only valid JSON. Do not include markdown or commentary outside JSON.",
      "Use this schema:",
      "{",
      "  \"about\": \"what the card is about and why it matters\",",
      "  \"history\": \"what happened so far, based only on card data\",",
      "  \"currentStatus\": \"current list/stage, progress, owner, due state, and waiting state\",",
      "  \"completedWork\": [\"specific completed work\"],",
      "  \"blockers\": [\"specific blocker, missing information, or waiting state\"],",
      "  \"waitingOn\": [\"person, team, external party, approval, reply, or missing input the card is waiting on\"],",
      "  \"nextSteps\": [\"specific next action with owner if detectable\"],",
      "  \"robertDecisions\": [\"Yes/No decision that needs Robert, including why\"],",
      "  \"vaReadyActions\": [\"delegable VA/team action that does not need Robert approval\"],",
      "  \"insights\": [\"important operational insight\"],",
      "  \"risks\": [\"deadline, quality, communication, financial, legal, or client-sensitive risk\"],",
      "  \"missingInfo\": [\"missing data that limits confidence\"],",
      "  \"unclearPoints\": [\"contradiction, ambiguity, or unclear point that should be resolved before acting\"],",
      "  \"unresolvedQuestions\": [\"question that must be answered before acting or delegating\"],",
      "  \"recommendations\": [\"practical recommendation\"],",
      "  \"facts\": [\"claim directly stated in the supplied card data\"],",
      "  \"inferences\": [\"interpretation that requires human review\"],",
      "  \"uncertainty\": [\"information that could not be verified\"],",
      "  \"unsupportedClaims\": [\"claim that must not be treated as fact\"],",
      "  \"evidenceClaims\": [{\"claim\":\"factual claim\",\"source\":\"title|description|comment|activity|checklist|label|member|due|attachment|custom-field\",\"confidence\":\"supported|uncertain\"}],",
      "  \"validationFindings\": [\"unsupported, conflicting, incomplete, or attachment-extraction issue\"],",
      "  \"confidence\": \"high|medium|low\",",
      "  \"confidenceReason\": \"brief explanation from data completeness and evidence coverage\"",
      "}",
      "Be concrete. Prefer short operational sentences. Do not invent dates, people, amounts, attachment contents, or history.",
      "If attachments are present but text is not provided, say attachment contents were not verified.",
      "Use listContext only as lightweight board/list signal; do not infer hidden card details from neighboring card titles.",
      "If sensitiveSignals are present, keep the response operational and avoid exposing unnecessary private details.",
      "Use priorFeedback as user correction guidance only. Pay attention to incorrectSections when revising those output areas, and do not treat corrections as verified Trello facts unless card evidence also supports them.",
      "If Robert is mentioned or approval/client/financial/legal risk appears, create a Robert Yes/No decision.",
      "If an action can be delegated without Robert, include it in vaReadyActions.",
      "",
      JSON.stringify(payload, null, 2)
    ].join("\n");
  }

  function parseMaybeJson(value) {
    if (typeof value === "object" && value !== null) return value;
    var text = cleanText(value);
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      var match = text.match(/\{[\s\S]*\}/);
      if (!match) return {};
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        return {};
      }
    }
  }

  function ensureString(value, fallback) {
    var text = cleanText(value);
    return text || fallback || "";
  }

  function itemText(value) {
    if (typeof value === "string") return cleanText(value);
    if (!value || typeof value !== "object") return cleanText(value);
    return cleanText(
      value.text ||
      value.action ||
      value.claim ||
      value.summary ||
      value.description ||
      value.question ||
      value.reason ||
      value.title ||
      value.name
    );
  }

  function ensureList(value, fallback) {
    if (Array.isArray(value)) {
      return value.map(itemText).filter(Boolean);
    }
    if (typeof value === "string") {
      var lines = value.split(/\n|;|\d+\.\s+/).map(cleanText).filter(Boolean);
      if (lines.length) return lines;
    }
    return Array.isArray(fallback) ? fallback.slice() : [];
  }

  function ensureEvidenceClaims(value, fallback) {
    if (!Array.isArray(value)) {
      return Array.isArray(fallback) ? fallback.slice() : [];
    }

    return value.map(function (item) {
      if (typeof item === "string") {
        return {
          claim: cleanText(item),
          source: "",
          confidence: "uncertain"
        };
      }

      if (!item || typeof item !== "object") return null;
      var claim = cleanText(item.claim || item.text || item.summary);
      if (!claim) return null;
      return {
        claim: claim,
        source: cleanText(item.source || item.evidence || item.path),
        confidence: cleanText(item.confidence || "uncertain").toLowerCase()
      };
    }).filter(Boolean);
  }

  function normalizeAIAnalysis(rawValue, fallbackSummary) {
    var raw = parseMaybeJson(rawValue);
    var source = raw.summary || raw;
    var fallback = fallbackSummary || {};

    return {
      about: ensureString(source.about, fallback.about),
      history: ensureString(source.history || source.whatHappened, fallback.history),
      status: ensureString(source.status || source.currentStatus, fallback.status),
      currentStatus: ensureString(source.currentStatus || source.status, fallback.currentStatus || fallback.status),
      completedWork: ensureList(source.completedWork || source.completed_work, fallback.completedWork),
      blockers: ensureList(source.blockers, fallback.blockers),
      waitingOn: ensureList(source.waitingOn || source.waiting_on, fallback.waitingOn),
      nextSteps: ensureList(source.nextSteps || source.next_steps, fallback.nextSteps),
      robertDecisions: ensureList(source.robertDecisions || source.robert_decisions, fallback.robertDecisions),
      vaReadyActions: ensureList(source.vaReadyActions || source.va_ready_actions, fallback.vaReadyActions),
      insights: ensureList(source.insights, fallback.insights),
      risks: ensureList(source.risks || source.blockers, fallback.risks),
      missingInfo: ensureList(source.missingInfo || source.missing_info, fallback.missingInfo),
      unclearPoints: ensureList(source.unclearPoints || source.unclear_points || source.contradictions || source.conflicts, fallback.unclearPoints),
      unresolvedQuestions: ensureList(source.unresolvedQuestions || source.unresolved_questions, fallback.unresolvedQuestions),
      recommendations: ensureList(source.recommendations, fallback.recommendations),
      facts: ensureList(source.facts, fallback.facts),
      inferences: ensureList(source.inferences, fallback.inferences),
      uncertainty: ensureList(source.uncertainty || source.uncertainties, fallback.uncertainty),
      unsupportedClaims: ensureList(source.unsupportedClaims || source.unsupported_claims, fallback.unsupportedClaims),
      evidenceClaims: ensureEvidenceClaims(source.evidenceClaims || source.evidence_claims, fallback.evidenceClaims),
      validationFindings: ensureList(source.validationFindings || source.validation_findings, fallback.validationFindings),
      confidenceReason: ensureString(source.confidenceReason || source.confidence_reason, fallback.confidenceReason),
      confidence: cleanText(source.confidence || fallback.confidence || "medium").toLowerCase()
    };
  }

  function markdownForAnalysis(input, analysis) {
    var card = normalizeCardData(input);
    var summary = analysis.summary || analysis;
    var lines = [
      "# " + card.name,
      "",
      "## What this card is about",
      summary.about || "",
      "",
      "## What has happened",
      summary.history || "",
      "",
      "## Current status",
      summary.status || "",
      "",
      "## Next steps"
    ];

    ensureList(summary.nextSteps).forEach(function (item) {
      lines.push("- " + item);
    });

    lines.push("", "## Key insights");
    ensureList(summary.insights).forEach(function (item) {
      lines.push("- " + item);
    });

    lines.push("", "## Risks and blockers");
    ensureList(summary.risks).forEach(function (item) {
      lines.push("- " + item);
    });

    lines.push("", "## Recommendations");
    ensureList(summary.recommendations).forEach(function (item) {
      lines.push("- " + item);
    });

    return lines.join("\n");
  }

  function clampNumber(value, fallback, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function normalizeBudgetSettings(input) {
    var source = input || {};
    var limits = source.providerMonthlyLimits || source.monthlyLimits || {};
    return {
      warningPercent: clampNumber(source.warningPercent, 80, 50, 100),
      providerMonthlyLimits: {
        openai: clampNumber(limits.openai, 0, 0, 10000),
        google: clampNumber(limits.google, 0, 0, 10000),
        anthropic: clampNumber(limits.anthropic, 0, 0, 10000)
      }
    };
  }

  function normalizeGenerationSettings(input) {
    var source = input || {};
    return {
      maxOutputTokens: clampNumber(source.maxOutputTokens || source.maxTokens, 900, 300, 2000)
    };
  }

  function normalizeProviderMode(value) {
    var mode = cleanText(value || "fallback").toLowerCase();
    return mode === "consensus" ? "consensus" : "fallback";
  }

  function normalizeExportPreferences(input) {
    var source = input || {};
    var format = cleanText(source.defaultCopyFormat || source.defaultExportFormat || source.copyFormat);
    var allowed = {
      "markdown": true,
      "operational-digest": true,
      "status-update": true,
      "robert-decision-brief": true,
      "va-handoff-brief": true,
      "change-brief": true,
      "plain-text": true,
      "ledger-json": true,
      "trello-comment-draft": true
    };
    return {
      defaultCopyFormat: allowed[format] ? format : "markdown"
    };
  }

  function normalizeProxyEndpoint(value) {
    var raw = cleanText(value);
    if (!raw) return "";
    if (raw.length > 300) return "";

    try {
      var parsed = new URL(raw);
      var host = String(parsed.hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
      var isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0:0:0:0:0:0:0:1";
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
        return "";
      }
      if (parsed.protocol === "https:" && isPrivateOrLocalHostname(host)) return "";
      if (parsed.username || parsed.password) return "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch (error) {
      return "";
    }
  }

  function isAllowedLocalProxyUrl(parsed) {
    if (!parsed || parsed.protocol !== "http:") return false;
    var host = String(parsed.hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0:0:0:0:0:0:0:1";
  }

  function isPrivateOrLocalHostname(hostname) {
    var value = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (
      value === "localhost" ||
      value.endsWith(".localhost") ||
      value.endsWith(".local") ||
      value === "::1" ||
      value === "0:0:0:0:0:0:0:1" ||
      value.indexOf("fc") === 0 ||
      value.indexOf("fd") === 0 ||
      value.indexOf("fe80:") === 0
    ) {
      return true;
    }

    var parts = value.split(".").map(function (part) { return Number(part); });
    if (parts.length !== 4 || parts.some(function (part) {
      return !Number.isInteger(part) || part < 0 || part > 255;
    })) {
      return false;
    }

    var first = parts[0];
    var second = parts[1];
    return first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224;
  }

  function normalizeProxySettings(input) {
    var source = input || {};
    var requested = source.enabled === true || source.useProxy === true || source.aiProxyEnabled === true;
    var endpoint = normalizeProxyEndpoint(source.endpoint || source.url || source.proxyEndpoint || source.aiProxyEndpoint);
    var error = "";
    if (requested && !endpoint) {
      error = "Enter a public HTTPS proxy endpoint. Local development may use http://localhost or http://127.0.0.1.";
    }
    return {
      enabled: requested && Boolean(endpoint),
      endpoint: endpoint,
      valid: !requested || Boolean(endpoint),
      error: error
    };
  }

  function normalizeBackendApiBase(value) {
    var input = String(value || "").trim();
    if (!input) return "";
    try {
      var parsed = new URL(input);
      if (parsed.username || parsed.password) return "";
      if (parsed.protocol !== "https:" && !isAllowedLocalProxyUrl(parsed)) return "";
      parsed.search = "";
      parsed.hash = "";
      parsed.pathname = (parsed.pathname || "/api").replace(/\/+$/, "") || "/api";
      return parsed.toString().replace(/\/$/, "");
    } catch (_error) {
      return "";
    }
  }

  function deriveBackendApiBaseFromProxy(proxy) {
    var proxySettings = normalizeProxySettings(proxy);
    if (!proxySettings.endpoint) return "";
    try {
      var parsed = new URL(proxySettings.endpoint);
      parsed.search = "";
      parsed.hash = "";
      parsed.pathname = "/api";
      return parsed.toString().replace(/\/$/, "");
    } catch (_error) {
      return "";
    }
  }

  function normalizeBackendSettings(input, proxy) {
    var source = input || {};
    var explicit = normalizeBackendApiBase(source.apiBase || source.endpoint || source.baseUrl || source.url);
    var derived = explicit ? "" : deriveBackendApiBaseFromProxy(proxy);
    var apiBase = explicit || derived;
    return {
      apiBase: apiBase,
      valid: Boolean(apiBase),
      derivedFromProxy: !explicit && Boolean(derived),
      source: explicit ? "explicit" : (derived ? "derived-from-proxy" : "none")
    };
  }

  function backendTransportHeaders(apiBase) {
    try {
      var host = String(new URL(String(apiBase || "")).hostname || "").toLowerCase();
      if (host.endsWith(".ngrok-free.app") || host.endsWith(".ngrok-free.dev")) {
        return { "ngrok-skip-browser-warning": "1" };
      }
    } catch (_error) {
    }
    return {};
  }

  function stripApiKeysForLocalPreview(settings) {
    var source = settings && typeof settings === "object" ? settings : {};
    return Object.assign({}, source, {
      apiKeys: {}
    });
  }

  function createCostRecord(metadata, options) {
    var source = metadata || {};
    var providerKey = normalizeProviderKey(source.provider);
    var cost = Math.max(0, Number(source.cost) || 0);
    return {
      analysisRunId: options && options.analysisRunId ? String(options.analysisRunId) : "",
      cardId: options && options.cardId ? String(options.cardId) : "",
      cardTitle: truncate(String(options && options.cardTitle ? options.cardTitle : ""), 120),
      provider: source.provider || "Unknown",
      providerKey: providerKey,
      model: source.model || "",
      cost: Number(cost.toFixed(6)),
      tokens: Math.max(0, Number(source.tokens) || 0),
      createdAt: isoTimestamp(options && options.now)
    };
  }

  function evaluateBudgetAlert(records, metadata, budgetSettings, options) {
    var budget = normalizeBudgetSettings(budgetSettings);
    var record = createCostRecord(metadata || {}, options || {});
    var providerKey = record.providerKey;
    var limit = budget.providerMonthlyLimits[providerKey] || 0;
    var monthKey = currentMonthKey(options && options.now);
    var existingTotal = summarizeMonthlyProviderCosts(records, monthKey)[providerKey] || 0;
    var projectedTotal = existingTotal + record.cost;
    var warningAmount = limit * (budget.warningPercent / 100);

    var result = {
      status: "disabled",
      providerKey: providerKey,
      provider: providerLabel(providerKey),
      monthKey: monthKey,
      monthlyLimit: limit,
      warningPercent: budget.warningPercent,
      existingTotal: Number(existingTotal.toFixed(6)),
      runCost: record.cost,
      projectedTotal: Number(projectedTotal.toFixed(6)),
      message: ""
    };

    if (!limit || providerKey === "local" || providerKey === "unknown") {
      result.message = "No monthly budget alert is configured for this provider.";
      return result;
    }

    if (projectedTotal > limit) {
      result.status = "exceeded";
      result.message = providerLabel(providerKey) + " monthly budget would be exceeded: $" +
        projectedTotal.toFixed(4) + " of $" + limit.toFixed(2) + ".";
      return result;
    }

    if (projectedTotal >= warningAmount) {
      result.status = "warning";
      result.message = providerLabel(providerKey) + " monthly budget warning: $" +
        projectedTotal.toFixed(4) + " of $" + limit.toFixed(2) + " used.";
      return result;
    }

    result.status = "ok";
    result.message = providerLabel(providerKey) + " monthly budget is within limit: $" +
      projectedTotal.toFixed(4) + " of $" + limit.toFixed(2) + ".";
    return result;
  }

  function summarizeMonthlyProviderCosts(records, monthKey) {
    var targetMonth = monthKey || currentMonthKey();
    return (Array.isArray(records) ? records : []).reduce(function (totals, record) {
      if (!record || String(record.createdAt || "").slice(0, 7) !== targetMonth) return totals;
      var providerKey = normalizeProviderKey(record.providerKey || record.provider);
      if (providerKey === "local" || providerKey === "unknown") return totals;
      totals[providerKey] = (totals[providerKey] || 0) + Math.max(0, Number(record.cost) || 0);
      return totals;
    }, {});
  }

  function normalizeProviderKey(value) {
    var text = String(value || "").toLowerCase();
    if (text.indexOf("openai") !== -1) return "openai";
    if (text.indexOf("google") !== -1 || text.indexOf("gemini") !== -1) return "google";
    if (text.indexOf("anthropic") !== -1 || text.indexOf("claude") !== -1) return "anthropic";
    if (text.indexOf("proxy") !== -1) return "proxy";
    if (text.indexOf("local") !== -1) return "local";
    return text || "unknown";
  }

  function providerLabel(providerKey) {
    var labels = {
      openai: "OpenAI",
      google: "Google AI",
      anthropic: "Anthropic",
      proxy: "AI proxy",
      local: "Local rules"
    };
    return labels[providerKey] || "Unknown provider";
  }

  function currentMonthKey(now) {
    var date = now ? new Date(now) : new Date();
    if (Number.isNaN(date.getTime())) date = new Date();
    return date.toISOString().slice(0, 7);
  }

  function createRuntimeTimingRecord(stages, options) {
    var values = (Array.isArray(stages) ? stages : []).map(function (stage) {
      return {
        key: truncate(String(stage && stage.key ? stage.key : "stage"), 40),
        label: truncate(String(stage && stage.label ? stage.label : "Stage"), 80),
        durationMs: roundDuration(stage && stage.durationMs)
      };
    }).filter(function (stage) {
      return stage.durationMs >= 0;
    });
    var total = options && options.totalMs != null
      ? roundDuration(options.totalMs)
      : values.reduce(function (sum, stage) { return sum + stage.durationMs; }, 0);

    return {
      analysisRunId: options && options.analysisRunId ? String(options.analysisRunId) : "",
      cardId: options && options.cardId ? String(options.cardId) : "",
      provider: options && options.provider ? String(options.provider) : "",
      source: options && options.source ? String(options.source) : "",
      totalMs: roundDuration(total),
      stages: values.slice(0, 12),
      createdAt: isoTimestamp(options && options.now)
    };
  }

  function summarizeRuntimeTimingRecords(records) {
    var values = (Array.isArray(records) ? records : [])
      .map(function (record) { return Math.max(0, Number(record && record.totalMs) || 0); })
      .filter(function (value) { return value > 0; });
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);
    return {
      count: values.length,
      averageMs: values.length ? roundDuration(total / values.length) : 0,
      latestMs: values.length ? roundDuration(values[0]) : 0,
      maxMs: values.length ? roundDuration(Math.max.apply(Math, values)) : 0
    };
  }

  function roundDuration(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.round(number));
  }

  function isoTimestamp(value) {
    var date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) date = new Date();
    return date.toISOString();
  }

  function sampleCardData() {
    return {
      id: "sample-card",
      name: "Prepare launch checklist",
      desc: "Finalize the launch checklist for the new client dashboard. Confirm analytics, billing, onboarding copy, and support handoff before the release.",
      due: new Date(Date.now() + 3 * 86400000).toISOString(),
      dueComplete: false,
      labels: [{ name: "Launch" }, { name: "Client" }],
      members: [{ fullName: "Alex" }],
      board: { name: "Product Delivery" },
      list: { name: "In Progress" },
      listContext: {
        listName: "In Progress",
        totalCards: 5,
        source: "sample",
        cards: [
          { id: "sample-prior", name: "Confirm analytics baseline", labels: [{ name: "Launch" }], url: "https://trello.com/c/sampleprior/confirm-analytics-baseline" },
          { id: "sample-card", name: "Prepare launch checklist", labels: [{ name: "Launch" }, { name: "Client" }], url: "https://trello.com/c/samplecard/prepare-launch-checklist" },
          { id: "sample-next", name: "Draft support handoff", labels: [{ name: "Client" }, { name: "Support" }], url: "https://trello.com/c/samplenext/draft-support-handoff" },
          { id: "sample-later", name: "Review billing test run", labels: [{ name: "Billing" }, { name: "Launch" }], url: "https://trello.com/c/samplelater/review-billing-test-run" }
        ]
      },
      checklists: [{
        name: "Launch tasks",
        checkItems: [
          { name: "Analytics events reviewed", state: "complete" },
          { name: "Billing flow checked", state: "incomplete" },
          { name: "Support handoff written", state: "incomplete" }
        ]
      }],
      comments: [{
        text: "QA found one issue in the billing flow.",
        date: new Date().toISOString(),
        memberCreator: { fullName: "Jamie" }
      }],
      actions: [{
        id: "activity-1",
        type: "updateCard",
        date: new Date().toISOString(),
        memberCreator: { fullName: "Maya" },
        data: { card: { name: "Prepare launch checklist" } }
      }],
      attachments: [
        { name: "launch-plan.pdf", mimeType: "application/pdf" },
        { name: "kickoff-transcript.txt", mimeType: "text/plain" },
        { name: "demo-recording.mp4", mimeType: "video/mp4" }
      ],
      customFields: [
        { name: "Priority", value: { text: "High" } },
        { name: "Release window", value: { text: "This week" } }
      ]
    };
  }

  return {
    APP_VERSION: APP_VERSION,
    DEFAULT_UPDATE_MANIFEST_URL: DEFAULT_UPDATE_MANIFEST_URL,
    buildAIPrompt: buildAIPrompt,
    buildRuleBasedAnalysis: buildRuleBasedAnalysis,
    compareVersions: compareVersions,
    createBatchAnalysisPlan: createBatchAnalysisPlan,
    createBatchExecutionReview: createBatchExecutionReview,
    createBatchProgressSnapshot: createBatchProgressSnapshot,
    createCostRecord: createCostRecord,
    createListPlanningBrief: createListPlanningBrief,
    createListTrendSignals: createListTrendSignals,
    createRuntimeTimingRecord: createRuntimeTimingRecord,
    detectSensitiveSignals: detectSensitiveSignals,
    evaluateBudgetAlert: evaluateBudgetAlert,
    evaluateUpdateStatus: evaluateUpdateStatus,
    getOutputModeInstruction: getOutputModeInstruction,
    getOutputModeLabel: getOutputModeLabel,
    getOutputLanguageInstruction: getOutputLanguageInstruction,
    getOutputLanguageLabel: getOutputLanguageLabel,
    normalizeBudgetSettings: normalizeBudgetSettings,
    normalizeOutputMode: normalizeOutputMode,
    normalizeOutputLanguage: normalizeOutputLanguage,
    normalizeCustomFields: normalizeCustomFields,
    normalizeCustomInstructions: normalizeCustomInstructions,
    normalizeExportPreferences: normalizeExportPreferences,
    normalizeGenerationSettings: normalizeGenerationSettings,
    normalizeProviderMode: normalizeProviderMode,
    normalizeProxySettings: normalizeProxySettings,
    normalizeBackendSettings: normalizeBackendSettings,
    backendTransportHeaders: backendTransportHeaders,
    normalizePromptTemplates: normalizePromptTemplates,
    normalizePromptTemplateSettings: normalizePromptTemplateSettings,
    normalizeProviderKey: normalizeProviderKey,
    normalizePriorFeedback: normalizePriorFeedback,
    normalizePromptContext: normalizePromptContext,
    normalizeUpdateManifest: normalizeUpdateManifest,
    stripApiKeysForLocalPreview: stripApiKeysForLocalPreview,
    markdownForBatchAnalysisPlan: markdownForBatchAnalysisPlan,
    markdownForBatchHandoffReport: markdownForBatchHandoffReport,
    markdownForBatchManualRunChecklist: markdownForBatchManualRunChecklist,
    markdownForAnalysis: markdownForAnalysis,
    normalizeAIAnalysis: normalizeAIAnalysis,
    normalizeActions: normalizeActions,
    normalizeAttachments: normalizeAttachments,
    normalizeCardData: normalizeCardData,
    shouldSkipSensitiveAttachmentTextExtraction: shouldSkipSensitiveAttachmentTextExtraction,
    markdownForListPlanningBrief: markdownForListPlanningBrief,
    sampleCardData: sampleCardData,
    summarizeMonthlyProviderCosts: summarizeMonthlyProviderCosts,
    summarizeRuntimeTimingRecords: summarizeRuntimeTimingRecords
  };
}));
