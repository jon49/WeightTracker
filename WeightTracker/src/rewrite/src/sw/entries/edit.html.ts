import { DB, Form, Module, ModuleStart } from "globals"
import { dateToString, formatNumber, getFormData, toNumber } from "../js/utils"

const { html, db: { get, set } } = app

let weightData : Form.FormReturn<DB.WeightData>
let partialData : boolean

const start : ModuleStart = async req => {
    if (req.headers.get("post") === "POST") {
        return post(await req.formData())
    }
    partialData = req.headers.has("HF-Request")
    const url = new URL(req.url)
    let date = url.searchParams.get("date") ?? dateToString(new Date())
    let data = await get<DB.WeightData>(date)
    weightData = {
        bedtime: data?.bedtime,
        comments: data?.comments,
        date,
        sleep: formatNumber(data?.sleep),
        waist: formatNumber(data?.waist),
        weight: formatNumber(data?.weight)
    }
}

async function post(formData: FormData) {
    if (!/\d{4}-[01]\d-[0123]\d/.test(<string>formData.get("date"))) {
        return Promise.reject({ message: "Date is required!", error: new Error("post:/sw/entries/edit/")})
    }

    const form = getFormData<DB.WeightData>(formData)

    const data : DB.WeightData = {
        bedtime: form.bedtime,
        comments: form.comments,
        date: form.date,
        sleep: toNumber(form.sleep),
        waist: toNumber(form.waist),
        weight: toNumber(form.weight)
    }
    await set(data.date, data)
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

const $partialData = () => $updatableForm(weightData)

const render = () =>
    partialData
        ? $partialData
    : html`<h2>Add/Edit Entry</h2>${$form(weightData)}`

export default {
    render, start
} as Module
