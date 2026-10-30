module gui

import gg
import sokol.sapp

// A small immediate-mode UI toolkit on top of gg. Every frame the app lays
// out and draws its widgets; each widget call both draws and reports what
// happened to it (clicked, edited, ...). Input events are collected between
// frames by handle_event and consumed by the widgets in the next frame.
//
// It only depends on gg/sokol, which run on Linux, Windows, macOS, iOS and
// Android. Touch input is handled the same as the mouse, plus drag to scroll.

// gg.Color{} is opaque black, so "no color" needs spelling out.
pub const transparent = gg.Color{0, 0, 0, 0}

pub struct Rect {
pub mut:
	x f32
	y f32
	w f32
	h f32
}

pub fn (r Rect) contains(x f32, y f32) bool {
	return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
}

pub fn (r Rect) inset(dx f32, dy f32) Rect {
	return Rect{r.x + dx, r.y + dy, r.w - 2 * dx, r.h - 2 * dy}
}

pub fn (r Rect) intersect(o Rect) Rect {
	x := if r.x > o.x { r.x } else { o.x }
	y := if r.y > o.y { r.y } else { o.y }
	x2 := if r.x + r.w < o.x + o.w { r.x + r.w } else { o.x + o.w }
	y2 := if r.y + r.h < o.y + o.h { r.y + r.h } else { o.y + o.h }
	return Rect{x, y, if x2 > x { x2 - x } else { 0 }, if y2 > y { y2 - y } else { 0 }}
}

pub fn (r Rect) bottom() f32 {
	return r.y + r.h
}

pub fn (r Rect) right() f32 {
	return r.x + r.w
}

pub struct KeyPress {
pub:
	code gg.KeyCode
	mods u32
}

pub fn (k KeyPress) ctrl() bool {
	// Ctrl on Linux/Windows, Cmd on macOS.
	return k.mods & (u32(2) | u32(8)) != 0
}

pub fn (k KeyPress) shift() bool {
	return k.mods & u32(1) != 0
}

pub enum ButtonStyle {
	primary
	secondary
	outline
	ghost
	danger
	tab
	tab_active
}

pub enum FieldKind {
	text
	number
	time
	date
	email
	password
	multiline
}

// Input holds the text of a field while it is edited.
pub struct Input {
pub mut:
	text string
}

pub fn input(s string) Input {
	return Input{s}
}

pub enum FieldEvent {
	none
	changed
	committed // Tab, or focus moved away
	submitted // Enter (also a commit)
	cancelled // Escape: the value was restored
}

struct FieldState {
mut:
	cursor   int // rune index
	original string
	scroll_x f32
}

@[heap]
pub struct Ui {
pub mut:
	ctx   &gg.Context = unsafe { nil }
	theme Theme       = light_theme
	// Base font size; widgets scale from it.
	font_size int = 16
mut:
	mx         f32
	my         f32
	down       bool
	pressed    bool
	released   bool
	press_x    f32
	press_y    f32
	drag       bool
	touch      bool
	last_ty    f32
	scroll_dy  f32
	zoom_steps int
	keys       []KeyPress
	chars      []rune
	focus      string
	tab_from   string
	// Shift+Tab: the field to focus when it is drawn next.
	focus_request string
	focus_ids     []string
	fields        map[string]FieldState
	clip          Rect
	clips         []Rect
	scrolls       map[string]f32
	// Content heights from the last frame, to place the scroll bars.
	content_hs map[string]f32
	// The scroll area whose bar is being dragged, and where on the thumb.
	bar_drag string
	bar_grab f32
	cursor   sapp.MouseCursor = .default
	want     sapp.MouseCursor = .default
	// Set when something changed after it was drawn, so another frame is needed.
	redraw bool
	// Horizontal scrolling, like scroll_dy.
	last_tx    f32
	scroll_dx  f32
	hscrolls   map[string]f32
	content_ws map[string]f32
	hbar_drag  string
	hbar_grab  f32
	// The open drop-down menu (see dropdown in widgets.v).
	menu Menu
	// The keyboard as this frame left it, applied in end_frame: moving
	// from one field to the next hides and shows it in the same frame, and
	// Android drops a show that comes right after a hide.
	keyboard KeyboardRequest
	// Screen edges the system covers, in pixels: the status bar at the top,
	// and the navigation bar or the on-screen keyboard at the bottom. Layout
	// starts below the first, and height() leaves out both.
	inset_top_px    int
	inset_bottom_px int
	// Scroll the focused field into view at the end of its scroll area: it
	// was just focused, or the keyboard came up over it.
	reveal_focus bool
	focus_rect   Rect
	focus_drawn  bool
pub mut:
	// Shows (or hides) the on-screen keyboard for a field of `kind` whose
	// text before the cursor is `before`; nil: sokol's own, on phones.
	keyboard_fn fn (show bool, kind FieldKind, before string) = unsafe { nil }
}

