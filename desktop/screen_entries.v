module main

import gg
import core
import gui

struct EntriesView {
mut:
	year int
	// Row layout is cached; wrapping comments for a year of rows on every
	// frame would be wasted work.
	cache_key string
	rows      []EntryRow
	height    f32
}

struct EntryRow {
	entry    core.Entry
	comments []string
	y        f32 // relative to the table top
	h        f32
}

struct Column {
	title string
	w     f32
	align bool // right align numbers
}

fn (app &App) entry_columns(w f32) []Column {
	date_w := app.ui.text_width('0000-00-00', gui.TextStyle{}) + 24
	num_w := f32(84)
	bed_w := app.ui.text_width('00:00 PM', gui.TextStyle{}) + 24
	fixed := date_w + num_w * 3 + bed_w
	comment_w := if w - fixed > 120 { w - fixed } else { f32(120) }
	return [
		Column{'Date', date_w, false},
		Column{'Weight', num_w, true},
		Column{'Bedtime', bed_w, true},
		Column{'Sleep', num_w, true},
		Column{'Waist', num_w, true},
		Column{'Comments', comment_w, false},
	]
}

fn (mut app App) layout_entries(w f32) {
	key := '${app.entries.year}:${app.store.version}:${w}:${app.ui.theme.dark}'
	if key == app.entries.cache_key {
		return
	}
	app.entries.cache_key = key
	cols := app.entry_columns(w)
	comment_w := cols.last().w - 16
	lh := app.ui.line_height(0)
	mut y := f32(0)
	app.entries.rows.clear()
	for e in app.store.entries_for_year(app.entries.year) {
		lines := if e.comments == '' {
			[]string{}
		} else {
			app.ui.wrap(e.comments, comment_w, gui.TextStyle{})
		}
		n := if lines.len > 1 { lines.len } else { 1 }
		h := n * lh + 14
		app.entries.rows << EntryRow{e, lines, y, h}
		y += h
	}
	app.entries.height = y
}

fn (mut app App) draw_entries(x f32, y0 f32, w f32, view gui.Rect) f32 {
	mut ui := app.ui
	t := ui.theme
	now := core.today()
	if app.entries.year == 0 {
		app.entries.year = now.year
	}
	mut y := app.heading(x, y0, 'Entries — ${app.entries.year}')

	// Year chips, wrapping onto more lines when needed.
	bh := ui.button_height()
	mut bx := x
	for year in app.store.years(now) {
		label := year.str()
		bw := ui.button_width(label)
		if bx + bw > x + w {
			bx = x
			y += bh + 6
		}
		style := if year == app.entries.year {
			gui.ButtonStyle.tab_active
		} else {
			gui.ButtonStyle.tab
		}
		if ui.button(gui.Rect{bx, y, bw, bh}, label, style) {
			app.entries.year = year
		}
		bx += bw + 6
	}
	y += bh + 16

	// The table scrolls sideways on narrow windows by squeezing comments;
	// columns keep a minimum width.
	cols := app.entry_columns(w)
	mut table_w := f32(0)
	for c in cols {
		table_w += c.w
	}
	app.layout_entries(w)
	lh := ui.line_height(0)
	head_h := lh + 14
	ui.rect(gui.Rect{x, y, table_w, head_h}, t.surface)
	mut cx := x
	for c in cols {
		ui.text(if c.align { cx + c.w - 8 } else { cx + 8 }, y + 7, c.title, gui.TextStyle{
			bold:  true
			align: if c.align { .right } else { .left }
		})
		cx += c.w
	}
	y += head_h
	if app.entries.rows.len == 0 {
		ui.text(x + 8, y + 12, 'No entries for ${app.entries.year}.', gui.TextStyle{
			color: t.muted
		})
		return y + 48 - y0
	}
	ui.push_clip(gui.Rect{x, y, table_w, app.entries.height})
	for i, row in app.entries.rows {
		ry := y + row.y
		// Only draw rows that are on screen.
		if ry + row.h < view.y || ry > view.bottom() {
			continue
		}
		r := gui.Rect{x, ry, table_w, row.h}
		if ui.hovered(r) {
			ui.rect(r, t.surface_alt)
		} else if i % 2 == 1 {
			ui.rect(r, gg.Color{t.surface.r, t.surface.g, t.surface.b, 140})
		}
		ui.pointer_cursor(r)
		e := row.entry
		values := [
			e.date,
			core.format_number(e.weight),
			if e.bedtime == '' { '' } else { core.display_time(e.bedtime) },
			core.format_number(e.sleep),
			core.format_number(e.waist),
		]
		cx = x
		for ci, v in values {
			c := cols[ci]
			ui.text(if c.align { cx + c.w - 8 } else { cx + 8 }, ry + 7, v, gui.TextStyle{
				align: if c.align { .right } else { .left }
				color: if ci == 0 { t.link } else { t.text }
			})
			cx += c.w
		}
		for li, line in row.comments {
			ui.text(cx + 8, ry + 7 + li * lh, line, gui.TextStyle{})
		}
		ui.hline(x, ry + row.h - 1, table_w, t.border)
		if ui.clicked(r) {
			app.navigate(.entry)
			app.load_entry(e.date)
		}
	}
	ui.pop_clip()
	return y + app.entries.height + 8 - y0
}
