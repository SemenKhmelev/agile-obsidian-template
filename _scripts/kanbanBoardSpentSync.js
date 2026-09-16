/**
 * Подсчёт `spent` для карточек kanban-доски (sprintNNN/board.md) на лету,
 * без записи во frontmatter задач.
 *
 * Зачем: плагин Kanban читает метаданные только из YAML, но мы не хотим
 * хранить вычисленный spent в файлах задач (git-шум, рассинхрон, лишний
 * state). Скрипт после рендера доски проходит по всем .kanban-plugin__item,
 * по wikilink резолвит TFile, получает spent через утилиты dataset.js +
 * task-history.js и инжектит в .kanban-plugin__meta-table карточки строку
 * <tr data-key="spentsum">. CSS из snippets.css подхватывает data-key и
 * рисует пилюлю с иконкой часов.
 *
 * Перерисовки: kanban пересоздаёт карточки при card-move/edit, и наш
 * injected <tr> исчезает. Чтобы это переживать, помимо хуков workspace
 * (file-open, active-leaf-change) на каждый kanban-leaf вешается
 * MutationObserver — он дебаунсит и переинжектит при любом изменении DOM
 * внутри view'хи.
 *
 * Регистрация: Templater при загрузке user-script'а делает require(),
 * top-level код регистрирует workspace-хуки через guard `window.__kanbanSpentSyncRegistered`.
 * См. зеркальный паттерн в _scripts/kanbanFilterBar.js.
 */

console.log("Загрузка _scripts/kanbanBoardSpentSync.js");

const dataset = require(app.vault.adapter.basePath + "/_scripts/dataset.js");
const history = require(app.vault.adapter.basePath + "/_scripts/task-history.js");
const totalsMod = require(app.vault.adapter.basePath + "/_scripts/taskTotals.js");

// Кэш Map<sprintFolder, Map<taskPath, spent>>. Сбрасывается по таймеру
// COOLDOWN_MS — это защита от пересчётов при шквале active-leaf-change.
const COOLDOWN_MS = 1_500;
const lastComputedAt = new Map();
const sprintSpentCache = new Map();

const getDv = () => app.plugins?.plugins?.dataview?.api ?? null;

const round = value =>
    Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

// "sprint2/board.md" -> "sprint2"; всё остальное -> null.
const detectSprint = boardPath => {
    const match = boardPath?.match(/^(sprint\d+)\/board\.md$/);
    return match ? match[1] : null;
};

const computeSprintSpent = sprintFolder => {
    const now = Date.now();
    if (now - (lastComputedAt.get(sprintFolder) || 0) < COOLDOWN_MS) {
        return sprintSpentCache.get(sprintFolder) || new Map();
    }
    lastComputedAt.set(sprintFolder, now);

    const dv = getDv();
    if (!dv) {
        console.warn("[kanban-spent-sync] dataview API недоступен");
        return sprintSpentCache.get(sprintFolder) || new Map();
    }

    let records;
    try {
        records = dataset.getRawSprintTaskData(dv, sprintFolder) || [];
    } catch (error) {
        console.error(`[kanban-spent-sync] не удалось загрузить данные спринта ${sprintFolder}`, error);
        return sprintSpentCache.get(sprintFolder) || new Map();
    }

    const recordsArray = history.ensureArray(dv, records);
    const map = new Map();
    for (const record of recordsArray) {
        const taskPath = record?.page?.file?.path;
        if (!taskPath) continue;
        const spent = round(history.sumSpent(dv, record.listItems));
        map.set(taskPath, spent);
    }

    sprintSpentCache.set(sprintFolder, map);
    totalsMod.clearCaches(); // итоги по цепочкам пересчитаются вместе со спринтом
    return map;
};

// Пилюля «45/64 · Σ120»: часы за спринт / оценка карточки (как её показывает
// Kanban), Σ — итог по всей цепочке задачи, если она длиннее одного спринта.
// Рендер общий с лентой записей — totalsMod.renderFraction.
const fillValueTd = (valueTd, spent, estimateText, totals) => {
    valueTd.textContent = "";
    const span = document.createElement("span");
    span.className = "kanban-plugin__meta-value inline";
    const estimate = parseFloat(String(estimateText).replace(",", "."));
    totalsMod.renderFraction(span, {
        spent,
        estimate: Number.isFinite(estimate) ? estimate : null,
        estimateText: estimateText || "",
        total: totals?.total,
        sprints: totals?.sprints,
    });
    valueTd.appendChild(span);
};

