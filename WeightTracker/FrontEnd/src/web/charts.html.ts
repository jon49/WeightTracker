import { getGoalWeight, getWeeklyData } from "./js/charts-shared.v3"
import { avg, dateAdd, dateFill, formatNumber, getPreviousDay, isNil, setDefaults, stdev } from "./js/utils.v3"
import html from "./server/html-template-tag"
import layout from "./_layout.html"
import { ChartSettings, get, getMany, UserSettings, WeightData } from "./server/db"

async function getChartSettings() {
    let rawChartSettings = await get("chart-settings")
    return setDefaults(rawChartSettings, [["duration", 9], ["durationUnit", "month"]])
}

const render = ({ statsHeaderText, statsData }: { statsHeaderText: string, statsData: StatsData }) => html`
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
                <th>Sleep</th>
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
                <td>${statsData.sleep}</td> 
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

async function weeksToGo(
    userSettings: UserSettings | undefined,
    chartSettings: ChartSettings,
    weightDataGetter: (start: Date) => Promise<WeightData[]>) {

    const { avgValues } = await getWeeklyData(chartSettings, weightDataGetter),
        length = avgValues.length,
        currentWeight = avgValues[length - 1],
        goalWeight = getGoalWeight(userSettings)
    if (!goalWeight) return
    let all = new Array(length - 1), neg = new Array(length - 1)
    for (let index = 1; index < length; index++) {
        let difference = avgValues[index] - avgValues[index - 1]
        if (Number.isNaN(difference)) continue
        all[index - 1] = difference
        if (difference < 0) {
            neg[index - 1] = difference
        }
    }
    let avgAll = avg(all)
    let avgNeg = avg(neg)
    if (isNil(avgAll) || isNil(avgNeg)) return
    avgAll = -avgAll
    avgNeg = -avgNeg
    let diff = currentWeight - +goalWeight
    return `${formatNumber(diff/avgNeg, 1)} to ${formatNumber(diff/avgAll, 1)}`
}

async function setupStats() : Promise<{statsHeaderText: string, statsData: StatsData}> {
    const [chartSettings, userSettings] =
        await Promise.all([getChartSettings(), get("user-settings")])
    const now = new Date()
    const startDate = getPreviousDay(new Date(), 0)
    const dates = dateFill(startDate, now)
    const [previousData, dataUnfiltered] = await Promise.all([
            getMany<WeightData>(dateFill(dateAdd(startDate, -7), dateAdd(startDate, -1))),
            getMany<WeightData>(dates),
        ])
    const weeksToGoData = await weeksToGo(
        userSettings, chartSettings, (startDate: Date) => getMany(dateFill(startDate, new Date())))
    const data = dataUnfiltered.filter(x => x)
    const weights = data.filter(x => x.weight).map(x => x.weight)
    const averageWeight = avg(weights)
    const previousWeightAvg = avg(previousData.filter(x => x?.weight).map(x => x.weight))
    // @ts-ignore
    const previousWeekSleepAvg = avg(data.filter(x => x.sleep > 0).map(x => x.sleep))
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
            rate: previousWeightAvg && averageWeight ? formatNumber(averageWeight - previousWeightAvg, 2) : "N/A",
            sleep: formatNumber(previousWeekSleepAvg, 2),
        }
    }
}

interface StatsData {
    bmiPrime: string
    goalWeight: string | undefined
    rate: string | undefined
    sleep: string | undefined
    std: string | undefined
    weeksToGo: string | undefined
    weight: string | undefined
}

export default {
    route: /\/charts\/$/,
    get: async (req: Request) => {
        let data = await setupStats()
        let template = await layout(req)
        return template( { main: render(data), scripts: ["/web/js/charts-page.v3.js"] })
    }
}
