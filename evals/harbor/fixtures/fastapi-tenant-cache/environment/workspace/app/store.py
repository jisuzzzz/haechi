from copy import deepcopy
from threading import RLock


class CatalogStore:
    def __init__(self):
        self._lock = RLock()
        self._items = {
            tenant: {index: {"id": index, "name": f"{tenant} item {index}",
                             "category": "blue" if index % 2 else "red"}
                     for index in range(1, 5)}
            for tenant in ("tenant-a", "tenant-b")
        }
        self._next_id = {tenant: 5 for tenant in self._items}

    def list_items(self, tenant, category):
        with self._lock:
            return deepcopy([item for _, item in sorted(self._items[tenant].items())
                             if category is None or item["category"] == category])

    def get_item(self, tenant, item_id):
        with self._lock:
            return deepcopy(self._items[tenant].get(item_id))

    def create_item(self, tenant, values):
        with self._lock:
            item_id = self._next_id[tenant]
            self._next_id[tenant] += 1
            item = {"id": item_id, **values}
            self._items[tenant][item_id] = item
            return deepcopy(item)

    def update_item(self, tenant, item_id, values):
        with self._lock:
            if item_id not in self._items[tenant]:
                return None
            self._items[tenant][item_id] = {"id": item_id, **values}
            return deepcopy(self._items[tenant][item_id])

    def delete_item(self, tenant, item_id):
        with self._lock:
            return self._items[tenant].pop(item_id, None) is not None
