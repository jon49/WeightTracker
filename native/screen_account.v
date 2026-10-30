module main

import core
import gg
import gui

// Login, Register and Reset Password, the web app's /login, /register and
// /forgot-password pages. They have no tab: they are opened from Settings or
// the header's Login button, and go back to the tab they were opened from.
// The emailed links (verifying the address, setting a new password) open
// the web app.

struct LoginForm {
mut:
	email    gui.Input
	password gui.Input
	error    string
}

struct RegisterForm {
mut:
	email    gui.Input
	password gui.Input
	repeat   gui.Input
	message  string
	error    bool
}

struct ForgotForm {
mut:
	email   gui.Input
	message string
	error   bool
}

// open_account goes to an account screen, remembering the tab to return to.
fn (mut app App) open_account(s Screen) {
	if !app.screen.is_account() {
		app.account_from = app.screen
	}
	app.navigate(s)
}

fn (mut app App) open_login() {
	app.login.error = ''
	app.open_account(.login)
}

fn (mut app App) open_register() {
	app.register = RegisterForm{
		email: gui.input(app.login.email.text)
	}
	app.open_account(.register)
}

fn (mut app App) open_forgot() {
	app.forgot = ForgotForm{
		email: gui.input(app.login.email.text)
	}
	app.open_account(.forgot)
}

// account_back is Back on an account screen: Register and Reset Password
// go to Login, and Login to the tab it was opened from.
fn (mut app App) account_back() {
	app.navigate(if app.screen == .login { app.account_from } else { Screen.login })
}

// back_to_login goes to Login with this email.
fn (mut app App) back_to_login(email string) {
	if email.trim_space() != '' {
		app.login.email = gui.input(email.trim_space())
	}
	app.open_login()
}

fn (mut app App) load_login() {
	if app.login.email.text == '' {
		app.login.email = gui.input(app.store.auth.email)
	}
	app.ui.focus_field(if app.login.email.text == '' { 'login-email' } else { 'login-password' })
}

// account_form places the form: no wider than the login form, and centered
// on wide windows.
fn (mut app App) account_form(x f32, y0 f32, w f32, title string) (f32, f32, f32) {
	fw := if w > 420 { f32(420) } else { w }
	fx := x + (w - fw) / 2
	mut y := app.heading(fx, y0, title)
	y = app.muted_lines(fx, y, fw, 'Server: ${app.store.server_url}')
	return fx, fw, y + 10
}

fn (mut app App) muted_lines(x f32, y0 f32, w f32, text string) f32 {
	mut ui := app.ui
	style := gui.TextStyle{
		size:  14
		color: ui.theme.muted
	}
	mut y := y0
	for line in ui.wrap(text, w, style) {
		ui.text(x, y, line, style)
		y += ui.line_height(14)
	}
	return y
}

// message_box shows a result or an error above a form.
fn (mut app App) message_box(x f32, y f32, w f32, msg string, error bool) f32 {
	mut ui := app.ui
	t := ui.theme
	lines := ui.wrap(msg, w - 24, gui.TextStyle{})
	lh := ui.line_height(0)
	r := gui.Rect{x, y, w, lines.len * lh + 20}
	ui.rounded(r, 6, t.surface_alt)
	ui.rounded_border(r, 6, if error { t.danger } else { t.primary })
	for i, line in lines {
		ui.text(x + 12, y + 10 + i * lh, line, gui.TextStyle{})
	}
	return r.bottom() + 14
}

// question_link draws "First time user? Register here." and returns whether
// the link was clicked.
fn (mut app App) question_link(x f32, y f32, question string, link string) bool {
	mut ui := app.ui
	ui.text(x, y, question, gui.TextStyle{})
	return ui.link(x + ui.text_width(question + ' ', gui.TextStyle{}), y, link, gui.TextStyle{})
}

fn (mut app App) draw_login(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	bh := ui.button_height()
	lh := ui.line_height(0)
	fx, fw, mut y := app.account_form(x, y0, w, 'Login')
	if app.store.auth.logged_in() {
		ui.text(fx, y, "You're logged in as ${app.store.auth.email}.", gui.TextStyle{})
		return y + lh - y0
	}
	if app.login.error != '' {
		y = app.message_box(fx, y, fw, app.login.error, true)
	}
	_, y = app.labeled_field('login-email', 'Email', fx, y, fw, mut app.login.email, .email,
		'')
	ev, y2 := app.labeled_field('login-password', 'Password', fx, y, fw, mut app.login.password,
		.password, '')
	y = y2
	if ui.button(gui.Rect{fx, y, fw, bh}, if app.logging_in { 'Logging in…' } else { 'Login' },
		.primary) || ev == .submitted {
		app.start_login()
	}
	y += bh + 20
	if app.question_link(fx, y, 'First time user?', 'Register here.') {
		app.open_register()
	}
	y += lh + 10
	if app.question_link(fx, y, 'Forgot password?', 'Reset password here.') {
		app.open_forgot()
	}
	return y + lh - y0
}

