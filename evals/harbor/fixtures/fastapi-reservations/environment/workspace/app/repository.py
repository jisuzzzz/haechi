from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3


class ReservationRepository:
    def __init__(self, db_path):
        self.db_path = str(db_path)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with self.using() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS inventory (
                    tenant TEXT NOT NULL, sku TEXT NOT NULL, available INTEGER NOT NULL,
                    PRIMARY KEY (tenant, sku));
                CREATE TABLE IF NOT EXISTS reservations (
                    id TEXT PRIMARY KEY, tenant TEXT NOT NULL, idem_key TEXT NOT NULL,
                    payload TEXT NOT NULL, response TEXT NOT NULL,
                    UNIQUE (tenant, idem_key));
            """)
            for tenant in ("tenant-a", "tenant-b"):
                connection.executemany(
                    "INSERT OR IGNORE INTO inventory VALUES (?, ?, ?)",
                    [(tenant, "widget", 5), (tenant, "gadget", 4)])

    @contextmanager
    def using(self, connection=None):
        if connection is not None:
            yield connection
            return
        owned = sqlite3.connect(self.db_path, isolation_level=None, timeout=15)
        owned.row_factory = sqlite3.Row
        try:
            yield owned
        finally:
            owned.close()

    @contextmanager
    def transaction(self):
        with self.using() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                yield connection
                connection.commit()
            except BaseException:
                connection.rollback()
                raise

    def inventory(self, tenant):
        with self.using() as connection:
            return [dict(row) for row in connection.execute(
                "SELECT sku, available FROM inventory WHERE tenant=? ORDER BY sku", (tenant,))]

    def available(self, tenant, sku, connection=None):
        with self.using(connection) as db:
            row = db.execute("SELECT available FROM inventory WHERE tenant=? AND sku=?",
                             (tenant, sku)).fetchone()
            return None if row is None else row["available"]

    def decrement(self, tenant, sku, quantity, connection=None):
        with self.using(connection) as db:
            db.execute("UPDATE inventory SET available=available-? WHERE tenant=? AND sku=?",
                       (quantity, tenant, sku))

    def find_by_key(self, tenant, key, connection=None):
        with self.using(connection) as db:
            row = db.execute("SELECT payload, response FROM reservations WHERE idem_key=?",
                             (key,)).fetchone()
            return None if row is None else dict(row)

    def insert(self, tenant, key, payload, response, connection=None):
        with self.using(connection) as db:
            db.execute("INSERT INTO reservations VALUES (?, ?, ?, ?, ?)",
                       (response["id"], tenant, key, payload, json.dumps(response)))

    def get(self, tenant, reservation_id):
        with self.using() as db:
            row = db.execute("SELECT response FROM reservations WHERE tenant=? AND id=?",
                             (tenant, reservation_id)).fetchone()
            return None if row is None else json.loads(row["response"])
