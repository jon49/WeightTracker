module core

import os
import rand

// The account calls against a real, throwaway TrailBase. Skipped unless
// WEIGHT_TEST_SERVER and WEIGHT_TEST_DB are set; tasks/test-native-server.sh
// starts the server and sets them (as ../soccer/native/core/server_test.v).

const test_password = 'E2eTest!12345'

fn live_server() ?string {
	server := os.getenv('WEIGHT_TEST_SERVER')
	return if server == '' || os.getenv('WEIGHT_TEST_DB') == '' { none } else { server }
}

fn sql(query string) string {
	res := os.exec(['sqlite3', os.getenv('WEIGHT_TEST_DB'), query])
	assert res.exit_code == 0, res.output
	return res.output.trim_space()
}

// new_user registers a verified user and logs a fresh device in.
fn new_user(server string) !&Store {
	email := 'native-${rand.ulid().to_lower()}@example.com'
	register(server, email, test_password, test_password)!
	sql("PRAGMA ignore_check_constraints = ON; UPDATE _user SET email = unverified_email, unverified_email = NULL WHERE unverified_email = '${email}';")
	return device(server, email)
}

// device is a fresh device, with its own data folder, logged in as email.
fn device(server string, email string) !&Store {
	mut s := open_store(os.join_path(os.vtmp_dir(), 'weight-server-test-${rand.ulid()}'))!
	s.server_url = server
	s.auth = login(server, email, test_password)!
	return s
}

fn sync_now(mut s Store) !SyncSummary {
	req := s.begin_sync()
	return s.finish_sync(req, perform_sync(req))!
}

fn test_deleting_an_account() {
	server := live_server() or {
		println('skipped: set WEIGHT_TEST_SERVER and WEIGHT_TEST_DB')
		return
	}
	mut a := new_user(server)!
	defer {
		os.rmdir_all(a.dir) or {}
	}
	email := a.auth.email
	a.set_entry(Entry{ date: '2026-10-20', weight: 180.4 })!
	sync_now(mut a)!
	id := sql("SELECT hex(id) FROM _user WHERE email = '${email}'")
	assert sql("SELECT COUNT(*) FROM user_data WHERE hex(user) = '${id}'").int() > 0
	// A second device of the same user, still logged in afterwards.
	mut a2 := device(server, email)!
	defer {
		os.rmdir_all(a2.dir) or {}
	}
	sync_now(mut a2)!
	assert a2.entries.len == 1

	// The account and the data it synced are gone.
	deleted := delete_account(server, a.auth)
	assert deleted.ok, deleted.message
	assert sql("SELECT COUNT(*) FROM _user WHERE hex(id) = '${id}'") == '0'
	assert sql("SELECT COUNT(*) FROM user_data WHERE hex(user) = '${id}'") == '0'
	a.wipe()!
	assert a.entries.len == 0 && !a.auth.logged_in()

	// The other device's still-unexpired token is refused, it can't refresh,
	// and the password no longer logs in. It keeps its own copy.
	if _ := sync_now(mut a2) {
		assert false, 'a deleted account must not sync'
	}
	assert !a2.auth.logged_in()
	assert a2.entries.len == 1
	if _ := login(server, email, test_password) {
		assert false, 'a deleted account must not log in'
	}
	again := delete_account(server, AuthTokens{
		email:      email
		auth_token: 'stale'
	})
	assert again.status == 401
}
