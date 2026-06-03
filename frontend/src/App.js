import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Circle } from 'react-leaflet';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js'; 
import './App.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// --- 🌐 NETWORK CONFIG ---
const LAPTOP_IP = window.location.hostname || "localhost"; 
const API_BASE_URL = `http://${LAPTOP_IP}:8000`;
const WS_URL = `ws://${LAPTOP_IP}:8000/ws`; 

axios.defaults.timeout = 10000;

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing required Supabase environment variables.');
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// --- 🛰️ AXIOS AUTH INTERCEPTOR ---
axios.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// --- 🎨 CUSTOM MARKERS (Custom icons design karne ke liye) ---
const createPinIcon = (color) => {
  return new L.DivIcon({
    className: 'custom-pin',
    html: `<svg width="30" height="42" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
          </svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -40],
  });
};

const INDIA_CENTER = [20.5937, 78.9629]; 

// --- 📍 DYNAMIC MAP CONTROLLER (Yeh map ke movement ko control karta hai) ---
function MapController({ userPos, selectedSpot }) {
  const map = useMap();
  const initialMoveDone = useRef(false);
  const lastSpotName = useRef(null);

  // 1. Sirf pehli baar user ki location par jaane ke liye
  useEffect(() => {
    if (userPos && !initialMoveDone.current) {
      map.flyTo([userPos.lat, userPos.lng], 13, { animate: true, duration: 2 });
      initialMoveDone.current = true;
    }
  }, [userPos, map]);

  // 2. Dashboard se click karne par smooth animation ke liye (Shaking fix yahan hai)
  useEffect(() => {
    if (selectedSpot && selectedSpot.name !== lastSpotName.current) {
      map.flyTo([selectedSpot.lat, selectedSpot.lng], 16, { 
        animate: true, 
        duration: 1.5 
      });
      lastSpotName.current = selectedSpot.name; // Taaki GPS update animation ko disturb na kare
    }
  }, [selectedSpot, map]);

  return null;
}

// --- 📍 RE-CENTER CONTROL (User ko wapas apni jagah laane ke liye) ---
function RecenterControl({ userPos }) {
  const map = useMap();
  const handleRecenter = () => {
    if (userPos) {
      map.flyTo([userPos.lat, userPos.lng], 17, { animate: true, duration: 1.5 });
    } else {
      toast.warn("GPS Signal kamzor hai.");
    }
  };
  return (
    <button className="recenter-btn" onClick={handleRecenter} title="Meri Location Dhundo">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="8" stroke="#3b82f6" strokeWidth="2"/><circle cx="12" cy="12" r="3" fill="#3b82f6"/>
        <path d="M12 2V5M12 19V22M2 12H5M19 12H22" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

function App() {
  const [hotspots, setHotspots] = useState({ sidebar_data: [], map_data: [] });
  const [isSimulating, setIsSimulating] = useState(false);
  const [weather, setWeather] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [accuracy, setAccuracy] = useState(0);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [clickedCoords, setClickedCoords] = useState(null);
  const [selectedSpot, setSelectedSpot] = useState(null); 
  const markerRefs = useRef({}); 
  const fileInputRef = useRef(null);
  const lastTapRef = useRef({ time: 0, count: 0 });

  // --- 🔒 AUTHENTICATION STATE ---
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const userId = session?.user?.id || 'anonymous';

  // --- 🚀 DATA FETCH KARNE KE LIYE ---
  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/hotspots`, {
        params: { simulate: isSimulating, user_id: userId }
      });
      setHotspots(res.data);
      const wRes = await axios.get(`${API_BASE_URL}/api/weather`, { params: { user_id: userId } });
      setWeather(wRes.data);
    } catch (err) { console.error("API Fetch Error", err); }
  }, [isSimulating, userId]);

  // --- 🔒 AUTHENTICATION LISTENERS & HANDLERS ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.warn("Kripya email aur password bharein.");
      return;
    }
    setAuthLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.user && data.session) {
          toast.success("Registration safal raha! Aap logged in hain.");
        } else {
          toast.info("Verification link aapke email par bheja gaya hai!");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Login safal raha!");
      }
    } catch (err) {
      toast.error(err.message || "Auth fail ho gaya");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setHasLocationPermission(false);
      toast.success("Sign out safal raha!");
    } catch (err) {
      toast.error("Logout fail ho gaya");
    }
  };

  // --- 📡 REAL-TIME UPDATES (WebSocket) ---
  useEffect(() => {
    if (hasLocationPermission) {
      const socket = new WebSocket(WS_URL);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "NEW_REPORT" || message.type === "NEW_DATA") {
          toast.info("🔔 Naya update aaya hai!");
          fetchData(); 
        }
      };
      return () => socket.close();
    }
  }, [hasLocationPermission, fetchData]);

  useEffect(() => {
    if (hasLocationPermission) fetchData();
  }, [hasLocationPermission, fetchData]);

  // Sidebar se click handle karna
  const handleSidebarClick = (spot) => {
    setSelectedSpot(spot);
    const marker = markerRefs.current[spot.name];
    if (marker) marker.openPopup();
  };

  // --- 🛰️ LIVE GPS TRACKING (High Precision) ---
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) { toast.error("GPS support nahi hai."); return; }
    toast.info("🛰️ Flood Grid calibrate ho raha hai...");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(coords);
        setAccuracy(pos.coords.accuracy);
        setHasLocationPermission(true);
        localStorage.setItem('jal_drishti_user_id', userId);
        try {
          await axios.post(`${API_BASE_URL}/api/grant-location`, { 
            user_id: userId, latitude: coords.lat, longitude: coords.lng 
          });
        } catch (e) { console.error("Sync fail ho gaya"); }
      },
      (err) => { toast.error("GPS access nahi mila."); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy < 1000) { 
          setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setAccuracy(pos.coords.accuracy);
        }
      },
      null,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } 
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId]);

  // --- 📍 MAP EVENTS (Triple Tap Logic) ---
