import os
import shutil
import json
import re

VAULT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Update globalprops.js to point to the new sprint

def update_globalprops(old_sprint, new_sprint):
    globalprops_path = os.path.join(VAULT_PATH, "_scripts", "globalprops.js")
    with open(globalprops_path, "r+", encoding="utf-8") as file:
        content = file.read()

        updated_content = re.sub(
            r"\s*module\.exports\s*=\s*\(\s*\)\s*=>\s*'{}'\s*;?".format(re.escape(old_sprint)),
            f"module.exports = () => '{new_sprint}'",
            content
        )
        file.seek(0)
        file.write(updated_content)
        file.truncate()


# Copy the old sprint folder to create the new sprint folder
def copy_sprint_folder(old_sprint, new_sprint):
    old_path = os.path.join(VAULT_PATH, old_sprint)
    new_path = os.path.join(VAULT_PATH, new_sprint)
    if not os.path.exists(old_path):
        raise SystemExit(f"Error: old sprint folder does not exist: {old_path}")
    if os.path.exists(new_path):
        raise SystemExit(f"Error: new sprint folder already exists: {new_path}")
    shutil.copytree(old_path, new_path)

# Clear out all comments in the new sprint's comments folder
def clear_comments_folder(new_sprint):
    comments_path = os.path.join(VAULT_PATH, new_sprint, "comments")
    if os.path.exists(comments_path):
        shutil.rmtree(comments_path)
        os.makedirs(comments_path)

# Clean board and tasks: update note folder and remove completed tasks
def clean_board_and_tasks(old_sprint, new_sprint):
    for board_file in ["board.md", "board-design.md"]:
        board_path = os.path.join(VAULT_PATH, new_sprint, board_file)
        tasks_path = os.path.join(VAULT_PATH, new_sprint, "tasks")

        if not os.path.exists(board_path):
            continue

        # Read board and update new-note-folder
        with open(board_path, "r", encoding="utf-8") as file:
            content = file.read()

        updated_content = re.sub(
            r'"new-note-folder":\s*"[^"]+"',
            f'"new-note-folder":"{new_sprint}/tasks"',
            content
        )

        removed_tasks = set()

        # helper to collect links from a section and clear it, leaving only the header
        def collect_and_clear(section_name: str, text: str):
            pattern = re.compile(
                rf'(^\s*#+\s*{re.escape(section_name)}\s*?\n)(.*?)(?=^\s*#+\s|^%%|\Z)',
                flags=re.DOTALL | re.IGNORECASE | re.MULTILINE
            )
            match = pattern.search(text)
            tasks = set()
            if match:
                task_links = re.findall(r'\[\[([^\]]+)\]\]', match.group(2))
                for link in task_links:
                    raw_name = link.split('|')[0].strip()
                    task_name = raw_name.split('/')[-1].strip()
                    tasks.add(task_name)
                # keep only the section header
                text = text.replace(match.group(0), match.group(1))
            return tasks, text

        # Collect from 'done' and 'rejected' sections and clear them
        tasks, updated_content = collect_and_clear('done', updated_content)
        removed_tasks |= tasks
        tasks, updated_content = collect_and_clear('rejected', updated_content)
        removed_tasks |= tasks

        # Write back the cleaned board content
        with open(board_path, "w", encoding="utf-8") as file:
            file.write(updated_content)

        # Delete completed/rejected task files
        if os.path.exists(tasks_path) and removed_tasks:
            for filename in os.listdir(tasks_path):
                task_name = filename.replace('.md', '')
                if task_name in removed_tasks:
                    os.remove(os.path.join(tasks_path, filename))
                    print(f"Deleted task: {task_name}")


