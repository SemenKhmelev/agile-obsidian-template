/*
 * Roadmap board — in-Obsidian roadmap visualization (full version).
 *
 * Ported from Roadmap/visualization/index.html to run inside Obsidian as a
 * Dataview folder-view. Live data from dv.pages — no export step, no browser.
 *
 * Features:
 *   - three modes: Полный (timeline by horizons), Компактный, Суперкомпактный
 *   - filters: type / status / full-text search + "свернуть/развернуть всё"
 *   - per-node collapse/expand
 *   - detail panel: native markdown preview (via dv.el) + "Открыть заметку"
 *   - draggable width splitter (persisted), rebased to the block container
 *   - light/dark theming via Obsidian CSS variables (see view.css)
 *
 * require("obsidian") is intentionally NOT used — it is not resolvable in this
 * dataviewjs context. Markdown is rendered through dv.el(), which routes strings
 * through Obsidian's native MarkdownRenderer internally.
 *
 * Invoked from a note via:  await dv.view("views/roadmap-board", { dv });
 */

dv = input.dv;
const viewComponent = dv.component; // block lifecycle: DOM events auto-unregister on unload

// ===========================================================================
// 1. Data adapter — build the node shape index.html expected, from the vault.
// ===========================================================================
function normLink(x) {
  if (x == null) return "";
  if (typeof x === "object") x = x.path ?? x.display ?? x.subpath ?? "";
  let s = String(x).replace(/\[\[|\]\]/g, "").trim();
  if (s.includes("|")) s = s.split("|")[0].trim();
  if (s.includes("/")) s = s.substring(s.lastIndexOf("/") + 1);
  return s.replace(/\.md$/i, "");
}

function typeOf(fm) {
  const raw = fm && fm.tags;
  const tags = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((t) => String(t).toLowerCase());
  if (tags.includes("vision")) return "Vision";
  if (tags.includes("theme")) return "Theme";
  if (tags.includes("epic")) return "Epic";
  return "Other";
}

const items = dv.pages('"Roadmap"').map((p) => {
  const fm = p.file.frontmatter || {};
  return {
    file: p.file.path,
    name: p.file.name,
    title: fm.title || p.file.name,
    type: typeOf(fm),
    status: fm.status || "todo",
    track: fm.track || "",
    horizon: fm.horizon ?? "",
    start: fm.start || "",
    end: fm.end || "",
    parent: normLink(fm.parent),
  };
}).array();

const nodes = items.map((item) => ({ ...item, children: [] }));
const byName = new Map(nodes.map((node) => [node.name, node]));
for (const node of nodes) {
  const parent = node.parent && byName.get(node.parent);
  if (parent && parent !== node) {
    node.__parent = parent;
    parent.children.push(node);
  } else {
    node.__parent = null;
  }
}
const byKey = new Map();
nodes.forEach((node) => byKey.set(nodeKey(node), node));
const visionNodes = nodes.filter((node) => node.type === "Vision");

// ===========================================================================
// 2. State
// ===========================================================================
const palette = ["#7c9bff", "#f472b6", "#facc15", "#34d399", "#f97316", "#a855f7", "#60a5fa", "#f973ab"];
const collapsedThemes = new Set();
const collapsedEpics = new Set();
const contentCache = new Map();

let viewMode = "full";           // "full" | "compact" | "micro"
let useHorizons = true;          // timeline-by-horizons toggle (full mode only)
let currentThemeKeys = [];
let currentEpicKeys = [];
let selectedNodeKey = null;
let selectedNodeAccent = null;
let renderToken = 0;

const DETAIL_WIDTH_KEY = "roadmap-board.detailWidth";
const DEFAULT_DETAIL_WIDTH = 420;
const DETAIL_MIN_WIDTH = 280;
const DETAIL_MAX_WIDTH = 1000;
const PRIMARY_MIN_WIDTH = 280;
let detailWidth = DEFAULT_DETAIL_WIDTH;
let resizeActive = false;
let resizePointerId = null;

// ===========================================================================
// 3. Helpers
// ===========================================================================
function nodeKey(node) {
  return `${node.type}:${node.file || node.title}`;
}

function statusClass(value) {
  const s = (value || "todo").toLowerCase();
  if (s.includes("in-flight") || s.includes("doing") || s.includes("active")) return "status-active";
  if (s.includes("done") || s.includes("closed")) return "status-done";
  if (s.includes("blocked") || s.includes("risk") || s.includes("crit")) return "status-crit";
  return "status-todo";
}

function cleanHorizon(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function horizonInfo(value) {
  const str = String(value).trim();
  const num = Number(str);
  if (Number.isFinite(num)) return { key: String(num), label: String(num), type: "number", sort: num };
  return { key: str, label: str, type: "text", sort: str.toLowerCase() };
}

function annotateHorizons(visions) {
  const horizonMap = new Map();
  let hasNoHorizon = false;
  function walk(node, inherited) {
    const own = cleanHorizon(node.horizon);
    const effective = own ?? inherited ?? null;
    node.effectiveHorizon = effective;
    if (node.type === "Theme") {
      if (effective === null) {
        node.horizonKey = "no-date";
        hasNoHorizon = true;
      } else {
        const info = horizonInfo(effective);
        node.horizonKey = info.key;
        if (!horizonMap.has(info.key)) horizonMap.set(info.key, info);
      }
    }
    (node.children || []).forEach((child) => walk(child, effective));
  }
  visions.forEach((vision) => walk(vision, cleanHorizon(vision.horizon)));
  const numeric = [];
  const text = [];
  horizonMap.forEach((info) => { if (info.type === "number") numeric.push(info); else text.push(info); });
  numeric.sort((a, b) => a.sort - b.sort);
  text.sort((a, b) => a.label.localeCompare(b.label, "ru"));
  return { order: [...numeric, ...text], hasNoHorizon };
}

function effectiveHorizon(node) {
  let current = node;
  while (current) {
    if (current.horizon) return current.horizon;
    current = current.__parent || null;
  }
  return null;
}

function rootVisionOf(node) {
  let current = node;
  while (current && current.type !== "Vision") current = current.__parent || null;
  return current;
}

function accentForKey(key) {
  const node = byKey.get(key);
  if (!node) return palette[0];
  const root = rootVisionOf(node);
  if (!root) return palette[0];
  const index = visionNodes.indexOf(root);
  return index === -1 ? palette[0] : palette[index % palette.length];
}

function formatDateValue(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) return new Date(timestamp).toISOString().slice(0, 10);
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const dotMatch = raw.match(/^(\d{2}\.\d{2}\.\d{4})/);
  if (dotMatch) return dotMatch[1];
  return raw.replace(/T.*$/, "");
}

