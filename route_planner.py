from typing import Dict, List, Any, Optional
from metro_client import MetroClient


# Station code to name mapping
STATION_NAMES = {
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
        "IBB",
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
        "SAM",
        "IND",
        "MOY",
        "ABA",
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
        "SAM",
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

    @staticmethod
    def _format_time(total_seconds: float) -> str:
        """Format seconds as MM:SS"""
        mins = int(total_seconds // 60)
        secs = int(total_seconds % 60)
        return f"{mins:02d}:{secs:02d}"

    @staticmethod
    def _format_duration(total_seconds: float) -> str:
        """Format duration in minutes (e.g., '13 minutes')"""
        mins = int(total_seconds // 60)
        secs = int(total_seconds % 60)
        if secs > 0:
            return f"{mins} min {secs} sec"
        return f"{mins} minutes"

    @staticmethod
    def _calculate_arrival_time(departure_seconds: float) -> str:
        """Calculate expected arrival time from now"""
        from datetime import datetime, timedelta

        arrival = datetime.now() + timedelta(seconds=departure_seconds)
        return arrival.strftime("%H:%M:%S")

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

        # Add expected arrival times to each train
        from datetime import datetime, timedelta

        trip_duration_sec = route_data["trip"].get("duration", 0) * 60

        for train in route_data.get("trains", []):
            estimated_min = train.get("estimated", 0)
            total_time_sec = estimated_min * 60 + trip_duration_sec
            arrival_time = datetime.now() + timedelta(seconds=total_time_sec)
            train["arrivalAtDestination"] = arrival_time.strftime("%H:%M:%S")
            train["totalTimeToDestination"] = self._format_duration(total_time_sec)

        # Calculate earliest arrival time
        if route_data.get("trains") and len(route_data["trains"]) > 0:
            first_train = route_data["trains"][0]
            route_data["earliestArrival"] = first_train.get("arrivalAtDestination")

        # Check if transfer is required
        if route_data["trip"]["transfer"]:
            # Find transfer options
            transfer_options = await self._find_transfer_options(origin, destination, route_data)
            route_data["transferOptions"] = transfer_options

            # Update earliest arrival if transfer is faster
            if transfer_options and len(transfer_options) > 0:
                transfer_arrival = transfer_options[0].get("expectedArrival")
                if transfer_arrival:
                    route_data["earliestArrival"] = transfer_arrival

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

            # Calculate timing for first leg (convert to seconds)
            first_leg_duration_sec = (route_data["trip"].get("duration", 0) // 2) * 60

            # Get the next train departure time from origin (convert to seconds)
            first_train_departure_sec = 0
            if route_data.get("trains") and len(route_data["trains"]) > 0:
                first_train_departure_sec = route_data["trains"][0].get("estimated", 0) * 60

            # Calculate arrival time at transfer station
            arrival_at_transfer_sec = first_train_departure_sec + first_leg_duration_sec

            # Get second line information
            second_line = route_data["trip"].get("secondLine", route_data["trip"]["line"])

            # Fetch train times from transfer station to destination
            # Minimum 30 seconds transfer time (time to walk between platforms)
            transfer_wait_sec = 30  # Default fallback
            second_leg_duration_sec = (
                route_data["trip"].get("duration", 0) - (first_leg_duration_sec // 60)
            ) * 60

            try:
                # Get train schedule from transfer station to destination
                transfer_route = await self.metro_client.get_route_info(
                    transfer_station, destination
                )

                if transfer_route.get("trains"):
                    # Find the first train that departs after we arrive at transfer station
                    arrival_at_transfer_min = arrival_at_transfer_sec / 60
                    for train in transfer_route["trains"]:
                        train_departure_time = train.get("estimated", 0)

                        # If this train departs after we arrive, use it
                        # Add minimum 30 seconds for platform transfer
                        if train_departure_time * 60 >= arrival_at_transfer_sec:
                            transfer_wait_sec = max(
                                30, train_departure_time * 60 - arrival_at_transfer_sec
                            )
                            break
                    else:
                        # If no train found departing after arrival, use the first train's time as minimum wait
                        if transfer_route["trains"]:
                            transfer_wait_sec = max(
                                30, transfer_route["trains"][0].get("estimated", 5) * 60
                            )

                    # Use actual duration from transfer to destination
                    second_leg_duration_sec = (
                        transfer_route["trip"].get("duration", second_leg_duration_sec // 60) * 60
                    )
            except Exception as e:
                # If API call fails, fall back to estimated times
                print(f"Could not fetch transfer train times: {e}")
                transfer_wait_sec = 30  # Minimum 30 seconds wait time at transfer

            total_time_sec = first_leg_duration_sec + transfer_wait_sec + second_leg_duration_sec

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
                    "duration": first_leg_duration_sec,
                    "durationFormatted": self._format_duration(first_leg_duration_sec),
                    "line": route_data["trip"]["line"],
                    "departure": first_train_departure_sec,
                    "departureFormatted": self._format_time(first_train_departure_sec),
                    "departureTime": self._calculate_arrival_time(first_train_departure_sec),
                    "arrival": arrival_at_transfer_sec,
                    "arrivalFormatted": self._format_time(arrival_at_transfer_sec),
                    "arrivalTime": self._calculate_arrival_time(arrival_at_transfer_sec),
                },
                "transferWait": transfer_wait_sec,
                "transferWaitFormatted": self._format_duration(transfer_wait_sec),
                "secondLeg": {
                    "from": transfer_station,
                    "fromName": transfer_station_name,
                    "to": destination,
                    "toName": destination_name,
                    "duration": second_leg_duration_sec,
                    "durationFormatted": self._format_duration(second_leg_duration_sec),
                    "line": second_line,
                    "departure": arrival_at_transfer_sec + transfer_wait_sec,
                    "departureFormatted": self._format_time(
                        arrival_at_transfer_sec + transfer_wait_sec
                    ),
                    "departureTime": self._calculate_arrival_time(
                        arrival_at_transfer_sec + transfer_wait_sec
                    ),
                },
                "totalDuration": total_time_sec,
                "totalDurationFormatted": self._format_duration(total_time_sec),
                "expectedArrival": self._calculate_arrival_time(total_time_sec),
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
                f"     Line: {option['firstLeg']['line']}, Duration: {option['firstLeg'].get('durationFormatted', str(option['firstLeg']['duration']) + ' min')}"
            )

            # Show detailed transfer timing
            first_leg = option["firstLeg"]
            if "departure" in first_leg and "arrival" in first_leg:
                depart_fmt = first_leg.get(
                    "departureFormatted", str(first_leg["departure"]) + " min"
                )
                arrival_fmt = first_leg.get("arrivalFormatted", str(first_leg["arrival"]) + " min")
                lines.append(f"     Depart: +{depart_fmt}, Arrive: +{arrival_fmt}")

            wait_fmt = option.get("transferWaitFormatted", str(option["transferWait"]) + " minutes")
            lines.append(f"  ⏱️  Transfer wait: {wait_fmt}")

            lines.append(f"  2️⃣ {option['secondLeg']['from']} → {option['secondLeg']['to']}")
            lines.append(
                f"     Line: {option['secondLeg']['line']}, Duration: {option['secondLeg'].get('durationFormatted', str(option['secondLeg']['duration']) + ' min')}"
            )

            # Show second leg departure time
            if "departure" in option["secondLeg"]:
                depart_fmt = option["secondLeg"].get(
                    "departureFormatted", str(option["secondLeg"]["departure"]) + " min"
                )
                lines.append(f"     Depart: +{depart_fmt}")

            total_fmt = option.get(
                "totalDurationFormatted", str(option["totalDuration"]) + " minutes"
            )
            lines.append(f"  ⏰ Total time: {total_fmt}")

        return "\n".join(lines)
