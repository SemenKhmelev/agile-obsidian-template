console.log( "\n#################################################\n" +
             "        START ACTION REPORT VIEW BUILD           " + 
			 "\n#################################################\n");

var ds = require(app.vault.adapter.basePath + "/_scripts/dataset.js");

console.log(input)
console.log(ds)
const folderName = input.dv.current().file.folder
const rawCommentData = ds.getRawSprintCommentData(input.dv, `${folderName.slice(0,folderName.lastIndexOf("/"))}`);

//-------------------------------------------------------------------
input.dv.header(2, "Группировка времени(spent) по деятельности")
let actionRecs = rawCommentData.groupBy(rec => rec.listItem.action)
const actionSpentSummaries = actionRecs.map(recs => {
    let spentSummary =  Array.from(recs.rows).reduce((acc, row) => acc + row.listItem.spent, 0)
    return [recs.key, Number(spentSummary.toFixed(1))]
}).sort(rec => rec[1], "desc");

input.dv.table(actionSpentSummaries.map(e => e[0]).array(), [actionSpentSummaries.map(e => e[1]).array()])


function createColorPalette(value) {
    var v = 255/value;
    var palette = []
    let r = 0, g = 0, b = 0
    for (i = 0; i < value; i++) {
        r = r + v;
        g = g + v;
        b = b + v;
        palette.push(`rgb(${r}, ${g}, ${b})`)
    }   
    return palette; 
}

const labels = actionSpentSummaries.map(e => e[0]).array()
const palettes = createColorPalette(labels.length)
const basic_palette = ["#008000", "red", "#f5a623", "#ccff00", "#008080", "#05465d", "#ffcf40", "#0b9fd5", "#9dc3cc", "#f2f9fd"]

const chartData = {
    type: 'doughnut',
    data: {
        labels: labels,
        datasets: [{
            data: actionSpentSummaries.map(e => e[1]).array(),
            backgroundColor: basic_palette,
        }],

    },
    // options: {
    //     plugins: {
    //       customCanvasBackgroundColor: {
    //         color: 'lightGreen',
    //       }
    //     }
    //   },
    //plugins: [plugin],
    
}

el = input.dv.el("div","")
window.renderChart(chartData, el)

el.style.marginTop='40px';
el.style.width = "500px"