pub fn new_ui() &Ui {
	return &Ui{}
}

// width and height are in layout units, which shrink as the app zooms in
// (gg.window_size only accounts for the screen's DPI).
pub fn (ui &Ui) width() f32 {
	return f32(sapp.width()) / ui.scale()
}

pub fn (ui &Ui) height() f32 {
	return f32(sapp.height() - ui.inset_top_px - ui.inset_bottom_px) / ui.scale()
}

// top is where layout starts on the screen, below the status bar.
fn (ui &Ui) top() f32 {
	return f32(ui.inset_top_px) / ui.scale()
}

// set_insets tells the gui which screen edges the system covers, in pixels.
pub fn (mut ui Ui) set_insets(top int, bottom int) {
	if top == ui.inset_top_px && bottom == ui.inset_bottom_px {
		return
	}
	if bottom > ui.inset_bottom_px {
		ui.reveal_focus = true
	}
	ui.inset_top_px = top
	ui.inset_bottom_px = bottom
	ui.redraw = true
}

// begin_drawing, right after gg's begin, paints the status bar's strip in
// `bar` and moves the origin below it.
pub fn (ui &Ui) begin_drawing(bar gg.Color) {
	if ui.inset_top_px > 0 {
		ui.ctx.draw_rect_filled(0, 0, ui.width(), ui.top(), bar)
		ui.ctx.r.translate(0, f32(ui.inset_top_px), 0)
	}
}

fn (ui &Ui) scale() f32 {
	return if ui.ctx != unsafe { nil } && ui.ctx.scale > 0 { ui.ctx.scale } else { 1 }
}

// take_zoom_steps returns the Ctrl+scroll wheel notches since the last call
// (positive to zoom in).
pub fn (mut ui Ui) take_zoom_steps() int {
	n := ui.zoom_steps
	ui.zoom_steps = 0
	return n
}

pub fn (ui &Ui) has_focus() bool {
	return ui.focus != ''
}

pub fn (ui &Ui) is_touch() bool {
	return ui.touch
}

// handle_event records input for the next frame.
pub fn (mut ui Ui) handle_event(e &gg.Event) {
	match e.typ {
		.mouse_move {
			ui.touch = false
			ui.mx = e.mouse_x
			ui.my = e.mouse_y - ui.top()
		}
		.mouse_down {
			if e.mouse_button == .left {
				ui.touch = false
				ui.mx = e.mouse_x
				ui.my = e.mouse_y - ui.top()
				ui.down = true
				ui.pressed = true
				ui.press_x = e.mouse_x
				ui.press_y = e.mouse_y - ui.top()
				ui.drag = false
			}
		}
		.mouse_up {
			if e.mouse_button == .left {
				ui.mx = e.mouse_x
				ui.my = e.mouse_y - ui.top()
				ui.down = false
				ui.released = true
			}
		}
		.mouse_scroll {
			if e.modifiers & (u32(2) | u32(8)) != 0 {
				if e.scroll_y > 0 {
					ui.zoom_steps++
				} else if e.scroll_y < 0 {
					ui.zoom_steps--
				}
			} else if e.modifiers & u32(1) != 0 {
				ui.scroll_dx -= e.scroll_y * 48
			} else {
				ui.scroll_dy -= e.scroll_y * 48
			}
			ui.scroll_dx -= e.scroll_x * 48
		}
		.touches_began, .touches_moved, .touches_ended, .touches_cancelled {
			if e.num_touches < 1 {
				return
			}
			scale := ui.scale()
			x := e.touches[0].pos_x / scale
			y := e.touches[0].pos_y / scale - ui.top()
			ui.touch = true
			ui.mx = x
			ui.my = y
			match e.typ {
				.touches_began {
					ui.down = true
					ui.pressed = true
					ui.press_x = x
					ui.press_y = y
					ui.last_ty = y
					ui.last_tx = x
					ui.drag = false
				}
				.touches_moved {
					if !ui.drag && (abs(x - ui.press_x) > 10 || abs(y - ui.press_y) > 10) {
						ui.drag = true
					}
					if ui.drag {
						ui.scroll_dy -= y - ui.last_ty
						ui.scroll_dx -= x - ui.last_tx
					}
					ui.last_ty = y
					ui.last_tx = x
				}
				.touches_cancelled {
					ui.down = false
					ui.drag = true
				}
				else {
					ui.down = false
					ui.released = true
				}
			}
		}
		.key_down {
			ui.keys << KeyPress{e.key_code, e.modifiers}
		}
		.char {
			// Control characters arrive as key_down events too; Ctrl/Cmd
			// combinations are shortcuts, not text.
			if e.char_code >= 32 && e.char_code != 127 && e.modifiers & (u32(2) | u32(8)) == 0 {
				ui.chars << rune(e.char_code)
			}
		}
		else {}
	}
}

