module main

import core
import gui

struct SettingsForm {
mut:
	height        gui.Input
	goal_weight   gui.Input
	bedtime       gui.Input
	server        gui.Input
	dirty         bool
	confirm_clear bool
}

fn (mut app App) load_settings() {
	us := app.store.user_settings
	app.settings = SettingsForm{
		height:      gui.input(core.format_number(us.height))
		goal_weight: gui.input(core.format_number(us.goal_weight))
		bedtime:     gui.input(us.bedtime)
		server:      gui.input(app.store.server_url)
	}
}

fn (mut app App) save_settings() {
	f := app.settings
	app.settings.dirty = false
	prev := app.store.user_settings
	mut errors := []string{}
	height := core.parse_number(f.height.text) or {
		errors << 'Height: ${err.msg()}'
		prev.height
	}
	goal := core.parse_number(f.goal_weight.text) or {
		errors << 'Goal weight: ${err.msg()}'
		prev.goal_weight
	}
	mut bedtime := f.bedtime.text.trim_space()
	if bedtime != '' {
		bedtime = core.normalize_time(bedtime) or {
			errors << 'Bedtime: "${bedtime}" is not a time, use HH:MM.'
			prev.bedtime
		}
	}
	app.store.set_user_settings(core.UserSettings{
		...prev
		height:      height
		goal_weight: goal
		bedtime:     bedtime
	}) or {
		app.show_error('Could not save: ${err}')
		return
	}
	server := f.server.text.trim_space()
	if server != app.store.server_url {
		if !server.starts_with('https://') && !server.starts_with('http://') && server != '' {
			errors << 'Server: use a URL starting with https://'
		} else {
			app.store.set_server_url(server) or { app.show_error('Could not save: ${err}') }
		}
	}
	if errors.len > 0 {
		app.show_error(errors.join('\n'))
	}
	app.load_settings()
	app.schedule_sync()
}

fn (mut app App) on_settings_field(ev gui.FieldEvent) {
	match ev {
		.changed { app.settings.dirty = true }
		.committed, .submitted { app.save_settings() }
		.cancelled { app.settings.dirty = false }
		.none {}
	}
}

