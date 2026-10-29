module core

import time
import math

// Date is a calendar day with no time zone. Entries are keyed by its
// `YYYY-MM-DD` string, matching the web client's IndexedDB keys.
pub struct Date {
pub:
	year  int
	month int
	day   int
}

pub fn today() Date {
	t := time.now()
	return Date{t.year, t.month, t.day}
}

// default_entry_date mirrors the web app: after 8 PM the entry being worked
// on is tomorrow's (bedtime is recorded against the day you wake up).
pub fn default_entry_date() Date {
	t := time.now()
	d := Date{t.year, t.month, t.day}
	return if t.hour >= 20 { d.add_days(1) } else { d }
}

pub fn parse_date(s string) ?Date {
	parts := s.trim_space().split('-')
	if parts.len != 3 || parts[0].len != 4 {
		return none
	}
	for p in parts {
		if p.len == 0 || !p.bytes().all(it.is_digit()) {
			return none
		}
	}
	d := Date{parts[0].int(), parts[1].int(), parts[2].int()}
	if d.month < 1 || d.month > 12 || d.day < 1 || d.day > 31 {
		return none
	}
	// Reject impossible days such as 2023-02-30.
	if from_days(d.days()) != d {
		return none
	}
	return d
}

pub fn (d Date) str() string {
	return '${d.year:04}-${d.month:02}-${d.day:02}'
}

// days returns the number of days since 1970-01-01 (Howard Hinnant's
// days_from_civil), which makes date arithmetic plain integer math.
pub fn (d Date) days() int {
	y := if d.month <= 2 { d.year - 1 } else { d.year }
	era := (if y >= 0 { y } else { y - 399 }) / 400
	yoe := y - era * 400
	mp := (d.month + 9) % 12
	doy := (153 * mp + 2) / 5 + d.day - 1
	doe := yoe * 365 + yoe / 4 - yoe / 100 + doy
	return era * 146097 + doe - 719468
}

pub fn from_days(n int) Date {
	z := n + 719468
	era := (if z >= 0 { z } else { z - 146096 }) / 146097
	doe := z - era * 146097
	yoe := (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
	y := yoe + era * 400
	doy := doe - (365 * yoe + yoe / 4 - yoe / 100)
	mp := (5 * doy + 2) / 153
	d := doy - (153 * mp + 2) / 5 + 1
	m := if mp < 10 { mp + 3 } else { mp - 9 }
	return Date{if m <= 2 { y + 1 } else { y }, m, d}
}

pub fn (d Date) add_days(n int) Date {
	return from_days(d.days() + n)
}

// weekday returns 0 for Sunday through 6 for Saturday, like JS getDay().
pub fn (d Date) weekday() int {
	w := (d.days() + 4) % 7
	return if w < 0 { w + 7 } else { w }
}

// previous_weekday walks back (inclusive) to the given weekday.
pub fn (d Date) previous_weekday(target int) Date {
	mut r := d
	for r.weekday() != target {
		r = r.add_days(-1)
	}
	return r
}

pub fn (a Date) < (b Date) bool {
	return a.days() < b.days()
}

// date_fill returns every date from `from` to `to`, inclusive, as keys.
pub fn date_fill(from Date, to Date) []string {
	start := from.days()
	end := to.days()
	if end < start {
		return []
	}
	mut res := []string{cap: end - start + 1}
	for n in start .. end + 1 {
		res << from_days(n).str()
	}
	return res
}

pub enum DurationUnit {
	month
	week
	year
}

pub fn (u DurationUnit) str() string {
	return match u {
		.month { 'month' }
		.week { 'week' }
		.year { 'year' }
	}
}

pub fn parse_duration_unit(s string) DurationUnit {
	return match s {
		'week' { .week }
		'year' { .year }
		else { .month }
	}
}

// chart_start_date is where the weekly charts begin: the Sunday on or before
// `duration` units (plus one week) ago.
pub fn chart_start_date(now Date, duration f64, unit DurationUnit) Date {
	days := match unit {
		.year { duration * 365 }
		.month { duration / 12 * 365 }
		.week { duration * 7 }
	}
	return now.add_days(-int(math.floor(days)) - 7).previous_weekday(0)
}

// Times are stored as 24 hour `HH:MM` strings, as an `<input type=time>` does.

// parse_time accepts `H:MM`, `HH:MM`, `HHMM`, and 12 hour forms such as
// `10:30 PM` (which some very old entries contain) and returns minutes
// since midnight.
pub fn parse_time(s string) ?int {
	mut t := s.trim_space().to_upper()
	if t == '' {
		return none
	}
	mut pm := false
	mut am := false
	if t.ends_with('PM') || t.ends_with('P') {
		pm = true
	} else if t.ends_with('AM') || t.ends_with('A') {
		am = true
	}
	t = t.trim_right('APM ').trim_space()
	mut h := 0
	mut m := 0
	if t.contains(':') {
		parts := t.split(':')
		if parts.len != 2 || parts[0] == '' || parts[1].len != 2 {
			return none
		}
		if !(parts[0] + parts[1]).bytes().all(it.is_digit()) {
			return none
		}
		h = parts[0].int()
		m = parts[1].int()
	} else {
		if t == '' || !t.bytes().all(it.is_digit()) || t.len > 4 {
			return none
		}
		if t.len <= 2 {
			h = t.int()
		} else {
			h = t[..t.len - 2].int()
			m = t[t.len - 2..].int()
		}
	}
	if am || pm {
		if h < 1 || h > 12 {
			return none
		}
		if h == 12 {
			h = 0
		}
		if pm {
			h += 12
		}
	}
	if h > 23 || m > 59 {
		return none
	}
	return h * 60 + m
}

pub fn format_time(minutes int) string {
	return '${minutes / 60:02}:${minutes % 60:02}'
}

// normalize_time turns user input into `HH:MM`.
pub fn normalize_time(s string) ?string {
	return format_time(parse_time(s)?)
}

pub fn now_time() string {
	t := time.now()
	return format_time(t.hour * 60 + t.minute)
}

// display_time shows a stored time in 12 hour form, e.g. `10:30 PM`.
pub fn display_time(s string) string {
	mins := parse_time(s) or { return s }
	h := mins / 60
	suffix := if h >= 12 { 'PM' } else { 'AM' }
	h12 := if h % 12 == 0 { 12 } else { h % 12 }
	return '${h12}:${mins % 60:02} ${suffix}'
}

// hours_slept computes the time between bedtime and wake up, assuming the
// wake up is within the next 24 hours.
pub fn hours_slept(bedtime string, wake string) ?f64 {
	b := parse_time(bedtime)?
	mut w := parse_time(wake)?
	if w < b {
		w += 24 * 60
	}
	return round(f64(w - b) / 60, 2)
}
