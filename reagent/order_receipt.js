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
    remoteFailed: false,
    remoteEnabled: true,

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

    async loadRowsFromServer() {
      const sb = APP.sb;
      if (!sb || this.remoteFailed || !this.remoteEnabled) return [];

      try {
        let query = sb.from(this.tableName).select("*");
        query = APP.scopedCompanyQuery ? APP.scopedCompanyQuery(query) : query;
        const { data, error } = await query;
        if (error) throw error;
        return (Array.isArray(data) ? data : [])
          .map((row) => this.normalizeServerRow(row))
          .filter((row) => row.item_key || row.id);
      } catch (error) {
        this.remoteFailed = true;
        console.warn("발주/입고 목록 서버 조회 실패:", error);
        APP.toast?.(`발주/입고 목록 조회 실패: ${error.message || "Supabase 연결을 확인하세요."}`, "warn");
        return [];
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
        await this.refresh();
        APP.toast?.("발주/입고 목록을 새로고침했습니다.", "success");
      });

      els.clearOrderDate?.addEventListener("click", async () => this.clearSelectedDate("order_date"));
      els.clearReceiptDate?.addEventListener("click", async () => this.clearSelectedDate("receipt_date"));

      document.addEventListener("mouseup", () => { this.dragSelecting = false; });
      document.addEventListener("touchend", () => { this.dragSelecting = false; });
    },

    async refresh() {
      await this.loadRemoteRecords();
      this.initMonthOptions();
      this.render();
    },

    getSelectedKeys() {
      return Array.from(this.selectedKeys || []);
    },

    findRowByKey(key) {
      return (this.rows || []).find((row) => row.recordKey === key) || null;
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
      this.rows = (this.rows || []).map((row) => keySet.has(row.recordKey) ? { ...row, [field]: value || "" } : row);
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

      try {
        await this.saveDateToServer(targetKeys, field, value);
        APP.toast?.(field === "order_date" ? "발주일자를 저장했습니다." : "입고일자를 저장했습니다.", "success");
      } catch (error) {
        console.warn("발주/입고일자 서버 저장 실패:", error);
        APP.toast?.(`발주/입고일자 서버 저장 실패: ${error.message || "Supabase 권한/컬럼을 확인하세요."}`, "warn");
        await this.refresh();
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
        const selected = this.selectedKeys.has(row.recordKey);
        const gradeCapacity = [row.grade, row.capacity].filter((v) => String(v || "").trim()).join(" / ");
        const qtyText = formatNumber(row.qty) || "0";

        const renderDateCell = (label, field, value, text) => {
          if (!operator) return `<span>${escapeHtml(label)}</span><b>${escapeHtml(text)}</b>`;
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
                <span>CAS</span><b>${escapeHtml(row.cas || "-")}</b>
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

    bindDateInput(recordKey, input) {
      if (!recordKey || !input || input.dataset.orderReceiptBound === "1") return;
      input.dataset.orderReceiptBound = "1";

      input.addEventListener("focus", () => { try { input.showPicker?.(); } catch (_) {} });
      input.addEventListener("click", () => { try { input.showPicker?.(); } catch (_) {} });
      input.addEventListener("change", async (e) => {
        e.stopPropagation();
        await this.setDate(recordKey, input.dataset.field, input.value || "", { single: true });
      });
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
          card.querySelectorAll(".order-receipt-mobile-date").forEach((input) => this.bindDateInput(key, input));
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
