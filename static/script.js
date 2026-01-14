// Station data cache
let stationsCache = null;
let trainTimers = [];
let lastFetchTime = null;
let autoRefreshInterval = null;
let refreshIntervalSeconds = 10; // Default, will be updated from API
let metroBilbaoApiUrl = "https://api.metrobilbao.eus/metro/real-time"; // Default, will be updated from API
let currentLang = "es"; // Default language is Spanish
let previousTrainData = null; // Store previous train data for comparison

// Time synchronization with server
let timeOffset = 0; // Difference between server time and client time in milliseconds
let serverTimeSynced = false;

/**
 * Get the current time synchronized with the server
 * This uses the server's Madrid timezone time to avoid issues with incorrect client clocks
 * @returns {number} Current timestamp in milliseconds
 */
function getCurrentTime() {
  return Date.now() + timeOffset;
}

/**
 * Sync with server time on page load
 * Fetches the server's current time and calculates the offset from client time
 */
async function syncServerTime() {
  try {
    const clientTimeBefore = Date.now();
    const response = await fetch("/api/time");
    const clientTimeAfter = Date.now();

    if (!response.ok) {
      console.warn("Could not sync with server time, using client time");
      return;
    }

    const data = await response.json();

    // Calculate round-trip time and adjust for network latency
    const roundTripTime = clientTimeAfter - clientTimeBefore;
    const estimatedServerTime = data.timestamp + roundTripTime / 2;

    // Calculate offset
    timeOffset = estimatedServerTime - clientTimeAfter;
    serverTimeSynced = true;

    console.log(`Time synced with server. Offset: ${timeOffset}ms`);
  } catch (error) {
    console.warn("Failed to sync with server time:", error);
    // Continue with client time if sync fails
  }
}

/**
 * Log API call to backend for tracking
 * @param {string} origin - Origin station code
 * @param {string} destination - Destination station code
 * @param {string} callType - Type of call: 'route', 'transfer', 'refresh'
 * @param {boolean} success - Whether the call was successful
 * @param {number} statusCode - HTTP status code
 * @param {string} errorMessage - Error message if failed
 */
async function logAPICall(
  origin,
  destination,
  callType,
  success,
  statusCode = null,
  errorMessage = null,
) {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        origin,
        destination,
        callType,
        success,
        statusCode,
        errorMessage,
      }),
    });
  } catch (error) {
    console.warn("Failed to log API call:", error);
  }
}

/**
 * Fetch transfer route data from Metro Bilbao API
 * @param {string} transferStation - Transfer station code
 * @param {string} destination - Final destination station code
 * @returns {Promise<object|null>} Transfer route data or null if failed
 */
async function fetchTransferData(transferStation, destination) {
  try {
    const response = await fetch(
      `${metroBilbaoApiUrl}/${transferStation}/${destination}`,
    );

    const success = response.ok;
    const statusCode = response.status;

    if (!success) {
      await logAPICall(
        transferStation,
        destination,
        "transfer",
        false,
        statusCode,
        `Failed to fetch transfer data`,
      );
      return null;
    }

    const data = await response.json();
    await logAPICall(
      transferStation,
      destination,
      "transfer",
      true,
      statusCode,
    );
    return data;
  } catch (error) {
    console.error("Error fetching transfer data:", error);
    await logAPICall(
      transferStation,
      destination,
      "transfer",
      false,
      null,
      error.message,
    );
    return null;
  }
}

