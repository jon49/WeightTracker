import { getChartSettings, weeksToGo, getGoalWeight } from "./js/charts-shared.v2.js"
import { avg, dateAdd, dateFill, formatNumber, getPreviousDay, isNil, stdev } from "./js/utils.v2.js"
import html from "./js/html-template-tag.js"
import layout from "./_layout.html.js"
import { get, getMany } from "./js/db.js"

const render = ({ statsHeaderText, statsData }: { statsHeaderText: string, statsData: StatsData }) => html`
<h2 id=subtitle>Charts</h2>

<a href="/web/charts/edit">Edit Chart Settings</a>
<div>
    <h3>${statsHeaderText}</h3>
    <table>
        <thead>
            <tr>
                <th>BMI Prime</th>
                <th>Weeks to Go</th>
                <th>&sigma;</th>
                <th>Goal</th>
                <th>Weight</th>
                <th>Rate</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>${statsData.bmiPrime}</td>
                <td>${statsData.weeksToGo}</td>
                <td>${statsData.std}</td>
                <td>${statsData.goalWeight}</td>
                <td>${statsData.weight}</td>
                <td>${statsData.rate}</td> 
            </tr>
        </tbody>
    </table>
</div>

<div id=create-chart>
    <button id=chart-weight-btn>History</button>
    <button id=chart-weight-average-btn>Average</button>
    <button id=chart-histogram-btn>Histogram</button>
    <button id=chart-sleep-btn>Sleep</button>
    <button id=chart-rate-btn>Rate</button>
</div>
<div id=charts-location></div>

<template id=chart-weight-template>
    <div><canvas id=chart-weight></canvas></div>
</template>

<template id=chart-weight-average-template>
    <div><canvas id=chart-weight-average></canvas></div>
</template>

<template id=chart-histogram-template>
    <div><canvas id=chart-histogram></canvas></div>
</template>

<template id=chart-sleep-template>
    <div><canvas id=chart-sleep></canvas></div>
</template>

<template id=chart-rate-template>
    <div><canvas id=chart-rate></canvas></div>
</template>`

async function setupStats() : Promise<{statsHeaderText: string, statsData: StatsData}> {
    const [chartSettings, userSettings] = await Promise.all([getChartSettings(), get("user-settings")])
    const now = new Date()
    const startDate = getPreviousDay(new Date(), 0)
    const dates = dateFill(startDate, now)
    const [previousData, dataUnfiltered, weeksToGoData] = await Promise.all([
            getMany(dateFill(dateAdd(startDate, -7), dateAdd(startDate, -1))),
            getMany(dates),
            weeksToGo()
        ])
    const data = dataUnfiltered.filter(x => x)
    const weights = data.filter(x => x?.weight).map(x => x.weight)
    const averageWeight = avg(weights)
    const previousWeightAvg = avg(previousData.filter(x => x?.weight).map(x => x.weight))
    const std = stdev(weights)

    let bmiPrime
    let goalWeight = getGoalWeight(userSettings)
    if (userSettings?.height && !isNil(averageWeight)) {
        let heightSquared = Math.pow(userSettings.height, 2)
        bmiPrime = formatNumber(averageWeight / heightSquared * 703 / 25, 3)
    }

    return {
        statsHeaderText: `Stats for past ${chartSettings.duration} ${chartSettings.durationUnit}s`,
        statsData: {
            bmiPrime: bmiPrime || "",
            weeksToGo: weeksToGoData,
            std: formatNumber(std, 2),
            goalWeight,
            weight: formatNumber(averageWeight, 2),
            rate: previousWeightAvg && averageWeight ? formatNumber(averageWeight - previousWeightAvg, 2) : "N/A"
        }
    }
}

interface StatsData {
    bmiPrime: string
    weeksToGo: string | undefined
    std: string | undefined
    goalWeight: string | undefined
    weight: string | undefined
    rate: string | undefined
}

export default {
    route: /\/charts\/$/,
    get: async (req: Request) => {
        let data = await setupStats()
        let template = await layout(req)
        return template( { main: render(data), script: "/web/js/charts-page.v2.js" })
    }
}
