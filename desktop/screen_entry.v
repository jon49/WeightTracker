module main

import core
import gui

struct EntryForm {
mut:
	date     gui.Input
	weight   gui.Input
	waist    gui.Input
	bedtime  gui.Input
	sleep    gui.Input
	comments gui.Input
	rev      int
	dirty    bool
	// The store version the form was loaded from, to notice synced changes.
	version int
}

fn (mut app App) load_entry(date string) {
	e := app.store.entry(date)
	app.entry = EntryForm{
		date:     gui.input(date)
		weight:   gui.input(core.format_number(e.weight))
		waist:    gui.input(core.format_number(e.waist))
		bedtime:  gui.input(e.bedtime)
		sleep:    gui.input(core.format_number(e.sleep))
		comments: gui.input(e.comments)
		rev:      e.rev
		version:  app.store.version
	}
}

// save_entry validates the form and saves it. Invalid values are reported
// and reset to what was saved before.
fn (mut app App) save_entry() {
	f := app.entry
	app.entry.dirty = false
	prev := app.store.entry(f.date.text)
	mut errors := []string{}
	weight := core.parse_number(f.weight.text) or {
		errors << 'Weight: ${err.msg()}'
		prev.weight
	}
	waist := core.parse_number(f.waist.text) or {
		errors << 'Waist: ${err.msg()}'
		prev.waist
	}
	sleep := core.parse_number(f.sleep.text) or {
		errors << 'Hours slept: ${err.msg()}'
		prev.sleep
	}
	mut bedtime := f.bedtime.text.trim_space()
	if bedtime != '' {
		bedtime = core.normalize_time(bedtime) or {
			errors << 'Bedtime: "${bedtime}" is not a time, use HH:MM.'
			prev.bedtime
		}
	}
	e := core.Entry{
		date:     f.date.text
		weight:   weight
		waist:    waist
		bedtime:  bedtime
		sleep:    sleep
		comments: f.comments.text.trim_right(' \n')
		rev:      prev.rev
	}
	app.store.set_entry(e) or {
		app.show_error('Could not save: ${err}')
		return
	}
	if errors.len > 0 {
		app.show_error(errors.join('\n'))
	}
	app.load_entry(e.date)
	app.schedule_sync()
}

fn (mut app App) change_date(date string) {
	if app.entry.dirty {
		app.save_entry()
	}
	app.load_entry(date)
}

fn (mut app App) start_sleep() {
	app.entry.bedtime = gui.input(core.now_time())
	app.save_entry()
}

fn (mut app App) wake_up() {
	bedtime := app.entry.bedtime.text
	hours := core.hours_slept(bedtime, core.now_time()) or { return }
	app.entry.sleep = gui.input(core.format_number(hours))
	app.save_entry()
}

