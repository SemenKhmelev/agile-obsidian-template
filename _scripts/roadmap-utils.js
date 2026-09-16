console.log("Загрузка _scripts/roadmap-utils.js");

const taskHistory = require(app.vault.adapter.basePath + "/_scripts/task-history.js");

const isString = value => typeof value === "string";

const normalizeNumber = value => {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
        const normalized = value.replace(",", ".").trim();
        if (normalized === "") {
            return null;
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const toIterable = value => {
    if (value === null || value === undefined) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    return [value];
};

const parseLinkPaths = (dv, raw, resolvePath) => {
    const result = [];
    for (const item of toIterable(raw)) {
        if (!item) {
            continue;
        }
        if (typeof item === "object" && item.path) {
            result.push(resolvePath ? resolvePath(item.path) : item.path);
            continue;
        }
        if (typeof item === "object" && item.link?.path) {
            result.push(resolvePath ? resolvePath(item.link.path) : item.link.path);
            continue;
        }
        if (isString(item)) {
            const trimmed = item.trim();
            if (!trimmed) {
                continue;
            }
            if (trimmed.startsWith("[[")) {
                const parsed = dv.parse(trimmed);
                if (parsed?.path) {
                    result.push(resolvePath ? resolvePath(parsed.path) : parsed.path);
                } else {
                    const fallback = trimmed.replace(/\[\[|\]\]/g, "").trim();
                    result.push(resolvePath ? resolvePath(fallback) : fallback);
                }
                continue;
            }
            result.push(resolvePath ? resolvePath(trimmed) : trimmed);
        }
    }
    return Array.from(new Set(result.filter(Boolean)));
};

const classifyIteration = page => {
    const tags = (page?.tags || []).map(t => String(t).toLowerCase());
    if (tags.includes("vision")) {
        return "vision";
    }
    if (tags.includes("theme")) {
        return "theme";
    }
    if (tags.includes("epic")) {
        return "epic";
    }
    return "other";
};

const buildRoadmapContext = dv => {
    const iterationPages = dv.pages("\"Roadmap\"")
        .where(p => ["vision", "theme", "epic"].some(tag => (p?.tags || []).map(t => String(t).toLowerCase()).includes(tag)))
        .array();

    const iterations = new Map();
    const children = new Map();

    const iterationLookup = new Map();
    const iterationLookupLower = new Map();
    const iterationPaths = new Set();

    iterationPages.forEach(page => {
        const type = classifyIteration(page);
        const path = page.file?.path;
        if (!path) {
            return;
        }
        const name = page.file?.name;
        if (name) {
            iterationLookup.set(name, path);
            iterationLookupLower.set(name.toLowerCase(), path);
        }
        // parent можно указать ключом итерации (RM-3.3), а не только ссылкой на заметку.
        const key = page.file?.frontmatter?.key;
        if (key !== null && key !== undefined && String(key).trim()) {
            const keyText = String(key).trim();
            if (!iterationLookup.has(keyText)) {
                iterationLookup.set(keyText, path);
            }
            if (!iterationLookupLower.has(keyText.toLowerCase())) {
                iterationLookupLower.set(keyText.toLowerCase(), path);
            }
        }
        const addIterationPathVariant = value => {
            if (!value) {
                return;
            }
            iterationPaths.add(value);
            const cleaned = value.replace(/\.md$/i, "");
            iterationPaths.add(cleaned);
        };

        addIterationPathVariant(path);
        if (name) {
            addIterationPathVariant(name);
        }
    });

    const resolvePath = value => {
        if (!value) {
            return null;
        }
        if (typeof value !== "string") {
            return value;
        }

        const directPage = dv.page(value);
        if (directPage?.file?.path) {
            return directPage.file.path;
        }

        if (iterationLookup.has(value)) {
            return iterationLookup.get(value);
        }

        const trimmed = value.replace(/^\/*/, "");
        if (iterationLookup.has(trimmed)) {
            return iterationLookup.get(trimmed);
        }

        const lower = value.toLowerCase();
        if (iterationLookupLower.has(lower)) {
            return iterationLookupLower.get(lower);
        }

        const trimmedLower = trimmed.toLowerCase();
        if (iterationLookupLower.has(trimmedLower)) {
            return iterationLookupLower.get(trimmedLower);
        }

        const quoted = value.replace(/\[\[|\]\]/g, "").trim();
        if (iterationLookup.has(quoted)) {
            return iterationLookup.get(quoted);
        }
        const quotedLower = quoted.toLowerCase();
        if (iterationLookupLower.has(quotedLower)) {
            return iterationLookupLower.get(quotedLower);
        }

        return value;
    };

    iterationPages.forEach(page => {
        const type = classifyIteration(page);
        const path = page.file?.path;
        if (!path) {
            return;
        }
        const parents = parseLinkPaths(dv, page.parent, resolvePath);
        iterations.set(path, { page, type, parents });
        parents.forEach(parentPath => {
            if (!parentPath) {
                return;
            }
            if (!children.has(parentPath)) {
                children.set(parentPath, new Set());
            }
            children.get(parentPath).add(path);
        });
    });

    const ancestorCache = new Map();
    const getAncestors = path => {
        if (!path) {
            return new Set();
        }
        if (ancestorCache.has(path)) {
            return ancestorCache.get(path);
        }
        const visited = new Set();
        const stack = [...(iterations.get(path)?.parents || [])];
        while (stack.length) {
            const current = stack.pop();
            if (!current || visited.has(current)) {
                continue;
            }
            visited.add(current);
            const entry = iterations.get(current);
            if (entry?.parents?.length) {
                entry.parents.forEach(parent => {
                    if (!visited.has(parent)) {
                        stack.push(parent);
                    }
                });
            }
        }
        ancestorCache.set(path, visited);
        return visited;
    };

    const taskPages = dv.pages()
        .where(page => {
            const path = page?.file?.path || "";
            const folder = page?.file?.folder || "";
            if (!path.endsWith(".md")) {
                return false;
            }
            if (iterationPaths.has(path)) {
                return false;
            }
            const isSprintTask = folder.includes("/tasks") && !folder.includes("/tasks/_predefined");
            const isRoadmapTask = path.startsWith("Roadmap/");
            return isSprintTask || isRoadmapTask;
        })
        .array();

    const previousPaths = new Set();
    taskPages.forEach(page => {
        const previousList = parseLinkPaths(dv, page.file?.frontmatter?.previous, resolvePath);
        previousList.forEach(p => previousPaths.add(p));
    });

    const latestTaskPages = taskPages.filter(page => !previousPaths.has(page.file?.path));

    const recordsByPath = new Map();
    const loadedSprints = new Set();
    const directTasksByIteration = new Map();

    const ensureRecordLoaded = page => {
        if (!page?.file?.folder) {
            return;
        }
        const sprintFolder = taskHistory.getSprintFolder(page.file.folder);
        if (!sprintFolder || loadedSprints.has(sprintFolder)) {
            return;
        }
        taskHistory.loadSprintTasksIntoMap(dv, sprintFolder, recordsByPath);
        loadedSprints.add(sprintFolder);
    };

    const tasksByIteration = new Map();
    const tasksIndex = new Map();

    latestTaskPages.forEach(page => {
        if (!page?.file?.path) {
            return;
        }
        const chain = taskHistory.resolveTaskChain(dv, page) || [];
        if (!chain.length) {
            chain.push(page);
        }
        chain.forEach(chainPage => ensureRecordLoaded(chainPage));

        const chainId = chain[chain.length - 1]?.file?.path || page.file.path;

        const parentPathSet = new Set();
        chain.forEach(chainPage => {
            parseLinkPaths(dv, chainPage.file?.frontmatter?.parent, resolvePath).forEach(path => parentPathSet.add(path));
            parseLinkPaths(dv, chainPage.file?.frontmatter?.parents, resolvePath).forEach(path => parentPathSet.add(path));
        });
        const uniqueParents = Array.from(parentPathSet).filter(Boolean);

        const spentFull = chain.reduce((total, chainPage) => {
            const record = recordsByPath.get(chainPage.file?.path);
            return total + (record ? taskHistory.sumSpent(dv, record.listItems) : 0);
        }, 0);

        const currentRecord = recordsByPath.get(page.file.path);
        const spentSprint = taskHistory.sumSpent(dv, currentRecord?.listItems);

        const estimate = normalizeNumber(page.file?.frontmatter?.estimate);

        const taskInfo = {
            chainId,
            page,
            link: page.file.link,
            name: page.file.name,
            parentPaths: uniqueParents,
            chainPaths: chain.map(item => item.file?.path),
            spentFull,
            spentSprint,
            estimate,
        };
        tasksIndex.set(chainId, taskInfo);

        const iterationTargets = new Set();
        uniqueParents.forEach(parentPath => {
            if (!parentPath) {
                return;
            }
            iterationTargets.add(parentPath);
            getAncestors(parentPath).forEach(ancestor => iterationTargets.add(ancestor));
        });

        iterationTargets.forEach(targetPath => {
            if (!targetPath) {
                return;
            }
            if (!tasksByIteration.has(targetPath)) {
                tasksByIteration.set(targetPath, new Map());
            }
            const bucket = tasksByIteration.get(targetPath);
            if (!bucket.has(chainId)) {
                bucket.set(chainId, taskInfo);
            }
        });

        uniqueParents.forEach(parentPath => {
            if (!parentPath) {
                return;
            }
            if (!directTasksByIteration.has(parentPath)) {
                directTasksByIteration.set(parentPath, new Map());
            }
            const directBucket = directTasksByIteration.get(parentPath);
            if (!directBucket.has(chainId)) {
                directBucket.set(chainId, taskInfo);
            }
        });
    });

    return {
        iterations,
        children,
        tasksByIteration,
        directTasksByIteration,
        tasksIndex,
        getAncestors,
        parseLinkPaths: value => parseLinkPaths(dv, value),
    };
};

module.exports = {
    buildRoadmapContext,
    classifyIteration,
    parseLinkPaths,
};
