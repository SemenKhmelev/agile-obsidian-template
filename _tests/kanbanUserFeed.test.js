// Тест чистой логики ленты записей: `node --test _tests/kanbanUserFeed.test.js`
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseFeedDate, stripInlineFields, buildFeed } = require("../_scripts/kanbanUserFeed.js");
const { spentLevel, formatHours } = require("../_scripts/taskTotals.js");

test("parseFeedDate: дата из имени файла записи", () => {
    assert.equal(parseFeedDate("2026-09-03-Галена Селезнева"), "2026-09-03");
    assert.equal(parseFeedDate("Шаблон комментария"), null);
    assert.equal(parseFeedDate(undefined), null);
});

test("stripInlineFields: убирает поля и отступы, сохраняет текст и ссылки", () => {
    const raw = [
        "[cardref:: [[sprint3/tasks/Задача|Задача]]]",
        "  [action::other]",
        "  [spent:: 2.5]",
        "  Чаты с заказчиком, см. [[Другая задача]].",
        "  вторая строка",
    ].join("\n");
    assert.equal(
        stripInlineFields(raw),
        "Чаты с заказчиком, см. [[Другая задача]].\nвторая строка",
    );
    assert.equal(stripInlineFields("[cardref::[[X]]]\n[action::sd]\n[spent:: 1]"), "");
    assert.equal(stripInlineFields(undefined), "");
});

test("stripInlineFields: вложенный список и код сохраняют относительный отступ", () => {
    const raw = [
        "[cardref:: [[X]]]",
        "  [spent:: 1]",
        "  Сделано:",
        "  - пункт",
        "    - вложенный",
        "  ```",
        "    code",
        "  ```",
    ].join("\n");
    assert.equal(
        stripInlineFields(raw),
        "Сделано:\n- пункт\n  - вложенный\n```\n  code\n```",
    );
});

test("buildFeed: группирует по дням, свежие сверху, считает часы", () => {
    const pages = [
        {
            path: "sprint2/comments/2026-08-20-Ангел Весельчак.md",
            name: "2026-08-20-Ангел Весельчак",
            items: [
                { cardPath: "sprint2/tasks/A.md", action: "fix", spent: "1.5", text: "[spent:: 1.5] раз" },
            ],
        },
        {
            path: "sprint3/comments/2026-09-03-Ангел Весельчак.md",
            name: "2026-09-03-Ангел Весельчак",
            items: [
                { cardPath: "sprint3/tasks/_predefined/Другое.md", cardDisplay: "Другое", action: "agile", spent: 3.5, text: "митинг" },
                { cardPath: "sprint3/tasks/B.md", action: "feat", spent: "x", text: "без часов", children: ["[action::x] подпункт"] },
                { cardPath: null, spent: 9, text: "без карточки — пропускаем" },
            ],
        },
        { path: "sprint3/comments/2026-09-04-Ангел Весельчак.md", name: "2026-09-04-Ангел Весельчак", items: [] },
        {
            // Тот же день на границе спринтов — сливается в один день, спринты перечисляются.
            path: "sprint1/comments/2026-08-20-Ангел Весельчак.md",
            name: "2026-08-20-Ангел Весельчак",
            items: [{ cardPath: "sprint1/tasks/C.md", action: "sd", spent: 0.5, text: "дубль дня" }],
        },
        { path: "_templates/Шаблон.md", name: "Шаблон", items: [{ cardPath: "x", spent: 1 }] },
    ];

    const feed = buildFeed(pages);

    assert.deepEqual(feed.map((d) => d.date), ["2026-09-03", "2026-08-20"]);

    const [latest, older] = feed;
    assert.equal(latest.sprint, "sprint3");
    assert.equal(latest.total, 3.5);
    assert.equal(latest.entries.length, 2);
    assert.deepEqual(latest.entries.map((e) => e.cardTitle), ["Другое", "B"]);
    assert.equal(latest.entries[1].spent, null, "нечисловой spent не превращается в 0");
    assert.deepEqual(latest.entries[1].children, ["подпункт"]);
    assert.equal(latest.entries[0].sourcePath, "sprint3/comments/2026-09-03-Ангел Весельчак.md");

    assert.equal(older.total, 2);
    assert.equal(older.sprint, "sprint2, sprint1");
    assert.equal(older.entries.length, 2);
    assert.equal(older.entries[0].text, "раз");
    assert.equal(older.entries[0].action, "fix");
});

test("spentLevel: уровни по доле от оценки, нулевая и отсутствующая оценка", () => {
    assert.equal(spentLevel(10, 64), "ok");
    assert.equal(spentLevel(52, 64), "warn");   // ≥ 80 %
    assert.equal(spentLevel(64, 64), "warn");   // ровно по оценке — ещё не перерасход
    assert.equal(spentLevel(70, 64), "over");
    assert.equal(spentLevel(5, 0), "over", "нулевая оценка при ненулевых часах");
    assert.equal(spentLevel(0, 0), "ok");
    assert.equal(spentLevel(5, null), "ok", "нет оценки — нечего сравнивать");
    assert.equal(spentLevel(5, NaN), "ok");
    assert.equal(formatHours(2.5), "2,5");
    assert.equal(formatHours(1.005), "1");
});
