module main

import gg
import math
import os
import time
import core
import gui

enum Screen {
	entry
	entries
	charts
	settings
}

const screens = [Screen.entry, .entries, .charts, .settings]

fn (s Screen) title() string {
	return match s {
		.entry { 'Entry' }
		.entries { 'Entries' }
		.charts { 'Charts' }
		.settings { 'Settings' }
	}
}

const pad = f32(16)
// Text size limits and step, in percent.
const zoom_min = 50
const zoom_max = 300
const zoom_step = 10
const max_content_width = f32(760)

struct SyncDone {
	req    core.SyncRequest
	res    core.SyncResponse
	manual bool
}

struct LoginDone {
	tokens core.AuthTokens
	error  string
}

@[heap]
struct App {
mut:
	gg     &gg.Context = unsafe { nil }
	ui     &gui.Ui
	store  &core.Store
	screen Screen
	// Toast message at the bottom of the window.
	toast       string
	toast_error bool
	toast_until i64
	// Sync runs on a worker thread; results come back on these channels.
	syncing        bool
	sync_ch        chan SyncDone
	sync_due       i64
	last_sync      i64
	logging_in     bool
	login_ch       chan LoginDone
	entry          EntryForm
	entries        EntriesView
	charts         ChartsView
	settings       SettingsForm
	login          LoginForm
	theme_resolved string
	// gg's own scale for the screen's DPI; the zoom multiplies it.
	base_scale   f32 = 1
	zoom_changed bool
}

fn new_app(store &core.Store) &App {
	mut app := &App{
		ui:       gui.new_ui()
		store:    store
		sync_ch:  chan SyncDone{cap: 1}
		login_ch: chan LoginDone{cap: 1}
	}
	app.apply_theme()
	app.load_entry(core.default_entry_date().str())
	return app
}

fn now_ms() i64 {
	return time.now().unix_milli()
}

fn (mut app App) apply_theme() {
	mut theme := app.store.theme
	if theme == '' {
		theme = if system_prefers_dark() { 'dark' } else { 'light' }
	}
	app.theme_resolved = theme
	app.ui.theme = if theme == 'dark' { gui.dark_theme } else { gui.light_theme }
	if app.gg != unsafe { nil } {
		app.gg.set_bg_color(app.ui.theme.bg)
	}
}

// system_prefers_dark makes a best guess at the desktop's color scheme.
fn system_prefers_dark() bool {
	$if linux {
		if os.getenv('GTK_THEME').to_lower().contains('dark') {
			return true
		}
		res := os.exec(['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'])
		return res.exit_code == 0 && res.output.contains('dark')
	}
	return false
}

// apply_zoom scales everything gg draws (and the pointer coordinates it
// reports) by the saved zoom. gg resets its scale on resize, so this runs
// after every resize too.
fn (mut app App) apply_zoom() {
	app.gg.scale = app.base_scale * f32(app.store.zoom)
	app.gg.ft.scale = app.gg.scale
	app.ui.request_redraw()
}

// zoom_by changes the text size in 10% steps. A size between steps (from an
// older version) moves to the next step in that direction.
fn (mut app App) zoom_by(steps int) {
	pct := int(math.round(app.store.zoom * 100))
	mut next := if steps > 0 {
		pct / zoom_step * zoom_step + steps * zoom_step
	} else {
		(pct + zoom_step - 1) / zoom_step * zoom_step + steps * zoom_step
	}
	next = if next < zoom_min {
		zoom_min
	} else if next > zoom_max {
		zoom_max
	} else {
		next
	}
	app.set_zoom(f64(next) / 100)
}

fn (mut app App) set_zoom(zoom f64) {
	if zoom == app.store.zoom {
		return
	}
	app.store.set_zoom(zoom) or { app.show_error('Could not save the text size: ${err}') }
	// Applied at the start of the next frame, so a frame is never drawn
	// half at one size and half at another.
	app.zoom_changed = true
	app.ui.request_redraw()
	app.show_toast('Text size ${zoom_percent(zoom)}')
}

fn zoom_percent(zoom f64) string {
	return '${int(math.round(zoom * 100))}%'
}

