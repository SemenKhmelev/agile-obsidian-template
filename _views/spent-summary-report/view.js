console.log( "\n#################################################\n" +
             "        START USER SPENT REPORT VIEW BUILD           " + 
			 "\n#################################################\n");

var ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");

console.log(input)
console.log(ds)
const folderName = input.dv.current().file.folder
const rawCommentData = ds.getRawSprintCommentData(input.dv, `${folderName.slice(0,folderName.lastIndexOf("/"))}`);

//-------------------------------------------------------------------
input.dv.header(2, "Группировка времени(spent) по исполнителям")
let userRecs = rawCommentData.groupBy(rec => rec.user)
const userSpentSummaries = userRecs.map(userRecs => {
    let spentSummary =  Array.from(userRecs.rows).reduce((acc, row) => acc + row.listItem.spent, 0)
    return [userRecs.key, spentSummary.toFixed(1)]
});

input.dv.table(["Actor", "Spent summary"], userSpentSummaries )

//-------------------------------------------------------------------
input.dv.header(2, "Внесенное время по дням")

const userSpentByDay = userRecs.map(userRecs => {
    let spentSummary =  Array.from(userRecs.rows).reduce((acc, row) => acc + row.listItem.spent, 0)
    return [userRecs.key, spentSummary]
});

const dates = rawCommentData.map(comment => comment.date)
const firstSprintDate = new Date(Math.min(...dates))
const lastSprintDate = new Date(Math.max(...dates))

const formatDate = (date) => {	
    const daysOfWeek = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; 
	const dayOfWeekIndex = date.getDay();
	const dayOfMonth = date.getDate();
	const monthIndex = date.getMonth() + 1;
	const formattedDate = `${dayOfMonth < 10 ? '0' : ''}${dayOfMonth}.${monthIndex < 10 ? '0' : ''}${monthIndex}\n${daysOfWeek[dayOfWeekIndex]}`; 
	
	return formattedDate; 
}

var iterDate = firstSprintDate;
var i = 0;
const columnsHeader = [];
const columnsIndexByDate = {};
while (iterDate <= lastSprintDate) {
	columnsIndexByDate[iterDate.getTime()] = columnsHeader.length
    columnsHeader.push(formatDate(iterDate))
	iterDate.setDate(iterDate.getDate() + 1)
	i += 1;
}

let tableBodyRecSet = new Map()

rawCommentData.forEach(row => {
	if (!tableBodyRecSet.has(row.user)) {
		tableBodyRecSet.set(row.user,new Array(columnsHeader.length));
	}
	const dateIndex = columnsIndexByDate[row.date.getTime()];
	var sumOfDay = tableBodyRecSet.get(row.user)[dateIndex];
    sumOfDay = (!sumOfDay ? 0 : sumOfDay) + (row.listItem.spent ? row.listItem.spent : 0);
    tableBodyRecSet.get(row.user)[dateIndex] = parseFloat(sumOfDay.toFixed(1));
})

let tableBodyRecArray = Array.from(tableBodyRecSet.entries()).map(([key, value]) => [key, ...value]);
//let table = 
input.dv.table(["Actor", ...columnsHeader], tableBodyRecArray)

//input.parent.appendChild(table)