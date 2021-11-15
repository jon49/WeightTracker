import { DB, Module, ModuleStart } from "globals"
import { getChartSettings, weeksToGo, getGoalWeight } from "./shared/charts-shared.js"
import { avg, dateAdd, dateFill, formatNumber, getPreviousDay, stdev } from "./js/utils.js"

const { html, db: { get, getMany } } = app

let statsHeaderText : string
let statsData : StatsData

const start : ModuleStart = async () => {
    let o = await setupStats()
    statsData = o.statsData
    statsHeaderText = o.statsHeaderText
}

const render : Module["render"] = () => html`
<h2>Charts</h2>

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

<div data-action=create-chart>
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

async function setupStats() {
    const [chartSettings, userSettings] = await Promise.all([getChartSettings(), get("user-settings")])
    const now = new Date(),
        startDate = getPreviousDay(new Date(), 0),
        dates = dateFill(startDate, now),
        [previousData, dataUnfiltered, weeksToGoData] : [DB.WeightData[], DB.WeightData[], string | undefined] = await Promise.all([
            getMany(dateFill(dateAdd(startDate, -7), dateAdd(startDate, -1))),
            getMany(dates),
            weeksToGo()
        ]),
        data = dataUnfiltered.filter(x => x),
        weights = data.filter(x => x?.weight).map(x => x.weight),
        averageWeight = avg(weights),
        previousWeightAvg = avg(previousData.filter(x => x?.weight).map(x => x.weight)),
        std = stdev(weights)

    let bmiPrime : string | undefined
    let goalWeight = getGoalWeight(userSettings)
    if (userSettings?.height) {
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
    } as {statsHeaderText: string, statsData: StatsData}
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
    render, start
} as Module