pub fn (mut ui Ui) begin_frame() {
	ui.focus_ids.clear()
	ui.want = .default
	ui.clip = Rect{0, 0, ui.width(), ui.height()}
	ui.clips.clear()
	ui.redraw = false
}

// end_frame clears this frame's input. It returns true when another frame
// should be drawn right away.
pub fn (mut ui Ui) end_frame() bool {
	if ui.focus != '' && ui.focus !in ui.focus_ids {
		ui.blur()
	}
	ui.apply_keyboard()
	ui.reveal_focus = false
	ui.tab_from = ''
	ui.pressed = false
	ui.released = false
	ui.keys.clear()
	ui.chars.clear()
	ui.scroll_dy = 0
	ui.scroll_dx = 0
	if !ui.down {
		ui.drag = false
	}
	if ui.want != ui.cursor {
		ui.cursor = ui.want
		$if !ios && !android {
			sapp.set_mouse_cursor(ui.cursor)
		}
	}
	return ui.redraw
}

pub fn (mut ui Ui) request_redraw() {
	ui.redraw = true
}

// key_pressed reports (and consumes) a key press that no field used.
pub fn (mut ui Ui) key_pressed(code gg.KeyCode, ctrl bool) bool {
	for i, k in ui.keys {
		if k.code == code && k.ctrl() == ctrl {
			ui.keys.delete(i)
			return true
		}
	}
	return false
}

pub fn (mut ui Ui) blur() {
	if ui.focus != '' {
		ui.focus = ''
		ui.show_keyboard(false, .text, '')
		ui.redraw = true
	}
}

struct KeyboardRequest {
	pending bool
	show    bool
	kind    FieldKind
	before  string
}

fn (mut ui Ui) show_keyboard(show bool, kind FieldKind, before string) {
	ui.keyboard = KeyboardRequest{true, show, kind, before}
}

fn (mut ui Ui) apply_keyboard() {
	k := ui.keyboard
	if !k.pending {
		return
	}
	ui.keyboard = KeyboardRequest{}
	if ui.keyboard_fn != unsafe { nil } {
		ui.keyboard_fn(k.show, k.kind, k.before)
		return
	}
	$if ios || android {
		sapp.show_keyboard(k.show)
	}
}

fn (mut ui Ui) set_focus(id string, value string, cursor int, kind FieldKind) {
	ui.focus = id
	ui.focus_request = ''
	ui.fields[id] = FieldState{
		cursor:   cursor
		original: value
	}
	ui.reveal_focus = true
	runes := value.runes()
	ui.show_keyboard(true, kind, runes[..if cursor < runes.len { cursor } else { runes.len }].string())
	ui.redraw = true
}

// ---- hit testing ----

// in_clip reports whether a point is visible: inside the clip, and not
// under an open drop-down menu (unless that menu is asking).
fn (ui &Ui) in_clip(x f32, y f32) bool {
	return ui.clip.contains(x, y) && !ui.under_menu(x, y)
}

pub fn (ui &Ui) hovered(r Rect) bool {
	return !ui.touch && r.contains(ui.mx, ui.my) && ui.in_clip(ui.mx, ui.my)
}

