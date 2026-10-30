module gui

// ---- horizontal scrolling (wide tables, the tabs) ----

// begin_hscroll starts a horizontal scroll area and returns its offset.
// Draw the content at `r.x - offset`, then call end_hscroll with its width.
// It scrolls with Shift+wheel, a sideways wheel, touch drags and its bar.
pub fn (mut ui Ui) begin_hscroll(id string, r Rect) f32 {
	mut off := ui.hscrolls[id] or { 0 }
	inside := r.contains(ui.mx, ui.my) || (ui.drag && r.contains(ui.press_x, ui.press_y))
	if ui.scroll_dx != 0 && inside {
		off += ui.scroll_dx
		ui.scroll_dx = 0
	}
	if bar := ui.hscroll_bar(id, r) {
		if ui.pressed && !ui.touch && bar.track.contains(ui.press_x, ui.press_y)
			&& ui.in_clip(ui.press_x, ui.press_y) {
			ui.pressed = false
			if bar.thumb.contains(ui.press_x, ui.press_y) {
				ui.hbar_drag = id
				ui.hbar_grab = ui.press_x - bar.thumb.x
			} else if ui.press_x < bar.thumb.x {
				off -= r.w * 0.9
			} else {
				off += r.w * 0.9
			}
		}
		if ui.hbar_drag == id {
			if ui.down {
				span := r.w - bar.thumb.w
				if span > 0 {
					off = (ui.mx - ui.hbar_grab - r.x) / span * bar.max
				}
			} else {
				ui.hbar_drag = ''
			}
		}
		if off > bar.max {
			off = bar.max
		}
	}
	if off < 0 {
		off = 0
	}
	ui.hscrolls[id] = off
	ui.push_clip(r)
	return off
}

pub fn (mut ui Ui) set_hscroll(id string, off f32) {
	ui.hscrolls[id] = if off < 0 { 0 } else { off }
	ui.redraw = true
}

pub fn (mut ui Ui) end_hscroll(id string, r Rect, content_w f32) {
	ui.pop_clip()
	ui.content_ws[id] = content_w
	max := if content_w > r.w { content_w - r.w } else { 0 }
	if (ui.hscrolls[id] or { 0 }) > max {
		ui.hscrolls[id] = max
		ui.redraw = true
	}
	if bar := ui.hscroll_bar(id, r) {
		active := ui.hbar_drag == id || ui.hovered(bar.track)
		h := if active { f32(8) } else { f32(5) }
		ui.ctx.draw_rounded_rect_filled(bar.thumb.x, bar.track.bottom() - h - 2, bar.thumb.w,
			h, h / 2, hexa(0x808080, if active { u8(180) } else { u8(110) }))
	}
}

// hscroll_bar_height is the room under a horizontal scroll area for its bar.
pub const hscroll_bar_height = f32(14)

fn (ui &Ui) hscroll_bar(id string, r Rect) ?ScrollBar {
	content_w := ui.content_ws[id] or { return none }
	if content_w <= r.w {
		return none
	}
	max := content_w - r.w
	mut off := ui.hscrolls[id] or { 0 }
	off = if off < 0 {
		0
	} else if off > max {
		max
	} else {
		off
	}
	mut tw := r.w * r.w / content_w
	if tw < 32 {
		tw = 32
	}
	track := Rect{r.x, r.bottom() - hscroll_bar_height, r.w, hscroll_bar_height}
	return ScrollBar{
		track: track
		thumb: Rect{r.x + (r.w - tw) * off / max, track.y, tw, hscroll_bar_height}
		max:   max
	}
}

// ---- focus ----

// focus_field focuses the field `id` when it is drawn next.
pub fn (mut ui Ui) focus_field(id string) {
	ui.focus_request = id
	ui.redraw = true
}

// ---- drop-down menus ----

struct Menu {
mut:
	id       string // '' when no menu is open
	anchor   Rect   // the drop-down button
	labels   []string
	selected int
	// Where the list was drawn last; the widgets under it ignore the
	// pointer there.
	list Rect
	// Set while draw_menu runs, so the list's own items get the pointer.
	drawing bool
	// The dropdown was drawn this frame; if not, its screen is gone.
	seen bool
	// A choice made in the list, for its dropdown to return next frame.
	chosen_id string
	chosen    int
}

fn (ui &Ui) under_menu(x f32, y f32) bool {
	return ui.menu.id != '' && !ui.menu.drawing && ui.menu.list.contains(x, y)
}

pub fn (ui &Ui) menu_open() bool {
	return ui.menu.id != ''
}

