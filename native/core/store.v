module core

import os
import json2

const data_file = 'weight-data.json'
const auth_file = 'auth.json'
pub const default_server_url = 'https://weight.jnyman.com'

// Store holds all local data and persists it as one JSON file. The data set
// is small (one record per day), so rewriting the whole file on every change
// keeps the code simple and the file easy to inspect or back up.
@[heap]
pub struct Store {
pub mut:
	dir            string
	entries        map[string]Entry
	user_settings  UserSettings
	chart_settings ChartSettings
	// Keys edited locally and not yet uploaded, mapped to the edit sequence
	// number of their latest change.
	pending        map[string]int
	edit_seq       int
	last_synced_id i64
	theme          string // 'light', 'dark' or '' for the system default
	zoom           f64    = 1.0 // text and layout scale
	server_url     string = default_server_url
	auth           AuthTokens
	// version is bumped on every change so views can cache derived data.
	version int
}

pub struct AuthTokens {
pub mut:
	email         string
	auth_token    string
	refresh_token string
	csrf_token    string
}

pub fn (a AuthTokens) logged_in() bool {
	return a.auth_token != ''
}

// default_data_dir picks the per-user application data folder for the platform.
pub fn default_data_dir() string {
	if dir := os.getenv_opt('WEIGHT_DATA_DIR') {
		return dir
	}
	$if ios {
		return os.join_path(os.home_dir(), 'Documents')
	} $else $if android {
		return os.getenv_opt('ANDROID_DATA_DIR') or { '.' }
	} $else $if windows || macos {
		base := os.config_dir() or { os.home_dir() }
		return os.join_path(base, 'Weight')
	} $else {
		return os.join_path(os.data_dir(), 'weight')
	}
}

pub fn open_store(dir string) !&Store {
	os.mkdir_all(dir)!
	mut s := &Store{
		dir: dir
	}
	s.load()!
	return s
}

pub fn (s &Store) data_path() string {
	return os.join_path(s.dir, data_file)
}

fn (mut s Store) load() ! {
	path := s.data_path()
	if os.exists(path) {
		text := os.read_file(path)!
		root := as_map(json2.decode[json2.Any](text)!)
		for k, v in as_map(root['entries'] or { json2.null }) {
			s.entries[k] = entry_from_any(k, v)
		}
		if us := root['userSettings'] {
			s.user_settings = user_settings_from_any(us)
		}
		if cs := root['chartSettings'] {
			s.chart_settings = chart_settings_from_any(cs)
		}
		for k, v in as_map(root['pending'] or { json2.null }) {
			s.pending[k] = int(any_num(v))
			if s.pending[k] > s.edit_seq {
				s.edit_seq = s.pending[k]
			}
		}
		s.last_synced_id = i64(any_num(root['lastSyncedId'] or { json2.null }))
		s.theme = any_str(root['theme'] or { json2.null })
		zoom := any_num(root['zoom'] or { json2.null })
		if zoom > 0 {
			s.zoom = zoom
		}
		url := any_str(root['serverUrl'] or { json2.null })
		if url != '' {
			s.server_url = url
		}
	}
	apath := os.join_path(s.dir, auth_file)
	if os.exists(apath) {
		a := as_map(json2.decode[json2.Any](os.read_file(apath)!)!)
		s.auth = AuthTokens{
			email:         any_str(a['email'] or { json2.null })
			auth_token:    any_str(a['auth_token'] or { json2.null })
			refresh_token: any_str(a['refresh_token'] or { json2.null })
			csrf_token:    any_str(a['csrf_token'] or { json2.null })
		}
	}
}

pub fn (mut s Store) save() ! {
	mut entries := map[string]json2.Any{}
	mut keys := s.entries.keys()
	keys.sort()
	for k in keys {
		entries[k] = s.entries[k].to_any()
	}
	mut pending := map[string]json2.Any{}
	for k, v in s.pending {
		pending[k] = v
	}
	root := json2.Any({
		'version':       json2.Any(1)
		'entries':       entries
		'userSettings':  s.user_settings.to_any()
		'chartSettings': s.chart_settings.to_any()
		'pending':       pending
		'lastSyncedId':  s.last_synced_id
		'theme':         s.theme
		'zoom':          s.zoom
		'serverUrl':     s.server_url
	})
	write_atomic(s.data_path(), json2.encode(root, prettify: true))!
}

