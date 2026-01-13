// Station data cache
let stationsCache = null;
let trainTimers = [];
let lastFetchTime = null;
let autoRefreshInterval = null;
let refreshIntervalSeconds = 10; // Default, will be updated from API
let metroBilbaoApiUrl = 'https://api.metrobilbao.eus/metro/real-time'; // Default, will be updated from API

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Load stations
    await loadStations();
    
    // Check night mode
    await updateNightMode();
    
    // Load visitor count
    await updateVisitorCount();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load saved stations
    loadSavedStations();
});

async function loadStations() {
    try {
        const response = await fetch('/api/stations');
        const data = await response.json();
        stationsCache = data.stations;
    } catch (error) {
        console.error('Error loading stations:', error);
        stationsCache = {};
    }
}

async function updateVisitorCount() {
    try {
        const response = await fetch('/api/visitors');
        const data = await response.json();
        const counter = document.getElementById('visitorCounter');
        if (counter && data.count !== undefined) {
            const plural = data.count === 1 ? 'visitor' : 'visitors';
            counter.textContent = `👥 ${data.count} unique ${plural} today!`;
        }
    } catch (error) {
        console.error('Error loading visitor count:', error);
        const counter = document.getElementById('visitorCounter');
        if (counter) {
            counter.textContent = '';
        }
    }
}

async function updateNightMode() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        // Update refresh interval from API
        if (data.autoRefreshInterval) {
            refreshIntervalSeconds = data.autoRefreshInterval;
        }
        
        // Update Metro Bilbao API URL from config
        if (data.apiBaseUrl) {
            metroBilbaoApiUrl = data.apiBaseUrl;
        }
        
        const indicator = document.getElementById('nightModeIndicator');
        if (data.nightMode) {
            indicator.textContent = '🌙 Night Mode';
            indicator.style.display = 'block';
        } else {
            indicator.textContent = '☀️ Day Mode';
            indicator.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking night mode:', error);
    }
}

function setupEventListeners() {
    const searchButton = document.getElementById('searchButton');
    const swapButton = document.getElementById('swapButton');
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');
    
    searchButton.addEventListener('click', handleSearch);
    swapButton.addEventListener('click', handleSwap);
    
    // Enter key to search
    originInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    destinationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    // Auto-complete with focus event to show all stations
    originInput.addEventListener('input', () => showSuggestions('origin'));
    destinationInput.addEventListener('input', () => showSuggestions('destination'));
    originInput.addEventListener('focus', () => showSuggestions('origin'));
    destinationInput.addEventListener('focus', () => showSuggestions('destination'));
    
    // Tab key autocomplete
    originInput.addEventListener('keydown', (e) => handleTabComplete(e, 'origin'));
    destinationInput.addEventListener('keydown', (e) => handleTabComplete(e, 'destination'));
    
    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-wrapper')) {
            document.querySelectorAll('.suggestions').forEach(s => s.classList.remove('active'));
        }
    });
}

function showSuggestions(inputId) {
    const input = document.getElementById(inputId);
    const suggestionsDiv = document.getElementById(`${inputId}Suggestions`);
    const value = input.value.toUpperCase().trim();
    
    if (!stationsCache) {
        suggestionsDiv.classList.remove('active');
        return;
    }
    
    let matches;
    
    if (!value) {
        // Show all stations in alphabetical order when input is empty
        matches = Object.entries(stationsCache)
            .sort(([codeA, nameA], [codeB, nameB]) => nameA.localeCompare(nameB));
    } else {
        // Filter stations based on input
        matches = Object.entries(stationsCache)
            .filter(([code, name]) => 
                code.includes(value) || name.toUpperCase().includes(value)
            )
            .sort(([codeA, nameA], [codeB, nameB]) => nameA.localeCompare(nameB));
    }
    
    if (matches.length === 0) {
        suggestionsDiv.classList.remove('active');
        return;
    }
    
    // Show up to 10 matches
    suggestionsDiv.innerHTML = matches.slice(0, 10).map(([code, name]) => `
        <div class="suggestion-item" onclick="selectStation('${inputId}', '${code}', '${name}')">
            <strong>${code}</strong> ${name}
        </div>
    `).join('');
    
    suggestionsDiv.classList.add('active');
}

