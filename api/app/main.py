from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.repositories.postgres import DatabaseUnavailable
from app.routers import communities, me

settings = get_settings()

app = FastAPI(title="KhouryConnect API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_v1 = APIRouter(prefix="/api/v1")


@app.exception_handler(DatabaseUnavailable)
def database_unavailable(request: Request, error: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Database unavailable"})


@api_v1.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


api_v1.include_router(communities.router)
api_v1.include_router(me.router)

# Include all routes
app.include_router(api_v1)
