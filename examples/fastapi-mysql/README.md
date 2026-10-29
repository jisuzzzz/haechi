# FastAPI and MySQL verification example

`GET /items/1` returns a synthetic row from MySQL. `GET /items/999` returns 404. Changing only `app/main.py` selects `tests/test_api.py` through `pythonTestMap`.

Requirements: Python 3.10 or newer, Node.js, Git, and local MySQL server/client binaries. This example uses a Unix socket on macOS or Linux. It is an original test fixture, not an application starter. Windows, Docker and async database sessions are outside this example.

## Copy to a disposable repository

Run these commands in Bash or Zsh from the haechi checkout. Copying gives the example its own Git root, so the verifier reads the example's settings.

```sh
export HAECHI_TOOLS="$PWD/core/tools"
export HAECHI_DEMO="$(mktemp -d /tmp/haechi-demo.XXXXXX)"
cp -R examples/fastapi-mysql/. "$HAECHI_DEMO/"
cd "$HAECHI_DEMO"
git init -q
git add .
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
node "$HAECHI_TOOLS/detect.mjs" "$PWD"
```

The bundled `.haechi.json` supplies only the verifier's map and single-test command. Run `/haechi:setup` when adopting this in a real repository to fill Git, forbidden-command and other required settings. Setup should detect FastAPI and pytest from the separate runtime and dev requirements files.

## Start a disposable MySQL instance

Use a new data directory and socket. `--no-defaults` prevents local server configuration from selecting an existing data directory. Networking is disabled; the temporary directory is private to your user. The passwordless root account below is only for this disposable local instance.

```sh
export HAECHI_MYSQL_TMP="$(mktemp -d /tmp/haechi-mysql.XXXXXX)"
export HAECHI_MYSQL_SOCKET="$HAECHI_MYSQL_TMP/mysql.sock"
export HAECHI_MYSQL_DATABASE=haechi_test
export HAECHI_MYSQL_USER=root
mysqld --no-defaults --initialize-insecure --datadir="$HAECHI_MYSQL_TMP/data"
mysqld --no-defaults --datadir="$HAECHI_MYSQL_TMP/data" \
  --socket="$HAECHI_MYSQL_SOCKET" --pid-file="$HAECHI_MYSQL_TMP/mysql.pid" \
  --log-error="$HAECHI_MYSQL_TMP/mysql.log" --skip-networking --mysqlx=OFF --daemonize
mysql --no-defaults --socket="$HAECHI_MYSQL_SOCKET" -u root \
  -e 'CREATE DATABASE haechi_test'
node "$HAECHI_TOOLS/verify-default.mjs" app/main.py
```

The command should run Ruff and both tests, then exit 0. The test creates a connection-local temporary table; closing the connection removes it. The tests require MySQL settings and do not substitute SQLite or silently skip when MySQL is unavailable.

To prove regression detection, change the endpoint's missing-item status from 404 to 200 in this disposable copy, then run the same source-only command. The missing-item test should fail and the verifier should exit 1. Restore 404 and rerun; both tests should pass.

Stop the instance and remove only the temporary directories created above when finished:

```sh
mysqladmin --no-defaults --socket="$HAECHI_MYSQL_SOCKET" -u root shutdown
deactivate
cd /
rm -rf -- "$HAECHI_MYSQL_TMP" "$HAECHI_DEMO"
```

API testing follows [FastAPI's TestClient guide](https://fastapi.tiangolo.com/tutorial/testing/) and [dependency override guide](https://fastapi.tiangolo.com/advanced/testing-dependencies/). The database setup follows [MySQL's initialization guide](https://dev.mysql.com/doc/refman/8.4/en/data-directory-initialization.html).
