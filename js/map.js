window.MapEngine = (function() {
  let maps = {};
  let mapLayers = {};
  let activeOverlay = 'radar';
  let routePolyline = null;
  let timelineTimer = null;
  let timelineStep = 0;
  let locationMarkersGroup = null;

  // Reliable Map Tile Providers (OpenStreetMap, Esri Satellite, CartoDB Dark)
  const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ESRI_SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const ESRI_LABELS_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
  const ESRI_DARK_TILES = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  const DEFAULT_CENTER = [18.0, 80.0]; // Pan-India Coastline View
  const DEFAULT_ZOOM = 5;

  function createMap(elementId, center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM) {
    if (maps[elementId]) {
      maps[elementId].invalidateSize();
      return maps[elementId];
    }

    const map = L.map(elementId, {
      center: center,
      zoom: zoom,
      zoomControl: true,
      attributionControl: false
    });

    // OpenStreetMap Default Reliable Base Layer
    const osmLayer = L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

    // Satellite Base Layer + Reference Labels
    const satelliteLayer = L.tileLayer(ESRI_SATELLITE_TILES, { maxZoom: 18, attribution: 'Esri Satellite' });
    const labelsLayer = L.tileLayer(ESRI_LABELS_TILES, { maxZoom: 18, opacity: 0.85 });
    const satelliteGroup = L.layerGroup([satelliteLayer, labelsLayer]);

    // Dark Canvas Layer
    const darkCanvasLayer = L.tileLayer(ESRI_DARK_TILES, { maxZoom: 18, attribution: 'CartoDB Dark' });

    // Layer Controls
    const baseMaps = {
      "🗺️ OpenStreetMap": osmLayer,
      "🛰️ Satellite View": satelliteGroup,
      "🌙 Dark Canvas View": darkCanvasLayer
    };

    L.control.layers(baseMaps, null, { position: 'topright', collapsed: true }).addTo(map);

    // Add Reset View Control
    addResetViewControl(map);

    // Add Translucent Legend Overlay
    addLegendControl(map);

    maps[elementId] = map;
    mapLayers[elementId] = {};

    // Force tile recalculation on load
    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 250);
    setTimeout(() => map.invalidateSize(), 600);

    return map;
  }

  function addResetViewControl(map) {
    const resetControl = L.control({ position: 'topleft' });
    resetControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'leaflet-bar reset-view-btn');
      div.innerHTML = '<a href="#" title="Reset to Full India Coastline View" style="display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;width:30px;height:30px;background:rgba(8,16,30,0.85);color:#33c7e8;border:1px solid #1c3255;border-radius:4px;text-decoration:none;">🏠</a>';
      div.onclick = function(e) {
        e.preventDefault();
        map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 1.2 });
      };
      return div;
    };
    resetControl.addTo(map);
  }

  function addLegendControl(map) {
    const legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'map-legend-overlay');
      div.innerHTML = `
        <div class="legend-title">Map Legend</div>
        <div class="legend-row"><span class="leg-sq sq-sat"></span> Satellite Base Map</div>
        <div class="legend-row"><span class="leg-sq sq-sar"></span> SAR Inundation Overlay</div>
        <div class="legend-row"><span class="leg-sq sq-track"></span> Cyclone Track / 72h Cone</div>
        <div class="legend-row"><span class="leg-sq sq-risk"></span> High Risk Zone</div>
        <div class="legend-row"><span class="leg-sq sq-shelter"></span> Emergency Relief Shelter</div>
      `;
      return div;
    };
    legendControl.addTo(map);
  }

  function createCycloneIcon(category = "Category 3") {
    return L.divIcon({
      className: 'custom-cyclone-marker',
      html: `
        <div class="cyclone-icon-wrap">
          <div class="cyclone-pulse"></div>
          <div class="cyclone-ring"></div>
          <div class="cyclone-eye"></div>
        </div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });
  }

  function createShelterIcon(label = "S") {
    return L.divIcon({
      className: 'custom-shelter-marker',
      html: `<div class="shelter-pin">${label}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  // Draw 72-Hour Translucent Forecast Cone Over Satellite Map
  function drawForecastCone(map, trackPoints) {
    if (!trackPoints || trackPoints.length < 2) return;

    const outerPointsUpper = [];
    const outerPointsLower = [];

    trackPoints.forEach((pt, idx) => {
      const spread = idx * 0.28;
      outerPointsUpper.push([pt.lat + spread, pt.lon - spread * 0.5]);
      outerPointsLower.unshift([pt.lat - spread, pt.lon + spread * 0.5]);
    });

    const conePolygon = outerPointsUpper.concat(outerPointsLower);

    L.polygon(conePolygon, {
      color: '#00f0ff',
      weight: 1.8,
      fillColor: '#00f0ff',
      fillOpacity: 0.22,
      dashArray: '5,5'
    }).addTo(map);

    const latLons = trackPoints.map(p => [p.lat, p.lon]);
    L.polyline(latLons, {
      color: '#33c7e8',
      weight: 3.5,
      dashArray: '6,6'
    }).addTo(map);

    trackPoints.forEach((pt, idx) => {
      const isNow = idx === 0;
      const marker = L.circleMarker([pt.lat, pt.lon], {
        radius: isNow ? 9 : 5,
        color: isNow ? '#f0473f' : '#33c7e8',
        fillColor: isNow ? '#f0473f' : '#04101f',
        fillOpacity: 1
      }).addTo(map);

      marker.bindPopup(`
        <div class="popup-storm">
          <h4>${pt.label} (${pt.time})</h4>
          <p>Wind: <span class="val">${pt.wind} km/h</span></p>
          <p>Pressure: <span class="val">${pt.pressure} hPa</span></p>
        </div>
      `);
    });
  }

  // Draw Translucent SAR Flood Inundation Polygons over Satellite Map
  function drawSARInundationOverlay(map) {
    // Mahanadi Delta Translucent Inundation Polygon
    const mahanadiFloodPolygon = [
      [20.45, 86.30], [20.65, 86.60], [20.55, 86.85], [20.25, 86.75], [20.20, 86.40]
    ];
    L.polygon(mahanadiFloodPolygon, {
      color: '#00ffff',
      weight: 2,
      fillColor: '#00f0ff',
      fillOpacity: 0.38,
      dashArray: '4,4'
    }).addTo(map).bindPopup('<b>🌊 Sentinel-1 SAR Flood Inundation</b><br>Kendrapara & Marshaghai Delta (18.5k ha submerged)');

    // Dhamra Estuary Translucent Inundation Polygon
    const dhamraFloodPolygon = [
      [20.75, 86.80], [20.90, 87.05], [20.70, 87.15], [20.60, 86.90]
    ];
    L.polygon(dhamraFloodPolygon, {
      color: '#00ffff',
      weight: 2,
      fillColor: '#00e5ff',
      fillOpacity: 0.35,
      dashArray: '4,4'
    }).addTo(map).bindPopup('<b>🌊 Sentinel-1 SAR Flood Inundation</b><br>Dhamra Estuary Coastal Flats (14.2k ha submerged)');
  }

  function initDashboardMap(locationsList = [], selectedLoc = null) {
    const map = createMap('dashboardMap', DEFAULT_CENTER, 5);

    // Render SAR Inundation Overlay
    drawSARInundationOverlay(map);

    // Render Pan-India Coastal Risk Markers
    if (locationMarkersGroup) map.removeLayer(locationMarkersGroup);
    locationMarkersGroup = L.layerGroup().addTo(map);

    if (locationsList && locationsList.length > 0) {
      locationsList.forEach(loc => {
        const isSelected = selectedLoc && (selectedLoc.id === loc.id || (selectedLoc.city && selectedLoc.city.toLowerCase() === loc.city.toLowerCase()));
        const riskLevel = loc.base_wind >= 150 ? 'EXTREME' : (loc.base_wind >= 125 ? 'HIGH' : (loc.base_wind >= 95 ? 'MODERATE' : 'LOW'));
        const color = loc.base_wind >= 125 ? '#f0473f' : (loc.base_wind >= 95 ? '#f0a83c' : '#22c77c');
        
        const marker = L.circleMarker([loc.lat, loc.lon], {
          radius: isSelected ? 12 : 7,
          color: isSelected ? '#ffffff' : color,
          fillColor: color,
          fillOpacity: isSelected ? 1.0 : 0.85,
          weight: isSelected ? 3.5 : 1.5
        }).addTo(locationMarkersGroup);

        marker.bindPopup(`
          <div class="popup-storm">
            <h4>📍 ${loc.city}, ${loc.state}</h4>
            <p>District: <span class="val">${loc.district}</span></p>
            <p>Risk Level: <span class="val" style="color:${color};font-weight:800;">${riskLevel}</span></p>
            <p>Wind / Pressure: <span class="val">${loc.base_wind} km/h • ${loc.base_pressure} hPa</span></p>
            <p>Elevation / Coast: <span class="val">${loc.elevation} m • ${loc.dist_coast} km</span></p>
            <button style="margin-top:8px;padding:6px 10px;background:linear-gradient(135deg,#33c7e8,#2f8cf0);color:#fff;border:none;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;width:100%;" onclick="CyclonEyeApp.selectLocation('${loc.id}')">📍 Select Location</button>
          </div>
        `);

        marker.on('click', () => {
          if (window.CyclonEyeApp && window.CyclonEyeApp.selectLocation) {
            window.CyclonEyeApp.selectLocation(loc.id);
          }
        });
      });
    }

    // Active Storm Eye 1 (Bay of Bengal)
    L.marker([18.4, 88.1], { icon: createCycloneIcon() }).addTo(map)
      .bindPopup('<b>Category 3 Severe Cyclone</b><br>Bay of Bengal (CY-2026-01)');

    // Active Storm Eye 2 (Arabian Sea)
    L.circleMarker([16.2, 69.5], { radius: 7, color: '#f0a83c', fillColor: '#f0a83c', fillOpacity: 0.9 }).addTo(map)
      .bindPopup('<b>Category 1 Tropical System</b><br>Arabian Sea (CY-2026-02)');

    // Smooth Auto-Zoom on Selected Location
    if (selectedLoc) {
      map.flyTo([selectedLoc.lat, selectedLoc.lon], 8, { duration: 1.2 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }

    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 300);
  }

  function initLiveMap() {
    const map = createMap('liveMap', [18.4, 88.1], 5);
    const center = [18.4, 88.1];

    if (!mapLayers['liveMap']) mapLayers['liveMap'] = {};

    // 1. Weather Radar & Rainband Layer
    const radarLayer = L.layerGroup();
    // Outer Light Rainband
    L.circle(center, { radius: 360000, color: '#22c77c', fillColor: '#22c77c', fillOpacity: 0.16, weight: 1.2 }).addTo(radarLayer);
    // Convective Rainband
    L.circle(center, { radius: 220000, color: '#f0a83c', fillColor: '#f0a83c', fillOpacity: 0.28, weight: 1.5 }).addTo(radarLayer);
    // Severe Core Rainband
    L.circle(center, { radius: 110000, color: '#f0473f', fillColor: '#f0473f', fillOpacity: 0.45, weight: 2 }).addTo(radarLayer);
    // Eye Wall Heavy Reflectivity
    L.circle(center, { radius: 45000, color: '#a463f0', fillColor: '#f0473f', fillOpacity: 0.70, weight: 2.5 }).addTo(radarLayer);

    // Feeder Spiral Arms
    const feederArm1 = [[18.4, 88.1], [19.2, 87.2], [20.1, 86.6], [20.8, 86.8]];
    L.polyline(feederArm1, { color: '#f0473f', weight: 8, opacity: 0.55 }).addTo(radarLayer);
    const feederArm2 = [[18.4, 88.1], [17.5, 89.2], [16.5, 90.1], [15.5, 91.0]];
    L.polyline(feederArm2, { color: '#f0a83c', weight: 6, opacity: 0.5 }).addTo(radarLayer);
    mapLayers['liveMap']['radar'] = radarLayer;

    // 2. Wind Flow Stream Vectors Layer
    const windLayer = L.layerGroup();
    const windCoords = [
      [18.4, 88.1, "NW 165 km/h (Core)", "#f0473f", 12],
      [19.2, 87.2, "WNW 150 km/h", "#f0473f", 10],
      [20.1, 86.6, "NW 135 km/h", "#f0473f", 9],
      [17.5, 89.2, "SW 125 km/h", "#f0a83c", 8],
      [16.5, 90.1, "S 110 km/h", "#f0a83c", 8],
      [17.6868, 83.2185, "SW 95 km/h (Visakhapatnam)", "#f0a83c", 7],
      [13.0827, 80.2707, "SSW 75 km/h (Chennai)", "#33c7e8", 6],
      [21.6266, 87.5074, "NNE 120 km/h (Digha)", "#f0473f", 9],
      [16.2, 69.5, "NNE 120 km/h (Arabian Sea Core)", "#f0a83c", 9],
      [18.9220, 72.8347, "W 65 km/h (Mumbai)", "#33c7e8", 6],
      [9.9312, 76.2673, "WNW 55 km/h (Kochi)", "#22c77c", 5],
      [22.4707, 69.0711, "NE 110 km/h (Jakhau)", "#f0a83c", 8]
    ];

    windCoords.forEach(wc => {
      const marker = L.circleMarker([wc[0], wc[1]], {
        radius: wc[4],
        color: wc[3],
        fillColor: wc[3],
        fillOpacity: 0.85
      }).addTo(windLayer);
      marker.bindTooltip(`💨 Wind Vector: ${wc[2]}`, { permanent: true, direction: 'top', className: 'wind-tooltip' });
    });
    mapLayers['liveMap']['wind'] = windLayer;

    // 3. Sea Surface Temperature (SST Thermal Pool Layer)
    const sstLayer = L.layerGroup();
    // Warm Pool (> 30.5°C)
    L.polygon([[15.0, 84.0], [21.0, 85.0], [21.5, 91.0], [14.0, 92.0]], {
      color: '#f0473f', fillColor: '#f0473f', fillOpacity: 0.30, weight: 1.5, dashArray: '4,4'
    }).addTo(sstLayer).bindTooltip('🌡️ Core SST Anomaly: 30.8°C (High Cyclogenesis Potential)', { permanent: false });
    // Moderate Pool (29.0°C - 30.5°C)
    L.polygon([[11.0, 80.0], [22.0, 82.0], [22.5, 94.0], [10.0, 93.0]], {
      color: '#f0a83c', fillColor: '#f0a83c', fillOpacity: 0.20, weight: 1
    }).addTo(sstLayer).bindTooltip('🌡️ Regional SST: 29.8°C', { permanent: false });
    mapLayers['liveMap']['sst'] = sstLayer;

    // 4. Satellite IR Cloud Coverage Layer
    const cloudsLayer = L.layerGroup();
    L.circle(center, { radius: 420000, color: '#eef3fb', fillColor: '#eef3fb', fillOpacity: 0.25, weight: 1 }).addTo(cloudsLayer);
    L.circle(center, { radius: 260000, color: '#ffffff', fillColor: '#ffffff', fillOpacity: 0.40, weight: 1.5 }).addTo(cloudsLayer);
    L.circle(center, { radius: 120000, color: '#ffffff', fillColor: '#ffffff', fillOpacity: 0.65, weight: 2 }).addTo(cloudsLayer);
    mapLayers['liveMap']['clouds'] = cloudsLayer;

    // 5. Isobaric Pressure Field Layer
    const pressureLayer = L.layerGroup();
    const isobars = [
      { r: 60000, p: "960 hPa (Central Low)" },
      { r: 140000, p: "975 hPa" },
      { r: 230000, p: "990 hPa" },
      { r: 340000, p: "1004 hPa" },
      { r: 460000, p: "1012 hPa" }
    ];
    isobars.forEach(ib => {
      L.circle(center, { radius: ib.r, color: '#a463f0', fillColor: 'transparent', weight: 1.8, dashArray: '6,6' })
        .bindTooltip(`⏱️ Isobar: ${ib.p}`, { permanent: true, direction: 'right' })
        .addTo(pressureLayer);
    });
    mapLayers['liveMap']['pressure'] = pressureLayer;

    // Default to Radar Overlay
    setLiveLayer('radar');

    // Add Cyclone Eye Epicenter Marker
    L.marker(center, { icon: createCycloneIcon() }).addTo(map);

    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 300);
  }

  function setLiveLayer(layerName) {
    const map = maps['liveMap'];
    if (!map || !mapLayers['liveMap']) return;

    activeOverlay = layerName;
    Object.keys(mapLayers['liveMap']).forEach(k => {
      if (mapLayers['liveMap'][k]) {
        map.removeLayer(mapLayers['liveMap'][k]);
      }
    });

    if (mapLayers['liveMap'][layerName]) {
      mapLayers['liveMap'][layerName].addTo(map);
    }
    map.invalidateSize();
  }

  function initTrackingMap(cycloneData) {
    const map = createMap('trackingMap', [19.5, 86.5], 6);
    if (!cycloneData || !cycloneData.forecast) return;

    L.marker([cycloneData.current_lat, cycloneData.current_lon], { icon: createCycloneIcon() }).addTo(map);
    drawForecastCone(map, cycloneData.forecast);
    setTimeout(() => map.invalidateSize(), 100);
  }

  function initPredictionMap(cycloneData) {
    const map = createMap('predictionMap', [19.8, 86.0], 6);
    if (cycloneData && cycloneData.forecast) {
      drawForecastCone(map, cycloneData.forecast);
    }
    setTimeout(() => map.invalidateSize(), 100);
  }

  function initInfraMap(infraItems) {
    const map = createMap('infraMap', [18.5, 82.0], 5);
    if (!infraItems) return;

    infraItems.forEach(item => {
      const color = item.risk_level === 'High Risk' ? '#f0473f' : (item.risk_level === 'Moderate Risk' ? '#f0a83c' : '#22c77c');
      const circle = L.circleMarker([item.lat, item.lon], {
        radius: 7,
        color: color,
        fillColor: color,
        fillOpacity: 0.85
      }).addTo(map);

      circle.bindPopup(`
        <div class="popup-storm">
          <h4>${item.name}</h4>
          <p>Sector: <span class="val">${item.sector}</span></p>
          <p>Risk Score: <span class="val" style="color:${color}">${item.risk_score} / 100 (${item.risk_level})</span></p>
          <p>Status: <span class="val">${item.status}</span></p>
        </div>
      `);
    });
    setTimeout(() => map.invalidateSize(), 100);
  }

  function initSheltersMap(shelters, selectedShelter = null, userLoc = [20.2885, 85.8266]) {
    const map = createMap('sheltersMap', userLoc, 8);

    L.circleMarker(userLoc, {
      radius: 9,
      color: '#33c7e8',
      fillColor: '#33c7e8',
      fillOpacity: 0.9
    }).addTo(map).bindPopup('<b>📍 Selected Location</b>');

    if (!shelters) return;

    shelters.forEach((shelter, idx) => {
      const marker = L.marker([shelter.lat, shelter.lon], {
        icon: createShelterIcon(idx + 1)
      }).addTo(map);

      marker.bindPopup(`
        <div class="popup-storm">
          <h4>${shelter.name}</h4>
          <p>District: <span class="val">${shelter.district}, ${shelter.state}</span></p>
          <p>Capacity: <span class="val">${shelter.occupied} / ${shelter.capacity}</span></p>
          <p>Phone: <span class="val">${shelter.contact}</span></p>
        </div>
      `);
    });

    if (selectedShelter) {
      if (routePolyline) map.removeLayer(routePolyline);
      routePolyline = L.polyline([userLoc, [selectedShelter.lat, selectedShelter.lon]], {
        color: '#22c77c',
        weight: 4,
        dashArray: '8,8'
      }).addTo(map);
      map.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });
    }
    setTimeout(() => map.invalidateSize(), 100);
  }

  function initHistoricalMap(trackData) {
    const map = createMap('historicalMap', [20.0, 86.5], 6);
    if (!trackData || !trackData.length) return;

    const latLons = trackData.map(t => [t.lat, t.lon]);
    L.polyline(latLons, { color: '#f0473f', weight: 3.5 }).addTo(map);

    trackData.forEach((pt, idx) => {
      const isLandfall = idx === 3 || pt.intensity.includes('Landfall');
      L.circleMarker([pt.lat, pt.lon], {
        radius: isLandfall ? 8 : 5,
        color: isLandfall ? '#f0a83c' : '#f0473f',
        fillColor: isLandfall ? '#f0a83c' : '#04101f',
        fillOpacity: 1
      }).addTo(map).bindPopup(`<b>${pt.intensity}</b><br>Lat: ${pt.lat}, Lon: ${pt.lon}`);
    });
    setTimeout(() => map.invalidateSize(), 100);
  }

  function toggleTimeline() {
    const btn = document.getElementById('playTimelineBtn');
    const label = document.getElementById('timelineLabel');
    const bar = document.getElementById('timelineBar');

    const steps = [
      { time: "4 Sep 2026 | 09:30 (IST)", pct: 25, lat: 17.5, lon: 89.0 },
      { time: "4 Sep 2026 | 12:30 (IST)", pct: 50, lat: 18.0, lon: 88.5 },
      { time: "4 Sep 2026 | 15:30 (IST) - Live", pct: 75, lat: 18.4, lon: 88.1 },
      { time: "4 Sep 2026 | 21:30 (IST) - Forecast", pct: 100, lat: 19.1, lon: 87.4 }
    ];

    if (timelineTimer) {
      clearInterval(timelineTimer);
      timelineTimer = null;
      if (btn) btn.textContent = '▶ Play';
      return;
    }

    if (btn) btn.textContent = '⏸ Pause';
    timelineTimer = setInterval(() => {
      timelineStep = (timelineStep + 1) % steps.length;
      const s = steps[timelineStep];
      if (label) label.textContent = s.time;
      if (bar) bar.style.width = `${s.pct}%`;

      if (maps['liveMap']) {
        maps['liveMap'].panTo([s.lat, s.lon]);
      }
    }, 2000);
  }

  function resizeAllMaps() {
    Object.keys(maps).forEach(k => {
      if (maps[k]) maps[k].invalidateSize();
    });
  }

  return {
    initDashboardMap,
    initLiveMap,
    setLiveLayer,
    initTrackingMap,
    initPredictionMap,
    initInfraMap,
    initSheltersMap,
    initHistoricalMap,
    toggleTimeline,
    resizeAllMaps
  };
})();
