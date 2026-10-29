module main

import math
import core
import gui

struct ChartsView {
mut:
	// Charts the user opened, newest first (like the web page prepends them).
	open     []core.ChartKind
	cache    map[int]core.ChartData
	cache_id string
	stats    core.Stats
	duration gui.Input
	loaded   bool
	dirty    bool
}

fn (mut app App) save_chart_settings() {
	app.charts.dirty = false
	mut cs := app.store.chart_settings
	d := core.parse_number(app.charts.duration.text) or { 0 }
	if d > 0 {
		cs.duration = d
	} else {
		app.show_error('The chart period must be a positive number.')
	}
	app.store.set_chart_settings(cs) or { app.show_error('Could not save: ${err}') }
	app.charts.duration = gui.input(core.format_number(app.store.chart_settings.duration))
}

fn (mut app App) set_duration_unit(u core.DurationUnit) {
	mut cs := app.store.chart_settings
	cs.duration_unit = u
	app.store.set_chart_settings(cs) or { app.show_error('Could not save: ${err}') }
}

// refresh_chart_cache recomputes charts and stats when data or the day changes.
fn (mut app App) refresh_chart_cache(now core.Date) {
	id := '${app.store.version}:${now}'
	if id == app.charts.cache_id {
		return
	}
	app.charts.cache_id = id
	app.charts.cache.clear()
	for kind in app.charts.open {
		if c := app.store.chart(kind, now) {
			app.charts.cache[int(kind)] = c
		}
	}
	app.charts.stats = app.store.stats(now)
}

fn (mut app App) toggle_chart(kind core.ChartKind, now core.Date) {
	if kind in app.charts.open {
		app.charts.open = app.charts.open.filter(it != kind)
		return
	}
	app.charts.open.prepend(kind)
	if c := app.store.chart(kind, now) {
		app.charts.cache[int(kind)] = c
	}
}

fn (mut app App) draw_charts(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	now := core.today()
	if !app.charts.loaded {
		app.charts.loaded = true
		app.charts.duration = gui.input(core.format_number(app.store.chart_settings.duration))
	}
	app.refresh_chart_cache(now)
	mut y := app.heading(x, y0, 'Charts')

	// Stats cards.
	cs := app.store.chart_settings
	y = app.subheading(x, y, 'Stats')
	st := app.charts.stats
	stats := [
		['Weight', st.weight],
		['Rate', st.rate],
		['BMI Prime', st.bmi_prime],
		['Sleep', st.sleep],
		['Weeks to Go', st.weeks_to_go],
		['σ', st.std],
		['Goal', st.goal],
	]
	gap := f32(10)
	fit := int(math.max(2, math.min(f32(stats.len), (w + gap) / (110 + gap))))
	// Even out the rows rather than leaving one card alone on the last.
	row_count := (stats.len + fit - 1) / fit
	per_row := (stats.len + row_count - 1) / row_count
	card_w := (w - f32(per_row - 1) * gap) / f32(per_row)
	card_h := f32(66)
	for i, s in stats {
		cx := x + f32(i % per_row) * (card_w + gap)
		cy := y + f32(i / per_row) * (card_h + gap)
		ui.rounded(gui.Rect{cx, cy, card_w, card_h}, 8, t.surface)
		ui.text(cx + 10, cy + 8, s[0], gui.TextStyle{
			size:  13
			color: t.muted
		})
		value := if s[1] == '' { '—' } else { s[1] }
		ui.text(cx + 10, cy + 30, ui.fit(value, card_w - 20, gui.TextStyle{ size: 18, bold: true }),
			gui.TextStyle{
				size: 18
				bold: true
			})
	}
	rows := (stats.len + per_row - 1) / per_row
	y += f32(rows) * (card_h + gap) + 2
	for line in ui.wrap('Weight, rate, sleep and σ are for this week (from Sunday); rate is the change from last week. Weeks to go uses the chart period.',
		w, gui.TextStyle{ size: 12 }) {
		ui.text(x, y, line, gui.TextStyle{
			size:  12
			color: t.muted
		})
		y += ui.line_height(12)
	}
	y += 16

	// Chart period: [9] [Weeks|Months|Years]
	y = app.subheading(x, y, 'Chart period')
	bh := ui.button_height()
	ev := ui.field('chart-duration', gui.Rect{x, y, 80, bh}, mut app.charts.duration, .number,
		'9')
	match ev {
		.changed { app.charts.dirty = true }
		.committed { app.save_chart_settings() }
		.cancelled { app.charts.dirty = false }
		.none {}
	}
	mut bx := x + 92
	for u in [core.DurationUnit.week, .month, .year] {
		label := '${u.str().capitalize()}s'
		bw := ui.button_width('Months')
		style := if cs.duration_unit == u {
			gui.ButtonStyle.tab_active
		} else {
			gui.ButtonStyle.tab
		}
		if ui.button(gui.Rect{bx, y, bw, bh}, label, style) {
			app.set_duration_unit(u)
		}
		bx += bw + 4
	}
	y += bh + 20

	// Chart toggles.
	mut cx := x
	for kind in core.all_charts {
		label := kind.title()
		bw := ui.button_width(label)
		if cx + bw > x + w {
			cx = x
			y += bh + 8
		}
		style := if kind in app.charts.open {
			gui.ButtonStyle.primary
		} else {
			gui.ButtonStyle.outline
		}
		if ui.button(gui.Rect{cx, y, bw, bh}, label, style) {
			app.toggle_chart(kind, now)
		}
		cx += bw + 8
	}
	y += bh + 20

	for kind in app.charts.open.clone() {
		card := gui.Rect{x, y, w, 0}
		y = app.subheading(x, y, kind.title())
		if ui.button(gui.Rect{x + w - bh, card.y - 6, bh, bh}, '×', .ghost) {
			app.charts.open = app.charts.open.filter(it != kind)
		}
		if c := app.charts.cache[int(kind)] {
			y += app.draw_chart(c, x, y, w) + 28
		} else {
			ui.text(x, y, 'Not enough data for this chart yet.', gui.TextStyle{
				color: t.muted
			})
			y += 44
		}
	}
	if app.charts.open.len == 0 {
		ui.text(x, y, 'Choose a chart above.', gui.TextStyle{
			color: t.muted
		})
		y += 30
	}
	return y - y0
}
