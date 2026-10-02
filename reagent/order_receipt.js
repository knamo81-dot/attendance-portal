(function () {
  "use strict";

  // order_receipt.js - server direct refactor baseline
  // 3차 자동 갱신 버전: 다른 PC/모바일 변경사항 주기 반영
  // 5차 Realtime 버전: reagent_collect_items 변경 즉시 반영
  // 기준 데이터: reagent_collect_items / 화면 데이터: APP.orderReceipt.rows

  window.ReagentApp = window.ReagentApp || {};

  const APP = window.ReagentApp;

  function escapeHtml(value) {
    return APP.escapeHtml ? APP.escapeHtml(value) : String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function attr(value) {
    return escapeHtml(value);
  }

  function toNumber(value) {
    const n = Number(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function formatNumber(value) {
    const n = toNumber(value);
    return n ? n.toLocaleString("ko-KR") : "";
  }

  function todayMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function normalizeMonth(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}\.\d{2}$/.test(raw)) return raw.replace(".", "-");
    return todayMonth();
  }

  function isOperator() {
    return APP.hasReagentOperatorAccess?.() === true;
  }

  function getMeta(row = {}) {
    const meta = row.meta_json;
    return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  }

  function parseItemKey(itemKey = "", fallbackMonth = "") {
    const parts = String(itemKey || "").split("||");
    return {
      order_month: parts[0] || fallbackMonth || "",
      category: parts[1] || "",
      name: parts[2] || "",
      maker: parts[3] || "",
      code: parts[4] || "",
      capacity: parts[5] || "",
      cas: parts[6] || "",
      grade: parts[7] || ""
    };
  }

  function getSelectedVendor(meta = {}) {
    const selected = String(meta.selectedVendor || "").trim();
    if (selected === "vendor1") return String(meta.vendor1 || "").trim();
    if (selected === "vendor2") return String(meta.vendor2 || "").trim();
    return selected || String(meta.vendor1 || meta.vendor2 || "").trim();
  }

  function getSelectedUnit(meta = {}) {
    const selected = String(meta.selectedVendor || "").trim();
    if (selected === "vendor1") return toNumber(meta.unit1);
    if (selected === "vendor2") return toNumber(meta.unit2);
    return toNumber(meta.unit1 || meta.unit2);
  }

  function getSelectedAmount(meta = {}, qty = 0) {
    const selected = String(meta.selectedVendor || "").trim();
    if (selected === "vendor1") return toNumber(meta.price1) || (toNumber(meta.unit1) * qty);
    if (selected === "vendor2") return toNumber(meta.price2) || (toNumber(meta.unit2) * qty);
    return toNumber(meta.price1 || meta.price2) || (getSelectedUnit(meta) * qty);
  }

  APP.orderReceipt = {
    rows: [],
    selectedKeys: new Set(),
    dragSelecting: false,
    dragMode: "add",
    showUnreceived: false,
    initialized: false,
    productCasMap: {},
    remoteFailed: false,
    remoteEnabled: true,
    autoRefreshTimer: null,
    autoRefreshMs: 15000,
    isSaving: false,
    isRefreshing: false,
    realtimeChannel: null,
    realtimeDebounceTimer: null,
    realtimeRefreshDelayMs: 250,
    dateInteractionActive: false,
    dateInteractionGuardUntil: 0,
    mobileDatePickerState: null,

    isDateInteractionActive() {
      if (this.mobileDatePickerState) return true;
      const active = document.activeElement;
      if (active?.classList?.contains("order-receipt-date")) return true;
      return this.dateInteractionActive === true || Date.now() < Number(this.dateInteractionGuardUntil || 0);
    },

    beginDateInteraction(input) {
      this.dateInteractionActive = true;
      // Android/iOS 네이티브 날짜 선택기가 포커스/visibility를 바꾸는 동안
      // 자동 새로고침이 input DOM을 교체하지 못하도록 충분한 보호 시간을 둡니다.
      this.dateInteractionGuardUntil = Date.now() + 60000;
      if (input) {
        input.dataset.orderReceiptOpenedAt = String(Date.now());
        if (input.dataset.orderReceiptCommittedValue == null) {
          input.dataset.orderReceiptCommittedValue = String(input.value || "").trim();
        }
      }
    },

    endDateInteraction() {
      this.dateInteractionActive = false;
      this.dateInteractionGuardUntil = 0;
    },

    get tableName() {
      return "reagent_collect_items";
    },

    getEls() {
      return {
        month: document.getElementById("orderReceiptMonth"),
        showUnreceived: document.getElementById("showUnreceivedOrders"),
        reset: document.getElementById("resetOrderReceiptFilter"),
        refresh: document.getElementById("refreshOrderReceipt"),
        count: document.getElementById("orderReceiptCount"),
        unreceived: document.getElementById("orderReceiptUnreceivedCount"),
        amount: document.getElementById("orderReceiptAmount"),
        selected: document.getElementById("orderReceiptSelectedCount"),
        body: document.getElementById("orderReceiptList"),
        mobileCards: document.getElementById("orderReceiptMobileCards"),
        desc: document.getElementById("orderReceiptDesc"),
        readonlyNotice: document.getElementById("orderReceiptReadonlyNotice"),
        clearOrderDate: document.getElementById("clearSelectedOrderDate"),
        clearReceiptDate: document.getElementById("clearSelectedReceiptDate")
      };
    },

    getRecordKey(row = {}) {
      return row.id ? `id:${row.id}` : `${normalizeMonth(row.order_month)}__${row.item_key || row.key || ""}`;
    },

    normalizeServerRow(row = {}) {
      const meta = getMeta(row);
      const parsed = parseItemKey(row.item_key || "", row.order_month || "");
      const orderMonth = normalizeMonth(row.order_month || parsed.order_month || meta.order_month || meta.orderMonth || todayMonth());
      const qty = toNumber(row.collected_qty || meta.confirmedQty || meta.collected_qty || meta.qty || 0);
      const purchaseUnit = getSelectedUnit(meta);
      const purchaseAmount = getSelectedAmount(meta, qty);

      return {
        id: row.id || "",
        product_id: Number(row.product_id || meta.product_id || meta.productId || 0) || null,
        recordKey: row.id ? `id:${row.id}` : `${orderMonth}__${row.item_key || ""}`,
        item_key: row.item_key || "",
        order_month: orderMonth,
        category: row.category || meta.category || parsed.category || "",
        name: row.product_name || row.name || meta.product_name || meta.name || parsed.name || "",
        maker: row.maker || meta.maker || parsed.maker || "",
        code: row.product_code || row.code || meta.product_code || meta.code || parsed.code || "",
        capacity: row.capacity || meta.capacity || parsed.capacity || "",
        cas: row.cas || meta.cas || parsed.cas || "",
        grade: row.grade || meta.grade || parsed.grade || "",
        usage: row.usage || meta.usage || meta.purpose || meta.request_usage || "-",
        qty,
        purchaseVendor: row.purchase_vendor || meta.purchaseVendor || getSelectedVendor(meta),
        purchaseUnit,
        purchaseAmount,
        remark: row.prepare_remark || meta.prepareRemark || "",
        confirmed: row.confirmed === true || meta.confirmed === true,
        order_date: row.order_date || "",
        receipt_date: row.receipt_date || ""
      };
    },

    async loadProductCasMap(rows = []) {
      const sb = APP.sb;
      const ids = [...new Set((rows || []).map((r) => Number(r.product_id || 0)).filter((id) => id > 0))];
      this.productCasMap = {};
      if (!sb || !ids.length) return;
      const { data, error } = await sb.from("product_cas").select("id, product_id, cas_no, sort_order").in("product_id", ids).order("sort_order", { ascending: true }).order("id", { ascending: true });
      if (error) { console.warn("발주/입고 제품 CAS 조회 실패:", error); return; }
      (data || []).forEach((item) => {
        const key = String(item.product_id);
        this.productCasMap[key] = this.productCasMap[key] || [];
        if (item.cas_no && !this.productCasMap[key].includes(item.cas_no)) this.productCasMap[key].push(item.cas_no);
      });
    },

    renderCasLines(value = "") {
      const items = String(value || "")
        .split(/[,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (!items.length) return "-";
      return [...new Set(items)].map((item) => escapeHtml(item)).join("<br>");
    },

    async loadRowsFromServer() {
      const sb = APP.sb;
      if (!sb || this.remoteFailed || !this.remoteEnabled) return [];

      try {
        let query = sb.from(this.tableName).select("*");
        query = APP.scopedCompanyQuery ? APP.scopedCompanyQuery(query) : query;
        const { data, error } = await query;
        if (error) throw error;
        const rows = (Array.isArray(data) ? data : [])
          .map((row) => this.normalizeServerRow(row))
          .filter((row) => row.item_key || row.id);
        await this.loadProductCasMap(rows);
        rows.forEach((row) => {
          const list = this.productCasMap[String(row.product_id)] || [];
          if (list.length) row.cas = list.join(", ");
        });
        return rows;
      } catch (error) {
        console.warn("발주/입고 목록 서버 조회 실패:", error);
        // 자동 갱신 중 일시 오류가 발생해도 다음 주기에 다시 시도합니다.
        return this.rows || [];
      }
    },

    async loadRemoteRecords() {
      this.rows = await this.loadRowsFromServer();
      return this.rows;
    },

    getAvailableMonths() {
      const months = new Set();
      months.add(todayMonth());

      try {
        const requestMonth = APP.request?.getCurrentOrderMonth?.();
        if (requestMonth) months.add(requestMonth);
      } catch (_) {}

      (this.rows || []).forEach((row) => {
        if (row.order_month) months.add(row.order_month);
      });

      return Array.from(months).filter(Boolean).sort();
    },

    setCurrentMonth(month) {
      const next = normalizeMonth(month);
      try {
        if (APP.request?.setCurrentOrderMonth) APP.request.setCurrentOrderMonth(next);
        else localStorage.setItem("reagent_order_month", next);
      } catch (_) {}
    },

    getCurrentMonth() {
      const els = this.getEls();
      const requestMonth = APP.request?.getCurrentOrderMonth?.();
      return normalizeMonth(els.month?.value || requestMonth || todayMonth());
    },

    initMonthOptions() {
      const els = this.getEls();
      if (!els.month) return;
      const current = this.getCurrentMonth();
      const months = this.getAvailableMonths();
      if (!months.includes(current)) months.push(current);
      months.sort();
      els.month.innerHTML = months.map((month) => `<option value="${attr(month)}">${attr(month)}</option>`).join("");
      els.month.value = current;
    },

    sortOrderReceiptRows(rows = []) {
      const categoryOrder = { "시약": 1, "초자": 2, "초자/소모품": 2, "안전용품": 3 };
      return [...rows].sort((a, b) => {
        const aCat = categoryOrder[a.category] || 99;
        const bCat = categoryOrder[b.category] || 99;
        if (aCat !== bCat) return aCat - bCat;

        const vendorCompare = String(a.purchaseVendor || "").localeCompare(String(b.purchaseVendor || ""), "ko");
        if (vendorCompare !== 0) return vendorCompare;

        const usageCompare = String(a.usage || "").localeCompare(String(b.usage || ""), "ko");
        if (usageCompare !== 0) return usageCompare;

        const nameCompare = String(a.name || "").localeCompare(String(b.name || ""), "ko");
        if (nameCompare !== 0) return nameCompare;

        return String(a.remark || "").localeCompare(String(b.remark || ""), "ko");
      });
    },

    getDisplayRows() {
      const month = this.getCurrentMonth();
      const rows = (this.rows || []).filter((row) => {
        if (this.showUnreceived) return !String(row.receipt_date || "").trim();
        return normalizeMonth(row.order_month) === month;
      });
      return this.sortOrderReceiptRows(rows);
    },

    async init() {
      if (this.initialized) {
        await this.refresh();
        return;
      }
      this.initialized = true;
      this.bindEvents();
      await this.refresh();
      this.startRealtime();
      this.startAutoRefresh();
    },

    bindEvents() {
      const els = this.getEls();
      els.month?.addEventListener("change", () => {
        this.showUnreceived = false;
        this.setCurrentMonth(els.month.value);
        this.selectedKeys.clear();
        this.render();
      });

      els.showUnreceived?.addEventListener("click", () => {
        this.showUnreceived = true;
        this.selectedKeys.clear();
        this.render();
      });

      els.reset?.addEventListener("click", () => {
        this.showUnreceived = false;
        this.selectedKeys.clear();
        this.initMonthOptions();
        this.render();
      });

      els.refresh?.addEventListener("click", async () => {
        await this.refresh({ toast: true });
      });

      els.clearOrderDate?.addEventListener("click", async () => this.clearSelectedDate("order_date"));
      els.clearReceiptDate?.addEventListener("click", async () => this.clearSelectedDate("receipt_date"));

      document.addEventListener("mouseup", () => { this.dragSelecting = false; });
      document.addEventListener("touchend", () => { this.dragSelecting = false; });

      // 날짜 선택기 외부를 다시 터치하면 날짜 선택 보호 상태를 해제합니다.
      document.addEventListener("pointerdown", (event) => {
        if (event.target?.closest?.(".order-receipt-date, #orderReceiptMobileDatePicker")) return;
        if (this.dateInteractionActive || this.dateInteractionGuardUntil) this.endDateInteraction();
      }, true);

      document.addEventListener("visibilitychange", async () => {
        if (document.hidden) return;
        if (!this.initialized || this.isSaving) return;

        // 모바일 네이티브 달력/날짜 선택기가 visibility를 순간적으로 바꿀 수 있습니다.
        // 날짜 선택 중에는 절대로 refresh/render 하지 않습니다.
        if (this.isDateInteractionActive()) return;

        if (!this.realtimeChannel) this.startRealtime();
        await this.refresh({ silent: true });
      });
    },

    async refresh(options = {}) {
      if (this.isRefreshing) return;
      if (options.allowDuringDateInteraction !== true && this.isDateInteractionActive()) return;
      this.isRefreshing = true;

      try {
        await this.loadRemoteRecords();
        this.initMonthOptions();
        this.render();

        if (options.toast === true) {
          APP.toast?.("발주/입고 목록을 새로고침했습니다.", "success");
        }
      } finally {
        this.isRefreshing = false;
      }
    },

    startRealtime() {
      const sb = APP.sb;
      if (!sb || typeof sb.channel !== "function") return;

      this.stopRealtime();

      const companyId = APP.getCompanyId?.() || "";
      const filter = companyId ? `company_id=eq.${companyId}` : undefined;

      try {
        let channel = sb.channel(`order_receipt_${companyId || "default"}`);

        const onChange = () => {
          if (this.isSaving || this.isRefreshing || this.isDateInteractionActive()) return;

          clearTimeout(this.realtimeDebounceTimer);
          this.realtimeDebounceTimer = window.setTimeout(async () => {
            if (this.isSaving || this.isRefreshing || this.isDateInteractionActive()) return;
            if ((this.selectedKeys?.size || 0) > 0) return;
            await this.refresh({ silent: true });
          }, this.realtimeRefreshDelayMs);
        };

        const eventConfig = {
          event: "*",
          schema: "public",
          table: this.tableName
        };
        if (filter) eventConfig.filter = filter;

        this.realtimeChannel = channel
          .on("postgres_changes", eventConfig, onChange)
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              console.info("발주/입고 Realtime 구독 시작:", this.tableName);
            }
          });
      } catch (error) {
        console.warn("발주/입고 Realtime 구독 실패. 자동 갱신으로 동작합니다:", error);
      }
    },

    stopRealtime() {
      if (this.realtimeDebounceTimer) {
        clearTimeout(this.realtimeDebounceTimer);
        this.realtimeDebounceTimer = null;
      }

      const sb = APP.sb;
      if (this.realtimeChannel && sb?.removeChannel) {
        try { sb.removeChannel(this.realtimeChannel); } catch (_) {}
      }
      this.realtimeChannel = null;
    },

    startAutoRefresh() {
      this.stopAutoRefresh();

      this.autoRefreshTimer = window.setInterval(async () => {
        if (document.hidden) return;
        if (this.isSaving || this.isRefreshing || this.dragSelecting) return;
        if (this.isDateInteractionActive()) return;

        // 사용자가 여러 품목을 선택해서 날짜 작업 중이면 화면을 갑자기 갱신하지 않습니다.
        if ((this.selectedKeys?.size || 0) > 0) return;

        await this.refresh({ silent: true });
      }, this.autoRefreshMs);
    },

    stopAutoRefresh() {
      if (this.autoRefreshTimer) {
        clearInterval(this.autoRefreshTimer);
        this.autoRefreshTimer = null;
      }
    },

    getSelectedKeys() {
      return Array.from(this.selectedKeys || []);
    },

    findRowByKey(key) {
      const rawKey = String(key || "");
      const rawId = rawKey.startsWith("id:") ? rawKey.slice(3) : "";
      return (this.rows || []).find((row) =>
        String(row.recordKey || "") === rawKey ||
        (rawId && String(row.id || "") === rawId)
      ) || null;
    },

    setRowSelected(key, selected) {
      if (!key) return;
      if (selected) this.selectedKeys.add(key);
      else this.selectedKeys.delete(key);
    },

    beginDrag(key, selected) {
      this.dragSelecting = true;
      this.dragMode = selected ? "add" : "remove";
      this.setRowSelected(key, selected);
      this.updateSelectionUI();
    },

    dragOver(key) {
      if (!this.dragSelecting || !key) return;
      this.setRowSelected(key, this.dragMode !== "remove");
      this.updateSelectionUI();
    },

    updateSelectionUI() {
      const els = this.getEls();
      document.querySelectorAll(".order-receipt-row, .order-receipt-mobile-card").forEach((el) => {
        const key = el.dataset.recordKey || "";
        const selected = this.selectedKeys.has(key);
        el.classList.toggle("selected", selected);
        const checkbox = el.querySelector(".order-receipt-check, .order-receipt-mobile-checkbox");
        if (checkbox) checkbox.checked = selected;
      });
      if (els.selected) els.selected.textContent = `${this.selectedKeys.size}건`;
      if (els.clearOrderDate) els.clearOrderDate.disabled = !isOperator() || this.selectedKeys.size === 0;
      if (els.clearReceiptDate) els.clearReceiptDate.disabled = !isOperator() || this.selectedKeys.size === 0;
    },

    getApplyKeys(fallbackKey) {
      const selected = this.getSelectedKeys();
      if (selected.length > 1) return selected;
      if (selected.length === 1 && selected[0] !== fallbackKey) return selected;
      return fallbackKey ? [fallbackKey] : selected;
    },

    updateLocalRows(keys = [], field, value) {
      const keySet = new Set(keys.filter(Boolean));
      const idSet = new Set(
        keys
          .map((key) => String(key || "").startsWith("id:") ? String(key).slice(3) : "")
          .filter(Boolean)
      );

      this.rows = (this.rows || []).map((row) => {
        const matched =
          keySet.has(String(row.recordKey || "")) ||
          (idSet.size > 0 && idSet.has(String(row.id || "")));

        return matched ? { ...row, [field]: value || "" } : row;
      });
    },

    async saveDateToServer(keys = [], field, value) {
      const sb = APP.sb;
      if (!sb || !field) return;

      const payload = { [field]: value || null };
      const updatedBy = APP.collect?.getCurrentUserName?.() || APP.currentUser?.name || APP.currentUser?.user_name || "";
      if (updatedBy) payload.updated_by = updatedBy;

      for (const key of keys) {
        const row = this.findRowByKey(key);
        if (!row) continue;

        let query = sb.from(this.tableName).update(payload);
        if (row.id) {
          query = query.eq("id", row.id);
        } else {
          query = query.eq("item_key", row.item_key).eq("order_month", row.order_month);
          const companyId = APP.getCompanyId?.() || "";
          if (companyId) query = query.eq("company_id", companyId);
        }

        const { error } = await query;
        if (error) throw error;
      }
    },

    async setDate(recordKey, field, value, options = {}) {
      const keys = options.single === true ? [recordKey] : this.getApplyKeys(recordKey);
      const targetKeys = keys.filter(Boolean);
      if (!targetKeys.length || !field) return;

      this.updateLocalRows(targetKeys, field, value);
      this.render();

      this.isSaving = true;
      try {
        await this.saveDateToServer(targetKeys, field, value);
        APP.toast?.(field === "order_date" ? "발주일자를 저장했습니다." : "입고일자를 저장했습니다.", "success");
      } catch (error) {
        console.warn("발주/입고일자 서버 저장 실패:", error);
        APP.toast?.(`발주/입고일자 서버 저장 실패: ${error.message || "Supabase 권한/컬럼을 확인하세요."}`, "warn");
        await this.refresh({ silent: true });
      } finally {
        this.isSaving = false;
      }
    },

    async clearDate(recordKey, field) {
      await this.setDate(recordKey, field, "", { single: true });
    },

    async clearSelectedDate(field) {
      const keys = this.getSelectedKeys();
      if (!keys.length) {
        APP.toast?.("먼저 날짜를 삭제할 품목을 선택해 주세요.", "warn");
        return;
      }
      await this.setDate(keys[0], field, "", { single: false });
      APP.toast?.(`${keys.length}건의 ${field === "order_date" ? "발주일자" : "입고일자"}를 삭제했습니다.`, "success");
    },

    getOrderStatus(row = {}) {
      if (String(row.receipt_date || "").trim()) return { label: "입고완료", className: "done" };
      if (String(row.order_date || "").trim()) return { label: "발주완료", className: "ordered" };
      return { label: "발주전", className: "waiting" };
    },

    formatDateText(value) {
      const raw = String(value || "").trim();
      if (!raw) return "-";
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
      return raw;
    },

    getRowDateState(row = {}) {
      const orderDateText = this.formatDateText(row.order_date);
      const receiptDateText = this.formatDateText(row.receipt_date);
      return {
        orderDateText,
        receiptDateText,
        orderDateValue: orderDateText === "-" ? "" : orderDateText,
        receiptDateValue: receiptDateText === "-" ? "" : receiptDateText,
        status: this.getOrderStatus(row)
      };
    },

    toDateValue(date) {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return "";
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    },

    parseDateValue(value) {
      const raw = String(value || "").trim();
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    },

    ensureMobileDatePicker() {
      let backdrop = document.getElementById("orderReceiptMobileDatePicker");
      if (backdrop) return backdrop;

      if (!document.getElementById("orderReceiptMobileDatePickerStyle")) {
        const style = document.createElement("style");
        style.id = "orderReceiptMobileDatePickerStyle";
        style.textContent = `
          .order-receipt-mobile-date-trigger{
            width:100%; min-height:38px; border:1px solid var(--line,#d9e2ec); border-radius:10px;
            background:#fff; color:var(--text,#1f2937); padding:8px 10px; font:inherit; font-weight:750;
            text-align:left; cursor:pointer;
          }
          .order-receipt-mobile-date-trigger.is-empty{color:#64748b; font-weight:650;}
          body.order-receipt-calendar-open{overflow:hidden !important;}
          .or-mobile-calendar-backdrop[hidden]{display:none !important;}
          .or-mobile-calendar-backdrop{
            position:fixed; inset:0; z-index:12000; display:flex; align-items:flex-end; justify-content:center;
            padding:12px; background:rgba(15,23,42,.48); opacity:0; pointer-events:none; transition:opacity .12s ease;
          }
          .or-mobile-calendar-backdrop.show{opacity:1; pointer-events:auto;}
          .or-mobile-calendar{
            width:min(100%,430px); max-height:calc(100vh - 24px); overflow:auto; background:#fff;
            border-radius:20px; box-shadow:0 24px 60px rgba(15,23,42,.28); padding:14px;
          }
          .or-mobile-calendar-title{font-size:12px; color:#64748b; font-weight:800; margin:0 0 10px 2px;}
          .or-mobile-calendar-head{display:grid; grid-template-columns:42px 1fr 42px; align-items:center; gap:6px;}
          .or-mobile-calendar-head strong{text-align:center; font-size:17px; color:#0f172a;}
          .or-mobile-calendar-nav{height:40px; border:1px solid #d9e2ec; border-radius:10px; background:#fff; font-size:24px; line-height:1;}
          .or-mobile-calendar-weekdays,.or-mobile-calendar-days{display:grid; grid-template-columns:repeat(7,1fr); gap:4px;}
          .or-mobile-calendar-weekdays{margin-top:12px; color:#64748b; font-size:11px; font-weight:800; text-align:center;}
          .or-mobile-calendar-weekdays span{padding:5px 0;}
          .or-mobile-calendar-days{margin-top:4px;}
          .or-mobile-calendar-blank{aspect-ratio:1/1;}
          .or-mobile-calendar-day{aspect-ratio:1/1; min-height:38px; border:0; border-radius:10px; background:#f8fafc; color:#1f2937; font:inherit; font-weight:750;}
          .or-mobile-calendar-day.is-today{box-shadow:inset 0 0 0 1.5px #2563eb; color:#1d4ed8;}
          .or-mobile-calendar-day.is-selected{background:#1d4ed8; color:#fff; box-shadow:none;}
          .or-mobile-calendar-actions{display:grid; grid-template-columns:1fr 1fr 1.25fr; gap:7px; margin-top:14px;}
          .or-mobile-calendar-actions .btn{min-height:42px;}
          @media (min-width:761px){.or-mobile-calendar-backdrop{display:none !important;}}
        `;
        document.head.appendChild(style);
      }

      backdrop = document.createElement("div");
      backdrop.id = "orderReceiptMobileDatePicker";
      backdrop.className = "or-mobile-calendar-backdrop";
      backdrop.hidden = true;
      backdrop.innerHTML = `
        <div class="or-mobile-calendar" role="dialog" aria-modal="true" aria-label="날짜 선택">
          <div class="or-mobile-calendar-title" data-role="title">날짜 선택</div>
          <div class="or-mobile-calendar-head">
            <button type="button" class="or-mobile-calendar-nav" data-action="prev" aria-label="이전 달">‹</button>
            <strong data-role="month"></strong>
            <button type="button" class="or-mobile-calendar-nav" data-action="next" aria-label="다음 달">›</button>
          </div>
          <div class="or-mobile-calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
          <div class="or-mobile-calendar-days" data-role="days"></div>
          <div class="or-mobile-calendar-actions">
            <button type="button" class="btn" data-action="today">오늘</button>
            <button type="button" class="btn" data-action="cancel">취소</button>
            <button type="button" class="btn primary" data-action="confirm">확인</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      backdrop.addEventListener("click", (event) => {
        const action = event.target?.closest?.("[data-action]")?.dataset?.action || "";
        const dayButton = event.target?.closest?.("[data-date]");

        if (dayButton) {
          const value = String(dayButton.dataset.date || "");
          if (this.mobileDatePickerState) this.mobileDatePickerState.selectedValue = value;
          this.renderMobileDatePicker();
          return;
        }

        if (action === "prev" || action === "next") {
          const state = this.mobileDatePickerState;
          if (!state) return;
          const delta = action === "prev" ? -1 : 1;
          state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + delta, 1);
          this.renderMobileDatePicker();
          return;
        }

        if (action === "today") {
          const state = this.mobileDatePickerState;
          if (!state) return;
          const now = new Date();
          state.selectedValue = this.toDateValue(now);
          state.viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
          this.renderMobileDatePicker();
          return;
        }

        if (action === "cancel" || event.target === backdrop) {
          this.closeMobileDatePicker();
          return;
        }

        if (action === "confirm") {
          this.commitMobileDatePicker();
        }
      });

      return backdrop;
    },

    openMobileDatePicker(recordKey, field, currentValue = "", label = "날짜") {
      const isMobile = window.matchMedia?.("(max-width: 760px)")?.matches === true;
      if (!isMobile) return;

      const backdrop = this.ensureMobileDatePicker();
      const parsed = this.parseDateValue(currentValue);
      const base = parsed || new Date();
      this.mobileDatePickerState = {
        recordKey,
        field,
        label,
        currentValue: String(currentValue || "").trim(),
        selectedValue: String(currentValue || "").trim(),
        viewDate: new Date(base.getFullYear(), base.getMonth(), 1)
      };
      this.beginDateInteraction(null);
      document.body.classList.add("order-receipt-calendar-open");
      backdrop.hidden = false;
      this.renderMobileDatePicker();
      requestAnimationFrame(() => backdrop.classList.add("show"));
    },

    renderMobileDatePicker() {
      const state = this.mobileDatePickerState;
      const backdrop = document.getElementById("orderReceiptMobileDatePicker");
      if (!state || !backdrop) return;

      const view = state.viewDate instanceof Date ? state.viewDate : new Date();
      const year = view.getFullYear();
      const month = view.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const lastDate = new Date(year, month + 1, 0).getDate();
      const todayValue = this.toDateValue(new Date());

      const title = backdrop.querySelector('[data-role="title"]');
      const monthLabel = backdrop.querySelector('[data-role="month"]');
      const days = backdrop.querySelector('[data-role="days"]');
      if (title) title.textContent = `${state.label || "날짜"} 선택`;
      if (monthLabel) monthLabel.textContent = `${year}년 ${month + 1}월`;
      if (!days) return;

      const parts = [];
      for (let i = 0; i < firstDay; i += 1) parts.push('<span class="or-mobile-calendar-blank" aria-hidden="true"></span>');
      for (let day = 1; day <= lastDate; day += 1) {
        const value = this.toDateValue(new Date(year, month, day));
        const classes = ["or-mobile-calendar-day"];
        if (value === todayValue) classes.push("is-today");
        if (value === state.selectedValue) classes.push("is-selected");
        parts.push(`<button type="button" class="${classes.join(" ")}" data-date="${attr(value)}" aria-label="${year}년 ${month + 1}월 ${day}일">${day}</button>`);
      }
      days.innerHTML = parts.join("");
    },

    closeMobileDatePicker(options = {}) {
      const backdrop = document.getElementById("orderReceiptMobileDatePicker");
      if (backdrop) {
        backdrop.classList.remove("show");
        window.setTimeout(() => {
          if (!backdrop.classList.contains("show")) backdrop.hidden = true;
        }, 130);
      }
      document.body.classList.remove("order-receipt-calendar-open");
      this.mobileDatePickerState = null;
      if (options.keepInteraction !== true) this.endDateInteraction();
    },

    async commitMobileDatePicker() {
      const state = this.mobileDatePickerState;
      if (!state) return;
      const value = String(state.selectedValue || "").trim();
      if (!value) {
        APP.toast?.("날짜를 선택해 주세요.", "warn");
        return;
      }

      const recordKey = state.recordKey;
      const field = state.field;
      const currentValue = String(state.currentValue || "").trim();
      this.closeMobileDatePicker({ keepInteraction: true });

      if (value === currentValue) {
        this.endDateInteraction();
        return;
      }

      try {
        await this.setDate(recordKey, field, value);
      } finally {
        this.endDateInteraction();
      }
    },

    renderMobileCards(rows = [], operator = false) {
      const els = this.getEls();
      if (!els.mobileCards) return;

      // 날짜 저장/Realtime 새로고침으로 카드 DOM이 다시 만들어져도
      // 사용자가 펼쳐 둔 모바일 카드 상태는 유지합니다.
      const openMobileCardKeys = new Set(
        Array.from(els.mobileCards.querySelectorAll(".order-receipt-mobile-card.open"))
          .map((card) => String(card.dataset.recordKey || ""))
          .filter(Boolean)
      );

      if (!rows.length) {
        els.mobileCards.innerHTML = `<div class="order-receipt-mobile-empty">표시할 발주/입고 관리 품목이 없습니다.</div>`;
        return;
      }

      els.mobileCards.innerHTML = rows.map((row) => {
        const dateState = this.getRowDateState(row);
        const status = dateState.status;
        const selected = this.selectedKeys.has(row.recordKey);
        const gradeCapacity = [row.grade, row.capacity].filter((v) => String(v || "").trim()).join(" / ");
        const qtyText = formatNumber(row.qty) || "0";

        const renderDateCell = (label, field, value, text) => {
          if (!operator) return `<span>${escapeHtml(label)}</span><b>${escapeHtml(text)}</b>`;
          return `
            <span>${escapeHtml(label)}</span>
            <b>
              <div class="order-receipt-mobile-date-box">
                <button type="button" class="order-receipt-mobile-date-trigger ${value ? "" : "is-empty"}" data-field="${attr(field)}" data-value="${attr(value)}" data-label="${attr(label)}" aria-label="${attr(label)} 선택">${escapeHtml(value || "날짜 선택")}</button>
                ${value ? `<button type="button" class="order-date-clear order-receipt-mobile-date-clear" data-field="${attr(field)}" title="${attr(label)} 삭제" aria-label="${attr(label)} 삭제">×</button>` : ""}
              </div>
            </b>
          `;
        };

        return `
          <article class="order-receipt-mobile-card ${selected ? "selected" : ""}" data-record-key="${attr(row.recordKey)}">
            <div class="order-receipt-mobile-main" role="button" tabindex="0" aria-expanded="false">
              <div class="order-receipt-mobile-line1">
                ${operator ? `<label class="order-receipt-mobile-check" aria-label="품목 선택"><input type="checkbox" class="order-receipt-mobile-checkbox" ${selected ? "checked" : ""}/></label>` : ""}
                <strong>${escapeHtml(row.name || "-")}</strong>
                <span class="order-status ${status.className}">${escapeHtml(status.label)}</span>
              </div>
              <div class="order-receipt-mobile-line2">
                <span>${escapeHtml(row.maker || "-")}</span>
                <b>수량 ${escapeHtml(qtyText)}</b>
              </div>
            </div>
            <div class="order-receipt-mobile-detail">
              <div class="order-receipt-mobile-spec">
                <span>구분</span><b>${escapeHtml(row.category || "-")}</b>
                <span>제품코드</span><b>${escapeHtml(row.code || "-")}</b>
                <span>CAS</span><b>${this.renderCasLines(row.cas)}</b>
                <span>등급/규격</span><b>${escapeHtml(gradeCapacity || "-")}</b>
                <span>용도</span><b>${escapeHtml(row.usage || "-")}</b>
                ${renderDateCell("발주일자", "order_date", dateState.orderDateValue, dateState.orderDateText)}
                ${renderDateCell("입고일자", "receipt_date", dateState.receiptDateValue, dateState.receiptDateText)}
              </div>
            </div>
          </article>
        `;
      }).join("");

      this.bindMobileCardEvents();

      if (openMobileCardKeys.size) {
        els.mobileCards.querySelectorAll(".order-receipt-mobile-card").forEach((card) => {
          const key = String(card.dataset.recordKey || "");
          if (!openMobileCardKeys.has(key)) return;
          card.classList.add("open");
          card.querySelector(".order-receipt-mobile-main")?.setAttribute("aria-expanded", "true");
        });
      }
    },

    render() {
      const els = this.getEls();
      if (!els.body) return;

      this.initMonthOptions();
      const rows = this.getDisplayRows();
      const operator = isOperator();
      const totalAmount = rows.reduce((sum, row) => sum + toNumber(row.purchaseAmount), 0);
      const unreceivedCount = rows.filter((row) => !String(row.receipt_date || "").trim()).length;

      if (els.count) els.count.textContent = `${rows.length}건`;
      if (els.unreceived) els.unreceived.textContent = `${unreceivedCount}건`;
      if (els.amount) els.amount.textContent = formatNumber(totalAmount) || "0";
      if (els.selected) els.selected.textContent = `${this.selectedKeys.size}건`;
      if (els.readonlyNotice) els.readonlyNotice.hidden = operator;
      if (els.clearOrderDate) els.clearOrderDate.disabled = !operator || this.selectedKeys.size === 0;
      if (els.clearReceiptDate) els.clearReceiptDate.disabled = !operator || this.selectedKeys.size === 0;
      if (els.desc) {
        els.desc.textContent = this.showUnreceived
          ? "입고일자가 비어 있는 전체 미입고 품목을 표시합니다."
          : "선택한 주문월의 취합정리 확정자료 기준으로 발주/입고 일자를 관리합니다.";
      }

      if (!rows.length) {
        els.body.innerHTML = `<tr><td class="empty" colspan="14">표시할 발주/입고 관리 품목이 없습니다.</td></tr>`;
        this.renderMobileCards([], operator);
        return;
      }

      els.body.innerHTML = rows.map((row) => {
        const dateState = this.getRowDateState(row);
        const statusInfo = dateState.status;
        const disabled = operator ? "" : "disabled";
        const selected = this.selectedKeys.has(row.recordKey);
        return `
          <tr class="order-receipt-row ${selected ? "selected" : ""}" data-record-key="${attr(row.recordKey)}">
            <td class="txt"><input type="checkbox" class="order-receipt-check" ${selected ? "checked" : ""} ${operator ? "" : "disabled"} /></td>
            <td class="txt"><span class="order-status ${statusInfo.className}">${escapeHtml(statusInfo.label)}</span></td>
            <td class="txt order-product-name">${escapeHtml(row.name)}</td>
            <td class="txt">${escapeHtml(row.maker)}</td>
            <td class="txt">${escapeHtml(row.code)}</td>
            <td class="txt">${this.renderCasLines(row.cas)}</td>
            <td class="txt">${escapeHtml(row.grade)}</td>
            <td class="txt">${escapeHtml(row.capacity)}</td>
            <td class="num">${formatNumber(row.qty)}</td>
            <td class="num">${formatNumber(row.purchaseUnit)}</td>
            <td class="num">${formatNumber(row.purchaseAmount)}</td>
            <td class="txt">${escapeHtml(row.purchaseVendor)}</td>
            <td class="txt">
              <div class="order-date-box">
                <input class="order-receipt-date" data-field="order_date" type="date" value="${attr(dateState.orderDateValue)}" ${disabled}/>
                ${operator && dateState.orderDateValue ? `<button type="button" class="order-date-clear" data-field="order_date" title="발주일자 삭제" aria-label="발주일자 삭제">×</button>` : ""}
              </div>
            </td>
            <td class="txt">
              <div class="order-date-box">
                <input class="order-receipt-date" data-field="receipt_date" type="date" value="${attr(dateState.receiptDateValue)}" ${disabled}/>
                ${operator && dateState.receiptDateValue ? `<button type="button" class="order-date-clear" data-field="receipt_date" title="입고일자 삭제" aria-label="입고일자 삭제">×</button>` : ""}
              </div>
            </td>
          </tr>
        `;
      }).join("");

      this.renderMobileCards(rows, operator);
      this.bindRowEvents();
      this.updateSelectionUI();
    },

    bindDateInput(recordKey, input) {
      if (!recordKey || !input || input.dataset.orderReceiptBound === "1") return;
      input.dataset.orderReceiptBound = "1";
      input.dataset.orderReceiptCommittedValue = String(input.value || "").trim();

      // 네이티브 type=date가 직접 picker를 열도록 두고 showPicker()는 호출하지 않습니다.
      // 날짜 선택이 시작되면 자동/Realtime/visibility 새로고침을 잠급니다.
      const begin = (e) => {
        e.stopPropagation();
        this.beginDateInteraction(input);
      };

      input.addEventListener("pointerdown", begin);
      input.addEventListener("touchstart", begin, { passive: true });
      input.addEventListener("focus", begin);
      input.addEventListener("click", (e) => e.stopPropagation());

      input.addEventListener("change", async (e) => {
        e.stopPropagation();

        const nextValue = String(input.value || "").trim();
        const committedValue = String(input.dataset.orderReceiptCommittedValue || "").trim();
        // 달력을 열고 닫기만 했거나 같은 날짜를 다시 선택한 경우 저장하지 않습니다.
        if (nextValue === committedValue) {
          this.endDateInteraction();
          return;
        }

        input.dataset.orderReceiptCommittedValue = nextValue;
        try {
          await this.setDate(recordKey, input.dataset.field, nextValue);
        } finally {
          this.endDateInteraction();
        }
      });

      // 취소로 change가 발생하지 않은 경우에는 다음 화면 터치에서 보호가 해제됩니다.
      // blur만으로 즉시 해제하지 않는 이유는 일부 모바일에서 picker가 열릴 때
      // input이 먼저 blur되어 refresh가 다시 picker를 닫는 문제가 있기 때문입니다.
    },

    bindMobileCardEvents() {
      const operator = isOperator();
      document.querySelectorAll(".order-receipt-mobile-card").forEach((card) => {
        const key = card.dataset.recordKey || "";
        const main = card.querySelector(".order-receipt-mobile-main");
        const checkbox = card.querySelector(".order-receipt-mobile-checkbox");

        checkbox?.addEventListener("click", (e) => e.stopPropagation());
        checkbox?.addEventListener("change", (e) => {
          this.setRowSelected(key, e.target.checked);
          this.updateSelectionUI();
        });

        const toggle = () => {
          const opened = card.classList.toggle("open");
          if (main) main.setAttribute("aria-expanded", opened ? "true" : "false");
        };

        main?.addEventListener("click", (e) => {
          if (e.target?.closest?.("input,button,label,select,textarea")) return;
          toggle();
        });
        main?.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          toggle();
        });

        if (operator) {
          card.querySelectorAll(".order-receipt-mobile-date-clear").forEach((button) => {
            button.addEventListener("click", async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await this.clearDate(key, button.dataset.field);
            });
          });
          card.querySelectorAll(".order-receipt-mobile-date-trigger").forEach((button) => {
            button.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.openMobileDatePicker(
                key,
                button.dataset.field,
                button.dataset.value || "",
                button.dataset.label || "날짜"
              );
            });
          });
        }
      });
    },

    bindRowEvents() {
      const operator = isOperator();
      document.querySelectorAll(".order-receipt-row").forEach((tr) => {
        const key = tr.dataset.recordKey || "";
        const checkbox = tr.querySelector(".order-receipt-check");
        checkbox?.addEventListener("change", (e) => {
          this.setRowSelected(key, e.target.checked);
          this.updateSelectionUI();
        });

        if (operator) {
          tr.addEventListener("mousedown", (e) => {
            if (e.target?.classList?.contains("order-receipt-date")) return;
            const next = !this.selectedKeys.has(key);
            this.beginDrag(key, next);
          });
          tr.addEventListener("mouseenter", () => this.dragOver(key));
          tr.addEventListener("touchstart", () => {
            const next = !this.selectedKeys.has(key);
            this.beginDrag(key, next);
          }, { passive: true });
          tr.addEventListener("touchmove", () => this.dragOver(key), { passive: true });
        }

        tr.querySelectorAll(".order-date-clear").forEach((button) => {
          button.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.clearDate(key, button.dataset.field);
          });
        });

        tr.querySelectorAll(".order-receipt-date").forEach((input) => this.bindDateInput(key, input));
      });
    }
  };
})();
