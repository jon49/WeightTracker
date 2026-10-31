module main

#postinclude "@VMODROOT/keymap_linux.h"

fn C.weight_x11_respect_keymap()

// respect_keymap makes keys report what the keymap makes them (Caps Lock and
// Escape swapped, say), not what is printed on them; see keymap_linux.h.
// Android builds use keymap_default.c.v instead.
fn respect_keymap() {
	C.weight_x11_respect_keymap()
}
