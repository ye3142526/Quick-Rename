"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => OutlineHeadingInlineRenamePlugin,
  headingMatches: () => headingMatches,
  normalizeHeading: () => normalizeHeading,
  parseHeadingLine: () => parseHeadingLine,
  rewriteHeadingLine: () => rewriteHeadingLine,
  rewriteHeadingLinks: () => rewriteHeadingLinks,
  rewriteLinkToken: () => rewriteLinkToken,
  sanitizeHeadingInput: () => sanitizeHeadingInput,
  splitLinkTarget: () => splitLinkTarget
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var OUTLINE_SELECTOR = '.workspace-leaf-content[data-type="outline"]';
var STYLE_ID = "ohn-outline-inline-rename-styles";
var INPUT_CLASS = "ohn-inline-input";
var EDITING_CLASS = "ohn-editing";
var BUTTON_CLASS = "ohn-edit-btn";
var DEFAULT_SETTINGS = {
  rightSidebarOnly: true,
  commitOnBlur: true,
  doubleClickWindow: 300,
  showEditButton: false
};
var STYLES = `
.${EDITING_CLASS} > .tree-item-inner {
    display: none !important;
}
.tree-item-self.${EDITING_CLASS} {
    padding-right: 4px;
}
.${INPUT_CLASS} {
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    height: 1.7em;
    margin: 0;
    padding: 0 6px;
    font-family: inherit;
    font-size: var(--nav-item-size, 13px);
    line-height: 1.7em;
    color: var(--text-normal);
    background: var(--background-modifier-form-field);
    border: 1px solid var(--interactive-accent);
    border-radius: var(--radius-s, 4px);
    outline: none;
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus, transparent);
}
.${INPUT_CLASS}::selection {
    background: var(--text-selection);
}
.${INPUT_CLASS}.is-invalid {
    border-color: var(--text-error);
}
.${BUTTON_CLASS} {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-left: 4px;
    padding: 0;
    color: var(--text-muted);
    background: transparent;
    border: none;
    box-shadow: none;
    border-radius: var(--radius-s, 4px);
    opacity: 0;
    cursor: pointer;
}
.tree-item-self:hover .${BUTTON_CLASS} {
    opacity: 1;
}
.${BUTTON_CLASS}:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
}
.${BUTTON_CLASS} .svg-icon {
    width: 14px;
    height: 14px;
}
.ohn-renaming {
    opacity: 0.6;
    pointer-events: none;
}
`;
var OutlineHeadingInlineRenamePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.session = null;
    this.lastClick = null;
    this.pendingEdit = null;
    this.editToken = 0;
    this.renaming = false;
    /**
     * Heading text this plugin has just written, keyed by file path + line.
     * It bridges the gap until the metadata cache re-parses the file, so a
     * second edit never needs a manual outline refresh.
     */
    this.recentRenames = /* @__PURE__ */ new Map();
    /* ----------------------------------------------------- event plumbing */
    this.handleDblClickCapture = (evt) => {
      var _a;
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest(OUTLINE_SELECTOR)) return;
      if (target.closest("." + INPUT_CLASS)) return;
      const ctx = this.resolveRowContext(target);
      if (!ctx) return;
      evt.stopPropagation();
      evt.preventDefault();
      if (((_a = this.session) == null ? void 0 : _a.row) === ctx.row || this.pendingEdit === ctx.row) return;
      void this.startEdit(ctx);
    };
    this.handleClickCapture = (evt) => {
      var _a;
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("." + INPUT_CLASS)) return;
      if (target.closest("." + BUTTON_CLASS)) {
        const ctx2 = this.resolveRowContext(target);
        if (!ctx2) return;
        evt.preventDefault();
        evt.stopPropagation();
        void this.startEdit(ctx2);
        return;
      }
      if (evt.button !== 0 || evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey) return;
      const ctx = this.resolveRowContext(target);
      if (!ctx) return;
      if (((_a = ctx.item) == null ? void 0 : _a.collapseEl) && ctx.item.collapseEl.contains(target)) return;
      if (ctx.row.querySelector("." + INPUT_CLASS)) return;
      const now = Date.now();
      const last = this.lastClick;
      if (last && last.row === ctx.row && now - last.time <= this.settings.doubleClickWindow) {
        this.lastClick = null;
        evt.preventDefault();
        evt.stopPropagation();
        void this.startEdit(ctx);
        return;
      }
      this.lastClick = { row: ctx.row, time: now };
    };
    this.handleMouseOver = (evt) => {
      if (!this.settings.showEditButton) return;
      const target = evt.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("." + BUTTON_CLASS)) return;
      const row = target.closest(".tree-item-self");
      if (!row) return;
      const container = row.closest(OUTLINE_SELECTOR);
      if (!container) return;
      if (this.settings.rightSidebarOnly && !container.closest(".mod-right-split")) return;
      if (row.querySelector("." + BUTTON_CLASS)) return;
      const button = document.createElement("button");
      button.className = BUTTON_CLASS;
      button.setAttribute("aria-label", "\u91CD\u547D\u540D\u6B64\u6807\u9898");
      button.setAttribute("title", "\u91CD\u547D\u540D\u6B64\u6807\u9898");
      (0, import_obsidian.setIcon)(button, "pencil");
      button.addEventListener("mousedown", (e) => e.stopPropagation());
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ctx = this.resolveRowContext(button);
        if (ctx) this.startEdit(ctx);
      });
      row.appendChild(button);
    };
  }
  async onload() {
    await this.loadSettings();
    this.injectStyles();
    this.addSettingTab(new OutlineRenameSettingTab(this.app, this));
    this.registerDomEvent(document, "click", this.handleClickCapture, true);
    this.registerDomEvent(document, "dblclick", this.handleDblClickCapture, true);
    this.registerDomEvent(document, "mouseover", this.handleMouseOver, true);
    this.registerEvent(this.app.workspace.on("layout-change", () => this.resetClickTracking()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.resetClickTracking()));
  }
  onunload() {
    var _a;
    this.resetClickTracking();
    if (this.session) this.finishSession(true);
    (_a = document.getElementById(STYLE_ID)) == null ? void 0 : _a.remove();
  }
  /* ---------------------------------------------------------------- setup */
  injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  resetClickTracking() {
    this.lastClick = null;
  }
  /* ------------------------------------------------------ DOM resolution */
  resolveRowContext(target) {
    const container = target.closest(OUTLINE_SELECTOR);
    if (!container) return null;
    if (this.settings.rightSidebarOnly && !container.closest(".mod-right-split")) return null;
    const row = target.closest(".tree-item-self");
    if (!row || !container.contains(row)) return null;
    const view = this.findOutlineView(container);
    if (!view) return null;
    const file = this.resolveFile(view);
    if (!file) return null;
    return { container, row, view, item: this.findItemForRow(view, row), file };
  }
  findOutlineView(container) {
    let found = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && view.containerEl === container) found = view;
    });
    return found;
  }
  resolveFile(view) {
    var _a;
    try {
      const owner = (_a = view.getOwner) == null ? void 0 : _a.call(view);
      const file = owner == null ? void 0 : owner.file;
      if (file instanceof import_obsidian.TFile) return file;
    } catch (err) {
    }
    return this.app.workspace.getActiveFile();
  }
  /**
   * Maps a rendered `.tree-item-self` back to the internal OutlineTreeItem.
   * `cachedHeadingDom` is the documented internal list of rendered rows.
   */
  findItemForRow(view, row) {
    const items = view.cachedHeadingDom;
    if (!Array.isArray(items)) return null;
    for (const item of items) {
      const self = item == null ? void 0 : item.selfEl;
      if (!self) continue;
      if (self === row || self.contains(row) || row.contains(self)) return item;
    }
    return null;
  }
  /** Falls back to index/text matching when the internal row object is absent. */
  resolveHeading(ctx) {
    var _a, _b, _c, _d;
    if ((_c = (_b = (_a = ctx.item) == null ? void 0 : _a.heading) == null ? void 0 : _b.position) == null ? void 0 : _c.start) return ctx.item.heading;
    const cache = this.app.metadataCache.getFileCache(ctx.file);
    const headings = (_d = cache == null ? void 0 : cache.headings) != null ? _d : [];
    if (!headings.length) return null;
    const rows = Array.from(ctx.container.querySelectorAll(".tree-item-self"));
    const index = rows.indexOf(ctx.row);
    const rowText = this.rowText(ctx.row);
    const wanted = normalizeHeading(rowText);
    if (index >= 0 && index < headings.length && normalizeHeading(headings[index].heading) === wanted) {
      return headings[index];
    }
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < headings.length; i++) {
      if (normalizeHeading(headings[i].heading) !== wanted) continue;
      const distance = index < 0 ? 0 : Math.abs(i - index);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = headings[i];
      }
    }
    return best;
  }
  rowText(row) {
    var _a, _b;
    const inner = row.querySelector(".tree-item-inner");
    return ((_b = (_a = inner == null ? void 0 : inner.textContent) != null ? _a : row.textContent) != null ? _b : "").trim();
  }
  /**
   * Reads the heading straight from the file, so a stale metadata cache (or a
   * rename we just performed) can never block a follow-up edit.
   */
  async resolveLiveHeading(ctx) {
    var _a, _b, _c, _d, _e, _f;
    const hint = ((_c = (_b = (_a = ctx.item) == null ? void 0 : _a.heading) == null ? void 0 : _b.position) == null ? void 0 : _c.start) ? ctx.item.heading : this.resolveHeading(ctx);
    const content = await this.readFileText(ctx.file);
    const lines = content.split("\n");
    const hintLine = (_f = (_e = (_d = hint == null ? void 0 : hint.position) == null ? void 0 : _d.start) == null ? void 0 : _e.line) != null ? _f : -1;
    const wanted = /* @__PURE__ */ new Set();
    if (hint) wanted.add(normalizeHeading(hint.heading));
    const remembered = this.recentRenames.get(ctx.file.path);
    if (remembered) {
      for (const record of remembered.values()) wanted.add(normalizeHeading(record.to));
    }
    if (!wanted.size && hintLine < 0) return null;
    const atHintLine = hintLine >= 0 && hintLine < lines.length ? parseHeadingLine(lines[hintLine]) : null;
    if (atHintLine && wanted.has(normalizeHeading(atHintLine.text))) {
      return { heading: atHintLine.text, level: atHintLine.level, position: hint.position };
    }
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < lines.length; index++) {
      const parsed = parseHeadingLine(lines[index]);
      if (!parsed || !wanted.has(normalizeHeading(parsed.text))) continue;
      const distance = hintLine < 0 ? index : Math.abs(index - hintLine);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { heading: parsed.text, level: parsed.level, position: makeHeadingPosition(index) };
      }
    }
    if (best) return best;
    if (atHintLine && hint && atHintLine.level === hint.level) {
      return { heading: atHintLine.text, level: atHintLine.level, position: hint.position };
    }
    return null;
  }
  rememberRename(path, line, from, to) {
    let byLine = this.recentRenames.get(path);
    if (!byLine) {
      byLine = /* @__PURE__ */ new Map();
      this.recentRenames.set(path, byLine);
    }
    byLine.set(line, { from, to });
    if (byLine.size > 64) {
      const oldest = byLine.keys().next();
      if (!oldest.done) byLine.delete(oldest.value);
    }
  }
  async readFileText(file) {
    const vault = this.app.vault;
    try {
      if (typeof vault.cachedRead === "function") return await vault.cachedRead(file);
      return await vault.read(file);
    } catch (err) {
      console.warn("[outline-inline-rename] could not read the file", err);
      return "";
    }
  }
  /* ------------------------------------------------------- inline editor */
  async startEdit(ctx) {
    if (this.pendingEdit === ctx.row) return;
    this.pendingEdit = ctx.row;
    const token = ++this.editToken;
    const heading = await this.resolveLiveHeading(ctx);
    if (this.pendingEdit === ctx.row) this.pendingEdit = null;
    if (token !== this.editToken) return;
    if (!heading) {
      new import_obsidian.Notice("\u65E0\u6CD5\u5B9A\u4F4D\u8BE5\u5927\u7EB2\u6761\u76EE\u5BF9\u5E94\u7684\u6807\u9898\uFF0C\u8BF7\u5148\u6298\u53E0/\u5C55\u5F00\u5927\u7EB2\u540E\u91CD\u8BD5\u3002");
      return;
    }
    if (this.session) this.finishSession(true);
    const row = ctx.row;
    const input = document.createElement("input");
    input.type = "text";
    input.className = INPUT_CLASS;
    input.value = heading.heading;
    input.spellcheck = false;
    input.setAttribute("aria-label", "\u7F16\u8F91\u6807\u9898");
    input.setAttribute("autocapitalize", "off");
    const inner = row.querySelector(".tree-item-inner");
    row.classList.add(EDITING_CLASS);
    if (inner && inner.parentElement === row) {
      row.insertBefore(input, inner.nextSibling);
    } else {
      row.appendChild(input);
    }
    const session = { ctx, row, input, heading, finished: false, composing: false };
    this.session = session;
    input.addEventListener("keydown", (evt) => this.onInputKeyDown(evt, session));
    input.addEventListener("mousedown", (evt) => evt.stopPropagation());
    input.addEventListener("click", (evt) => evt.stopPropagation());
    input.addEventListener("dblclick", (evt) => evt.stopPropagation());
    input.addEventListener("compositionstart", () => {
      session.composing = true;
    });
    input.addEventListener("compositionend", () => {
      session.composing = false;
    });
    input.addEventListener("blur", () => {
      if (session.finished) return;
      window.setTimeout(() => {
        if (this.session !== session) return;
        this.finishSession(!this.settings.commitOnBlur);
      }, 0);
    });
    window.setTimeout(() => {
      if (this.session !== session) return;
      input.focus();
      input.select();
    }, 0);
  }
  onInputKeyDown(evt, session) {
    if (session.composing || evt.isComposing || evt.keyCode === 229) {
      evt.stopPropagation();
      return;
    }
    if (evt.key === "Enter" || evt.key === "Tab") {
      evt.preventDefault();
      evt.stopPropagation();
      this.finishSession(false);
      return;
    }
    if (evt.key === "Escape") {
      evt.preventDefault();
      evt.stopPropagation();
      this.finishSession(true);
      return;
    }
    evt.stopPropagation();
  }
  /**
   * Closes the inline editor. `cancel === true` discards the typed value,
   * otherwise it is committed to the source file.
   */
  finishSession(cancel) {
    const session = this.session;
    if (!session || session.finished) return;
    session.finished = true;
    this.session = null;
    const value = sanitizeHeadingInput(session.input.value);
    session.input.remove();
    session.row.classList.remove(EDITING_CLASS);
    if (cancel) return;
    if (!value) {
      new import_obsidian.Notice("\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u5DF2\u53D6\u6D88\u91CD\u547D\u540D\u3002");
      return;
    }
    if (value === session.heading.heading) return;
    const duplicate = this.hasDuplicateHeading(session.ctx.file, session.heading, value);
    if (duplicate) {
      new import_obsidian.Notice(`\u300C${value}\u300D\u5DF2\u5B58\u5728\u540C\u540D\u6807\u9898\uFF0C\u4E3A\u907F\u514D\u94FE\u63A5\u6307\u5411\u9519\u8BEF\uFF0C\u5DF2\u53D6\u6D88\u91CD\u547D\u540D\u3002`);
      return;
    }
    void this.performRename(session.ctx.file, session.heading, value, session.row);
  }
  hasDuplicateHeading(file, heading, value) {
    var _a, _b, _c, _d, _e;
    const cache = this.app.metadataCache.getFileCache(file);
    const headings = (_a = cache == null ? void 0 : cache.headings) != null ? _a : [];
    const wanted = normalizeHeading(value);
    const selfLine = (_c = (_b = heading.position) == null ? void 0 : _b.start) == null ? void 0 : _c.line;
    for (const other of headings) {
      if (((_e = (_d = other.position) == null ? void 0 : _d.start) == null ? void 0 : _e.line) === selfLine) continue;
      if (normalizeHeading(other.heading) === wanted) return true;
    }
    return false;
  }
  /* ------------------------------------------------------------ renaming */
  async performRename(file, heading, newHeading, row) {
    if (this.renaming) {
      new import_obsidian.Notice("\u4E0A\u4E00\u6B21\u91CD\u547D\u540D\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u5019\u3002");
      return;
    }
    this.renaming = true;
    const oldHeading = heading.heading;
    try {
      const snapshot = await this.processFile(file, (content) => content);
      if (!this.checkHeadingLine(snapshot, heading)) {
        throw new Error("\u76EE\u6807\u6807\u9898\u5DF2\u88AB\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u5927\u7EB2\u540E\u91CD\u8BD5\u3002");
      }
      let updatedLinks = 0;
      for (const sourcePath of this.collectLinkCandidates(file)) {
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!(sourceFile instanceof import_obsidian.TFile)) continue;
        let changed = 0;
        await this.processFile(sourceFile, (content) => {
          const result = rewriteHeadingLinks(content, oldHeading, newHeading, (filePart, bare) => {
            if (bare) return sourcePath === file.path;
            const destination = this.app.metadataCache.getFirstLinkpathDest(filePart, sourcePath);
            return !!destination && destination.path === file.path;
          });
          changed = result.changed;
          return result.content;
        });
        updatedLinks += changed;
      }
      let renamed = false;
      await this.processFile(file, (content) => {
        const lines = content.split("\n");
        const index = heading.position.start.line;
        if (index < 0 || index >= lines.length) return content;
        const next = rewriteHeadingLine(lines[index], oldHeading, newHeading);
        if (next === null) return content;
        lines[index] = next;
        renamed = true;
        return lines.join("\n");
      });
      if (!renamed) throw new Error("\u6807\u9898\u884C\u5199\u5165\u5931\u8D25\uFF0C\u6587\u4EF6\u53EF\u80FD\u5DF2\u88AB\u5176\u4ED6\u7A0B\u5E8F\u4FEE\u6539\u3002");
      this.rememberRename(file.path, heading.position.start.line, oldHeading, newHeading);
      const label = row == null ? void 0 : row.querySelector(".tree-item-inner");
      if (label) label.textContent = newHeading;
      const linkNote = updatedLinks > 0 ? `\uFF0C\u540C\u6B65\u66F4\u65B0 ${updatedLinks} \u5904\u94FE\u63A5` : "";
      new import_obsidian.Notice(`\u5DF2\u91CD\u547D\u540D\u6807\u9898\u300C${newHeading}\u300D${linkNote}\u3002`);
    } catch (err) {
      console.error("[outline-inline-rename] rename failed", err);
      new import_obsidian.Notice(`\u91CD\u547D\u540D\u5931\u8D25\uFF1A${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.renaming = false;
    }
  }
  checkHeadingLine(content, heading) {
    const lines = content.split("\n");
    const index = heading.position.start.line;
    if (index < 0 || index >= lines.length) return false;
    return rewriteHeadingLine(lines[index], heading.heading, heading.heading) !== null;
  }
  /** Buffers of the file content, via `vault.process` when available. */
  async processFile(file, fn) {
    const vault = this.app.vault;
    if (typeof vault.process === "function") return vault.process(file, fn);
    const before = await vault.read(file);
    const after = fn(before);
    if (after !== before) await vault.modify(file, after);
    return after;
  }
  /**
   * Files that may contain a link to `file`: the file itself plus every
   * source the resolved link graph knows about. Their raw text is scanned by
   * {@link rewriteHeadingLinks}, so stale cached offsets cannot hide a link.
   */
  collectLinkCandidates(file) {
    var _a;
    const candidates = /* @__PURE__ */ new Set([file.path]);
    const resolved = (_a = this.app.metadataCache.resolvedLinks) != null ? _a : {};
    for (const sourcePath of Object.keys(resolved)) {
      const targets = resolved[sourcePath];
      if (targets && targets[file.path] > 0) candidates.add(sourcePath);
    }
    return [...candidates];
  }
};
function normalizeHeading(text) {
  return text.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ").toLowerCase();
}
function sanitizeHeadingInput(text) {
  let out = text.replace(/[\r\n]+/g, " ").trim();
  out = out.replace(/^#{1,6}[ \t]+/, "").trim();
  out = out.replace(/[ \t]+#+$/, "").trim();
  return out;
}
function parseHeadingLine(line) {
  const core = line.endsWith("\r") ? line.slice(0, -1) : line;
  const match = /^[ \t]{0,3}(#{1,6})[ \t]+([\s\S]*)$/.exec(core);
  if (!match) return null;
  const text = match[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
  if (!text) return null;
  return { level: match[1].length, text };
}
function makeHeadingPosition(index) {
  return {
    start: { line: index, col: 0, offset: 0 },
    end: { line: index, col: 0, offset: 0 }
  };
}
function rewriteHeadingLine(line, oldHeading, newHeading) {
  var _a, _b;
  const cr = line.endsWith("\r") ? "\r" : "";
  const core = cr ? line.slice(0, -1) : line;
  const atx = /^([ \t]{0,3})(#{1,6})([ \t]+)([\s\S]*)$/.exec(core);
  if (atx) {
    let body = atx[4];
    let closing = "";
    const close = /([ \t]+#+[ \t]*)$/.exec(body);
    if (close) {
      closing = close[1];
      body = body.slice(0, body.length - closing.length);
    }
    if (normalizeHeading(body) !== normalizeHeading(oldHeading)) return null;
    return atx[1] + atx[2] + atx[3] + newHeading.trim() + closing + cr;
  }
  if (/^[ \t]{0,3}#{1,6}[ \t]*$/.test(core)) return null;
  if (normalizeHeading(core) !== normalizeHeading(oldHeading)) return null;
  const indent = (_b = (_a = /^[ \t]{0,3}/.exec(core)) == null ? void 0 : _a[0]) != null ? _b : "";
  return indent + newHeading.trim() + cr;
}
function splitLinkTarget(link) {
  if (!link) return null;
  const hash = link.indexOf("#");
  if (hash < 0) return { filePart: link, subpath: null };
  return { filePart: link.slice(0, hash), subpath: link.slice(hash + 1) };
}
function headingMatches(subpath, oldHeading) {
  const wanted = normalizeHeading(oldHeading);
  if (!wanted) return false;
  if (normalizeHeading(subpath) === wanted) return true;
  if (/%[0-9A-Fa-f]{2}/.test(subpath)) {
    const decoded = safeDecode(subpath);
    if (decoded !== subpath && normalizeHeading(decoded) === wanted) return true;
  }
  return false;
}
function rewriteLinkToken(token, oldHeading, newHeading, accept) {
  var _a, _b, _c, _d;
  const lead = (_b = (_a = /^\s*/.exec(token)) == null ? void 0 : _a[0]) != null ? _b : "";
  const trail = (_d = (_c = /\s*$/.exec(token)) == null ? void 0 : _c[0]) != null ? _d : "";
  const core = token.slice(lead.length, token.length - trail.length);
  if (!core) return null;
  const bang = core.startsWith("!");
  const body = bang ? core.slice(1) : core;
  if (body.startsWith("[[") && body.endsWith("]]")) {
    const inner = body.slice(2, -2);
    if (accept && !acceptsHeadingLink(inner, accept)) return null;
    const rewritten = rewriteWikiTarget(inner, oldHeading, newHeading);
    if (rewritten === null) return null;
    return lead + (bang ? "!" : "") + "[[" + rewritten + "]]" + trail;
  }
  if (body.startsWith("[")) {
    const match = /^\[([^\]]*)\]\(([\s\S]*)\)$/.exec(body);
    if (!match) return null;
    if (accept && !acceptsHeadingLink(match[2], accept)) return null;
    const rewritten = rewriteMarkdownUrl(match[2], oldHeading, newHeading);
    if (rewritten === null) return null;
    return lead + (bang ? "!" : "") + "[" + match[1] + "](" + rewritten + ")" + trail;
  }
  return null;
}
function rewriteWikiTarget(inner, oldHeading, newHeading) {
  const pipe = indexOfUnescapedPipe(inner);
  const target = pipe < 0 ? inner : inner.slice(0, pipe);
  const alias = pipe < 0 ? "" : inner.slice(pipe);
  const hash = target.indexOf("#");
  if (hash < 0) return null;
  const subpath = target.slice(hash + 1);
  if (!headingMatches(subpath, oldHeading)) return null;
  const prefix = target.slice(0, hash + 1);
  return prefix + newHeading.trim() + alias;
}
function rewriteMarkdownUrl(inner, oldHeading, newHeading) {
  const whitespace = inner.search(/\s/);
  const url = whitespace < 0 ? inner : inner.slice(0, whitespace);
  const rest = whitespace < 0 ? "" : inner.slice(whitespace);
  const hash = url.indexOf("#");
  if (hash < 0) return null;
  const subpath = url.slice(hash + 1);
  if (!headingMatches(subpath, oldHeading)) return null;
  const needsEncoding = /%[0-9A-Fa-f]{2}/.test(subpath) || /\s/.test(newHeading.trim());
  const encoded = needsEncoding ? encodeURIComponent(newHeading.trim()).replace(/%2F/gi, "/") : newHeading.trim();
  return url.slice(0, hash + 1) + encoded + rest;
}
function rewriteHeadingLinks(content, oldHeading, newHeading, accept) {
  let changed = 0;
  const out = content.replace(LINK_TOKEN_PATTERN, (token) => {
    const next = rewriteLinkToken(token, oldHeading, newHeading, accept);
    if (next === null || next === token) return token;
    changed++;
    return next;
  });
  return { content: out, changed };
}
var LINK_TOKEN_PATTERN = /!?\[\[[^\[\]\n]+\]\]|\[[^\]\n]*\]\([^)\n]*\)/g;
function acceptsHeadingLink(inner, accept) {
  const pipe = indexOfUnescapedPipe(inner);
  const target = pipe < 0 ? inner : inner.slice(0, pipe);
  const hash = target.indexOf("#");
  if (hash < 0) return false;
  const filePart = target.slice(0, hash);
  return accept(filePart, filePart === "");
}
function indexOfUnescapedPipe(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "|") return i;
  }
  return -1;
}
function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch (err) {
    return text;
  }
}
var OutlineRenameSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("\u4EC5\u5728\u53F3\u4FA7\u8FB9\u680F\u751F\u6548").setDesc("\u5F00\u542F\u540E\u53EA\u5904\u7406\u53F3\u4FA7\u8FB9\u680F\u4E2D\u7684\u539F\u751F\u5927\u7EB2\u89C6\u56FE\uFF1B\u5173\u95ED\u540E\u4EFB\u4F55\u4F4D\u7F6E\u7684\u5927\u7EB2\u89C6\u56FE\u90FD\u4F1A\u54CD\u5E94\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.rightSidebarOnly).onChange(async (value) => {
        this.plugin.settings.rightSidebarOnly = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5931\u7126\u65F6\u63D0\u4EA4").setDesc("\u5F00\u542F\uFF1A\u70B9\u51FB\u522B\u5904\u5373\u4FDD\u5B58\uFF1B\u5173\u95ED\uFF1A\u70B9\u51FB\u522B\u5904\u89C6\u4E3A\u53D6\u6D88\uFF08\u53EA\u4FDD\u7559 Enter \u63D0\u4EA4\uFF09\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.commitOnBlur).onChange(async (value) => {
        this.plugin.settings.commitOnBlur = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u53CC\u51FB\u5224\u5B9A\u7A97\u53E3\uFF08\u6BEB\u79D2\uFF09").setDesc("\u4E24\u6B21\u70B9\u51FB\u7684\u95F4\u9694\u5C0F\u4E8E\u8BE5\u503C\u65F6\u89C6\u4E3A\u53CC\u51FB\u5E76\u8FDB\u5165\u884C\u5185\u7F16\u8F91\u3002\u5355\u51FB\u8DF3\u8F6C\u6CA1\u6709\u4EFB\u4F55\u5EF6\u8FDF\u3002").addSlider(
      (slider) => slider.setLimits(150, 500, 10).setValue(this.plugin.settings.doubleClickWindow).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.doubleClickWindow = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u663E\u793A\u60AC\u505C\u94C5\u7B14\u6309\u94AE\uFF08\u964D\u7EA7\u65B9\u6848\uFF09").setDesc("\u5728\u5927\u7EB2\u6761\u76EE\u53F3\u4FA7\u663E\u793A\u4E00\u4E2A\u5C0F\u6309\u94AE\uFF0C\u70B9\u51FB\u540C\u6837\u8FDB\u5165\u884C\u5185\u91CD\u547D\u540D\u3002\u53CC\u51FB\u5931\u6548\u65F6\u53EF\u4F5C\u4E3A\u515C\u5E95\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showEditButton).onChange(async (value) => {
        this.plugin.settings.showEditButton = value;
        await this.plugin.saveSettings();
        if (!value) {
          document.querySelectorAll("." + BUTTON_CLASS).forEach((el) => el.remove());
        }
      })
    );
  }
};
