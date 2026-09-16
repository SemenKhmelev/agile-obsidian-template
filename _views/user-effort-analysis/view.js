console.log("\n#################################################\n" +
    "        START USER EFFORT ANALYSIS VIEW BUILD       " +
    "\n#################################################\n");

// Получаем доступ к датасету
const ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");

// Текущая папка отчета и папка спринта
const folderName = input.dv.current().file.folder;
const sprintFolder = `${folderName.slice(0, folderName.lastIndexOf("/"))}`;

// Сырые записи: одна запись = одно внесение времени из daily comment
const raw = ds.getRawSprintCommentData(input.dv, sprintFolder);

// Заголовок отчета
input.dv.header(3, "Часы по затраченным action для каждого разработчика в спринте");

// Собираем уникальные списки пользователей и action
const users = raw.groupBy(r => r.user).map(g => g.key).array().sort();
const actions = raw.groupBy(r => (r.listItem.action ?? "Без action")).map(g => g.key).array().sort();

// Подготавливаем матрицу сумм: user x action -> spent
const sumByUserAction = new Map(); // user -> Map(action -> hours)
users.forEach(u => sumByUserAction.set(u, new Map(actions.map(a => [a, 0]))));

raw.forEach(r => {
    const user = r.user || "(unknown)";
    const action = (r.listItem && (r.listItem.action ?? "Без action")) || "Без action";
    const spent = Number(r.listItem && r.listItem.spent) || 0;
    if (!sumByUserAction.has(user)) {
        sumByUserAction.set(user, new Map(actions.map(a => [a, 0])));
    }
    const row = sumByUserAction.get(user);
    row.set(action, Number((row.get(action) + spent).toFixed(1)));
});

// Убедимся, что все пользователи из карты присутствуют в массиве users (на случай новых пользователей)
const allUsers = Array.from(sumByUserAction.keys()).sort();

// Палитра цветов для action
function createPalette(n) {
    const base = [
        "#0b9fd5", "#f5a623", "#008000", "#ccff00", "#ff5a5f",
        "#9b59b6", "#2ecc71", "#e67e22", "#e74c3c", "#34495e",
        "#1abc9c", "#d35400", "#7f8c8d", "#8e44ad", "#27ae60"
    ];

    if (n <= base.length) return base.slice(0, n);

    // Генерация дополнительных оттенков
    const res = [...base];
    const extra = n - base.length;
    for (let i = 0; i < extra; i++) {
        const hue = Math.round((360 / (extra + 1)) * (i + 1));
        res.push(`hsl(${hue}, 65%, 50%)`);
    }
    return res;
}

const palette = createPalette(actions.length);

// Формируем datasets: один dataset на каждый action; данные по всем пользователям
const datasets = actions.map((action, idx) => ({
    label: action,
    data: allUsers.map(u => (sumByUserAction.get(u)?.get(action)) ?? 0),
    backgroundColor: palette[idx],
    borderColor: palette[idx],
    borderWidth: 1,
}));

// Конфигурация диаграммы: вертикальные столбцы, стакируем по action для каждого пользователя
const chartConfig = {
    type: 'bar',
    data: {
        labels: allUsers,
        datasets: datasets,
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {position: 'top'},
            tooltip: {
                callbacks: {
                    label: function (ctx) {
                        const v = ctx.raw ?? 0;
                        return `${ctx.dataset.label}: ${v} ч`;
                    }
                }
            },
            title: {
                display: false,
                text: 'User Effort Analysis'
            }
        },
        scales: {
            x: {
                stacked: true,
                ticks: {autoSkip: false, maxRotation: 45, minRotation: 0},
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: {display: true, text: 'Часы'}
            }
        }
    }
};

// Контейнер под диаграмму
const container = input.dv.el('div', '');
container.style.width = '100%';
container.style.minHeight = '420px';

// Визуализация через глобальный helper
window.renderChart(chartConfig, container);


// ----------------------------------
// ВТОРОЙ ГРАФИК: по осям X - действия (actions), разбиение по пользователям
// Показываем, сколько каждый пользователь потратил часов на каждый из action
// ----------------------------------

// Заголовок для второго графика
// Отступ перед заголовком, чтобы увеличить расстояние между графиками
const spacerBetweenCharts = input.dv.el('div', '');
spacerBetweenCharts.style.marginTop = '50px';
input.dv.header(3, "Часы по actions с разбивкой по вкладу от каждого разработчика");

// Переработка логики второго графика для точной сортировки внутри КАЖДОГО action
// Идея: создаём отдельный dataset для каждой пары (action × user) с ненулевым значением
// только в одном столбце (своём action), а в остальных индексах - нули.
// Датасеты добавляем по action, причём для каждого action - пользователи отсортированы
// по часам по убыванию. Так Chart.js нарисует стек снизу-вверх: от большего к меньшему.

// 1) Устойчивая палитра по пользователям
const userPalette = createPalette(allUsers.length);
const userColorByName = new Map(allUsers.map((u, i) => [u, userPalette[i]]));

// 2) Генерируем datasets по парам (action×user) в нужном порядке
const pairDatasets = [];
actions.forEach((actionLabel, actionIdx) => {
    // Массив { user, value } для данного action
    const perAction = allUsers.map(u => ({
        user: u,
        value: (sumByUserAction.get(u)?.get(actionLabel)) ?? 0,
    }));

    // Сортировка: по value desc, затем по имени - для стабильности
    perAction.sort((a, b) => b.value - a.value || String(a.user).localeCompare(String(b.user)));

    // Добавляем datasets в порядке сортировки. Можно пропускать нули, чтобы не раздувать легенду/DOM.
    perAction.forEach(({user, value}) => {
        if (!value) return; // пропускаем пустые сегменты
        const data = new Array(actions.length).fill(0);
        data[actionIdx] = value;
        const color = userColorByName.get(user);
        pairDatasets.push({
            label: user,
            data,
            backgroundColor: color,
            borderColor: color,
            borderWidth: 1,
        });
    });
});

// 3) Карта «первого появления» пользователя среди datasets, чтобы легенда показывала по одному пункту на пользователя
const firstDatasetIndexByUser = {};
pairDatasets.forEach((ds, idx) => {
    if (firstDatasetIndexByUser[ds.label] == null) firstDatasetIndexByUser[ds.label] = idx;
});

const chartConfig2 = {
    type: 'bar',
    data: {
        labels: actions,
        datasets: pairDatasets,
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    // показываем в легенде только первое появление пользователя
                    filter: function (legendItem, dataOrChart) {
                        const datasets = (dataOrChart && dataOrChart.data && dataOrChart.data.datasets)
                            ? dataOrChart.data.datasets
                            : (dataOrChart && dataOrChart.datasets) ? dataOrChart.datasets : [];
                        const ds = datasets[legendItem.datasetIndex];
                        const firstIdx = firstDatasetIndexByUser[ds.label];
                        return legendItem.datasetIndex === firstIdx;
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: function (ctx) {
                        const v = ctx.raw ?? 0;
                        return `${ctx.dataset.label}: ${v} ч`;
                    }
                }
            },
            title: {
                display: false,
                text: 'User Effort Analysis - по action'
            }
        },
        scales: {
            x: {
                stacked: true,
                ticks: {autoSkip: false, maxRotation: 45, minRotation: 0},
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: {display: true, text: 'Часы'}
            }
        }
    }
};

// Контейнер под второй график
const container2 = input.dv.el('div', '');
container2.style.width = '100%';
container2.style.minHeight = '420px';
container2.style.marginTop = '28px';

window.renderChart(chartConfig2, container2);