// pressing reports whether the pointer is held down on r.
pub fn (ui &Ui) pressing(r Rect) bool {
	return ui.down && !ui.drag && r.contains(ui.press_x, ui.press_y)
		&& ui.in_clip(ui.press_x, ui.press_y) && r.contains(ui.mx, ui.my)
}

// clicked reports a press and release inside r (not a scroll drag).
pub fn (mut ui Ui) clicked(r Rect) bool {
	if ui.released && !ui.drag && r.contains(ui.press_x, ui.press_y)
		&& ui.in_clip(ui.press_x, ui.press_y) && r.contains(ui.mx, ui.my) {
		ui.released = false
		return true
	}
	return false
}

pub fn (mut ui Ui) pointer_cursor(r Rect) {
	if ui.hovered(r) {
		ui.want = .pointing_hand
	}
}

// pointer returns the pointer position, and whether it is inside r and
// not hidden by the clip (for hover tooltips; a tap counts on touch screens).
pub fn (ui &Ui) pointer_in(r Rect) (f32, f32, bool) {
	inside := r.contains(ui.mx, ui.my) && ui.in_clip(ui.mx, ui.my) && !ui.drag
	return ui.mx, ui.my, inside
}

// ---- clipping and scrolling ----

pub fn (mut ui Ui) push_clip(r Rect) {
	ui.clips << ui.clip
	ui.clip = ui.clip.intersect(r)
	ui.apply_clip()
}

pub fn (ui &Ui) clip_rect() Rect {
	return ui.clip
}

pub fn (mut ui Ui) pop_clip() {
	if ui.clips.len > 0 {
		ui.clip = ui.clips.pop()
	}
	ui.apply_clip()
}

fn (ui &Ui) apply_clip() {
	c := ui.clip
	ui.ctx.scissor_rect(int(c.x), int(c.y + ui.top()), int(c.w + 0.999), int(c.h + 0.999))
}

// begin_scroll starts a vertical scroll area and returns its scroll offset.
// Draw the content at `r.y - offset`, then call end_scroll with its height.
pub fn (mut ui Ui) begin_scroll(id string, r Rect) f32 {
	mut off := ui.scrolls[id] or { 0 }
	if ui.scroll_dy != 0 && (r.contains(ui.mx, ui.my) || (ui.drag
		&& r.contains(ui.press_x, ui.press_y))) {
		off += ui.scroll_dy
		ui.scroll_dy = 0
	}
	// The scroll bar: drag the thumb, or click the track to page.
	if bar := ui.scroll_bar(id, r) {
		if ui.pressed && !ui.touch && bar.track.contains(ui.press_x, ui.press_y)
			&& ui.in_clip(ui.press_x, ui.press_y) {
			ui.pressed = false
			if bar.thumb.contains(ui.press_x, ui.press_y) {
				ui.bar_drag = id
				ui.bar_grab = ui.press_y - bar.thumb.y
			} else if ui.press_y < bar.thumb.y {
				off -= r.h * 0.9
			} else {
				off += r.h * 0.9
			}
		}
		if ui.bar_drag == id {
			if ui.down {
				span := r.h - bar.thumb.h
				if span > 0 {
					off = (ui.my - ui.bar_grab - r.y) / span * bar.max
				}
			} else {
				ui.bar_drag = ''
			}
		}
		if off > bar.max {
			off = bar.max
		}
	}
	if off < 0 {
		off = 0
	}
	ui.scrolls[id] = off
	ui.push_clip(r)
	ui.focus_drawn = false
	return off
}

pub fn (mut ui Ui) end_scroll(id string, r Rect, content_h f32) {
	ui.pop_clip()
	ui.content_hs[id] = content_h
	max := if content_h > r.h { content_h - r.h } else { 0 }
	mut off := ui.scrolls[id] or { 0 }
	if ui.reveal_focus && ui.focus_drawn {
		ui.reveal_focus = false
		f := ui.focus_rect
		margin := f32(12)
		if f.y + f.h + margin > r.y + r.h {
			off += f.y + f.h + margin - (r.y + r.h)
		} else if f.y - margin < r.y {
			off -= r.y - (f.y - margin)
		}
		if off < 0 {
			off = 0
		}
		ui.scrolls[id] = off
		ui.redraw = true
	}
	if off > max {
		ui.scrolls[id] = max
		ui.redraw = true
	}
	if bar := ui.scroll_bar(id, r) {
		active := ui.bar_drag == id || ui.hovered(bar.track)
		if active {
			ui.rect(bar.track, hexa(0x808080, 40))
		}
		w := if active { f32(8) } else { f32(5) }
		ui.ctx.draw_rounded_rect_filled(bar.track.right() - w - 3, bar.thumb.y, w, bar.thumb.h,
			w / 2, hexa(0x808080, if active { u8(180) } else { u8(110) }))
	}
}

