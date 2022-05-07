import { DB, Form, Module } from "globals"
import { dateToString, formatNumber, toNumber } from "../js/utils.js"

const { html, db: { get, set } } = app

const start = async (req: Request) => {
    const url = new URL(req.url)
    let date = url.searchParams.get("date") ?? dateToString(new Date())
    let data = await get<DB.WeightData>(date)
    let weightData : Form.FormReturn<DB.WeightData> = {
        bedtime: data?.bedtime,
        comments: data?.comments,
        date,
        sleep: formatNumber(data?.sleep),
        waist: formatNumber(data?.waist),
        weight: formatNumber(data?.weight)
    }
    return weightData
}

async function post(data: DB.WeightData) {
    if (!/\d{4}-[01]\d-[0123]\d/.test(data.date)) {
        return Promise.reject({ message: "Date is required!", error: new Error("post:/sw/entries/edit/")})
    }

    const cleanData : DB.WeightData = {
        bedtime: data.bedtime,
        comments: data.comments,
        date: data.date,
        sleep: toNumber(data.sleep),
        waist: toNumber(data.waist),
        weight: toNumber(data.weight)
    }
    await set(cleanData.date, data)
}

const $updatableForm = ({ bedtime, comments, sleep, waist, weight }: Form.FormReturn<DB.WeightData>) => html`
<div id=partial-data>
    <label>Weight<br>
    <input name=weight type=number step=any value="${weight}"></label><br><br>

    <label>Bedtime<br>
        <input name=bedtime type=datetime value="${bedtime}">
    </label><br><br>

    <label>Number of hours slept<br>
        <input name=sleep type=number step=any value="${sleep}">
    </label><br><br>

    <label>Waist Size (cm)<br>
        <input id=entry-waist name=waist type=number step=any values="${waist}">
    </label><br><br>

    <label>Comment<br>
        <textarea id=entry-comments name=comments values="${comments}"></textarea>
    </label><br><br>
</div>`

const $form = (o: Form.FormReturn<DB.WeightData>) => html`
<form id=entry-form>
    <label>Date<br>
    <input id=entry-date name=date type=date required value="${o.date}"></label><br><br>

    ${$updatableForm(o)}

    <button>Submit</button>
</form>`

const render = (weightData: Form.FormReturn<DB.WeightData>) =>
    html`<h2>Add/Edit Entry</h2>${$form(weightData)}`

export default {
    get: async req => {
        let data = await start(req)
        return render(data)
    },
    post: async (_, data, req) => {
        await post(data)
        return {
            partial: async () => {
                let data = await start(req)
                return $updatableForm(data)
            },
            redirect: "/app/entries/edit/"
        }
    }
} as Module
