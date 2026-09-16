console.log("\n#################################################\n" +
    "        START USER SPENT REPORT VIEW BUILD           " +
    "\n#################################################\n");

var ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");

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

console.log(input)
console.log(ds)
const folderName = input.dv.current().file.folder
const rawCommentData = ds.getRawSprintCommentData(input.dv, `${folderName.slice(0, folderName.lastIndexOf("/"))}`);

//-------------------------------------------------------------------
input.dv.header(2, "Группировка времени(spent) по исполнителям")
let userRecs = rawCommentData.groupBy(rec => rec.user)
const userSpentSummaries = userRecs.map(userRecs => {
    let spentSummary = Array.from(userRecs.rows)
    .reduce((acc, row) => acc + Number(row.listItem.spent || 0), 0);
    return [renderUserCell(userRecs.key), spentSummary.toFixed(1)]
});

input.dv.table(["Actor", "Spent summary"], userSpentSummaries)

//-------------------------------------------------------------------
input.dv.header(2, "Внесенное время по дням")

const userSpentByDay = userRecs.map(userRecs => {
    let spentSummary = Array.from(userRecs.rows).reduce((acc, row) => acc + row.listItem.spent, 0)
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
        tableBodyRecSet.set(row.user, new Array(columnsHeader.length));
    }
    const dateIndex = columnsIndexByDate[row.date.getTime()];
    let sumOfDay = tableBodyRecSet.get(row.user)[dateIndex] || 0;
    const spent = Number(row.listItem.spent) || 0;
    sumOfDay += spent;
    tableBodyRecSet.get(row.user)[dateIndex] = Number(sumOfDay.toFixed(1));
});

const MIN_SPEND_TIME_PER_DAY = 8;
const VACATION_EMOJI = "🏝️️"; // Эмоджи для отпуска/отсутствия

let tableBodyRecArray = Array.from(tableBodyRecSet.entries()).map(([key, value]) => {
    const row = [renderUserCell(key)];
    for (let i = 0; i < value.length; i++) {
        const spent = value[i];
        const day = columnsHeader[i];
        const isWeekend = day.trim().endsWith("Сб") || day.trim().endsWith("Вс");

        if (spent == null) {
            // Для выходных дней оставляем пустую строку, для рабочих дней - эмоджи
            row.push(isWeekend ? "" : VACATION_EMOJI);
        } else if (!isWeekend) {
            const diff = (spent - MIN_SPEND_TIME_PER_DAY).toFixed(1);
            if (diff == 0 || diff == "0.0") {
                row.push(spent);
            } else {
                const sign = diff > 0 ? "+" : "";
                const color = diff > 0 ? "green" : "red";
                row.push(`<span style="white-space: nowrap">${spent} <sup style="font-size: 10px; color: ${color};">(${sign}${diff})</sup></span>`);
            }
        } else {
            row.push(spent);
        }
    }
    return row;
});

input.dv.table(["Actor", ...columnsHeader], tableBodyRecArray)

// input.parent.appendChild(table)