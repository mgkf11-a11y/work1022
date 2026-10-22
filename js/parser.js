/**
 * DataParser: 엑셀(.xlsx, .xls) 및 CSV 파싱, 컬럼 자동 매핑, 데이터 정규화 모듈
 */
const DataParser = {
  // 표준 컬럼 키워드 정규식 맵 (유사 헤더 인식용)
  HEADER_PATTERNS: {
    id: /^(연번|번호|no|id|seq|num)$/i,
    sector: /분야|중점영역|영역|부문|category|field|domain/i,
    project: /세부.*사업|주요.*지표|사업명|사업|프로젝트|project|item|indicator/i,
    unit: /단위|구분|unit|type/i,
    prior: /2026|전년|이전|과거|기존|past|prior|A\b/i,
    target: /2027|정부안|당해|금년|계획|목표|current|target|budget|B\b/i,
    change: /증감|변동|차이|증감액|diff|change/i,
    rate: /증가율|증감률|비율|변화율|rate|ratio|%/i,
    details: /핵심.*내용|보도자료|근거|원문|비고|특이사항|설명|details|note|desc/i
  },

  /**
   * File 객체(엑셀 또는 CSV)를 파싱하여 표준 객체 배열 반환
   */
  async parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer();
      return this.parseExcel(buffer, file.name);
    } else if (ext === 'csv') {
      const text = await this.readTextFileWithEncoding(file);
      return this.parseCSV(text, file.name);
    } else {
      throw new Error(`지원하지 않는 파일 형식입니다: .${ext} (지원: .xlsx, .xls, .csv)`);
    }
  },

  /**
   * 인코딩(UTF-8 또는 CP949) 감지하여 텍스트 읽기
   */
  readTextFileWithEncoding(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        let content = e.target.result;
        // 한글 깨짐 여부(대체 문자  포함 여부) 확인
        if (content.includes('')) {
          const readerCP949 = new FileReader();
          readerCP949.onload = (e2) => resolve(e2.target.result);
          readerCP949.onerror = reject;
          readerCP949.readAsText(file, 'euc-kr');
        } else {
          resolve(content);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file, 'utf-8');
    });
  },

  /**
   * SheetJS를 사용한 Excel 바이너리 파싱
   */
  parseExcel(arrayBuffer, filename = '') {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS(XLSX) 라이브러리가 로드되지 않았습니다.');
    }
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetNames = workbook.SheetNames;
    if (!sheetNames || sheetNames.length === 0) {
      throw new Error('엑셀 파일 내 유효한 워크시트가 없습니다.');
    }

    // 기본적으로 첫 번째 시트 또는 데이터가 가장 풍부한 시트 탐색
    let bestSheetName = sheetNames[0];
    let bestRows = [];

    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows && rows.length > bestRows.length) {
        bestRows = rows;
        bestSheetName = name;
      }
    }

    const parsedData = this.processRawRows(bestRows);
    return {
      filename,
      sheetNames,
      activeSheet: bestSheetName,
      data: parsedData,
      rawRows: bestRows
    };
  },

  /**
   * CSV 텍스트 파싱
   */
  parseCSV(csvText, filename = '') {
    if (typeof XLSX !== 'undefined') {
      const workbook = XLSX.read(csvText, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      const parsedData = this.processRawRows(rawRows);
      return {
        filename,
        sheetNames: ['CSV'],
        activeSheet: 'CSV',
        data: parsedData,
        rawRows
      };
    }

    // 수동 CSV 폴백 파서
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    const rawRows = lines.map(line => {
      // 따옴표 내부 쉼표 보존 정규식
      const row = [];
      let inQuotes = false;
      let token = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
          row.push(token.trim().replace(/^"|"$/g, ''));
          token = '';
        } else {
          token += c;
        }
      }
      row.push(token.trim().replace(/^"|"$/g, ''));
      return row;
    });

    const parsedData = this.processRawRows(rawRows);
    return {
      filename,
      sheetNames: ['CSV'],
      activeSheet: 'CSV',
      data: parsedData,
      rawRows
    };
  },

  /**
   * 상단 타이틀 행 등을 고려하여 최적의 헤더 행 인덱스 탐색
   */
  findHeaderRowIndex(rows) {
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const joined = row.map(c => String(c || '').trim()).join(' ');
      // 분야, 사업, 예산, 정부안, 연번 중 2개 이상 포함된 행을 헤더로 판정
      let matchCount = 0;
      if (/분야|중점/i.test(joined)) matchCount++;
      if (/사업|지표/i.test(joined)) matchCount++;
      if (/2026|전년|A\b/i.test(joined)) matchCount++;
      if (/2027|정부안|B\b/i.test(joined)) matchCount++;
      if (/연번|번호/i.test(joined)) matchCount++;
      if (/단위|구분/i.test(joined)) matchCount++;

      if (matchCount >= 2) {
        return r;
      }
    }
    return 0; // 폴백: 첫 행
  },

  /**
   * 헤더 행의 각 컬럼을 표준 키로 매핑
   */
  mapHeaders(headerRow) {
    const colMap = {};
    const unmapped = [];

    headerRow.forEach((col, idx) => {
      const headerStr = String(col || '').trim();
      let matched = false;
      for (const [key, pattern] of Object.entries(this.HEADER_PATTERNS)) {
        if (!colMap[key] && pattern.test(headerStr)) {
          colMap[key] = idx;
          matched = true;
          break;
        }
      }
      if (!matched && headerStr) {
        unmapped.push({ idx, headerStr });
      }
    });

    // 폴백 기본 인덱스 매핑 (헤더 매핑 실패 시 사용자 스크린샷 9개 컬럼 순서 적용)
    if (colMap.sector === undefined && headerRow.length >= 2) colMap.sector = 1;
    if (colMap.project === undefined && headerRow.length >= 3) colMap.project = 2;
    if (colMap.unit === undefined && headerRow.length >= 4) colMap.unit = 3;
    if (colMap.prior === undefined && headerRow.length >= 5) colMap.prior = 4;
    if (colMap.target === undefined && headerRow.length >= 6) colMap.target = 5;
    if (colMap.change === undefined && headerRow.length >= 7) colMap.change = 6;
    if (colMap.rate === undefined && headerRow.length >= 8) colMap.rate = 7;
    if (colMap.details === undefined && headerRow.length >= 9) colMap.details = 8;
    if (colMap.id === undefined) colMap.id = 0;

    return colMap;
  },

  /**
   * 2차원 배열 데이터를 표준 데이터 모델 객체 배열로 변환
   */
  processRawRows(rawRows) {
    if (!rawRows || rawRows.length === 0) return [];

    const headerIdx = this.findHeaderRowIndex(rawRows);
    const headerRow = rawRows[headerIdx];
    const colMap = this.mapHeaders(headerRow);

    const items = [];
    let autoId = 1;

    for (let r = headerIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || !Array.isArray(row)) continue;

      const getVal = (colIndex) => {
        if (colIndex === undefined || colIndex === null || colIndex >= row.length) return '';
        const val = row[colIndex];
        return val !== undefined && val !== null ? String(val).trim() : '';
      };

      const project = getVal(colMap.project);
      const sector = getVal(colMap.sector);

      // 사업명과 분야가 모두 비어있거나 "합계" 행이면 스킵
      if (!project && !sector) continue;
      if (project === '합계' || sector === '합계' || project.includes('합계')) continue;

      const rawId = getVal(colMap.id) || String(autoId);
      const unit = getVal(colMap.unit) || '억원';
      const rawPrior = getVal(colMap.prior);
      const rawTarget = getVal(colMap.target);
      const rawChange = getVal(colMap.change);
      const rawRate = getVal(colMap.rate);
      const details = getVal(colMap.details);

      // 숫자 파싱 (쉼표, 통화 기호, 공백 제거)
      const parseNum = (str) => {
        if (!str) return 0;
        const cleaned = String(str).replace(/,/g, '').replace(/[^\d.-]/g, '');
        const val = parseFloat(cleaned);
        return isNaN(val) ? 0 : val;
      };

      const prior = parseNum(rawPrior);
      const target = parseNum(rawTarget);

      // 증감액 계산
      let change = parseNum(rawChange);
      if (rawChange === '' || isNaN(change)) {
        change = target - prior;
      }

      // 신규 사업 여부 판정
      const isNew = this.detectIsNew(prior, target, rawRate, project, details);

      // 증가율 계산 및 포맷
      let rate = 0;
      let rateText = '';

      if (isNew) {
        rateText = '순증/신규';
        rate = 999999; // 신규 정렬용 최상위값
      } else if (rawRate && (rawRate.includes('%') || !isNaN(parseFloat(rawRate)))) {
        rateText = rawRate.includes('%') ? rawRate : `${parseFloat(rawRate).toFixed(1)}%`;
        rate = parseFloat(rawRate.replace('%', '')) || 0;
      } else if (prior > 0) {
        rate = ((target - prior) / prior) * 100;
        rateText = `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`;
      } else {
        rateText = '0.0%';
        rate = 0;
      }

      items.push({
        id: rawId,
        autoId: autoId++,
        sector: sector || '기타/공통',
        project: project || '(사업명 미지정)',
        unit: unit,
        prior: prior,
        target: target,
        change: change,
        rate: rate,
        rateText: rateText,
        details: details,
        isNew: isNew
      });
    }

    return items;
  },

  /**
   * 신규 사업 자동 판별 로직
   */
  detectIsNew(prior, target, rawRate, project, details) {
    // 1. 전년도 예산이 0이고 당해년도 예산이 편성된 경우
    if (prior === 0 && target > 0) return true;

    // 2. 증가율 텍스트에 순증, 신규, NEW 표기
    if (/순증|신규|신설|new/i.test(rawRate || '')) return true;

    // 3. 사업명 또는 핵심 내용에 신규/신설/착수 키워드
    if (/\[신규\]|신규.*사업|신설|신규.*도입|신규.*확보|신규.*착수|시범도입/i.test(project || '')) return true;
    if (/\[신규\s*사업\]|신규\s*편성|신규\s*도입|신규\s*착수/i.test(details || '')) return true;

    return false;
  },

  /**
   * 현재 데이터를 엑셀(XLSX)로 내보내기 (서식 및 자동필터 적용)
   */
  exportToExcel(items, filename = '전체사업데이터_목록.xlsx') {
    if (typeof XLSX === 'undefined') {
      alert('엑셀 생성 라이브러리(SheetJS)가 로드되지 않았습니다.');
      return;
    }

    if (!items || items.length === 0) {
      alert('저장할 사업 데이터가 없습니다.');
      return;
    }

    const header = [
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

    const rows = items.map((item, idx) => [
      parseInt(item.id, 10) || (idx + 1),
      item.sector,
      item.project,
      item.unit,
      item.prior,
      item.target,
      item.change,
      item.rateText,
      item.details
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);

    // 컬럼 너비 설정 (가독성 최적화)
    worksheet['!cols'] = [
      { wch: 8 },  // 연번
      { wch: 28 }, // 분야 (중점영역)
      { wch: 38 }, // 세부 사업 / 주요 지표
      { wch: 10 }, // 구분/단위
      { wch: 15 }, // 2026년 (A)
      { wch: 16 }, // 2027년 정부안 (B)
      { wch: 14 }, // 증감 (B-A)
      { wch: 14 }, // 증가율 (%)
      { wch: 60 }  // 핵심 내용 및 보도자료 근거
    ];

    // 자동 필터(AutoFilter) 적용
    try {
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    } catch (e) {
      console.warn('AutoFilter 설정 건너뜀:', e);
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '사업데이터_목록');
    XLSX.writeFile(workbook, filename);
  },

  /**
   * 현재 데이터를 CSV(UTF-8 BOM 포함)로 내보내기
   */
  exportToCSV(items, filename = '전체사업데이터_목록.csv') {
    if (!items || items.length === 0) {
      alert('저장할 사업 데이터가 없습니다.');
      return;
    }

    const header = [
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

    const rows = items.map((item, idx) => [
      item.id || (idx + 1),
      `"${String(item.sector || '').replace(/"/g, '""')}"`,
      `"${String(item.project || '').replace(/"/g, '""')}"`,
      `"${String(item.unit || '').replace(/"/g, '""')}"`,
      item.prior,
      item.target,
      item.change,
      `"${String(item.rateText || '').replace(/"/g, '""')}"`,
      `"${String(item.details || '').replace(/"/g, '""')}"`
    ]);

    // Excel에서 한글 깨짐을 방지하는 UTF-8 BOM(\uFEFF) 삽입
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * 빈 표준 템플릿 엑셀 파일 생성 및 다운로드
   */
  downloadTemplate() {
    const templateData = [
      {
        "연번": 1,
        "분야 (중점영역)": "① 핵심 국방/전력 강화",
        "세부 사업 / 주요 지표": "전작권 전환 및 자주국방 핵심전력 확보",
        "구분/단위": "억원",
        "2026년 (A)": 90222,
        "2027년 정부안 (B)": 121744,
        "증감 (B-A)": 31522,
        "증가율 (%)": "34.9%",
        "핵심 내용 및 보도자료 박스 원문 근거": "KF-21 양산, 핵추진잠수함 착수, L-SAM 조기확보 등"
      },
      {
        "연번": 2,
        "분야 (중점영역)": "② 첨단 AI·로봇 실증",
        "세부 사업 / 주요 지표": "피지컬 AI 야전 실증사업 신설",
        "구분/단위": "억원",
        "2026년 (A)": 0,
        "2027년 정부안 (B)": 430,
        "증감 (B-A)": 430,
        "증가율 (%)": "순증/신규",
        "핵심 내용 및 보도자료 박스 원문 근거": "[신규 사업] 야전 다족로봇 200대, 휴머노이드 실증 배치"
      }
    ];

    this.exportToExcel(templateData, '예산데이터_표준업로드양식_템플릿.xlsx');
  }
};
