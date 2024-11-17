---
user: Ангел Весельчак
estimate: 55
tags:
  - sprint2
  - task
---

```dataview 
Table WITHOUT ID
	this.file.frontmatter.estimate as "Estimate",
	Total as "Spent"
FROM [[#]]
WHERE contains(file.path, "comments")
FLATTEN file.lists as Lists
WHERE Lists.cardref = this.file.link
GROUP BY ""
FLATTEN sum(rows.Lists.spent) as Total
```

```dataview 
TABLE WITHOUT ID
	user as "User",
	Total as "Spent"
FROM [[#]]
WHERE contains(file.folder, "comments")
FLATTEN file.lists as Lists
WHERE Lists.cardref = this.file.link
GROUP BY user
FLATTEN sum(rows.Lists.spent) as Total
```
- [x] **Reproduce the Error (3)**  
  Attempt to open the BPMN frame in a controlled environment and capture logs to identify the root cause.
- [x] **Analyze Root Cause (5)**  
  Investigate the logs and codebase to pinpoint the issue (e.g., missing dependencies, incorrect initialization).
- [ ] **Implement Fix (8)**  
  Apply the necessary code changes or configuration updates to resolve the error.
- [ ] **Test the Fix (5)**  
  Verify that the BPMN frame opens correctly across various scenarios and environments.
- [ ] **Deploy and Monitor (3)**  
  Deploy the fix to production and monitor usage to ensure no regressions.
## Комментарии

```dataviewjs
await dv.view("views/task-comments", {"dv": dv});
```