function formatDatePeriod(start, end) {
  const s = formatDateValue(start);
  const e = formatDateValue(end);
  if (!s && !e) return null;
  return `Даты: ${s || "?"} → ${e || "?"}`;
}

function isCollapsed(node) {
  const set = node.type === "Theme" ? collapsedThemes : collapsedEpics;
  return set.has(nodeKey(node));
}
function setCollapsed(node, value) {
  const set = node.type === "Theme" ? collapsedThemes : collapsedEpics;
  const key = nodeKey(node);
  if (value) set.add(key); else set.delete(key);
}
function registerNode(node) {
  const key = nodeKey(node);
  if (node.type === "Theme") currentThemeKeys.push(key);
  if (node.type === "Epic") currentEpicKeys.push(key);
  return key;
}

function createCollapseToggle(node) {
  if (!node.children || !node.children.length) return null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "collapse-toggle";
  const collapsed = isCollapsed(node);
  btn.classList.toggle("is-collapsed", collapsed);
  btn.setAttribute("aria-expanded", String(!collapsed));
  btn.title = collapsed ? "Развернуть" : "Свернуть";
  // SVG chevron (reliable across themes; CSS-border arrows clipped inconsistently).
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M6 9l6 6 6-6");
  svg.appendChild(path);
  btn.appendChild(svg);
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    setCollapsed(node, !isCollapsed(node));
    render();
  });
  return btn;
}

function createBadge(text, extra) {
  if (text === undefined || text === null || text === "") return null;
  const span = document.createElement("span");
  span.className = ["badge", extra].filter(Boolean).join(" ");
  span.textContent = String(text);
  return span;
}
function createPill(text) {
  if (!text) return null;
  const span = document.createElement("span");
  span.className = "pill";
  span.textContent = text;
  return span;
}
function createChip(text, extra) {
  if (text === undefined || text === null || text === "") return null;
  const span = document.createElement("span");
  span.className = ["chip", extra].filter(Boolean).join(" ");
  span.textContent = String(text);
  return span;
}

function createMarker(kind, accent, variant = "floating") {
  const marker = document.createElement("span");
  marker.className = `marker marker-${variant} marker-${kind}`;
  if (accent) marker.style.setProperty("--marker-color", accent);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  let shape;
  if (kind === "vision") {
    shape = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    shape.setAttribute("cx", "8"); shape.setAttribute("cy", "8"); shape.setAttribute("r", "5.5");
  } else if (kind === "theme") {
    shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    shape.setAttribute("points", "8 2.5 13.5 13.5 2.5 13.5");
  } else {
    shape = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    shape.setAttribute("x", "3"); shape.setAttribute("y", "3");
    shape.setAttribute("width", "10"); shape.setAttribute("height", "10"); shape.setAttribute("rx", "1.4");
  }
  svg.appendChild(shape);
  marker.appendChild(svg);
  return marker;
}

function decorateTitle(element, kind, accent, options = {}) {
  if (!element) return;
  const original = element.textContent || "";
  const { withMarker = true } = options;
  element.textContent = "";
  element.classList.toggle("title-with-marker", Boolean(withMarker));
  const text = document.createElement("span");
  text.className = "title-text";
  text.textContent = original;
  element.appendChild(text);
  if (withMarker) element.appendChild(createMarker(kind, accent, "floating"));
}

function applyInlineMarker(element, kind, accent) {
  if (!element) return;
  const original = element.textContent || "";
  element.textContent = "";
  element.classList.remove("title-with-marker");
  element.classList.add("hierarchy-label");
  const text = document.createElement("span");
  text.className = "label-text";
  text.textContent = original;
  element.appendChild(createMarker(kind, accent, "inline"));
  element.appendChild(text);
}

function markerKindFromType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.startsWith("vision")) return "vision";
  if (normalized.startsWith("theme")) return "theme";
  if (normalized.startsWith("epic")) return "epic";
  return null;
}

function makeSelectable(element, node, accent) {
  if (!element || !node) return;
  const key = nodeKey(node);
  element.classList.add("selectable");
  element.dataset.nodeKey = key;
  if (accent) element.dataset.accent = accent;
  if (!element.hasAttribute("tabindex")) element.tabIndex = 0;
  if (!element.querySelector(":scope > .selection-ring")) {
    const ring = document.createElement("span");
    ring.className = "selection-ring";
    element.appendChild(ring);
  }
  if (selectedNodeKey && selectedNodeKey === key) {
    element.classList.add("is-selected");
    const color = accent || selectedNodeAccent;
    if (color) element.style.setProperty("--selection-accent", color);
  }
  const handler = (event) => {
    if (event && event.defaultPrevented) return;
    const control = event.target.closest("button, a[href], input, select, textarea, label");
    if (control && control !== element) return;
    event.preventDefault();
    selectNode(key, accent || element.dataset.accent);
  };
  element.addEventListener("click", handler);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") handler(event);
  });
}

