/**
 * Сквозная лента записей человека для kanban-досок спринта.
 *
 * Правый клик по аватарке в .kanban-filter-bar (см. kanbanFilterBar.js)
 * открывает модальное окно с записями этого человека по всем спринтам:
 * группировка по дням, свежие сверху, подгрузка старых дней кнопкой.
 * Левый клик по-прежнему фильтрует доску — скрипты независимы, лента
 * навешивается делегированным обработчиком contextmenu на document.
 *
 * Данные: страницы с тегом dailyComments и frontmatter `user`, каждое
 * списание — элемент списка с cardref/action/spent (см. AGENTS.md).
 * Источник — Dataview API (app.plugins.plugins.dataview.api), окно —
 * встроенный Modal из API Obsidian, ссылки — MarkdownRenderer.
 * Модуль "obsidian" берётся через `require`, который подставляет плагин
 * vault-startup-scripts: window.require("obsidian") в этом контексте не
 * резолвится (см. заметку в _views/roadmap-board/view.js).
 *
 * Чистая логика (parseFeedDate, stripInlineFields, buildFeed) не зависит от
 * Obsidian и покрыта тестом: `node --test _tests/kanbanUserFeed.test.js`.
 */

console.log("Загрузка _scripts/kanbanUserFeed.js");

const DAYS_PER_PAGE = 20;
const DATE_RE = /^(\d{4}-\d{2}-\d{2})/;

/** Дата записи из имени файла `ГГГГ-ММ-ДД-Участник` → "ГГГГ-ММ-ДД" или null. */
const parseFeedDate = (fileName) => {
    const m = String(fileName || "").match(DATE_RE);
    return m ? m[1] : null;
};

/** Папка спринта из пути файла: "sprint2/comments/x.md" → "sprint2". */
const sprintFromPath = (path) => {
    const root = String(path || "").split("/")[0];
    return root || "";
};

/** Имя карточки без папок и расширения. */
const baseName = (path) =>
    String(path || "").split("/").pop().replace(/\.md$/, "");

/**
 * Убирает из текста списания inline-поля `[cardref:: [[...]]]`,
 * `[action::x]`, `[spent:: n]` и общий отступ продолжающих строк.
 * Снимается только минимальный общий отступ, чтобы вложенные списки
 * и блоки кода в описании сохранили структуру.
 */
const stripInlineFields = (text) => {
    const lines = String(text || "")
        .replace(/\[cardref::\s*\[\[[^\]]*\]\]\s*\]/g, "")
        .replace(/\[(action|spent)::[^\]]*\]/g, "")
        .replace(/\((action|spent|cardref)::[^)]*\)/g, "")
        .split("\n")
        .map((line) => line.replace(/\s+$/, ""));

    // Первая строка — сама строка маркера списка, у неё отступа нет.
    const indents = lines.slice(1)
        .filter((line) => line.trim().length > 0)
        .map((line) => line.match(/^\s*/)[0].length);
    const common = indents.length ? Math.min(...indents) : 0;

    return lines
        .map((line, i) => (i === 0 ? line.trim() : line.slice(Math.min(common, line.length))))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
};

/**
 * Строит ленту из плоских страниц записей.
 *
 * @param {Array<{path: string, name: string, items: Array<{
 *   cardPath: string, cardDisplay?: string, action?: string,
 *   spent?: number|string, text?: string, children?: string[]
 * }>}>} pages
 * @returns {Array<{date: string, sprint: string, total: number, entries: Array}>}
 *   дни по убыванию даты; sprint — «sprint2» или «sprint1, sprint2», если
 *   день лежит в двух каталогах; entries — в порядке появления в файлах.
 */
const buildFeed = (pages) => {
    const days = new Map();

    for (const page of pages || []) {
        const date = parseFeedDate(page.name);
        if (!date) continue;

        let day = days.get(date);
        if (!day) {
            day = { date, sprints: [], total: 0, entries: [] };
            days.set(date, day);
        }
        // Один день может лежать в двух каталогах спринтов (граница спринта).
        const sprint = sprintFromPath(page.path);
        if (sprint && !day.sprints.includes(sprint)) day.sprints.push(sprint);

        for (const item of page.items || []) {
            if (!item || !item.cardPath) continue;
            // Нет или не число — spent: null; в сумму не входит, в UI прочерк.
            const parsed = item.spent === undefined || item.spent === null || item.spent === ""
                ? NaN
                : Number(item.spent);
            const hours = Number.isFinite(parsed) ? parsed : null;
            if (hours !== null) day.total += hours;
            day.entries.push({
                cardPath: item.cardPath,
                cardTitle: item.cardDisplay || baseName(item.cardPath),
                action: String(item.action || "").trim(),
                spent: hours,
                text: stripInlineFields(item.text),
                children: (item.children || []).map(stripInlineFields).filter(Boolean),
                sourcePath: page.path,
            });
        }
    }

    return Array.from(days.values())
        .filter((d) => d.entries.length > 0)
        .map((d) => ({ ...d, sprint: d.sprints.join(", ") }))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
};

