import { ChartSettings, UserSettings, WeightData } from "../server/db.js"
import { RoutePage } from "@jon49/sw/routes.middleware.js"

let {
    charts: { getGoalWeight, getWeeklyData },
    db: { get, getMany },
    html,
    layout,
    utils: { avg, dateAdd, dateFill, formatNumber, getPreviousDay, isNil, setDefaults, stdev },
} = self.app

async function getChartSettings() {
    let rawChartSettings = await get("chart-settings")
    return setDefaults(rawChartSettings, [["duration", 9], ["durationUnit", "month"]])
}

const render = ({ statsHeaderText, statsData }: { statsHeaderText: string, statsData: StatsData }) => html`
<h2>Charts <a href="/web/charts/edit" title="Edit Chart Settings" aria-label="Edit Chart Settings">&#9881;</a></h2>

<div>
    <h3>${statsHeaderText}</h3>
<div class="overflow-auto">
    <table>
        <thead>
            <tr>
                <th>Weight</th>
                <th>Rate</th>
                <th>BMI Prime</th>
                <th>Sleep</th>
                <th>Weeks to Go</th>
                <th>&sigma;</th>
                <th>Goal</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>${statsData.weight}</td>
                <td>${statsData.rate}</td>
                <td>${statsData.bmiPrime}</td>
                <td>${statsData.sleep}</td>
                <td>${statsData.weeksToGo}</td>
                <td>${statsData.std}</td>
                <td>${statsData.goalWeight}</td>
            </tr>
        </tbody>
    </table>
</div>
</div>

<div id=create-chart class="flex">
    <button traits=chart-button data-chart=chart-history>History</button>
    <button traits=chart-button data-chart=chart-average>Average</button>
    <button traits=chart-button data-chart=chart-histogram>Histogram</button>
    <button traits=chart-button data-chart=chart-bedtime>Bedtime</button>
    <button traits=chart-button data-chart=chart-sleep>Sleep</button>
    <button traits=chart-button data-chart=chart-rate>Rate</button>
</div>

<div id=charts-location></div>
`

async function weeksToGo(
    userSettings: UserSettings | undefined,
    chartSettings: ChartSettings,
    weightDataGetter: (start: Date) => Promise<WeightData[]>) {

    const weeklyData = await getWeeklyData(chartSettings, weightDataGetter)
    if (!weeklyData) return
    let { avgValues } = weeklyData
    const length = avgValues.length,
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
    return `${formatNumber(diff / avgNeg, 1)} to ${formatNumber(diff / avgAll, 1)}`
}

async function setupStats(): Promise<{ statsHeaderText: string, statsData: StatsData }> {
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

const route: RoutePage = {
    get: async () => {
        let data = await setupStats()
        return layout({
            main: render(data),
            scripts: [
                "/web/js/chart.min.js",
                "/web/js/charts-page.bundle.js",
            ],
            title: "Charts",
        })
    }
}

export default route