// Translation dictionary
const translations = {
  es: {
    header: {
      title: "🚇 Planificador Metro Bilbao, al segundo",
      subtitle: "Información en tiempo real",
    },
    form: {
      origin: "Estación de origen",
      originPlaceholder: "ej., ETX (Etxebarri)",
      destination: "Estación de destino",
      destinationPlaceholder: "ej., ARZ (Ariz)",
      swapTitle: "Intercambiar estaciones",
      searchButton: "Buscar ruta",
    },
    loading: {
      text: "Obteniendo información de ruta...",
    },
    results: {
      tripOverview: "Vista general del viaje",
      metroSchedules: "Salidas de metro",
      transferRequired: "🔄 Transbordo necesario",
      stationExits: "Salidas de estación",
      originStation: "Estación de origen",
      destinationStation: "Estación de destino",
      environmentalImpact: "Impacto ambiental",
      importantMessages: "Mensajes importantes",
    },
    footer: {
      dataProvided: "Datos proporcionados por",
      madeWith: "Hecho con ❤️",
    },
    tripInfo: {
      from: "Desde",
      to: "Hasta",
      duration: "Duración",
      line: "Línea",
      transfer: "Transbordo",
      yes: "Sí",
      no: "No",
      minutes: "minutos",
      earliestArrival: "Llegada más temprana",
    },
    trains: {
      noTrains: "No hay trenes disponibles en este momento.",
      wagons: "vagones",
      toDestination: "hasta destino",
      departsIn: "Sale en",
      arrivesAtOrigin: "Llega al origen:",
      arrivesAtDestination: "Llega al destino:",
    },
    transfer: {
      transferWaitAt: "Espera de transbordo en",
      totalJourneyTime: "Tiempo total de viaje:",
      arrivalAtDestination: "Llegada al destino:",
      nextTrainDeparts: "Próximo tren sale:",
      arrivesAtTransfer: "Llega al transbordo:",
    },
    exits: {
      open: "✅ ABIERTA",
      closed: "⚠️ Posiblemente cerrada",
      noExits: "No hay información de salidas disponible",
      elevator: "♿ Ascensor",
      stairs: "🚶 Escaleras",
      h24: "🌙 24h",
      dayOnly: "☀️ Solo de día",
    },
    co2: {
      metroCO2: "🚇 CO2 Metro",
      carCO2: "🚗 CO2 Coche",
      youSave: "💚 Ahorras",
    },
    nightMode: {
      night: "🌙 Modo nocturno",
      day: "☀️ Modo diurno",
    },
    visitors: {
      visitor: "visitante único",
      visitors: "visitantes únicos",
      today: "hoy",
    },
    errors: {
      enterBoth: "Por favor, introduce las estaciones de origen y destino",
      samStation: "El origen y el destino no pueden ser iguales",
      fetchFailed: "Error al obtener la información de ruta de Metro Bilbao",
      processFailed: "Error al procesar los datos de ruta",
      checkStations:
        "Por favor, verifica los códigos de estación e inténtalo de nuevo.",
    },
  },
  en: {
    header: {
      title: "🚇 Metro Bilbao Route Planner",
      subtitle: "Real-time metro information and route planning",
    },
    form: {
      origin: "Origin station",
      originPlaceholder: "e.g., ETX (Etxebarri)",
      destination: "Destination station",
      destinationPlaceholder: "e.g., ARZ (Ariz)",
      swapTitle: "Swap stations",
      searchButton: "Find route",
    },
    loading: {
      text: "Fetching route information...",
    },
    results: {
      tripOverview: "Trip overview",
      metroSchedules: "Metro departures",
      transferRequired: "🔄 Transfer required",
      stationExits: "Station wxits",
      originStation: "Origin station",
      destinationStation: "Destination station",
      environmentalImpact: "Environmental impact",
      importantMessages: "Important messages",
    },
    footer: {
      dataProvided: "Data provided by",
      madeWith: "Made with ❤️",
    },
    tripInfo: {
      from: "From",
      to: "To",
      duration: "Duration",
      line: "Line",
      transfer: "Transfer",
      yes: "Yes",
      no: "No",
      minutes: "minutes",
      earliestArrival: "Earliest arrival",
    },
    trains: {
      noTrains: "No trains available at this time.",
      wagons: "wagons",
      toDestination: "to destination",
      departsIn: "Departs in",
      arrivesAtOrigin: "Arrives at origin:",
      arrivesAtDestination: "Arrives at destination:",
    },
    transfer: {
      transferWaitAt: "Transfer wait at",
      totalJourneyTime: "Total journey time:",
      arrivalAtDestination: "Arrival at destination:",
      nextTrainDeparts: "Next train departs:",
      arrivesAtTransfer: "Arrives at transfer:",
    },
    exits: {
      open: "✅ OPEN",
      closed: "⚠️ Might be closed",
      noExits: "No exit information available",
      elevator: "♿ Elevator",
      stairs: "🚶 Stairs",
      h24: "🌙 24h",
      dayOnly: "☀️ Day only",
    },
    co2: {
      metroCO2: "🚇 Metro CO2",
      carCO2: "🚗 Car CO2",
      youSave: "💚 You Save",
    },
    nightMode: {
      night: "🌙 Night Mode",
      day: "☀️ Day Mode",
    },
    visitors: {
      visitor: "unique visitor",
      visitors: "unique visitors",
      today: "today",
    },
    errors: {
      enterBoth: "Please enter both origin and destination stations",
      samStation: "Origin and destination cannot be the same",
      fetchFailed: "Failed to fetch route information from Metro Bilbao",
      processFailed: "Failed to process route data",
      checkStations: "Please check station codes and try again.",
    },
  },
};

// Translation helper function
function t(key) {
  const keys = key.split(".");
  let value = translations[currentLang];
  for (const k of keys) {
    value = value?.[k];
  }
  return value || key;
}