const formatDay = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("ru-RU", {
        weekday: "short", day: "numeric", month: "long", year: "numeric",
    });
};

const formatHours = (n) => {
    const rounded = Math.round(n * 100) / 100;
    return String(rounded).replace(".", ",");
};

// ---------------------------------------------------------------------------
// Ниже — только Obsidian runtime.
// ---------------------------------------------------------------------------

const getDv = () =>
    (typeof app !== "undefined" && app.plugins?.plugins?.dataview?.api) || null;

/** Собирает страницы записей пользователя из Dataview в плоскую форму для buildFeed. */
const collectUserPages = (dv, userName) => {
    const all = dv.pages("#dailyComments");
    const pages = all.where((p) => p.user === userName);
    console.log(`[kanbanUserFeed] ${userName}: страниц dailyComments=${all.length}, с user=${pages.length}`);
    const result = [];
    for (const p of pages) {
        const lists = p.file?.lists ? dv.array(p.file.lists).array() : [];
        const items = lists
            .filter((li) => li && li.cardref && li.cardref.path)
            .map((li) => ({
                cardPath: li.cardref.path,
                cardDisplay: li.cardref.display,
                action: li.action,
                spent: li.spent,
                text: li.text,
                children: li.children ? dv.array(li.children).array().map((c) => c.text) : [],
            }));
        result.push({ path: p.file.path, name: p.file.name, items });
    }
    return result;
};

const openLink = (path, sourcePath, modal, evt) => {
    const newLeaf = Boolean(evt && (evt.ctrlKey || evt.metaKey || evt.button === 1));
    modal.close();
    app.workspace.openLinkText(path, sourcePath, newLeaf);
};

const HOVER_SOURCE = "kanban-user-feed";

// Итоги по задаче — общий модуль с доской. В Node-тестах app нет, модуль не нужен.
const totalsMod = typeof app !== "undefined"
    ? require(app.vault.adapter.basePath + "/_scripts/taskTotals.js")
    : null;

/** Внутренняя ссылка с открытием по клику и предпросмотром по наведению. */
const createInternalLink = (parent, { cls, text, path, sourcePath, title }, modal) => {
    const a = parent.createEl("a", { cls: `${cls} internal-link`, text, href: path });
    a.dataset.href = path;
    a.dataset.feedOwn = "1";
    if (title) a.title = title;
    a.addEventListener("click", (evt) => {
        evt.preventDefault();
        openLink(path, sourcePath, modal, evt);
    });
    a.addEventListener("auxclick", (evt) => {
        if (evt.button !== 1) return;
        evt.preventDefault();
        openLink(path, sourcePath, modal, evt);
    });
    return a;
};

/** Рендер markdown с учётом старого API (renderMarkdown до Obsidian 1.4). */
const renderMarkdown = (obsidian, markdown, el, sourcePath, component) => {
    const R = obsidian.MarkdownRenderer;
    if (typeof R.render === "function") {
        return R.render(app, markdown, el, sourcePath, component);
    }
    return R.renderMarkdown(markdown, el, sourcePath, component);
};

