from typing import List, Dict, Any
from datetime import datetime, time
import httpx
from config import get_settings


class MetroClient:
    """Client for interacting with Metro Bilbao API"""

    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.api_base_url

    async def get_route_info(self, origin: str, destination: str) -> Dict[str, Any]:
        """
        Fetch route information between two stations

        Args:
            origin: Origin station code (e.g., 'ETX')
            destination: Destination station code (e.g., 'ARZ')

        Returns:
            Dict containing route information from the API
        """
        url = f"{self.base_url}/{origin}/{destination}"

        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    def is_nighttime(self) -> bool:
        """Check if current time is nighttime"""
        current_time = datetime.now().time()

        # Parse night time settings
        night_start = time.fromisoformat(self.settings.night_time_start)
        night_end = time.fromisoformat(self.settings.night_time_end)

        # Handle case where night period crosses midnight
        if night_start > night_end:
            return current_time >= night_start or current_time < night_end
        else:
            return night_start <= current_time < night_end

    def filter_available_exits(self, exits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter exits based on whether they're open at current time

        Args:
            exits: List of exit dictionaries

        Returns:
            List of exits with availability status added
        """
        is_night = self.is_nighttime()

        for exit_info in exits:
            # Exit is available if it's not nighttime OR if it's a nocturnal exit
            exit_info["available"] = not is_night or exit_info.get("nocturnal", False)

        return exits

    def format_train_info(self, trains: List[Dict[str, Any]]) -> str:
        """Format train information for display"""
        if not trains:
            return "No trains available"

        lines = ["📊 Upcoming Trains:\n" + "=" * 60]

        for i, train in enumerate(trains, 1):
            lines.append(
                f"Train {i}: {train['direction']}\n"
                f"  ⏰ Estimated: {train['estimated']} minutes ({train['timeRounded']})\n"
                f"  🚇 Wagons: {train['wagons']}"
            )

        return "\n".join(lines)

    def format_trip_info(self, trip: Dict[str, Any]) -> str:
        """Format trip information for display"""
        lines = [
            "\n🚇 Trip Information:",
            "=" * 60,
            f"From: {trip['fromStation']['name']} ({trip['fromStation']['code']})",
            f"To: {trip['toStation']['name']} ({trip['toStation']['code']})",
            f"Duration: {trip['duration']} minutes",
            f"Line: {trip['line']}",
            f"Transfer Required: {'Yes' if trip['transfer'] else 'No'}",
        ]

        return "\n".join(lines)

    def format_co2_info(self, co2_data: Dict[str, Any]) -> str:
        """Format CO2 information for display"""
        lines = [
            "\n🌱 Environmental Impact:",
            "=" * 60,
            f"Metro CO2: {co2_data['co2metro']} kg",
            f"Car CO2: {co2_data['co2Car']} kg",
            f"Savings: {co2_data['diff']} kg",
            f"Metro Distance: {co2_data['metroDistance']} km",
            f"Car Distance: {co2_data['googleDistance']} km",
        ]

        return "\n".join(lines)

    def format_exit_info(self, exits: Dict[str, Any]) -> str:
        """Format exit information for display"""
        is_night = self.is_nighttime()

        lines = [f"\n🚪 Station Exits {'(Night Mode)' if is_night else '(Day Mode)'}:", "=" * 60]

        # Origin exits
        lines.append("\n📍 Origin Station Exits:")
        origin_exits = self.filter_available_exits(exits.get("origin", []))
        for exit_info in origin_exits:
            status = "✅ OPEN" if exit_info["available"] else "🔒 CLOSED"
            elevator = "♿ Elevator" if exit_info.get("elevator") else "🚶 Stairs"
            nocturnal = "🌙 24h" if exit_info.get("nocturnal") else "☀️ Day only"

            lines.append(f"  {status} - {exit_info['name']}\n    {elevator} | {nocturnal}")

        # Destination exits
        lines.append("\n📍 Destination Station Exits:")
        destiny_exits = self.filter_available_exits(exits.get("destiny", []))
        for exit_info in destiny_exits:
            status = "✅ OPEN" if exit_info["available"] else "🔒 CLOSED"
            elevator = "♿ Elevator" if exit_info.get("elevator") else "🚶 Stairs"
            nocturnal = "🌙 24h" if exit_info.get("nocturnal") else "☀️ Day only"

            lines.append(f"  {status} - {exit_info['name']}\n    {elevator} | {nocturnal}")

        return "\n".join(lines)

    def format_complete_info(self, data: Dict[str, Any]) -> str:
        """Format all information for display"""
        sections = [
            "=" * 60,
            "🚇 METRO BILBAO - ROUTE INFORMATION",
            "=" * 60,
            self.format_trip_info(data["trip"]),
            self.format_train_info(data["trains"]),
            self.format_exit_info(data["exits"]),
            self.format_co2_info(data["co2Metro"]),
        ]

        # Add messages if any
        if data.get("messages"):
            sections.append("\n⚠️ Important Messages:")
            sections.append("=" * 60)
            for msg in data["messages"]:
                sections.append(f"  • {msg}")

        return "\n".join(sections)
