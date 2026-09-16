/**
 * Вертикальная панель фильтра по разработчику для таблицы «Задачи спринта»
 * в отчёте, который рендерится через _views/task-report/view.js.
 *
 * Вызывается из view.js после addSortableTableFunctionality(). Через
 * setTimeout(..., 600) ждёт, когда DataviewJS отрисует все таблицы и спиннер
 * сортировки исчезнет, затем находит h2 «Задачи спринта», берёт следующий
 * .table-spinner-container с .table-view-table, находит колонку
 * «Исполнители» по заголовку и навешивает справа от таблицы вертикальный бар
 * из круглых аватарок. Клик по аватарке скрывает строки, у которых
 * в колонке «Исполнители» нет имени этого участника. Повторный клик
 * возвращает таблицу к полному виду.
 *
 * Внимание: список разработчиков и AVATAR_DIR продублированы из
 * _scripts/kanbanFilterBar.js намеренно — kanban-сторону не трогаем.
 */

const developers = [
    { name: "Галена Селезнева", file: "selezneva.png" },
    { name: "Ангел Весельчак",  file: "veselchak.png" },
    { name: "Кости Герасимов",  file: "gerasimov.png" },
    { name: "Ксаеро Великанов", file: "velikanov.png" },
];

const AVATAR_DIR = "_views/avatars";
const TARGET_HEADING = "Задачи спринта";
const USER_COLUMN_HEADER = "Исполнители";

const findColumnIndex = (table, headerText) => {
    const headers = Array.from(table.querySelectorAll("thead th"));
    return headers.findIndex(th => th.textContent.trim().startsWith(headerText));
};

const findTargetTable = () => {
    const headings = document.querySelectorAll("h2");
    for (const h2 of headings) {
        if (h2.textContent.trim() !== TARGET_HEADING) continue;

        // Идём по сиблингам после h2, ищем .table-spinner-container
        // (она может быть как сама сиблингом, так и вложенной — например,
        // если мы уже один раз обернули её в .task-report-filter-wrap).
        let sibling = h2.nextElementSibling;
        while (sibling) {
            if (sibling.tagName === "H2") break;

            const spinner = sibling.classList && sibling.classList.contains("table-spinner-container")
                ? sibling
                : sibling.querySelector && sibling.querySelector(".table-spinner-container");

            if (spinner) {
                const table = spinner.querySelector(".table-view-table");
                if (table) {
                    const userColumnIndex = findColumnIndex(table, USER_COLUMN_HEADER);
                    if (userColumnIndex !== -1) {
                        return { container: spinner, table, userColumnIndex };
                    }
                }
            }
            sibling = sibling.nextElementSibling;
        }
    }
    return null;
};

const buildBar = (container, table, userColumnIndex) => {
    // Идемпотентность: если container уже обёрнут в flex-wrap, ничего не делаем.
    const parent = container.parentElement;
    if (!parent) return false;
    if (parent.classList.contains("task-report-filter-wrap")) return false;

    const bar = document.createElement("div");
    bar.className = "task-report-filter-bar";

    developers.forEach(({ name, file }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = name;
        btn.dataset.user = name;

        const img = document.createElement("img");
        img.src = app.vault.adapter.getResourcePath(`${AVATAR_DIR}/${file}`);
        img.alt = name;
        img.draggable = false;
        btn.appendChild(img);

        btn.addEventListener("click", () => {
            const wasActive = btn.classList.contains("active");
            bar.querySelectorAll("button").forEach((b) => b.classList.remove("active"));

            const tbody = table.querySelector("tbody");
            const rows = tbody ? tbody.querySelectorAll("tr") : [];

            if (wasActive) {
                rows.forEach((row) => { row.style.display = ""; });
                return;
            }

            btn.classList.add("active");
            const needle = name.toLowerCase();
            rows.forEach((row) => {
                const cell = row.children[userColumnIndex];
                const text = cell ? cell.textContent.toLowerCase() : "";
                row.style.display = text.includes(needle) ? "" : "none";
            });
        });

        bar.appendChild(btn);
    });

    // Оборачиваем .table-spinner-container и бар в новый flex-row контейнер.
    // align-items: stretch (default) сделает spinner-container той же высоты,
    // что и бар — это и есть «минимальная высота зоны таблицы = высота бара».
    const wrap = document.createElement("div");
    wrap.className = "task-report-filter-wrap";
    parent.insertBefore(wrap, container);
    wrap.appendChild(container);
    wrap.appendChild(bar);
    return true;
};

const tryAttach = () => {
    try {
        const target = findTargetTable();
        if (!target) return false;
        return buildBar(target.container, target.table, target.userColumnIndex);
    } catch (e) {
        console.error("[taskReportFilterBar] attach failed", e);
        return false;
    }
};

const taskReportFilterBar = () => {
    // addSortableTableFunctionality использует setTimeout(..., 500) — ждём чуть
    // дольше, чтобы DOM был готов и спиннер исчез. Несколько попыток —
    // на случай, если Dataview ещё не успел отрисовать таблицу.
    [600, 1200, 2000].forEach((delay) => setTimeout(tryAttach, delay));
    return "";
};

module.exports = taskReportFilterBar;
