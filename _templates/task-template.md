<%*
const devs = ["Галена Селезнева","Ангел Весельчак","Кости Герасимов","Ксаеро Великанов"];
const taskUser = await tp.system.suggester(devs, devs, false, "Исполнитель задачи...");
%>---
user: <% taskUser %>
estimate: 
tags:
  - <%* tR += tp.user.globalprops() %>
  - task
previous: 
estimate (1st): 
estimate_sprint: 
issue_task: 
issue_dp: 
activity: <% await tp.system.suggester(["feat", "fix", "docs", "refactor", "test", "sd", "design", "devops"], ["feat", "fix", "docs", "refactor", "test", "sd", "design", "devops"], false, "Выберите основную цель деятельности задачи...")%>
parent:
---

<% tp.file.include("[[_templates/task-template-memo.md]]") %>

```dataviewjs
await dv.view("views/task-spent-summary", { dv });
```

```dataview 
TABLE WITHOUT ID
	user as "User",
	Total as "SpentSprint"
FROM [[#]]
WHERE contains(file.folder, "comments")
FLATTEN file.lists as Lists
WHERE Lists.cardref = this.file.link
GROUP BY user
FLATTEN sum(rows.Lists.spent) as Total
```


## Комментарии

```dataviewjs
await dv.view("views/task-comments", {"dv": dv});
```
