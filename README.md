# Jal Drishti

Jal Drishti is a real-time waterlogging detection and hotspot monitoring platform designed to track, predict, and report urban flooding. By combining live weather data, machine learning, and crowdsourced reports, the system provides authorities and citizens with actionable insights to mitigate waterlogging issues.

## Features

- **User Authentication & Profiles**: Secure sign-up and login workflows powered by Supabase Auth with custom user profile displays.
- **Backend Route Security**: Custom FastAPI JWT verification dependency to protect data submission and location synchronization routes.
- **Live Hotspot Map**: Interactive Leaflet map displaying official verified hotspots and user-reported waterlogging sites.
- **Machine Learning Risk Analysis**: Real-time flooding risk prediction (Critical, High, Medium, Low) powered by a Random Forest classifier in the backend, utilizing current rainfall data and drainage efficiency.
- **Dynamic Weather Integration**: Fetches real-time localized weather and precipitation stats using the OpenWeatherMap API.
- **Live GPS Calibration**: High-precision user location tracking to calibrate nearby flood grids dynamically.
- **Crowdsourced Incident Reporting**: Enables citizens to report waterlogging locations with photo evidence (uploaded directly to Supabase storage).
- **Instant Updates**: WebSocket-driven broadcast system to push new reports to active users instantly.
- **Automated Alerts**: Direct integration with Twilio to send critical flood alerts to city officers.

## System Architecture

- **Frontend**: React, Leaflet (Map rendering), Axios, React-Toastify.
- **Backend**: FastAPI, Scikit-learn (ML Classifier), Uvicorn.
- **Database & Storage**: Supabase (PostgreSQL database & object storage).
- **External Integrations**: OpenWeatherMap API, Twilio API (SMS/WhatsApp notifications).

---

## Installation & Setup

### Prerequisites
- Python 3.9+
- Node.js 16+
- Supabase Account
- Twilio & OpenWeatherMap API keys

### 1. Database & Storage Setup
1. Create a new project in your Supabase dashboard.
2. In the Supabase SQL Editor, execute the schema and seed scripts:
   - [schema.sql](file:///c:/Users/deepe/Desktop/All%20Folder/JalDrishti_Project/db/schema.sql)
   - [seed.sql](file:///c:/Users/deepe/Desktop/All%20Folder/JalDrishti_Project/db/seed.sql)
3. Create a public storage bucket named `hotspot-images` in Supabase for user-submitted proof photos.

### 2. Backend Configuration
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
3. Fill in your service credentials:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   WEATHER_API_KEY=your_openweathermap_api_key
   TWILIO_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_FROM=whatsapp:your_twilio_whatsapp_number
   OFFICER_NUMBER=whatsapp:destination_number
   ```
4. Set up a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: .\venv\Scripts\activate
   pip install -r requirements.txt
   ```
5. Start the backend server:
   ```bash
   uvicorn main:app --reload
   ```
   *The backend will run on `http://localhost:8000`.*

### 3. Frontend Configuration
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
3. Add your public Supabase credentials:
   ```env
   REACT_APP_SUPABASE_URL=your_supabase_url
   REACT_APP_SUPABASE_KEY=your_supabase_anon_key
   ```
4. Install dependencies and start the development server:
   ```bash
   npm install
   npm start
   ```
   *The app will open automatically at `http://localhost:3000`.*
