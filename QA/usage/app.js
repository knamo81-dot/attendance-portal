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
    selectedProduct: null,
    currentView: 'input',
    currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    monthlyMetric: 'amount',
    logMetric: 'amount',
    periodMode: 'half',
    monthlyRows: [],
    logRows: [],
    expandedMonthly: new Set(),
    expandedLog: new Set(),
    isSaving: false
  };

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

  function baseMaterialName(product) {
    const raw = String(product?.name || '').trim();
    if (!raw) return '물질명 미등록';
    return raw.split(',')[0].trim() || raw;
  }

  function productSearchText(product) {
    return normalize([
      product.name, product.maker, product.code, product.capacity, product.grade,
      ...productCasRows(product).map((r) => r.cas_no)
    ].join(' '));
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

  function hoursToDbTime(hours) {
    const value = Number(hours);
    if (!Number.isFinite(value) || value <= 0 || value >= 24) {
      throw new Error('사용시간은 0보다 크고 24시간 미만으로 입력해 주세요.');
    }
    const totalSeconds = Math.round(value * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function dbTimeToHours(value) {
    const parts = String(value || '').split(':').map(Number);
    if (!Number.isFinite(parts[0])) return 0;
    return (parts[0] || 0) + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
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
      return;
    }
    $('selectedProductName').textContent = p.name || '-';
    $('selectedProductMeta').textContent = [p.maker, p.code, p.capacity].filter(Boolean).join(' · ') || '-';
    $('selectedMaterialName').textContent = baseMaterialName(p);
    const casRows = productCasRows(p);
    $('selectedProductCas').innerHTML = casRows.length
      ? casRows.map((r) => `<span class="cas-line"><b>${esc(r.cas_no)}</b>${formatContent(r) ? `<span class="cas-content">${esc(formatContent(r))}</span>` : ''}</span>`).join('')
      : '<span>CAS 미등록</span>';
    wrap.hidden = false;
    $('productSearch').value = '';
    $('productSearch').disabled = true;
    $('productResults').hidden = true;
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
  }

  function buildPayload() {
    const p = state.selectedProduct;
    const employee = state.employee || {};
    const quantity = Number($('quantity').value);
    const unit = $('unit').value;
    const hours = Number($('usageHours').value);
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
      usage_time: hoursToDbTime(hours),
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
    try {
      payload = buildPayload();
    } catch (e) {
      setMessage('inputMessage', e.message || '입력값을 확인해 주세요.', 'error');
      return;
    }

    const btn = $('saveUsageBtn');
    const original = btn.innerHTML;
    state.isSaving = true;
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      const { error } = await db.from(TABLE).insert(payload);
      if (error) throw error;
      setMessage('inputMessage', '사용내역이 등록되었습니다.', 'success');
      $('usageHours').value = '';
      $('quantity').value = '';
      clearSelectedProduct();
      await Promise.all([loadMonthlyRows(), loadLogRows()]);
    } catch (e) {
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

  function productGroupKey(product) {
    const cas = primaryCas(product);
    return cas ? `cas:${cas}` : `product:${product?.id || 'unknown'}`;
  }

  function buildGroups(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const product = state.productsById.get(Number(row.product_id));
      const key = productGroupKey(product);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          cas: primaryCas(product) || '-',
          name: baseMaterialName(product),
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
    const { days } = monthRange(state.currentMonth);
    $('monthLabel').textContent = `${state.currentMonth.getFullYear()}년 ${state.currentMonth.getMonth() + 1}월`;

    $('monthlyHead').innerHTML = `<tr>
      <th class="material-col">물질명 (CAS No.)</th>
      ${Array.from({ length: days }, (_, i) => `<th class="day-col">${i + 1}</th>`).join('')}
    </tr>`;

    const groups = buildGroups(state.monthlyRows);
    if (!groups.length) {
      $('monthlyBody').innerHTML = `<tr><td colspan="${days + 1}" class="empty">해당 월에 등록된 사용내역이 없습니다.</td></tr>`;
      return;
    }

    const html = [];
    groups.forEach((g) => {
      const expandable = g.products.size > 1;
      const expanded = state.expandedMonthly.has(g.key);
      html.push(`<tr class="group-row">
        <td class="material-col">
          <div class="material-main">
            <button class="expand-btn" type="button" data-month-group="${esc(g.key)}">${expandable ? (expanded ? '▼' : '▶') : '•'}</button>
            <div class="material-text">
              <div class="material-name">${esc(g.name)}</div>
              <div class="material-cas">${esc(g.cas)}</div>
            </div>
          </div>
        </td>
        ${Array.from({ length: days }, (_, i) => {
          const rows = dayRows(g.rows, i + 1);
          return `<td class="value-cell ${rows.length ? 'has-value' : ''}">${metricCell(rows, state.monthlyMetric)}</td>`;
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
            ${Array.from({ length: days }, (_, i) => {
              const rows = dayRows(pitem.rows, i + 1);
              return `<td class="value-cell ${rows.length ? 'has-value' : ''}">${metricCell(rows, state.monthlyMetric)}</td>`;
            }).join('')}
          </tr>`);
        });
      }
    });
    $('monthlyBody').innerHTML = html.join('');
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
    $('logYear').innerHTML = Array.from({ length: 7 }, (_, i) => current - 4 + i)
      .map((y) => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}년</option>`).join('');
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

  function employeeColumns(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const key = String(r.employee_no || r.employee_email || r.employee_name || '');
      if (!map.has(key)) map.set(key, { key, name: r.employee_name || '-', no: r.employee_no || '' });
    });
    return [...map.values()].sort((a, b) => (a.no || a.name).localeCompare(b.no || b.name, 'ko'));
  }

  function rowsForEmployee(rows, employeeKey) {
    return rows.filter((r) => String(r.employee_no || r.employee_email || r.employee_name || '') === employeeKey);
  }

  function renderLog() {
    const employees = employeeColumns(state.logRows);
    const groups = buildGroups(state.logRows);

    $('logHead').innerHTML = `<tr>
      <th class="material-col">물질명</th>
      <th class="cas-col">CAS No.</th>
      ${employees.map((e) => `<th class="person-col"><span class="person-name">${esc(e.name)}</span><span class="person-no">${esc(e.no)}</span></th>`).join('')}
      <th class="total-col">합계</th>
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
              <div class="material-name">${esc(g.name)}</div>
              <div class="material-en">${esc(g.name)}</div>
            </div>
          </div>
        </td>
        <td class="cas-col">${esc(g.cas)}</td>
        ${employees.map((e) => `<td>${metricCell(rowsForEmployee(g.rows, e.key), state.logMetric)}</td>`).join('')}
        <td class="total-col">${metricCell(g.rows, state.logMetric)}</td>
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
            <td class="cas-col">${esc(primaryCas(p) || '-')}</td>
            ${employees.map((e) => `<td>${metricCell(rowsForEmployee(pitem.rows, e.key), state.logMetric)}</td>`).join('')}
            <td class="total-col">${metricCell(pitem.rows, state.logMetric)}</td>
          </tr>`);
        });
      }
    });
    $('logBody').innerHTML = html.join('');
  }

  async function loadLogRows() {
    const range = logRange();
    setMessage('logMessage', '사용일지를 불러오는 중입니다.');
    try {
      state.logRows = await fetchUsage({ startDate: range.start, endDate: range.end });
      setMessage('logMessage');
      renderLog();
    } catch (e) {
      console.error(e);
      state.logRows = [];
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
    $('productSearchBtn').addEventListener('click', () => { $('productSearch').focus(); renderProductResults(); });
    $('productResults').addEventListener('click', (e) => {
      const item = e.target.closest('[data-product-id]');
      if (item) selectProduct(item.dataset.productId);
    });
    $('clearProductBtn').addEventListener('click', clearSelectedProduct);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.product-search-wrap')) $('productResults').hidden = true;
    });

    $('saveUsageBtn').addEventListener('click', saveUsage);

    $('prevMonthBtn').addEventListener('click', () => {
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
      loadMonthlyRows();
    });
    $('nextMonthBtn').addEventListener('click', () => {
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
      loadMonthlyRows();
    });
    document.querySelectorAll('[data-monthly-metric]').forEach((btn) => btn.addEventListener('click', () => {
      state.monthlyMetric = btn.dataset.monthlyMetric;
      document.querySelectorAll('[data-monthly-metric]').forEach((b) => b.classList.toggle('active', b === btn));
      renderMonthly();
    }));
    $('monthlyBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-month-group]');
      if (!btn) return;
      const key = btn.dataset.monthGroup;
      if (state.expandedMonthly.has(key)) state.expandedMonthly.delete(key);
      else state.expandedMonthly.add(key);
      renderMonthly();
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

    window.addEventListener('message', (e) => {
      const p = e?.data || {};
      if (p.type === 'portal-tabs-request' || p.type === 'portal-filters-request') notifyPortal();
    });
  }

  async function init() {
    state.employee = getIdentity();
    state.companyName = state.employee.companyName;
    $('usageDate').value = localDateString();
    fillYearOptions();
    syncPeriodDetail();
    bindEvents();
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
