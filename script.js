document.addEventListener('DOMContentLoaded', () => {
    // initialize icons
    try {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } catch (e) {
        console.warn("Lucide failed to load: ", e);
    }

    // Default View (London) serves as fallback
    const defaultLat = 51.505;
    const defaultLng = -0.09;

    let map;
    // Map Initialization
    try {
        map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([defaultLat, defaultLng], 13);

        // Dark Mode Tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(map);
    } catch (e) {
        console.error("Leaflet failed to initialize the map:", e);
    }

    // Colors
    const colors = {
        medical: '#ef4444',
        water: '#3b82f6',
        danger: '#dc2626',
        home: '#64748b',
        police: '#f59e0b',
        user: '#3b82f6',
        fire: '#f97316',
        shelter: '#f97316'
    };

    // Custom Icon Function
    function createCustomIcon(type, iconName) {
        let color = colors[type];
        if (!color) color = '#999';

        const isCircle = type === 'danger' || type === 'user';

        let htmlContent;
        if (type === 'user') {
            // Special pulsing dot for user
            htmlContent = `
                <div class="user-marker-pulse" style="background-color: ${color}; box-shadow: 0 0 15px ${color}">
                    <i data-lucide="${iconName}" style="width: 20px; height: 20px; color: white;"></i>
                </div>
            `;
        } else {
            // Regular facilities
            htmlContent = `
                <div class="marker-pin ${isCircle ? 'circle' : ''}" style="background-color: ${color}; box-shadow: 0 0 10px ${color}">
                    <i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i>
                </div>
            `;
        }

        return L.divIcon({
            className: 'custom-marker-icon',
            html: htmlContent,
            iconSize: type === 'user' ? [40, 40] : [30, 42],
            iconAnchor: type === 'user' ? [20, 20] : [15, 42]
        });
    }

    let navigationLine = null;
    let navigationPopup = null;

    // Function to clear existing navigation
    window.clearNavigation = function () {
        if (navigationLine) {
            map.removeLayer(navigationLine);
            navigationLine = null;
        }
        if (navigationPopup) {
            map.closePopup(navigationPopup);
            navigationPopup = null;
        }
    };

    // Recenter Map Function
    window.recenterMap = function () {
        if (window.userLocation) {
            map.flyTo([window.userLocation.lat, window.userLocation.lng], 15, {
                animate: true,
                duration: 1.5
            });
        } else {
            alert("Waiting for location...");
        }
    };

    // Function to start navigation
    window.startNavigation = function (destLat, destLng) {
        if (!window.userLocation) {
            alert("User location not found.");
            return;
        }

        clearNavigation();

        const userLat = window.userLocation.lat;
        const userLng = window.userLocation.lng;

        // OSRM API Expects: lon,lat;lon,lat
        const url = `https://router.project-osrm.org/route/v1/foot/${userLng},${userLat};${destLng},${destLat}?overview=full&geometries=geojson`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]); // Swap to lat,lng

                    // Draw Route
                    navigationLine = L.polyline(coordinates, {
                        color: '#15803d', // Dark Green
                        weight: 5,
                        opacity: 0.8,
                        dashArray: '10, 10', // Dashed line
                        lineCap: 'round'
                    }).addTo(map);

                    // Animate to fit bounds
                    map.fitBounds(navigationLine.getBounds(), {
                        padding: [50, 50],
                        animate: true,
                        duration: 1.5
                    });

                    // Show Duration/Distance Popup
                    let durationSecs = route.duration;
                    let durationMins = Math.ceil(durationSecs / 60);
                    let timeString = "";
                    const t = translations[currentLang]; // Get current translations

                    if (durationMins < 5) {
                        // For short trips, show minutes and seconds
                        const mins = Math.floor(durationSecs / 60);
                        const secs = Math.round(durationSecs % 60);
                        if (mins > 0) {
                            timeString = `${mins} ${t.min} ${secs} ${t.sec}`;
                        } else {
                            timeString = `${secs} ${t.sec}`;
                        }
                    } else if (durationMins >= 60) {
                        // Long trips
                        const hours = Math.floor(durationMins / 60);
                        const mins = durationMins % 60;
                        timeString = `${hours} ${t.h} ${mins} ${t.min}`;
                    } else {
                        // Standard minutes
                        timeString = `${durationMins} ${t.min}`;
                    }

                    const distanceKm = (route.distance / 1000).toFixed(2);

                    navigationPopup = L.popup({
                        className: 'walking-popup',
                        closeButton: false,
                        autoClose: false,
                        closeOnClick: false
                    })
                        .setLatLng([destLat, destLng])
                        .setContent(`
                            <div class="walking-popup-content">
                                <div class="walking-icon">
                                    <i data-lucide="footprints"></i>
                                </div>
                                <div>
                                    <div class="walking-title">${t.walking_route}</div>
                                    <div class="walking-stats">
                                        <span class="stat-time">${timeString}</span>
                                        <span class="stat-dist">(${distanceKm} km)</span>
                                    </div>
                                </div>
                            </div>
                        `)
                        .openOn(map);

                    // Re-init icons inside popup
                    setTimeout(() => lucide.createIcons(), 50);

                } else {
                    throw new Error('No route found');
                }
            })
            .catch(error => {
                console.warn("Routing failed, falling back to straight line:", error);

                // Fallback: Straight Line
                const latlngs = [
                    [userLat, userLng],
                    [destLat, destLng]
                ];

                navigationLine = L.polyline(latlngs, {
                    color: '#15803d', // Dark Green
                    weight: 5,
                    opacity: 0.8,
                    dashArray: '10, 10',
                    lineCap: 'round'
                }).addTo(map);

                map.fitBounds(latlngs, { padding: [50, 50] });
            });

        // Close popup
        map.closePopup();
    };

    // Function to fetch real amenities via Overpass API
    function fetchNearbyAmenities(lat, lng) {
        // Search radius: 5km (5000m)
        const radius = 5000;

        // Overpass Query: Police, Hospital, Clinic, Fire Station
        const query = `
            [out:json][timeout:25];
            (
              node["amenity"="police"](around:${radius},${lat},${lng});
              way["amenity"="police"](around:${radius},${lat},${lng});
              node["amenity"="hospital"](around:${radius},${lat},${lng});
              way["amenity"="hospital"](around:${radius},${lat},${lng});
              node["amenity"="clinic"](around:${radius},${lat},${lng});
              way["amenity"="clinic"](around:${radius},${lat},${lng});
              node["amenity"="fire_station"](around:${radius},${lat},${lng});
              way["amenity"="fire_station"](around:${radius},${lat},${lng});
            );
            out center;
        `;

        const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

        console.log("Fetching amenities from Overpass API...");

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (!data.elements) return;

                console.log(`Found ${data.elements.length} amenities.`);

                data.elements.forEach(element => {
                    let type = 'unknown';
                    let iconName = 'map-pin';
                    let tags = element.tags;

                    // Determine Type
                    if (tags.amenity === 'police') {
                        type = 'police';
                        iconName = 'shield';
                    } else if (tags.amenity === 'hospital' || tags.amenity === 'clinic') {
                        type = 'medical';
                        iconName = 'plus';
                    } else if (tags.amenity === 'fire_station') {
                        type = 'fire'; // We need to add 'fire' color support or map to danger/police
                        iconName = 'flame';
                    }

                    // For 'fire' type, let's map it to 'danger' color if fire specific not exists, 
                    // or better, add 'fire' to colors object in next step. For now, let's look at colors object.
                    // colors has: medical, water, danger, home, police, user.
                    // I will add fire color dynamically or use danger (red) or police (orange/blue).
                    // Actually, let's just use existing types for consistency or update colors.

                    // Use center for ways, lat/lon for nodes
                    const lat = element.lat || element.center.lat;
                    const lon = element.lon || element.center.lon;

                    if (lat && lon) {
                        const marker = L.marker([lat, lon], {
                            icon: createCustomIcon(type, iconName)
                        }).addTo(map);

                        const t = translations[currentLang];
                        const name = tags.name || (t[type] ? t[type] : type);

                        // Clean up name
                        const title = name.charAt(0).toUpperCase() + name.slice(1);

                        const popupContent = `
                            <div class="facility-popup">
                                <b>${title}</b><br>
                                <span style="font-size:0.8rem; color:#888;">${tags.amenity.replace('_', ' ')}</span>
                                <button class="navigate-btn" onclick="startNavigation(${lat}, ${lon})">
                                    <i data-lucide="navigation"></i> ${t.go}
                                </button>
                            </div>
                        `;

                        marker.bindPopup(popupContent);
                        marker.on('popupopen', () => lucide.createIcons());
                        marker.on('add', () => lucide.createIcons());
                    }
                });

                lucide.createIcons();
            })
            .catch(err => {
                console.error("Error fetching Overpass data:", err);
                // Fallback to random if API fails? 
                // generateNearbyFacilities(lat, lng); // Optional fallback
            });
    }

    // Function to add hardcoded Plzen facilities
    function addPlzenFacilities() {
        // Plzen Coordinates
        const facilities = [
            // Hospitals
            { lat: 49.7656, lng: 13.3789, type: 'medical', name: 'FN Plzeň (Lochotín)', icon: 'plus' },
            { lat: 49.7333, lng: 13.3700, type: 'medical', name: 'FN Plzeň (Bory)', icon: 'plus' },
            { lat: 49.7408, lng: 13.3675, type: 'medical', name: 'Mulačova nemocnice', icon: 'plus' },
            { lat: 49.7435, lng: 13.3735, type: 'medical', name: 'Poliklinika Plzeň', icon: 'plus' },

            // Police
            { lat: 49.7350, lng: 13.3720, type: 'police', name: 'Policie ČR (Klatovská)', icon: 'shield' },
            { lat: 49.7470, lng: 13.3770, type: 'police', name: 'Policie ČR (Perlová)', icon: 'shield' },
            { lat: 49.7390, lng: 13.3700, type: 'police', name: 'Městské ředitelství policie', icon: 'shield' },

            // Fire
            { lat: 49.7300, lng: 13.3900, type: 'fire', name: 'Hasičská stanice (Slovany)', icon: 'flame' },
            { lat: 49.7600, lng: 13.3600, type: 'fire', name: 'Hasičská stanice (Košutka)', icon: 'flame' }
        ];

        facilities.forEach(fac => {
            const marker = L.marker([fac.lat, fac.lng], {
                icon: createCustomIcon(fac.type, fac.icon)
            }).addTo(map);

            const t = translations[currentLang];
            const popupContent = `
                <div class="facility-popup">
                    <b>${fac.name}</b><br>
                    <span style="font-size:0.8rem; color:#888;">${t[fac.type] || fac.type}</span>
                    <button class="navigate-btn" onclick="startNavigation(${fac.lat}, ${fac.lng})">
                        <i data-lucide="navigation"></i> ${t.go}
                    </button>
                </div>
            `;

            marker.bindPopup(popupContent);
            marker.on('popupopen', () => lucide.createIcons());
            marker.on('add', () => lucide.createIcons());
        });

        console.log("Added Plzen facilities.");
    }

    // Function to fetch Nearby Places for Favorites
    function fetchNearbyPlaces(lat, lng) {
        const listContainer = document.getElementById('nearby-places-list');
        if (!listContainer) return;

        // Reset to loading state if needed, or just keep appending? better reset.
        listContainer.innerHTML = `
            <div style="text-align: center; color: #888; padding: 2rem;">
                <i data-lucide="loader-2" class="spin" style="margin-bottom: 0.5rem;"></i>
                <p>Loading recommendations...</p>
            </div>
        `;
        lucide.createIcons();

        // Search radius: 5km (wider for emergency)
        const radius = 5000;

        // Overpass Query: Emergency Amenities
        const query = `
            [out:json][timeout:25];
            (
              node["amenity"="hospital"](around:${radius},${lat},${lng});
              way["amenity"="hospital"](around:${radius},${lat},${lng});
              node["amenity"="police"](around:${radius},${lat},${lng});
              way["amenity"="police"](around:${radius},${lat},${lng});
              node["amenity"="pharmacy"](around:${radius},${lat},${lng});
              node["amenity"="fire_station"](around:${radius},${lat},${lng});
              node["emergency"="assembly_point"](around:${radius},${lat},${lng});
            );
            out center 20; 
        `;
        // Limit to 20 items

        const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

        console.log("Fetching nearby emergency places...");

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (!data.elements || data.elements.length === 0) {
                    listContainer.innerHTML = '<p style="text-align:center; color:#666; padding:2rem;">No nearby emergency places found.</p>';
                    return;
                }

                listContainer.innerHTML = ''; // Clear loading

                data.elements.forEach(element => {
                    let tags = element.tags;
                    let name = tags.name || 'Unnamed Facility'; // Show unnamed too for emergency

                    // Determine type/icon
                    let type = 'Emergency';
                    let iconName = 'alert-circle';
                    let iconColor = '#ef4444'; // Red

                    if (tags.amenity === 'hospital') {
                        type = 'Hospital';
                        iconName = 'plus-circle'; // medical cross
                        iconColor = '#ef4444';
                    } else if (tags.amenity === 'police') {
                        type = 'Police Station';
                        iconName = 'shield';
                        iconColor = '#3b82f6'; // Blue
                    } else if (tags.amenity === 'pharmacy') {
                        type = 'Pharmacy';
                        iconName = 'pill'; // pill or plus
                        iconColor = '#22c55e'; // Green
                    } else if (tags.amenity === 'fire_station') {
                        type = 'Fire Station';
                        iconName = 'flame';
                        iconColor = '#f97316'; // Orange
                    } else if (tags.emergency === 'assembly_point') {
                        type = 'Assembly Point';
                        iconName = 'users';
                        iconColor = '#eab308'; // Yellow
                    }

                    // Coordinates
                    const pLat = element.lat || element.center.lat;
                    const pLng = element.lon || element.center.lon;

                    const card = document.createElement('div');
                    card.className = 'place-card';
                    card.innerHTML = `
                        <div class="place-icon" style="color: white; background-color: ${iconColor}20;">
                            <i data-lucide="${iconName}" style="color: ${iconColor};"></i>
                        </div>
                        <div class="place-info">
                            <div class="place-name">${name}</div>
                            <div class="place-type">${type}</div>
                        </div>
                        <button class="place-action" onclick="window.startNavigation(${pLat}, ${pLng}); document.querySelectorAll('.nav-item')[0].click();">
                            <i data-lucide="navigation-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    `;
                    listContainer.appendChild(card);
                });

                lucide.createIcons();
            })
            .catch(err => {
                console.error("Error fetching places:", err);
                listContainer.innerHTML = '<p style="text-align:center; color:#666; padding:2rem;">Failed to load places.</p>';
            });
    }

    // Theme Logic
    window.toggleTheme = function () {
        const body = document.body;
        const isDark = !body.classList.contains('light-mode');

        if (isDark) {
            // Switch to Light
            body.classList.add('light-mode');
            localStorage.setItem('theme', 'light');
            updateThemeUI('light');
        } else {
            // Switch to Dark
            body.classList.remove('light-mode');
            localStorage.setItem('theme', 'dark');
            updateThemeUI('dark');
        }
    }

    function updateThemeUI(theme) {
        const icon = document.getElementById('theme-icon');
        const status = document.getElementById('theme-status');
        const switchBg = document.getElementById('theme-toggle-switch');
        const knob = document.getElementById('theme-toggle-knob');

        if (!icon || !status) return;

        if (theme === 'light') {
            icon.setAttribute('data-lucide', 'sun');
            status.textContent = 'Off'; // Dark mode off

            // Switch Visuals for Light Mode (Off position for "Dark Mode" toggle)
            if (switchBg && knob) {
                switchBg.style.backgroundColor = '#ccc';
                knob.style.right = 'auto'; // clear right
                knob.style.left = '2px';
            }
        } else {
            icon.setAttribute('data-lucide', 'moon');
            status.textContent = 'On';

            // Switch Visuals for Dark Mode (On position)
            if (switchBg && knob) {
                switchBg.style.backgroundColor = '#3b82f6';
                knob.style.left = 'auto'; // clear left
                knob.style.right = '2px';
            }
        }
        lucide.createIcons();
    }

    // Initialize Theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        // Defer UI update until DOM is ready or call it here if safe
        // Best to call after loading, but we are in main script. 
        // Elements might not be in DOM if script runs in head? 
        // Script is at end of body, so it should be fine.
        setTimeout(() => updateThemeUI('light'), 100);
    } else {
        setTimeout(() => updateThemeUI('dark'), 100);
    }

    // Geolocation Logic
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;

                // Update global user location
                window.userLocation = { lat: userLat, lng: userLng };

                // Center Map
                map.setView([userLat, userLng], 15);

                const userMarker = L.marker([userLat, userLng], {
                    icon: createCustomIcon('user', 'navigation')
                }).addTo(map);

                // Note: This binding is static at creation, might need update if lang changes dynamically
                // For now, it uses lang at load time.
                userMarker.bindPopup(`${translations[currentLang].you_are_here}`).openPopup();
                userMarker.on('add', () => lucide.createIcons());

                // Generate Facilities around user
                fetchNearbyAmenities(userLat, userLng);

                // Add Plzen facilities regardless (so they show if user pans there)
                addPlzenFacilities();

                // Fetch Nearby Places for Favorites view
                fetchNearbyPlaces(userLat, userLng);

                // Refresh icons
                lucide.createIcons();
            },
            (error) => {
                console.warn("Geolocation denied or error:", error);
                // Set default global location
                window.userLocation = { lat: defaultLat, lng: defaultLng };
                alert("Location access denied. Showing default location (London).");
                fetchNearbyAmenities(defaultLat, defaultLng);
                addPlzenFacilities(); // Add Plzen anyway
                fetchNearbyPlaces(defaultLat, defaultLng); // Fetch for default
                lucide.createIcons();
            },
            { enableHighAccuracy: true }
        );
    } else {
        // Set default global location
        window.userLocation = { lat: defaultLat, lng: defaultLng };
        alert("Geolocation is not supported by your browser.");
        fetchNearbyAmenities(defaultLat, defaultLng);
        addPlzenFacilities(); // Add Plzen anyway
        fetchNearbyPlaces(defaultLat, defaultLng); // Fetch for default
        lucide.createIcons();
    }

    // --- Internationalization (i18n) ---
    const translations = {
        en: {
            app_title: 'Pmesh',
            slide_sos: 'SLIDE FOR SOS',
            emergency_type: "What's the emergency?",
            medical: 'Medical',
            fire: 'Fire',
            police: 'Police',
            violence: 'Violence',
            cancel: 'Cancel',
            chats: 'Chats',
            search_placeholder: 'Search',
            emergency_contacts: 'Emergency Contacts',
            add_new: 'Add New',
            mom: 'Mom',
            dad: 'Dad',
            bro: 'Bro',
            pending: 'Pending...',
            police_dispatch: 'Police Dispatch',
            police_dispatch_msg: 'Unit 42 is on the way to your location.',
            community_watch: 'Community Watch',
            community_watch_msg: 'Stay safe everyone, report localized...',
            type_message: 'Type a message...',
            online: 'Online',
            my_account: 'My account',
            personal_info: 'Personal info',
            name: 'Name',
            enter_name: 'Enter name',
            surname: 'Surname',
            enter_surname: 'Enter surname',
            phone_number: 'Phone number',
            enter_phone: 'Enter phone',
            email_address: 'Email address',
            enter_email: 'Enter email',
            settings: 'Settings',
            code_to_enter: 'Code to enter into the app',
            change_code: 'Change entrance code',
            language: 'Language',
            favorites: 'Emergency Places',
            favorites_desc: 'Quickly find help near you.',
            emergency_places: 'Nearby Emergency Places',
            emergency_places_desc: 'Quickly find help near you.',
            walking_route: 'Walking Route',
            safe_distance: 'Safe distance',
            go: 'Go',
            h: 'h',
            min: 'min',
            sec: 'sec',
            you_are_here: 'You are here',
            app_version: 'App Version',
            developed_by: 'Developed by'
        },
        cs: {
            app_title: 'Pmesh',
            slide_sos: 'POSUN PRO SOS',
            emergency_type: 'Jaký máte problém?',
            medical: 'Zdravotní',
            fire: 'Požár',
            police: 'Policie',
            violence: 'Násilí',
            cancel: 'Zrušit',
            chats: 'Chaty',
            search_placeholder: 'Hledat',
            emergency_contacts: 'Nouzové kontakty',
            add_new: 'Přidat',
            mom: 'Máma',
            dad: 'Táta',
            bro: 'Brácha',
            pending: 'Čeká...',
            police_dispatch: 'Policejní dispečink',
            police_dispatch_msg: 'Jednotka 42 je na cestě k vám.',
            community_watch: 'Občanská hlídka',
            community_watch_msg: 'Dávejte na sebe pozor, hlaste...',
            type_message: 'Napište zprávu...',
            online: 'Online',
            my_account: 'Můj účet',
            personal_info: 'Osobní údaje',
            name: 'Jméno',
            enter_name: 'Zadejte jméno',
            surname: 'Příjmení',
            enter_surname: 'Zadejte příjmení',
            phone_number: 'Telefonní číslo',
            enter_phone: 'Zadejte telefon',
            email_address: 'Emailová adresa',
            enter_email: 'Zadejte email',
            settings: 'Nastavení',
            code_to_enter: 'Kód pro vstup do aplikace',
            change_code: 'Změnit vstupní kód',
            language: 'Jazyk',
            favorites: 'Oblíbené',
            favorites_desc: 'Zde se zobrazí vaše uložená místa.',
            walking_route: 'Pěší trasa',
            safe_distance: 'Bezpečná vzdálenost',
            go: 'Jít',
            h: 'h',
            min: 'min',
            sec: 'sek',
            you_are_here: 'Jste zde',
            app_version: 'Verze aplikace',
            developed_by: 'Vyvinuto týmem'
        }
    };

    let currentLang = localStorage.getItem('appLang') || 'en';

    window.setLanguage = function (lang) {
        if (!translations[lang]) return;
        currentLang = lang;
        localStorage.setItem('appLang', lang);

        // Update Text
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                el.innerText = translations[lang][key];
            }
        });

        // Update Placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[lang][key]) {
                el.placeholder = translations[lang][key];
            }
        });

        // Update Language Display
        const langDisplay = document.getElementById('current-language');
        if (langDisplay) {
            langDisplay.innerText = lang === 'en' ? 'English' : 'Čeština';
        }
    };

    window.toggleLanguage = function () {
        const newLang = currentLang === 'en' ? 'cs' : 'en';
        window.setLanguage(newLang);
    };

    // Initialize Language
    window.setLanguage(currentLang);


    // --- UI Navigation Logic ---

    // Load Profile Data
    function loadProfileData() {
        const defaultData = {
            name: 'Babatunde',
            surname: 'Yusuf',
            phone: '+234 097-123-0123',
            email: 'bjyusuf@myexample.com'
        };

        const savedData = JSON.parse(localStorage.getItem('profileData')) || defaultData;

        const inputs = {
            name: document.getElementById('profile-name'),
            surname: document.getElementById('profile-surname'),
            phone: document.getElementById('profile-phone'),
            email: document.getElementById('profile-email')
        };

        if (inputs.name) inputs.name.value = savedData.name || '';
        if (inputs.surname) inputs.surname.value = savedData.surname || '';
        if (inputs.phone) inputs.phone.value = savedData.phone || '';
        if (inputs.email) inputs.email.value = savedData.email || '';

        // Attach Save Listeners
        Object.keys(inputs).forEach(key => {
            if (inputs[key]) {
                inputs[key].addEventListener('input', () => {
                    const newData = {
                        name: inputs.name ? inputs.name.value : '',
                        surname: inputs.surname ? inputs.surname.value : '',
                        phone: inputs.phone ? inputs.phone.value : '',
                        email: inputs.email ? inputs.email.value : ''
                    };
                    localStorage.setItem('profileData', JSON.stringify(newData));
                });
            }
        });
    }

    loadProfileData();

    const navItems = document.querySelectorAll('.nav-item');
    const header = document.querySelector('.header');

    // Assign IDs to generic elements explicitly if missing
    if (header) header.id = 'header';

    navItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            // Remove active class from all
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active class to clicked
            item.classList.add('active');

            if (index === 0) { // Map
                window.switchView('map');
            } else if (index === 1) { // Favorites (Heart)
                window.switchView('favorites');
            } else if (index === 2) { // Chat
                window.switchView('chat');
            } else if (index === 3) { // Profile (User)
                window.switchView('profile');
            }
        });
    });

    // Chat Logic
    function initChat() {
        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const messagesContainer = document.getElementById('chat-messages-container');

        // Debugging logs
        console.log('Chat Init:', { chatInput, chatSendBtn, messagesContainer });

        if (!chatInput || !messagesContainer) {
            console.error('Chat elements not found!');
            return;
        }

        function handleSendMessage() {
            const text = chatInput.value.trim();
            console.log('Sending message:', text);

            if (!text) return;

            // Create Message Bubble
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble sent';
            bubble.innerText = text;

            // Create Status Indicator
            const status = document.createElement('div');
            status.className = 'message-time';
            status.innerHTML = `< span class="status-pending" style = "font-style: italic; color: #888; font-size: 0.75rem;" > ${translations[currentLang] ? translations[currentLang].pending : 'Pending...'}</span > `;

            messagesContainer.appendChild(bubble);
            messagesContainer.appendChild(status);

            // Clear and Scroll
            chatInput.value = '';
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Attach listeners
        if (chatSendBtn) {
            // Remove old listeners to be safe (though this runs once)
            chatSendBtn.onclick = handleSendMessage; // Simple binding
            console.log('Send button listener attached');
        } else {
            console.error('Send button not found');
        }

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSendMessage();
        });
    }

    // Call init
    initChat();

    // Expose functions to global scope for HTML onclick attributes
    window.switchView = function (viewName) {
        const allIds = ['map', 'chat-list-view', 'chat-detail-view', 'profile-view', 'favorites-view', 'sos-options-view', 'sos-success-view'];

        // Hide all views (opacity 0, pointer-events none via CSS class removal)
        allIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Remove active class to fade out
                el.classList.remove('active-view');
                el.classList.remove('fade-in'); // Remove animation class to reset it

                // For layout purposes, we might still need to toggle hidden for non-absolute items
                // But since view-containers are absolute, opacity 0 is enough visual hiding.
                // However, let's keep 'hidden' for performance and z-index management if opacity isn't enough

                // Wait for transition to finish before adding hidden? 
                // For simplicity, we'll just toggle the classes.
                if (id !== 'map') {
                    // For non-map views, we use the active-view class for opacity
                    // We also add hidden after delay if we wanted, but let's keep it simple:
                    // We add hidden immediately to 'others' and remove from 'current'
                    el.classList.add('hidden');
                } else {
                    // Map special handling: if we are hiding map, we might z-index it down
                    // But actually, map is z-index 1. Views are 2000.
                    // So we just need to show the view on top.
                }
            }
        });

        // Show Map View
        if (viewName === 'map') {
            document.getElementById('map').style.display = 'block';
            document.getElementById('header').style.display = 'flex';
            document.getElementById('sos-view').style.display = 'flex';

            // Map doesn't use view-container class, so we manage it directly
            // Ensure map is visible
            setTimeout(() => {
                map.invalidateSize();
            }, 50);

        } else {
            // Show Overlay Views (Chat, Profile, Favorites)
            // Ensure Map/Header/SOS are effectively hidden or overlapped
            // We can leave map in background (it looks cool) or hide it.
            // Let's leave map visible behind (if transparent) or covered.
            // Our view-containers have solid background presumably.

            // Optional: Hide header/sos when not on map
            document.getElementById('header').style.display = 'none';
            document.getElementById('sos-view').style.display = 'none';

            let targetId = '';
            if (viewName === 'chat') targetId = 'chat-list-view';
            else if (viewName === 'profile') targetId = 'profile-view';
            else if (viewName === 'favorites') targetId = 'favorites-view';
            else if (viewName === 'sos-options') targetId = 'sos-options-view';
            else if (viewName === 'sos-success') targetId = 'sos-success-view';

            const el = document.getElementById(targetId);
            if (el) {
                el.classList.remove('hidden');
                // Small delay to allow display:block to apply before transition starts
                setTimeout(() => {
                    el.classList.add('active-view');
                    el.classList.add('fade-in');
                }, 10);
            }
        }
    };


    let currentChatName = '';

    window.openChat = function (name) {
        currentChatName = name;
        document.getElementById('chat-list-view').classList.add('hidden');
        document.getElementById('chat-detail-view').classList.remove('hidden');
        document.getElementById('chat-name').innerText = name;

        // Update Header Avatar
        document.getElementById('chat-header-avatar').innerText = name.charAt(0);


        // Mock Messages based on name
        const container = document.getElementById('chat-messages-container');
        container.innerHTML = ''; // clear previous

        if (name === 'Mom') {
            container.innerHTML = `
                        <div class="message-bubble received">Hi! Where are you?</div>
                <div class="message-time">02:58 PM</div>
                
                <div class="message-bubble sent">I was in danger and i need help right now. Can u call anyone or can u come and help me?</div>
                <div class="message-bubble sent">I dont know where am I exacty.</div>
                <div class="message-time">02:59 PM</div>
                
                <div class="message-bubble received">I am on my way. Wait for Me.</div>
                <div class="message-time">03:00 PM</div>
                    `;
        } else if (name === 'Dad') {
            container.innerHTML = `
                        <div class="message-bubble received">Call me back when you can.</div>
                            <div class="message-time">10:00 AM</div>
                    `;
        } else if (name === 'Bro') {
            container.innerHTML = `
                        <div class="message-bubble received">Yo, u good?</div>
                            <div class="message-time">Yesterday</div>
                    `;
        } else {
            container.innerHTML = `<div class="message-bubble received">Hey! This is ${name}.</div>`;
        }
    };

    window.showChatProfile = function () {
        if (!currentChatName) return;

        document.getElementById('modal-name').innerText = currentChatName;
        document.getElementById('modal-avatar').innerText = currentChatName.charAt(0);

        // Randomize phone for demo
        const randomPhone = "+1 " + Math.floor(100 + Math.random() * 900) + " " + Math.floor(100 + Math.random() * 900) + " " + Math.floor(1000 + Math.random() * 9000);
        document.getElementById('modal-phone').innerText = randomPhone;

        document.getElementById('chat-profile-modal').classList.remove('hidden');
    }

    window.closeChatProfile = function () {
        document.getElementById('chat-profile-modal').classList.add('hidden');
    }

    window.closeChat = function () {
        document.getElementById('chat-detail-view').classList.add('hidden');
        document.getElementById('chat-list-view').classList.remove('hidden');
    };

    window.closeSOSOptions = function () {
        window.switchView('map');
    };

    window.closeSOSSuccess = function () {
        window.switchView('map');
    };

    window.triggerSOS = function (type) {
        // Show success view instead of alert
        window.switchView('sos-success');

        // Optional: Log type
        console.log("Triggering SOS: " + type);
    };

    // --- Generic Slider Logic ---
    function initSlider(sliderId, thumbId, onTrigger) {
        const slider = document.getElementById(sliderId);
        const thumb = document.getElementById(thumbId);
        const trackText = slider ? slider.querySelector('.sos-track-text') : null;
        const fill = slider ? slider.querySelector('.sos-fill') : null; // Select fill element

        if (!slider || !thumb) return;

        let isDragging = false;
        let startX = 0;
        const padding = 5;

        // Initial fill width calculation
        function updateFill(left) {
            if (fill) {
                // Width is left position + thumb width / 2 (center) + padding adjustment or similar
                // Or simply left + thumb width to cover passing
                const width = left + thumb.offsetWidth - padding;
                fill.style.width = width + 'px';
            }
        }

        // Initialize fill
        updateFill(padding);


        function startDrag(e) {
            isDragging = true;
            startX = (e.type === 'touchstart' ? e.touches[0].clientX : e.clientX) - thumb.offsetLeft;
            thumb.style.cursor = 'grabbing';
            thumb.style.transition = 'none';
            if (fill) fill.style.transition = 'none'; // Disable transition during drag
        }

        function moveDrag(e) {
            if (!isDragging) return;
            e.preventDefault();

            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            let newLeft = clientX - startX;

            const maxLeft = slider.offsetWidth - thumb.offsetWidth - padding;
            const minLeft = padding;

            if (newLeft < minLeft) newLeft = minLeft;
            if (newLeft > maxLeft) newLeft = maxLeft;

            thumb.style.left = newLeft + 'px';
            updateFill(newLeft);

            // Fade text
            const percentage = (newLeft - minLeft) / (maxLeft - minLeft);
            if (trackText) trackText.style.opacity = 1 - percentage;
        }

        function endDrag() {
            if (!isDragging) return;
            isDragging = false;
            thumb.style.cursor = 'grab';
            thumb.style.transition = 'left 0.3s ease';
            if (fill) fill.style.transition = 'width 0.3s ease';

            const maxLeft = slider.offsetWidth - thumb.offsetWidth - padding;
            const triggerThreshold = maxLeft * 0.9;
            const currentLeft = parseInt(thumb.style.left || padding);

            if (currentLeft >= triggerThreshold) {
                // Success
                thumb.style.left = maxLeft + 'px';
                updateFill(maxLeft);
                if (onTrigger) onTrigger();

                // Reset
                setTimeout(() => {
                    thumb.style.left = padding + 'px';
                    updateFill(padding);
                    if (trackText) trackText.style.opacity = 1;
                }, 1000);
            } else {
                // Snap back
                thumb.style.left = padding + 'px';
                updateFill(padding);
                if (trackText) trackText.style.opacity = 1;
            }
        }

        thumb.addEventListener('mousedown', startDrag);
        thumb.addEventListener('touchstart', startDrag);

        // Attach move/up to document to handle dragging outside element
        // We need to bind these specific to the active slider instance or use closure
        // Closure approach works fine here as listeners are unique per slider thumb start

        // Actually, to avoid document listener buildup, distinct listeners per slider is okay 
        // OR better: global move/up handlers that check active state. 
        // For simplicity in this vanilla JS script, we'll add document listeners.
        // To prevent conflict, we check isDragging flag inside closure.

        document.addEventListener('mousemove', moveDrag);
        document.addEventListener('touchmove', moveDrag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    }

    // Initialize Sliders
    // 1. Main SOS - Opens Options
    initSlider('sos-slider', 'sos-thumb', () => {
        window.switchView('sos-options');
    });

    // 2. Police Slider
    initSlider('slider-police', 'thumb-police', () => {
        triggerSOS('police');
    });

    // 3. Ambulance Slider
    initSlider('slider-ambulance', 'thumb-ambulance', () => {
        triggerSOS('medical');
    });

    // 4. Fire Slider
    initSlider('slider-fire', 'thumb-fire', () => {
        triggerSOS('fire');
    });

    // --- Add Resource Logic ---
    let isAddMode = false;
    let resourceTypeToAdd = null;

    window.openAddResourceModal = function () {
        document.getElementById('add-resource-modal').classList.remove('hidden');
    }

    window.closeAddResourceModal = function () {
        document.getElementById('add-resource-modal').classList.add('hidden');
    }

    window.selectResource = function (type) {
        resourceTypeToAdd = type;
        isAddMode = true;
        closeAddResourceModal();

        // Show instruction by changing cursor and adding class
        const mapEl = document.getElementById('map');
        mapEl.classList.add('add-mode-cursor');

        // Optional: Show a temporary message
        let msg = document.getElementById('add-instruction-toast');
        if (!msg) {
            msg = document.createElement('div');
            msg.id = 'add-instruction-toast';
            document.body.appendChild(msg);
        }
        msg.style.cssText = 'position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 20px; z-index: 4000; font-size: 0.9rem; pointer-events: none; backdrop-filter: blur(5px); display: flex; align-items: center; gap: 8px;';
        msg.innerHTML = `<i data-lucide="${type === 'water' ? 'droplet' : 'tent'}"></i> Tap on map to place ${type === 'water' ? 'Water' : 'Shelter'}`;

        lucide.createIcons();
    }

    // Map Click Handler for Adding Resources
    map.on('click', function (e) {
        if (isAddMode && resourceTypeToAdd) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;

            addResourceMarker(lat, lng, resourceTypeToAdd);

            // Reset Mode
            isAddMode = false;
            resourceTypeToAdd = null;
            document.getElementById('map').classList.remove('add-mode-cursor');

            const toast = document.getElementById('add-instruction-toast');
            if (toast) toast.remove();
        }
    });

    function addResourceMarker(lat, lng, type) {
        let iconName = 'map-pin';
        let title = 'Resource';

        if (type === 'water') {
            title = 'Water Source';
            iconName = 'droplet';
        } else if (type === 'shelter') {
            title = 'Shelter';
            iconName = 'tent';
        }

        const marker = L.marker([lat, lng], {
            icon: createCustomIcon(type, iconName)
        }).addTo(map);

        const popupContent = `
            <div class="facility-popup">
                <b>${title}</b><br>
                <span style="font-size:0.8rem; color:#888;">Added by you</span>
                <button class="navigate-btn" onclick="startNavigation(${lat}, ${lng})">
                    <i data-lucide="navigation"></i> Go
                </button>
            </div>
        `;

        marker.bindPopup(popupContent).openPopup();
        marker.on('popupopen', () => lucide.createIcons());
        lucide.createIcons();
    }

});