fn (mut app App) draw_register(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	bh := ui.button_height()
	lh := ui.line_height(0)
	fx, fw, mut y := app.account_form(x, y0, w, 'Register')
	if app.register.message != '' {
		y = app.message_box(fx, y, fw, app.register.message, app.register.error)
	}
	_, y = app.labeled_field('reg-email', 'Email', fx, y, fw, mut app.register.email, .email,
		'')
	_, y = app.labeled_field('reg-password', 'Password', fx, y, fw, mut app.register.password,
		.password, '')
	ev, y3 := app.labeled_field('reg-repeat', 'Confirm Password', fx, y, fw, mut app.register.repeat,
		.password, '')
	y = y3
	if app.register.repeat.text != '' && app.register.repeat.text != app.register.password.text {
		ui.text(fx, y - 8, 'Passwords do not match.', gui.TextStyle{
			size:  14
			color: ui.theme.danger
		})
		y += lh
	}
	busy := app.account_busy[Screen.register]
	if ui.button(gui.Rect{fx, y, fw, bh}, if busy { 'Registering…' } else { 'Register' },
		.primary) || ev == .submitted {
		app.start_register()
	}
	y += bh + 20
	if app.question_link(fx, y, 'Already registered?', 'Login here.') {
		app.back_to_login(app.register.email.text)
	}
	return y + lh - y0
}

fn (mut app App) draw_forgot(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	bh := ui.button_height()
	lh := ui.line_height(0)
	fx, fw, mut y := app.account_form(x, y0, w, 'Reset Password')
	if app.forgot.message != '' {
		y = app.message_box(fx, y, fw, app.forgot.message, app.forgot.error)
	}
	y = app.muted_lines(fx, y, fw, "Enter your account's email and we'll send you a link to set a new password.") +
		10
	ev, y1 := app.labeled_field('forgot-email', 'Email', fx, y, fw, mut app.forgot.email,
		.email, '')
	y = y1
	busy := app.account_busy[Screen.forgot]
	if ui.button(gui.Rect{fx, y, fw, bh}, if busy { 'Sending…' } else { 'Send reset link' },
		.primary) || ev == .submitted {
		app.start_forgot()
	}
	y += bh + 20
	if app.question_link(fx, y, 'Remembered it?', 'Login here.') {
		app.back_to_login(app.forgot.email.text)
	}
	y += lh + 10
	if app.question_link(fx, y, 'First time user?', 'Register here.') {
		app.login.email = gui.input(app.forgot.email.text.trim_space())
		app.open_register()
	}
	return y + lh - y0
}

fn (mut app App) start_register() {
	if app.account_busy[Screen.register] {
		return
	}
	f := app.register
	email := f.email.text.trim_space()
	if email == '' || f.password.text == '' {
		app.register.message = 'Enter your email and a password.'
		app.register.error = true
		return
	}
	if f.password.text != f.repeat.text {
		app.register.message = 'Passwords do not match.'
		app.register.error = true
		return
	}
	app.register.message = ''
	app.account_busy[Screen.register] = true
	spawn fn (ch chan AccountDone, server string, email string, password string, repeat string, ctx &gg.Context) {
		mut done := AccountDone{
			screen: .register
		}
		core.register(server, email, password, repeat) or { done = AccountDone{.register, err.msg()} }
		ch <- done
		mut c := unsafe { ctx }
		c.refresh_ui()
	}(app.account_ch, app.store.server_url, email, f.password.text, f.repeat.text, app.gg)
}

fn (mut app App) start_forgot() {
	if app.account_busy[Screen.forgot] {
		return
	}
	email := app.forgot.email.text.trim_space()
	if email == '' {
		app.forgot.message = 'Enter your email.'
		app.forgot.error = true
		return
	}
	app.forgot.message = ''
	app.account_busy[Screen.forgot] = true
	spawn fn (ch chan AccountDone, server string, email string, ctx &gg.Context) {
		mut done := AccountDone{
			screen: .forgot
		}
		core.request_password_reset(server, email) or { done = AccountDone{.forgot, err.msg()} }
		ch <- done
		mut c := unsafe { ctx }
		c.refresh_ui()
	}(app.account_ch, app.store.server_url, email, app.gg)
}

fn (mut app App) on_account_done(done AccountDone) {
	match done.screen {
		.register {
			app.register.error = done.error != ''
			if done.error != '' {
				app.register.message = done.error
				return
			}
			// TrailBase requires email verification before login works.
			app.register.message = 'Registration received. Check your email for a verification link, then log in.'
			app.register.password = gui.Input{}
			app.register.repeat = gui.Input{}
			app.login.email = gui.input(app.register.email.text.trim_space())
		}
		.forgot {
			app.forgot.error = done.error != ''
			app.forgot.message = if done.error != '' {
				done.error
			} else {
				'If that email is registered, a reset link will be sent.'
			}
		}
		else {}
	}
}