function selectStation(inputId, code, name) {
    document.getElementById(inputId).value = code;
    document.getElementById(`${inputId}Suggestions`).classList.remove('active');
    saveStations();
}

function handleTabComplete(event, inputId) {
    if (event.key === 'Tab') {
        const suggestionsDiv = document.getElementById(`${inputId}Suggestions`);
        const firstSuggestion = suggestionsDiv.querySelector('.suggestion-item');
        
        if (firstSuggestion && suggestionsDiv.classList.contains('active')) {
            event.preventDefault();
            const code = firstSuggestion.querySelector('strong').textContent;
            const name = firstSuggestion.textContent.replace(code, '').trim();
            selectStation(inputId, code, name);
        }
    }
}

function saveStations() {
    const origin = document.getElementById('origin').value.trim();
    const destination = document.getElementById('destination').value.trim();
    if (origin || destination) {
        localStorage.setItem('metroOrigin', origin);
        localStorage.setItem('metroDestination', destination);
    }
}

function loadSavedStations() {
    const savedOrigin = localStorage.getItem('metroOrigin');
    const savedDestination = localStorage.getItem('metroDestination');
    if (savedOrigin) {
        document.getElementById('origin').value = savedOrigin;
    }
    if (savedDestination) {
        document.getElementById('destination').value = savedDestination;
    }
}

function handleSwap() {
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');
    
    const temp = originInput.value;
    originInput.value = destinationInput.value;
    destinationInput.value = temp;
}

async function handleSearch() {
    const origin = document.getElementById('origin').value.trim().toUpperCase();
    const destination = document.getElementById('destination').value.trim().toUpperCase();
    
    if (!origin || !destination) {
        showError('Please enter both origin and destination stations');
        return;
    }
    
    if (origin === destination) {
        showError('Origin and destination cannot be the same');
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
        const metroBilbaoResponse = await fetch(`${metroBilbaoApiUrl}/${origin}/${destination}`);
        
        if (!metroBilbaoResponse.ok) {
            throw new Error('Failed to fetch route information from Metro Bilbao');
        }
        
        const rawData = await metroBilbaoResponse.json();
        
        // Step 2: Send raw data to our backend for processing (exit availability, calculations, etc.)
        const processResponse = await fetch('/api/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: rawData })
        });
        
        if (!processResponse.ok) {
            throw new Error('Failed to process route data');
        }
        
        const processedData = await processResponse.json();
        
        displayResults(processedData);
        
    } catch (error) {
        console.error('Error fetching route:', error);
        showError(`Error: ${error.message}. Please check station codes and try again.`);
    } finally {
        hideLoading();
    }
}

function showLoading() {
    document.getElementById('loadingSection').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingSection').classList.add('hidden');
}

function showError(message) {
    document.getElementById('errorText').textContent = message;
    document.getElementById('errorSection').classList.remove('hidden');
}

function hideError() {
    document.getElementById('errorSection').classList.add('hidden');
}

function hideResults() {
    document.getElementById('resultsSection').classList.add('hidden');
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
        document.getElementById('transferCard').classList.add('hidden');
    }
    
    // Display exits
    displayExits(data.exits);
    
    // Display CO2 info
    displayCO2Info(data.co2Metro);
    
    // Display messages if any
    if (data.messages && data.messages.length > 0) {
        displayMessages(data.messages);
    } else {
        document.getElementById('messagesCard').classList.add('hidden');
    }
    
    // Show results section
    document.getElementById('resultsSection').classList.remove('hidden');
    
    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
    
    // Set up auto-refresh every N seconds (from config)
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    autoRefreshInterval = setInterval(() => {
        const origin = document.getElementById('origin').value.trim().toUpperCase();
        const destination = document.getElementById('destination').value.trim().toUpperCase();
        if (origin && destination) {
            refreshTrainData(origin, destination);
        }
    }, refreshIntervalSeconds * 1000);
}

