console.log( "\n#################################################\n" +
    "        START TASK REPORT VIEW BUILD           " +
    "\n#################################################\n");

dv = input.dv;
const ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");
const addSortableTableFunctionality = require(app.vault.adapter.basePath + "/_scripts/addSortableTableFunctionality.js");

// Карта «участник → slug аватарки» (дублируется с _scripts/_devs.py
// и _scripts/kanbanFilterBar.js — при добавлении участника править все три).
const DEV_SLUGS = {
    "Галена Селезнева": "selezneva", "Ангел Весельчак":  "veselchak",
    "Кости Герасимов":  "gerasimov", "Ксаеро Великанов": "velikanov",
};
const renderUserCell = (userName) => {
    if (!userName) return "";
    const slug = DEV_SLUGS[String(userName).trim()];
    if (!slug) return userName;
    const src = app.vault.adapter.getResourcePath(`_views/avatars/${slug}.png`);
    return `<img src="${src}" style="width:16px;height:16px;border-radius:50%;object-fit:cover;vertical-align:-3px;margin-right:4px;">${userName}`;
};

const folderName = dv.current().file.folder;
const sprintFolderName = folderName.slice(0,folderName.lastIndexOf("/"));
const tasks = ds.getRawSprintTaskData(dv, sprintFolderName);
//console.log(tasks)

const designBoard = dv.page(`${sprintFolderName}/board-design.md`);
if (!designBoard) {
    dv.paragraph(`В спринте нет доски дизайн-задач ${sprintFolderName}/board-design.md`);
    return;
}
const boardCards = designBoard.file.lists;

const taskSumdata = []
const stateSumdata = new Map();

tasks.forEach(rec => {
    let spentSummary = 0;
    try {
        spentSummary = parseFloat(Array.from(rec.listItems).reduce((acc, item) => acc + item.spent, 0).toFixed(1))
    } catch (error) {
        console.log("ERROR: " + error)
    }

    let estimate = rec.page.file.frontmatter.estimate ? rec.page.file.frontmatter.estimate : 0;
    estimate = parseFloat(Number(estimate).toFixed(1))

    let boardColumnName = "";
    let tagMarkup = "";
    let isUnplanned = false;
    let onDesignBoard = false;

    for (const boardCard of boardCards) {
        if (boardCard.text.includes(rec.page.file.name)) {
            boardColumnName = boardCard.header.subpath;
            onDesignBoard = true;

            // Обнаружение тега #внепланово в карточке
            if (boardCard.tags?.some(t => t.toLowerCase().replace(/^#/, '') === "внепланово")) {
                isUnplanned = true;
                console.log("Unplanned task: " + rec.page.file.name);
            }

            if (boardColumnName === "done") {
                tagMarkup = `<font color="green">${boardColumnName}</font>`;
            } else if (boardColumnName === "review") {
                tagMarkup = `<font color="orange">${boardColumnName}</font>`;
            }

            if (stateSumdata.has(boardColumnName)) {
                stateSumdata.set(boardColumnName, [
                    stateSumdata.get(boardColumnName)[0] + estimate,
                    stateSumdata.get(boardColumnName)[1] + spentSummary
                ]);
            } else {
                stateSumdata.set(boardColumnName, [estimate, spentSummary]);
            }

            break;
        }
    }

    const spentSummaryTag = spentSummary > estimate
        ? `<font color="red">${spentSummary}</font>`
        : spentSummary;

    // Отображение ссылки с пометкой, если задача внеплановая
    let taskLinkDisplay = `<b>${rec.page.file.link}</b>`;
    if (isUnplanned) {
        taskLinkDisplay = `<b>${rec.page.file.link}</b> <span style="color: #fd940a;" title="#внепланово">⚠️</span>`;
    }

    const taskData = [];
    taskData.push(
        taskLinkDisplay,
        estimate,
        spentSummaryTag,
        renderUserCell(rec.page.file.frontmatter.user),
        tagMarkup,
        rec.page.file.path.contains("predefined"),
        spentSummary,
        onDesignBoard
    );

    taskSumdata.push(taskData)
});

// getRawSprintTaskData отдаёт все задачи спринта, поэтому оставляем только те,
// что стоят на доске board-design.md.

dv.header(2, "Сопутствующие задачи!")
dv.table(["Задача", "Estimate", "Spent"],
    dv.array(
        taskSumdata
            .filter(d => d[5])
            .filter(d => d[7])
    ).sort(d => parseFloat(d[6]), "desc").map(d => d.slice(0,3))
);

dv.header(2, "Задачи спринта")
dv.table(["Задача", "Estimate", "Spent", "Исполнители", "State"],
    dv.array(
        taskSumdata
            .filter(d => !d[5])
            .filter(d => d[7])
    ).sort(d => parseFloat(d[6]), "desc").map(d => d.slice(0,5))
);

// Вызываем установку функционала для сортировки таблиц
addSortableTableFunctionality();