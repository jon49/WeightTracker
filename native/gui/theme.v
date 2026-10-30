module gui

import gg

// Theme colors follow the web app's nimble.css palette with its purple accent.
pub struct Theme {
pub:
	dark          bool
	bg            gg.Color
	surface       gg.Color // header, cards
	surface_alt   gg.Color // hover, table stripes
	surface_hi    gg.Color // pressed
	text          gg.Color
	muted         gg.Color
	border        gg.Color
	primary       gg.Color // filled buttons
	primary_hover gg.Color
	link          gg.Color // accent text on bg
	on_primary    gg.Color
	secondary     gg.Color
	danger        gg.Color
	input_bg      gg.Color
	focus_ring    gg.Color
	tooltip_bg    gg.Color
	tooltip_text  gg.Color
}

pub fn hex(c u32) gg.Color {
	return gg.Color{u8(c >> 16), u8(c >> 8), u8(c), 255}
}

pub fn hexa(c u32, a u8) gg.Color {
	return gg.Color{u8(c >> 16), u8(c >> 8), u8(c), a}
}

pub const light_theme = Theme{
	dark:          false
	bg:            hex(0xf9fafb)
	surface:       hex(0xeff0f1)
	surface_alt:   hex(0xe5e6e7)
	surface_hi:    hex(0xd8d9da)
	text:          hex(0x27292b)
	muted:         hex(0x616366)
	border:        hex(0xc5c8ca)
	primary:       hex(0x5c5be0)
	primary_hover: hex(0x443bbe)
	link:          hex(0x5c5be0)
	on_primary:    hex(0xffffff)
	secondary:     hex(0x405870)
	danger:        hex(0xd40924)
	input_bg:      hex(0xffffff)
	focus_ring:    hexa(0x5c5be0, 110)
	tooltip_bg:    hex(0x111827)
	tooltip_text:  hex(0xffffff)
}

pub const dark_theme = Theme{
	dark:          true
	bg:            hex(0x0e0f12)
	surface:       hex(0x151618)
	surface_alt:   hex(0x1c1d1f)
	surface_hi:    hex(0x252629)
	text:          hex(0xced1d4)
	muted:         hex(0x8d8f92)
	border:        hex(0x2f3134)
	primary:       hex(0x5c5be0)
	primary_hover: hex(0x443bbe)
	link:          hex(0x777cff)
	on_primary:    hex(0xffffff)
	secondary:     hex(0x4d667f)
	danger:        hex(0xf94144)
	input_bg:      hex(0x151618)
	focus_ring:    hexa(0x777cff, 120)
	tooltip_bg:    hex(0x2a2d33)
	tooltip_text:  hex(0xffffff)
}
