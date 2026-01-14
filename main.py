from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from route_planner import RoutePlanner
from metro_client import MetroClient
import os
import json
import logging
from datetime import datetime
from collections import defaultdict
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('metro_app.log'),
        logging.StreamHandler()  # Also print to console
    ]
)
logger = logging.getLogger(__name__)

# Persistence file path
DATA_FILE = "visitor_data.json"


def load_visitor_data():
    """Load visitor data from JSON file"""
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r") as f:
                data = json.load(f)
                # Convert date string back to date object
                if "date" in data:
                    data["date"] = datetime.fromisoformat(data["date"]).date()
                # Convert visitors list back to set
                if "visitors" in data:
                    data["visitors"] = set(data["visitors"])
                return data
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error loading visitor data: {e}. Starting fresh.")
    
    # Return default structure if file doesn't exist or has errors
    return {"date": datetime.now().date(), "visitors": set(), "count": 0}


def save_visitor_data():
    """Save visitor data to JSON file"""
    try:
        data_to_save = {
            "date": visitor_data["date"].isoformat(),
            "visitors": list(visitor_data["visitors"]),  # Convert set to list for JSON
            "count": visitor_data["count"],
        }
        with open(DATA_FILE, "w") as f:
            json.dump(data_to_save, f, indent=2)
    except Exception as e:
        print(f"Error saving visitor data: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - load data on startup, save on shutdown"""
    global visitor_data
    # Startup: Load persisted data
    visitor_data = load_visitor_data()
    logger.info(f"Application started - Loaded visitor data: {visitor_data['count']} visitors on {visitor_data['date']}")
    print(f"Loaded visitor data: {visitor_data['count']} visitors on {visitor_data['date']}")
    
    yield
    
    # Shutdown: Save data
    save_visitor_data()
    logger.info(f"Application shutting down - Saved visitor data: {visitor_data['count']} visitors")
    print(f"Saved visitor data: {visitor_data['count']} visitors")


app = FastAPI(
    title="Metro Bilbao API",
    description="Real-time metro information and route planning for Metro Bilbao",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
route_planner = RoutePlanner()
metro_client = MetroClient()

# Visitor tracking (will be loaded from file in lifespan)
visitor_data = {"date": datetime.now().date(), "visitors": set(), "count": 0}


class RouteRequest(BaseModel):
    """Request model for route queries"""

    origin: str
    destination: str


class ProcessRouteRequest(BaseModel):
    """Request model for processing raw Metro API data"""

    data: dict


def track_visitor(request: Request):
    """Track unique visitors by IP and user agent"""
    global visitor_data

    # Reset counter if it's a new day
    current_date = datetime.now().date()
    if visitor_data["date"] != current_date:
        logger.info(f"Daily reset - Previous count: {visitor_data['count']} on {visitor_data['date']}")
        visitor_data["date"] = current_date
        visitor_data["visitors"] = set()
        visitor_data["count"] = 0
        # Save the reset data
        save_visitor_data()

    # Create unique identifier from IP and user agent
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")
    visitor_id = f"{client_ip}:{user_agent}"

    # Add to set if new visitor
    if visitor_id not in visitor_data["visitors"]:
        visitor_data["visitors"].add(visitor_id)
        visitor_data["count"] = len(visitor_data["visitors"])
        logger.info(f"New visitor #{visitor_data['count']} - IP: {client_ip} - User Agent: {user_agent[:50]}...")
        # Save data when a new visitor is tracked
        save_visitor_data()


@app.get("/api/visitors")
async def get_visitor_count(request: Request):
    """Get current visitor count and track this visitor"""
    track_visitor(request)
    return {"count": visitor_data["count"]}


@app.get("/")
async def root(request: Request):
    """Serve the main HTML page"""
    track_visitor(request)
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Root page accessed - IP: {client_ip}")
    html_path = os.path.join(os.path.dirname(__file__), "static", "index.html")

    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())

    return HTMLResponse(
        content="""
    <html>
        <head><title>Metro Bilbao</title></head>
        <body>
            <h1>Metro Bilbao API</h1>
            <p>API is running. Access the interactive interface at /static/index.html</p>
            <p>API documentation: <a href="/docs">/docs</a></p>
        </body>
    </html>
    """
    )


@app.get("/api/route/{origin}/{destination}")
async def get_route(origin: str, destination: str, request: Request):
    """
    Get route information between two stations

    Args:
        origin: Origin station code (e.g., 'ETX')
        destination: Destination station code (e.g., 'ARZ')

    Returns:
        Complete route information including trains, exits, transfers, etc.
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Route query: {origin.upper()} → {destination.upper()} - IP: {client_ip}")
    try:
        route_data = await route_planner.get_route(origin.upper(), destination.upper())
        return JSONResponse(content=route_data)
    except Exception as e:
        logger.error(f"Error fetching route {origin} → {destination} - IP: {client_ip} - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching route: {str(e)}")


@app.get("/api/route/{origin}/{destination}/formatted")
async def get_route_formatted(origin: str, destination: str, request: Request):
    """
    Get pretty-printed route information as plain text

    Args:
        origin: Origin station code
        destination: Destination station code

    Returns:
        Formatted text representation of route information
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Formatted route query: {origin.upper()} → {destination.upper()} - IP: {client_ip}")
    try:
        route_data = await route_planner.get_route(origin.upper(), destination.upper())

        formatted_text = route_data.get("formatted", "No information available")

        # Add transfer information if available
        if route_data.get("transferOptions"):
            formatted_text += "\n" + route_planner.format_transfer_info(
                route_data["transferOptions"]
            )

        return {"formatted": formatted_text, "data": route_data}
    except Exception as e:
        logger.error(f"Error fetching formatted route {origin} → {destination} - IP: {client_ip} - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching route: {str(e)}")


@app.post("/api/route")
async def post_route(route_request: RouteRequest, request: Request):
    """
    Get route information (POST method)

    Args:
        route_request: RouteRequest with origin and destination

    Returns:
        Complete route information
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"POST route query: {route_request.origin.upper()} → {route_request.destination.upper()} - IP: {client_ip}")
    try:
        route_data = await route_planner.get_route(
            route_request.origin.upper(), route_request.destination.upper()
        )
        return JSONResponse(content=route_data)
    except Exception as e:
        logger.error(f"Error in POST route {route_request.origin} → {route_request.destination} - IP: {client_ip} - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching route: {str(e)}")


@app.post("/api/process")
async def process_route_data(process_request: ProcessRouteRequest, request: Request):
    """
    Process raw Metro API data (add exit availability, calculations, etc.)

    Args:
        process_request: ProcessRouteRequest with raw Metro API data

    Returns:
        Processed route information with exit availability and calculations
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Process route data request - IP: {client_ip}")
    try:
        from datetime import datetime, timedelta

        route_data = process_request.data

        # Add expected arrival times to each train
        trip_duration_sec = route_data.get("trip", {}).get("duration", 0) * 60

        for train in route_data.get("trains", []):
            estimated_min = train.get("estimated", 0)
            total_time_sec = estimated_min * 60 + trip_duration_sec
            arrival_time = datetime.now() + timedelta(seconds=total_time_sec)
            train["arrivalAtDestination"] = arrival_time.strftime("%H:%M:%S")
            train["totalTimeToDestinationSeconds"] = int(total_time_sec)

        # Calculate earliest arrival time
        if route_data.get("trains") and len(route_data["trains"]) > 0:
            first_train = route_data["trains"][0]
            route_data["earliestArrival"] = first_train.get("arrivalAtDestination", "")[
                :5
            ]  # HH:MM format

        # Check if transfer is required and calculate options
        if route_data.get("trip", {}).get("transfer"):
            origin = route_data["trip"]["fromStation"]["code"]
            destination = route_data["trip"]["toStation"]["code"]
            transfer_options = await route_planner._find_transfer_options(
                origin, destination, route_data
            )
            route_data["transferOptions"] = transfer_options

            # Update earliest arrival if transfer is faster
            if transfer_options and len(transfer_options) > 0:
                transfer_arrival = transfer_options[0].get("expectedArrival")
                if transfer_arrival:
                    route_data["earliestArrival"] = transfer_arrival

        # Add exit availability based on current time
        if "exits" in route_data:
            if "origin" in route_data["exits"]:
                route_data["exits"]["origin"] = metro_client.filter_available_exits(
                    route_data["exits"]["origin"]
                )
            if "destiny" in route_data["exits"]:
                route_data["exits"]["destiny"] = metro_client.filter_available_exits(
                    route_data["exits"]["destiny"]
                )

        # Recalculate CO2 values (API provides g/km, we need to convert to kg)
        if "co2Metro" in route_data:
            co2_data = route_data["co2Metro"]
            # Convert g/km to kg by multiplying by distance and dividing by 1000
            # Convert to float in case they're strings
            metro_co2_g_km = float(co2_data.get("co2metro", 0))
            car_co2_g_km = float(co2_data.get("co2Car", 0))
            metro_distance = float(co2_data.get("metroDistance", 0))
            google_distance = float(co2_data.get("googleDistance", 0))

            metro_co2_kg = (metro_co2_g_km * metro_distance) / 1000
            car_co2_kg = (car_co2_g_km * google_distance) / 1000
            diff_kg = car_co2_kg - metro_co2_kg

            # Update the values with formatted strings
            co2_data["co2metro"] = f"{metro_co2_kg:.2f}"
            co2_data["co2Car"] = f"{car_co2_kg:.2f}"
            co2_data["diff"] = f"{diff_kg:.2f}"

        # Add formatted information
        route_data["formatted"] = metro_client.format_complete_info(route_data)

        return JSONResponse(content=route_data)
    except Exception as e:
        logger.error(f"Error processing route data - IP: {client_ip} - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing route data: {str(e)}")


@app.get("/api/health")
async def health_check(request: Request):
    """Health check endpoint"""
    client_ip = request.client.host if request.client else "unknown"
    logger.debug(f"Health check - IP: {client_ip}")
    is_night = metro_client.is_nighttime()
    return {
        "status": "healthy",
        "nightMode": is_night,
        "apiBaseUrl": metro_client.settings.api_base_url,
        "autoRefreshInterval": metro_client.settings.auto_refresh_interval,
    }


@app.get("/api/time")
async def get_server_time():
    """
    Get current server time in Madrid timezone (Europe/Madrid)
    This helps clients sync with server time to avoid issues with incorrect local clocks

    Returns:
        Current server time as ISO 8601 string and Unix timestamp in milliseconds
    """
    import pytz

    # Get Madrid timezone
    madrid_tz = pytz.timezone("Europe/Madrid")
    now_madrid = datetime.now(madrid_tz)

    return {
        "timestamp": int(now_madrid.timestamp() * 1000),  # milliseconds
        "iso": now_madrid.isoformat(),
        "timezone": "Europe/Madrid",
    }


@app.get("/api/stations")
async def get_stations(request: Request):
    """
    Get list of Metro Bilbao stations

    Returns:
        Dictionary of station codes and names
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Stations list requested - IP: {client_ip}")
    # LINE 1 (Plentzia ↔ Etxebarri)
    # LINE 2 (Kabiezes ↔ Basauri)
    # LINE 3 (Matiko ↔ Kukullaga)
    stations = {
        "PLE": "Plentzia",
        "SOP": "Sopela",
        "URD": "Urduliz",
        "LAR": "Larrabasterra",
        "BER": "Berango",
        "IBB": "Ibarbengoa",
        "BID": "Bidezabal",
        "ALG": "Algorta",
        "AIB": "Aiboa",
        "NEG": "Neguri",
        "GOB": "Gobela",
        "ARE": "Areeta",
        "LAM": "Lamiako",
        "LEI": "Leioa",
        "AST": "Astrabudua",
        "ERA": "Erandio",
        "LUT": "Lutxana",
        "SIN": "San Inazio",
        "SAR": "Sarriko",
        "DEU": "Deustu",
        "SAM": "Santimami/San Mamés",
        "IND": "Indautxu",
        "MOY": "Moyua",
        "ABA": "Abando",
        "CAV": "Zazpikaleak/Casco Viejo",
        "SAN": "Santutxu",
        "BAS": "Basarrate",
        "BOL": "Bolueta",
        "ETX": "Etxebarri",
        "KAB": "Kabiezes",
        "STZ": "Santurtzi",
        "PEN": "Peñota",
        "POR": "Portugalete",
        "ABT": "Abatxolo",
        "SES": "Sestao",
        "URB": "Urbinaga",
        "BAG": "Bagatza",
        "BAR": "Barakaldo",
        "ANS": "Ansio",
        "GUR": "Gurutzeta/Cruces",
        "ARZ": "Ariz",
        "BSR": "Basauri",
        # "MAT": "Matiko",
        # "URI": "Uribarri",
        # "ZUR": "Zurbaranbarri",
        # "TXU": "Txurdinaga",
        # "OTX": "Otxarkoaga",
        # "KUK": "Kukullaga",
    }

    return {"stations": stations}


# Mount static files directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001)