# Process time_debt.md: clear closed debts and update note folder path
def process_time_debt(old_sprint, new_sprint):
    time_debt_path = os.path.join(VAULT_PATH, new_sprint, "time_debt.md")
    debts_path = os.path.join(VAULT_PATH, new_sprint, "debts")

    if not os.path.exists(time_debt_path):
        print(f"Error: File '{time_debt_path}' does not exist.")
        return

    with open(time_debt_path, "r+", encoding="utf-8") as file:
        content = file.read()

        # Collect closed debts
        closed_debts = set()
        closed_match = re.search(
            r'^## Закрытые долги\s*?\n(.*?)(?=\n\n|\Z)',
            content,
            flags=re.DOTALL | re.MULTILINE
        )
        if closed_match:
            debt_links = re.findall(r'\[\[([^\]]+)\]\]', closed_match.group(1))
            for link in debt_links:
                debt_name = link.split('/')[-1].split('|')[0].strip()
                closed_debts.add(debt_name)

        # Clear closed debts section
        content = re.sub(
            r'(^## Закрытые долги\s*?\n)(.*?)(?=\n\n|\Z)',
            r'\1',
            content,
            flags=re.DOTALL | re.MULTILINE
        )

        # Update links to point to new sprint folder
        content = re.sub(
            rf'\[\[{re.escape(old_sprint)}/debts/([^\]]+)\]\]',
            f'[[{new_sprint}/debts/\\1]]',
            content
        )

        # Update kanban settings if present
        kanban_settings_pattern = re.compile(
            r'(%% kanban:settings\s*\n```\s*\n?)(.*?)(\n```\s*%%\n?)',
            flags=re.DOTALL
        )
        match = kanban_settings_pattern.search(content)

        if match:
            try:
                settings = json.loads(match.group(2))
                settings["new-note-folder"] = f"{new_sprint}/debts"

                updated_block = (
                    f"{match.group(1)}"
                    f"{json.dumps(settings, ensure_ascii=False, indent=None)}"
                    f"{match.group(3)}"
                )

                content = content.replace(match.group(0), updated_block)
            except json.JSONDecodeError as e:
                print(f"Error parsing kanban settings: {e}")
        else:
            print("Warning: No valid kanban:settings block found")

        file.seek(0)
        file.write(content)
        file.truncate()

    # Delete closed debt notes
    if os.path.exists(debts_path) and closed_debts:
        for filename in os.listdir(debts_path):
            debt_name = filename.replace('.md', '')
            if debt_name in closed_debts:
                os.remove(os.path.join(debts_path, filename))
                print(f"Deleted closed debt: {debt_name}")


# Clear feedback section marked as 'Разобрано'
def clear_feedback_section(new_sprint):
    feedback_path = os.path.join(VAULT_PATH, new_sprint, "feedback.md")
    if not os.path.exists(feedback_path):
        return

    with open(feedback_path, "r", encoding="utf-8") as file:
        content = file.read()

    content = re.sub(
        r'(^## Разобрано%%\s+%%\s*?\n).*?(?=^## |\Z)',
        r'\1',
        content,
        flags=re.DOTALL | re.MULTILINE
    )

    with open(feedback_path, "w", encoding="utf-8") as file:
        file.write(content)


# Add 'previous' field and new sprint tag to task frontmatter
def update_task_frontmatter(old_sprint, new_sprint):
    tasks_path = os.path.join(VAULT_PATH, new_sprint, "tasks")

    for filename in os.listdir(tasks_path):
        if not filename.endswith(".md"):
            continue

        task_path = os.path.join(tasks_path, filename)
        with open(task_path, "r+", encoding="utf-8") as file:
            content = file.readlines()

        in_frontmatter = False
        has_previous = False
        tags_section = False
        estimate_pos = -1
        last_tag_pos = -1

        for i, line in enumerate(content):
            if line.strip() == "---":
                in_frontmatter = not in_frontmatter
                continue

            if in_frontmatter:
                if line.strip().startswith("previous:"):
                    has_previous = True
                elif line.startswith("estimate:"):
                    estimate_pos = i
                elif line.strip().startswith("tags:"):
                    tags_section = True
                    last_tag_pos = i
                elif tags_section and line.startswith("  - "):
                    last_tag_pos = i

        # Build updated frontmatter
        new_content = []
        in_frontmatter = False
        task_name = filename[:-3]
        previous_line = f'previous: "[[{old_sprint}/tasks/{task_name}|{task_name}]]"\n'
        previous_written = False

        for i, line in enumerate(content):
            if line.strip() == "---":
                in_frontmatter = not in_frontmatter
                new_content.append(line)
                # After the opening '---', if there's no 'previous' field, add it
                if in_frontmatter and not has_previous:
                    new_content.append(previous_line)
                    previous_written = True
                continue

            if in_frontmatter:
                if line.strip().startswith("previous:"):
                    if not previous_written:
                        new_content.append(previous_line)
                        previous_written = True
                    # Skip any existing 'previous:' lines to avoid duplicates
                    continue
                if i == estimate_pos:
                    new_content.append(line)
                    if not tags_section:
                        new_content.append("tags:\n")
                        new_content.append(f"  - {new_sprint}\n")
                    continue
                if i == last_tag_pos:
                    new_content.append(line)
                    new_content.append(f"  - {new_sprint}\n")
                    continue

            new_content.append(line)

        with open(task_path, "w", encoding="utf-8") as file:
            file.writelines(new_content)


