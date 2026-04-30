window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.collect = {
  selectedKeys: [],
  collectMeta: {},

  saveCollectMeta() {
    try {
      localStorage.setItem("reagent_collect_meta", JSON.stringify(this.collectMeta || {}));
    } catch (_) {}
  },

  loadCollectMeta() {
    try {
      this.collectMeta = JSON.parse(localStorage.getItem("reagent_collect_meta") || "{}");
    } catch (_) {
      this.collectMeta = {};
    }
  },

  saveSelectedKeys() {
    try {
      localStorage.setItem("reagent_collect_selected_keys", JSON.stringify(this.selectedKeys || []));
    } catch (_) {}
  },

  loadSelectedKeys() {
    try {
      this.selectedKeys = JSON.parse(localStorage.getItem("reagent_collect_selected_keys") || "[]");
    } catch (_) {
      this.selectedKeys = [];
    }
  },

  getCurrentUserName() {
    const user = window.ReagentApp.currentUser || {};
    return user.name || user.user_name || user.userName || user.employee_no || user.employeeNo || "";
  },

  getOrderMonthFromKey(key) {
    const first = String(key || "").split("||")[0];
    return first || window.ReagentApp.request?.getCurrentOrderMonth?.() || "";
  },

  async upsertCollectItem(key, collectedQty, extra = {}) {
    const sb = window.ReagentApp.sb;
    if (!sb) throw new Error("Supabase 연결 정보가 없습니다.");

    const row = {
      item_key: key,
      order_month: this.getOrderMonthFromKey(key),
      collected_qty: Number(collectedQty || 0),
      updated_by: this.getCurrentUserName(),
      ...extra
    };

    const { error } = await sb
      .from("reagent_collect_items")
      .upsert(row, { onConflict: "item_key,order_month" });

    if (error) throw error;
  },

  async deleteCollectItem(key) {
    const sb = window.ReagentApp.sb;
    if (!sb) throw new Error("Supabase 연결 정보가 없습니다.");

    const { error } = await sb
      .from("reagent_collect_items")
      .delete()
      .eq("item_key", key)
      .eq("order_month", this.getOrderMonthFromKey(key));

    if (error) throw error;
  },

  getMeta(key) {
    if (!this.collectMeta[key]) {
      this.collectMeta[key] = {
        vendor1: "",
        unit1: "",
        price1: "",
        price1Manual: false,
        vendor2: "",
        unit2: "",
        price2: "",
        price2Manual: false,
        selectedVendor: "",
        confirmed: false,
        prepareRemark: "최저가 구매"
      };
    }

    // 기존 localStorage 데이터 보정
    if (typeof this.collectMeta[key].price1Manual !== "boolean") this.collectMeta[key].price1Manual = false;
    if (typeof this.collectMeta[key].price2Manual !== "boolean") this.collectMeta[key].price2Manual = false;
    if (typeof this.collectMeta[key].price1 === "undefined") this.collectMeta[key].price1 = "";
    if (typeof this.collectMeta[key].price2 === "undefined") this.collectMeta[key].price2 = "";

    return this.collectMeta[key];
  },

  async addSelectedToCollect() {
    const request = window.ReagentApp.request;
    const groups = request.groupItems(request.getRowsForCurrentOrderMonth ? request.getRowsForCurrentOrderMonth() : request.requestRows);
    const selected = groups.filter((g) => request.selectedKeys.includes(g.key));

    if (!selected.length) {
      return window.ReagentApp.toast("선택된 품목이 없습니다.", "warn");
    }

    try {
      for (const group of selected) {
        request.collectedMeta[group.key] = group.totalQty;
        this.getMeta(group.key);
        await this.upsertCollectItem(group.key, group.totalQty, { confirmed: false });
      }
    } catch (error) {
      console.error("취합 저장 실패:", error);
      return window.ReagentApp.toast(`취합 서버 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
    }

    request.saveCollectedMeta();
    this.saveCollectMeta();

    request.selectedKeys = [];
    request.saveSelectedKeys();

    request.renderRequest();
    this.renderCollect();

    window.ReagentApp.toast("선택한 항목이 제품취합에 서버 저장되었습니다.", "success");
  },

  normalizeNumber(value) {
    return Number(String(value ?? "").replaceAll(",", "").trim()) || 0;
  },

  formatNumber(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  },

  formatMoneyInput(value) {
    const num = this.normalizeNumber(value);
    return num > 0 ? this.formatNumber(num) : "";
  },

  getAutoAmount(qty, unit) {
    const q = Number(qty || 0);
    const u = this.normalizeNumber(unit);
    return q > 0 && u > 0 ? q * u : 0;
  },

  getEffectiveAmount(meta, vendorNo, qty) {
    const priceField = vendorNo === 1 ? "price1" : "price2";
    const manualField = vendorNo === 1 ? "price1Manual" : "price2Manual";
    const unitField = vendorNo === 1 ? "unit1" : "unit2";

    if (meta?.[manualField]) {
      return this.normalizeNumber(meta?.[priceField]);
    }

    return this.getAutoAmount(qty, meta?.[unitField]);
  },

  setAutoPriceIfNeeded(meta, vendorNo, qty) {
    const priceField = vendorNo === 1 ? "price1" : "price2";
    const manualField = vendorNo === 1 ? "price1Manual" : "price2Manual";

    if (!meta?.[manualField]) {
      meta[priceField] = this.getAutoAmount(qty, vendorNo === 1 ? meta.unit1 : meta.unit2);
    }
  },

  autoSelectVendor(meta, qty = 1) {
    const amount1 = this.getEffectiveAmount(meta, 1, qty);
    const amount2 = this.getEffectiveAmount(meta, 2, qty);
    const vendor1 = String(meta.vendor1 || "").trim();
    const vendor2 = String(meta.vendor2 || "").trim();

    const hasVendor1 = vendor1 !== "" && amount1 > 0;
    const hasVendor2 = vendor2 !== "" && amount2 > 0;

    if (hasVendor1 && !hasVendor2) return "vendor1";
    if (!hasVendor1 && hasVendor2) return "vendor2";

    if (hasVendor1 && hasVendor2) {
      return amount1 <= amount2 ? "vendor1" : "vendor2";
    }

    return "";
  },

  getAutoBadge(selectedVendor, vendorKey) {
    return "";
  },

  simpleKey(key) {
    let hash = 0;
    const str = String(key || "");
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `k${Math.abs(hash)}`;
  },

  getCheckedKeysFromDOM() {
    return Array.from(document.querySelectorAll(".collect-check:checked"))
      .map((el) => el.dataset.key)
      .filter(Boolean);
  },

  bindCollectEvents() {
    document.querySelectorAll(".collect-check").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        const key = e.target.dataset.key;

        if (e.target.checked) {
          if (!this.selectedKeys.includes(key)) this.selectedKeys.push(key);
        } else {
          this.selectedKeys = this.selectedKeys.filter((k) => k !== key);
        }

        this.saveSelectedKeys();
      });
    });

    document.querySelectorAll(".collect-detail-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.toggleCollectDetail(btn.dataset.key));
    });

    document.querySelectorAll(".collect-cancel-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.cancelConfirmByKey(btn.dataset.key));
    });

    document.querySelectorAll(".collect-exclude-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.excludeCollectByKey(btn.dataset.key));
    });

    document.querySelectorAll(".collect-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const key = e.target.dataset.key;
        const field = e.target.dataset.field;
        const meta = this.getMeta(key);

        if (meta.confirmed) return;

        if (field === "unit1" || field === "unit2") {
          meta[field] = this.normalizeNumber(e.target.value);
          const group = window.ReagentApp.request
            ?.groupItems(window.ReagentApp.request.getRowsForCurrentOrderMonth ? window.ReagentApp.request.getRowsForCurrentOrderMonth() : window.ReagentApp.request.requestRows)
            ?.find((g) => g.key === key);
          const qty = Number(group?.collectedQty || 0);
          this.setAutoPriceIfNeeded(meta, field === "unit1" ? 1 : 2, qty);
        } else if (field === "price1" || field === "price2") {
          const num = this.normalizeNumber(e.target.value);
          meta[field] = num;
          meta[`${field}Manual`] = num > 0;
        } else {
          meta[field] = e.target.value;
        }

        this.saveCollectMeta();
        this.updatePriceCells(key);
        this.updateAutoBadges(key);
      });

      input.addEventListener("blur", (e) => {
        const field = e.target.dataset.field;
        if (field === "unit1" || field === "unit2" || field === "price1" || field === "price2") {
          e.target.value = this.formatMoneyInput(e.target.value);
        }
      });
    });

  },

  updatePriceCells(key) {
    const request = window.ReagentApp.request;
    const group = request.groupItems(request.getRowsForCurrentOrderMonth ? request.getRowsForCurrentOrderMonth() : request.requestRows).find((g) => g.key === key);
    if (!group) return;

    const meta = this.getMeta(key);
    const qty = Number(group.collectedQty || 0);

    const price1 = this.getEffectiveAmount(meta, 1, qty);
    const price2 = this.getEffectiveAmount(meta, 2, qty);
    const rowId = this.simpleKey(key);

    const price1El = document.querySelector(`[data-row-id="${rowId}"][data-price-field="price1"]`);
    const price2El = document.querySelector(`[data-row-id="${rowId}"][data-price-field="price2"]`);

    if (price1El && price1El.tagName === "INPUT" && !meta.price1Manual) price1El.value = this.formatMoneyInput(price1);
    if (price2El && price2El.tagName === "INPUT" && !meta.price2Manual) price2El.value = this.formatMoneyInput(price2);
  },

  updateAutoBadges(key) {
    const meta = this.getMeta(key);
    const request = window.ReagentApp.request;
    const group = request?.groupItems(request.getRowsForCurrentOrderMonth ? request.getRowsForCurrentOrderMonth() : request.requestRows)
      ?.find((g) => g.key === key);
    const qty = Number(group?.collectedQty || 0);
    const selectedVendor = meta.confirmed ? meta.selectedVendor : this.autoSelectVendor(meta, qty);
    const rowId = this.simpleKey(key);

    ["vendor1", "vendor2"].forEach((vendorKey) => {
      document
        .querySelectorAll(`[data-row-id="${rowId}"][data-vendor-group="${vendorKey}"]`)
        .forEach((cell) => {
          cell.classList.toggle("auto-vendor-selected", selectedVendor === vendorKey);
        });
    });
  },

  toggleCollectDetail(key) {
    const rowId = this.simpleKey(key);
    const row = document.querySelector(`.collect-detail-row[data-detail-id="${rowId}"]`);
    if (!row) return;
    row.style.display = row.style.display === "none" ? "" : "none";
  },

  async cancelConfirmByKey(key) {
    const request = window.ReagentApp.request;
    const meta = this.getMeta(key);

    if (!meta.confirmed) {
      return window.ReagentApp.toast("이미 미확정 상태입니다.", "warn");
    }

    const ok = confirm("이 품목의 확정을 취소하시겠습니까?\\n취소 후 거래처/단가 수정 및 제외가 가능해집니다.");
    if (!ok) return;

    meta.confirmed = false;
    meta.confirmedQty = 0;
    meta.pendingQty = 0;
    meta.confirmedAt = "";
    meta.prepareRemark = "최저가 구매";

    try {
      await this.upsertCollectItem(key, request.collectedMeta?.[key] || meta.confirmedQty || 0, { confirmed: false });
    } catch (error) {
      console.error("확정 취소 저장 실패:", error);
      return window.ReagentApp.toast(`확정 취소 서버 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
    }

    this.saveCollectMeta();
    request.renderRequest?.();
    this.renderCollect();

    window.ReagentApp.toast("확정이 취소되었습니다.", "success");
  },

  async excludeCollectByKey(key) {
    const request = window.ReagentApp.request;
    const meta = this.getMeta(key);

    if (meta.confirmed) {
      return window.ReagentApp.toast("확정된 취합건은 제외할 수 없습니다. 먼저 '취소'를 눌러 확정을 해제하세요.", "warn");
    }

    const ok = confirm("이 품목을 제품취합에서 제외하시겠습니까?\\n신청 목록에서는 미취합 상태로 다시 표시됩니다.");
    if (!ok) return;

    try {
      await this.deleteCollectItem(key);
    } catch (error) {
      console.error("취합 제외 저장 실패:", error);
      return window.ReagentApp.toast(`취합 제외 서버 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
    }

    delete request.collectedMeta[key];
    delete this.collectMeta[key];

    this.selectedKeys = this.selectedKeys.filter((selectedKey) => selectedKey !== key);

    request.saveCollectedMeta();
    this.saveCollectMeta();
    this.saveSelectedKeys();

    request.renderRequest?.();
    this.renderCollect();

    window.ReagentApp.toast("선택 항목이 취합에서 제외되었습니다.", "success");
  },

  async confirmSelectedCollect() {
    const request = window.ReagentApp.request;
    const checkedKeys = this.getCheckedKeysFromDOM();
    const targetKeys = checkedKeys.length ? checkedKeys : this.selectedKeys;

    if (!targetKeys.length) {
      return window.ReagentApp.toast("확정할 취합 항목을 선택하세요.", "warn");
    }

    const groups = request.groupItems(request.getRowsForCurrentOrderMonth ? request.getRowsForCurrentOrderMonth() : request.requestRows);
    const targetGroups = targetKeys
      .map((key) => groups.find((group) => group.key === key))
      .filter(Boolean);

    const hasAdditionalQty = targetGroups.some((group) => Number(group.newQty || 0) > 0);

    if (hasAdditionalQty) {
      const ok = confirm(
        "추가신청건이 포함되어 있습니다.\n\n" +
        "취합 완료된 수량만 거래처 확정하고,\n" +
        "추가신청건은 확정 대상에서 제외됩니다.\n\n" +
        "계속 진행하시겠습니까?"
      );

      if (!ok) return;
    }

    let confirmedCount = 0;
    let skippedCount = 0;

    for (const group of targetGroups) {
      const key = group.key;
      const meta = this.getMeta(key);

      if (meta.confirmed) continue;

      const confirmedQty = Number(group.collectedQty || 0);

      if (!confirmedQty) {
        skippedCount += 1;
        continue;
      }

      const autoSelectedVendor = this.autoSelectVendor(meta, confirmedQty);
      if (!autoSelectedVendor) {
        skippedCount += 1;
        continue;
      }

      meta.selectedVendor = autoSelectedVendor;
      meta.confirmed = true;
      meta.confirmedQty = confirmedQty;
      meta.pendingQty = Number(group.newQty || 0);
      meta.confirmedAt = new Date().toISOString();

      try {
        await this.upsertCollectItem(key, confirmedQty, { confirmed: true });
      } catch (error) {
        console.error("거래처 확정 저장 실패:", error);
        meta.confirmed = false;
        return window.ReagentApp.toast(`거래처 확정 서버 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      }

      confirmedCount += 1;
    }

    if (!confirmedCount) {
      return window.ReagentApp.toast("확정할 수 있는 거래처 정보가 없습니다. 거래처명과 단가를 입력하세요.", "warn");
    }

    this.selectedKeys = [];
    this.saveSelectedKeys();
    this.saveCollectMeta();
    request.renderRequest();
    this.renderCollect();

    if (skippedCount > 0) {
      window.ReagentApp.toast(`${confirmedCount}건 확정, ${skippedCount}건은 거래처명/단가 부족으로 제외되었습니다.`, "warn");
    } else if (hasAdditionalQty) {
      window.ReagentApp.toast("취합 완료된 수량만 거래처 확정되었습니다. 추가신청건은 미확정 상태로 유지됩니다.", "warn");
    } else {
      window.ReagentApp.toast(`${confirmedCount}건의 거래처가 자동 선택되어 확정되었습니다.`, "success");
    }
  },

  async excludeSelectedCollect() {
    const checkedKeys = this.getCheckedKeysFromDOM();
    const targetKeys = checkedKeys.length ? checkedKeys : this.selectedKeys;

    if (!targetKeys.length) {
      return window.ReagentApp.toast("제외할 취합 항목을 선택하세요.", "warn");
    }

    if (targetKeys.length === 1) {
      await this.excludeCollectByKey(targetKeys[0]);
      return;
    }

    const confirmedKeys = targetKeys.filter((key) => this.getMeta(key).confirmed);
    if (confirmedKeys.length) {
      return window.ReagentApp.toast("확정된 취합건은 제외할 수 없습니다. 먼저 해당 행의 '취소'를 눌러주세요.", "warn");
    }

    const ok = confirm("선택한 항목을 제품취합에서 제외하시겠습니까?\\n신청 목록에서는 미취합 상태로 다시 표시됩니다.");
    if (!ok) return;

    const request = window.ReagentApp.request;

    try {
      for (const key of targetKeys) {
        await this.deleteCollectItem(key);
        delete request.collectedMeta[key];
        delete this.collectMeta[key];
      }
    } catch (error) {
      console.error("선택 취합 제외 저장 실패:", error);
      return window.ReagentApp.toast(`선택 취합 제외 서버 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
    }

    this.selectedKeys = this.selectedKeys.filter((key) => !targetKeys.includes(key));

    request.saveCollectedMeta();
    this.saveCollectMeta();
    this.saveSelectedKeys();

    request.renderRequest();
    this.renderCollect();

    window.ReagentApp.toast("선택 항목이 취합에서 제외되었습니다.", "success");
  },

  getPrepareActiveView() {
    try {
      return localStorage.getItem("reagent_prepare_view") || "main";
    } catch (_) {
      return "main";
    }
  },

  setPrepareActiveView(view) {
    const nextView = view === "safety" ? "safety" : "main";
    try {
      localStorage.setItem("reagent_prepare_view", nextView);
    } catch (_) {}
    this.renderPrepare();
  },

  getPrepareTableView() {
    try {
      return localStorage.getItem("reagent_prepare_table_view") || "summary";
    } catch (_) {
      return "summary";
    }
  },

  setPrepareTableView(view) {
    const nextView = view === "quote" ? "quote" : "summary";
    try {
      localStorage.setItem("reagent_prepare_table_view", nextView);
    } catch (_) {}
    this.renderPrepare();
  },

  getPrepareMonthStatus(monthKey) {
    try {
      const rows = JSON.parse(localStorage.getItem("reagent_prepare_month_status") || "{}");
      return rows?.[monthKey] || "진행중";
    } catch (_) {
      return "진행중";
    }
  },

  setPrepareMonthStatus(monthKey, status) {
    try {
      const rows = JSON.parse(localStorage.getItem("reagent_prepare_month_status") || "{}");
      rows[monthKey] = status;
      localStorage.setItem("reagent_prepare_month_status", JSON.stringify(rows));
    } catch (_) {}
  },

  getPrepareEls() {
    return {
      monthSelect: document.getElementById("prepareOrderMonthSelect"),
      desc: document.getElementById("prepareOrderMonthDesc"),
      refresh: document.getElementById("refreshPrepare"),
      finalize: document.getElementById("finalizePrepareMonth"),
      cancelFinalize: document.getElementById("cancelFinalizePrepareMonth"),
      showMain: document.getElementById("showQuoteMain"),
      showSafety: document.getElementById("showQuoteSafety"),
      showSummary: document.getElementById("showPrepareSummary"),
      showQuote: document.getElementById("showPrepareQuote"),
      summaryPanel: document.getElementById("prepareSummaryPanel"),
      quotePanel: document.getElementById("prepareQuotePanel"),
      count: document.getElementById("prepareCount"),
      qty: document.getElementById("prepareQty"),
      amount: document.getElementById("prepareAmount"),
      docType: document.getElementById("prepareDocType"),
      summaryBadge: document.getElementById("prepareSummaryBadge"),
      summaryList: document.getElementById("prepareSummaryList"),
      summaryFoot: document.getElementById("prepareSummaryFoot"),
      quoteBadge: document.getElementById("prepareQuoteBadge"),
      quoteList: document.getElementById("prepareQuoteList"),
      quoteFoot: document.getElementById("prepareQuoteFoot")
    };
  },

  initPrepareMonthControl() {
    const request = window.ReagentApp.request;
    const els = this.getPrepareEls();
    if (!request || !els.monthSelect) return;

    const current = request.getMonthKey ? request.getMonthKey(new Date(), 0) : "";
    const next = request.getMonthKey ? request.getMonthKey(new Date(), 1) : "";
    const selected = request.getCurrentOrderMonth ? request.getCurrentOrderMonth() : (next || current);
    const existingMonths = Array.from(new Set((request.requestRows || []).map((row) => row.order_month).filter(Boolean)));
    const months = Array.from(new Set([current, next, selected, ...existingMonths].filter(Boolean))).sort();

    els.monthSelect.innerHTML = months
      .map((month) => `<option value="${this.attr(month)}">${this.html(request.formatOrderMonthLabel ? request.formatOrderMonthLabel(month) : month)}</option>`)
      .join("");
    els.monthSelect.value = selected;

    els.monthSelect.onchange = (e) => {
      request.setCurrentOrderMonth?.(e.target.value);
      this.renderPrepare();
    };
  },

  getConfirmedPrepareRows() {
    this.loadCollectMeta();

    const request = window.ReagentApp.request;
    if (!request) return [];

    const groups = request.groupItems(request.getRowsForCurrentOrderMonth ? request.getRowsForCurrentOrderMonth() : request.requestRows)
      .filter((group) => Number(request.collectedMeta?.[group.key] || 0) > 0);

    return groups
      .map((group) => {
        const meta = this.getMeta(group.key);
        if (!meta.confirmed) return null;

        const selectedVendor = meta.selectedVendor || this.autoSelectVendor(meta);
        if (!selectedVendor) return null;

        const qty = Number(meta.confirmedQty || group.collectedQty || 0);
        if (!qty) return null;

        const unit1 = this.normalizeNumber(meta.unit1);
        const unit2 = this.normalizeNumber(meta.unit2);
        const vendor1 = String(meta.vendor1 || "").trim();
        const vendor2 = String(meta.vendor2 || "").trim();

        const purchaseUnit = selectedVendor === "vendor1" ? unit1 : unit2;
        const purchaseVendor = selectedVendor === "vendor1" ? vendor1 : vendor2;
        const compareUnit = selectedVendor === "vendor1" ? unit2 : unit1;
        const compareVendor = selectedVendor === "vendor1" ? vendor2 : vendor1;

        if (!purchaseVendor || !purchaseUnit) return null;

        const usage = Array.from(new Set((group.entries || []).map((item) => String(item.usage || "").trim()).filter(Boolean))).join(" / ");
        const purchaseAmount = selectedVendor === "vendor1"
          ? this.getEffectiveAmount(meta, 1, qty)
          : this.getEffectiveAmount(meta, 2, qty);
        const compareAmount = selectedVendor === "vendor1"
          ? this.getEffectiveAmount(meta, 2, qty)
          : this.getEffectiveAmount(meta, 1, qty);
        const remarkOptions = ["최저가 구매", "제조원 구매", "취급처 구매", "대리점 구매", "온라인 구매"];
        const remark = remarkOptions.includes(meta.prepareRemark)
          ? meta.prepareRemark
          : "최저가 구매";

        return {
          key: group.key,
          order_month: group.order_month,
          category: group.category || "",
          name: group.name || "",
          maker: group.maker || "",
          code: group.code || "",
          capacity: group.capacity || "",
          cas: group.cas || "",
          grade: group.grade || "",
          qty,
          usage,
          purchaseUnit,
          purchaseAmount,
          purchaseVendor,
          compareUnit,
          compareAmount,
          compareVendor,
          remark
        };
      })
      .filter(Boolean);
  },

  sortPrepareRows(rows, view, tableView = "summary") {
    const categoryOrder = { "시약": 1, "초자": 2, "초자/소모품": 2, "안전용품": 3 };

    return [...rows].sort((a, b) => {
      // 1순위: 구분
      if (view === "main") {
        const ca = categoryOrder[a.category] || 99;
        const cb = categoryOrder[b.category] || 99;
        if (ca !== cb) return ca - cb;
      }

      // 2순위: 구매 거래처
      const vendorCompare = String(a.purchaseVendor || "").localeCompare(String(b.purchaseVendor || ""), "ko");
      if (vendorCompare !== 0) return vendorCompare;

      // 3순위: 용도
      const usageCompare = String(a.usage || "").localeCompare(String(b.usage || ""), "ko");
      if (usageCompare !== 0) return usageCompare;

      // 4순위: 품명
      const nameCompare = String(a.name || "").localeCompare(String(b.name || ""), "ko");
      if (nameCompare !== 0) return nameCompare;

      // 5순위: 비고
      return String(a.remark || "").localeCompare(String(b.remark || ""), "ko");
    });
  },

  getPrepareRowsByView(view, tableView = "summary") {
    const rows = this.getConfirmedPrepareRows();
    const filtered = view === "safety"
      ? rows.filter((row) => row.category === "안전용품")
      : rows.filter((row) => row.category !== "안전용품");

    return this.sortPrepareRows(filtered, view, tableView);
  },

  moveToPrepare() {
    this.initPrepareMonthControl();
    this.renderPrepare();

    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));

    const prepareTab = document.querySelector('.tab-btn[data-tab="prepare"]');
    const preparePage = document.getElementById("page-prepare");

    prepareTab?.classList.add("active");
    preparePage?.classList.add("active");

    window.ReagentApp.toast?.("확정된 취합자료 기준으로 취합정리에 반영했습니다.", "success");
  },

  finalizePrepareMonth() {
    const request = window.ReagentApp.request;
    const monthKey = request?.getCurrentOrderMonth ? request.getCurrentOrderMonth() : "";
    if (!monthKey) return;

    const rows = this.getConfirmedPrepareRows();
    if (!rows.length) {
      return window.ReagentApp.toast?.("확정할 취합정리 자료가 없습니다.", "warn");
    }

    const ok = confirm("해당 주문월의 취합정리 자료를 확정하시겠습니까?\n확정 후에는 이 달의 기안/비교견적 기준 자료로 사용됩니다.");
    if (!ok) return;

    try {
      localStorage.setItem(`reagent_prepare_snapshot_${monthKey}`, JSON.stringify({
        month: monthKey,
        finalized_at: new Date().toISOString(),
        rows
      }));
    } catch (_) {}

    this.setPrepareMonthStatus(monthKey, "확정");
    this.renderPrepare();

  },




  cancelFinalizePrepareMonth() {
    const request = window.ReagentApp.request;
    const monthKey = request?.getCurrentOrderMonth ? request.getCurrentOrderMonth() : "";
    if (!monthKey) return;

    this.setPrepareMonthStatus(monthKey, "진행중");

    try {
      localStorage.removeItem(`reagent_prepare_snapshot_${monthKey}`);
    } catch (_) {}

    request.renderRequest?.();
    this.renderCollect?.();
    this.renderPrepare();
  },


  getExcelRows() {
    const rowsAll = this.getConfirmedPrepareRows();

    const mainRows = this.sortPrepareRows(
      rowsAll.filter((row) => row.category !== "안전용품"),
      "main",
      "summary"
    );

    const safetyRows = this.sortPrepareRows(
      rowsAll.filter((row) => row.category === "안전용품"),
      "safety",
      "summary"
    );

    return [...mainRows, ...safetyRows];
  },

  createSameValueMerges(rows, key, colIndex, startRowIndex) {
    const merges = [];
    let start = 0;

    for (let i = 1; i <= rows.length; i += 1) {
      const currentValue = String(rows[start]?.[key] ?? "");
      const nextValue = String(rows[i]?.[key] ?? "");

      if (i === rows.length || nextValue !== currentValue) {
        if (currentValue && i - start > 1) {
          merges.push({
            s: { r: startRowIndex + start, c: colIndex },
            e: { r: startRowIndex + i - 1, c: colIndex }
          });
        }
        start = i;
      }
    }

    return merges;
  },

  applyRangeStyle(ws, rangeText, style) {
    if (!window.XLSX || !ws || !rangeText) return;

    const range = XLSX.utils.decode_range(rangeText);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        ws[addr].s = Object.assign({}, ws[addr].s || {}, style);
      }
    }
  },



  makeGroupKey(row, fields) {
    return fields.map((field) => String(row?.[field] ?? "")).join("||");
  },

  getGroupAmount(rows, targetRow, fields, amountField = "purchaseAmount") {
    const key = this.makeGroupKey(targetRow, fields);
    return rows
      .filter((row) => this.makeGroupKey(row, fields) === key)
      .reduce((sum, row) => sum + Number(row?.[amountField] || 0), 0);
  },

  formatVendorWithAmount(vendor, amount) {
    const name = String(vendor || "").trim();
    if (!name) return "";
    return `${name}
(${this.formatNumber(amount)}원)`;
  },

  hasCompareData(row) {
    return Boolean(
      Number(row?.compareUnit || 0) ||
      Number(row?.compareAmount || 0) ||
      String(row?.compareVendor || "").trim()
    );
  },

  createContiguousMerges(rows, keyFn, colIndex, startRowIndex, valueRequired = true) {
    const merges = [];
    let start = 0;

    for (let i = 1; i <= rows.length; i += 1) {
      const currentValue = String(keyFn(rows[start]) ?? "");
      const nextValue = String(keyFn(rows[i]) ?? "");

      if (i === rows.length || nextValue !== currentValue) {
        if ((!valueRequired || currentValue) && i - start > 1) {
          merges.push({
            s: { r: startRowIndex + start, c: colIndex },
            e: { r: startRowIndex + i - 1, c: colIndex }
          });
        }
        start = i;
      }
    }

    return merges;
  },



  createExcelWorkbook(rows, config = {}) {
    const quoteTitle = config.quoteTitle || "제제연구용 시약 및 소모품 비교 견적표";
    const requestTitle = config.requestTitle || "제제연구용 시약 및 소모품 구매 기안";

    const wb = XLSX.utils.book_new();

    const borderThin = {
      top: { style: "thin", color: { rgb: "555555" } },
      bottom: { style: "thin", color: { rgb: "555555" } },
      left: { style: "thin", color: { rgb: "555555" } },
      right: { style: "thin", color: { rgb: "555555" } }
    };

    const titleStyle = {
      font: { bold: true, sz: 16 },
      alignment: { horizontal: "center", vertical: "center" }
    };

    const headerStyle = {
      font: { bold: true },
      fill: { fgColor: { rgb: "FCE4D6" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: borderThin
    };

    const groupHeaderStyle = {
      font: { bold: true },
      fill: { fgColor: { rgb: "D9EAF7" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: borderThin
    };

    const bodyStyle = {
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: borderThin
    };

    const leftStyle = {
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      border: borderThin
    };

    const numStyle = {
      alignment: { horizontal: "right", vertical: "center" },
      border: borderThin,
      numFmt: "#,##0"
    };

    const totalStyle = {
      font: { bold: true },
      fill: { fgColor: { rgb: "FFF2CC" } },
      alignment: { horizontal: "right", vertical: "center" },
      border: borderThin,
      numFmt: "#,##0"
    };

    const mergedRemarkStyle = {
      font: { bold: true },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: borderThin
    };

    const totalAmount = rows.reduce((sum, row) => sum + Number(row.purchaseAmount || 0), 0);

    // =========================
    // Sheet1: 기안용 간략 양식
    // =========================
    const sheet1Data = [
      [requestTitle],
      [],
      ["No", "구분", "품명", "수량", "목적", "단가", "금액", "거래처"]
    ];

    rows.forEach((row, index) => {
      const purchaseGroupAmount = this.getGroupAmount(rows, row, ["category", "purchaseVendor"], "purchaseAmount");
      sheet1Data.push([
        index + 1,
        row.category,
        row.name,
        row.qty,
        row.usage,
        row.purchaseUnit,
        row.purchaseAmount,
        this.formatVendorWithAmount(row.purchaseVendor, purchaseGroupAmount)
      ]);
    });

    sheet1Data.push(["", "", "", "", "", "합계", totalAmount, ""]);

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    ws1["!cols"] = [
      { wch: 6 }, { wch: 10 }, { wch: 34 }, { wch: 8 },
      { wch: 42 }, { wch: 12 }, { wch: 14 }, { wch: 20 }
    ];
    ws1["!rows"] = [{ hpt: 28 }, { hpt: 6 }, { hpt: 30 }];

    const dataStart1 = 3;
    const totalRow1 = dataStart1 + rows.length;

    ws1["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      ...this.createSameValueMerges(rows, "usage", 4, dataStart1),
      ...this.createSameValueMerges(rows, "purchaseVendor", 7, dataStart1)
    ];

    this.applyRangeStyle(ws1, "A1:H1", titleStyle);
    this.applyRangeStyle(ws1, "A3:H3", headerStyle);

    for (let r = dataStart1; r < totalRow1; r += 1) {
      this.applyRangeStyle(ws1, `A${r + 1}:H${r + 1}`, bodyStyle);
      if (ws1[`C${r + 1}`]) ws1[`C${r + 1}`].s = leftStyle;
      if (ws1[`E${r + 1}`]) ws1[`E${r + 1}`].s = leftStyle;
      ["D", "F", "G"].forEach((col) => {
        if (ws1[`${col}${r + 1}`]) ws1[`${col}${r + 1}`].s = numStyle;
      });
    }

    this.applyRangeStyle(ws1, `A${totalRow1 + 1}:H${totalRow1 + 1}`, totalStyle);

    // =========================
    // Sheet2: 비교견적표 상세 양식
    // 비고 컬럼은 만들지 않고, 비교업체가 없을 때만 비교업체 3칸에 비고를 표시
    // =========================
    const sheet2Data = [
      [quoteTitle],
      [],
      ["No", "구분", "품명", "제조원", "등급", "제품번호", "단위", "CAS", "수량", "목적", "구매 업체", "", "", "비교 업체", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "단가", "금액", "거래처", "단가", "금액", "거래처"]
    ];

    const conditionalCompareMerges = [];

    rows.forEach((row, index) => {
      const excelRowIndex = 4 + index;
      const hasCompare = this.hasCompareData(row);
      const purchaseGroupAmount = this.getGroupAmount(rows, row, ["category", "purchaseVendor"], "purchaseAmount");
      const compareGroupAmount = hasCompare
        ? this.getGroupAmount(rows.filter((item) => this.hasCompareData(item)), row, ["category", "compareVendor"], "compareAmount")
        : 0;

      if (!hasCompare) {
        conditionalCompareMerges.push({
          s: { r: excelRowIndex, c: 13 },
          e: { r: excelRowIndex, c: 15 }
        });
      }

      sheet2Data.push([
        index + 1,
        row.category,
        row.name,
        row.maker,
        row.grade,
        row.code,
        row.capacity,
        row.cas,
        row.qty,
        row.usage,
        row.purchaseUnit,
        row.purchaseAmount,
        this.formatVendorWithAmount(row.purchaseVendor, purchaseGroupAmount),
        hasCompare ? row.compareUnit : row.remark,
        hasCompare ? row.compareAmount : "",
        hasCompare ? this.formatVendorWithAmount(row.compareVendor, compareGroupAmount) : ""
      ]);
    });

    sheet2Data.push(["", "", "", "", "", "", "", "", "", "", "합계", totalAmount, "", "", "", ""]);

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2["!cols"] = [
      { wch: 6 }, { wch: 10 }, { wch: 32 }, { wch: 18 },
      { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
      { wch: 8 }, { wch: 38 }, { wch: 14 }, { wch: 16 },
      { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 20 }
    ];
    ws2["!rows"] = [{ hpt: 28 }, { hpt: 6 }, { hpt: 28 }, { hpt: 28 }];

    const dataStart2 = 4;
    const totalRow2 = dataStart2 + rows.length;

    const compareRowsOnly = rows.filter((row) => this.hasCompareData(row));

    ws2["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
      { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
      { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
      { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
      { s: { r: 2, c: 3 }, e: { r: 3, c: 3 } },
      { s: { r: 2, c: 4 }, e: { r: 3, c: 4 } },
      { s: { r: 2, c: 5 }, e: { r: 3, c: 5 } },
      { s: { r: 2, c: 6 }, e: { r: 3, c: 6 } },
      { s: { r: 2, c: 7 }, e: { r: 3, c: 7 } },
      { s: { r: 2, c: 8 }, e: { r: 3, c: 8 } },
      { s: { r: 2, c: 9 }, e: { r: 3, c: 9 } },
      { s: { r: 2, c: 10 }, e: { r: 2, c: 12 } },
      { s: { r: 2, c: 13 }, e: { r: 2, c: 15 } },
      ...this.createSameValueMerges(rows, "usage", 9, dataStart2),
      ...this.createSameValueMerges(rows, "purchaseVendor", 12, dataStart2),
      ...this.createContiguousMerges(compareRowsOnly, (row) => this.makeGroupKey(row, ["category", "compareVendor"]), 15, dataStart2),
      ...conditionalCompareMerges
    ];

    this.applyRangeStyle(ws2, "A1:P1", titleStyle);
    this.applyRangeStyle(ws2, "A3:P4", headerStyle);
    this.applyRangeStyle(ws2, "K3:M3", groupHeaderStyle);
    this.applyRangeStyle(ws2, "N3:P3", groupHeaderStyle);

    for (let r = dataStart2; r < totalRow2; r += 1) {
      this.applyRangeStyle(ws2, `A${r + 1}:P${r + 1}`, bodyStyle);
      if (ws2[`C${r + 1}`]) ws2[`C${r + 1}`].s = leftStyle;
      if (ws2[`J${r + 1}`]) ws2[`J${r + 1}`].s = leftStyle;
      ["I", "K", "L", "N", "O"].forEach((col) => {
        if (ws2[`${col}${r + 1}`]) ws2[`${col}${r + 1}`].s = numStyle;
      });

      if (!this.hasCompareData(rows[r - dataStart2])) {
        ["N", "O", "P"].forEach((col) => {
          if (ws2[`${col}${r + 1}`]) ws2[`${col}${r + 1}`].s = mergedRemarkStyle;
        });
      }
    }

    this.applyRangeStyle(ws2, `A${totalRow2 + 1}:P${totalRow2 + 1}`, totalStyle);

    XLSX.utils.book_append_sheet(wb, ws1, "기안서");
    XLSX.utils.book_append_sheet(wb, ws2, "비교견적표");

    return wb;
  },

  downloadExcel() {
    if (!window.XLSX) {
      return window.ReagentApp.toast?.("엑셀 다운로드 라이브러리를 불러오지 못했습니다.", "warn");
    }

    const request = window.ReagentApp.request;
    const monthKey = request?.getCurrentOrderMonth ? request.getCurrentOrderMonth() : "";
    const rowsAll = this.getConfirmedPrepareRows();

    const mainRows = this.sortPrepareRows(
      rowsAll.filter((row) => row.category !== "안전용품"),
      "main",
      "summary"
    );

    const safetyRows = this.sortPrepareRows(
      rowsAll.filter((row) => row.category === "안전용품"),
      "safety",
      "summary"
    );

    if (!mainRows.length && !safetyRows.length) {
      return window.ReagentApp.toast?.("다운로드할 취합정리 자료가 없습니다.", "warn");
    }

    const safeMonth = monthKey || new Date().toISOString().slice(0, 7);

    if (mainRows.length) {
      const wbMain = this.createExcelWorkbook(mainRows, {
        requestTitle: "제제연구용 시약 및 소모품 구매 기안",
        quoteTitle: "제제연구용 시약 및 소모품 비교 견적표"
      });

      XLSX.writeFile(wbMain, `취합정리_${safeMonth}_시약초자.xlsx`);
    }

    if (safetyRows.length) {
      const wbSafety = this.createExcelWorkbook(safetyRows, {
        requestTitle: "연구소 안전 관련 물품 구매 기안",
        quoteTitle: "연구소 안전 관련 물품 비교 견적표"
      });

      XLSX.writeFile(wbSafety, `취합정리_${safeMonth}_안전용품.xlsx`);
    }
  },


  renderPrepare() {
    const request = window.ReagentApp.request;
    const els = this.getPrepareEls();
    if (!request || !els.summaryList || !els.quoteList) return;

    this.initPrepareMonthControl();

    const view = this.getPrepareActiveView();
    const tableView = this.getPrepareTableView();
    const rows = this.getPrepareRowsByView(view, tableView);
    const monthKey = request.getCurrentOrderMonth ? request.getCurrentOrderMonth() : "";
    const status = this.getPrepareMonthStatus(monthKey);
    const docLabel = view === "safety" ? "안전용품" : "시약/초자";
    const totalQty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.purchaseAmount || 0), 0);

    document.querySelectorAll(".prepare-view-btn").forEach((btn) => {
      const isActive = btn.dataset.prepareView === view;
      btn.classList.toggle("primary", isActive);
    });

    document.querySelectorAll(".prepare-table-view-btn").forEach((btn) => {
      const isActive = btn.dataset.prepareTableView === tableView;
      btn.classList.toggle("primary", isActive);
    });

    document.querySelectorAll(".prepare-table-panel").forEach((panel) => {
      const isActive = panel.dataset.prepareTablePanel === tableView;
      panel.classList.toggle("active", isActive);
    });

    if (els.desc) {
      els.desc.textContent = `${docLabel} 기준으로 확정된 취합자료를 정리합니다. 현재 상태: ${status}`;
    }

    if (els.finalize) {
      const isFinalized = status === "확정";
      els.finalize.classList.toggle("primary", isFinalized);
      els.finalize.classList.toggle("active", isFinalized);
      els.finalize.textContent = "확정";
      els.finalize.disabled = isFinalized;
    }

    if (els.cancelFinalize) {
      const isFinalized = status === "확정";
      els.cancelFinalize.classList.toggle("primary", !isFinalized);
      els.cancelFinalize.classList.toggle("active", !isFinalized);
      els.cancelFinalize.textContent = "미확정";
      els.cancelFinalize.disabled = !isFinalized;
    }


if (els.count) els.count.textContent = String(rows.length);
    if (els.qty) els.qty.textContent = this.formatNumber(totalQty);
    if (els.amount) els.amount.textContent = this.formatNumber(totalAmount);
    if (els.docType) els.docType.textContent = docLabel;
    if (els.summaryBadge) els.summaryBadge.textContent = `${rows.length}건`;
    if (els.quoteBadge) els.quoteBadge.textContent = `${docLabel} 비교견적`;

    if (!rows.length) {
      els.summaryList.innerHTML = `<tr><td class="empty" colspan="7">확정된 취합정리 자료가 없습니다.</td></tr>`;
      els.quoteList.innerHTML = `<tr><td class="empty" colspan="16">비교견적 자료가 없습니다.</td></tr>`;
      if (els.summaryFoot) els.summaryFoot.innerHTML = "";
      if (els.quoteFoot) els.quoteFoot.innerHTML = "";
      return;
    }

    els.summaryList.innerHTML = rows.map((row) => `
      <tr>
        <td class="txt">${this.html(row.category)}</td>
        <td class="txt">${this.html(row.name)}</td>
        <td class="num">${this.formatNumber(row.qty)}</td>
        <td class="txt usage-cell">${this.html(row.usage)}</td>
        <td class="num">${this.formatNumber(row.purchaseUnit)}</td>
        <td class="num">${this.formatNumber(row.purchaseAmount)}</td>
        <td class="txt">${this.html(row.purchaseVendor)}</td>
      </tr>
    `).join("");

    els.quoteList.innerHTML = rows.map((row) => `
      <tr>
        <td class="txt">${this.html(row.category)}</td>
        <td class="txt">${this.html(row.name)}</td>
        <td class="txt">${this.html(row.maker)}</td>
        <td class="txt">${this.html(row.grade)}</td>
        <td class="txt">${this.html(row.code)}</td>
        <td class="txt">${this.html(row.capacity)}</td>
        <td class="txt">${this.html(row.cas)}</td>
        <td class="num">${this.formatNumber(row.qty)}</td>
        <td class="txt usage-cell">${this.html(row.usage)}</td>
        <td class="num">${this.formatNumber(row.purchaseUnit)}</td>
        <td class="num">${this.formatNumber(row.purchaseAmount)}</td>
        <td class="txt">${this.html(row.purchaseVendor)}</td>
        <td class="num dash">${row.compareUnit ? this.formatNumber(row.compareUnit) : "-"}</td>
        <td class="num dash">${row.compareAmount ? this.formatNumber(row.compareAmount) : "-"}</td>
        <td class="txt">${this.html(row.compareVendor || "-")}</td>
        <td class="remark-cell">
          <select class="prepare-remark-select" data-key="${this.html(row.key)}">
            ${["최저가 구매", "제조원 구매", "취급처 구매", "대리점 구매", "온라인 구매"].map((option) => `
              <option value="${this.html(option)}" ${row.remark === option ? "selected" : ""}>${this.html(option)}</option>
            `).join("")}
          </select>
        </td>
      </tr>
    `).join("");

    if (els.summaryFoot) {
      els.summaryFoot.innerHTML = `<tr><th colspan="5" class="num">합계</th><th class="num">${this.formatNumber(totalAmount)}</th><th></th></tr>`;
    }
    if (els.quoteFoot) {
      els.quoteFoot.innerHTML = `<tr><th colspan="10" class="num">구매 금액 합계</th><th class="num">${this.formatNumber(totalAmount)}</th><th colspan="5"></th></tr>`;
    }

    document.querySelectorAll(".prepare-remark-select").forEach((select) => {
      select.addEventListener("change", (e) => {
        const key = e.target.dataset.key;
        const meta = this.getMeta(key);
        meta.prepareRemark = e.target.value || "최저가 구매";
        this.saveCollectMeta();
        this.renderPrepare();
      });
    });

    document.querySelectorAll(".prepare-table-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.setPrepareTableView(btn.dataset.prepareTableView));
    });

    const finalizePrepareBtn = document.getElementById("finalizePrepareMonth");
    if (finalizePrepareBtn) {
      finalizePrepareBtn.onclick = () => {
        this.finalizePrepareMonth();
      };
    }

    const cancelFinalizePrepareBtn = document.getElementById("cancelFinalizePrepareMonth");
    if (cancelFinalizePrepareBtn) {
      cancelFinalizePrepareBtn.onclick = () => {
        this.cancelFinalizePrepareMonth();
      };
    }

    const downloadExcelBtn = document.getElementById("downloadExcel");
    if (downloadExcelBtn) {
      downloadExcelBtn.onclick = () => {
        this.downloadExcel();
      };
    }
  },

  html(value) {
    return window.ReagentApp.escapeHtml ? window.ReagentApp.escapeHtml(value) : String(value ?? "");
  },

  attr(value) {
    return this.html(value);
  },

  renderCollect() {
    this.loadCollectMeta();
    this.loadSelectedKeys();

    const { els, escapeHtml } = window.ReagentApp;
    const request = window.ReagentApp.request;

    let groups = request.groupItems(request.getRowsForCurrentOrderMonth ? request.getRowsForCurrentOrderMonth() : request.requestRows)
      .filter((g) => Number(request.collectedMeta[g.key] || 0) > 0);

    const keyword = (els.collectKeyword?.value || "").trim().toLowerCase();
    const category = els.collectCategory?.value || "";

    if (keyword) {
      groups = groups.filter((g) =>
        [g.name, g.maker, g.code].join(" ").toLowerCase().includes(keyword)
      );
    }

    if (category) {
      groups = groups.filter((g) => g.category === category);
    }

    // 제품취합 정렬: 미확정 거래처 우선 → 시약/초자/안전용품 순 → 기존 신청순 유지
    groups.sort((a, b) => {
      const aConfirmed = this.getMeta(a.key)?.confirmed ? 1 : 0;
      const bConfirmed = this.getMeta(b.key)?.confirmed ? 1 : 0;

      if (aConfirmed !== bConfirmed) {
        return aConfirmed - bConfirmed;
      }

      const categoryOrder = {
        "시약": 1,
        "초자": 2,
        "초자/소모품": 2,
        "안전용품": 3
      };

      const aCategoryOrder = categoryOrder[a.category] || 99;
      const bCategoryOrder = categoryOrder[b.category] || 99;

      if (aCategoryOrder !== bCategoryOrder) {
        return aCategoryOrder - bCategoryOrder;
      }

      return 0;
    });

    if (!groups.length) {
      els.collectList.innerHTML = `<tr><td colspan="16" class="empty">취합할 항목이 없습니다.</td></tr>`;
      if (els.collectCount) els.collectCount.textContent = "0";
      if (els.collectQty) els.collectQty.textContent = "0";
      if (els.collectMix) els.collectMix.textContent = "0 / 0 / 0";
      return;
    }

    els.collectList.innerHTML = groups.map((group) => {
      const meta = this.getMeta(group.key);
      const qty = Number(group.collectedQty || 0);
      const unit1 = this.normalizeNumber(meta.unit1);
      const unit2 = this.normalizeNumber(meta.unit2);
      this.setAutoPriceIfNeeded(meta, 1, qty);
      this.setAutoPriceIfNeeded(meta, 2, qty);
      const price1 = this.getEffectiveAmount(meta, 1, qty);
      const price2 = this.getEffectiveAmount(meta, 2, qty);
      const calculatedVendor = this.autoSelectVendor(meta, qty);
      if (!meta.confirmed) {
        meta.selectedVendor = calculatedVendor;
      }
      const autoSelectedVendor = meta.confirmed ? meta.selectedVendor : calculatedVendor;
      const checked = this.selectedKeys.includes(group.key) ? "checked" : "";
      const confirmedBadge = meta.confirmed ? `<span style="color:#16a34a; font-weight:700;">확정</span>` : "";
      const lockedAttr = meta.confirmed ? "disabled" : "";
      const readonlyAttr = meta.confirmed ? "readonly" : "";
      const rowId = this.simpleKey(group.key);
      const cancelButton = meta.confirmed
        ? `<button type="button" class="ghost-btn collect-cancel-btn" data-key="${escapeHtml(group.key)}" title="거래처 확정 취소">취소</button>`
        : "";
      const actionCell = meta.confirmed
        ? `<button type="button" class="ghost-btn collect-cancel-btn" data-key="${escapeHtml(group.key)}">취소</button>`
        : `<button type="button" class="ghost-btn collect-exclude-btn" data-key="${escapeHtml(group.key)}">제외</button>`;

      let remainingConfirmedQty = meta.confirmed ? Number(meta.confirmedQty || group.collectedQty || 0) : Number(group.collectedQty || 0);

      const detailRows = group.entries.map((item) => {
        const itemQty = Number(item.qty || 0);
        const isConfirmedEntry = remainingConfirmedQty > 0 && remainingConfirmedQty >= itemQty;
        const isPendingEntry = !isConfirmedEntry && Number(group.collectedQty || 0) > 0;

        const isVendorConfirmed = meta.confirmed === true;
        const rowClass = isVendorConfirmed && isConfirmedEntry ? "collect-detail-confirmed" : "";

        // 상태 문구는 취합 기준, 색상은 거래처 확정 후에만 적용
        const statusText = isConfirmedEntry ? (isVendorConfirmed ? "거래처확정" : "취합완료") : (isPendingEntry ? "추가신청" : "신청");

        const qtyClass = isVendorConfirmed
          ? (isConfirmedEntry ? "qty-confirmed" : (isPendingEntry ? "qty-pending" : ""))
          : "";

        const statusClass = isVendorConfirmed
          ? (isConfirmedEntry ? "qty-confirmed" : (isPendingEntry ? "qty-pending" : ""))
          : "";

        if (isConfirmedEntry) {
          remainingConfirmedQty = Math.max(0, remainingConfirmedQty - itemQty);
        }

        return `
          <tr class="${rowClass}" style="${rowClass ? 'background:#f1f5f9;' : ''}">
            <td>${request.formatDateTime ? request.formatDateTime(item.created_at || item.id) : escapeHtml(item.created_at || "")}</td>
            <td>${escapeHtml(item.team)} / ${escapeHtml(item.requester)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td><span class="${qtyClass}">${item.qty}</span></td>
            <td>${escapeHtml(item.usage)}</td>
            <td><span class="${statusClass}">${statusText}</span></td>
          </tr>
        `;
      }).join("");

      return `
        <tr class="${meta.confirmed ? "collect-row-confirmed" : ""}">
          <td class="collect-select-cell">
            <input type="checkbox" class="collect-check" data-key="${escapeHtml(group.key)}" ${checked} ${lockedAttr}>
          </td>
          <td class="collect-name-cell">${escapeHtml(group.name)} ${confirmedBadge}</td>
          <td>${escapeHtml(group.maker)}</td>
          <td>${escapeHtml(group.code)}</td>
          <td>${escapeHtml(group.cas)}</td>
          <td>${escapeHtml(group.grade)}</td>
          <td>${escapeHtml(group.capacity)}</td>
          <td>
            ${
              meta.confirmed
                ? `
                  ${group.collectedQty > 0 ? `<span class="qty-confirmed">완료 ${group.collectedQty}</span><br>` : ""}
                  ${group.newQty > 0 ? `<span class="qty-pending">추가 ${group.newQty}</span>` : ""}
                `
                : `
                  ${group.collectedQty > 0 ? `완료 ${group.collectedQty}<br>` : ""}
                  ${group.newQty > 0 ? `추가 ${group.newQty}` : ""}
                `
            }
          </td>
          <td>
            <button type="button" class="ghost-btn collect-detail-btn" data-key="${escapeHtml(group.key)}">상세보기</button>
          </td>
          <td colspan="3" class="vendor-group-td ${autoSelectedVendor === "vendor1" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor1">
            <div class="vendor-quote-box ${autoSelectedVendor === "vendor1" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor1">
              <input class="collect-input vendor-unit-input" data-key="${escapeHtml(group.key)}" data-field="unit1" value="${this.formatMoneyInput(unit1)}" style="text-align:right;" ${readonlyAttr}>
              <input class="collect-input vendor-price-input" data-key="${escapeHtml(group.key)}" data-field="price1" data-row-id="${rowId}" data-price-field="price1" value="${this.formatMoneyInput(price1)}" title="배송비/부가세 포함 금액은 직접 수정하세요." style="text-align:right;" ${readonlyAttr}>
              <input class="collect-input vendor-name-input" data-key="${escapeHtml(group.key)}" data-field="vendor1" value="${escapeHtml(meta.vendor1 || "")}" ${readonlyAttr}>
            </div>
          </td>
          <td colspan="3" class="vendor-group-td ${autoSelectedVendor === "vendor2" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor2">
            <div class="vendor-quote-box ${autoSelectedVendor === "vendor2" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor2">
              <input class="collect-input vendor-unit-input" data-key="${escapeHtml(group.key)}" data-field="unit2" value="${this.formatMoneyInput(unit2)}" style="text-align:right;" ${readonlyAttr}>
              <input class="collect-input vendor-price-input" data-key="${escapeHtml(group.key)}" data-field="price2" data-row-id="${rowId}" data-price-field="price2" value="${this.formatMoneyInput(price2)}" title="배송비/부가세 포함 금액은 직접 수정하세요." style="text-align:right;" ${readonlyAttr}>
              <input class="collect-input vendor-name-input" data-key="${escapeHtml(group.key)}" data-field="vendor2" value="${escapeHtml(meta.vendor2 || "")}" ${readonlyAttr}>
            </div>
          </td>
          <td>${actionCell}</td>
        </tr>
        <tr class="collect-detail-row" data-detail-id="${rowId}" style="display:none;">
          <td colspan="16">
            <div style="padding:12px; background:#f8fafc; border-radius:12px;">
              <table style="width:100%; min-width:0; table-layout:fixed;">
                <colgroup>
                  <col style="width:150px;">
                  <col style="width:170px;">
                  <col style="width:28%;">
                  <col style="width:80px;">
                  <col style="width:30%;">
                  <col style="width:110px;">
                </colgroup>
                <thead>
                  <tr>
                    <th>신청일자</th>
                    <th>신청자</th>
                    <th>품명</th>
                    <th>수량</th>
                    <th>용도</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>${detailRows}</tbody>
              </table>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    this.bindCollectEvents();

    if (els.collectCount) els.collectCount.textContent = String(groups.length);
    if (els.collectQty) els.collectQty.textContent = String(groups.reduce((sum, g) => sum + Number(g.collectedQty || g.totalQty || 0), 0));

    const mixR = groups.filter((g) => g.category === "시약").length;
    const mixG = groups.filter((g) => g.category === "초자").length;
    const mixS = groups.filter((g) => g.category === "안전용품").length;

    if (els.collectMix) els.collectMix.textContent = `${mixR} / ${mixG} / ${mixS}`;
  }
};
