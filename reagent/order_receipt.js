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

    makeRowKey(row) {
      return this.makeRecordKey(row.order_month, row.key || row.item_key);
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
        desc: document.getElementById("orderReceiptDesc"),
        readonlyNotice: document.getElementById("orderReceiptReadonlyNotice")
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

    getDisplayRows() {
      const month = this.getCurrentMonth();
      const baseRows = this.showUnreceived ? this.getAllKnownRows() : this.getRowsForMonth(month);

      return baseRows.map((row) => {
        const recordKey = this.makeRowKey(row);
        const record = this.records[recordKey] || {};
        return {
          ...row,
          recordKey,
          order_date: record.order_date || "",
          receipt_date: record.receipt_date || ""
        };
      }).filter((row) => {
        if (!this.showUnreceived) return true;
        return !String(row.receipt_date || "").trim();
      });
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
      if (els.selected) els.selected.textContent = `${this.selectedKeys.size}건`;
    },

    getApplyKeys(fallbackKey) {
      const selected = this.getSelectedKeys();
      if (selected.length > 1) return selected;
      if (selected.length === 1 && selected[0] !== fallbackKey) return selected;
      return fallbackKey ? [fallbackKey] : selected;
    },

    async setDate(recordKey, field, value) {
      const keys = this.getApplyKeys(recordKey);
      if (!keys.length) return;
      keys.forEach((key) => {
        this.records[key] = this.records[key] || {};
        const [order_month, item_key] = key.split("__");
        this.records[key].order_month = this.records[key].order_month || order_month || "";
        this.records[key].item_key = this.records[key].item_key || item_key || "";
        this.records[key][field] = value || "";
      });
      this.saveLocalRecords();
      this.render();
      await this.saveRemote(keys);
    },

    getRowByRecordKey(key) {
      return this.getAllKnownRows().find((row) => this.makeRowKey(row) === key) || null;
    },

    async saveRemote(keys) {
      const sb = APP.sb;
      if (!sb || this.remoteFailed || !this.remoteEnabled) return;

      const payloads = keys.map((key) => {
        const rec = this.records[key] || {};
        const row = this.getRowByRecordKey(key) || {};
        const [order_month, item_key] = key.split("__");
        return APP.withCompanyPayload ? APP.withCompanyPayload({
          order_month: rec.order_month || order_month || row.order_month || "",
          item_key: rec.item_key || item_key || row.key || "",
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
      if (els.desc) {
        els.desc.textContent = this.showUnreceived
          ? "입고일자가 비어 있는 전체 미입고 품목을 표시합니다."
          : "선택한 주문월의 취합정리 확정자료 기준으로 발주/입고 일자를 관리합니다.";
      }

      if (!rows.length) {
        els.body.innerHTML = `<tr><td class="empty" colspan="14">표시할 발주/입고 관리 품목이 없습니다.</td></tr>`;
        return;
      }

      els.body.innerHTML = rows.map((row) => {
        const status = row.receipt_date ? "입고완료" : (row.order_date ? "발주완료" : "발주전");
        const statusClass = row.receipt_date ? "done" : (row.order_date ? "ordered" : "waiting");
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
            <td class="txt"><input class="order-receipt-date" data-field="order_date" type="date" value="${attr(row.order_date)}" ${disabled}/></td>
            <td class="txt"><input class="order-receipt-date" data-field="receipt_date" type="date" value="${attr(row.receipt_date)}" ${disabled}/></td>
          </tr>
        `;
      }).join("");

      this.bindRowEvents();
      this.updateSelectionUI();
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
