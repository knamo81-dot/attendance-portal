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

  getMeta(key) {
    if (!this.collectMeta[key]) {
      this.collectMeta[key] = {
        vendor1: "거래처A",
        unit1: 10000,
        vendor2: "거래처B",
        unit2: 12000,
        selectedVendor: "",
        confirmed: false
      };
    }

    return this.collectMeta[key];
  },

  addSelectedToCollect() {
    const request = window.ReagentApp.request;
    const groups = request.groupItems(request.getRowsForCurrentOrderMonth ? request.getRowsForCurrentOrderMonth() : request.requestRows);
    const selected = groups.filter((g) => request.selectedKeys.includes(g.key));

    if (!selected.length) {
      return window.ReagentApp.toast("선택된 품목이 없습니다.", "warn");
    }

    selected.forEach((group) => {
      request.collectedMeta[group.key] = group.totalQty;
      this.getMeta(group.key);
    });

    request.saveCollectedMeta();
    this.saveCollectMeta();

    request.selectedKeys = [];
    request.saveSelectedKeys();

    request.renderRequest();
    this.renderCollect();

    window.ReagentApp.toast("선택한 항목이 제품취합에 반영되었습니다.", "success");
  },

  normalizeNumber(value) {
    return Number(String(value ?? "").replaceAll(",", "").trim()) || 0;
  },

  formatNumber(value) {
    return Number(value || 0).toLocaleString("ko-KR");
  },

  autoSelectVendor(meta) {
    const unit1 = this.normalizeNumber(meta.unit1);
    const unit2 = this.normalizeNumber(meta.unit2);
    const vendor1 = String(meta.vendor1 || "").trim();
    const vendor2 = String(meta.vendor2 || "").trim();

    const hasVendor1 = vendor1 !== "" && unit1 > 0;
    const hasVendor2 = vendor2 !== "" && unit2 > 0;

    if (hasVendor1 && !hasVendor2) return "vendor1";
    if (!hasVendor1 && hasVendor2) return "vendor2";

    if (hasVendor1 && hasVendor2) {
      return unit1 <= unit2 ? "vendor1" : "vendor2";
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
        } else {
          meta[field] = e.target.value;
        }

        this.saveCollectMeta();
        this.updatePriceCells(key);
        this.updateAutoBadges(key);
      });

      input.addEventListener("blur", (e) => {
        const field = e.target.dataset.field;
        if (field === "unit1" || field === "unit2") {
          e.target.value = this.formatNumber(this.normalizeNumber(e.target.value));
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

    const price1 = qty * this.normalizeNumber(meta.unit1);
    const price2 = qty * this.normalizeNumber(meta.unit2);
    const rowId = this.simpleKey(key);

    const price1El = document.querySelector(`[data-row-id="${rowId}"][data-price-field="price1"]`);
    const price2El = document.querySelector(`[data-row-id="${rowId}"][data-price-field="price2"]`);

    if (price1El) price1El.textContent = this.formatNumber(price1);
    if (price2El) price2El.textContent = this.formatNumber(price2);
  },

  updateAutoBadges(key) {
    const meta = this.getMeta(key);
    const selectedVendor = meta.confirmed ? meta.selectedVendor : "";
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

  cancelConfirmByKey(key) {
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

    this.saveCollectMeta();
    request.renderRequest?.();
    this.renderCollect();

    window.ReagentApp.toast("확정이 취소되었습니다.", "success");
  },

  excludeCollectByKey(key) {
    const request = window.ReagentApp.request;
    const meta = this.getMeta(key);

    if (meta.confirmed) {
      return window.ReagentApp.toast("확정된 취합건은 제외할 수 없습니다. 먼저 '취소'를 눌러 확정을 해제하세요.", "warn");
    }

    const ok = confirm("이 품목을 제품취합에서 제외하시겠습니까?\\n신청 목록에서는 미취합 상태로 다시 표시됩니다.");
    if (!ok) return;

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

  confirmSelectedCollect() {
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

    targetGroups.forEach((group) => {
      const key = group.key;
      const meta = this.getMeta(key);

      if (meta.confirmed) return;

      const confirmedQty = Number(group.collectedQty || 0);

      if (!confirmedQty) {
        skippedCount += 1;
        return;
      }

      const autoSelectedVendor = this.autoSelectVendor(meta);
      if (!autoSelectedVendor) {
        skippedCount += 1;
        return;
      }

      meta.selectedVendor = autoSelectedVendor;
      meta.confirmed = true;
      meta.confirmedQty = confirmedQty;
      meta.pendingQty = Number(group.newQty || 0);
      meta.confirmedAt = new Date().toISOString();
      confirmedCount += 1;
    });

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

  excludeSelectedCollect() {
    const checkedKeys = this.getCheckedKeysFromDOM();
    const targetKeys = checkedKeys.length ? checkedKeys : this.selectedKeys;

    if (!targetKeys.length) {
      return window.ReagentApp.toast("제외할 취합 항목을 선택하세요.", "warn");
    }

    if (targetKeys.length === 1) {
      this.excludeCollectByKey(targetKeys[0]);
      return;
    }

    const confirmedKeys = targetKeys.filter((key) => this.getMeta(key).confirmed);
    if (confirmedKeys.length) {
      return window.ReagentApp.toast("확정된 취합건은 제외할 수 없습니다. 먼저 해당 행의 '취소'를 눌러주세요.", "warn");
    }

    const ok = confirm("선택한 항목을 제품취합에서 제외하시겠습니까?\\n신청 목록에서는 미취합 상태로 다시 표시됩니다.");
    if (!ok) return;

    const request = window.ReagentApp.request;

    targetKeys.forEach((key) => {
      delete request.collectedMeta[key];
      delete this.collectMeta[key];
    });

    this.selectedKeys = this.selectedKeys.filter((key) => !targetKeys.includes(key));

    request.saveCollectedMeta();
    this.saveCollectMeta();
    this.saveSelectedKeys();

    request.renderRequest();
    this.renderCollect();

    window.ReagentApp.toast("선택 항목이 취합에서 제외되었습니다.", "success");
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
      const price1 = qty * unit1;
      const price2 = qty * unit2;
      const calculatedVendor = this.autoSelectVendor(meta);
      if (!meta.confirmed) {
        meta.selectedVendor = calculatedVendor;
      }
      const autoSelectedVendor = meta.confirmed ? meta.selectedVendor : "";
      const checked = this.selectedKeys.includes(group.key) ? "checked" : "";
      const confirmedBadge = meta.confirmed ? `<span style="color:#16a34a; font-weight:700;">확정</span>` : "";
      const lockedAttr = meta.confirmed ? "disabled" : "";
      const readonlyAttr = meta.confirmed ? "readonly" : "";
      const rowId = this.simpleKey(group.key);
      const cancelButton = meta.confirmed
        ? `<button type="button" class="ghost-btn collect-cancel-btn" data-key="${escapeHtml(group.key)}" style="margin-right:6px;">취소</button>`
        : "";
      const actionCell = meta.confirmed
        ? `<span style="color:#94a3b8;">잠김</span>`
        : `<button type="button" class="ghost-btn collect-exclude-btn" data-key="${escapeHtml(group.key)}">제외</button>`;

      const detailRows = group.entries.map((item) => `
        <tr>
          <td>${request.formatDateTime ? request.formatDateTime(item.created_at || item.id) : escapeHtml(item.created_at || "")}</td>
          <td>${escapeHtml(item.team)} / ${escapeHtml(item.requester)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.qty}</td>
          <td>${escapeHtml(item.usage)}</td>
        </tr>
      `).join("");

      return `
        <tr class="${meta.confirmed ? "collect-row-confirmed" : ""}">
          <td><input type="checkbox" class="collect-check" data-key="${escapeHtml(group.key)}" ${checked} ${lockedAttr}></td>
          <td>${cancelButton}${escapeHtml(group.name)} ${confirmedBadge}</td>
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
          <td class="vendor-cell vendor-cell-start ${autoSelectedVendor === "vendor1" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor1">
            <input class="collect-input" data-key="${escapeHtml(group.key)}" data-field="unit1" value="${this.formatNumber(unit1)}" style="width:90px; text-align:right;" ${readonlyAttr}>
          </td>
          <td class="vendor-cell vendor-cell-middle ${autoSelectedVendor === "vendor1" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor1" data-price-field="price1">${this.formatNumber(price1)}</td>
          <td class="vendor-cell vendor-cell-end ${autoSelectedVendor === "vendor1" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor1">
            <input class="collect-input" data-key="${escapeHtml(group.key)}" data-field="vendor1" value="${escapeHtml(meta.vendor1 || "")}" style="width:110px;" ${readonlyAttr}>
          </td>
          <td class="vendor-cell vendor-cell-start ${autoSelectedVendor === "vendor2" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor2">
            <input class="collect-input" data-key="${escapeHtml(group.key)}" data-field="unit2" value="${this.formatNumber(unit2)}" style="width:90px; text-align:right;" ${readonlyAttr}>
          </td>
          <td class="vendor-cell vendor-cell-middle ${autoSelectedVendor === "vendor2" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor2" data-price-field="price2">${this.formatNumber(price2)}</td>
          <td class="vendor-cell vendor-cell-end ${autoSelectedVendor === "vendor2" ? "auto-vendor-selected" : ""}" data-row-id="${rowId}" data-vendor-group="vendor2">
            <input class="collect-input" data-key="${escapeHtml(group.key)}" data-field="vendor2" value="${escapeHtml(meta.vendor2 || "")}" style="width:110px;" ${readonlyAttr}>
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
                </colgroup>
                <thead>
                  <tr>
                    <th>신청일자</th>
                    <th>신청자</th>
                    <th>품명</th>
                    <th>수량</th>
                    <th>용도</th>
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

document.addEventListener("DOMContentLoaded", () => {
  window.ReagentApp.els?.confirmSelectedCollect?.addEventListener("click", () => {
    window.ReagentApp.collect?.confirmSelectedCollect?.();
  });

  window.ReagentApp.els?.excludeSelectedCollect?.addEventListener("click", () => {
    window.ReagentApp.collect?.excludeSelectedCollect?.();
  });
});