// Apply translations to page
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    const translation = t(key);
    if (element.innerHTML.includes("<a")) {
      // Preserve links in footer
      const link = element.querySelector("a");
      if (link) {
        const linkHTML = link.outerHTML;
        element.innerHTML = translation + " " + linkHTML;
      } else {
        element.textContent = translation;
      }
    } else {
      element.textContent = translation;
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    element.placeholder = t(key);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.getAttribute("data-i18n-title");
    element.title = t(key);
  });

  // Update page title
  document.title = t("header.title").replace("🚇 ", "") + " - Metro Bilbao";

  // Update html lang attribute
  document.documentElement.lang = currentLang;

  // Update language toggle button
  const langToggle = document.getElementById("langToggle");
  if (langToggle) {
    langToggle.textContent = currentLang === "es" ? "EN" : "ES";
  }

  // Update visitor counter with current language
  updateVisitorCount();

  // Update night mode indicator with current language
  updateNightMode();

  // Re-render results if they exist
  if (window.currentRouteData) {
    displayResults(window.currentRouteData);
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", async () => {
  // Sync with server time first (to avoid client clock issues)
  await syncServerTime();

  // Load saved language preference
  const savedLang = localStorage.getItem("metroLang");
  if (savedLang) {
    currentLang = savedLang;
  }

  // Apply translations
  applyTranslations();

  // Load stations
  await loadStations();

  // Check night mode
  await updateNightMode();

  // Load visitor count
  await updateVisitorCount();

  // Setup event listeners
  setupEventListeners();

  // Setup visibility change listener for smart updates
  setupVisibilityListener();

  // Load saved stations
  loadSavedStations();
});

async function loadStations() {
  try {
    const response = await fetch("/api/stations");
    const data = await response.json();
    stationsCache = data.stations;
  } catch (error) {
    console.error("Error loading stations:", error);
    stationsCache = {};
  }
}

async function updateVisitorCount() {
  try {
    const response = await fetch("/api/visitors");
    const data = await response.json();
    const counter = document.getElementById("visitorCounter");
    if (counter && data.count !== undefined) {
      const plural =
        data.count === 1 ? t("visitors.visitor") : t("visitors.visitors");
      counter.textContent = `👥 ${data.count} ${plural} ${t("visitors.today")}!`;
    }
  } catch (error) {
    console.error("Error loading visitor count:", error);
    const counter = document.getElementById("visitorCounter");
    if (counter) {
      counter.textContent = "";
    }
  }
}

async function updateNightMode() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();

    // Update refresh interval from API
    if (data.autoRefreshInterval) {
      refreshIntervalSeconds = data.autoRefreshInterval;
    }

    // Update Metro Bilbao API URL from config
    if (data.apiBaseUrl) {
      metroBilbaoApiUrl = data.apiBaseUrl;
    }

    const indicator = document.getElementById("nightModeIndicator");
    if (data.nightMode) {
      indicator.textContent = t("nightMode.night");
      indicator.style.display = "block";
    } else {
      indicator.textContent = t("nightMode.day");
      indicator.style.display = "block";
    }
  } catch (error) {
    console.error("Error checking night mode:", error);
  }
}

function setupVisibilityListener() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Page is hidden (minimized or in background) - stop updates
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log("Page hidden - pausing updates");
      }
    } else {
      // Page is visible again - resume updates
      const origin = document
        .getElementById("origin")
        .value.trim()
        .toUpperCase();
      const destination = document
        .getElementById("destination")
        .value.trim()
        .toUpperCase();

      if (origin && destination && !autoRefreshInterval) {
        console.log("Page visible - resuming updates");

        // Immediately refresh data
        refreshTrainData(origin, destination);

        // Restart interval
        autoRefreshInterval = setInterval(() => {
          if (origin && destination) {
            refreshTrainData(origin, destination);
          }
        }, refreshIntervalSeconds * 1000);
      }
    }
  });
}

function setupEventListeners() {
  const searchButton = document.getElementById("searchButton");
  const swapButton = document.getElementById("swapButton");
  const originInput = document.getElementById("origin");
  const destinationInput = document.getElementById("destination");
  const langToggle = document.getElementById("langToggle");

  searchButton.addEventListener("click", handleSearch);
  swapButton.addEventListener("click", handleSwap);

  // Language toggle
  langToggle.addEventListener("click", () => {
    currentLang = currentLang === "es" ? "en" : "es";
    localStorage.setItem("metroLang", currentLang);
    applyTranslations();
  });

  // Enter key to search
  originInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSearch();
  });
  destinationInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSearch();
  });

  // Auto-complete with focus event to show all stations
  originInput.addEventListener("input", () => showSuggestions("origin"));
  destinationInput.addEventListener("input", () =>
    showSuggestions("destination"),
  );
  originInput.addEventListener("focus", () => showSuggestions("origin"));
  destinationInput.addEventListener("focus", () =>
    showSuggestions("destination"),
  );

  // Tab key autocomplete
  originInput.addEventListener("keydown", (e) =>
    handleTabComplete(e, "origin"),
  );
  destinationInput.addEventListener("keydown", (e) =>
    handleTabComplete(e, "destination"),
  );

  // Close suggestions when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".input-wrapper")) {
      document
        .querySelectorAll(".suggestions")
        .forEach((s) => s.classList.remove("active"));
    }
  });

  // Reposition dropdowns on scroll
  window.addEventListener("scroll", () => {
    const originSuggestions = document.getElementById("originSuggestions");
    const destinationSuggestions = document.getElementById(
      "destinationSuggestions",
    );

    if (originSuggestions.classList.contains("active")) {
      const originInput = document.getElementById("origin");
      const rect = originInput.getBoundingClientRect();
      originSuggestions.style.top = `${rect.bottom + 4}px`;
      originSuggestions.style.left = `${rect.left}px`;
    }

    if (destinationSuggestions.classList.contains("active")) {
      const destinationInput = document.getElementById("destination");
      const rect = destinationInput.getBoundingClientRect();
      destinationSuggestions.style.top = `${rect.bottom + 4}px`;
      destinationSuggestions.style.left = `${rect.left}px`;
    }
  });
}

