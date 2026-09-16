/**
 * Гарантирует, что CSS-сниппет `snippets` включён в Obsidian Settings →
 * Appearance → CSS snippets. Нужен потому, что .obsidian/appearance.json
 * (где хранится список enabledCssSnippets) находится в .gitignore — у
 * новых членов команды снимок включённых сниппетов пустой, и они видят
 * нестилизованную панель фильтра на kanban-доске.
 *
 * Идемпотентен: если сниппет уже включён, ничего не делает. Использует
 * undocumented, но многолетне-стабильный API app.customCss.
 *
 * Вызывается из плагина vault-startup-scripts до kanbanFilterBar.js.
 */

const SNIPPET_NAME = "snippets";

const ensureSnippetsEnabled = () => {
    try {
        const cc = app.customCss;
        if (!cc || typeof cc.setCssEnabledStatus !== "function") {
            console.warn("[ensureSnippetsEnabled] app.customCss API недоступен");
            return "";
        }

        const enabled = cc.enabledSnippets;
        const isOn = enabled && typeof enabled.has === "function"
            ? enabled.has(SNIPPET_NAME)
            : Array.isArray(enabled) && enabled.includes(SNIPPET_NAME);

        if (isOn) return "";

        // Файл должен лежать в .obsidian/snippets/snippets.css; если его нет,
        // включать бессмысленно.
        const snippets = cc.snippets;
        const snippetExists = Array.isArray(snippets)
            ? snippets.includes(SNIPPET_NAME)
            : true; // если API списка недоступен — пытаемся всё равно

        if (!snippetExists) {
            console.warn(`[ensureSnippetsEnabled] сниппет "${SNIPPET_NAME}" не найден в .obsidian/snippets/`);
            return "";
        }

        cc.setCssEnabledStatus(SNIPPET_NAME, true);
        console.log(`[ensureSnippetsEnabled] CSS-сниппет "${SNIPPET_NAME}" включён автоматически`);
    } catch (e) {
        console.error("[ensureSnippetsEnabled] failed", e);
    }
    return "";
};

module.exports = ensureSnippetsEnabled;