struct ScrollBar {
	track Rect
	thumb Rect
	max   f32 // the largest scroll offset
}

const scroll_bar_width = f32(14)

// scroll_bar places a scroll area's bar from last frame's content height,
// or returns none when everything fits.
fn (ui &Ui) scroll_bar(id string, r Rect) ?ScrollBar {
	content_h := ui.content_hs[id] or { return none }
	if content_h <= r.h {
		return none
	}
	max := content_h - r.h
	mut off := ui.scrolls[id] or { 0 }
	off = if off < 0 {
		0
	} else if off > max {
		max
	} else {
		off
	}
	mut th := r.h * r.h / content_h
	if th < 32 {
		th = 32
	}
	track := Rect{r.right() - scroll_bar_width, r.y, scroll_bar_width, r.h}
	return ScrollBar{
		track: track
		thumb: Rect{track.x, r.y + (r.h - th) * off / max, scroll_bar_width, th}
		max:   max
	}
}

pub fn (mut ui Ui) set_scroll(id string, off f32) {
	ui.scrolls[id] = off
}

// scroll_by moves a scroll area; end_scroll keeps it in range.
pub fn (mut ui Ui) scroll_by(id string, dy f32) {
	off := (ui.scrolls[id] or { 0 }) + dy
	ui.scrolls[id] = if off < 0 { 0 } else { off }
	ui.redraw = true
}

// ---- drawing helpers ----

pub struct TextStyle {
pub:
	size   int // 0 means the base font size
	color  gg.Color = transparent // transparent means the theme text color
	bold   bool
	align  gg.HorizontalAlign = .left
	valign gg.VerticalAlign   = .top
}

fn (ui &Ui) cfg(s TextStyle) gg.TextCfg {
	return gg.TextCfg{
		size:           if s.size > 0 { s.size } else { ui.font_size }
		color:          if s.color.a == 0 { ui.theme.text } else { s.color }
		bold:           s.bold
		align:          s.align
		vertical_align: s.valign
	}
}

pub fn (ui &Ui) text(x f32, y f32, s string, style TextStyle) {
	ui.ctx.draw_text(int(x), int(y), s, ui.cfg(style))
}

pub fn (ui &Ui) text_width(s string, style TextStyle) f32 {
	ui.ctx.set_text_cfg(ui.cfg(style))
	return ui.ctx.text_width_f(s)
}

// line_height is the height of one line of text at the given size.
pub fn (ui &Ui) line_height(size int) f32 {
	return f32(if size > 0 { size } else { ui.font_size }) * 1.35
}

// fit shortens s with an ellipsis so it fits in w.
pub fn (ui &Ui) fit(s string, w f32, style TextStyle) string {
	if ui.text_width(s, style) <= w {
		return s
	}
	runes := s.runes()
	mut n := runes.len
	for n > 0 {
		n--
		t := runes[..n].string() + '…'
		if ui.text_width(t, style) <= w {
			return t
		}
	}
	return ''
}

// wrap splits text into lines no wider than w, breaking at spaces.
pub fn (ui &Ui) wrap(s string, w f32, style TextStyle) []string {
	mut lines := []string{}
	for para in s.split('\n') {
		mut line := ''
		for word in para.split(' ') {
			candidate := if line == '' { word } else { line + ' ' + word }
			if line != '' && ui.text_width(candidate, style) > w {
				lines << line
				line = word
			} else {
				line = candidate
			}
		}
		lines << line
	}
	return lines
}

pub fn (ui &Ui) rect(r Rect, c gg.Color) {
	ui.ctx.draw_rect_filled(r.x, r.y, r.w, r.h, c)
}

pub fn (ui &Ui) rounded(r Rect, radius f32, c gg.Color) {
	ui.ctx.draw_rounded_rect_filled(r.x, r.y, r.w, r.h, radius, c)
}

