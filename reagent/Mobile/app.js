(function () {
  "use strict";

  const APP = window.ReagentApp = window.ReagentApp || {};
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const MOBILE = true;
  const state = {
    requests: [],
    collect: [],
    registrationRequests: [],
    month: "",
    operator: false,
    user: {},
    loading: false,
    reloadQueued: false
  };

  let bridgedPortalSession = null;

  const PORTAL_TABS = [
    { id: "reagent-dashboard", label: "구매현황" },
    { id: "request", label: "제품신청" },
    { id: "collect", label: "제품취합" },
    { id: "prepare", label: "취합정리" },
    { id: "order-receipt", label: "발주/입고 관리" },
    { id: "product-management", label: "제품관리" }
  ];

  function portalSession() {
    try {
      if (window.parent && window.parent !== window && typeof window.parent.getPortalSession === "function") {
        const parentSession = window.parent.getPortalSession() || {};
        if (parentSession && (parentSession.activeCompanyId || parentSession.companyId || parentSession.company_id)) {
          return parentSession;
        }
      }
    } catch (_) {}
    try {
      if (window.parent && window.parent !== window && window.parent.portalSession) {
        const parentSession = window.parent.portalSession || {};
        if (parentSession && (parentSession.activeCompanyId || parentSession.companyId || parentSession.company_id)) {
          return parentSession;
        }
      }
    } catch (_) {}
    return bridgedPortalSession || window.portalSession || window.currentPortalSession || {};
  }

  function applyPortalAuthMessage(payload) {
    const raw = payload || {};
    const session = raw.session && typeof raw.session === 'object' ? { ...raw.session } : {};
    const company = raw.company && typeof raw.company === 'object' ? raw.company : {};
    const user = raw.user && typeof raw.user === 'object' ? raw.user : {};

    const companyId = String(
      session.activeCompanyId ||
      session.companyId ||
      session.company_id ||
      company.id ||
      company.company_id ||
      user.company_id ||
      user.companyId ||
      ''
    ).trim();

    bridgedPortalSession = {
      ...session,
      activeCompanyId: session.activeCompanyId || companyId,
      companyId: session.companyId || companyId,
      company_id: session.company_id || companyId,
      employee: raw.employee || session.employee || null,
      profile: raw.profile || session.profile || null,
      appRoles: raw.appRoles || raw.app_roles || session.appRoles || session.app_roles || {},
      app_roles: raw.app_roles || raw.appRoles || session.app_roles || session.appRoles || {},
      userRole: session.userRole || session.user_role || user.role || user.user_role || '',
      isServiceAdmin: session.isServiceAdmin === true || session.is_service_admin === true || user.isServiceAdmin === true || user.is_service_admin === true
    };

    window.portalSession = bridgedPortalSession;
    window.currentPortalSession = bridgedPortalSession;
  }

  function requestPortalAuth() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'portal-auth-request', source: 'reagent-dashboard' }, '*');
      }
    } catch (_) {}
  }

  function getCompanyId() {
    return String(APP.getCompanyId?.() || new URLSearchParams(location.search).get("company_id") || "").trim();
  }

  function getUserContext() {
    const s = portalSession();
    const user = s.employee || s.profile || s.user || {};
    return {
      employeeNo: String(user.employee_no || user.employeeNo || s.employee_no || s.employeeNo || "").trim(),
      name: String(user.name || user.user_name || user.userName || s.name || s.userName || "").trim(),
      role: String(
        s.appRoles?.reagent?.role ||
        s.app_roles?.reagent?.role ||
        (typeof s.appRoles?.reagent === 'string' ? s.appRoles.reagent : '') ||
        (typeof s.app_roles?.reagent === 'string' ? s.app_roles.reagent : '') ||
        s.reagentRole || s.reagent_role || ""
      ).trim().toLowerCase(),
      userRole: String(s.userRole || s.user_role || user.user_role || "").trim().toLowerCase(),
      isServiceAdmin: s.isServiceAdmin === true || s.is_service_admin === true || s.isGlobalAdmin === true || s.is_global_admin === true
    };
  }

  function isOperatorUser(user) {
    const role = String(user?.role || "").toLowerCase();
    return user?.isServiceAdmin === true || user?.userRole === "admin" || ["admin", "operator", "관리자", "운영자"].includes(role);
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function waitForPortalReady(timeout = 2500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (APP.sb && getCompanyId()) return true;
      await wait(100);
    }
    return !!APP.sb;
  }

  function monthKey(date = new Date(), offset = 0) {
    const d = new Date(date.getFullYear(), date.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(value) {
    const [y, m] = String(value || "").split("-");
    return y && m ? `${y}년 ${Number(m)}월` : value || "-";
  }

  function getDefaultMonth() {
    try {
      const saved = localStorage.getItem("reagent_order_month");
      if (/^\d{4}-\d{2}$/.test(saved || "")) return saved;
    } catch (_) {}
    return monthKey(new Date(), 1);
  }

  function sixMonthKeys() {
    return Array.from({ length: 6 }, (_, i) => monthKey(new Date(), i - 5));
  }

  function minMonth(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function num(value) {
    const n = Number(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function currency(value) {
    return `₩${Math.round(num(value)).toLocaleString("ko-KR")}`;
  }

  function compactCurrency(value) {
    const n = num(value);
    if (n >= 100000000) return `₩${(n / 100000000).toFixed(1).replace(/\.0$/, "")}억`;
    if (n >= 10000000) return `₩${(n / 10000000).toFixed(1).replace(/\.0$/, "")}천만`;
    if (n >= 10000) return `₩${(n / 10000).toFixed(0)}만`;
    return currency(n);
  }

  function dateOnly(value) {
    const raw = String(value || "").trim();
    return raw ? raw.slice(0, 10) : "";
  }

  function parseItemKey(itemKey = "") {
    const p = String(itemKey || "").split("||");
    return {
      orderMonth: p[0] || "",
      category: p[1] || "",
      name: p[2] || "",
      maker: p[3] || "",
      code: p[4] || "",
      capacity: p[5] || "",
      cas: p[6] || "",
      grade: p[7] || ""
    };
  }

  function requestKey(row = {}) {
    return [
      row.order_month || "",
      row.category || "",
      row.name || "",
      row.maker || "",
      row.code || "",
      row.capacity || "",
      row.cas || "",
      row.grade || ""
    ].join("||");
  }

  function collectMeta(row = {}) {
    return row.meta_json && typeof row.meta_json === "object" && !Array.isArray(row.meta_json) ? row.meta_json : {};
  }

  function collectName(row = {}) {
    const p = parseItemKey(row.item_key || "");
    const m = collectMeta(row);
    return row.product_name || row.name || m.product_name || m.name || p.name || "-";
  }

  function selectedVendor(row = {}) {
    const m = collectMeta(row);
    const selected = String(m.selectedVendor || row.purchase_vendor || "").trim();
    if (selected === "vendor1") return String(m.vendor1 || "").trim();
    if (selected === "vendor2") return String(m.vendor2 || "").trim();
    return selected || String(m.vendor1 || m.vendor2 || "").trim() || "미지정";
  }

  function selectedUnit(row = {}) {
    const m = collectMeta(row);
    const selected = String(m.selectedVendor || "").trim();
    if (selected === "vendor1") return num(m.unit1);
    if (selected === "vendor2") return num(m.unit2);
    return num(row.purchase_unit || m.unit1 || m.unit2);
  }

  function purchaseAmount(row = {}) {
    const m = collectMeta(row);
    const qty = num(row.collected_qty || m.confirmedQty || 0);
    const selected = String(m.selectedVendor || "").trim();
    if (selected === "vendor1") return num(m.price1) || num(m.unit1) * qty;
    if (selected === "vendor2") return num(m.price2) || num(m.unit2) * qty;
    return num(row.purchase_amount) || num(m.price1 || m.price2) || selectedUnit(row) * qty;
  }

  function isConfirmed(row = {}) {
    const m = collectMeta(row);
    return row.confirmed === true || m.confirmed === true;
  }

  function groupRequests(rows) {
    const map = new Map();
    rows.forEach(row => {
      const key = requestKey(row);
      if (!map.has(key)) map.set(key, { key, rows: [], totalQty: 0, name: row.name || "-", orderMonth: row.order_month || "" });
      const g = map.get(key);
      g.rows.push(row);
      g.totalQty += num(row.qty);
    });
    return Array.from(map.values());
  }

  function collectMap(rows) {
    const map = new Map();
    rows.forEach(row => { if (row.item_key) map.set(String(row.item_key), row); });
    return map;
  }

  function currentMonthData() {
    const month = state.month;
    const requests = state.requests.filter(r => r.order_month === month);
    const collect = state.collect.filter(r => r.order_month === month);
    const groups = groupRequests(requests);
    const cMap = collectMap(collect);
    return { requests, collect, groups, cMap };
  }

  function statusForGroup(group, cMap) {
    const c = cMap.get(group.key) || null;
    const collected = num(c?.collected_qty);
    const confirmed = !!c && isConfirmed(c);
    const ordered = !!String(c?.order_date || "").trim();
    const received = !!String(c?.receipt_date || "").trim();
    return { c, collected, confirmed, ordered, received };
  }

  function showRoleUi() {
    document.body.classList.toggle("dashboard-operator", state.operator);
    document.body.classList.toggle("dashboard-viewer", !state.operator);
    $$(".operator-only").forEach(el => { el.hidden = !state.operator; });
    $$(".viewer-only").forEach(el => { el.hidden = state.operator; });
    const subtitle = $("#dashboardSubtitle");
    if (subtitle) subtitle.textContent = state.operator
      ? "시약·초자·소모품·안전용품의 주문 및 구매 진행현황을 한눈에 확인합니다."
      : "내가 신청한 연구용품의 취합·발주·입고 진행상황을 확인합니다.";
    const label = $("#kpiRequestLabel");
    if (label) label.textContent = state.operator ? "신청품목" : "내 신청품목";
  }

  function initMonthOptions() {
    const select = $("#dashboardMonth");
    if (!select) return;
    const months = new Set([state.month, getDefaultMonth(), monthKey(new Date(), 0), monthKey(new Date(), 1)]);
    state.requests.forEach(r => { if (r.order_month) months.add(r.order_month); });
    state.collect.forEach(r => { if (r.order_month) months.add(r.order_month); });
    const list = Array.from(months).filter(x => /^\d{4}-\d{2}$/.test(x)).sort().reverse();
    select.innerHTML = list.map(m => `<option value="${esc(m)}">${esc(monthLabel(m))}</option>`).join("");
    select.value = state.month;
  }

  function renderKpis() {
    const { groups, collect, cMap } = currentMonthData();
    const stages = groups.map(g => ({ group: g, ...statusForGroup(g, cMap) }));
    const collectPending = stages.filter(x => x.collected < x.group.totalQty).length;
    const confirmedRows = collect.filter(isConfirmed);
    const orderPending = confirmedRows.filter(r => !String(r.order_date || "").trim()).length;
    const unreceived = confirmedRows.filter(r => String(r.order_date || "").trim() && !String(r.receipt_date || "").trim()).length;
    const received = confirmedRows.filter(r => String(r.receipt_date || "").trim()).length;
    const amount = confirmedRows.reduce((sum, r) => sum + purchaseAmount(r), 0);
    const myReg = state.registrationRequests.filter(r => ["요청", "확인중"].includes(String(r.status || "요청").trim())).length;

    $("#kpiRequest").textContent = `${groups.length}건`;
    $("#kpiCollectPending").textContent = `${collectPending}건`;
    $("#kpiOrderPending").textContent = `${orderPending}건`;
    $("#kpiUnreceived").textContent = `${unreceived}건`;
    $("#kpiReceived").textContent = `${received}건`;
    if ($("#kpiAmount")) $("#kpiAmount").textContent = compactCurrency(amount);
    if ($("#kpiMyRegistration")) $("#kpiMyRegistration").textContent = `${myReg}건`;
  }

  function stageIcon(label) {
    const icons = {
      "신청": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 12h5M10 16h5"/></svg>`,
      "취합": `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v5c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 10v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>`,
      "거래처확정": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v11H5z"/><path d="M8 8V5h8v3"/><path d="M9 13l2 2 4-4"/></svg>`,
      "발주": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2l2 10h10l2-7H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>`,
      "입고": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/><path d="M8.5 15l2 2 4-4"/></svg>`
    };
    return icons[label] || "";
  }

  function renderStages() {
    const { groups, collect, cMap } = currentMonthData();
    const total = groups.length;
    const collected = groups.filter(g => statusForGroup(g, cMap).collected > 0).length;
    const confirmed = collect.filter(isConfirmed).length;
    const ordered = collect.filter(r => isConfirmed(r) && String(r.order_date || "").trim()).length;
    const received = collect.filter(r => isConfirmed(r) && String(r.receipt_date || "").trim()).length;
    const stages = [
      ["신청", total, "blue"],
      ["취합", collected, "cyan"],
      ["거래처확정", confirmed, "violet"],
      ["발주", ordered, "orange"],
      ["입고", received, "green"]
    ];
    $("#stageFlow").innerHTML = stages.map(([label, value, tone], i) => {
      const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
      return `<div class="stage-item tone-${tone}">
        <div class="stage-top"><span class="stage-icon">${stageIcon(label)}</span><div><b>${esc(label)}</b><strong>${value}건</strong></div></div>
        <div class="stage-bar"><i style="width:${pct}%"></i></div><small>${pct}%</small>
      </div>${i < stages.length - 1 ? '<span class="stage-arrow">›</span>' : ''}`;
    }).join("");
  }

  function renderAttention() {
    if (!state.operator) return;
    const { groups, collect, cMap } = currentMonthData();

    // 미취합: 해당 주문월의 신청품목 중 아직 한 번도 취합추가되지 않은 품목
    const uncollected = groups.filter(g => {
      const s = statusForGroup(g, cMap);
      return s.collected === 0;
    }).length;

    // 추가취합 필요: 이미 일부 수량을 취합한 뒤 동일 품목의 신청수량이 추가된 경우
    const additional = groups.filter(g => {
      const s = statusForGroup(g, cMap);
      return s.collected > 0 && s.collected < g.totalQty;
    }).length;

    const vendorMissing = collect.filter(r => num(r.collected_qty) > 0 && !isConfirmed(r)).length;
    const orderMissing = collect.filter(r => isConfirmed(r) && !String(r.order_date || "").trim()).length;
    const receiptMissing = collect.filter(r => isConfirmed(r) && String(r.order_date || "").trim() && !String(r.receipt_date || "").trim()).length;
    const registration = state.registrationRequests.filter(r => ["요청", "확인중"].includes(String(r.status || "요청").trim())).length;

    $("#needUncollected").textContent = `${uncollected}건`;
    $("#needAdditional").textContent = `${additional}건`;
    $("#needVendor").textContent = `${vendorMissing}건`;
    $("#needOrder").textContent = `${orderMissing}건`;
    $("#needReceipt").textContent = `${receiptMissing}건`;
    $("#needRegistration").textContent = `${registration}건`;
  }

  function renderMonthlyChart() {
    if (!state.operator) return;
    const months = sixMonthKeys();
    const values = months.map(m => state.collect.filter(r => r.order_month === m && isConfirmed(r)).reduce((sum, r) => sum + purchaseAmount(r), 0));
    const max = Math.max(1, ...values);
    $("#monthlyChart").innerHTML = months.map((m, i) => {
      const height = Math.max(values[i] ? 12 : 2, Math.round((values[i] / max) * 100));
      return `<div class="bar-col"><span>${values[i] ? compactCurrency(values[i]).replace('₩','') : '0'}</span><div class="bar-track"><i style="height:${height}%"></i></div><b>${Number(m.slice(5))}월</b></div>`;
    }).join("");
  }

  function vendorRows() {
    const mode = $("#vendorPeriod")?.value || "month";
    const prefix = mode === "year" ? state.month.slice(0, 4) + "-" : state.month;
    return state.collect.filter(r => isConfirmed(r) && (mode === "year" ? String(r.order_month || "").startsWith(prefix) : r.order_month === prefix));
  }

  function vendorStats(rows) {
    const map = new Map();
    rows.forEach(r => {
      const vendor = selectedVendor(r) || "미지정";
      if (!map.has(vendor)) map.set(vendor, { vendor, amount: 0, count: 0, ordered: 0, received: 0, deliveryDays: [] });
      const v = map.get(vendor);
      v.amount += purchaseAmount(r);
      v.count += 1;
      const od = dateOnly(r.order_date), rd = dateOnly(r.receipt_date);
      if (od) v.ordered += 1;
      if (rd) v.received += 1;
      if (od && rd) {
        const days = Math.round((new Date(rd + 'T00:00:00') - new Date(od + 'T00:00:00')) / 86400000);
        if (Number.isFinite(days) && days >= 0) v.deliveryDays.push(days);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount || b.count - a.count);
  }

  function renderVendors() {
    if (!state.operator) return;
    const stats = vendorStats(vendorRows());
    const total = stats.reduce((sum, v) => sum + v.amount, 0);
    $("#vendorTotal").textContent = currency(total);
    const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b"];
    let cursor = 0;
    const segments = stats.slice(0, 6).map((v, i) => {
      const pct = total ? (v.amount / total) * 100 : 0;
      const start = cursor; cursor += pct;
      return `${colors[i]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    const donut = $("#vendorDonut");
    donut.style.background = segments.length ? `conic-gradient(${segments.join(',')})` : '#eef2f7';
    $("#vendorList").innerHTML = stats.length ? stats.slice(0, 6).map((v, i) => {
      const pct = total ? Math.round((v.amount / total) * 100) : 0;
      return `<div class="vendor-row"><i style="background:${colors[i]}"></i><b>${esc(v.vendor)}</b><span>${pct}%</span><strong>${currency(v.amount)}</strong><small>${v.count}품목</small></div>`;
    }).join("") : '<div class="empty-state">구매 거래처 자료가 없습니다.</div>';
  }

  function renderDelivery() {
    if (!state.operator) return;
    const stats = vendorStats(vendorRows()).filter(v => v.ordered > 0);
    $("#deliveryList").innerHTML = stats.length ? stats.slice(0, 8).map(v => {
      const avg = v.deliveryDays.length ? (v.deliveryDays.reduce((a,b)=>a+b,0) / v.deliveryDays.length).toFixed(1) : '-';
      const unreceived = Math.max(0, v.ordered - v.received);
      return `<div class="delivery-row"><b>${esc(v.vendor)}</b><span>평균 <strong>${avg === '-' ? '-' : avg + '일'}</strong></span><span>미입고 <em>${unreceived}건</em></span></div>`;
    }).join("") : '<div class="empty-state">발주·입고 자료가 없습니다.</div>';
  }

  function recentEvents(operator = true) {
    const events = [];
    const { groups, cMap } = currentMonthData();
    if (operator) {
      state.collect.forEach(r => {
        const name = collectName(r), vendor = selectedVendor(r);
        const m = collectMeta(r);
        if (r.receipt_date) events.push({ date: dateOnly(r.receipt_date), status: '입고완료', name, vendor, tone:'green' });
        if (r.order_date) events.push({ date: dateOnly(r.order_date), status: '발주완료', name, vendor, tone:'blue' });
        if (m.confirmedAt) events.push({ date: dateOnly(m.confirmedAt), status: '거래처확정', name, vendor, tone:'violet' });
      });
      state.requests.forEach(r => {
        if (r.created_at) events.push({ date: dateOnly(r.created_at), status:'신청', name:r.name || '-', vendor:'', tone:'gray' });
      });
    } else {
      groups.forEach(g => {
        const s = statusForGroup(g, cMap);
        let status='신청', date='', tone='gray';
        if (s.received) { status='입고완료'; date=dateOnly(s.c.receipt_date); tone='green'; }
        else if (s.ordered) { status='발주완료'; date=dateOnly(s.c.order_date); tone='blue'; }
        else if (s.confirmed) { status='거래처확정'; date=dateOnly(collectMeta(s.c).confirmedAt); tone='violet'; }
        else if (s.collected > 0) { status='취합'; date=''; tone='cyan'; }
        const created = g.rows.map(r=>dateOnly(r.created_at)).filter(Boolean).sort().reverse()[0] || '';
        events.push({ date: date || created, status, name:g.name, vendor:'', tone });
      });
    }
    return events.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0, MOBILE ? 8 : 10);
  }

  function renderRecentList(targetId, events) {
    const target = $(targetId);
    if (!target) return;
    target.innerHTML = events.length ? events.map(e => `<div class="recent-row"><span>${esc(e.date || '-')}</span><b>${esc(e.name)}</b><em class="status-chip tone-${esc(e.tone)}">${esc(e.status)}</em><small>${esc(e.vendor || '')}</small></div>`).join('') : '<div class="empty-state">표시할 최근 내역이 없습니다.</div>';
  }

  function renderAll() {
    initMonthOptions();
    renderKpis();
    renderStages();
    if (state.operator) {
      renderAttention();
      renderMonthlyChart();
      renderVendors();
      renderDelivery();
      renderRecentList('#recentList', recentEvents(true));
    } else {
      renderRecentList('#myRecentList', recentEvents(false));
    }
  }

  async function loadData() {
    if (state.loading) {
      state.reloadQueued = true;
      return;
    }
    state.loading = true;
    state.reloadQueued = false;
    const loading = $('#dashboardLoading');
    if (loading) { loading.hidden = false; loading.textContent = '연구용품 구매현황을 불러오는 중입니다.'; }
    try {
      await waitForPortalReady();
      if (!APP.sb) throw new Error('Supabase 연결 정보를 확인할 수 없습니다.');
      if (!getCompanyId()) throw new Error('회사 정보를 확인할 수 없습니다.');

      state.user = getUserContext();
      state.operator = isOperatorUser(state.user);
      showRoleUi();

      const chartStart = sixMonthKeys()[0];
      const queryStart = minMonth(chartStart, state.month);

      let requestQuery = APP.sb.from('reagent_requests').select('*').gte('order_month', queryStart).order('created_at', { ascending: false });
      if (!state.operator) {
        if (state.user.employeeNo) requestQuery = requestQuery.eq('employee_no', state.user.employeeNo);
        else if (state.user.name) requestQuery = requestQuery.eq('requester', state.user.name);
        else requestQuery = requestQuery.eq('employee_no', '__dashboard_no_identity__');
      }
      const { data: requestData, error: requestError } = await requestQuery;
      if (requestError) throw requestError;
      state.requests = Array.isArray(requestData) ? requestData : [];

      let collectQuery = APP.sb.from('reagent_collect_items').select('*').gte('order_month', queryStart);
      if (!state.operator) {
        const keys = [...new Set(state.requests.map(requestKey).filter(Boolean))];
        if (!keys.length) {
          state.collect = [];
        } else {
          const { data: collectData, error: collectError } = await collectQuery.in('item_key', keys.slice(0, 1000));
          if (collectError) throw collectError;
          state.collect = Array.isArray(collectData) ? collectData : [];
        }
      } else {
        const { data: collectData, error: collectError } = await collectQuery;
        if (collectError) throw collectError;
        state.collect = Array.isArray(collectData) ? collectData : [];
      }

      let regQuery = APP.sb.from('product_registration_requests').select('*').order('created_at', { ascending: false }).limit(1000);
      if (!state.operator) {
        if (state.user.name) regQuery = regQuery.eq('requester', state.user.name);
        else regQuery = regQuery.eq('requester', '__dashboard_no_identity__');
      }
      const { data: regData, error: regError } = await regQuery;
      if (regError) throw regError;
      state.registrationRequests = Array.isArray(regData) ? regData : [];

      renderAll();
      if (loading) loading.hidden = true;
    } catch (error) {
      console.error('연구용품 구매현황 조회 실패:', error);
      if (loading) {
        loading.hidden = false;
        loading.textContent = `연구용품 구매현황 조회 실패: ${error?.message || error}`;
      }
    } finally {
      state.loading = false;
      if (state.reloadQueued) {
        state.reloadQueued = false;
        setTimeout(loadData, 0);
      }
    }
  }

  function notifyPortalTabs() {
    try {
      window.parent?.postMessage({
        type: 'portal-tabs-ready',
        tabs: PORTAL_TABS,
        activeTabId: 'reagent-dashboard',
        source: 'reagent-dashboard'
      }, '*');
      window.parent?.postMessage({ type:'portal-filters-ready', enabled:false, filters:[], source:'reagent-dashboard' }, '*');
    } catch (_) {}
  }

  function bindEvents() {
    $('#dashboardMonth')?.addEventListener('change', (e) => {
      state.month = String(e.target.value || '').trim() || state.month;
      try { localStorage.setItem('reagent_order_month', state.month); } catch (_) {}
      renderAll();
    });
    $('#dashboardRefresh')?.addEventListener('click', loadData);
    $('#vendorPeriod')?.addEventListener('change', () => { renderVendors(); renderDelivery(); });
    window.addEventListener('message', (event) => {
      const p = event.data || {};
      if (p.type === 'portal-tabs-request') notifyPortalTabs();
      if (p.type === 'portal-filters-request') {
        try { window.parent?.postMessage({ type:'portal-filters-ready', enabled:false, filters:[], source:'reagent-dashboard' }, '*'); } catch (_) {}
      }
      if (p.type === 'portal-auth') {
        applyPortalAuthMessage(p);
        loadData();
      }
      if (p.type === 'portal-session' || p.type === 'portal-company-change') loadData();
      if (p.type === 'portal-dashboard-refresh') loadData();
    });
  }

  async function bootstrap() {
    state.month = getDefaultMonth();

    // 데이터 연결을 기다리기 전에 화면 골격과 주문월을 먼저 표시합니다.
    // 네트워크/세션 응답이 늦어도 모바일 첫 화면이 빈 화면처럼 보이지 않게 합니다.
    initMonthOptions();
    bindEvents();
    notifyPortalTabs();
    requestPortalAuth();

    setTimeout(requestPortalAuth, 120);
    setTimeout(requestPortalAuth, 400);
    setTimeout(requestPortalAuth, 1000);

    await loadData();

    setTimeout(notifyPortalTabs, 250);
    setTimeout(notifyPortalTabs, 800);
  }

  bootstrap();
})();