fn (mut app App) toggle_theme() {
	next := if app.theme_resolved == 'dark' { 'light' } else { 'dark' }
	app.store.set_theme(next) or { app.show_error('Could not save the theme: ${err}') }
	app.apply_theme()
}

fn (mut app App) show_toast(msg string) {
	app.toast = msg
	app.toast_error = false
	app.toast_until = now_ms() + 3000
	app.wake_after(3050)
}

fn (mut app App) show_error(msg string) {
	app.toast = msg
	app.toast_error = true
	app.toast_until = now_ms() + 5000
	app.wake_after(5050)
}

// wake_after requests a redraw later; in ui_mode nothing is drawn without
// input, so timers (toasts, delayed sync) need a nudge.
fn (mut app App) wake_after(ms int) {
	spawn fn (ctx &gg.Context, ms int) {
		time.sleep(ms * time.millisecond)
		mut c := unsafe { ctx }
		c.refresh_ui()
	}(app.gg, ms)
}

fn (mut app App) navigate(s Screen) {
	if s == app.screen {
		return
	}
	app.commit_forms()
	app.ui.blur()
	app.screen = s
	app.ui.set_scroll('main', 0)
	match s {
		.entry { app.load_entry(app.entry.date.text) }
		.settings { app.load_settings() }
		else {}
	}
}

// commit_forms saves any edits that have not been committed yet.
fn (mut app App) commit_forms() {
	if app.entry.dirty {
		app.save_entry()
	}
	if app.settings.dirty {
		app.save_settings()
	}
	if app.charts.dirty {
		app.save_chart_settings()
	}
}

// ---- sync ----

fn (mut app App) schedule_sync() {
	if !app.store.auth.logged_in() {
		return
	}
	app.sync_due = now_ms() + 3000
	app.wake_after(3050)
}

fn (mut app App) on_focus() {
	// Pick up changes made on other devices.
	if now_ms() - app.last_sync > 60_000 {
		app.start_sync(false)
	}
}

fn (mut app App) start_sync(manual bool) {
	if app.syncing {
		return
	}
	if !app.store.auth.logged_in() {
		if manual {
			app.show_error('You are not logged in!')
			app.navigate(.settings)
		}
		return
	}
	app.commit_forms()
	app.sync_due = 0
	app.syncing = true
	app.last_sync = now_ms()
	req := app.store.begin_sync()
	spawn sync_worker(app.sync_ch, req, manual, app.gg)
}

fn sync_worker(ch chan SyncDone, req core.SyncRequest, manual bool, ctx &gg.Context) {
	res := core.perform_sync(req)
	ch <- SyncDone{req, res, manual}
	mut c := unsafe { ctx }
	c.refresh_ui()
}

fn (mut app App) poll_workers() {
	mut done := SyncDone{}
	if app.sync_ch.try_pop(mut done) == .success {
		app.syncing = false
		was_logged_in := app.store.auth.logged_in()
		summary := app.store.finish_sync(done.req, done.res) or {
			if done.manual || (was_logged_in && !app.store.auth.logged_in()) {
				app.show_error(err.msg())
			}
			return
		}
		if done.manual {
			app.show_toast('Synced!')
		}
		if summary.received > 0 {
			app.refresh_forms()
		}
		// Merged settings, or edits made during the sync, still need uploading.
		if app.store.pending.len > 0 {
			app.schedule_sync()
		}
	}
	mut login := LoginDone{}
	if app.login_ch.try_pop(mut login) == .success {
		app.logging_in = false
		if login.error != '' {
			app.show_error(login.error)
			return
		}
		app.store.auth = login.tokens
		app.store.save_auth() or { app.show_error('Could not save the login: ${err}') }
		app.login.password = gui.Input{}
		app.show_toast('Logged in as ${login.tokens.email}')
		app.start_sync(false)
	}
	if app.sync_due > 0 && now_ms() >= app.sync_due {
		app.start_sync(false)
	}
}