pub fn (ui &Ui) rounded_border(r Rect, radius f32, c gg.Color) {
	ui.ctx.draw_rounded_rect_empty(r.x, r.y, r.w, r.h, radius, c)
}

pub fn (ui &Ui) hline(x f32, y f32, w f32, c gg.Color) {
	ui.ctx.draw_rect_filled(x, y, w, 1, c)
}

// ---- widgets ----

pub fn (ui &Ui) button_height() f32 {
	return f32(ui.font_size) * 2.4
}

// button_width is the natural width of a button with this label.
pub fn (ui &Ui) button_width(label string) f32 {
	return ui.text_width(label, TextStyle{}) + f32(ui.font_size) * 1.6
}

pub fn (mut ui Ui) button(r Rect, label string, style ButtonStyle) bool {
	t := ui.theme
	hover := ui.hovered(r)
	down := ui.pressing(r)
	mut bg := transparent
	mut fg := t.text
	mut border := transparent
	match style {
		.primary {
			bg = if hover || down { t.primary_hover } else { t.primary }
			fg = t.on_primary
		}
		.secondary {
			bg = if hover || down { t.text } else { t.secondary }
			fg = if hover || down { t.bg } else { t.on_primary }
		}
		.danger {
			bg = t.danger
			fg = t.on_primary
			if hover || down {
				bg = gg.Color{u8(f32(bg.r) * 0.85), u8(f32(bg.g) * 0.85), u8(f32(bg.b) * 0.85), 255}
			}
		}
		.outline {
			border = t.border
			bg = if down {
				t.surface_hi
			} else if hover {
				t.surface_alt
			} else {
				transparent
			}
		}
		.ghost {
			bg = if down {
				t.surface_hi
			} else if hover {
				t.surface_alt
			} else {
				transparent
			}
		}
		.tab {
			bg = if down {
				t.surface_hi
			} else if hover {
				t.surface_alt
			} else {
				transparent
			}
			fg = t.link
		}
		.tab_active {
			bg = t.surface_alt
			fg = t.text
		}
	}
	if bg.a > 0 {
		ui.rounded(r, 6, bg)
	}
	if border.a > 0 {
		ui.rounded_border(r, 6, border)
	}
	text_style := TextStyle{
		color:  fg
		bold:   style == .tab_active
		align:  .center
		valign: .middle
	}
	ui.push_clip(r)
	ui.text(r.x + r.w / 2, r.y + r.h / 2, ui.fit(label, r.w - 8, text_style), text_style)
	ui.pop_clip()
	if style == .tab_active {
		ui.rect(Rect{r.x + 8, r.bottom() - 3, r.w - 16, 3}, t.primary)
	}
	ui.pointer_cursor(r)
	return ui.clicked(r)
}

// link draws clickable accent text and returns whether it was clicked.
pub fn (mut ui Ui) link(x f32, y f32, label string, style TextStyle) bool {
	s := TextStyle{
		...style
		color: ui.theme.link
	}
	w := ui.text_width(label, s)
	h := ui.line_height(s.size)
	r := Rect{x, y, w, h}
	ui.text(x, y, label, s)
	if ui.hovered(r) {
		ui.hline(x, y + h - 3, w, ui.theme.link)
	}
	ui.pointer_cursor(r)
	return ui.clicked(r)
}

pub fn (ui &Ui) field_height() f32 {
	return f32(ui.font_size) * 2.4
}

const field_pad = f32(10)

// multiline_height is the height a multiline field needs for value: it grows
// with the text, like the web app's elastic textarea.
pub fn (ui &Ui) multiline_height(value string) f32 {
	n := value.count('\n') + 1
	lines := if n < 3 { 3 } else { n }
	return lines * ui.line_height(0) + 2 * field_pad
}

fn allowed(kind FieldKind, c rune) bool {
	return match kind {
		.number { (c >= `0` && c <= `9`) || c == `.` || c == `,` }
		.date { (c >= `0` && c <= `9`) || c == `-` }
		.time { (c >= `0` && c <= `9`) || c in [`:`, ` `, `a`, `p`, `m`, `A`, `P`, `M`] }
		else { true }
	}
}

