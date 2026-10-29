module core

import net.http
import json2

// Sync talks to the same TrailBase backend as the web client:
//   POST /api/auth/v1/login    {email, password} -> {auth_token, refresh_token, csrf_token}
//   POST /api/auth/v1/refresh  {refresh_token}   -> {auth_token}
//   POST /api/auth/v1/logout   {refresh_token}
//   POST /api/data/weight      last-write-wins sync, see ImageBase's sync_data.
//
// The HTTP calls are plain functions with no Store access so the GUI can run
// them on a worker thread; the Store is only touched by begin_sync and
// finish_sync on the UI thread.

const sync_path = '/api/data/weight'

pub struct SyncRequest {
pub:
	server string
	auth   AuthTokens
	body   string
	// The edit sequence number of every key sent, so edits made while the
	// request is in flight are not marked as uploaded or overwritten.
	sent map[string]int
}

pub struct SyncResponse {
pub:
	status int
	body   string
	// Set when the auth token expired and was refreshed during the request.
	new_auth_token string
	error          string
}

pub struct SyncSummary {
pub:
	received int
	uploaded int
}

pub fn (s &Store) begin_sync() SyncRequest {
	mut items := []json2.Any{}
	mut sent := map[string]int{}
	for key, seq in s.pending {
		data := s.record_any(key) or { continue }
		items << json2.Any({
			'key':  json2.Any(key)
			'data': data
			'id':   any_num(as_map(data)['_rev'] or { json2.null })
		})
		sent[key] = seq
	}
	body := json2.Any({
		'lastSyncedId': json2.Any(s.last_synced_id)
		'data':         items
	})
	return SyncRequest{
		server: s.server_url
		auth:   s.auth
		body:   body.json_str()
		sent:   sent
	}
}

fn (s &Store) record_any(key string) ?json2.Any {
	if key == user_settings_key {
		return s.user_settings.to_any()
	}
	if key == chart_settings_key {
		return s.chart_settings.to_any()
	}
	if e := s.entries[key] {
		return e.to_any()
	}
	return none
}

// perform_sync does the network part of a sync. It is safe to call from any thread.
pub fn perform_sync(req SyncRequest) SyncResponse {
	mut res := post_json(req.server + sync_path, req.body, req.auth.auth_token) or {
		return SyncResponse{
			error: err.msg()
		}
	}
	mut new_token := ''
	// TrailBase auth tokens are short lived; refresh once and retry.
	if res.status_code == 401 && req.auth.refresh_token != '' {
		if token := refresh_auth_token(req.server, req.auth.refresh_token) {
			new_token = token
			res = post_json(req.server + sync_path, req.body, token) or {
				return SyncResponse{
					error:          err.msg()
					new_auth_token: new_token
				}
			}
		}
	}
	return SyncResponse{
		status:         res.status_code
		body:           res.body
		new_auth_token: new_token
	}
}

// finish_sync applies the server's response to the store.
pub fn (mut s Store) finish_sync(req SyncRequest, res SyncResponse) !SyncSummary {
	if res.new_auth_token != '' {
		s.auth.auth_token = res.new_auth_token
		s.save_auth()!
	}
	if res.error != '' {
		return error('Could not reach the server: ${res.error}')
	}
	match res.status {
		200...299 {}
		401, 403 {
			s.auth = AuthTokens{
				email: s.auth.email
			}
			s.save_auth()!
			return error('You are not logged in.')
		}
		502 {
			return error('The server is currently down. Try again later.')
		}
		503 {
			return error('Hold your horses! You are syncing too fast!')
		}
		else {
			return error('Sync failed (HTTP ${res.status}).')
		}
	}
	root := as_map(json2.decode[json2.Any](res.body) or {
		return error('The server sent an invalid response.')
	})

	mut received := 0
	for item in any_arr(root['data'] or { json2.null }) {
		m := as_map(item)
		key := parse_key(m['key'] or { json2.null })
		// Keep local edits made while this request was in flight.
		if seq := s.pending[key] {
			if sent := req.sent[key] {
				if sent != seq {
					continue
				}
			} else {
				continue
			}
		}
		data := parse_json_text(m['data'] or { json2.null })
		rev := int(any_num(m['id'] or { json2.null }))
		if s.apply_record(key, data, rev) {
			received++
		}
	}

	mut uploaded := 0
	for item in any_arr(root['saved'] or { json2.null }) {
		m := as_map(item)
		key := parse_key(m['key'] or { json2.null })
		rev := int(any_num(m['id'] or { json2.null }))
		s.set_rev(key, rev)
		if seq := s.pending[key] {
			if req.sent[key] or { -1 } == seq {
				s.pending.delete(key)
			}
		}
		uploaded++
	}

	// Another device changed the user settings since our last sync. The upload
	// above won (last write wins), so fold in what this device does not
	// know, such as a height entered elsewhere, and upload the merge.
	for item in any_arr(root['conflicted'] or { json2.null }) {
		m := as_map(item)
		if parse_key(m['key'] or { json2.null }) != user_settings_key {
			continue
		}
		remote := user_settings_from_any(parse_json_text(m['data'] or { json2.null }))
		merged := merge_user_settings(s.user_settings, remote)
		if merged != s.user_settings {
			s.user_settings = merged
			s.touch(user_settings_key, true)
		}
	}

	last := i64(any_num(root['lastSyncedId'] or { json2.null }))
	if last > s.last_synced_id {
		s.last_synced_id = last
	}
	s.version++
	s.save()!
	return SyncSummary{
		received: received
		uploaded: uploaded
	}
}

