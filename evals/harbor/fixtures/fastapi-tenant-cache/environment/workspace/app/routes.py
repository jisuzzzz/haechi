from typing import Annotated, Literal
from fastapi import APIRouter, Header, Path, Query, Request, Response
from pydantic import BaseModel, Field

router = APIRouter()
Tenant = Annotated[Literal["tenant-a", "tenant-b"], Header(alias="X-Tenant")]
ItemId = Annotated[int, Path(gt=0)]


class ItemWrite(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: Literal["blue", "red"]


@router.get("/items")
def list_items(request: Request, tenant: Tenant,
               category: Literal["blue", "red"] | None = None,
               offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
    return request.app.state.service.list_items(tenant, category, offset, limit)


@router.get("/items/{item_id}")
def get_item(request: Request, tenant: Tenant, item_id: ItemId):
    return request.app.state.service.get_item(tenant, item_id)


@router.post("/items", status_code=201)
def create_item(request: Request, tenant: Tenant, values: ItemWrite):
    return request.app.state.service.create_item(tenant, values.model_dump())


@router.put("/items/{item_id}")
def update_item(request: Request, tenant: Tenant, item_id: ItemId, values: ItemWrite):
    return request.app.state.service.update_item(tenant, item_id, values.model_dump())


@router.delete("/items/{item_id}", status_code=204)
def delete_item(request: Request, tenant: Tenant, item_id: ItemId):
    request.app.state.service.delete_item(tenant, item_id)
    return Response(status_code=204)
