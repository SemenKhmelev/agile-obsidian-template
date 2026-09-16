console.log("\n#################################################\n" +
    "        START TASK REPORT VIEW BUILD           " +
    "\n#################################################\n");

dv = input.dv;
const ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");
const addSortableTableFunctionality = require(app.vault.adapter.basePath + "/_scripts/addSortableTableFunctionality.js");
const historyPath = app.vault.adapter.basePath + "/_scripts/task-history.js";
delete require.cache[require.resolve(historyPath)];
const history = require(historyPath);

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

const ACTIVITY_BADGES = {
    feat: { label: "feat", modifier: "feat" },
    fix: { label: "fix", modifier: "fix" },
    docs: { label: "docs", modifier: "docs" },
    design: { label: "design", modifier: "design" },
    devops: { label: "devops", modifier: "devops" },
    chore: { label: "chore", modifier: "chore" },
    refactor: { label: "refactor", modifier: "refactor" },
    sd: { label: "sd", modifier: "sd" },
    analysis: { label: "analysis", modifier: "analysis" },
    test: { label: "test", modifier: "test" },
    agile: { label: "agile", modifier: "agile" },
    review: { label: "review", modifier: "review" },
    other: { label: "other", modifier: "other" },
};

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
}[char]));

const renderActivityBadge = rawActivity => {
    const activity = String(rawActivity ?? "").trim().toLowerCase();
    if (!activity) {
        return `<span class="task-activity-badge task-activity-badge--missing" title="Activity не указана"><span class="task-activity-badge__dot" aria-hidden="true"></span><span class="task-activity-badge__label">-</span></span>`;
    }

    const meta = ACTIVITY_BADGES[activity] ?? {
        label: activity,
        modifier: "other",
    };

    return `<span class="task-activity-badge task-activity-badge--${meta.modifier}" title="Activity: ${escapeHtml(activity)}"><span class="task-activity-badge__dot" aria-hidden="true"></span><span class="task-activity-badge__label">${escapeHtml(meta.label)}</span></span>`;
};

const folderName = dv.current().file.folder;
const sprintFolderName = folderName.slice(0, folderName.lastIndexOf("/"));
const tasks = ds.getRawSprintTaskData(dv, sprintFolderName);
console.log(tasks)

const boardCards = dv.page(`${sprintFolderName}/board.md`).file.lists;
// Задачи с доски board-design.md показывает отдельный отчёт task-report-design.
const designBoard = dv.page(`${sprintFolderName}/board-design.md`);
const designCardTexts = designBoard ? dv.array(designBoard.file.lists).map(card => card.text).array() : [];
const isDesignTask = page => designCardTexts.some(text => text.includes(page.file.name));

const taskRows = []
const taskRecords = [];
const stateSumdata = new Map();
const tasksByPath = new Map();
const chainCache = new Map();
const loadedSprintFolders = new Set([sprintFolderName]);

