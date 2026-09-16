console.log("\n#################################################\n" +
    "        START SPRINT COMPARISON REPORT VIEW BUILD           " +
    "\n#################################################\n");

dv = input.dv;
const ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");
const addSortableTableFunctionality = require(app.vault.adapter.basePath + "/_scripts/addSortableTableFunctionality.js");

// Получаем текущую папку спринта
const folderName = dv.current().file.folder;
const currentSprintFolder = folderName.slice(0, folderName.lastIndexOf("/"));

// Извлекаем номер спринта из имени папки (предполагаемый формат: "sprintXXX")
const currentSprintMatch = currentSprintFolder.match(/sprint(\d+)/);
if (!currentSprintMatch) {
    dv.header(2, "Error: Could not determine current sprint number");
    return;
}

const currentSprintNumber = parseInt(currentSprintMatch[1]);
const previousSprint1Number = currentSprintNumber - 1;
const previousSprint2Number = currentSprintNumber - 2;

// Формируем пути к папкам спринтов
const previousSprint1Folder = currentSprintFolder.replace(`sprint${currentSprintNumber}`, `sprint${previousSprint1Number}`);
const previousSprint2Folder = currentSprintFolder.replace(`sprint${currentSprintNumber}`, `sprint${previousSprint2Number}`);

// console.log("Current sprint folder: " + currentSprintFolder);
// console.log("Previous sprint 1 folder: " + previousSprint1Folder);
// console.log("Previous sprint 2 folder: " + previousSprint2Folder);

/**
 * Получаем данные по предопределённым задачам для указанной папки спринта.
 * Отбираем заметки, путь которых содержит "predefined", и суммируем затраченное время по элементам списка.
 * @param {string} sprintFolder - Путь к папке спринта (например, ".../sprint2").
 * @returns {{taskName: string, spent: number, estimate: number}[]} Массив объектов с названием задачи, суммарным временем и оценкой.
 */
function getPredefinedTasksData(sprintFolder) {
    try {
        const tasks = ds.getRawSprintTaskData(dv, sprintFolder);

        // Отбираем предопределённые задачи (та же логика, что и в task-report/view.js)
        const predefinedTasks = tasks.filter(rec => rec.page.file.path.contains("predefined"));

        /**
         * Нормализуем названия задач, чтобы объединять одинаковые задачи с разным написанием
         */
        const normalizeTaskName = (name) => {
            if (!name) return name;

            const trimmedName = String(name).trim();

            // Объединяем варианты написания "Сопутствующая деятельность"
            if (trimmedName === "Сопуствующая деятельность" || trimmedName === "Сопутствующая деятельность") {
                return "Сопутствующая деятельность";
            }

            return trimmedName;
        };


        /**
         * Подсчитываем затраченное время и получаем оценку по задачам
         */
        const tasksData = predefinedTasks.map(rec => {
            let spentSummary = 0;
            try {
                spentSummary = parseFloat(Array.from(rec.listItems).reduce((acc, item) => acc + item.spent, 0).toFixed(1));
            } catch (error) {
                console.error("ERROR: " + error);
            }

            // Получаем оценку из frontmatter задачи (аналогично task-report/view.js)
            let estimate = rec.page.file.frontmatter.estimate ? rec.page.file.frontmatter.estimate : 0;
            estimate = parseFloat(Number(estimate).toFixed(1));

            return {
                taskName: normalizeTaskName(rec.page.file.name),
                spent: spentSummary,
                estimate: estimate
            };
        });

        return tasksData;
    } catch (error) {
        console.error("Error getting data for sprint " + sprintFolder + ": " + error);
        return [];
    }
}

// Получаем данные для всех трёх спринтов
const currentSprintData = getPredefinedTasksData(currentSprintFolder);
const previousSprint1Data = getPredefinedTasksData(previousSprint1Folder);
const previousSprint2Data = getPredefinedTasksData(previousSprint2Folder);

// Объединяем данные из всех спринтов
const allTasks = new Set();
[...currentSprintData, ...previousSprint1Data, ...previousSprint2Data].forEach(task => {
    allTasks.add(task.taskName);
});

