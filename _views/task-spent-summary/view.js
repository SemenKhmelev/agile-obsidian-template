console.log("\n#################################################\n" +
    "        START TASK SPENT SUMMARY BUILD        " +
    "\n#################################################\n");

dv = input.dv;
const current = dv.current();
if (!current) {
    dv.paragraph("Нет данных для отображения");
    console.warn("task-spent-summary: current page is undefined");
    return;
}

const history = require(app.vault.adapter.basePath + "/_scripts/task-history.js");

const taskChain = history.resolveTaskChain(dv, current);
const recordsMap = new Map();
const loadedFolders = new Set();
history.hydrateRecordsForChain(dv, taskChain, recordsMap, loadedFolders);

const spentSprint = history.sumSpent(dv, recordsMap.get(current.file.path)?.listItems);
const spentFull = taskChain.reduce((total, taskPage) => {
    const record = recordsMap.get(taskPage.file.path);
    return total + history.sumSpent(dv, record?.listItems);
}, 0);

const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const currentTaskEntry = recordsMap.get(current.file.path);
const estimate = currentTaskEntry?.page?.file?.frontmatter?.estimate ?? current.file.frontmatter?.estimate ?? "";

console.log("task-spent-summary: chain", taskChain.map(p => p.file.path));
console.log("task-spent-summary: sprint folders", Array.from(loadedFolders));
console.log("task-spent-summary: spent sprint", spentSprint, "spent full", spentFull);

dv.table([
    "Estimate",
    "SpentSprint",
    "SpentFull"
], [[
    estimate,
    round(spentSprint),
    round(spentFull)
]]);

console.log("#################################################\n" +
    "        END TASK SPENT SUMMARY BUILD          " +
    "\n#################################################\n");
