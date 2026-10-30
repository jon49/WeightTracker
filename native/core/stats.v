module core

import math

// Missing values in numeric series are NaN, so charts can show gaps.
pub const missing = math.nan()

pub fn is_missing(v f64) bool {
	return math.is_nan(v)
}

// has_value matches the web client's truthiness test: 0 and NaN mean "no value".
pub fn has_value(v f64) bool {
	return v != 0 && !math.is_nan(v)
}

pub fn round(n f64, precision int) f64 {
	p := math.pow(10, precision)
	return math.round(n * p) / p
}

// avg averages the values that are set, or returns NaN when none are.
pub fn avg(values []f64) f64 {
	mut sum := 0.0
	mut count := 0
	for v in values {
		if has_value(v) {
			sum += v
			count++
		}
	}
	return if count == 0 { missing } else { sum / count }
}

// stdev is the population standard deviation of the values that are set.
pub fn stdev(values []f64) f64 {
	set := values.filter(has_value(it))
	if set.len == 0 {
		return missing
	}
	mean := avg(set)
	mut sum := 0.0
	for v in set {
		sum += (v - mean) * (v - mean)
	}
	return math.sqrt(sum / set.len)
}

// format_fixed formats with exactly `precision` decimals, or '' when unset.
pub fn format_fixed(n f64, precision int) string {
	if !has_value(n) {
		return ''
	}
	r := round(n, precision)
	return match precision {
		0 { '${r:.0f}' }
		1 { '${r:.1f}' }
		2 { '${r:.2f}' }
		else { '${r:.3f}' }
	}
}

// format_number prints a number without trailing zeros (12.5, 180, 7.25),
// or '' when unset.
pub fn format_number(n f64) string {
	if !has_value(n) {
		return ''
	}
	mut s := '${round(n, 4):.4f}'
	s = s.trim_right('0')
	return s.trim_right('.')
}

// parse_number reads a user typed number. Empty input is 0 (unset).
pub fn parse_number(s string) !f64 {
	t := s.trim_space().replace(',', '.')
	if t == '' {
		return 0
	}
	mut dots := 0
	for c in t {
		if c == `.` {
			dots++
		} else if !c.is_digit() {
			return error('"${s}" is not a number')
		}
	}
	if dots > 1 || t == '.' {
		return error('"${s}" is not a number')
	}
	return t.f64()
}
