/**
 * Сбрасывает "протухший" app.workspace.activeEditor при открытии файлов.
 */
const resetStaleActiveEditor = () => {
    if (typeof window === "undefined" || window.__resetStaleActiveEditorRegistered) {
        return "";
    }
    window.__resetStaleActiveEditorRegistered = true;

    app.workspace.on("file-open", () => {
        const activeView = app.workspace.activeLeaf?.view;
        if (
            activeView?.getViewType?.() === "markdown" &&
            typeof app.workspace.unsetActiveEditor === "function"
        ) {
            app.workspace.unsetActiveEditor();
        }
    });
    return "";
};

module.exports = resetStaleActiveEditor;