function showSuggestions(inputId) {
  const input = document.getElementById(inputId);
  const suggestionsDiv = document.getElementById(`${inputId}Suggestions`);
  const value = input.value.toUpperCase().trim();

  if (!stationsCache) {
    suggestionsDiv.classList.remove("active");
    return;
  }

  let matches;

  if (!value) {
    // Show all stations in alphabetical order when input is empty
    matches = Object.entries(stationsCache).sort(
      ([codeA, nameA], [codeB, nameB]) => nameA.localeCompare(nameB),
    );
  } else {
    // Filter stations based on input
    matches = Object.entries(stationsCache)
      .filter(
        ([code, name]) =>
          code.includes(value) || name.toUpperCase().includes(value),
      )
      .sort(([codeA, nameA], [codeB, nameB]) => nameA.localeCompare(nameB));
  }

  if (matches.length === 0) {
    suggestionsDiv.classList.remove("active");
    return;
  }

  // Show up to 50 matches (or all if fewer)
  suggestionsDiv.innerHTML = matches
    .slice(0, 50)
    .map(
      ([code, name]) => `
        <div class="suggestion-item" onclick="selectStation('${inputId}', '${code}', '${name}')">
            <strong>${code}</strong> ${name}
        </div>
    `,
    )
    .join("");

  // Position dropdown using fixed positioning
  const rect = input.getBoundingClientRect();
  suggestionsDiv.style.top = `${rect.bottom + 4}px`;
  suggestionsDiv.style.left = `${rect.left}px`;
  suggestionsDiv.style.width = `${rect.width}px`;

  suggestionsDiv.classList.add("active");
}

function selectStation(inputId, code, name) {
  document.getElementById(inputId).value = code;
  document.getElementById(`${inputId}Suggestions`).classList.remove("active");
  saveStations();
}

function handleTabComplete(event, inputId) {
  if (event.key === "Tab") {
    const suggestionsDiv = document.getElementById(`${inputId}Suggestions`);
    const firstSuggestion = suggestionsDiv.querySelector(".suggestion-item");

    if (firstSuggestion && suggestionsDiv.classList.contains("active")) {
      event.preventDefault();
      const code = firstSuggestion.querySelector("strong").textContent;
      const name = firstSuggestion.textContent.replace(code, "").trim();
      selectStation(inputId, code, name);
    }
  }
}

function saveStations() {
  const origin = document.getElementById("origin").value.trim();
  const destination = document.getElementById("destination").value.trim();
  if (origin || destination) {
    localStorage.setItem("metroOrigin", origin);
    localStorage.setItem("metroDestination", destination);
  }
}

function loadSavedStations() {
  const savedOrigin = localStorage.getItem("metroOrigin");
  const savedDestination = localStorage.getItem("metroDestination");
  if (savedOrigin) {
    document.getElementById("origin").value = savedOrigin;
  }
  if (savedDestination) {
    document.getElementById("destination").value = savedDestination;
  }
}

function handleSwap() {
  const originInput = document.getElementById("origin");
  const destinationInput = document.getElementById("destination");

  const temp = originInput.value;
  originInput.value = destinationInput.value;
  destinationInput.value = temp;
}

async function handleSearch() {
  const origin = document.getElementById("origin").value.trim().toUpperCase();
  const destination = document
    .getElementById("destination")
    .value.trim()
    .toUpperCase();

  if (!origin || !destination) {
    showError(t("errors.enterBoth"));
    return;
  }

  if (origin === destination) {
    showError(t("errors.samStation"));
    return;
  }

  // Save stations
  saveStations();

  // Show loading
  hideError();
  hideResults();
  showLoading();

  try {
    // Step 1: Call Metro Bilbao API directly from client to avoid rate limiting on server IP
    const metroBilbaoResponse = await fetch(
      `${metroBilbaoApiUrl}/${origin}/${destination}`,
    );

    const mainRouteSuccess = metroBilbaoResponse.ok;
    const mainRouteStatus = metroBilbaoResponse.status;

    if (!mainRouteSuccess) {
      await logAPICall(
        origin,
        destination,
        "route",
        false,
        mainRouteStatus,
        "Failed to fetch main route",
      );
      throw new Error(t("errors.fetchFailed"));
    }

    const rawData = await metroBilbaoResponse.json();
    await logAPICall(origin, destination, "route", true, mainRouteStatus);

    // Step 2: If transfer is required, fetch transfer data from client
    let transferData = null;
    if (rawData.trip && rawData.trip.transfer) {
      const transferStation = rawData.trip.transferStation || "SIN"; // Default to San Inazio
      console.log(
        `Transfer required via ${transferStation}, fetching transfer route data...`,
      );
      transferData = await fetchTransferData(transferStation, destination);
    }

    // Step 3: Send raw data to our backend for processing (exit availability, calculations, etc.)
    const processResponse = await fetch("/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: rawData,
        transferData: transferData,
      }),
    });

    if (!processResponse.ok) {
      throw new Error(t("errors.processFailed"));
    }

    const processedData = await processResponse.json();

    displayResults(processedData);
  } catch (error) {
    console.error("Error fetching route:", error);
    showError(`${error.message}. ${t("errors.checkStations")}`);
  } finally {
    hideLoading();
  }
}

