const obsidian = require("obsidian");
const { Plugin } = obsidian;

/**
 * Загружает стартовые скрипты vault'а из _scripts.
 *
 * Скрипт получает `require`, который для "obsidian" отдаёт модуль API
 * (window.require его не знает — это node-require Electron'а), а остальные
 * идентификаторы (абсолютные пути к _scripts/*.js) делегирует window.require.
 */
const scriptRequire = (id) => (id === "obsidian" ? obsidian : window.require(id));
const STARTUP_SCRIPTS = [
    "_scripts/ensureTemplaterFileCreationTrigger.js",
    "_scripts/resetStaleActiveEditor.js",
    "_scripts/ensureSnippetsEnabled.js",
    "_scripts/kanbanFilterBar.js",
    "_scripts/kanbanLaneColumns.js",
    "_scripts/kanbanUserFeed.js",
    "_scripts/kanbanBoardSpentSync.js",
];

module.exports = class VaultStartupScriptsPlugin extends Plugin {
    async onload() {
        this.app.workspace.onLayoutReady(() => {
            this.runStartupScripts();
        });
    }

    async runStartupScripts() {
        for (const path of STARTUP_SCRIPTS) {
            try {
                const source = await this.app.vault.adapter.read(path);
                const wrapped = window.eval(
                    "(function (require, module, exports) {" + source + "\n})"
                );
                const scriptModule = { exports: {} };
                wrapped(scriptRequire, scriptModule, scriptModule.exports);
                if (typeof scriptModule.exports === "function") {
                    scriptModule.exports();
                }
            } catch (e) {
                console.error(`[vault-startup-scripts] не удалось выполнить ${path}`, e);
            }
        }
    }
};
