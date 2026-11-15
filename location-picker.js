// location-picker.js

let pickerMap = null;
let currentPickerLat = 28.6139; // Default to Delhi
let currentPickerLon = 77.2090;
let isDragging = false;
let geocodeTimeout = null;

function openLocationPicker() {
    const modal = document.getElementById('location-picker-modal');
    modal.classList.add('open');

    // Use existing coordinates if available
    const locAddress = document.querySelector('.patient-location-pill .loc-address');
    
    // Initialize map if not done yet
    if (!pickerMap) {
        // Give modal time to transition before initializing map to ensure size is correct
        setTimeout(() => {
            pickerMap = L.map('picker-map', {
                zoomControl: false // Disable default zoom control to save space
            }).setView([currentPickerLat, currentPickerLon], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(pickerMap);
            
            // Add custom zoom control at bottom right
            L.control.zoom({ position: 'bottomright' }).addTo(pickerMap);

            pickerMap.on('movestart', () => {
                isDragging = true;
                const pin = document.querySelector('.center-pin svg');
                if(pin) pin.style.transform = 'translateY(-10px)'; // Lift pin while moving
            });

            pickerMap.on('moveend', () => {
                isDragging = false;
                const pin = document.querySelector('.center-pin svg');
                if(pin) pin.style.transform = 'translateY(0)'; // Drop pin
                
                const center = pickerMap.getCenter();
                currentPickerLat = center.lat;
                currentPickerLon = center.lng;
                
                // Debounce reverse geocoding
                clearTimeout(geocodeTimeout);
                geocodeTimeout = setTimeout(() => {
                    reverseGeocode(currentPickerLat, currentPickerLon);
                }, 800); // wait 800ms after map stops to avoid spamming API
            });
            
            // Try GPS immediately on first open if we haven't got location yet
            if (locAddress && locAddress.textContent.includes('New Delhi, Delhi 110029')) {
                useGPSLocation();
            }
            
        }, 300); // 300ms matches CSS transition
    } else {
        setTimeout(() => {
            pickerMap.invalidateSize(); // Fix map rendering if modal size changed
            pickerMap.setView([currentPickerLat, currentPickerLon], 15);
        }, 300);
    }
}

function closeLocationPicker() {
    const modal = document.getElementById('location-picker-modal');
    modal.classList.remove('open');
}

function reverseGeocode(lat, lon) {
    const searchInput = document.getElementById('loc-search-input');
    searchInput.value = "Fetching address...";
    
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.display_name) {
                // Keep the input text relatively short
                const addressParts = [];
                if (data.address.suburb) addressParts.push(data.address.suburb);
                if (data.address.city) addressParts.push(data.address.city);
                else if (data.address.state_district) addressParts.push(data.address.state_district);
                
                searchInput.value = addressParts.length > 0 ? addressParts.join(', ') : data.display_name;
                
                // Store full address globally just in case
                searchInput.dataset.fullAddress = data.display_name;
            } else {
                searchInput.value = "Unknown location";
            }
        })
        .catch(err => {
            console.error('Reverse geocode error:', err);
            searchInput.value = "Location details unavailable";
        });
}

function searchLocation() {
    const query = document.getElementById('loc-search-input').value.trim();
    if (!query) return;
    
    // Change button icon to loading or just wait
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                const result = data[0];
                currentPickerLat = parseFloat(result.lat);
                currentPickerLon = parseFloat(result.lon);
                
                if (pickerMap) {
                    pickerMap.flyTo([currentPickerLat, currentPickerLon], 15);
                }
            } else {
                alert("Location not found. Try a different search.");
            }
        })
        .catch(err => {
            console.error("Search error:", err);
            alert("Error searching location.");
        });
}

// Allow Enter key in search box
document.addEventListener('DOMContentLoaded', () => {
    // Only bind if the element exists on load, but wait actually the modal is in index.html
    const searchInput = document.getElementById('loc-search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                searchLocation();
            }
        });
    }
});

async function useGPSLocation() {
    const input = document.getElementById('loc-search-input');
    if (input) input.value = "Getting accurate GPS location...";
    
    try {
        let coords;
        if (typeof window.getAccuratePosition === 'function') {
            coords = await window.getAccuratePosition();
        } else if (navigator.geolocation) {
            coords = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                    reject,
                    { enableHighAccuracy: true, timeout: 15000 }
                );
            });
        }
        
        if (coords) {
            currentPickerLat = coords.lat;
            currentPickerLon = coords.lon;
            if (pickerMap) {
                pickerMap.flyTo([currentPickerLat, currentPickerLon], 16);
            }
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lon}`)
                .then(res => res.json())
                .then(data => {
                    if (input) {
                        input.value = (data && data.display_name) ? data.display_name : `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
                    }
                })
                .catch(() => {
                    if (input) input.value = `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
                });
        }
    } catch (err) {
        console.error("GPS error:", err);
        alert("Could not get GPS location. Please ensure location is enabled.");
        if (input) input.value = "";
    }
}

function confirmPickedLocation() {
    closeLocationPicker();
    
    const searchInput = document.getElementById('loc-search-input');
    const addressToDisplay = searchInput.value || "Custom Location";
    
    // Update the main location pill UI
    const locPill = document.querySelector('.patient-location-pill');
    const locTitle = locPill?.querySelector('.loc-title');
    const locAddress = locPill?.querySelector('.loc-address');
    
    if (locTitle) locTitle.textContent = 'Current location';
    if (locAddress) locAddress.textContent = addressToDisplay;
    
    // Show loading state for hospitals immediately
    const hospitalListContainer = document.getElementById('patient-hospitals-list');
    if (hospitalListContainer) {
        hospitalListContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Fetching nearest hospitals...</div>';
    }
    
    // Trigger the real-time Overpass API fetch from patient-hospitals.js using new coords
    if (typeof fetchNearbyHospitals === 'function') {
        fetchNearbyHospitals(currentPickerLat, currentPickerLon);
    }
}
