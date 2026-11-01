from copy import deepcopy
from threading import RLock


class ViewCache:
    def __init__(self):
        self._entries = {}
        self._lock = RLock()

    def get(self, key):
        with self._lock:
            return deepcopy(self._entries.get(key))

    def set(self, key, value):
        with self._lock:
            self._entries[key] = deepcopy(value)

    def invalidate_prefix(self, prefix):
        with self._lock:
            for key in list(self._entries):
                if key[:len(prefix)] == prefix:
                    del self._entries[key]
