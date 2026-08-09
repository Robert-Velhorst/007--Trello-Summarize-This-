// Card intelligence ledger helpers for the active Trello Power-Up runtime.

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CardIntelligenceLedger = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BLOCKER_WORDS = [
    "blocked", "blocker", "waiting", "stuck", "missing", "cannot", "can't",
    "dependency", "issue", "problem", "need approval", "needs approval",
    "pending", "no response", "external", "invoice", "payment"
  ];
  var WAITING_WORDS = [
    "waiting", "wait on", "waiting on", "pending", "no response", "blocked until",
    "depends on", "dependent on", "dependency", "external", "client reply", "approval",
    "confirm", "invoice", "payment"
  ];
  var ROBERT_DECISION_WORDS = [
    "robert", "approve", "approval", "decision", "decide", "confirm",
    "permission", "budget", "payment", "invoice", "legal", "client",
    "yes/no", "go/no-go", "sign off", "sign-off"
  ];
  var VA_ACTION_WORDS = [
    "collect", "prepare", "draft", "follow up", "follow-up", "update",
    "attach", "screenshot", "check", "verify", "document", "status",
    "send", "schedule", "organize", "clean", "copy"
  ];
  var UNCLEAR_WORDS = [
    "contradict", "conflict", "conflicting", "unclear", "ambiguous",
    "ambiguity", "inconsistent", "mismatch", "does not match", "cannot verify"
  ];

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\s+/g, " ").trim();
  }

  function limitText(value, max) {
    var text = cleanText(value);
    return text.length > max ? text.slice(0, max - 1).trim() + "..." : text;
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function shortHash(value) {
    var text = cleanText(value);
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
  }

  function nowIso(options) {
    return options && options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  }

  function normalizeName(value) {
    if (!value) return "";
    if (typeof value === "string") return cleanText(value);
    return cleanText(value.name || value.fullName || value.username || value.color || value.id);
  }

  function normalizeNames(items) {
    return toArray(items).map(normalizeName).filter(Boolean);
  }

  function normalizeComments(comments) {
    return toArray(comments).map(function (comment, index) {
      if (typeof comment === "string") {
        return {
          id: "comment-" + (index + 1),
          text: cleanText(comment),
          date: "",
          author: ""
        };
      }

      var data = comment.data || {};
      var creator = comment.memberCreator || {};
      return {
        id: cleanText(comment.id || "comment-" + (index + 1)),
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
          text: cleanText(action).slice(0, 220),
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
        text: text.slice(0, 220),
        date: action.date || action.createdAt || "",
        author: cleanText(creator.fullName || creator.username || action.author)
      };
    }).filter(function (action) {
      return action.text || action.type;
    }).slice(0, 25);
  }

  function normalizeChecklists(checklists) {
    return toArray(checklists).map(function (checklist, checklistIndex) {
      return {
        id: cleanText(checklist.id || "checklist-" + (checklistIndex + 1)),
        name: cleanText(checklist.name || "Checklist"),
        items: toArray(checklist.checkItems || checklist.items).map(function (item, itemIndex) {
          return {
            id: cleanText(item.id || "checkitem-" + (checklistIndex + 1) + "-" + (itemIndex + 1)),
            name: cleanText(item.name || item.text || "Checklist item"),
            complete: item.state === "complete" || item.checked === true
          };
        })
      };
    });
  }

  function normalizeAttachments(attachments) {
    return toArray(attachments).map(function (attachment, index) {
      if (typeof attachment === "string") {
        attachment = { name: attachment };
      }
      var error = cleanText(attachment.error);
      var extractedText = cleanText(attachment.extractedText || attachment.text);
      var extractedTextPreview = extractedText
        ? limitText(extractedText, 700)
        : cleanText(attachment.extractedTextPreview);
      var extractedTextAvailable = Boolean(extractedText || attachment.extractedTextAvailable);
      var processed = attachment.processed === true;
      var extractionStatus = cleanText(attachment.extractionStatus || attachment.status);
      var status = error ? "failed" : extractedTextAvailable ? "text-extracted" : extractionStatus || (processed ? "metadata-only" : "not-extracted");
      return {
        id: cleanText(attachment.id || "attachment-" + (index + 1)),
        name: cleanText(attachment.name || "Attachment"),
        mimeType: cleanText(attachment.mimeType || attachment.type),
        extension: getAttachmentExtension(attachment),
        category: classifyAttachment(attachment),
        bytes: toNumber(attachment.bytes || attachment.size),
        processed: processed,
        extractedTextAvailable: extractedTextAvailable,
        extractedTextPreview: extractedTextPreview,
        status: status,
        error: error,
        url: cleanText(attachment.url)
      };
    }).filter(function (attachment) {
      return attachment.name;
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

  function summarizeAttachmentCategories(attachments) {
    var counts = {};
    toArray(attachments).forEach(function (attachment) {
      var category = attachment.category || "file";
      counts[category] = (counts[category] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function (category) {
      return counts[category] + " " + category + (counts[category] === 1 ? "" : "s");
    }).join(", ");
  }

  function createAttachmentFacts(cardOrRun) {
    var card = cardOrRun && cardOrRun.cardSnapshot
      && Array.isArray(cardOrRun.cardSnapshot.attachments)
      ? cardOrRun.cardSnapshot
      : normalizeCard(cardOrRun || {});
    var attachments = normalizeAttachments(card.attachments || []);
    var extracted = attachments.filter(function (attachment) {
      return attachment.extractedTextAvailable;
    });
    var failed = attachments.filter(function (attachment) {
      return attachment.status === "failed" || attachment.error;
    });
    var metadataOnly = attachments.filter(function (attachment) {
      return !attachment.extractedTextAvailable && attachment.status !== "failed";
    });
    var facts = attachments.slice(0, 8).map(function (attachment) {
      var statusLabel = attachment.extractedTextAvailable
        ? "text extracted"
        : attachment.status === "failed"
          ? "failed"
          : "metadata only";
      var detail = attachment.name + " [" + attachment.category + "; " + statusLabel + "]";
      if (attachment.extractedTextPreview) detail += ": " + limitText(attachment.extractedTextPreview, 180);
      if (attachment.error) detail += " (" + attachment.error + ")";
      return {
        id: attachment.id,
        name: attachment.name,
        category: attachment.category,
        status: attachment.status,
        extractedTextAvailable: attachment.extractedTextAvailable,
        detail: detail
      };
    });

    return {
      total: attachments.length,
      extracted: extracted.length,
      metadataOnly: metadataOnly.length,
      failed: failed.length,
      categories: summarizeAttachmentCategories(attachments) || "none",
      facts: facts,
      summary: attachments.length
        ? attachments.length + " attachment(s): " + extracted.length + " text extracted, " + metadataOnly.length + " metadata-only, " + failed.length + " failed."
        : "No attachments were available."
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
        value: cleanText(value).slice(0, 180)
      };
    }).filter(function (field) {
      return field.name || field.value;
    }).slice(0, 25);
  }

  function normalizePriorFeedback(records) {
    return toArray(records).map(function (record) {
      return {
        rating: cleanText(record.rating),
        correctionText: cleanText(record.correctionText).slice(0, 260),
        incorrectSections: toArray(record.incorrectSections).map(cleanText).filter(Boolean).slice(0, 8),
        createdAt: record.createdAt || "",
        acceptedAt: record.acceptedAt || null
      };
    }).filter(function (record) {
      return record.rating || record.correctionText || record.incorrectSections.length;
    }).slice(0, 5);
  }

  function normalizeListContext(input, currentCardId, currentListName) {
    var source = input || {};
    var cards = toArray(source.cards || source.listCards || source.neighborCards).map(function (card) {
      return {
        id: cleanText(card.id),
        name: cleanText(card.name || card.title || "Untitled card"),
        labels: normalizeNames(card.labels).slice(0, 6),
        due: card.due || null,
        dueComplete: Boolean(card.dueComplete),
        listName: normalizeName(card.list) || cleanText(card.listName)
      };
    }).filter(function (card) {
      return card.name;
    }).slice(0, 25);
    var currentIndex = currentCardId
      ? cards.findIndex(function (card) { return card.id === currentCardId; })
      : -1;
    var neighboringCards = currentIndex >= 0
      ? cards.slice(Math.max(0, currentIndex - 2), currentIndex).concat(cards.slice(currentIndex + 1, currentIndex + 3))
      : cards.slice(0, 4);

    return {
      enabled: source.enabled !== false,
      listName: cleanText(source.listName || currentListName),
      totalCards: toNumber(source.totalCards) || cards.length,
      sampledCards: cards.length,
      currentPosition: currentIndex >= 0 ? currentIndex + 1 : null,
      neighboringCards: neighboringCards.map(function (card) {
        return {
          name: card.name,
          labels: card.labels.slice(0, 4),
          due: card.due,
          dueComplete: card.dueComplete
        };
      }),
      labelPatterns: topLabelsFromCards(cards),
      source: cleanText(source.source)
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

  function getObjectId(value) {
    if (!value) return "";
    if (typeof value === "string") return "";
    return cleanText(value.id);
  }

  function getChecklistSummary(checklists) {
    var total = 0;
    var complete = 0;
    var incompleteItems = [];

    checklists.forEach(function (checklist) {
      checklist.items.forEach(function (item) {
        total += 1;
        if (item.complete) {
          complete += 1;
        } else {
          incompleteItems.push(item.name);
        }
      });
    });

    return {
      total: total,
      complete: complete,
      incomplete: Math.max(total - complete, 0),
      percent: total ? Math.round((complete / total) * 100) : null,
      incompleteItems: incompleteItems.slice(0, 10)
    };
  }

  function normalizeCard(input) {
    var raw = input || {};
    var base = raw.card && typeof raw.card === "object"
      ? Object.assign({}, raw.card, raw)
      : Object.assign({}, raw);
    delete base.card;

    var checklists = normalizeChecklists(base.checklists);
    var attachments = normalizeAttachments(base.attachments || base.attachmentDetails);
    var comments = normalizeComments(base.comments);
    var actions = normalizeActions(base.actions || base.activity);
    var badges = base.badges || {};
    var checklistSummary = getChecklistSummary(checklists);
    var listName = normalizeName(base.list) || cleanText(base.listName);

    if (!checklistSummary.total && badges.checkItems) {
      checklistSummary.total = toNumber(badges.checkItems);
      checklistSummary.complete = toNumber(badges.checkItemsChecked);
      checklistSummary.incomplete = Math.max(checklistSummary.total - checklistSummary.complete, 0);
      checklistSummary.percent = checklistSummary.total
        ? Math.round((checklistSummary.complete / checklistSummary.total) * 100)
        : null;
    }

    return {
      id: cleanText(base.id),
      boardId: getObjectId(base.board) || cleanText(base.idBoard || base.boardId),
      listId: getObjectId(base.list) || cleanText(base.idList || base.listId),
      title: cleanText(base.name || base.title || "Untitled Trello card"),
      description: cleanText(base.desc || base.description),
      labels: normalizeNames(base.labels),
      members: normalizeNames(base.members),
      boardName: normalizeName(base.board) || cleanText(base.boardName),
      listName: listName,
      due: base.due || null,
      dueComplete: Boolean(base.dueComplete),
      url: cleanText(base.url || base.shortUrl || base.shortLink),
      dateLastActivity: base.dateLastActivity || base.lastActivity || null,
      checklists: checklists,
      comments: comments,
      attachments: attachments,
      actions: actions,
      priorFeedback: normalizePriorFeedback(base.priorFeedback || base.feedback || base.previousFeedback),
      checklistSummary: checklistSummary,
      commentCount: comments.length || toNumber(badges.comments),
      attachmentCount: attachments.length || toNumber(badges.attachments),
      customFields: normalizeCustomFields(base.customFields || base.customFieldItems),
      listContext: normalizeListContext(base.listContext || base.boardListContext, cleanText(base.id), listName)
    };
  }

  function createCardSnapshot(input, options) {
    var card = normalizeCard(input);
    return {
      cardId: card.id,
      boardId: card.boardId,
      listId: card.listId,
      capturedAt: nowIso(options),
      title: card.title,
      descriptionHash: shortHash(card.description),
      descriptionPresent: Boolean(card.description),
      checklistSummary: card.checklistSummary,
      commentCount: card.commentCount,
      activityCount: card.actions.length,
      attachmentCount: card.attachmentCount,
      attachmentCategories: summarizeAttachmentCategories(card.attachments),
      linkedDocumentCount: card.attachments.filter(function (attachment) { return ["document", "spreadsheet", "presentation"].indexOf(attachment.category) !== -1; }).length,
      transcriptCount: card.attachments.filter(function (attachment) { return attachment.category === "transcript"; }).length,
      recordingCount: card.attachments.filter(function (attachment) { return attachment.category === "recording"; }).length,
      priorFeedbackCount: card.priorFeedback.length,
      customFieldCount: card.customFields.length,
      due: card.due,
      dueComplete: card.dueComplete,
      labels: card.labels.slice(0, 25),
      members: card.members.slice(0, 25),
      boardName: card.boardName,
      listName: card.listName,
      listContext: card.listContext && card.listContext.sampledCards ? card.listContext : null,
      url: card.url,
      sourceCompleteness: scoreSourceCompleteness(card),
      sourceCoverage: createSourceCoverage(input)
    };
  }

  function createInputHash(input) {
    return shortHash(JSON.stringify(snapshotForInputHash(createCardSnapshot(input, {
      now: "2000-01-01T00:00:00.000Z"
    }))));
  }

  function snapshotForInputHash(snapshot) {
    var copy = Object.assign({}, snapshot || {});
    delete copy.capturedAt;
    return copy;
  }

  function createSourceCoverage(input) {
    var card = normalizeCard(input);
    var raw = input || {};
    var status = raw.__sourceStatus || {};
    var items = [];

    addCoverage(items, "card", "Card fields", statusFromRead(status.card, Boolean(card.id || card.title), "Card title, description, labels, due date, and badges were available."));
    addCoverage(items, "description", "Description", card.description
      ? coverage("available", "Description text was included.")
      : coverage("missing", "No description text was available."));
    addCoverage(items, "board", "Board", statusFromRead(status.board, Boolean(card.boardName), card.boardName ? "Board context: " + card.boardName + "." : "Board context was not available."));
    addCoverage(items, "list", "List", statusFromRead(status.list, Boolean(card.listName), card.listName ? "List context: " + card.listName + "." : "List context was not available."));
    addCoverage(items, "listContext", "List context", listContextCoverage(status.listContext, card.listContext));
    addCoverage(items, "members", "Members", card.members.length
      ? coverage("available", card.members.length + " member(s) included.")
      : coverage("missing", "No assigned members were visible."));
    addCoverage(items, "labels", "Labels", card.labels.length
      ? coverage("available", card.labels.length + " label(s) included.")
      : coverage("missing", "No labels were visible."));
    addCoverage(items, "due", "Due date", card.due
      ? coverage("available", card.dueComplete ? "Due date is complete." : "Due date is present.")
      : coverage("missing", "No due date was set."));
    addCoverage(items, "checklists", "Checklists", collectionCoverage(
      card.checklists.length,
      card.checklistSummary.total,
      "checklist",
      "checklist item",
      "No checklist details were available."
    ));
    addCoverage(items, "comments", "Comments", sourceCollectionCoverage(
      status.comments,
      card.comments.length,
      card.commentCount,
      "comment",
      "No comments were available, so history may be incomplete."
    ));
    addCoverage(items, "activity", "Activity", sourceCollectionCoverage(
      status.activity,
      card.actions.length,
      card.actions.length,
      "activity item",
      "No recent activity was available."
    ));
    addCoverage(items, "attachments", "Attachments", attachmentCoverage(card));
    addCoverage(items, "priorFeedback", "Prior feedback", card.priorFeedback.length
      ? coverage("available", card.priorFeedback.length + " prior correction/review item(s) available for this analysis.")
      : coverage("missing", "No prior correction feedback was available for this card."));
    addCoverage(items, "customFields", "Custom fields", sourceCollectionCoverage(
      status.customFields,
      card.customFields.length,
      card.customFields.length,
      "custom field",
      "No custom fields were available."
    ));

    return items;
  }

  function coverage(status, detail) {
    return {
      status: status,
      detail: cleanText(detail)
    };
  }

  function addCoverage(items, key, label, value) {
    items.push({
      key: key,
      label: label,
      status: value.status,
      detail: value.detail
    });
  }

  function statusFromRead(readStatus, hasData, availableDetail) {
    if (readStatus && readStatus.ok === false) {
      return coverage("failed", readStatus.error || "Source could not be read.");
    }
    if (hasData) {
      return coverage("available", availableDetail);
    }
    return coverage("missing", availableDetail);
  }

  function collectionCoverage(collectionCount, reportedCount, collectionLabel, itemLabel, emptyDetail) {
    if (collectionCount > 0) {
      return coverage("available", collectionCount + " " + collectionLabel + "(s), " + reportedCount + " " + itemLabel + "(s) included.");
    }
    if (reportedCount > 0) {
      return coverage("partial", "Trello reported " + reportedCount + " " + itemLabel + "(s), but detailed " + collectionLabel + " data was not loaded.");
    }
    return coverage("missing", emptyDetail);
  }

  function sourceCollectionCoverage(readStatus, loadedCount, reportedCount, label, emptyDetail) {
    if (readStatus && readStatus.ok === false) {
      return coverage("failed", readStatus.error || label + " data could not be read.");
    }
    if (loadedCount > 0) {
      return coverage("available", loadedCount + " " + label + "(s) included.");
    }
    if (reportedCount > 0) {
      return coverage("partial", "Trello reported " + reportedCount + " " + label + "(s), but details were not loaded.");
    }
    return coverage("missing", emptyDetail);
  }

  function listContextCoverage(readStatus, listContext) {
    if (readStatus && readStatus.ok === false) {
      return coverage("failed", readStatus.error || "List context could not be read.");
    }
    if (listContext && listContext.enabled === false) {
      return coverage("missing", "List context is disabled in settings.");
    }
    if (listContext && listContext.sampledCards > 0) {
      var detail = listContext.sampledCards + " card(s) sampled from " + (listContext.listName || "the current list") + ".";
      if (listContext.currentPosition) {
        detail += " Current card position: " + listContext.currentPosition + " of " + listContext.totalCards + ".";
      }
      if (listContext.labelPatterns.length) {
        detail += " Common labels: " + listContext.labelPatterns.map(function (item) {
          return item.label + " (" + item.count + ")";
        }).join(", ") + ".";
      }
      return coverage("available", detail);
    }
    return coverage("missing", "No neighboring list-card context was available.");
  }

  function attachmentCoverage(card) {
    var extracted = card.attachments.filter(function (attachment) {
      return attachment.extractedTextAvailable;
    }).length;
    var failed = card.attachments.filter(function (attachment) {
      return attachment.error;
    }).length;

    if (card.attachments.length > 0 && extracted > 0) {
      return coverage("available", card.attachments.length + " attachment(s) included; " + extracted + " had extracted text. Metadata types: " + summarizeAttachmentCategories(card.attachments) + ".");
    }
    if (card.attachments.length > 0) {
      return coverage("partial", card.attachments.length + " attachment(s) included as metadata only; " + failed + " failed extraction. Metadata types: " + summarizeAttachmentCategories(card.attachments) + ".");
    }
    if (card.attachmentCount > 0) {
      return coverage("partial", "Trello reported " + card.attachmentCount + " attachment(s), but attachment details were not loaded.");
    }
    return coverage("missing", "No attachments were available.");
  }

  function createEvidenceMap(input) {
    var card = normalizeCard(input);
    var evidence = [];

    addEvidence(evidence, "title", "Card title", card.title, "card.title");
    addEvidence(evidence, "description", "Card description", card.description, "card.description");
    addEvidence(evidence, "board", "Board", card.boardName, "card.board");
    addEvidence(evidence, "list", "Current list", card.listName, "card.list");
    addListContextEvidence(evidence, card.listContext);
    addEvidence(evidence, "due", "Due date", card.due ? card.due + (card.dueComplete ? " (complete)" : "") : "", "card.due");

    card.labels.forEach(function (label, index) {
      addEvidence(evidence, "label", "Label", label, "card.labels[" + index + "]");
    });

    card.members.forEach(function (member, index) {
      addEvidence(evidence, "member", "Member", member, "card.members[" + index + "]");
    });

    card.checklists.forEach(function (checklist, checklistIndex) {
      checklist.items.forEach(function (item, itemIndex) {
        addEvidence(
          evidence,
          "checklist",
          checklist.name,
          (item.complete ? "Complete: " : "Open: ") + item.name,
          "card.checklists[" + checklistIndex + "].items[" + itemIndex + "]"
        );
      });
    });

    card.comments.slice(0, 12).forEach(function (comment, index) {
      addEvidence(
        evidence,
        "comment",
        comment.author ? "Comment by " + comment.author : "Comment",
        comment.text,
        "card.comments[" + index + "]"
      );
    });

    card.actions.slice(0, 12).forEach(function (action, index) {
      var detail = action.type + (action.author ? " by " + action.author : "") + (action.text ? ": " + action.text : "");
      addEvidence(evidence, "activity", "Activity", detail, "card.actions[" + index + "]");
    });

    card.attachments.forEach(function (attachment, index) {
      var detail = attachment.name + " [" + attachment.category + "]";
      if (attachment.extractedTextAvailable) detail += " (text extracted)";
      else if (attachment.error) detail += " (failed: " + attachment.error + ")";
      else if (attachment.processed) detail += " (metadata only)";
      else detail += " (not extracted)";
      if (attachment.extractedTextPreview) detail += ": " + attachment.extractedTextPreview;
      addEvidence(evidence, "attachment", "Attachment", detail, "card.attachments[" + index + "]");
    });

    card.customFields.forEach(function (field, index) {
      var detail = field.name + (field.value ? ": " + field.value : "");
      addEvidence(evidence, "custom-field", "Custom field", detail, "card.customFields[" + index + "]");
    });

    return evidence;
  }

  function addListContextEvidence(evidence, listContext) {
    if (!listContext || !listContext.sampledCards) return;
    var parts = [
      listContext.sampledCards + " sampled card(s) in " + (listContext.listName || "the current list")
    ];
    if (listContext.currentPosition) {
      parts.push("current card position " + listContext.currentPosition + " of " + listContext.totalCards);
    }
    if (listContext.neighboringCards.length) {
      parts.push("nearby cards: " + listContext.neighboringCards.map(function (card) {
        return card.name;
      }).join("; "));
    }
    if (listContext.labelPatterns.length) {
      parts.push("common labels: " + listContext.labelPatterns.map(function (item) {
        return item.label + " (" + item.count + ")";
      }).join(", "));
    }
    addEvidence(evidence, "list-context", "List context", parts.join(". "), "card.listContext");
  }

  function addEvidence(evidence, type, label, excerpt, path) {
    var text = cleanText(excerpt);
    if (!text) return;
    evidence.push({
      id: "ev-" + (evidence.length + 1),
      type: type,
      label: cleanText(label),
      excerpt: text.length > 220 ? text.slice(0, 217).trim() + "..." : text,
      path: path
    });
  }

  function findEvidenceIds(evidence, types) {
    return evidence.filter(function (item) {
      return types.indexOf(item.type) !== -1;
    }).slice(0, 6).map(function (item) {
      return item.id;
    });
  }

  function createEvidenceClaims(summary, evidence, options) {
    var claims = [];
    var unverifiedAi = Boolean(options && options.unverifiedAi);
    var sections = [
      { key: "about", title: "Card overview", types: ["title", "description", "label"] },
      { key: "history", title: "History", types: ["comment", "activity", "checklist", "attachment"] },
      { key: "status", title: "Current status", types: ["list", "due", "checklist", "member", "custom-field"] }
    ];

    sections.forEach(function (section) {
      var text = cleanText(summary && summary[section.key]);
      if (!text) return;
      var support = unverifiedAi ? [] : findEvidenceIds(evidence, section.types);
      claims.push({
        id: "claim-" + section.key,
        section: section.key,
        claim: text.length > 260 ? text.slice(0, 257).trim() + "..." : text,
        support: support,
        confidence: support.length ? "supported" : "uncertain"
      });
    });

    toArray(summary && summary.evidenceClaims).forEach(function (item, index) {
      var claim = typeof item === "string" ? cleanText(item) : cleanText(item && item.claim);
      if (!claim) return;
      claims.push({
        id: "claim-ai-" + (index + 1),
        section: "ai-evidence",
        claim: claim.length > 260 ? claim.slice(0, 257).trim() + "..." : claim,
        support: [],
        confidence: "uncertain",
        source: cleanText(item && item.source)
      });
    });

    return claims;
  }

  function includesAny(text, words) {
    var lower = cleanText(text).toLowerCase();
    return words.some(function (word) {
      return lower.indexOf(word) !== -1;
    });
  }

  function makeItem(id, text, sourceIds, extra) {
    return Object.assign({
      id: id,
      text: cleanText(text),
      sourceIds: toArray(sourceIds)
    }, extra || {});
  }

  function extractBlockers(input, summary, evidence, options) {
    var card = normalizeCard(input);
    var blockers = [];
    var sourceText = [
      card.title,
      card.description,
      toArray(summary && summary.blockers).join(" "),
      toArray(summary && summary.risks).join(" "),
      card.comments.map(function (comment) { return comment.text; }).join(" ")
    ].join(" ");

    toArray(summary && summary.blockers).forEach(function (text, index) {
      blockers.push(makeItem("blocker-ai-" + (index + 1), text, findEvidenceIds(evidence, ["description", "comment", "checklist", "attachment"]), {
        severity: includesAny(text, ["legal", "payment", "invoice", "overdue", "client"]) ? "high" : "medium",
        type: "ai-structured"
      }));
    });

    if (includesAny(sourceText, BLOCKER_WORDS)) {
      blockers.push(makeItem("blocker-text", "Card text or comments mention a blocker, waiting state, missing item, or external dependency.", findEvidenceIds(evidence, ["description", "comment"]), {
        severity: "medium",
        type: "text-signal"
      }));
    }

    if (!card.description) {
      blockers.push(makeItem("blocker-description", "Missing description makes scope, acceptance criteria, and handoff unclear.", findEvidenceIds(evidence, ["title"]), {
        severity: "medium",
        type: "missing-context"
      }));
    }

    if (!card.members.length) {
      blockers.push(makeItem("blocker-owner", "No visible owner is assigned.", findEvidenceIds(evidence, ["title", "list"]), {
        severity: "medium",
        type: "missing-owner"
      }));
    }

    var dueState = getDueState(card);
    if (dueState === "overdue") {
      blockers.push(makeItem("blocker-overdue", "The card is overdue and needs priority review.", findEvidenceIds(evidence, ["due"]), {
        severity: "high",
        type: "deadline"
      }));
    }

    if (card.checklistSummary.incomplete > 0 && card.checklistSummary.percent !== null && card.checklistSummary.percent < 50) {
      blockers.push(makeItem("blocker-progress", "Less than half of the checklist is complete.", findEvidenceIds(evidence, ["checklist"]), {
        severity: "medium",
        type: "progress"
      }));
    }

    var activityAge = getActivityAge(card, options);
    if (activityAge.veryStale) {
      blockers.push(makeItem("blocker-stale-activity", "No visible card activity has been recorded for " + activityAge.days + " days; status should be refreshed before acting.", findEvidenceIds(evidence, ["activity", "comment", "list", "due"]), {
        severity: "medium",
        type: "stale-activity"
      }));
    }

    card.attachments.forEach(function (attachment, index) {
      if (attachment.error || (attachment.processed && !attachment.extractedTextAvailable)) {
        blockers.push(makeItem("blocker-attachment-" + index, "Attachment content was not fully extracted: " + attachment.name + ".", findEvidenceIds(evidence, ["attachment"]), {
          severity: "low",
          type: "attachment"
        }));
      }
    });

    return dedupeItems(blockers);
  }

  function extractWaitingOn(input, summary, evidence, blockers) {
    var card = normalizeCard(input);
    var waiting = [];
    var sourceText = [
      card.title,
      card.description,
      cleanText(summary && (summary.status || summary.currentStatus)),
      toArray(summary && summary.waitingOn).join(" "),
      toArray(summary && summary.blockers).join(" "),
      toArray(summary && summary.risks).join(" "),
      card.comments.map(function (comment) { return comment.text; }).join(" "),
      card.actions.map(function (action) { return action.text; }).join(" ")
    ].join(" ");

    toArray(summary && summary.waitingOn).forEach(function (text, index) {
      var cleaned = cleanText(text);
      if (!cleaned) return;
      waiting.push(makeItem("waiting-ai-" + (index + 1), cleaned, findEvidenceIds(evidence, ["description", "comment", "activity", "checklist", "attachment"]), {
        owner: detectWaitingOwner(cleaned, card),
        severity: includesAny(cleaned, ["legal", "payment", "invoice", "overdue", "client"]) ? "high" : "medium",
        category: "ai-structured"
      }));
    });

    toArray(blockers).forEach(function (item, index) {
      var text = cleanText(item && item.text);
      if (!includesAny(text, WAITING_WORDS)) return;
      waiting.push(makeItem("waiting-blocker-" + (index + 1), text, item.sourceIds || findEvidenceIds(evidence, ["description", "comment"]), {
        owner: detectWaitingOwner(text, card),
        severity: item.severity || "medium",
        category: "blocker"
      }));
    });

    if (includesAny(sourceText, WAITING_WORDS)) {
      waiting.push(makeItem("waiting-text", "Card appears to be waiting on an approval, reply, missing input, or external dependency.", findEvidenceIds(evidence, ["description", "comment", "activity"]), {
        owner: detectWaitingOwner(sourceText, card),
        severity: includesAny(sourceText, ["legal", "payment", "invoice", "overdue", "client"]) ? "high" : "medium",
        category: "text-signal"
      }));
    }

    return dedupeItems(waiting).slice(0, 6);
  }

  function extractUnclearPoints(input, summary, evidence, blockers, waitingOn) {
    var card = normalizeCard(input);
    var points = [];
    var sourceText = [
      card.title,
      card.description,
      cleanText(summary && (summary.status || summary.currentStatus)),
      toArray(summary && summary.completedWork).join(" "),
      toArray(summary && summary.blockers).join(" "),
      toArray(summary && summary.waitingOn).join(" "),
      toArray(summary && summary.risks).join(" "),
      card.comments.map(function (comment) { return comment.text; }).join(" "),
      card.actions.map(function (action) { return action.text; }).join(" ")
    ].join(" ");

    toArray(summary && summary.unclearPoints).forEach(function (text, index) {
      var cleaned = cleanText(text);
      if (!cleaned) return;
      points.push(makeItem("unclear-ai-" + (index + 1), cleaned, findEvidenceIds(evidence, ["title", "description", "comment", "activity", "checklist", "attachment", "custom-field"]), {
        severity: includesAny(cleaned, ["legal", "payment", "invoice", "client", "conflict", "contradict"]) ? "high" : "medium",
        category: "ai-structured"
      }));
    });

    toArray(summary && summary.validationFindings).forEach(function (text, index) {
      var cleaned = cleanText(text);
      if (!includesAny(cleaned, UNCLEAR_WORDS)) return;
      points.push(makeItem("unclear-validation-" + (index + 1), cleaned, findEvidenceIds(evidence, ["title", "description", "comment", "checklist", "attachment"]), {
        severity: includesAny(cleaned, ["legal", "payment", "invoice", "client"]) ? "high" : "medium",
        category: "validation"
      }));
    });

    if (card.dueComplete && card.checklistSummary.incomplete > 0) {
      points.push(makeItem("unclear-due-checklist", "Due date is marked complete, but " + card.checklistSummary.incomplete + " checklist item(s) remain open.", findEvidenceIds(evidence, ["due", "checklist"]), {
        severity: "high",
        category: "status-conflict"
      }));
    }

    if (hasCompletionClaim(sourceText) && (toArray(blockers).length || toArray(waitingOn).length || card.checklistSummary.incomplete > 0)) {
      points.push(makeItem("unclear-complete-vs-open", "Card text suggests completion, but blockers, waiting states, or open checklist items still exist.", findEvidenceIds(evidence, ["description", "comment", "activity", "checklist"]), {
        severity: "medium",
        category: "status-conflict"
      }));
    }

    return dedupeItems(points).slice(0, 6);
  }

  function hasCompletionClaim(text) {
    var lower = cleanText(text).toLowerCase();
    return /\b(card|task|work|this|it)\s+(is\s+)?(done|complete|completed|finished|closed)\b/.test(lower) ||
      /\b(all done|ready to ship|ready to send|ready for release|marked complete)\b/.test(lower);
  }

  function getDueState(card) {
    if (!card.due || card.dueComplete) return "none";
    var due = new Date(card.due);
    if (Number.isNaN(due.getTime())) return "unknown";
    return due.getTime() < Date.now() ? "overdue" : "scheduled";
  }

  function getActivityAge(card, options) {
    var now = options && options.now ? new Date(options.now) : new Date();
    if (Number.isNaN(now.getTime())) now = new Date();
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
        days: null,
        stale: false,
        veryStale: false
      };
    }

    var days = Math.max(0, Math.floor((now.getTime() - latest.getTime()) / 86400000));
    return {
      known: true,
      days: days,
      latestAt: latest.toISOString(),
      stale: days >= 14,
      veryStale: days >= 30
    };
  }

  function extractNextActions(input, summary, evidence) {
    var card = normalizeCard(input);
    var actions = [];
    toArray(summary && summary.nextSteps).forEach(function (step, index) {
      actions.push(makeItem("next-" + (index + 1), step, findEvidenceIds(evidence, ["checklist", "description", "comment"]), {
        owner: detectOwner(step, card),
        priority: index === 0 ? "high" : "normal"
      }));
    });

    card.checklistSummary.incompleteItems.slice(0, 5).forEach(function (item, index) {
      if (!actions.some(function (action) { return action.text.toLowerCase() === item.toLowerCase(); })) {
        actions.push(makeItem("next-checklist-" + (index + 1), item, findEvidenceIds(evidence, ["checklist"]), {
          owner: detectOwner(item, card),
          priority: "normal"
        }));
      }
    });

    return actions.length ? actions.slice(0, 8) : [
      makeItem("next-confirm", "Confirm whether the card is complete or add the next concrete action.", findEvidenceIds(evidence, ["title", "list"]), {
        owner: card.members[0] || "",
        priority: "normal"
      })
    ];
  }

  function detectOwner(text, card) {
    var lower = cleanText(text).toLowerCase();
    if (lower.indexOf("robert") !== -1) return "Robert";
    if (lower.indexOf("va") !== -1 || lower.indexOf("assistant") !== -1) return "VA/team";
    return card.members[0] || "";
  }

  function detectWaitingOwner(text, card) {
    var lower = cleanText(text).toLowerCase();
    if (lower.indexOf("robert") !== -1) return "Robert";
    if (lower.indexOf("va") !== -1 || lower.indexOf("assistant") !== -1) return "VA/team";
    if (includesAny(lower, ["client", "customer", "external", "vendor", "supplier", "partner", "no response", "reply"])) return "External party";
    if (includesAny(lower, ["invoice", "payment", "budget"])) return "Robert/finance";
    return card.members[0] || "Owner to confirm";
  }

  function extractRobertDecisions(input, summary, evidence) {
    var sources = []
      .concat(toArray(summary && summary.robertDecisions))
      .concat(toArray(summary && summary.nextSteps))
      .concat(toArray(summary && summary.recommendations))
      .concat(toArray(summary && summary.risks));
    var decisions = [];

    sources.forEach(function (text, index) {
      if (!includesAny(text, ROBERT_DECISION_WORDS)) return;
      var cleaned = cleanText(text);
      decisions.push(makeItem("decision-" + (index + 1), "Approve: Yes/No - " + cleaned, findEvidenceIds(evidence, ["description", "comment", "due", "attachment"]), {
        requiredBy: "Robert",
        reason: "Contains approval, decision, client, financial, legal, or Robert-specific wording.",
        riskLevel: includesAny(cleaned, ["payment", "invoice", "budget", "legal", "client"]) ? "high" : "medium"
      }));
    });

    return dedupeItems(decisions).slice(0, 5);
  }

  function extractVaReadyActions(input, summary, evidence) {
    var actions = [];
    toArray(summary && summary.vaReadyActions).forEach(function (text, index) {
      var cleaned = cleanText(text);
      if (!cleaned) return;
      actions.push(makeItem("va-ai-" + (index + 1), cleaned, findEvidenceIds(evidence, ["checklist", "description", "comment"]), {
        owner: "VA/team",
        needsRobert: false
      }));
    });

    toArray(summary && summary.nextSteps).forEach(function (text, index) {
      var cleaned = cleanText(text);
      if (!cleaned || includesAny(cleaned, ROBERT_DECISION_WORDS)) return;
      if (!includesAny(cleaned, VA_ACTION_WORDS)) return;
      actions.push(makeItem("va-" + (index + 1), cleaned, findEvidenceIds(evidence, ["checklist", "description", "comment"]), {
        owner: "VA/team",
        needsRobert: false
      }));
    });

    return dedupeItems(actions).slice(0, 6);
  }

  function createValidationFindings(input, summary, evidence, blockers, decisions, options) {
    var card = normalizeCard(input);
    var findings = [];

    toArray(summary && summary.validationFindings).forEach(function (text, index) {
      findings.push(finding("ai-validation-" + (index + 1), includesAny(text, ["unsupported", "conflict", "sensitive", "legal", "financial"]) ? "high" : "medium", text, findEvidenceIds(evidence, ["title", "description", "comment", "checklist", "attachment"])));
    });

    if (options && options.unverifiedAi) {
      findings.push(finding("ai-output-unverified", "high", "AI-generated wording and claimed evidence are unverified. Confirm against the card sources before acting.", []));
      toArray(summary && summary.inferences).forEach(function (text, index) {
        findings.push(finding("ai-inference-" + (index + 1), "medium", "Inference (not a verified fact): " + text, []));
      });
      toArray(summary && summary.uncertainty).forEach(function (text, index) {
        findings.push(finding("ai-uncertainty-" + (index + 1), "medium", "Uncertainty: " + text, []));
      });
      toArray(summary && summary.unsupportedClaims).forEach(function (text, index) {
        findings.push(finding("ai-unsupported-" + (index + 1), "high", "Unsupported claim: " + text, []));
      });
    }

    if (!card.description) {
      findings.push(finding("missing-description", "medium", "Card has no description; analysis is based on weaker context.", findEvidenceIds(evidence, ["title"])));
    }
    if (!card.commentCount) {
      findings.push(finding("no-comments", "low", "No comments were available, so history may be incomplete.", findEvidenceIds(evidence, ["title", "description"])));
    }
    if (card.attachmentCount && !card.attachments.some(function (attachment) { return attachment.extractedTextAvailable; })) {
      findings.push(finding("attachments-metadata-only", "medium", "Attachments are present but no attachment text was verified as extracted.", findEvidenceIds(evidence, ["attachment"])));
    }
    if (card.attachments.some(function (attachment) { return attachment.category === "transcript" && !attachment.extractedTextAvailable; })) {
      findings.push(finding("attachment-transcript-unverified", "medium", "Transcript-like attachment metadata is present, but transcript text was not verified as extracted.", findEvidenceIds(evidence, ["attachment"])));
    }
    if (card.attachments.some(function (attachment) { return attachment.category === "recording" && !attachment.extractedTextAvailable; })) {
      findings.push(finding("attachment-recording-unverified", "medium", "Recording-like attachment metadata is present, but recording contents were not processed.", findEvidenceIds(evidence, ["attachment"])));
    }
    if (!toArray(summary && summary.nextSteps).length) {
      findings.push(finding("missing-next-actions", "medium", "Analysis did not provide specific next actions.", findEvidenceIds(evidence, ["title", "description"])));
    }
    var activityAge = getActivityAge(card, options);
    if (activityAge.veryStale) {
      findings.push(finding("stale-activity", "medium", "No visible card activity has been recorded for " + activityAge.days + " days; confirm current status before relying on this analysis.", findEvidenceIds(evidence, ["activity", "comment", "list", "due"])));
    } else if (activityAge.stale) {
      findings.push(finding("aging-activity", "low", "No visible card activity has been recorded for " + activityAge.days + " days; status may be aging.", findEvidenceIds(evidence, ["activity", "comment", "list", "due"])));
    }
    if (!blockers.length && (!summary || !toArray(summary.risks).length)) {
      findings.push(finding("no-blockers-reviewed", "low", "No blockers were detected; review manually if the card is messy or high-risk.", findEvidenceIds(evidence, ["title", "description", "comment"])));
    }
    if (decisions.length) {
      findings.push(finding("decision-review", "high", "Robert decision items should be reviewed before acting.", decisions[0].sourceIds));
    }

    return findings;
  }

  function createUnresolvedQuestions(summary, missingInfo, blockers, waitingOn, unclearPoints, decisions, validationFindings, evidence) {
    var questions = [];

    toArray(summary && summary.unresolvedQuestions).forEach(function (item, index) {
      var text = cleanText(item && (item.text || item.question || item));
      if (!text) return;
      questions.push(makeQuestion("question-ai-" + (index + 1), "ai-structured", text, findEvidenceIds(evidence, ["title", "description", "comment", "checklist", "attachment", "custom-field"]), "medium", "Owner to confirm"));
    });

    toArray(missingInfo).forEach(function (item, index) {
      var text = cleanText(item && (item.text || item.claim || item));
      if (!text) return;
      questions.push(makeQuestion("question-missing-" + (index + 1), "missing-info", "Clarify: " + text, item.sourceIds || findEvidenceIds(evidence, ["title", "description", "comment", "attachment"]), item.severity || "medium", "Owner to confirm"));
    });

    toArray(blockers).forEach(function (item, index) {
      var severity = cleanText(item && item.severity);
      if (severity !== "high" && severity !== "medium") return;
      var text = cleanText(item && item.text);
      if (!text) return;
      questions.push(makeQuestion("question-blocker-" + (index + 1), "blocker", "What is needed to clear this blocker? " + text, item.sourceIds, severity, "Owner to confirm"));
    });

    toArray(waitingOn).forEach(function (item, index) {
      var severity = cleanText(item && item.severity);
      if (severity === "low") return;
      var text = cleanText(item && item.text);
      if (!text) return;
      questions.push(makeQuestion("question-waiting-" + (index + 1), "waiting-on", "Who or what must respond to unblock this waiting state? " + text, item.sourceIds, severity || "medium", item.owner || "Owner to confirm"));
    });

    toArray(unclearPoints).forEach(function (item, index) {
      var severity = cleanText(item && item.severity);
      if (severity === "low") return;
      var text = cleanText(item && item.text);
      if (!text) return;
      questions.push(makeQuestion("question-unclear-" + (index + 1), "unclear-point", "Resolve this unclear or conflicting point before acting: " + text, item.sourceIds, severity || "medium", "Reviewer"));
    });

    toArray(decisions).forEach(function (item, index) {
      var text = cleanText(item && item.text);
      if (!text) return;
      questions.push(makeQuestion("question-decision-" + (index + 1), "robert-decision", "Robert decision still open: " + text, item.sourceIds, item.riskLevel || "high", "Robert"));
    });

    toArray(validationFindings).forEach(function (item, index) {
      var severity = cleanText(item && item.severity);
      if (severity === "low") return;
      var text = cleanText(item && item.text);
      if (!text) return;
      questions.push(makeQuestion("question-validation-" + (index + 1), "validation", "Review before relying on this analysis: " + text, item.sourceIds, severity || "medium", "Reviewer"));
    });

    return dedupeItems(questions).slice(0, 10);
  }

  function makeQuestion(id, category, text, sourceIds, severity, owner) {
    return makeItem(id, text, sourceIds, {
      category: cleanText(category),
      severity: cleanText(severity || "medium"),
      owner: cleanText(owner || "")
    });
  }

  function finding(id, severity, text, sourceIds) {
    return {
      id: id,
      severity: severity,
      text: text,
      sourceIds: toArray(sourceIds)
    };
  }

  function scoreSourceCompleteness(card) {
    var score = 20;
    if (card.title && card.title !== "Untitled Trello card") score += 10;
    if (card.description) score += 20;
    if (card.labels.length) score += 8;
    if (card.members.length) score += 10;
    if (card.due) score += 8;
    if (card.listName || card.boardName) score += 8;
    if (card.listContext && card.listContext.sampledCards) score += 4;
    if (card.checklistSummary.total) score += 14;
    if (card.commentCount) score += 12;
    if (card.actions.length) score += 3;
    if (card.attachmentCount) score += 5;
    if (card.customFields.length) score += 4;
    return Math.min(score, 100);
  }

  function calculateConfidence(input, summary, operational) {
    var card = normalizeCard(input);
    var dataCompleteness = scoreSourceCompleteness(card);
    var evidenceCoverage = operational.evidenceClaims.length
      ? Math.round((operational.evidenceClaims.filter(function (claim) { return claim.support.length > 0; }).length / operational.evidenceClaims.length) * 100)
      : 40;
    var actionSpecificity = operational.nextActions.filter(function (action) {
      return action.text.length > 12 && !/^confirm whether/i.test(action.text);
    }).length ? 80 : 45;
    var validationPenalty = operational.validationFindings.reduce(function (penalty, item) {
      if (item.severity === "high") return penalty + 15;
      if (item.severity === "medium") return penalty + 8;
      return penalty + 3;
    }, 0);
    var modelBoost = summary && summary.confidence === "high" ? 5 : 0;
    var overall = Math.round((dataCompleteness * 0.4) + (evidenceCoverage * 0.25) + (actionSpecificity * 0.25) + 10 + modelBoost - validationPenalty);
    overall = Math.max(25, Math.min(overall, 95));

    return {
      overall: overall,
      level: overall >= 80 ? "high" : overall >= 60 ? "medium" : "low",
      factors: {
        dataCompleteness: dataCompleteness,
        evidenceCoverage: evidenceCoverage,
        actionSpecificity: actionSpecificity,
        validationPenalty: validationPenalty
      },
      reviewNeeded: overall < 70 || operational.validationFindings.some(function (item) { return item.severity === "high"; }),
      explanation: buildConfidenceExplanation(dataCompleteness, evidenceCoverage, validationPenalty)
    };
  }

  function buildConfidenceExplanation(dataCompleteness, evidenceCoverage, validationPenalty) {
    var parts = [];
    parts.push("Data completeness " + dataCompleteness + "%.");
    parts.push("Evidence coverage " + evidenceCoverage + "%.");
    if (validationPenalty) parts.push("Validation findings reduce confidence.");
    return parts.join(" ");
  }

  function createTrustSignals(input, operational, options) {
    var coverageItems = createSourceCoverage(input);
    var card = normalizeCard(input);
    var confidence = operational && operational.confidence ? operational.confidence : null;
    var factors = confidence && confidence.factors ? confidence.factors : {};
    var basedOn = [];
    var needsReview = [];

    coverageItems.forEach(function (item) {
      if (item.status === "available" || item.status === "partial") {
        basedOn.push(signal(
          item.key,
          item.status === "partial" ? item.label + " metadata" : item.label,
          item.detail,
          item.status
        ));
      }

      if (item.status === "failed") {
        needsReview.push(signal(item.key + "-failed", item.label + " unavailable", item.detail, "high"));
      } else if (item.status === "partial") {
        needsReview.push(signal(item.key + "-partial", item.label + " incomplete", item.detail, "medium"));
      }
    });

    addMissingContext(needsReview, coverageItems, "description", "No description", "Summary may miss the card purpose.", "medium");
    addMissingContext(needsReview, coverageItems, "members", "No owner", "No assigned member was available.", "medium");
    addMissingContext(needsReview, coverageItems, "comments", "No comments", "Card history may be incomplete.", "medium");
    addMissingContext(needsReview, coverageItems, "due", "No due date", "Deadline risk cannot be assessed from a due date.", "low");
    addMissingContext(needsReview, coverageItems, "checklists", "No checklist detail", "Completion state may be incomplete.", "low");

    var activityAge = getActivityAge(card, options);
    if (activityAge.veryStale) {
      needsReview.push(signal("stale-activity", "Stale activity", "No visible card activity has been recorded for " + activityAge.days + " days.", "medium"));
    } else if (activityAge.stale) {
      needsReview.push(signal("aging-activity", "Aging activity", "No visible card activity has been recorded for " + activityAge.days + " days.", "low"));
    }

    var whyScore = [];
    if (confidence) {
      whyScore.push("Confidence: " + confidence.overall + "% " + confidence.level + ".");
      whyScore.push("Data completeness: " + toNumber(factors.dataCompleteness) + "%.");
      whyScore.push("Evidence coverage: " + toNumber(factors.evidenceCoverage) + "%.");
      whyScore.push("Action specificity: " + toNumber(factors.actionSpecificity) + "%.");
      if (factors.validationPenalty) {
        whyScore.push("Validation penalty: -" + toNumber(factors.validationPenalty) + " point(s).");
      }
      if (confidence.reviewNeeded) {
        whyScore.push("Review needed before relying on this output.");
      }
    } else {
      whyScore.push("Confidence was not calculated for this run.");
    }

    return {
      basedOn: dedupeSignals(basedOn).slice(0, 12),
      needsReview: dedupeSignals(needsReview).slice(0, 12),
      whyScore: whyScore
    };
  }

  function addMissingContext(items, coverageItems, key, label, detail, severity) {
    var coverageItem = coverageItems.find(function (item) { return item.key === key; });
    if (!coverageItem || coverageItem.status !== "missing") return;
    items.push(signal("missing-" + key, label, detail, severity));
  }

  function signal(key, label, detail, status) {
    return {
      key: key,
      label: cleanText(label),
      detail: cleanText(detail),
      status: cleanText(status)
    };
  }

  function dedupeSignals(items) {
    var seen = {};
    return items.filter(function (item) {
      var key = item.key || item.label;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function dedupeItems(items) {
    var seen = {};
    return items.filter(function (item) {
      var key = item.text.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function createOperationalAnalysis(input, summary, options) {
    var evidence = createEvidenceMap(input);
    var normalizedSummary = summary || {};
    var blockers = extractBlockers(input, normalizedSummary, evidence, options);
    var waitingOn = extractWaitingOn(input, normalizedSummary, evidence, blockers);
    var unclearPoints = extractUnclearPoints(input, normalizedSummary, evidence, blockers, waitingOn);
    var nextActions = extractNextActions(input, normalizedSummary, evidence);
    var robertDecisions = extractRobertDecisions(input, normalizedSummary, evidence);
    var vaReadyActions = extractVaReadyActions(input, normalizedSummary, evidence);
    var evidenceClaims = createEvidenceClaims(normalizedSummary, evidence, options);
    var operational = {
      blockers: blockers,
      waitingOn: waitingOn,
      unclearPoints: unclearPoints,
      nextActions: nextActions,
      robertDecisions: robertDecisions,
      vaReadyActions: vaReadyActions,
      evidence: evidence,
      evidenceClaims: evidenceClaims,
      validationFindings: []
    };
    operational.validationFindings = createValidationFindings(input, normalizedSummary, evidence, blockers, robertDecisions, options);
    operational.confidence = calculateConfidence(input, normalizedSummary, operational);
    return operational;
  }

  function createAnalysisRun(input, analysis, options) {
    var card = normalizeCard(input);
    var summary = (analysis && analysis.summary) || analysis || {};
    var operationalOptions = Object.assign({}, options || {}, {
      unverifiedAi: Boolean(analysis && analysis.source === "ai")
    });
    var operational = createOperationalAnalysis(input, summary, operationalOptions);
    var timestamp = nowIso(options);
    var runId = "run-" + shortHash(card.id + timestamp + JSON.stringify(summary));
    var outputMode = normalizeOutputMode(options && options.outputMode);
    var outputLanguage = normalizeOutputLanguage(options && options.outputLanguage);
    var cardSnapshot = createCardSnapshot(input, options);
    var missingInfo = toArray(summary.missingInfo).map(function (item, index) {
      return finding("ai-missing-" + (index + 1), "medium", item, findEvidenceIds(operational.evidence, ["title", "description", "comment", "attachment"]));
    }).concat(operational.validationFindings.filter(function (item) {
      return item.id.indexOf("missing") === 0 || item.id === "no-comments" || item.id === "attachments-metadata-only" || item.id.indexOf("attachment-") === 0;
    }));
    var unresolvedQuestions = createUnresolvedQuestions(
      summary,
      missingInfo,
      operational.blockers,
      operational.waitingOn,
      operational.unclearPoints,
      operational.robertDecisions,
      operational.validationFindings,
      operational.evidence
    );

    return {
      id: runId,
      cardId: card.id,
      boardId: card.boardId,
      provider: (analysis && analysis.metadata && analysis.metadata.provider) || "Unknown",
      model: (analysis && analysis.metadata && analysis.metadata.model) || "",
      promptTemplateId: (options && options.promptTemplateId) || "operational-ledger-v1",
      promptProfile: createPromptProfile(options),
      outputMode: outputMode,
      outputLanguage: outputLanguage,
      startedAt: timestamp,
      completedAt: timestamp,
      status: (options && options.status) || "completed",
      errorMessage: (options && options.errorMessage) || "",
      tokenEstimate: analysis && analysis.metadata ? toNumber(analysis.metadata.tokens) : 0,
      costEstimate: analysis && analysis.metadata ? toNumber(analysis.metadata.cost) : 0,
      costEstimateAvailable: Boolean(analysis && analysis.metadata && analysis.metadata.costEstimated === true),
      inputHash: createInputHash(input),
      cacheProfileHash: cleanText(options && options.cacheProfileHash),
      cacheProfile: options && options.cacheProfile && typeof options.cacheProfile === "object"
        ? options.cacheProfile
        : null,
      cardSnapshot: cardSnapshot,
      result: {
        about: cleanText(summary.about),
        history: cleanText(summary.history),
        currentStatus: cleanText(summary.status || summary.currentStatus),
        completedWork: toArray(summary.completedWork).length
          ? toArray(summary.completedWork)
          : card.checklistSummary.complete ? [card.checklistSummary.complete + " checklist item(s) complete."] : [],
        blockers: operational.blockers,
        waitingOn: operational.waitingOn,
        unclearPoints: operational.unclearPoints,
        nextActions: operational.nextActions,
        robertDecisions: operational.robertDecisions,
        vaReadyActions: operational.vaReadyActions,
        insights: toArray(summary.insights),
        recommendations: toArray(summary.recommendations),
        facts: toArray(summary.facts),
        inferences: toArray(summary.inferences),
        uncertainty: toArray(summary.uncertainty),
        unsupportedClaims: toArray(summary.unsupportedClaims),
        risks: toArray(summary.risks),
        missingInfo: missingInfo,
        unresolvedQuestions: unresolvedQuestions,
        confidence: operational.confidence,
        confidenceReason: cleanText(summary.confidenceReason),
        trustSignals: createTrustSignals(input, operational, options),
        evidenceClaims: operational.evidenceClaims,
        validationFindings: operational.validationFindings,
        evidence: operational.evidence
      },
      auditEvents: [{
        type: "analysis-created",
        createdAt: timestamp,
        actor: "power-up"
      }]
    };
  }

  function createLedgerEntry(input, analysis, options) {
    return {
      version: 1,
      cardId: normalizeCard(input).id,
      updatedAt: nowIso(options),
      lastRun: createAnalysisRun(input, analysis, options),
      feedback: [],
      exports: []
    };
  }

  function mergeLedgerHistory(existing, entry, limit) {
    var history = Array.isArray(existing) ? existing.slice() : [];
    var run = entry && entry.lastRun ? entry.lastRun : entry;
    if (!run || !run.id) return history;

    history = history.filter(function (item) {
      return item.id !== run.id;
    });
    history.unshift(run);
    return history.slice(0, limit || 25);
  }

  function pruneLedgerHistory(historyByCard, options) {
    var source = historyByCard && typeof historyByCard === "object" ? historyByCard : {};
    var settings = options || {};
    var keepCardId = String(settings.keepCardId || "");
    var maxCards = Math.max(1, Math.min(200, Number(settings.maxCards) || 40));
    var maxRuns = Math.max(1, Math.min(1000, Number(settings.maxRuns) || 120));
    var cards = Object.keys(source).map(function (cardId) {
      var runs = Array.isArray(source[cardId]) ? source[cardId].filter(Boolean) : [];
      var latest = runs[0] || {};
      return {
        cardId: cardId,
        runs: runs,
        latestAt: String(latest.finishedAt || latest.createdAt || latest.updatedAt || "")
      };
    }).filter(function (entry) {
      return entry.runs.length > 0;
    }).sort(function (left, right) {
      return right.latestAt.localeCompare(left.latestAt);
    });

    if (keepCardId) {
      cards.sort(function (left, right) {
        if (left.cardId === keepCardId) return -1;
        if (right.cardId === keepCardId) return 1;
        return right.latestAt.localeCompare(left.latestAt);
      });
    }

    var retained = {};
    var runCount = 0;
    for (var i = 0; i < cards.length && Object.keys(retained).length < maxCards; i += 1) {
      var entry = cards[i];
      if (runCount >= maxRuns && entry.cardId !== keepCardId) continue;
      var available = Math.max(1, maxRuns - runCount);
      var runs = entry.runs.slice(0, available);
      if (!runs.length) continue;
      retained[entry.cardId] = runs;
      runCount += runs.length;
    }
    return retained;
  }

  function summarizeRunChange(currentRun, previousRun) {
    if (!currentRun) {
      return {
        text: "No analysis run is available yet.",
        changes: [],
        confidenceTrend: "unknown"
      };
    }

    if (!previousRun) {
      return {
        text: "First saved analysis for this card.",
        changes: ["No previous analysis to compare."],
        confidenceTrend: "new"
      };
    }

    var changes = [];
    var currentSnapshot = currentRun.cardSnapshot || {};
    var previousSnapshot = previousRun.cardSnapshot || {};
    var currentResult = currentRun.result || {};
    var previousResult = previousRun.result || {};
    var currentConfidence = currentResult.confidence ? toNumber(currentResult.confidence.overall) : 0;
    var previousConfidence = previousResult.confidence ? toNumber(previousResult.confidence.overall) : 0;

    if (currentRun.inputHash && previousRun.inputHash && currentRun.inputHash !== previousRun.inputHash) {
      changes.push("Card source data changed since the previous analysis.");
    }

    if (currentSnapshot.descriptionHash && previousSnapshot.descriptionHash && currentSnapshot.descriptionHash !== previousSnapshot.descriptionHash) {
      changes.push("Card description changed.");
    }

    compareNumber("Checklist completed items", currentSnapshot.checklistSummary && currentSnapshot.checklistSummary.complete, previousSnapshot.checklistSummary && previousSnapshot.checklistSummary.complete, changes);
    compareNumber("Open checklist items", currentSnapshot.checklistSummary && currentSnapshot.checklistSummary.incomplete, previousSnapshot.checklistSummary && previousSnapshot.checklistSummary.incomplete, changes);
    compareNumber("Comment count", currentSnapshot.commentCount, previousSnapshot.commentCount, changes);
    compareNumber("Attachment count", currentSnapshot.attachmentCount, previousSnapshot.attachmentCount, changes);
    compareNumber("Detected blocker count", toArray(currentResult.blockers).length, toArray(previousResult.blockers).length, changes);
    compareNumber("Waiting-on item count", toArray(currentResult.waitingOn).length, toArray(previousResult.waitingOn).length, changes);
    compareNumber("Unclear point count", toArray(currentResult.unclearPoints).length, toArray(previousResult.unclearPoints).length, changes);
    compareNumber("Robert decision count", toArray(currentResult.robertDecisions).length, toArray(previousResult.robertDecisions).length, changes);
    compareNumber("VA/team-ready action count", toArray(currentResult.vaReadyActions).length, toArray(previousResult.vaReadyActions).length, changes);

    if (currentConfidence !== previousConfidence) {
      changes.push("Confidence changed from " + previousConfidence + "% to " + currentConfidence + "%.");
    }

    if (!changes.length) {
      changes.push("No material ledger changes detected.");
    }

    return {
      text: changes[0],
      changes: changes,
      confidenceTrend: currentConfidence > previousConfidence
        ? "up"
        : currentConfidence < previousConfidence
          ? "down"
          : "flat"
    };
  }

  function compareNumber(label, currentValue, previousValue, changes) {
    var currentNumber = toNumber(currentValue);
    var previousNumber = toNumber(previousValue);
    if (currentNumber === previousNumber) return;
    changes.push(label + " changed from " + previousNumber + " to " + currentNumber + ".");
  }

  function changeBriefForLedgerRuns(currentRun, previousRun) {
    var change = summarizeRunChange(currentRun, previousRun);
    var result = currentRun && currentRun.result ? currentRun.result : {};
    var snapshot = currentRun && currentRun.cardSnapshot ? currentRun.cardSnapshot : {};
    var title = snapshot.title || "Trello card";
    var confidence = result.confidence
      ? result.confidence.overall + "% " + result.confidence.level
      : "Unknown";
    var lines = [
      "Change brief: " + title,
      "",
      "Compared runs:",
      "Current: " + (currentRun && currentRun.completedAt ? currentRun.completedAt : "unknown"),
      "Previous: " + (previousRun && previousRun.completedAt ? previousRun.completedAt : "none"),
      "",
      "Primary change:",
      change.text || "No change summary available.",
      "",
      "Confidence trend: " + change.confidenceTrend + ". Current confidence: " + confidence + ".",
      "",
      "Operational changes:"
    ];

    appendItems(lines, change.changes, "No material ledger changes detected.");
    lines.push("", "Current status:");
    lines.push(cleanText(result.currentStatus || result.about || "No current status available."));
    lines.push("", "Current top blocker:");
    lines.push(firstItemText(result.blockers, "No blocker detected."));
    lines.push("", "Current next action:");
    lines.push(firstItemText(result.nextActions, "No next action detected."));
    lines.push("", "Current Robert decision:");
    appendDecisionFraming(lines, result.robertDecisions);
    lines.push("", "Current VA/team handoff:");
    lines.push(firstItemText(result.vaReadyActions, "No VA/team-ready action detected."));
    lines.push("", "Review note: this change brief uses stored private ledger runs and should be reviewed before acting.");
    appendSourceCoverageSummary(lines, currentRun, "Current source coverage:", 5);
    return lines.join("\n");
  }

  function createHumanFeedback(analysisRunId, feedback, options) {
    return {
      id: "feedback-" + shortHash(analysisRunId + nowIso(options) + JSON.stringify(feedback || {})),
      analysisRunId: analysisRunId,
      rating: cleanText(feedback && feedback.rating),
      correctionText: cleanText(feedback && feedback.correctionText),
      incorrectSections: toArray(feedback && feedback.incorrectSections).map(cleanText).filter(Boolean),
      cardId: cleanText(feedback && feedback.cardId),
      cardTitle: cleanText(feedback && feedback.cardTitle),
      acceptedAt: feedback && feedback.acceptedAt ? feedback.acceptedAt : null,
      createdAt: nowIso(options)
    };
  }

  function createReviewRecord(analysisRunId, review, options) {
    var state = normalizeReviewState(review && review.state);
    var confidence = review && review.confidence ? review.confidence : {};
    return {
      id: "review-" + shortHash(analysisRunId + state + nowIso(options) + JSON.stringify(review || {})),
      analysisRunId: cleanText(analysisRunId),
      cardId: cleanText(review && review.cardId),
      cardTitle: cleanText(review && review.cardTitle),
      state: state,
      label: reviewStateLabel(state),
      note: truncateForExport(review && review.note, 300),
      reviewNeededAtCreation: Boolean(review && review.reviewNeededAtCreation),
      confidenceOverall: toNumber(confidence.overall),
      confidenceLevel: cleanText(confidence.level),
      createdAt: nowIso(options)
    };
  }

  function summarizeReviewRecords(records, analysisRunIds, limit) {
    var allowedRuns = {};
    toArray(analysisRunIds).map(cleanText).filter(Boolean).forEach(function (id) {
      allowedRuns[id] = true;
    });

    return toArray(records).filter(function (record) {
      var runId = cleanText(record && record.analysisRunId);
      return runId && (!Object.keys(allowedRuns).length || allowedRuns[runId]);
    }).sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    }).slice(0, limit || 8).map(function (record) {
      var state = normalizeReviewState(record.state);
      return {
        id: cleanText(record.id),
        analysisRunId: cleanText(record.analysisRunId),
        cardId: cleanText(record.cardId),
        cardTitle: cleanText(record.cardTitle),
        state: state,
        label: reviewStateLabel(state),
        note: truncateForExport(record.note, 300),
        reviewNeededAtCreation: Boolean(record.reviewNeededAtCreation),
        confidenceOverall: toNumber(record.confidenceOverall),
        confidenceLevel: cleanText(record.confidenceLevel),
        createdAt: record.createdAt || ""
      };
    });
  }

  function normalizeReviewState(value) {
    var state = cleanText(value || "reviewed").toLowerCase();
    var allowed = {
      reviewed: true,
      accepted: true,
      "needs-follow-up": true
    };
    return allowed[state] ? state : "reviewed";
  }

  function reviewStateLabel(state) {
    var labels = {
      reviewed: "Reviewed",
      accepted: "Accepted",
      "needs-follow-up": "Needs follow-up"
    };
    return labels[normalizeReviewState(state)];
  }

  function createSensitiveActionReview(signals, actionType, approved, options) {
    var categories = toArray(signals && signals.categories).map(cleanText).filter(Boolean);
    var matches = toArray(signals && signals.matches).map(cleanText).filter(Boolean).slice(0, 20);
    var required = Boolean(signals && signals.requiresAiApproval);
    var isApproved = Boolean(approved);
    return {
      required: required,
      requiresApproval: required && !isApproved,
      approved: required ? isApproved : false,
      actionType: cleanText(actionType || "export"),
      categories: categories,
      matches: matches,
      reason: required
        ? "Sensitive card signals were detected before this action."
        : "No sensitive card signals required approval.",
      reviewedAt: required && isApproved ? nowIso(options) : null
    };
  }

  function createExportRecord(analysisRunId, exportType, destination, options) {
    var review = options && options.sensitiveReview ? options.sensitiveReview : null;
    return {
      id: "export-" + shortHash(analysisRunId + exportType + destination + nowIso(options)),
      analysisRunId: analysisRunId,
      cardId: cleanText(options && options.cardId),
      cardTitle: cleanText(options && options.cardTitle),
      exportType: cleanText(exportType || "markdown"),
      destination: cleanText(destination || "clipboard"),
      createdAt: nowIso(options),
      sensitiveReview: review ? {
        required: Boolean(review.required),
        approved: Boolean(review.approved),
        actionType: cleanText(review.actionType || exportType || "export"),
        categories: toArray(review.categories).map(cleanText).filter(Boolean),
        matches: toArray(review.matches).map(cleanText).filter(Boolean).slice(0, 20),
        reviewedAt: review.reviewedAt || null
      } : null
    };
  }

  function summarizeExportRecords(records, analysisRunIds, limit) {
    var allowedRuns = {};
    toArray(analysisRunIds).map(cleanText).filter(Boolean).forEach(function (id) {
      allowedRuns[id] = true;
    });

    return toArray(records).filter(function (record) {
      var runId = cleanText(record && record.analysisRunId);
      return runId && (!Object.keys(allowedRuns).length || allowedRuns[runId]);
    }).sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    }).slice(0, limit || 8).map(function (record) {
      var review = record.sensitiveReview || {};
      return {
        id: cleanText(record.id),
        analysisRunId: cleanText(record.analysisRunId),
        cardId: cleanText(record.cardId),
        cardTitle: cleanText(record.cardTitle),
        exportType: cleanText(record.exportType || "markdown"),
        exportLabel: exportTypeLabel(record.exportType),
        destination: cleanText(record.destination || "clipboard"),
        destinationLabel: destinationLabel(record.destination),
        createdAt: record.createdAt || "",
        sensitiveReviewRequired: Boolean(review.required),
        sensitiveReviewApproved: Boolean(review.approved),
        sensitiveCategories: toArray(review.categories).map(cleanText).filter(Boolean).slice(0, 6)
      };
    });
  }

  function exportTypeLabel(value) {
    var type = cleanText(value || "markdown");
    var labels = {
      "markdown": "Markdown summary",
      "plain-text": "Plain text export",
      "mode-brief": "Selected mode brief",
      "operational-digest": "Operational digest",
      "status-update": "Status update",
      "robert-decision-brief": "Robert decision brief",
      "va-handoff-brief": "VA/team handoff brief",
      "decision-handoff-packet": "Decision handoff packet",
      "change-brief": "Change brief",
      "ledger-json": "Ledger JSON",
      "list-planning-markdown": "List planning brief",
      "list-planning-json": "List planning JSON",
      "batch-plan-markdown": "Batch analysis plan",
      "batch-plan-json": "Batch analysis JSON",
      "batch-manual-checklist": "Manual batch checklist",
      "batch-handoff-report": "Batch handoff report",
      "batch-open-card": "Batch card opened",
      "trello-comment-draft": "Trello comment draft",
      "trello-comment": "Trello comment"
    };
    return labels[type] || type;
  }

  function destinationLabel(value) {
    var destination = cleanText(value || "clipboard");
    var labels = {
      "clipboard": "copied",
      "download": "downloaded",
      "browser-tab": "opened in browser",
      "manual-copy-panel": "prepared for manual copy",
      "trello-comment": "posted to Trello"
    };
    return labels[destination] || destination;
  }

  function markdownForLedgerRun(run) {
    var result = run.result || {};
    var lines = [
      "# " + (run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card analysis"),
      "",
      "## Card overview",
      result.about || "",
      "",
      "## Current status",
      result.currentStatus || "",
      "",
      "## Blockers"
    ];

    appendItems(lines, result.blockers, "No blockers detected.");
    lines.push("", "## Waiting on");
    appendItems(lines, result.waitingOn, "No waiting state detected.");
    lines.push("", "## Next actions");
    appendItems(lines, result.nextActions, "No next actions detected.");
    lines.push("", "## Robert decisions");
    appendItems(lines, result.robertDecisions, "No Robert-specific decision detected.");
    lines.push("", "## VA/team-ready actions");
    appendItems(lines, result.vaReadyActions, "No VA/team-ready actions detected.");
    lines.push("", "## Unclear or conflicting points");
    appendItems(lines, result.unclearPoints, "No unclear or conflicting points detected.");
    lines.push("", "## Unresolved questions");
    appendItems(lines, result.unresolvedQuestions, "No unresolved questions detected.");
    lines.push("", "## Validation");
    appendItems(lines, result.validationFindings, "No validation findings.");
    lines.push("", "## Confidence");
    lines.push((result.confidence ? result.confidence.overall + "% " + result.confidence.level : "Unknown") + ".");
    appendEvidenceClaimSummary(lines, result, "## Evidence-backed claims", 6);
    appendSourceCoverageSummary(lines, run, "## Source coverage", 8);
    return lines.join("\n");
  }

  function plainTextForLedgerRun(run) {
    var result = run && run.result ? run.result : {};
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card analysis";
    var lines = [
      "Trello Card Intelligence",
      "Card: " + title,
      "",
      "Card overview:",
      cleanText(result.about || "No overview available."),
      "",
      "Current status:",
      cleanText(result.currentStatus || "No current status available."),
      "",
      "Blockers:"
    ];

    appendItems(lines, result.blockers, "No blockers detected.");
    lines.push("", "Waiting on:");
    appendItems(lines, result.waitingOn, "No waiting state detected.");
    lines.push("", "Next actions:");
    appendItems(lines, result.nextActions, "No next actions detected.");
    lines.push("", "Robert decisions:");
    appendItems(lines, result.robertDecisions, "No Robert-specific decision detected.");
    lines.push("", "VA/team-ready actions:");
    appendItems(lines, result.vaReadyActions, "No VA/team-ready actions detected.");
    lines.push("", "Unclear or conflicting points:");
    appendItems(lines, result.unclearPoints, "No unclear or conflicting points detected.");
    lines.push("", "Unresolved questions:");
    appendItems(lines, result.unresolvedQuestions, "No unresolved questions detected.");
    lines.push("", "Missing information:");
    appendItems(lines, result.missingInfo, "No missing information detected.");
    lines.push("", "Confidence:");
    lines.push(result.confidence ? result.confidence.overall + "% " + result.confidence.level : "Unknown");
    appendEvidenceClaimSummary(lines, result, "Evidence-backed claims:", 5);
    appendSourceCoverageSummary(lines, run, "Source coverage:", 7);
    return lines.join("\n");
  }

  function statusUpdateForLedgerRun(run) {
    var result = run && run.result ? run.result : {};
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card";
    var confidence = result.confidence ? result.confidence.overall + "% " + result.confidence.level : "Unknown";
    var lines = [
      "Status update: " + title,
      "",
      "Current status: " + cleanText(result.currentStatus || result.about || "No current status available."),
      "",
      "Top next action: " + firstItemText(result.nextActions, "No next action detected."),
      "Main blocker: " + firstItemText(result.blockers, "No blocker detected."),
      "Waiting on: " + firstItemText(result.waitingOn, "No waiting state detected."),
      "Unclear point: " + firstItemText(result.unclearPoints, "No unclear or conflicting point detected."),
      "Open question: " + firstItemText(result.unresolvedQuestions, "No unresolved question detected."),
      "Robert decision: " + firstItemText(result.robertDecisions, "No Robert-specific decision detected."),
      "VA/team handoff: " + firstItemText(result.vaReadyActions, "No VA/team-ready action detected."),
      "",
      "Confidence: " + confidence + "."
    ];

    if (result.confidenceReason) {
      lines.push("Confidence note: " + cleanText(result.confidenceReason));
    }
    appendSourceCoverageSummary(lines, run, "Source coverage:", 5);
    return lines.join("\n");
  }

  function createOperationalDigest(run) {
    var result = run && run.result ? run.result : {};
    var confidence = result.confidence
      ? result.confidence.overall + "% " + result.confidence.level
      : "Unknown";
    var hasBlocker = toArray(result.blockers).length || toArray(result.waitingOn).length;
    var hasRobertDecision = toArray(result.robertDecisions).length;
    return [
      {
        key: "current-status",
        label: "Current status",
        value: truncateForExport(result.currentStatus || result.about || "No current status available.", 220),
        tone: "neutral"
      },
      {
        key: "main-blocker",
        label: "Main blocker",
        value: firstItemText(result.blockers, firstItemText(result.waitingOn, "No blocker or waiting state detected.")),
        tone: hasBlocker ? "warning" : "neutral"
      },
      {
        key: "top-next-action",
        label: "Top next action",
        value: firstItemText(result.nextActions, "No next action detected."),
        tone: "action"
      },
      {
        key: "robert-decision",
        label: "Robert decision",
        value: firstItemText(result.robertDecisions, "No Robert-specific decision detected."),
        tone: hasRobertDecision ? "high" : "neutral"
      },
      {
        key: "va-handoff",
        label: "VA/team handoff",
        value: firstItemText(result.vaReadyActions, "No VA/team-ready action detected."),
        tone: "delegate"
      },
      {
        key: "confidence",
        label: "Confidence",
        value: confidence + (result.confidenceReason ? ". " + truncateForExport(result.confidenceReason, 160) : ""),
        tone: result.confidence && result.confidence.reviewNeeded ? "warning" : "neutral"
      }
    ];
  }

  function operationalDigestForLedgerRun(run) {
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card";
    var lines = [
      "Operational digest: " + title,
      ""
    ];
    createOperationalDigest(run).forEach(function (item) {
      lines.push(item.label + ": " + cleanText(item.value || "No value available."));
    });
    appendSourceCoverageSummary(lines, run, "Source coverage:", 5);
    return lines.join("\n");
  }

  function robertDecisionBriefForLedgerRun(run) {
    var result = run && run.result ? run.result : {};
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card";
    var confidence = result.confidence ? result.confidence.overall + "% " + result.confidence.level : "Unknown";
    var lines = [
      "Robert decision brief: " + title,
      "",
      "Current status:",
      cleanText(result.currentStatus || result.about || "No current status available."),
      "",
      "Decision needed:"
    ];

    appendItems(lines, result.robertDecisions, "No Robert-specific decision detected.");
    lines.push("", "Yes/No framing:");
    appendDecisionFraming(lines, result.robertDecisions);
    lines.push("", "Blockers to consider:");
    appendItems(lines, result.blockers, "No blockers detected.");
    lines.push("", "Waiting on:");
    appendItems(lines, result.waitingOn, "No waiting state detected.");
    lines.push("", "Unclear or conflicting points:");
    appendItems(lines, result.unclearPoints, "No unclear or conflicting points detected.");
    lines.push("", "Unresolved questions:");
    appendItems(lines, result.unresolvedQuestions, "No unresolved questions detected.");
    lines.push("", "Recommended next action:");
    lines.push(firstItemText(result.nextActions, "No next action detected."));
    lines.push("", "Confidence: " + confidence + ".");
    appendEvidenceClaimSummary(lines, result, "Evidence-backed claims:", 5);
    appendSourceCoverageSummary(lines, run, "Source coverage:", 5);
    return lines.join("\n");
  }

  function vaHandoffBriefForLedgerRun(run) {
    var result = run && run.result ? run.result : {};
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card";
    var confidence = result.confidence ? result.confidence.overall + "% " + result.confidence.level : "Unknown";
    var lines = [
      "VA/team handoff: " + title,
      "",
      "Context:",
      cleanText(result.about || "No overview available."),
      "",
      "Current status:",
      cleanText(result.currentStatus || "No current status available."),
      "",
      "VA/team-ready actions:"
    ];

    appendItems(lines, result.vaReadyActions, "No VA/team-ready actions detected.");
    lines.push("", "Next actions:");
    appendItems(lines, result.nextActions, "No next actions detected.");
    lines.push("", "Blockers to avoid:");
    appendItems(lines, result.blockers, "No blockers detected.");
    lines.push("", "Waiting on:");
    appendItems(lines, result.waitingOn, "No waiting state detected.");
    lines.push("", "Unclear or conflicting points:");
    appendItems(lines, result.unclearPoints, "No unclear or conflicting points detected.");
    lines.push("", "Unresolved questions:");
    appendItems(lines, result.unresolvedQuestions, "No unresolved questions detected.");
    lines.push("", "Robert decisions not delegated:");
    appendItems(lines, result.robertDecisions, "No Robert-specific decision detected.");
    lines.push("", "Missing information:");
    appendItems(lines, result.missingInfo, "No missing information detected.");
    lines.push("", "Confidence: " + confidence + ".");
    appendEvidenceClaimSummary(lines, result, "Evidence-backed claims:", 5);
    appendSourceCoverageSummary(lines, run, "Source coverage:", 5);
    return lines.join("\n");
  }

  function decisionHandoffPacketForLedgerRun(run, options) {
    var result = run && run.result ? run.result : {};
    var snapshot = run && run.cardSnapshot ? run.cardSnapshot : {};
    var title = snapshot.title || "Trello card";
    var confidence = result.confidence
      ? result.confidence.overall + "% " + result.confidence.level
      : "Unknown";
    var blockersAndWaiting = toArray(result.blockers).concat(toArray(result.waitingOn));
    var progress = options && options.batchProgress ? options.batchProgress : null;
    var counts = progress && progress.counts ? progress.counts : {};
    var lines = [
      "Decision handoff packet: " + title,
      "",
      "Card status:",
      cleanText(result.currentStatus || result.about || "No current status available."),
      "",
      "Confidence: " + confidence + ".",
      "Review needed: " + (result.confidence && result.confidence.reviewNeeded ? "yes" : "no") + ".",
      "",
      "Robert decision:",
    ];

    appendItems(lines, result.robertDecisions, "No Robert-specific decision detected.");
    lines.push("", "Yes/No framing:");
    appendDecisionFraming(lines, result.robertDecisions);
    lines.push("", "VA/team-ready actions:");
    appendItems(lines, result.vaReadyActions, "No VA/team-ready actions detected.");
    lines.push("", "Blockers / waiting:");
    appendItems(lines, blockersAndWaiting, "No blockers or waiting states detected.");
    lines.push("", "Next actions:");
    appendItems(lines, result.nextActions, "No next actions detected.");
    lines.push("", "Unclear / unresolved:");
    appendItems(
      lines,
      toArray(result.unclearPoints).concat(toArray(result.unresolvedQuestions)),
      "No unclear points or unresolved questions detected."
    );
    lines.push("", "Missing information:");
    appendItems(lines, result.missingInfo, "No missing information detected.");
    appendBatchProgressForDecisionPacket(lines, progress, counts);
    lines.push(
      "",
      "Handoff rules:",
      "- Use this packet as a review handoff, not as proof that Trello work is complete.",
      "- Do not post, edit, label, assign, or change due dates in Trello without reviewing the exact action first.",
      "- Keep Robert-only decisions separate from VA/team-ready work.",
      "- Treat unsupported or partial source coverage as a reason to review the card before acting."
    );
    appendEvidenceClaimSummary(lines, result, "Evidence-backed claims:", 6);
    appendSourceCoverageSummary(lines, run, "Source coverage:", 7);
    return lines.join("\n");
  }

  function appendBatchProgressForDecisionPacket(lines, progress, counts) {
    lines.push("", "Batch progress:");
    if (!progress) {
      lines.push("- No batch progress context is selected for this packet.");
      return;
    }

    lines.push("- " + cleanText(progress.summary || "No batch progress summary available."));
    lines.push("- Counts: pending " + toNumber(counts.pending)
      + ", opened " + toNumber(counts.opened)
      + ", analyzed " + toNumber(counts.analyzed)
      + ", copied/exported " + toNumber(counts.copied)
      + ", skipped " + toNumber(counts.skipped)
      + ", blocked " + toNumber(counts.blocked) + ".");

    var queue = toArray(progress.queue).slice(0, 8);
    if (!queue.length) {
      lines.push("- No selected queue items are available.");
      return;
    }

    lines.push("", "Batch queue:");
    queue.forEach(function (item) {
      var label = (item.queuePosition ? item.queuePosition + ". " : "") + cleanText(item.name || "Untitled card");
      var mode = cleanText(item.recommendedMode || "operational-ledger");
      var status = cleanText(item.status || "pending");
      lines.push("- " + label + ": " + status + "; mode " + mode + ".");
    });
  }

  function modeBriefForLedgerRun(run, mode) {
    var selected = normalizeOutputMode(mode || (run && run.outputMode));
    if (selected === "status-update") return statusUpdateForLedgerRun(run);
    if (selected === "risk-review") return riskReviewForLedgerRun(run);
    if (selected === "meeting-brief") return meetingBriefForLedgerRun(run);
    if (selected === "next-action-checklist") return nextActionChecklistForLedgerRun(run);
    if (selected === "client-friendly") return clientFriendlySummaryForLedgerRun(run);
    return markdownForLedgerRun(run);
  }

  function riskReviewForLedgerRun(run) {
    var result = run && run.result ? run.result : {};
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card";
    var lines = [
      "Risk review: " + title,
      "",
      "Current status:",
      cleanText(result.currentStatus || result.about || "No current status available."),
      "",
      "Risks and blockers:"
    ];
    appendItems(lines, toArray(result.risks).concat(toArray(result.blockers)), "No risks or blockers detected.");
    lines.push("", "Waiting on:");
    appendItems(lines, result.waitingOn, "No waiting state detected.");
    lines.push("", "Unclear or conflicting points:");
    appendItems(lines, result.unclearPoints, "No unclear or conflicting points detected.");
    lines.push("", "Missing information:");
    appendItems(lines, result.missingInfo, "No missing information detected.");
    lines.push("", "Unresolved questions:");
    appendItems(lines, result.unresolvedQuestions, "No unresolved questions detected.");
    lines.push("", "Validation findings:");
    appendItems(lines, result.validationFindings, "No validation findings.");
    lines.push("", "Robert decision required:");
    appendItems(lines, result.robertDecisions, "No Robert-specific decision detected.");
    appendEvidenceClaimSummary(lines, result, "Evidence-backed claims:", 4);
    return lines.join("\n");
  }

  function meetingBriefForLedgerRun(run) {
    var result = run && run.result ? run.result : {};
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card";
    var lines = [
      "Meeting brief: " + title,
      "",
      "Context:",
      cleanText(result.about || "No overview available."),
      "",
      "What happened:",
      cleanText(result.history || "No history available."),
      "",
      "Current status:",
      cleanText(result.currentStatus || "No current status available."),
      "",
      "Decisions to cover:"
    ];
    appendItems(lines, result.robertDecisions, "No Robert-specific decision detected.");
    lines.push("", "Follow-up actions:");
    appendItems(lines, result.nextActions, "No follow-up actions detected.");
    lines.push("", "Waiting on:");
    appendItems(lines, result.waitingOn, "No waiting state detected.");
    lines.push("", "Unclear or conflicting points:");
    appendItems(lines, result.unclearPoints, "No unclear or conflicting points detected.");
    lines.push("", "Unresolved questions:");
    appendItems(lines, result.unresolvedQuestions, "No unresolved questions detected.");
    lines.push("", "VA/team handoff:");
    appendItems(lines, result.vaReadyActions, "No VA/team-ready actions detected.");
    appendSourceCoverageSummary(lines, run, "Source coverage:", 5);
    return lines.join("\n");
  }

  function nextActionChecklistForLedgerRun(run) {
    var result = run && run.result ? run.result : {};
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card";
    var lines = [
      "Next-action checklist: " + title,
      "",
      "Immediate actions:"
    ];
    appendCheckboxItems(lines, result.nextActions, "Confirm the card is complete or add the next concrete action.");
    lines.push("", "Robert approvals:");
    appendCheckboxItems(lines, result.robertDecisions, "No Robert-specific approval detected.");
    lines.push("", "VA/team-ready:");
    appendCheckboxItems(lines, result.vaReadyActions, "No VA/team-ready action detected.");
    lines.push("", "Blocked by:");
    appendItems(lines, result.blockers, "No blockers detected.");
    lines.push("", "Waiting on:");
    appendCheckboxItems(lines, result.waitingOn, "No waiting state detected.");
    lines.push("", "Unclear or conflicting points:");
    appendCheckboxItems(lines, result.unclearPoints, "No unclear or conflicting points detected.");
    lines.push("", "Questions to resolve:");
    appendCheckboxItems(lines, result.unresolvedQuestions, "No unresolved questions detected.");
    appendEvidenceClaimSummary(lines, result, "Evidence-backed claims:", 4);
    return lines.join("\n");
  }

  function clientFriendlySummaryForLedgerRun(run) {
    var result = run && run.result ? run.result : {};
    var title = run && run.cardSnapshot && run.cardSnapshot.title ? run.cardSnapshot.title : "Trello card";
    var lines = [
      "Client-friendly summary: " + title,
      "",
      cleanText(result.about || "No overview available."),
      "",
      "Current status:",
      cleanText(result.currentStatus || "No current status available."),
      "",
      "Next step:",
      firstItemText(result.nextActions, "No next action detected.")
    ];
    if (toArray(result.blockers).length) {
      lines.push("", "Open item:", firstItemText(result.blockers, "No open item detected."));
    }
    if (toArray(result.waitingOn).length) {
      lines.push("", "Waiting on:", firstItemText(result.waitingOn, "No waiting state detected."));
    }
    if (toArray(result.unclearPoints).length) {
      lines.push("", "Unclear point:", firstItemText(result.unclearPoints, "No unclear or conflicting point detected."));
    }
    appendSourceCoverageSummary(lines, run, "Source coverage:", 4);
    return lines.join("\n");
  }

  function jsonForLedgerRun(run, options) {
    var exportObject = {
      schemaVersion: "summarize-this-card-intelligence-export-v1",
      exportedAt: nowIso(options),
      source: "Summarize This Trello Power-Up",
      analysisRun: {
        id: run && run.id,
        provider: run && run.provider,
        model: run && run.model,
        promptTemplateId: run && run.promptTemplateId,
        promptProfile: run && run.promptProfile,
        outputMode: run && run.outputMode,
        outputLanguage: run && run.outputLanguage,
        completedAt: run && run.completedAt,
        inputHash: run && run.inputHash
      },
      cardSnapshot: run && run.cardSnapshot ? run.cardSnapshot : {},
      result: run && run.result ? run.result : {}
    };
    return JSON.stringify(exportObject, null, 2);
  }

  function createTrelloCommentDraft(run) {
    var result = run && run.result ? run.result : {};
    var cardTitle = run && run.cardSnapshot && run.cardSnapshot.title
      ? run.cardSnapshot.title
      : "Trello card";
    var confidence = result.confidence
      ? result.confidence.overall + "% " + result.confidence.level
      : "Unknown";
    var reason = result.confidenceReason || (result.confidence && result.confidence.reason) || "";
    var lines = [
      "Summarize This - Card Intelligence",
      "",
      "Card: " + cardTitle,
      "",
      "Current status:",
      cleanText(result.currentStatus || result.about || "No current status available."),
      "",
      "Blockers:"
    ];

    appendItems(lines, toArray(result.blockers).slice(0, 4), "No blockers detected.");
    lines.push("", "Waiting on:");
    appendItems(lines, toArray(result.waitingOn).slice(0, 4), "No waiting state detected.");
    lines.push("", "Next actions:");
    appendItems(lines, toArray(result.nextActions).slice(0, 4), "No next actions detected.");
    lines.push("", "Unclear or conflicting points:");
    appendItems(lines, toArray(result.unclearPoints).slice(0, 3), "No unclear or conflicting points detected.");
    lines.push("", "Unresolved questions:");
    appendItems(lines, toArray(result.unresolvedQuestions).slice(0, 5), "No unresolved questions detected.");
    lines.push("", "Robert decisions:");
    appendItems(lines, result.robertDecisions, "No Robert-specific decision detected.");
    lines.push("", "VA/team-ready actions:");
    appendItems(lines, result.vaReadyActions, "No VA/team-ready actions detected.");
    lines.push("", "Confidence: " + confidence + ".");
    if (reason) {
      lines.push("Confidence note: " + cleanText(reason));
    }
    appendEvidenceClaimSummary(lines, result, "Evidence notes:", 3);
    appendSourceCoverageSummary(lines, run, "Source coverage:", 4);
    var reviewNote = "Review note: this draft was generated by Summarize This and should be reviewed before use.";
    var draft = lines.join("\n");
    var suffix = "\n\n" + reviewNote;
    if (draft.length + suffix.length > 4000) {
      return draft.slice(0, 4000 - suffix.length).replace(/\s+$/, "") + suffix;
    }
    return draft + suffix;
  }

  function createTrelloDescriptionDraft(run) {
    var result = run && run.result ? run.result : {};
    var lines = [
      "## Operational summary",
      "",
      cleanText(result.about || "No overview available."),
      "",
      "### Current status",
      cleanText(result.currentStatus || result.about || "No current status available."),
      "",
      "### Blockers"
    ];
    appendItems(lines, toArray(result.blockers).slice(0, 5), "No blockers detected.");
    lines.push("", "### Waiting on");
    appendItems(lines, toArray(result.waitingOn).slice(0, 5), "No waiting state detected.");
    lines.push("", "### Next actions");
    appendCheckboxItems(lines, toArray(result.nextActions).slice(0, 6), "No next action detected.");
    lines.push("", "### Questions to resolve");
    appendItems(lines, toArray(result.unresolvedQuestions).slice(0, 5), "No unresolved question detected.");
    appendEvidenceClaimSummary(lines, result, "Evidence notes:", 3);
    lines.push("", "### Review note", "This description draft was generated by Summarize This. Review and edit it before updating the Trello card; it is not verified fact.");
    var draft = lines.join("\n");
    return draft.length > 6000 ? draft.slice(0, 6000).replace(/\s+$/, "") + "\n\n[Draft truncated for review]" : draft;
  }

  function appendDecisionFraming(lines, decisions) {
    var items = toArray(decisions).filter(function (item) {
      return cleanText(item && (item.text || item.claim || item));
    });

    if (!items.length) {
      lines.push("- No Yes/No decision can be framed from the current card evidence.");
      return;
    }

    items.slice(0, 5).forEach(function (item) {
      var text = firstItemText([item], "Decision needed.");
      if (/\byes\b|\bno\b/i.test(text)) {
        lines.push("- " + truncateForExport(text, 220));
      } else {
        lines.push("- Approve? Yes/No - " + truncateForExport(text, 200));
      }
    });
  }

  function appendEvidenceClaimSummary(lines, result, heading, limit) {
    var claims = toArray(result && result.evidenceClaims).filter(function (claim) {
      return cleanText(claim && (claim.claim || claim.text));
    });
    if (!claims.length) return;

    var evidenceIndex = indexEvidence(result && result.evidence);
    lines.push("", heading);
    claims.slice(0, limit || 5).forEach(function (claim) {
      var text = cleanText(claim.claim || claim.text);
      var confidence = cleanText(claim.confidence || "uncertain");
      var sources = formatClaimSources(claim, evidenceIndex);
      lines.push("- " + truncateForExport(text, 180) + " [" + confidence + "; " + sources + "]");
    });
  }

  function appendSourceCoverageSummary(lines, run, heading, limit) {
    var coverageItems = toArray(run && run.cardSnapshot && run.cardSnapshot.sourceCoverage);
    if (!coverageItems.length) return;

    var ordered = coverageItems.filter(function (item) {
      return item.status === "failed" || item.status === "partial";
    }).concat(coverageItems.filter(function (item) {
      return item.status === "available";
    })).concat(coverageItems.filter(function (item) {
      return item.status === "missing";
    }));

    lines.push("", heading);
    dedupeCoverage(ordered).slice(0, limit || 6).forEach(function (item) {
      lines.push("- " + cleanText(item.label) + " (" + cleanText(item.status) + "): " + truncateForExport(item.detail, 180));
    });
  }

  function indexEvidence(evidence) {
    var index = {};
    toArray(evidence).forEach(function (item) {
      if (!item || !item.id) return;
      index[item.id] = item;
    });
    return index;
  }

  function formatClaimSources(claim, evidenceIndex) {
    var support = toArray(claim && claim.support);
    var labels = support.map(function (id) {
      var evidence = evidenceIndex[id];
      if (!evidence) return "";
      return cleanText(evidence.label || evidence.type || evidence.path);
    }).filter(Boolean);

    if (!labels.length && claim && claim.source) {
      labels.push(cleanText(claim.source));
    }
    if (!labels.length) return "no direct source reference";
    return "source: " + labels.slice(0, 3).join(", ");
  }

  function dedupeCoverage(items) {
    var seen = {};
    return items.filter(function (item) {
      var key = cleanText(item && item.key) || cleanText(item && item.label);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function truncateForExport(value, maxLength) {
    var text = cleanText(value);
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1).trim() + ".";
  }

  function firstItemText(items, fallback) {
    var values = toArray(items);
    if (!values.length) return fallback;
    return formatOperationalItem(values[0]);
  }

  function operationalItemMeta(item) {
    var meta = [];
    if (!item || typeof item !== "object") return meta;
    if (item.owner) meta.push("owner: " + cleanText(item.owner));
    if (item.priority) meta.push("priority: " + cleanText(item.priority));
    if (item.severity) meta.push("severity: " + cleanText(item.severity));
    if (item.riskLevel) meta.push("risk: " + cleanText(item.riskLevel));
    if (item.category) meta.push("category: " + cleanText(item.category));
    if (item.requiredBy) meta.push("required by: " + cleanText(item.requiredBy));
    if (item.needsRobert === false) meta.push("Robert approval: no");
    return meta.filter(Boolean).slice(0, 4);
  }

  function formatOperationalItem(item) {
    var text = cleanText(item && (item.text || item.claim) || item);
    if (!text) return "";
    var meta = operationalItemMeta(item);
    return meta.length ? text + " (" + meta.join("; ") + ")" : text;
  }

  function appendItems(lines, items, fallback) {
    var values = toArray(items);
    if (!values.length) {
      lines.push("- " + fallback);
      return;
    }
    values.forEach(function (item) {
      var text = formatOperationalItem(item);
      if (text) lines.push("- " + text);
    });
  }

  function appendCheckboxItems(lines, items, fallback) {
    var values = toArray(items);
    if (!values.length) {
      lines.push("- [ ] " + fallback);
      return;
    }
    values.forEach(function (item) {
      var text = formatOperationalItem(item);
      if (text) lines.push("- [ ] " + text);
    });
  }

  function normalizeOutputMode(value) {
    var mode = cleanText(value || "operational-ledger");
    var allowed = {
      "operational-ledger": true,
      "status-update": true,
      "risk-review": true,
      "meeting-brief": true,
      "next-action-checklist": true,
      "client-friendly": true
    };
    return allowed[mode] ? mode : "operational-ledger";
  }

  function normalizeOutputLanguage(value) {
    var language = cleanText(value || "en").toLowerCase();
    if (language === "english") language = "en";
    if (language === "dutch" || language === "nederlands" || language === "nl-nl") language = "nl";
    return language === "nl" ? "nl" : "en";
  }

  function createPromptProfile(options) {
    var customInstructions = cleanText(options && options.customInstructions);
    var promptTemplateId = cleanText(options && options.promptTemplateId);
    var promptTemplateName = cleanText(options && options.promptTemplateName).slice(0, 80);
    var outputLanguage = normalizeOutputLanguage(options && options.outputLanguage);
    return {
      promptTemplateId: promptTemplateId,
      promptTemplateName: promptTemplateName,
      outputLanguage: outputLanguage,
      customInstructionsPresent: Boolean(customInstructions),
      customInstructionsHash: customInstructions ? shortHash(customInstructions) : "",
      customInstructionsCharacters: customInstructions.length
    };
  }

  return {
    createAnalysisRun: createAnalysisRun,
    createAttachmentFacts: createAttachmentFacts,
    createCardSnapshot: createCardSnapshot,
    createInputHash: createInputHash,
    createEvidenceMap: createEvidenceMap,
    createExportRecord: createExportRecord,
    createHumanFeedback: createHumanFeedback,
    createReviewRecord: createReviewRecord,
    summarizeExportRecords: summarizeExportRecords,
    summarizeReviewRecords: summarizeReviewRecords,
    normalizePriorFeedback: normalizePriorFeedback,
    normalizeActions: normalizeActions,
    normalizeAttachments: normalizeAttachments,
    normalizeCustomFields: normalizeCustomFields,
    createSensitiveActionReview: createSensitiveActionReview,
    createSourceCoverage: createSourceCoverage,
    createTrelloCommentDraft: createTrelloCommentDraft,
    createTrelloDescriptionDraft: createTrelloDescriptionDraft,
    createLedgerEntry: createLedgerEntry,
    createOperationalAnalysis: createOperationalAnalysis,
    createOperationalDigest: createOperationalDigest,
    createTrustSignals: createTrustSignals,
    changeBriefForLedgerRuns: changeBriefForLedgerRuns,
    decisionHandoffPacketForLedgerRun: decisionHandoffPacketForLedgerRun,
    jsonForLedgerRun: jsonForLedgerRun,
    markdownForLedgerRun: markdownForLedgerRun,
    mergeLedgerHistory: mergeLedgerHistory,
    pruneLedgerHistory: pruneLedgerHistory,
    modeBriefForLedgerRun: modeBriefForLedgerRun,
    normalizeCard: normalizeCard,
    operationalDigestForLedgerRun: operationalDigestForLedgerRun,
    plainTextForLedgerRun: plainTextForLedgerRun,
    robertDecisionBriefForLedgerRun: robertDecisionBriefForLedgerRun,
    statusUpdateForLedgerRun: statusUpdateForLedgerRun,
    vaHandoffBriefForLedgerRun: vaHandoffBriefForLedgerRun,
    summarizeRunChange: summarizeRunChange
  };
}));
