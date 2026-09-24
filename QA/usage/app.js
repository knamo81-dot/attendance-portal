(function () {
  'use strict';

  const db = window.SDSApp?.db;
  if (!db) {
    console.error('[QA Usage] Supabase client is not available.');
    return;
  }

  const TABLE = 'qa_reagent_usage_records';
  const QA_TABS = [
    { id: 'usage', label: '사용일지' },
    { id: 'sds', label: 'SDS 관리' },
    { id: 'special', label: '특별관리물질 현황' }
  ];
  const UNIT_OPTIONS = {
    volume: ['µL', 'mL', 'L'],
    weight: ['µg', 'mg', 'g', 'kg']
  };

  const state = {
    products: [],
    productsById: new Map(),
    selectedProduct: null,
    currentEmployee: null,
    companyId: '',
    recentRows: [],
    logRows: [],
    activeView: 'input',
    isSaving: false
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function getPortalSession() {
    return window.SDSApp?.getPortalSession?.() || window.portalSession || window.currentPortalSession || {};
  }

  function getCompanyId() {
    return String(window.SDSApp?.getCompanyId?.() || '').trim();
  }

  function getEmployee() {
    const session = getPortalSession();
    const employee = session.employee || {};
    const user = session.user || {};
    const employeeNo = String(
      employee.employee_no || employee.employeeNo || session.employee_no || session.employeeNo || user.employee_no || user.employeeNo || ''
    ).trim();
    const name = String(employee.name || session.name || user.name || '').trim();
    const email = String(employee.email || session.email || user.email || '').trim();
    return { employee_no: employeeNo, name, email };
  }

  function localDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function localTimeString(date = new Date()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function dateOffsetString(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return localDateString(d);
  }

  function normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? '');
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 6 }).format(num);
  }

  function formatContent(cas) {
    const min = cas?.content_min;
    const max = cas?.content_max;
    const hasMin = min !== null && min !== undefined && min !== '';
    const hasMax = max !== null && max !== undefined && max !== '';
    if (!hasMin && !hasMax) return '';
    if (hasMin && hasMax) {
      const a = Number(min);
      const b = Number(max);
      if (Number.isFinite(a) && Number.isFinite(b) && a === b) return `${formatNumber(a)}%`;
      return `${formatNumber(min)}~${formatNumber(max)}%`;
    }
    if (hasMin) return `${formatNumber(min)}% 이상`;
    return `${formatNumber(max)}% 이하`;
  }

  function productCasRows(product) {
    const rows = Array.isArray(product?.product_cas) ? [...product.product_cas] : [];
    rows.sort((a, b) => Number(a.sort_order ?? 9999) - Number(b.sort_order ?? 9999));
    if (rows.length) return rows.filter((row) => String(row.cas_no || '').trim());
    if (String(product?.cas || '').trim()) return [{ cas_no: product.cas, content_min: null, content_max: null, sort_order: 1, fallback: true }];
    return [];
  }

  function casSearchText(product) {
    return productCasRows(product).map((row) => row.cas_no).join(' ');
  }

  function productSearchText(product) {
    return normalizeText([product.name, product.maker, product.code, product.capacity, product.grade, casSearchText(product)].join(' '));
  }

  function renderCasHtml(product) {
    const rows = productCasRows(product);
    if (!rows.length) return '<span class="sub">CAS 미등록</span>';
    return `<div class="cas-list">${rows.map((row) => {
      const content = formatContent(row);
      return `<span class="cas-line">${esc(row.cas_no)}${content ? `<span class="cas-content">${esc(content)}</span>` : ''}</span>`;
    }).join('')}</div>`;
  }

  function setMessage(targetId, message, type = '') {
    const el = $(targetId);
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('success', 'error');
    if (type) el.classList.add(type);
  }

  function setDefaults() {
    $('usageDate').value = localDateString();
    $('usageTime').value = localTimeString();
    $('logStartDate').value = dateOffsetString(-30);
    $('logEndDate').value = localDateString();
    syncUnitOptions();
  }

  function renderIdentity() {
    const employee = state.currentEmployee || {};
    $('identityName').textContent = employee.name || '사원정보 없음';
    const meta = [employee.employee_no ? `사번 ${employee.employee_no}` : '', employee.email || ''].filter(Boolean).join(' · ');
    $('identityMeta').textContent = meta;
  }

  function syncUnitOptions() {
    const type = $('quantityType').value || 'volume';
    const previous = $('unit').value;
    const units = UNIT_OPTIONS[type] || UNIT_OPTIONS.volume;
    $('unit').innerHTML = units.map((unit) => `<option value="${esc(unit)}">${esc(unit)}</option>`).join('');
    if (units.includes(previous)) $('unit').value = previous;
  }

  function renderSelectedProduct() {
    const product = state.selectedProduct;
    const wrap = $('selectedProduct');
    if (!product) {
      wrap.hidden = true;
      $('productSearch').disabled = false;
      return;
    }
    $('selectedProductName').textContent = product.name || '-';
    $('selectedProductMeta').textContent = [product.maker, product.code, product.capacity, product.grade].filter(Boolean).join(' · ') || '-';
    const rows = productCasRows(product);
    $('selectedProductCas').innerHTML = rows.length
      ? rows.map((row) => {
          const content = formatContent(row);
          return `<span class="cas-chip"><span>${esc(row.cas_no)}</span>${content ? `<span class="content">${esc(content)}</span>` : ''}</span>`;
        }).join('')
      : '<span class="sub">등록된 CAS No.가 없습니다.</span>';
    wrap.hidden = false;
    $('productSearch').value = '';
    $('productSearch').disabled = true;
    $('productResults').hidden = true;
  }

  function clearSelectedProduct() {
    state.selectedProduct = null;
    renderSelectedProduct();
    $('productSearch').value = '';
    $('productSearch').focus();
  }

  function renderProductResults() {
    const query = normalizeText($('productSearch').value);
    const box = $('productResults');
    if (!query) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const results = state.products.filter((product) => productSearchText(product).includes(query)).slice(0, 30);
    box.innerHTML = results.length ? results.map((product) => `
      <div class="product-result" data-product-id="${Number(product.id)}" tabindex="0">
        <div>
          <div class="product-result-name">${esc(product.name || '-')}</div>
          <div class="product-result-meta">${esc([product.maker, product.code, product.capacity, product.grade].filter(Boolean).join(' · ') || '-')}</div>
        </div>
        <div class="product-result-cas">${productCasRows(product).length ? productCasRows(product).map((row) => `<span>${esc(row.cas_no)}</span>`).join('') : '<span>CAS 없음</span>'}</div>
      </div>`).join('') : '<div class="result-empty">검색 결과가 없습니다.</div>';
    box.hidden = false;
  }

  function selectProduct(id) {
    const product = state.productsById.get(Number(id));
    if (!product) return;
    state.selectedProduct = product;
    renderSelectedProduct();
  }

  async function loadProducts() {
    state.companyId = getCompanyId();
    if (!state.companyId) throw new Error('회사 정보를 확인할 수 없습니다. 포털에서 다시 접속해 주세요.');

    let query = db
      .from('product_master')
      .select('id, company_id, category, name, maker, code, capacity, cas, grade, product_cas(cas_no, content_min, content_max, sort_order)')
      .eq('company_id', state.companyId)
      .eq('category', '시약')
      .order('name', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;
    state.products = Array.isArray(data) ? data : [];
    state.productsById = new Map(state.products.map((row) => [Number(row.id), row]));
  }

  function buildUsagePayload() {
    const employee = state.currentEmployee || {};
    const product = state.selectedProduct;
    const quantity = Number($('quantity').value);
    const quantityType = $('quantityType').value;
    const unit = $('unit').value;
    const usageDate = $('usageDate').value;
    const usageTime = $('usageTime').value;

    if (!state.companyId) throw new Error('회사 정보가 없습니다.');
    if (!employee.employee_no || !employee.name) throw new Error('사원정보를 확인할 수 없습니다. 포털 사원정보를 확인해 주세요.');
    if (!product?.id) throw new Error('사용한 제품을 선택해 주세요.');
    if (!usageDate || !usageTime) throw new Error('사용일과 사용시간을 입력해 주세요.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('사용량은 0보다 큰 숫자로 입력해 주세요.');
    if (!UNIT_OPTIONS[quantityType]?.includes(unit)) throw new Error('사용량 단위를 다시 선택해 주세요.');

    return {
      company_id: state.companyId,
      employee_no: employee.employee_no,
      employee_name: employee.name,
      employee_email: employee.email || null,
      product_id: Number(product.id),
      usage_date: usageDate,
      usage_time: usageTime,
      quantity_type: quantityType,
      quantity,
      unit,
      created_by: employee.email || null
    };
  }

  async function saveUsage() {
    if (state.isSaving) return;
    setMessage('inputMessage', '');
    let payload;
    try {
      payload = buildUsagePayload();
    } catch (error) {
      setMessage('inputMessage', error.message || '입력값을 확인해 주세요.', 'error');
      return;
    }

    const button = $('saveUsageBtn');
    const originalText = button.textContent;
    state.isSaving = true;
    button.disabled = true;
    button.textContent = '저장 중...';
    try {
      const { error } = await db.from(TABLE).insert(payload);
      if (error) throw error;
      setMessage('inputMessage', '사용기록이 저장되었습니다.', 'success');
      $('quantity').value = '';
      $('usageDate').value = localDateString();
      $('usageTime').value = localTimeString();
      clearSelectedProduct();
      await Promise.all([loadRecentUsage(), loadUsageLog()]);
    } catch (error) {
      console.error('[QA Usage] save failed', error);
      setMessage('inputMessage', `저장 실패: ${error?.message || '알 수 없는 오류'}`, 'error');
    } finally {
      state.isSaving = false;
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function fetchUsageRows({ limit = 200, startDate = '', endDate = '' } = {}) {
    const employee = state.currentEmployee || {};
    if (!state.companyId || !employee.employee_no) return [];

    let query = db
      .from(TABLE)
      .select('id, company_id, employee_no, employee_name, employee_email, product_id, usage_date, usage_time, quantity_type, quantity, unit, created_at, updated_at')
      .eq('company_id', state.companyId)
      .eq('employee_no', employee.employee_no)
      .order('usage_date', { ascending: false })
      .order('usage_time', { ascending: false })
      .limit(limit);

    if (startDate) query = query.gte('usage_date', startDate);
    if (endDate) query = query.lte('usage_date', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function usageDateTime(row) {
    const time = String(row.usage_time || '').slice(0, 5);
    return `${row.usage_date || '-'}${time ? ` ${time}` : ''}`;
  }

  function renderRecentUsage() {
    const tbody = $('recentUsageList');
    if (!state.recentRows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">등록된 사용기록이 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = state.recentRows.map((row) => {
      const product = state.productsById.get(Number(row.product_id));
      return `<tr>
        <td>${esc(usageDateTime(row))}</td>
        <td><span class="strong">${esc(product?.name || `제품 #${row.product_id}`)}</span><span class="sub">${esc([product?.maker, product?.code].filter(Boolean).join(' · '))}</span></td>
        <td>${product ? renderCasHtml(product) : '-'}</td>
        <td><span class="amount">${esc(formatNumber(row.quantity))} ${esc(row.unit)}</span></td>
      </tr>`;
    }).join('');
  }

  async function loadRecentUsage() {
    try {
      state.recentRows = await fetchUsageRows({ limit: 10 });
      renderRecentUsage();
    } catch (error) {
      console.error('[QA Usage] recent load failed', error);
      $('recentUsageList').innerHTML = `<tr><td colspan="4" class="empty">불러오기 실패: ${esc(error?.message || '알 수 없는 오류')}</td></tr>`;
    }
  }

  function filteredLogRows() {
    const query = normalizeText($('logSearch').value);
    if (!query) return state.logRows;
    return state.logRows.filter((row) => {
      const product = state.productsById.get(Number(row.product_id));
      return product ? productSearchText(product).includes(query) : String(row.product_id).includes(query);
    });
  }

  function renderUsageLog() {
    const rows = filteredLogRows();
    $('logCount').textContent = `${rows.length}건`;
    const start = $('logStartDate').value || '-';
    const end = $('logEndDate').value || '-';
    $('logPeriod').textContent = `${start} ~ ${end}`;

    const tbody = $('usageLogList');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">조회된 사용내역이 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => {
      const product = state.productsById.get(Number(row.product_id));
      return `<tr>
        <td>${esc(usageDateTime(row))}</td>
        <td><span class="strong">${esc(product?.name || `제품 #${row.product_id}`)}</span></td>
        <td>${esc(product?.maker || '-')}</td>
        <td>${esc(product?.code || '-')}</td>
        <td>${product ? renderCasHtml(product) : '-'}</td>
        <td><span class="amount">${esc(formatNumber(row.quantity))} ${esc(row.unit)}</span><span class="sub">${row.quantity_type === 'volume' ? '부피' : '무게'}</span></td>
      </tr>`;
    }).join('');
  }

  async function loadUsageLog() {
    const startDate = $('logStartDate').value;
    const endDate = $('logEndDate').value;
    if (startDate && endDate && startDate > endDate) {
      setMessage('logMessage', '시작일은 종료일보다 늦을 수 없습니다.', 'error');
      return;
    }
    setMessage('logMessage', '');
    try {
      state.logRows = await fetchUsageRows({ limit: 500, startDate, endDate });
      renderUsageLog();
    } catch (error) {
      console.error('[QA Usage] log load failed', error);
      setMessage('logMessage', `불러오기 실패: ${error?.message || '알 수 없는 오류'}`, 'error');
      state.logRows = [];
      renderUsageLog();
    }
  }

  function switchView(view) {
    state.activeView = view === 'log' ? 'log' : 'input';
    const isLog = state.activeView === 'log';
    $('usageInputView').hidden = isLog;
    $('usageLogView').hidden = !isLog;
    $('usageInputViewBtn').classList.toggle('active', !isLog);
    $('usageLogViewBtn').classList.toggle('active', isLog);
    if (isLog) loadUsageLog();
  }

  function notifyPortalTabs() {
    try {
      window.parent?.postMessage({
        type: 'portal-tabs-ready',
        tabs: QA_TABS,
        activeTabId: 'usage',
        source: 'qa'
      }, '*');
      window.parent?.postMessage({
        type: 'portal-tab-active',
        activeTabId: 'usage',
        tabId: 'usage',
        source: 'qa'
      }, '*');
      window.parent?.postMessage({
        type: 'portal-filters-ready',
        enabled: false,
        filters: [],
        source: 'qa'
      }, '*');
    } catch (_) {}
  }

  function activateQaPortalTab(tabId) {
    if (tabId === 'usage') {
      notifyPortalTabs();
      return true;
    }
    if (tabId === 'sds') {
      location.href = '../index.html';
      return true;
    }
    if (tabId === 'special') {
      location.href = '../special/index.html';
      return true;
    }
    return false;
  }

  function bindEvents() {
    $('usageInputViewBtn').addEventListener('click', () => switchView('input'));
    $('usageLogViewBtn').addEventListener('click', () => switchView('log'));
    $('quantityType').addEventListener('change', syncUnitOptions);
    $('productSearch').addEventListener('input', renderProductResults);
    $('productSearch').addEventListener('focus', renderProductResults);
    $('clearProductBtn').addEventListener('click', clearSelectedProduct);
    $('saveUsageBtn').addEventListener('click', saveUsage);
    $('refreshRecentBtn').addEventListener('click', loadRecentUsage);

    $('productResults').addEventListener('click', (event) => {
      const item = event.target.closest('[data-product-id]');
      if (item) selectProduct(item.dataset.productId);
    });
    $('productResults').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = event.target.closest('[data-product-id]');
      if (item) {
        event.preventDefault();
        selectProduct(item.dataset.productId);
      }
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.product-search-field')) $('productResults').hidden = true;
    });

    ['logStartDate', 'logEndDate'].forEach((id) => $(id).addEventListener('change', loadUsageLog));
    $('logSearch').addEventListener('input', renderUsageLog);
    $('logResetBtn').addEventListener('click', () => {
      $('logStartDate').value = dateOffsetString(-30);
      $('logEndDate').value = localDateString();
      $('logSearch').value = '';
      loadUsageLog();
    });

    window.addEventListener('message', (event) => {
      const payload = event?.data || {};
      if (payload.type === 'portal-tabs-request' || payload.type === 'portal-filters-request') {
        notifyPortalTabs();
        return;
      }
      if (payload.type === 'portal-tab-change') {
        activateQaPortalTab(payload.tabId || payload.tab || '');
      }
    });
  }

  async function init() {
    setDefaults();
    state.currentEmployee = getEmployee();
    renderIdentity();
    bindEvents();
    notifyPortalTabs();

    try {
      setMessage('inputMessage', '제품정보를 불러오는 중입니다.');
      await loadProducts();
      setMessage('inputMessage', '');
      await Promise.all([loadRecentUsage(), loadUsageLog()]);
    } catch (error) {
      console.error('[QA Usage] init failed', error);
      setMessage('inputMessage', `초기화 실패: ${error?.message || '알 수 없는 오류'}`, 'error');
      $('recentUsageList').innerHTML = `<tr><td colspan="4" class="empty">불러오기 실패: ${esc(error?.message || '알 수 없는 오류')}</td></tr>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
