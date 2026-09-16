/*
 * Roadmap timeline — диаграмма Ганта по живым данным каталога Roadmap.
 *
 * Слева дерево «тема → эпик → подэпик» по полю parent, справа полосы по датам
 * start/end. Видения (vision) строками не выводятся — по ним работает фильтр.
 * Эпики без темы собраны в группу «Без темы». Полосу со сроками рисуют только
 * эпики без вложенных; тема и эпик с подэпиками — группы, у них вместо полосы
 * подсвечена строка (у темы — её цветом, у эпика — цветом его подэпиков).
 *
 * Тип заметки определяется тегом — так же, как во «Визуализации»
 * (_views/roadmap-board): vision / theme / epic.
 *
 * Что вьюха пишет в vault (и только это):
 *   start / end   — перетаскивание и растягивание полосы;
 *   order         — перестановка строк среди соседей (priority — если он уже задан);
 *   новые заметки — эпик в Roadmap/2-Epics через «+» у строки или «Новый эпик»;
 *   удаление      — эпик вместе с подэпиками уходит в корзину через fileManager.trashFile.
 * Правки идут через app.fileManager.processFrontMatter, остальной frontmatter
 * и текст заметок не трогаются.
 *
 * Подключение из заметки:  await dv.view("Roadmap/_view/timeline", { dv });
 *
 * Frontmatter:
 *   tags    — vision | theme | epic (обязательно, иначе заметка не попадёт на таймлайн)
 *   parent  — ссылка на родителя: видение, тему или эпик
 *   key     — ключ вида RM-1 / RM-1.2, при перестановке не меняется
 *   order   — порядок среди соседей (число)
 *   status  — idea | todo | in-progress | in-flight | done | blocked
 *   start   — дата начала (YYYY-MM-DD), можно не заполнять
 *   end     — дата окончания (YYYY-MM-DD), можно не заполнять
 *   lane    — поток работ (показывается в подсказке полосы)
 *   term    — словесный срок из плана («3 месяца», «сквозное»)
 */

dv = input.dv;
const viewComponent = dv.component; // жизненный цикл блока: события снимутся при выгрузке

// ===========================================================================
// 1. Константы
// ===========================================================================
const MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

// Оттенки подобраны так, чтобы белый текст на полосе читался и в светлой, и в тёмной теме.
const PALETTE = [
  "#2f6fd0", "#7b4fd0", "#0d7a6c", "#b3541e", "#a3286b",
  "#2f7d32", "#1f6f8b", "#8a6d1f", "#5b6472",
];

const STATUS_META = {
  idea: { label: "Идея", cls: "st-idea" },
  todo: { label: "К выполнению", cls: "st-todo" },
  "in-progress": { label: "В работе", cls: "st-progress" },
  "in-flight": { label: "В работе", cls: "st-progress" },
  doing: { label: "В работе", cls: "st-progress" },
  active: { label: "В работе", cls: "st-progress" },
  done: { label: "Готово", cls: "st-done" },
  closed: { label: "Готово", cls: "st-done" },
  blocked: { label: "Заблокировано", cls: "st-blocked" },
};

const STATUS_FILTERS = [
  ["all", "Все статусы"],
  ["st-idea", "Идея"],
  ["st-todo", "К выполнению"],
  ["st-progress", "В работе"],
  ["st-done", "Готово"],
  ["st-blocked", "Заблокировано"],
];

const SCALES = {
  month: { px: 116, label: "Месяцы" },
  quarter: { px: 46, label: "Кварталы" },
};

const LS_SCALE = "roadmap-timeline.scale";
const LS_COLLAPSED = "roadmap-timeline.collapsed";
const ROADMAP_DIR = "Roadmap";
const EPICS_DIR = "Roadmap/2-Epics";
const TYPE_TAGS = ["vision", "theme", "epic"];
const ORPHANS_PATH = "::без-темы"; // путь-заглушка виртуальной группы

const DAY_MS = 86400000;
const HANDLE_HIT = 8;      // ширина зоны захвата у края полосы, px
const DRAG_SLOP = 2;       // сдвиг, после которого жест считается перетаскиванием, px
const ROW_DRAG_SLOP = 4;   // то же для перестановки строк, px
const EDGE_SCROLL = 48;    // у края полотна начинаем автопрокрутку, px
const NEW_EPIC_DAYS = 30;  // длительность нового эпика по умолчанию
const NEW_SUB_DAYS = 14;   // длительность нового подэпика по умолчанию
const NAME_LIMIT = 80;     // ограничение на имя файла, символов

const LIVE_TERM = '**Срок:** `= default(dateformat(this.start, "yyyy-MM-dd"), "не задан")`'
  + ' — `= default(dateformat(this.end, "yyyy-MM-dd"), "не задан")`';

// Задачи спринтов, у которых parent указывает на эпик (ссылкой или ключом).
const TASKS_VIEW = [
  "```dataviewjs",
  'await dv.view("views/roadmap-epic-elements", { dv });',
  "```",
].join("\n");

const CHILDREN_QUERY = [
  "```dataview",
  'TABLE WITHOUT ID key AS "Ключ", file.link AS "Эпик", status AS "Статус", start AS "Старт", end AS "Финиш"',
  `FROM "${EPICS_DIR}"`,
  "WHERE parent = this.file.link",
  "SORT order ASC, key ASC",
  "```",
].join("\n");

// ===========================================================================
// 2. Утилиты
// ===========================================================================
function readLs(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch (err) {
    return fallback;
  }
}

function writeLs(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    /* приватный режим или запрет на хранилище — молча продолжаем */
  }
}

function normLink(value) {
  if (value == null) return "";
  let raw = value;
  if (typeof raw === "object") raw = raw.path ?? raw.display ?? raw.subpath ?? "";
  let s = String(raw).replace(/\[\[|\]\]/g, "").trim();
  if (s.includes("|")) s = s.split("|")[0].trim();
  if (s.includes("/")) s = s.substring(s.lastIndexOf("/") + 1);
  return s.replace(/\.md$/i, "");
}