fn (mut app App) start_login() {
	if app.logging_in {
		return
	}
	email := app.login.email.text.trim_space()
	password := app.login.password.text
	if email == '' || password == '' {
		app.show_error('Enter your email and password.')
		return
	}
	app.logging_in = true
	server := app.store.server_url
	spawn fn (ch chan LoginDone, server string, email string, password string, ctx &gg.Context) {
		tokens := core.login(server, email, password) or {
			ch <- LoginDone{
				error: err.msg()
			}
			mut c := unsafe { ctx }
			c.refresh_ui()
			return
		}
		ch <- LoginDone{
			tokens: tokens
		}
		mut c := unsafe { ctx }
		c.refresh_ui()
	}(app.login_ch, server, email, password, app.gg)
}

fn (mut app App) logout() {
	server := app.store.server_url
	refresh := app.store.auth.refresh_token
	spawn core.logout(server, refresh)
	app.store.auth = core.AuthTokens{
		email: app.store.auth.email
	}
	app.store.save_auth() or {}
	app.login.email = gui.input(app.store.auth.email)
	app.show_toast('Logged out.')
}

// refresh_forms reloads forms after a sync brought in new data, unless the
// user is in the middle of editing them.
fn (mut app App) refresh_forms() {
	if !app.ui.has_focus() {
		if !app.entry.dirty {
			app.load_entry(app.entry.date.text)
		}
		if !app.settings.dirty && app.screen == .settings {
			app.load_settings()
		}
	}
}

fn open_in_browser(url string) {
	os.open_uri(url) or {}
}

// ---- frame ----

fn (mut app App) frame() {
	app.poll_workers()
	if app.zoom_changed {
		app.zoom_changed = false
		app.apply_zoom()
	}
	mut ui := app.ui
	ui.begin_frame()
	app.gg.begin()
	w := ui.width()
	h := ui.height()

	header_h := app.draw_header(w)
	area := gui.Rect{0, header_h, w, h - header_h}
	off := ui.begin_scroll('main', area)
	cw := if w - 2 * pad > max_content_width { max_content_width } else { w - 2 * pad }
	x := (w - cw) / 2
	y := area.y + pad - off
	content_h := match app.screen {
		.entry { app.draw_entry(x, y, cw) }
		.entries { app.draw_entries(x, y, cw, area) }
		.charts { app.draw_charts(x, y, cw) }
		.settings { app.draw_settings(x, y, cw) }
	} + 2 * pad
	ui.end_scroll('main', area, content_h)
	app.draw_toast(w, h)

	// Keyboard shortcuts that no field used.
	if ui.key_pressed(.r, true) {
		app.start_sync(true)
	}
	if !ui.has_focus() {
		page := area.h * 0.9
		if ui.key_pressed(.page_down, false) {
			ui.scroll_by('main', page)
		}
		if ui.key_pressed(.page_up, false) {
			ui.scroll_by('main', -page)
		}
		if ui.key_pressed(.down, false) {
			ui.scroll_by('main', 48)
		}
		if ui.key_pressed(.up, false) {
			ui.scroll_by('main', -48)
		}
		// Home/End, with or without Ctrl, go to the top or bottom.
		if ui.key_pressed(.home, false) || ui.key_pressed(.home, true) {
			ui.set_scroll('main', 0)
			ui.request_redraw()
		}
		if ui.key_pressed(.end, false) || ui.key_pressed(.end, true) {
			ui.scroll_by('main', content_h)
		}
	}
	if ui.key_pressed(.equal, true) || ui.key_pressed(.kp_add, true) {
		app.zoom_by(1)
	}
	if ui.key_pressed(.minus, true) || ui.key_pressed(.kp_subtract, true) {
		app.zoom_by(-1)
	}
	if ui.key_pressed(._0, true) || ui.key_pressed(.kp_0, true) {
		app.set_zoom(1.0)
	}
	steps := ui.take_zoom_steps()
	if steps != 0 {
		app.zoom_by(steps)
	}
	app.gg.end()
	if ui.end_frame() {
		app.gg.refresh_ui()
	}
}