function appendBadges(container, node) {
  const status = createBadge(node.status || "todo", statusClass(node.status));
  if (status) container.appendChild(status);
  const horizon = createBadge(node.effectiveHorizon || node.horizon, "");
  if (horizon) container.appendChild(horizon);
  const track = createBadge(node.track, "");
  if (track) container.appendChild(track);
}

// ===========================================================================
// 4. Filters
// ===========================================================================
function matchesFilters(item) {
  if (fType.value && item.type !== fType.value) return false;
  if (fStatus.value && !((item.status || "").toLowerCase().includes(fStatus.value.toLowerCase()))) return false;
  const haystack = [item.title, item.parent, item.horizon, item.track].join(" ").toLowerCase();
  return haystack.includes((fSearch.value || "").toLowerCase());
}
function cloneTree(node) {
  const childCopies = node.children.map(cloneTree).filter(Boolean);
  if (matchesFilters(node) || childCopies.length) return { ...node, children: childCopies };
  return null;
}
function collectFilteredVisions() {
  return visionNodes.map(cloneTree).filter(Boolean);
}

// ===========================================================================
// 5. Full / timeline renderers
// ===========================================================================
function renderVisionCell(vision, accent) {
  const cell = document.createElement("div");
  cell.className = "vision-cell";
  const card = document.createElement("article");
  card.className = "vision-card";
  card.style.setProperty("--vision-color", accent);

  const title = document.createElement("div");
  title.className = "vision-title";
  title.textContent = vision.title;
  decorateTitle(title, "vision", accent);
  card.appendChild(title);

  const badgeRow = document.createElement("div");
  badgeRow.className = "vision-badges";
  appendBadges(badgeRow, vision);
  if (badgeRow.childElementCount) card.appendChild(badgeRow);

  const meta = document.createElement("div");
  meta.className = "vision-meta";
  const pill = createPill(formatDatePeriod(vision.start, vision.end));
  if (pill) meta.appendChild(pill);
  if (meta.childElementCount) card.appendChild(meta);

  cell.appendChild(card);
  makeSelectable(card, vision, accent);
  return cell;
}

function renderFullTheme(theme, accent) {
  registerNode(theme);
  const card = document.createElement("article");
  card.className = "theme-card";
  card.style.setProperty("--theme-accent", accent);

  const header = document.createElement("div");
  header.className = "theme-header";
  const info = document.createElement("div");
  info.className = "theme-info";

  const typeRow = document.createElement("div");
  typeRow.className = "theme-type-row";
  const typeLabel = document.createElement("div");
  typeLabel.className = "theme-type";
  typeLabel.textContent = theme.type || "Theme";
  applyInlineMarker(typeLabel, "theme", accent);
  typeRow.appendChild(typeLabel);
  info.appendChild(typeRow);

  const title = document.createElement("div");
  title.className = "theme-title";
  title.textContent = theme.title;
  decorateTitle(title, "theme", accent, { withMarker: false });
  info.appendChild(title);

  const chips = document.createElement("div");
  chips.className = "theme-chips";
  appendBadges(chips, theme);
  if (chips.childElementCount) typeRow.appendChild(chips);

  header.appendChild(info);
  const toggle = createCollapseToggle(theme);
  if (toggle) header.appendChild(toggle);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "theme-body";
  const metaRow = document.createElement("div");
  metaRow.className = "theme-meta";
  const pill = createPill(formatDatePeriod(theme.start, theme.end));
  if (pill) metaRow.appendChild(pill);
  if (metaRow.childElementCount) body.appendChild(metaRow);

  if (theme.children && theme.children.length) {
    const list = document.createElement("div");
    list.className = "epic-list";
    theme.children.forEach((child) => list.appendChild(renderFullEpic(child, accent)));
    body.appendChild(list);
  }
  card.appendChild(body);

  makeSelectable(card, theme, accent);
  if (isCollapsed(theme)) card.classList.add("collapsed");
  return card;
}

function renderFullEpic(epic, accent) {
  registerNode(epic);
  const card = document.createElement("div");
  card.className = "epic-card";
  card.style.setProperty("--epic-accent", accent);

  const header = document.createElement("div");
  header.className = "epic-header";
  const info = document.createElement("div");
  info.className = "epic-info";

  const typeRow = document.createElement("div");
  typeRow.className = "epic-type-row";
  const typeLabel = document.createElement("div");
  typeLabel.className = "epic-type";
  typeLabel.textContent = (epic.type || "Epic").toUpperCase();
  applyInlineMarker(typeLabel, "epic", accent);
  typeRow.appendChild(typeLabel);
  info.appendChild(typeRow);

  const title = document.createElement("div");
  title.className = "epic-title";
  title.textContent = epic.title;
  decorateTitle(title, "epic", accent, { withMarker: false });
  info.appendChild(title);

  const chips = document.createElement("div");
  chips.className = "epic-chips";
  appendBadges(chips, epic);
  if (chips.childElementCount) typeRow.appendChild(chips);

  header.appendChild(info);
  const toggle = createCollapseToggle(epic);
  if (toggle) header.appendChild(toggle);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "epic-body";
  const meta = document.createElement("div");
  meta.className = "epic-meta";
  const trackMeta = epic.track ? `Трек: ${epic.track}` : null;
  const period = formatDatePeriod(epic.start, epic.end);
  [trackMeta, period].forEach((text) => {
    if (!text) return;
    const span = document.createElement("span");
    span.textContent = text;
    meta.appendChild(span);
  });
  if (meta.childElementCount) body.appendChild(meta);

  if (epic.children && epic.children.length) {
    const nested = document.createElement("div");
    nested.className = "epic-list";
    epic.children.forEach((child) => nested.appendChild(renderFullEpic(child, accent)));
    body.appendChild(nested);
  }
  card.appendChild(body);

  makeSelectable(card, epic, accent);
  if (isCollapsed(epic)) card.classList.add("collapsed");
  return card;
}

