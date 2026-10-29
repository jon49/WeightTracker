module main

import gg
import os
import core

// Fonts are embedded so text looks the same on every platform and nothing
// depends on what is installed (DejaVu Sans, see assets/fonts/LICENSE-DejaVu.txt).
const font_regular = $embed_file('assets/fonts/DejaVuSans.ttf')
const font_bold = $embed_file('assets/fonts/DejaVuSans-Bold.ttf')

fn main() {
	mut data_dir := core.default_data_dir()
	mut screen := Screen.entry
	mut charts := []core.ChartKind{}
	mut width := 920
	mut height := 780
	args := os.args[1..]
	for i, a in args {
		next := if i + 1 < args.len { args[i + 1] } else { '' }
		match a {
			'--data-dir' {
				data_dir = next
			}
			'--screen' {
				screen = screens.filter(it.title().to_lower() == next)[0] or { Screen.entry }
			}
			'--size' {
				parts := next.split('x')
				if parts.len == 2 && parts[0].int() > 0 && parts[1].int() > 0 {
					width = parts[0].int()
					height = parts[1].int()
				}
			}
			'--charts' {
				for name in next.split(',') {
					charts << core.all_charts.filter(it.title().to_lower() == name)
				}
			}
			'-h', '--help' {
				println('Usage: weight [--data-dir DIR] [--size WxH] [--screen entry|entries|charts|settings] [--charts history,average,...]')
				println('Data is stored in ${core.default_data_dir()} (or \$WEIGHT_DATA_DIR).')
				return
			}
			else {}
		}
	}
	store := core.open_store(data_dir) or {
		eprintln('Could not open the data in ${data_dir}: ${err}')
		exit(1)
	}
	mut app := new_app(store)
	app.screen = screen
	app.charts.open = charts.reverse()
	app.gg = gg.new_context(
		width:             width
		height:            height
		window_title:      'Weight'
		bg_color:          app.ui.theme.bg
		ui_mode:           true
		sample_count:      4
		font_bytes_normal: font_regular.to_bytes()
		font_bytes_bold:   font_bold.to_bytes()
		user_data:         app
		init_fn:           on_init
		frame_fn:          on_frame
		event_fn:          on_event
		cleanup_fn:        on_cleanup
	)
	app.ui.ctx = app.gg
	app.gg.run()
}

fn on_init(mut app App) {
	app.start_sync(false)
}

fn on_frame(mut app App) {
	app.frame()
}

fn on_event(e &gg.Event, mut app App) {
	app.ui.handle_event(e)
	match e.typ {
		.focused, .resumed {
			app.on_focus()
		}
		.unfocused, .suspended, .quit_requested {
			// Save whatever is being typed; the app may not come back.
			app.commit_forms()
		}
		else {}
	}
}

fn on_cleanup(mut app App) {
	app.commit_forms()
}
