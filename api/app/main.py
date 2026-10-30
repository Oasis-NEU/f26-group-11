from typing import Dict

from fastapi import FastAPI

app = FastAPI(title="KhouryConnect API", version="0.1.0")


@app.get("/api/v1/health")
def health() -> Dict[str, str]:
    return {"status" : "ok"}
