import { avg, dateAdd, dateFill, formatNumber, getPreviousDay, isNil, reduceSlice, setDefaults } from "./utils.v2.js"
import { get, getMany, UserSettings } from "./db.js"

export async function getChartSettings() {
    let rawChartSettings = await get("chart-settings")
    return setDefaults(rawChartSettings, [["duration", 9], ["durationUnit", "month"]])
}

export async function weeksToGo() {
    const { avgValues } = await getWeeklyData(),
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
    let avgAll = avg(all)
    let avgNeg = avg(neg)
    if (isNil(avgAll) || isNil(avgNeg)) return
    avgAll = -avgAll
    avgNeg = -avgNeg
    let diff = currentWeight - +goalWeight
    return `${formatNumber(diff/avgNeg, 1)} to ${formatNumber(diff/avgAll, 1)}`
}

export async function getWeeklyData() : Promise<WeeklyData> {
    const chartSettings = await getChartSettings()
    const startDate = getStartDate(chartSettings.duration, chartSettings.durationUnit)
    const dates = dateFill(startDate, new Date())
    const rawValues = await getMany(dates)
    const results = reduceSlice(dates, 7, (acc, x, i) => {
        let weight
        acc.date = acc.date ?? x
        if ((weight = rawValues[i]?.weight) && !!weight) {
            acc.min = 
                acc.min === null
                    ? weight
                : Math.min(acc.min, weight)
            acc.max =
                acc.max === null
                    ? weight
                : Math.max(acc.max, weight)
            acc.total += weight
            acc.count++
            return acc
        }
        return acc
    }, () => ({min: null, max: null, total: 0, count: 0, date: null} as {min: null|number, max: null|number, total: number, count: number, date: string|null}))

    const labels = new Array(results.length)
    const maxValues = new Array(results.length)
    const minValues = new Array(results.length)
    const avgValues = new Array(results.length)
    for (let index = 0; index < results.length; index++) {
        const r = results[index];
        labels[index] = r.date
        maxValues[index] = r.max
        minValues[index] = r.min
        avgValues[index] = r.count ? r.total/r.count : null
    }

    return {labels, maxValues, minValues, avgValues} as WeeklyData
}

export function getStartDate(duration: number, unit: "month"|"week"|"year") {
    let days
    if (unit === "year") {
        days = duration * 365
    } else if (unit === "month") {
        days = duration / 12 * 365
    } else /* week */ {
        days = duration * 7
    }
    return getPreviousDay(dateAdd(new Date(), -days - 7), 0 /* sunday */)
}

export function getGoalWeight(userSettings: UserSettings | undefined) : string | undefined {
    let goalWeight
    if (userSettings?.height) {
        let heightSquared = Math.pow(userSettings.height, 2)
        goalWeight = 25 * heightSquared / 703
    }
    if (userSettings?.goalWeight || goalWeight) {
        // @ts-ignore
        goalWeight = formatNumber(userSettings?.goalWeight ?? goalWeight, 2)
    }
    return <string|undefined>goalWeight
}

interface WeeklyData {
    labels: string[]
    maxValues: number[] 
    avgValues: number[]
    minValues: number[]
}
