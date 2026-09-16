/**
 * Гарантирует, что у Templater включён переключатель "Trigger Templater on new
 * file creation".
 *
 * Начиная с Templater 2.22 эта настройка (вместе с `enable_startup_templates`
 * и `enable_system_commands`) переехала из `data.json` в localStorage
 * устройства под ключом `templater-local-settings` и по умолчанию выключена.
 *
 * Идемпотентен: если переключатель уже включён, ничего не делает. Перезапуск
 * Obsidian не нужен — обработчик события `create` Templater регистрирует
 * безусловно, а настройку читает в момент создания файла.
 *
 * Вызывается из плагина vault-startup-scripts.
 */

// Ключ и имя поля заданы самим Templater (main.js, `templater-local-settings`).
const LOCAL_SETTINGS_KEY = "templater-local-settings";
const TRIGGER_KEY = "trigger_on_file_creation";

const ensureTemplaterFileCreationTrigger = () => {
    try {
        if (!app.plugins?.enabledPlugins?.has("templater-obsidian")) return "";

        if (typeof app.loadLocalStorage !== "function" || typeof app.saveLocalStorage !== "function") {
            console.warn("[ensureTemplaterFileCreationTrigger] API app.loadLocalStorage недоступен");
            return "";
        }

        const local = app.loadLocalStorage(LOCAL_SETTINGS_KEY) ?? {};
        if (local[TRIGGER_KEY] === true) return "";

        app.saveLocalStorage(LOCAL_SETTINGS_KEY, { ...local, [TRIGGER_KEY]: true });
        console.log(
            "[ensureTemplaterFileCreationTrigger] включён Templater → Trigger Templater on new file creation"
        );
    } catch (e) {
        console.error("[ensureTemplaterFileCreationTrigger] failed", e);
    }
    return "";
};

module.exports = ensureTemplaterFileCreationTrigger;
