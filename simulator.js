window.Simulator = (function() {
  function init() {
    const sstInput = document.getElementById('simSst');
    const pressInput = document.getElementById('simPress');
    const humInput = document.getElementById('simHum');

    if (!sstInput || !pressInput || !humInput) return;

    const sstVal = document.getElementById('simSstVal');
    const pressVal = document.getElementById('simPressVal');
    const humVal = document.getElementById('simHumVal');

    function updateSim() {
      const sst = parseFloat(sstInput.value);
      const press = parseFloat(pressInput.value);
      const hum = parseFloat(humInput.value);

      sstVal.textContent = `${sst.toFixed(1)} °C`;
      pressVal.textContent = `${press} hPa`;
      humVal.textContent = `${hum} %`;

      // Call Backend REST API for simulation payload
      fetch('/api/formation/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sst, pressure: press, humidity: hum, shear: 'low' })
      })
      .then(res => res.json())
      .then(data => {
        const gauge = document.getElementById('formationGauge');
        const pctEl = document.getElementById('formationPct');
        const lvlEl = document.getElementById('formationLvl');
        const msgEl = document.getElementById('formationMsg');

        if (gauge && pctEl && lvlEl) {
          gauge.style.setProperty('--pct', data.simulated_prob);
          pctEl.textContent = `${data.simulated_prob}%`;
          lvlEl.textContent = data.risk_level;
          msgEl.textContent = data.message;

          const color = data.simulated_prob >= 75 ? '#f0473f' : (data.simulated_prob >= 45 ? '#f0a83c' : '#22c77c');
          lvlEl.style.color = color;
        }
      })
      .catch(err => console.error("Simulation API error:", err));
    }

    sstInput.addEventListener('input', updateSim);
    pressInput.addEventListener('input', updateSim);
    humInput.addEventListener('input', updateSim);
  }

  return { init };
})();
