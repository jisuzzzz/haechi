#!/bin/sh
set -eu
python - <<'ORACLE'
from pathlib import Path
path = Path('/workspace/app/repository.py')
source = path.read_text()
old = '"SELECT payload, response FROM reservations WHERE idem_key=?",\n                             (key,)'
assert old in source
path.write_text(source.replace(old, '"SELECT payload, response FROM reservations WHERE tenant=? AND idem_key=?",\n                             (tenant, key)'))
path = Path('/workspace/app/service.py')
source = path.read_text()
start = source.index('        prior = self.repository.find_by_key')
source = source[:start] + '        with self.repository.transaction() as connection:\n            prior = self.repository.find_by_key(tenant, key, connection)\n            if prior is not None:\n                if prior["payload"] != payload:\n                    raise HTTPException(409, "Idempotency key payload conflict")\n                return json.loads(prior["response"])\n            for line in lines:\n                available = self.repository.available(tenant, line["sku"], connection)\n                if available is None:\n                    raise HTTPException(404, "SKU not found")\n                if available < line["quantity"]:\n                    raise HTTPException(409, "Insufficient stock")\n                self.repository.decrement(tenant, line["sku"], line["quantity"], connection)\n            result = {"id": str(uuid4()), "lines": lines, "status": "reserved"}\n            self.repository.insert(tenant, key, payload, result, connection)\n            return result\n'
path.write_text(source)
ORACLE
