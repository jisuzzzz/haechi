from fastapi import FastAPI, Query

app = FastAPI()

ITEMS = [{"id": index, "name": f"Synthetic item {index}"} for index in range(1, 6)]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/items")
def items(offset: int = Query(0, ge=0), limit: int = Query(2, ge=1, le=100)):
    page = ITEMS[offset : offset + limit]
    return {"items": page, "total": len(page), "offset": offset, "limit": limit}