function showLoading() {
  document.getElementById("loadingSection").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loadingSection").classList.add("hidden");
}

function showError(message) {
  document.getElementById("errorText").textContent = message;
  document.getElementById("errorSection").classList.remove("hidden");
}

function hideError() {
  document.getElementById("errorSection").classList.add("hidden");
}

function hideResults() {
  document.getElementById("resultsSection").classList.add("hidden");
}

function displayResults(data) {
  // Clear any existing timers
  clearTrainTimers();

  // Store data for access by other functions
  window.currentRouteData = data;

  // Display trip info
  displayTripInfo(data.trip);

  // Display trains
  displayTrains(data.trains);

  // Display transfer info if needed
  if (data.trip.transfer && data.transferOptions) {
    displayTransferInfo(data.transferOptions);
  } else {
    document.getElementById("transferCard").classList.add("hidden");
  }

  // Display exits
  displayExits(data.exits);

  // Display CO2 info
  displayCO2Info(data.co2Metro);

  // Display messages if any
  if (data.messages && data.messages.length > 0) {
    displayMessages(data.messages);
  } else {
    document.getElementById("messagesCard").classList.add("hidden");
  }

  // Show results section
  document.getElementById("resultsSection").classList.remove("hidden");

  // Scroll to results
  document
    .getElementById("resultsSection")
    .scrollIntoView({ behavior: "smooth" });

  // Set up auto-refresh every N seconds (from config)
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  autoRefreshInterval = setInterval(() => {
    const origin = document.getElementById("origin").value.trim().toUpperCase();
    const destination = document
      .getElementById("destination")
      .value.trim()
      .toUpperCase();
    if (origin && destination) {
      refreshTrainData(origin, destination);
    }
  }, refreshIntervalSeconds * 1000);
}

function displayTripInfo(trip) {
  const data = window.currentRouteData || {};

  // Use earliestArrival from backend if available
  const earliestArrivalHtml = data.earliestArrival
    ? `<div class="label" style="margin-top: 8px; color: var(--primary-color);">${t("tripInfo.earliestArrival")}</div>
                <div class="value" style="color: var(--primary-color); font-weight: 600;">${data.earliestArrival}</div>`
    : "";

  const html = `
        <div class="trip-info-grid">
            <div class="trip-info-item">
                <div class="label">${t("tripInfo.from")}</div>
                <div class="value">${trip.fromStation.name}</div>
                <div class="label">${trip.fromStation.code}</div>
            </div>
            <div class="trip-info-item">
                <div class="label">${t("tripInfo.to")}</div>
                <div class="value">${trip.toStation.name}</div>
                <div class="label">${trip.toStation.code}</div>
            </div>
            <div class="trip-info-item">
                <div class="label">${t("tripInfo.duration")}</div>
                <div class="value">${trip.duration} ${t("tripInfo.minutes")}</div>
                ${earliestArrivalHtml}
            </div>
            <div class="trip-info-item">
                <div class="label">${t("tripInfo.line")}</div>
                <div class="value">${trip.line}</div>
            </div>
            <div class="trip-info-item">
                <div class="label">${t("tripInfo.transfer")}</div>
                <div class="value">
                    <span class="transfer-badge ${trip.transfer ? "transfer-yes" : "transfer-no"}">
                        ${trip.transfer ? t("tripInfo.yes") : t("tripInfo.no")}
                    </span>
                </div>
            </div>
        </div>
    `;

  document.getElementById("tripInfo").innerHTML = html;
}

