from typing import Dict, List, Any, Optional
from metro_client import MetroClient


# Metro Bilbao network structure
# L1: Plentzia ↔ Etxebarri
# L2: Kabiezes ↔ Basauri
# L3: Matiko ↔ Kukullaga

METRO_NETWORK = {
    "L1": [
        "PLE",
        "SOP",
        "LAR",
        "BER",
        "IBR",
        "BID",
        "ALG",
        "AIB",
        "NEG",
        "GOB",
        "ARE",
        "LAM",
        "LEI",
        "AST",
        "ERA",
        "LUT",
        "DEU",
        "SAR",
        "SMM",
        "IND",
        "MOY",
        "ABN",
        "CAD",
        "BOL",
        "ETX",
    ],
    "L2": [
        "KAB",
        "STZ",
        "PEN",
        "POR",
        "ABT",
        "SES",
        "URB",
        "BAG",
        "BAR",
        "ANS",
        "GUR",
        "BAS",
        "ARZ",
        "ETX",
        "BOL",
        "CAD",
        "ABN",
        "MOY",
        "SMM",
        "IND",
    ],
    "L3": ["MAT", "URI", "ZUR", "TXU", "OTX", "KUK", "BOL", "CAD"],
}

# Common transfer stations where lines intersect
TRANSFER_STATIONS = [
    "ETX",  # L1 ↔ L2
    "BOL",  # L1 ↔ L2 ↔ L3
    "CAD",  # L1 ↔ L2 ↔ L3 (Zazpikaleak/Casco Viejo)
    "ABN",  # L1 ↔ L2 (Abando)
    "MOY",  # L1 ↔ L2 (Moyua)
    "IND",  # L1 ↔ L2 (Indautxu)
    "SMM",  # L1 ↔ L2 (Santimami/San Mamés)
]


class RoutePlanner:
    """Plan routes between stations, including transfers"""

    def __init__(self):
        self.metro_client = MetroClient()

    async def get_route(self, origin: str, destination: str) -> Dict[str, Any]:
        """
        Get route information between two stations

        Args:
            origin: Origin station code
            destination: Destination station code

        Returns:
            Complete route information including transfers if needed
        """
        # Fetch data from API
        route_data = await self.metro_client.get_route_info(origin, destination)

        # Check if transfer is required
        if route_data["trip"]["transfer"]:
            # Find transfer options
            transfer_options = await self._find_transfer_options(origin, destination, route_data)
            route_data["transferOptions"] = transfer_options

        # Add formatted information
        route_data["formatted"] = self.metro_client.format_complete_info(route_data)

        # Add exit availability
        route_data["exits"]["origin"] = self.metro_client.filter_available_exits(
            route_data["exits"].get("origin", [])
        )
        route_data["exits"]["destiny"] = self.metro_client.filter_available_exits(
            route_data["exits"].get("destiny", [])
        )

        return route_data

    async def _find_transfer_options(
        self, origin: str, destination: str, route_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Find possible transfer options between stations

        Args:
            origin: Origin station code
            destination: Destination station code
            route_data: Original route data from API

        Returns:
            List of transfer options with timing information
        """
        transfer_options = []

        # For now, use the API's transfer information
        # In a more complete implementation, we would query multiple routes
        # through different transfer stations

        if route_data["trip"]["transfer"]:
            # Calculate timing for transfer
            first_leg_duration = route_data["trip"].get("duration", 0) // 2
            transfer_wait = 5  # Assume 5 minutes wait time at transfer
            second_leg_duration = route_data["trip"].get("duration", 0) - first_leg_duration

            total_time = first_leg_duration + transfer_wait + second_leg_duration

            option = {
                "description": f"Transfer at {route_data['trip'].get('transferStation', 'transfer station')}",
                "firstLeg": {
                    "from": origin,
                    "to": route_data["trip"].get("transferStation", "Unknown"),
                    "duration": first_leg_duration,
                    "line": route_data["trip"]["line"],
                },
                "transferWait": transfer_wait,
                "secondLeg": {
                    "from": route_data["trip"].get("transferStation", "Unknown"),
                    "to": destination,
                    "duration": second_leg_duration,
                    "line": route_data["trip"].get("secondLine", route_data["trip"]["line"]),
                },
                "totalDuration": total_time,
            }

            transfer_options.append(option)

        return transfer_options

    def calculate_arrival_time(
        self, train_departure: int, trip_duration: int, transfer_wait: int = 0
    ) -> Dict[str, Any]:
        """
        Calculate arrival time given departure and duration

        Args:
            train_departure: Minutes until train departs
            trip_duration: Duration of the trip in minutes
            transfer_wait: Additional wait time for transfers

        Returns:
            Dictionary with timing information
        """
        total_time = train_departure + trip_duration + transfer_wait

        return {
            "departureInMinutes": train_departure,
            "tripDuration": trip_duration,
            "transferWait": transfer_wait,
            "totalMinutes": total_time,
            "message": f"Depart in {train_departure} min → {trip_duration} min travel → "
            f"{f'{transfer_wait} min transfer → ' if transfer_wait > 0 else ''}"
            f"Total: {total_time} minutes",
        }

    def format_transfer_info(self, transfer_options: List[Dict[str, Any]]) -> str:
        """Format transfer options for display"""
        if not transfer_options:
            return ""

        lines = ["\n🔄 Transfer Options:", "=" * 60]

        for i, option in enumerate(transfer_options, 1):
            lines.append(f"\nOption {i}:")
            lines.append(f"  1️⃣ {option['firstLeg']['from']} → {option['firstLeg']['to']}")
            lines.append(
                f"     Line: {option['firstLeg']['line']}, Duration: {option['firstLeg']['duration']} min"
            )
            lines.append(f"  ⏱️  Transfer wait: ~{option['transferWait']} minutes")
            lines.append(f"  2️⃣ {option['secondLeg']['from']} → {option['secondLeg']['to']}")
            lines.append(
                f"     Line: {option['secondLeg']['line']}, Duration: {option['secondLeg']['duration']} min"
            )
            lines.append(f"  ⏰ Total time: {option['totalDuration']} minutes")

        return "\n".join(lines)
