console.log("\n#################################################\n" +
    "        START ROADMAP ITER SUMMARY VIEW        " +
    "\n#################################################\n");

dv = input.dv;
const utils = require(app.vault.adapter.basePath + "/_scripts/roadmap-utils.js");

const current = dv.current();
if (!current) {
    dv.paragraph("Нет данных для отображения");
    console.warn("roadmap-iteration-summary: current page is undefined");
    return;
}

const context = utils.buildRoadmapContext(dv);
const currentPath = current.file?.path;
const tasksMap = context.tasksByIteration.get(currentPath) || new Map();
const tasks = Array.from(tasksMap.values());

const taskCount = tasks.length;
const estimateValues = tasks
    .map(task => task.estimate)
    .filter(value => value !== null && value !== undefined && Number.isFinite(value));

const estimateTotal = estimateValues.reduce((total, value) => total + value, 0);
const spentTotal = tasks.reduce((total, task) => total + (Number.isFinite(task.spentFull) ? task.spentFull : 0), 0);

const formatNumber = value => Number.isFinite(value) ? parseFloat(value.toFixed(1)) : value;

const rows = [
    ["Количество задач", taskCount],
    ["Estimate (сумма)", estimateValues.length ? formatNumber(estimateTotal) : "Не определено"],
    ["Spent (full)", taskCount ? formatNumber(spentTotal) : 0],
];

dv.table(["Метрика", "Значение"], rows);

console.log("#################################################\n" +
    "        END ROADMAP ITER SUMMARY VIEW          " +
    "\n#################################################\n");
