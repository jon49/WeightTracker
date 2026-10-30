module main

import gg
import math
import core
import gui

struct AxisScale {
	lo   f64
	hi   f64
	step f64
}

fn (a AxisScale) y(v f64, r gui.Rect) f32 {
	return r.y + r.h - f32((v - a.lo) / (a.hi - a.lo)) * r.h
}

fn nice_step(raw f64) f64 {
	if raw <= 0 || math.is_nan(raw) {
		return 1
	}
	mag := math.pow(10, math.floor(math.log10(raw)))
	norm := raw / mag
	step := if norm <= 1 {
		1.0
	} else if norm <= 2 {
		2.0
	} else if norm <= 2.5 {
		2.5
	} else if norm <= 5 {
		5.0
	} else {
		10.0
	}
	return step * mag
}

fn axis_scale(c core.ChartData, right bool, limits core.AxisLimits) ?AxisScale {
	mut lo := math.inf(1)
	mut hi := math.inf(-1)
	for s in c.series {
		if s.right_axis != right {
			continue
		}
		for v in s.values {
			if !core.is_missing(v) {
				lo = math.min(lo, v)
				hi = math.max(hi, v)
			}
		}
	}
	if math.is_inf(lo, 1) {
		if core.is_missing(limits.min) || core.is_missing(limits.max) {
			return none
		}
		lo = limits.min
		hi = limits.max
	}
	if c.style == .bar {
		// Bars grow from zero.
		lo = math.min(lo, 0)
		hi = math.max(hi, 0)
	}
	if !core.is_missing(limits.min) {
		lo = limits.min
	}
	if !core.is_missing(limits.max) {
		hi = math.max(limits.max, if core.is_missing(limits.min) { hi } else { limits.max })
	}
	if hi <= lo {
		hi = lo + 1
		lo -= 1
	}
	step := nice_step((hi - lo) / 4)
	if core.is_missing(limits.min) {
		lo = math.floor(lo / step) * step
	}
	if core.is_missing(limits.max) {
		hi = math.ceil(hi / step) * step
	}
	return AxisScale{lo, hi, step}
}

fn format_axis(v f64) string {
	if math.abs(v - math.round(v)) < 1e-9 {
		return '${i64(math.round(v))}'
	}
	s := '${v:.2f}'.trim_right('0')
	return s.trim_right('.')
}

fn series_color(c u32) gg.Color {
	return gui.hex(c)
}

