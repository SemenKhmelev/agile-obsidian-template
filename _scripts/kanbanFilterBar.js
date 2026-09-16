/**
 * Вертикальная панель фильтра по разработчику для kanban-досок спринта.
 * Регистрация выполняется автоматически при загрузке скрипта Templater'ом
 * (startup-шаблон триггерит подгрузку user-скриптов).
 *
 * При клике на кнопку имя разработчика подставляется в нативный поиск
 * kanban-плагина через view.emitter — kanban сам открывает строку поиска,
 * подсвечивает совпадения и скрывает нерелевантные карточки.
 * Правый клик по кнопке — сквозная лента записей человека, см. kanbanUserFeed.js.
 */

const developers = [
    { name: "Галена Селезнева", file: "selezneva.png" },
    { name: "Ангел Весельчак",  file: "veselchak.png" },
    { name: "Кости Герасимов",  file: "gerasimov.png" },
    { name: "Ксаеро Великанов", file: "velikanov.png" },
];

const AVATAR_DIR = "_views/avatars";

const buildBar = (host, leaf) => {
    if (host.querySelector(":scope > .kanban-filter-bar")) return false;
    if (getComputedStyle(host).position === "static") {
        host.style.position = "relative";
    }

    const bar = document.createElement("div");
    bar.className = "kanban-filter-bar";

    developers.forEach(({ name, file }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        // Правый клик обрабатывает kanbanUserFeed.js — открывает ленту записей.
        btn.title = `${name} — клик: фильтр доски, правый клик: лента записей`;
        btn.dataset.user = name;

        const img = document.createElement("img");
        img.src = app.vault.adapter.getResourcePath(`${AVATAR_DIR}/${file}`);
        img.alt = name;
        img.draggable = false;
        btn.appendChild(img);
        btn.addEventListener("click", () => {
            // Берём актуальный view из leaf — leaf переживает пересоздание view
            // (при rename файла, переключении preview/edit и т.п.).
            const view = leaf && leaf.view;
            if (!view || view.getViewType() !== "kanban" || !view.emitter) {
                return;
            }

            const wasActive = btn.classList.contains("active");
            bar.querySelectorAll("button").forEach((b) => b.classList.remove("active"));

            if (wasActive) {
                // Повторный клик по той же кнопке — очистить поиск.
                view.emitter.emit("hotkey", { commandId: "editor:open-search", data: "" });
            } else {
                btn.classList.add("active");
                view.emitter.emit("hotkey", { commandId: "editor:open-search", data: name });
            }
        });
        bar.appendChild(btn);
    });
    host.appendChild(bar);
    return true;
};

const refresh = () => {
    let kanbanCount = 0;
    app.workspace.iterateAllLeaves((leaf) => {
        if (!leaf.view || !leaf.view.getViewType || leaf.view.getViewType() !== "kanban") return;
        kanbanCount++;
        const host =
            leaf.view.contentEl ||
            (leaf.view.containerEl && leaf.view.containerEl.querySelector(".view-content")) ||
            leaf.view.containerEl;
        if (!host) return;
        buildBar(host, leaf);
    });
    return kanbanCount;
};

const safeRefresh = () => {
    try { refresh(); } catch (e) { console.error("[kanbanFilterBar] refresh failed", e); }
};

// Двусторонняя синхронизация active-кнопки с нативным поиском Kanban.
// Логика: смотрим текущий query из .kanban-plugin__filter-input. Если query
// (case-insensitive) является подстрокой ровно одного имени — подсвечиваем
// соответствующую кнопку. Во всех остальных случаях (пустой query, несколько
// совпадений, ноль совпадений, поле скрыто) — снимаем active со всех кнопок.
// Это покрывает: ручную правку текста, ввод имени руками, нажатие × / Esc.
const syncActiveState = () => {
    document.querySelectorAll(".kanban-filter-bar").forEach((bar) => {
        const host = bar.parentElement;
        if (!host) return;
        const input = host.querySelector(".kanban-plugin__filter-input");
        const query = (input ? input.value : "").trim().toLowerCase();

        let matchedName = null;
        if (query.length > 0) {
            const matches = developers.filter((d) =>
                d.name.toLowerCase().includes(query)
            );
            if (matches.length === 1) {
                matchedName = matches[0].name;
            }
        }

        bar.querySelectorAll("button").forEach((btn) => {
            const shouldBeActive =
                matchedName !== null && btn.dataset.user === matchedName;
            if (btn.classList.contains("active") !== shouldBeActive) {
                btn.classList.toggle("active", shouldBeActive);
            }
        });
    });
};

// Самоинициализация при загрузке скрипта (Templater дёргает eval() на старте
// через startup-шаблон).
if (typeof window !== "undefined" && !window.__kanbanFilterBarRegistered) {
    window.__kanbanFilterBarRegistered = true;

    app.workspace.on("layout-change", safeRefresh);
    app.workspace.on("active-leaf-change", safeRefresh);

    // Мгновенно реагируем на ручной ввод в нативное поле поиска kanban.
    document.body.addEventListener(
        "input",
        (e) => {
            const t = e.target;
            if (t && t.matches && t.matches(".kanban-plugin__filter-input")) {
                syncActiveState();
            }
        },
        true,
    );

    // Поллинг — для случаев, когда поле очищается программно (кнопка ×, Esc),
    // когда нативный input не диспатчится.
    setInterval(syncActiveState, 500);

    const kickoff = () => {
        [0, 300, 800, 1500, 3000].forEach((d) => setTimeout(safeRefresh, d));
    };
    if (app.workspace.layoutReady) {
        kickoff();
    } else {
        app.workspace.onLayoutReady(kickoff);
    }
}

// Templater требует module.exports у user-скрипта; функция оставлена как
// ручной триггер refresh на случай, если кто-то захочет вызвать её из шаблона.
const kanbanFilterBar = () => {
    safeRefresh();
    return "";
};

module.exports = kanbanFilterBar;
