from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from route_planner import RoutePlanner
from metro_client import MetroClient
import os
from datetime import datetime
from collections import defaultdict


app = FastAPI(
    title="Metro Bilbao API",
    description="Real-time metro information and route planning for Metro Bilbao",
    version="1.0.0",
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

# Visitor tracking
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
        visitor_data["date"] = current_date
        visitor_data["visitors"] = set()
        visitor_data["count"] = 0

    # Create unique identifier from IP and user agent
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")
    visitor_id = f"{client_ip}:{user_agent}"

    # Add to set if new visitor
    if visitor_id not in visitor_data["visitors"]:
        visitor_data["visitors"].add(visitor_id)
        visitor_data["count"] = len(visitor_data["visitors"])


@app.get("/api/visitors")
async def get_visitor_count(request: Request):
    """Get current visitor count and track this visitor"""
    track_visitor(request)
    return {"count": visitor_data["count"]}


@app.get("/")
async def root(request: Request):
    """Serve the main HTML page"""
    track_visitor(request)
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
async def get_route(origin: str, destination: str):
    """
    Get route information between two stations

    Args:
        origin: Origin station code (e.g., 'ETX')
        destination: Destination station code (e.g., 'ARZ')

    Returns:
        Complete route information including trains, exits, transfers, etc.
    """
    try:
        route_data = await route_planner.get_route(origin.upper(), destination.upper())
        return JSONResponse(content=route_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching route: {str(e)}")


@app.get("/api/route/{origin}/{destination}/formatted")
async def get_route_formatted(origin: str, destination: str):
    """
    Get pretty-printed route information as plain text

    Args:
        origin: Origin station code
        destination: Destination station code

    Returns:
        Formatted text representation of route information
    """
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
        raise HTTPException(status_code=500, detail=f"Error fetching route: {str(e)}")


@app.post("/api/route")
async def post_route(request: RouteRequest):
    """
    Get route information (POST method)

    Args:
        request: RouteRequest with origin and destination

    Returns:
        Complete route information
    """
    try:
        route_data = await route_planner.get_route(
            request.origin.upper(), request.destination.upper()
        )
        return JSONResponse(content=route_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching route: {str(e)}")


@app.post("/api/process")
async def process_route_data(request: ProcessRouteRequest):
    """
    Process raw Metro API data (add exit availability, calculations, etc.)

    Args:
        request: ProcessRouteRequest with raw Metro API data

    Returns:
        Processed route information with exit availability and calculations
    """
    try:
        from datetime import datetime, timedelta

        route_data = request.data

        # Add expected arrival times to each train
        trip_duration_sec = route_data.get("trip", {}).get("duration", 0) * 60

        for train in route_data.get("trains", []):
            estimated_min = train.get("estimated", 0)
            total_time_sec = estimated_min * 60 + trip_duration_sec
            arrival_time = datetime.now() + timedelta(seconds=total_time_sec)
            train["arrivalAtDestination"] = arrival_time.strftime("%H:%M:%S")
            train["totalTimeToDestination"] = route_planner._format_duration(total_time_sec)

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

        # Add formatted information
        route_data["formatted"] = metro_client.format_complete_info(route_data)

        return JSONResponse(content=route_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing route data: {str(e)}")


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    is_night = metro_client.is_nighttime()
    return {
        "status": "healthy",
        "nightMode": is_night,
        "apiBaseUrl": metro_client.settings.api_base_url,
        "autoRefreshInterval": metro_client.settings.auto_refresh_interval,
    }


@app.get("/api/stations")
async def get_stations():
    """
    Get list of Metro Bilbao stations

    Returns:
        Dictionary of station codes and names
    """
    # LINE 1 (Plentzia ↔ Etxebarri)
    # LINE 2 (Kabiezes ↔ Basauri)
    # LINE 3 (Matiko ↔ Kukullaga)
    stations = {
        # Line 1 stations
        "PLE": "Plentzia",
        "SOP": "Sopela",
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
        "CAD": "Zazpikaleak/Casco Viejo",
        "BOL": "Bolueta",
        "ETX": "Etxebarri",
        # Line 2 stations
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
        "BAS": "Basauri",
        "ARZ": "Ariz",
        # ETX, BOL, CAD, ABN, MOY, SMM, IND already defined in Line 1
        # Line 3 stations
        "MAT": "Matiko",
        "URI": "Uribarri",
        "ZUR": "Zurbaranbarri",
        "TXU": "Txurdinaga",
        "OTX": "Otxarkoaga",
        "KUK": "Kukullaga",
        # BOL, CAD already defined in Line 1
    }

    return {"stations": stations}


# Mount static files directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001)
