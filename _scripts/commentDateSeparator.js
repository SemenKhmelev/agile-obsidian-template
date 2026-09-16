/**
 * Горизонтальный разделитель между днями в File Explorer для папок comments.
 *
 * Файлы в sprintNNN/comments/ именуются YYYY-MM-DD-Участник.md. При сортировке
 * по имени они группируются по дате. Скрипт расставляет CSS-класс
 * `date-group-first` на .nav-file-title первого файла каждого нового дня —
 * CSS рисует горизонтальную линию-разделитель (border-top) перед ним.
 *
 * Паттерн регистрации аналогичен kanbanFilterBar.js / kanbanBoardSpentSync.js:
 * самоинициализация при загрузке Templater, guard через window-флаг.
 */

const DATE_RE = /(\d{4}-\d{2}-\d{2})-/;
const COMMENTS_PATH_RE = /\/comments\//;
const CLASS = "date-group-first";

const formatDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("ru-RU", {
        weekday: "short", day: "numeric", month: "long",
    });
};

const applyDateSeparators = () => {
    // Берём все файлы comments, видимые в file explorer.
    // Селектор проверен — dev-avatars.css использует тот же паттерн.
    const titles = document.querySelectorAll(
        '.nav-file-title[data-path*="/comments/"]'
    );

    if (titles.length === 0) return;

    // Группируем по ближайшему контейнеру .nav-folder-children —
    // это общий родитель всех файлов одной папки comments.
    const groups = new Map();
    for (const el of titles) {
        const container = el.closest(".nav-folder-children");
        if (!container) continue;
        if (!groups.has(container)) groups.set(container, []);
        groups.get(container).push(el);
    }

    let totalApplied = 0;
    for (const [, els] of groups) {
        let prevDate = null;

        for (const el of els) {
            const path = el.getAttribute("data-path") || "";
            const match = path.match(DATE_RE);
            const date = match ? match[1] : null;

            if (date && (prevDate === null || date !== prevDate)) {
                el.classList.add(CLASS);
                el.dataset.date = formatDate(date);
                totalApplied++;
            } else {
                el.classList.remove(CLASS);
                delete el.dataset.date;
            }

            if (date) prevDate = date;
        }
    }
};

// --- Самоинициализация ---
if (typeof window !== "undefined" && !window.__commentDateSepRegistered) {
    window.__commentDateSepRegistered = true;

    let timer = null;
    const debounced = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                applyDateSeparators();
            } catch (e) {
                console.error("[commentDateSeparator]", e);
            }
        }, 100);
    };

    // Workspace-события: layout-change ловит сворачивание/разворачивание папок,
    // переключение панелей и т.п.
    app.workspace.on("layout-change", debounced);

    // MutationObserver на контейнер file explorer — ловит virtual scroll,
    // создание/удаление файлов.
    const attachObserver = () => {
        const container = document.querySelector(".nav-files-container");
        if (!container) {
            return;
        }
        const obs = new MutationObserver(debounced);
        obs.observe(container, { childList: true, subtree: true });
    };

    const kickoff = () => {
        [0, 300, 800, 1500].forEach((d) => setTimeout(() => {
            debounced();
            if (d === 0) attachObserver();
        }, d));
    };

    if (app.workspace.layoutReady) {
        kickoff();
    } else {
        app.workspace.onLayoutReady(kickoff);
    }
}

// Templater требует module.exports у user-скрипта.
const commentDateSeparator = () => {
    applyDateSeparators();
    return "";
};

module.exports = commentDateSeparator;