// field is a text input bound to `value`. It returns .committed (.submitted
// for Enter) when the user is done editing (Enter, Tab, or clicking
// elsewhere; Escape restores), which is when the app should validate and save.
pub fn (mut ui Ui) field(id string, r Rect, mut input Input, kind FieldKind, placeholder string) FieldEvent {
	mut value := input.text
	defer {
		input.text = value
	}
	t := ui.theme
	ui.focus_ids << id
	multiline := kind == .multiline
	mut ev := FieldEvent.none
	style := TextStyle{}
	lh := ui.line_height(0)

	// Tab from the previous field moves focus here.
	if ui.tab_from != '' && ui.focus_ids.len >= 2 && ui.focus_ids[ui.focus_ids.len - 2] == ui.tab_from {
		ui.tab_from = ''
		ui.set_focus(id, value, value.runes().len, kind)
	} else if ui.focus_request == id {
		ui.set_focus(id, value, value.runes().len, kind)
	}

	mut focused := ui.focus == id
	if ui.hovered(r) {
		ui.want = .ibeam
	}
	if ui.pressed && ui.in_clip(ui.press_x, ui.press_y) {
		if r.contains(ui.press_x, ui.press_y) {
			pos := ui.cursor_at(value, kind, r, ui.press_x, ui.press_y)
			if focused {
				mut st := ui.fields[id] or { FieldState{} }
				st.cursor = pos
				ui.fields[id] = st
				// Brings the keyboard back if it was put away.
				ui.show_keyboard(true, kind, value.runes()[..pos].string())
			} else {
				ui.set_focus(id, value, pos, kind)
				focused = true
			}
		} else if focused {
			ui.focus = ''
			focused = false
			ui.show_keyboard(false, kind, '')
			return .committed
		}
	}

	mut st := ui.fields[id] or { FieldState{} }
	if focused {
		ui.focus_rect = r
		ui.focus_drawn = true
		mut runes := value.runes()
		if st.cursor > runes.len {
			st.cursor = runes.len
		}
		for c in ui.chars {
			if allowed(kind, c) {
				runes.insert(st.cursor, c)
				st.cursor++
				ev = .changed
			}
		}
		ui.chars.clear()
		mut done := false
		mut entered := false
		mut remaining := []KeyPress{}
		for k in ui.keys {
			match k.code {
				.backspace {
					if st.cursor > 0 {
						runes.delete(st.cursor - 1)
						st.cursor--
						ev = .changed
					}
				}
				.delete {
					if st.cursor < runes.len {
						runes.delete(st.cursor)
						ev = .changed
					}
				}
				.left {
					if st.cursor > 0 {
						st.cursor--
					}
				}
				.right {
					if st.cursor < runes.len {
						st.cursor++
					}
				}
				.home {
					st.cursor = if multiline { line_start(runes, st.cursor) } else { 0 }
				}
				.end {
					st.cursor = if multiline { line_end(runes, st.cursor) } else { runes.len }
				}
				.up, .down {
					if multiline {
						st.cursor = vertical_move(runes, st.cursor, k.code == .up)
					} else {
						remaining << k
					}
				}
				.enter, .kp_enter {
					if multiline && !k.ctrl() {
						runes.insert(st.cursor, `\n`)
						st.cursor++
						ev = .changed
					} else {
						done = true
						entered = true
					}
				}
				.tab {
					done = true
					if k.shift() {
						idx := ui.focus_ids.len - 2
						if idx >= 0 {
							ui.focus_request = ui.focus_ids[idx]
						}
					} else {
						ui.tab_from = id
					}
				}
				.escape {
					runes = st.original.runes()
					st.cursor = runes.len
					value = st.original
					ui.fields[id] = st
					ui.keys.clear()
					ui.blur()
					return .cancelled
				}
				else {
					remaining << k
				}
			}
		}
		ui.keys = remaining
		if ev == .changed {
			value = runes.string()
		}
		ui.fields[id] = st
		if done {
			if ui.focus == id {
				ui.blur()
			}
			ev = if entered { FieldEvent.submitted } else { FieldEvent.committed }
			focused = false
		}
	}

	// Draw.
	ui.rounded(r, 6, t.input_bg)
	if focused {
		ui.rounded_border(r.inset(-2, -2), 7, t.focus_ring)
		ui.rounded_border(r, 6, t.primary)
	} else {
		ui.rounded_border(r, 6, t.border)
	}
	inner := r.inset(field_pad, 0)
	ui.push_clip(inner)
	display := if kind == .password { '•'.repeat(value.runes().len) } else { value }
	if value == '' && !focused {
		ui.text(inner.x, r.y + r.h / 2, placeholder, TextStyle{
			color:  t.muted
			valign: .middle
		})
	} else if multiline {
		for i, line in display.split('\n') {
			ui.text(inner.x, r.y + field_pad + i * lh, line, style)
		}
	} else {
		// Keep the caret in view by scrolling long text horizontally.
		caret_x := ui.text_width(display.runes()[..clamp(st.cursor, 0, display.runes().len)].string(),
			style)
		if focused {
			if caret_x - st.scroll_x > inner.w - 2 {
				st.scroll_x = caret_x - inner.w + 2
			} else if caret_x < st.scroll_x {
				st.scroll_x = caret_x
			}
			ui.fields[id] = st
		} else {
			st.scroll_x = 0
			ui.fields[id] = st
		}
		ui.text(inner.x - st.scroll_x, r.y + r.h / 2, display, TextStyle{
			valign: .middle
		})
	}
	if focused {
		runes := display.runes()
		cur := clamp(st.cursor, 0, runes.len)
		mut cx := f32(0)
		mut cy := f32(0)
		if multiline {
			line, col_start := line_of(runes, cur)
			cx = inner.x + ui.text_width(runes[col_start..cur].string(), style)
			cy = r.y + field_pad + line * lh
		} else {
			cx = inner.x - st.scroll_x + ui.text_width(runes[..cur].string(), style)
			cy = r.y + (r.h - lh) / 2
		}
		ui.rect(Rect{cx, cy + 2, 2, lh - 4}, t.text)
	}
	ui.pop_clip()
	return ev
}

