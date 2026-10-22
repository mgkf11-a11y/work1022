/**
 * UIController: 대시보드 뷰 렌더링, KPI 통계 표출, 테이블/카드 뷰 제어, 모달 관리 모듈
 */
const UIController = {
  viewMode: 'table', // 'table' | 'cards'

  /**
   * 화면 전체 업데이트 (State 변경 시 자동 실행)
   */
  updateUI(state) {
    const stats = state.getSummaryStats();
    const sectors = state.getUniqueSectors();
    const units = state.getUniqueUnits();
    const newProjects = state.getNewProjectsList();

    this.renderHeaderInfo(state);
    this.renderKPICards(stats);
    this.renderNewProjectsGallery(newProjects);
    this.updateFilterControls(state, sectors, units);
    this.renderDataView(state.filteredData);
  },

  /**
   * 헤더 정보 렌더링 (파일명, 최종 갱신 등)
   */
  renderHeaderInfo(state) {
    const fileBadge = document.getElementById('currentFileBadge');
    if (fileBadge) {
      fileBadge.textContent = state.sourceInfo.filename;
    }
  },

  /**
   * 상단 KPI 인포그래픽 카드 4선 렌더링
   */
  renderKPICards(stats) {
    // 1. 총 예산 규모 (2027)
    const elTargetTotal = document.getElementById('kpiTargetTotal');
    const elTargetSub = document.getElementById('kpiTargetSub');
    if (elTargetTotal) {
      elTargetTotal.textContent = this.formatCurrency(stats.totalTarget);
    }
    if (elTargetSub) {
      const sign = stats.overallRate >= 0 ? '+' : '';
      elTargetSub.innerHTML = `전년비 <span class="badge ${stats.overallRate >= 0 ? 'badge-green' : 'badge-red'}">${sign}${stats.overallRate.toFixed(1)}%</span> (${this.formatCurrency(stats.totalPrior)} →)`;
    }

    // 2. 전년 대비 순증액
    const elNetChange = document.getElementById('kpiNetChange');
    const elNetChangeSub = document.getElementById('kpiNetChangeSub');
    if (elNetChange) {
      const sign = stats.totalChange >= 0 ? '+' : '';
      elNetChange.textContent = `${sign}${stats.totalChange.toLocaleString()} 억원`;
    }
    if (elNetChangeSub) {
      elNetChangeSub.textContent = `순증 규모 합계 (총 ${stats.totalProjectsCount}개 주요 지표 집계)`;
    }

    // 3. 2027 신규 사업 집중 지표
    const elNewCount = document.getElementById('kpiNewCount');
    const elNewBudget = document.getElementById('kpiNewBudget');
    if (elNewCount) {
      elNewCount.textContent = `${stats.newProjectsCount}개 신설 사업`;
    }
    if (elNewBudget) {
      elNewBudget.innerHTML = `배정액 <strong>${stats.newProjectsTotalBudget.toLocaleString()}억원</strong> (전체 예산의 ${stats.newProjectsSharePercent.toFixed(1)}%)`;
    }

    // 4. 주요 하이라이트 (최대 증액 & 최고 급증)
    const elHighlightGainer = document.getElementById('kpiTopGainer');
    const elHighlightGrower = document.getElementById('kpiTopGrower');
    if (elHighlightGainer && stats.topGainer) {
      elHighlightGainer.innerHTML = `<span class="tag-title">최대 증액</span> <strong>${stats.topGainer.project}</strong> (+${stats.topGainer.change.toLocaleString()}억원)`;
    }
    if (elHighlightGrower && stats.topGrower) {
      elHighlightGrower.innerHTML = `<span class="tag-title">최고 급증</span> <strong>${stats.topGrower.project}</strong> (${stats.topGrower.rateText})`;
    }
  },

  /**
   * 신규 사업 집중 하이라이트 갤러리 렌더링
   */
  renderNewProjectsGallery(newProjects) {
    const container = document.getElementById('newProjectsGallery');
    const countBadge = document.getElementById('newGalleryCountBadge');
    if (!container) return;

    if (countBadge) {
      countBadge.textContent = `${newProjects.length}개 사업 신설`;
    }

    if (newProjects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>등록된 신규 사업이 없습니다.</p>
        </div>
      `;
      return;
    }

    // 신규 사업 카드 표출
    const cardsHtml = newProjects.map(item => `
      <div class="new-project-card" onclick="UIController.openDetailModalById(${item.autoId})">
        <div class="card-top">
          <span class="badge-new">NEW 신설</span>
          <span class="card-sector">${this.cleanSectorName(item.sector)}</span>
        </div>
        <h4 class="card-title">${this.escapeHtml(item.project)}</h4>
        <div class="card-budget">
          <span class="budget-label">2027 신규배정</span>
          <span class="budget-value">${item.target.toLocaleString()} <small>${item.unit}</small></span>
        </div>
        <p class="card-details">${this.escapeHtml(item.details || '상세 추진 내용 확인')}</p>
      </div>
    `).join('');

    container.innerHTML = cardsHtml;
  },

  /**
   * 필터 컨트롤 상태 동기화 (셀렉트 박스 옵션 및 버튼 상태)
   */
  updateFilterControls(state, sectors, units) {
    // 1. 분야 드롭다운 옵션 채우기
    const sectorSelect = document.getElementById('sectorFilter');
    if (sectorSelect) {
      const currentVal = state.filters.sector;
      const opts = ['<option value="all">전체 분야 (All Sectors)</option>'];
      sectors.forEach(sec => {
        const isSelected = sec === currentVal ? 'selected' : '';
        opts.push(`<option value="${this.escapeHtml(sec)}" ${isSelected}>${this.escapeHtml(sec)}</option>`);
      });
      sectorSelect.innerHTML = opts.join('');
    }

    // 2. 단위 드롭다운
    const unitSelect = document.getElementById('unitFilter');
    if (unitSelect) {
      const currentVal = state.filters.unit;
      const opts = ['<option value="all">전체 단위 (All Units)</option>'];
      units.forEach(u => {
        const isSelected = u === currentVal ? 'selected' : '';
        opts.push(`<option value="${this.escapeHtml(u)}" ${isSelected}>${this.escapeHtml(u)}</option>`);
      });
      unitSelect.innerHTML = opts.join('');
    }

    // 3. 신규 사업만 보기 토글 버튼
    const newOnlyBtn = document.getElementById('newOnlyToggle');
    if (newOnlyBtn) {
      if (state.filters.newOnly) {
        newOnlyBtn.classList.add('active');
      } else {
        newOnlyBtn.classList.remove('active');
      }
    }

    // 4. 건수 표시
    const countEl = document.getElementById('filterResultCount');
    if (countEl) {
      countEl.innerHTML = `총 <strong>${state.rawData.length}</strong>건 중 <strong>${state.filteredData.length}</strong>건 표시`;
    }

    // 5. 전체 사업 데이터 목록 헤더 건수 및 힌트 표시
    const summaryEl = document.getElementById('tableResultSummary');
    if (summaryEl) {
      summaryEl.textContent = `총 ${state.filteredData.length}건`;
    }

    const hintEl = document.getElementById('datasetFilterHint');
    if (hintEl) {
      const hints = [];
      if (state.filters.newOnly) hints.push('✨ 신규사업만');
      if (state.filters.sector && state.filters.sector !== 'all') hints.push(this.cleanSectorName(state.filters.sector));
      if (state.filters.unit && state.filters.unit !== 'all') hints.push(state.filters.unit);
      if (state.filters.search) hints.push(`"${state.filters.search}"`);
      
      if (hints.length > 0) {
        hintEl.textContent = `[필터 적용: ${hints.join(' / ')}]`;
        hintEl.style.display = 'inline-block';
      } else {
        hintEl.textContent = '';
        hintEl.style.display = 'none';
      }
    }
  },

  /**
   * 테이블 뷰 또는 카드 뷰 렌더링
   */
  renderDataView(items) {
    const tableContainer = document.getElementById('tableContainer');
    const cardsContainer = document.getElementById('cardsContainer');

    if (this.viewMode === 'table') {
      if (tableContainer) tableContainer.style.display = 'block';
      if (cardsContainer) cardsContainer.style.display = 'none';
      this.renderTable(items);
    } else {
      if (tableContainer) tableContainer.style.display = 'none';
      if (cardsContainer) cardsContainer.style.display = 'grid';
      this.renderCardsView(items);
    }
  },

  /**
   * 반응형 데이터 테이블 렌더링
   */
  renderTable(items) {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="table-empty">
            <div class="empty-msg">
              <span>🔍</span>
              <p>검색 및 필터 조건에 일치하는 사업 항목이 없습니다.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = items.map(item => {
      const isPositive = item.change > 0;
      const isNegative = item.change < 0;
      const changeClass = isPositive ? 'val-plus' : (isNegative ? 'val-minus' : 'val-zero');
      const changeSign = isPositive ? '+' : '';

      return `
        <tr class="data-row ${item.isNew ? 'row-new' : ''}" onclick="UIController.openDetailModalById(${item.autoId})">
          <td class="col-id">${item.id}</td>
          <td class="col-sector">
            <span class="sector-tag">${this.escapeHtml(item.sector)}</span>
          </td>
          <td class="col-project">
            <div class="project-title-wrapper">
              ${item.isNew ? '<span class="badge-new-mini">NEW</span>' : ''}
              <span class="project-title">${this.escapeHtml(item.project)}</span>
            </div>
          </td>
          <td class="col-unit">${this.escapeHtml(item.unit)}</td>
          <td class="col-prior">${item.prior.toLocaleString()}</td>
          <td class="col-target font-bold">${item.target.toLocaleString()}</td>
          <td class="col-change ${changeClass}">${changeSign}${item.change.toLocaleString()}</td>
          <td class="col-rate">
            <span class="badge-rate ${item.isNew ? 'rate-new' : (item.rate > 50 ? 'rate-high' : '')}">
              ${item.rateText}
            </span>
          </td>
          <td class="col-details" title="${this.escapeHtml(item.details)}">
            <span class="text-truncate">${this.escapeHtml(item.details)}</span>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml;
  },

  /**
   * 카드 그리드 뷰 렌더링
   */
  renderCardsView(items) {
    const container = document.getElementById('cardsContainer');
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>조건에 맞는 사업이 없습니다.</p></div>`;
      return;
    }

    const cardsHtml = items.map(item => `
      <div class="grid-card ${item.isNew ? 'card-border-new' : ''}" onclick="UIController.openDetailModalById(${item.autoId})">
        <div class="grid-card-header">
          <span class="grid-card-sector">${this.cleanSectorName(item.sector)}</span>
          ${item.isNew ? '<span class="badge-new-mini">NEW 신설</span>' : ''}
        </div>
        <h4 class="grid-card-title">${this.escapeHtml(item.project)}</h4>
        <div class="grid-card-stats">
          <div class="stat-box">
            <span class="stat-lbl">2026</span>
            <span class="stat-val">${item.prior.toLocaleString()}</span>
          </div>
          <div class="stat-arrow">→</div>
          <div class="stat-box highlight">
            <span class="stat-lbl">2027</span>
            <span class="stat-val">${item.target.toLocaleString()} ${item.unit}</span>
          </div>
        </div>
        <div class="grid-card-diff">
          <span>증감: <strong>${item.change >= 0 ? '+' : ''}${item.change.toLocaleString()}</strong></span>
          <span class="badge-rate-card">${item.rateText}</span>
        </div>
        <p class="grid-card-desc">${this.escapeHtml(item.details)}</p>
      </div>
    `).join('');

    container.innerHTML = cardsHtml;
  },

  /**
   * 세부 사업 상세 모달 열기
   */
  openDetailModal(item) {
    if (!item) return;

    const modal = document.getElementById('detailModal');
    if (!modal) return;

    document.getElementById('modalProjectName').textContent = item.project;
    document.getElementById('modalSector').textContent = item.sector;
    document.getElementById('modalUnit').textContent = `단위: ${item.unit}`;
    
    const newBadge = document.getElementById('modalNewBadge');
    if (newBadge) {
      newBadge.style.display = item.isNew ? 'inline-block' : 'none';
    }

    document.getElementById('modalPrior').textContent = `${item.prior.toLocaleString()} ${item.unit}`;
    document.getElementById('modalTarget').textContent = `${item.target.toLocaleString()} ${item.unit}`;
    
    const sign = item.change >= 0 ? '+' : '';
    document.getElementById('modalChange').textContent = `${sign}${item.change.toLocaleString()} ${item.unit}`;
    document.getElementById('modalRate').textContent = item.rateText;

    // 상세 비고/보도자료 원문
    document.getElementById('modalDetails').textContent = item.details || '(등록된 상세 보도자료 근거 내용이 없습니다.)';

    // 시각적 비교 바 렌더링
    const maxVal = Math.max(item.prior, item.target, 1);
    const priorPct = (item.prior / maxVal) * 100;
    const targetPct = (item.target / maxVal) * 100;

    const priorBar = document.getElementById('modalBarPrior');
    const targetBar = document.getElementById('modalBarTarget');
    if (priorBar) priorBar.style.width = `${priorPct}%`;
    if (targetBar) targetBar.style.width = `${targetPct}%`;

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  /**
   * 고유 ID(autoId)로 항목 찾아 모달 열기
   */
  openDetailModalById(autoId) {
    const item = StateManager.rawData.find(i => i.autoId === Number(autoId));
    if (item) {
      this.openDetailModal(item);
    }
  },

  /**
   * 프로젝트명으로 항목 찾아 모달 열기
   */
  openDetailModalByProject(projectName) {
    const item = StateManager.rawData.find(i => i.project === projectName);
    if (item) {
      this.openDetailModal(item);
    }
  },

  /**
   * 모달 닫기
   */
  closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    }
  },

  /**
   * 뷰 모드 전환 (테이블 vs 카드)
   */
  setViewMode(mode) {
    this.viewMode = mode;
    const btnTable = document.getElementById('btnViewTable');
    const btnCards = document.getElementById('btnViewCards');

    if (mode === 'table') {
      if (btnTable) btnTable.classList.add('active');
      if (btnCards) btnCards.classList.remove('active');
    } else {
      if (btnTable) btnTable.classList.remove('active');
      if (btnCards) btnCards.classList.add('active');
    }

    this.renderDataView(StateManager.filteredData);
  },

  /**
   * 금액 단위 포맷 (조/억원 변환)
   */
  formatCurrency(value) {
    if (value === undefined || value === null) return '0 억원';
    if (value >= 10000) {
      const cho = (value / 10000).toFixed(1);
      return `${cho}조 원 (${value.toLocaleString()}억원)`;
    }
    return `${value.toLocaleString()} 억 원`;
  },

  /**
   * 분야명 깔끔 정제 (원문자 제거 등)
   */
  cleanSectorName(sector) {
    if (!sector) return '';
    return sector.replace(/^[①-⑩\d\.\s]+/, '');
  },

  /**
   * HTML 특수문자 이스케이프
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
