window.ChartsEngine = (function() {
  let windChartInstance = null;
  let analyticsChartInstance = null;

  function initWindChart(forecastData) {
    const ctx = document.getElementById('windChart');
    if (!ctx) return;

    if (windChartInstance) windChartInstance.destroy();

    const labels = forecastData ? forecastData.map(f => f.label) : ['Now', '+6h', '+12h', '+18h', '+24h', '+48h', '+72h'];
    const winds = forecastData ? forecastData.map(f => f.wind) : [165, 160, 150, 145, 135, 90, 50];
    const pressures = forecastData ? forecastData.map(f => f.pressure) : [960, 964, 968, 972, 978, 992, 1004];

    windChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Max Wind Speed (km/h)',
            data: winds,
            borderColor: '#33c7e8',
            backgroundColor: 'rgba(51,199,232,0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            yAxisID: 'y'
          },
          {
            label: 'Central Pressure (hPa)',
            data: pressures,
            borderColor: '#f0a83c',
            borderWidth: 2,
            borderDash: [4, 4],
            fill: false,
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#c3ccdd', font: { family: 'Inter', size: 11 } }
          }
        },
        scales: {
          x: {
            grid: { color: '#16294a' },
            ticks: { color: '#7c8aa8', font: { family: 'Inter' } }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: { color: '#16294a' },
            ticks: { color: '#33c7e8' },
            title: { display: true, text: 'Wind Speed (km/h)', color: '#33c7e8' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#f0a83c' },
            title: { display: true, text: 'Pressure (hPa)', color: '#f0a83c' }
          }
        }
      }
    });
  }

  function initAnalyticsChart(years, frequencies) {
    const ctx = document.getElementById('analyticsChart');
    if (!ctx) return;

    if (analyticsChartInstance) analyticsChartInstance.destroy();

    const labels = years || [2019, 2020, 2021, 2022, 2023, 2024, 2025];
    const data = frequencies || [5, 7, 6, 9, 4, 7, 5];

    analyticsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Total Cyclonic Systems (Bay of Bengal & Arabian Sea)',
          data: data,
          backgroundColor: 'rgba(47, 140, 240, 0.75)',
          borderColor: '#2f8cf0',
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#c3ccdd', font: { family: 'Inter', size: 11 } } }
        },
        scales: {
          x: { grid: { color: '#16294a' }, ticks: { color: '#7c8aa8' } },
          y: { grid: { color: '#16294a' }, ticks: { color: '#c3ccdd' } }
        }
      }
    });
  }

  return {
    initWindChart,
    initAnalyticsChart
  };
})();
