from fastapi import HTTPException


class CatalogService:
    def __init__(self, store, cache):
        self.store = store
        self.cache = cache

    def list_items(self, tenant, category, offset, limit):
        key = ("list", offset, limit)
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        items = self.store.list_items(tenant, category)
        result = {"items": items[offset:offset + limit], "total": len(items),
                  "offset": offset, "limit": limit}
        self.cache.set(key, result)
        return result

    def get_item(self, tenant, item_id):
        key = ("detail", item_id)
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        item = self.store.get_item(tenant, item_id)
        if item is None:
            raise HTTPException(404, "Item not found")
        self.cache.set(key, item)
        return item

    def create_item(self, tenant, values):
        return self.store.create_item(tenant, values)

    def update_item(self, tenant, item_id, values):
        item = self.store.update_item(tenant, item_id, values)
        if item is None:
            raise HTTPException(404, "Item not found")
        self.cache.invalidate_prefix(("detail", item_id))
        return item

    def delete_item(self, tenant, item_id):
        if not self.store.delete_item(tenant, item_id):
            raise HTTPException(404, "Item not found")
        self.cache.invalidate_prefix(("detail", item_id))
