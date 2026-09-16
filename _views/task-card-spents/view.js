console.log("\n#################################################\n" +
    "        START USER-ACTION GROUP REPORT BUILD        " +
    "\n#################################################\n");

const ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");

// Получаем данные для комментариев из папки спринта
const folderName = input.dv.current().file.folder;
const sprintFolderName = folderName.slice(0, folderName.lastIndexOf("/"));
const rawCommentData = ds.getRawSprintCommentData(input.dv, sprintFolderName);
const rawTaskData = ds.getRawSprintTaskData(input.dv, sprintFolderName);
console.log(rawTaskData);

// Группировка данных по user и action
console.log("Grouping data by user and action...");

// Промежуточный объект для накопления группировок
let groupedData = {};
rawCommentData.forEach(rec => {
    if (rec.listItem.cardref && rec.listItem.cardref.path === input.dv.current().file.path) {
        const user = rec.user || "Unknown";
        const action = rec.listItem.action || "Unspecified";
        const spent = rec.listItem.spent || 0;

        console.log(rec.listItem);

        if (!groupedData[user]) {
            groupedData[user] = {};
        }
        if (!groupedData[user][action]) {
            groupedData[user][action] = 0;
        }
        groupedData[user][action] += spent;
    }
});

// Конвертация группировок в массив для вывода
let groupedArray = [];
Object.keys(groupedData).forEach(user => {
Object.keys(groupedData[user]).forEach(action => {
groupedArray.push([user, action, Number(groupedData[user][action].toFixed(1))]);
});
});

// Сортировка по времени (spent) по убыванию
groupedArray = groupedArray.sort((a, b) => b[2] - a[2]);

// Вывод отчета в виде таблицы
console.log("Rendering table...");
input.dv.header(2, "Группировка времени по исполнителям и типам деятельности");
input.dv.table(
["Исполнитель", "Деятельность", "Потраченное время"],
groupedArray
);
