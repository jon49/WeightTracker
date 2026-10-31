module main

#postinclude "@VMODROOT/desktop_linux.h"

fn C.weight_respect_keymap()
fn C.weight_set_app_id(id &char)

// desktop_setup fills in what sokol leaves out on Linux (see desktop_linux.h):
// keys report what the keymap makes them (Caps Lock and Escape swapped, say),
// not what is printed on them, and the window is named `weight` (X11
// WM_CLASS, or the Wayland app id), so the desktop matches it to
// weight.desktop for its icon. Android builds use desktop_default.c.v instead.
fn desktop_setup() {
	C.weight_respect_keymap()
	C.weight_set_app_id(c'weight')
}
