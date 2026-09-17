#!/usr/bin/env node
// Управление настоящим Obsidian (Electron) через CDP на копии vault без .git.
// На машине без дисплея (сервер, контейнер) сам поднимает Xvfb.
// Команды: start | stop | open <путь> | feed <фамилия> [light|dark] | theme <light|dark>
//          | shot [имя] [css] [масштаб] | eval <js>. Подробности — SKILL.md рядом.
//
// CDP — напрямую через WebSocket (встроен в Node 22), без Playwright: его connectOverCDP
// автоподключается к новым воркерам с ожиданием отладчика, и после выхода команды
// следующее подключение зависает на приостановленном воркере.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WORKSPACE = path.resolve(import.meta.dirname, "../../..");
// Vault — сам репозиторий: скилл лежит внутри него, в .agents/skills/run-obsidian.
const VAULT_SRC = process.env.OBSIDIAN_VAULT || WORKSPACE;
// Obsidian ставят по-разному, поэтому перебираем обычные места установки.
const BIN_CANDIDATES = [
    "/opt/obsidian/obsidian",
    "/usr/bin/obsidian",
    "/usr/local/bin/obsidian",
    "/var/lib/flatpak/exports/bin/md.obsidian.Obsidian",
    "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
];
const BIN = process.env.OBSIDIAN_BIN || BIN_CANDIDATES.find((p) => fs.existsSync(p)) || "obsidian";
const RUN = process.env.RUN_DIR || "/tmp/run-obsidian";
const DISPLAY = process.env.OBSIDIAN_DISPLAY || ":99";
const PORT = Number(process.env.OBSIDIAN_CDP_PORT || 9333);
const STATE = path.join(RUN, "state.json");
const SHOTS = path.join(RUN, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const readState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : null);

