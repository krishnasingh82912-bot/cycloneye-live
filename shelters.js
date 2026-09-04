window.SheltersEngine = (function() {
  let sheltersData = [];
  const USER_LOCATION = [20.2885, 85.8266]; // Bhubaneswar base

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1);
  }

  function loadShelters(query = "") {
    const url = query ? `/api/shelters?location=${encodeURIComponent(query)}` : '/api/shelters';

    fetch(url)
      .then(res => res.json())
      .then(data => {
        sheltersData = data;
        renderSheltersList(sheltersData);
        MapEngine.initSheltersMap(sheltersData, null, USER_LOCATION);
      })
      .catch(err => console.error("Error loading shelters:", err));
  }

  function renderSheltersList(items) {
    const container = document.getElementById('shelterList');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:var(--text-faint);padding:10px 0;">No shelters found for specified location.</p>';
      return;
    }

    container.innerHTML = '';
    items.forEach((item, idx) => {
      const dist = calculateDistance(USER_LOCATION[0], USER_LOCATION[1], item.lat, item.lon);
      const row = document.createElement('div');
      row.className = 'shelter-item';
      row.innerHTML = `
        <div class="shelter-num">${idx + 1}</div>
        <div class="shelter-txt">
          <b>${item.name}</b>
          <span>${item.district}, ${item.state} • ${item.occupied}/${item.capacity} Occupied</span>
        </div>
        <div class="shelter-dist">${dist} km</div>
      `;

      row.addEventListener('click', () => {
        document.querySelectorAll('.shelter-item').forEach(el => el.style.background = 'transparent');
        row.style.background = 'rgba(51, 199, 232, 0.12)';
        MapEngine.initSheltersMap(sheltersData, item, USER_LOCATION);
      });

      container.appendChild(row);
    });
  }

  function init() {
    const input = document.getElementById('shelterSearchInput');
    if (input) {
      input.addEventListener('input', (e) => {
        loadShelters(e.target.value);
      });
    }
    loadShelters();
  }

  return { init, loadShelters };
})();
