module core

// Chart and stats calculations, ported from the web client's charts page.
// They produce plain data; drawing is up to the GUI.

pub enum ChartKind {
	history
	average
	histogram
	bedtime
	sleep
	rate
}

pub const all_charts = [ChartKind.history, .average, .histogram, .bedtime, .sleep, .rate]

pub fn (k ChartKind) title() string {
	return match k {
		.history { 'History' }
		.average { 'Average' }
		.histogram { 'Histogram' }
		.bedtime { 'Bedtime' }
		.sleep { 'Sleep' }
		.rate { 'Rate' }
	}
}

pub enum ChartStyle {
	line
	bar
}

pub struct Series {
pub:
	label       string
	values      []f64 // NaN where there is no value
	color       u32   // 0xRRGGBB
	show_points bool = true
	right_axis  bool
}

// AxisLimits pins an axis end; NaN means "fit the data".
pub struct AxisLimits {
pub:
	min f64 = missing
	max f64 = missing
}

pub struct ChartData {
pub:
	kind   ChartKind
	style  ChartStyle
	labels []string
	series []Series
	left   AxisLimits
	right  AxisLimits
}

pub fn (c ChartData) has_right_axis() bool {
	return c.series.any(it.right_axis)
}

// window returns the part of the chart from label lo to label hi, inclusive.
pub fn (c ChartData) window(lo int, hi int) ChartData {
	return ChartData{
		...c
		labels: c.labels[lo..hi + 1]
		series: c.series.map(Series{
			...it
			values: it.values[lo..hi + 1]
		})
	}
}

// label_index returns the last label at or before `key` (a date, or a
// weight for the histogram), or 0 when key comes before them all.
pub fn (c ChartData) label_index(key string) int {
	mut i := 0
	for j, l in c.labels {
		before := if c.kind == .histogram { l.f64() <= key.f64() } else { l <= key }
		if !before {
			break
		}
		i = j
	}
	return i
}

pub fn (s &Store) chart(kind ChartKind, now Date) ?ChartData {
	return match kind {
		.history { s.history_chart(now) }
		.average { s.average_chart(now) }
		.histogram { s.histogram_chart(now) }
		.bedtime { s.bedtime_chart(now) }
		.sleep { s.sleep_chart(now) }
		.rate { s.rate_chart(now) }
	}
}

const red = u32(0xff6384)
const green = u32(0x63ff83)
const blue = u32(0x6391ff)
const dark_green = u32(0x00c800)

fn weight_of(e Entry) f64 {
	return e.weight
}

fn sleep_of(e Entry) f64 {
	return e.sleep
}

fn nan_if_unset(values []f64) []f64 {
	return values.map(if has_value(it) { it } else { missing })
}

pub struct WeeklyWeights {
pub:
	labels []string
	min    []f64
	max    []f64
	avg    []f64
}

// weekly_weights groups weights into weeks starting on Sunday, over the
// period set in the chart settings.
pub fn (s &Store) weekly_weights(now Date) WeeklyWeights {
	cs := s.chart_settings
	dates := date_fill(chart_start_date(now, cs.duration, cs.duration_unit), now)
	weights := s.values(dates, weight_of)
	mut labels := []string{}
	mut mins := []f64{}
	mut maxs := []f64{}
	mut avgs := []f64{}
	for i := 0; i < dates.len; i += 7 {
		end := if i + 7 < dates.len { i + 7 } else { dates.len }
		week := weights[i..end].filter(has_value(it))
		labels << dates[i]
		if week.len == 0 {
			mins << missing
			maxs << missing
			avgs << missing
			continue
		}
		mut lo := week[0]
		mut hi := week[0]
		for w in week {
			if w < lo {
				lo = w
			}
			if w > hi {
				hi = w
			}
		}
		mins << lo
		maxs << hi
		avgs << avg(week)
	}
	return WeeklyWeights{labels, mins, maxs, avgs}
}

fn (s &Store) history_chart(now Date) ?ChartData {
	start := s.earliest_date()?
	labels := date_fill(start, now)
	values := nan_if_unset(s.values(labels, weight_of))
	return ChartData{
		kind:   .history
		labels: labels
		series: [
			Series{
				label:  'Weight'
				values: values
				color:  red
			},
		]
	}
}

