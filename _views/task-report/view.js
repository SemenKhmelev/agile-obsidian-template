console.log( "\n#################################################\n" +
             "        START TASK REPORT VIEW BUILD           " + 
			 "\n#################################################\n");

dv = input.dv;
var ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");

const folderName = dv.current().file.folder;
const sprintFolderName = folderName.slice(0,folderName.lastIndexOf("/"));
const tasks = ds.getRawSprintTaskData(dv, sprintFolderName);
console.log(tasks)

const boardCards = dv.page(`${sprintFolderName}/board.md`).file.lists;

// const taskPages = dv.pages(`"${folderName.slice(0,folderName.lastIndexOf("/"))}/tasks"`)
const taskSumdata = []

tasks.forEach( rec => {	
    let spentSummary =  parseFloat(Array.from(rec.listItems).reduce((acc, item) => acc + item.spent, 0).toFixed(1))
    console.log(spentSummary)
    let estimate = rec.page.file.frontmatter.estimate ? rec.page.file.frontmatter.estimate : 0
    estimate = parseFloat(Number(estimate).toFixed(1))

    let isDone = false;
    let boardColumnName = "";
    for (const boardCard of boardCards) {
        if (boardCard.text.includes(rec.page.file.name)) {
            console.log(boardCard.header.subpath + " " + rec.page.file.name);
            isDone = boardCard.header.subpath == "done";
            boardColumnName = boardCard.header.subpath;
            break;
        }
    }
    const doneTag = isDone ? `<font color="green">${boardColumnName}</font>` : "";

    const taskData = []
    const spentSummaryTag = spentSummary > estimate ? `<font color="red">${spentSummary}</font>` : spentSummary;
    console.log(rec.page.file)
    taskData.push(`<b>${rec.page.file.link}</b>`, estimate, spentSummaryTag, rec.page.file.frontmatter.user, doneTag, rec.page.file.path.contains("predefined"), spentSummary);

    taskSumdata.push(taskData)
})


dv.header(2, "Сопутствующие задачи!")
dv.table(["Задача", "Estimate", "Spent"], 
    dv.array(taskSumdata.filter(d => d[5])).sort(d => parseFloat(d[6]), "desc").map(d => d.slice(0,3))
)

dv.header(2, "Задачи спринта")
dv.table(["Задача", "Estimate", "Spent", "Исполнители", "State"], 
    dv.array(taskSumdata.filter(d => !d[5])).sort(d => parseFloat(d[6]), "desc").map(d => d.slice(0,5))
)