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

// draw_chart draws the part of a chart on show into the rect's width, with
// the controls to choose that part, and returns the height used.
fn (mut app App) draw_chart(full core.ChartData, x f32, y f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	lo, hi := app.chart_window(full)
	c := if hi - lo < full.labels.len - 1 { full.window(lo, hi) } else { full }
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
		lines := n < 500
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
				if have_prev && lines {
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
				if core.is_missing(val) || !s.show_points {
					continue
				}
				if dot {
					app.gg.draw_circle_filled(xs[i], sc.y(val, plot), 4, color)
					app.gg.draw_circle_filled(xs[i], sc.y(val, plot), 2, t.surface)
				} else if !lines {
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
	mut panning := false
	if full.labels.len >= 3 {
		panning = app.pan_chart(full, lo, hi, plot, plot.w - 2 * pad_x)
		bottom = app.draw_chart_range(full, lo, hi, plot, x, bottom, w) + 12
	}

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
	if inside && n > 0 && !panning {
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

// ---- the part of a chart on show ----

// ChartView is the part of a chart on show, labels lo to hi inclusive when
// zoomed, and the fields for its first and last label.
struct ChartView {
mut:
	zoomed bool
	lo     int
	hi     int
	from   gui.Input
	to     gui.Input
}

enum DragPart {
	pan
	start
	end
}

// ChartDrag is the window being dragged, as it was when the drag began.
struct ChartDrag {
	part DragPart
	lo   int
	hi   int
}

// chart_window returns the first and last label on show.
fn (app &App) chart_window(c core.ChartData) (int, int) {
	v := app.charts.views[int(c.kind)]
	if !v.zoomed || v.hi > c.labels.len - 1 {
		return 0, c.labels.len - 1
	}
	return v.lo, v.hi
}

// set_window shows labels lo to hi, keeping at least two on show.
fn (mut app App) set_window(c core.ChartData, lo int, hi int) {
	n := c.labels.len
	h := math.min(math.max(hi, 1), n - 1)
	l := math.min(math.max(lo, 0), h - 1)
	cur_lo, cur_hi := app.chart_window(c)
	if l == cur_lo && h == cur_hi {
		return
	}
	k := int(c.kind)
	app.charts.views[k].zoomed = l > 0 || h < n - 1
	app.charts.views[k].lo = l
	app.charts.views[k].hi = h
	app.ui.request_redraw()
}

// move_window shows labels lo to hi, sliding them back inside the chart.
fn (mut app App) move_window(c core.ChartData, lo int, hi int) {
	last := c.labels.len - 1
	if lo < 0 {
		app.set_window(c, 0, hi - lo)
	} else if hi > last {
		app.set_window(c, lo - (hi - last), last)
	} else {
		app.set_window(c, lo, hi)
	}
}

// keep_window moves a zoomed chart's window to the same labels after its
// data changed. A window at the end stays there, so it follows new weeks.
fn (mut app App) keep_window(old core.ChartData, c core.ChartData) {
	k := int(c.kind)
	v := app.charts.views[k]
	if !v.zoomed {
		return
	}
	app.charts.views[k].zoomed = false
	if c.labels.len < 3 || v.hi > old.labels.len - 1 {
		return
	}
	if v.hi == old.labels.len - 1 {
		last := c.labels.len - 1
		app.set_window(c, last - (v.hi - v.lo), last)
	} else {
		app.set_window(c, c.label_index(old.labels[v.lo]), c.label_index(old.labels[v.hi]))
	}
}

// pan_chart lets a zoomed chart's plot be dragged sideways, `span` being
// the width its labels spread over. It returns whether it is being dragged.
fn (mut app App) pan_chart(c core.ChartData, lo int, hi int, plot gui.Rect, span f32) bool {
	if hi - lo >= c.labels.len - 1 {
		return false
	}
	g := app.ui.grab('chart-plot-${int(c.kind)}', plot, true) or { return false }
	if g.started {
		app.charts.drag = ChartDrag{.pan, lo, hi}
	}
	d := app.charts.drag
	shift := int(math.round(f64(g.press_x - g.x) / f64(span) * f64(d.hi - d.lo)))
	app.move_window(c, d.lo + shift, d.hi + shift)
	return true
}

// draw_chart_range draws the strip under a chart that shows the whole of it
// and which part is on show: drag the window to move it, or its edges to
// zoom; press beside it to move it there. The strip lines up with the
// plot; under it are fields for the first and last label. It returns the y
// under them.
fn (mut app App) draw_chart_range(c core.ChartData, lo int, hi int, plot gui.Rect, x f32, y f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	n := c.labels.len
	k := int(c.kind)
	nav := gui.Rect{plot.x, y, plot.w, 32}
	at := fn [nav, n] (i int) f32 {
		return nav.x + f32(i) / f32(n - 1) * nav.w
	}
	index_at := fn [nav, n] (px f32) f64 {
		return f64(px - nav.x) / f64(nav.w) * f64(n - 1)
	}

	// The whole chart in miniature, joined across gaps.
	ui.rounded(nav, 6, t.surface)
	left := axis_scale(c, false, c.left) or { AxisScale{0, 1, 0.25} }
	right := axis_scale(c, true, c.right) or { left }
	inner := nav.inset(0, 5)
	ui.push_clip(nav)
	for s in c.series {
		sc := if s.right_axis { right } else { left }
		color := series_color(s.color)
		mut px := f32(0)
		mut py := f32(0)
		mut have_prev := false
		for i, val in s.values {
			if core.is_missing(val) {
				continue
			}
			vx := at(i)
			vy := sc.y(val, inner)
			if have_prev {
				app.gg.draw_line(px, py, vx, vy, color)
			}
			px = vx
			py = vy
			have_prev = true
		}
	}
	wx0 := at(lo)
	wx1 := at(hi)
	shade := gui.hexa(0x808080, 90)
	ui.rect(gui.Rect{nav.x, nav.y, wx0 - nav.x, nav.h}, shade)
	ui.rect(gui.Rect{wx1, nav.y, nav.right() - wx1, nav.h}, shade)
	ui.pop_clip()
	for ex in [wx0, wx1] {
		ui.rect(gui.Rect{ex - 1, nav.y, 2, nav.h}, t.primary)
		ui.rounded(gui.Rect{ex - 4, nav.y + nav.h / 2 - 9, 8, 18}, 3, t.primary)
	}

	// Edges are easier to catch with a finger when they reach further.
	reach := if ui.is_touch() { f32(22) } else { f32(8) }
	area := nav.inset(-reach, if ui.is_touch() { f32(-8) } else { f32(0) })
	if g := ui.grab('chart-range-${k}', area, true) {
		if g.started {
			d0 := math.abs(g.press_x - wx0)
			d1 := math.abs(g.press_x - wx1)
			part := if d0 <= reach && (d0 < d1 || g.press_x < wx0) {
				DragPart.start
			} else if d1 <= reach {
				DragPart.end
			} else {
				DragPart.pan
			}
			mut l, mut h := lo, hi
			if part == .pan && (g.press_x < wx0 || g.press_x > wx1) {
				l = int(math.round(index_at(g.press_x) - f64(hi - lo) / 2))
				h = l + hi - lo
				app.move_window(c, l, h)
				l, h = app.chart_window(c)
			}
			app.charts.drag = ChartDrag{part, l, h}
		}
		d := app.charts.drag
		i := int(math.round(index_at(g.x)))
		match d.part {
			.start {
				app.set_window(c, math.min(i, d.hi - 1), d.hi)
			}
			.end {
				app.set_window(c, d.lo, math.max(i, d.lo + 1))
			}
			.pan {
				shift := int(math.round(index_at(g.x) - index_at(g.press_x)))
				app.move_window(c, d.lo + shift, d.hi + shift)
			}
		}
	} else if ui.is_touch() && ui.clicked(area) {
		// A tap that did not drag.
		mx, _, _ := ui.pointer_in(area)
		l := int(math.round(index_at(mx) - f64(hi - lo) / 2))
		app.move_window(c, l, l + hi - lo)
	}

	// [from] – [to] [Show all]
	fy := nav.bottom() + 10
	bh := ui.button_height()
	dates := c.kind != .histogram
	kind := if dates { gui.FieldKind.date } else { gui.FieldKind.number }
	placeholder := if dates { 'YYYY-MM-DD' } else { '' }
	all_w := ui.button_width('Show all')
	dash_w := f32(24)
	// The fields fit a date. They go side by side, then Show all, wrapping
	// onto more rows when there's no room.
	fw := math.min(ui.text_width('0000-00-00', gui.TextStyle{}) + 26, w)
	row := bh + 8
	from_r := gui.Rect{x, fy, fw, bh}
	mut to_r := gui.Rect{x + fw + dash_w, fy, fw, bh}
	if to_r.right() > x + w {
		to_r = gui.Rect{x, fy + row, fw, bh}
	}
	mut all_r := gui.Rect{to_r.right() + dash_w, to_r.y, all_w, bh}
	if all_r.right() > x + w {
		all_r = gui.Rect{x, to_r.y + row, all_w, bh}
	}
	from_id := 'chart-from-${k}'
	to_id := 'chart-to-${k}'
	if !ui.is_focused(from_id) {
		app.charts.views[k].from.text = c.labels[lo]
	}
	if !ui.is_focused(to_id) {
		app.charts.views[k].to.text = c.labels[hi]
	}
	ev_from := ui.field(from_id, from_r, mut app.charts.views[k].from, kind, placeholder)
	if to_r.y == fy {
		ui.text(from_r.right() + dash_w / 2, fy + bh / 2, '–', gui.TextStyle{
			color:  t.muted
			align:  .center
			valign: .middle
		})
	}
	ev_to := ui.field(to_id, to_r, mut app.charts.views[k].to, kind, placeholder)
	if ev_from in [.committed, .submitted] {
		if key := app.range_key(c, app.charts.views[k].from.text) {
			app.set_window(c, c.label_index(key), hi)
		}
	}
	if ev_to in [.committed, .submitted] {
		if key := app.range_key(c, app.charts.views[k].to.text) {
			app.set_window(c, lo, c.label_index(key))
		}
	}
	if ui.button(all_r, 'Show all', .outline) {
		app.charts.views[k].zoomed = false
	}
	return all_r.bottom()
}

// range_key checks a range field's text: a date, or a weight for the
// histogram.
fn (mut app App) range_key(c core.ChartData, s string) ?string {
	if c.kind == .histogram {
		v := core.parse_number(s) or {
			app.show_error('Enter a weight.')
			return none
		}
		return '${v}'
	}
	d := core.parse_date(s) or {
		app.show_error('Enter a date as YYYY-MM-DD.')
		return none
	}
	return d.str()
}
