<%* 
tp
let user = await tp.system.suggester(["Галена Селезнева", "Ангел Весельчак", "Кости Герасимов", "Ксаеро Великанов"], ["Галена Селезнева", "Ангел Весельчак", "Кости Герасимов", "Ксаеро Великанов"]);
let title = tp.date.now() + "-" + user;
await tp.file.rename(title);

tR += "---\n";
tR += `user: ${user}\n`;
tR += 'tags:\n';
tR += '- ' + tp.user.globalprops()+'\n'
tR += '- dailyComments\n'
tR += "---\n";
%>


```dataview 
TABLE WITHOUT ID Total as "Общее время внесенное за день"
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
  Утренний митинг

## Время на задачи спринта


## Справка

Каждая заметка должна быть выполнена отдельным элементом списка. 

`ctrl+shift+alt+T`:
	вставить заметку для фиксации времени на основе шаблона [[time-spent-comment-template]] 
	заметка должна быть элементом списка без отступов от края. 
`ctrl + space`:
	прыгнуть к следующему курсоры в шаблоне
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