function displayTrains(trains) {
  if (!trains || trains.length === 0) {
    document.getElementById("trainsInfo").innerHTML =
      `<p>${t("trains.noTrains")}</p>`;
    return;
  }

  lastFetchTime = getCurrentTime();
  const now = new Date(getCurrentTime());
  const routeData = window.currentRouteData || {};
  const tripDuration = routeData.trip ? routeData.trip.duration : 0;

  // Filter out trains that have already departed (more than 15 seconds past arrival time)
  const filteredTrains = trains.filter((train) => {
    const arrivalTime = new Date(train.time);
    const timeDiff = now - arrivalTime;
    return timeDiff < 15000; // Keep trains that haven't passed 15 seconds yet
  });

  if (filteredTrains.length === 0) {
    document.getElementById("trainsInfo").innerHTML =
      `<p>${t("trains.noTrains")}</p>`;
    return;
  }

  // Check if data has actually changed
  const currentTrainData = filteredTrains.map((t) => ({
    direction: t.direction,
    time: t.time,
    wagons: t.wagons,
  }));

  const hasDataChanged =
    !previousTrainData ||
    JSON.stringify(currentTrainData) !== JSON.stringify(previousTrainData);

  if (!hasDataChanged) {
    // Data hasn't changed, just update countdowns
    console.log("Train data unchanged, skipping redraw");
    return;
  }

  console.log("Train data changed, redrawing cards");

  // Detect delays and early arrivals by comparing with previous data
  const trainChanges = detectTrainChanges(filteredTrains, previousTrainData);

  // Store current data for next comparison
  previousTrainData = currentTrainData;

  // Separate first train (next metro) from upcoming trains
  const nextTrain = filteredTrains[0];
  const upcomingTrains = filteredTrains.slice(1);

  // Helper function to create train HTML
  const createTrainHtml = (train, index, isNext = false) => {
    const arrivalTime = new Date(train.time);
    const totalSeconds = Math.max(0, Math.round((arrivalTime - now) / 1000));
    const timeWithSeconds = arrivalTime.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    let arrivalAtDestStr = "";
    if (tripDuration > 0) {
      const arrivalAtDest = new Date(
        arrivalTime.getTime() + tripDuration * 60000,
      );
      arrivalAtDestStr = arrivalAtDest.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // Get change status for this train by index (delayed, early, or none)
    const changeStatus = trainChanges[index] || "none";
    const changeClass =
      changeStatus === "delayed"
        ? "blink-delay"
        : changeStatus === "early"
          ? "blink-early"
          : "";

    return `
        <div class="train-item ${isNext ? "next-train" : ""} ${changeClass}" data-arrival-time="${arrivalTime.getTime()}" data-time-display="${timeWithSeconds}" data-direction="${train.direction}">
            <div class="train-main-info">
                <div class="train-direction">🚇 ${train.direction}</div>
                <div class="train-details">
                    ${train.wagons} ${t("trains.wagons")}${train.totalTimeToDestinationSeconds ? " • " + formatDuration(train.totalTimeToDestinationSeconds) + " " + t("trains.toDestination") : ""}
                </div>
            </div>
            <div class="train-timing-info">
                <div class="train-time-container">
                    <span class="departs-label">${t("trains.departsIn")} </span>
                    <span class="train-time" data-seconds="${totalSeconds}" data-train-index="${index}">
                        ${formatTime(totalSeconds)}
                    </span>
                </div>
                <div class="train-details train-arrival-time">${t("trains.arrivesAtOrigin")} ${timeWithSeconds}</div>
                ${arrivalAtDestStr ? '<div class="train-details train-dest-time">' + t("trains.arrivesAtDestination") + " " + arrivalAtDestStr + "</div>" : ""}
            </div>
        </div>
        `;
  };

  let html = `
        <div class="next-train-section">
            ${createTrainHtml(nextTrain, 0, true)}
        </div>
    `;

  if (upcomingTrains.length > 0) {
    html += `
        <div class="upcoming-trains-section">
            <div class="train-list">
                ${upcomingTrains.map((train, index) => createTrainHtml(train, index + 1, false)).join("")}
            </div>
        </div>
        `;
  }

  document.getElementById("trainsInfo").innerHTML = html;

  // Remove blink animations after animation completes (1500ms)
  setTimeout(() => {
    document
      .querySelectorAll(".train-item.blink-delay, .train-item.blink-early")
      .forEach((item) => {
        item.classList.remove("blink-delay", "blink-early");
      });
  }, 1600);

  startTrainCountdown();
}

// Helper function to detect train changes (delays/early arrivals)
function detectTrainChanges(currentTrains, previousData) {
  const changes = {};

  if (!previousData || previousData.length === 0) {
    return changes;
  }

  // Compare trains by their position in the list
  // This allows tracking multiple trains to the same direction
  currentTrains.forEach((train, index) => {
    if (index < previousData.length) {
      const previousTrain = previousData[index];
      const currentTime = new Date(train.time).getTime();
      const previousTime = new Date(previousTrain.time).getTime();

      // Only compare if same direction (same train being tracked)
      if (train.direction === previousTrain.direction) {
        const timeDiff = currentTime - previousTime;
        // If more than 10 seconds difference (to avoid minor fluctuations)
        if (timeDiff > 10000) {
          changes[index] = "delayed";
          console.log(
            `Train #${index} to ${train.direction} delayed by ${Math.round(timeDiff / 1000)}s`,
          );
        } else if (timeDiff < -10000) {
          changes[index] = "early";
          console.log(
            `Train #${index} to ${train.direction} early by ${Math.round(-timeDiff / 1000)}s`,
          );
        }
      }
    }
  });

  return changes;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDuration(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (secs > 0) {
    return `${mins} min ${secs} sec`;
  }
  return `${mins} ${t("tripInfo.minutes")}`;
}

function startTrainCountdown() {
  clearTrainTimers();

  const interval = setInterval(() => {
    const trainTimeElements = document.querySelectorAll(
      ".train-time[data-seconds]",
    );
    const trainItems = document.querySelectorAll(
      ".train-item[data-arrival-time]",
    );
    const now = getCurrentTime();

    trainTimeElements.forEach((element) => {
      let seconds = parseInt(element.dataset.seconds);
      if (seconds > 0) {
        seconds--;
        element.dataset.seconds = seconds;
        element.textContent = formatTime(seconds);

        // Add blinking classes based on time remaining
        const trainItem = element.closest(".train-item");
        if (seconds < 30) {
          trainItem.classList.add("blink-red");
          trainItem.classList.remove("blink-yellow");
        } else if (seconds < 60) {
          trainItem.classList.add("blink-yellow");
          trainItem.classList.remove("blink-red");
        } else {
          trainItem.classList.remove("blink-red", "blink-yellow");
        }
      } else {
        element.textContent = "0:00";
      }
    });

    // Remove trains that have departed (15 seconds after expected time)
    trainItems.forEach((item) => {
      const arrivalTime = parseInt(item.dataset.arrivalTime);
      if (now > arrivalTime + 15000) {
        item.style.opacity = "0";
        item.style.transition = "opacity 0.5s";
        setTimeout(() => item.remove(), 500);
      }
    });
  }, 1000);

  trainTimers.push(interval);
}

function clearTrainTimers() {
  trainTimers.forEach((timer) => clearInterval(timer));
  trainTimers = [];
}

async function refreshTrainData(origin, destination) {
  try {
    console.log("Refreshing train data...");

    // Call Metro Bilbao API directly from client IP to avoid backend rate limiting
    const response = await fetch(
      `${metroBilbaoApiUrl}/${origin}/${destination}`,
    );

    const refreshSuccess = response.ok;
    const refreshStatus = response.status;

    if (!refreshSuccess) {
      await logAPICall(
        origin,
        destination,
        "refresh",
        false,
        refreshStatus,
        "Refresh failed",
      );
      console.error("Failed to fetch from Metro Bilbao API");
      return;
    }

    const rawData = await response.json();
    await logAPICall(origin, destination, "refresh", true, refreshStatus);

    // If transfer is required, fetch transfer data
    let transferData = null;
    if (rawData.trip && rawData.trip.transfer) {
      const transferStation = rawData.trip.transferStation || "SIN";
      transferData = await fetchTransferData(transferStation, destination);
    }

    // Send raw data to backend for processing (adds totalTimeToDestination, etc.)
    const processResponse = await fetch("/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: rawData,
        transferData: transferData,
      }),
    });

    if (!processResponse.ok) {
      console.error("Failed to process data on backend");
      return;
    }

    const processedData = await processResponse.json();
    console.log("Train data refreshed successfully");

    // Update stored route data with fresh data
    if (window.currentRouteData && processedData) {
      // Update trains
      if (processedData.trains) {
        window.currentRouteData.trains = processedData.trains;
        displayTrains(processedData.trains);
      }

      // Update earliest arrival if it changed
      if (processedData.earliestArrival) {
        window.currentRouteData.earliestArrival = processedData.earliestArrival;
        // Re-render trip info to show updated earliest arrival
        displayTripInfo(window.currentRouteData.trip);
      }

      // Update transfer options if they changed
      if (processedData.transferOptions) {
        window.currentRouteData.transferOptions = processedData.transferOptions;
        displayTransferInfo(processedData.transferOptions);
      }
    }
  } catch (error) {
    console.error("Error refreshing train data:", error);
  }
}

