from fastapi import FastAPI
from .cache import ViewCache
from .routes import router
from .service import CatalogService
from .store import CatalogStore


def create_app(store=None, cache=None):
    application = FastAPI()
    application.state.store = store if store is not None else CatalogStore()
    application.state.cache = cache if cache is not None else ViewCache()
    application.state.service = CatalogService(application.state.store, application.state.cache)
    application.include_router(router)

    @application.get("/health")
    def health():
        return {"status": "ok"}

    return application


app = create_app()