fn (s &Store) average_chart(now Date) ?ChartData {
	w := s.weekly_weights(now)
	if w.labels.len == 0 {
		return none
	}
	r := fn (v f64) f64 {
		return if is_missing(v) { v } else { round(v, 1) }
	}
	return ChartData{
		kind:   .average
		labels: w.labels
		series: [
			Series{
				label:  'Max'
				values: w.max.map(r(it))
				color:  red
			},
			Series{
				label:  'Average'
				values: w.avg.map(r(it))
				color:  green
			},
			Series{
				label:  'Min'
				values: w.min.map(r(it))
				color:  blue
			},
		]
	}
}

fn (s &Store) rate_chart(now Date) ?ChartData {
	w := s.weekly_weights(now)
	if w.labels.len < 2 {
		return none
	}
	mut labels := []string{}
	mut gained := []f64{}
	mut lost := []f64{}
	mut total := 0.0
	mut lost_total := 0.0
	mut count := 0
	for i in 1 .. w.avg.len {
		first := w.avg[i - 1]
		last := w.avg[i]
		labels << w.labels[i]
		mut pos := missing
		mut neg := missing
		if has_value(first) && has_value(last) {
			count++
			diff := last - first
			total += diff
			if diff > 0 {
				pos = round(diff, 2)
			} else {
				neg = round(diff, 2)
				lost_total += diff
			}
		}
		gained << pos
		lost << neg
	}
	overall := if count > 0 { round(total / count, 2) } else { missing }
	overall_loss := if count > 0 { round(lost_total / count, 2) } else { missing }
	return ChartData{
		kind:   .rate
		labels: labels
		series: [
			Series{
				label:  'Weight Gained'
				values: gained
				color:  blue
			},
			Series{
				label:  'Weight Lost'
				values: lost
				color:  red
			},
			Series{
				label:       'Overall Weight Change'
				values:      []f64{len: labels.len, init: overall}
				color:       green
				show_points: false
			},
			Series{
				label:       'Overall Weight Loss'
				values:      []f64{len: labels.len, init: overall_loss}
				color:       0xff9f40
				show_points: false
			},
		]
	}
}

fn (s &Store) histogram_chart(now Date) ?ChartData {
	start := s.earliest_date()?
	weights := s.values(date_fill(start, now), weight_of)
	mut counts := map[int]int{}
	for w in weights {
		if w >= 1 {
			counts[int(w)]++
		}
	}
	if counts.len == 0 {
		return none
	}
	mut keys := counts.keys()
	keys.sort()
	mut labels := []string{}
	mut values := []f64{}
	for k in keys[0] .. keys.last() + 1 {
		labels << k.str()
		values << f64(counts[k] or { 0 })
	}
	return ChartData{
		kind:   .histogram
		style:  .bar
		labels: labels
		series: [Series{
			label:  'Weight (Count)'
			values: values
			color:  red
		}]
		left:   AxisLimits{
			min: 0
		}
	}
}

fn time_to_hours(t string) f64 {
	m := parse_time(t) or { return missing }
	return round(f64(m) / 60, 3)
}

fn (s &Store) bedtime_chart(now Date) ?ChartData {
	cs := s.chart_settings
	dates := date_fill(chart_start_date(now, cs.duration, cs.duration_unit), now)
	goal_str := if s.user_settings.bedtime != '' { s.user_settings.bedtime } else { '22:00' }
	goal := time_to_hours(goal_str)
	mut labels := []string{}
	mut success := []f64{}
	mut spread := []f64{}
	for i := 0; i < dates.len; i += 7 {
		end := if i + 7 < dates.len { i + 7 } else { dates.len }
		mut bedtimes := []f64{}
		for d in dates[i..end] {
			e := s.entries[d] or { continue }
			h := time_to_hours(e.bedtime)
			if !is_missing(h) {
				bedtimes << h
			}
		}
		labels << dates[i]
		sd := round(if_missing(stdev(bedtimes), 0), 3)
		spread << if sd == 0 { missing } else { sd }
		mut scores := []f64{}
		for b in bedtimes {
			mut late := b - goal
			if late < 0 {
				late += 24
			}
			if late > 12 {
				late = 0
			}
			scores << round(1 - late / 12, 3)
		}
		a := round(if_missing(avg(scores), 0), 3)
		success << if a == 0 { missing } else { a }
	}
	if labels.len == 0 {
		return none
	}
	return ChartData{
		kind:   .bedtime
		style:  .bar
		labels: labels
		series: [
			Series{
				label:  'Bedtime Success'
				values: success
				color:  red
			},
			Series{
				label:      'Standard Deviation'
				values:     spread
				color:      dark_green
				right_axis: true
			},
		]
		left:   AxisLimits{
			min: 0
			max: 1
		}
		right:  AxisLimits{
			min: 0
		}
	}
}

