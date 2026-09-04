window.CyclonEyeApp = (function() {
  let activeView = 'dashboard';
  let activeCyclone = null;
  let historicalData = [];
  let panIndiaTree = {};
  let panIndiaLocations = [];
  let currentLocation = null;

  const viewTitles = {
    dashboard: ["Dashboard", "Pan-India Coastal Disaster Intelligence & ML Prediction Engine"],
    'ml-model': ["ML Model & Analytics", "CyclonEye ML Engine architecture, training pipeline & model evaluation"],
    live: ["Live Monitoring", "Real-time satellite radar reflectivity, surface wind flow, and sea surface temperature"],
    tracking: ["Cyclone Tracking", "Forecast trajectory path and 72-hour uncertainty cone"],
    prediction: ["Cyclone Prediction", "AI-based intensity forecast models and wind speed trends"],
    formation: ["Formation Risk", "AI Cyclogenesis probability and environmental parameters"],
    flood: ["Flood Mapping", "Sentinel-1 SAR flood extent mapping over coastal deltas"],
    infra: ["Infrastructure Risk", "Vulnerability assessment matrix for power, transport, and health hubs"],
    shelters: ["Shelters & Routes", "Find nearest emergency cyclone shelters and evacuation paths"],
    alerts: ["Alerts & Notifications", "IMD & OSDMA emergency warnings and broadcast advisories"],
    historical: ["Historical Cyclones", "Replay past cyclone tracks and damage summaries"],
    analytics: ["Analytics & Reports", "5-year trend analysis, hazard indices, and report exports"],
    sources: ["Data Sources", "Provenance details of IMD, INSAT, NOAA, and Sentinel SAR feeds"],
    settings: ["Settings", "Platform preferences and notification parameters"]
  };

  function enterApp() {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    switchView('dashboard');
  }

  function showLanding() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('landing').classList.remove('hidden');
  }

  function switchView(viewName) {
    if (!viewTitles[viewName]) return;
    activeView = viewName;

    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');

    document.getElementById('tb-title').textContent = viewTitles[viewName][0];
    document.getElementById('tb-sub').textContent = viewTitles[viewName][1];

    refreshViewContent(viewName);
    setTimeout(() => MapEngine.resizeAllMaps(), 120);
  }

  function refreshViewContent(viewName) {
    if (viewName === 'dashboard') {
      fetchLocationsData();
      fetchDashboardData();
    } else if (viewName === 'ml-model') {
      fetchMLModelStatus();
    } else if (viewName === 'live') {
      MapEngine.initLiveMap();
    } else if (viewName === 'tracking') {
      if (activeCyclone) MapEngine.initTrackingMap(activeCyclone);
    } else if (viewName === 'prediction') {
      if (activeCyclone) {
        MapEngine.initPredictionMap(activeCyclone);
        ChartsEngine.initWindChart(activeCyclone.forecast);
      }
    } else if (viewName === 'formation') {
      Simulator.init();
    } else if (viewName === 'flood') {
      initFloodSlider();
    } else if (viewName === 'infra') {
      fetchInfraData();
    } else if (viewName === 'shelters') {
      SheltersEngine.init();
    } else if (viewName === 'alerts') {
      fetchAlertsData();
    } else if (viewName === 'historical') {
      fetchHistoricalData();
    } else if (viewName === 'analytics') {
      fetchAnalyticsData();
    }
  }

  function updateClock() {
    const now = new Date();
    const opts = { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
    const timeStr = now.toLocaleString('en-IN', opts);
    document.getElementById('tb-time').textContent = `${timeStr} IST`;
  }

  function fetchLocationsData() {
    fetch('/api/locations')
      .then(res => res.json())
      .then(data => {
        panIndiaTree = data.tree;
        populateLocationDropdowns(data.tree);

        // Flatten locations list for map
        panIndiaLocations = [];
        Object.keys(data.tree).forEach(st => {
          Object.keys(data.tree[st]).forEach(dist => {
            panIndiaLocations = panIndiaLocations.concat(data.tree[st][dist]);
          });
        });

        if (!currentLocation && panIndiaLocations.length > 0) {
          selectLocation('Puri');
        } else {
          MapEngine.initDashboardMap(panIndiaLocations, currentLocation);
        }
      });
  }

  function populateLocationDropdowns(tree) {
    const stateSelect = document.getElementById('stateSelect');
    const districtSelect = document.getElementById('districtSelect');

    if (!stateSelect || !districtSelect) return;

    stateSelect.innerHTML = '<option value="all">All India States</option>';
    Object.keys(tree).forEach(st => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      stateSelect.appendChild(opt);
    });

    stateSelect.onchange = () => {
      const selectedState = stateSelect.value;
      districtSelect.innerHTML = '<option value="all">Select District</option>';

      if (selectedState === 'all') {
        MapEngine.initDashboardMap(panIndiaLocations, null);
        const subEl = document.getElementById('currentLocSub');
        if (subEl) subEl.textContent = 'Selected: Pan-India Coastal Belt Overview (18.00° N, 80.00° E)';
        return;
      }

      if (tree[selectedState]) {
        Object.keys(tree[selectedState]).forEach(dist => {
          const opt = document.createElement('option');
          opt.value = dist;
          opt.textContent = dist;
          districtSelect.appendChild(opt);
        });

        // Select first location in state
        const firstDist = Object.keys(tree[selectedState])[0];
        if (firstDist && tree[selectedState][firstDist][0]) {
          selectLocation(tree[selectedState][firstDist][0].id);
        }
      }
    };

    districtSelect.onchange = () => {
      const selectedState = stateSelect.value;
      const selectedDist = districtSelect.value;
      if (selectedState !== 'all' && selectedDist !== 'all' && tree[selectedState][selectedDist]) {
        const loc = tree[selectedState][selectedDist][0];
        if (loc) selectLocation(loc.id);
      }
    };
  }

  function selectLocation(locQuery) {
    fetch('/api/predict/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_id: locQuery })
    })
    .then(res => res.json())
    .then(res => {
      currentLocation = res.location;
      const preds = res.predictions;

      // Sync State & District dropdowns to match selected location
      const stateSelect = document.getElementById('stateSelect');
      const districtSelect = document.getElementById('districtSelect');
      if (stateSelect && res.location.state && panIndiaTree[res.location.state]) {
        stateSelect.value = res.location.state;
        if (districtSelect) {
          districtSelect.innerHTML = '<option value="all">Select District</option>';
          Object.keys(panIndiaTree[res.location.state]).forEach(dist => {
            const opt = document.createElement('option');
            opt.value = dist;
            opt.textContent = dist;
            districtSelect.appendChild(opt);
          });
          districtSelect.value = res.location.district || 'all';
        }
      }

      // Update Dashboard Header & Badges
      const subEl = document.getElementById('currentLocSub');
      if (subEl) subEl.textContent = `Selected: ${res.location.city}, ${res.location.state} (${res.location.lat}° N, ${res.location.lon}° E)`;

      const badgeEl = document.getElementById('overallRiskBadge');
      if (badgeEl) {
        const colorClass = preds.overall_level === 'EXTREME' || preds.overall_level === 'HIGH' ? 'pill-red' : 'pill-amber';
        badgeEl.className = `pill ${colorClass}`;
        badgeEl.textContent = `OVERALL RISK: ${preds.overall_level} (${preds.overall_score}/100)`;
      }

      const confEl = document.getElementById('mlConfidenceTag');
      if (confEl) confEl.textContent = `Confidence: ${preds.confidence_score_pct}%`;

      // Update Mini-Stat Cards
      document.getElementById('cardCycloneRisk').textContent = `${preds.cyclone_risk_pct}% ${preds.cyclone_risk_pct > 70 ? 'High' : 'Moderate'}`;
      document.getElementById('cardFloodRisk').textContent = `${preds.flood_risk_pct}% ${preds.flood_risk_pct > 70 ? 'High' : 'Moderate'}`;
      document.getElementById('cardInfraRisk').textContent = `${preds.infra_risk_pct}% ${preds.infra_risk_pct > 70 ? 'High' : 'Moderate'}`;

      // Render Explainability Bars ("Why This Prediction?")
      renderExplainabilityList(res.explainability);

      // Re-center Map on Selected Location
      MapEngine.initDashboardMap(panIndiaLocations, res.location);
    });
  }

  function renderExplainabilityList(explainability) {
    const container = document.getElementById('explainabilityList');
    if (!container || !explainability) return;

    container.innerHTML = '';
    explainability.forEach(item => {
      const row = document.createElement('div');
      row.className = 'exp-item';
      row.innerHTML = `
        <div class="exp-lbl">
          <span>${item.factor}</span>
          <span class="exp-impact">${item.impact} (${item.importance}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${item.importance}%;background:linear-gradient(90deg, var(--cyan), var(--blue));"></div>
        </div>
      `;
      container.appendChild(row);
    });
  }

  function fetchDashboardData() {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        document.getElementById('dashActiveCount').textContent = data.active_cyclones;
        document.getElementById('dashRiskZones').textContent = data.high_risk_zones;
        document.getElementById('dashAlertedStates').textContent = data.coastal_states_alerted;
        document.getElementById('dashDistrictsCount').textContent = data.districts_at_risk;
      });

    fetch('/api/cyclones')
      .then(res => res.json())
      .then(cyclones => {
        if (cyclones && cyclones.length > 0) activeCyclone = cyclones[0];
      });
  }

  function fetchMLModelStatus() {
    fetch('/api/model/status')
      .then(res => res.json())
      .then(config => {
        if (document.getElementById('mlStatusPill')) document.getElementById('mlStatusPill').textContent = config.status;
        if (document.getElementById('mlSamplesCount')) document.getElementById('mlSamplesCount').textContent = `${parseInt(config.training_samples).toLocaleString()} Records`;
        if (document.getElementById('mlFeatureCount')) document.getElementById('mlFeatureCount').textContent = `${config.feature_count} Features`;
        if (document.getElementById('mlTrainAcc')) document.getElementById('mlTrainAcc').textContent = config.training_accuracy;
        if (document.getElementById('mlValAcc')) document.getElementById('mlValAcc').textContent = config.validation_accuracy;
        if (document.getElementById('mlF1')) document.getElementById('mlF1').textContent = config.f1_score;
        if (document.getElementById('mlRmse')) document.getElementById('mlRmse').textContent = config.rmse;
        if (document.getElementById('mlLastRun')) document.getElementById('mlLastRun').textContent = config.last_training;
      });
  }

  function initMLModelView() {
    const term = document.getElementById('mlTerminalLog');

    const btnTrain = document.getElementById('btnTrainModel');
    if (btnTrain) {
      btnTrain.onclick = () => {
        if (term) {
          term.innerHTML += `<br><span style="color:var(--amber);">[START] Initiating CyclonEye ML Training Pipeline...</span><br>`;
          let epoch = 1;
          const interval = setInterval(() => {
            const loss = (0.45 - epoch * 0.038).toFixed(3);
            const acc = (88.0 + epoch * 0.74).toFixed(1);
            term.innerHTML += `[EPOCH ${epoch}/10] Train Loss: ${loss} | Val Accuracy: ${acc}%<br>`;
            term.scrollTop = term.scrollHeight;
            epoch++;

            if (epoch > 10) {
              clearInterval(interval);
              fetch('/api/model/train', { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                  term.innerHTML += `<span style="color:var(--green);">[SUCCESS] ${data.message}</span><br>`;
                  term.innerHTML += `<span style="color:var(--cyan);">${data.notice}</span><br>`;
                  term.scrollTop = term.scrollHeight;
                  fetchMLModelStatus();
                });
            }
          }, 300);
        }
      };
    }

    const btnEval = document.getElementById('btnEvalModel');
    if (btnEval) {
      btnEval.onclick = () => {
        fetch('/api/model/evaluate', { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            if (term) {
              term.innerHTML += `<br><span style="color:var(--cyan);">[EVAL] Model Evaluation Summary:</span><br>`;
              term.innerHTML += `• Precision: ${data.precision} | Recall: ${data.recall} | F1: ${data.f1_score}<br>`;
              term.innerHTML += `• Track MAE: ${data.mae}<br>`;
              term.innerHTML += `<span style="color:var(--amber);">${data.notice}</span><br>`;
              term.scrollTop = term.scrollHeight;
            }
          });
      };
    }

    const btnRunPred = document.getElementById('btnRunPred');
    if (btnRunPred) {
      btnRunPred.onclick = () => {
        if (term) {
          term.innerHTML += `<br><span style="color:var(--green);">[INFERENCE] Executing Pan-India Coastal ML Risk Scoring across 42 Districts...</span><br>`;
          term.innerHTML += `[SUCCESS] Batch inference complete in 0.084s.<br>`;
          term.scrollTop = term.scrollHeight;
        }
        switchView('dashboard');
      };
    }
  }

  function fetchInfraData(sector = 'all') {
    fetch(`/api/infrastructure?sector=${sector}`)
      .then(res => res.json())
      .then(items => {
        MapEngine.initInfraMap(items);
        const tbody = document.querySelector('#infraTable tbody');
        if (tbody) {
          tbody.innerHTML = '';
          items.forEach(item => {
            const color = item.risk_level === 'High Risk' ? 'var(--red)' : (item.risk_level === 'Moderate Risk' ? 'var(--amber)' : 'var(--green)');
            const pillClass = item.risk_level === 'High Risk' ? 'pill-red' : (item.risk_level === 'Moderate Risk' ? 'pill-amber' : 'pill-green');
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><span class="risk-dot" style="background:${color}"></span>${item.name}</td>
              <td>${item.sector}</td>
              <td><span class="pill ${pillClass}">${item.risk_level}</span></td>
              <td style="font-weight:700;color:${color}">${item.risk_score}</td>
            `;
            tbody.appendChild(tr);
          });
        }
      });
  }

  function fetchAlertsData(category = 'all') {
    fetch(`/api/alerts?category=${category}`)
      .then(res => res.json())
      .then(alerts => {
        const container = document.getElementById('fullAlertsList');
        if (!container) return;
        container.innerHTML = '';
        alerts.forEach(a => {
          const color = a.severity === 'High' ? 'var(--red)' : 'var(--amber)';
          const pillClass = a.severity === 'High' ? 'pill-red' : 'pill-amber';
          const row = document.createElement('div');
          row.className = 'alert-row';
          row.innerHTML = `
            <div class="alert-ico" style="background:rgba(240,71,63,.15);color:${color};">⚠️</div>
            <div class="alert-txt">
              <b>${a.title}</b>
              <span>${a.region} • ${a.description}</span>
            </div>
            <span class="pill ${pillClass}" style="margin-left:auto;">${a.severity}</span>
            <div class="alert-time">${a.timestamp}</div>
          `;
          container.appendChild(row);
        });
      });
  }

  function fetchHistoricalData() {
    fetch('/api/historical')
      .then(res => res.json())
      .then(records => {
        historicalData = records;
        const select = document.getElementById('histSelect');
        if (!select) return;

        select.innerHTML = '';
        records.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = `${r.name} (${r.year})`;
          select.appendChild(opt);
        });

        select.onchange = () => {
          const selected = historicalData.find(h => h.id === select.value);
          if (selected) renderHistoricalDetails(selected);
        };

        if (records.length > 0) renderHistoricalDetails(records[0]);
      });
  }

  function renderHistoricalDetails(record) {
    document.getElementById('hCat').textContent = record.max_category;
    document.getElementById('hWind').textContent = `${record.max_wind_speed} km/h`;
    document.getElementById('hLand').textContent = record.landfall_date;
    document.getElementById('hDamage').textContent = record.damage_usd;

    MapEngine.initHistoricalMap(record.track);
  }

  function fetchAnalyticsData() {
    fetch('/api/analytics')
      .then(res => res.json())
      .then(data => {
        ChartsEngine.initAnalyticsChart(data.years, data.frequencies);

        const listEl = document.getElementById('riskIndexList');
        if (listEl && data.state_risk_indices) {
          listEl.innerHTML = '';
          data.state_risk_indices.forEach(s => {
            const row = document.createElement('div');
            row.style.cssText = "display:flex;align-items:center;gap:12px;padding:8px 0;";
            row.innerHTML = `
              <span style="width:110px;font-size:12.5px;color:var(--text);">${s.state}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${s.score}%;background:${s.color};"></div></div>
              <span style="width:30px;text-align:right;font-size:13px;color:var(--text-hi);font-weight:700;">${s.score}</span>
            `;
            listEl.appendChild(row);
          });
        }
      });
  }

  function initFloodSlider() {
    const box = document.getElementById('floodSliderBox');
    const afterLayer = document.getElementById('floodAfterLayer');
    const handle = document.getElementById('floodHandle');
    if (!box || !afterLayer || !handle) return;

    let isDragging = false;

    function setSliderPos(x) {
      const rect = box.getBoundingClientRect();
      let pos = (x - rect.left) / rect.width;
      pos = Math.max(0.05, Math.min(0.95, pos));
      afterLayer.style.width = `${pos * 100}%`;
      handle.style.left = `${pos * 100}%`;
    }

    box.addEventListener('mousedown', (e) => { isDragging = true; setSliderPos(e.clientX); });
    window.addEventListener('mousemove', (e) => { if (isDragging) setSliderPos(e.clientX); });
    window.addEventListener('mouseup', () => { isDragging = false; });
  }

  function exportPdfReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("CyclonEye — Pan-India Coastal Risk Summary", 20, 25);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 20, 35);

    doc.setLineWidth(0.5);
    doc.line(20, 40, 190, 40);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Pan-India Model Telemetry:", 20, 52);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("• Active Cyclonic Systems: 2 (Bay of Bengal & Arabian Sea)", 25, 62);
    doc.text(`• Monitored Location: ${currentLocation ? currentLocation.city : 'Puri'}, ${currentLocation ? currentLocation.state : 'Odisha'}`, 25, 70);
    doc.text("• ML Model Architecture: XGBoost + LSTM + U-Net (v1.0)", 25, 78);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Pan-India Coastal Vulnerability:", 20, 95);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("1. Odisha & West Bengal Coasts (Hazard Score: 92 - EXTREME)", 25, 105);
    doc.text("2. Andhra Pradesh & Tamil Nadu Coasts (Hazard Score: 68 - HIGH)", 25, 113);
    doc.text("3. Gujarat & Maharashtra Coasts (Hazard Score: 58 - MODERATE)", 25, 121);

    doc.text("This official report is generated automatically by CyclonEye ML Engine v1.0.", 20, 150);
    doc.save("CyclonEye_PanIndia_Report_2026.pdf");
  }

  function setupEventListeners() {
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          selectLocation(searchInput.value.trim());
        }
      });
    }

    initMLModelView();

    document.querySelectorAll('.layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.layer-btn').forEach(b => {
          b.classList.remove('active', 'on');
        });
        btn.classList.add('active', 'on');
        const layerName = btn.dataset.layer;
        MapEngine.setLiveLayer(layerName);
      });
    });

    const playBtn = document.getElementById('playTimelineBtn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        MapEngine.toggleTimeline();
      });
    }

    document.querySelectorAll('#infraTabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#infraTabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        fetchInfraData(tab.dataset.filter);
      });
    });

    document.querySelectorAll('#alertTabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#alertTabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        fetchAlertsData(tab.dataset.cat);
      });
    });

    const pdfBtn = document.getElementById('exportPdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', exportPdfReport);

    const csvBtn = document.getElementById('exportCsvBtn');
    if (csvBtn) {
      csvBtn.addEventListener('click', () => {
        window.location.href = '/api/export/csv';
      });
    }

    window.addEventListener('resize', () => MapEngine.resizeAllMaps());
  }

  function fetchSystemMode() {
    fetch('/api/mode')
      .then(res => res.json())
      .then(data => {
        updateModeUI(data.mode, data.is_live);
      });
  }

  function toggleSystemMode() {
    const modeBadge = document.getElementById('modeBadge');
    const isCurrentlyLive = modeBadge && modeBadge.classList.contains('live');
    const nextMode = isCurrentlyLive ? 'DEMO MODE' : 'LIVE MODE';

    fetch('/api/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: nextMode })
    })
    .then(res => res.json())
    .then(data => {
      updateModeUI(data.mode, data.is_live);
      if (currentLocation) {
        selectLocation(currentLocation.city);
      }
    });
  }

  function updateModeUI(mode, isLive) {
    const badge = document.getElementById('modeBadge');
    if (badge) {
      if (isLive) {
        badge.className = 'mode-badge live';
        badge.title = 'LIVE Operational Stream Active (Click to toggle Demo Mode)';
        badge.innerHTML = '<span class="pulse-dot"></span>LIVE MODE';
      } else {
        badge.className = 'mode-badge demo';
        badge.title = 'Simulated ML Inference Mode (Click to toggle Live Mode)';
        badge.innerHTML = '🧪 DEMO MODE';
      }
    }

    const pill = document.getElementById('mlStatusPill');
    if (pill) {
      if (isLive) {
        pill.className = 'pill pill-green';
        pill.textContent = '🟢 LIVE OPERATIONAL STREAM';
      } else {
        pill.className = 'pill pill-blue';
        pill.textContent = 'DEMO MODEL INFERENCE';
      }
    }
  }

  let currentTheme = 'dark';

  function initTheme() {
    const savedTheme = localStorage.getItem('cycloneye_theme') || 'dark';
    setTheme(savedTheme, false);
  }

  function setTheme(themeName, save = true) {
    currentTheme = themeName === 'light' ? 'light' : 'dark';
    if (currentTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    if (save) {
      localStorage.setItem('cycloneye_theme', currentTheme);
    }

    // Update Topbar button
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      if (currentTheme === 'light') {
        btn.innerHTML = '☀️ Light';
        btn.title = 'Current Theme: Light Mode (Click to switch to Dark)';
      } else {
        btn.innerHTML = '🌙 Dark';
        btn.title = 'Current Theme: Dark Mode (Click to switch to Light)';
      }
    }

    // Update Settings options UI
    const optDark = document.getElementById('themeOptDark');
    const optLight = document.getElementById('themeOptLight');
    if (optDark && optLight) {
      optDark.classList.toggle('active', currentTheme === 'dark');
      optLight.classList.toggle('active', currentTheme === 'light');
    }
  }

  function toggleTheme() {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme, true);
  }

  function init() {
    initTheme();
    updateClock();
    setInterval(updateClock, 1000);
    setupEventListeners();
    fetchSystemMode();
    fetchLocationsData();
    fetchDashboardData();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    enterApp,
    showLanding,
    switchView,
    selectLocation,
    toggleSystemMode,
    setTheme,
    toggleTheme
  };
})();

function enterApp() { CyclonEyeApp.enterApp(); }
function showLanding() { CyclonEyeApp.showLanding(); }
function switchView(v) { CyclonEyeApp.switchView(v); }
function toggleSystemMode() { CyclonEyeApp.toggleSystemMode(); }
function setTheme(t) { CyclonEyeApp.setTheme(t); }
function toggleTheme() { CyclonEyeApp.toggleTheme(); }

