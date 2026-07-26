from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import pickle
import rasterio
from pyproj import Transformer
import geopandas as gpd
from shapely.geometry import LineString, mapping
from skimage.graph import route_through_array
import math
import os

app = FastAPI()

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Global variables for caching data
precalc_df = None
precalc_paths = None
raster_transform = None
crs_transformer = None
kkh_geojson = None
slope_n = None
landuse_n = None
eq_n = None
ls_n = None
start_rc = None
end_rc = None

# Base path relative to main.py
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

@app.on_event("startup")
async def startup_event():
    global precalc_df, precalc_paths, raster_transform, crs_transformer, kkh_geojson
    global slope_n, landuse_n, eq_n, ls_n, start_rc, end_rc
    
    print("Loading data into memory...")
    try:
        # Load precalculated results
        precalc_df = pd.read_csv(os.path.join(BASE_DIR, "all_paths_results.csv"))
        with open(os.path.join(BASE_DIR, "all_paths.pkl"), "rb") as f:
            precalc_paths = pickle.load(f)
            
        # Load NumPy arrays for custom calculations
        slope_n = np.load(os.path.join(BASE_DIR, "slope_n.npy"))
        landuse_n = np.load(os.path.join(BASE_DIR, "landuse_n.npy"))
        eq_n = np.load(os.path.join(BASE_DIR, "eq_n.npy"))
        ls_n = np.load(os.path.join(BASE_DIR, "ls_n.npy"))
            
        # Load Raster metadata for coordinate transformations
        with rasterio.open(os.path.join(BASE_DIR, "slope_utm.tif")) as src:
            raster_transform = src.transform
            crs_transformer = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
            
            # Setup start and end points for custom routing
            transformer_to_utm = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
            chilas_proj = transformer_to_utm.transform(74.0833, 35.4333)
            jaglot_proj = transformer_to_utm.transform(74.6239, 35.6850)
            row_start, col_start = src.index(*chilas_proj)
            row_end, col_end = src.index(*jaglot_proj)
            
            row_start = min(max(row_start, 0), slope_n.shape[0]-1)
            col_start = min(max(col_start, 0), slope_n.shape[1]-1)
            row_end = min(max(row_end, 0), slope_n.shape[0]-1)
            col_end = min(max(col_end, 0), slope_n.shape[1]-1)
            start_rc = (row_start, col_start)
            end_rc = (row_end, col_end)

        # Load Real KKH Route
        kkh_shp = gpd.read_file(os.path.join(BASE_DIR, "kkh_route_final.shp"))
        kkh_shp = kkh_shp.to_crs(epsg=4326)
        kkh_geojson = eval(kkh_shp.to_json())

        print("Data loaded successfully.")
    except Exception as e:
        print(f"Error loading data: {e}")

class Weights(BaseModel):
    slope: float
    landuse: float
    seismic: float
    landslide: float

def indices_to_geojson(indices):
    coords = []
    for r, c in indices:
        x, y = rasterio.transform.xy(raster_transform, r, c)
        lon, lat = crs_transformer.transform(x, y)
        coords.append((lon, lat))
    line = LineString(coords)
    return mapping(line)

@app.post("/api/calculate-path")
async def calculate_path(weights: Weights):
    w1, w2, w3, w4 = weights.slope, weights.landuse, weights.seismic, weights.landslide
    
    # Normalize weights to sum to 1.0 (to match predefined if they roughly match)
    total = w1 + w2 + w3 + w4
    if total == 0:
        w1 = w2 = w3 = w4 = 0.25
    else:
        w1, w2, w3, w4 = w1/total, w2/total, w3/total, w4/total
        
    # Check if this matches a precalculated set (within a small tolerance)
    tol = 0.01
    matches = precalc_df[
        (np.abs(precalc_df['w1'] - w1) < tol) &
        (np.abs(precalc_df['w2'] - w2) < tol) &
        (np.abs(precalc_df['w3'] - w3) < tol) &
        (np.abs(precalc_df['w4'] - w4) < tol)
    ]
    
    if not matches.empty:
        idx = matches.index[0]
        indices = precalc_paths[idx]
        is_precalc = True
    else:
        # Custom calculation
        try:
            cost = w1*slope_n + w2*landuse_n + w3*eq_n + w4*ls_n + 1e-6
            indices, total_cost = route_through_array(cost, start_rc, end_rc, fully_connected=True, geometric=True)
            is_precalc = False
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    geojson_path = indices_to_geojson(indices)
    
    return {
        "path": {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": geojson_path,
                "properties": {
                    "is_precalculated": is_precalc
                }
            }]
        },
        "real_road": kkh_geojson
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