// cursor_at maps a click to a rune index in the field's text.
fn (ui &Ui) cursor_at(value string, kind FieldKind, r Rect, x f32, y f32) int {
	runes := if kind == .password { '•'.repeat(value.runes().len).runes() } else { value.runes() }
	mut start := 0
	mut end := runes.len
	if kind == .multiline {
		line := int((y - r.y - field_pad) / ui.line_height(0))
		mut l := 0
		for i, c in runes {
			if c == `\n` {
				if l == line {
					end = i
					break
				}
				l++
				start = i + 1
			}
		}
		if l < line {
			return runes.len
		}
	}
	scroll := if kind == .multiline {
		f32(0)
	} else {
		(ui.fields[ui.focus] or { FieldState{} }).scroll_x
	}
	target := x - (r.x + field_pad) + if ui.focus != '' { scroll } else { f32(0) }
	mut prev := f32(0)
	for i in start .. end {
		w := ui.text_width(runes[start..i + 1].string(), TextStyle{})
		if target < (prev + w) / 2 {
			return i
		}
		prev = w
	}
	return end
}

fn line_start(runes []rune, cur int) int {
	mut i := cur
	for i > 0 && runes[i - 1] != `\n` {
		i--
	}
	return i
}

fn line_end(runes []rune, cur int) int {
	mut i := cur
	for i < runes.len && runes[i] != `\n` {
		i++
	}
	return i
}

// line_of returns the line number of the cursor and where that line starts.
fn line_of(runes []rune, cur int) (int, int) {
	mut line := 0
	mut start := 0
	for i in 0 .. cur {
		if runes[i] == `\n` {
			line++
			start = i + 1
		}
	}
	return line, start
}

fn vertical_move(runes []rune, cur int, up bool) int {
	start := line_start(runes, cur)
	col := cur - start
	if up {
		if start == 0 {
			return 0
		}
		prev_start := line_start(runes, start - 1)
		return prev_start + min(col, start - 1 - prev_start)
	}
	end := line_end(runes, cur)
	if end >= runes.len {
		return runes.len
	}
	next_start := end + 1
	return next_start + min(col, line_end(runes, next_start) - next_start)
}

fn clamp(v int, lo int, hi int) int {
	return if v < lo {
		lo
	} else if v > hi {
		hi
	} else {
		v
	}
}

fn min(a int, b int) int {
	return if a < b { a } else { b }
}

fn abs(v f32) f32 {
	return if v < 0 { -v } else { v }
}
