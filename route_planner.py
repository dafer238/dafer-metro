from typing import Dict, List, Any, Optional
from metro_client import MetroClient


# Station code to name mapping
STATION_NAMES = {
    "PLE": "Plentzia",
    "SOP": "Sopela",
    "LAR": "Larrabasterra",
    "BER": "Berango",
    "IBR": "Ibarbengoa",
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
    "SMM": "Santimami/San Mamés",
    "IND": "Indautxu",
    "MOY": "Moyua",
    "ABN": "Abando",
    "CAD": "Zazpikaleak/Casco Viejo",
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
    "BAS": "Basauri",
    "ARZ": "Ariz",
    "MAT": "Matiko",
    "URI": "Uribarri",
    "ZUR": "Zurbaranbarri",
    "TXU": "Txurdinaga",
    "OTX": "Otxarkoaga",
    "KUK": "Kukullaga",
}


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
        "SIN",
        "SAR",
        "DEU",
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

# Transfer stations used for connections
# SIN (Abando): L1 ↔ L2
# CAD (Casco Viejo/Zazpikaleak): L1/L2 ↔ L3
TRANSFER_STATIONS = {
    "L1-L2": "SIN",  # Abando for L1 ↔ L2 transfers
    "L1-L3": "CAD",  # Casco Viejo for L1 ↔ L3 transfers
    "L2-L3": "CAD",  # Casco Viejo for L2 ↔ L3 transfers
}


class RoutePlanner:
    """Plan routes between stations, including transfers"""

    def __init__(self):
        self.metro_client = MetroClient()

    def _find_transfer_station(self, origin: str, destination: str) -> Optional[str]:
        """
        Find the optimal transfer station between origin and destination

        Only 2 transfer stations are used:
        - SIN (Abando): for L1 ↔ L2 transfers
        - CAD (Casco Viejo): for L1/L2 ↔ L3 transfers

        Args:
            origin: Origin station code
            destination: Destination station code

        Returns:
            Transfer station code or None if no transfer needed
        """
        # Find which lines contain origin and destination
        origin_line = None
        destination_line = None

        for line, stations in METRO_NETWORK.items():
            if origin in stations:
                origin_line = line
            if destination in stations:
                destination_line = line

        if not origin_line or not destination_line or origin_line == destination_line:
            return None

        # Determine transfer station based on line combination
        lines = {origin_line, destination_line}

        # L1 ↔ L2: use SIN (Abando)
        if lines == {"L1", "L2"}:
            return "SIN"

        # L1 ↔ L3 or L2 ↔ L3: use CAD (Casco Viejo)
        if "L3" in lines:
            return "CAD"

        return None

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

        if route_data["trip"]["transfer"]:
            # Get transfer station code - calculate it if not provided by API
            transfer_station = route_data["trip"].get("transferStation")

            if not transfer_station or transfer_station == "Unknown":
                # Calculate the optimal transfer station
                transfer_station = self._find_transfer_station(origin, destination)

            if not transfer_station:
                # Fallback if we can't determine transfer station
                transfer_station = "Unknown"

            # Calculate timing for first leg
            first_leg_duration = route_data["trip"].get("duration", 0) // 2

            # Get the next train departure time from origin
            first_train_departure = 0
            if route_data.get("trains") and len(route_data["trains"]) > 0:
                first_train_departure = route_data["trains"][0].get("estimated", 0)

            # Calculate arrival time at transfer station
            arrival_at_transfer = first_train_departure + first_leg_duration

            # Get second line information
            second_line = route_data["trip"].get("secondLine", route_data["trip"]["line"])

            # Fetch train times from transfer station to destination
            transfer_wait = 5  # Default fallback
            second_leg_duration = route_data["trip"].get("duration", 0) - first_leg_duration

            try:
                # Get train schedule from transfer station to destination
                print(f"DEBUG: Fetching trains from {transfer_station} to {destination}")
                print(f"DEBUG: Arrival at transfer: {arrival_at_transfer} minutes")

                transfer_route = await self.metro_client.get_route_info(
                    transfer_station, destination
                )

                if transfer_route.get("trains"):
                    print(
                        f"DEBUG: Found {len(transfer_route['trains'])} trains from transfer station"
                    )
                    # Find the first train that departs after we arrive at transfer station
                    for train in transfer_route["trains"]:
                        train_departure_time = train.get("estimated", 0)
                        print(
                            f"DEBUG: Train departs in {train_departure_time} min (arrival={arrival_at_transfer})"
                        )

                        # If this train departs after or when we arrive, use it
                        if train_departure_time >= arrival_at_transfer:
                            transfer_wait = train_departure_time - arrival_at_transfer
                            print(
                                f"DEBUG: Found matching train! Wait time: {transfer_wait} minutes"
                            )
                            break
                    else:
                        # If no train found departing after arrival, use the first train's time as minimum wait
                        if transfer_route["trains"]:
                            transfer_wait = max(5, transfer_route["trains"][0].get("estimated", 5))
                            print(
                                f"DEBUG: No train after arrival, using first train wait: {transfer_wait}"
                            )

                    # Use actual duration from transfer to destination
                    second_leg_duration = transfer_route["trip"].get(
                        "duration", second_leg_duration
                    )
            except Exception as e:
                # If API call fails, fall back to estimated times
                print(f"Could not fetch transfer train times: {e}")
                transfer_wait = 5  # Assume 5 minutes wait time at transfer

            total_time = first_leg_duration + transfer_wait + second_leg_duration

            # Get station names
            transfer_station_name = STATION_NAMES.get(transfer_station, transfer_station)
            origin_name = route_data["trip"]["fromStation"].get(
                "name", STATION_NAMES.get(origin, origin)
            )
            destination_name = route_data["trip"]["toStation"].get(
                "name", STATION_NAMES.get(destination, destination)
            )

            option = {
                "description": f"Transfer at {transfer_station_name}",
                "firstLeg": {
                    "from": origin,
                    "fromName": origin_name,
                    "to": transfer_station,
                    "toName": transfer_station_name,
                    "duration": first_leg_duration,
                    "line": route_data["trip"]["line"],
                    "departure": first_train_departure,
                    "arrival": arrival_at_transfer,
                },
                "transferWait": transfer_wait,
                "secondLeg": {
                    "from": transfer_station,
                    "fromName": transfer_station_name,
                    "to": destination,
                    "toName": destination_name,
                    "duration": second_leg_duration,
                    "line": second_line,
                    "departure": arrival_at_transfer + transfer_wait,
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

            # Show detailed transfer timing
            first_leg = option["firstLeg"]
            if "departure" in first_leg and "arrival" in first_leg:
                lines.append(
                    f"     Depart: +{first_leg['departure']} min, Arrive: +{first_leg['arrival']} min"
                )

            lines.append(f"  ⏱️  Transfer wait: {option['transferWait']} minutes")

            lines.append(f"  2️⃣ {option['secondLeg']['from']} → {option['secondLeg']['to']}")
            lines.append(
                f"     Line: {option['secondLeg']['line']}, Duration: {option['secondLeg']['duration']} min"
            )

            # Show second leg departure time
            if "departure" in option["secondLeg"]:
                lines.append(f"     Depart: +{option['secondLeg']['departure']} min")

            lines.append(f"  ⏰ Total time: {option['totalDuration']} minutes")

        return "\n".join(lines)
