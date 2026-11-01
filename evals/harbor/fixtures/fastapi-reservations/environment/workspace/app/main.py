import os
from fastapi import FastAPI
from .repository import ReservationRepository
from .routes import router
from .service import ReservationService


def create_app(db_path=None):
    application = FastAPI()
    application.state.repository = ReservationRepository(
        db_path if db_path is not None else os.environ.get(
            "HAECHI_RESERVATION_DB", "/tmp/haechi-reservations.sqlite3"))
    application.state.service = ReservationService(application.state.repository)
    application.include_router(router)

    @application.get("/health")
    def health():
        return {"status": "ok"}

    return application


app = create_app()
