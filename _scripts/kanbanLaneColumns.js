/**
 * Раскладка kanban-доски спринта: внутренние столбцы карточек в колонках и
 * обрезка заголовков карточек. Настройки — во frontmatter файла доски:
 *
 *   lane-columns:      # заголовок колонки → число столбцов (2…6)
 *     review: 2
 *   card-clamp: true   # true = 2 строки, число = столько строк, false/нет = выкл
 *   card-oneline: true # заголовок в одну строку без переноса, с многоточием
 *
 * Три кнопки под панелью аватарок: «в один столбец», «обрезать заголовки»,
 * «в одну строку». Все — тумблеры относительно умолчания доски; явный выбор хранится в
 * localStorage вместе с умолчанием, при котором сделан (resolveToggle).
 *
 * Скрипт только ставит атрибуты/классы/CSS-переменные, раскладку рисует
 * snippets.css (блок «Kanban: внутренние столбцы карточек»). Плагин Kanban
 * не патчится. Паттерн — kanbanBoardSpentSync.js: MutationObserver на view,
 * идемпотентные проходы, guard через window-флаг.
 *
 * Чистые функции внизу экспортируются для тестов: node --test _tests/*.test.js
 * Файл также загружает Templater (папка _scripts) — runtime под guard `app`.
 */

const MAX_COLUMNS = 6;
const MAX_CLAMP_LINES = 5;
const DEFAULT_CLAMP_LINES = 2;

const normalizeTitle = (text) =>
    String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const parseLaneColumns = (value) => {
    const result = new Map();
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;

    for (const [title, raw] of Object.entries(value)) {
        // Числовые строки допустимы; массивы, boolean и объекты — нет.
        const n = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
        if (!Number.isInteger(n) || n < 1 || n > MAX_COLUMNS) {
            console.warn(`[kanbanLaneColumns] lane-columns.${title}: ожидалось целое 1…${MAX_COLUMNS}, получено`, raw);
            continue;
        }
        if (n > 1) result.set(normalizeTitle(title), n);
    }
    return result;
};

const parseCardClamp = (value) => {
    if (value === true) return DEFAULT_CLAMP_LINES;
    return Number.isInteger(value) && value >= 1 && value <= MAX_CLAMP_LINES ? value : 0;
};

// Получает уже разобранную запись; чтение, JSON и очистка хранилища — в runtime.
const resolveToggle = (stored, boardDefault) => {
    if (!stored || typeof stored !== "object" || Array.isArray(stored)
        || typeof stored.value !== "boolean" || typeof stored.default !== "boolean"
        || stored.default !== boardDefault) return boardDefault;
    return stored.value;
};


// ---------------------------------------------------------------------------
// Runtime (только в Obsidian).
// ---------------------------------------------------------------------------

const LANES_PREFIX = "kanbanLaneColumns:";
const CLAMP_PREFIX = "kanbanCardClamp:";
const ONELINE_PREFIX = "kanbanCardOneline:";
const DEFAULT_LANE_WIDTH = 272;
const TITLE_LINK_CLASS = "kanban-card-title-link";
const TITLE_MARK = "kanbanClampTitle"; // dataset: значение title, которое поставили мы

// --- localStorage: только явный выбор пользователя вместе с умолчанием доски ---
const readToggle = (prefix, path, boardDefault) => {
    let raw = null;
    let stored = null;
    try {
        raw = localStorage.getItem(prefix + path);
        stored = raw ? JSON.parse(raw) : null;
    } catch (_) { stored = null; }
    const valid = stored && typeof stored === "object" && !Array.isArray(stored)
        && typeof stored.value === "boolean" && stored.default === boardDefault;
    // Битая или устаревшая (другое умолчание доски) запись — убрать, чтобы не путать.
    if (raw !== null && !valid) {
        try { localStorage.removeItem(prefix + path); } catch (_) { /* ignore */ }
    }
    return resolveToggle(stored, boardDefault);
};