function renderTimeline(visions, horizonData, timelineActive) {
  const grid = document.createElement("div");
  grid.className = "rmb-timeline";

  let columnKeys;
  const labels = new Map();
  let hasNoHorizon = horizonData.hasNoHorizon;

  if (timelineActive) {
    const order = horizonData.order;
    columnKeys = order.map((h) => h.key);
    order.forEach((h) => labels.set(h.key, h.label));
    if (!columnKeys.length) {
      columnKeys = ["no-date"];
      labels.set("no-date", "Инициативы");
      hasNoHorizon = false;
    } else if (hasNoHorizon && !labels.has("no-date")) {
      columnKeys.push("no-date");
      labels.set("no-date", "Без срока");
    }
  } else {
    columnKeys = ["hierarchy"];
    labels.set("hierarchy", "Иерархия");
    hasNoHorizon = false;
  }

  // Horizons layout: fixed lane columns (board scrolls horizontally when narrow).
  // Stack layout: a single flexible column that fills the width.
  const laneCol = timelineActive ? "var(--rmb-lane-col)" : "minmax(360px, 720px)";
  const template = `var(--vision-col) repeat(${Math.max(columnKeys.length, 1)}, ${laneCol})`;

  const headerRow = document.createElement("div");
  headerRow.className = "timeline-header";
  headerRow.style.gridTemplateColumns = template;
  const axisLabel = document.createElement("div");
  axisLabel.className = "axis-label";
  axisLabel.textContent = "Виденье";
  headerRow.appendChild(axisLabel);
  columnKeys.forEach((key) => {
    const cell = document.createElement("div");
    cell.className = "axis-cell";
    cell.textContent = labels.get(key) || key;
    headerRow.appendChild(cell);
  });
  grid.appendChild(headerRow);

  visions.forEach((vision) => {
    const accent = vision.__accent;
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.style.gridTemplateColumns = template;
    row.appendChild(renderVisionCell(vision, accent));

    if (timelineActive) {
      columnKeys.forEach((key) => {
        const lane = document.createElement("div");
        lane.className = "lane";
        lane.style.setProperty("--lane-accent", accent);
        const track = document.createElement("div");
        track.className = "lane-track";
        const themes = (vision.children || []).filter((theme) => {
          if (key === "no-date") return theme.horizonKey === "no-date";
          const info = theme.effectiveHorizon ? horizonInfo(theme.effectiveHorizon) : null;
          const columnKey = theme.horizonKey || (info ? info.key : "no-date");
          return columnKey === key;
        });
        if (!themes.length) lane.classList.add("lane-empty");
        themes.forEach((theme) => track.appendChild(renderFullTheme(theme, accent)));
        lane.appendChild(track);
        row.appendChild(lane);
      });
    } else {
      const lane = document.createElement("div");
      lane.className = "lane";
      lane.style.setProperty("--lane-accent", accent);
      const track = document.createElement("div");
      track.className = "lane-track";
      const themes = vision.children || [];
      if (!themes.length) lane.classList.add("lane-empty");
      themes.forEach((theme) => track.appendChild(renderFullTheme(theme, accent)));
      lane.appendChild(track);
      row.appendChild(lane);
    }
    grid.appendChild(row);
  });

  return grid;
}

// ===========================================================================
// 6. Compact renderers
// ===========================================================================
function renderCompactVision(vision, accent) {
  const block = document.createElement("section");
  block.className = "compact-vision";
  block.style.setProperty("--accent-color", accent);

  const header = document.createElement("div");
  header.className = "compact-vision-header";
  const info = document.createElement("div");
  info.className = "compact-vision-info";

  const title = document.createElement("div");
  title.className = "compact-vision-title";
  title.textContent = vision.title;
  decorateTitle(title, "vision", accent);
  info.appendChild(title);

  const chips = document.createElement("div");
  chips.className = "compact-vision-chips";
  appendBadges(chips, vision);
  if (chips.childElementCount) info.appendChild(chips);

  header.appendChild(info);
  block.appendChild(header);

  const meta = document.createElement("div");
  meta.className = "compact-vision-meta";
  const pill = createPill(formatDatePeriod(vision.start, vision.end));
  if (pill) meta.appendChild(pill);
  if (meta.childElementCount) block.appendChild(meta);

  if (vision.children && vision.children.length) {
    const body = document.createElement("div");
    body.className = "compact-vision-body";
    vision.children.forEach((theme) => body.appendChild(renderCompactTheme(theme, accent)));
    block.appendChild(body);
  }

  makeSelectable(block, vision, accent);
  return block;
}

function renderCompactTheme(theme, accent) {
  registerNode(theme);
  const card = document.createElement("div");
  card.className = "compact-theme";
  card.style.setProperty("--accent-color", accent);

  const header = document.createElement("div");
  header.className = "compact-theme-header";
  const title = document.createElement("div");
  title.className = "compact-theme-title";
  title.textContent = theme.title;
  decorateTitle(title, "theme", accent, { withMarker: false });
  header.appendChild(title);

  const chips = document.createElement("div");
  chips.className = "compact-theme-chips";
  appendBadges(chips, theme);
  if (chips.childElementCount) header.appendChild(chips);

  const toggle = createCollapseToggle(theme);
  if (toggle) header.appendChild(toggle);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "compact-theme-body";
  const period = formatDatePeriod(theme.start, theme.end);
  if (period) {
    const pill = createPill(period);
    if (pill) body.appendChild(pill);
  }
  if (theme.children && theme.children.length) {
    theme.children.forEach((epic) => body.appendChild(renderCompactEpic(epic, accent)));
  }
  card.appendChild(body);

  makeSelectable(card, theme, accent);
  if (isCollapsed(theme)) card.classList.add("collapsed");
  return card;
}

