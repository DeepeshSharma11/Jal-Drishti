import datetime
import math
import os
import numpy as np
import httpx
import uvicorn
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
from sklearn.ensemble import RandomForestClassifier
from supabase import create_client, Client
from twilio.rest import Client as TwilioClient
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json

load_dotenv()

# --- FastAPI Initialization ---
app = FastAPI(title="JAL-DRISHTI Enterprise - High Precision Grid")

# --- CORS Middleware: Cross-network sync ke liye ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ==========================================
# 🚀 WEBSOCKET MANAGER (Instant Update)
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                continue

manager = ConnectionManager()

# ==========================================
# CONFIGURATION & API KEYS
# ==========================================
def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value

SUPABASE_URL = get_required_env("SUPABASE_URL")
SUPABASE_KEY = get_required_env("SUPABASE_KEY")
WEATHER_API_KEY = get_required_env("WEATHER_API_KEY")
TWILIO_SID = get_required_env("TWILIO_SID")
TWILIO_AUTH_TOKEN = get_required_env("TWILIO_AUTH_TOKEN")
TWILIO_FROM = get_required_env("TWILIO_FROM")
OFFICER_NUMBER = get_required_env("OFFICER_NUMBER")

# --- Clients Setup ---
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
executor = ThreadPoolExecutor(max_workers=4)

# --- State Management ---
user_sessions: Dict = {}
weather_cache = {}
CACHE_DURATION = datetime.timedelta(minutes=15)

# ==========================================
# MACHINE LEARNING ENGINE (Risk Prediction)
# ==========================================
X_train = np.array([[0, 90], [5, 80], [15, 60], [30, 40], [50, 20], [60, 10], [10, 85], [100, 5]])
y_train = np.array([0, 0, 0, 1, 1, 1, 0, 1])
ml_model = RandomForestClassifier(n_estimators=100, random_state=42)
ml_model.fit(X_train, y_train)

def get_ml_prediction(rain_mm: float, drainage_eff: int) -> str:
    rain_mm = min(max(rain_mm, 0), 200)
    drainage_eff = min(max(drainage_eff, 0), 100)
    prob = ml_model.predict_proba([[rain_mm, drainage_eff]])[0][1]
    
    if prob > 0.8: return "CRITICAL"
    if prob > 0.5: return "High"
    if prob > 0.2: return "Medium"
    return "Low"

def risk_numeric(r: str) -> int:
    return {"CRITICAL": 100, "High": 75, "Medium": 45, "Low": 15}.get(r, 0)

# ==========================================
# GEOSPATIAL UTILITIES
# ==========================================
def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371 
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * \
        math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

async def get_weather_data(lat, lng):
    cache_key = f"{round(lat, 3)}_{round(lng, 3)}"
    now = datetime.datetime.now()
    if cache_key in weather_cache:
        cached = weather_cache[cache_key]
        if now - cached["timestamp"] < CACHE_DURATION:
            return cached["data"]
            
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={WEATHER_API_KEY}&units=metric"
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                weather_cache[cache_key] = {"data": data, "timestamp": now}
                return data
    except Exception:
        return None
    return None

class LocationData(BaseModel):
    user_id: str
    latitude: float
    longitude: float

# ==========================================
# 📡 ENDPOINTS
# ==========================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/hotspots")
async def get_hotspots(simulate: bool = False, user_id: Optional[str] = None):
    # Default: Bareilly center
    u_lat, u_lng = 28.3670, 79.4304 
    if user_id and user_id in user_sessions:
        u_lat = user_sessions[user_id]["latitude"]
        u_lng = user_sessions[user_id]["longitude"]

    weather_info = await get_weather_data(u_lat, u_lng)
    curr_rain = 0
    if weather_info and "rain" in weather_info:
        curr_rain = weather_info["rain"].get("1h", 0)

    total_rain = curr_rain + (45 if simulate else 0)

    # 🔗 Supabase Dual Table Fetch
    v_res = supabase.table("verified_hotspot").select("*").execute()
    u_res = supabase.table("hotspots").select("*").execute()
    
    v_hotspots = v_res.data or []
    u_hotspots = u_res.data or []

    sidebar_data = []
    map_markers = []
    
    # 📍 RADIUS LIMIT: 15 KM for User Focus
    NEARBY_RADIUS = 15.0

    for r in (v_hotspots + u_hotspots):
        try:
            is_user = r in u_hotspots
            is_v = r.get("is_verified", False)
            dr_val = int(str(r.get("drainage", "20%")).replace("%", ""))
            
            risk_lvl = get_ml_prediction(total_rain, dr_val)
            distance = calculate_distance(u_lat, u_lng, r["lat"], r["lng"])
            
            # Weighted Scoring (Risk + Distance)
            final_score = round(0.7 * risk_numeric(risk_lvl) + 0.3 * max(0, 100 - min(distance, 100)), 2)

            point = {
                "name": r['name'],
                "risk": risk_lvl,
                "drainage": f"{dr_val}%",
                "distance": round(distance, 2),
                "lat": r["lat"], "lng": r["lng"],
                "image_url": r.get("image_url"),
                "is_user_report": is_user,
                "is_verified": is_v,
                "score": final_score
            }
            
            # Map par saare hotspots dikhayenge
            map_markers.append(point)
            
            # ✅ SIDEBAR FILTER: Sirf 15km ke nearby hotspots
            if distance <= NEARBY_RADIUS:
                sidebar_data.append(point)
                
        except Exception: continue

    # Sidebar data sorted by score (closest + highest risk first)
    sidebar_data.sort(key=lambda x: x["score"], reverse=True)
    return {"sidebar_data": sidebar_data, "map_data": map_markers}

@app.post("/api/add-hotspot")
async def add_hotspot(data: dict):
    try:
        data["is_verified"] = False 
        supabase.table("hotspots").insert(data).execute()
        # Broadcast Instant Refresh
        await manager.broadcast({"type": "NEW_REPORT"})
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/grant-location")
async def grant_location(data: LocationData):
    user_sessions[data.user_id] = {
        "latitude": data.latitude, 
        "longitude": data.longitude, 
        "last_updated": datetime.datetime.now()
    }
    return {"status": "success"}

@app.get("/api/weather")
async def get_weather(user_id: Optional[str] = None):
    # Default: Bareilly center
    u_lat, u_lng = 28.3670, 79.4304
    if user_id in user_sessions:
        u_lat = user_sessions[user_id]["latitude"]
        u_lng = user_sessions[user_id]["longitude"]
    w_data = await get_weather_data(u_lat, u_lng)
    return w_data if w_data else {"error": "Weather unavailable"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