const writeToggle = (prefix, path, value, boardDefault) => {
    try {
        localStorage.setItem(prefix + path, JSON.stringify({ value, default: boardDefault }));
    } catch (_) { /* приватный режим, без хранилища */ }
};

// --- настройки доски ---
const frontmatterOf = (file) => app.metadataCache.getFileCache(file)?.frontmatter ?? null;

const readLaneConfig = (file) => parseLaneColumns(frontmatterOf(file)?.["lane-columns"]);
const readClampLines = (file) => parseCardClamp(frontmatterOf(file)?.["card-clamp"]);
const readOnelineDefault = (file) => frontmatterOf(file)?.["card-oneline"] === true;

// Ширина колонки в px из блока `%% kanban:settings` файла доски.
const laneWidthFromBoardFile = async (file) => {
    try {
        const text = await app.vault.cachedRead(file);
        const m = text.match(/%%\s*kanban:settings\s*\n```\s*\n([\s\S]*?)\n```/);
        if (!m) return null;
        const n = Number(JSON.parse(m[1])["lane-width"]);
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch (_) { return null; }
};

const readLaneBaseWidth = async (view, root) => {
    for (const lane of root.querySelectorAll(".kanban-plugin__lane-wrapper")) {
        if (lane.classList.contains("collapse-horizontal")) continue;
        const m = /^(\d+(?:\.\d+)?)px$/.exec(lane.style.width || "");
        if (m && Number(m[1]) > 0) return Number(m[1]);
    }
    const fromFile = view.file ? await laneWidthFromBoardFile(view.file) : null;
    if (fromFile) return fromFile;
    const global = Number(app.plugins?.plugins?.["obsidian-kanban"]?.settings?.["lane-width"]);
    return Number.isFinite(global) && global > 0 ? global : DEFAULT_LANE_WIDTH;
};

// --- кнопки-тумблеры (общая фабрика) ---
const TOGGLES = [
    {
        cls: "kanban-lanes-toggle",
        prefix: LANES_PREFIX,
        icon: "columns-2",
        glyph: "⫼",
        boardDefault: () => false, // false = столбцы по настройке; true = свёрнуто в один
        onlyBoard: true,           // в режиме списка Kanban столбцов нет — кнопка скрыта
        titles: {
            on: "Столбцы свёрнуты в один. Клик — вернуть настройку lane-columns",
            off: "Столбцы по настройке lane-columns. Клик — свернуть все в один",
        },
    },
    {
        cls: "kanban-card-clamp-toggle",
        prefix: CLAMP_PREFIX,
        icon: "text",
        glyph: "…",
        boardDefault: (file) => readClampLines(file) > 0,
        titles: {
            on: "Заголовки карточек обрезаны. Клик — показать целиком",
            off: "Заголовки карточек целиком. Клик — обрезать до card-clamp строк",
        },
    },
    {
        cls: "kanban-card-oneline-toggle",
        prefix: ONELINE_PREFIX,
        icon: "minus",
        glyph: "—",
        boardDefault: readOnelineDefault,
        titles: {
            on: "Заголовки в одну строку без переноса. Клик — выключить",
            off: "Клик — заголовки карточек в одну строку без переноса, с многоточием",
        },
    },
];

const setButtonIcon = (btn, icon, glyph) => {
    try {
        require("obsidian").setIcon(btn, icon);
        if (!btn.querySelector("svg")) throw new Error("no svg");
    } catch (_) {
        btn.textContent = glyph;
    }
};

const kanbanViewsOf = (path) => {
    const views = [];
    app.workspace.iterateAllLeaves((leaf) => {
        const v = leaf.view;
        if (v?.getViewType?.() === "kanban" && v.file?.path === path) views.push(v);
    });
    return views;
};

const ensureToggle = (view, spec) => {
    const host = view.contentEl;
    if (!host) return;
    let btn = host.querySelector(`:scope > .${spec.cls}`);
    if (!btn) {
        if (getComputedStyle(host).position === "static") host.style.position = "relative";
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = spec.cls;
        setButtonIcon(btn, spec.icon, spec.glyph);
        btn.addEventListener("click", () => {
            const file = view.file;
            if (!file) return;
            const def = spec.boardDefault(file);
            writeToggle(spec.prefix, file.path, !readToggle(spec.prefix, file.path, def), def);
            kanbanViewsOf(file.path).forEach(safeApply);
        });
        host.appendChild(btn);
    }
    const file = view.file;
    const on = file ? readToggle(spec.prefix, file.path, spec.boardDefault(file)) : false;
    const hidden = Boolean(spec.onlyBoard) && !host.querySelector(".kanban-plugin__board.kanban-plugin__horizontal");
    if (btn.hidden !== hidden) btn.hidden = hidden;
    if (btn.classList.contains("active") !== on) btn.classList.toggle("active", on);
    const title = on ? spec.titles.on : spec.titles.off;
    if (btn.title !== title) btn.title = title;
};

// --- применение к одному view (идемпотентно: DOM меняем только при расхождении) ---
const setData = (el, key, value) => {
    if (value === null) { if (el.dataset[key] !== undefined) delete el.dataset[key]; }
    else if (el.dataset[key] !== value) el.dataset[key] = value;
};
const setVar = (el, name, value) => {
    const cur = el.style.getPropertyValue(name);
    if (value === null) { if (cur) el.style.removeProperty(name); }
    else if (cur !== value) el.style.setProperty(name, value);
};
const setClass = (el, cls, on) => {
    if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
};

// Номер последнего запущенного прохода по view: устаревший async-проход
// (чтение файла завершилось позже более нового) не должен перезаписать DOM.
const passSeq = new WeakMap();

const applyLanes = async (view, root, file) => {
    const isBoard = root.classList.contains("kanban-plugin__horizontal");
    const config = isBoard ? readLaneConfig(file) : new Map();
    setClass(root, "kanban-lanes-single", readToggle(LANES_PREFIX, file.path, false));

    if (isBoard) {
        const seq = (passSeq.get(view) || 0) + 1;
        passSeq.set(view, seq);
        const base = await readLaneBaseWidth(view, root);
        // Пока ждали, мог стартовать новый проход, смениться файл или DOM.
        if (passSeq.get(view) !== seq || view.file !== file || !root.isConnected) return;
        setVar(root, "--kanban-lane-base-width", `${base}px`);
    }

    root.querySelectorAll(".kanban-plugin__lane-wrapper").forEach((lane) => {
        const title = normalizeTitle(lane.querySelector(".kanban-plugin__lane-title-text")?.textContent);
        const n = config.get(title);
        setData(lane, "laneColumns", n ? String(n) : null);
        setVar(lane, "--lane-columns", n ? String(n) : null);
    });
};

// Первая ссылка первого абзаца заголовка — то, что обрезаем; при clamp ей же
// ставим title с полным текстом, чтобы он был виден при обычном наведении.
const applyClamp = (root, file) => {
    const lines = readClampLines(file);
    const clamped = readToggle(CLAMP_PREFIX, file.path, lines > 0);
    const oneline = readToggle(ONELINE_PREFIX, file.path, readOnelineDefault(file));
    setClass(root, "kanban-cards-clamped", clamped);
    setClass(root, "kanban-cards-oneline", oneline); // при обоих режимах в CSS побеждает одна строка
    setVar(root, "--card-clamp-lines", String(lines || DEFAULT_CLAMP_LINES));
    const on = clamped || oneline; // в любом обрезанном режиме полный текст — в title

    // Наш title узнаём по совпадению с сохранённым значением: если кто-то
    // поставил свой, мы его не перезаписываем и не удаляем.
    const ownsTitle = (a) => a.dataset[TITLE_MARK] !== undefined && a.getAttribute("title") === a.dataset[TITLE_MARK];
    const dropOwnTitle = (a) => {
        if (ownsTitle(a)) a.removeAttribute("title");
        setData(a, TITLE_MARK, null);
    };

    const titles = new Set(root.querySelectorAll(
        ".kanban-plugin__item-markdown > .kanban-plugin__markdown-preview-view > p:first-child > a.internal-link:first-of-type",
    ));
    // Ссылки, помеченные раньше, но больше не являющиеся заголовком, — очистить.
    root.querySelectorAll(`a.${TITLE_LINK_CLASS}`).forEach((a) => {
        if (!titles.has(a)) { setClass(a, TITLE_LINK_CLASS, false); dropOwnTitle(a); }
    });

    titles.forEach((a) => {
        setClass(a, TITLE_LINK_CLASS, true);
        if (!on) { dropOwnTitle(a); return; }
        const full = a.textContent.trim();
        const foreign = a.hasAttribute("title") && !ownsTitle(a);
        if (foreign) return;
        if (a.getAttribute("title") !== full) a.setAttribute("title", full);
        setData(a, TITLE_MARK, full);
    });
};

// Кнопки стоят под панелью аватарок, а её высота зависит от числа участников
// (kanbanFilterBar.js) — отдаём высоту в CSS. Пока панели нет, действует
// запасное значение из snippets.css.
const syncFilterBarHeight = (host) => {
    const bar = host.querySelector(":scope > .kanban-filter-bar");
    const height = bar?.offsetHeight;
    setVar(host, "--kanban-filter-bar-height", height ? `${height}px` : null);
};

const applyToView = async (view) => {
    installViewObserver(view); // до раннего выхода: доска может появиться позже
    const file = view.file;
    const root = view.contentEl?.querySelector(".kanban-plugin__board");
    if (!file || !root) return;
    syncFilterBarHeight(view.contentEl);
    TOGGLES.forEach((spec) => ensureToggle(view, spec));
    applyClamp(root, file);
    await applyLanes(view, root, file);
};

const safeApply = (view) => {
    applyToView(view).catch((e) => console.error("[kanbanLaneColumns] apply failed", e));
};

const applyAll = () => {
    app.workspace.iterateAllLeaves((leaf) => {
        const v = leaf.view;
        if (v?.getViewType?.() === "kanban") safeApply(v);
    });
};

// MutationObserver: Kanban пересоздаёт DOM при move/edit карточки и при
// виртуализации; переприменяем с дебаунсом. Проходы идемпотентны, поэтому
// собственные правки не порождают новые проходы бесконечно.
const observedViews = new WeakSet();
const installViewObserver = (view) => {
    if (observedViews.has(view)) return;
    const rootEl = view.contentEl;
    if (!rootEl) return;
    observedViews.add(view);
    let timer = null;
    const observer = new MutationObserver(() => {
        // Свои правки тоже попадают сюда, но повторный проход ничего не меняет
        // и новых записей не порождает — цикл гаснет на втором тике.
        if (timer) return;
        timer = setTimeout(() => { timer = null; safeApply(view); }, 150);
    });
    observer.observe(rootEl, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ["class", "style"],
    });
};

if (typeof window !== "undefined" && typeof app !== "undefined" && !window.__kanbanLaneColumnsRegistered) {
    window.__kanbanLaneColumnsRegistered = true;

    app.workspace.on("layout-change", applyAll);
    app.workspace.on("active-leaf-change", applyAll);
    // Правка frontmatter доски применяется без перезапуска.
    app.metadataCache.on("changed", (file) => {
        if (file?.extension === "md") kanbanViewsOf(file.path).forEach(safeApply);
    });

    const kickoff = () => [0, 300, 800, 1500].forEach((d) => setTimeout(applyAll, d));
    if (app.workspace.layoutReady) kickoff(); else app.workspace.onLayoutReady(kickoff);
}

module.exports = () => "";
module.exports.normalizeTitle = normalizeTitle;
module.exports.parseLaneColumns = parseLaneColumns;
module.exports.parseCardClamp = parseCardClamp;
module.exports.resolveToggle = resolveToggle;