// Формируем данные для сравнения
const comparisonData = Array.from(allTasks).map(taskName => {
    const currentTask = currentSprintData.find(t => t.taskName === taskName);
    const previousTask1 = previousSprint1Data.find(t => t.taskName === taskName);
    const previousTask2 = previousSprint2Data.find(t => t.taskName === taskName);

    return {
        taskName: taskName,
        currentSprintSpent: currentTask ? currentTask.spent : 0,
        previousSprint1Spent: previousTask1 ? previousTask1.spent : 0,
        previousSprint2Spent: previousTask2 ? previousTask2.spent : 0,
        currentSprintEstimate: currentTask ? currentTask.estimate : 0,
        previousSprint1Estimate: previousTask1 ? previousTask1.estimate : 0,
        previousSprint2Estimate: previousTask2 ? previousTask2.estimate : 0
    };
});

// Сортируем по времени текущего спринта (по убыванию)
comparisonData.sort((a, b) => b.currentSprintSpent - a.currentSprintSpent);

// Формируем отчёт

// Создаем таблицу с данными для сравнения
const tableHeaders = [
    "Задача",
    `Sprint ${previousSprint2Number} (E/S)`,
    `Sprint ${previousSprint1Number} (E/S)`,
    `Sprint ${currentSprintNumber} (E/S)`
];

// Функция для форматирования ячейки с Estimate и Spent
function formatEstimateSpentCell(estimate, spent) {
    // Если нет оценки или затраченного времени, возвращаем пустую строку
    if (estimate === 0 && spent === 0) {
        return "";
    }

    // Форматируем значение Spent красным цветом, если оно превышает Estimate или если Estimate=0 и Spent>0
    const spentDisplay = (spent > estimate && estimate > 0) || (estimate === 0 && spent > 0)
        ? `<font color="red">${spent}</font>`
        : spent;

    return `${estimate} / ${spentDisplay}`;
}

const tableRows = comparisonData.map(data => [
    `<b>${data.taskName}</b>`, // Делаем имя задачи жирным
    formatEstimateSpentCell(data.previousSprint2Estimate, data.previousSprint2Spent),
    formatEstimateSpentCell(data.previousSprint1Estimate, data.previousSprint1Spent),
    formatEstimateSpentCell(data.currentSprintEstimate, data.currentSprintSpent)
]);

dv.table(tableHeaders, tableRows);

// Создаем визуальную столбчатую диаграмму
dv.header(2, "Столбчатая диаграмма");

/**
 * Функция для получения цвета в зависимости от коэффициента превышения.
 * Возвращает цвет от светло-красного до темно-красного.
 * @param {number} ratio - Коэффициент превышения (spent/estimate).
 * @returns {string} Цвет в формате HEX.
 */