pub fn (mut s Store) save_auth() ! {
	path := os.join_path(s.dir, auth_file)
	if !s.auth.logged_in() && s.auth.email == '' {
		if os.exists(path) {
			os.rm(path)!
		}
		return
	}
	a := json2.Any({
		'email':         json2.Any(s.auth.email)
		'auth_token':    s.auth.auth_token
		'refresh_token': s.auth.refresh_token
		'csrf_token':    s.auth.csrf_token
	})
	write_atomic(path, a.json_str())!
	$if !windows {
		os.chmod(path, 0o600) or {}
	}
}

fn write_atomic(path string, text string) ! {
	tmp := path + '.tmp'
	os.write_file(tmp, text)!
	os.mv(tmp, path)!
}

fn (mut s Store) touch(key string, sync bool) {
	s.version++
	if sync {
		s.edit_seq++
		s.pending[key] = s.edit_seq
	}
}

pub fn (s &Store) entry(date string) Entry {
	return s.entries[date] or {
		Entry{
			date: date
		}
	}
}

// set_entry saves an entry, and moves the earliest date back if needed so
// the entries list and history charts include it.
pub fn (mut s Store) set_entry(e Entry) ! {
	mut entry := e
	entry.clean()
	if prev := s.entries[entry.date] {
		if prev == entry {
			return
		}
	} else if entry.is_empty() {
		return
	}
	s.entries[entry.date] = entry
	s.touch(entry.date, true)
	earliest := s.user_settings.earliest_date
	if earliest == '' || entry.date < earliest {
		s.user_settings.earliest_date = entry.date
		s.touch(user_settings_key, true)
	}
	s.save()!
}

pub fn (mut s Store) set_user_settings(us UserSettings) ! {
	if us == s.user_settings {
		return
	}
	s.user_settings = us
	s.touch(user_settings_key, true)
	s.save()!
}

// Chart settings are a per-device preference; the web client does not sync
// them either.
pub fn (mut s Store) set_chart_settings(cs ChartSettings) ! {
	if cs == s.chart_settings {
		return
	}
	s.chart_settings = cs
	s.touch(chart_settings_key, false)
	s.save()!
}

pub fn (mut s Store) set_theme(theme string) ! {
	s.theme = theme
	s.version++
	s.save()!
}

pub fn (mut s Store) set_zoom(zoom f64) ! {
	if zoom == s.zoom {
		return
	}
	s.zoom = zoom
	s.version++
	s.save()!
}

pub fn (mut s Store) set_server_url(url string) ! {
	clean := url.trim_space().trim_right('/')
	if clean == s.server_url {
		return
	}
	s.server_url = if clean == '' { default_server_url } else { clean }
	// A different server has a different change history.
	s.last_synced_id = 0
	s.version++
	s.save()!
}

// clear_data removes all records but keeps the login, theme and server.
pub fn (mut s Store) clear_data() ! {
	s.entries = map[string]Entry{}
	s.user_settings = UserSettings{}
	s.chart_settings = ChartSettings{}
	s.pending = map[string]int{}
	s.last_synced_id = 0
	s.version++
	s.save()!
}

pub fn (s &Store) earliest_date() ?Date {
	return parse_date(s.user_settings.earliest_date)
}

// values reads one field for each date key (0 when there is no entry).
pub fn (s &Store) values(dates []string, field fn (Entry) f64) []f64 {
	mut res := []f64{len: dates.len}
	for i, d in dates {
		if e := s.entries[d] {
			res[i] = field(e)
		}
	}
	return res
}

// years lists the years from the earliest entry to now, newest first.
pub fn (s &Store) years(now Date) []int {
	start := if d := s.earliest_date() { d.year } else { now.year }
	mut res := []int{}
	for y := now.year; y >= start && y >= now.year - 200; y-- {
		res << y
	}
	return res
}

// entries_for_year returns the year's entries, newest first.
pub fn (s &Store) entries_for_year(year int) []Entry {
	prefix := '${year:04}-'
	mut res := []Entry{}
	for k, e in s.entries {
		if k.starts_with(prefix) && !e.is_empty() {
			res << e
		}
	}
	res.sort(a.date > b.date)
	return res
}