// draw_chart draws a chart into the rect's width and returns the height used.
fn (mut app App) draw_chart(c core.ChartData, x f32, y f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	small := gui.TextStyle{
		size:  12
		color: t.muted
	}
	lh := ui.line_height(12)
	left := axis_scale(c, false, c.left) or { AxisScale{0, 1, 0.25} }
	right_scale := if c.has_right_axis() { axis_scale(c, true, c.right) } else { none }

	// Axis label widths decide the plot's margins.
	mut lw := f32(0)
	mut v := left.lo
	for v <= left.hi + left.step / 2 {
		lw = math.max(lw, ui.text_width(format_axis(v), small))
		v += left.step
	}
	mut rw := f32(0)
	if rs := right_scale {
		v = rs.lo
		for v <= rs.hi + rs.step / 2 {
			rw = math.max(rw, ui.text_width(format_axis(v), small))
			v += rs.step
		}
	}
	plot_h := math.min(w * 9 / 16, f32(420))
	plot := gui.Rect{x + lw + 10, y + lh / 2, w - lw - 10 - (if rw > 0 { rw + 10 } else { 0 }), plot_h}
	ui.rounded(plot, 6, t.surface)

	// Grid and y axis labels.
	v = left.lo
	for v <= left.hi + left.step / 2 {
		gy := left.y(v, plot)
		ui.hline(plot.x, gy, plot.w, t.border)
		ui.text(plot.x - 6, gy, format_axis(v), gui.TextStyle{
			...small
			align:  .right
			valign: .middle
		})
		v += left.step
	}
	if rs := right_scale {
		v = rs.lo
		for v <= rs.hi + rs.step / 2 {
			ui.text(plot.right() + 6, rs.y(v, plot), format_axis(v), gui.TextStyle{
				...small
				valign: .middle
			})
			v += rs.step
		}
	}

	n := c.labels.len
	pad_x := plot.w * 0.03
	xs := []f32{len: n, init: if n == 1 {
		plot.x + plot.w / 2
	} else {
		plot.x + pad_x + f32(index) / f32(n - 1) * (plot.w - 2 * pad_x)
	}}
	scale_for := fn [left, right_scale] (s core.Series) AxisScale {
		if s.right_axis {
			if rs := right_scale {
				return rs
			}
		}
		return left
	}

	ui.push_clip(plot)
	if c.style == .bar {
		slot := if n > 1 { (plot.w - 2 * pad_x) / f32(n - 1) } else { plot.w / 2 }
		group_w := slot * 0.8
		bar_w := group_w / f32(c.series.len)
		for si, s in c.series {
			sc := scale_for(s)
			base := sc.y(math.max(sc.lo, math.min(0, sc.hi)), plot)
			color := series_color(s.color)
			for i, val in s.values {
				if core.is_missing(val) {
					continue
				}
				bx := xs[i] - group_w / 2 + f32(si) * bar_w
				vy := sc.y(val, plot)
				top := math.min(vy, base)
				ui.rect(gui.Rect{bx, top, math.max(bar_w - 1, 1), math.abs(base - vy)}, color)
			}
		}
	} else {
		dot := n <= 160
		for s in c.series {
			sc := scale_for(s)
			color := series_color(s.color)
			mut px := f32(0)
			mut py := f32(0)
			mut have_prev := false
			for i, val in s.values {
				if core.is_missing(val) {
					have_prev = false
					continue
				}
				vx := xs[i]
				vy := sc.y(val, plot)
				if have_prev && s.show_lines {
					app.gg.draw_line_with_config(px, py, vx, vy, gg.PenConfig{
						color:     color
						thickness: if n > 100 { 1.5 } else { 2.5 }
					})
				}
				px = vx
				py = vy
				have_prev = true
			}
			for i, val in s.values {
				if core.is_missing(val) {
					continue
				}
				if dot {
					app.gg.draw_circle_filled(xs[i], sc.y(val, plot), 4, color)
					app.gg.draw_circle_filled(xs[i], sc.y(val, plot), 2, t.surface)
				} else if !s.show_lines {
					app.gg.draw_circle_filled(xs[i], sc.y(val, plot), 1.6, color)
				}
			}
		}
	}
	ui.pop_clip()

	// X labels, skipping some so they do not overlap.
	if n > 0 {
		label_w := ui.text_width(c.labels[0], small) + 16
		max_labels := int(math.max(1, plot.w / label_w))
		stride := int(math.ceil(f64(n) / f64(max_labels)))
		for i := 0; i < n; i += stride {
			ui.text(xs[i], plot.bottom() + 6, c.labels[i], gui.TextStyle{
				...small
				align: .center
			})
		}
	}
	mut bottom := plot.bottom() + 6 + lh + 10

	// Legend.
	mut lx := x
	legend := gui.TextStyle{
		size: 14
	}
	llh := ui.line_height(14)
	for s in c.series {
		item_w := 22 + ui.text_width(s.label, legend) + 18
		if lx + item_w > x + w && lx > x {
			lx = x
			bottom += llh + 4
		}
		app.gg.draw_circle_filled(lx + 8, bottom + llh / 2, 7, series_color(s.color))
		ui.text(lx + 22, bottom, s.label, legend)
		lx += item_w
	}
	bottom += llh

	// Tooltip for the point nearest the pointer.
	mx, my, inside := ui.pointer_in(plot)
	if inside && n > 0 {
		mut best := 0
		for i in 1 .. n {
			if math.abs(xs[i] - mx) < math.abs(xs[best] - mx) {
				best = i
			}
		}
		ui.rect(gui.Rect{xs[best], plot.y, 1, plot.h}, t.muted)
		mut lines := [c.labels[best]]
		mut colors := [t.tooltip_text]
		for s in c.series {
			val := s.values[best]
			if !core.is_missing(val) {
				lines << '${s.label}: ${format_axis(val)}'
				colors << series_color(s.color)
			}
		}
		tip := gui.TextStyle{
			size:  13
			color: t.tooltip_text
		}
		tlh := ui.line_height(13)
		mut tw := f32(0)
		for l in lines {
			tw = math.max(tw, ui.text_width(l, tip))
		}
		tw += 20
		th := lines.len * tlh + 12
		mut tx := mx + 14
		if tx + tw > plot.right() {
			tx = mx - 14 - tw
		}
		tx = math.max(tx, x)
		ty := math.max(plot.y, math.min(my - th / 2, plot.bottom() - th))
		ui.rounded(gui.Rect{tx, ty, tw, th}, 6, t.tooltip_bg)
		for i, l in lines {
			if i > 0 {
				app.gg.draw_circle_filled(tx + 8, ty + 6 + i * tlh + tlh / 2, 3, colors[i])
			}
			ui.text(tx + if i > 0 { f32(14) } else { f32(8) }, ty + 6 + i * tlh, l, tip)
		}
	}
	return bottom - y
}
