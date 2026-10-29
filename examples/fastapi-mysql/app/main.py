"""A small read-only API for the disposable MySQL verification example."""

import os

import pymysql
from fastapi import Depends, FastAPI, HTTPException

app = FastAPI()


def connect():
    return pymysql.connect(
        unix_socket=os.environ["HAECHI_MYSQL_SOCKET"],
        user=os.environ["HAECHI_MYSQL_USER"],
        password=os.environ.get("HAECHI_MYSQL_PASSWORD", ""),
        database=os.environ["HAECHI_MYSQL_DATABASE"],
        cursorclass=pymysql.cursors.DictCursor,
    )


def get_db():
    with connect() as connection:
        yield connection


@app.get("/items/{item_id}")
def read_item(item_id: int, db=Depends(get_db)):
    with db.cursor() as cursor:
        cursor.execute("SELECT id, name FROM items WHERE id = %s", (item_id,))
        item = cursor.fetchone()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item
