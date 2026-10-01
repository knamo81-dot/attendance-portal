(function () {
  'use strict';

  let db = null;

  function resolveDb() {
    try {
      if (window.SDSApp?.db) return window.SDSApp.db;
    } catch (_) {}
    try {
      if (window.parent && window.parent !== window && window.parent.portalSupabase) {
        return window.parent.portalSupabase;
      }
    } catch (_) {}
    try {
      const s = window.SDSApp?.getPortalSession?.() || null;
      if (s?.supabase) return s.supabase;
      if (s?.globalSupabase) return s.globalSupabase;
    } catch (_) {}
    return null;
  }

  const TABLE = 'qa_reagent_usage_records';
  const VOLUME_UNITS = ['µL', 'mL', 'L'];
  const WEIGHT_UNITS = ['µg', 'mg', 'g', 'kg'];

  const state = {
    companyId: '',
    companyName: '',
    employee: null,
    products: [],
    productsById: new Map(),
    chemicalByCas: new Map(),
    specialSubstancesByCas: new Map(),
    selectedSpecialMaterials: [],
    selectedProduct: null,
    currentView: 'input',
    currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    monthlyMetric: 'amount',
    logMetric: 'amount',
    periodMode: 'half',
    monthlyRows: [],
    logRows: [],
    logEmployees: [],
    expandedMonthly: new Set(),
    expandedLog: new Set(),
    detailRecordIds: [],
    detailContext: '',
    detailReadonly: false,
    isSaving: false,
    isEditing: false,
    scanResult: null,
    scanLinkProductId: null,
    scanBusy: false
  };

  let productScanReader = null;
  let productScanControls = null;
  let productScanNativeRaf = 0;
  let productScanNativeDetector = null;
  let productScanNativeDetecting = false;
  let zxingLoadPromise = null;
  let productScanWasmLoadPromise = null;
  let productScanWasmPrepared = false;
  let productScanWasmBase = '';
  let productScanLoopTimer = 0;
  let productScanDecodeInFlight = false;
  let productScanStream = null;
  let productScanTrack = null;
  let productScanTorchOn = false;
  let productScanZoomValue = 1;
  let productScanFrameSeq = 0;
  let productScanStartedAt = 0;
  let productScanNoResultTimer = 0;
  const ZXING_WASM_VERSION = '3.1.4';

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function getSession() {
    try {
      if (window.parent && window.parent !== window && typeof window.parent.getPortalSession === 'function') {
        return window.parent.getPortalSession() || {};
      }
    } catch (_) {}
    try {
      if (window.parent && window.parent !== window) {
        return window.parent.portalSession || window.parent.currentPortalSession || {};
      }
    } catch (_) {}
    try {
      return window.SDSApp?.getPortalSession?.() || window.portalSession || window.currentPortalSession || {};
    } catch (_) {
      return {};
    }
  }

  function getCompanyId() {
    const s = getSession();
    const id = s.activeCompanyId || s.companyId || s.company_id ||
      s.activeCompany?.id || s.activeCompany?.company_id ||
      s.company?.id || s.company?.company_id ||
      window.currentCompanyId || '';
    if (id) return String(id).trim();
    try {
      return String(window.SDSApp?.getCompanyId?.() || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getIdentity() {
    const s = getSession();
    const e = s.employee || {};
    const u = s.user || {};
    return {
      companyName: String(s.activeCompanyName || s.companyName || s.company?.name || s.company?.company_name || '').trim(),
      employee_no: String(e.employee_no || e.employeeNo || s.employee_no || s.employeeNo || u.employee_no || u.employeeNo || '').trim(),
      name: String(e.name || s.name || u.name || '').trim(),
      email: String(e.email || s.email || u.email || '').trim()
    };
  }

  function localDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function normalize(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function numberText(value, max = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: max }).format(n);
  }

  function formatContent(row) {
    const hasMin = row?.content_min !== null && row?.content_min !== undefined && row?.content_min !== '';
    const hasMax = row?.content_max !== null && row?.content_max !== undefined && row?.content_max !== '';
    if (!hasMin && !hasMax) return '';
    if (hasMin && hasMax) {
      const a = Number(row.content_min), b = Number(row.content_max);
      if (Number.isFinite(a) && Number.isFinite(b) && a === b) return `${numberText(a, 4)}%`;
      return `${numberText(a, 4)}~${numberText(b, 4)}%`;
    }
    return hasMin ? `${numberText(row.content_min, 4)}% 이상` : `${numberText(row.content_max, 4)}% 이하`;
  }

  function productCasRows(product) {
    const rows = Array.isArray(product?.product_cas) ? [...product.product_cas] : [];
    rows.sort((a, b) => Number(a.sort_order ?? 9999) - Number(b.sort_order ?? 9999));
    const clean = rows.filter((r) => String(r.cas_no || '').trim());
    if (clean.length) return clean;
    if (String(product?.cas || '').trim()) return [{ cas_no: product.cas, content_min: null, content_max: null, sort_order: 1 }];
    return [];
  }

  function primaryCas(product) {
    return productCasRows(product)[0]?.cas_no || '';
  }

  function casKey(value) {
    return String(value || '').trim();
  }

  function chemicalForCas(casNo) {
    return state.chemicalByCas.get(casKey(casNo)) || null;
  }

  function materialInfoForCas(casNo) {
    const cas = casKey(casNo);
    const chemical = chemicalForCas(cas) || {};
    const ko = String(chemical.chem_name_ko || '').trim();
    const en = String(chemical.chem_name_en || '').trim();
    const name = ko || en || cas || '물질명 미등록';
    const secondary = ko && en && normalize(ko) !== normalize(en) ? en : '';
    return { cas_no: cas, chem_name_ko: ko, chem_name_en: en, name, secondary };
  }

  function productMaterialRows(product) {
    return productCasRows(product).map((row) => ({
      ...row,
      ...materialInfoForCas(row.cas_no)
    }));
  }

  function materialTextForProduct(product) {
    const rows = productMaterialRows(product);
    if (!rows.length) return String(product?.name || '').trim() || '물질명 미등록';
    return rows.map((r) => r.name).filter(Boolean).join(' / ');
  }

  function renderMaterialStack(rows, fallback = '물질명 미등록') {
    if (!rows?.length) return `<span class="material-entry"><b>${esc(fallback)}</b></span>`;
    return rows.map((r) => `<span class="material-entry"><b>${esc(r.name)}</b>${r.secondary ? `<small>${esc(r.secondary)}</small>` : ''}</span>`).join('');
  }

  function renderCasStack(rows, withContent = false) {
    if (!rows?.length) return '<span>-</span>';
    return rows.map((r) => `<span class="cas-stack-line"><b>${esc(r.cas_no || '-')}</b>${withContent && formatContent(r) ? `<small>${esc(formatContent(r))}</small>` : ''}</span>`).join('');
  }

  function productSearchText(product) {
    const materials = productMaterialRows(product);
    return normalize([
      product.name, product.maker, product.code, product.capacity, product.grade,
      ...materials.flatMap((r) => [r.cas_no, r.chem_name_ko, r.chem_name_en])
    ].join(' '));
  }

  function normalizeProductCode(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[\s.,-]+/g, '');
  }

  // 스캐너 엔진/기기마다 같은 코드 앞뒤에 symbology identifier,
  // FNC1/GS, CR/LF 같은 제어문자가 붙을 수 있다. DB에는 원본값을 보존하되
  // 조회할 때만 안전한 비교용 값을 만든다.
  function normalizeScannerRaw(value) {
    let v = String(value ?? '')
      .replace(/<GS>/gi, '\x1d')
      .replace(/\u241d/g, '\x1d')
      .replace(/\u0000/g, '')
      .trim();

    // AIM symbology identifier 예: ]C0 / ]C1(Code128), ]d1 / ]d2(DataMatrix)
    // 엔진에 따라 원본 문자열 앞에 포함되기도 한다.
    v = v.replace(/^\][A-Za-z][0-9A-Za-z]/, '');

    // 일반 바코드/QR의 앞뒤 제어문자는 데이터가 아니라 디코더 부가문자이므로 제거한다.
    v = v.replace(/^[\x00-\x1f\x7f]+|[\x00-\x1f\x7f]+$/g, '');
    return v.trim();
  }

  function canonicalIdentifierValue(type, value) {
    const t = String(type || '').toUpperCase();
    const raw = normalizeScannerRaw(value);
    if (!raw) return '';

    if (['PRODUCT_CODE','CAT_NO','P_N','REORDER'].includes(t)) {
      return normalizeProductCode(raw);
    }
    if (t === 'GTIN') {
      // GTIN은 숫자 식별자이므로 표시용 구분기호/공백만 무시한다.
      return raw.replace(/[^0-9]/g, '');
    }
    return raw;
  }

  function scanIdentifierCandidates(scan) {
    const candidates = [];
    const add = (kind, value) => {
      const canonical = canonicalIdentifierValue(kind, value);
      if (!canonical) return;
      const key = `${kind}:${canonical}`;
      if (!candidates.some((x) => x.key === key)) candidates.push({ key, kind, canonical });
    };

    if (scan?.raw) add('RAW', scan.raw);
    if (scan?.gs1?.gtin) add('GTIN', scan.gs1.gtin);
    if (scan?.gs1?.additionalId) {
      add('PRODUCT_CODE', scan.gs1.additionalId);
      add('RAW', scan.gs1.additionalId);
    }
    return candidates;
  }

  function identifierRowMatchesScan(row, scan) {
    const type = String(row?.identifier_type || '').toUpperCase();
    const rowValue = row?.identifier_value ?? '';
    const candidates = scanIdentifierCandidates(scan);

    if (type === 'GTIN') {
      const rowCanonical = canonicalIdentifierValue('GTIN', rowValue);
      return candidates.some((c) => c.kind === 'GTIN' && c.canonical === rowCanonical);
    }

    if (['PRODUCT_CODE','CAT_NO','P_N','REORDER'].includes(type)) {
      const rowCanonical = String(row?.normalized_value || '').trim() || canonicalIdentifierValue(type, rowValue);
      return candidates.some((c) => c.kind === 'PRODUCT_CODE' && c.canonical === rowCanonical);
    }

    const rowCanonical = canonicalIdentifierValue(type, rowValue);
    return candidates.some((c) => c.kind === 'RAW' && c.canonical === rowCanonical);
  }

  function barcodeFormatName(value) {
    const numeric = {
      0: 'AZTEC', 1: 'CODABAR', 2: 'CODE_39', 3: 'CODE_93', 4: 'CODE_128',
      5: 'DATA_MATRIX', 6: 'EAN_8', 7: 'EAN_13', 8: 'ITF', 9: 'MAXICODE',
      10: 'PDF_417', 11: 'QR_CODE', 12: 'RSS_14', 13: 'RSS_EXPANDED',
      14: 'UPC_A', 15: 'UPC_E', 16: 'UPC_EAN_EXTENSION'
    };
    if (typeof value === 'number' && numeric[value]) return numeric[value];
    const raw = String(value ?? '').trim();
    if (!raw) return 'UNKNOWN';
    if (/^\d+$/.test(raw) && numeric[Number(raw)]) return numeric[Number(raw)];
    const key = raw.toUpperCase().replace(/[\s_\-\/]/g, '');
    const names = {
      QRCODE: 'QR_CODE', DATAMATRIX: 'DATA_MATRIX', CODE128: 'CODE_128',
      CODE39: 'CODE_39', CODE39STD: 'CODE_39', CODE39EXT: 'CODE_39',
      CODE93: 'CODE_93', EAN8: 'EAN_8', EAN13: 'EAN_13',
      UPCA: 'UPC_A', UPCE: 'UPC_E', PDF417: 'PDF_417',
      DATABAR: 'RSS_14', DATABAROMNI: 'RSS_14', DATABAREXP: 'RSS_EXPANDED',
      DATABAREXPANDED: 'RSS_EXPANDED', CODABAR: 'CODABAR', ITF: 'ITF',
      AZTEC: 'AZTEC', MAXICODE: 'MAXICODE'
    };
    return names[key] || raw.toUpperCase().replace(/[\s-]+/g, '_');
  }

  function isUrlValue(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
  }

  function parseParenthesizedGs1(text) {
    const src = String(text || '').trim();
    if (!/\(0?1\)/.test(src)) return null;
    const out = {};
    const re = /\((01|10|17|21|240|422)\)(.*?)(?=\((?:01|10|17|21|240|422)\)|$)/g;
    let m;
    while ((m = re.exec(src))) {
      const ai = m[1];
      const value = String(m[2] || '').trim();
      if (value) out[ai] = value;
    }
    return out['01'] ? out : null;
  }

  function parseRawGs1(text) {
    const GS = '\x1d';
    let src = String(text || '')
      .replace(/<GS>/gi, GS)
      .replace(/\u241d/g, GS)
      .replace(/^\]d2/i, '');
    if (!src.startsWith('01') || src.length < 16) return null;

    const out = {};
    let i = 0;
    const readVariable = (maxLen, nextAis = []) => {
      const start = i;
      const hardEnd = Math.min(src.length, start + maxLen);
      const gsPos = src.indexOf(GS, start);
      if (gsPos >= 0 && gsPos <= hardEnd) {
        const value = src.slice(start, gsPos);
        i = gsPos + 1;
        return value;
      }

      // 일부 앱은 GS(FNC1) 구분자를 화면 표시에서 없애므로, 그 경우에만
      // 뒤에 오는 알려진 AI 경계를 보조적으로 찾아 분리한다.
      let boundary = hardEnd;
      for (const ai of nextAis) {
        let pos = src.indexOf(ai, start + 1);
        while (pos >= 0 && pos < hardEnd) {
          if (pos > start && src.length > pos + ai.length) {
            boundary = Math.min(boundary, pos);
            break;
          }
          pos = src.indexOf(ai, pos + 1);
        }
      }
      const value = src.slice(start, boundary);
      i = boundary;
      return value;
    };

    while (i < src.length) {
      if (src[i] === GS) { i += 1; continue; }
      if (src.startsWith('01', i) && src.length >= i + 16) {
        i += 2; out['01'] = src.slice(i, i + 14); i += 14; continue;
      }
      if (src.startsWith('422', i) && src.length >= i + 6) {
        i += 3; out['422'] = src.slice(i, i + 3); i += 3; continue;
      }
      if (src.startsWith('17', i) && src.length >= i + 8) {
        i += 2; out['17'] = src.slice(i, i + 6); i += 6; continue;
      }
      if (src.startsWith('10', i)) {
        i += 2; out['10'] = readVariable(20, ['240', '21', '17', '422']); continue;
      }
      if (src.startsWith('240', i)) {
        i += 3; out['240'] = readVariable(30, ['21', '17', '422']); continue;
      }
      if (src.startsWith('21', i)) {
        i += 2; out['21'] = readVariable(20, ['240', '17', '422']); continue;
      }
      break;
    }
    return out['01'] ? out : null;
  }

  function parseGs1(text) {
    const cleaned = String(text || '').replace(/<GS>/gi, '\x1d').replace(/\u241d/g, '\x1d');
    const data = parseParenthesizedGs1(cleaned) || parseRawGs1(cleaned);
    if (!data) return null;
    return {
      gtin: String(data['01'] || '').trim(),
      lot: String(data['10'] || '').trim(),
      expiry: String(data['17'] || '').trim(),
      serial: String(data['21'] || '').trim(),
      additionalId: String(data['240'] || '').trim(),
      origin: String(data['422'] || '').trim()
    };
  }

  function buildScanResult(rawValue, format) {
    const rawDisplay = String(rawValue || '').trim();
    const raw = rawDisplay.replace(/<GS>/gi, '\x1d').replace(/\u241d/g, '\x1d');
    const fmt = barcodeFormatName(format);
    const gs1 = parseGs1(raw);
    const stable = [];

    if (gs1?.gtin) stable.push({ type: 'GTIN', value: gs1.gtin, label: 'GTIN' });
    if (gs1?.additionalId) stable.push({ type: 'OTHER', value: gs1.additionalId, label: 'GS1 추가 제품식별값 (240)', ai240: true });

    return {
      raw,
      rawDisplay,
      format: fmt,
      gs1,
      stable,
      hasSafeStableIdentifier: stable.length > 0,
      scannedAt: Date.now()
    };
  }

  function scanFallbackIdentifier(scan, selectedProduct = null) {
    if (!scan?.raw) return null;
    const format = String(scan.format || '').toUpperCase();
    if (format === 'QR_CODE' && isUrlValue(scan.raw)) return { type: 'QR_URL', value: scan.raw, label: 'QR URL' };
    if (format === 'QR_CODE') return { type: 'QR', value: scan.raw, label: 'QR' };
    if (format === 'DATA_MATRIX') return { type: 'DATAMATRIX', value: scan.raw, label: 'DataMatrix' };
    if (['EAN_8','EAN_13','UPC_A','UPC_E','CODE_128','CODE_39','CODE_93','CODABAR','ITF','RSS_14','RSS_EXPANDED'].includes(format)) {
      return { type: 'BARCODE', value: scan.raw, label: format };
    }
    return { type: 'OTHER', value: scan.raw, label: format || '기타 코드' };
  }

  function stableIdentifiersForRegistration(scan, product) {
    if (!scan) return [];
    const list = [];
    if (scan.gs1?.gtin) list.push({ type: 'GTIN', value: scan.gs1.gtin, code_format: scan.format || 'DATA_MATRIX', note: '모바일 사용입력 스캔 / GS1 AI (01)' });
    if (scan.gs1?.additionalId) {
      const productCode = normalizeProductCode(product?.code);
      const scannedCode = normalizeProductCode(scan.gs1.additionalId);
      list.push({
        type: productCode && scannedCode && productCode === scannedCode ? 'PRODUCT_CODE' : 'OTHER',
        value: scan.gs1.additionalId,
        code_format: scan.format || 'DATA_MATRIX',
        note: '모바일 사용입력 스캔 / GS1 AI (240)'
      });
    }
    if (!list.length) {
      const fallback = scanFallbackIdentifier(scan, product);
      if (fallback) list.push({
        type: fallback.type,
        value: fallback.value,
        code_format: scan.format || null,
        note: '모바일 사용입력 최초 연결'
      });
    }
    return list;
  }

  function formatGs1Expiry(value) {
    const v = String(value || '');
    if (!/^\d{6}$/.test(v)) return v;
    const yy = Number(v.slice(0,2));
    const mm = v.slice(2,4);
    const dd = v.slice(4,6);
    return `20${String(yy).padStart(2,'0')}-${mm}-${dd}`;
  }

  function renderScanReadSummary(scan) {
    if (!scan) return;
    const rows = [];
    rows.push(`<span><b>형식</b><em>${esc(scan.format || '-')}</em></span>`);
    if (scan.gs1?.gtin) rows.push(`<span><b>GTIN</b><em>${esc(scan.gs1.gtin)}</em></span>`);
    if (scan.gs1?.additionalId) rows.push(`<span><b>제품식별(240)</b><em>${esc(scan.gs1.additionalId)}</em></span>`);
    if (scan.gs1?.lot) rows.push(`<span><b>LOT</b><em>${esc(scan.gs1.lot)}</em></span>`);
    if (scan.gs1?.expiry) rows.push(`<span><b>유효기간</b><em>${esc(formatGs1Expiry(scan.gs1.expiry))}</em></span>`);
    if (scan.gs1?.serial) rows.push(`<span><b>Serial</b><em>${esc(scan.gs1.serial)}</em></span>`);
    $('scanReadSummary').innerHTML = rows.join('');
    $('scanRawValue').textContent = `원본: ${String(scan.rawDisplay || scan.raw || '').replace(/\x1d/g, '<GS>')}`;
  }

  function stopProductScanner() {
    if (productScanLoopTimer) clearTimeout(productScanLoopTimer);
    productScanLoopTimer = 0;
    if (productScanNoResultTimer) clearTimeout(productScanNoResultTimer);
    productScanNoResultTimer = 0;
    productScanDecodeInFlight = false;

    try { productScanControls?.stop?.(); } catch (_) {}
    productScanControls = null;
    productScanReader = null;

    if (productScanNativeRaf) cancelAnimationFrame(productScanNativeRaf);
    productScanNativeRaf = 0;
    productScanNativeDetector = null;
    productScanNativeDetecting = false;

    try {
      productScanStream?.getTracks?.().forEach((track) => track.stop());
    } catch (_) {}
    productScanStream = null;
    productScanTrack = null;
    productScanTorchOn = false;
    productScanZoomValue = 1;

    const video = $('productScanVideo');
    try {
      const stream = video?.srcObject;
      stream?.getTracks?.().forEach((track) => track.stop());
    } catch (_) {}
    if (video) {
      try { video.pause?.(); } catch (_) {}
      video.srcObject = null;
      video.hidden = true;
    }

    const canvas = $('productScanCanvas');
    if (canvas) {
      try { canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); } catch (_) {}
      canvas.width = 1;
      canvas.height = 1;
    }

    const reader = $('productScanReader');
    if (reader) {
      reader.classList.remove('active');
      reader.innerHTML = '';
    }
    const torchBtn = $('productScanTorch');
    const zoomBtn = $('productScanZoom');
    if (torchBtn) { torchBtn.hidden = true; torchBtn.classList.remove('active'); }
    if (zoomBtn) { zoomBtn.hidden = true; zoomBtn.textContent = '1×'; }
  }

  function closeProductScanModal() {
    stopProductScanner();
    state.scanBusy = false;
    $('productScanModal').hidden = true;
    document.documentElement.classList.remove('product-scan-open');
    document.body.classList.remove('product-scan-open');
  }

  function resetScanLinkUi() {
    state.scanLinkProductId = null;
    $('scanLinkSearch').value = '';
    $('scanLinkResults').innerHTML = '';
    $('scanLinkSelected').hidden = true;
    $('scanLinkSelectedName').textContent = '-';
    $('scanLinkSelectedMeta').textContent = '-';
    $('scanFixedConfirm').checked = false;
    $('scanLinkSave').disabled = true;
    setMessage('scanLinkMessage');
  }

  function showScanCamera() {
    resetScanLinkUi();
    $('scanLinkSection').hidden = true;
    $('productScanCameraSection').hidden = false;
    $('productScanRetry').hidden = true;
    const reader = $('productScanReader');
    if (reader) {
      reader.innerHTML = '';
      reader.classList.remove('active');
    }
    const video = $('productScanVideo');
    if (video) video.hidden = true;
    const torchBtn = $('productScanTorch');
    const zoomBtn = $('productScanZoom');
    if (torchBtn) { torchBtn.hidden = true; torchBtn.classList.remove('active'); }
    if (zoomBtn) { zoomBtn.hidden = true; zoomBtn.textContent = '1×'; }
    $('productScanStatus').textContent = '카메라와 인식 엔진을 준비하고 있습니다.';
  }

  function renderScanLinkResults() {
    const box = $('scanLinkResults');
    const q = normalize($('scanLinkSearch').value);
    if (!q) {
      box.innerHTML = '<div class="scan-link-empty">제품명·제조사·제품코드·CAS로 검색해 주세요.</div>';
      return;
    }
    const items = state.products.filter((p) => productSearchText(p).includes(q)).slice(0, 30);
    box.innerHTML = items.length ? items.map((p) => `
      <button type="button" class="scan-link-result" data-scan-link-product="${Number(p.id)}">
        <strong>${esc(p.name || '-')}</strong>
        <span>${esc([p.maker, p.code, p.capacity].filter(Boolean).join(' · ') || '-')}</span>
        <small>${esc(productCasRows(p).map((r) => r.cas_no).join(' / ') || 'CAS 없음')}</small>
      </button>`).join('') : '<div class="scan-link-empty">검색 결과가 없습니다.</div>';
  }

  function selectScanLinkProduct(productId) {
    const product = state.productsById.get(Number(productId));
    if (!product) return;
    state.scanLinkProductId = Number(product.id);
    $('scanLinkSelectedName').textContent = product.name || '-';
    $('scanLinkSelectedMeta').textContent = [product.maker, product.code, product.capacity, primaryCas(product)].filter(Boolean).join(' · ') || '-';
    $('scanLinkSelected').hidden = false;
    $('scanLinkSave').disabled = false;
    setMessage('scanLinkMessage');
  }

  function showScanLink(scan, suggestedProduct = null, reason = '') {
    stopProductScanner();
    state.scanResult = scan;
    state.scanBusy = false;
    $('productScanCameraSection').hidden = true;
    $('scanLinkSection').hidden = false;
    renderScanReadSummary(scan);
    resetScanLinkUi();

    const needsFixedConfirm = !scan.hasSafeStableIdentifier;
    $('scanFixedConfirmWrap').hidden = !needsFixedConfirm;
    if (needsFixedConfirm) {
      $('scanLinkNotice').innerHTML = '<b>제품 고정코드 확인 필요</b><span>일반 바코드/QR에는 LOT 번호가 들어갈 수 있습니다. LOT가 아니라 제품에 고정된 코드인지 확인한 뒤 연결해 주세요.</span>';
    } else {
      const lotText = scan.gs1?.lot ? ` LOT ${esc(scan.gs1.lot)}은 제품 식별값에 저장하지 않습니다.` : '';
      $('scanLinkNotice').innerHTML = `<b>GS1 제품 식별정보를 확인했습니다.</b><span>GTIN/제품식별값만 제품에 연결합니다.${lotText}</span>`;
    }

    if (reason) setMessage('scanLinkMessage', reason);
    if (suggestedProduct) {
      selectScanLinkProduct(suggestedProduct.id);
      $('scanLinkSearch').value = [suggestedProduct.name, suggestedProduct.maker, suggestedProduct.code].filter(Boolean).join(' ');
    } else {
      renderScanLinkResults();
      setTimeout(() => $('scanLinkSearch')?.focus(), 60);
    }
  }

  async function findRegisteredProductForScan(scan) {
    // DB의 원본값은 그대로 보존하고, 조회 시 현재 사용자가 접근 가능한 활성 식별값을
    // 가져와 클라이언트에서 안전하게 정규화 비교한다.
    // 이렇게 하면 스캐너 엔진 변경으로 ]C1 / ]d2 / CR/LF / GS 등이 붙어도
    // 이미 연결된 제품을 다시 '신규 코드'로 오인하지 않는다.
    const result = await db.from('product_identifiers')
      .select('id, product_id, identifier_type, identifier_value, normalized_value, code_format')
      .eq('is_active', true);

    if (result.error) throw result.error;

    const productIds = new Set();
    (result.data || []).forEach((row) => {
      if (identifierRowMatchesScan(row, scan)) productIds.add(Number(row.product_id));
    });

    return [...productIds]
      .map((id) => state.productsById.get(id))
      .filter(Boolean);
  }

  function findProductMasterCodeMatch(scan) {
    // GS1 AI(240)가 있으면 그 값을 우선 사용한다.
    // 일반 1D/QR은 원본값이 기존 제품코드와 정확히 정규화 일치할 때만 후보로 제시하고,
    // 최초 연결 화면에서 제품 고정코드 여부를 사용자가 한 번 더 확인한다.
    const rawCandidate = scan?.gs1?.additionalId || (!scan?.gs1 ? scan?.raw : '');
    const candidate = normalizeProductCode(rawCandidate || '');
    if (!candidate || candidate.length < 3) return [];
    return state.products.filter((p) => normalizeProductCode(p.code) === candidate);
  }

  async function registerScanIdentifiers(product, scan) {
    const identifiers = stableIdentifiersForRegistration(scan, product);
    if (!identifiers.length) throw new Error('등록할 제품 식별값이 없습니다.');

    // 같은 코드를 엔진/표기 차이 때문에 중복 등록하지 않도록 현재 활성 식별값을
    // 한 번 읽고 canonical 비교한다.
    const existingResult = await db.from('product_identifiers')
      .select('id, product_id, identifier_type, identifier_value, normalized_value, code_format')
      .eq('is_active', true);
    if (existingResult.error) throw existingResult.error;
    const existingRows = existingResult.data || [];

    for (const item of identifiers) {
      const itemScan = buildScanResult(item.value, item.code_format || scan?.format || 'UNKNOWN');
      // item.type의 의미가 제품코드 계열일 때는 GS1 여부와 무관하게 제품코드 후보도 추가한다.
      if (['PRODUCT_CODE','CAT_NO','P_N','REORDER'].includes(item.type)) {
        itemScan.gs1 = itemScan.gs1 || {};
        itemScan.gs1.additionalId = item.value;
      } else if (item.type === 'GTIN') {
        itemScan.gs1 = itemScan.gs1 || {};
        itemScan.gs1.gtin = item.value;
      }

      const rows = existingRows.filter((row) => identifierRowMatchesScan(row, itemScan));
      const conflict = rows.find((row) => Number(row.product_id) !== Number(product.id));
      if (conflict) throw new Error('이 식별코드는 같은 회사의 다른 제품에 이미 연결되어 있습니다.');
      if (rows.some((row) => Number(row.product_id) === Number(product.id))) continue;

      const insert = await db.from('product_identifiers').insert({
        product_id: Number(product.id),
        identifier_type: item.type,
        identifier_value: item.value,
        code_format: item.code_format || null,
        is_primary: false,
        is_active: true,
        note: item.note || '모바일 사용입력 스캔 등록'
      }).select('id, product_id, identifier_type, identifier_value, normalized_value, code_format').single();
      if (insert.error) throw insert.error;
      if (insert.data) existingRows.push(insert.data);
    }
  }

  async function handleScannedCode(rawValue, format) {
    if (state.scanBusy) return;
    state.scanBusy = true;
    const scan = buildScanResult(rawValue, format);
    state.scanResult = scan;
    $('productScanStatus').textContent = '제품정보를 확인하고 있습니다.';
    try { navigator.vibrate?.(70); } catch (_) {}

    try {
      const registered = await findRegisteredProductForScan(scan);
      if (registered.length === 1) {
        stopProductScanner();
        selectProduct(registered[0].id);
        setMessage('inputMessage', `${registered[0].name || '제품'}을(를) 스캔으로 선택했습니다.`, 'success');
        try { navigator.vibrate?.([60, 40, 60]); } catch (_) {}
        closeProductScanModal();
        return;
      }
      if (registered.length > 1) {
        showScanLink(scan, null, '동일 식별코드에 연결된 제품이 여러 건입니다. 사용할 제품을 선택해 주세요.');
        return;
      }

      const codeMatches = findProductMasterCodeMatch(scan);
      if (codeMatches.length === 1) {
        showScanLink(scan, codeMatches[0], '스캔한 제품식별값과 포털 제품코드가 일치합니다. 연결 후 바로 사용할 수 있습니다.');
        return;
      }

      showScanLink(scan, null, '아직 등록되지 않은 코드입니다. 기존 제품을 찾아 최초 1회 연결해 주세요.');
    } catch (error) {
      console.error('[QA Usage Scan] lookup failed', error);
      state.scanBusy = false;
      $('productScanStatus').textContent = `조회 실패: ${error?.message || '알 수 없는 오류'}`;
      $('productScanRetry').hidden = false;
    }
  }

  async function ensureZXingLoaded() {
    if (window.ZXingBrowser?.BrowserMultiFormatReader) return window.ZXingBrowser;
    if (zxingLoadPromise) return zxingLoadPromise;

    const sources = [
      'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js',
      'https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js'
    ];

    const loadOne = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.zxingBrowser = '1';
      script.onload = () => window.ZXingBrowser?.BrowserMultiFormatReader
        ? resolve(window.ZXingBrowser)
        : reject(new Error('보조 스캔 엔진 초기화 실패'));
      script.onerror = () => reject(new Error('보조 스캔 엔진 로드 실패'));
      document.head.appendChild(script);
    });

    zxingLoadPromise = (async () => {
      let lastError = null;
      for (const src of sources) {
        try { return await loadOne(src); } catch (error) { lastError = error; }
      }
      throw lastError || new Error('보조 스캔 엔진을 불러오지 못했습니다.');
    })().catch((error) => {
      zxingLoadPromise = null;
      throw error;
    });
    return zxingLoadPromise;
  }

  async function prepareZXingWasm(api, base) {
    if (productScanWasmPrepared || !api) return api;
    if (typeof api.prepareZXingModule === 'function') {
      await Promise.resolve(api.prepareZXingModule({
        overrides: {
          locateFile(path) {
            if (/zxing_reader\.wasm(?:$|\?)/i.test(String(path || ''))) {
              return `${base}zxing_reader.wasm`;
            }
            return path;
          }
        }
      }));
    }
    productScanWasmPrepared = true;
    productScanWasmBase = base;
    return api;
  }

  async function ensureZXingWasmLoaded() {
    if (window.ZXingWASM?.readBarcodes) {
      const base = productScanWasmBase || `https://cdn.jsdelivr.net/npm/zxing-wasm@${ZXING_WASM_VERSION}/dist/reader/`;
      return prepareZXingWasm(window.ZXingWASM, base);
    }
    if (productScanWasmLoadPromise) return productScanWasmLoadPromise;

    const sources = [
      {
        src: `https://cdn.jsdelivr.net/npm/zxing-wasm@${ZXING_WASM_VERSION}/dist/iife/reader/index.js`,
        base: `https://cdn.jsdelivr.net/npm/zxing-wasm@${ZXING_WASM_VERSION}/dist/reader/`
      },
      {
        src: `https://unpkg.com/zxing-wasm@${ZXING_WASM_VERSION}/dist/iife/reader/index.js`,
        base: `https://unpkg.com/zxing-wasm@${ZXING_WASM_VERSION}/dist/reader/`
      }
    ];

    const loadOne = ({ src, base }) => new Promise((resolve, reject) => {
      const old = document.querySelector(`script[data-zxing-wasm-src="${src}"]`);
      if (old && window.ZXingWASM?.readBarcodes) {
        prepareZXingWasm(window.ZXingWASM, base).then(resolve, reject);
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.zxingWasmSrc = src;
      script.onload = async () => {
        try {
          if (!window.ZXingWASM?.readBarcodes) throw new Error('WASM 스캔 엔진 초기화 실패');
          resolve(await prepareZXingWasm(window.ZXingWASM, base));
        } catch (error) { reject(error); }
      };
      script.onerror = () => reject(new Error('WASM 스캔 엔진 로드 실패'));
      document.head.appendChild(script);
    });

    productScanWasmLoadPromise = (async () => {
      let lastError = null;
      for (const source of sources) {
        try { return await loadOne(source); } catch (error) { lastError = error; }
      }
      throw lastError || new Error('고성능 스캔 엔진을 불러오지 못했습니다.');
    })().catch((error) => {
      productScanWasmLoadPromise = null;
      productScanWasmPrepared = false;
      throw error;
    });
    return productScanWasmLoadPromise;
  }

  async function enhanceProductScanTrack(track) {
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() || {};
      const advanced = [];
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) advanced.push({ focusMode: 'continuous' });
      if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
      if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) advanced.push({ whiteBalanceMode: 'continuous' });
      if (advanced.length) await track.applyConstraints({ advanced });
    } catch (_) {}
  }

  function syncProductScanCameraTools() {
    const torchBtn = $('productScanTorch');
    const zoomBtn = $('productScanZoom');
    const track = productScanTrack;
    if (!track) return;
    let caps = {};
    let settings = {};
    try { caps = track.getCapabilities?.() || {}; } catch (_) {}
    try { settings = track.getSettings?.() || {}; } catch (_) {}

    if (torchBtn) {
      torchBtn.hidden = caps.torch !== true;
      torchBtn.classList.toggle('active', productScanTorchOn);
    }
    if (zoomBtn) {
      const zoom = caps.zoom;
      const canZoom = zoom && Number.isFinite(Number(zoom.min)) && Number.isFinite(Number(zoom.max)) && Number(zoom.max) > Number(zoom.min);
      zoomBtn.hidden = !canZoom;
      if (canZoom) {
        productScanZoomValue = Number(settings.zoom || productScanZoomValue || zoom.min || 1);
        zoomBtn.textContent = `${productScanZoomValue.toFixed(productScanZoomValue % 1 ? 1 : 0)}×`;
      }
    }
  }

  async function toggleProductScanTorch() {
    if (!productScanTrack) return;
    try {
      const caps = productScanTrack.getCapabilities?.() || {};
      if (caps.torch !== true) return;
      productScanTorchOn = !productScanTorchOn;
      await productScanTrack.applyConstraints({ advanced: [{ torch: productScanTorchOn }] });
      syncProductScanCameraTools();
    } catch (_) {
      productScanTorchOn = false;
      syncProductScanCameraTools();
    }
  }

  async function cycleProductScanZoom() {
    if (!productScanTrack) return;
    try {
      const caps = productScanTrack.getCapabilities?.() || {};
      const zoom = caps.zoom;
      if (!zoom) return;
      const min = Number(zoom.min || 1);
      const max = Number(zoom.max || min);
      if (!(max > min)) return;
      const presets = [1, 1.3, 1.6, 2, 2.5, 3]
        .map((v) => Math.max(min, Math.min(max, v)))
        .filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 0.05);
      const current = Number(productScanZoomValue || min);
      let next = presets.find((v) => v > current + 0.05);
      if (next == null) next = presets[0] ?? min;
      await productScanTrack.applyConstraints({ advanced: [{ zoom: next }] });
      productScanZoomValue = next;
      syncProductScanCameraTools();
    } catch (_) {}
  }

  async function openProductScanCamera() {
    const video = $('productScanVideo');
    if (!video) throw new Error('카메라 화면을 찾을 수 없습니다.');

    let stream = null;
    const highQuality = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 30, max: 60 }
      }
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia(highQuality);
    } catch (_) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
    }

    productScanStream = stream;
    productScanTrack = stream.getVideoTracks?.()[0] || null;
    video.srcObject = stream;
    video.hidden = false;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();
    await enhanceProductScanTrack(productScanTrack);
    syncProductScanCameraTools();

    const readyStarted = Date.now();
    while ((!video.videoWidth || !video.videoHeight) && Date.now() - readyStarted < 2500) {
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error('카메라 영상 크기를 확인할 수 없습니다.');
    return stream;
  }

  function captureProductScanFrame(mode = 'matrix') {
    const video = $('productScanVideo');
    const canvas = $('productScanCanvas');
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    let maxW = 1400, maxH = 1050;

    if (mode === 'matrix') {
      const side = Math.min(vw * 0.78, vh * 0.86);
      sw = sh = Math.max(320, side);
      sx = Math.max(0, (vw - sw) / 2);
      sy = Math.max(0, (vh - sh) / 2);
      maxW = maxH = 1200;
    } else if (mode === 'linear') {
      sw = vw * 0.96;
      sh = vh * 0.52;
      sx = (vw - sw) / 2;
      sy = (vh - sh) / 2;
      maxW = 1600;
      maxH = 800;
    }

    const scale = Math.min(1, maxW / sw, maxH / sh);
    const dw = Math.max(320, Math.round(sw * scale));
    const dh = Math.max(240, Math.round(sh * scale));
    if (canvas.width !== dw) canvas.width = dw;
    if (canvas.height !== dh) canvas.height = dh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    return ctx.getImageData(0, 0, dw, dh);
  }

  function scanOptionsForMode(mode, seq) {
    const common = {
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      maxNumberOfSymbols: 1,
      textMode: 'Escaped',
      characterSet: 'Unknown',
      returnErrors: false
    };
    if (mode === 'matrix') {
      return {
        ...common,
        formats: ['DataMatrix', 'QRCode', 'Aztec', 'PDF417'],
        tryDenoise: true,
        tryDownscale: false,
        binarizer: seq % 4 === 0 ? 'GlobalHistogram' : 'LocalAverage'
      };
    }
    if (mode === 'linear') {
      return {
        ...common,
        formats: ['AllLinear'],
        tryDenoise: false,
        tryDownscale: true,
        minLineCount: 2,
        binarizer: seq % 2 ? 'GlobalHistogram' : 'LocalAverage'
      };
    }
    return {
      ...common,
      formats: ['DataMatrix', 'QRCode', 'Code128', 'Code39', 'Code93', 'Codabar', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Aztec', 'PDF417'],
      tryDenoise: true,
      tryDownscale: true,
      binarizer: 'LocalAverage'
    };
  }

  function scheduleProductScanLoop(api, delay = 80) {
    if (productScanLoopTimer) clearTimeout(productScanLoopTimer);
    productScanLoopTimer = setTimeout(() => runProductScanLoop(api), delay);
  }

  async function runProductScanLoop(api) {
    if ($('productScanModal').hidden || $('productScanCameraSection').hidden || state.scanBusy) return;
    if (productScanDecodeInFlight) { scheduleProductScanLoop(api, 60); return; }

    const modes = ['matrix', 'linear', 'matrix', 'full'];
    const mode = modes[productScanFrameSeq % modes.length];
    const seq = productScanFrameSeq++;
    const imageData = captureProductScanFrame(mode);
    if (!imageData) { scheduleProductScanLoop(api, 100); return; }

    productScanDecodeInFlight = true;
    try {
      const results = await api.readBarcodes(imageData, scanOptionsForMode(mode, seq));
      const hit = Array.isArray(results)
        ? results.find((r) => r && r.isValid !== false && String(r.text || '').trim())
        : null;
      if (hit && !state.scanBusy) {
        const decoded = String(hit.text || '').trim();
        const format = hit.format || hit.symbology || '';
        await handleScannedCode(decoded, format);
        return;
      }
    } catch (error) {
      // 개별 프레임 디코딩 실패는 정상적인 스캔 대기 상태다.
      if (Date.now() - productScanStartedAt < 1500) console.debug?.('[QA Usage Scan] frame decode', error);
    } finally {
      productScanDecodeInFlight = false;
    }
    if (!state.scanBusy) scheduleProductScanLoop(api, 70);
  }

  async function buildNativeDetector() {
    if (!window.BarcodeDetector) return null;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const wanted = ['qr_code','data_matrix','code_128','code_39','code_93','codabar','ean_8','ean_13','itf','upc_a','upc_e','aztec','pdf417'];
      const formats = wanted.filter((format) => supported.includes(format));
      if (!formats.length) return null;
      return new window.BarcodeDetector({ formats });
    } catch (_) { return null; }
  }

  async function startNativeBarcodeScanner() {
    await openProductScanCamera();
    productScanNativeDetector = await buildNativeDetector();
    if (!productScanNativeDetector) throw new Error('기본 바코드 인식기를 사용할 수 없습니다.');
    const video = $('productScanVideo');
    $('productScanStatus').textContent = '코드를 화면 중앙에 크게 맞춰주세요.';
    const detectLoop = async () => {
      if ($('productScanModal').hidden || state.scanBusy || !productScanNativeDetector) return;
      if (!productScanNativeDetecting && video.readyState >= 2) {
        productScanNativeDetecting = true;
        try {
          const codes = await productScanNativeDetector.detect(video);
          const code = Array.isArray(codes) ? codes[0] : null;
          if (code?.rawValue) { await handleScannedCode(code.rawValue, code.format || ''); return; }
        } catch (_) {} finally { productScanNativeDetecting = false; }
      }
      productScanNativeRaf = requestAnimationFrame(detectLoop);
    };
    productScanNativeRaf = requestAnimationFrame(detectLoop);
  }

  async function startLegacyZxingBarcodeScanner() {
    const ZX = await ensureZXingLoaded();
    const video = $('productScanVideo');
    if (!video) throw new Error('카메라 화면을 찾을 수 없습니다.');
    productScanReader = new ZX.BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 100,
      delayBetweenScanSuccess: 500
    });
    const constraints = {
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
    };
    video.hidden = false;
    productScanControls = await productScanReader.decodeFromConstraints(constraints, video, (result) => {
      if (!result || state.scanBusy) return;
      let fmt = '';
      try { fmt = result.getBarcodeFormat?.(); } catch (_) {}
      const text = result.getText?.() ?? String(result.text || '');
      if (String(text || '').trim()) handleScannedCode(text, fmt);
    });
    productScanStream = video.srcObject || null;
    productScanTrack = productScanStream?.getVideoTracks?.()[0] || null;
    await enhanceProductScanTrack(productScanTrack);
    syncProductScanCameraTools();
    $('productScanStatus').textContent = '코드를 화면 중앙에 크게 맞춰주세요.';
  }

  async function startProductScanner() {
    if (!db) {
      setMessage('inputMessage', 'DB 연결을 확인할 수 없어 스캔을 시작할 수 없습니다.', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('inputMessage', '이 브라우저에서는 카메라를 사용할 수 없습니다.', 'error');
      return;
    }

    $('productScanModal').hidden = false;
    document.documentElement.classList.add('product-scan-open');
    document.body.classList.add('product-scan-open');
    stopProductScanner();
    showScanCamera();
    state.scanBusy = false;
    productScanFrameSeq = 0;
    productScanStartedAt = Date.now();

    try {
      // 메인 엔진: 최신 ZXing-C++ WebAssembly. DataMatrix/GS1/Code128을
      // 실제 카메라 프레임에서 직접 고해상도 분석한다.
      const [api] = await Promise.all([
        ensureZXingWasmLoaded(),
        openProductScanCamera()
      ]);
      $('productScanStatus').textContent = '인식 중 · 코드를 흰 모서리 안에 크게 맞춰주세요.';
      productScanNoResultTimer = setTimeout(() => {
        if (!$('productScanModal').hidden && !state.scanBusy) {
          $('productScanStatus').textContent = '코드가 작으면 더 가까이 가져오고, 반사가 있으면 병을 살짝 기울여 주세요.';
        }
      }, 5500);
      scheduleProductScanLoop(api, 20);
      return;
    } catch (wasmError) {
      console.warn('[QA Usage Scan] ZXing-WASM start failed; legacy fallback', wasmError);
      stopProductScanner();
      showScanCamera();
      state.scanBusy = false;
    }

    try {
      await startLegacyZxingBarcodeScanner();
      return;
    } catch (legacyError) {
      console.warn('[QA Usage Scan] legacy ZXing failed; native fallback', legacyError);
      stopProductScanner();
      showScanCamera();
      state.scanBusy = false;
    }

    try {
      await startNativeBarcodeScanner();
    } catch (error) {
      console.error('[QA Usage Scan] camera start failed', error);
      stopProductScanner();
      const name = String(error?.name || '');
      const msg = /NotAllowed|Permission/i.test(name)
        ? '카메라 권한이 필요합니다. 브라우저의 카메라 권한을 허용한 뒤 다시 시도해 주세요.'
        : `카메라/인식 엔진 실행 실패: ${error?.message || '브라우저 상태를 확인해 주세요.'}`;
      $('productScanStatus').textContent = msg;
      $('productScanRetry').hidden = false;
    }
  }

  async function saveScanProductLink() {
    const product = state.productsById.get(Number(state.scanLinkProductId));
    const scan = state.scanResult;
    if (!product || !scan) {
      setMessage('scanLinkMessage', '연결할 제품을 선택해 주세요.', 'error');
      return;
    }
    if (!scan.hasSafeStableIdentifier && !$('scanFixedConfirm').checked) {
      setMessage('scanLinkMessage', 'LOT가 아닌 제품 고정코드인지 확인해 주세요.', 'error');
      return;
    }

    $('scanLinkSave').disabled = true;
    setMessage('scanLinkMessage', '제품 식별코드를 등록하고 있습니다.');
    try {
      await registerScanIdentifiers(product, scan);
      selectProduct(product.id);
      setMessage('inputMessage', `${product.name || '제품'} 식별코드를 등록하고 사용제품으로 선택했습니다.`, 'success');
      try { navigator.vibrate?.([60, 40, 60]); } catch (_) {}
      closeProductScanModal();
    } catch (error) {
      console.error('[QA Usage Scan] register failed', error);
      setMessage('scanLinkMessage', `등록 실패: ${error?.message || '알 수 없는 오류'}`, 'error');
      $('scanLinkSave').disabled = false;
    }
  }

  function setMessage(id, msg = '', type = '') {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('error', 'success');
    if (type) el.classList.add(type);
  }

  function quantityTypeForUnit(unit) {
    return VOLUME_UNITS.includes(unit) ? 'volume' : 'weight';
  }

  function hoursMinutesToDbTime(hours, minutes) {
    const h = Number(hours);
    const m = Number(minutes);
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      throw new Error('사용시간의 시간은 0~23 사이 정수로 입력해 주세요.');
    }
    if (!Number.isInteger(m) || m < 0 || m > 59) {
      throw new Error('사용시간의 분은 0~59 사이 정수로 입력해 주세요.');
    }
    if (h === 0 && m === 0) {
      throw new Error('사용시간은 1분 이상 입력해 주세요.');
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }

  function dbTimeToHours(value) {
    const parts = String(value || '').split(':').map(Number);
    if (!Number.isFinite(parts[0])) return 0;
    return (parts[0] || 0) + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
  }

  function dbTimeToHourMinute(value) {
    const parts = String(value || '').split(':').map(Number);
    if (!Number.isFinite(parts[0])) return { hours: 0, minutes: 0 };
    const totalSeconds = Math.max(0, Math.round(
      (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)
    ));
    const totalMinutes = Math.round(totalSeconds / 60);
    return {
      hours: Math.min(23, Math.floor(totalMinutes / 60)),
      minutes: totalMinutes % 60
    };
  }

  function bindBoundedIntegerInput(id, max) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (el.value === '') return;
      const n = Number(el.value);
      if (!Number.isFinite(n)) { el.value = ''; return; }
      el.value = String(Math.max(0, Math.min(max, Math.trunc(n))));
    });
  }

  function normalizeAmount(quantity, unit) {
    const q = Number(quantity);
    if (!Number.isFinite(q)) return null;
    if (unit === 'L') return { type: 'volume', base: q * 1000 };   // mL
    if (unit === 'mL') return { type: 'volume', base: q };
    if (unit === 'µL') return { type: 'volume', base: q / 1000 };
    if (unit === 'kg') return { type: 'weight', base: q * 1000 }; // g
    if (unit === 'g') return { type: 'weight', base: q };
    if (unit === 'mg') return { type: 'weight', base: q / 1000 };
    if (unit === 'µg') return { type: 'weight', base: q / 1_000_000 };
    return null;
  }

  function aggregateAmounts(rows) {
    let volumeMl = 0;
    let weightG = 0;
    rows.forEach((r) => {
      const v = normalizeAmount(r.quantity, r.unit);
      if (!v) return;
      if (v.type === 'volume') volumeMl += v.base;
      if (v.type === 'weight') weightG += v.base;
    });
    return { volumeMl, weightG };
  }

  function formatVolume(ml) {
    if (!ml) return '';
    if (Math.abs(ml) >= 1000) return `${numberText(ml / 1000, 3)} L`;
    if (Math.abs(ml) >= 1) return `${numberText(ml, 3)} mL`;
    return `${numberText(ml * 1000, 3)} µL`;
  }

  function formatWeight(g) {
    if (!g) return '';
    if (Math.abs(g) >= 1000) return `${numberText(g / 1000, 3)} kg`;
    if (Math.abs(g) >= 1) return `${numberText(g, 3)} g`;
    if (Math.abs(g) >= .001) return `${numberText(g * 1000, 3)} mg`;
    return `${numberText(g * 1_000_000, 3)} µg`;
  }

  function amountLines(rows) {
    const a = aggregateAmounts(rows);
    const lines = [];
    if (a.volumeMl) lines.push(formatVolume(a.volumeMl));
    if (a.weightG) lines.push(formatWeight(a.weightG));
    return lines;
  }

  function totalHours(rows) {
    return rows.reduce((sum, r) => sum + dbTimeToHours(r.usage_time), 0);
  }

  function renderIdentity() {
    $('companyName').textContent = state.employee?.companyName || '연구소';
    $('employeeName').textContent = state.employee?.name || '사용자';
    $('employeeNo').textContent = state.employee?.employee_no ? `(${state.employee.employee_no})` : '';
  }

  function renderProductResults() {
    const box = $('productResults');
    const q = normalize($('productSearch').value);
    if (!q) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    if (!state.products.length) {
      box.innerHTML = '<div class="result-empty">검색할 제품정보가 없습니다. 화면의 오류 메시지를 확인해 주세요.</div>';
      box.hidden = false;
      return;
    }
    const items = state.products.filter((p) => productSearchText(p).includes(q)).slice(0, 40);
    box.innerHTML = items.length ? items.map((p) => `
      <button type="button" class="product-result" data-product-id="${Number(p.id)}">
        <span>
          <span class="result-name">${esc(p.name || '-')}</span>
          <span class="result-meta">${esc([p.maker, p.code, p.capacity].filter(Boolean).join(' · ') || '-')}</span>
        </span>
        <span class="result-cas">${productCasRows(p).length ? productCasRows(p).map((r) => `<span>${esc(r.cas_no)}</span>`).join('') : '<span>CAS 없음</span>'}</span>
      </button>`).join('') : '<div class="result-empty">검색 결과가 없습니다.</div>';
    box.hidden = false;
  }

  function renderSelectedProduct() {
    const p = state.selectedProduct;
    const wrap = $('selectedProduct');
    if (!p) {
      wrap.hidden = true;
      $('productSearch').disabled = false;
      if ($('scanProductBtn')) $('scanProductBtn').disabled = false;
      syncSpecialUsagePanel();
      return;
    }
    $('selectedProductName').textContent = p.name || '-';
    $('selectedProductMeta').textContent = [p.maker, p.code, p.capacity, p.grade].filter(Boolean).join(' · ') || '-';
    const materialRows = productMaterialRows(p);
    $('selectedProductCas').innerHTML = materialRows.length
      ? renderCasStack(materialRows, true)
      : '<span>CAS 미등록</span>';
    $('selectedMaterialName').innerHTML = materialRows.length
      ? renderMaterialStack(materialRows)
      : '<span class="material-entry"><b>물질명 미등록</b></span>';
    wrap.hidden = false;
    $('productSearch').value = '';
    $('productSearch').disabled = true;
    if ($('scanProductBtn')) $('scanProductBtn').disabled = true;
    $('productResults').hidden = true;
    syncSpecialUsagePanel();
  }

  function selectProduct(id) {
    const p = state.productsById.get(Number(id));
    if (!p) return;
    state.selectedProduct = p;
    renderSelectedProduct();
  }

  function clearSelectedProduct() {
    state.selectedProduct = null;
    renderSelectedProduct();
    $('productSearch').value = '';
    $('productSearch').focus();
  }

  async function loadProducts() {
    state.companyId = getCompanyId();
    if (!state.companyId) throw new Error('회사 정보를 확인할 수 없습니다.');

    const productResult = await db
      .from('product_master')
      .select('id, company_id, category, name, maker, code, capacity, cas, grade')
      .eq('company_id', state.companyId)
      .eq('category', '시약')
      .order('name', { ascending: true });

    if (productResult.error) throw productResult.error;
    const products = Array.isArray(productResult.data) ? productResult.data : [];

    const ids = products.map((p) => Number(p.id)).filter(Number.isFinite);
    const casMap = new Map();

    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      if (!chunk.length) continue;
      const casResult = await db
        .from('product_cas')
        .select('product_id, cas_no, content_min, content_max, sort_order')
        .in('product_id', chunk)
        .order('sort_order', { ascending: true });

      if (casResult.error) throw casResult.error;
      (casResult.data || []).forEach((row) => {
        const pid = Number(row.product_id);
        if (!casMap.has(pid)) casMap.set(pid, []);
        casMap.get(pid).push(row);
      });
    }

    state.products = products.map((p) => ({
      ...p,
      product_cas: casMap.get(Number(p.id)) || []
    }));
    state.productsById = new Map(state.products.map((p) => [Number(p.id), p]));
    await loadChemicalMaster();
    await loadSpecialSubstanceMaster();
  }

  async function loadChemicalMaster() {
    const casNos = [...new Set(state.products.flatMap((p) => productCasRows(p).map((r) => casKey(r.cas_no))).filter(Boolean))];
    const chemicalMap = new Map();

    for (let i = 0; i < casNos.length; i += 200) {
      const chunk = casNos.slice(i, i + 200);
      if (!chunk.length) continue;
      const chemicalResult = await db
        .from('qa_chemical_master')
        .select('cas_no, chem_name_ko, chem_name_en, source, sync_status')
        .in('cas_no', chunk);

      if (chemicalResult.error) throw chemicalResult.error;
      (chemicalResult.data || []).forEach((row) => {
        const key = casKey(row.cas_no);
        if (key) chemicalMap.set(key, row);
      });
    }

    state.chemicalByCas = chemicalMap;
  }

  function specialCasValues(row) {
    const nested = Array.isArray(row?.qa_special_substance_cas) ? row.qa_special_substance_cas : [];
    const values = nested
      .slice()
      .sort((a, b) => Number(a.sort_order ?? 9999) - Number(b.sort_order ?? 9999))
      .map((x) => casKey(x.cas_no))
      .filter(Boolean);
    if (values.length) return [...new Set(values)];
    return casKey(row?.cas_no) ? [casKey(row.cas_no)] : [];
  }

  function specialSubstanceActiveOn(row, dateStr) {
    const d = String(dateStr || localDateString());
    if (row?.effective_from && d < String(row.effective_from)) return false;
    if (row?.effective_to && d >= String(row.effective_to)) return false;
    return true;
  }

  async function loadSpecialSubstanceMaster() {
    const { data, error } = await db
      .from('qa_special_substances')
      .select('id, name_ko, name_en, cas_no, effective_from, effective_to, qa_special_substance_cas(cas_no, sort_order)')
      .order('name_ko', { ascending: true });

    if (error) throw error;

    const map = new Map();
    (data || []).forEach((row) => {
      specialCasValues(row).forEach((casNo) => {
        if (!map.has(casNo)) map.set(casNo, []);
        map.get(casNo).push(row);
      });
    });
    state.specialSubstancesByCas = map;
  }

  function specialMaterialsForProduct(product) {
    if (!product) return [];
    const usageDate = $('usageDate')?.value || localDateString();
    const result = [];
    const seen = new Set();

    productCasRows(product).forEach((casRow) => {
      const casNo = casKey(casRow.cas_no);
      if (!casNo) return;
      const standards = state.specialSubstancesByCas.get(casNo) || [];
      standards.forEach((standard) => {
        if (!specialSubstanceActiveOn(standard, usageDate)) return;
        const key = casNo;
        if (seen.has(key)) return;
        seen.add(key);

        const chemical = chemicalForCas(casNo) || {};
        const substanceName = String(
          chemical.chem_name_ko || chemical.chem_name_en || standard.name_ko || standard.name_en || casNo
        ).trim();

        result.push({
          substance_id: Number(standard.id),
          cas_no: casNo,
          substance_name: substanceName,
          percent_snapshot: formatContent(casRow) || null
        });
      });
    });

    return result;
  }

  function resetSpecialUsageForm() {
    if ($('specialWorkType')) $('specialWorkType').value = '';
    if ($('specialWorkDetail')) $('specialWorkDetail').value = '';
    document.querySelectorAll('#specialPpeGroup input[type="checkbox"]').forEach((el) => { el.checked = false; });
    if ($('specialPpeOther')) {
      $('specialPpeOther').value = '';
      $('specialPpeOther').hidden = true;
    }
    document.querySelectorAll('input[name="specialAccident"]').forEach((el) => { el.checked = false; });
    if ($('specialDamageDetail')) $('specialDamageDetail').value = '';
    if ($('specialActionDetail')) $('specialActionDetail').value = '';
    if ($('specialAccidentFields')) $('specialAccidentFields').hidden = true;
  }

  function syncSpecialAccidentFields() {
    const yes = $('specialAccidentYes')?.checked === true;
    if ($('specialAccidentFields')) $('specialAccidentFields').hidden = !yes;
    if (!yes) {
      if ($('specialDamageDetail')) $('specialDamageDetail').value = '';
      if ($('specialActionDetail')) $('specialActionDetail').value = '';
    }
  }

  function syncSpecialPpeOther() {
    const checked = $('specialPpeOtherCheck')?.checked === true;
    if ($('specialPpeOther')) {
      $('specialPpeOther').hidden = !checked;
      if (!checked) $('specialPpeOther').value = '';
    }
  }

  function syncSpecialUsagePanel() {
    const panel = $('specialUsagePanel');
    if (!panel) return;

    const materials = specialMaterialsForProduct(state.selectedProduct);
    state.selectedSpecialMaterials = materials;
    const visible = !!state.selectedProduct && materials.length > 0;
    panel.hidden = !visible;

    if ($('specialUsageBadge')) {
      $('specialUsageBadge').textContent = visible ? `특별관리물질 ${materials.length}종` : '특별관리물질';
    }

    if ($('specialMaterialNames')) {
      $('specialMaterialNames').innerHTML = visible
        ? materials.map((item) => `<span class="special-material-chip">${esc(item.substance_name || '물질명 미등록')}</span>`).join('')
        : '';
    }

    if (!visible) resetSpecialUsageForm();
  }

  function buildSpecialUsageInput() {
    const materials = state.selectedSpecialMaterials || [];
    if (!materials.length) return null;

    const workType = String($('specialWorkType')?.value || '').trim();
    const workDetail = String($('specialWorkDetail')?.value || '').trim();
    if (!workType) throw new Error('특별관리물질 작업내용을 선택해 주세요.');
    if (workType === '기타' && !workDetail) throw new Error('기타 작업내용을 입력해 주세요.');

    const ppe = [...document.querySelectorAll('#specialPpeGroup input[type="checkbox"]:checked')]
      .map((el) => String(el.value || '').trim())
      .filter(Boolean);
    if (!ppe.length) throw new Error('착용 보호구를 1개 이상 선택해 주세요.');

    const ppeOther = String($('specialPpeOther')?.value || '').trim();
    if (ppe.includes('other') && !ppeOther) throw new Error('기타 보호구를 입력해 주세요.');

    const accidentEl = document.querySelector('input[name="specialAccident"]:checked');
    if (!accidentEl) throw new Error('사고 발생 여부를 선택해 주세요.');
    const accidentOccurred = accidentEl.value === 'true';
    const damageDetail = String($('specialDamageDetail')?.value || '').trim();
    const actionDetail = String($('specialActionDetail')?.value || '').trim();
    if (accidentOccurred && (!damageDetail || !actionDetail)) {
      throw new Error('사고 발생 시 피해 내용과 조치 사항을 모두 입력해 주세요.');
    }

    return {
      work_content: workDetail ? `${workType} - ${workDetail}` : workType,
      ppe,
      ppe_other: ppe.includes('other') ? ppeOther : null,
      accident_occurred: accidentOccurred,
      damage_detail: accidentOccurred ? damageDetail : null,
      action_detail: accidentOccurred ? actionDetail : null,
      materials
    };
  }

  async function saveSpecialUsage(usageRecordId, specialInput) {
    if (!specialInput?.materials?.length) return;
    const employee = state.employee || {};

    const parentResult = await db
      .from('qa_special_substance_usage_records')
      .insert({
        usage_record_id: Number(usageRecordId),
        company_id: state.companyId,
        work_content: specialInput.work_content,
        ppe: specialInput.ppe,
        ppe_other: specialInput.ppe_other,
        accident_occurred: specialInput.accident_occurred,
        damage_detail: specialInput.damage_detail,
        action_detail: specialInput.action_detail,
        created_by: employee.email || null
      })
      .select('id')
      .single();

    if (parentResult.error) throw parentResult.error;

    const specialUsageId = Number(parentResult.data?.id);
    if (!Number.isFinite(specialUsageId)) throw new Error('특별관리물질 사용기록 ID를 확인할 수 없습니다.');

    const itemRows = specialInput.materials.map((item) => ({
      special_usage_id: specialUsageId,
      substance_id: Number.isFinite(Number(item.substance_id)) ? Number(item.substance_id) : null,
      substance_name_snapshot: item.substance_name,
      cas_no_snapshot: item.cas_no,
      percent_snapshot: item.percent_snapshot
    }));

    const itemResult = await db.from('qa_special_substance_usage_items').insert(itemRows);
    if (itemResult.error) throw itemResult.error;
  }

  function buildPayload() {
    const p = state.selectedProduct;
    const employee = state.employee || {};
    const quantity = Number($('quantity').value);
    const unit = $('unit').value;
    const hours = Number($('usageHours').value);
    const minutes = Number($('usageMinutes').value);
    const usageDate = $('usageDate').value;

    if (!state.companyId) throw new Error('회사 정보가 없습니다.');
    if (!employee.employee_no || !employee.name) throw new Error('사원정보를 확인할 수 없습니다.');
    if (!p?.id) throw new Error('사용제품을 선택해 주세요.');
    if (!usageDate) throw new Error('사용일을 입력해 주세요.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('사용량은 0보다 큰 숫자로 입력해 주세요.');

    return {
      company_id: state.companyId,
      employee_no: employee.employee_no,
      employee_name: employee.name,
      employee_email: employee.email || null,
      product_id: Number(p.id),
      usage_date: usageDate,
      usage_time: hoursMinutesToDbTime(hours, minutes),
      quantity_type: quantityTypeForUnit(unit),
      quantity,
      unit,
      created_by: employee.email || null
    };
  }

  async function saveUsage() {
    if (state.isSaving) return;
    setMessage('inputMessage');
    let payload;
    let specialInput;
    try {
      payload = buildPayload();
      syncSpecialUsagePanel();
      specialInput = buildSpecialUsageInput();
    } catch (e) {
      setMessage('inputMessage', e.message || '입력값을 확인해 주세요.', 'error');
      return;
    }

    const btn = $('saveUsageBtn');
    const original = btn.innerHTML;
    state.isSaving = true;
    btn.disabled = true;
    btn.textContent = '저장 중...';

    let insertedUsageId = null;
    try {
      const usageResult = await db.from(TABLE).insert(payload).select('id').single();
      if (usageResult.error) throw usageResult.error;
      insertedUsageId = Number(usageResult.data?.id);
      if (!Number.isFinite(insertedUsageId)) throw new Error('사용내역 ID를 확인할 수 없습니다.');

      if (specialInput) await saveSpecialUsage(insertedUsageId, specialInput);

      setMessage('inputMessage', specialInput ? '사용내역과 특별관리물질 기록이 등록되었습니다.' : '사용내역이 등록되었습니다.', 'success');
      $('usageHours').value = '0';
      $('usageMinutes').value = '0';
      $('quantity').value = '';
      clearSelectedProduct();
      await Promise.all([loadMonthlyRows(), loadLogRows()]);
    } catch (e) {
      if (Number.isFinite(insertedUsageId)) {
        try {
          await db.from(TABLE).delete().eq('id', insertedUsageId).eq('company_id', state.companyId);
        } catch (rollbackError) {
          console.error('[QA Usage] rollback failed', rollbackError);
        }
      }
      console.error('[QA Usage] save failed', e);
      setMessage('inputMessage', `저장 실패: ${e?.message || '알 수 없는 오류'}`, 'error');
    } finally {
      state.isSaving = false;
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  async function fetchUsage({ startDate, endDate, employeeNo = '' }) {
    let q = db.from(TABLE)
      .select('id, company_id, employee_no, employee_name, employee_email, product_id, usage_date, usage_time, quantity_type, quantity, unit, created_at')
      .eq('company_id', state.companyId)
      .gte('usage_date', startDate)
      .lte('usage_date', endDate)
      .order('usage_date', { ascending: true });

    if (employeeNo) q = q.eq('employee_no', employeeNo);
    const { data, error } = await q;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function monthRange(date) {
    const y = date.getFullYear(), m = date.getMonth();
    return {
      start: localDateString(new Date(y, m, 1)),
      end: localDateString(new Date(y, m + 1, 0)),
      days: new Date(y, m + 1, 0).getDate()
    };
  }

  function syncInputPeriodControls() {
    if ($('inputYear')) $('inputYear').value = String(state.currentMonth.getFullYear());
    if ($('inputMonth')) $('inputMonth').value = String(state.currentMonth.getMonth() + 1);
  }

  function applyInputPeriodSelection() {
    const y = Number($('inputYear')?.value);
    const m = Number($('inputMonth')?.value);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return;
    state.currentMonth = new Date(y, m - 1, 1);
    loadMonthlyRows();
  }

  function productGroupKey(product) {
    const materials = productMaterialRows(product);
    if (!materials.length) return `product:${product?.id || 'unknown'}`;
    // 복수 CAS 제품은 구성 전체를 하나의 제품 조성으로 묶는다.
    // 제품 사용량을 각 CAS 성분의 사용량으로 중복 계산하지 않는다.
    const signature = materials.map((r) => [
      casKey(r.cas_no),
      r.content_min ?? '',
      r.content_max ?? ''
    ].join(':')).join('|');
    return `composition:${signature}`;
  }

  function buildGroups(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const product = state.productsById.get(Number(row.product_id));
      const key = productGroupKey(product);
      if (!groups.has(key)) {
        const materials = productMaterialRows(product);
        groups.set(key, {
          key,
          materials,
          fallbackName: String(product?.name || '').trim() || '물질명 미등록',
          name: materialTextForProduct(product),
          rows: [],
          products: new Map()
        });
      }
      const g = groups.get(key);
      g.rows.push(row);
      const pid = Number(row.product_id);
      if (!g.products.has(pid)) g.products.set(pid, { product, rows: [] });
      g.products.get(pid).rows.push(row);
    });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  // 8-2: 나의 월간 사용현황은 물질/CAS가 아니라 실제 사용제품(product_id) 기준으로 집계한다.
  // 혼합물도 한 제품은 한 행으로 유지해 입력내역 확인/수정 시 제품 식별이 명확하도록 한다.
  function buildMonthlyProductGroups(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const pid = Number(row.product_id);
      const product = state.productsById.get(pid) || null;
      const key = Number.isFinite(pid) ? `product:${pid}` : `product:unknown:${row.id || ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          product,
          name: String(product?.name || '').trim() || `제품 #${row.product_id || '-'}`,
          rows: []
        });
      }
      groups.get(key).rows.push(row);
    });

    return [...groups.values()].sort((a, b) => {
      const an = String(a.product?.name || a.name || '');
      const bn = String(b.product?.name || b.name || '');
      return an.localeCompare(bn, 'ko') ||
        String(a.product?.maker || '').localeCompare(String(b.product?.maker || ''), 'ko') ||
        String(a.product?.code || '').localeCompare(String(b.product?.code || ''), 'ko');
    });
  }

  function monthlyProductMeta(product) {
    return [product?.maker, product?.code, product?.capacity, product?.grade]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' · ') || '-';
  }

  function metricCell(rows, metric) {
    if (!rows.length) return '<span>-</span>';
    if (metric === 'time') {
      const h = totalHours(rows);
      return h ? `<span class="time-value">${esc(numberText(h, 2))}</span>` : '<span>-</span>';
    }
    const lines = amountLines(rows);
    return lines.length ? `<span class="amount-lines">${lines.map((x) => `<span>${esc(x)}</span>`).join('')}</span>` : '<span>-</span>';
  }

  function dayRows(rows, day) {
    return rows.filter((r) => Number(String(r.usage_date || '').slice(8, 10)) === day);
  }

  function renderMonthly() {
    const range = monthRange(state.currentMonth);
    const year = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();
    const days = range.days;
    syncInputPeriodControls();
    $('monthLabel').textContent = `${year}년 ${month + 1}월`;

    const calendar = $('monthlyCalendar');
    if (!calendar) return;

    const firstWeekday = new Date(year, month, 1).getDay();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

    const rowsByDay = new Map();
    state.monthlyRows.forEach((row) => {
      const day = Number(String(row.usage_date || '').slice(8, 10));
      if (!Number.isFinite(day) || day < 1 || day > days) return;
      if (!rowsByDay.has(day)) rowsByDay.set(day, []);
      rowsByDay.get(day).push(row);
    });

    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push('<div class="calendar-day is-empty" aria-hidden="true"></div>');
    }

    for (let day = 1; day <= days; day += 1) {
      const rows = rowsByDay.get(day) || [];
      const ids = recordIdsAttr(rows);
      const count = rows.length;
      const isToday = isCurrentMonth && today.getDate() === day;
      const context = `${year}년 ${month + 1}월 ${day}일 사용내역`;
      const attrs = count
        ? ` data-detail-ids="${esc(ids)}" data-detail-context="${esc(context)}"`
        : '';
      cells.push(`<button type="button" class="calendar-day${count ? ' has-usage' : ''}${isToday ? ' is-today' : ''}"${attrs}${count ? '' : ' disabled'}>
        <span class="calendar-date">${day}</span>
        ${count ? `<span class="calendar-count">${count}건</span>` : '<span class="calendar-count empty-count">-</span>'}
      </button>`);
    }

    const trailing = (7 - ((firstWeekday + days) % 7)) % 7;
    for (let i = 0; i < trailing; i += 1) {
      cells.push('<div class="calendar-day is-empty" aria-hidden="true"></div>');
    }

    calendar.innerHTML = `
      <div class="calendar-weekdays">${weekdays.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
      <div class="calendar-grid">${cells.join('')}</div>
      ${state.monthlyRows.length ? '' : '<div class="calendar-empty-message">해당 월에 등록된 사용내역이 없습니다.</div>'}
    `;
  }

  async function loadMonthlyRows() {
    const employeeNo = state.employee?.employee_no || '';
    if (!employeeNo) return;
    const range = monthRange(state.currentMonth);
    setMessage('monthlyMessage', '월간 사용현황을 불러오는 중입니다.');
    try {
      state.monthlyRows = await fetchUsage({ startDate: range.start, endDate: range.end, employeeNo });
      setMessage('monthlyMessage');
      renderMonthly();
    } catch (e) {
      console.error(e);
      setMessage('monthlyMessage', `불러오기 실패: ${e?.message || '알 수 없는 오류'}`, 'error');
      state.monthlyRows = [];
      renderMonthly();
    }
  }

  function fillYearOptions() {
    const current = new Date().getFullYear();
    const years = Array.from({ length: 7 }, (_, i) => current - 4 + i);
    const options = years
      .map((y) => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}년</option>`).join('');
    $('logYear').innerHTML = options;
    $('inputYear').innerHTML = options;

    $('inputMonth').innerHTML = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return `<option value="${m}">${m}월</option>`;
    }).join('');

    $('inputYear').value = String(state.currentMonth.getFullYear());
    $('inputMonth').value = String(state.currentMonth.getMonth() + 1);
  }

  function syncPeriodDetail() {
    const el = $('periodDetail');
    const mode = state.periodMode;
    let opts = [];
    if (mode === 'month') opts = Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1}월`]);
    if (mode === 'quarter') opts = [['1','1분기 (1월~3월)'],['2','2분기 (4월~6월)'],['3','3분기 (7월~9월)'],['4','4분기 (10월~12월)']];
    if (mode === 'half') opts = [['1','상반기 (1월~6월)'],['2','하반기 (7월~12월)']];
    if (mode === 'year') opts = [['1','연간 (1월~12월)']];
    el.innerHTML = opts.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
    if (mode === 'half') {
      const month = new Date().getMonth() + 1;
      el.value = month <= 6 ? '1' : '2';
    }
    el.disabled = mode === 'year';
  }

  function logRange() {
    const year = Number($('logYear').value);
    const detail = Number($('periodDetail').value || 1);
    let startMonth = 1, endMonth = 12;
    if (state.periodMode === 'month') startMonth = endMonth = detail;
    if (state.periodMode === 'quarter') { startMonth = (detail - 1) * 3 + 1; endMonth = startMonth + 2; }
    if (state.periodMode === 'half') { startMonth = detail === 1 ? 1 : 7; endMonth = detail === 1 ? 6 : 12; }
    const start = localDateString(new Date(year, startMonth - 1, 1));
    const end = localDateString(new Date(year, endMonth, 0));
    return { start, end };
  }

  function isoDayNumber(value) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const t = Date.UTC(y, mo - 1, d);
    const dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return Math.floor(t / 86400000);
  }

  function employeeActiveRange(employee, range) {
    const rangeStart = isoDayNumber(range?.start);
    const rangeEnd = isoDayNumber(range?.end);
    if (rangeStart === null || rangeEnd === null) return null;

    const joinDay = isoDayNumber(employee?.join_date);
    const leaveDay = isoDayNumber(employee?.leave_date);
    const start = Math.max(rangeStart, joinDay === null ? rangeStart : joinDay);
    const end = Math.min(rangeEnd, leaveDay === null ? rangeEnd : leaveDay);
    return start <= end ? { start, end } : null;
  }

  function isRangeFullyAbsent(employeeNo, activeRange, absentNotes) {
    if (!activeRange) return true;

    const intervals = (absentNotes || [])
      .filter((note) => String(note.employee_no || '') === String(employeeNo || ''))
      .map((note) => {
        const start = isoDayNumber(note.start_date);
        const end = isoDayNumber(note.end_date);
        // 날짜가 완성되지 않은 특이사항은 자동 제외 판단에 사용하지 않습니다.
        if (start === null || end === null || start > end) return null;
        const clippedStart = Math.max(start, activeRange.start);
        const clippedEnd = Math.min(end, activeRange.end);
        return clippedStart <= clippedEnd ? { start: clippedStart, end: clippedEnd } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    if (!intervals.length) return false;

    let cursor = activeRange.start;
    for (const interval of intervals) {
      if (interval.start > cursor) return false; // 하루라도 부재가 아닌 날이 있으면 표시
      if (interval.end >= cursor) cursor = Math.max(cursor, interval.end + 1);
      if (cursor > activeRange.end) return true;
    }
    return cursor > activeRange.end;
  }

  async function fetchEligibleLogEmployees(range) {
    const employeeResult = await db
      .from('employees')
      .select('employee_no, name, email, division_code, team_code, sort_order, join_date, leave_date, is_reagent_user')
      .eq('company_id', state.companyId)
      .eq('is_reagent_user', true)
      .order('division_code', { ascending: true })
      .order('team_code', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('employee_no', { ascending: true });

    if (employeeResult.error) throw employeeResult.error;

    const noteResult = await db
      .from('employee_special_notes')
      .select('employee_no, issue_group, start_date, end_date')
      .eq('company_id', state.companyId)
      .eq('issue_group', 'absent');

    if (noteResult.error) throw noteResult.error;

    const absentNotes = Array.isArray(noteResult.data) ? noteResult.data : [];
    const employees = Array.isArray(employeeResult.data) ? employeeResult.data : [];

    return employees
      .filter((employee) => {
        const activeRange = employeeActiveRange(employee, range);
        if (!activeRange) return false; // 조회기간과 입사~퇴사 기간이 겹치지 않음
        return !isRangeFullyAbsent(employee.employee_no, activeRange, absentNotes);
      })
      .map((employee) => ({
        key: String(employee.employee_no || employee.email || employee.name || ''),
        name: employee.name || '-',
        no: employee.employee_no || '',
        division_code: employee.division_code || '',
        team_code: employee.team_code || '',
        sort_order: Number(employee.sort_order || 0)
      }))
      .filter((employee) => employee.key)
      .sort((a, b) =>
        String(a.division_code).localeCompare(String(b.division_code), 'ko') ||
        String(a.team_code).localeCompare(String(b.team_code), 'ko') ||
        a.sort_order - b.sort_order ||
        String(a.no || a.name).localeCompare(String(b.no || b.name), 'ko')
      );
  }

  function employeeColumns() {
    return Array.isArray(state.logEmployees) ? state.logEmployees : [];
  }

  function rowsForEmployee(rows, employeeKey) {
    return rows.filter((r) => String(r.employee_no || r.employee_email || r.employee_name || '') === employeeKey);
  }

  function recordIdsAttr(rows) {
    const ids = rows.map((r) => Number(r.id)).filter(Number.isFinite);
    return ids.join(',');
  }

  function detailCellAttrs(rows, context = '') {
    if (!rows.length) return '';
    return ` data-detail-ids="${esc(recordIdsAttr(rows))}" data-detail-context="${esc(context)}"`;
  }

  function findRecordById(id) {
    const n = Number(id);
    return [...state.monthlyRows, ...state.logRows].find((r) => Number(r.id) === n) || null;
  }

  function recordsByIds(ids) {
    const wanted = new Set((ids || []).map(Number).filter(Number.isFinite));
    const merged = new Map();
    [...state.monthlyRows, ...state.logRows].forEach((r) => {
      const id = Number(r.id);
      if (wanted.has(id)) merged.set(id, r);
    });
    return [...merged.values()].sort((a, b) => {
      const da = String(a.usage_date || '') + String(a.created_at || '');
      const dbv = String(b.usage_date || '') + String(b.created_at || '');
      return da.localeCompare(dbv);
    });
  }

  function formatCreatedAt(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat('ko-KR', {
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:false
    }).format(d);
  }

  function renderEditProductOptions(selectedId) {
    const select = $('usageEditProduct');
    if (!select) return;
    select.innerHTML = state.products.map((p) => {
      const label = [p.name, p.maker, p.code, p.capacity, p.grade].filter(Boolean).join(' · ');
      return `<option value="${Number(p.id)}" ${Number(p.id) === Number(selectedId) ? 'selected' : ''}>${esc(label || `제품 #${p.id}`)}</option>`;
    }).join('');
  }

  function parkUsageEditSection() {
    const list = $('usageDetailList');
    const section = $('usageEditSection');
    if (!list || !section) return;
    if (section.parentElement === list) {
      list.insertAdjacentElement('afterend', section);
    }
  }

  function placeUsageEditBelowRecord(id) {
    const list = $('usageDetailList');
    const section = $('usageEditSection');
    if (!list || !section) return;
    const card = list.querySelector(`[data-detail-record="${Number(id)}"]`);
    if (!card) return;
    card.insertAdjacentElement('afterend', section);
  }

  function renderUsageDetail() {
    const records = recordsByIds(state.detailRecordIds);
    $('usageDetailContext').textContent = state.detailContext || '';
    const list = $('usageDetailList');

    // 수정영역이 특정 카드 아래로 이동된 상태에서 목록을 다시 그리면
    // innerHTML에 의해 삭제될 수 있으므로 먼저 기본 위치로 복귀시킨다.
    parkUsageEditSection();

    if (!records.length) {
      list.innerHTML = '<div class="usage-detail-empty">표시할 사용내역이 없습니다.</div>';
      return;
    }

    list.innerHTML = records.map((r) => {
      const p = state.productsById.get(Number(r.product_id));
      const materials = productMaterialRows(p);
      const hours = dbTimeToHours(r.usage_time);
      return `<article class="usage-detail-item" data-detail-record="${Number(r.id)}">
        <div class="usage-detail-main">
          <div class="usage-detail-product">${esc(p?.name || `제품 #${r.product_id}`)}</div>
          <div class="usage-detail-meta">${esc([p?.maker, p?.code, p?.capacity, p?.grade].filter(Boolean).join(' · ') || '-')}</div>
          <div class="usage-detail-materials">${materials.length ? materials.map((m) => `<span><b>${esc(m.cas_no)}</b><em>${esc(m.name)}</em>${m.secondary ? `<small>${esc(m.secondary)}</small>` : ''}${formatContent(m) ? `<i>${esc(formatContent(m))}</i>` : ''}</span>`).join('') : '<span><b>CAS 미등록</b><em>물질명 미등록</em></span>'}</div>
          <div class="usage-detail-meta">${esc(r.employee_name || '')}${r.employee_no ? ` (${esc(r.employee_no)})` : ''}</div>
          <div class="usage-detail-values">
            <span>사용일 <b>${esc(r.usage_date || '-')}</b></span>
            <span>사용시간 <b>${esc(numberText(hours, 2))}시간</b></span>
            <span>사용량 <b>${esc(numberText(r.quantity, 4))} ${esc(r.unit || '')}</b></span>
            ${r.created_at ? `<span>등록 <b>${esc(formatCreatedAt(r.created_at))}</b></span>` : ''}
          </div>
        </div>
        ${state.detailReadonly ? '' : `<div class="usage-detail-actions">
          <button class="btn-secondary" type="button" data-detail-edit="${Number(r.id)}">수정</button>
          <button class="btn-danger" type="button" data-detail-delete="${Number(r.id)}">삭제</button>
        </div>`}
      </article>`;
    }).join('');
  }

  function openUsageDetail(ids, context = '', readonly = false) {
    const parsed = String(ids || '').split(',').map(Number).filter(Number.isFinite);
    if (!parsed.length) return;
    state.detailRecordIds = parsed;
    state.detailContext = context || '사용내역 상세';
    state.detailReadonly = !!readonly;
    $('usageEditSection').hidden = true;
    $('usageDetailModal').hidden = false;
    setMessage('usageDetailMessage');
    renderUsageDetail();
  }

  function closeUsageDetail() {
    $('usageDetailModal').hidden = true;
    $('usageEditSection').hidden = true;
    parkUsageEditSection();
    state.detailRecordIds = [];
    state.detailContext = '';
    state.detailReadonly = false;
    state.isEditing = false;
    setMessage('usageDetailMessage');
  }

  function openUsageEdit(id) {
    if (state.detailReadonly) return;
    const r = findRecordById(id);
    if (!r) return;
    state.isEditing = true;
    $('usageEditId').value = String(r.id);
    $('usageEditDate').value = r.usage_date || '';
    const editDuration = dbTimeToHourMinute(r.usage_time);
    $('usageEditHours').value = String(editDuration.hours);
    $('usageEditMinutes').value = String(editDuration.minutes);
    $('usageEditQuantity').value = String(r.quantity ?? '');
    $('usageEditUnit').value = r.unit || 'mL';
    renderEditProductOptions(r.product_id);

    // 모바일에서는 수정하려는 제품 카드 바로 아래에 수정영역을 배치한다.
    // 다른 기록을 수정하면 동일한 수정영역이 해당 카드 아래로 이동한다.
    placeUsageEditBelowRecord(r.id);
    $('usageEditSection').hidden = false;
    $('usageEditSection').scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  async function saveUsageEdit() {
    if (state.detailReadonly || state.isEditing === false) return;
    const id = Number($('usageEditId').value);
    const productId = Number($('usageEditProduct').value);
    const usageDate = $('usageEditDate').value;
    const quantity = Number($('usageEditQuantity').value);
    const unit = $('usageEditUnit').value;
    const hours = Number($('usageEditHours').value);
    const minutes = Number($('usageEditMinutes').value);

    if (!Number.isFinite(id)) return;
    if (!usageDate) { setMessage('usageDetailMessage', '사용일을 입력해 주세요.', 'error'); return; }
    if (!Number.isFinite(productId)) { setMessage('usageDetailMessage', '사용제품을 선택해 주세요.', 'error'); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { setMessage('usageDetailMessage', '사용량은 0보다 큰 숫자로 입력해 주세요.', 'error'); return; }

    let usageTime;
    try {
      usageTime = hoursMinutesToDbTime(hours, minutes);
    } catch (e) {
      setMessage('usageDetailMessage', e.message || '사용시간을 확인해 주세요.', 'error');
      return;
    }

    const btn = $('usageEditSave');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      const { error } = await db.from(TABLE)
        .update({
          product_id: productId,
          usage_date: usageDate,
          usage_time: usageTime,
          quantity_type: quantityTypeForUnit(unit),
          quantity,
          unit,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('company_id', state.companyId);

      if (error) throw error;

      setMessage('usageDetailMessage', '사용내역이 수정되었습니다.', 'success');
      $('usageEditSection').hidden = true;
      state.isEditing = false;
      await Promise.all([loadMonthlyRows(), loadLogRows()]);
      renderUsageDetail();
    } catch (e) {
      console.error('[QA Usage] update failed', e);
      setMessage('usageDetailMessage', `수정 실패: ${e?.message || '알 수 없는 오류'}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  async function deleteUsageRecord(id) {
    if (state.detailReadonly) return;
    const r = findRecordById(id);
    if (!r) return;

    const p = state.productsById.get(Number(r.product_id));
    const ok = confirm(`이 사용내역을 삭제할까요?\n\n${r.usage_date || ''} · ${p?.name || `제품 #${r.product_id}`}\n${numberText(r.quantity, 4)} ${r.unit || ''}`);
    if (!ok) return;

    try {
      const { error } = await db.from(TABLE)
        .delete()
        .eq('id', Number(id))
        .eq('company_id', state.companyId);

      if (error) throw error;

      state.detailRecordIds = state.detailRecordIds.filter((x) => Number(x) !== Number(id));
      setMessage('usageDetailMessage', '사용내역이 삭제되었습니다.', 'success');
      await Promise.all([loadMonthlyRows(), loadLogRows()]);
      if (!state.detailRecordIds.length) {
        closeUsageDetail();
      } else {
        renderUsageDetail();
      }
    } catch (e) {
      console.error('[QA Usage] delete failed', e);
      setMessage('usageDetailMessage', `삭제 실패: ${e?.message || '알 수 없는 오류'}`, 'error');
    }
  }

  function renderLog() {
    const employees = employeeColumns();
    const groups = buildGroups(state.logRows);

    $('logHead').innerHTML = `<tr>
      <th class="material-col">물질명</th>
      <th class="cas-col">CAS No.</th>
      <th class="total-col">합계</th>
      ${employees.map((e) => `<th class="person-col"><span class="person-name">${esc(e.name)}</span><span class="person-no">${esc(e.no)}</span></th>`).join('')}
    </tr>`;

    if (!groups.length) {
      $('logBody').innerHTML = `<tr><td colspan="${employees.length + 3}" class="empty">조회기간에 등록된 사용내역이 없습니다.</td></tr>`;
      return;
    }

    const html = [];
    groups.forEach((g) => {
      const expandable = g.products.size > 0;
      const expanded = state.expandedLog.has(g.key);
      html.push(`<tr class="group-row">
        <td class="material-col">
          <div class="material-main">
            <button class="expand-btn" type="button" data-log-group="${esc(g.key)}">${expandable ? (expanded ? '▼' : '▶') : '•'}</button>
            <div class="material-text">
              <div class="material-stack">${renderMaterialStack(g.materials, g.fallbackName)}</div>
            </div>
          </div>
        </td>
        <td class="cas-col"><div class="cas-stack">${renderCasStack(g.materials)}</div></td>
        <td class="total-col ${g.rows.length ? 'detail-cell' : ''}"${detailCellAttrs(g.rows, `${g.name} · 전체`)}>${metricCell(g.rows, state.logMetric)}</td>
        ${employees.map((e) => {
          const cellRows = rowsForEmployee(g.rows, e.key);
          const context = `${g.name} · ${e.name}${e.no ? ` (${e.no})` : ''}`;
          return `<td class="person-col ${cellRows.length ? 'detail-cell' : ''}"${detailCellAttrs(cellRows, context)}>${metricCell(cellRows, state.logMetric)}</td>`;
        }).join('')}
      </tr>`);

      if (expanded) {
        [...g.products.values()].forEach((pitem) => {
          const p = pitem.product;
          html.push(`<tr class="product-row">
            <td class="material-col">
              <div class="material-main">
                <span class="expand-btn">›</span>
                <div class="material-text">
                  <div class="material-name">${esc(p?.name || `제품 #${pitem.rows[0]?.product_id || ''}`)}</div>
                  <div class="product-meta">${esc([p?.maker, p?.code, p?.capacity].filter(Boolean).join(' · ') || '-')}</div>
                </div>
              </div>
            </td>
            <td class="cas-col"><div class="cas-stack">${renderCasStack(productMaterialRows(p))}</div></td>
            <td class="total-col ${pitem.rows.length ? 'detail-cell' : ''}"${detailCellAttrs(pitem.rows, `${p?.name || g.name} · 전체`)}>${metricCell(pitem.rows, state.logMetric)}</td>
            ${employees.map((e) => {
              const cellRows = rowsForEmployee(pitem.rows, e.key);
              const context = `${p?.name || g.name} · ${e.name}${e.no ? ` (${e.no})` : ''}`;
              return `<td class="person-col ${cellRows.length ? 'detail-cell' : ''}"${detailCellAttrs(cellRows, context)}>${metricCell(cellRows, state.logMetric)}</td>`;
            }).join('')}
          </tr>`);
        });
      }
    });
    $('logBody').innerHTML = html.join('');
  }

  async function loadLogRows() {
    const range = logRange();
    setMessage('logMessage', '사용일지와 시약취급자 목록을 불러오는 중입니다.');
    try {
      const [rows, employees] = await Promise.all([
        fetchUsage({ startDate: range.start, endDate: range.end }),
        fetchEligibleLogEmployees(range),
        loadChemicalMaster()
      ]);
      state.logRows = rows;
      state.logEmployees = employees;
      setMessage('logMessage');
      renderLog();
    } catch (e) {
      console.error(e);
      state.logRows = [];
      state.logEmployees = [];
      setMessage('logMessage', `불러오기 실패: ${e?.message || '알 수 없는 오류'}`, 'error');
      renderLog();
    }
  }

  function switchView(view) {
    state.currentView = view === 'log' ? 'log' : 'input';
    const log = state.currentView === 'log';
    $('usageInputView').hidden = log;
    $('usageLogView').hidden = !log;
    $('usageInputTab').classList.toggle('active', !log);
    $('usageLogTab').classList.toggle('active', log);
    $('usageInputTab2').classList.toggle('active', !log);
    $('usageLogTab2').classList.toggle('active', log);
    if (log) loadLogRows();
  }

  function notifyPortal() {
    try {
      window.parent?.postMessage({ type: 'portal-tab-active', activeTabId: 'qa-usage', tabId: 'qa-usage', source: 'qa' }, '*');
      window.parent?.postMessage({ type: 'portal-filters-ready', enabled: false, filters: [], source: 'qa' }, '*');
    } catch (_) {}
  }

  function bindEvents() {
    $('usageInputTab').addEventListener('click', () => switchView('input'));
    $('usageLogTab').addEventListener('click', () => switchView('log'));
    $('usageInputTab2').addEventListener('click', () => switchView('input'));
    $('usageLogTab2').addEventListener('click', () => switchView('log'));

    $('productSearch').addEventListener('input', renderProductResults);
    $('productSearch').addEventListener('focus', renderProductResults);
    $('productResults').addEventListener('click', (e) => {
      const item = e.target.closest('[data-product-id]');
      if (item) selectProduct(item.dataset.productId);
    });
    $('clearProductBtn').addEventListener('click', clearSelectedProduct);
    $('scanProductBtn').addEventListener('click', startProductScanner);
    $('productScanClose').addEventListener('click', closeProductScanModal);
    $('productScanRetry').addEventListener('click', startProductScanner);
    $('productScanTorch')?.addEventListener('click', toggleProductScanTorch);
    $('productScanZoom')?.addEventListener('click', cycleProductScanZoom);
    $('scanLinkRescan').addEventListener('click', startProductScanner);
    $('scanLinkSearch').addEventListener('input', renderScanLinkResults);
    $('scanLinkResults').addEventListener('click', (e) => {
      const item = e.target.closest('[data-scan-link-product]');
      if (item) selectScanLinkProduct(item.dataset.scanLinkProduct);
    });
    $('scanFixedConfirm').addEventListener('change', () => setMessage('scanLinkMessage'));
    $('scanLinkSave').addEventListener('click', saveScanProductLink);
    $('productScanModal').addEventListener('click', (e) => {
      if (e.target === $('productScanModal')) closeProductScanModal();
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.product-search-wrap')) $('productResults').hidden = true;
    });

    bindBoundedIntegerInput('usageHours', 23);
    bindBoundedIntegerInput('usageMinutes', 59);
    bindBoundedIntegerInput('usageEditHours', 23);
    bindBoundedIntegerInput('usageEditMinutes', 59);

    $('saveUsageBtn').addEventListener('click', saveUsage);
    $('usageDate').addEventListener('change', syncSpecialUsagePanel);
    $('specialPpeOtherCheck').addEventListener('change', syncSpecialPpeOther);
    $('specialAccidentNo').addEventListener('change', syncSpecialAccidentFields);
    $('specialAccidentYes').addEventListener('change', syncSpecialAccidentFields);

    $('prevMonthBtn').addEventListener('click', () => {
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
      syncInputPeriodControls();
      loadMonthlyRows();
    });
    $('nextMonthBtn').addEventListener('click', () => {
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
      syncInputPeriodControls();
      loadMonthlyRows();
    });
    $('inputYear').addEventListener('change', applyInputPeriodSelection);
    $('inputMonth').addEventListener('change', applyInputPeriodSelection);
    document.querySelectorAll('[data-monthly-metric]').forEach((btn) => btn.addEventListener('click', () => {
      state.monthlyMetric = btn.dataset.monthlyMetric;
      document.querySelectorAll('[data-monthly-metric]').forEach((b) => b.classList.toggle('active', b === btn));
      renderMonthly();
    }));
    $('monthlyCalendar').addEventListener('click', (e) => {
      const day = e.target.closest('[data-detail-ids]');
      if (!day) return;
      openUsageDetail(day.dataset.detailIds, day.dataset.detailContext || '월간 사용내역', false);
    });

    document.querySelectorAll('[data-period-mode]').forEach((btn) => btn.addEventListener('click', () => {
      state.periodMode = btn.dataset.periodMode;
      document.querySelectorAll('[data-period-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      syncPeriodDetail();
      loadLogRows();
    }));
    $('logYear').addEventListener('change', loadLogRows);
    $('periodDetail').addEventListener('change', loadLogRows);

    document.querySelectorAll('[data-log-metric]').forEach((btn) => btn.addEventListener('click', () => {
      state.logMetric = btn.dataset.logMetric;
      document.querySelectorAll('[data-log-metric]').forEach((b) => b.classList.toggle('active', b === btn));
      renderLog();
    }));
    $('logBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-log-group]');
      if (!btn) return;
      const key = btn.dataset.logGroup;
      if (state.expandedLog.has(key)) state.expandedLog.delete(key);
      else state.expandedLog.add(key);
      renderLog();
    });

    $('logBody').addEventListener('click', (e) => {
      const cell = e.target.closest('[data-detail-ids]');
      if (!cell) return;
      openUsageDetail(cell.dataset.detailIds, cell.dataset.detailContext || '사용일지 상세', true);
    });

    $('usageDetailClose').addEventListener('click', closeUsageDetail);
    $('usageDetailModal').addEventListener('click', (e) => {
      if (e.target === $('usageDetailModal')) closeUsageDetail();
    });
    $('usageEditCancel').addEventListener('click', () => {
      $('usageEditSection').hidden = true;
      parkUsageEditSection();
      state.isEditing = false;
      setMessage('usageDetailMessage');
    });
    $('usageEditSave').addEventListener('click', saveUsageEdit);

    $('usageDetailList').addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-detail-edit]');
      if (editBtn) {
        openUsageEdit(editBtn.dataset.detailEdit);
        return;
      }
      const deleteBtn = e.target.closest('[data-detail-delete]');
      if (deleteBtn) {
        deleteUsageRecord(deleteBtn.dataset.detailDelete);
      }
    });

    window.addEventListener('message', (e) => {
      const p = e?.data || {};
      if (p.type === 'portal-tabs-request' || p.type === 'portal-filters-request') notifyPortal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('productScanModal').hidden) { closeProductScanModal(); return; }
      if (e.key === 'Escape' && !$('usageDetailModal').hidden) closeUsageDetail();
    });
  }

  async function init() {
    state.employee = getIdentity();
    state.companyName = state.employee.companyName;
    $('usageDate').value = localDateString();
    fillYearOptions();
    syncPeriodDetail();
    bindEvents();
    resetSpecialUsageForm();
    notifyPortal();

    // UI 전환 버튼은 DB 상태와 무관하게 항상 동작해야 합니다.
    db = resolveDb();
    if (!db) {
      // QA/supabase.js 또는 부모 포털 초기화가 아주 약간 늦는 경우를 보완합니다.
      await new Promise((resolve) => setTimeout(resolve, 150));
      db = resolveDb();
    }

    if (!db) {
      setMessage('inputMessage', 'DB 연결을 확인할 수 없습니다. QA/supabase.js 로드 상태를 확인해 주세요.', 'error');
      setMessage('monthlyMessage', 'DB 연결을 확인할 수 없습니다.', 'error');
      return;
    }

    try {
      setMessage('inputMessage', '제품정보를 불러오는 중입니다.');
      await loadProducts();
      setMessage('inputMessage', state.products.length ? '' : '등록된 시약 제품이 없습니다.');
      await Promise.all([loadMonthlyRows(), loadLogRows()]);
    } catch (e) {
      console.error('[QA Usage] init failed', e);
      setMessage('inputMessage', `초기화 실패: ${e?.message || '알 수 없는 오류'}`, 'error');
      setMessage('monthlyMessage', `불러오기 실패: ${e?.message || '알 수 없는 오류'}`, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
