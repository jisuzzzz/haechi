import json
from uuid import uuid4
from fastapi import HTTPException


class ReservationService:
    def __init__(self, repository):
        self.repository = repository

    def reserve(self, tenant, key, lines):
        lines = sorted(lines, key=lambda line: line["sku"])
        payload = json.dumps(lines, sort_keys=True, separators=(",", ":"))
        prior = self.repository.find_by_key(tenant, key)
        if prior is not None:
            return json.loads(prior["response"])
        for line in lines:
            available = self.repository.available(tenant, line["sku"])
            if available is None:
                raise HTTPException(404, "SKU not found")
            if available < line["quantity"]:
                raise HTTPException(409, "Insufficient stock")
            self.repository.decrement(tenant, line["sku"], line["quantity"])
        result = {"id": str(uuid4()), "lines": lines, "status": "reserved"}
        self.repository.insert(tenant, key, payload, result)
        return result