// Оценка, которую Kanban отрендерил из frontmatter карточки (строка «estimate»).
const readEstimateText = tbody => {
    const row = tbody.querySelector('tr:has(td.kanban-plugin__meta-key[data-key="estimate"])');
    return row?.querySelector(".kanban-plugin__meta-value-wrapper")?.textContent.trim() || "";
};

// Создаёт или обновляет <tr data-key="spentsum"> в meta-таблице карточки.
// Идемпотентно: если значение уже верное — ничего не делает (важно для
// MutationObserver, чтобы не получить бесконечный цикл инжектов).
const ensureSpentRow = (card, spent, totals) => {
    const tbody = card.querySelector(".kanban-plugin__meta-table > tbody");
    if (!tbody) return;

    const estimateText = readEstimateText(tbody);
    let spentRow = tbody.querySelector(
        'tr:has(td.kanban-plugin__meta-key[data-key="spentsum"])'
    );

    if (spentRow) {
        const valueTd = spentRow.querySelector(".kanban-plugin__meta-value-wrapper");
        if (!valueTd) return;
        // Идемпотентность: перерисовываем только если входные данные изменились.
        const stamp = `${spent}|${estimateText}|${totals?.total ?? ""}|${totals?.sprints ?? ""}`;
        if (valueTd.dataset.kbsyncStamp !== stamp) {
            fillValueTd(valueTd, spent, estimateText, totals);
            valueTd.dataset.kbsyncStamp = stamp;
        }
        return;
    }

    spentRow = document.createElement("tr");
    spentRow.className = "kanban-plugin__meta-row";

    const keyTd = document.createElement("td");
    keyTd.className = "kanban-plugin__meta-key";
    keyTd.setAttribute("data-key", "spentsum");
    keyTd.setAttribute("title", "Потрачено");

    const valueTd = document.createElement("td");
    valueTd.className = "kanban-plugin__meta-value-wrapper";
    valueTd.setAttribute("title", "Потрачено");
    fillValueTd(valueTd, spent, estimateText, totals);
    valueTd.dataset.kbsyncStamp = `${spent}|${estimateText}|${totals?.total ?? ""}|${totals?.sprints ?? ""}`;

    spentRow.appendChild(keyTd);
    spentRow.appendChild(valueTd);

    // Вставляем сразу после estimate-строки; если её нет — в конец tbody.
    const estimateRow = tbody.querySelector(
        'tr:has(td.kanban-plugin__meta-key[data-key="estimate"])'
    );
    if (estimateRow) {
        estimateRow.after(spentRow);
    } else {
        tbody.appendChild(spentRow);
    }
};

// Главный проход: найти все открытые kanban-доски, для каждой пройти по
// карточкам и вставить spentsum-строку.
const injectSpentRows = () => {
    app.workspace.iterateAllLeaves(leaf => {
        const view = leaf?.view;
        if (!view || typeof view.getViewType !== "function" || view.getViewType() !== "kanban") return;
        const boardPath = view.file?.path;
        if (!boardPath) return;
        const sprint = detectSprint(boardPath);
        if (!sprint) return;

        const spentMap = computeSprintSpent(sprint);
        if (!spentMap.size) return;

        const containerEl = view.contentEl || view.containerEl;
        if (!containerEl) return;

        const cards = containerEl.querySelectorAll(".kanban-plugin__item");
        for (const card of cards) {
            const link = card.querySelector(
                ".kanban-plugin__item-title a.internal-link"
            );
            if (!link) continue;
            const linkText =
                link.getAttribute("data-href") || link.getAttribute("href");
            if (!linkText) continue;
            const file = app.metadataCache.getFirstLinkpathDest(linkText, boardPath);
            if (!file) continue;
            // spentMap покрывает только tasks текущего спринта; карточки,
            // ссылающиеся на задачи других спринтов (out of flow, suspended),
            // считаем через taskTotals по самому файлу задачи.
            const dv = getDv();
            const totals = dv ? totalsMod.taskTotals(dv, file.path) : null;
            const spent = spentMap.get(file.path) ?? totals?.sprintSpent;
            if (spent === undefined) continue;
            ensureSpentRow(card, spent, totals);
        }

        installViewObserver(view);
    });
};

