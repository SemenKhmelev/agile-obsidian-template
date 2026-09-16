console.log("\n#################################################\n" +
    "        START ROADMAP THEME TASKS VIEW         " +
    "\n#################################################\n");

dv = input.dv;
const utils = require(app.vault.adapter.basePath + "/_scripts/roadmap-utils.js");

const current = dv.current();
if (!current) {
    dv.paragraph("Нет данных для отображения");
    console.warn("roadmap-theme-tasks: current page is undefined");
    return;
}

const context = utils.buildRoadmapContext(dv);
const currentPath = current.file?.path;
const currentEntry = context.iterations.get(currentPath);

if (!currentEntry || currentEntry.type !== "theme") {
    dv.paragraph("Отчет доступен только для темы");
    console.warn(`roadmap-theme-tasks: page ${currentPath} не является темой`);
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

const directIterationItems = Array.from(context.children.get(currentPath) || new Set())
    .map(path => context.iterations.get(path))
    .filter(entry => entry)
    .map(entry => ({
        link: entry.page.file.link,
        name: entry.page.file.name,
        type: entry.type,
    }));

const directTasksMap = context.directTasksByIteration.get(currentPath) || new Map();
const directTaskItems = Array.from(directTasksMap.values()).map(task => ({
    link: task.link,
    name: task.name,
    type: "task",
}));

const items = [...directIterationItems, ...directTaskItems]
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
    dv.table(["Элемент", "Тип"], items.map(item => [item.link, item.typeLabel]));
}

console.log("#################################################\n" +
    "        END ROADMAP THEME TASKS VIEW           " +
    "\n#################################################\n");