function displayTripInfo(trip) {
    const data = window.currentRouteData || {};
    
    // Use earliestArrival from backend if available
    const earliestArrivalHtml = data.earliestArrival ? `<div class="label" style="margin-top: 8px; color: var(--primary-color);">Earliest Arrival</div>
                <div class="value" style="color: var(--primary-color); font-weight: 600;">${data.earliestArrival}</div>` : '';
    
    const html = `
        <div class="trip-info-grid">
            <div class="trip-info-item">
                <div class="label">From</div>
                <div class="value">${trip.fromStation.name}</div>
                <div class="label">${trip.fromStation.code}</div>
            </div>
            <div class="trip-info-item">
                <div class="label">To</div>
                <div class="value">${trip.toStation.name}</div>
                <div class="label">${trip.toStation.code}</div>
            </div>
            <div class="trip-info-item">
                <div class="label">Duration</div>
                <div class="value">${trip.duration} minutes</div>
                ${earliestArrivalHtml}
            </div>
            <div class="trip-info-item">
                <div class="label">Line</div>
                <div class="value">${trip.line}</div>
            </div>
            <div class="trip-info-item">
                <div class="label">Transfer</div>
                <div class="value">
                    <span class="transfer-badge ${trip.transfer ? 'transfer-yes' : 'transfer-no'}">
                        ${trip.transfer ? 'Yes' : 'No'}
                    </span>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('tripInfo').innerHTML = html;
}

function displayTrains(trains) {
    if (!trains || trains.length === 0) {
        document.getElementById('trainsInfo').innerHTML = '<p>No trains available at this time.</p>';
        return;
    }
    
    lastFetchTime = Date.now();
    const now = new Date();
    const routeData = window.currentRouteData || {};
    const tripDuration = routeData.trip ? routeData.trip.duration : 0;
    
    // Separate first train (next metro) from upcoming trains
    const nextTrain = trains[0];
    const upcomingTrains = trains.slice(1);
    
    // Helper function to create train HTML
    const createTrainHtml = (train, index, isNext = false) => {
        const arrivalTime = new Date(train.time);
        const totalSeconds = Math.max(0, Math.round((arrivalTime - now) / 1000));
        const timeWithSeconds = arrivalTime.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
        
        let arrivalAtDestStr = '';
        if (tripDuration > 0) {
            const arrivalAtDest = new Date(arrivalTime.getTime() + tripDuration * 60000);
            arrivalAtDestStr = arrivalAtDest.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
        }
        
        return `
        <div class="train-item ${isNext ? 'next-train' : ''}" data-arrival-time="${arrivalTime.getTime()}" data-time-display="${timeWithSeconds}">
            <div class="train-main-info">
                <div class="train-direction">🚇 ${train.direction}</div>
                <div class="train-details">
                    ${train.wagons} wagons${train.totalTimeToDestination ? ' • ' + train.totalTimeToDestination + ' to destination' : ''}
                </div>
            </div>
            <div class="train-timing-info">
                <div class="train-time-container">
                    <span class="departs-label">Departs in </span>
                    <span class="train-time" data-seconds="${totalSeconds}" data-train-index="${index}">
                        ${formatTime(totalSeconds)}
                    </span>
                </div>
                <div class="train-details train-arrival-time">Arrives at origin: ${timeWithSeconds}</div>
                ${arrivalAtDestStr ? '<div class="train-details train-dest-time">Arrives at destination: ' + arrivalAtDestStr + '</div>' : ''}
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
                ${upcomingTrains.map((train, index) => createTrainHtml(train, index + 1, false)).join('')}
            </div>
        </div>
        `;
    }
    
    document.getElementById('trainsInfo').innerHTML = html;
    startTrainCountdown();
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function startTrainCountdown() {
    clearTrainTimers();
    
    const interval = setInterval(() => {
        const trainTimeElements = document.querySelectorAll('.train-time[data-seconds]');
        const trainItems = document.querySelectorAll('.train-item[data-arrival-time]');
        const now = Date.now();
        
        trainTimeElements.forEach(element => {
            let seconds = parseInt(element.dataset.seconds);
            if (seconds > 0) {
                seconds--;
                element.dataset.seconds = seconds;
                element.textContent = formatTime(seconds);
                
                // Add blinking classes based on time remaining
                const trainItem = element.closest('.train-item');
                if (seconds < 30) {
                    trainItem.classList.add('blink-red');
                    trainItem.classList.remove('blink-yellow');
                } else if (seconds < 60) {
                    trainItem.classList.add('blink-yellow');
                    trainItem.classList.remove('blink-red');
                } else {
                    trainItem.classList.remove('blink-red', 'blink-yellow');
                }
            } else {
                element.textContent = '0:00';
            }
        });
        
        // Remove trains that have departed (15 seconds after expected time)
        trainItems.forEach(item => {
            const arrivalTime = parseInt(item.dataset.arrivalTime);
            if (now > arrivalTime + 15000) {
                item.style.opacity = '0';
                item.style.transition = 'opacity 0.5s';
                setTimeout(() => item.remove(), 500);
            }
        });
    }, 1000);
    
    trainTimers.push(interval);
}

function clearTrainTimers() {
    trainTimers.forEach(timer => clearInterval(timer));
    trainTimers = [];
}

async function refreshTrainData(origin, destination) {
    try {
        console.log('Refreshing train data...');
        
        // Call Metro Bilbao API directly from client IP to avoid backend rate limiting
        const response = await fetch(`${metroBilbaoApiUrl}/${origin}/${destination}`);
        
        if (!response.ok) {
            console.error('Failed to fetch from Metro Bilbao API');
            return;
        }
        
        const rawData = await response.json();
        
        // Send raw data to backend for processing (adds totalTimeToDestination, etc.)
        const processResponse = await fetch('/api/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: rawData })
        });
        
        if (!processResponse.ok) {
            console.error('Failed to process data on backend');
            return;
        }
        
        const processedData = await processResponse.json();
        console.log('Train data refreshed successfully');
        
        if (processedData.trains) {
            displayTrains(processedData.trains);
        }
        
    } catch (error) {
        console.error('Error refreshing train data:', error);
    }
}

function displayTransferInfo(transferOptions) {
    if (!transferOptions || transferOptions.length === 0) {
        document.getElementById('transferCard').classList.add('hidden');
        return;
    }
    
    const html = transferOptions.map((option, index) => `
        <div class="transfer-steps">
            <div class="transfer-step">
                <div class="step-number">1</div>
                <div class="step-content">
                    <div class="step-route">
                        ${option.firstLeg.fromName || option.firstLeg.from} → ${option.firstLeg.toName || option.firstLeg.to}
                    </div>
                    <div class="step-info">
                        <span style="opacity: 0.7; font-size: 0.85em;">${option.firstLeg.from} → ${option.firstLeg.to}</span> • 
                        Line ${option.firstLeg.line} • ${option.firstLeg.durationFormatted || option.firstLeg.duration + ' min'}
                        ${option.firstLeg.arrivalTime ? '<br><span style="opacity: 0.8;">Arrives at transfer: ' + option.firstLeg.arrivalTime + '</span>' : ''}
                    </div>
                </div>
            </div>
            
            <div class="transfer-step">
                <div class="step-number">⏱️</div>
                <div class="step-content">
                    <div class="step-route">Transfer Wait at ${option.secondLeg.fromName || option.secondLeg.from}</div>
                    <div class="step-info">
                        <span style="opacity: 0.7; font-size: 0.85em;">${option.secondLeg.from}</span> • 
                        ${option.transferWaitFormatted || option.transferWait + ' min'}
                        ${option.secondLeg.departureTime ? '<br><span style="opacity: 0.8;">Next train departs: ' + option.secondLeg.departureTime + '</span>' : ''}
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
                        Line ${option.secondLeg.line} • ${option.secondLeg.durationFormatted || option.secondLeg.duration + ' min'}
                    </div>
                </div>
            </div>
            
            <div style="text-align: center; padding: 16px; background: var(--light-color); border-radius: 8px; font-weight: 600;">
                Total Journey Time: ${option.totalDurationFormatted || option.totalDuration + ' min'}
                ${option.expectedArrival ? '<br><span style="font-size: 0.95em; color: var(--primary-color); margin-top: 8px; display: block;">Arrival at destination: ' + option.expectedArrival + '</span>' : ''}
            </div>
        </div>
    `).join('');
    
    document.getElementById('transferInfo').innerHTML = html;
    document.getElementById('transferCard').classList.remove('hidden');
}

function displayExits(exits) {
    // Origin exits
    const originHTML = exits.origin && exits.origin.length > 0
        ? exits.origin.map(exit => `
            <div class="exit-item ${exit.available ? 'available' : 'closed'}">
                <div class="exit-status">
                    ${exit.available ? '✅ OPEN' : '⚠️ Might be closed'}
                </div>
                <div class="exit-name">${exit.name}</div>
                ${exit.issues && exit.issues.length > 0 ? `
                    <div class="exit-issues">
                        ${exit.issues.map(issue => `<div class="issue-item">⚠️ ${issue}</div>`).join('')}
                    </div>
                ` : ''}
                <div class="exit-features">
                    <span class="feature-badge">
                        ${exit.elevator ? '♿ Elevator' : '🚶 Stairs'}
                    </span>
                    <span class="feature-badge">
                        ${exit.nocturnal ? '🌙 24h' : '☀️ Day only'}
                    </span>
                </div>
            </div>
        `).join('')
        : '<p>No exit information available</p>';
    
    // Destination exits
    const destHTML = exits.destiny && exits.destiny.length > 0
        ? exits.destiny.map(exit => `
            <div class="exit-item ${exit.available ? 'available' : 'closed'}">
                <div class="exit-status">
                    ${exit.available ? '✅ OPEN' : '⚠️ Might be closed'}
                </div>
                <div class="exit-name">${exit.name}</div>
                ${exit.issues && exit.issues.length > 0 ? `
                    <div class="exit-issues">
                        ${exit.issues.map(issue => `<div class="issue-item">⚠️ ${issue}</div>`).join('')}
                    </div>
                ` : ''}
                <div class="exit-features">
                    <span class="feature-badge">
                        ${exit.elevator ? '♿ Elevator' : '🚶 Stairs'}
                    </span>
                    <span class="feature-badge">
                        ${exit.nocturnal ? '🌙 24h' : '☀️ Day only'}
                    </span>
                </div>
            </div>
        `).join('')
        : '<p>No exit information available</p>';
    
    document.getElementById('originExits').innerHTML = originHTML;
    document.getElementById('destinationExits').innerHTML = destHTML;
}

function displayCO2Info(co2Data) {
    const html = `
        <div class="co2-comparison">
            <div class="co2-item co2-metro">
                <div class="co2-label">🚇 Metro CO2</div>
                <div class="co2-value">${co2Data.co2metro}</div>
                <div class="co2-unit">kg CO2</div>
                <div class="co2-unit">${co2Data.metroDistance} km</div>
            </div>
            
            <div class="co2-item co2-car">
                <div class="co2-label">🚗 Car CO2</div>
                <div class="co2-value">${co2Data.co2Car}</div>
                <div class="co2-unit">kg CO2</div>
                <div class="co2-unit">${co2Data.googleDistance} km</div>
            </div>
            
            <div class="co2-item co2-savings">
                <div class="co2-label">💚 You Save</div>
                <div class="co2-value">${co2Data.diff}</div>
                <div class="co2-unit">kg CO2</div>
            </div>
        </div>
    `;
    
    document.getElementById('co2Info').innerHTML = html;
}

function displayMessages(messages) {
    const html = messages.map(msg => `
        <div class="message-item">${msg}</div>
    `).join('');
    
    document.getElementById('messagesInfo').innerHTML = html;
    document.getElementById('messagesCard').classList.remove('hidden');
}
