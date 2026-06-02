(function () {
  "use strict";

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

  APP.orderReceipt = {
    rows: [],
    remoteEnabled: true,
    remoteFailed: false,
    records: {},
    selectedKeys: new Set(),
    dragSelecting: false,
    dragMode: "add",
    showUnreceived: false,
    initialized: false,

    get tableName() {
      return APP.ORDER_RECEIPT_TABLE || "reagent_order_receipts";
    },

    getStorageKey() {
      const companyId = APP.getCompanyId?.() || "default";
      return `reagent_order_receipts_${companyId}`;
    },

    loadLocalRecords() {
      try {
        this.records = JSON.parse(localStorage.getItem(this.getStorageKey()) || "{}");
      } catch (_) {
        this.records = {};
      }
      if (!this.records || typeof this.records !== "object") this.records = {};
      return this.records;
    },

    saveLocalRecords() {
      try {
        localStorage.setItem(this.getStorageKey(), JSON.stringify(this.records || {}));
      } catch (_) {}
    },

    async loadRemoteRecords() {
      this.loadLocalRecords();
      const sb = APP.sb;
      if (!sb || this.remoteFailed || !this.remoteEnabled) return;

      try {
        let query = sb.from(this.tableName).select("*");
        query = APP.scopedCompanyQuery ? APP.scopedCompanyQuery(query) : query;
        const { data, error } = await query;
        if (error) throw error;
        (Array.isArray(data) ? data : []).forEach((row) => {
          const key = this.makeRecordKey(row.order_month, row.item_key || row.collect_item_key || row.product_key);
          if (!key) return;
          this.records[key] = {
            ...(this.records[key] || {}),
            id: row.id || this.records[key]?.id,
            order_month: row.order_month || this.records[key]?.order_month,
            item_key: row.item_key || row.collect_item_key || row.product_key || this.records[key]?.item_key,
            order_date: row.order_date || "",
            receipt_date: row.receipt_date || ""
          };
        });
        this.saveLocalRecords();
      } catch (error) {
        this.remoteFailed = true;
        console.warn("발주/입고 원격 저장 테이블 조회를 건너뜁니다. 로컬 저장으로 동작합니다:", error);
      }
    },

    makeRecordKey(month, itemKey) {
      const m = normalizeMonth(month);
      const k = String(itemKey || "").trim();
      return k ? `${m}__${k}` : "";
    },

    getRowKeyCandidates(row = {}) {
      const month = row.order_month || this.getCurrentMonth();
      const rawKeys = [
        row.item_key,
        row.key,
        row.collect_item_key,
        row.product_key,
        row.prepare_key,
        row.productKey,
        row.collectItemKey
      ];

      const candidates = [];
      rawKeys.forEach((value) => {
        const key = this.makeRecordKey(month, value);
        if (key && !candidates.includes(key)) candidates.push(key);
      });

      // 과거 버전에서 제품코드 기반 키가 만들어졌을 가능성까지 보정합니다.
      const codeKey = this.makeRecordKey(month, row.code);
      if (codeKey && !candidates.includes(codeKey)) candidates.push(codeKey);

      return candidates;
    },

    makeRowKey(row) {
      const candidates = this.getRowKeyCandidates(row);
      return candidates[0] || "";
    },

    getRecordStateForRow(row = {}) {
      const candidates = this.getRowKeyCandidates(row);
      let recordKey = row.recordKey || candidates[0] || "";

      for (const key of candidates) {
        if (this.records[key]) {
          recordKey = key;
          break;
        }
      }

      // 키가 서로 다른 이전 저장값까지 보정합니다.
      // 같은 주문월에서 item_key / 제품코드 / 품명+제조사 조합이 맞으면 해당 기록을 사용합니다.
      if (!this.records[recordKey]) {
        const month = normalizeMonth(row.order_month || this.getCurrentMonth());
        const rowKeys = new Set(candidates.map((key) => String(key).split("__")[1]).filter(Boolean));
        const rowCode = String(row.code || "").trim();
        const rowName = String(row.name || "").trim();
        const rowMaker = String(row.maker || "").trim();

        Object.entries(this.records || {}).some(([key, rec]) => {
          const [recMonth, recItemKey] = String(key).split("__");
          if (normalizeMonth(recMonth) !== month) return false;

          const recKeys = [
            recItemKey,
            rec?.item_key,
            rec?.collect_item_key,
            rec?.product_key,
            rec?.product_code,
            rec?.code
          ].map((value) => String(value || "").trim()).filter(Boolean);

          if (recKeys.some((value) => rowKeys.has(value) || value === rowCode)) {
            recordKey = key;
            return true;
          }

          const recName = String(rec?.product_name || rec?.name || "").trim();
          const recMaker = String(rec?.maker || "").trim();
          if (rowName && recName && rowName === recName && (!rowMaker || !recMaker || rowMaker === recMaker)) {
            recordKey = key;
            return true;
          }

          return false;
        });
      }

      const record = this.records[recordKey] || {};
      const orderDate = String(record.order_date || row.order_date || "").trim();
      const receiptDate = String(record.receipt_date || row.receipt_date || "").trim();

      return {
        recordKey,
        record,
        order_date: orderDate,
        receipt_date: receiptDate
      };
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

    getAvailableMonths() {
      const request = APP.request;
      const months = new Set();
      months.add(todayMonth());

      try {
        if (request?.getCurrentOrderMonth) months.add(request.getCurrentOrderMonth());
      } catch (_) {}

      try {
        (request?.requestRows || []).forEach((row) => {
          if (row.order_month) months.add(row.order_month);
        });
      } catch (_) {}

      Object.keys(this.records || {}).forEach((key) => {
        const month = key.split("__")[0];
        if (/^\d{4}-\d{2}$/.test(month)) months.add(month);
      });

      return Array.from(months).filter(Boolean).sort();
    },

    setCurrentMonth(month) {
      const request = APP.request;
      const next = normalizeMonth(month);
      if (request?.setCurrentOrderMonth) request.setCurrentOrderMonth(next);
      else {
        try { localStorage.setItem("reagent_order_month", next); } catch (_) {}
      }
    },

    getCurrentMonth() {
      const els = this.getEls();
      const requestMonth = APP.request?.getCurrentOrderMonth?.();
      return normalizeMonth(els.month?.value || requestMonth || todayMonth());
    },

    getRowsForMonth(month) {
      const request = APP.request;
      const collect = APP.collect;
      if (!request || !collect?.getConfirmedPrepareRows) return [];

      const prev = request.getCurrentOrderMonth ? request.getCurrentOrderMonth() : "";
      const target = normalizeMonth(month);
      try {
        if (request.setCurrentOrderMonth) request.setCurrentOrderMonth(target);
        const rows = collect.getConfirmedPrepareRows() || [];
        return rows.map((row) => ({ ...row, order_month: row.order_month || target }));
      } finally {
        try {
          if (prev && request.setCurrentOrderMonth) request.setCurrentOrderMonth(prev);
        } catch (_) {}
      }
    },

    getAllKnownRows() {
      const months = this.getAvailableMonths();
      const map = new Map();
      months.forEach((month) => {
        this.getRowsForMonth(month).forEach((row) => {
          const key = this.makeRowKey(row);
          if (key) map.set(key, row);
        });
      });
      return Array.from(map.values());
    },

    sortOrderReceiptRows(rows) {
      const categoryOrder = { "시약": 1, "초자": 2, "초자/소모품": 2, "안전용품": 3 };
      const sortedRows = Array.isArray(rows) ? [...rows] : [];

      // 취합정리(sortPrepareRows)와 같은 흐름으로 정렬합니다.
      // 컬럼은 추가하지 않고, 화면에 표시되는 행 순서만 맞춥니다.
      // 정렬 기준: 구분 → 대표 거래처 → 일반 비교견적 → 기타 거래처 → 온라인 구매 → 거래처 → 용도 → 품명 → 비고
      const getSortInfo = (row = {}) => {
        const category = String(row.category || "");
        const remark = String(row.remark || "").trim();
        const vendor = String(row.purchaseVendor || "").trim();

        return {
          category,
          categoryOrder: categoryOrder[category] || 99,
          remark,
          vendor,
          isOnline: remark === "온라인 구매",
          isGeneral: !vendor && remark !== "온라인 구매"
        };
      };

      const firstVendorByBucket = {};
      sortedRows.forEach((row) => {
        const info = getSortInfo(row);
        if (info.isOnline || info.isGeneral || !info.vendor) return;

        const bucketKey = String(info.category || "");
        if (!firstVendorByBucket[bucketKey]) {
          firstVendorByBucket[bucketKey] = info.vendor;
        }
      });

      const getBlockOrder = (row = {}) => {
        const info = getSortInfo(row);
        if (info.isOnline) return 9;
        if (info.isGeneral) return 2;

        const firstVendor = firstVendorByBucket[String(info.category || "")] || "";
        if (info.vendor && info.vendor === firstVendor) return 1;
        if (info.vendor) return 3;
        return 2;
      };

      return sortedRows.sort((a, b) => {
        const aInfo = getSortInfo(a);
        const bInfo = getSortInfo(b);

        if (aInfo.categoryOrder !== bInfo.categoryOrder) {
          return aInfo.categoryOrder - bInfo.categoryOrder;
        }

        const aBlockOrder = getBlockOrder(a);
        const bBlockOrder = getBlockOrder(b);
        if (aBlockOrder !== bBlockOrder) {
          return aBlockOrder - bBlockOrder;
        }

        const vendorCompare = aInfo.vendor.localeCompare(bInfo.vendor, "ko");
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
      const baseRows = this.showUnreceived ? this.getAllKnownRows() : this.getRowsForMonth(month);

      const rows = baseRows.map((row) => {
        const state = this.getRecordStateForRow(row);
        return {
          ...row,
          recordKey: state.recordKey,
          order_date: state.order_date,
          receipt_date: state.receipt_date
        };
      }).filter((row) => {
        if (!this.showUnreceived) return true;
        return !String(row.receipt_date || "").trim();
      });

      return this.sortOrderReceiptRows(rows);
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

    async init() {
      if (this.initialized) {
        await this.refresh();
        return;
      }
      this.initialized = true;
      this.loadLocalRecords();
      await this.loadRemoteRecords();
      this.bindEvents();
      await this.refresh();
    },

    bindEvents() {
      const els = this.getEls();
      els.month?.addEventListener("change", () => {
        this.showUnreceived = false;
        this.setCurrentMonth(els.month.value);
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
        await this.refresh();
        APP.toast?.("발주/입고 목록을 새로고침했습니다.", "success");
      });

      els.clearOrderDate?.addEventListener("click", async () => {
        await this.clearSelectedDate("order_date");
      });

      els.clearReceiptDate?.addEventListener("click", async () => {
        await this.clearSelectedDate("receipt_date");
      });

      document.addEventListener("mouseup", () => {
        this.dragSelecting = false;
      });
      document.addEventListener("touchend", () => {
        this.dragSelecting = false;
      });
    },

    async refresh() {
      this.loadLocalRecords();
      await this.loadRemoteRecords();
      this.initMonthOptions();
      this.render();
    },

    getSelectedKeys() {
      return Array.from(this.selectedKeys || []);
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
      document.querySelectorAll(".order-receipt-row").forEach((tr) => {
        const key = tr.dataset.recordKey || "";
        const selected = this.selectedKeys.has(key);
        tr.classList.toggle("selected", selected);
        const checkbox = tr.querySelector(".order-receipt-check");
        if (checkbox) checkbox.checked = selected;
      });
      document.querySelectorAll(".order-receipt-mobile-card").forEach((card) => {
        const key = card.dataset.recordKey || "";
        const selected = this.selectedKeys.has(key);
        card.classList.toggle("selected", selected);
        const checkbox = card.querySelector(".order-receipt-mobile-checkbox");
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

    async setDateForKeys(keys, field, value) {
      const targetKeys = Array.isArray(keys) ? keys.filter(Boolean) : [];
      if (!targetKeys.length || !field) return;
      targetKeys.forEach((key) => {
        this.records[key] = this.records[key] || {};
        const [order_month, item_key] = key.split("__");
        this.records[key].order_month = this.records[key].order_month || order_month || "";
        this.records[key].item_key = this.records[key].item_key || item_key || "";
        this.records[key][field] = value || "";
      });
      this.saveLocalRecords();
      this.render();
      await this.saveRemote(targetKeys);
    },

    async setDate(recordKey, field, value) {
      const keys = this.getApplyKeys(recordKey);
      await this.setDateForKeys(keys, field, value);
    },

    async clearDate(recordKey, field) {
      if (!recordKey || !field) return;
      await this.setDateForKeys([recordKey], field, "");
      APP.toast?.(field === "order_date" ? "발주일자를 삭제했습니다." : "입고일자를 삭제했습니다.", "success");
    },

    async clearSelectedDate(field) {
      const keys = this.getSelectedKeys();
      if (!keys.length) {
        APP.toast?.("먼저 날짜를 삭제할 품목을 선택해 주세요.", "warn");
        return;
      }
      await this.setDateForKeys(keys, field, "");
      APP.toast?.(`${keys.length}건의 ${field === "order_date" ? "발주일자" : "입고일자"}를 삭제했습니다.`, "success");
    },

    getRowByRecordKey(key) {
      return this.getAllKnownRows().find((row) => {
        if (this.makeRowKey(row) === key) return true;
        return this.getRowKeyCandidates(row).includes(key);
      }) || null;
    },

    async saveRemote(keys) {
      const sb = APP.sb;
      if (!sb || this.remoteFailed || !this.remoteEnabled) return;

      const payloads = keys.map((key) => {
        const rec = this.records[key] || {};
        const row = this.getRowByRecordKey(key) || {};
        const [order_month, item_key] = key.split("__");
        const canonicalItemKey = rec.item_key || row.item_key || row.key || item_key || "";
        return APP.withCompanyPayload ? APP.withCompanyPayload({
          order_month: rec.order_month || order_month || row.order_month || "",
          item_key: canonicalItemKey,
          product_name: row.name || "",
          maker: row.maker || "",
          grade: row.grade || "",
          product_code: row.code || "",
          capacity: row.capacity || "",
          cas: row.cas || "",
          quantity: toNumber(row.qty),
          purchase_unit_price: toNumber(row.purchaseUnit),
          purchase_amount: toNumber(row.purchaseAmount),
          purchase_vendor: row.purchaseVendor || "",
          order_date: rec.order_date || null,
          receipt_date: rec.receipt_date || null,
          updated_at: new Date().toISOString()
        }) : {};
      }).filter((row) => row.order_month && row.item_key);

      if (!payloads.length) return;

      try {
        const { error } = await sb
          .from(this.tableName)
          .upsert(payloads, { onConflict: "company_id,order_month,item_key" });
        if (error) throw error;
      } catch (error) {
        this.remoteFailed = true;
        console.warn("발주/입고 원격 저장 실패. 로컬 저장은 유지됩니다:", error);
      }
    },

    getOrderStatus(row = {}) {
      if (String(row.receipt_date || "").trim()) {
        return { label: "입고완료", className: "done" };
      }
      if (String(row.order_date || "").trim()) {
        return { label: "발주완료", className: "ordered" };
      }
      return { label: "발주전", className: "waiting" };
    },

    getFirstValue(row = {}, keys = []) {
      for (const key of keys) {
        const value = row?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") return value;
      }
      return "";
    },

    formatDateText(value) {
      const raw = String(value || "").trim();
      if (!raw) return "-";
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
      return raw;
    },

    getRowDateState(row = {}) {
      const state = this.getRecordStateForRow(row);
      const orderDate = state.order_date;
      const receiptDate = state.receipt_date;
      const orderDateText = this.formatDateText(orderDate);
      const receiptDateText = this.formatDateText(receiptDate);

      return {
        recordKey: state.recordKey,
        orderDate,
        receiptDate,
        orderDateText,
        receiptDateText,
        orderDateValue: orderDateText === "-" ? "" : orderDateText,
        receiptDateValue: receiptDateText === "-" ? "" : receiptDateText,
        status: this.getOrderStatus({
          ...row,
          order_date: orderDate,
          receipt_date: receiptDate
        })
      };
    },

    renderMobileCards(rows = [], operator = false) {
      const els = this.getEls();
      if (!els.mobileCards) return;

      if (!rows.length) {
        els.mobileCards.innerHTML = `<div class="order-receipt-mobile-empty">표시할 발주/입고 관리 품목이 없습니다.</div>`;
        return;
      }

      els.mobileCards.innerHTML = rows.map((row) => {
        const dateState = this.getRowDateState(row);
        const status = dateState.status;
        const selected = this.selectedKeys.has(dateState.recordKey);
        const gradeCapacity = [row.grade, row.capacity].filter((v) => String(v || "").trim()).join(" / ");
        const qtyText = formatNumber(row.qty) || "0";
        const orderDateText = dateState.orderDateText;
        const receiptDateText = dateState.receiptDateText;
        const orderDateValue = dateState.orderDateValue;
        const receiptDateValue = dateState.receiptDateValue;

        const renderDateCell = (label, field, value, text) => {
          if (!operator) {
            return `<span>${escapeHtml(label)}</span><b>${escapeHtml(text)}</b>`;
          }

          return `
            <span>${escapeHtml(label)}</span>
            <b>
              <div class="order-receipt-mobile-date-box">
                <input class="order-receipt-date order-receipt-mobile-date" data-field="${attr(field)}" type="date" value="${attr(value)}" aria-label="${attr(label)}"/>
                ${value ? `<button type="button" class="order-date-clear order-receipt-mobile-date-clear" data-field="${attr(field)}" title="${attr(label)} 삭제" aria-label="${attr(label)} 삭제">×</button>` : ""}
              </div>
            </b>
          `;
        };

        return `
          <article class="order-receipt-mobile-card ${selected ? "selected" : ""}" data-record-key="${attr(dateState.recordKey)}">
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
                <span>CAS</span><b>${escapeHtml(row.cas || "-")}</b>
                <span>등급/규격</span><b>${escapeHtml(gradeCapacity || "-")}</b>
                <span>용도</span><b>${escapeHtml(row.usage || "-")}</b>
                ${renderDateCell("발주일자", "order_date", orderDateValue, orderDateText)}
                ${renderDateCell("입고일자", "receipt_date", receiptDateValue, receiptDateText)}
              </div>
            </div>
          </article>
        `;
      }).join("");

      this.bindMobileCardEvents();
    },

    render() {
      const els = this.getEls();
      if (!els.body) return;

      this.initMonthOptions();
      const rows = this.getDisplayRows();
      const operator = isOperator();
      const totalAmount = rows.reduce((sum, row) => sum + toNumber(row.purchaseAmount), 0);
      const unreceivedCount = rows.filter((row) => !this.getRowDateState(row).receiptDate).length;

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
        const status = statusInfo.label;
        const statusClass = statusInfo.className;
        const disabled = operator ? "" : "disabled";
        const selected = this.selectedKeys.has(row.recordKey);
        return `
          <tr class="order-receipt-row ${selected ? "selected" : ""}" data-record-key="${attr(row.recordKey)}">
            <td class="txt"><input type="checkbox" class="order-receipt-check" ${selected ? "checked" : ""} ${operator ? "" : "disabled"} /></td>
            <td class="txt"><span class="order-status ${statusClass}">${escapeHtml(status)}</span></td>
            <td class="txt order-product-name">${escapeHtml(row.name)}</td>
            <td class="txt">${escapeHtml(row.maker)}</td>
            <td class="txt">${escapeHtml(row.grade)}</td>
            <td class="txt">${escapeHtml(row.code)}</td>
            <td class="txt">${escapeHtml(row.capacity)}</td>
            <td class="txt">${escapeHtml(row.cas)}</td>
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

          card.querySelectorAll(".order-receipt-mobile-date").forEach((input) => {
            input.addEventListener("click", (e) => {
              e.stopPropagation();
              try { input.showPicker?.(); } catch (_) {}
            });
            input.addEventListener("focus", (e) => {
              e.stopPropagation();
              try { input.showPicker?.(); } catch (_) {}
            });
            input.addEventListener("change", async (e) => {
              e.stopPropagation();
              await this.setDate(key, e.target.dataset.field, e.target.value || "");
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

        tr.querySelectorAll(".order-receipt-date").forEach((input) => {
          input.addEventListener("focus", () => {
            try { input.showPicker?.(); } catch (_) {}
          });
          input.addEventListener("click", () => {
            try { input.showPicker?.(); } catch (_) {}
          });
          input.addEventListener("change", async (e) => {
            await this.setDate(key, e.target.dataset.field, e.target.value || "");
          });
        });
      });
    }
  };
})();
