// Проверка настройки раскладки: node --test _tests/kanbanLaneColumns.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLaneColumns, normalizeTitle, parseCardClamp, resolveToggle } = require("../_scripts/kanbanLaneColumns.js");

test("normalizeTitle: регистр, крайние и повторные пробелы", () => {
    assert.equal(normalizeTitle("  In  Progress \t"), "in progress");
    assert.equal(normalizeTitle(" На\nПроверке "), "на проверке");
    assert.equal(normalizeTitle(undefined), "");
    assert.equal(normalizeTitle(null), "");
});

test("parseLaneColumns: числа, числовые строки и границы диапазона", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const result = parseLaneColumns({ Review: 2, done: "3", maximum: 6, todo: 1 });

    assert.deepEqual([...result], [["review", 2], ["done", 3], ["maximum", 6]]);
    assert.equal(warn.mock.callCount(), 0);
});

test("parseLaneColumns: нормализация заголовков настройки", () => {
    const result = parseLaneColumns({ "  In  Progress ": 2, " На Проверке ": 4 });

    assert.deepEqual([...result], [["in progress", 2], ["на проверке", 4]]);
});

test("parseLaneColumns: не объект настройки → пустая Map", () => {
    for (const value of [null, undefined, "review: 2", [["review", 2]], 2, true]) {
        assert.deepEqual([...parseLaneColumns(value)], []);
    }
});

test("parseLaneColumns: неверные числа и строки предупреждают один раз на поле", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const invalid = { zero: 0, negative: -2, big: 7, fraction: 2.5, nan: NaN,
        infinite: Infinity, text: "x", empty: "", spaces: "  ", decimal: "3.5" };

    assert.deepEqual([...parseLaneColumns({ ...invalid, review: 2 })], [["review", 2]]);
    assert.equal(warn.mock.callCount(), Object.keys(invalid).length);
    Object.entries(invalid).forEach(([title, raw], index) => {
        const args = warn.mock.calls[index].arguments;
        assert.match(args[0], new RegExp(`lane-columns\\.${title}:`));
        assert.equal(args[1], raw);
    });
});

test("parseLaneColumns: массивы, boolean и объекты не превращаются в числа", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const invalid = { array: [2], yes: true, no: false, object: { valueOf: () => 3 },
        missing: undefined, empty: null, symbol: Symbol("2"), bigint: 2n };

    assert.deepEqual([...parseLaneColumns(invalid)], []);
    assert.equal(warn.mock.callCount(), Object.keys(invalid).length);
});

test("parseCardClamp: true означает две строки, false и отсутствие — выключено", () => {
    assert.equal(parseCardClamp(true), 2);
    assert.equal(parseCardClamp(false), 0);
    assert.equal(parseCardClamp(undefined), 0);
    assert.equal(parseCardClamp(null), 0);
});

test("parseCardClamp: целое число строк 1…5 сохраняется", () => {
    for (const lines of [1, 2, 3, 4, 5]) {
        assert.equal(parseCardClamp(lines), lines);
    }
});

test("parseCardClamp: неверные значения не включают обрезку", () => {
    for (const value of [0, -1, 6, 2.5, NaN, Infinity, "2", "true", "false", "",
        [2], { valueOf: () => 2 }, Symbol("2"), 2n]) {
        assert.equal(parseCardClamp(value), 0);
    }
});

test("resolveToggle: отсутствие или неверная запись → умолчание доски", () => {
    for (const boardDefault of [false, true]) {
        for (const stored of [null, undefined, false, true, 0, 1, "0", "1", "broken", [], {},
            { value: !boardDefault }, { default: boardDefault },
            { value: "1", default: boardDefault }, { value: !boardDefault, default: "false" },
            JSON.stringify({ value: !boardDefault, default: boardDefault })]) {
            assert.equal(resolveToggle(stored, boardDefault), boardDefault);
        }
    }
});

test("resolveToggle: явный выбор действует при совпадении умолчания", () => {
    for (const boardDefault of [false, true]) {
        for (const value of [false, true]) {
            const stored = Object.freeze({ value, default: boardDefault });
            assert.equal(resolveToggle(stored, boardDefault), value);
        }
    }
});

test("resolveToggle: смена умолчания отменяет старый выбор без изменения записи", () => {
    for (const boardDefault of [false, true]) {
        const stored = Object.freeze({ value: !boardDefault, default: !boardDefault });
        assert.equal(resolveToggle(stored, boardDefault), boardDefault);
        assert.deepEqual(stored, { value: !boardDefault, default: !boardDefault });
    }
});
