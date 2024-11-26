console.log("Загрузка _scripts/dataset.js")

/**
 * Возращает сырой денормализованный массив данных, где каждая строка является одним внесением времени из файла комментария. 
 * @param {*} dvarg передать актуальный dv 
 * @param {*} sprintFolder путь до папки с спринтом по которому будет получены данные
 * @returns формат релизата лучше смотреть в инструкции return
 */
function getRawSprintCommentData(dvarg, sprintFolder) {

    let commentPages = dvarg.pages(`"${sprintFolder}/comments"`)
       
    commentPages = commentPages.filter(p => p.tags).filter(p => dvarg.array(p.tags).includes("dailyComments"))
    console.log(commentPages)
    
    let listItemsFromAllComments = commentPages.flatMap(page => page.file.lists).filter(listItem => listItem.cardref)   
    let getDateFromFileName = (fileName) => {
      const parts = fileName.split('-');
      let date = new Date(parts[0], parts[1] - 1, parts[2]);
      if (!(date instanceof Date) || isNaN(date)) {
        console.error("Invalid filename of comment: ", fileName);
      }
      return date;
    }
    
    let rawData = listItemsFromAllComments
        .map(comment => {
            const page = dvarg.page(comment.path.toString());
            return {"user": page.file.frontmatter.user, "listItem": comment, "date": getDateFromFileName(page.file.name)}})
    return rawData;
}

/**
 * Возращает сырой массив данных по задачам, где каждая строка - карточка. 
 * Отличается от {@link getRawSprintCommentData()} тем, что в данных возвращаемых этой функцией
 * есть карточки у которых нет ни одного комментария
 * @param {*} dvarg передать актуальный dv 
 * @param {*} sprintFolder путь до папки с спринтом по которому будет получены данные
 * @returns формат релизата лучше смотреть в инструкции return
 */
function getRawSprintTaskData(dv, sprintFolder) {
  var taskPages = dv.pages(`"${sprintFolder}/tasks"`)
  
  //taskPages = taskPages.where(page => page.tags).where(page => dv.array(page.tags).includes("task"));
  const taskData =  taskPages.map(page => {
      const listItems = page.file.inlinks.
        map(link => dv.page(link.path)).
        where(page => page.tags && dv.array(page.tags).includes("dailyComments")). 
        flatMap(page => page.file.lists).
        where(listItem => listItem.cardref && listItem.cardref.path   === page.file.path)
      return {"page": page, "listItems": listItems}
  })

  return taskData

}

exports.default = (arg) => {console.log(arg)}
exports.getRawSprintCommentData = getRawSprintCommentData;
exports.getRawSprintTaskData = getRawSprintTaskData;