const renderDay = (obsidian, modal, dv, listEl, day) => {
    const dayEl = listEl.createDiv({ cls: "kanban-user-feed__day" });
    // Шапка дня на той же сетке, что записи: итог — над колонкой часов, которые он суммирует,
    // подпись колонки дробей — над дробями.
    const head = dayEl.createDiv({ cls: "kanban-user-feed__day-head" });
    head.createSpan({ cls: "kanban-user-feed__day-total", text: `${formatHours(day.total)} ч` });
    const label = head.createSpan({ cls: "kanban-user-feed__day-label" });
    label.createSpan({ cls: "kanban-user-feed__day-date", text: formatDay(day.date) });
    label.createSpan({ cls: "kanban-user-feed__day-sprint", text: day.sprint });
    head.createSpan({ cls: "kanban-user-feed__day-caption", text: "за спринт / оценка" });

    for (const entry of day.entries) {
        const el = dayEl.createDiv({ cls: "kanban-user-feed__entry" });
        el.dataset.source = entry.sourcePath;
        const row = el.createDiv({ cls: "kanban-user-feed__entry-head" });

        // Часы записи — слева, фиксированной ширины, чтобы взгляд не бегал.
        const spentEl = row.createSpan({
            cls: "kanban-user-feed__spent",
            text: entry.spent === null ? "—" : formatHours(entry.spent),
        });
        if (entry.spent === null) spentEl.title = "Часы не указаны или не число";

        createInternalLink(row, {
            cls: "kanban-user-feed__card",
            text: entry.cardTitle,
            path: entry.cardPath,
            sourcePath: entry.sourcePath,
            title: entry.cardPath,
        }, modal);

        // Дробь «45/64 · Σ120» — общий рендер с карточками доски.
        const totals = totalsMod.taskTotals(dv, entry.cardPath);
        if (totals) {
            const totalsEl = row.createSpan({ cls: "kanban-user-feed__totals" });
            totalsMod.renderFraction(totalsEl, {
                spent: totals.sprintSpent,
                estimate: totals.estimate,
                total: totals.total,
                sprints: totals.sprints,
            });
        }

        // Переход к файлу записи за день.
        createInternalLink(row, {
            cls: "kanban-user-feed__source",
            text: "↗",
            path: entry.sourcePath,
            sourcePath: entry.sourcePath,
            title: `Открыть запись: ${entry.sourcePath}`,
        }, modal);

        // Тип действия — под часами, а не в строке заголовка: разная длина типов
        // сдвигала заголовки, и они не стояли по одной вертикали.
        if (entry.action) {
            const badge = el.createSpan({ cls: "kanban-user-feed__action", text: entry.action });
            badge.dataset.action = entry.action;
            badge.title = entry.action;
        }

        const body = [entry.text, ...entry.children.map((c) => `- ${c}`)].filter(Boolean).join("\n");
        if (body) {
            const textEl = el.createDiv({ cls: "kanban-user-feed__text" });
            renderMarkdown(obsidian, body, textEl, entry.sourcePath, modal.feedComponent);
        }
    }
};

/** Перетаскивание окна за заголовок: сдвиг через transform, без смены layout. */
const makeDraggable = (modal, handleEl) => {
    let dx = 0, dy = 0;
    let stop = null; // снимает document-обработчики текущего перетаскивания
    handleEl.addEventListener("mousedown", (evt) => {
        if (evt.button !== 0 || evt.target.closest("a, button")) return;
        evt.preventDefault();
        const startX = evt.clientX - dx;
        const startY = evt.clientY - dy;
        const onMove = (e) => {
            dx = e.clientX - startX;
            dy = e.clientY - startY;
            modal.modalEl.style.transform = `translate(${dx}px, ${dy}px)`;
        };
        stop = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", stop);
            stop = null;
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", stop);
    });
    // Окно закрыли посреди перетаскивания — одна регистрация на всё окно.
    modal.feedComponent.register(() => { if (stop) stop(); });
};

