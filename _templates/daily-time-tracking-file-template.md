<%* 
tp
let user = await tp.system.suggester(["Галена Селезнева", "Ангел Весельчак", "Кости Герасимов", "Ксаеро Великанов"], ["Галена Селезнева", "Ангел Весельчак", "Кости Герасимов", "Ксаеро Великанов"]);

if (!user) {
    await app.vault.trash(tp.config.target_file, true);
    new tp.obsidian.Notice("Создание заметки дня отменено, файл удалён.");
    throw new Error("Создание заметки дня отменено");
}
let title = tp.date.now() + "-" + user;
await tp.file.rename(title);

const devSlug = {
  "Галена Селезнева": "selezneva",
  "Ангел Весельчак": "veselchak",
  "Кости Герасимов": "gerasimov",
  "Ксаеро Великанов": "velikanov"
}[user];

tR += "---\n";
tR += `user: ${user}\n`;
tR += "cssclasses:\n";
tR += `  - dev-${devSlug}\n`;
tR += 'tags:\n';
tR += '- ' + tp.user.globalprops()+'\n'
tR += '- dailyComments\n'
tR += "---\n";
%>


```dataview 
TABLE WITHOUT ID round(Total, 2) as "Общее время внесенное за день"
WHERE file.path = this.file.path 
FLATTEN file.lists as Lists
WHERE Lists.spent
GROUP BY ""
FLATTEN sum(rows.Lists.spent) as Total
```
## Время на ритуалы спринта
 
<%*
tR += `* [cardref::[[${tp.file.path(false).split('/').slice(-3, -2)[0]}/tasks/_predefined/Планирование, митинги, ретроспектива, выпуск релизов]]]` 
 %>
  [action::agile] 
  [spent:: 0.0]
   Утренний митинг.

## ToDo
## Время на задачи спринта

`time-comment-add`

## Справка


`ctrl+shift+alt+T`:
	вставить заметку для фиксации времени на основе шаблона [[time-spent-comment-template]] 
	заметка должна быть элементом списка без отступов от края. 
`ctrl + space`:
	прыгнуть к следующему курсору в шаблоне
типы действий:
	agile
	fix
	feat
	docs
	sd
	review
	test
	other
	analysis
	refactor
	design
