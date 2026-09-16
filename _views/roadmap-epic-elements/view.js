console.log("\n#################################################\n" +
    "        START ROADMAP EPIC ELEMENTS VIEW       " +
    "\n#################################################\n");

dv = input.dv;
const utils = require(app.vault.adapter.basePath + "/_scripts/roadmap-utils.js");

const current = dv.current();
if (!current) {
    dv.paragraph("Нет данных для отображения");
    console.warn("roadmap-epic-elements: current page is undefined");
    return;
}

const context = utils.buildRoadmapContext(dv);
const currentPath = current.file?.path;
const currentEntry = context.iterations.get(currentPath);

if (!currentEntry || currentEntry.type !== "epic") {
    dv.paragraph("Отчет доступен только для эпиков");
    console.warn(`roadmap-epic-elements: page ${currentPath} не является эпиком`);
    return;
}

const TYPE_LABELS = {
    vision: "Видение",
    theme: "Тема",
    epic: "Эпик",
    task: "Задача",
};

const TYPE_ORDER = {
    vision: 0,
    theme: 1,
    epic: 2,
    task: 3,
};

// Цвета статусов — переменные темы Obsidian, поэтому читаются и в светлой, и в тёмной теме.
// Ключи: колонки kanban-доски спринта (для задач) и значения status из frontmatter (для итераций).
const STATUS_COLORS = {
    "todo": "var(--text-muted)",
    "idea": "var(--color-purple)",
    "in progress": "var(--color-blue)",
    "in-progress": "var(--color-blue)",
    "in-flight": "var(--color-blue)",
    "review": "var(--color-orange)",
    "done": "var(--color-green)",
    "out of flow": "var(--color-purple)",
    "suspended": "var(--text-muted)",
    "blocked": "var(--color-red)",
    "rejected": "var(--color-red)",
};

const escapeHtml = value => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const statusBadge = status => {
    if (!status) {
        return `<span style="color: var(--text-faint);">нет на доске</span>`;
    }
    const color = STATUS_COLORS[String(status).toLowerCase()] || "var(--text-normal)";
    return `<span style="color: ${color}; font-weight: 600;">${escapeHtml(status)}</span>`;
};

// Статус задачи — колонка, в которой лежит её карточка на kanban-доске своего спринта
// (board.md, board-design.md и любые другие доски в корне папки спринта).
const boardCardsBySprint = new Map();
const boardCardsFor = sprintFolder => {
    if (boardCardsBySprint.has(sprintFolder)) {
        return boardCardsBySprint.get(sprintFolder);
    }
    const cards = dv.pages(`"${sprintFolder}"`)
        .where(page => page.file.folder === sprintFolder && page.file.frontmatter?.["kanban-plugin"])
        .array()
        .flatMap(board => board.file.lists.array());
    boardCardsBySprint.set(sprintFolder, cards);
    return cards;
};

const taskBoardColumn = page => {
    const sprintFolder = (page?.file?.folder || "").split("/")[0];
    if (!sprintFolder) {
        return null;
    }
    const path = page.file.path;
    const name = page.file.name;
    const card = boardCardsFor(sprintFolder).find(item =>
        Array.from(item.outlinks || []).some(link => link?.path === path)
        || String(item.text || "").includes(`[[${name}`));
    return card?.header?.subpath || null;
};

const directIterations = Array.from(context.children.get(currentPath) || new Set())
    .map(path => context.iterations.get(path))
    .filter(entry => entry)
    .map(entry => ({
        link: entry.page.file.link,
        name: entry.page.file.name,
        type: entry.type,
        status: entry.page.file.frontmatter?.status || "todo",
    }));

const directTasksMap = context.directTasksByIteration.get(currentPath) || new Map();
const directTasks = Array.from(directTasksMap.values()).map(task => ({
    link: task.link,
    name: task.name,
    type: "task",
    status: taskBoardColumn(task.page),
}));

const items = [...directIterations, ...directTasks]
    .map(item => ({
        ...item,
        typeLabel: TYPE_LABELS[item.type] || item.type,
        typeOrder: TYPE_ORDER[item.type] ?? 99,
    }))
    .sort((a, b) => {
        if (a.typeOrder !== b.typeOrder) {
            return a.typeOrder - b.typeOrder;
        }
        return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
    });

if (!items.length) {
    dv.paragraph("Связанных элементов не найдено");
} else {
    dv.table(["Статус", "Элемент", "Тип"], items.map(item => [statusBadge(item.status), item.link, item.typeLabel]));
}

console.log("#################################################\n" +
    "        END ROADMAP EPIC ELEMENTS VIEW         " +
    "\n#################################################\n");
