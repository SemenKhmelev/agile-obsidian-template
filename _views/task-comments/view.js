console.log( "\n#################################################\n" +
             "        START TASK COMMETS VIEW BUILD                " + 
			       "\n#################################################\n");

dv = input.dv;

let page = dv.current(); 
let pages = new Set();
let tasksPages = [];
while (page) {
  console.log(page)
  tasksPages.push(page);
  prevlink = page.file.frontmatter.previous;
  if (prevlink) {
    page = dv.page(dv.parse(prevlink).path);
  } else {
    page = null;
  }
}

console.log(tasksPages);

//let tasksPages = [page];
console.log("Построение списка комментариев к карточке...")

for (meta of tasksPages) { 
  if (!meta) continue; 
  for (let inlink of meta.file.inlinks.array()) { 
    if (pages.has(inlink.path)) 
	    continue;   
    pages.add(inlink.path);         
  }   
} 

pagesPaths = dv.array(tasksPages).map(page => page.file.path);
let listItems = dv.array(Array.from(pages)).map(p => dv.page(p)).map(page => page.file.lists).flatMap(lists => lists);
listItems = listItems.filter(listItem => listItem.cardref && pagesPaths.includes(listItem.cardref.path));
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