// MutationObserver на корень kanban-view: re-inject при любом DOM-изменении
// (например, после move/edit карточки kanban пересоздаёт meta-table и наш
// injected <tr> исчезает). Дебаунсим, чтобы не дёргаться слишком часто.
// `ensureSpentRow` идемпотентен → повторные тики безопасны и не зацикливаются.
const observedViews = new WeakSet();
const installViewObserver = view => {
    if (observedViews.has(view)) return;
    const root = view.contentEl || view.containerEl;
    if (!root) return;
    observedViews.add(view);

    let timer = null;
    const observer = new MutationObserver(() => {
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            injectSpentRows();
            tagOverrunRows();
            tagMetaTitles();
        }, 150);
    });
    observer.observe(root, { childList: true, subtree: true });
};

// Лейблы estimate/spentsum в карточках — глифы 🎯 и Σ (см. snippets.css,
// те же, что в ленте записей), и без подсказки непонятно, что есть что. Проставляем
// нативный HTML title на td, чтобы при наведении появлялся всплывающий
// тултип браузера. Чистым CSS этого не сделать — атрибут можно навесить
// только из JS, после того как Kanban отрендерит meta-table.
const META_TITLES = {
    estimate: "Оценка",
    spentsum: "Потрачено за спринт / оценка · Σ — за все спринты задачи",
};

const tagMetaTitles = () => {
    for (const [key, title] of Object.entries(META_TITLES)) {
        const keyCells = document.querySelectorAll(
            `td.kanban-plugin__meta-key[data-key="${key}"]`
        );
        keyCells.forEach(keyTd => {
            if (keyTd.getAttribute("title") !== title) {
                keyTd.setAttribute("title", title);
            }
            // Соседняя ячейка значения в той же tr — чтобы тултип всплывал
            // и при наведении на цифру, а не только на иконку.
            const valueTd = keyTd
                .closest("tr")
                ?.querySelector("td.kanban-plugin__meta-value-wrapper");
            if (valueTd && !valueTd.getAttribute("title")) {
                valueTd.setAttribute("title", title);
            }
        });
    }
};

// Помечает строку с spentsum классом `kbsync-overrun`, если spent > estimate
// в той же таблице карточки. CSS подхватывает этот класс и красит пилюлю
// в красный. Чистым CSS такое сравнение сделать нельзя — приходится
// проходиться по DOM после того, как карточки перерисованы / spent injected.
const tagOverrunRows = () => {
    const tables = document.querySelectorAll(".kanban-plugin__meta-table");
    tables.forEach(table => {
        const estimateKey = table.querySelector(
            'td.kanban-plugin__meta-key[data-key="estimate"]'
        );
        const spentKey = table.querySelector(
            'td.kanban-plugin__meta-key[data-key="spentsum"]'
        );
        if (!spentKey) return;

        const spentRow = spentKey.closest("tr");
        if (!spentRow) return;

        if (!estimateKey) {
            spentRow.classList.remove("kbsync-overrun");
            return;
        }

        const estimateRow = estimateKey.closest("tr");
        const parseValue = row => {
            const wrapper = row?.querySelector(".kanban-plugin__meta-value-wrapper");
            if (!wrapper) return NaN;
            return parseFloat(wrapper.textContent.trim().replace(",", "."));
        };

        const est = parseValue(estimateRow);
        const spent = parseValue(spentRow);

        const overrun =
            Number.isFinite(est) && Number.isFinite(spent) && spent > est;
        spentRow.classList.toggle("kbsync-overrun", overrun);
    });
};

const maybeSync = () => {
    // На первом тике карточек ещё может не быть в DOM (kanban инициализируется
    // асинхронно), поэтому пытаемся несколько раз. injectSpentRows + tagOverrun +
    // tagTitles вызываются сразу один за другим, чтобы overrun/title считались
    // уже по injected-строкам.
    [200, 600, 1500].forEach(d => setTimeout(() => {
        injectSpentRows();
        tagOverrunRows();
        tagMetaTitles();
    }, d));
};

// Самоинициализация при загрузке скрипта (Templater дёргает require() на старте).
if (typeof window !== "undefined" && !window.__kanbanSpentSyncRegistered) {
    window.__kanbanSpentSyncRegistered = true;
    console.log("[kanban-spent-sync] зарегистрирован");

    app.workspace.on("file-open", maybeSync);
    app.workspace.on("active-leaf-change", maybeSync);

    const kickoff = () => setTimeout(maybeSync, 500);
    if (app.workspace.layoutReady) {
        kickoff();
    } else {
        app.workspace.onLayoutReady(kickoff);
    }
}

// Templater требует module.exports у user-скрипта; функция оставлена как
// ручной триггер на случай вызова из шаблона / стартап-шаблона.
const kanbanBoardSpentSync = () => {
    maybeSync();
    return "";
};

module.exports = kanbanBoardSpentSync;