fn (mut app App) draw_header(w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	bh := ui.button_height()
	top_h := bh + 16
	ui.rect(gui.Rect{0, 0, w, top_h}, t.surface)
	ui.text(pad, top_h / 2, '⚖ Weight', gui.TextStyle{
		size:   20
		bold:   true
		valign: .middle
	})

	// Right side: theme, sync, login.
	mut rx := w - pad
	logged_in := app.store.auth.logged_in()
	auth_label := if logged_in { 'Logout' } else { 'Login' }
	aw := ui.button_width(auth_label)
	rx -= aw
	if ui.button(gui.Rect{rx, 8, aw, bh}, auth_label, .outline) {
		if logged_in {
			app.logout()
		} else {
			app.navigate(.settings)
			app.login.focus_email = true
		}
	}
	pending := app.store.pending.len
	sync_label := if app.syncing {
		'↻ Syncing…'
	} else if pending > 0 {
		'↻ (${pending})'
	} else {
		'↻'
	}
	sw := ui.button_width(sync_label)
	rx -= sw + 8
	if ui.button(gui.Rect{rx, 8, sw, bh}, sync_label, .ghost) {
		app.start_sync(true)
	}
	theme_label := if app.theme_resolved == 'dark' { '☀' } else { '☾' }
	tw := bh
	rx -= tw + 8
	if ui.button(gui.Rect{rx, 8, tw, bh}, theme_label, .ghost) {
		app.toggle_theme()
	}

	// Navigation tabs.
	nav_y := top_h
	nav_h := bh + 8
	ui.rect(gui.Rect{0, nav_y, w, nav_h}, t.bg)
	ui.hline(0, nav_y + nav_h - 1, w, t.border)
	mut nx := pad
	for s in screens {
		label := s.title()
		bw := ui.button_width(label)
		style := if s == app.screen { gui.ButtonStyle.tab_active } else { gui.ButtonStyle.tab }
		if ui.button(gui.Rect{nx, nav_y + 4, bw, bh}, label, style) {
			app.navigate(s)
		}
		nx += bw + 4
	}
	return nav_y + nav_h
}

fn (mut app App) draw_toast(w f32, h f32) {
	if app.toast == '' {
		return
	}
	if now_ms() > app.toast_until {
		app.toast = ''
		return
	}
	mut ui := app.ui
	t := ui.theme
	style := gui.TextStyle{
		color:  t.on_primary
		align:  .center
		valign: .middle
	}
	max_w := if w - 2 * pad > 520 { f32(520) } else { w - 2 * pad }
	lines := ui.wrap(app.toast, max_w - 32, style)
	lh := ui.line_height(0)
	th := lines.len * lh + 20
	tw := max_w
	r := gui.Rect{(w - tw) / 2, h - th - 20, tw, th}
	ui.rounded(r, 8, if app.toast_error { t.danger } else { t.primary })
	for i, line in lines {
		ui.text(w / 2, r.y + 10 + lh * i + lh / 2, line, style)
	}
	if ui.clicked(r) {
		app.toast = ''
	}
}

// ---- shared layout helpers ----

fn (mut app App) heading(x f32, y f32, s string) f32 {
	app.ui.text(x, y, s, gui.TextStyle{
		size: 24
		bold: true
	})
	return y + 44
}

fn (mut app App) subheading(x f32, y f32, s string) f32 {
	app.ui.text(x, y, s, gui.TextStyle{
		size: 18
		bold: true
	})
	return y + 32
}

// labeled_field draws a label above a field and returns the field's event
// and the y below it.
fn (mut app App) labeled_field(id string, label string, x f32, y f32, w f32, mut input gui.Input, kind gui.FieldKind, placeholder string) (gui.FieldEvent, f32) {
	mut ui := app.ui
	ui.text(x, y, label, gui.TextStyle{
		size:  14
		color: ui.theme.muted
	})
	fy := y + 22
	fh := if kind == .multiline { ui.multiline_height(input.text) } else { ui.field_height() }
	ev := ui.field(id, gui.Rect{x, fy, w, fh}, mut input, kind, placeholder)
	return ev, fy + fh + 14
}

// columns splits a width into n columns when there is room, else one.
fn columns(w f32, n int, min_w f32) int {
	mut c := n
	for c > 1 && (w - f32(c - 1) * pad) / f32(c) < min_w {
		c--
	}
	return c
}
