/**
 * App: 메인 진입점, 이벤트 바인딩 및 앱 오케스트레이션
 */
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

const App = {
  init() {
    console.log('🚀 예산 분석 인포그래픽 대시보드 초기화 시작');

    // 1. 상태 관리자 구독 연결 (상태 변화 시 차트 및 UI 자동 갱신)
    StateManager.subscribe((state) => {
      ChartController.updateCharts(state);
      UIController.updateUI(state);
    });

    // 2. 이벤트 리스너 바인딩
    this.bindEvents();

    // 3. 기본 내장 데이터 로드 (2027 국방예산 정부안 32개 주요 사업)
    this.loadInitialData();

    // 4. Lucide 아이콘 초기화 (CDN 로드 시)
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  /**
   * 기본 제공 샘플 데이터 로드
   */
  loadInitialData() {
    if (typeof DEFAULT_BUDGET_DATA !== 'undefined' && DEFAULT_BUDGET_DATA.length > 0) {
      // 딕셔너리 배열을 2차원 배열 형태로 가공하여 processRawRows 정규화 파이프라인 통과
      const headers = [
        '연번',
        '분야 (중점영역)',
        '세부 사업 / 주요 지표',
        '구분/단위',
        '2026년 (A)',
        '2027년 정부안 (B)',
        '증감 (B-A)',
        '증가율 (%)',
        '핵심 내용 및 보도자료 박스 원문 근거'
      ];
      const rows = [headers];
      DEFAULT_BUDGET_DATA.forEach(item => {
        rows.push([
          item['연번'],
          item['분야 (중점영역)'],
          item['세부 사업 / 주요 지표'],
          item['구분/단위'],
          item['2026년 (A)'],
          item['2027년 정부안 (B)'],
          item['증감 (B-A)'],
          item['증가율 (%)'],
          item['핵심 내용 및 보도자료 박스 원문 근거']
        ]);
      });

      const normalized = DataParser.processRawRows(rows);
      StateManager.loadData(normalized, {
        filename: '2027년_국방예산_중점투자사업_수치현황 (기본탑재)'
      });
      this.showToast('✅ 2027년 국방예산 기본 데이터셋이 로드되었습니다.');
    }
  },

  /**
   * 전체 DOM 이벤트 리스너 바인딩
   */
  bindEvents() {
    // 1. 파일 업로드 관련
    const uploadZone = document.getElementById('uploadDropZone');
    const fileInput = document.getElementById('fileInput');

    if (uploadZone && fileInput) {
      uploadZone.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileUpload(e.target.files[0]);
          e.target.value = ''; // 재업로드 가능하도록 리셋
        }
      });

      // 드래그 앤 드롭
      ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          uploadZone.classList.add('drag-active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          uploadZone.classList.remove('drag-active');
        }, false);
      });

      uploadZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) {
          this.handleFileUpload(dt.files[0]);
        }
      });
    }

    // 2. 검색창 실시간 디바운스 입력
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      let timeout = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          StateManager.setFilter('search', e.target.value);
        }, 200);
      });
    }

    // 3. 분야 드롭다운 변경
    const sectorFilter = document.getElementById('sectorFilter');
    if (sectorFilter) {
      sectorFilter.addEventListener('change', (e) => {
        StateManager.setFilter('sector', e.target.value);
      });
    }

    // 4. 단위 드롭다운 변경
    const unitFilter = document.getElementById('unitFilter');
    if (unitFilter) {
      unitFilter.addEventListener('change', (e) => {
        StateManager.setFilter('unit', e.target.value);
      });
    }

    // 5. 정렬 변경
    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        StateManager.setFilter('sortBy', e.target.value);
      });
    }

    // 6. '신규 사업만 보기' 원클릭 토글 버튼
    const newOnlyToggle = document.getElementById('newOnlyToggle');
    if (newOnlyToggle) {
      newOnlyToggle.addEventListener('click', () => {
        const nextState = !StateManager.filters.newOnly;
        StateManager.setFilter('newOnly', nextState);
        this.showToast(nextState ? '✨ 2027 신규 신설 사업만 필터링합니다.' : '전체 사업을 표시합니다.');
      });
    }

    // 7. 필터 초기화 버튼
    const resetFilterBtn = document.getElementById('btnResetFilters');
    if (resetFilterBtn) {
      resetFilterBtn.addEventListener('click', () => {
        StateManager.resetFilters();
        if (searchInput) searchInput.value = '';
        if (sectorFilter) sectorFilter.value = 'all';
        if (unitFilter) unitFilter.value = 'all';
        if (sortBy) sortBy.value = 'id';
        this.showToast('필터가 초기화되었습니다.');
      });
    }

    // 8. 뷰 모드 전환 (테이블 vs 카드)
    const btnTable = document.getElementById('btnViewTable');
    const btnCards = document.getElementById('btnViewCards');
    if (btnTable) {
      btnTable.addEventListener('click', () => UIController.setViewMode('table'));
    }
    if (btnCards) {
      btnCards.addEventListener('click', () => UIController.setViewMode('cards'));
    }

    // 9. 헤더 유틸리티 및 엑셀/CSV 다운로드 버튼들
    const handleExcelExport = () => {
      const items = StateManager.filteredData;
      if (!items || items.length === 0) {
        alert('내보낼 사업 데이터가 없습니다.');
        return;
      }
      const filename = this.generateExportFilename('xlsx');
      DataParser.exportToExcel(items, filename);
      this.showToast(`📊 ${items.length}건의 사업 데이터가 엑셀(${filename})로 저장되었습니다.`);
    };

    const handleCSVExport = () => {
      const items = StateManager.filteredData;
      if (!items || items.length === 0) {
        alert('내보낼 사업 데이터가 없습니다.');
        return;
      }
      const filename = this.generateExportFilename('csv');
      DataParser.exportToCSV(items, filename);
      this.showToast(`📄 ${items.length}건의 사업 데이터가 CSV(${filename})로 저장되었습니다.`);
    };

    // 전체 사업 데이터 목록 전용 엑셀 다운로드 버튼
    const btnDownloadTableExcel = document.getElementById('btnDownloadTableExcel');
    if (btnDownloadTableExcel) {
      btnDownloadTableExcel.addEventListener('click', handleExcelExport);
    }

    // 전체 사업 데이터 목록 전용 CSV 다운로드 버튼
    const btnDownloadTableCSV = document.getElementById('btnDownloadTableCSV');
    if (btnDownloadTableCSV) {
      btnDownloadTableCSV.addEventListener('click', handleCSVExport);
    }

    // 필터바 퀵 엑셀 저장 버튼
    const btnQuickExportExcel = document.getElementById('btnQuickExportExcel');
    if (btnQuickExportExcel) {
      btnQuickExportExcel.addEventListener('click', handleExcelExport);
    }

    // 상단 헤더 엑셀 내보내기 버튼
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
      btnExportExcel.addEventListener('click', handleExcelExport);
    }

    const btnReloadSample = document.getElementById('btnReloadSample');
    if (btnReloadSample) {
      btnReloadSample.addEventListener('click', () => {
        this.loadInitialData();
      });
    }

    const btnDownloadTemplate = document.getElementById('btnDownloadTemplate');
    if (btnDownloadTemplate) {
      btnDownloadTemplate.addEventListener('click', () => {
        DataParser.downloadTemplate();
      });
    }

    const btnPrint = document.getElementById('btnPrintReport');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // 10. 모달 제어
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalBackdrop = document.getElementById('detailModal');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => UIController.closeDetailModal());
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          UIController.closeDetailModal();
        }
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        UIController.closeDetailModal();
      }
    });
  },

  /**
   * 내보내기용 동적 파일명 생성
   */
  generateExportFilename(extension = 'xlsx') {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    let tag = '전체사업데이터목록';
    if (StateManager.filters.newOnly) {
      tag = '2027신규신설사업목록';
    } else if (StateManager.filters.sector && StateManager.filters.sector !== 'all') {
      const cleanSec = StateManager.filters.sector.replace(/^[①-⑩\d\.\s]+/, '').replace(/[/\\?%*:|"<>]/g, '_');
      tag = `사업목록_${cleanSec}`;
    } else if (StateManager.filters.search) {
      tag = '사업목록_검색결과';
    }

    return `${tag}_${dateStr}.${extension}`;
  },

  /**
   * 파일 업로드 처리
   */
  async handleFileUpload(file) {
    try {
      this.showToast(`⏳ '${file.name}' 파일을 분석 중입니다...`, 2000);

      const parsed = await DataParser.parseFile(file);

      if (!parsed.data || parsed.data.length === 0) {
        throw new Error('파일에서 유효한 사업 데이터를 추출하지 못했습니다. 컬럼 헤더를 확인해 주세요.');
      }

      StateManager.loadData(parsed.data, {
        filename: parsed.filename
      });

      this.showToast(`🎉 파일 업로드 완료! 총 ${parsed.data.length}개 사업 항목이 로드되었습니다.`);
    } catch (err) {
      console.error('File parsing error:', err);
      alert(`파일 처리 오류:\n${err.message}`);
    }
  },

  /**
   * 간이 토스트 알림 표출
   */
  showToast(message, duration = 3000) {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }
};
