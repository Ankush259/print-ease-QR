import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import engine, Base
from . import models
from .routers import shops

# Automatically create tables in XAMPP MySQL on startup
Base.metadata.create_all(bind=engine)

os.makedirs("uploads/qrcodes", exist_ok=True)

app = FastAPI(
    title="PrintEase QR API",
    description="Multi-tenant QR-based Self-Service Print Shop Automation API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve QR code images and uploaded PDFs statically
app.mount("/static", StaticFiles(directory="uploads"), name="static")

app.include_router(shops.router)

@app.get("/")
def health_check():
    return {"status": "online", "message": "PrintEase QR Backend is running!"}