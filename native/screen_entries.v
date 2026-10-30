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
	// Comments take the rest of a wide window; on a narrow one the table
	// scrolls sideways instead of squeezing them.
	comment_w := if w - fixed > 260 { w - fixed } else { f32(260) }
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

	// The table, as in ../soccer's stats tables: the date column stays put
	// while the others scroll sideways, and the header row stays at the top
	// of the screen while the rows scroll under it.
	cols := app.entry_columns(w)
	date_w := cols[0].w
	mut content_w := f32(0)
	for c in cols[1..] {
		content_w += c.w
	}
	table_w := if date_w + content_w < w { date_w + content_w } else { w }
	app.layout_entries(w)
	lh := ui.line_height(0)
	head_h := lh + 14
	if app.entries.rows.len == 0 {
		app.draw_entries_head(cols, gui.Rect{x, y, table_w, head_h}, 0)
		ui.text(x + 8, y + head_h + 12, 'No entries for ${app.entries.year}.', gui.TextStyle{
			color: t.muted
		})
		return y + head_h + 48 - y0
	}
	body_h := head_h + app.entries.height
	total_h := body_h + gui.hscroll_bar_height
	// The clip starts on a whole pixel (gg's scissor rounds down); so does
	// the header, or a sliver of the row beneath shows above it.
	visible_top := f32(int(ui.clip_rect().y))
	head_y := if y >= visible_top {
		y
	} else if visible_top < y + body_h - head_h {
		visible_top
	} else {
		y + body_h - head_h
	}
	head_r := gui.Rect{x, head_y, table_w, head_h}
	rows_y := y + head_h
	// The header takes taps on it, so the row it covers doesn't.
	_ = ui.clicked(head_r)
	// Only rows that are on screen are drawn.
	mut first := app.entries.rows.len
	mut last := 0
	for i, row in app.entries.rows {
		ry := rows_y + row.y
		if ry + row.h < view.y || ry > view.bottom() {
			continue
		}
		if i < first {
			first = i
		}
		last = i + 1
		// Backgrounds and taps span the whole table.
		r := gui.Rect{x, ry, table_w, row.h}
		if ui.hovered(r) && !ui.hovered(head_r) {
			ui.rect(r, t.surface_alt)
		} else if i % 2 == 1 {
			ui.rect(r, gg.Color{t.surface.r, t.surface.g, t.surface.b, 140})
		}
		ui.hline(x, ry + row.h - 1, table_w, t.border)
		ui.pointer_cursor(r)
		if ui.clicked(r) {
			app.navigate(.entry)
			app.load_entry(row.entry.date)
		}
	}
	visible := unsafe { app.entries.rows[first..last] }

	scroll_r := gui.Rect{x + date_w, y, table_w - date_w, total_h}
	off := ui.begin_hscroll('entries', scroll_r)
	for row in visible {
		ry := rows_y + row.y
		e := row.entry
		values := [
			core.format_number(e.weight),
			if e.bedtime == '' { '' } else { core.display_time(e.bedtime) },
			core.format_number(e.sleep),
			core.format_number(e.waist),
		]
		mut cx := scroll_r.x - off
		for ci, v in values {
			c := cols[ci + 1]
			ui.text(cx + c.w - 8, ry + 7, v, gui.TextStyle{
				align: .right
			})
			cx += c.w
		}
		for li, line in row.comments {
			ui.text(cx + 8, ry + 7 + li * lh, line, gui.TextStyle{})
		}
	}
	ui.end_hscroll('entries', scroll_r, content_w)
	// The date column.
	for row in visible {
		ui.text(x + 8, rows_y + row.y + 7, row.entry.date, gui.TextStyle{
			color: t.link
		})
	}
	ui.rect(gui.Rect{x + date_w - 1, y, 1, body_h}, t.border)
	app.draw_entries_head(cols, head_r, off)
	return y + total_h + 8 - y0
}

// draw_entries_head draws the table's header row in r, its columns after
// the date scrolled sideways by `off` like the rows below.
fn (mut app App) draw_entries_head(cols []Column, r gui.Rect, off f32) {
	mut ui := app.ui
	t := ui.theme
	bold := gui.TextStyle{
		bold: true
	}
	ui.rect(r, t.surface)
	date_w := cols[0].w
	rest := gui.Rect{r.x + date_w, r.y, r.w - date_w, r.h}
	ui.push_clip(rest)
	mut cx := rest.x - off
	for c in cols[1..] {
		ui.text(if c.align { cx + c.w - 8 } else { cx + 8 }, r.y + 7, c.title, gui.TextStyle{
			...bold
			align: if c.align { .right } else { .left }
		})
		cx += c.w
	}
	ui.pop_clip()
	ui.text(r.x + 8, r.y + 7, cols[0].title, bold)
	ui.rect(gui.Rect{r.x + date_w - 1, r.y, 1, r.h}, t.border)
	ui.hline(r.x, r.bottom() - 1, r.w, t.border)
}