function getOverspendColor(ratio) {
    // Ограничиваем ratio в диапазоне от 1 до 3
    // 1 = минимальное превышение (светло-красный)
    // 3 = максимальное превышение (темно-красный)
    const limitedRatio = Math.max(1, Math.min(ratio, 3));

    // Нормализуем ratio к диапазону 0-1 для расчета цвета
    const normalizedRatio = (limitedRatio - 1) / 2;

    // Базовый красный цвет: #e74c3c (231, 76, 60)
    // Темно-красный цвет: #7b0000 (123, 0, 0)

    // Интерполируем между базовым и темным красным
    const r = Math.round(231 - normalizedRatio * (231 - 123));
    const g = Math.round(76 - normalizedRatio * 76);
    const b = Math.round(60 - normalizedRatio * 60);

    // Преобразуем RGB в HEX
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Создаем HTML-разметку для одной полосы (bar) диаграммы.
 * @param {number} spent - Значение затраченного времени для отрисовки.
 * @param {number} estimate - Значение оценки для сравнения.
 * @param {number} maxValue - Максимальное значение среди всех задач для нормализации ширины.
 * @param {number} sprintNumber - Номер спринта (для выбора цвета).
 * @returns {string} HTML-разметка блока полосы диаграммы.
 */
function createBar(spent, estimate, maxValue, sprintNumber) {
    const estimatePct = maxValue > 0 ? (estimate / maxValue) * 100 : 0;
    const spentWithin = Math.min(spent, estimate);
    const overspend = Math.max(spent - estimate, 0);
    const spentWithinPct = maxValue > 0 ? (spentWithin / maxValue) * 100 : 0;
    const overspendPct = maxValue > 0 ? (overspend / maxValue) * 100 : 0;

    // Цвет для превышения — динамический по степени перерасхода
    let overspendColor = "#e74c3c";
    if (overspend > 0) {
        const ratio = estimate > 0 ? (spent / estimate) : Math.min(spent / 5, 3);
        overspendColor = getOverspendColor(ratio);
    }

    // Подпись: Estimate / Spent (+проценты при наличии оценки)
    const labelText = estimate > 0
        ? `${estimate} / ${spent} (${Math.round((spent / (estimate || 1)) * 100)}%)`
        : `0 / ${spent}`;

    const title = estimate > 0
        ? `План: ${estimate}ч • Факт: ${spent}ч (${Math.round((spent / (estimate || 1)) * 100)}%)`
        : `План: 0ч • Факт: ${spent}ч`;

    return `
      <div class="bar-container">
        <div class="bar-track" title="${title}" aria-label="${title}">
          <div class="bar-estimate" style="width: ${estimatePct.toFixed(2)}%;"></div>
          <div class="bar-spent-ok" style="width: ${spentWithinPct.toFixed(2)}%;"></div>
          ${overspend > 0 ? `<div class="bar-overspend" style="left: ${estimatePct.toFixed(2)}%; width: ${overspendPct.toFixed(2)}%; background-color: ${overspendColor};"></div>` : ""}
        </div>
        <div class="bar-label" style="white-space: nowrap">${labelText}</div>
      </div>`;
}

// Находим максимальное значение среди оценок и затраченного времени для корректного масштабирования шкалы
const maxValue = Math.max(
    0,
    ...comparisonData.flatMap(data => [
        data.currentSprintSpent,
        data.previousSprint1Spent,
        data.previousSprint2Spent,
        data.currentSprintEstimate,
        data.previousSprint1Estimate,
        data.previousSprint2Estimate
    ])
);

// Создаем HTML диаграммы
let chartHtml = `
<div class="chart-container">
    <div class="legend">
        <div class="legend-item">
            <div class="legend-color" style="background-color: #cfe4ff; border: 1px solid #9bbbe0;"></div>
            <span>План (Estimate)</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: #4CAF50;"></div>
            <span>Факт в пределах плана</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: #e74c3c;"></div>
            <span>Превышение плана</span>
        </div>
    </div>
    <div class="legend-note">
        <p>Значения отображаются в формате "Estimate / Spent". Линии сетки внутри трека помогают оценить относительную шкалу. Интенсивность красного цвета показывает степень превышения: чем темнее цвет, тем больше перерасход. Для задач без оценки (Estimate = 0) интенсивность зависит от затраченного времени.</p>
    </div>
`;

// Добавляем полосы диаграммы для каждой задачи
comparisonData.forEach(data => {
    chartHtml += `
    <div class="task-row">
        <div class="task-name">${data.taskName}</div>
        <div class="sprint-bars">
            <div class="sprint-bar">
                <div class="sprint-label">Sprint ${previousSprint2Number}</div>
                ${createBar(data.previousSprint2Spent, data.previousSprint2Estimate, maxValue, previousSprint2Number)}
            </div>
            <div class="sprint-bar">
                <div class="sprint-label">Sprint ${previousSprint1Number}</div>
                ${createBar(data.previousSprint1Spent, data.previousSprint1Estimate, maxValue, previousSprint1Number)}
            </div>
            <div class="sprint-bar">
                <div class="sprint-label">Sprint ${currentSprintNumber}</div>
                ${createBar(data.currentSprintSpent, data.currentSprintEstimate, maxValue, currentSprintNumber)}
            </div>
        </div>
    </div>
    `;
});

chartHtml += `</div>`;

// Отрисовываем диаграмму
const chartElement = dv.el("div", "");
chartElement.innerHTML = chartHtml;

// Функция для генерации аналитических выводов на основе сравнения данных по спринтам
function generateSprintConclusions() {
    // Рассчитываем общее затраченное время по каждому спринту
    const totalCurrentSpent = comparisonData.reduce((sum, data) => sum + data.currentSprintSpent, 0);
    const totalPrevious1Spent = comparisonData.reduce((sum, data) => sum + data.previousSprint1Spent, 0);
    const totalPrevious2Spent = comparisonData.reduce((sum, data) => sum + data.previousSprint2Spent, 0);

    // Рассчитываем общую оценку по каждому спринту
    const totalCurrentEstimate = comparisonData.reduce((sum, data) => sum + data.currentSprintEstimate, 0);
    const totalPrevious1Estimate = comparisonData.reduce((sum, data) => sum + data.previousSprint1Estimate, 0);
    const totalPrevious2Estimate = comparisonData.reduce((sum, data) => sum + data.previousSprint2Estimate, 0);

    // Определяем задачи с наибольшим затраченным временем в текущем спринте
    const topCurrentTasks = [...comparisonData]
        .sort((a, b) => b.currentSprintSpent - a.currentSprintSpent)
        .slice(0, 3)
        .filter(data => data.currentSprintSpent > 0);

    // Определяем задачи с наибольшим ростом затраченного времени по сравнению с предыдущим спринтом
    const tasksWithIncrease = comparisonData
        .map(data => ({
            taskName: data.taskName,
            increase: data.currentSprintSpent - data.previousSprint1Spent,
            percentIncrease: data.previousSprint1Spent > 0
                ? ((data.currentSprintSpent - data.previousSprint1Spent) / data.previousSprint1Spent) * 100
                : data.currentSprintSpent > 0 ? 100 : 0
        }))
        .filter(task => task.increase > 0)
        .sort((a, b) => b.increase - a.increase)
        .slice(0, 3);

    // Определяем задачи с наибольшим снижением затраченного времени по сравнению с предыдущим спринтом
    const tasksWithDecrease = comparisonData
        .map(data => ({
            taskName: data.taskName,
            decrease: data.previousSprint1Spent - data.currentSprintSpent,
            percentDecrease: data.previousSprint1Spent > 0
                ? ((data.previousSprint1Spent - data.currentSprintSpent) / data.previousSprint1Spent) * 100
                : 0
        }))
        .filter(task => task.decrease > 0 && task.percentDecrease > 10) // Только значительные снижения
        .sort((a, b) => b.decrease - a.decrease)
        .slice(0, 3);

    // Определяем задачи с постоянным превышением оценки
    const consistentlyOverspentTasks = comparisonData
        .filter(data =>
            (data.currentSprintSpent > data.currentSprintEstimate && data.currentSprintEstimate > 0) &&
            (data.previousSprint1Spent > data.previousSprint1Estimate && data.previousSprint1Estimate > 0) &&
            data.currentSprintSpent > 0 && data.previousSprint1Spent > 0
        )
        .slice(0, 3);

    // Анализируем тренд общего затраченного времени
    let spentTrendText = "";
    if (totalCurrentSpent > totalPrevious1Spent && totalPrevious1Spent > totalPrevious2Spent) {
        spentTrendText = `<span class="trend-up">&#8593;</span> Наблюдается постоянный рост общего затраченного времени на сопутствующие задачи за последние три спринта.`;
    } else if (totalCurrentSpent < totalPrevious1Spent && totalPrevious1Spent < totalPrevious2Spent) {
        spentTrendText = `<span class="trend-down">&#8595;</span> Наблюдается постоянное снижение общего затраченного времени на сопутствующие задачи за последние три спринта.`;
    } else if (totalCurrentSpent > totalPrevious1Spent) {
        const increasePercent = ((totalCurrentSpent - totalPrevious1Spent) / totalPrevious1Spent * 100).toFixed(1);
        spentTrendText = `<span class="trend-up">&#8593;</span> Общее затраченное время на сопутствующие задачи выросло на ${increasePercent}% по сравнению с предыдущим спринтом.`;
    } else if (totalCurrentSpent < totalPrevious1Spent) {
        const decreasePercent = ((totalPrevious1Spent - totalCurrentSpent) / totalPrevious1Spent * 100).toFixed(1);
        spentTrendText = `<span class="trend-down">&#8595;</span> Общее затраченное время на сопутствующие задачи снизилось на ${decreasePercent}% по сравнению с предыдущим спринтом.`;
    } else {
        spentTrendText = "Общее затраченное время на сопутствующие задачи осталось примерно на том же уровне, что и в предыдущем спринте.";
    }

    // Анализируем точность оценки
    let estimationAccuracyText = "";
    const currentOverspendRatio = totalCurrentEstimate > 0 ? totalCurrentSpent / totalCurrentEstimate : 0;
    const previous1OverspendRatio = totalPrevious1Estimate > 0 ? totalPrevious1Spent / totalPrevious1Estimate : 0;

    if (currentOverspendRatio > 1.2 && previous1OverspendRatio > 1.2) {
        estimationAccuracyText = `<span class="warning">⚠️</span> Наблюдается систематическое превышение оценок. В текущем спринте затрачено ${(currentOverspendRatio * 100).toFixed(0)}% от оценки.`;
    } else if (currentOverspendRatio < 0.8 && previous1OverspendRatio < 0.8) {
        estimationAccuracyText = `<span class="info">ℹ️</span> Оценки систематически завышены. В текущем спринте затрачено только ${(currentOverspendRatio * 100).toFixed(0)}% от оценки.`;
    } else if (currentOverspendRatio > 1.2) {
        estimationAccuracyText = `<span class="warning">⚠️</span> В текущем спринте затрачено ${(currentOverspendRatio * 100).toFixed(0)}% от оценки, что указывает на недооценку сложности задач.`;
    } else if (currentOverspendRatio < 0.8) {
        estimationAccuracyText = `<span class="info">ℹ️</span> В текущем спринте затрачено только ${(currentOverspendRatio * 100).toFixed(0)}% от оценки, что может указывать на завышенные оценки.`;
    } else {
        estimationAccuracyText = `<span class="success">✓</span> Точность оценки в текущем спринте достаточно высокая (${(currentOverspendRatio * 100).toFixed(0)}% от оценки).`;
    }

    // Формируем HTML с выводами
    let conclusionsHtml = `
    <div class="conclusions-container">
        <h3>Выводы по спринту ${currentSprintNumber}</h3>
        
        <div class="conclusion-section">
            <h4>Общие тенденции</h4>
            <p>${spentTrendText}</p>
            <p>${estimationAccuracyText}</p>
        </div>`;

    // Добавляем раздел с топовыми задачами, если они есть
    if (topCurrentTasks.length > 0) {
        conclusionsHtml += `
        <div class="conclusion-section">
            <h4>Наиболее затратные задачи в текущем спринте</h4>
            <ul>`;

        topCurrentTasks.forEach(task => {
            const estimateText = task.currentSprintEstimate > 0
                ? `(оценка: ${task.currentSprintEstimate})`
                : "(без оценки)";

            conclusionsHtml += `
                <li><b>${task.taskName}</b>: ${task.currentSprintSpent} часов ${estimateText}</li>`;
        });

        conclusionsHtml += `
            </ul>
        </div>`;
    }

    // Добавляем раздел с задачами, на которые стали тратить больше времени
    if (tasksWithIncrease.length > 0) {
        conclusionsHtml += `
        <div class="conclusion-section">
            <h4>Задачи с наибольшим ростом затраченного времени</h4>
            <ul>`;

        tasksWithIncrease.forEach(task => {
            conclusionsHtml += `
                <li><b>${task.taskName}</b>: +${task.increase.toFixed(1)} часов (${task.percentIncrease.toFixed(0)}%)</li>`;
        });

        conclusionsHtml += `
            </ul>
        </div>`;
    }

    // Добавляем раздел с задачами, на которые стали тратить меньше времени
    if (tasksWithDecrease.length > 0) {
        conclusionsHtml += `
        <div class="conclusion-section">
            <h4>Задачи с наибольшим снижением затраченного времени</></h4>
            <ul>`;

        tasksWithDecrease.forEach(task => {
            conclusionsHtml += `
                <li><b>${task.taskName}</b>: &ndash;${task.decrease.toFixed(1)} часов (${task.percentDecrease.toFixed(0)}%)</li>`;
        });

        conclusionsHtml += `
            </ul>
        </div>`;
    }

    // Добавляем раздел с задачами, которые постоянно превышают оценку
    if (consistentlyOverspentTasks.length > 0) {
        conclusionsHtml += `
        <div class="conclusion-section">
            <h4>Задачи с систематическим превышением оценки</h4>
            <ul>`;

        consistentlyOverspentTasks.forEach(task => {
            const currentRatio = (task.currentSprintSpent / task.currentSprintEstimate).toFixed(1);
            const prevRatio = (task.previousSprint1Spent / task.previousSprint1Estimate).toFixed(1);

            conclusionsHtml += `
                <li><b>${task.taskName}</b>: превышение в ${currentRatio}x раз в текущем спринте и в ${prevRatio}x раз в предыдущем</li>`;
        });

        conclusionsHtml += `
            </ul>
        </div>`;
    }

    conclusionsHtml += `
    </div>`;

    return conclusionsHtml;
}

// Добавляем секцию с выводами после столбчатой диаграммы
dv.header(2, "Аналитические выводы");
const conclusionsElement = dv.el("div", "");
conclusionsElement.innerHTML = generateSprintConclusions();

// Подключаем функциональность сортируемой таблицы
addSortableTableFunctionality();