# Update Obsidian config files to reflect new sprint paths
def update_obsidian_config(old_sprint, new_sprint):
    app_json_path = os.path.join(VAULT_PATH, ".obsidian", "app.json")
    if os.path.exists(app_json_path):
        with open(app_json_path, "r", encoding="utf-8") as file:
            app_config = json.load(file)

        key = "userIgnoreFilters"
        if key not in app_config:
            app_config[key] = []

        ignore_list = app_config[key]

        # Normalize both to include trailing slash for comparison
        old_sprint_path = f"{old_sprint}/"
        if all(not item.rstrip("/") == old_sprint for item in ignore_list):
            ignore_list.append(old_sprint_path)
            print(f"Added '{old_sprint_path}' to userIgnoreFilters.")

        app_config[key] = sorted(set(ignore_list))  # avoid duplicates

        with open(app_json_path, "w", encoding="utf-8") as file:
            json.dump(app_config, file, indent=2)

    # Update daily notes folder
    daily_notes_path = os.path.join(VAULT_PATH, ".obsidian", "daily-notes.json")
    if os.path.exists(daily_notes_path):
        with open(daily_notes_path, "r", encoding="utf-8") as file:
            daily_notes = json.load(file)

        if 'folder' in daily_notes:
            daily_notes['folder'] = f"{new_sprint}/comments"
            with open(daily_notes_path, "w", encoding="utf-8") as file:
                json.dump(daily_notes, file, indent=2)

    # Update templater folder template of daily notes (folder_templates[].folder)
    templater_path = os.path.join(VAULT_PATH, ".obsidian", "plugins", "templater-obsidian", "data.json")
    if os.path.exists(templater_path):
        with open(templater_path, "r", encoding="utf-8") as file:
            templater_config = json.load(file)

        changed = False
        for folder_template in templater_config.get("folder_templates", []):
            if folder_template.get("folder") == f"{old_sprint}/comments":
                folder_template["folder"] = f"{new_sprint}/comments"
                changed = True
        if changed:
            with open(templater_path, "w", encoding="utf-8") as file:
                json.dump(templater_config, file, ensure_ascii=False, indent=2)

# Append sprint start/end date to readme.md
def update_readme(new_sprint, start_date, end_date):
    readme_path = os.path.join(VAULT_PATH, new_sprint, "readme.md")
    if not os.path.exists(readme_path):
        print(f"Warning: {readme_path} does not exist.")
        return

    with open(readme_path, "r", encoding="utf-8") as file:
        content = file.read()

    def replace_field(field, new_value):
        return re.sub(
            rf'(^|\n){field}:\s*[^\n]+',
            rf'\1{field}: {new_value}',
            content,
            count=1
        )

    # Update YAML frontmatter start and end
    content = replace_field("start", start_date)
    content = replace_field("end", end_date)

    with open(readme_path, "w", encoding="utf-8") as file:
        file.write(content)


# Main entry point
def main():
    old_sprint = input("Enter the name of the old sprint: ").strip()
    new_sprint = input("Enter the name of the new sprint: ").strip()
    start_date = input("Enter the start date (YYYY-MM-DD): ").strip()
    end_date = input("Enter the end date (YYYY-MM-DD): ").strip()

    copy_sprint_folder(old_sprint, new_sprint)
    update_globalprops(old_sprint, new_sprint)
    clear_comments_folder(new_sprint)
    clean_board_and_tasks(old_sprint, new_sprint)
    process_time_debt(old_sprint, new_sprint)
    clear_feedback_section(new_sprint)
    update_task_frontmatter(old_sprint, new_sprint)
    update_obsidian_config(old_sprint, new_sprint)
    update_readme(new_sprint, start_date, end_date)

    print("Sprint setup completed successfully.")

if __name__ == "__main__":
    main()
