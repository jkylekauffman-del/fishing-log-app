import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Camera, Wind, Thermometer, Droplets, Clock, Trash2, Plus, ChevronDown, Map, Filter, Download, Upload, Navigation, LogOut, LogIn, Cloud } from 'lucide-react';

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

const initFirebase = async () => {
  if (isFirebaseReady) return;
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js');
    const { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, query, where, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js');
    const { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } = await import('https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js');
    
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    auth = getAuth(app);
    isFirebaseReady = true;
    
    return { db, auth, getFirestore, collection, getDocs, addDoc, deleteDoc, doc, query, where, updateDoc, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut };
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
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  
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
      const firebase = await initFirebase();
      if (firebase) {
        const { onAuthStateChanged } = firebase;
        onAuthStateChanged(auth, (currentUser) => {
          setUser(currentUser);
          setFirebaseReady(true);
          if (currentUser) {
            loadCatchesFromFirebase(currentUser.uid);
          } else {
            setIsLoading(false);
          }
        });
      } else {
        setFirebaseReady(true);
        setIsLoading(false);
      }
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
  }, [userLocation]);

  const requestUserLocation = () => {
    setLoadingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          setLoadingLocation(false);
        },
        () => setLoadingLocation(false)
      );
    }
  };

  const fetchWeatherData = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,pressure_msl&timezone=auto`
      );
      const data = await response.json();
      if (data.current) {
        const temp = Math.round(data.current.temperature_2m * 9/5 + 32);
        const windDir = getWindDirection(data.current.wind_direction_10m);
        setWeatherData({
          temperature: temp,
          windSpeed: data.current.wind_speed_10m,
          windDirection: windDir,
          cloudCover: data.current.cloud_cover,
          pressure: data.current.pressure_msl
        });
        setFormData(prev => ({
          ...prev,
          weatherTemp: temp.toString(),
          windSpeed: Math.round(data.current.wind_speed_10m).toString(),
          windDirection: windDir,
          cloudCover: data.current.cloud_cover.toString(),
          barometricPressure: data.current.pressure_msl.toFixed(1)
        }));
      }
    } catch (error) {
      console.log('Weather error:', error);
    }
  };

  const getWindDirection = (degrees) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  };

  const loadCatchesFromFirebase = async (userId) => {
    try {
      const firebase = await initFirebase();
      if (!firebase) {
        setIsLoading(false);
        return;
      }
      const { collection, query, where, getDocs } = firebase;
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
    if (!user) return null;
    try {
      const firebase = await initFirebase();
      if (!firebase) return null;
      const { collection, addDoc } = firebase;
      const docRef = await addDoc(collection(db, 'catches'), {
        ...catchData,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      setSyncStatus('✓ Synced');
      return docRef.id;
    } catch (error) {
      console.log('Save error:', error);
      setSyncStatus('⚠ Sync failed');
      return null;
    }
  };

  const deleteCatchFromFirebase = async (firebaseId) => {
    if (!user) return;
    try {
      const firebase = await initFirebase();
      if (!firebase) return;
      const { doc, deleteDoc } = firebase;
      await deleteDoc(doc(db, 'catches', firebaseId));
      setSyncStatus('✓ Synced');
    } catch (error) {
      console.log('Delete error:', error);
      setSyncStatus('⚠ Sync failed');
    }
  };

  const signInWithGoogle = async () => {
    try {
      const firebase = await initFirebase();
      if (!firebase) {
        alert('Cloud sync not available. Please try again.');
        return;
      }
      const { signInWithPopup, GoogleAuthProvider } = firebase;
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
      const firebase = await initFirebase();
      if (firebase) {
        const { signOut } = firebase;
        await signOut(auth);
      }
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
      
      return { ...c, matchScore: Math.max(0, score) };
    });

    const topMatches = scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5).filter(c => c.matchScore >= 40);
    if (topMatches.length === 0) return null;

    const recs = { bestLures: {}, bestSpecies: {}, bestCoverTypes: {}, avgWaterTemp: 0, avgDepth: 0, matches: topMatches.length };
    
    topMatches.forEach(c => {
      if (c.lureName) {
        const key = `${c.lureName} (${c.lureColor})`;
        recs.bestLures[key] = (recs.bestLures[key] || 0) + 1;
      }
      if (c.fishSpecies) recs.bestSpecies[c.fishSpecies] = (recs.bestSpecies[c.fishSpecies] || 0) + 1;
      if (c.coverType) recs.bestCoverTypes[c.coverType] = (recs.bestCoverTypes[c.coverType] || 0) + 1;
      if (c.waterTemp) recs.avgWaterTemp += parseFloat(c.waterTemp);
      if (c.depth) recs.avgDepth += parseFloat(c.depth);
    });

    recs.avgWaterTemp = (recs.avgWaterTemp / topMatches.length).toFixed(1);
    recs.avgDepth = (recs.avgDepth / topMatches.length).toFixed(1);
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

                    {recommendations && (
                      <div className="rec-panel">
                        <h2 className="rec-title">💡 Smart Recommendations</h2>
                        <p style={{ color: '#fef5e7', marginTop: '0.5rem', opacity: 0.8 }}>Based on {recommendations.matches} similar past catches</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                          {Object.keys(recommendations.bestSpecies).length > 0 && (
                            <div className="rec-card">
                              <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '1rem' }}>🎣 Expected Species</div>
                              {Object.entries(recommendations.bestSpecies).sort(([,a],[,b]) => b-a).slice(0,3).map(([sp, cnt]) => (
                                <div key={sp} className="rec-item">{sp} <span style={{ background: '#2ecc71', color: '#0f4c27', padding: '0.2rem 0.5rem', borderRadius: '12px', marginLeft: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold' }}>{cnt}×</span></div>
                              ))}
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
                          <div className="rec-card">
                            <div style={{ fontWeight: 700, color: '#2ecc71', marginBottom: '1rem' }}>💧 Water Conditions</div>
                            <div className="rec-item">Expected Temp: {recommendations.avgWaterTemp}°F</div>
                            <div className="rec-item">Expected Depth: {recommendations.avgDepth} ft</div>
                          </div>
                        </div>
                      </div>
                    )}

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
                            <div className="form-group"><label>Size</label><input type="text" name="lureSize" value={formData.lureSize} onChange={handleInputChange} placeholder="e.g., #5" /></div>
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
                            <div className="form-group"><label>Latitude</label><input type="number" name="latitude" value={formData.latitude} onChange={handleInputChange} step="0.00001" /></div>
                            <div className="form-group"><label>Longitude</label><input type="number" name="longitude" value={formData.longitude} onChange={handleInputChange} step="0.00001" /></div>
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
                          <div className="section-title"><Wind size={20} /> Weather</div>
                          <div className="form-grid">
                            <div className="form-group"><label>Air Temp (°F)</label><input type="number" name="weatherTemp" value={formData.weatherTemp} onChange={handleInputChange} step="0.1" /></div>
                            <div className="form-group"><label>Wind Speed (mph)</label><input type="number" name="windSpeed" value={formData.windSpeed} onChange={handleInputChange} step="0.5" /></div>
                            <div className="form-group"><label>Wind Direction</label><input type="text" name="windDirection" value={formData.windDirection} onChange={handleInputChange} /></div>
                            <div className="form-group"><label>Cloud Cover (%)</label><input type="number" name="cloudCover" value={formData.cloudCover} onChange={handleInputChange} min="0" max="100" step="10" /></div>
                            <div className="form-group"><label>UV Index</label><input type="number" name="uvIndex" value={formData.uvIndex} onChange={handleInputChange} step="0.5" /></div>
                            <div className="form-group"><label>Barometric Pressure (mb)</label><input type="number" name="barometricPressure" value={formData.barometricPressure} onChange={handleInputChange} step="0.1" /></div>
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
                              {c.coverType && <div className="detail-row"><div className="detail-item"><div className="detail-label">Cover</div><div className="detail-value">{c.coverType}</div></div></div>}
                              {c.weatherTemp && <div className="detail-row"><div className="detail-item"><div className="detail-label">Air Temp</div><div className="detail-value">{c.weatherTemp}°F</div></div><div className="detail-item"><div className="detail-label">Wind</div><div className="detail-value">{c.windSpeed} mph {c.windDirection}</div></div></div>}
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
                      <h1>🗺️ Catch Map</h1>
                      <p>View all your catches on the map</p>
                    </div>

                    {catches.length > 0 ? (
                      <div className="catches-grid">
                        {catches.map((c, idx) => (
                          <div key={c.id} className="catch-card">
                            <div className="catch-header">
                              <div>
                                <div className="catch-title">#{idx + 1} - {c.fishSpecies}</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{parseFloat(c.latitude)?.toFixed(4)}, {parseFloat(c.longitude)?.toFixed(4)}</div>
                              </div>
                            </div>
                            {(c.fishImage || c.lureImage) && (
                              <div className="catch-images">
                                {c.fishImage ? <div className="catch-image"><img src={c.fishImage} alt="Fish" /></div> : <div className="catch-image">No Photo</div>}
                                {c.lureImage ? <div className="catch-image"><img src={c.lureImage} alt="Lure" /></div> : <div className="catch-image">No Photo</div>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-catches"><p>No catches logged yet</p></div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FishingLogApp;
