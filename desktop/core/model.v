module core

import json2

// The record shapes match what the web client stores and syncs, so both
// clients can share the same TrailBase data. Like the web client, 0 and ''
// mean "not set" and are left out of the JSON.

pub const user_settings_key = 'user-settings'
pub const chart_settings_key = 'chart-settings'

pub struct Entry {
pub mut:
	date     string
	weight   f64
	bedtime  string
	sleep    f64
	waist    f64
	comments string
	rev      int
}

// clean drops values that cannot stand alone, as cleanWeightData does.
pub fn (mut e Entry) clean() {
	if e.bedtime == '' {
		e.sleep = 0
	}
}

pub fn (e Entry) is_empty() bool {
	return e.weight == 0 && e.bedtime == '' && e.sleep == 0 && e.waist == 0 && e.comments == ''
}

pub fn (e Entry) to_any() json2.Any {
	mut m := map[string]json2.Any{}
	m['date'] = e.date
	if e.weight != 0 {
		m['weight'] = e.weight
	}
	if e.bedtime != '' {
		m['bedtime'] = e.bedtime
	}
	if e.sleep != 0 {
		m['sleep'] = e.sleep
	}
	if e.waist != 0 {
		m['waist'] = e.waist
	}
	if e.comments != '' {
		m['comments'] = e.comments
	}
	m['_rev'] = e.rev
	return m
}

pub fn entry_from_any(key string, a json2.Any) Entry {
	m := as_map(a)
	mut e := Entry{
		date:     any_str(m['date'] or { json2.Any(key) })
		weight:   any_num(m['weight'] or { json2.null })
		bedtime:  any_str(m['bedtime'] or { json2.null })
		sleep:    any_num(m['sleep'] or { json2.null })
		waist:    any_num(m['waist'] or { json2.null })
		comments: any_str(m['comments'] or { json2.null })
		rev:      int(any_num(m['_rev'] or { json2.null }))
	}
	if e.date == '' {
		e.date = key
	}
	e.clean()
	return e
}

pub struct UserSettings {
pub mut:
	earliest_date string
	height        f64 // inches
	goal_weight   f64
	bedtime       string // goal bedtime, HH:MM
	rev           int
}

pub fn (s UserSettings) to_any() json2.Any {
	mut m := map[string]json2.Any{}
	if s.earliest_date != '' {
		m['earliestDate'] = s.earliest_date
	}
	if s.height != 0 {
		m['height'] = s.height
	}
	if s.goal_weight != 0 {
		m['goalWeight'] = s.goal_weight
	}
	if s.bedtime != '' {
		m['bedtime'] = s.bedtime
	}
	m['_rev'] = s.rev
	return m
}

pub fn user_settings_from_any(a json2.Any) UserSettings {
	m := as_map(a)
	return UserSettings{
		earliest_date: any_str(m['earliestDate'] or { json2.null })
		height:        any_num(m['height'] or { json2.null })
		goal_weight:   any_num(m['goalWeight'] or { json2.null })
		bedtime:       any_str(m['bedtime'] or { json2.null })
		rev:           int(any_num(m['_rev'] or { json2.null }))
	}
}

pub struct ChartSettings {
pub mut:
	duration      f64          = 9
	duration_unit DurationUnit = .month
	rev           int
}

pub fn (s ChartSettings) to_any() json2.Any {
	return json2.Any({
		'duration':     json2.Any(s.duration)
		'durationUnit': s.duration_unit.str()
		'_rev':         s.rev
	})
}

pub fn chart_settings_from_any(a json2.Any) ChartSettings {
	m := as_map(a)
	mut s := ChartSettings{
		duration:      any_num(m['duration'] or { json2.null })
		duration_unit: parse_duration_unit(any_str(m['durationUnit'] or { json2.null }))
		rev:           int(any_num(m['_rev'] or { json2.null }))
	}
	if s.duration <= 0 {
		s.duration = 9
	}
	return s
}

// goal_weight is the user's goal, or the weight at a BMI of 25 for their height.
pub fn (s UserSettings) goal() f64 {
	if s.goal_weight > 0 {
		return s.goal_weight
	}
	if s.height > 0 {
		return 25 * s.height * s.height / 703
	}
	return 0
}

// JSON helpers. Values written by older clients are not always the type you
// would expect (numbers as strings, for example), so read them leniently.

fn as_map(a json2.Any) map[string]json2.Any {
	return match a {
		map[string]json2.Any { a }
		else { map[string]json2.Any{} }
	}
}

fn any_str(a json2.Any) string {
	return match a {
		string { a }
		json2.Null { '' }
		f64, f32, i64, int, i32, i16, i8, u64, u32, u16, u8 { a.str() }
		else { '' }
	}
}

fn any_num(a json2.Any) f64 {
	return match a {
		f64 { a }
		f32 { f64(a) }
		i64 { f64(a) }
		int { f64(a) }
		i32 { f64(a) }
		i16 { f64(a) }
		i8 { f64(a) }
		u64 { f64(a) }
		u32 { f64(a) }
		u16 { f64(a) }
		u8 { f64(a) }
		string { parse_number(a) or { 0 } }
		else { 0 }
	}
}
