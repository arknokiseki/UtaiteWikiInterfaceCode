/*!
 ********************************************************************************
 *
 * Button + modal to update {{Uptodate}} parameters on song lists.
 * Authors: 
 * - makudoumee
 * 
 * This file has been synced with the shared repository on GitHub.
 * GitHub Repository: https://github.com/arknokiseki/UtaiteWikiInterfaceCode
 * Please do not edit this page directly.
 * 
 * Source code:
 * https://github.com/arknokiseki/UtaiteWikiInterfaceCode/blob/main/src/gadgets/contents/UptodateEditor/UptodateEditor.ts
 * 
 * [[Category:Scripts]]
 * 
 ********************************************************************************/
const TARGET_NAME = "Uptodate";
const DATE_ALIAS = "updated-at";
function normalizeTemplateName(name) {
  let n = name.replace(/<!--[\s\S]*?-->/g, "");
  n = n.replace(/_/g, " ").trim().replace(/\s+/g, " ");
  n = n.replace(/^:\s*/, "");
  n = n.replace(/^[Tt]emplate\s*:\s*/, "");
  if (n.length === 0) return n;
  return n.charAt(0).toUpperCase() + n.slice(1);
}
function indexOfTopLevelEquals(raw) {
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw.startsWith("<!--", i)) {
      const close = raw.indexOf("-->", i);
      i = close === -1 ? raw.length : close + 2;
      continue;
    }
    const two = raw.substr(i, 2);
    if (two === "{{" || two === "[[") {
      depth++;
      i++;
      continue;
    }
    if (two === "}}" || two === "]]") {
      depth--;
      i++;
      continue;
    }
    if (raw[i] === "=" && depth <= 0) return i;
  }
  return -1;
}
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith("<!--", i)) {
      const close = body.indexOf("-->", i);
      const end = close === -1 ? body.length : close + 3;
      buf += body.slice(i, end);
      i = end - 1;
      continue;
    }
    const two = body.substr(i, 2);
    if (two === "{{" || two === "[[") {
      depth++;
      buf += two;
      i++;
      continue;
    }
    if (two === "}}" || two === "]]") {
      depth--;
      buf += two;
      i++;
      continue;
    }
    if (body[i] === "|" && depth <= 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += body[i];
  }
  out.push(buf);
  return out;
}
function findMatchingClose(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text.startsWith("<!--", i)) {
      const close = text.indexOf("-->", i);
      i = close === -1 ? text.length : close + 2;
      continue;
    }
    const two = text.substr(i, 2);
    if (two === "{{") {
      depth++;
      i++;
      continue;
    }
    if (two === "}}") {
      depth--;
      i++;
      if (depth === 0) return i + 1;
      continue;
    }
  }
  return -1;
}
function parseParams(slices) {
  const params = [];
  let positional = 0;
  for (const raw of slices) {
    const eq = indexOfTopLevelEquals(raw);
    if (eq === -1) {
      positional++;
      params.push({ raw, name: null, index: positional, value: raw.trim() });
    } else {
      params.push({
        raw,
        name: raw.slice(0, eq).trim(),
        index: null,
        value: raw.slice(eq + 1).trim()
      });
    }
  }
  return params;
}
function findTemplateCall(wikitext, names) {
  for (let i = 0; i < wikitext.length - 1; i++) {
    if (wikitext.substr(i, 2) !== "{{") continue;
    const end = findMatchingClose(wikitext, i);
    if (end === -1) continue;
    const inner = wikitext.slice(i + 2, end - 2);
    const slices = splitTopLevel(inner);
    const rawName = slices[0];
    if (names.indexOf(normalizeTemplateName(rawName)) === -1) continue;
    return {
      start: i,
      end,
      // Untrimmed on purpose — see TemplateCall.rawName.
      rawName,
      params: parseParams(slices.slice(1))
    };
  }
  return null;
}
function findUptodateCall(wikitext) {
  return findTemplateCall(wikitext, [TARGET_NAME]);
}
function replaceValueInRaw(raw, newValue) {
  const eq = indexOfTopLevelEquals(raw);
  const head = eq === -1 ? "" : raw.slice(0, eq + 1);
  const tail = eq === -1 ? raw : raw.slice(eq + 1);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(tail);
  if (!m) return head + newValue;
  return head + m[1] + newValue + m[3];
}
function serialize(rawName, params) {
  const body = params.map((p) => p.raw).join("|");
  return "{{" + rawName + (params.length ? "|" + body : "") + "}}";
}
function applyEdits(wikitext, edits) {
  const call = findUptodateCall(wikitext);
  if (!call) return null;
  const params = call.params.map((p) => ({
    raw: p.raw,
    name: p.name,
    index: p.index,
    value: p.value
  }));
  const setNamed = (name, value) => {
    const idx = params.findIndex((p) => p.name === name);
    if (value === null) {
      if (idx !== -1) params.splice(idx, 1);
      return;
    }
    if (idx === -1) {
      params.push({ raw: name + "=" + value, name, index: null, value });
    } else {
      params[idx].raw = replaceValueInRaw(params[idx].raw, value);
      params[idx].value = value;
    }
  };
  for (const key of Object.keys(edits)) {
    const value = edits[key];
    if (value === void 0) continue;
    if (key === "date") {
      const dateValue = value;
      const alias = params.findIndex((p) => p.name === DATE_ALIAS);
      if (alias !== -1) {
        params[alias].raw = replaceValueInRaw(params[alias].raw, dateValue);
        params[alias].value = dateValue;
        continue;
      }
      const first = params.findIndex((p) => p.index === 1);
      if (first !== -1) {
        params[first].raw = replaceValueInRaw(params[first].raw, dateValue);
        params[first].value = dateValue;
      } else {
        params.unshift({ raw: dateValue, name: null, index: 1, value: dateValue });
      }
      continue;
    }
    setNamed(key, value);
  }
  return wikitext.slice(0, call.start) + serialize(call.rawName, params) + wikitext.slice(call.end);
}
const INFOBOXES = ["Utaite", "Youtaite", "Singer"];
const STATUS_TEMPLATES = {
  Active: "active",
  Inactive: "inactive",
  Hiatus: "hiatus",
  Graduated: "graduated"
};
const LEXICON = {
  active: "active",
  inactive: "inactive",
  hiatus: "hiatus",
  graduated: "graduated",
  deceased: "deceased",
  retired: "retired"
};
const INACTIVE_ISH = ["inactive", "graduated", "deceased", "retired"];
function extractStatusParam(wikitext) {
  const call = findTemplateCall(wikitext, INFOBOXES);
  if (!call) return null;
  const status = call.params.filter(
    (p) => p.name !== null && p.name.toLowerCase() === "status"
  )[0];
  return status ? status.value : null;
}
function clean(value) {
  return value.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<ref[^>]*\/>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\{\{\s*[Cc]ite[^}]*\}\}/g, "").trim();
}
function statusTemplatesIn(value) {
  const found = [];
  const re = /\{\{\s*([^|}]+?)\s*(?:\||\}\})/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    const activity = STATUS_TEMPLATES[normalizeTemplateName(m[1])];
    if (activity) found.push(activity);
  }
  return found;
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function result(activity, confidence, evidence, raw) {
  return {
    activity,
    confidence,
    evidence,
    raw,
    suggestPin: confidence === "confident" && INACTIVE_ISH.indexOf(activity) !== -1
  };
}
function detectStatus(wikitext) {
  const raw = extractStatusParam(wikitext);
  if (raw === null) {
    return result("unknown", "unknown", "No status parameter found in the infobox.", null);
  }
  const value = clean(raw);
  const templates = statusTemplatesIn(value);
  if (templates.length === 1) {
    return result(
      templates[0],
      "confident",
      "Infobox status is {{" + capitalize(templates[0]) + "}}.",
      raw
    );
  }
  if (templates.length > 1) {
    const allInactive = templates.every((t) => INACTIVE_ISH.indexOf(t) !== -1);
    if (allInactive) {
      return result(
        templates[0],
        "confident",
        "Infobox status lists only inactive states: " + templates.join(", ") + ".",
        raw
      );
    }
    return result(
      "unknown",
      "ambiguous",
      "Infobox status mixes several states (" + templates.join(", ") + "), so activity cannot be determined automatically.",
      raw
    );
  }
  const bare = LEXICON[value.toLowerCase()];
  if (bare) {
    return result(bare, "confident", 'Infobox status reads "' + value + '".', raw);
  }
  return result(
    "unknown",
    "unknown",
    "Infobox status is free text that could not be interpreted.",
    raw
  );
}
const SONGS_SUFFIX = "/Songs";
function resolveTarget(pageName, wikitext) {
  if (pageName.endsWith(SONGS_SUFFIX)) {
    return {
      editTitle: pageName,
      rootTitle: pageName.slice(0, -SONGS_SUFFIX.length)
    };
  }
  if (findUptodateCall(wikitext)) {
    return { editTitle: pageName, rootTitle: pageName };
  }
  return { editTitle: pageName + SONGS_SUFFIX, rootTitle: pageName };
}
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function formatJstDate(now) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1e3);
  return MONTHS[jst.getUTCMonth()] + " " + jst.getUTCDate() + ", " + jst.getUTCFullYear();
}
async function fetchPage(api, title) {
  const data = await api.get({
    action: "query",
    prop: "revisions",
    rvprop: "content|timestamp",
    rvslots: "main",
    titles: title,
    formatversion: 2
  });
  const pages = data && data.query && data.query.pages;
  if (!pages || !pages.length) return null;
  const page = pages[0];
  if (page.missing || !page.revisions || !page.revisions.length) return null;
  const revision = page.revisions[0];
  return {
    title: page.title,
    content: revision.slots.main.content,
    timestamp: revision.timestamp
  };
}
async function savePage(api, page, text, summary) {
  await api.postWithToken("csrf", {
    action: "edit",
    title: page.title,
    text,
    summary,
    basetimestamp: page.timestamp,
    starttimestamp: page.timestamp,
    nocreate: 1,
    formatversion: 2
  });
}
const NAMED_FIELDS = [
  { key: "reason", label: "Reason", hint: 'Overrides the status line. Setting this forces "outdated".' },
  { key: "discography", label: "Discography", hint: "Set to yes when the discography is covered too." },
  { key: "needrom", label: "Needs romanization", hint: "Adds the romanization-required category." },
  { key: "nocat", label: "No categories", hint: "Set to true to suppress categorization." },
  { key: "bordercolor", label: "Border colour", hint: "Hex value, e.g. #A97A3F." }
];
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function currentValue(call, name) {
  const param = call.params.filter((p) => p.name === name)[0];
  return param ? param.value : "";
}
function currentDate(call) {
  const alias = call.params.filter((p) => p.name === "updated-at")[0];
  if (alias) return alias.value;
  const first = call.params.filter((p) => p.index === 1)[0];
  return first ? first.value : "";
}
function describeError(err) {
  const e = err;
  if (e && e.error && e.error.code === "editconflict") {
    return "someone else edited the page. Reload and try again.";
  }
  if (e && e.error && e.error.info) return e.error.info;
  return "unknown error.";
}
function openUptodateModal(options) {
  const overlay = el("div", "ute-overlay");
  const modal = el("div", "ute-modal");
  overlay.appendChild(modal);
  const header = el("div", "ute-header");
  header.appendChild(el("h2", "ute-title", "Update song list freshness"));
  header.appendChild(el("div", "ute-subtitle", "Editing " + options.editTitle));
  const closeBtn = el("button", "ute-close", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  header.appendChild(closeBtn);
  modal.appendChild(header);
  const body = el("div", "ute-body");
  modal.appendChild(body);
  const dateRow = el("div", "ute-field");
  dateRow.appendChild(el("label", "ute-label", "Last updated"));
  const dateInput = el("input", "ute-input");
  dateInput.type = "text";
  dateInput.value = currentDate(options.call) || options.fallbackDate;
  dateRow.appendChild(dateInput);
  dateRow.appendChild(el("div", "ute-hint", "Date of the most recent upload, e.g. March 1, 2026."));
  const dateError = el("div", "ute-error");
  dateError.style.display = "none";
  dateRow.appendChild(dateError);
  body.appendChild(dateRow);
  const pinRow = el("div", "ute-field ute-pin");
  const pinLabel = el("label", "ute-check");
  const pinInput = el("input");
  pinInput.type = "checkbox";
  pinInput.checked = options.detection.suggestPin;
  pinLabel.appendChild(pinInput);
  pinLabel.appendChild(el("span", void 0, "Force up-to-date"));
  pinRow.appendChild(pinLabel);
  pinRow.appendChild(el(
    "div",
    "ute-hint",
    "Keeps the list marked up-to-date regardless of age. Use when the singer is no longer active, so the list is complete."
  ));
  const evidence = el("div", "ute-evidence ute-" + options.detection.confidence);
  evidence.appendChild(el("div", void 0, options.detection.evidence));
  if (options.detection.raw !== null && options.detection.confidence !== "confident") {
    const raw = el("div", "ute-raw");
    raw.appendChild(el("span", "ute-raw-label", "Status reads: "));
    raw.appendChild(el("code", void 0, options.detection.raw));
    evidence.appendChild(raw);
  }
  pinRow.appendChild(evidence);
  body.appendChild(pinRow);
  const inputs = {};
  for (const field of NAMED_FIELDS) {
    const row = el("div", "ute-field");
    row.appendChild(el("label", "ute-label", field.label));
    const input = el("input", "ute-input");
    input.type = "text";
    input.value = currentValue(options.call, field.key);
    row.appendChild(input);
    row.appendChild(el("div", "ute-hint", field.hint));
    body.appendChild(row);
    inputs[field.key] = input;
  }
  const previewWrap = el("div", "ute-field");
  previewWrap.appendChild(el("label", "ute-label", "Resulting wikitext"));
  const previewBox = el("pre", "ute-preview");
  previewWrap.appendChild(previewBox);
  body.appendChild(previewWrap);
  const footer = el("div", "ute-footer");
  const status = el("div", "ute-status");
  const cancelBtn = el("button", "ute-btn ute-btn-secondary", "Cancel");
  cancelBtn.type = "button";
  const saveBtn = el("button", "ute-btn ute-btn-primary", "Save");
  saveBtn.type = "button";
  footer.appendChild(status);
  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  modal.appendChild(footer);
  function collect() {
    const edits = { date: dateInput.value.trim() };
    for (const field of NAMED_FIELDS) {
      const value = inputs[field.key].value.trim();
      edits[field.key] = value === "" ? null : value;
    }
    edits["force-uptodate"] = pinInput.checked ? "yes" : null;
    return edits;
  }
  function refresh() {
    previewBox.textContent = options.preview(collect());
    const empty = dateInput.value.trim() === "";
    saveBtn.disabled = empty;
    dateError.style.display = empty ? "" : "none";
    dateError.textContent = empty ? "A date is required." : "";
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }
  function close() {
    document.removeEventListener("keydown", onKeydown);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
  dateInput.addEventListener("input", refresh);
  pinInput.addEventListener("change", refresh);
  for (const field of NAMED_FIELDS) {
    inputs[field.key].addEventListener("input", refresh);
  }
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown);
  saveBtn.addEventListener("click", () => {
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    status.className = "ute-status";
    status.textContent = "Saving…";
    options.onSave(collect()).then(
      () => {
        close();
        window.location.reload();
      },
      (err) => {
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        status.className = "ute-status ute-status-error";
        status.textContent = "Save failed: " + describeError(err);
      }
    );
  });
  document.body.appendChild(overlay);
  refresh();
  dateInput.focus();
}
(function() {
  if (window.uptodateEditorLoaded) return;
  window.uptodateEditorLoaded = true;
  const SUMMARY = "Update song list freshness via UptodateEditor";
  function isPermitted() {
    const groups = mw.config.get("wgUserGroups") || [];
    const name = mw.config.get("wgUserName");
    if (!name) return false;
    return groups.indexOf("autoconfirmed") !== -1 || groups.indexOf("sysop") !== -1;
  }
  function makeButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ute-open";
    button.textContent = "Update";
    button.setAttribute("aria-label", "Update song list freshness");
    return button;
  }
  async function launch(button) {
    const api = new mw.Api();
    const pageName = mw.config.get("wgPageName");
    button.disabled = true;
    button.textContent = "Loading…";
    try {
      const current = await fetchPage(api, pageName);
      const target = resolveTarget(pageName, current ? current.content : "");
      const editPage = target.editTitle === pageName ? current : await fetchPage(api, target.editTitle);
      if (!editPage) {
        window.alert(
          "Could not load " + target.editTitle + ". The page may not exist, so there is nothing to update."
        );
        return;
      }
      const call = findUptodateCall(editPage.content);
      if (!call) {
        window.alert(
          "No {{Uptodate}} template found in " + target.editTitle + "."
        );
        return;
      }
      const rootPage = target.rootTitle === editPage.title ? editPage : await fetchPage(api, target.rootTitle);
      const detection = detectStatus(rootPage ? rootPage.content : "");
      openUptodateModal({
        editTitle: editPage.title,
        call,
        detection,
        fallbackDate: formatJstDate(/* @__PURE__ */ new Date()),
        preview: (edits) => {
          const next = applyEdits(editPage.content, edits);
          if (!next) return "";
          const nextCall = findUptodateCall(next);
          return nextCall ? next.slice(nextCall.start, nextCall.end) : "";
        },
        onSave: async (edits) => {
          const fresh = await fetchPage(api, editPage.title);
          if (!fresh) throw { error: { info: "Page disappeared." } };
          const next = applyEdits(fresh.content, edits);
          if (!next) throw { error: { info: "Template no longer present." } };
          await savePage(api, fresh, next, SUMMARY);
        }
      });
    } catch (err) {
      const e = err;
      window.alert("UptodateEditor failed: " + (e && e.error && e.error.info || "unknown error."));
    } finally {
      button.disabled = false;
      button.textContent = "Update";
    }
  }
  function init() {
    if (!isPermitted()) return;
    const boxes = document.querySelectorAll(".freshness-box");
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.querySelector(".ute-open")) continue;
      const cta = box.querySelector(".freshness-cta");
      const host = cta || box.querySelector(".freshness-body");
      if (!host) continue;
      const button = makeButton();
      button.addEventListener("click", () => {
        void launch(button);
      });
      host.appendChild(button);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
