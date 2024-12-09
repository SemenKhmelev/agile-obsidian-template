<%* 
tp
let user = await tp.system.suggester(["Галена Селезнева", "Ангел Весельчак", "Кости Герасимов", "Ксаеро Великанов"], ["Галена Селезнева", "Ангел Весельчак", "Кости Герасимов", "Ксаеро Великанов", ]);
let debtDate = await tp.system.prompt("Enter the date for which you owe the debt", tp.date.now());
let debtValue = await tp.system.prompt("Please enter a debt value");

let title = debtDate + "-" + user;
await tp.file.rename(title);

tR += "---\n";
tR += `user: ${user}\n`;
tR += `debt: ${debtValue}\n`;
//tR += `date: null\n`;
tR += 'tags:\n';
tR += '- ' + tp.user.globalprops()+'\n'
tR += "---\n";
%>

```dataview 
Table WITHOUT ID
	this.file.frontmatter.debt as "Debt",
	Total as "Worked"
FROM [[#]]
WHERE contains(file.path, "debts")
FLATTEN file.lists as Lists
WHERE Lists.cardref = this.file.link
GROUP BY ""
FLATTEN sum(rows.Lists.spent) as Total
```

## Список отработанных долгов

#### Справка

Учет временного долга ради скорости реализован на механизмах учета время потраченного на задачи, потом он так странно и ведется. 
Необходимо зафиксировать отработанное время в сославшись на текущий файл в `cardref`:

`ctrl+shift+alt+T`:
	вставить заметку для фиксации времени на основе шаблона [[time-spent-comment-template]] 
`ctrl + space`:
	прыгнуть к следующему курсоры в шаблоне

## Комментарии

```dataviewjs
let page = dv.current(); 
let pages = new Set();
let stack = [page];
console.log("Построение списка комментариев к карточке долга...")

while (stack.length > 0) { 
  let meta = stack.pop();

  if (!meta) continue; 
  for (let inlink of meta.file.inlinks.array()) { 
    if (pages.has(inlink.path)) 
	    continue;   
    pages.add(inlink.path);         
  }   
} 

let listItems = dv.array(Array.from(pages)).map(p => dv.page(p)).map(page => page.file.lists).flatMap(lists => lists);
listItems = listItems.filter(listItem => listItem.cardref && listItem.cardref.path   === page.file.path)
let listItemAndPageList = listItems.map(item => { return {"listItem": item, "page": dv.page(item.header.path)}})

listItemAndPageList = listItemAndPageList.sort(item => item.page.file.day, "desc")
listItemAndPageList.forEach(item => {
  dv.header(6, item.page.file.link)
  dv.paragraph(item.listItem.text)   
  console.log(item.listItem.children)
  if (item.listItem.children.length != 0) {
	 dv.paragraph("- " + dv.array(item.listItem.children).text.join("\n- "))
  }
})
console.log("Конец => Построение списка комментариев к карточке.")
```