tasks.forEach(rec => {
    const spentSummaryRaw = history.sumSpent(dv, rec.listItems);
    const spentSummary = Number.isFinite(spentSummaryRaw)
        ? parseFloat(spentSummaryRaw.toFixed(1))
        : 0;

    let estimate = rec.page.file.frontmatter.estimate ? rec.page.file.frontmatter.estimate : 0;
    estimate = parseFloat(Number(estimate).toFixed(1));

    let estimate1st = rec.page.file.frontmatter["estimate (1st))"]
        ?? rec.page.file.frontmatter["estimate (1st)"]
        ?? rec.page.file.frontmatter["estimate_1st"];
    estimate1st = estimate1st ? parseFloat(Number(estimate1st).toFixed(1)) : undefined;

    let estimateDisplay = estimate;
    if (estimate1st !== undefined && estimate1st !== estimate) {
        estimateDisplay = `${estimate1st} → ${estimate}`;
    }

    let boardColumnName = '';
    let tagMarkup = '';
    let isUnplanned = false;

    for (const boardCard of boardCards) {
        if (boardCard.text.includes(rec.page.file.name)) {
            boardColumnName = boardCard.header.subpath;

            // Проверка на наличие тега #внепланово в карточке
            if (boardCard.tags?.some(t => t.toLowerCase().replace(/^#/, '') === 'внепланово')) {
                isUnplanned = true;
                console.log("Unplanned task: " + rec.page.file.name);
            }

            if (boardColumnName === "done") {
                tagMarkup = `<font color="green">${boardColumnName}</font>`;
            } else if (boardColumnName === "review") {
                tagMarkup = `<font color="orange">${boardColumnName}</font>`;
            }

            if (stateSumdata.has(boardColumnName)) {
                const currentEstimate = stateSumdata.get(boardColumnName)[0] + estimate;
                const currentSpent = stateSumdata.get(boardColumnName)[1] + spentSummary;

                stateSumdata.set(boardColumnName, [
                    parseFloat(currentEstimate.toFixed(1)),
                    parseFloat(currentSpent.toFixed(1))
                ]);
            } else {
                stateSumdata.set(boardColumnName, [estimate, spentSummary]);
            }

            break;
        }
    }

    let spentSummaryTag;
    if (estimate1st !== undefined) {
        if (spentSummary > estimate) {
            spentSummaryTag = `<span style="color: red; font-weight: bold;">${spentSummary}</span>`;
        } else if (spentSummary > estimate1st) {
            spentSummaryTag = `<font color="red">${spentSummary}</font>`;
        } else {
            spentSummaryTag = spentSummary;
        }
    } else {
        spentSummaryTag = spentSummary > estimate
            ? `<font color="red">${spentSummary}</font>`
            : spentSummary;
    }

    // Отображение ссылки с пометкой, если задача внеплановая
    let taskLinkDisplay = `<b>${rec.page.file.link}</b>`;
    if (isUnplanned) {
        taskLinkDisplay = `<b>${rec.page.file.link}</b> <span style="color: #fd940a;" title="#внепланово">⚠️</span>`;
    }

    taskRows.push({
        task: taskLinkDisplay,
        activity: renderActivityBadge(rec.page.file.frontmatter.activity),
        estimate: estimateDisplay,
        spent: spentSummaryTag,
        user: renderUserCell(rec.page.file.frontmatter.user),
        state: tagMarkup,
        isPredefined: rec.page.file.path.contains("predefined"),
        isDesign: isDesignTask(rec.page),
        spentSort: spentSummary,
        totalSpentReview: 0,
    });
    taskRecords.push(rec);

    const taskPath = rec.page.file?.path;
    if (taskPath && !tasksByPath.has(taskPath)) {
        tasksByPath.set(taskPath, rec);
    }
});

const getChain = page => {
    const cacheKey = page.file.path;
    if (chainCache.has(cacheKey)) {
        return chainCache.get(cacheKey);
    }
    const chain = history.resolveTaskChain(dv, page);
    chainCache.set(cacheKey, chain);
    return chain;
};

taskRecords.forEach((rec, index) => {
    const chain = getChain(rec.page);
    history.hydrateRecordsForChain(dv, chain, tasksByPath, loadedSprintFolders);

    let spentFull = 0;
    let spentReviewFull = 0;
    chain.forEach(chainPage => {
        const entry = tasksByPath.get(chainPage.file.path);
        if (!entry) {
            return;
        }
        spentFull += history.sumSpent(dv, entry.listItems);
        spentReviewFull += history.sumSpentAfterFirstReview(dv, entry.listItems);
    });

    const spentFullRounded = Number.isFinite(spentFull)
        ? parseFloat(spentFull.toFixed(1))
        : 0;
    const spentReviewRounded = Number.isFinite(spentReviewFull)
        ? parseFloat(spentReviewFull.toFixed(1))
        : 0;

    taskRows[index].totalSpentReview = spentReviewRounded > 0
        ? `${spentFullRounded} / <span style="color: #f39c12">${spentReviewRounded}</span>`
        : spentFullRounded;
});

dv.header(2, "Сопутствующие задачи");
dv.table(["Задача", "Estimate", "Spent"],
    dv.array(
        taskRows
            .filter(row => row.isPredefined)
            .filter(row => !row.isDesign)
    ).sort(row => parseFloat(row.spentSort), "desc").map(row => [row.task, row.estimate, row.spent])
);

dv.header(2, "Задачи спринта");
dv.table(["Задача", "Activity", "Estimate", "Spent", "TotalSpent / Review", "Исполнители", "State"],
    dv.array(
        taskRows
            .filter(row => !row.isPredefined)
            .filter(row => !row.isDesign)
    ).sort(row => parseFloat(row.spentSort), "desc").map(row => [
        row.task,
        row.activity,
        row.estimate,
        row.spent,
        row.totalSpentReview,
        row.user,
        row.state,
    ])
);

dv.header(2, "Суммарно по состояниям задач");
dv.table(["State", "Estimate summary", "Spent summary"],
    Array.from(stateSumdata, ([name, value]) => ([
        name,
        parseFloat(value[0].toFixed(1)),
        parseFloat(value[1].toFixed(1))
    ])));

// Вызываем установку функционала для сортировки таблиц
addSortableTableFunctionality();

// Панель фильтра по разработчику справа от таблицы «Задачи спринта»
const taskReportFilterBar = require(app.vault.adapter.basePath + "/_scripts/taskReportFilterBar.js");
taskReportFilterBar();