function renderCompactEpic(epic, accent) {
  registerNode(epic);
  const card = document.createElement("div");
  card.className = "compact-epic";
  card.style.setProperty("--accent-color", accent);

  const header = document.createElement("div");
  header.className = "compact-epic-header";
  const info = document.createElement("div");
  info.className = "compact-epic-info";

  const typeRow = document.createElement("div");
  typeRow.className = "compact-epic-type-row";
  const type = document.createElement("span");
  type.className = "compact-epic-type";
  type.textContent = (epic.type || "Epic").toUpperCase();
  applyInlineMarker(type, "epic", accent);
  typeRow.appendChild(type);

  const chips = document.createElement("div");
  chips.className = "compact-epic-chips";
  appendBadges(chips, epic);
  if (chips.childElementCount) typeRow.appendChild(chips);
  info.appendChild(typeRow);

  const title = document.createElement("div");
  title.className = "compact-epic-title";
  title.textContent = epic.title;
  decorateTitle(title, "epic", accent, { withMarker: false });
  info.appendChild(title);

  header.appendChild(info);
  const toggle = createCollapseToggle(epic);
  if (toggle) header.appendChild(toggle);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "compact-epic-body";
  const lines = [];
  if (epic.track) lines.push(`Трек: ${epic.track}`);
  const period = formatDatePeriod(epic.start, epic.end);
  if (period) lines.push(period);
  lines.forEach((text) => {
    const div = document.createElement("div");
    div.textContent = text;
    body.appendChild(div);
  });
  if (epic.children && epic.children.length) {
    epic.children.forEach((child) => body.appendChild(renderCompactEpic(child, accent)));
  }
  card.appendChild(body);

  makeSelectable(card, epic, accent);
  if (isCollapsed(epic)) card.classList.add("collapsed");
  return card;
}

// ===========================================================================
// 7. Supercompact (matrix) renderers
// ===========================================================================
function renderMicro(visions) {
  const container = document.createElement("div");
  container.className = "matrix-view";
  visions.forEach((vision) => {
    const accent = vision.__accent;
    const section = document.createElement("section");
    section.className = "matrix-vision";
    section.style.setProperty("--accent-color", accent);

    const header = document.createElement("div");
    header.className = "matrix-vision-header";
    const title = document.createElement("h3");
    title.className = "matrix-vision-title";
    title.textContent = vision.title;
    decorateTitle(title, "vision", accent);
    header.appendChild(title);

    const chipRow = document.createElement("div");
    chipRow.className = "matrix-chip-row";
    const statusChip = createChip(vision.status || "todo", statusClass(vision.status));
    if (statusChip) chipRow.appendChild(statusChip);
    const horizonChip = createChip(vision.horizon || vision.effectiveHorizon, "chip-horizon");
    if (horizonChip) chipRow.appendChild(horizonChip);
    const trackChip = createChip(vision.track, "");
    if (trackChip) chipRow.appendChild(trackChip);
    if (chipRow.childElementCount) header.appendChild(chipRow);
    section.appendChild(header);

    const matrix = document.createElement("div");
    matrix.className = "matrix-grid";
    const themes = (vision.children || []).filter((c) => c && typeof c === "object");
    if (themes.length) {
      themes.forEach((theme) => matrix.appendChild(renderMicroTheme(theme, accent)));
    } else {
      const empty = document.createElement("div");
      empty.className = "matrix-empty";
      empty.textContent = "Темы не заданы";
      matrix.appendChild(empty);
    }
    section.appendChild(matrix);

    makeSelectable(section, vision, accent);
    container.appendChild(section);
  });
  return container;
}

function renderMicroTheme(theme, accent) {
  registerNode(theme);
  const card = document.createElement("div");
  card.className = "matrix-theme";
  card.style.setProperty("--accent-color", accent);

  const header = document.createElement("div");
  header.className = "matrix-theme-header";
  const title = document.createElement("div");
  title.className = "matrix-theme-title";
  title.textContent = theme.title;
  decorateTitle(title, "theme", accent, { withMarker: false });
  header.appendChild(title);

  const chipRow = document.createElement("div");
  chipRow.className = "matrix-chip-row";
  const statusChip = createChip(theme.status || "todo", statusClass(theme.status));
  if (statusChip) chipRow.appendChild(statusChip);
  const horizonChip = createChip(theme.effectiveHorizon || theme.horizon, "chip-horizon");
  if (horizonChip) chipRow.appendChild(horizonChip);
  const trackChip = createChip(theme.track, "");
  if (trackChip) chipRow.appendChild(trackChip);
  if (chipRow.childElementCount) header.appendChild(chipRow);
  card.appendChild(header);

  const epicGrid = document.createElement("div");
  epicGrid.className = "matrix-epics";
  const children = (theme.children || []).filter((c) => c && typeof c === "object");
  if (children.length) {
    children.forEach((child) => epicGrid.appendChild(renderMicroEpic(child, accent)));
  } else {
    const empty = document.createElement("div");
    empty.className = "matrix-empty";
    empty.textContent = "Нет эпиков";
    epicGrid.appendChild(empty);
  }
  card.appendChild(epicGrid);

  makeSelectable(card, theme, accent);
  return card;
}

