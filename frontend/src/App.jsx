import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Activity, AlertTriangle, Layers, Map as MapIcon, Mountain, ShieldAlert } from 'lucide-react';
import axios from 'axios';

// Basic configuration for map center
const mapCenter = [35.5591, 74.3536]; // Approx center between Chilas and Jaglot

function App() {
  const [weights, setWeights] = useState({
    slope: 0.5,
    landuse: 0.3,
    seismic: 0.1,
    landslide: 0.1
  });

  const [pathData, setPathData] = useState(null);
  const [realRoadData, setRealRoadData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isCustom, setIsCustom] = useState(false);

  // Handle slider change (ensure sum is 1.0)
  const handleWeightChange = (key, value) => {
    const newValue = parseFloat(value);
    const oldValue = weights[key];
    const diff = newValue - oldValue;
    
    // Sum of the other weights
    const othersSum = 1.0 - oldValue;
    
    let newWeights = { ...weights };
    newWeights[key] = newValue;

    // If there are other weights, scale them proportionally
    if (othersSum > 0) {
      for (let k in newWeights) {
        if (k !== key) {
          // Scale proportional to their previous contribution
          newWeights[k] = Math.max(0, weights[k] - diff * (weights[k] / othersSum));
        }
      }
    } else {
      // If others sum to 0 (all weight was in this key previously)
      // and we are decreasing it, distribute the diff equally
      const remainingKeys = Object.keys(newWeights).filter(k => k !== key);
      for (let k of remainingKeys) {
        newWeights[k] = Math.max(0, -diff / remainingKeys.length);
      }
    }

    // Fix rounding errors to ensure exact sum of 1.0
    const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (let k in newWeights) {
        newWeights[k] = newWeights[k] / total;
      }
    }
    
    setIsCustom(true);
    setWeights(newWeights);
  };

  const calculatePath = async () => {
    setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await axios.post(`${apiUrl}/api/calculate-path`, weights);
      setPathData(response.data.path);
      if (response.data.real_road) {
        setRealRoadData(response.data.real_road);
      }
    } catch (error) {
      console.error("Error calculating path:", error);
      alert("Failed to calculate path. Please ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Hero Section */}
      <header className="hero">
        <h1>Hazard-Aware Road Corridor Planning</h1>
        <p>
          Multi-Objective Least-Cost Path Optimization for the Karakoram Highway (Chilas to Jaglot)
        </p>
        <p style={{marginTop: '0.5rem', fontSize: '0.9rem', color: '#94a3b8'}}>
          By Muhammad Khizar Latif & Muhammad Hamza Dar | CSCE'26
        </p>
      </header>

      {/* Main Content */}
      <main className="main-content">
        
        {/* Control Panel */}
        <aside className="control-panel">
          <div className="panel-header">
            <h2><Layers size={20} style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}}/> Optimization Weights</h2>
            <p>Adjust the relative importance of each cost factor.</p>
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span style={{display:'flex', alignItems:'center', gap:'6px'}}><Mountain size={16}/> Terrain Slope</span>
              <span className="slider-value">{weights.slope.toFixed(2)}</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.05" 
              value={weights.slope} 
              onChange={(e) => handleWeightChange('slope', e.target.value)} 
            />
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span style={{display:'flex', alignItems:'center', gap:'6px'}}><MapIcon size={16}/> Land Use</span>
              <span className="slider-value">{weights.landuse.toFixed(2)}</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.05" 
              value={weights.landuse} 
              onChange={(e) => handleWeightChange('landuse', e.target.value)} 
            />
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span style={{display:'flex', alignItems:'center', gap:'6px'}}><Activity size={16}/> Seismic Hazard</span>
              <span className="slider-value">{weights.seismic.toFixed(2)}</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.05" 
              value={weights.seismic} 
              onChange={(e) => handleWeightChange('seismic', e.target.value)} 
            />
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span style={{display:'flex', alignItems:'center', gap:'6px'}}><ShieldAlert size={16}/> Landslide Hazard</span>
              <span className="slider-value">{weights.landslide.toFixed(2)}</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.05" 
              value={weights.landslide} 
              onChange={(e) => handleWeightChange('landslide', e.target.value)} 
            />
          </div>

          {isCustom && (
            <div className="warning-box">
              <AlertTriangle size={20} style={{flexShrink: 0}} />
              <div>
                <strong>Custom Weights Detected</strong><br/>
                Computing a novel least-cost path across the 30m resolution grid may take several seconds.
              </div>
            </div>
          )}

          <button 
            className="btn" 
            onClick={calculatePath} 
            disabled={loading}
            style={{marginTop: 'auto'}}
          >
            {loading ? "Computing Dijkstra's..." : "Calculate Optimal Path"}
          </button>
        </aside>

        {/* Map Container */}
        <div className="map-container">
          <MapContainer center={mapCenter} zoom={11} style={{height: '100%', width: '100%', background: '#1e293b'}}>
            <TileLayer
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
            />
            {/* Draw Path Here */}
            {realRoadData && <GeoJSON key="real-road" data={realRoadData} style={{color: '#ef4444', weight: 4, opacity: 0.8}} />}
            {pathData && <GeoJSON key={JSON.stringify(weights)} data={pathData} style={{color: '#10b981', weight: 4, opacity: 1}} />}
          </MapContainer>

          <div className="map-legend">
            <div className="legend-item">
              <div className="legend-color" style={{background: '#ef4444'}}></div>
              <span>Real KKH Alignment</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{background: '#10b981'}}></div>
              <span>Computed Optimal Path</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