function MapEvents() {
  useMapEvents({
    click: (e) => {
      const now = Date.now();
      const diff = now - lastTapRef.current.time;
      if (diff > 400) {
        lastTapRef.current = { time: now, count: 1 };
      } else {
        lastTapRef.current.count += 1;
        lastTapRef.current.time = now;
      }
      if (lastTapRef.current.count === 3) {
        setClickedCoords(e.latlng);
        toast.success("🎯 Triple Tap: Location lock ho gayi!", { 
          position: window.innerWidth <= 768 ? "bottom-center" : "top-center",
          autoClose: 2000 
        });
        lastTapRef.current.count = 0;
      }
    },
    contextmenu: (e) => {
      e.originalEvent.preventDefault();
      setClickedCoords(e.latlng);
      toast.info("📍 Point lock ho gaya!", {
        position: window.innerWidth <= 768 ? "bottom-center" : "top-center",
        autoClose: 2000
      });
    }
  });
  return null;
}

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !clickedCoords) return;
    const name = prompt("Area ka naam likhein:");
    if (!name) return;

    toast.info("Report upload ho rahi hai...");
    try {
      const fileName = `${Date.now()}_report.jpg`;
      await supabase.storage.from('hotspot-images').upload(fileName, file);
      const { data: urlData } = supabase.storage.from('hotspot-images').getPublicUrl(fileName);

      await axios.post(`${API_BASE_URL}/api/add-hotspot`, {
        name: name, lat: clickedCoords.lat, lng: clickedCoords.lng, drainage: "20%",
        image_url: urlData.publicUrl, is_verified: false, user_id: userId
      });
      setClickedCoords(null);
      toast.success("Broadcast safal raha!");
    } catch (err) { toast.error("Upload fail ho gaya"); }
  };

  return (
    <div className="container">
      <ToastContainer theme="dark" position="bottom-right" />
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" style={{display:'none'}} onChange={handleFileUpload} />

      {!session ? (
        <div className="permission-overlay">
          <div className="permission-card auth-card">
            <h2 className="auth-title">JAL-DRISHTI Enterprise</h2>
            <p className="auth-subtitle">Pan-India Real-Time Flood Monitoring System</p>
            <form onSubmit={handleAuth} className="auth-form">
              <div className="input-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  placeholder="name@example.com" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                />
              </div>
              <button type="submit" className="sync-btn auth-btn" disabled={authLoading}>
                {authLoading ? "Kripya Pratiksha Karein..." : (isSignUp ? "Account Banayein" : "Sign In Karein")}
              </button>
            </form>
            <div className="auth-toggle">
              {isSignUp ? (
                <p>Pehle se account hai? <span onClick={() => setIsSignUp(false)}>Sign In</span></p>
              ) : (
                <p>Naya account? <span onClick={() => setIsSignUp(true)}>Account Banayein</span></p>
              )}
            </div>
          </div>
        </div>
      ) : !hasLocationPermission ? (
        <div className="permission-overlay">
          <div className="permission-card">
            <h2 style={{color: '#3b82f6', fontWeight: '800'}}>JAL-DRISHTI Enterprise</h2>
            <p style={{marginBottom: '0.5rem'}}>Pan-India Real-Time Flood Monitoring System</p>
            <p style={{fontSize: '0.9rem', color: '#64748b', marginBottom: '1.5rem'}}>Logged in: <strong>{session.user.email}</strong></p>
            <button className="sync-btn" onClick={startTracking}>Live GPS Sync Karein</button>
            <button className="clear-btn" onClick={handleSignOut} style={{marginTop: '10px', background: 'transparent', color: '#94a3b8', border: '1px solid #334155', width: '100%'}}>Sign Out</button>
          </div>
        </div>
      ) : null}

      {session && hasLocationPermission && (
        <>
          <header className="header">
            <div className="logo-section"><span className="live-indicator"></span><h2 className="title">JAL-DRISHTI</h2></div>
            <div className="header-controls">
              {weather && <div className="weather-glass">🌡️ {Math.round(weather.main?.temp || 0)}°C</div>}
              <div className="user-profile-header">
                <span className="user-email-header">👤 {session.user.email}</span>
                <button className="logout-header-btn" onClick={handleSignOut}>Logout</button>
              </div>
              <button className={`sim-button ${isSimulating ? 'btn-stop' : 'btn-start'}`} onClick={() => setIsSimulating(!isSimulating)}>
                {isSimulating ? "🛑 ROKEIN" : "🔮 SIMULATE"}
              </button>
            </div>
          </header>

          <div className="main-content">
            <aside className="sidebar">
              <div className="user-report-section">
                <button 
                  onClick={() => clickedCoords ? fileInputRef.current.click() : toast.warn("Pehle map par triple tap karein!")} 
                  className={`report-btn ${clickedCoords ? 'active-report' : ''}`}
                >
                  📸 {clickedCoords ? "Proof Upload Karein" : "Mark karne ke liye 3 baar tap karein"}
                </button>
                {clickedCoords && <button className="clear-btn" onClick={() => setClickedCoords(null)}>Radd Karein</button>}
              </div>
              <h3 className="sidebar-title">Local Hotspot Analysis</h3>
              <div className="card-list">
                {hotspots.sidebar_data?.map((spot, idx) => (
                  <div key={idx} onClick={() => handleSidebarClick(spot)} className="risk-card cursor-pointer">
                    <strong>{spot.name}</strong>
                    <span className="risk-badge">{spot.risk}</span>
                    <p>📍 {spot.distance} km | {spot.drainage}</p>
                  </div>
                ))}
              </div>
            </aside>

            <main className="map-container">
              <MapContainer center={INDIA_CENTER} zoom={5} style={{ height: "100%", width: "100%" }} preferCanvas={true}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapController userPos={userPos} selectedSpot={selectedSpot} />
                <MapEvents />
                <RecenterControl userPos={userPos} />

                {userPos && (
                  <>
                    <Marker position={[userPos.lat, userPos.lng]} icon={createPinIcon("#3b82f6")}><Popup>Aap yahan hain</Popup></Marker>
                    <Circle center={[userPos.lat, userPos.lng]} radius={Math.min(accuracy, 300)} pathOptions={{color: '#3b82f6', fillOpacity: 0.1, dashArray: '5, 5'}} />
                  </>
                )}

                {clickedCoords && <Marker position={clickedCoords} icon={createPinIcon("#f39c12")} />}

                {hotspots.map_data?.map((spot, idx) => {
                  let markerColor = spot.is_user_report && !spot.is_verified ? "#f39c12" : (spot.risk === "CRITICAL" ? "#dc2626" : "#2ecc71");
                  const sourceLabel = spot.is_user_report ? (spot.is_verified ? "Verified User Data" : "Pending Report") : "Verified Official Data";
                  return (
                    <Marker key={idx} position={[spot.lat, spot.lng]} icon={createPinIcon(markerColor)} ref={(el) => (markerRefs.current[spot.name] = el)}>
                      <Popup>
                        <div className="map-popup">
                          <strong>{spot.name}</strong><br/>
                          <small style={{fontWeight: 'bold', color: spot.is_user_report ? '#f39c12' : '#2ecc71'}}>{sourceLabel}</small>
                          {spot.image_url && <img src={spot.image_url} alt="proof" style={{width: '100%', marginTop: '5px', borderRadius: '4px'}} />}
                          <p style={{marginTop: '8px'}}>Risk: {spot.risk} | Drainage: {spot.drainage}</p>
                          <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}&travelmode=driving`, '_blank')}
                             style={{marginTop: '10px', width: '100%', padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>
                             🚗 Directions Dekhein
                           </button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </main>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
