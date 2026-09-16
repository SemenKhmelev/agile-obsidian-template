/**
 * Итоги по задаче для карточки: часы за спринт карточки, часы по всей
 * цепочке файлов задачи (frontmatter `previous`) и последняя оценка.
 * Общий код для ленты записей (kanbanUserFeed.js) и карточек доски
 * (kanbanBoardSpentSync.js). Требует Dataview API (аргумент dv).
 */

/**
 * Итог по задаче для карточки cardPath:
 *  - sprintSpent — часы по этому файлу задачи, то есть за его спринт;
 *  - total — часы по всей цепочке файлов задачи (frontmatter `previous`
 *    во всех спринтах);
 *  - estimate — оценка самого свежего файла цепочки;
 *  - sprints — длина цепочки.
 * Кэши сбрасывает потребитель через clearCaches() (лента — при открытии окна,
 * доска — при пересчёте спринта).
 */
const taskTotalsCache = new Map();   // cardPath → итог
const fileSpentCache = new Map();    // путь файла задачи → часы по нему

/**
 * Путь файла, на который указывает frontmatter `previous`: ссылка вида
 * `[[sprint1/tasks/Задача|Задача]]` даёт путь без `.md`, поэтому её
 * нужно разрешить через Dataview, а не сравнивать со строкой file.path.
 */
const resolvedPath = (dv, value, sourcePath) => {
    if (!value) return null;
    const raw = typeof value === "string" ? (dv.parse(value)?.path ?? value) : (value.path ?? null);
    if (!raw) return null;
    return dv.page(raw, sourcePath)?.file?.path ?? null;
};

/** Самый свежий файл задачи: идём вперёд по страницам, чьё `previous` указывает на текущую. */
const newestInChain = (dv, page) => {
    const visited = new Set();
    let current = page;
    while (current && !visited.has(current.file.path)) {
        visited.add(current.file.path);
        const next = dv.array(current.file.inlinks).array()
            .map((l) => dv.page(l.path))
            .filter((p) => p && /\/tasks\//.test(p.file.path))
            .find((p) => resolvedPath(dv, p.file.frontmatter?.previous, p.file.path) === current.file.path);
        if (!next) break;
        current = next;
    }
    return current;
};

/** Часы по одному файлу задачи; тот же источник записей, что у ленты (#dailyComments). */
const spentOfTaskPage = (dv, page) => {
    const key = page.file.path;
    if (fileSpentCache.has(key)) return fileSpentCache.get(key);
    const spent = dv.array(page.file.inlinks).array()
        .map((l) => dv.page(l.path))
        .filter((p) => p && dv.array(p.file.tags).includes("#dailyComments"))
        .flatMap((p) => dv.array(p.file.lists).array())
        .filter((li) => li.cardref && li.cardref.path === key)
        .reduce((sum, li) => sum + (Number.isFinite(Number(li.spent)) ? Number(li.spent) : 0), 0);
    fileSpentCache.set(key, spent);
    return spent;
};

const taskTotals = (dv, cardPath) => {
    if (taskTotalsCache.has(cardPath)) return taskTotalsCache.get(cardPath);
    let result = null;
    try {
        const page = dv.page(cardPath);
        if (page) {
            const newest = newestInChain(dv, page);
            // Цепочка назад от самого свежего файла покрывает все спринты задачи.
            const chain = [];
            const seen = new Set();
            let cur = newest;
            while (cur && !seen.has(cur.file.path)) {
                chain.push(cur);
                seen.add(cur.file.path);
                const prev = resolvedPath(dv, cur.file.frontmatter?.previous, cur.file.path);
                cur = prev ? dv.page(prev) : null;
            }
            const spentByPath = new Map(chain.map((p) => [p.file.path, spentOfTaskPage(dv, p)]));
            const total = Array.from(spentByPath.values()).reduce((sum, v) => sum + v, 0);
            const estimateRaw = newest.file.frontmatter?.estimate;
            const estimate = Number(estimateRaw);
            result = {
                sprintSpent: spentByPath.get(page.file.path) ?? 0,
                total,
                estimate: Number.isFinite(estimate) && estimateRaw !== "" && estimateRaw !== null ? estimate : null,
                sprints: chain.length,
            };
        }
    } catch (e) {
        console.warn("[taskTotals] не удалось посчитать итог по задаче", cardPath, e);
    }
    taskTotalsCache.set(cardPath, result);
    return result;
};

const formatHours = (n) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Уровень числителя по доле от оценки: ok / warn (≥ 80 %) / over (> 100 %).
 * Нет оценки (null/NaN) — ok; нулевая оценка при ненулевых часах — over.
 */
const spentLevel = (spent, estimate) => {
    if (!Number.isFinite(estimate)) return "ok";
    if (spent > estimate) return "over";
    if (estimate > 0 && spent >= estimate * 0.8) return "warn";
    return "ok";
};

/**
 * Рисует в el дробь «45/64 · Σ120»: часы за спринт / оценка, и, если задача
 * длиннее одного спринта, Σ — итог по всем её спринтам. Оформление — CSS по
 * классам kbsync-spent / kbsync-est / kbsync-total; на el ставится
 * data-level (ok/warn/over по часам спринта) — лента красит по нему фон,
 * доска свой фон ставит сама (kbsync-overrun).
 * Один рендер для карточек доски и ленты записей.
 *
 * @param {HTMLElement} el контейнер (очищается)
 * @param {{spent:number, estimate:number|null, estimateText?:string,
 *          total?:number, sprints?:number}} v
 */
const renderFraction = (el, v) => {
    el.textContent = "";
    const mk = (cls, text) => {
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = text;
        el.appendChild(span);
        return span;
    };
    const estimate = Number.isFinite(v.estimate) ? v.estimate : null;
    mk("kbsync-spent", formatHours(v.spent));
    el.dataset.level = spentLevel(v.spent, estimate);
    mk("kbsync-est", "/" + (v.estimateText || (estimate === null ? "—" : formatHours(estimate))));
    if ((v.sprints || 1) > 1 && Number.isFinite(v.total)) {
        mk("kbsync-total", ` · Σ${formatHours(v.total)}`);
    }
    el.title = (v.sprints || 1) > 1
        ? `Потрачено за спринт / оценка · Σ — за все ${v.sprints} спринтов задачи`
        : "Потрачено за спринт / оценка";
};

const clearCaches = () => {
    taskTotalsCache.clear();
    fileSpentCache.clear();
};

exports.resolvedPath = resolvedPath;
exports.newestInChain = newestInChain;
exports.spentOfTaskPage = spentOfTaskPage;
exports.taskTotals = taskTotals;
exports.clearCaches = clearCaches;
exports.formatHours = formatHours;
exports.spentLevel = spentLevel;
exports.renderFraction = renderFraction;
