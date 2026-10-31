module gui

// ---- keyboard navigation ----
//
// Every control that can be clicked is also a stop for the keyboard. Tab and
// Shift+Tab move keyboard focus to the next and previous stop in drawing
// order. Enter or Space presses the focused control; Tab into a field starts
// editing it (and Enter on a field that has focus but isn't being edited). Escape in a
// field undoes the edit and drops focus; clicking or touching anywhere drops
// keyboard focus too, and the app drops it on Escape (see clear_nav). An open
// drop-down takes ↑, ↓, Enter, Space and Escape (see draw_menu).
//
// Kept like ../soccer/native/gui/nav.v, less its modal dialogs.

struct Stop {
	id    string
	r     Rect
	clip  Rect
	field bool
	// The scroll areas the stop is drawn in, to bring it into view.
	vscroll string
	hscroll string
}

fn (mut ui Ui) add_stop(id string, r Rect, field bool) {
	if id == ui.nav {
		ui.nav_rect = r
	}
	ui.stops << Stop{
		id:      id
		r:       r
		clip:    ui.clip
		field:   field
		vscroll: if ui.vscroll_ids.len > 0 { ui.vscroll_ids.last() } else { '' }
		hscroll: if ui.hscroll_ids.len > 0 { ui.hscroll_ids.last() } else { '' }
	}
}

// focusable makes r a keyboard stop named `name` (repeated names are
// numbered in drawing order), draws the focus ring when it has keyboard
// focus, and returns true when Enter or Space presses it.
pub fn (mut ui Ui) focusable(r Rect, name string) bool {
	n := ui.stop_count[name] or { 0 }
	ui.stop_count[name] = n + 1
	id := '${name}#${n}'
	ui.add_stop(id, r, false)
	if ui.nav != id || ui.focus != '' {
		return false
	}
	ui.nav_ring(r)
	// While a drop-down is open, its list takes Enter and Space.
	return ui.menu.id == '' && ui.take_press(true)
}

// tap reports a click on r, or a press of it from the keyboard.
pub fn (mut ui Ui) tap(r Rect, name string) bool {
	pressed := ui.focusable(r, name)
	return ui.clicked(r) || pressed
}

// take_press consumes an Enter (or Space, when `space`) press.
fn (mut ui Ui) take_press(space bool) bool {
	for i, k in ui.keys {
		if (k.code in [.enter, .kp_enter] || (space && k.code == .space)) && !k.ctrl() && !k.alt() {
			ui.keys.delete(i)
			ui.redraw = true
			return true
		}
	}
	return false
}

// nav_ring marks the control that has keyboard focus.
fn (ui &Ui) nav_ring(r Rect) {
	t := ui.theme
	ui.rounded_border(r.inset(-4, -4), 9, t.focus_ring)
	ui.rounded_border(r.inset(-3, -3), 8, t.primary)
	ui.rounded_border(r.inset(-2, -2), 7, t.primary)
}

// has_nav: a control has keyboard focus (it isn't being typed in).
pub fn (ui &Ui) has_nav() bool {
	return ui.nav != ''
}

// clear_nav drops keyboard focus, as on Escape or when a new screen opens.
pub fn (mut ui Ui) clear_nav() {
	if ui.nav != '' {
		ui.nav = ''
		ui.redraw = true
	}
}

fn (ui &Ui) stop_index(id string) int {
	for i, s in ui.stops {
		if s.id == id {
			return i
		}
	}
	return -1
}

// stop_in_place finds the control drawn where the focused one was, for when
// that one is gone: a button whose label changed when it was pressed (which
// names it anew), or the next row's button after a row was removed. It is
// in the same row, and overlaps it the most; '' when there is none.
fn (ui &Ui) stop_in_place(r Rect) string {
	mut best := ''
	mut best_overlap := f32(0)
	for s in ui.stops {
		if abs(s.r.y - r.y) > 1 || abs(s.r.h - r.h) > 1 {
			continue
		}
		overlap := s.r.intersect(r).w
		if overlap > best_overlap {
			best = s.id
			best_overlap = overlap
		}
	}
	return best
}

// reachable: the stop can be seen, or scrolled to.
fn (s Stop) reachable() bool {
	v := s.r.intersect(s.clip)
	return (v.w > 0 && v.h > 0) || s.vscroll != '' || s.hscroll != ''
}

fn (s Stop) visible() bool {
	v := s.r.intersect(s.clip)
	return v.w > 0 && v.h > 0
}

// keyboard_nav moves keyboard focus for the Tab presses no control used this
// frame. end_frame calls it while no field is focused. Tab closes an open
// drop-down.
fn (mut ui Ui) keyboard_nav() {
	for k in ui.keys {
		if k.code == .tab && !k.ctrl() && !k.alt() {
			if ui.menu.id != '' {
				ui.close_menu()
			}
			target := ui.tab_target(k.shift())
			if target >= 0 {
				ui.move_nav(target)
			}
		}
	}
}

// tab_target is the next (or, going back, previous) stop in drawing order.
// With nothing focused, Tab starts at the page's content, below the header
// and its tabs, and Shift+Tab as if from there: at the header's last tab.
fn (ui &Ui) tab_target(back bool) int {
	n := ui.stops.len
	if n == 0 {
		return -1
	}
	mut cur := ui.stop_index(ui.nav)
	if cur < 0 {
		start := ui.content_start()
		if start >= 0 {
			if !back {
				return start
			}
			cur = start
		}
	}
	mut i := cur
	for _ in 0 .. n {
		i = if i < 0 {
			if back { n - 1 } else { 0 }
		} else if back {
			(i - 1 + n) % n
		} else {
			(i + 1) % n
		}
		if i != cur && ui.stops[i].reachable() {
			return i
		}
	}
	return -1
}

// content_start is the first stop in view in a scroll area: the page's
// content rather than its header. -1 when there is none.
fn (ui &Ui) content_start() int {
	for i, s in ui.stops {
		if s.vscroll != '' && s.visible() {
			return i
		}
	}
	return -1
}

// move_nav gives stop i keyboard focus and scrolls it into view. A field
// starts editing.
fn (mut ui Ui) move_nav(i int) {
	s := ui.stops[i]
	ui.nav = s.id
	if s.field {
		ui.focus_request = s.id
	}
	margin := f32(12)
	if s.vscroll != '' {
		if area := ui.vareas[s.vscroll] {
			mut off := ui.scrolls[s.vscroll] or { 0 }
			if s.r.bottom() + margin > area.bottom() {
				off += s.r.bottom() + margin - area.bottom()
			}
			if s.r.y - margin < area.y {
				off -= area.y - (s.r.y - margin)
			}
			ui.scrolls[s.vscroll] = if off < 0 { 0 } else { off }
		}
	}
	if s.hscroll != '' {
		if area := ui.hareas[s.hscroll] {
			mut off := ui.hscrolls[s.hscroll] or { 0 }
			if s.r.right() + margin > area.right() {
				off += s.r.right() + margin - area.right()
			}
			if s.r.x - margin < area.x {
				off -= area.x - (s.r.x - margin)
			}
			ui.hscrolls[s.hscroll] = if off < 0 { 0 } else { off }
		}
	}
	ui.redraw = true
}
