import { round } from "../utils.js"

function hoursAfterGoalTimeWithin12Hours(time: number, goalTime: number) {
    let hours = time - goalTime
    if (hours < 0) {
        hours += 24
    }
    if (hours > 12) {
        return 0
    }
    return hours
}

export function timeToNumber(bedtime: string) {
    let b = bedtime.split(":")
    return round(+b[0] + +b[1] / 60, 3)
}

export function bedtimeSuccess(times: number[], goalTime: number) {
    return times.map(x => round(1 - hoursAfterGoalTimeWithin12Hours(x, goalTime) / 12, 3))
}