pub fn (mut ui Ui) close_menu() {
	ui.menu.id = ''
	ui.redraw = true
}

// dropdown draws a button showing labels[selected] that opens a list of
// all the labels, and returns the index chosen from it, or -1. The list is
// drawn on top of everything by draw_menu, which the app calls at the end
// of the frame.
pub fn (mut ui Ui) dropdown(id string, r Rect, labels []string, selected int) int {
	t := ui.theme
	open := ui.menu.id == id
	hover := ui.hovered(r)
	bg := if open || ui.pressing(r) {
		t.surface_hi
	} else if hover {
		t.surface_alt
	} else {
		t.input_bg
	}
	ui.rounded(r, 6, bg)
	ui.rounded_border(r, 6, if open { t.primary } else { t.border })
	label := labels[selected] or { '' }
	arrow_w := f32(ui.font_size) * 1.6
	style := TextStyle{
		valign: .middle
	}
	ui.push_clip(r)
	ui.text(r.x + 12, r.y + r.h / 2, ui.fit(label, r.w - 12 - arrow_w, style), style)
	ui.text(r.right() - arrow_w / 2, r.y + r.h / 2, '▾', TextStyle{
		align:  .center
		valign: .middle
		color:  t.muted
	})
	ui.pop_clip()
	ui.pointer_cursor(r)
	if ui.clicked(r) {
		if open {
			ui.close_menu()
		} else {
			ui.menu = Menu{
				id: id
			}
			ui.redraw = true
		}
	}
	if ui.menu.id == id {
		ui.menu.anchor = r
		ui.menu.labels = labels
		ui.menu.selected = selected
		ui.menu.seen = true
	}
	if ui.menu.chosen_id == id {
		ui.menu.chosen_id = ''
		return ui.menu.chosen
	}
	return -1
}

// dropdown_width is the width a dropdown needs to show its longest label.
pub fn (ui &Ui) dropdown_width(labels []string) f32 {
	mut w := f32(0)
	for l in labels {
		lw := ui.text_width(l, TextStyle{})
		if lw > w {
			w = lw
		}
	}
	return w + 12 + f32(ui.font_size) * 1.6
}

// draw_menu draws the open drop-down's list over everything else and
// handles taps on it. A tap elsewhere, or Escape, closes it.
pub fn (mut ui Ui) draw_menu() {
	if ui.menu.id == '' {
		return
	}
	if !ui.menu.seen {
		ui.menu.id = ''
		return
	}
	ui.menu.seen = false
	t := ui.theme
	m := ui.menu
	item_h := ui.button_height()
	mut lw := m.anchor.w
	for l in m.labels {
		w := ui.text_width(l, TextStyle{ bold: true }) + 48
		if w > lw {
			lw = w
		}
	}
	lh := item_h * m.labels.len + 8
	// Below the button, or above it when there's no room below.
	ly := if m.anchor.bottom() + 4 + lh <= ui.height() || m.anchor.y - 4 - lh < 0 {
		m.anchor.bottom() + 4
	} else {
		m.anchor.y - 4 - lh
	}
	list := Rect{m.anchor.x, ly, lw, lh}
	ui.menu.list = list
	ui.menu.drawing = true
	defer {
		ui.menu.drawing = false
	}
	ui.rounded(Rect{list.x + 1, list.y + 3, list.w, list.h}, 8, hexa(0x000000, 50))
	ui.rounded(list, 8, t.surface)
	ui.rounded_border(list, 8, t.border)
	for i, l in m.labels {
		r := Rect{list.x + 4, list.y + 4 + i * item_h, list.w - 8, item_h}
		if ui.pressing(r) {
			ui.rounded(r, 6, t.surface_hi)
		} else if ui.hovered(r) {
			ui.rounded(r, 6, t.surface_alt)
		}
		selected := i == m.selected
		ui.text(r.x + 10, r.y + r.h / 2, if selected { '✓' } else { '' }, TextStyle{
			valign: .middle
			color:  t.primary
		})
		ui.text(r.x + 32, r.y + r.h / 2, l, TextStyle{
			valign: .middle
			bold:   selected
		})
		ui.pointer_cursor(r)
		if ui.clicked(r) {
			ui.menu.id = ''
			ui.menu.chosen_id = m.id
			ui.menu.chosen = i
			ui.redraw = true
			return
		}
	}
	if ui.key_pressed(.escape, false)
		|| (ui.pressed && !list.contains(ui.press_x, ui.press_y) && !m.anchor.contains(ui.press_x, ui.press_y)) {
		ui.close_menu()
	}
}
