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
	// The account screens, which have no tab.
	login
	register
	forgot
}

// The screens with a tab.
const screens = [Screen.entry, .entries, .charts, .settings]

fn (s Screen) title() string {
	return match s {
		.entry { 'Entry' }
		.entries { 'Entries' }
		.charts { 'Charts' }
		.settings { 'Settings' }
		.login { 'Login' }
		.register { 'Register' }
		.forgot { 'Reset Password' }
	}
}

fn (s Screen) is_account() bool {
	return s in [.login, .register, .forgot]
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

// AccountDone is the result of registering or asking for a password reset.
struct AccountDone {
	screen Screen
	error  string
}

@[heap]
struct App {
mut:
	gg     &gg.Context = unsafe { nil }
	ui     &gui.Ui
	store  &core.Store
	screen Screen
	// Screens to go back to (Alt+←), and forward to again after going back
	// (Alt+→).
	history []Screen
	forward []Screen
	// Toast message at the bottom of the window.
	toast       string
	toast_error bool
	toast_until i64
	// Sync runs on a worker thread; results come back on these channels.
	syncing bool
	// Ignore the answer to the sync in flight (the account was deleted).
	drop_sync  bool
	sync_ch    chan SyncDone
	logging_in bool
	login_ch   chan LoginDone
	// Registering or asking for a reset link (.register or .forgot), on a
	// worker thread.
	account_busy map[Screen]bool
	account_ch   chan AccountDone
	// Deleting the account, on a worker thread.
	deleting  bool
	delete_ch chan core.DeleteResult
	entry     EntryForm
	entries   EntriesView
	charts    ChartsView
	settings  SettingsForm
	login     LoginForm
	register  RegisterForm
	forgot    ForgotForm
	// The tab the account screens were opened from, and go back to.
	account_from Screen = .settings
	// The screen whose tab was last scrolled into view (-1: none yet).
	nav_screen     int = -1
	theme_resolved string
	// gg's own scale for the screen's DPI; the zoom multiplies it.
	base_scale   f32 = 1
	zoom_changed bool
}

fn new_app(store &core.Store) &App {
	mut app := &App{
		ui:         gui.new_ui()
		store:      store
		sync_ch:    chan SyncDone{cap: 1}
		login_ch:   chan LoginDone{cap: 1}
		account_ch: chan AccountDone{cap: 2}
		delete_ch:  chan core.DeleteResult{cap: 1}
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

// system_prefers_dark makes a best guess at the system's color scheme.
fn system_prefers_dark() bool {
	if dark := platform_prefers_dark() {
		return dark
	}
	// A GTK theme forced from the environment, then GNOME's setting.
	if os.getenv('GTK_THEME').to_lower().contains('dark') {
		return true
	}
	$if linux {
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

// toggle_theme switches between light and dark. The theme follows the
// system until this overrides it, and follows it again once toggled back to
// what the system shows.
fn (mut app App) toggle_theme() {
	next := if app.theme_resolved == 'dark' { 'light' } else { 'dark' }
	system := if system_prefers_dark() { 'dark' } else { 'light' }
	app.store.set_theme(if next == system { '' } else { next }) or {
		app.show_error('Could not save the theme: ${err}')
	}
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
// input, so timers (toasts) need a nudge.
fn (mut app App) wake_after(ms int) {
	spawn fn (ctx &gg.Context, ms int) {
		time.sleep(ms * time.millisecond)
		mut c := unsafe { ctx }
		c.refresh_ui()
	}(app.gg, ms)
}

// navigate opens a screen, which Back can return from.
fn (mut app App) navigate(s Screen) {
	if s == app.screen {
		return
	}
	app.history << app.screen
	if app.history.len > 50 {
		app.history.delete(0)
	}
	app.forward.clear()
	app.show(s)
}

// go_back returns to the screen before this one.
fn (mut app App) go_back() {
	for app.history.len > 0 {
		s := app.history.pop()
		if s != app.screen {
			app.forward << app.screen
			app.show(s)
			return
		}
	}
}

// go_forward undoes a go_back.
fn (mut app App) go_forward() {
	for app.forward.len > 0 {
		s := app.forward.pop()
		if s != app.screen {
			app.history << app.screen
			app.show(s)
			return
		}
	}
}

// forget_account_screens drops Login, Register and Reset Password from the
// back and forward history, once logged in.
fn (mut app App) forget_account_screens() {
	app.history = app.history.filter(!it.is_account())
	app.forward = app.forward.filter(!it.is_account())
}

// show switches to a screen without touching the history.
fn (mut app App) show(s Screen) {
	if s == app.screen {
		return
	}
	app.commit_forms()
	app.ui.blur()
	app.ui.clear_nav()
	// The account screens go back to the tab they were opened from.
	if s.is_account() && !app.screen.is_account() {
		app.account_from = app.screen
	}
	app.screen = s
	app.ui.set_scroll('main', 0)
	match s {
		.entry { app.load_entry(app.entry.date.text) }
		.settings { app.load_settings() }
		.login { app.load_login() }
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

fn (mut app App) on_focus() {
	// The system may have switched between light and dark meanwhile.
	if app.store.theme == '' {
		app.apply_theme()
	}
}

// start_sync runs only when asked for (the ↻ button, Ctrl+R, Settings' Sync
// now); nothing syncs on its own.
fn (mut app App) start_sync(manual bool) {
	if app.syncing {
		return
	}
	if !app.store.auth.logged_in() {
		if manual {
			app.show_error('You are not logged in!')
			app.open_login()
		}
		return
	}
	app.commit_forms()
	app.syncing = true
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
		if app.drop_sync {
			app.drop_sync = false
			return
		}
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
		// Finish the sync by uploading settings merged with another device's.
		// Edits made during the sync wait for the next one.
		if summary.merged {
			app.start_sync(false)
		}
	}
	mut login := LoginDone{}
	if app.login_ch.try_pop(mut login) == .success {
		app.logging_in = false
		if login.error != '' {
			app.login.error = login.error
			return
		}
		app.store.auth = login.tokens
		app.store.save_auth() or { app.show_error('Could not save the login: ${err}') }
		app.login.password = gui.Input{}
		app.login.error = ''
		app.show_toast('Logged in as ${login.tokens.email}')
		app.forget_account_screens()
		if app.screen == .login {
			app.show(app.account_from)
		}
	}
	mut account := AccountDone{}
	if app.account_ch.try_pop(mut account) == .success {
		app.account_busy[account.screen] = false
		app.on_account_done(account)
	}
	mut deleted := core.DeleteResult{}
	if app.delete_ch.try_pop(mut deleted) == .success {
		app.deleting = false
		app.on_account_deleted(deleted)
	}
}

fn (mut app App) start_login() {
	if app.logging_in {
		return
	}
	email := app.login.email.text.trim_space()
	password := app.login.password.text
	if email == '' || password == '' {
		app.login.error = 'Enter your email and password.'
		return
	}
	app.login.error = ''
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

// delete_account deletes the account on the server; on_account_deleted
// then forgets this device's copy.
fn (mut app App) delete_account() {
	if app.deleting {
		return
	}
	app.deleting = true
	spawn fn (ch chan core.DeleteResult, server string, auth core.AuthTokens, ctx &gg.Context) {
		ch <- core.delete_account(server, auth)
		mut c := unsafe { ctx }
		c.refresh_ui()
	}(app.delete_ch, app.store.server_url, app.store.auth, app.gg)
}

fn (mut app App) on_account_deleted(res core.DeleteResult) {
	if !res.ok {
		msg := if res.status == 401 {
			'Log in again, then delete your account.'
		} else {
			res.message
		}
		app.show_error('Could not delete your account. ${msg}')
		return
	}
	// A sync in flight was sent before the delete; its answer must not
	// write anything back.
	app.drop_sync = app.syncing
	app.store.wipe() or { app.show_error(err.msg()) }
	app.load_entry(core.default_entry_date().str())
	app.load_settings()
	app.charts.dirty = false
	app.charts.loaded = false
	app.login = LoginForm{}
	app.show_toast('Your account and its data were deleted.')
}

// paragraph draws wrapped text and returns the y below it.
fn (mut app App) paragraph(x f32, y f32, w f32, text string, muted bool) f32 {
	mut ui := app.ui
	style := gui.TextStyle{
		color: if muted { ui.theme.muted } else { gui.transparent }
	}
	mut ly := y
	for line in ui.wrap(text, w, style) {
		ui.text(x, ly, line, style)
		ly += ui.line_height(0)
	}
	return ly + 8
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
	// The status bar's strip, on phones, in the web app's theme color.
	ui.begin_drawing(ui.theme.primary)
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
		.login { app.draw_login(x, y, cw) }
		.register { app.draw_register(x, y, cw) }
		.forgot { app.draw_forgot(x, y, cw) }
	} + 2 * pad
	ui.end_scroll('main', area, content_h)
	ui.draw_menu()
	app.draw_toast(w, h)

	// Keyboard shortcuts that no field used.
	if ui.key_pressed(.r, true) {
		app.start_sync(true)
	}
	if ui.alt_pressed(.left) {
		app.ui.close_menu()
		app.go_back()
	}
	if ui.alt_pressed(.right) {
		app.ui.close_menu()
		app.go_forward()
	}
	$if !android {
		// Ctrl+W closes the window, which quits (on_cleanup saves any typing).
		if ui.key_pressed(.w, true) {
			app.gg.quit()
		}
	}
	// Escape drops keyboard focus (an open drop-down or a field being
	// edited took it already).
	if ui.key_pressed(.escape, false) {
		ui.clear_nav()
	}
	if !ui.has_focus() {
		// ← and → step through the tabs under the header.
		if ui.key_pressed(.left, false) {
			app.next_tab(-1)
		}
		if ui.key_pressed(.right, false) {
			app.next_tab(1)
		}
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
	logged_in := app.store.auth.logged_in()
	auth_label := if logged_in { 'Logout' } else { 'Login' }
	aw := ui.button_width(auth_label)
	pending := app.store.pending.len
	sync_label := if app.syncing {
		'↻ Syncing…'
	} else if pending > 0 {
		'↻ (${pending})'
	} else {
		'↻'
	}
	sw := ui.button_width(sync_label)

	// Left: the logo and the app name, which go to Entry. When zoomed in or
	// on a narrow phone the name gives way to the buttons on the right.
	title := gui.TextStyle{
		size:   20
		bold:   true
		valign: .middle
	}
	right_x := w - pad - aw - sw - bh - 2 * 8
	logo := f32(28)
	mut brand_w := logo + 8 + ui.text_width('Weight', title)
	if pad + brand_w + 8 > right_x {
		brand_w = logo
	} else {
		ui.text(pad + logo + 8, top_h / 2, 'Weight', title)
	}
	draw_logo(ui, pad, (top_h - logo) / 2, logo)
	brand := gui.Rect{pad, 8, brand_w, bh}
	ui.pointer_cursor(brand)
	if ui.tap(brand, 'Weight') {
		app.navigate(.entry)
	}

	// Right side: theme, sync, login, drawn left to right for Tab. Buttons
	// whose label changes keep a name, so keyboard focus stays on them.
	mut rx := right_x
	theme_label := if app.theme_resolved == 'dark' { '☀' } else { '☾' }
	if ui.named_button(gui.Rect{rx, 8, bh, bh}, theme_label, .ghost, 'theme') {
		app.toggle_theme()
	}
	rx += bh + 8
	if ui.named_button(gui.Rect{rx, 8, sw, bh}, sync_label, .ghost, 'sync') {
		app.start_sync(true)
	}
	rx += sw + 8
	if ui.named_button(gui.Rect{rx, 8, aw, bh}, auth_label, .outline, 'auth') {
		if logged_in {
			app.logout()
		} else {
			app.open_login()
		}
	}

	// Navigation tabs. They scroll sideways when they don't fit (zoomed in,
	// or on a phone), and a newly opened screen brings its tab into view.
	nav_y := top_h
	nav_h := bh + 8
	nav_r := gui.Rect{0, nav_y, w, nav_h}
	ui.rect(nav_r, t.bg)
	ui.hline(0, nav_y + nav_h - 1, w, t.border)
	current := app.current_tab()
	off := ui.begin_hscroll('nav', nav_r)
	mut nx := pad
	mut active_x, mut active_w := f32(0), f32(0)
	for s in screens {
		label := s.title()
		bw := ui.button_width(label)
		if s == current {
			active_x, active_w = nx, bw
		}
		style := if s == current {
			gui.ButtonStyle.tab_active
		} else {
			gui.ButtonStyle.tab
		}
		if ui.button(gui.Rect{nx - off, nav_y + 4, bw, bh}, label, style) {
			app.navigate(s)
		}
		nx += bw + 4
	}
	ui.end_hscroll('nav', nav_r, nx - 4 + pad)
	if app.nav_screen != int(current) {
		app.nav_screen = int(current)
		if active_x + active_w + pad > off + w {
			ui.set_hscroll('nav', active_x + active_w + pad - w)
		} else if active_x - pad < off {
			ui.set_hscroll('nav', active_x - pad)
		}
	}
	return nav_y + nav_h
}

// current_tab is the tab for this screen; the account screens show the
// one they were opened from.
fn (app &App) current_tab() Screen {
	return if app.screen.is_account() { app.account_from } else { app.screen }
}

// next_tab opens the tab `step` places from the current one (← and →).
fn (mut app App) next_tab(step int) {
	i := screens.index(app.current_tab()) + step
	if i >= 0 && i < screens.len {
		app.navigate(screens[i])
	}
}

// draw_logo draws the app's logo (src/web/images/weight.svg, 64 units
// square) as a `size` square at x, y: a crescent moon over a scale.
fn draw_logo(ui &gui.Ui, x f32, y f32, size f32) {
	k := size / 64
	bg := ui.theme.primary
	white := gui.hex(0xffffff)
	ui.rounded(gui.Rect{x, y, size, size}, 14 * k, bg)
	ui.ctx.draw_circle_filled(x + 38 * k, y + 22 * k, 10 * k, white)
	ui.ctx.draw_circle_filled(x + 43.5 * k, y + 17.5 * k, 8.5 * k, bg)
	ui.rounded(gui.Rect{x + 12 * k, y + 38 * k, 40 * k, 15 * k}, 4.5 * k, white)
	ui.rounded(gui.Rect{x + 25 * k, y + 41.5 * k, 14 * k, 5.5 * k}, 1.5 * k, bg)
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