const openUserFeed = (userName, avatarSrc) => {
    const obsidian = require("obsidian");
    const dv = getDv();
    if (!dv) {
        new obsidian.Notice("Лента записей: Dataview ещё не загружен");
        return;
    }

    const modal = new obsidian.Modal(app);
    modal.modalEl.addClass("kanban-user-feed-modal");
    totalsMod.clearCaches();

    // Стандартный предпросмотр страницы Obsidian (core-плагин Page preview).
    if (typeof app.workspace.registerHoverLinkSource === "function" &&
        !app.workspace.hoverLinkSources?.[HOVER_SOURCE]) {
        app.workspace.registerHoverLinkSource(HOVER_SOURCE, {
            display: "Лента записей на доске",
            defaultMod: false,
        });
    }
    modal.hoverParent = { hoverPopover: null };

    // Modal — не Component, а MarkdownRenderer нужен владелец для дочерних
    // компонентов (embeds и т.п.). Живёт, пока открыто окно.
    modal.feedComponent = new obsidian.Component();
    modal.feedComponent.load();
    modal.onClose = () => modal.feedComponent.unload();

    const header = modal.titleEl;
    header.addClass("kanban-user-feed__title");
    makeDraggable(modal, header);
    if (avatarSrc) {
        const img = header.createEl("img", { cls: "kanban-user-feed__avatar" });
        img.src = avatarSrc;
        img.alt = userName;
    }
    header.createSpan({ text: userName });
    const stats = header.createSpan({ cls: "kanban-user-feed__stats" });

    const content = modal.contentEl;
    content.addClass("kanban-user-feed");

    // Клики по внутренним ссылкам из отрендеренного markdown (в тексте записи);
    // у своих ссылок (карточка, файл записи) обработчики уже навешены.
    const onMarkdownLink = (evt) => {
        if (evt.type === "auxclick" && evt.button !== 1) return;
        const a = evt.target?.closest?.("a.internal-link");
        if (!a || a.dataset.feedOwn) return;
        const href = a.dataset.href || a.getAttribute("href");
        if (!href) return;
        evt.preventDefault();
        const sourcePath = a.closest(".kanban-user-feed__entry")?.dataset.source || "";
        openLink(href, sourcePath, modal, evt);
    };
    content.addEventListener("click", onMarkdownLink);
    content.addEventListener("auxclick", onMarkdownLink);

    // Предпросмотр по наведению — для всех внутренних ссылок в окне.
    content.addEventListener("mouseover", (evt) => {
        const a = evt.target?.closest?.("a.internal-link");
        if (!a) return;
        const linktext = a.dataset.href || a.getAttribute("href");
        if (!linktext) return;
        const sourcePath = a.closest(".kanban-user-feed__entry")?.dataset.source || "";
        app.workspace.trigger("hover-link", {
            event: evt,
            source: HOVER_SOURCE,
            hoverParent: modal.hoverParent,
            targetEl: a,
            linktext,
            sourcePath,
        });
    });

    modal.open();

    const renderFeed = () => {
        content.empty();
        let feed;
        try {
            feed = buildFeed(collectUserPages(dv, userName));
        } catch (e) {
            console.error("[kanbanUserFeed] не удалось собрать ленту", e);
            content.createDiv({ cls: "kanban-user-feed__empty", text: "Не удалось собрать ленту, см. консоль." });
            return;
        }

        const entriesTotal = feed.reduce((n, d) => n + d.entries.length, 0);
        stats.setText(`${feed.length} дн. · ${entriesTotal} записей`);

        if (feed.length === 0) {
            content.createDiv({ cls: "kanban-user-feed__empty", text: "Записей нет." });
            return;
        }

        const listEl = content.createDiv({ cls: "kanban-user-feed__list" });
        let shown = 0;
        const moreBtn = content.createEl("button", { cls: "kanban-user-feed__more" });

        const showMore = () => {
            const next = feed.slice(shown, shown + DAYS_PER_PAGE);
            next.forEach((day) => renderDay(obsidian, modal, dv, listEl, day));
            shown += next.length;
            const left = feed.length - shown;
            if (left > 0) {
                moreBtn.setText(`Показать ещё (осталось ${left} дн.)`);
                moreBtn.hidden = false;
            } else {
                moreBtn.hidden = true;
            }
        };
        moreBtn.addEventListener("click", showMore);
        showMore();
    };

    // После старта Obsidian Dataview индексирует vault в фоне; до события
    // dataview:index-ready dv.pages() отдаёт неполный (часто пустой) список.
    if (dv.index && dv.index.initialized === false) {
        stats.setText("индексация…");
        content.createDiv({
            cls: "kanban-user-feed__empty",
            text: "Dataview ещё индексирует хранилище, лента появится автоматически.",
        });
        const ref = app.metadataCache.on("dataview:index-ready", () => {
            app.metadataCache.offref(ref);
            // Пока ждали, доска могла заполнить общий кэш итогами по неполному индексу.
            totalsMod.clearCaches();
            renderFeed();
        });
        // Окно закрыли раньше, чем индекс готов — отписаться, ничего не рисовать.
        modal.feedComponent.register(() => app.metadataCache.offref(ref));
        return;
    }

    renderFeed();
};

// --- Самоинициализация (паттерн kanbanFilterBar.js) ---
if (typeof window !== "undefined" && typeof app !== "undefined" && !window.__kanbanUserFeedRegistered) {
    window.__kanbanUserFeedRegistered = true;

    document.body.addEventListener("contextmenu", (evt) => {
        const btn = evt.target?.closest?.(".kanban-filter-bar button[data-user]");
        if (!btn) return;
        evt.preventDefault();
        evt.stopPropagation();
        try {
            openUserFeed(btn.dataset.user, btn.querySelector("img")?.src);
        } catch (e) {
            console.error("[kanbanUserFeed] не удалось открыть ленту", e);
            // Notice может быть недоступен по той же причине, что и упавший вызов.
            try { new (require("obsidian").Notice)(`Лента записей: ${e.message}`); } catch (_) { /* ignore */ }
        }
    }, true);
}

module.exports = () => "";
module.exports.parseFeedDate = parseFeedDate;
module.exports.stripInlineFields = stripInlineFields;
module.exports.buildFeed = buildFeed;
