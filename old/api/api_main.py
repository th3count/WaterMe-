# api_main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from core.scheduler import router as schedule_router
from core.zone_controller import router as zone_router         # ✅ migrated from api_zone
from core.watchdog import router as watchdog_router             # ✅ integrated watchdog API
from core.garden_manager import router as garden_router         # ✅ integrated garden manager

app = FastAPI(
    title="WaterMe! API",
    version="0.2.4",
    description="Backend API for the WaterMe! system"
)

# CORS configuration (adjust for production as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For testing; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(schedule_router)
app.include_router(zone_router)           # ✅ now from core
app.include_router(watchdog_router)       # uses internal prefix /api/watchdog
app.include_router(garden_router)         # uses internal prefix /api/garden

# Root endpoint
@app.get("/")
def root():
    return {"status": "ok", "message": "WaterMe! API running"}
