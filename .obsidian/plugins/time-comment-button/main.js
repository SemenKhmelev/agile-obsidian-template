const { MarkdownRenderChild, MarkdownView, Notice, Plugin } = require("obsidian");
const { Decoration, ViewPlugin, WidgetType } = require("@codemirror/view");
const { syntaxTree } = require("@codemirror/language");

const MARKER = "time-comment-add";
const COMMAND_ID = "templater-obsidian:_templates/time-spent-comment-button-template.md";
const TITLE = "Вставить заметку для фиксации времени";
const TEMPLATER_TIMEOUT_MS = 120000;

const waitingForExpansion = new Set();

function isInlineCodeNode(node) {
  return /.*?_?inline-code_?.*/.test(node.type.name);
}

function findMarkerLine(editor, fallbackLine) {
  if (Number.isInteger(fallbackLine) && editor.getLine(fallbackLine)?.includes(MARKER)) {
    return fallbackLine;
  }

  for (let line = 0; line < editor.lineCount(); line++) {
    if (editor.getLine(line).includes(MARKER)) {
      return line;
    }
  }

  return Number.isInteger(fallbackLine) ? fallbackLine : null;
}

function focusEditor(app) {
  app.workspace.getActiveViewOfType(MarkdownView)?.editor?.focus();
}

function focusAfterTemplate(app) {
  let ref;
  const timeout = setTimeout(() => {
    if (ref) {
      app.workspace.offref(ref);
    }
  }, TEMPLATER_TIMEOUT_MS);

  ref = app.workspace.on("templater:template-appended", () => {
    clearTimeout(timeout);
    app.workspace.offref(ref);
    setTimeout(() => focusEditor(app), 0);
  });
}

function hasPendingTemplaterTask(app, file) {
  const pending = app.plugins?.plugins?.["templater-obsidian"]?.templater?.files_with_pending_templates;
  return typeof pending?.has === "function" && pending.has(file?.path);
}

function containsRawTemplaterCode(editor) {
  return editor.getValue().includes("<%");
}

// Kanban на десктопе оставляет в workspace._activeEditor мёртвый редактор
// закрытой карточки (его очистка выполняется только на мобильных), а ядро
// сбрасывает _activeEditor лишь при переключении на другой лист. Templater же
// вставляет шаблоны именно через workspace.activeEditor и на мёртвом объекте
// падает с "No active editor, can't append templates". Безаргументный
// unsetActiveEditor() обнуляет _activeEditor, после чего геттер снова
// возвращает активный MarkdownView. Vault-wide сброс на file-open живёт в
// _scripts/resetStaleActiveEditor.js; здесь — страховка непосредственно перед
// вставкой (карточку могли отредактировать и после открытия заметки).
function resetStaleActiveEditor(app) {
  if (typeof app.workspace.unsetActiveEditor === "function") {
    app.workspace.unsetActiveEditor();
  }
}

// Ждём, пока из текста исчезнет сырой код Templater: файл заметки дня создаётся
// с текстом шаблона, а разворачивает его Templater асинхронно, включая диалог
// выбора фамилии — отсюда человеческий масштаб таймаута.
async function waitUntilEditorExpanded(editor) {
  const deadline = Date.now() + TEMPLATER_TIMEOUT_MS;
  while (containsRawTemplaterCode(editor) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !containsRawTemplaterCode(editor);
}

async function executeTimeCommentCommand(app, fallbackLine) {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  const editor = view?.editor;

  if (!editor) {
    new Notice("Time comment button can only be used in a Markdown editor.");
    return;
  }

  const commandExists = app.commands.listCommands().some((command) => command.id === COMMAND_ID);
  if (!commandExists) {
    new Notice(`Command "${COMMAND_ID}" not found.`);
    return;
  }

  // По этой заметке уже идёт вставка (открыт диалог выбора action) либо другой
  // клик уже ждёт разворачивания — повторный клик дал бы второй экземпляр шаблона.
  const file = view.file;
  if (waitingForExpansion.has(file) || hasPendingTemplaterTask(app, file)) {
    return;
  }

  // Свежесозданная заметка дня ещё содержит сырой код Templater. Вставка в этот
  // момент регистрирует задачу Templater по тому же пути, из-за чего триггер
  // on_file_creation молча пропускает разворачивание и файл остаётся сырым.
  // Поэтому сначала дожидаемся, пока Templater перезапишет файл.
  if (file && containsRawTemplaterCode(editor)) {
    waitingForExpansion.add(file);
    new Notice("Заметка ещё заполняется по шаблону — комментарий будет вставлен после её создания.");
    try {
      if (!(await waitUntilEditorExpanded(editor))) {
        new Notice("Заметка так и не развернулась из шаблона (в тексте остался код <%). Пересоздайте её.");
        return;
      }
    } finally {
      waitingForExpansion.delete(file);
    }
    if (app.workspace.getActiveViewOfType(MarkdownView) !== view) {
      return;
    }
  }

  const markerLine = findMarkerLine(editor, fallbackLine);
  if (!Number.isInteger(markerLine)) {
    new Notice("Time comment marker not found.");
    return;
  }

  editor.setCursor(markerLine, 0);
  editor.focus();
  resetStaleActiveEditor(app);
  focusAfterTemplate(app);
  app.commands.executeCommandById(COMMAND_ID);
}

function createButton(app, fallbackLine) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "time-comment-add-button";
  button.title = TITLE;

  const label = document.createElement("span");
  label.className = "time-comment-add-button__label";
  label.textContent = "+";
  button.appendChild(label);

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await executeTimeCommentCommand(app, fallbackLine);
  });

  return button;
}

class TimeCommentButtonWidget extends WidgetType {
  constructor(app, line) {
    super();
    this.app = app;
    this.line = line;
  }

  eq(other) {
    return other.line === this.line;
  }

  toDOM() {
    return createButton(this.app, this.line - 1);
  }
}

function buildDecorations(view, app) {
  const buttons = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: ({ node }) => {
        if (node.type.name.includes("formatting") || !isInlineCodeNode(node)) {
          return;
        }

        const content = view.state.doc.sliceString(node.from, node.to).trim();
        if (!content.includes(MARKER)) {
          return;
        }

        const line = view.state.doc.lineAt(node.to).number;
        const decoration = Decoration.replace({
          widget: new TimeCommentButtonWidget(app, line),
          block: false
        });

        buttons.push(decoration.range(node.from, node.to));
      }
    });
  }

  return Decoration.set(buttons);
}

function timeCommentButtonExtension(app) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildDecorations(view, app);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view, app);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations
  });
}

class TimeCommentButtonRenderChild extends MarkdownRenderChild {
  constructor(containerEl, app) {
    super(containerEl);
    this.app = app;
  }

  onload() {
    this.containerEl.replaceWith(createButton(this.app));
  }
}

module.exports = class TimeCommentButtonPlugin extends Plugin {
  async onload() {
    this.registerEditorExtension(timeCommentButtonExtension(this.app));

    this.registerMarkdownPostProcessor((el, ctx) => {
      const codeElements = el.querySelectorAll("code");

      codeElements.forEach((codeElement) => {
        if (codeElement.textContent?.trim() === MARKER) {
          ctx.addChild(new TimeCommentButtonRenderChild(codeElement, this.app));
        }
      });
    });
  }
};
