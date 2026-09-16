console.log("Загрузка _scripts/task-history.js");

const dataset = require(app.vault.adapter.basePath + "/_scripts/dataset.js");

const getSprintFolder = folderPath => {
    if (!folderPath) {
        return null;
    }
    const [root] = folderPath.split("/");
    return root || null;
};

const ensureArray = (dv, collection) => {
    if (!collection) {
        return [];
    }
    if (Array.isArray(collection)) {
        return collection;
    }
    if (typeof collection.array === "function") {
        return collection.array();
    }
    try {
        return dv.array(collection).array();
    } catch (error) {
        console.warn("task-history: cannot convert collection to array", error);
        return [];
    }
};

const sumSpent = (dv, listItems) => {
    const normalized = ensureArray(dv, listItems);
    let total = 0;
    normalized.forEach(item => {
        const numeric = Number(item?.spent);
        if (Number.isFinite(numeric)) {
            total += numeric;
        }
    });
    return total;
};

const resolveTaskChain = (dv, startPage) => {
    if (!startPage) {
        return [];
    }

    const chain = [];
    const visited = new Set();
    let current = startPage;

    while (current && !visited.has(current.file.path)) {
        chain.push(current);
        visited.add(current.file.path);

        const previousField = current.file.frontmatter?.previous;
        if (!previousField) {
            break;
        }

        let previousPath = null;
        if (typeof previousField === "string") {
            const parsed = dv.parse(previousField);
            previousPath = parsed?.path ?? previousField;
        } else if (previousField?.path) {
            previousPath = previousField.path;
        }

        if (!previousPath) {
            break;
        }

        const previousPage = dv.page(previousPath);
        if (!previousPage) {
            break;
        }

        current = previousPage;
    }

    return chain;
};

const loadSprintTasksIntoMap = (dv, sprintFolder, targetMap) => {
    if (!sprintFolder) {
        return;
    }

    try {
        const records = dataset.getRawSprintTaskData(dv, sprintFolder) || [];
        records.forEach(record => {
            const taskPath = record?.page?.file?.path;
            if (taskPath && !targetMap.has(taskPath)) {
                targetMap.set(taskPath, record);
            }
        });
    } catch (error) {
        console.error(`task-history: failed to load data for ${sprintFolder}`, error);
    }
};

const hydrateRecordsForChain = (dv, chain, recordsMap, loadedFolders) => {
    chain.forEach(taskPage => {
        const folder = getSprintFolder(taskPage.file?.folder);
        if (!folder || loadedFolders.has(folder)) {
            return;
        }
        loadSprintTasksIntoMap(dv, folder, recordsMap);
        loadedFolders.add(folder);
    });

    return { recordsMap, loadedFolders };
};

const getDateFromListItemPath = (path) => {
    if (!path) {
        return null;
    }
    const fileName = path.split("/").pop().replace(/\.md$/, "");
    const parts = fileName.split("-");
    if (parts.length < 3) {
        return null;
    }
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return (date instanceof Date && !isNaN(date)) ? date : null;
};

const sumSpentAfterFirstReview = (dv, listItems) => {
    const normalized = ensureArray(dv, listItems);
    if (normalized.length === 0) {
        return 0;
    }

    let firstReviewDate = null;
    normalized.forEach(item => {
        if (String(item?.action).toLowerCase() === "review") {
            const date = getDateFromListItemPath(item?.path);
            if (date && (firstReviewDate === null || date < firstReviewDate)) {
                firstReviewDate = date;
            }
        }
    });

    if (!firstReviewDate) {
        return 0;
    }

    let total = 0;
    normalized.forEach(item => {
        const date = getDateFromListItemPath(item?.path);
        if (date && date >= firstReviewDate) {
            const numeric = Number(item?.spent);
            if (Number.isFinite(numeric)) {
                total += numeric;
            }
        }
    });
    return total;
};

exports.getSprintFolder = getSprintFolder;
exports.ensureArray = ensureArray;
exports.sumSpent = sumSpent;
exports.sumSpentAfterFirstReview = sumSpentAfterFirstReview;
exports.resolveTaskChain = resolveTaskChain;
exports.loadSprintTasksIntoMap = loadSprintTasksIntoMap;
exports.hydrateRecordsForChain = hydrateRecordsForChain;
