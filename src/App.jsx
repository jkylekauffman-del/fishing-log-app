import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Camera, Wind, Droplets, Clock, Trash2, Plus, ChevronDown, Map, Filter, Download, Upload, LogOut, LogIn, Cloud } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, query, where, updateDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Firebase configuration
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCAWh8uIsM7uHD0mAuqu3CZLMzZuMcuM1k",
  authDomain: "fish-catch-log.firebaseapp.com",
  projectId: "fish-catch-log",
  storageBucket: "fish-catch-log.firebasestorage.app",
  messagingSenderId: "820996110994",
  appId: "1:820996110994:web:c6aa215c064c7c70f7844b"
};

// Initialize Firebase
let db = null;
let auth = null;
let isFirebaseReady = false;

const initFirebase = () => {
  if (isFirebaseReady) return { db, auth };
  try {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    auth = getAuth(app);
    isFirebaseReady = true;
    return { db, auth, collection, getDocs, addDoc, deleteDoc, doc, query, where, updateDoc, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut };
  } catch (error) {
    console.error('Firebase init error:', error);
    return null;
  }
};

const FishingLogApp = () => {
  const fileInputRef = useRef(null);
  
  const [catches, setCatches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState('log');
  const [showFilters, setShowFilters] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [selectedCatchForMap, setSelectedCatchForMap] = useState(null);
  const [selectedCatchDetails, setSelectedCatchDetails] = useState(null);
  const mapRef = useRef(null);
  
  const [formData, setFormData] = useState({
    fishImage: null,
    lureImage: null,
    lureName: '',
    lureColor: '',
    lureSize: '',
    lureType: '',
    fishSpecies: '',
    weight: '',
    length: '',
    time: '',
    date: new Date().toISOString().split('T')[0],
    latitude: '',
    longitude: '',
    waterTemp: '',
    depth: '',
    weatherTemp: '',
    uvIndex: '',
    cloudCover: '',
    windSpeed: '',
    windDirection: '',
    barometricPressure: '',
    moonPhase: '',
    coverType: '',
    notes: ''
  });

  const [filters, setFilters] = useState({
    species: '',
    minWeight: '',
    maxWeight: '',
    minLength: '',
    maxLength: '',
    lureType: '',
    lureName: '',
    minWaterTemp: '',
    maxWaterTemp: '',
    minDepth: '',
    maxDepth: '',
    coverType: '',
    minAirTemp: '',
    maxAirTemp: ''
  });

  // Initialize Firebase and set up auth listener
  useEffect(() => {
    const setup = async () => {
      initFirebase();
      onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setFirebaseReady(true);
        if (currentUser) {
          loadCatchesFromFirebase(currentUser.uid);
        } else {
          setIsLoading(false);
        }
      });
      requestUserLocation();
    };
    setup();
  }, []);

  useEffect(() => {
    if (userLocation && !formData.latitude) {
      fetchWeatherData(userLocation.latitude, userLocation.longitude);
      setFormData(prev => ({
        ...prev,
        latitude: userLocation.latitude.toString(),
        longitude: userLocation.longitude.toString(),
        time: new Date().toTimeString().slice(0, 5)
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  // Sync weatherData to formData when weather is fetched
  useEffect(() => {
    if (weatherData && !formData.weatherTemp) {
      setFormData(prev => ({
        ...prev,
        weatherTemp: weatherData.temperature?.toString() || '',
        windSpeed: Math.round(weatherData.windSpeed)?.toString() || '',
        windDirection: weatherData.windDirection || '',
        cloudCover: weatherData.cloudCover?.toString() || '',
        barometricPressure: weatherData.pressure?.toFixed(1) || '',
        uvIndex: (weatherData.uvIndex !== undefined ? weatherData.uvIndex : 0).toString(),
        moonPhase: weatherData.moonPhaseName || ''
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherData]);

  // Handle zoom to selected catch on map
  useEffect(() => {
    if (selectedCatchForMap && mapRef.current) {
      const lat = parseFloat(selectedCatchForMap.latitude);
      const lng = parseFloat(selectedCatchForMap.longitude);
      if (lat && lng) {
        setTimeout(() => {
          mapRef.current.setView([lat, lng], 16);
        }, 100);
      }
    }
  }, [selectedCatchForMap]);

  const requestUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        },
        () => {
          // Location error - continue anyway
        }
      );
    }
  };

  const fetchWeatherData = async (lat, lng) => {
    try {
      // Round coordinates to 4 decimal places for accuracy
      const roundedLat = Math.round(lat * 10000) / 10000;
      const roundedLng = Math.round(lng * 10000) / 10000;
      
      // Fetch current weather with UV index
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,pressure_msl,uv_index&timezone=auto`
      );
      const data = await response.json();
      console.log('Weather API Response:', data);
      
      // Get moon phase from timeanddate.com API (more reliable than open-meteo)
      let moonPhase = 0;
      try {
        const today = new Date();
        const moonResponse = await fetch(
          `https://www.timeanddate.com/scripts/moonphases.json?year=${today.getFullYear()}&month=${today.getMonth() + 1}`
        );
        const moonData = await moonResponse.json();
        console.log('Moon API Response:', moonData);
        
        // Find today's moon phase from the data
        if (moonData && Array.isArray(moonData)) {
          const todayStr = today.toISOString().split('T')[0];
          const todayMoon = moonData.find(m => m.date === todayStr);
          if (todayMoon && todayMoon.phase) {
            // Convert percentage to 0-1 scale
            moonPhase = todayMoon.phase / 100;
            console.log('Raw Moon Phase Value:', moonPhase, 'Phase:', todayMoon.name);
          } else {
            console.log('No moon phase data for today');
          }
        }
      } catch (e) {
        console.log('Moon phase fetch error, trying alternative:', e);
        // Fallback: Calculate moon phase using algorithm
        try {
          const now = new Date();
          const knownNewMoon = new Date(2000, 0, 6); // Known new moon date
          const lunarMonth = 29.53058867; // Days in lunar month
          const daysSinceNewMoon = (now - knownNewMoon) / (1000 * 60 * 60 * 24);
          moonPhase = (daysSinceNewMoon % lunarMonth) / lunarMonth;
          console.log('Calculated Moon Phase:', moonPhase);
        } catch (calcError) {
          console.log('Moon phase calculation error:', calcError);
        }
      }
      
      if (data.current) {
        const temp = Math.round(data.current.temperature_2m * 9/5 + 32);
        const windDir = getWindDirection(data.current.wind_direction_10m);
        const moonPhaseName = getMoonPhaseName(moonPhase);
        
        console.log('Processed Weather Data:', {
          temperature: temp,
          windSpeed: data.current.wind_speed_10m,
          windDirection: windDir,
          cloudCover: data.current.cloud_cover,
          pressure: data.current.pressure_msl,
          uvIndex: data.current.uv_index,
          moonPhase: moonPhase,
          moonPhaseName: moonPhaseName
        });
        
        setWeatherData({
          temperature: temp,
          windSpeed: data.current.wind_speed_10m,
          windDirection: windDir,
          cloudCover: data.current.cloud_cover,
          pressure: data.current.pressure_msl,
          uvIndex: data.current.uv_index !== undefined ? data.current.uv_index : 0,
          moonPhase: moonPhase,
          moonPhaseName: moonPhaseName
        });
        setFormData(prev => ({
          ...prev,
          latitude: roundedLat.toString(),
          longitude: roundedLng.toString(),
          weatherTemp: temp.toString(),
          windSpeed: Math.round(data.current.wind_speed_10m).toString(),
          windDirection: windDir,
          cloudCover: Math.round(data.current.cloud_cover / 10) * 10,
          barometricPressure: data.current.pressure_msl.toFixed(1),
          uvIndex: (data.current.uv_index !== undefined ? data.current.uv_index : 0).toString(),
          moonPhase: moonPhaseName
        }));
      }
    } catch (error) {
      console.log('Weather error:', error);
    }
  };

  const getMoonPhaseName = (phase) => {
    // Open-Meteo returns 0-1 where:
    // 0 = New Moon
    // 0.25 = First Quarter (waxing)
    // 0.5 = Full Moon  
    // 0.75 = Last Quarter (waning)
    // Each of 8 phases = 0.125 wide
    
    const adjustedPhase = (phase % 1 + 1) % 1; // Normalize to 0-1
    
    console.log('🌙 Moon Phase Debug:', {
      rawPhase: phase,
      adjustedPhase: adjustedPhase.toFixed(4),
      rangeCheck: {
        'New Moon (0.00-0.0625)': adjustedPhase < 0.0625,
        'Waxing Crescent (0.0625-0.1875)': adjustedPhase >= 0.0625 && adjustedPhase < 0.1875,
        'First Quarter (0.1875-0.3125)': adjustedPhase >= 0.1875 && adjustedPhase < 0.3125,
        'Waxing Gibbous (0.3125-0.4375)': adjustedPhase >= 0.3125 && adjustedPhase < 0.4375,
        'Full Moon (0.4375-0.5625)': adjustedPhase >= 0.4375 && adjustedPhase < 0.5625,
        'Waning Gibbous (0.5625-0.6875)': adjustedPhase >= 0.5625 && adjustedPhase < 0.6875,
        'Last Quarter (0.6875-0.8125)': adjustedPhase >= 0.6875 && adjustedPhase < 0.8125,
        'Waning Crescent (0.8125-1.00)': adjustedPhase >= 0.8125
      }
    });
    
    if (adjustedPhase < 0.0625) return 'New Moon';
    if (adjustedPhase < 0.1875) return 'Waxing Crescent';
    if (adjustedPhase < 0.3125) return 'First Quarter';
    if (adjustedPhase < 0.4375) return 'Waxing Gibbous';
    if (adjustedPhase < 0.5625) return 'Full Moon';
    if (adjustedPhase < 0.6875) return 'Waning Gibbous';
    if (adjustedPhase < 0.8125) return 'Last Quarter';
    return 'Waning Crescent'; // 0.8125-1.0
  };

  const getWindDirection = (degrees) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  };

  const loadCatchesFromFirebase = async (userId) => {
    try {
      initFirebase();
      const q = query(collection(db, 'catches'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ ...doc.data(), firebaseId: doc.id })).sort((a, b) => b.id - a.id);
      setCatches(data);
      setSyncStatus('✓ Synced');
    } catch (error) {
      console.log('Load error:', error);
      setSyncStatus('⚠ Sync failed');
    }
    setIsLoading(false);
  };

  const saveCatchToFirebase = async (catchData) => {
    if (!user) {
      setSyncStatus('⚠ Not signed in');
      return 'local_' + Date.now();
    }
    try {
      initFirebase();
      const docRef = await addDoc(collection(db, 'catches'), {
        ...catchData,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      setSyncStatus('✓ Synced to cloud');
      setTimeout(() => setSyncStatus(''), 3000);
      return docRef.id;
    } catch (error) {
      console.log('Save error:', error.code, error.message);
      setSyncStatus('✓ Saved locally (offline)');
      setTimeout(() => setSyncStatus(''), 3000);
      // Save to localStorage as backup
      try {
        const localCatches = JSON.parse(localStorage.getItem('fishingCatches') || '[]');
        localCatches.push({ ...catchData, id: 'local_' + Date.now() });
        localStorage.setItem('fishingCatches', JSON.stringify(localCatches));
      } catch (e) {
        console.log('localStorage error:', e);
      }
      return 'local_' + Date.now();
    }
  };

  // Load catches from localStorage on mount
  useEffect(() => {
    if (user && firebaseReady) {
      try {
        const localCatches = JSON.parse(localStorage.getItem('fishingCatches') || '[]');
        if (localCatches.length > 0) {
          setCatches(prev => [...localCatches, ...prev]);
          localStorage.removeItem('fishingCatches'); // Clear after loading
        }
      } catch (e) {
        console.log('Error loading local catches:', e);
      }
    }
  }, [user, firebaseReady]);

  const deleteCatchFromFirebase = async (firebaseId) => {
    if (!user) return;
    try {
      initFirebase();
      await deleteDoc(doc(db, 'catches', firebaseId));
      setSyncStatus('✓ Synced');
    } catch (error) {
      console.log('Delete error:', error);
      setSyncStatus('⚠ Sync failed');
    }
  };

  const signInWithGoogle = async () => {
    try {
      initFirebase();
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      loadCatchesFromFirebase(result.user.uid);
    } catch (error) {
      console.log('Sign in error:', error);
      alert('Sign in failed. Please try again.');
    }
  };

  const signOutUser = async () => {
    try {
      initFirebase();
      await signOut(auth);
      setUser(null);
      setCatches([]);
    } catch (error) {
      console.log('Sign out error:', error);
    }
  };

  const handleImageUpload = (e, imageType) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [imageType]: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newCatch = { id: Date.now(), ...formData };
    
    if (user) {
      // Save to Firebase
      const firebaseId = await saveCatchToFirebase(newCatch);
      if (firebaseId) {
        newCatch.firebaseId = firebaseId;
      }
    }
    
    setCatches(prev => [newCatch, ...prev]);
    resetForm();
    setShowForm(false);
  };

  const resetForm = () => {
    setFormData({
      fishImage: null,
      lureImage: null,
      lureName: '',
      lureColor: '',
      lureSize: '',
      lureType: '',
      fishSpecies: '',
      weight: '',
      length: '',
      time: new Date().toTimeString().slice(0, 5),
      date: new Date().toISOString().split('T')[0],
      latitude: userLocation?.latitude.toString() || '',
      longitude: userLocation?.longitude.toString() || '',
      waterTemp: '',
      depth: '',
      weatherTemp: weatherData?.temperature.toString() || '',
      uvIndex: '',
      cloudCover: weatherData?.cloudCover.toString() || '',
      windSpeed: weatherData?.windSpeed.toString() || '',
      windDirection: weatherData?.windDirection || '',
      barometricPressure: weatherData?.pressure.toString() || '',
      moonPhase: weatherData?.moonPhaseName || '',
      coverType: '',
      notes: ''
    });
  };

  const deleteCatch = async (id, firebaseId) => {
    if (firebaseId && user) {
      await deleteCatchFromFirebase(firebaseId);
    }
    setCatches(prev => prev.filter(c => c.id !== id));
  };

  const exportData = () => {
    const dataStr = JSON.stringify(catches, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fishing-log-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        
        for (const c of imported) {
          if (user) {
            const firebaseId = await saveCatchToFirebase(c);
            if (firebaseId) c.firebaseId = firebaseId;
          }
        }
        setCatches(imported.sort((a, b) => b.id - a.id));
        alert('Data imported successfully!');
      } catch (error) {
        alert('Error importing data');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyFilters = (list) => {
    return list.filter(c => {
      if (filters.species && !c.fishSpecies.toLowerCase().includes(filters.species.toLowerCase())) return false;
      if (filters.minWeight && parseFloat(c.weight) < parseFloat(filters.minWeight)) return false;
      if (filters.maxWeight && parseFloat(c.weight) > parseFloat(filters.maxWeight)) return false;
      if (filters.minLength && parseFloat(c.length) < parseFloat(filters.minLength)) return false;
      if (filters.maxLength && parseFloat(c.length) > parseFloat(filters.maxLength)) return false;
      if (filters.lureType && !c.lureType.toLowerCase().includes(filters.lureType.toLowerCase())) return false;
      if (filters.lureName && !c.lureName.toLowerCase().includes(filters.lureName.toLowerCase())) return false;
      if (filters.minWaterTemp && parseFloat(c.waterTemp) < parseFloat(filters.minWaterTemp)) return false;
      if (filters.maxWaterTemp && parseFloat(c.waterTemp) > parseFloat(filters.maxWaterTemp)) return false;
      if (filters.minDepth && parseFloat(c.depth) < parseFloat(filters.minDepth)) return false;
      if (filters.maxDepth && parseFloat(c.depth) > parseFloat(filters.maxDepth)) return false;
      if (filters.coverType && !c.coverType.toLowerCase().includes(filters.coverType.toLowerCase())) return false;
      if (filters.minAirTemp && parseFloat(c.weatherTemp) < parseFloat(filters.minAirTemp)) return false;
      if (filters.maxAirTemp && parseFloat(c.weatherTemp) > parseFloat(filters.maxAirTemp)) return false;
      return true;
    });
  };

  const filteredCatches = applyFilters(catches);

  const getRecommendations = () => {
    if (catches.length < 3) return null;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentHour = now.getHours();
    const currentTemp = weatherData?.temperature || null;
    const currentMoonPhase = weatherData?.moonPhaseName || null;
    
    const scored = catches.map(c => {
      let score = 100;
      const cDate = new Date(c.date);
      const monthDiff = Math.abs(cDate.getMonth() - currentMonth);
      score -= monthDiff * 20;
      
      if (c.time) {
        const [h] = c.time.split(':').map(Number);
        score -= Math.abs(h - currentHour) * 8;
      }
      if (currentTemp && c.weatherTemp) {
        score -= Math.abs(parseFloat(c.weatherTemp) - currentTemp) * 3;
      }
      if (c.windSpeed && weatherData?.windSpeed) {
        score -= Math.abs(parseFloat(c.windSpeed) - weatherData.windSpeed) * 4;
      }
      if (currentMoonPhase && c.moonPhase) {
        score -= (currentMoonPhase === c.moonPhase ? 0 : 10);
      }
      if (c.cloudCover && weatherData?.cloudCover !== undefined) {
        score -= Math.abs(parseFloat(c.cloudCover) - weatherData.cloudCover) * 2;
      }
      
      return { ...c, matchScore: Math.max(0, score) };
    });

    const topMatches = scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5).filter(c => c.matchScore >= 40);
    if (topMatches.length === 0) return null;

    const recs = { 
      bestLures: {}, 
      bestLureTypes: {},
      bestLureColors: {},
      bestSpecies: {}, 
      bestCoverTypes: {}, 
      avgWaterTemp: 0, 
      avgDepth: 0,
      depthRange: { min: Infinity, max: -Infinity },
      matches: topMatches.length 
    };
    
    topMatches.forEach(c => {
      if (c.lureName) {
        const key = `${c.lureName} (${c.lureColor})`;
        recs.bestLures[key] = (recs.bestLures[key] || 0) + 1;
      }
      if (c.lureType) {
        recs.bestLureTypes[c.lureType] = (recs.bestLureTypes[c.lureType] || 0) + 1;
      }
      if (c.lureColor) {
        recs.bestLureColors[c.lureColor] = (recs.bestLureColors[c.lureColor] || 0) + 1;
      }
      if (c.fishSpecies) recs.bestSpecies[c.fishSpecies] = (recs.bestSpecies[c.fishSpecies] || 0) + 1;
      if (c.coverType) recs.bestCoverTypes[c.coverType] = (recs.bestCoverTypes[c.coverType] || 0) + 1;
      if (c.waterTemp) recs.avgWaterTemp += parseFloat(c.waterTemp);
      if (c.depth) {
        const depth = parseFloat(c.depth);
        recs.avgDepth += depth;
        recs.depthRange.min = Math.min(recs.depthRange.min, depth);
        recs.depthRange.max = Math.max(recs.depthRange.max, depth);
      }
    });

    // Count how many catches actually have waterTemp and depth values
    const catchesWithWaterTemp = topMatches.filter(c => c.waterTemp).length;
    const catchesWithDepth = topMatches.filter(c => c.depth).length;

    recs.avgWaterTemp = catchesWithWaterTemp > 0 ? (recs.avgWaterTemp / catchesWithWaterTemp).toFixed(1) : 0;
    recs.avgDepth = catchesWithDepth > 0 ? (recs.avgDepth / catchesWithDepth).toFixed(1) : 0;
    if (recs.depthRange.min === Infinity) recs.depthRange = null;
    return recs;
  };

  const recommendations = getRecommendations();

  const getCatchStats = () => {
    if (filteredCatches.length === 0) return null;
    const totalWeight = filteredCatches.reduce((sum, c) => sum + (parseFloat(c.weight) || 0), 0);
    const species = filteredCatches.reduce((acc, c) => {
      if (c.fishSpecies) acc[c.fishSpecies] = (acc[c.fishSpecies] || 0) + 1;
      return acc;
    }, {});
    return { total: filteredCatches.length, totalWeight: totalWeight.toFixed(1), avgWeight: (totalWeight / filteredCatches.length).toFixed(2), species };
  };

  const stats = getCatchStats();

  return (
    <div style={{ background: 'linear-gradient(135deg, #0f4c27 0%, #1a5c3a 50%, #0d3d20 100%)' }} className="min-h-screen">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Montserrat:wght@500;700&display=swap');
        * { box-sizing: border-box; }
        body { font-family: 'Merriweather', serif; margin: 0; }
        .app-wrapper { min-height: 100vh; display: flex; flex-direction: column; }
        .header-bar { background: rgba(0,0,0,0.3); backdrop-filter: blur(10px); border-bottom: 2px solid rgba(46,204,113,0.3); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        .header-left { display: flex; align-items: center; gap: 1rem; }
        .header-right { display: flex; gap: 1rem; align-items: center; }
        .auth-btn { background: #2ecc71; color: #fff; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-family: 'Montserrat', sans-serif; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: all 0.3s; }
        .auth-btn:hover { background: #27ae60; transform: translateY(-2px); }
        .auth-btn.signout { background: #e74c3c; }
        .auth-btn.signout:hover { background: #c0392b; }
        .sync-status { color: #2ecc71; font-size: 0.9rem; font-family: 'Montserrat', sans-serif; display: flex; align-items: center; gap: 0.4rem; }
        .user-info { color: #fef5e7; font-size: 0.9rem; }
        .tab-nav { background: rgba(0,0,0,0.2); display: flex; gap: 0; border-bottom: 2px solid rgba(46,204,113,0.2); }
        .tab-button { flex: 1; padding: 1rem; background: none; border: none; color: #fef5e7; font-family: 'Montserrat',sans-serif; font-weight: 600; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.3s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
        .tab-button:hover { background: rgba(46,204,113,0.1); }
        .tab-button.active { border-bottom-color: #2ecc71; background: rgba(46,204,113,0.15); }
        .content-area { flex: 1; overflow-y: auto; padding: 2rem; }
        .app-container { max-width: 1400px; margin: 0 auto; }
        .header { color: #fef5e7; margin-bottom: 2rem; }
        .header h1 { font-family: 'Montserrat',sans-serif; font-size: 2.5rem; margin: 0; font-weight: 700; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
        .header p { font-size: 1rem; opacity: 0.9; margin: 0.5rem 0 0 0; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: rgba(254,245,231,0.1); backdrop-filter: blur(10px); border: 1px solid rgba(254,245,231,0.2); padding: 1.5rem; border-radius: 12px; color: #fef5e7; }
        .stat-label { font-size: 0.85rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; font-family: 'Montserrat',sans-serif; font-weight: 500; }
        .stat-value { font-size: 2rem; font-weight: 700; margin-top: 0.5rem; }
        .action-bar { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
        .btn-primary { background: #2ecc71; color: #fff; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-family: 'Montserrat',sans-serif; font-weight: 700; cursor: pointer; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; transition: all 0.3s; box-shadow: 0 4px 15px rgba(46,204,113,0.3); }
        .btn-primary:hover { background: #27ae60; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(46,204,113,0.4); }
        .btn-secondary { background: #3498db; color: #fff; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-family: 'Montserrat',sans-serif; font-weight: 700; cursor: pointer; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; transition: all 0.3s; }
        .btn-secondary:hover { background: #2980b9; transform: translateY(-2px); }
        .btn-danger { background: #95a5a6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; transition: all 0.3s; }
        .btn-danger:hover { background: #7f8c8d; }
        .form-container { background: rgba(254,245,231,0.95); padding: 2rem; border-radius: 16px; margin-bottom: 2rem; }
        .form-section { margin-bottom: 2rem; }
        .section-title { font-family: 'Montserrat',sans-serif; font-size: 1.2rem; font-weight: 700; color: #0f4c27; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #2ecc71; display: flex; align-items: center; gap: 0.5rem; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
        .form-group { display: flex; flex-direction: column; }
        label { font-family: 'Montserrat',sans-serif; font-weight: 600; color: #0f4c27; font-size: 0.9rem; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.5px; }
        input[type="text"], input[type="number"], input[type="date"], input[type="time"], input[type="file"], select, textarea { padding: 0.75rem; border: 2px solid #e0e0e0; border-radius: 6px; font-family: 'Merriweather',serif; font-size: 0.95rem; transition: all 0.3s; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: #2ecc71; box-shadow: 0 0 0 3px rgba(46,204,113,0.1); }
        textarea { resize: vertical; min-height: 80px; }
        .image-upload { display: flex; flex-direction: column; gap: 0.75rem; }
        .image-preview { width: 150px; height: 150px; border-radius: 8px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px dashed #2ecc71; }
        .image-preview img { width: 100%; height: 100%; object-fit: cover; }
        .btn-group { display: flex; gap: 1rem; margin-top: 2rem; justify-content: flex-end; }
        .filter-panel { background: rgba(254,245,231,0.95); padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; }
        .filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
        .filter-group { display: flex; flex-direction: column; }
        .catches-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
        .catch-card { background: rgba(254,245,231,0.95); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: all 0.3s; }
        .catch-card:hover { transform: translateY(-8px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
        .catch-header { background: linear-gradient(135deg, #2ecc71, #27ae60); padding: 1rem; color: white; display: flex; justify-content: space-between; align-items: center; }
        .catch-title { font-family: 'Montserrat',sans-serif; font-weight: 700; font-size: 1.1rem; }
        .catch-images { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 1rem; background: #f8f8f8; }
        .catch-image { width: 100%; height: 120px; background: #e0e0e0; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: #999; }
        .catch-image img { width: 100%; height: 100%; object-fit: cover; }
        .catch-details { padding: 1rem; max-height: 0; overflow: hidden; transition: max-height 0.4s; background: #fef5e7; }
        .catch-details.expanded { max-height: 1500px; }
        .detail-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; font-size: 0.9rem; }
        .detail-item { display: flex; flex-direction: column; }
        .detail-label { font-family: 'Montserrat',sans-serif; font-weight: 600; color: #0f4c27; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem; }
        .detail-value { color: #333; font-size: 0.95rem; }
        .delete-btn { background: #e74c3c; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; gap: 0.4rem; font-family: 'Montserrat',sans-serif; font-weight: 600; }
        .delete-btn:hover { background: #c0392b; }
        .expand-btn { background: none; border: none; color: white; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; transition: transform 0.3s; }
        .expand-btn.expanded { transform: rotate(180deg); }
        .no-catches { text-align: center; padding: 3rem 1rem; color: #fef5e7; }
        .no-catches p { font-size: 1.2rem; opacity: 0.8; }
        .login-prompt { text-align: center; padding: 3rem 1rem; color: #fef5e7; }
        .rec-panel { background: linear-gradient(135deg, rgba(46,204,113,0.15), rgba(52,152,219,0.15)); border: 2px solid rgba(46,204,113,0.4); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
        .rec-title { font-family: 'Montserrat',sans-serif; font-size: 1.3rem; font-weight: 700; color: #2ecc71; }
        .rec-card { background: rgba(254,245,231,0.1); border: 1px solid rgba(46,204,113,0.3); border-radius: 10px; padding: 1.25rem; }
        .rec-item { background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 6px; margin-bottom: 0.75rem; border-left: 3px solid #2ecc71; color: #fef5e7; font-size: 0.9rem; }
        @media (max-width: 768px) { .header h1 { font-size: 1.8rem; } .form-grid { grid-template-columns: 1fr; } .catch-images { grid-template-columns: 1fr; } .detail-row { grid-template-columns: 1fr; } .header-bar { flex-direction: column; gap: 1rem; } }
      `}</style>

      <div className="app-wrapper">
        <div className="header-bar">
          <div className="header-left">
            <div style={{ fontSize: '1.5rem' }}>🎣</div>
            <div style={{ color: '#fef5e7', fontFamily: 'Montserrat, sans-serif', fontWeight: '700' }}>Fishing Log</div>
          </div>
          <div className="header-right">
            {firebaseReady && (
              <>
                {syncStatus && <div className="sync-status"><Cloud size={16} /> {syncStatus}</div>}
                {user ? (
                  <>
                    <div className="user-info">Signed in as {user.displayName || user.email}</div>
                    <button className="auth-btn signout" onClick={signOutUser}><LogOut size={16} /> Sign Out</button>
                  </>
                ) : (
                  <button className="auth-btn" onClick={signInWithGoogle}><LogIn size={16} /> Sign in with Google</button>
                )}
              </>
            )}
          </div>
        </div>

        {!firebaseReady ? (
          <div className="content-area">
            <div className="app-container">
              <div className="no-catches" style={{ paddingTop: '5rem' }}>
                <p>⏳ Initializing...</p>
              </div>
            </div>
          </div>
        ) : !user ? (
          <div className="content-area">
            <div className="app-container">
              <div className="login-prompt">
                <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>📱 Cloud Sync Enabled</h2>
                <p style={{ fontSize: '1.1rem', opacity: 0.9, marginBottom: '2rem' }}>Sign in with your Google account to sync your catches across all your devices</p>
                <button className="auth-btn" onClick={signInWithGoogle} style={{ margin: '0 auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LogIn size={20} /> Sign in with Google
                </button>
                <p style={{ marginTop: '2rem', opacity: 0.7, fontSize: '0.9rem' }}>Your data will be securely stored in the cloud and synced automatically across devices</p>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="content-area">
            <div className="app-container">
              <div className="no-catches" style={{ paddingTop: '5rem' }}>
                <p>⏳ Loading your fishing data...</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="tab-nav">
              <button className={`tab-button ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>
                <Clock size={20} /> Catch Log
              </button>
              <button className={`tab-button ${activeTab === 'smart' ? 'active' : ''}`} onClick={() => setActiveTab('smart')}>
                💡 Smart Catch
              </button>
              <button className={`tab-button ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>
                <Map size={20} /> Interactive Map
              </button>
            </div>

            <div className="content-area">
              <div className="app-container">
                {activeTab === 'log' && (
                  <>
                    <div className="header">
                      <h1>🎣 Fishing Catch Log</h1>
                      <p>Track your catches and discover patterns</p>
                    </div>

                    {stats && (
                      <div className="stats-grid">
                        <div className="stat-card"><div className="stat-label">Total Catches</div><div className="stat-value">{stats.total}</div></div>
                        <div className="stat-card"><div className="stat-label">Total Weight</div><div className="stat-value">{stats.totalWeight} lbs</div></div>
                        <div className="stat-card"><div className="stat-label">Average Weight</div><div className="stat-value">{stats.avgWeight} lbs</div></div>
                        {Object.keys(stats.species).length > 0 && <div className="stat-card"><div className="stat-label">Top Species</div><div className="stat-value">{Object.entries(stats.species).sort(([,a],[,b]) => b-a)[0][0]}</div></div>}
                      </div>
                    )}

                    <div className="action-bar">
                      <button className="btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={20} /> {showForm ? 'Cancel' : 'Log New Catch'}</button>
                      <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}><Filter size={20} /> {showFilters ? 'Hide Filters' : 'Show Filters'}</button>
                      <button className="btn-secondary" onClick={exportData}><Download size={20} /> Export Data</button>
                      <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}><Upload size={20} /> Import Data</button>
                      <input ref={fileInputRef} type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
                    </div>

                    {showFilters && (
                      <div className="filter-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: '#0f4c27', fontSize: '1.1rem' }}>Filter Catches</div>
                          <button className="btn-danger" onClick={() => setFilters({ species: '', minWeight: '', maxWeight: '', minLength: '', maxLength: '', lureType: '', lureName: '', minWaterTemp: '', maxWaterTemp: '', minDepth: '', maxDepth: '', coverType: '', minAirTemp: '', maxAirTemp: '' })}>Clear</button>
                        </div>
                        <div className="filter-grid">
                          <div className="filter-group"><label>Species</label><input type="text" name="species" value={filters.species} onChange={handleFilterChange} /></div>
                          <div className="filter-group"><label>Min Weight (lbs)</label><input type="number" name="minWeight" value={filters.minWeight} onChange={handleFilterChange} step="0.1" /></div>
                          <div className="filter-group"><label>Max Weight (lbs)</label><input type="number" name="maxWeight" value={filters.maxWeight} onChange={handleFilterChange} step="0.1" /></div>
                          <div className="filter-group"><label>Min Length (in)</label><input type="number" name="minLength" value={filters.minLength} onChange={handleFilterChange} step="0.1" /></div>
                          <div className="filter-group"><label>Max Length (in)</label><input type="number" name="maxLength" value={filters.maxLength} onChange={handleFilterChange} step="0.1" /></div>
                          <div className="filter-group"><label>Lure Type</label><input type="text" name="lureType" value={filters.lureType} onChange={handleFilterChange} /></div>
                          <div className="filter-group"><label>Lure Name</label><input type="text" name="lureName" value={filters.lureName} onChange={handleFilterChange} /></div>
                          <div className="filter-group"><label>Min Water Temp (°F)</label><input type="number" name="minWaterTemp" value={filters.minWaterTemp} onChange={handleFilterChange} step="0.1" /></div>
                          <div className="filter-group"><label>Max Water Temp (°F)</label><input type="number" name="maxWaterTemp" value={filters.maxWaterTemp} onChange={handleFilterChange} step="0.1" /></div>
                          <div className="filter-group"><label>Min Depth (ft)</label><input type="number" name="minDepth" value={filters.minDepth} onChange={handleFilterChange} step="0.5" /></div>
                          <div className="filter-group"><label>Max Depth (ft)</label><input type="number" name="maxDepth" value={filters.maxDepth} onChange={handleFilterChange} step="0.5" /></div>
                          <div className="filter-group"><label>Cover Type</label><input type="text" name="coverType" value={filters.coverType} onChange={handleFilterChange} /></div>
                          <div className="filter-group"><label>Min Air Temp (°F)</label><input type="number" name="minAirTemp" value={filters.minAirTemp} onChange={handleFilterChange} step="0.1" /></div>
                          <div className="filter-group"><label>Max Air Temp (°F)</label><input type="number" name="maxAirTemp" value={filters.maxAirTemp} onChange={handleFilterChange} step="0.1" /></div>
                        </div>
                      </div>
                    )}

                    {showForm && (
                      <form onSubmit={handleSubmit} className="form-container">
                        <div className="form-section">
                          <div className="section-title"><Camera size={20} /> Fish & Lure Photos</div>
                          <div className="form-grid">
                            <div className="form-group">
                              <label>Fish Photo</label>
                              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'fishImage')} />
                              {formData.fishImage && <div className="image-preview"><img src={formData.fishImage} alt="Fish" /></div>}
                            </div>
                            <div className="form-group">
                              <label>Lure Photo</label>
                              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'lureImage')} />
                              {formData.lureImage && <div className="image-preview"><img src={formData.lureImage} alt="Lure" /></div>}
                            </div>
                          </div>
                        </div>

                        <div className="form-section">
                          <div className="section-title"><Droplets size={20} /> Fish Details</div>
                          <div className="form-grid">
                            <div className="form-group"><label>Species</label><input type="text" name="fishSpecies" value={formData.fishSpecies} onChange={handleInputChange} placeholder="e.g., Largemouth Bass" /></div>
                            <div className="form-group"><label>Weight (lbs)</label><input type="number" name="weight" value={formData.weight} onChange={handleInputChange} placeholder="e.g., 4.5" step="0.1" /></div>
                            <div className="form-group"><label>Length (inches)</label><input type="number" name="length" value={formData.length} onChange={handleInputChange} placeholder="e.g., 16.5" step="0.1" /></div>
                          </div>
                        </div>

                        <div className="form-section">
                          <div className="section-title"><MapPin size={20} /> Lure Information</div>
                          <div className="form-grid">
                            <div className="form-group"><label>Lure Name/Brand</label><input type="text" name="lureName" value={formData.lureName} onChange={handleInputChange} placeholder="e.g., Rapala" /></div>
                            <div className="form-group"><label>Type</label><input type="text" name="lureType" value={formData.lureType} onChange={handleInputChange} placeholder="e.g., Crankbait" /></div>
                            <div className="form-group"><label>Color</label><input type="text" name="lureColor" value={formData.lureColor} onChange={handleInputChange} placeholder="e.g., Chrome/Black" /></div>
                          </div>
                        </div>

                        <div className="form-section">
                          <div className="section-title"><Clock size={20} /> Date & Time</div>
                          <div className="form-grid">
                            <div className="form-group"><label>Date</label><input type="date" name="date" value={formData.date} onChange={handleInputChange} /></div>
                            <div className="form-group"><label>Time</label><input type="time" name="time" value={formData.time} onChange={handleInputChange} /></div>
                          </div>
                        </div>

                        <div className="form-section">
                          <div className="section-title"><MapPin size={20} /> Location & Depth</div>
                          <div className="form-grid">
                            <div className="form-group"><label>Latitude</label><input type="number" name="latitude" value={formData.latitude} onChange={handleInputChange} step="0.00001" placeholder="Auto-populated (editable)" /></div>
                            <div className="form-group"><label>Longitude</label><input type="number" name="longitude" value={formData.longitude} onChange={handleInputChange} step="0.00001" placeholder="Auto-populated (editable)" /></div>
                            <div className="form-group"><label>Water Depth (ft)</label><input type="number" name="depth" value={formData.depth} onChange={handleInputChange} step="0.5" /></div>
                            <div className="form-group"><label>Water Temp (°F)</label><input type="number" name="waterTemp" value={formData.waterTemp} onChange={handleInputChange} step="0.1" /></div>
                          </div>
                        </div>

                        <div className="form-section">
                          <div className="section-title"><MapPin size={20} /> Cover & Structure</div>
                          <div className="form-grid">
                            <div className="form-group"><label>Cover Type</label><input type="text" name="coverType" value={formData.coverType} onChange={handleInputChange} placeholder="e.g., Weeds, Rocks" /></div>
                          </div>
                        </div>

                        <div className="form-section">
                          <div className="section-title"><Wind size={20} /> Weather (All Editable)</div>
                          <div className="form-grid">
                            <div className="form-group"><label>Air Temp (°F)</label><input type="number" name="weatherTemp" value={formData.weatherTemp} onChange={handleInputChange} step="0.1" placeholder="Auto-populated (editable)" /></div>
                            <div className="form-group"><label>Wind Speed (mph)</label><input type="number" name="windSpeed" value={formData.windSpeed} onChange={handleInputChange} step="0.5" placeholder="Auto-populated (editable)" /></div>
                            <div className="form-group"><label>Wind Direction</label><input type="text" name="windDirection" value={formData.windDirection} onChange={handleInputChange} placeholder="e.g., NW (auto-populated, editable)" /></div>
                            <div className="form-group"><label>Cloud Cover (%)</label><input type="number" name="cloudCover" value={formData.cloudCover} onChange={handleInputChange} min="0" max="100" step="10" placeholder="Auto-populated (editable)" /></div>
                            <div className="form-group"><label>UV Index</label><input type="number" name="uvIndex" value={formData.uvIndex} onChange={handleInputChange} step="0.5" /></div>
                            <div className="form-group"><label>Barometric Pressure (mb)</label><input type="number" name="barometricPressure" value={formData.barometricPressure} onChange={handleInputChange} step="0.1" placeholder="Auto-populated (editable)" /></div>
                            <div className="form-group"><label>Moon Phase</label><select name="moonPhase" value={formData.moonPhase} onChange={handleInputChange} style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #2ecc71', backgroundColor: '#0f4c27', color: '#fef5e7', fontSize: '1rem', cursor: 'pointer' }}>
                              <option value="">— Select or auto-populated —</option>
                              <option value="New Moon">🌑 New Moon</option>
                              <option value="Waxing Crescent">🌒 Waxing Crescent</option>
                              <option value="First Quarter">🌓 First Quarter</option>
                              <option value="Waxing Gibbous">🌔 Waxing Gibbous</option>
                              <option value="Full Moon">🌕 Full Moon</option>
                              <option value="Waning Gibbous">🌖 Waning Gibbous</option>
                              <option value="Last Quarter">🌗 Last Quarter</option>
                              <option value="Waning Crescent">🌘 Waning Crescent</option>
                            </select></div>
                          </div>
                        </div>

                        <div className="form-section">
                          <div className="section-title">Notes</div>
                          <textarea name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Any other details..." />
                        </div>

                        <div className="btn-group">
                          <button type="button" className="btn-danger" onClick={() => setShowForm(false)}>Cancel</button>
                          <button type="submit" className="btn-primary">Save Catch</button>
                        </div>
                      </form>
                    )}

                    {filteredCatches.length > 0 ? (
                      <div className="catches-grid">
                        {filteredCatches.map((c) => (
                          <div key={c.id} className="catch-card">
                            <div className="catch-header">
                              <div>
                                <div className="catch-title">{c.fishSpecies || 'Unknown'} · {c.weight ? `${c.weight} lbs` : 'N/A'}</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{c.date} {c.time}</div>
                              </div>
                              <button className="expand-btn" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                                <ChevronDown size={20} />
                              </button>
                            </div>

                            {(c.fishImage || c.lureImage) && (
                              <div className="catch-images">
                                {c.fishImage ? <div className="catch-image"><img src={c.fishImage} alt="Fish" /></div> : <div className="catch-image">No Fish Photo</div>}
                                {c.lureImage ? <div className="catch-image"><img src={c.lureImage} alt="Lure" /></div> : <div className="catch-image">No Lure Photo</div>}
                              </div>
                            )}

                            <div className={`catch-details ${expandedId === c.id ? 'expanded' : ''}`}>
                              {c.lureName && <div className="detail-row"><div className="detail-item"><div className="detail-label">Lure</div><div className="detail-value">{c.lureName}</div></div><div className="detail-item"><div className="detail-label">Type</div><div className="detail-value">{c.lureType}</div></div></div>}
                              {c.length && <div className="detail-row"><div className="detail-item"><div className="detail-label">Length</div><div className="detail-value">{c.length} in</div></div><div className="detail-item"><div className="detail-label">Water Temp</div><div className="detail-value">{c.waterTemp}°F</div></div></div>}
                              {c.depth && <div className="detail-row"><div className="detail-item"><div className="detail-label">Depth</div><div className="detail-value">{c.depth} ft</div></div><div className="detail-item"><div className="detail-label">Location</div><div className="detail-value">{parseFloat(c.latitude)?.toFixed(4)}, {parseFloat(c.longitude)?.toFixed(4)}</div></div></div>}
                              
                              {/* View on Map Button */}
                              {c.latitude && c.longitude && (
                                <div style={{ marginBottom: '1rem' }}>
                                  <button 
                                    onClick={() => {
                                      setSelectedCatchForMap(c);
                                      setActiveTab('map');
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '10px 15px',
                                      background: '#2ecc71',
                                      color: '#0f4c27',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '1rem',
                                      fontWeight: 'bold',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = '#27ae60'}
                                    onMouseLeave={(e) => e.target.style.background = '#2ecc71'}
                                  >
                                    🗺️ View on Map
                                  </button>
                                </div>
                              )}
                              
                              {c.coverType && <div className="detail-row"><div className="detail-item"><div className="detail-label">Cover</div><div className="detail-value">{c.coverType}</div></div></div>}
                              {c.weatherTemp && <div className="detail-row"><div className="detail-item"><div className="detail-label">Air Temp</div><div className="detail-value">{c.weatherTemp}°F</div></div><div className="detail-item"><div className="detail-label">Wind</div><div className="detail-value">{c.windSpeed} mph {c.windDirection}</div></div></div>}
                              {c.moonPhase && <div className="detail-row"><div className="detail-item"><div className="detail-label">Moon Phase</div><div className="detail-value">🌙 {c.moonPhase}</div></div></div>}
                              {c.notes && <div style={{ marginBottom: '1rem' }}><div className="detail-label">Notes</div><div className="detail-value">{c.notes}</div></div>}
                              <button className="delete-btn" onClick={() => deleteCatch(c.id, c.firebaseId)}><Trash2 size={16} /> Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      !showForm && <div className="no-catches"><p>🎣 {catches.length === 0 ? 'No catches yet' : 'No catches match filters'}</p></div>
                    )}
                  </>
                )}

                {activeTab === 'map' && (
                  <>
                    <div className="header">
                      <h1>🗺️ Interactive Catch Map</h1>
                      <p>Zoom and pan to explore where you caught fish</p>
                    </div>

                    {catches.length > 0 ? (
                      <div style={{ width: '100%', height: '600px', borderRadius: '12px', overflow: 'hidden', marginBottom: '2rem', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
                        <MapContainer 
                            ref={mapRef}
                            center={selectedCatchForMap ? [parseFloat(selectedCatchForMap.latitude), parseFloat(selectedCatchForMap.longitude)] : [parseFloat(catches[0].latitude) || 30.2672, parseFloat(catches[0].longitude) || -97.7431]} 
                            zoom={selectedCatchForMap ? 16 : 13} 
                            style={{ height: '100%', width: '100%' }}
                          >
                            {/* Satellite base layer */}
                            <TileLayer
                              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                              attribution='&copy; Esri'
                            />
                            
                            {/* Labels and boundaries overlay */}
                            <TileLayer
                              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                              attribution='&copy; Esri'
                              opacity={0.7}
                            />
                            {catches.map((c, idx) => {
                              const lat = parseFloat(c.latitude);
                              const lng = parseFloat(c.longitude);
                              if (!lat || !lng) return null;
                              const isSelected = selectedCatchForMap?.id === c.id;
                              
                              return (
                                <Marker 
                                  key={c.id} 
                                  position={[lat, lng]}
                                  icon={L.icon({
                                    // Simple circle icon for markers
                                    iconUrl: isSelected ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOCIgZmlsbD0iI0ZGQjcwMCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=' : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMCIgaGVpZ2h0PSIzMCIgdmlld0JveD0iMCAwIDMwIDMwIj48Y2lyY2xlIGN4PSIxNSIgY3k9IjE1IiByPSIxMyIgZmlsbD0iI0ZGNDIwMCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIvPjwvc3ZnPg==',
                                    iconSize: isSelected ? [40, 40] : [30, 30],
                                    iconAnchor: isSelected ? [20, 20] : [15, 15],
                                    popupAnchor: isSelected ? [0, -20] : [0, -15],
                                    shadowSize: [30, 30],
                                    shadowAnchor: [10, 30]
                                  })}
                                >
                                  <Popup>
                                    <div style={{ fontSize: '12px', width: '200px' }}>
                                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#FF4200' }}>
                                        🎣 {c.fishSpecies || 'Unknown'} - {c.weight || 'N/A'} lbs
                                      </div>
                                      <div style={{ marginBottom: '6px' }}>
                                        <strong>Date:</strong> {c.date} {c.time}
                                      </div>
                                      {c.lureColor && c.lureName && (
                                        <div style={{ marginBottom: '6px' }}>
                                          <strong>Lure:</strong> {c.lureName} ({c.lureColor})
                                        </div>
                                      )}
                                      {c.waterTemp && (
                                        <div style={{ marginBottom: '6px' }}>
                                          <strong>Water Temp:</strong> {c.waterTemp}°F
                                        </div>
                                      )}
                                      {c.depth && (
                                        <div style={{ marginBottom: '6px' }}>
                                          <strong>Depth:</strong> {c.depth} ft
                                        </div>
                                      )}
                                      {c.weatherTemp && (
                                        <div style={{ marginBottom: '6px' }}>
                                          <strong>Air Temp:</strong> {c.weatherTemp}°F
                                        </div>
                                      )}
                                      {c.moonPhase && (
                                        <div style={{ marginBottom: '6px' }}>
                                          <strong>Moon:</strong> 🌙 {c.moonPhase}
                                        </div>
                                      )}
                                      {c.coverType && (
                                        <div>
                                          <strong>Cover:</strong> {c.coverType}
                                        </div>
                                      )}
                                      <button
                                        onClick={() => setSelectedCatchDetails(c)}
                                        style={{
                                          width: '100%',
                                          marginTop: '8px',
                                          padding: '6px',
                                          background: '#FF4200',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '4px',
                                          fontWeight: 'bold',
                                          cursor: 'pointer',
                                          fontSize: '11px'
                                        }}
                                      >
                                        View Full Details
                                      </button>
                                    </div>
                                  </Popup>
                                </Marker>
                              );
                            })}
                          </MapContainer>
                        </div>
                      ) : (
                        <div className="no-catches"><p>No catches logged yet. Log your first catch to see it on the map!</p></div>
                      )}

                    {catches.length > 0 && (
                      <div style={{ marginTop: '2rem' }}>
                        <h3 style={{ color: '#fef5e7', marginBottom: '1rem', fontFamily: 'Montserrat, sans-serif' }}>All Catches</h3>
                        <div className="catches-grid">
                          {catches.map((c, idx) => (
                            <div 
                              key={c.id} 
                              className="catch-card"
                              onClick={() => setSelectedCatchDetails(c)}
                              style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-5px)';
                                e.currentTarget.style.boxShadow = '0 8px 20px rgba(46, 204, 113, 0.3)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            >
                              <div className="catch-header">
                                <div>
                                  <div className="catch-title">#{idx + 1} - {c.fishSpecies}</div>
                                  <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{c.date} {c.time}</div>
                                </div>
                              </div>
                              {(c.fishImage || c.lureImage) && (
                                <div className="catch-images">
                                  {c.fishImage ? <div className="catch-image"><img src={c.fishImage} alt="Fish" /></div> : <div className="catch-image">No Photo</div>}
                                  {c.lureImage ? <div className="catch-image"><img src={c.lureImage} alt="Lure" /></div> : <div className="catch-image">No Photo</div>}
                                </div>
                              )}
                              <div style={{ padding: '1rem', textAlign: 'center', color: '#2ecc71', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                Click to view details
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'smart' && (
                  <>
                    <div className="header">
                      <h1>💡 Smart Catch</h1>
                      <p>Current conditions and personalized recommendations</p>
                    </div>

                    {catches.length < 3 ? (
                      <div className="no-catches"><p>Log at least 3 catches to get personalized recommendations!</p></div>
                    ) : (
                      <>
                        {/* Current Conditions */}
                        <div className="rec-panel">
                          <h2 className="rec-title">🌍 Current Conditions</h2>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                            <div className="rec-card">
                              <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '0.5rem' }}>🌡️ Air Temperature</div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{weatherData?.temperature || '—'}°F</div>
                            </div>
                            <div className="rec-card">
                              <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '0.5rem' }}>💨 Wind Speed</div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{weatherData?.windSpeed?.toFixed(1) || '—'} mph</div>
                            </div>
                            <div className="rec-card">
                              <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '0.5rem' }}>🧭 Wind Direction</div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{weatherData?.windDirection || '—'}</div>
                            </div>
                            <div className="rec-card">
                              <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '0.5rem' }}>☁️ Cloud Cover</div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{weatherData?.cloudCover || '—'}%</div>
                            </div>
                            <div className="rec-card">
                              <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '0.5rem' }}>☀️ UV Index</div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{weatherData?.uvIndex || '—'}</div>
                            </div>
                            <div className="rec-card">
                              <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '0.5rem' }}>🌙 Moon Phase</div>
                              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{weatherData?.moonPhaseName || '—'}</div>
                            </div>
                          </div>
                        </div>

                        {/* Recommendations */}
                        {recommendations && (
                          <div className="rec-panel">
                            <h2 className="rec-title">🎣 Recommendations Based on {recommendations.matches} Similar Catches</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                              {Object.keys(recommendations.bestSpecies).length > 0 && (
                                <div className="rec-card">
                                  <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '1rem' }}>🎣 Target Species</div>
                                  <select 
                                    style={{ 
                                      width: '100%',
                                      padding: '8px 12px', 
                                      borderRadius: '4px', 
                                      border: '1px solid #2ecc71', 
                                      backgroundColor: '#0f4c27', 
                                      color: '#fef5e7', 
                                      fontSize: '1rem', 
                                      cursor: 'pointer',
                                      marginBottom: '0.5rem'
                                    }}
                                    defaultValue="Largemouth Bass"
                                  >
                                    <option value="Largemouth Bass">Largemouth Bass</option>
                                    {Object.keys(recommendations.bestSpecies)
                                      .filter(sp => sp !== 'Largemouth Bass')
                                      .sort((a, b) => recommendations.bestSpecies[b] - recommendations.bestSpecies[a])
                                      .map(sp => (
                                        <option key={sp} value={sp}>{sp}</option>
                                      ))
                                    }
                                  </select>
                                  <div style={{ fontSize: '0.9rem', color: '#ccc' }}>
                                    Based on {Object.entries(recommendations.bestSpecies)
                                      .sort(([,a],[,b]) => b-a)[0][1]}× catches
                                  </div>
                                </div>
                              )}
                              {Object.keys(recommendations.bestLures).length > 0 && (
                                <div className="rec-card">
                                  <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '1rem' }}>🪝 Recommended Lures</div>
                                  {Object.entries(recommendations.bestLures).sort(([,a],[,b]) => b-a).slice(0,3).map(([lure, cnt]) => (
                                    <div key={lure} className="rec-item">{lure} <span style={{ background: '#2ecc71', color: '#0f4c27', padding: '0.2rem 0.5rem', borderRadius: '12px', marginLeft: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold' }}>{cnt}×</span></div>
                                  ))}
                                </div>
                              )}
                              {Object.keys(recommendations.bestLureTypes).length > 0 && (
                                <div className="rec-card">
                                  <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '1rem' }}>📊 Lure Types</div>
                                  {Object.entries(recommendations.bestLureTypes).sort(([,a],[,b]) => b-a).slice(0,3).map(([type, cnt]) => (
                                    <div key={type} className="rec-item">{type} <span style={{ background: '#2ecc71', color: '#0f4c27', padding: '0.2rem 0.5rem', borderRadius: '12px', marginLeft: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold' }}>{cnt}×</span></div>
                                  ))}
                                </div>
                              )}
                              {Object.keys(recommendations.bestLureColors).length > 0 && (
                                <div className="rec-card">
                                  <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '1rem' }}>🎨 Lure Colors</div>
                                  {Object.entries(recommendations.bestLureColors).sort(([,a],[,b]) => b-a).slice(0,3).map(([color, cnt]) => (
                                    <div key={color} className="rec-item">{color} <span style={{ background: '#2ecc71', color: '#0f4c27', padding: '0.2rem 0.5rem', borderRadius: '12px', marginLeft: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold' }}>{cnt}×</span></div>
                                  ))}
                                </div>
                              )}
                              {Object.keys(recommendations.bestCoverTypes).length > 0 && (
                                <div className="rec-card">
                                  <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '1rem' }}>🌿 Cover Types</div>
                                  {Object.entries(recommendations.bestCoverTypes).sort(([,a],[,b]) => b-a).slice(0,3).map(([cover, cnt]) => (
                                    <div key={cover} className="rec-item">{cover} <span style={{ background: '#2ecc71', color: '#0f4c27', padding: '0.2rem 0.5rem', borderRadius: '12px', marginLeft: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold' }}>{cnt}×</span></div>
                                  ))}
                                </div>
                              )}
                              <div className="rec-card">
                                <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '1rem' }}>💧 Water Conditions</div>
                                <div className="rec-item">Water Temp: {recommendations.avgWaterTemp}°F</div>
                                <div className="rec-item">Average Depth: {recommendations.avgDepth} ft</div>
                                {recommendations.depthRange && (
                                  <div className="rec-item">Depth Range: {recommendations.depthRange.min}-{recommendations.depthRange.max} ft</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Full Catch Details Modal */}
        {selectedCatchDetails && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '2rem'
          }}>
            <div style={{
              background: '#0f4c27',
              borderRadius: '12px',
              maxWidth: '800px',
              maxHeight: '90vh',
              overflowY: 'auto',
              width: '100%',
              border: '2px solid #2ecc71',
              padding: '2rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ color: '#2ecc71', margin: 0 }}>🎣 {selectedCatchDetails.fishSpecies}</h2>
                <button
                  onClick={() => setSelectedCatchDetails(null)}
                  style={{
                    background: '#FF4200',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Images */}
              {(selectedCatchDetails.fishImage || selectedCatchDetails.lureImage) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  {selectedCatchDetails.fishImage && (
                    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '2px solid #2ecc71' }}>
                      <img src={selectedCatchDetails.fishImage} alt="Fish" style={{ width: '100%', height: 'auto' }} />
                    </div>
                  )}
                  {selectedCatchDetails.lureImage && (
                    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '2px solid #2ecc71' }}>
                      <img src={selectedCatchDetails.lureImage} alt="Lure" style={{ width: '100%', height: 'auto' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Weight</div>
                  <div style={{ color: '#2ecc71', fontSize: '1.3rem', fontWeight: 'bold' }}>{selectedCatchDetails.weight || '—'} lbs</div>
                </div>
                <div>
                  <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Length</div>
                  <div style={{ color: '#2ecc71', fontSize: '1.3rem', fontWeight: 'bold' }}>{selectedCatchDetails.length || '—'} in</div>
                </div>
                <div>
                  <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Date & Time</div>
                  <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.date} {selectedCatchDetails.time}</div>
                </div>
                <div>
                  <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Location</div>
                  <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{parseFloat(selectedCatchDetails.latitude)?.toFixed(4)}, {parseFloat(selectedCatchDetails.longitude)?.toFixed(4)}</div>
                </div>
                {selectedCatchDetails.lureName && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Lure Name</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.lureName}</div>
                  </div>
                )}
                {selectedCatchDetails.lureType && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Lure Type</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.lureType}</div>
                  </div>
                )}
                {selectedCatchDetails.lureColor && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Lure Color</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.lureColor}</div>
                  </div>
                )}
                {selectedCatchDetails.waterTemp && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Water Temp</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.waterTemp}°F</div>
                  </div>
                )}
                {selectedCatchDetails.depth && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Depth</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.depth} ft</div>
                  </div>
                )}
                {selectedCatchDetails.weatherTemp && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Air Temp</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.weatherTemp}°F</div>
                  </div>
                )}
                {selectedCatchDetails.windSpeed && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Wind</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.windSpeed} mph {selectedCatchDetails.windDirection}</div>
                  </div>
                )}
                {selectedCatchDetails.coverType && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Cover Type</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>{selectedCatchDetails.coverType}</div>
                  </div>
                )}
                {selectedCatchDetails.moonPhase && (
                  <div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Moon Phase</div>
                    <div style={{ color: '#fef5e7', fontSize: '1rem' }}>🌙 {selectedCatchDetails.moonPhase}</div>
                  </div>
                )}
              </div>

              {/* Notes */}
              {selectedCatchDetails.notes && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Notes</div>
                  <div style={{ color: '#fef5e7', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '6px' }}>
                    {selectedCatchDetails.notes}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={() => {
                    setSelectedCatchForMap(selectedCatchDetails);
                    setActiveTab('map');
                    setSelectedCatchDetails(null);
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#2ecc71',
                    color: '#0f4c27',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  🗺️ View on Map
                </button>
                <button
                  onClick={() => setSelectedCatchDetails(null)}
                  style={{
                    padding: '10px 20px',
                    background: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FishingLogApp;