function displayTransferInfo(transferOptions) {
  if (!transferOptions || transferOptions.length === 0) {
    document.getElementById("transferCard").classList.add("hidden");
    return;
  }

  const html = transferOptions
    .map(
      (option, index) => `
        <div class="transfer-steps">
            <div class="transfer-step">
                <div class="step-number">1</div>
                <div class="step-content">
                    <div class="step-route">
                        ${option.firstLeg.fromName || option.firstLeg.from} → ${option.firstLeg.toName || option.firstLeg.to}
                    </div>
                    <div class="step-info">
                        <span style="opacity: 0.7; font-size: 0.85em;">${option.firstLeg.from} → ${option.firstLeg.to}</span> •
                        ${t("tripInfo.line")} ${option.firstLeg.line} • ${option.firstLeg.durationFormatted || option.firstLeg.duration + " " + t("tripInfo.minutes")}
                        ${option.firstLeg.arrivalTime ? '<br><span style="opacity: 0.8;">' + t("transfer.arrivesAtTransfer") + " " + option.firstLeg.arrivalTime + "</span>" : ""}
                    </div>
                </div>
            </div>

            <div class="transfer-step">
                <div class="step-number">⏱️</div>
                <div class="step-content">
                    <div class="step-route">${t("transfer.transferWaitAt")} ${option.secondLeg.fromName || option.secondLeg.from}</div>
                    <div class="step-info">
                        <span style="opacity: 0.7; font-size: 0.85em;">${option.secondLeg.from}</span> •
                        ${option.transferWaitFormatted || option.transferWait + " " + t("tripInfo.minutes")}
                        ${option.secondLeg.departureTime ? '<br><span style="opacity: 0.8;">' + t("transfer.nextTrainDeparts") + " " + option.secondLeg.departureTime + "</span>" : ""}
                    </div>
                </div>
            </div>

            <div class="transfer-step">
                <div class="step-number">2</div>
                <div class="step-content">
                    <div class="step-route">
                        ${option.secondLeg.fromName || option.secondLeg.from} → ${option.secondLeg.toName || option.secondLeg.to}
                    </div>
                    <div class="step-info">
                        <span style="opacity: 0.7; font-size: 0.85em;">${option.secondLeg.from} → ${option.secondLeg.to}</span> •
                        ${t("tripInfo.line")} ${option.secondLeg.line} • ${option.secondLeg.durationFormatted || option.secondLeg.duration + " " + t("tripInfo.minutes")}
                    </div>
                </div>
            </div>

            <div style="text-align: center; padding: 16px; background: var(--light-color); border-radius: 8px; font-weight: 600;">
                ${t("transfer.totalJourneyTime")} ${option.totalDurationFormatted || option.totalDuration + " " + t("tripInfo.minutes")}
                ${option.expectedArrival ? '<br><span style="font-size: 0.95em; color: var(--primary-color); margin-top: 8px; display: block;">' + t("transfer.arrivalAtDestination") + " " + option.expectedArrival + "</span>" : ""}
            </div>
        </div>
    `,
    )
    .join("");

  document.getElementById("transferInfo").innerHTML = html;
  document.getElementById("transferCard").classList.remove("hidden");
}