fn (s &Store) sleep_chart(now Date) ?ChartData {
	cs := s.chart_settings
	dates := date_fill(chart_start_date(now, cs.duration, cs.duration_unit), now)
	sleep := s.values(dates, sleep_of)
	mut labels := []string{}
	mut avgs := []f64{}
	mut spread := []f64{}
	for i := 0; i < dates.len; i += 7 {
		end := if i + 7 < dates.len { i + 7 } else { dates.len }
		week := sleep[i..end]
		labels << dates[i]
		a := avg(week)
		avgs << if has_value(a) { round(a, 2) } else { missing }
		sd := round(if_missing(stdev(week), 0), 2)
		spread << if sd == 0 { missing } else { sd }
	}
	if labels.len == 0 {
		return none
	}
	return ChartData{
		kind:   .sleep
		labels: labels
		series: [
			Series{
				label:  'Average Sleep for Week'
				values: avgs
				color:  red
			},
			Series{
				label:      'Standard Deviation'
				values:     spread
				color:      green
				right_axis: true
			},
		]
		left:   AxisLimits{
			min: 0
		}
		right:  AxisLimits{
			min: 0
		}
	}
}

fn if_missing(v f64, default f64) f64 {
	return if is_missing(v) { default } else { v }
}

// Stats is the summary table at the top of the charts page. Values are
// formatted for display; '' means not enough data.
pub struct Stats {
pub:
	weight      string // average this week
	rate        string // change from last week's average
	bmi_prime   string
	sleep       string // average this week
	weeks_to_go string
	std         string
	goal        string
}

pub fn (s &Store) stats(now Date) Stats {
	week_start := now.previous_weekday(0)
	this_week := s.values(date_fill(week_start, now), weight_of)
	last_week := s.values(date_fill(week_start.add_days(-7), week_start.add_days(-1)),
		weight_of)
	sleep := s.values(date_fill(week_start, now), sleep_of)
	avg_weight := avg(this_week)
	prev_avg := avg(last_week)
	mut bmi_prime := ''
	h := s.user_settings.height
	if h > 0 && has_value(avg_weight) {
		bmi_prime = format_fixed(avg_weight / (h * h) * 703 / 25, 3)
	}
	return Stats{
		weight:      format_fixed(avg_weight, 2)
		rate:        if has_value(avg_weight) && has_value(prev_avg) {
			format_fixed(avg_weight - prev_avg, 2)
		} else {
			'N/A'
		}
		bmi_prime:   bmi_prime
		sleep:       format_fixed(avg(sleep), 2)
		weeks_to_go: s.weeks_to_go(now)
		std:         format_fixed(stdev(this_week), 2)
		goal:        format_fixed(s.user_settings.goal(), 2)
	}
}

// weeks_to_go estimates how many weeks until the goal weight, from the
// average weekly loss (optimistic) and average weekly change (realistic).
fn (s &Store) weeks_to_go(now Date) string {
	goal := s.user_settings.goal()
	if goal == 0 {
		return ''
	}
	w := s.weekly_weights(now)
	if w.avg.len < 2 {
		return ''
	}
	current := w.avg.last()
	if !has_value(current) {
		return ''
	}
	mut all := []f64{}
	mut losses := []f64{}
	for i in 1 .. w.avg.len {
		if !has_value(w.avg[i]) || !has_value(w.avg[i - 1]) {
			continue
		}
		diff := w.avg[i] - w.avg[i - 1]
		all << diff
		if diff < 0 {
			losses << diff
		}
	}
	avg_all := -avg(all)
	avg_loss := -avg(losses)
	if !has_value(avg_all) || !has_value(avg_loss) {
		return ''
	}
	diff := current - goal
	return '${format_fixed(diff / avg_loss, 1)} to ${format_fixed(diff / avg_all, 1)}'
}