// Сессия CDP с окном Obsidian (target app://obsidian.md/index.html).
const connect = async (tries = 15) => {
    let target;
    for (let i = 0; i < tries && !target; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            target = list.find((t) => t.type === "page" && t.url.startsWith("app://"));
        } catch { /* ещё не поднялся */ }
        if (!target) await sleep(1000);
    }
    if (!target) {
        throw new Error(`Obsidian не отвечает на CDP :${PORT} (процесс ${alive(readState()?.obsidian) ? "жив" : "не запущен"}) — start`);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("WebSocket CDP не открылся")); });
    let seq = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && pending.has(data.id)) {
            const { ok, fail } = pending.get(data.id);
            pending.delete(data.id);
            data.error ? fail(new Error(data.error.message)) : ok(data.result);
        } else if (data.method) {
            listeners.forEach((fn) => fn(data));
        }
    };
    const send = (method, params = {}) => new Promise((ok, fail) => {
        const id = ++seq;
        pending.set(id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => pending.has(id) && (pending.delete(id), fail(new Error(`CDP ${method}: таймаут`))), 60000);
    });
    const evaluate = async (expression) => {
        const r = await send("Runtime.evaluate", { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
    };
    const waitFor = async (expression, timeoutMs = 60000) => {
        for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(500)) {
            if (await evaluate(expression).catch(() => false)) return true;
        }
        return false;
    };
    const screenshot = async (name, selector, scale = 1) => {
        let clip;
        if (selector) {
            // scale > 1 — снимок элемента в увеличенном разрешении: Chromium перерисовывает
            // содержимое, а не растягивает пиксели, поэтому текст остаётся чётким.
            clip = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
                if (!e) return null; const b = e.getBoundingClientRect();
                return { x: b.x, y: b.y, width: b.width, height: b.height, scale: ${Number(scale)} }; })()`);
            if (!clip) throw new Error(`не найден ${selector}`);
        }
        const { data } = await send("Page.captureScreenshot", { format: "png", ...(clip && { clip }) });
        fs.mkdirSync(SHOTS, { recursive: true });
        const file = path.join(SHOTS, `${name}.png`);
        fs.writeFileSync(file, Buffer.from(data, "base64"));
        return file;
    };
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
    return { send, evaluate, waitFor, screenshot, on: (fn) => listeners.push(fn) };
};

const setTheme = (s, name) => s.evaluate(`app.changeTheme(${JSON.stringify(name === "dark" ? "obsidian" : "moonstone")})`);

const copyVault = (dst) => {
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(dst, { recursive: true });
    // Без .git: копия не должна ничего коммитить и пушить.
    execFileSync("bash", ["-c", `tar -C "$1" --exclude=.git -cf - . | tar -C "$2" -xf -`, "_", VAULT_SRC, dst]);
    const pluginsFile = path.join(dst, ".obsidian/community-plugins.json");
    const plugins = JSON.parse(fs.readFileSync(pluginsFile, "utf8")).filter((p) => p !== "obsidian-git");
    fs.writeFileSync(pluginsFile, JSON.stringify(plugins, null, 2));
};

const COMMANDS = {
    async start() {
        if (alive(readState()?.obsidian)) return console.log("уже запущен — stop, чтобы перезапустить с новой копией vault");
        const vault = path.join(RUN, "vault");
        copyVault(vault);
        const config = path.join(RUN, "config");
        fs.mkdirSync(path.join(config, "obsidian"), { recursive: true });
        fs.writeFileSync(path.join(config, "obsidian/obsidian.json"),
            JSON.stringify({ vaults: { a1b2c3d4e5f60718: { path: vault, ts: Date.now(), open: true } } }));

        // На машине с рабочим столом Obsidian открывается в обычном окне; Xvfb нужен
        // только там, где дисплея нет. OBSIDIAN_XVFB=1 навязывает виртуальный дисплей.
        const headless = process.env.OBSIDIAN_XVFB === "1" || !process.env.DISPLAY;
        let xvfb = { pid: 0, unref() {} };
        if (headless) {
            const lock = `/tmp/.X${DISPLAY.slice(1)}-lock`;
            if (fs.existsSync(lock) && !alive(Number(fs.readFileSync(lock, "utf8").trim()))) fs.rmSync(lock);
            xvfb = spawn("Xvfb", [DISPLAY, "-screen", "0", "1600x1000x24", "-nolisten", "tcp"], { stdio: "ignore", detached: true });
            xvfb.unref();
            await sleep(1500);
        }

        const env = { ...process.env, XDG_CONFIG_HOME: config, ...(headless && { DISPLAY }) };
        delete env.WAYLAND_DISPLAY; // иначе Electron уходит в Wayland, мимо Xvfb и CDP
        const obs = spawn(BIN, ["--no-sandbox", "--disable-gpu", `--remote-debugging-port=${PORT}`],
            { env, stdio: "ignore", detached: true });
        obs.unref();
        fs.writeFileSync(STATE, JSON.stringify({ xvfb: xvfb.pid, obsidian: obs.pid }));

        const s = await connect(60);
        // Диалог доверия автору vault появляется при первом открытии копии.
        const ready = await s.waitFor(`(() => {
            const trust = [...document.querySelectorAll("button")].find((b) => /Trust author/i.test(b.textContent));
            if (trust) { trust.click(); return false; }
            const dv = app.plugins?.plugins?.dataview?.api;
            return app.workspace?.layoutReady && !!app.plugins.plugins["obsidian-kanban"] && dv?.index?.initialized;
        })()`, 120000);
        if (!ready) throw new Error("не дождались плагинов и индекса Dataview за 2 минуты — посмотрите shot");
        // initialized у Dataview наступает раньше, чем проиндексирована свежая копия vault:
        // лента и доска тогда показывают старые дни без итогов. Ждём, пока кэш метаданных
        // разберёт очередь, а ревизия индекса Dataview не меняется 3 секунды.
        let revision = -1;
        let stable = 0;
        for (const end = Date.now() + 180000; stable < 6 && Date.now() < end; await sleep(500)) {
            const now = await s.evaluate(`app.metadataCache.initialized && app.metadataCache.inProgressTaskCount === 0
                ? app.plugins.plugins.dataview.api.index.revision : -1`);
            stable = now !== -1 && now === revision ? stable + 1 : 0;
            revision = now;
        }
        if (stable < 6) throw new Error("индекс не успокоился за 3 минуты — посмотрите shot");
        console.log("ready: vault", vault, "dataview revision", revision);
    },

    async stop() {
        const st = readState();
        if (!st) return console.log("не запущен");
        const kill = (sig) => [st.obsidian, st.xvfb].forEach((pid) => { try { process.kill(-pid, sig); } catch { /* уже нет */ } });
        kill("SIGTERM");
        // Electron завершается не сразу: ждём, упрямых добиваем.
        for (let i = 0; i < 20 && (alive(st.obsidian) || alive(st.xvfb)); i++) await sleep(500);
        if (alive(st.obsidian) || alive(st.xvfb)) kill("SIGKILL");
        fs.rmSync(STATE);
        console.log("stopped");
    },

    async open(file) {
        const s = await connect();
        await s.evaluate(`app.workspace.openLinkText(${JSON.stringify(file)}, "", false)`);
        await sleep(2000);
        console.log("opened", await s.evaluate("app.workspace.getActiveFile()?.path"));
    },

    async theme(name) {
        await setTheme(await connect(), name);
        console.log("theme", name);
    },

    async shot(name = `shot-${Date.now()}`, selector, scale) {
        console.log("screenshot:", await (await connect()).screenshot(name, selector, scale ? Number(scale) : 1));
    },

    // Отладочная команда: выполняет JS, который агент сам передал, в своём локальном
    // экземпляре Obsidian (копия vault). Внешние данные сюда не попадают.
    async eval(expr) {
        console.log(JSON.stringify(await (await connect()).evaluate(expr), null, 1));
    },

    // Лента записей человека: правый клик по аватарке на открытой доске, скриншот и замеры
    // сетки по первому (самому свежему) дню ленты.
    async feed(user, theme = "light") {
        const s = await connect();
        const errors = [];
        await s.send("Runtime.enable");
        s.on(({ method, params }) => {
            if (method === "Runtime.exceptionThrown") errors.push(String(params.exceptionDetails.exception?.description).slice(0, 300));
            if (method === "Runtime.consoleAPICalled" && params.type === "error") {
                errors.push(params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
            }
        });
        await setTheme(s, theme);
        await s.evaluate(`document.querySelector(".kanban-user-feed-modal")?.closest(".modal-container")?.remove()`);
        // Панель аватарок дорисовывает стартовый скрипт после рендера доски — ждём её.
        const avatar = JSON.stringify(`.kanban-filter-bar button[data-user*="${user}"]`);
        if (!(await s.waitFor(`!!document.querySelector(${avatar})`))) {
            throw new Error(`нет аватарки «${user}» — открыта ли доска (open sprintNNN/board)?`);
        }
        await s.evaluate(`(() => { const b = document.querySelector(${avatar}); const r = b.getBoundingClientRect();
            b.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5, button: 2 })); })()`);
        if (!(await s.waitFor(`!!document.querySelector(".kanban-user-feed-modal .kanban-user-feed__entry")`))) {
            console.log("screenshot:", await s.screenshot(`feed-${theme}-fail`));
            throw new Error("в ленте нет записей — см. скриншот");
        }
        await s.waitFor(`[...document.querySelectorAll(".kanban-user-feed-modal img")].every((i) => i.complete)`, 10000);
        await sleep(500);
        const metrics = await s.evaluate(`(() => {
            const q = (sel, root = document) => [...root.querySelectorAll(sel)];
            const R = (el) => el.getBoundingClientRect();
            const xs = (sel, root, side = "left") => [...new Set(q(sel, root).map((e) => Math.round(R(e)[side])))];
            const day = q(".kanban-user-feed__day")[0];
            return {
                day: day.querySelector(".kanban-user-feed__day-date")?.textContent,
                entries: q(".kanban-user-feed__entry", day).length,
                dayTotalLeft: Math.round(R(day.querySelector(".kanban-user-feed__day-total")).left),
                spentLeft: xs(".kanban-user-feed__spent", day),
                actionLeft: xs(".kanban-user-feed__action", day),
                cardLeft: xs(".kanban-user-feed__card", day),
                textLeft: xs(".kanban-user-feed__text", day),
                captionRight: Math.round(R(day.querySelector(".kanban-user-feed__day-caption")).right),
                totalsRight: xs(".kanban-user-feed__totals", day, "right"),
                actionsClipped: q(".kanban-user-feed__action").filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent),
            };
        })()`);
        console.log(JSON.stringify(metrics));
        console.log("screenshot:", await s.screenshot(`feed-${theme}`, ".kanban-user-feed-modal"));
        console.log("console errors:", errors.length ? [...new Set(errors)].join("\n") : "нет");
    },
};

const [cmd, ...args] = process.argv.slice(2);
if (!COMMANDS[cmd]) {
    console.log("команды:", Object.keys(COMMANDS).join(", "));
    process.exit(cmd ? 1 : 0);
}
try {
    await COMMANDS[cmd](...(cmd === "eval" ? [args.join(" ")] : args));
    process.exit(0);
} catch (e) {
    console.log("ERROR:", e.message);
    process.exit(1);
}