function tagsOf(fm) {
  const raw = fm && fm.tags;
  return (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((tag) => String(tag).replace(/^#/, "").trim())
    .filter(Boolean);
}

/** Тип по тегу; порядок проверки тот же, что во «Визуализации». */
function kindOf(tags) {
  const lower = tags.map((tag) => tag.toLowerCase());
  return TYPE_TAGS.find((kind) => lower.includes(kind)) || null;
}

/** Дата из frontmatter приходит строкой, JS Date или Luxon DateTime — приводим к {y,m,d}. */
function toYmd(value) {
  if (value === null || value === undefined || value === "") return null;
  let s;
  if (typeof value === "object") {
    if (typeof value.toISODate === "function") s = value.toISODate();
    else if (value instanceof Date) s = value.toISOString().slice(0, 10);
    else s = String(value);
  } else {
    s = String(value);
  }
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

// --- арифметика дат: считаем в UTC, чтобы переход на летнее время не сдвигал дни
function ymdToUtc(ymd) {
  return Date.UTC(ymd.y, ymd.m - 1, ymd.d);
}

function utcToYmd(ts) {
  const date = new Date(ts);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function addDays(ymd, days) {
  return utcToYmd(ymdToUtc(ymd) + days * DAY_MS);
}

function diffDays(from, to) {
  return Math.round((ymdToUtc(to) - ymdToUtc(from)) / DAY_MS);
}

function sameYmd(a, b) {
  return Boolean(a && b) && a.y === b.y && a.m === b.m && a.d === b.d;
}

function minYmd(a, b) {
  if (!a) return b;
  if (!b) return a;
  return diffDays(a, b) >= 0 ? a : b;
}

function maxYmd(a, b) {
  if (!a) return b;
  if (!b) return a;
  return diffDays(a, b) >= 0 ? b : a;
}

function isoOf(ymd) {
  return `${ymd.y}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`;
}

function statusMeta(value) {
  const key = String(value || "todo").toLowerCase().trim();
  return STATUS_META[key] || { label: value ? String(value) : "К выполнению", cls: "st-todo" };
}

function formatYmd(ymd) {
  if (!ymd) return "не задана";
  return `${String(ymd.d).padStart(2, "0")}.${String(ymd.m).padStart(2, "0")}.${ymd.y}`;
}

function numberOr(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function plural(n, one, few, many) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function compareRu(a, b) {
  return a.localeCompare(b, "ru", { numeric: true });
}

/** Строки с ключом идут раньше строк без ключа, ключи сравниваются по номерам. */
function compareKeys(a, b) {
  if (a && b) return compareRu(a, b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}

/** Имя заметки: без символов, запрещённых в путях и в вики-ссылках. */
function safeName(value) {
  const cleaned = String(value)
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > NAME_LIMIT ? cleaned.slice(0, NAME_LIMIT).trim() : cleaned;
}

// ===========================================================================
// 3. Модель
// ===========================================================================
let rawItems = [];     // все видения, темы и эпики
let visions = [];      // имена видений — для фильтра
let rows = [];         // темы и эпики, то есть всё, что рисуется строками
let rootThemes = [];   // темы верхнего уровня
let orphanGroup = null; // виртуальная группа эпиков без темы
let roots = [];        // верхний уровень дерева: темы и группа «Без темы»

/** При равном order строки со сроками идут раньше строк без сроков, по дате начала. */
function compareStart(a, b) {
  if (a.start && b.start) return diffDays(b.start, a.start);
  if (a.start) return -1;
  if (b.start) return 1;
  return 0;
}

const byOrder = (a, b) => (a.order - b.order) || compareStart(a, b) || compareKeys(a.key, b.key) || compareRu(a.title, b.title);

function itemFromPage(page) {
  const fm = page.file.frontmatter || {};
  const tags = tagsOf(fm);
  const kind = kindOf(tags);
  if (!kind) return null;
  return {
    path: page.file.path,
    name: page.file.name,
    kind,
    tags,
    key: String(fm.key ?? "").trim(),
    title: String(fm.title || page.file.name).trim(),
    status: String(fm.status || "todo").toLowerCase().trim(),
    lane: String(fm.lane ?? "").trim(),
    term: String(fm.term ?? "").trim(),
    order: numberOr(fm.order, 999),
    parent: normLink(fm.parent),
    start: toYmd(fm.start),
    end: toYmd(fm.end),
    children: [],
    parentItem: null,
    accent: null,
    span: null,
  };
}

/** Родитель, замыкающий цикл, игнорируется: иначе дерево не построить. */
function createsCycle(item, candidate) {
  for (let node = candidate; node; node = node.parentItem) {
    if (node === item) return true;
  }
  return false;
}

/** Цвет эпика верхнего уровня: по номеру ключа (RM-3 → третий цвет палитры),
 *  без ключа — по месту среди соседей в алфавитном порядке. Так цвет не
 *  меняется при перестановке строк. */
function epicColor(epic, siblings) {
  const num = Number(/-(\d+)$/.exec(epic.key)?.[1]);
  const index = Number.isInteger(num) && num > 0
    ? num - 1
    : siblings.map((sibling) => sibling.name).sort(compareRu).indexOf(epic.name);
  return PALETTE[index % PALETTE.length];
}

/** accent — цвет полосы строки, band — цвет подсветки темы, в которую строка входит. */
function paint(node, accent, band) {
  node.accent = accent;
  node.band = band;
  node.children.sort(byOrder);
  node.children.forEach((child) => paint(child, accent, band));
}

function linkItems() {
  visions = rawItems.filter((item) => item.kind === "vision").map((item) => item.name).sort(compareRu);
  rows = rawItems.filter((item) => item.kind !== "vision");

  const byName = new Map(rows.map((row) => [row.name, row]));
  rows.forEach((row) => {
    row.children = [];
    row.parentItem = null;
  });
  rows.forEach((row) => {
    const parent = byName.get(row.parent);
    if (!parent || createsCycle(row, parent)) return;
    row.parentItem = parent;
    parent.children.push(row);
  });

  // Темы всегда по алфавиту; порядок (order) действует только среди эпиков.
  rootThemes = rows
    .filter((row) => !row.parentItem && row.kind === "theme")
    .sort((a, b) => compareRu(a.title, b.title));
  const orphans = rows.filter((row) => !row.parentItem && row.kind !== "theme").sort(byOrder);
  orphanGroup = orphans.length
    ? {
      path: ORPHANS_PATH,
      name: "Без темы",
      title: "Без темы",
      kind: "group",
      virtual: true,
      tags: [],
      key: "",
      status: "",
      lane: "",
      term: "",
      parent: "",
      start: null,
      end: null,
      children: orphans,
      parentItem: null,
    }
    : null;
  roots = orphanGroup ? [...rootThemes, orphanGroup] : rootThemes.slice();

  // Цвет темы закреплён за её именем, поэтому перестановка строк его не меняет.
  const colorIndex = new Map(rootThemes.map((theme) => theme.name).sort(compareRu).map((name, index) => [name, index]));
  roots.forEach((root) => {
    // Тема красит фон своего блока; у группы «Без темы» подсветки нет.
    const band = root.virtual ? null : PALETTE[colorIndex.get(root.name) % PALETTE.length];
    root.accent = band || "var(--text-muted)";
    root.band = band;
    root.children.sort(byOrder);
    // У каждого эпика темы свой цвет полосы, подэпики наследуют цвет эпика.
    root.children.forEach((epic) => paint(epic, epicColor(epic, root.children), band));
  });
}

/** Соседи эпика для перестановки: дети его родителя, у эпика без темы — такие же эпики. */
function siblingsOf(item) {
  if (item.parentItem) return item.parentItem.children;
  return orphanGroup ? orphanGroup.children : [];
}

function descendantsOf(item) {
  const out = [];
  const walk = (node) => node.children.forEach((child) => {
    out.push(child);
    walk(child);
  });
  walk(item);
  return out;
}

rawItems = dv.pages(`"${ROADMAP_DIR}"`).array().map(itemFromPage).filter(Boolean);
linkItems();

// --- метрики задач по эпикам ------------------------------------------------
// Считаются один раз при загрузке: за годы в vault накапливаются тысячи задач, а доски
// спринтов разбираются построчно — на каждую перерисовку это слишком дорого.

/** Колонки доски, которые считаются закрытой работой. */
const DONE_COLUMNS = new Set(["done"]);

/** Оценка задачи: во frontmatter это строка ("25"), пустая у части задач. */
function estimateHours(fm) {
  const raw = fm && fm.estimate;
  if (raw === null || raw === undefined || String(raw).trim() === "") return 0;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Эпик, на который ссылается parent задачи: ссылкой [[RM-1 Видимость и поиск колонок]] или ключом RM-1.2. */
const epicByName = new Map();
const epicByKey = new Map();
rawItems.forEach((item) => {
  if (item.kind !== "epic") return;
  epicByName.set(item.name.toLowerCase(), item);
  if (item.key) epicByKey.set(item.key.toLowerCase(), item);
});

function epicForParent(value) {
  const norm = normLink(value).toLowerCase();
  if (!norm) return null;
  return epicByKey.get(norm) || epicByName.get(norm) || null;
}

/** Статус задачи — колонка её карточки на доске спринта, а не frontmatter. */
function doneTaskPaths() {
  const done = new Set();
  dv.pages().where((page) => page.file.frontmatter?.["kanban-plugin"]).array().forEach((board) => {
    board.file.lists.array().forEach((card) => {
      if (!DONE_COLUMNS.has(String(card.header?.subpath || "").toLowerCase().trim())) return;
      Array.from(card.outlinks || []).forEach((link) => {
        if (link?.path) done.add(link.path);
      });
    });
  });
  return done;
}

/** Свои задачи эпика: количество, сумма оценок и сколько часов уже закрыто. */
function collectOwnMetrics() {
  const done = doneTaskPaths();
  rawItems.forEach((item) => {
    item.own = { tasks: 0, hours: 0, doneHours: 0 };
  });

  dv.pages()
    .where((page) => (page.file.folder || "").includes("/tasks"))
    .array()
    .forEach((page) => {
      const fm = page.file.frontmatter || {};
      const epic = epicForParent(fm.parent);
      if (!epic) return;
      const hours = estimateHours(fm);
      epic.own.tasks += 1;
      epic.own.hours += hours;
      if (done.has(page.file.path)) epic.own.doneHours += hours;
    });
}

/** Итог строки — свои задачи плюс задачи всех вложенных эпиков: у эпика
 *  с подэпиками своих задач обычно нет, а показать по нему итог всё равно надо. */
function rollUpMetrics(node) {
  const total = { tasks: node.own.tasks, hours: node.own.hours, doneHours: node.own.doneHours };
  node.children.forEach((child) => {
    const sub = rollUpMetrics(child);
    total.tasks += sub.tasks;
    total.hours += sub.hours;
    total.doneHours += sub.doneHours;
  });
  node.metrics = total;
  return total;
}

/** Пересбор итогов по дереву: без чтения vault, поэтому вызывается после
 *  каждой перестройки связей — иначе у перенесённого подэпика часы остаются
 *  висеть на прежнем родителе. */
function recomputeRollUp() {
  rawItems.forEach((item) => {
    if (!item.own) item.own = { tasks: 0, hours: 0, doneHours: 0 };
  });
  rawItems.filter((item) => !item.parentItem).forEach(rollUpMetrics);
  rawItems.forEach((item) => {
    if (!item.metrics) item.metrics = { tasks: 0, hours: 0, doneHours: 0 };
  });
}

function computeMetrics() {
  collectOwnMetrics();
  recomputeRollUp();
}

computeMetrics();

// --- горизонт таймлайна -----------------------------------------------------
const todayDate = new Date();
const todayYmd = { y: todayDate.getFullYear(), m: todayDate.getMonth() + 1, d: todayDate.getDate() };

let base = null;         // первый месяц горизонта: { y, m, idx }
let monthsTotal = 0;
let todayOffset = -1;
let todayVisible = false;

/** Сроки строки: свои, а без своих дат — огибающая вложенных. Нужны, чтобы
 *  новый эпик по умолчанию вставал в сроки своего родителя. */
function computeSpan(node) {
  let start = null;
  let end = null;
  node.children.forEach((child) => {
    const span = computeSpan(child);
    if (!span) return;
    start = minYmd(start, span.start);
    end = maxYmd(end, span.end);
  });
  if (node.start && node.end) node.span = { start: node.start, end: node.end };
  else if (start && end) node.span = { start, end };
  else node.span = null;
  return node.span;
}

/** Горизонт зависит от дат заметок, поэтому пересчитывается после каждой правки.
 *  Текущий месяц входит в горизонт всегда: линия «сегодня» видна, даже если
 *  все сроки уже прошли или ещё не начались. */
function recomputeHorizon() {
  roots.forEach(computeSpan);
  const dated = rows.filter((item) => item.start && item.end);
  if (!dated.length) {
    base = null;
    monthsTotal = 0;
    todayVisible = false;
    return;
  }
  const todayIdx = todayYmd.y * 12 + (todayYmd.m - 1);
  let minIdx = todayIdx;
  let maxIdx = todayIdx;
  dated.forEach((item) => {
    const from = item.start.y * 12 + (item.start.m - 1);
    const to = item.end.y * 12 + (item.end.m - 1);
    if (from < minIdx) minIdx = from;
    if (to > maxIdx) maxIdx = to;
  });
  base = { y: Math.floor(minIdx / 12), m: (minIdx % 12) + 1, idx: minIdx };
  monthsTotal = maxIdx - minIdx + 1;
  todayOffset = monthFloat(todayYmd);
  todayVisible = todayOffset >= 0 && todayOffset <= monthsTotal;
}

/** Позиция даты на оси в «месяцах с начала горизонта», с точностью до дня. */
function monthFloat(ymd) {
  if (!ymd || !base) return 0;
  const whole = ymd.y * 12 + (ymd.m - 1) - base.idx;
  return whole + (ymd.d - 1) / daysInMonth(ymd.y, ymd.m);
}

/** Правый край полосы: конечная дата включительно, поэтому плюс один день. */
function monthFloatEnd(ymd) {
  return monthFloat(ymd) + 1 / daysInMonth(ymd.y, ymd.m);
}

/** Обратное преобразование: позиция на оси → дата. */
function offsetToYmd(offset) {
  const whole = Math.floor(offset);
  const idx = base.idx + whole;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  const dayInMonth = Math.round((offset - whole) * daysInMonth(y, m));
  return addDays({ y, m, d: 1 }, dayInMonth);
}

function monthAt(offset) {
  const idx = base.idx + offset;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

recomputeHorizon();

// ===========================================================================
// 4. Состояние
// ===========================================================================
const storedScale = readLs(LS_SCALE, "month");
let scale = SCALES[storedScale] ? storedScale : "month";
let search = "";
let statusFilter = "all";
let visionFilter = "all";
let hideSubs = false;

const collapsed = new Set();
try {
  const stored = JSON.parse(readLs(LS_COLLAPSED, "[]"));
  if (Array.isArray(stored)) stored.forEach((key) => collapsed.add(String(key)));
} catch (err) {
  /* повреждённое значение — начинаем с развёрнутого дерева */
}

function persistCollapsed() {
  writeLs(LS_COLLAPSED, JSON.stringify(Array.from(collapsed)));
}

let drag = null;           // перетаскивание полосы
let rowDrag = null;        // перестановка строки
let suppressClick = false; // после жеста клик не открывает заметку
let pendingCreate = null;  // { parent } — строка ввода нового эпика; parent: тема, эпик, группа или null
let modalBg = null;        // открытый диалог подтверждения
let busy = false;          // идёт запись в vault

// После записи в любую заметку Dataview перезапускает этот скрипт в том же
// компоненте, очистив контейнер. Состояние прошлого запуска держим на компоненте:
// новый запуск возвращает прокрутку на место и снимает старые обработчики.
// Открытие заметки заново даёт новый компонент — тогда прокрутка идёт к «сегодня».
const lifecycle = viewComponent || {};
if (typeof lifecycle.__timelineDispose === "function") lifecycle.__timelineDispose();
const restoredViewport = lifecycle.__timelineViewport || null;
const viewport = restoredViewport ? { ...restoredViewport } : { left: 0, top: 0, pageTop: null };
lifecycle.__timelineViewport = viewport;
const disposers = [];
lifecycle.__timelineDispose = () => disposers.splice(0).forEach((dispose) => dispose());
if (!lifecycle.__timelineUnloadHooked && typeof lifecycle.register === "function") {
  lifecycle.register(() => lifecycle.__timelineDispose());
  lifecycle.__timelineUnloadHooked = true;
}
let pageScroller = null;   // прокрутка самой заметки (Live Preview или режим чтения)

// ===========================================================================
// 5. Каркас
// ===========================================================================
const root = dv.el("div", "", { cls: "tl-root" });

const head = root.createDiv({ cls: "tl-head" });
head.createDiv({ cls: "tl-title", text: "Roadmap · таймлайн" });
const summary = head.createDiv({ cls: "tl-summary" });

const legend = head.createDiv({ cls: "tl-legend" });
["idea", "todo", "in-progress", "done", "blocked"].forEach((key) => {
  const meta = statusMeta(key);
  const item = legend.createSpan({ cls: "tl-legend-item" });
  item.createSpan({ cls: `tl-dot ${meta.cls}` });
  item.createSpan({ text: meta.label });
});

// --- панель управления ------------------------------------------------------
const toolbar = root.createDiv({ cls: "tl-toolbar" });

const searchInput = toolbar.createEl("input", { cls: "tl-input" });
searchInput.type = "search";
searchInput.placeholder = "Поиск по названию или ключу…";

const statusSelect = toolbar.createEl("select", { cls: "tl-select" });
STATUS_FILTERS.forEach(([value, label]) => {
  const option = statusSelect.createEl("option", { text: label });
  option.value = value;
});

const visionSelect = toolbar.createEl("select", { cls: "tl-select" });
const visionAll = visionSelect.createEl("option", { text: "Все видения" });
visionAll.value = "all";

const scaleGroup = toolbar.createDiv({ cls: "tl-btn-group" });
const scaleButtons = Object.entries(SCALES).map(([value, meta]) => {
  const button = scaleGroup.createEl("button", { cls: "tl-btn", text: meta.label });
  button.dataset.scale = value;
  button.onclick = () => {
    scale = value;
    writeLs(LS_SCALE, value);
    render();
    scrollToToday("auto");
  };
  return button;
});

const hideSubsBtn = toolbar.createEl("button", { cls: "tl-btn", text: "Без подэпиков" });
hideSubsBtn.onclick = () => {
  hideSubs = !hideSubs;
  render();
};

const expandBtn = toolbar.createEl("button", { cls: "tl-btn", text: "Развернуть всё" });
expandBtn.onclick = () => {
  collapsed.clear();
  persistCollapsed();
  render();
};

const collapseBtn = toolbar.createEl("button", { cls: "tl-btn", text: "Свернуть всё" });
collapseBtn.onclick = () => {
  roots.forEach((node) => {
    if (node.children.length) collapsed.add(node.path);
    descendantsOf(node).forEach((child) => {
      if (child.children.length) collapsed.add(child.path);
    });
  });
  persistCollapsed();
  render();
};

const todayBtn = toolbar.createEl("button", { cls: "tl-btn", text: "Сегодня" });
todayBtn.onclick = () => scrollToToday();

const newEpicBtn = toolbar.createEl("button", { cls: "tl-btn tl-btn-accent", text: "Новый эпик" });
newEpicBtn.onclick = () => {
  closeModal();
  pendingCreate = { parent: orphanGroup };
  if (orphanGroup) collapsed.delete(orphanGroup.path);
  render();
};

const statusBar = root.createDiv({ cls: "tl-status" });

function setStatus(text, kind) {
  statusBar.setText(text || "");
  statusBar.toggleClass("is-error", kind === "error");
}

// --- полотно ----------------------------------------------------------------
const scroller = root.createDiv({ cls: "tl-scroll" });
const canvas = scroller.createDiv({ cls: "tl-canvas" });
const headerEl = canvas.createDiv({ cls: "tl-axis-head" });
const bodyEl = canvas.createDiv({ cls: "tl-body" });

function syncVisions() {
  const current = visionSelect.value;
  while (visionSelect.options.length > 1) visionSelect.remove(1);
  visions.forEach((vision) => {
    const option = visionSelect.createEl("option", { text: vision });
    option.value = vision;
  });
  visionSelect.value = visions.includes(current) || current === "all" ? current : "all";
  visionFilter = visionSelect.value;
}

syncVisions();

// ===========================================================================
// 6. Отрисовка
// ===========================================================================
const renderedRows = [];   // { item, level, el } в порядке отрисовки

function levelClass(level) {
  if (level === 0) return "is-root";
  return level === 1 ? "is-epic" : "is-sub";
}

/** Строка темы подсвечивается её цветом целиком, строки эпиков — только в сетке месяцев. */
function setRowColors(row, level, accent, band) {
  row.style.setProperty("--tl-level", String(level));
  row.style.setProperty("--tl-accent", accent || "var(--interactive-accent)");
  if (band) row.style.setProperty("--tl-band", band);
  row.toggleClass("is-banded", Boolean(band));
}

function openNote(item, event) {
  if (item.virtual) return;
  const newLeaf = Boolean(event && (event.ctrlKey || event.metaKey));
  app.workspace.openLinkText(item.path, item.path, newLeaf);
}

function matches(item) {
  if (statusFilter !== "all" && statusMeta(item.status).cls !== statusFilter) return false;
  if (search) {
    const haystack = `${item.key} ${item.title} ${item.name}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}

/** Строка видна, если подходит под фильтр сама или в ней есть подходящие вложенные. */
function filterNode(item, level) {
  const kids = hideSubs && level >= 1
    ? []
    : item.children.map((child) => filterNode(child, level + 1)).filter(Boolean);
  if (item.virtual) return kids.length || (pendingCreate && pendingCreate.parent === item) ? { item, kids, level } : null;
  if (!matches(item) && !kids.length) return null;
  return { item, kids, level };
}

function visibleTree() {
  return roots
    .filter((node) => visionFilter === "all" || (!node.virtual && node.parent === visionFilter))
    .map((node) => filterNode(node, 0))
    .filter(Boolean);
}

function renderAxis(px) {
  headerEl.empty();
  const corner = headerEl.createDiv({ cls: "tl-corner" });
  corner.createDiv({ cls: "tl-corner-top", text: "Тема / эпик" });
  const themesCount = rows.filter((item) => item.kind === "theme").length;
  const epicsCount = rows.length - themesCount;
  corner.createDiv({
    cls: "tl-corner-bottom",
    text: `${themesCount} ${plural(themesCount, "тема", "темы", "тем")} · ${epicsCount} ${plural(epicsCount, "эпик", "эпика", "эпиков")}`,
  });

  const axis = headerEl.createDiv({ cls: "tl-axis" });
  const topRow = axis.createDiv({ cls: "tl-axis-row tl-axis-top" });
  const bottomRow = axis.createDiv({ cls: "tl-axis-row tl-axis-bottom" });

  if (!base) return;

  const groupSize = scale === "month" ? 3 : 12; // верхний ряд: кварталы либо годы
  const cellSize = scale === "month" ? 1 : 3;   // нижний ряд: месяцы либо кварталы

  let offset = 0;
  while (offset < monthsTotal) {
    const { y, m } = monthAt(offset);
    const inGroup = groupSize === 3 ? (m - 1) % 3 : m - 1;
    const span = Math.min(groupSize - inGroup, monthsTotal - offset);
    const cell = topRow.createDiv({ cls: "tl-axis-cell" });
    cell.style.width = `${span * px}px`;
    cell.setText(groupSize === 3 ? `Q${Math.floor((m - 1) / 3) + 1} ${y}` : String(y));
    offset += span;
  }

  offset = 0;
  while (offset < monthsTotal) {
    const { y, m } = monthAt(offset);
    const inCell = cellSize === 1 ? 0 : (m - 1) % 3;
    const span = Math.min(cellSize - inCell, monthsTotal - offset);
    const cell = bottomRow.createDiv({ cls: "tl-axis-cell" });
    cell.style.width = `${span * px}px`;
    if (cellSize === 1) {
      cell.setText(m === 1 ? `${MONTHS_RU[m - 1]} ${String(y).slice(2)}` : MONTHS_RU[m - 1]);
    } else {
      cell.setText(`Q${Math.floor((m - 1) / 3) + 1}`);
    }
    if (m === 1) cell.addClass("is-year-start");
    offset += span;
  }
}

/** У коротких полос края не должны съедать всю ширину: иначе полосу не сдвинуть. */
function handleWidth(barWidth) {
  return Math.max(3, Math.min(HANDLE_HIT, barWidth / 3));
}

function barGeometry(start, end, px) {
  const from = monthFloat(start);
  const to = monthFloatEnd(end);
  return { left: from * px, width: Math.max((to - from) * px, 14) };
}

function barTooltip(item, start, end) {
  const days = diffDays(start, end) + 1;
  const lines = [
    item.key ? `${item.key} · ${item.title}` : item.title,
    `${formatYmd(start)} — ${formatYmd(end)} (${days} ${plural(days, "день", "дня", "дней")})`,
    `Статус: ${statusMeta(item.status).label}`,
  ];
  if (item.lane) lines.push(`Поток: ${item.lane}`);
  if (item.term) lines.push(`Срок по плану: ${item.term}`);
  const m = item.metrics;
  if (m && m.tasks) {
    lines.push(`Задач: ${m.tasks} · оценка ${formatHours(m.hours)} ч`);
    lines.push(`Закрыто: ${formatHours(m.doneHours)} ч из ${formatHours(m.hours)} ч (${donePercent(m)}%)`);
  }
  return lines.join("\n");
}

/** Часы показываем без лишнего нуля: 33, 4.5. */
function formatHours(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function donePercent(metrics) {
  if (!metrics || !metrics.hours) return 0;
  return Math.round((metrics.doneHours / metrics.hours) * 100);
}

/** Значок задач — список из трёх строк с маркерами. Inline SVG, как в roadmap-board:
 *  шрифтовые иконки в Obsidian недоступны, а Lucide тянуть сюда незачем. */
function taskIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  // Класс ставим атрибутом: помощники Obsidian (addClass) живут на HTMLElement,
  // а SVG-узел из createElementNS до них не дотягивается.
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "tl-tail-icon");
  const line = (x1, y, x2) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", `M${x1} ${y}h${x2 - x1}`);
    return el;
  };
  [6, 12, 18].forEach((y) => {
    svg.appendChild(line(3, y, 4.5));   // маркер строки
    svg.appendChild(line(9, y, 21));    // сама строка
  });
  return svg;
}

/** Значок часов — циферблат со стрелками. */
function hoursIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "tl-tail-icon");
  const face = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  face.setAttribute("cx", "12");
  face.setAttribute("cy", "12");
  face.setAttribute("r", "9");
  const hands = document.createElementNS("http://www.w3.org/2000/svg", "path");
  hands.setAttribute("d", "M12 7v5l3 2");
  svg.appendChild(face);
  svg.appendChild(hands);
  return svg;
}

/** Полосу рисуют только эпики без вложенных — это и есть работы со сроками.
 *  Тема, группа «Без темы» и эпик с подэпиками — группы: у них только подсветка строки. */
function isGroupRow(item) {
  return item.kind !== "epic" || item.children.length > 0;
}

function renderBar(lane, item, level, px) {
  if (isGroupRow(item)) return;
  if (!base || !item.start || !item.end) {
    const stub = lane.createDiv({ cls: "tl-nobar" });
    stub.setText(item.term ? item.term : "срок не определён");
    return;
  }

  const geom = barGeometry(item.start, item.end, px);
  const bar = lane.createDiv({ cls: `tl-bar ${levelClass(level)} ${statusMeta(item.status).cls}` });
  // Узкая полоса лишь поджимает отступы: заголовок не прячем — он обрезается
  // многоточием, иначе от эпика в строке остаётся только серый хвост.
  if (geom.width < 60) bar.addClass("is-narrow");
  bar.style.left = `${geom.left}px`;
  bar.style.setProperty("--tl-accent", item.accent || "var(--interactive-accent)");
  bar.setAttr("title", barTooltip(item, item.start, item.end));

  // Ширину сроков несёт полоса, а не контейнер: иначе хвост со счётчиками
  // вычитает свою ширину из общей и на коротком эпике съедает заголовок.
  const body = bar.createDiv({ cls: "tl-bar-body" });
  body.style.width = `${geom.width}px`;

  const hit = handleWidth(geom.width);
  const leftHandle = body.createSpan({ cls: "tl-handle is-left" });

  // Заливка готовности идёт первой — она фон для заголовка.
  const metrics = item.metrics || { tasks: 0, hours: 0, doneHours: 0 };
  const percent = donePercent(metrics);
  if (percent > 0) {
    const fill = body.createDiv({ cls: "tl-progress" });
    fill.style.width = `${Math.min(percent, 100)}%`;
  }

  body.createSpan({ cls: "tl-bar-label", text: item.title });

  const rightHandle = body.createSpan({ cls: "tl-handle is-right" });
  leftHandle.style.width = `${hit}px`;
  rightHandle.style.width = `${hit}px`;

  // Хвост со счётчиками: задачи, оценка, готовность. Счётчик — все связанные
  // задачи, а не только закрытые; процент считается по часам.
  if (metrics.tasks) {
    const tail = bar.createDiv({ cls: "tl-tail" });

    const tasks = tail.createSpan({ cls: "tl-tail-item" });
    tasks.appendChild(taskIcon());
    tasks.createSpan({ text: String(metrics.tasks) });

    const hours = tail.createSpan({ cls: "tl-tail-item" });
    hours.appendChild(hoursIcon());
    hours.createSpan({ text: `${formatHours(metrics.hours)} ч` });

    // Процент показываем всегда, включая 0% — «ещё ничего не закрыто» тоже
    // состояние. Значка у него нет: символ «%» и так называет величину.
    tail.createSpan({
      cls: `tl-tail-item is-percent${percent >= 100 ? " is-full" : ""}`,
      text: `${percent}%`,
    });
  }

  bar.onpointerdown = (event) => startDrag(event, item, bar);
  bar.onpointermove = moveDrag;
  bar.onpointerup = endDrag;
  bar.onpointercancel = () => cancelDrag();
  bar.onclick = (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    openNote(item, event);
  };
}

function renderActions(cell, item) {
  const actions = cell.createDiv({ cls: "tl-actions" });
  const label = item.kind === "epic" ? "Добавить подэпик" : "Добавить эпик";
  const add = actions.createEl("button", { cls: "tl-icon-btn", text: "+" });
  add.setAttr("aria-label", label);
  add.setAttr("title", label);
  add.onclick = (event) => {
    event.stopPropagation();
    closeModal();
    pendingCreate = { parent: item };
    collapsed.delete(item.path);
    render();
  };

  // Темы и группа не удаляются отсюда: тема — часть видения, её правят руками.
  if (item.kind !== "epic") return;
  const remove = actions.createEl("button", { cls: "tl-icon-btn is-danger", text: "×" });
  remove.setAttr("aria-label", "Удалить");
  remove.setAttr("title", "Удалить");
  remove.onclick = (event) => {
    event.stopPropagation();
    pendingCreate = null;
    confirmDelete(item);
  };
}

function renderCreateRow(parent, level) {
  const row = bodyEl.createDiv({ cls: `tl-row ${levelClass(level)} is-new` });
  setRowColors(row, level, parent && parent.accent, parent && parent.band);
  const cell = row.createDiv({ cls: "tl-cell" });
  cell.createSpan({ cls: "tl-indent" });
  const input = cell.createEl("input", { cls: "tl-input tl-input-inline" });
  input.type = "text";
  input.placeholder = parent && parent.kind === "epic" ? "Название подэпика" : "Название эпика";
  input.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const value = input.value.trim();
      if (value) createEpic(parent, value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      pendingCreate = null;
      render();
    }
  };
  const cancel = cell.createEl("button", { cls: "tl-icon-btn", text: "×" });
  cancel.setAttr("aria-label", "Отмена");
  cancel.onclick = () => {
    pendingCreate = null;
    render();
  };
  row.createDiv({ cls: "tl-lane" });
  window.setTimeout(() => input.focus(), 0);
}

function renderRow(item, level, px) {
  const row = bodyEl.createDiv({ cls: `tl-row ${levelClass(level)}` });
  row.toggleClass("is-group", Boolean(item.virtual));
  row.toggleClass("is-parent", item.kind === "epic" && isGroupRow(item));
  setRowColors(row, level, item.accent, item.band);
  renderedRows.push({ item, level, el: row });

  const cell = row.createDiv({ cls: "tl-cell" });
  // Переставлять можно только эпики: темы стоят по алфавиту.
  if (item.kind === "epic") {
    cell.onpointerdown = (event) => startRowDrag(event, item);
    cell.onpointermove = moveRowDrag;
    cell.onpointerup = endRowDrag;
    cell.onpointercancel = () => cancelRowDrag();
  }

  if (item.children.length) {
    const isCollapsed = collapsed.has(item.path);
    const toggle = cell.createEl("button", { cls: "tl-toggle" });
    toggle.setAttr("aria-label", isCollapsed ? "Развернуть" : "Свернуть");
    toggle.setText(isCollapsed ? "▸" : "▾");
    toggle.onclick = () => {
      if (collapsed.has(item.path)) collapsed.delete(item.path);
      else collapsed.add(item.path);
      persistCollapsed();
      render();
    };
  } else {
    cell.createSpan({ cls: "tl-indent" });
  }

  if (item.key) cell.createSpan({ cls: "tl-key", text: item.key });

  if (item.virtual) {
    cell.createSpan({ cls: "tl-link is-static", text: item.title });
  } else {
    const link = cell.createEl("a", { cls: "tl-link", text: item.title });
    link.onclick = (event) => {
      event.preventDefault();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      openNote(item, event);
    };
    const meta = statusMeta(item.status);
    const dot = cell.createSpan({ cls: `tl-dot ${meta.cls}` });
    dot.setAttr("title", meta.label);
  }

  const count = cell.createSpan({ cls: "tl-count", text: item.children.length ? String(item.children.length) : "" });
  if (!item.children.length) count.addClass("is-hidden");

  renderActions(cell, item);

  const lane = row.createDiv({ cls: "tl-lane" });
  renderBar(lane, item, level, px);
}

function render() {
  // Пока строки пересоздаются, высота полотна падает до нуля и браузер сбрасывает
  // прокрутку — запоминаем её до перерисовки и возвращаем после.
  const keepLeft = scroller.scrollLeft;
  const keepTop = scroller.scrollTop;
  const keepPageTop = pageScroller ? pageScroller.scrollTop : null;
  const px = SCALES[scale].px;
  root.style.setProperty("--tl-month", `${px}px`);
  root.style.setProperty("--tl-months", String(monthsTotal));
  root.toggleClass("is-busy", busy);
  scaleButtons.forEach((button) => button.toggleClass("is-active", button.dataset.scale === scale));
  hideSubsBtn.toggleClass("is-active", hideSubs);
  todayBtn.disabled = !todayVisible;

  renderAxis(px);
  bodyEl.empty();
  renderedRows.length = 0;

  let shownThemes = 0;
  let shownEpics = 0;

  const renderNode = (node) => {
    renderRow(node.item, node.level, px);
    if (node.item.kind === "theme") shownThemes += 1;
    else if (!node.item.virtual) shownEpics += 1;
    if (collapsed.has(node.item.path)) return;
    node.kids.forEach(renderNode);
    if (pendingCreate && pendingCreate.parent === node.item) renderCreateRow(node.item, node.level + 1);
  };

  const tree = visibleTree();
  tree.forEach(renderNode);

  if (pendingCreate && pendingCreate.parent === null) renderCreateRow(null, 1);

  if (!tree.length && !pendingCreate) {
    bodyEl.createDiv({ cls: "tl-empty", text: "Под фильтр ничего не попало" });
  }

  if (todayVisible) {
    const marker = bodyEl.createDiv({ cls: "tl-today" });
    marker.style.left = `calc(var(--tl-left) + ${todayOffset * px}px)`;
    marker.setAttr("title", `Сегодня, ${formatYmd(todayYmd)}`);
  }

  dropLine = bodyEl.createDiv({ cls: "tl-drop-line" });
  dropLine.style.display = "none";

  scroller.scrollLeft = keepLeft;
  scroller.scrollTop = keepTop;
  if (pageScroller && keepPageTop !== null) pageScroller.scrollTop = keepPageTop;

  const withDates = rows.filter((item) => item.start && item.end).length;
  const last = monthsTotal ? monthAt(monthsTotal - 1) : null;
  const rangeText = base && last
    ? `${MONTHS_RU[base.m - 1]} ${base.y} — ${MONTHS_RU[last.m - 1]} ${last.y}`
    : "даты не заданы";
  summary.setText(
    `${rangeText} · показано ${shownThemes} ${plural(shownThemes, "тема", "темы", "тем")}`
    + ` и ${shownEpics} ${plural(shownEpics, "эпик", "эпика", "эпиков")} · со сроками ${withDates} из ${rows.length}`,
  );
}

/** Сетка начинается с текущей колонки: с текущего месяца на шкале месяцев,
 *  с текущего квартала на шкале кварталов. Левая колонка липкая, поэтому
 *  сдвиг прокрутки в пикселях совпадает с началом колонки на дорожке. */
function scrollToToday(behavior = "smooth") {
  if (!todayVisible) return;
  const px = SCALES[scale].px;
  const monthIndex = Math.floor(todayOffset);
  const cellStart = scale === "quarter" ? monthIndex - ((monthAt(monthIndex).m - 1) % 3) : monthIndex;
  scroller.scrollTo({ left: Math.max(cellStart, 0) * px, behavior });
}

// ===========================================================================
// 7. Перетаскивание и растягивание полос
// ===========================================================================
function startDrag(event, item, bar) {
  if (busy || event.button !== 0 || !item.start || !item.end || !base) return;
  // Меряем полосу, а не контейнер: в контейнер входит хвост со счётчиками,
  // и правая ручка растягивания оказалась бы под серым блоком, а не у даты.
  const body = bar.querySelector(".tl-bar-body") || bar;
  const rect = body.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const hit = handleWidth(rect.width);
  let mode = "move";
  if (offsetX <= hit) mode = "start";
  else if (rect.width - offsetX <= hit) mode = "end";

  drag = {
    item,
    bar,
    body,
    mode,
    originX: event.clientX,
    originScroll: scroller.scrollLeft,
    origStart: item.start,
    origEnd: item.end,
    start: item.start,
    end: item.end,
    moved: false,
    pointerId: event.pointerId,
  };

  root.addClass("is-dragging");
  bar.addClass("is-dragging");
  try { bar.setPointerCapture(event.pointerId); } catch (err) { /* мышь без захвата — жест всё равно работает */ }
  event.preventDefault();
  event.stopPropagation();
}

function moveDrag(event) {
  if (!drag) return;
  autoScrollX(event.clientX);

  const px = SCALES[scale].px;
  const deltaPx = (event.clientX - drag.originX) + (scroller.scrollLeft - drag.originScroll);
  if (Math.abs(deltaPx) > DRAG_SLOP) drag.moved = true;
  const deltaMonths = deltaPx / px;

  if (drag.mode === "move") {
    const shifted = offsetToYmd(monthFloat(drag.origStart) + deltaMonths);
    const shift = diffDays(drag.origStart, shifted);
    drag.start = shifted;
    drag.end = addDays(drag.origEnd, shift);
  } else if (drag.mode === "start") {
    const candidate = offsetToYmd(monthFloat(drag.origStart) + deltaMonths);
    drag.start = diffDays(candidate, drag.origEnd) < 0 ? drag.origEnd : candidate;
    drag.end = drag.origEnd;
  } else {
    const candidate = addDays(offsetToYmd(monthFloatEnd(drag.origEnd) + deltaMonths), -1);
    drag.start = drag.origStart;
    drag.end = diffDays(drag.origStart, candidate) < 0 ? drag.origStart : candidate;
  }

  const geom = barGeometry(drag.start, drag.end, px);
  drag.bar.style.left = `${geom.left}px`;
  drag.body.style.width = `${geom.width}px`;

  const days = diffDays(drag.start, drag.end) + 1;
  const label = drag.item.key || drag.item.title;
  setStatus(`${label}: ${formatYmd(drag.start)} — ${formatYmd(drag.end)} · ${days} ${plural(days, "день", "дня", "дней")}`);
}

/** Автопрокрутка у краёв полотна. Прокрутка входит в дельту жеста, поэтому
 *  включаем её только когда полотно реально шире окна и его размеры измеримы —
 *  иначе вырожденный rect (скрытая панель, нулевая ширина) незаметно добавит
 *  курсору лишние пиксели, а значит и лишние дни. */
function autoScrollX(clientX) {
  if (scroller.scrollWidth <= scroller.clientWidth) return;
  const rect = scroller.getBoundingClientRect();
  if (rect.width < EDGE_SCROLL * 3) return;
  if (clientX > rect.right - EDGE_SCROLL) scroller.scrollLeft += 16;
  else if (clientX < rect.left + EDGE_SCROLL) scroller.scrollLeft -= 16;
}

function finishGesture() {
  if (!drag) return null;
  const current = drag;
  drag = null;
  root.removeClass("is-dragging");
  current.bar.removeClass("is-dragging");
  try { current.bar.releasePointerCapture(current.pointerId); } catch (err) { /* уже отпущен */ }
  return current;
}

function cancelDrag() {
  const gesture = finishGesture();
  if (!gesture) return;
  suppressClick = gesture.moved;
  render();
  setStatus("");
}

async function endDrag(event) {
  const gesture = finishGesture();
  if (!gesture) return;
  suppressClick = gesture.moved;
  if (event) event.stopPropagation();

  const changed = !sameYmd(gesture.start, gesture.origStart) || !sameYmd(gesture.end, gesture.origEnd);
  if (!gesture.moved || !changed) {
    render();
    setStatus("");
    return;
  }
  await commitDrag(gesture);
}

async function commitDrag(gesture) {
  const { item } = gesture;
  try {
    await saveDates(item, gesture.start, gesture.end);
  } catch (err) {
    render();
    setStatus(`Не удалось записать даты: ${err.message}`, "error");
    return;
  }
  item.start = gesture.start;
  item.end = gesture.end;

  recomputeHorizon();
  render();
  const label = item.key || item.title;
  setStatus(`${label}: ${formatYmd(gesture.origStart)} — ${formatYmd(gesture.origEnd)} → ${formatYmd(item.start)} — ${formatYmd(item.end)}`);
}

// ===========================================================================
// 8. Перестановка строк в левой колонке
// ===========================================================================
let dropLine = null;

function startRowDrag(event, item) {
  if (busy || event.button !== 0) return;
  if (event.target.closest && event.target.closest("button, a, input")) return;

  rowDrag = {
    item,
    originY: event.clientY,
    moved: false,
    pointerId: event.pointerId,
    cell: event.currentTarget,
    target: undefined, // элемент, перед которым вставляем; null — в конец
  };
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch (err) { /* без захвата тоже работает */ }
}

/** Точки вставки: перед каждым соседом и после поддерева последнего из них. */
function dropCandidates() {
  const siblings = siblingsOf(rowDrag.item);
  const list = [];
  let lastIndex = -1;
  renderedRows.forEach((row, index) => {
    if (!siblings.includes(row.item)) return;
    list.push({ before: row.item, y: row.el.getBoundingClientRect().top });
    lastIndex = index;
  });
  if (lastIndex >= 0) {
    const level = renderedRows[lastIndex].level;
    let end = lastIndex;
    while (end + 1 < renderedRows.length && renderedRows[end + 1].level > level) end += 1;
    list.push({ before: null, y: renderedRows[end].el.getBoundingClientRect().bottom });
  }
  return list;
}

function moveRowDrag(event) {
  if (!rowDrag) return;
  if (!rowDrag.moved) {
    if (Math.abs(event.clientY - rowDrag.originY) < ROW_DRAG_SLOP) return;
    rowDrag.moved = true;
    root.addClass("is-row-dragging");
    markDraggedBlock(true);
  }
  autoScrollY(event.clientY);

  const candidates = dropCandidates();
  if (!candidates.length) return;
  let best = candidates[0];
  candidates.forEach((candidate) => {
    if (Math.abs(candidate.y - event.clientY) < Math.abs(best.y - event.clientY)) best = candidate;
  });
  rowDrag.target = best.before;

  if (dropLine) {
    const bodyRect = bodyEl.getBoundingClientRect();
    dropLine.style.display = "block";
    // у самой первой позиции линию прижимает к шапке — оставляем её видимой
    dropLine.style.top = `${Math.max(1, best.y - bodyRect.top)}px`;
  }
}

function markDraggedBlock(on) {
  const paths = new Set([rowDrag.item.path, ...descendantsOf(rowDrag.item).map((child) => child.path)]);
  renderedRows.forEach((row) => {
    if (paths.has(row.item.path)) row.el.toggleClass("is-moving", on);
  });
}

function autoScrollY(clientY) {
  if (scroller.scrollHeight <= scroller.clientHeight) return;
  const rect = scroller.getBoundingClientRect();
  if (rect.height < 120) return;
  if (clientY > rect.bottom - 32) scroller.scrollTop += 12;
  else if (clientY < rect.top + 32) scroller.scrollTop -= 12;
}

function finishRowGesture() {
  if (!rowDrag) return null;
  const current = rowDrag;
  if (current.moved) markDraggedBlock(false);
  rowDrag = null;
  root.removeClass("is-row-dragging");
  if (dropLine) dropLine.style.display = "none";
  try { current.cell.releasePointerCapture(current.pointerId); } catch (err) { /* уже отпущен */ }
  return current;
}

function cancelRowDrag() {
  const gesture = finishRowGesture();
  if (gesture && gesture.moved) suppressClick = true;
}

async function endRowDrag() {
  const gesture = finishRowGesture();
  if (!gesture || !gesture.moved) return;
  suppressClick = true;
  if (gesture.target === undefined) return;
  await commitReorder(gesture);
}

async function commitReorder(gesture) {
  const list = siblingsOf(gesture.item);
  const from = list.indexOf(gesture.item);
  if (from < 0) return;
  const rest = list.slice();
  rest.splice(from, 1);
  const to = gesture.target ? rest.indexOf(gesture.target) : rest.length;
  if (to < 0) return;
  rest.splice(to, 0, gesture.item);
  if (rest.every((item, index) => item === list[index])) return;

  const changed = [];
  rest.forEach((item, index) => {
    const order = index + 1;
    if (item.order !== order) {
      item.order = order;
      changed.push(item);
    }
  });
  linkItems();
  recomputeRollUp();

  busy = true;
  render();
  try {
    for (const item of changed) {
      await saveFrontmatter(item, (frontmatter) => {
        frontmatter.order = item.order;
        // Там, где приоритет задан, он и есть порядок разделов плана.
        if (frontmatter.priority !== undefined && frontmatter.priority !== null) frontmatter.priority = item.order;
      });
    }
  } catch (err) {
    busy = false;
    render();
    setStatus(`Не удалось записать порядок: ${err.message}`, "error");
    return;
  }
  busy = false;
  render();
  const label = (item) => item.key || item.title;
  const place = gesture.target ? `перед ${label(gesture.target)}` : "в конец";
  setStatus(`${label(gesture.item)} перемещён ${place}`);
}

// ===========================================================================
// 9. Диалог подтверждения
// ===========================================================================
function closeModal() {
  if (!modalBg) return;
  modalBg.remove();
  modalBg = null;
}

/** Удаление всегда проходит через диалог: заметки уходят в корзину,
 *  а у эпика вместе с ним уходят и все его подэпики. */
function confirmDelete(item) {
  closeModal();
  const nested = descendantsOf(item);
  const label = item.key ? `${item.key} «${item.title}»` : `«${item.title}»`;

  modalBg = root.createDiv({ cls: "tl-modal-bg" });
  const box = modalBg.createDiv({ cls: "tl-modal" });
  box.createDiv({ cls: "tl-modal-title", text: "Удаление эпика" });
  box.createDiv({ cls: "tl-modal-text", text: `Вы уверены, что хотите удалить ${label}?` });

  if (nested.length) {
    box.createDiv({
      cls: "tl-modal-text",
      text: `Вместе с ним удалится ${nested.length} ${plural(nested.length, "подэпик", "подэпика", "подэпиков")}:`,
    });
    const list = box.createDiv({ cls: "tl-modal-list" });
    nested.forEach((child) => {
      list.createDiv({ cls: "tl-modal-list-item", text: child.key ? `${child.key} · ${child.title}` : child.title });
    });
  }

  box.createDiv({
    cls: "tl-modal-note",
    text: nested.length ? "Заметки попадут в корзину." : "Заметка попадёт в корзину.",
  });

  const buttons = box.createDiv({ cls: "tl-modal-buttons" });
  const cancel = buttons.createEl("button", { cls: "tl-btn", text: "Отмена" });
  const confirm = buttons.createEl("button", { cls: "tl-btn tl-btn-danger", text: "Удалить" });
  cancel.onclick = () => closeModal();
  confirm.onclick = () => {
    closeModal();
    deleteItem(item);
  };
  modalBg.onclick = (event) => {
    if (event.target === modalBg) closeModal();
  };
  window.setTimeout(() => cancel.focus(), 0);
}

// ===========================================================================
// 10. Создание и удаление
// ===========================================================================
/** Ключ нового эпика продолжает нумерацию соседей: под эпиком RM-3 — RM-3.N,
 *  под темой — PREFIX-N по уже занятым номерам. Нет нумерации — нет и ключа. */
function nextKey(parent, siblings) {
  if (parent && parent.kind === "epic") {
    if (!parent.key) return "";
    const prefix = `${parent.key}.`;
    let max = 0;
    siblings.forEach((sibling) => {
      if (!sibling.key.startsWith(prefix)) return;
      const num = Number(sibling.key.slice(prefix.length));
      if (Number.isInteger(num) && num > max) max = num;
    });
    return `${prefix}${max + 1}`;
  }

  let prefix = "";
  let max = 0;
  siblings.forEach((sibling) => {
    const m = /^([A-Za-zА-Яа-яЁё]+)-(\d+)$/.exec(sibling.key);
    if (!m) return;
    if (!prefix) prefix = m[1];
    if (m[1] === prefix) max = Math.max(max, Number(m[2]));
  });
  return prefix ? `${prefix}-${max + 1}` : "";
}

/** Служебные теги родителя (например frontend) переходят к новому эпику. */
function inheritedTags(parent) {
  if (!parent) return [];
  return parent.tags.filter((tag) => !TYPE_TAGS.includes(tag.toLowerCase()));
}

async function ensureFolder(path) {
  if (app.vault.getAbstractFileByPath(path)) return;
  try {
    await app.vault.createFolder(path);
  } catch (err) {
    /* папка уже есть — Obsidian бросает исключение, это не ошибка */
  }
}

async function createEpic(parent, name) {
  const title = safeName(name);
  if (!title) return;
  const owner = parent && !parent.virtual ? parent : null;
  const siblings = parent ? parent.children : [];
  const key = nextKey(owner, siblings);
  const fileName = safeName(key ? `${key} ${title}` : title);
  const path = `${EPICS_DIR}/${fileName}.md`;
  if (app.vault.getAbstractFileByPath(path)) {
    setStatus(`Заметка «${fileName}» уже есть`, "error");
    return;
  }

  const order = siblings.length + 1;
  const isSub = Boolean(owner && owner.kind === "epic");
  const start = (owner && owner.span && owner.span.start) || todayYmd;
  const end = addDays(start, (isSub ? NEW_SUB_DAYS : NEW_EPIC_DAYS) - 1);
  const lane = isSub ? owner.lane : "";
  const tags = ["epic", ...inheritedTags(owner)];

  const content = [
    "---",
    `title: ${JSON.stringify(title)}`,
    ...(key ? [`key: ${key}`] : []),
    `order: ${order}`,
    ...(lane ? [`lane: ${JSON.stringify(lane)}`] : []),
    "status: todo",
    `start: ${isoOf(start)}`,
    `end: ${isoOf(end)}`,
    ...(owner ? [`parent: "[[${owner.name}]]"`] : []),
    "tags:",
    ...tags.map((tag) => `  - ${tag}`),
    "---",
    // Сроки в тексте читаются из frontmatter — после перетаскивания полосы они не устаревают.
    ...(owner ? [`**Родитель:** [[${owner.name}]] · ${LIVE_TERM}`] : [LIVE_TERM]),
    "",
    "## Описание",
    "",
    "## Подэпики",
    "",
    CHILDREN_QUERY,
    "",
    "## Задачи",
    "",
    TASKS_VIEW,
    "",
  ].join("\n");

  busy = true;
  render();
  try {
    await ensureFolder(EPICS_DIR);
    const file = await app.vault.create(path, content);
    rawItems.push({
      path: file.path,
      name: fileName,
      kind: "epic",
      tags,
      key,
      title,
      status: "todo",
      lane,
      term: "",
      order,
      parent: owner ? owner.name : "",
      start,
      end,
      children: [],
      parentItem: null,
      accent: null,
      span: null,
      // У новой заметки задач ещё нет, но поля нужны наравне с остальными строками.
      own: { tasks: 0, hours: 0, doneHours: 0 },
      metrics: { tasks: 0, hours: 0, doneHours: 0 },
    });
    linkItems();
    recomputeRollUp();
    recomputeHorizon();
  } catch (err) {
    busy = false;
    pendingCreate = null;
    render();
    setStatus(`Не удалось создать эпик: ${err.message}`, "error");
    return;
  }
  busy = false;
  pendingCreate = null;
  render();
  setStatus(owner ? `Создан ${key || title} в «${owner.title}»` : `Создан ${key || title}`);
}

async function deleteItem(item) {
  const targets = [item, ...descendantsOf(item)];
  busy = true;
  render();
  try {
    for (const target of targets) {
      const file = app.vault.getAbstractFileByPath(target.path);
      if (!file) continue;
      if (app.fileManager && typeof app.fileManager.trashFile === "function") await app.fileManager.trashFile(file);
      else await app.vault.trash(file, true);
    }
  } catch (err) {
    busy = false;
    render();
    setStatus(`Не удалось удалить: ${err.message}`, "error");
    return;
  }

  const gone = new Set(targets.map((target) => target.path));
  rawItems = rawItems.filter((candidate) => !gone.has(candidate.path));
  linkItems();
  recomputeRollUp();
  recomputeHorizon();
  busy = false;
  render();
  const extra = targets.length - 1;
  const tail = extra > 0 ? ` и ${extra} ${plural(extra, "подэпик", "подэпика", "подэпиков")}` : "";
  setStatus(`${item.key || item.title}${tail} в корзине`);
}

// ===========================================================================
// 11. Запись в заметки
// ===========================================================================
async function saveFrontmatter(item, mutate) {
  const file = app.vault.getAbstractFileByPath(item.path);
  if (!file) throw new Error(`заметка не найдена: ${item.path}`);
  if (!app.fileManager || typeof app.fileManager.processFrontMatter !== "function") {
    throw new Error("processFrontMatter недоступен в этой версии Obsidian");
  }
  await app.fileManager.processFrontMatter(file, mutate);
}

/** Пишем только start и end, остальной frontmatter не трогаем. */
async function saveDates(item, start, end) {
  await saveFrontmatter(item, (frontmatter) => {
    frontmatter.start = isoOf(start);
    frontmatter.end = isoOf(end);
  });
}

// ===========================================================================
// 12. События
// ===========================================================================
function onSearch() {
  search = searchInput.value.trim().toLowerCase();
  render();
}

function onKeydown(event) {
  if (event.key !== "Escape") return;
  if (drag) {
    cancelDrag();
    event.preventDefault();
  } else if (rowDrag) {
    cancelRowDrag();
    event.preventDefault();
  } else if (modalBg) {
    closeModal();
    event.preventDefault();
  }
}

function onStatusChange() {
  statusFilter = statusSelect.value;
  render();
}

function onVisionChange() {
  visionFilter = visionSelect.value;
  render();
}

function rememberScroll() {
  viewport.left = scroller.scrollLeft;
  viewport.top = scroller.scrollTop;
}

function rememberPageScroll() {
  if (pageScroller) viewport.pageTop = pageScroller.scrollTop;
}

/** Обработчик снимается при следующем запуске скрипта или при выгрузке блока. */
function listen(target, type, handler) {
  target.addEventListener(type, handler);
  disposers.push(() => target.removeEventListener(type, handler));
}

/** Контейнер прокрутки заметки появляется, только когда блок уже вставлен в документ. */
function attachPageScroller() {
  if (pageScroller || typeof root.closest !== "function") return;
  pageScroller = root.closest(".cm-scroller, .markdown-preview-view");
  if (pageScroller) listen(pageScroller, "scroll", rememberPageScroll);
}

function applyViewport(state) {
  scroller.scrollLeft = state.left;
  scroller.scrollTop = state.top;
  if (pageScroller && state.pageTop !== null) pageScroller.scrollTop = state.pageTop;
  rememberScroll();
  if (state.pageTop !== null) viewport.pageTop = state.pageTop;
}

listen(scroller, "scroll", rememberScroll);
listen(searchInput, "input", onSearch);
listen(statusSelect, "change", onStatusChange);
listen(visionSelect, "change", onVisionChange);
listen(document, "keydown", onKeydown);

render();
// Блок Dataview может ещё не быть в документе — прокрутку повторяем после раскладки.
if (restoredViewport) {
  applyViewport(restoredViewport);
  window.setTimeout(() => {
    attachPageScroller();
    applyViewport(restoredViewport);
  }, 0);
} else {
  if (rows.length) scrollToToday("auto");
  window.setTimeout(() => {
    attachPageScroller();
    if (rows.length) scrollToToday("auto");
  }, 0);
}