function renderMicroEpic(epic, accent) {
  registerNode(epic);
  const card = document.createElement("div");
  card.className = "matrix-epic";
  card.style.setProperty("--accent-color", accent);

  const title = document.createElement("div");
  title.className = "matrix-epic-title";
  title.textContent = epic.title;
  decorateTitle(title, "epic", accent, { withMarker: false });
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "matrix-epic-meta";
  const marker = createMarker("epic", accent, "inline");
  marker.title = epic.type || "Epic";
  meta.appendChild(marker);
  const statusChip = createChip(epic.status || "todo", statusClass(epic.status));
  if (statusChip) meta.appendChild(statusChip);
  const horizonChip = createChip(epic.effectiveHorizon || epic.horizon, "chip-horizon");
  if (horizonChip) meta.appendChild(horizonChip);
  const trackChip = createChip(epic.track, "");
  if (trackChip) meta.appendChild(trackChip);
  if (meta.childElementCount) card.appendChild(meta);

  const children = (epic.children || []).filter((c) => c && typeof c === "object");
  if (children.length) {
    const body = document.createElement("div");
    body.className = "matrix-epic-body";
    const nested = document.createElement("div");
    nested.className = "matrix-epic-nested";
    children.forEach((child) => nested.appendChild(renderMicroEpic(child, accent)));
    body.appendChild(nested);
    card.appendChild(body);
  }

  makeSelectable(card, epic, accent);
  return card;
}

// ===========================================================================
// 8. DOM shell (header + toolbar + workspace)
// ===========================================================================
const root = dv.el("div", "", { cls: "rmb-root" });

const header = root.createDiv({ cls: "rmb-header" });
header.createEl("h2", { cls: "rmb-title", text: "Roadmap" });
const legend = header.createDiv({ cls: "rmb-legend" });
[["vision", "Vision"], ["theme", "Theme"], ["epic", "Epic"]].forEach(([kind, label]) => {
  const item = legend.createSpan();
  item.appendChild(createMarker(kind, null, "inline"));
  item.appendChild(document.createTextNode(label));
});

const toolbar = root.createDiv({ cls: "rmb-toolbar", attr: { role: "toolbar", "aria-label": "Фильтры и режимы" } });
const fType = toolbar.createEl("select", { cls: "rmb-select", attr: { "aria-label": "Фильтр по типу" } });
[["", "Все типы"], ["Vision", "Vision"], ["Theme", "Theme"], ["Epic", "Epic"]].forEach(([value, label]) => {
  const o = fType.createEl("option", { text: label }); o.value = value;
});
const fStatus = toolbar.createEl("select", { cls: "rmb-select", attr: { "aria-label": "Фильтр по статусу" } });
[["", "Все статусы"], ["todo", "todo"], ["in-flight", "in-flight"], ["done", "done"], ["blocked", "blocked"]].forEach(([value, label]) => {
  const o = fStatus.createEl("option", { text: label }); o.value = value;
});
const fSearch = toolbar.createEl("input", { cls: "rmb-input", attr: { type: "search", placeholder: "Поиск по названию / parent / horizon / track", "aria-label": "Поиск" } });

const modeGroup = toolbar.createDiv({ cls: "rmb-toggle-group", attr: { role: "group", "aria-label": "Режим отображения" } });
const modeButtons = [["full", "Полный"], ["compact", "Компактный"], ["micro", "Суперкомпактный"]].map(([mode, label]) => {
  const b = modeGroup.createEl("button", { cls: "rmb-toggle", text: label, attr: { type: "button" } });
  b.dataset.mode = mode;
  return b;
});
const toggleHorizonsBtn = toolbar.createEl("button", { cls: "rmb-toggle", text: "По горизонтам", attr: { type: "button" } });
const collapseAllBtn = toolbar.createEl("button", { cls: "rmb-toggle", text: "Свернуть всё", attr: { type: "button" } });

const workspace = root.createDiv({ cls: "rmb-workspace" });
const primaryPane = workspace.createDiv({ cls: "primary-pane" });
const roadmapEl = primaryPane.createDiv({ cls: "rmb-board" });

const detailPane = workspace.createDiv({ cls: "detail-pane" });
const splitter = detailPane.createDiv({ cls: "rmb-splitter", attr: { role: "separator", "aria-orientation": "vertical", tabindex: "0", "aria-label": "Изменить ширину панели" } });
const detailInner = detailPane.createDiv({ cls: "detail-inner" });
const detailHeader = detailInner.createDiv({ cls: "detail-header" });
const detailHeading = detailHeader.createDiv({ cls: "detail-heading" });
const detailType = detailHeading.createDiv({ cls: "detail-type" });
const detailTitle = detailHeading.createEl("h3", { cls: "detail-title", text: "Выберите элемент" });
const detailClose = detailHeader.createEl("button", { cls: "detail-close", text: "Закрыть", attr: { type: "button" } });
const detailMeta = detailInner.createDiv({ cls: "detail-meta" });
const detailScroll = detailInner.createDiv({ cls: "detail-scroll" });
const detailEmpty = detailScroll.createDiv({ cls: "detail-empty", text: "Кликните по Vision, Theme или Epic, чтобы увидеть содержимое заметки." });
const detailContent = detailScroll.createEl("article", { cls: "detail-content" });
detailContent.style.display = "none";
const detailFooter = detailInner.createDiv({ cls: "detail-footer" });
const openNoteBtn = detailFooter.createEl("button", { cls: "rmb-open-note", text: "Открыть заметку", attr: { type: "button" } });
const detailPath = detailFooter.createDiv({ cls: "detail-path" });
detailFooter.style.display = "none";

