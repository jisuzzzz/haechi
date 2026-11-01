from typing import Annotated, Literal
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

router = APIRouter()
Tenant = Annotated[Literal["tenant-a", "tenant-b"], Header(alias="X-Tenant")]
Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=64,
                            pattern=r"^[a-zA-Z0-9_.-]+$")]


class Line(BaseModel):
    sku: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")
    quantity: int = Field(ge=1, le=100, strict=True)


class ReservationWrite(BaseModel):
    lines: list[Line] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_skus(self):
        if len({line.sku for line in self.lines}) != len(self.lines):
            raise ValueError("Duplicate SKUs are not allowed")
        return self


@router.get("/inventory")
def inventory(request: Request, tenant: Tenant):
    return {"items": request.app.state.repository.inventory(tenant)}


@router.post("/reservations", status_code=201)
def reserve(request: Request, tenant: Tenant, key: Key, values: ReservationWrite):
    return request.app.state.service.reserve(tenant, key,
                                            [line.model_dump() for line in values.lines])


@router.get("/reservations/{reservation_id}")
def get_reservation(request: Request, tenant: Tenant, reservation_id: str):
    result = request.app.state.repository.get(tenant, reservation_id)
    if result is None:
        raise HTTPException(404, "Reservation not found")
    return result