fn (mut app App) draw_settings(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	bh := ui.button_height()
	if app.settings.server.text == '' && !ui.has_focus() {
		app.load_settings()
	}
	mut y := app.heading(x, y0, 'Settings')

	// User settings.
	y = app.subheading(x, y, 'You')
	cols := columns(w, 3, 180)
	cw := (w - f32(cols - 1) * pad) / f32(cols)
	mut ev := gui.FieldEvent.none
	mut bottoms := []f32{}
	mut fy := y
	ev, fy = app.labeled_field('settings-height', 'Height (inches)', x, y, cw, mut app.settings.height,
		.number, '')
	app.on_settings_field(ev)
	bottoms << fy
	x1 := if cols >= 2 { x + cw + pad } else { x }
	y1 := if cols >= 2 { y } else { fy }
	ev, fy = app.labeled_field('settings-goal', 'Goal Weight', x1, y1, cw, mut app.settings.goal_weight,
		.number, core.format_fixed(core.UserSettings{
			...app.store.user_settings
			goal_weight: 0
		}.goal(), 1))
	app.on_settings_field(ev)
	bottoms << fy
	x2 := if cols >= 3 { x + 2 * (cw + pad) } else { x }
	y2 := if cols >= 3 { y } else { fy }
	ev, fy = app.labeled_field('settings-bedtime', 'Bedtime goal', x2, y2, cw, mut app.settings.bedtime,
		.time, '22:00')
	app.on_settings_field(ev)
	bottoms << fy
	for b in bottoms {
		if b > y {
			y = b
		}
	}
	y += 16

	// Account and sync.
	y = app.subheading(x, y, 'Sync')
	auth := app.store.auth
	if auth.logged_in() {
		ui.text(x, y, 'Logged in as ${auth.email}', gui.TextStyle{})
		y += 30
		mut bx := x
		label := if app.syncing { 'Syncing…' } else { 'Sync now' }
		sw := ui.button_width('Sync now')
		if ui.button(gui.Rect{bx, y, sw, bh}, label, .primary) {
			app.start_sync(true)
		}
		bx += sw + 8
		lw := ui.button_width('Logout')
		if ui.button(gui.Rect{bx, y, lw, bh}, 'Logout', .outline) {
			app.logout()
		}
		y += bh + 8
		pending := app.store.pending.len
		status := if pending == 0 {
			'Everything is synced.'
		} else {
			'${pending} change(s) waiting to sync.'
		}
		ui.text(x, y, status, gui.TextStyle{
			size:  13
			color: t.muted
		})
		y += 30
	} else {
		ui.text(x, y, 'Log in to back up your data and sync with the web app.', gui.TextStyle{
			color: t.muted
		})
		y += 32
		lw := ui.button_width('Login')
		if ui.button(gui.Rect{x, y, lw, bh}, 'Login', .primary) {
			app.open_login()
		}
		rw := ui.button_width('Register')
		if ui.button(gui.Rect{x + lw + 8, y, rw, bh}, 'Register', .outline) {
			app.open_register()
		}
		y += bh + 20
	}
	ev, y = app.labeled_field('settings-server', 'Server', x, y, if w > 420 { f32(420) } else { w }, mut
		app.settings.server, .text, core.default_server_url)
	app.on_settings_field(ev)
	y += 8

	// Text size.
	y = app.subheading(x, y, 'Text size')
	minus_w := bh
	if ui.button(gui.Rect{x, y, minus_w, bh}, '−', .outline) {
		app.zoom_by(-1)
	}
	pct := zoom_percent(app.store.zoom)
	pw := ui.text_width('300%', gui.TextStyle{}) + 24
	ui.text(x + minus_w + pw / 2, y + bh / 2, pct, gui.TextStyle{
		align:  .center
		valign: .middle
	})
	plus_x := x + minus_w + pw
	if ui.button(gui.Rect{plus_x, y, bh, bh}, '+', .outline) {
		app.zoom_by(1)
	}
	reset_w := ui.button_width('Reset')
	if app.store.zoom != 1.0 {
		if ui.button(gui.Rect{plus_x + bh + 8, y, reset_w, bh}, 'Reset', .outline) {
			app.set_zoom(1.0)
		}
	}
	y += bh + 8
	for line in ui.wrap('Shortcuts: Ctrl + and Ctrl − (or Ctrl and the scroll wheel); Ctrl 0 resets.',
		w, gui.TextStyle{ size: 13 }) {
		ui.text(x, y, line, gui.TextStyle{
			size:  13
			color: t.muted
		})
		y += ui.line_height(13)
	}
	y += 16

	// Data.
	y = app.subheading(x, y, 'Data')
	for line in ui.wrap('Stored in ${app.store.data_path()}', w, gui.TextStyle{ size: 13 }) {
		ui.text(x, y, line, gui.TextStyle{
			size:  13
			color: t.muted
		})
		y += ui.line_height(13)
	}
	y += 10
	clear_label := if app.settings.confirm_clear {
		'Click again to clear all data'
	} else {
		'Clear All Data'
	}
	cw2 := ui.button_width(clear_label)
	if ui.button(gui.Rect{x, y, cw2, bh}, clear_label, .danger) {
		if app.settings.confirm_clear {
			app.settings.confirm_clear = false
			app.store.clear_data() or { app.show_error('Could not clear: ${err}') }
			app.load_entry(core.default_entry_date().str())
			app.load_settings()
			app.show_toast('All local data cleared.')
		} else {
			app.settings.confirm_clear = true
		}
	}
	if app.settings.confirm_clear {
		if ui.button(gui.Rect{x + cw2 + 8, y, ui.button_width('Cancel'), bh}, 'Cancel', .outline) {
			app.settings.confirm_clear = false
		}
	}
	y += bh + 8
	note := if auth.logged_in() {
		'Data already synced will download again on the next sync.'
	} else {
		'This cannot be undone.'
	}
	ui.text(x, y, note, gui.TextStyle{
		size:  13
		color: t.muted
	})
	y += 24
	return y - y0
}
