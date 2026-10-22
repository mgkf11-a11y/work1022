/**
 * StateManager: 대시보드 중앙 상태 관리 및 통계 연산 모듈
 */
const StateManager = {
  rawData: [],
  filteredData: [],
  sourceInfo: {
    filename: '기본 탑재 데이터 (2027 국방예산 정부안)',
    totalRows: 0,
    lastUpdated: new Date()
  },
  filters: {
    search: '',
    sector: 'all',
    newOnly: false,
    unit: 'all',
    sortBy: 'id'
  },
  listeners: [],

  /**
   * 리스너 등록 (상태 변경 시 자동 호출)
   */
  subscribe(callback) {
    this.listeners.push(callback);
  },

  /**
   * 모든 리스너에게 상태 변경 통지
   */
  notify() {
    this.listeners.forEach(cb => {
      try {
        cb(this);
      } catch (e) {
        console.error('Error in state listener:', e);
      }
    });
  },

  /**
   * 원본 데이터 로드 및 초기화
   */
  loadData(items, sourceInfo = {}) {
    this.rawData = items || [];
    this.sourceInfo = {
      filename: sourceInfo.filename || '업로드 파일',
      totalRows: this.rawData.length,
      lastUpdated: new Date()
    };
    this.applyFilters();
  },

  /**
   * 필터 업데이트
   */
  setFilter(key, value) {
    if (this.filters[key] !== value) {
      this.filters[key] = value;
      this.applyFilters();
    }
  },

  /**
   * 필터 초기화
   */
  resetFilters() {
    this.filters = {
      search: '',
      sector: 'all',
      newOnly: false,
      unit: 'all',
      sortBy: 'id'
    };
    this.applyFilters();
  },

  /**
   * 필터 및 정렬 적용
   */
  applyFilters() {
    let result = [...this.rawData];

    // 1. 신규 사업만 보기
    if (this.filters.newOnly) {
      result = result.filter(item => item.isNew);
    }

    // 2. 분야 필터
    if (this.filters.sector && this.filters.sector !== 'all') {
      result = result.filter(item => item.sector === this.filters.sector);
    }

    // 3. 단위 필터
    if (this.filters.unit && this.filters.unit !== 'all') {
      result = result.filter(item => item.unit === this.filters.unit);
    }

    // 4. 검색어 필터
    if (this.filters.search && this.filters.search.trim()) {
      const q = this.filters.search.trim().toLowerCase();
      result = result.filter(item => 
        (item.project && item.project.toLowerCase().includes(q)) ||
        (item.sector && item.sector.toLowerCase().includes(q)) ||
        (item.details && item.details.toLowerCase().includes(q)) ||
        (item.id && String(item.id).toLowerCase().includes(q))
      );
    }

    // 5. 정렬
    result.sort((a, b) => {
      switch (this.filters.sortBy) {
        case 'target-desc':
          return b.target - a.target;
        case 'target-asc':
          return a.target - b.target;
        case 'change-desc':
          return b.change - a.change;
        case 'rate-desc':
          return b.rate - a.rate;
        case 'name-asc':
          return a.project.localeCompare(b.project, 'ko');
        case 'id':
        default:
          return (parseInt(a.id, 10) || a.autoId) - (parseInt(b.id, 10) || b.autoId);
      }
    });

    this.filteredData = result;
    this.notify();
  },

  /**
   * 고유 분야 목록 추출
   */
  getUniqueSectors() {
    const set = new Set();
    this.rawData.forEach(item => {
      if (item.sector) set.add(item.sector);
    });
    return Array.from(set);
  },

  /**
   * 고유 단위 목록 추출
   */
  getUniqueUnits() {
    const set = new Set();
    this.rawData.forEach(item => {
      if (item.unit) set.add(item.unit);
    });
    return Array.from(set);
  },

  /**
   * 전체 요약 통계 계산
   */
  getSummaryStats() {
    // 억원 단위 사업 기준 예산 통계 집계 (다른 단위인 경우 예산 합산 왜곡 방지)
    const budgetItems = this.rawData.filter(i => i.unit === '억원' || !i.unit);
    const filteredBudgetItems = this.filteredData.filter(i => i.unit === '억원' || !i.unit);

    const totalTarget = budgetItems.reduce((acc, cur) => acc + (cur.target || 0), 0);
    const totalPrior = budgetItems.reduce((acc, cur) => acc + (cur.prior || 0), 0);
    const totalChange = totalTarget - totalPrior;
    const overallRate = totalPrior > 0 ? (totalChange / totalPrior) * 100 : 0;

    // 필터링된 결과 통계
    const filteredTarget = filteredBudgetItems.reduce((acc, cur) => acc + (cur.target || 0), 0);
    const filteredPrior = filteredBudgetItems.reduce((acc, cur) => acc + (cur.prior || 0), 0);

    // 신규 사업 통계
    const allNewItems = this.rawData.filter(i => i.isNew);
    const newItemsBudget = allNewItems
      .filter(i => i.unit === '억원' || !i.unit)
      .reduce((acc, cur) => acc + (cur.target || 0), 0);
    const newProjectsShare = totalTarget > 0 ? (newItemsBudget / totalTarget) * 100 : 0;

    // 최고 증액 사업 (억원 단위 기준)
    const sortedGainers = [...budgetItems].sort((a, b) => b.change - a.change);
    const topGainer = sortedGainers[0] || null;

    // 최고 증가율 사업 (전년도 > 0 인 기존 사업 기준)
    const sortedGrowers = [...budgetItems]
      .filter(i => !i.isNew && i.prior > 0)
      .sort((a, b) => b.rate - a.rate);
    const topGrower = sortedGrowers[0] || null;

    return {
      totalTarget,
      totalPrior,
      totalChange,
      overallRate,
      filteredTarget,
      filteredPrior,
      totalProjectsCount: this.rawData.length,
      filteredProjectsCount: this.filteredData.length,
      newProjectsCount: allNewItems.length,
      newProjectsTotalBudget: newItemsBudget,
      newProjectsSharePercent: newProjectsShare,
      topGainer,
      topGrower
    };
  },

  /**
   * 분야별 집계 통계
   */
  getSectorStats() {
    const map = {};

    this.rawData.forEach(item => {
      const sec = item.sector || '기타';
      if (!map[sec]) {
        map[sec] = {
          name: sec,
          targetSum: 0,
          priorSum: 0,
          changeSum: 0,
          count: 0,
          newCount: 0,
          items: []
        };
      }

      map[sec].count++;
      map[sec].items.push(item);
      if (item.isNew) map[sec].newCount++;

      // 억원 단위일 때만 예산 합산
      if (item.unit === '억원' || !item.unit) {
        map[sec].targetSum += item.target || 0;
        map[sec].priorSum += item.prior || 0;
        map[sec].changeSum += item.change || 0;
      }
    });

    const sectors = Object.values(map);
    sectors.forEach(s => {
      s.rate = s.priorSum > 0 ? ((s.changeSum) / s.priorSum) * 100 : (s.targetSum > 0 ? 100 : 0);
    });

    // 예산 규모순 내림차순 정렬
    sectors.sort((a, b) => b.targetSum - a.targetSum);
    return sectors;
  },

  /**
   * 신규 사업 목록 (예산순 정렬)
   */
  getNewProjectsList() {
    return this.rawData
      .filter(item => item.isNew)
      .sort((a, b) => b.target - a.target);
  }
};
