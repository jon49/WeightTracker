import { DB } from "globals"
import { avg, dateAdd, dateFill, formatNumber, getPreviousDay, reduceSlice, setDefaults } from "../js/utils.js"

const { db: { get, getMany } } = app

export async function getChartSettings() {
    const rawChartSettings = await get("chart-settings")
    return setDefaults(rawChartSettings, [["duration", 9], ["durationUnit", "month"]])
}

export async function weeksToGo() {
    const { avgValues } : WeeklyData = await getWeeklyData(),
        length = avgValues.length,
        userSettings = await get("user-settings"),
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
    let avgAll = -avg(all)
    let avgNeg = -avg(neg)
    let diff = currentWeight - +goalWeight
    return `${formatNumber(diff/avgNeg, 1)} to ${formatNumber(diff/avgAll, 1)}`
}

export async function getWeeklyData() {
    const chartSettings = await getChartSettings()
    const startDate = getStartDate(chartSettings?.duration ?? 9, chartSettings?.durationUnit ?? "month")
    const dates = dateFill(startDate, new Date())
    const rawValues : DB.WeightData[] = (await getMany(dates))
    const results = reduceSlice(dates, 7, (acc, x, i) => {
        if (acc.date) return acc
        acc.date = x
        const weights = rawValues.slice(i, i + 7).filter(x => x?.weight).map(x => x.weight)
        if (weights.length === 0) return acc
        acc.min = Math.min(...weights)
        acc.max = Math.max(...weights)
        acc.avg = avg(weights)
        return acc
    }, () => <{min: null|number, max: number|null, avg: number|null, date: string|null}>({min: null, max: null, avg: null, date: null}))

    return {
        labels: results.map(x => x.date),
        maxValues: results.map(x => x.max),
        minValues: results.map(x => x.min),
        avgValues: results.map(x => x.avg)
    } as WeeklyData
}

export function getStartDate(duration : number, unit : "month" | "week" | "year") {
    let days =
        unit === "year"
            ? duration * 365
        : unit === "month"
            ? duration / 12 * 365
        : unit === "week"
            ? duration * 7
        : 0
    return getPreviousDay(dateAdd(new Date(), -days - 7), 0 /* sunday */)
}

export function getGoalWeight(userSettings: DB.UserSettings | undefined) : string | undefined {
    let goalWeight
    if (userSettings?.height) {
        let heightSquared = Math.pow(userSettings.height, 2)
        goalWeight = 25 * heightSquared / 703
    }
    goalWeight = formatNumber(userSettings?.goalWeight ?? goalWeight, 2)
    return goalWeight
}

interface WeeklyData {
    labels: string[]
    maxValues: number[] 
    avgValues: number[]
    minValues: number[]
}
