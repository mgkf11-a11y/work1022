/**
 * ChartController: Chart.js를 활용한 인포그래픽 시각화 및 인터랙티브 제어 모듈
 */
const ChartController = {
  donutChart: null,
  comparisonChart: null,
  newProjectsChart: null,

  // 일관된 고품질 비주얼 팔레트
  PALETTE: [
    '#2563eb', // Indigo Blue
    '#0d9488', // Deep Teal
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f97316', // Orange
    '#6366f1', // Violet
    '#64748b'  // Slate
  ],

  /**
   * 차트 전체 갱신
   */
  updateCharts(state) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const sectorStats = state.getSectorStats();
    const newProjects = state.getNewProjectsList();

    this.renderDonutChart(sectorStats);
    this.renderComparisonChart(sectorStats);
    this.renderNewProjectsChart(newProjects);
  },

  /**
   * 1. 분야별 예산 점유율 도넛 차트
   */
  renderDonutChart(sectorStats) {
    const ctx = document.getElementById('donutChart');
    if (!ctx) return;

    if (this.donutChart) {
      this.donutChart.destroy();
    }

    // 예산이 있는 분야만 필터링
    const validSectors = sectorStats.filter(s => s.targetSum > 0);
    const labels = validSectors.map(s => s.name.replace(/^[①-⑩\d\.\s]+/, ''));
    const data = validSectors.map(s => s.targetSum);
    const backgroundColors = validSectors.map((_, idx) => this.PALETTE[idx % this.PALETTE.length]);

    this.donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: backgroundColors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              padding: 12,
              font: {
                family: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
                size: 11
              },
              generateLabels: (chart) => {
                const datasets = chart.data.datasets;
                const total = datasets[0].data.reduce((acc, v) => acc + v, 0);
                return chart.data.labels.map((label, i) => {
                  const val = datasets[0].data[i];
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return {
                    text: `${label} (${pct}%)`,
                    fillStyle: datasets[0].backgroundColor[i],
                    hidden: isNaN(datasets[0].data[i]) || chart.getDatasetMeta(0).data[i].hidden,
                    index: i
                  };
                });
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const val = context.raw || 0;
                const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${val.toLocaleString()}억원 (${pct}%)`;
              }
            }
          }
        },
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const index = elements[0].index;
            const clickedSector = validSectors[index].name;
            // 크로스 필터링 트리거
            StateManager.setFilter('sector', clickedSector);
            const selectEl = document.getElementById('sectorFilter');
            if (selectEl) selectEl.value = clickedSector;
          }
        },
        cutout: '62%'
      }
    });
  },

  /**
   * 2. 분야별 전년 vs 당해 비교 막대 차트
   */
  renderComparisonChart(sectorStats) {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;

    if (this.comparisonChart) {
      this.comparisonChart.destroy();
    }

    // 예산 규모 상위 최대 7개 분야
    const displaySectors = sectorStats.slice(0, 7);
    const labels = displaySectors.map(s => {
      const clean = s.name.replace(/^[①-⑩\d\.\s]+/, '');
      return clean.length > 8 ? clean.substring(0, 8) + '…' : clean;
    });

    const priorData = displaySectors.map(s => s.priorSum);
    const targetData = displaySectors.map(s => s.targetSum);

    this.comparisonChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '2026년 (A)',
            data: priorData,
            backgroundColor: '#94a3b8',
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8
          },
          {
            label: '2027년 정부안 (B)',
            data: targetData,
            backgroundColor: '#2563eb',
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: {
                family: "'Pretendard', sans-serif",
                size: 11
              }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: {
              callback: (val) => val >= 10000 ? `${(val / 10000).toFixed(1)}조` : `${val.toLocaleString()}억`
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 12,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              afterBody: (tooltipItems) => {
                const idx = tooltipItems[0].dataIndex;
                const diff = targetData[idx] - priorData[idx];
                const pct = priorData[idx] > 0 ? ((diff / priorData[idx]) * 100).toFixed(1) : 100;
                return `\n증감: ${diff >= 0 ? '+' : ''}${diff.toLocaleString()}억원 (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  /**
   * 3. 신규 도입 사업 TOP 랭킹 수평 막대 차트
   */
  renderNewProjectsChart(newProjects) {
    const ctx = document.getElementById('newProjectsChart');
    if (!ctx) return;

    if (this.newProjectsChart) {
      this.newProjectsChart.destroy();
    }

    // 억원 단위 신규 사업 상위 6개
    const topNew = newProjects
      .filter(p => p.unit === '억원' || !p.unit)
      .slice(0, 6);

    const labels = topNew.map(p => {
      return p.project.length > 14 ? p.project.substring(0, 14) + '…' : p.project;
    });
    const data = topNew.map(p => p.target);

    this.newProjectsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '2027 신규 배정액 (억원)',
          data: data,
          backgroundColor: '#0d9488',
          hoverBackgroundColor: '#0f766e',
          borderRadius: 6,
          barThickness: 20
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: {
              callback: (val) => `${val.toLocaleString()}억`
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              font: {
                family: "'Pretendard', sans-serif",
                size: 11
              }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                return topNew[idx].project;
              },
              afterLabel: (item) => {
                const idx = item.dataIndex;
                return `분야: ${topNew[idx].sector}\n상세: ${topNew[idx].details}`;
              }
            }
          }
        },
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const idx = elements[0].index;
            const item = topNew[idx];
            UIController.openDetailModal(item);
          }
        }
      }
    });
  }
};