fn (mut app App) draw_entry(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	// Synced data for this date arrived: show it unless the user is typing.
	if app.entry.version != app.store.version && !app.entry.dirty && !ui.has_focus() {
		app.load_entry(app.entry.date.text)
	}
	mut y := app.heading(x, y0, 'Edit Entry')
	bh := ui.button_height()

	// Date row: ‹ [date] › Today
	ui.text(x, y, 'Date', gui.TextStyle{
		size:  14
		color: ui.theme.muted
	})
	y += 22
	date := core.parse_date(app.entry.date.text) or { core.today() }
	if ui.button(gui.Rect{x, y, bh, bh}, '‹', .outline) {
		app.change_date(date.add_days(-1).str())
	}
	today_w := ui.button_width('Today')
	fw := w - 2 * (bh + 8) - today_w - 8
	date_w := if fw > 200 { f32(200) } else { fw }
	ev := ui.field('entry-date', gui.Rect{x + bh + 8, y, date_w, bh}, mut app.entry.date,
		.date, 'YYYY-MM-DD')
	if ev == .committed {
		if d := core.parse_date(app.entry.date.text) {
			app.change_date(d.str())
		} else {
			app.show_error('"${app.entry.date.text}" is not a date, use YYYY-MM-DD.')
			app.entry.date = gui.input(date.str())
		}
	} else if ev == .cancelled {
		app.entry.date = gui.input(date.str())
	}
	nx := x + bh + 8 + date_w + 8
	if ui.button(gui.Rect{nx, y, bh, bh}, '›', .outline) {
		app.change_date(date.add_days(1).str())
	}
	if ui.button(gui.Rect{nx + bh + 8, y, today_w, bh}, 'Today', .outline) {
		app.change_date(core.default_entry_date().str())
	}
	weekday := ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.weekday()]
	if nx + bh + 8 + today_w + 16 + ui.text_width(weekday, gui.TextStyle{}) < x + w {
		ui.text(nx + 2 * bh + today_w + 32, y + bh / 2, weekday, gui.TextStyle{
			color:  ui.theme.muted
			valign: .middle
		})
	}
	y += bh + 20

	cols := columns(w, 2, 220)
	cw := (w - f32(cols - 1) * pad) / f32(cols)
	col_x := fn [x, cw, cols] (i int) f32 {
		return x + f32(i % cols) * (cw + pad)
	}

	// Sleep: Bedtime button or field, then Wake Up button or Hours Slept.
	has_bedtime := app.entry.bedtime.text != ''
	mut row_bottom := y
	if !has_bedtime {
		if ui.button(gui.Rect{col_x(0), y, cw, bh}, 'Bedtime', .primary) {
			app.start_sleep()
		}
		row_bottom = y + bh + 14
	} else {
		mut fy := y
		mut ev2 := gui.FieldEvent.none
		label := 'Bedtime (${core.display_time(app.entry.bedtime.text)})'
		ev2, fy = app.labeled_field('entry-bedtime', label, col_x(0), y, cw, mut app.entry.bedtime,
			.time, 'HH:MM')
		app.on_entry_field(ev2)
		row_bottom = fy
		sy := if cols == 1 { fy } else { y }
		if app.entry.sleep.text == '' {
			by := sy + if cols == 1 { f32(0) } else { f32(22) }
			if ui.button(gui.Rect{col_x(1), by, cw, bh}, 'Wake Up', .primary) {
				app.wake_up()
			}
			b := by + bh + 14
			row_bottom = if b > row_bottom { b } else { row_bottom }
		} else {
			ev2, fy = app.labeled_field('entry-sleep', 'Hours Slept', col_x(1), sy, cw, mut
				app.entry.sleep, .number, '')
			app.on_entry_field(ev2)
			row_bottom = if fy > row_bottom { fy } else { row_bottom }
		}
	}
	y = row_bottom + 6

	mut ev3 := gui.FieldEvent.none
	mut y1 := y
	ev3, y1 = app.labeled_field('entry-weight', 'Weight', col_x(0), y, cw, mut app.entry.weight,
		.number, '')
	app.on_entry_field(ev3)
	wy := if cols == 1 { y1 } else { y }
	mut y2 := wy
	ev3, y2 = app.labeled_field('entry-waist', 'Waist Size (cm)', col_x(1), wy, cw, mut
		app.entry.waist, .number, '')
	app.on_entry_field(ev3)
	y = if y2 > y1 { y2 } else { y1 }

	ev3, y = app.labeled_field('entry-comments', 'Comment', x, y, w, mut app.entry.comments,
		.multiline, '')
	app.on_entry_field(ev3)
	ui.text(x, y - 8, 'Enter adds a line; Ctrl+Enter or clicking elsewhere saves.', gui.TextStyle{
		size:  12
		color: ui.theme.muted
	})
	return y + 20 - y0
}

fn (mut app App) on_entry_field(ev gui.FieldEvent) {
	match ev {
		.changed { app.entry.dirty = true }
		.committed { app.save_entry() }
		.cancelled { app.entry.dirty = false }
		.none {}
	}
}
