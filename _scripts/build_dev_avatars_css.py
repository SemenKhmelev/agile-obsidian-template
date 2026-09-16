#!/usr/bin/env python3
"""Generate .obsidian/snippets/dev-avatars.css from _views/avatars/*.png.

Three rule blocks are produced:
  1. File Explorer — avatar left of file name in sprintNNN/comments/.
  2. Inline title  — avatar left of the inline title inside the opened note,
     matched via the `cssclasses: [dev-<slug>]` frontmatter property.
  3. Kanban card  — round avatar left of the user surname in board.md cards.
                    Image is rendered by the kanban plugin itself from the
                    `userAvatar` frontmatter field; CSS only restyles it.

PNGs in blocks 1 and 2 are embedded as data: URIs so the snippet is portable
across machines. Block 3 references files via Obsidian markdown embeds, so no
data URIs are needed there.

Run from the vault root:  python3 _scripts/build_dev_avatars_css.py
"""
import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _devs import SLUG as DEVS  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
AVATARS = ROOT / "_views" / "avatars"
OUT = ROOT / ".obsidian" / "snippets" / "dev-avatars.css"


def b64(slug: str) -> str:
    p = AVATARS / f"{slug}.png"
    if not p.exists():
        sys.exit(f"missing avatar: {p}")
    return base64.b64encode(p.read_bytes()).decode()


def main() -> None:
    data = {name: b64(slug) for name, slug in DEVS.items()}

    lines: list[str] = []
    lines.append("/* Аватарки разработчиков.")
    lines.append("   Сгенерировано _scripts/build_dev_avatars_css.py — не редактировать вручную.")
    lines.append("   PNG встроены как data URI, сниппет портабелен между машинами.")
    lines.append("")
    lines.append("   Блок 1: слева от имени файла в File Explorer (sprintNNN/comments/).")
    lines.append("   Блок 2: слева от inline-title внутри открытой карточки — активируется")
    lines.append("           через frontmatter `cssclasses: [dev-<slug>]`.")
    lines.append("   Блок 3: на карточках kanban-доски board.md — kanban сам рендерит embed")
    lines.append("           из frontmatter-поля `userAvatar`, CSS делает картинку круглой. */")
    lines.append("")

    # ---------- Block 1: File Explorer ----------
    sel_fe_common = ",\n".join(
        f'.nav-file-title[data-path*="/comments/"][data-path$="-{name}.md"] .nav-file-title-content::before'
        for name in DEVS
    )
    lines.append(sel_fe_common + " {")
    lines.append("  content: \"\";")
    lines.append("  display: inline-block;")
    lines.append("  width: 16px;")
    lines.append("  height: 16px;")
    lines.append("  margin-right: 6px;")
    lines.append("  vertical-align: middle;")
    lines.append("  background-size: cover;")
    lines.append("  background-position: center;")
    lines.append("  background-repeat: no-repeat;")
    lines.append("  border-radius: 50%;")
    lines.append("  transform: translateY(-0.5px);")
    lines.append("}")
    lines.append("")

    for name, slug in DEVS.items():
        lines.append(
            f'.nav-file-title[data-path*="/comments/"][data-path$="-{name}.md"] '
            f".nav-file-title-content::before {{"
        )
        lines.append(f'  background-image: url("data:image/png;base64,{data[name]}");')
        lines.append("}")
    lines.append("")

    # ---------- Block 2: inline title ----------
    sel_it_common = ",\n".join(
        f".markdown-preview-view.dev-{slug} .inline-title::before,\n"
        f".markdown-source-view.dev-{slug} .inline-title::before"
        for slug in DEVS.values()
    )
    lines.append(sel_it_common + " {")
    lines.append("  content: \"\";")
    lines.append("  display: inline-block;")
    lines.append("  width: 1.2em;")
    lines.append("  height: 1.2em;")
    lines.append("  margin-right: 0.4em;")
    lines.append("  vertical-align: -0.25em;")
    lines.append("  background-size: cover;")
    lines.append("  background-position: center;")
    lines.append("  background-repeat: no-repeat;")
    lines.append("  border-radius: 50%;")
    lines.append("}")
    lines.append("")

    for name, slug in DEVS.items():
        lines.append(
            f".markdown-preview-view.dev-{slug} .inline-title::before,\n"
            f".markdown-source-view.dev-{slug} .inline-title::before {{"
        )
        lines.append(f'  background-image: url("data:image/png;base64,{data[name]}");')
        lines.append("}")
    lines.append("")

    # ---------- Block 3: Kanban card (user metadata key) ----------
    lines.append("/* Блок 3: kanban-доска board.md.")
    lines.append("   1) Перерисовываем .kanban-plugin__meta-table на flex-layout, чтобы")
    lines.append("      можно было задавать порядок строк (kanban-плагин управляет")
    lines.append("      metadata-keys в board.md и откатывает ручные правки порядка).")
    lines.append("   2) Строка user всегда первая, остальное (estimate/spentsum/…) — после.")
    lines.append("   3) Цепляемся к ячейке user через data-value=\"Фамилия\", добавляем")
    lines.append("      ::before с base64-аватаркой и обрезаем длинные фамилии ellipsis. */")
    lines.append("")
    lines.append(".kanban-plugin__meta-table { display: block; width: 100%; }")
    lines.append(".kanban-plugin__meta-table > tbody { display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; justify-content: flex-end; gap: 8px; width: 100%; min-width: 0; }")
    lines.append(".kanban-plugin__meta-row { display: flex; align-items: center; flex: 0 0 auto; min-width: 0; order: 5; gap: 2px; }")
    lines.append(".kanban-plugin__meta-row > td { display: block; min-width: 0; padding: 0 !important; }")
    lines.append("")
    user_row_selector = ",\n".join(
        f'.kanban-plugin__meta-row:has(> td[data-value="{name}"])'
        for name in DEVS
    )
    lines.append(user_row_selector + " {")
    lines.append("  order: 1;")
    lines.append("  flex: 1 1 auto;")
    lines.append("  min-width: 0;")
    lines.append("  overflow: hidden;")
    lines.append("}")
    lines.append("")
    lines.append(
        ",\n".join(
            f'.kanban-plugin__meta-value-wrapper[data-value="{name}"] .kanban-plugin__meta-value::before'
            for name in DEVS
        )
        + " {"
    )
    lines.append("  content: \"\";")
    lines.append("  display: inline-block;")
    lines.append("  width: 16px;")
    lines.append("  height: 16px;")
    lines.append("  margin-right: 4px;")
    lines.append("  vertical-align: -3px;")
    lines.append("  background-size: cover;")
    lines.append("  background-position: center;")
    lines.append("  background-repeat: no-repeat;")
    lines.append("  border-radius: 50%;")
    lines.append("}")
    lines.append(
        ",\n".join(
            f'.kanban-plugin__meta-value-wrapper[data-value="{name}"] .kanban-plugin__meta-value'
            for name in DEVS
        )
        + " {"
    )
    lines.append("  display: block;")
    lines.append("  white-space: nowrap;")
    lines.append("  overflow: hidden;")
    lines.append("  text-overflow: ellipsis;")
    lines.append("  min-width: 0;")
    lines.append("  max-width: 100%;")
    lines.append("}")
    lines.append("")
    for name in DEVS:
        lines.append(
            f'.kanban-plugin__meta-value-wrapper[data-value="{name}"] '
            ".kanban-plugin__meta-value::before {"
        )
        lines.append(f'  background-image: url("data:image/png;base64,{data[name]}");')
        lines.append("}")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"written {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
