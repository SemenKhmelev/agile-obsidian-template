console.log( "\n#################################################\n" +
             "        START TASK REPORT VIEW BUILD           " + 
			 "\n#################################################\n");

dv = input.dv;
var ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");

const folderName = dv.current().file.folder;
const tasks = ds.getRawSprintTaskData(dv, `${folderName.slice(0,folderName.lastIndexOf("/"))}`)
console.log(tasks)

// const taskPages = dv.pages(`"${folderName.slice(0,folderName.lastIndexOf("/"))}/tasks"`)
const taskSumdata = []

tasks.forEach( rec => {	
    let spentSummary =  parseFloat(Array.from(rec.listItems).reduce((acc, item) => acc + item.spent, 0).toFixed(1))
    console.log(spentSummary)
    let estimate = rec.page.file.frontmatter.estimate ? rec.page.file.frontmatter.estimate : 0
    estimate = parseFloat(Number(estimate).toFixed(1))
    const taskData = []
    const spentSummaryTag = spentSummary > estimate ? `<font color="red">${spentSummary}</font>` : spentSummary;
    taskData.push(`<b>${rec.page.file.link}</b>`, estimate, spentSummaryTag, rec.page.file.path.contains("predefined"), spentSummary);
    taskSumdata.push(taskData)
})


dv.header(2, "Сопутствующие задачи!")
dv.table(["Задача", "Estimate", "Spent"], 
		 dv.array(taskSumdata.filter(d => d[3])).sort(d => parseFloat(d[4]), "desc").map(d => d.slice(0,3))
		 )

dv.header(2, "Задачи спринта")
dv.table(["Задача", "Estimate", "Spent"], 
		 dv.array(taskSumdata.filter(d => !d[3])).sort(d => parseFloat(d[4]), "desc").map(d => d.slice(0,3))
		 )