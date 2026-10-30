module main

import gg
import gui
import os
import sokol.sapp
import strings

#include <android/log.h>
#include <unistd.h>
#include "@VMODROOT/android/text_bridge.h"
// sokol ends the app on Back before Java sees it; its one call of
// AKeyEvent_getKeyCode goes through text_bridge.h's weight_key_code, which
// hides Back from it. The fix belongs in sokol_app.h.
#flag -DAKeyEvent_getKeyCode=weight_key_code

fn C.pipe(fds &i32) int
fn C.dup2(oldfd int, newfd int) int
fn C.read(fd int, buf voidptr, count u64) i64
fn C.__android_log_write(prio int, tag &char, text &char) int
fn C.weight_keys_set_ctx(ctx voidptr)
fn C.weight_keys_take(out &i32, max int) int
fn C.weight_insets(top &i32, bottom &i32)
fn C.weight_move_task_to_back(activity voidptr)
fn C.weight_night_mode(activity voidptr) int
fn C.weight_show_keyboard(activity voidptr, show int, kind int, before &char, len int)

// platform_data_dir is the app's private files folder, which only the
// native activity knows.
fn platform_data_dir() ?string {
	activity := unsafe { &os.NativeActivity(sapp.android_get_native_activity()) }
	if activity == unsafe { nil } || activity.internalDataPath == unsafe { nil } {
		return none
	}
	return unsafe { cstring_to_vstring(activity.internalDataPath) }
}

// platform_scale is the screen's density in Android's density-independent
// pixels (160 per inch). gg on Android instead fits the window size we asked
// for to the screen's width, which makes everything tiny on a phone.
fn platform_scale() ?f32 {
	scale := gg.android_dpi_scale()
	// An unknown density reads as 0, or as 0xfffe or 0xffff ("any", "none").
	return if scale > 0 && scale < 400 { scale } else { none }
}

// platform_prefers_dark is the system's dark mode setting.
fn platform_prefers_dark() ?bool {
	activity := sapp.android_get_native_activity()
	if activity == unsafe { nil } {
		return none
	}
	night := C.weight_night_mode(activity)
	return if night < 0 { none } else { night == 1 }
}

// android_back: the Back button closes an open drop-down, goes from Register or Reset Password to
// Login, from Login to the tab it was opened from, and from a tab to Entry.
// On Entry it puts the app in the background, as Android's own apps do,
// rather than ending it. (The keyboard takes the first Back to hide itself.)
fn android_back(mut app App) {
	if app.ui.menu_open() {
		app.ui.close_menu()
	} else if app.screen.is_account() {
		app.account_back()
	} else if app.screen != .entry {
		app.navigate(.entry)
	} else {
		app.commit_forms()
		activity := sapp.android_get_native_activity()
		if activity != unsafe { nil } {
			C.weight_move_task_to_back(activity)
		}
	}
	app.ui.request_redraw()
}

// platform_init sends stderr to logcat and gathers the trusted roots for
// HTTPS.
fn platform_init() {
	log_stderr()
	use_android_ca_roots()
}

// log_stderr: Android drops a native app's stderr, and that is where sokol
// reports its errors (shader compile logs, GL setup).
fn log_stderr() {
	// C's int: V's is 64 bits.
	mut fds := [2]i32{}
	if C.pipe(&fds[0]) != 0 {
		return
	}
	C.dup2(fds[1], 2)
	spawn stderr_to_logcat(fds[0])
}

// Android keeps its trusted roots one file per certificate: in the
// updatable Conscrypt module since Android 14, and in /system before that.
const android_ca_dirs = ['/apex/com.android.conscrypt/cacerts', '/system/etc/security/cacerts']

// use_android_ca_roots joins the system's roots into one bundle and points
// $SSL_CERT_FILE at it, which is where V's TLS looks when no bundle is in
// the usual Linux places. Without it every HTTPS request fails. The bundle
// is rebuilt on each start so it follows system updates.
fn use_android_ca_roots() {
	dir := platform_data_dir() or { return }
	for ca_dir in android_ca_dirs {
		names := os.ls(ca_dir) or { continue }
		mut sb := strings.new_builder(256 * 1024)
		for name in names {
			sb.write_string(os.read_file(os.join_path(ca_dir, name)) or { continue })
			sb.write_u8(`\n`)
		}
		if sb.len == 0 {
			continue
		}
		os.mkdir_all(dir) or { return }
		path := os.join_path(dir, 'ca-roots.pem')
		os.write_file(path, sb.str()) or {
			eprintln('Could not write ${path}: ${err}')
			return
		}
		os.setenv('SSL_CERT_FILE', path, true)
		return
	}
	eprintln('No trusted roots found for HTTPS')
}

fn stderr_to_logcat(fd int) {
	mut buf := [1024]u8{}
	for {
		n := C.read(fd, &buf[0], u64(buf.len - 1))
		if n <= 0 {
			return
		}
		buf[n] = 0
		C.__android_log_write(6, c'weight', &char(&buf[0]))
	}
}

// ---- text input ----

// The keys VActivity.java sends besides characters (code points).
const key_back = -6
const key_theme = -7

const key_codes = {
	-1: gg.KeyCode.backspace
	-2: gg.KeyCode.enter
	-3: gg.KeyCode.delete
	-4: gg.KeyCode.left
	-5: gg.KeyCode.right
}

// platform_start connects the keyboard (VActivity.java and
// android/text_bridge.h) to the app once its window exists.
fn platform_start(mut app App) {
	C.weight_keys_set_ctx(app.gg)
	app.ui.keyboard_fn = android_keyboard
}

fn android_keyboard(show bool, kind gui.FieldKind, before string) {
	activity := sapp.android_get_native_activity()
	if activity == unsafe { nil } {
		return
	}
	C.weight_show_keyboard(activity, if show { 1 } else { 0 }, int(kind), &char(before.str),
		before.len)
}

// weight_keys_wake is called from Android's UI thread when it queues a key:
// gg draws nothing until something asks for a frame.
@[export: 'weight_keys_wake']
fn weight_keys_wake(ctx voidptr) {
	mut c := unsafe { &gg.Context(ctx) }
	c.refresh_ui()
}

// platform_poll hands the keyboard's queued input to the gui as the key and
// char events a desktop keyboard makes, and tells it what the status bar,
// navigation bar and keyboard cover.
fn platform_poll(mut app App) {
	mut top, mut bottom := i32(0), i32(0)
	C.weight_insets(&top, &bottom)
	app.ui.set_insets(top, bottom)
	mut keys := [64]i32{} // C's int
	for {
		n := C.weight_keys_take(&keys[0], keys.len)
		for i in 0 .. n {
			k := int(keys[i])
			if k == key_back {
				android_back(mut app)
			} else if k == key_theme {
				app.apply_theme()
				app.ui.request_redraw()
			} else if k >= 0 {
				app.ui.handle_event(&gg.Event{
					typ:       .char
					char_code: u32(k)
				})
			} else if code := key_codes[k] {
				app.ui.handle_event(&gg.Event{
					typ:      .key_down
					key_code: code
				})
			}
		}
		if n < keys.len {
			return
		}
	}
}
