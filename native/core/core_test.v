module core

import os
import json2
import rand

fn test_date_round_trip() {
	for s in ['1970-01-01', '2000-02-29', '2024-12-31', '2026-03-01', '1969-12-31'] {
		d := parse_date(s) or { panic('could not parse ${s}') }
		assert d.str() == s
		assert from_days(d.days()) == d
	}
	assert parse_date('2023-02-29') == none
	assert parse_date('2023-13-01') == none
	assert parse_date('nope') == none
	assert parse_date('') == none
}

fn test_date_arithmetic() {
	d := parse_date('2024-02-28')?
	assert d.add_days(1).str() == '2024-02-29'
	assert d.add_days(2).str() == '2024-03-01'
	assert d.add_days(-59).str() == '2023-12-31'
	// 2026-10-28 is a Wednesday.
	w := parse_date('2026-10-28')?
	assert w.weekday() == 3
	assert w.previous_weekday(0).str() == '2026-10-25'
	assert parse_date('2026-10-25')?.previous_weekday(0).str() == '2026-10-25'
	assert date_fill(parse_date('2024-12-30')?, parse_date('2025-01-02')?) == [
		'2024-12-30',
		'2024-12-31',
		'2025-01-01',
		'2025-01-02',
	]
}

fn test_chart_start_date() {
	now := parse_date('2026-10-28')?
	start := chart_start_date(now, 9, .month)
	assert start.weekday() == 0
	assert now.days() - start.days() >= 273 + 7
	assert now.days() - start.days() < 273 + 14
	assert chart_start_date(now, 2, .week).str() == '2026-10-04'
}

fn test_times() {
	assert normalize_time('22:30')? == '22:30'
	assert normalize_time('7:05')? == '07:05'
	assert normalize_time('10:30 PM')? == '22:30'
	assert normalize_time('12:15 am')? == '00:15'
	assert normalize_time('2230')? == '22:30'
	assert normalize_time('25:00') == none
	assert normalize_time('ab') == none
	assert display_time('22:30') == '10:30 PM'
	assert display_time('00:05') == '12:05 AM'
	assert hours_slept('22:30', '06:45')? == 8.25
	assert hours_slept('01:00', '07:30')? == 6.5
}

fn test_numbers() {
	assert avg([1.0, 0, 3]) == 2
	assert is_missing(avg([]))
	assert stdev([2.0, 4, 4, 4, 5, 5, 7, 9]) == 2
	assert stdev([5.0, 5]) == 0
	assert format_fixed(1.005, 2) == '1.01' || format_fixed(1.005, 2) == '1.00'
	assert format_fixed(180, 2) == '180.00'
	assert format_fixed(0, 2) == ''
	assert format_number(180.50) == '180.5'
	assert format_number(7.25) == '7.25'
	assert format_number(180) == '180'
	assert parse_number('')! == 0
	assert parse_number(' 180.4 ')! == 180.4
	assert parse_number('180,4')! == 180.4
	if _ := parse_number('1.2.3') {
		assert false
	}
	if _ := parse_number('abc') {
		assert false
	}
}

fn temp_store() !&Store {
	dir := os.join_path(os.vtmp_dir(), 'weight-test-${os.getpid()}-${rand.u64()}')
	return open_store(dir)
}

fn test_store_persists_and_tracks_changes() {
	mut s := temp_store()!
	defer {
		os.rmdir_all(s.dir) or {}
	}
	s.set_entry(Entry{ date: '2026-10-20', weight: 180.4, bedtime: '22:30', sleep: 8 })!
	s.set_entry(Entry{ date: '2026-10-21', weight: 180.0 })!
	// An empty entry for a new day is not stored.
	s.set_entry(Entry{ date: '2026-10-22' })!
	assert s.entries.len == 2
	assert s.user_settings.earliest_date == '2026-10-20'
	assert '2026-10-20' in s.pending
	assert user_settings_key in s.pending
	// Sleep without a bedtime is dropped.
	s.set_entry(Entry{ date: '2026-10-21', weight: 180.0, sleep: 7 })!
	assert s.entry('2026-10-21').sleep == 0

	s2 := open_store(s.dir)!
	assert s2.entries.len == 2
	assert s2.entry('2026-10-20') == s.entry('2026-10-20')
	assert s2.pending == s.pending
	assert s2.user_settings.earliest_date == '2026-10-20'

	assert s.years(parse_date('2027-01-05')?) == [2027, 2026]
	assert s.entries_for_year(2026).map(it.date) == ['2026-10-21', '2026-10-20']
}