function displayExits(exits) {
  // Origin exits
  const originHTML =
    exits.origin && exits.origin.length > 0
      ? exits.origin
          .map(
            (exit) => `
            <div class="exit-item ${exit.available ? "available" : "closed"}">
                <div class="exit-status">
                    ${exit.available ? t("exits.open") : t("exits.closed")}
                </div>
                <div class="exit-name">${exit.name}</div>
                ${
                  exit.issues && exit.issues.length > 0
                    ? `
                    <div class="exit-issues">
                        ${exit.issues.map((issue) => `<div class="issue-item">⚠️ ${issue}</div>`).join("")}
                    </div>
                `
                    : ""
                }
                <div class="exit-features">
                    <span class="feature-badge">
                        ${exit.elevator ? t("exits.elevator") : t("exits.stairs")}
                    </span>
                    <span class="feature-badge">
                        ${exit.nocturnal ? t("exits.h24") : t("exits.dayOnly")}
                    </span>
                </div>
            </div>
        `,
          )
          .join("")
      : `<p>${t("exits.noExits")}</p>`;

  // Destination exits
  const destHTML =
    exits.destiny && exits.destiny.length > 0
      ? exits.destiny
          .map(
            (exit) => `
            <div class="exit-item ${exit.available ? "available" : "closed"}">
                <div class="exit-status">
                    ${exit.available ? t("exits.open") : t("exits.closed")}
                </div>
                <div class="exit-name">${exit.name}</div>
                ${
                  exit.issues && exit.issues.length > 0
                    ? `
                    <div class="exit-issues">
                        ${exit.issues.map((issue) => `<div class="issue-item">⚠️ ${issue}</div>`).join("")}
                    </div>
                `
                    : ""
                }
                <div class="exit-features">
                    <span class="feature-badge">
                        ${exit.elevator ? t("exits.elevator") : t("exits.stairs")}
                    </span>
                    <span class="feature-badge">
                        ${exit.nocturnal ? t("exits.h24") : t("exits.dayOnly")}
                    </span>
                </div>
            </div>
        `,
          )
          .join("")
      : `<p>${t("exits.noExits")}</p>`;

  document.getElementById("originExits").innerHTML = originHTML;
  document.getElementById("destinationExits").innerHTML = destHTML;
}

function displayCO2Info(co2Data) {
  const html = `
        <div class="co2-comparison">
            <div class="co2-item co2-metro">
                <div class="co2-label">${t("co2.metroCO2")}</div>
                <div class="co2-value">${co2Data.co2metro}</div>
                <div class="co2-unit">kg CO2</div>
                <div class="co2-unit">${co2Data.metroDistance} km</div>
            </div>

            <div class="co2-item co2-car">
                <div class="co2-label">${t("co2.carCO2")}</div>
                <div class="co2-value">${co2Data.co2Car}</div>
                <div class="co2-unit">kg CO2</div>
                <div class="co2-unit">${co2Data.googleDistance} km</div>
            </div>

            <div class="co2-item co2-savings">
                <div class="co2-label">${t("co2.youSave")}</div>
                <div class="co2-value">${co2Data.diff}</div>
                <div class="co2-unit">kg CO2</div>
            </div>
        </div>
    `;

  document.getElementById("co2Info").innerHTML = html;
}

function displayMessages(messages) {
  const html = messages
    .map(
      (msg) => `
        <div class="message-item">${msg}</div>
    `,
    )
    .join("");

  document.getElementById("messagesInfo").innerHTML = html;
  document.getElementById("messagesCard").classList.remove("hidden");
}
