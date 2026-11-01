#!/bin/sh
set -eu
python - <<'ORACLE'
from pathlib import Path
path = Path('/workspace/app/service.py')
source = path.read_text()
assert 'key = ("list", offset, limit)' in source
source = source.replace('key = ("list", offset, limit)', 'key = (tenant, "list", category, offset, limit)')
source = source.replace('key = ("detail", item_id)', 'key = (tenant, "detail", item_id)')
source = source.replace('return self.store.create_item(tenant, values)', 'item = self.store.create_item(tenant, values)\n        self.cache.invalidate_prefix((tenant,))\n        return item')
source = source.replace('self.cache.invalidate_prefix(("detail", item_id))', 'self.cache.invalidate_prefix((tenant,))')
path.write_text(source)
ORACLE