fn test_entry_json_matches_web_client() {
	e := entry_from_any('2026-10-20', json2.decode[json2.Any]('{"date":"2026-10-20","weight":"180.4","bedtime":"22:30","sleep":8,"comments":"hi","_rev":12}')!)
	assert e.weight == 180.4
	assert e.sleep == 8
	assert e.rev == 12
	j := e.to_any().json_str()
	assert j.contains('"_rev":12')
	assert !j.contains('waist')
}

fn test_sync_round_trip() {
	mut s := temp_store()!
	defer {
		os.rmdir_all(s.dir) or {}
	}
	s.set_entry(Entry{ date: '2026-10-20', weight: 180.4 })!
	req := s.begin_sync()
	assert req.sent.len == 2
	body := as_map(json2.decode[json2.Any](req.body)!)
	assert any_arr(body['data'] or { json2.null }).len == 2

	// Edited while the request is in flight: must stay pending.
	s.set_entry(Entry{ date: '2026-10-20', weight: 181 })!

	res := SyncResponse{
		status: 200
		body:   json2.Any({
			'data':         json2.Any([
				json2.Any({
					'key':  json2.Any('"2026-10-19"')
					'data': '{"date":"2026-10-19","weight":182}'
					'id':   json2.Any(40)
				}),
				json2.Any({
					'key':  json2.Any('"2026-10-20"')
					'data': '{"date":"2026-10-20","weight":170}'
					'id':   json2.Any(41)
				}),
			])
			'saved':        [
				json2.Any({
					'key': json2.Any('"2026-10-20"')
					'id':  json2.Any(42)
				}),
				json2.Any({
					'key': json2.Any('"user-settings"')
					'id':  json2.Any(43)
				}),
			]
			'conflicted':   [
				json2.Any({
					'key':  json2.Any('"user-settings"')
					'data': '{"earliestDate":"2024-01-05","height":71,"goalWeight":160,"_rev":0}'
					'id':   json2.Any(39)
				}),
			]
			'lastSyncedId': 43
		}).json_str()
	}
	summary := s.finish_sync(req, res)!
	assert summary.received == 1
	assert summary.uploaded == 2
	assert s.entry('2026-10-19').weight == 182
	assert s.entry('2026-10-19').rev == 40
	// The local edit wins over the incoming row and is still pending.
	assert s.entry('2026-10-20').weight == 181
	assert '2026-10-20' in s.pending
	// The conflicting settings from another device were merged in, keeping
	// local values, and the merge is queued for upload.
	assert s.user_settings.height == 71
	assert s.user_settings.goal_weight == 160
	assert s.user_settings.earliest_date == '2024-01-05'
	assert user_settings_key in s.pending
	assert s.last_synced_id == 43

	res401 := SyncResponse{
		status: 401
	}
	s.auth = AuthTokens{
		email:      'a@b.c'
		auth_token: 'x'
	}
	if _ := s.finish_sync(s.begin_sync(), res401) {
		assert false
	}
	assert !s.auth.logged_in()
}

fn test_charts_and_stats() {
	mut s := temp_store()!
	defer {
		os.rmdir_all(s.dir) or {}
	}
	now := parse_date('2026-10-28')?
	mut d := now.add_days(-40)
	for i in 0 .. 41 {
		s.set_entry(Entry{
			date:    d.str()
			weight:  200 - f64(i) * 0.2
			bedtime: '22:${i % 60:02}'
			sleep:   7 + f64(i % 3) * 0.5
		})!
		d = d.add_days(1)
	}
	s.set_user_settings(UserSettings{
		...s.user_settings
		height: 70
	})!
	for kind in all_charts {
		c := s.chart(kind, now) or { panic('no ${kind} chart') }
		assert c.labels.len > 0
		for series in c.series {
			assert series.values.len == c.labels.len
		}
	}
	st := s.stats(now)
	assert st.weight != ''
	assert st.rate.starts_with('-')
	assert st.goal == '174.25'
	assert st.bmi_prime != ''
	assert st.weeks_to_go.contains(' to ')
}