// ===========================================================================
// 9. Detail panel
// ===========================================================================
function stripCallouts(markdown) {
  const lines = markdown.split("\n");
  const kept = [];
  let inCallout = false;
  for (const line of lines) {
    if (/^\s*>\s*\[!/i.test(line)) { inCallout = true; continue; }
    if (inCallout && /^\s*>/.test(line)) continue;
    if (inCallout) inCallout = false;
    kept.push(line);
  }
  return kept.join("\n");
}
function stripForPreview(md) {
  let s = String(md || "").replace(/\r\n?/g, "\n");
  s = s.replace(/^---\n[\s\S]*?\n---\n?/, "");
  s = stripCallouts(s);
  s = s.replace(/```dataview(js)?[\s\S]*?```/gi, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
async function loadContent(path) {
  if (contentCache.has(path)) return contentCache.get(path);
  let out = "";
  try {
    const raw = await dv.io.load(path);
    out = stripForPreview(raw);
  } catch (err) {
    out = "";
  }
  contentCache.set(path, out);
  return out;
}

function clearDetail() {
  detailType.textContent = "";
  detailType.style.color = "";
  detailType.classList.remove("hierarchy-label");
  detailTitle.textContent = "Выберите элемент";
  detailMeta.empty();
  detailMeta.style.display = "none";
  detailContent.empty();
  detailContent.style.display = "none";
  detailEmpty.style.display = "";
  detailEmpty.textContent = "Кликните по Vision, Theme или Epic, чтобы увидеть содержимое заметки.";
  detailFooter.style.display = "none";
  detailPath.textContent = "";
  detailPane.style.removeProperty("--selection-accent");
}

async function openDetail(node, accent) {
  const color = accent || accentForKey(nodeKey(node));
  root.classList.add("is-detail-open");
  detailPane.style.setProperty("--selection-accent", color);

  detailType.textContent = node.type || "";
  detailType.style.color = color;
  const markerKind = markerKindFromType(node.type);
  if (markerKind) applyInlineMarker(detailType, markerKind, color);
  detailTitle.textContent = node.title || node.name || "Без названия";

  detailMeta.empty();
  const metaEntries = [];
  if (node.status) metaEntries.push({ text: node.status, className: statusClass(node.status) });
  const horizonValue = node.horizon || effectiveHorizon(node);
  if (horizonValue) metaEntries.push({ text: `Горизонт: ${horizonValue}` });
  if (node.track) metaEntries.push({ text: `Трек: ${node.track}` });
  if (node.parent) metaEntries.push({ text: `Родитель: ${node.parent}` });
  const period = formatDatePeriod(node.start, node.end);
  if (period) metaEntries.push({ text: period });
  metaEntries.forEach((entry) => {
    const span = document.createElement("span");
    span.textContent = entry.text;
    if (entry.className) span.classList.add(entry.className);
    detailMeta.appendChild(span);
  });
  detailMeta.style.display = detailMeta.childElementCount ? "" : "none";

  openNoteBtn.onclick = () => app.workspace.openLinkText(node.file, node.file);
  detailPath.textContent = node.file || "";
  detailFooter.style.display = "";

  const token = ++renderToken;
  detailContent.empty();
  detailContent.style.display = "none";
  detailEmpty.style.display = "";
  detailEmpty.textContent = "Загрузка…";
  const md = await loadContent(node.file);
  if (token !== renderToken) return;

  detailContent.empty();
  if (md && md.trim()) {
    // dv.el() with a string routes through Obsidian's native MarkdownRenderer.
    dv.el("div", md, { container: detailContent, cls: "rmb-md" });
    detailContent.style.display = "";
    detailEmpty.style.display = "none";
  } else {
    detailContent.style.display = "none";
    detailEmpty.style.display = "";
    detailEmpty.textContent = "Заметка пуста.";
  }
  detailScroll.scrollTop = 0;
}

function closeDetail() {
  selectedNodeKey = null;
  selectedNodeAccent = null;
  renderToken++;
  root.classList.remove("is-detail-open");
  clearDetail();
  syncSelectionHighlight();
}

function syncSelectionHighlight() {
  root.querySelectorAll(".selectable[data-node-key]").forEach((el) => {
    if (selectedNodeKey && el.dataset.nodeKey === selectedNodeKey) {
      el.classList.add("is-selected");
      const accent = selectedNodeAccent || el.dataset.accent;
      if (accent) el.style.setProperty("--selection-accent", accent);
    } else {
      el.classList.remove("is-selected");
      el.style.removeProperty("--selection-accent");
    }
  });
}

async function selectNode(key, accent) {
  const node = byKey.get(key);
  if (!node) { closeDetail(); return; }
  selectedNodeKey = key;
  selectedNodeAccent = accent || accentForKey(key);
  syncSelectionHighlight();
  await openDetail(node, selectedNodeAccent);
}

// ===========================================================================
// 10. Splitter (rebased to the block container)
// ===========================================================================
function clampDetailWidth(value) {
  if (!Number.isFinite(value)) return DEFAULT_DETAIL_WIDTH;
  const rootWidth = root.clientWidth || (DETAIL_MAX_WIDTH + PRIMARY_MIN_WIDTH);
  const maxAllowed = Math.min(DETAIL_MAX_WIDTH, Math.max(DETAIL_MIN_WIDTH, rootWidth - PRIMARY_MIN_WIDTH));
  return Math.min(Math.max(value, DETAIL_MIN_WIDTH), maxAllowed);
}
function applyDetailWidth(value) {
  detailWidth = clampDetailWidth(value);
  root.style.setProperty("--rmb-detail-width", `${detailWidth}px`);
}
function persistDetailWidth() {
  try { localStorage.setItem(DETAIL_WIDTH_KEY, String(detailWidth)); } catch (err) { /* ignore */ }
}
function handleResizeMove(event) {
  if (!resizeActive) return;
  const rect = root.getBoundingClientRect();
  applyDetailWidth(rect.right - event.clientX);
}
function stopResize(event) {
  if (!resizeActive) return;
  if (resizePointerId !== null && event && event.pointerId !== undefined && event.pointerId !== resizePointerId) return;
  resizeActive = false;
  splitter.classList.remove("is-dragging");
  try { if (resizePointerId !== null) splitter.releasePointerCapture(resizePointerId); } catch (err) { /* ignore */ }
  resizePointerId = null;
  persistDetailWidth();
}

// ===========================================================================
// 11. Controls + render
// ===========================================================================
function updateControls(timelineActive) {
  modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === viewMode));
  toggleHorizonsBtn.disabled = viewMode !== "full";
  toggleHorizonsBtn.classList.toggle("active", timelineActive && viewMode === "full");
  toggleHorizonsBtn.textContent = viewMode === "full"
    ? (timelineActive ? "Свернуть горизонты" : "По горизонтам")
    : "По горизонтам";
  collapseAllBtn.disabled = viewMode === "micro";
}
function updateRootClasses(timelineActive) {
  root.classList.remove("mode-full", "mode-compact", "mode-micro", "layout-horizons", "layout-stack");
  root.classList.add(`mode-${viewMode}`);
  if (viewMode === "full") {
    root.classList.toggle("layout-horizons", timelineActive);
    root.classList.toggle("layout-stack", !timelineActive);
  }
}
function updateCollapseAllButton() {
  if (collapseAllBtn.disabled) {
    collapseAllBtn.textContent = "Свернуть всё";
    collapseAllBtn.dataset.action = "collapse";
    return;
  }
  const total = currentThemeKeys.length + currentEpicKeys.length;
  const collapsedCount = currentThemeKeys.filter((k) => collapsedThemes.has(k)).length
    + currentEpicKeys.filter((k) => collapsedEpics.has(k)).length;
  if (total === 0 || collapsedCount !== total) {
    collapseAllBtn.textContent = "Свернуть всё";
    collapseAllBtn.dataset.action = "collapse";
  } else {
    collapseAllBtn.textContent = "Развернуть всё";
    collapseAllBtn.dataset.action = "expand";
  }
}

function render() {
  const filteredVisions = collectFilteredVisions();
  roadmapEl.empty();
  currentThemeKeys = [];
  currentEpicKeys = [];

  if (!filteredVisions.length) {
    roadmapEl.createDiv({
      cls: "rmb-empty",
      text: visionNodes.length
        ? "Ничего не найдено под фильтры."
        : "Нет данных roadmap — проверьте теги vision / theme / epic во frontmatter.",
    });
    updateControls(false);
    updateRootClasses(false);
    syncSelectionHighlight();
    updateCollapseAllButton();
    return;
  }

  filteredVisions.forEach((vision, index) => { vision.__accent = palette[index % palette.length]; });
  const horizonData = annotateHorizons(filteredVisions);
  const timelineActive = useHorizons && viewMode === "full";
  updateControls(timelineActive);
  updateRootClasses(timelineActive);

  if (viewMode === "micro") {
    roadmapEl.appendChild(renderMicro(filteredVisions));
  } else if (viewMode === "compact") {
    const container = roadmapEl.createDiv({ cls: "compact-view" });
    filteredVisions.forEach((vision) => container.appendChild(renderCompactVision(vision, vision.__accent)));
  } else {
    roadmapEl.appendChild(renderTimeline(filteredVisions, horizonData, timelineActive));
  }

  syncSelectionHighlight();
  updateCollapseAllButton();
}

// ===========================================================================
// 12. Wiring
// ===========================================================================
fType.onchange = () => render();
fStatus.onchange = () => render();
fSearch.oninput = () => render();

modeButtons.forEach((b) => b.addEventListener("click", () => {
  const next = b.dataset.mode;
  if (!next || next === viewMode) return;
  viewMode = next;
  render();
}));
toggleHorizonsBtn.addEventListener("click", () => {
  if (viewMode !== "full") return;
  useHorizons = !useHorizons;
  render();
});
collapseAllBtn.addEventListener("click", () => {
  if (collapseAllBtn.disabled) return;
  if (collapseAllBtn.dataset.action === "expand") {
    collapsedThemes.clear();
    collapsedEpics.clear();
  } else {
    currentThemeKeys.forEach((k) => collapsedThemes.add(k));
    currentEpicKeys.forEach((k) => collapsedEpics.add(k));
  }
  render();
});

detailClose.addEventListener("click", () => closeDetail());
const onKeydown = (event) => {
  if (event.key === "Escape" && root.classList.contains("is-detail-open")) closeDetail();
};
if (viewComponent && typeof viewComponent.registerDomEvent === "function") {
  viewComponent.registerDomEvent(document, "keydown", onKeydown);
  viewComponent.registerDomEvent(window, "resize", () => applyDetailWidth(detailWidth));
} else {
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("resize", () => applyDetailWidth(detailWidth));
}

splitter.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !root.classList.contains("is-detail-open")) return;
  resizeActive = true;
  resizePointerId = event.pointerId;
  splitter.classList.add("is-dragging");
  try { splitter.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
  event.preventDefault();
});
splitter.addEventListener("pointermove", handleResizeMove);
splitter.addEventListener("pointerup", stopResize);
splitter.addEventListener("pointercancel", stopResize);
splitter.addEventListener("dblclick", () => {
  applyDetailWidth(DEFAULT_DETAIL_WIDTH);
  persistDetailWidth();
});
splitter.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 48 : 24;
  let handled = false;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") { applyDetailWidth(detailWidth + step); handled = true; }
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") { applyDetailWidth(detailWidth - step); handled = true; }
  else if (event.key === "Home") { applyDetailWidth(DETAIL_MAX_WIDTH); handled = true; }
  else if (event.key === "End") { applyDetailWidth(DETAIL_MIN_WIDTH); handled = true; }
  if (handled) { persistDetailWidth(); event.preventDefault(); }
});

// Restore persisted width, then draw.
const storedWidth = Number(localStorage.getItem(DETAIL_WIDTH_KEY));
applyDetailWidth(Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : DEFAULT_DETAIL_WIDTH);
clearDetail();
render();