fn (mut s Store) apply_record(key string, data json2.Any, rev int) bool {
	if key == user_settings_key {
		mut us := user_settings_from_any(data)
		us.rev = rev
		us.earliest_date = earlier_date(us.earliest_date, s.user_settings.earliest_date)
		s.user_settings = us
		return true
	}
	if key == chart_settings_key {
		mut cs := chart_settings_from_any(data)
		cs.rev = rev
		s.chart_settings = cs
		return true
	}
	if _ := parse_date(key) {
		mut e := entry_from_any(key, data)
		e.date = key
		e.rev = rev
		s.entries[key] = e
		// Data entered on another device may predate this one's earliest date.
		if s.user_settings.earliest_date == '' || key < s.user_settings.earliest_date {
			s.user_settings.earliest_date = key
		}
		return true
	}
	return false
}

// merge_user_settings keeps the local values and fills in the ones it lacks.
fn merge_user_settings(local UserSettings, remote UserSettings) UserSettings {
	return UserSettings{
		earliest_date: earlier_date(local.earliest_date, remote.earliest_date)
		height:        if local.height != 0 { local.height } else { remote.height }
		goal_weight:   if local.goal_weight != 0 { local.goal_weight } else { remote.goal_weight }
		bedtime:       if local.bedtime != '' { local.bedtime } else { remote.bedtime }
		rev:           local.rev
	}
}

fn earlier_date(a string, b string) string {
	if a == '' {
		return b
	}
	if b == '' || a < b {
		return a
	}
	return b
}

fn (mut s Store) set_rev(key string, rev int) {
	if key == user_settings_key {
		s.user_settings.rev = rev
	} else if key == chart_settings_key {
		s.chart_settings.rev = rev
	} else if key in s.entries {
		s.entries[key].rev = rev
	}
}

// The server stores keys and data as JSON text and echoes them back that way.
fn parse_key(a json2.Any) string {
	return any_str(parse_json_text(a))
}

fn parse_json_text(a json2.Any) json2.Any {
	if a is string {
		if a.len > 0 && a[0] in [`{`, `[`, `"`] {
			return json2.decode[json2.Any](a) or { a }
		}
	}
	return a
}

fn any_arr(a json2.Any) []json2.Any {
	return match a {
		[]json2.Any { a }
		else { []json2.Any{} }
	}
}

pub fn login(server string, email string, password string) !AuthTokens {
	body := json2.Any({
		'email':    json2.Any(email)
		'password': password
	})
	res := post_json(server + '/api/auth/v1/login', body.json_str(), '') or {
		return error('Could not reach the server: ${err.msg()}')
	}
	match res.status_code {
		200 {}
		400, 401 {
			return error('Invalid email or password.')
		}
		429 {
			return error('Too many login attempts. Try again later.')
		}
		else {
			return error('Login failed (HTTP ${res.status_code}).')
		}
	}
	m := as_map(json2.decode[json2.Any](res.body) or {
		return error('The server sent an invalid response.')
	})
	tokens := AuthTokens{
		email:         email
		auth_token:    any_str(m['auth_token'] or { json2.null })
		refresh_token: any_str(m['refresh_token'] or { json2.null })
		csrf_token:    any_str(m['csrf_token'] or { json2.null })
	}
	if tokens.auth_token == '' {
		return error('The server did not return a login token.')
	}
	return tokens
}

// logout ends the session on the server. Failures are ignored, since the
// tokens are dropped locally either way.
pub fn logout(server string, refresh_token string) {
	if refresh_token == '' {
		return
	}
	body := json2.Any({
		'refresh_token': json2.Any(refresh_token)
	})
	post_json(server + '/api/auth/v1/logout', body.json_str(), '') or {}
}

fn refresh_auth_token(server string, refresh_token string) ?string {
	body := json2.Any({
		'refresh_token': json2.Any(refresh_token)
	})
	res := post_json(server + '/api/auth/v1/refresh', body.json_str(), '') or { return none }
	if res.status_code != 200 {
		return none
	}
	m := as_map(json2.decode[json2.Any](res.body) or { return none })
	token := any_str(m['auth_token'] or { json2.null })
	return if token == '' { none } else { token }
}

fn post_json(url string, body string, bearer string) !http.Response {
	mut header := http.new_header(key: .content_type, value: 'application/json')
	if bearer != '' {
		header.add(.authorization, 'Bearer ${bearer}')
	}
	return http.fetch(
		url:         url
		method:      .post
		header:      header
		data:        body
		user_agent:  'weight-desktop'
		validate:    url.starts_with('https://')
		max_retries: 1
	)
}
