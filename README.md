# Metro Bilbao Route Planner 🚇

A modern web application for planning routes on Metro Bilbao with real-time information, transfer planning, and station exit availability.

## Features

- 🚇 **Real-time Train Information**: See upcoming trains with estimated arrival times
- 🗺️ **Route Planning**: Find routes between any two stations
- 🔄 **Transfer Support**: Automatic detection and planning for routes requiring transfers
- 🚪 **Exit Availability**: Check which station exits are open based on time of day
- 🌱 **Environmental Impact**: See CO2 savings compared to driving
- 🌙 **Day/Night Mode**: Automatically adapts to show available exits
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile

## Installation

### Prerequisites

- Python 3.8 or higher
- pip

### Setup

1. **Clone or navigate to the project directory**:
   ```bash
   cd dafer-metro
   ```

2. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure the application** (optional):
   Edit the `.env` file to customize settings:
   ```
   NIGHT_TIME_START=22:00
   NIGHT_TIME_END=06:00
   API_BASE_URL=https://api.metrobilbao.eus/metro/real-time
   ```

## Running the Application

### Development Mode

Start the server with auto-reload:

```bash
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production Mode

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The application will be available at:
- **Web Interface**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## Usage

### Web Interface

1. Open your browser and go to http://localhost:8000
2. Enter the origin station code (e.g., `ETX` for Etxebarri)
3. Enter the destination station code (e.g., `ARZ` for Ariz)
4. Click "Find Route" to see:
   - Trip overview with duration and line information
   - Upcoming trains with real-time estimates
   - Transfer information (if required)
   - Station exits with availability status
   - Environmental impact comparison

### API Endpoints

#### Get Route Information

```bash
GET /api/route/{origin}/{destination}
```

Example:
```bash
curl http://localhost:8000/api/route/ETX/ARZ
```

#### Get Formatted Route Information

```bash
GET /api/route/{origin}/{destination}/formatted
```

Returns pretty-printed text format suitable for console display.

#### Get Available Stations

```bash
GET /api/stations
```

#### Health Check

```bash
GET /api/health
```

Returns API status and whether it's currently night mode.

## Common Station Codes

- **ETX** - Etxebarri
- **ARZ** - Ariz
- **SAN** - Santutxu
- **BAS** - Basauri
- **CAD** - Casco Viejo
- **ABT** - Abando
- **MOY** - Moyua
- **IND** - Indautxu
- **GOB** - Gobela
- **DEU** - Deustu

## Configuration

The `.env` file contains the following settings:

- `NIGHT_TIME_START`: Time when non-nocturnal exits close (default: 22:00)
- `NIGHT_TIME_END`: Time when non-nocturnal exits open (default: 06:00)
- `API_BASE_URL`: Base URL for Metro Bilbao API

## Project Structure

```
dafer-metro/
├── main.py                 # FastAPI application and endpoints
├── metro_client.py         # Metro Bilbao API client
├── route_planner.py        # Route planning and transfer logic
├── config.py              # Configuration management
├── requirements.txt       # Python dependencies
├── .env                   # Environment configuration
├── static/                # Frontend files
│   ├── index.html        # Main HTML page
│   ├── style.css         # Stylesheet
│   └── script.js         # JavaScript functionality
└── README.md             # This file
```

## Features Explained

### Transfer Detection

The application automatically detects when a route requires a transfer between metro lines. It provides:
- Step-by-step transfer instructions
- Estimated wait times at transfer stations
- Total journey time including transfers

### Exit Availability

Station exits are marked as available or closed based on:
- Current time of day
- Whether the exit is marked as "nocturnal" (24-hour access)
- Configuration in `.env` file

### Environmental Impact

The app shows CO2 emissions for:
- 🚇 Taking the metro
- 🚗 Driving by car
- 💚 How much CO2 you save by using public transport

## Hosting for Friends

To host this application for your friends:

1. **On a cloud platform** (Recommended):
   - Deploy to platforms like Heroku, Railway, Render, or DigitalOcean
   - Set environment variables in the platform's dashboard
   - Ensure the platform supports Python 3.8+

2. **On your own server**:
   - Install the application on a VPS or home server
   - Use a reverse proxy (nginx/Apache) for HTTPS
   - Set up a domain name for easy access
   - Consider using a process manager like `supervisord` or `systemd`

3. **Using Docker** (optional):
   Create a `Dockerfile`:
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install -r requirements.txt
   COPY . .
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```

## Troubleshooting

### Module not found errors
```bash
pip install -r requirements.txt
```

### Port already in use
Change the port in the uvicorn command:
```bash
uvicorn main:app --port 8001
```

### API connection errors
Check that the Metro Bilbao API is accessible:
```bash
curl https://api.metrobilbao.eus/metro/real-time/ETX/ARZ
```

## Contributing

Feel free to fork this project and add features like:
- More detailed station information
- Route favorites/bookmarks
- Historical data and analytics
- Mobile app version
- Push notifications for train delays

## License

This project is created for personal use and sharing with friends. The Metro Bilbao data is provided by Metro Bilbao's public API.

## Credits

- Data provided by [Metro Bilbao](https://www.metrobilbao.eus/)
- Built with FastAPI, uvicorn, and modern web technologies
- Made with ❤️ for friends

---

Enjoy your Metro Bilbao travels! 🚇✨
