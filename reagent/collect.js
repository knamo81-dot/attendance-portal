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
    const groups = request.groupItems(request.requestRows);
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

  bindCollectEvents(groups) {
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

    document.querySelectorAll(".collect-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const key = e.target.dataset.key;
        const field = e.target.dataset.field;
        const meta = this.getMeta(key);

        if (field === "unit1" || field === "unit2") {
          meta[field] = this.normalizeNumber(e.target.value);
        } else {
          meta[field] = e.target.value;
        }

        this.saveCollectMeta();
        this.updatePriceCells(key);
      });

      input.addEventListener("blur", (e) => {
        const field = e.target.dataset.field;
        if (field === "unit1" || field === "unit2") {
          e.target.value = this.formatNumber(this.normalizeNumber(e.target.value));
        }
      });
    });

    document.querySelectorAll(".vendor-select").forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const key = e.target.dataset.key;
        const meta = this.getMeta(key);

        meta.selectedVendor = e.target.value;
        this.saveCollectMeta();
      });
    });
  },

  updatePriceCells(key) {
    const request = window.ReagentApp.request;
    const group = request.groupItems(request.requestRows).find((g) => g.key === key);
    if (!group) return;

    const meta = this.getMeta(key);
    const qty = Number(group.collectedQty || group.totalQty || 0);

    const price1 = qty * this.normalizeNumber(meta.unit1);
    const price2 = qty * this.normalizeNumber(meta.unit2);

    const price1El = document.querySelector(`[data-price-key="${CSS.escape(key)}"][data-price-field="price1"]`);
    const price2El = document.querySelector(`[data-price-key="${CSS.escape(key)}"][data-price-field="price2"]`);

    if (price1El) price1El.textContent = this.formatNumber(price1);
    if (price2El) price2El.textContent = this.formatNumber(price2);
  },

  toggleCollectDetail(key) {
    const row = document.querySelector(`.collect-detail-row[data-detail-key="${CSS.escape(key)}"]`);
    if (!row) return;
    row.style.display = row.style.display === "none" ? "" : "none";
  },

  confirmSelectedCollect() {
    const request = window.ReagentApp.request;

    if (!this.selectedKeys.length) {
      return window.ReagentApp.toast("확정할 취합 항목을 선택하세요.", "warn");
    }

    let confirmedCount = 0;

    this.selectedKeys.forEach((key) => {
      const meta = this.getMeta(key);

      if (!meta.selectedVendor) {
        return;
      }

      meta.confirmed = true;
      meta.confirmedAt = new Date().toISOString();
      confirmedCount += 1;
    });

    if (!confirmedCount) {
      return window.ReagentApp.toast("거래처1 또는 거래처2를 먼저 선택하세요.", "warn");
    }

    this.saveCollectMeta();
    request.renderRequest();
    this.renderCollect();

    window.ReagentApp.toast(`${confirmedCount}건의 거래처가 확정되었습니다.`, "success");
  },

  excludeSelectedCollect() {
    const request = window.ReagentApp.request;

    if (!this.selectedKeys.length) {
      return window.ReagentApp.toast("제외할 취합 항목을 선택하세요.", "warn");
    }

    const ok = confirm("선택한 항목을 제품취합에서 제외하시겠습니까?\n신청 목록에서는 미취합 상태로 다시 표시됩니다.");
    if (!ok) return;

    this.selectedKeys.forEach((key) => {
      delete request.collectedMeta[key];
      delete this.collectMeta[key];
    });

    request.saveCollectedMeta();
    this.saveCollectMeta();

    this.selectedKeys = [];
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

    let groups = request.groupItems(request.requestRows)
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
      els.collectList.innerHTML = `<tr><td colspan="15" class="empty">취합할 항목이 없습니다.</td></tr>`;
      if (els.collectCount) els.collectCount.textContent = "0";
      if (els.collectQty) els.collectQty.textContent = "0";
      if (els.collectMix) els.collectMix.textContent = "0 / 0 / 0";
      return;
    }

    els.collectList.innerHTML = groups.map((group) => {
      const meta = this.getMeta(group.key);
      const qty = Number(group.collectedQty || group.totalQty || 0);
      const unit1 = this.normalizeNumber(meta.unit1);
      const unit2 = this.normalizeNumber(meta.unit2);
      const price1 = qty * unit1;
      const price2 = qty * unit2;
      const checked = this.selectedKeys.includes(group.key) ? "checked" : "";
      const confirmedBadge = meta.confirmed ? `<span style="color:#16a34a; font-weight:700;">확정</span>` : "";

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
        <tr>
          <td><input type="checkbox" class="collect-check" data-key="${escapeHtml(group.key)}" ${checked}></td>
          <td>${escapeHtml(group.name)} ${confirmedBadge}</td>
          <td>${escapeHtml(group.maker)}</td>
          <td>${escapeHtml(group.code)}</td>
          <td>${escapeHtml(group.capacity)}</td>
          <td>${escapeHtml(group.cas)}</td>
          <td>${escapeHtml(group.grade)}</td>
          <td>
            ${group.collectedQty > 0 ? `완료 ${group.collectedQty}<br>` : ""}
            ${group.newQty > 0 ? `추가 ${group.newQty}` : ""}
          </td>
          <td>
            <button type="button" class="ghost-btn collect-detail-btn" data-key="${escapeHtml(group.key)}">상세보기</button>
          </td>
          <td>
            <label style="display:flex; gap:4px; align-items:center; justify-content:center;">
              <input type="radio" class="vendor-select" name="vendor-${escapeHtml(group.key)}" data-key="${escapeHtml(group.key)}" value="vendor1" ${meta.selectedVendor === "vendor1" ? "checked" : ""}>
              <input class="collect-input" data-key="${escapeHtml(group.key)}" data-field="unit1" value="${this.formatNumber(unit1)}" style="width:90px; text-align:right;">
            </label>
          </td>
          <td data-price-key="${escapeHtml(group.key)}" data-price-field="price1">${this.formatNumber(price1)}</td>
          <td>
            <input class="collect-input" data-key="${escapeHtml(group.key)}" data-field="vendor1" value="${escapeHtml(meta.vendor1 || "")}" style="width:110px;">
          </td>
          <td>
            <label style="display:flex; gap:4px; align-items:center; justify-content:center;">
              <input type="radio" class="vendor-select" name="vendor-${escapeHtml(group.key)}" data-key="${escapeHtml(group.key)}" value="vendor2" ${meta.selectedVendor === "vendor2" ? "checked" : ""}>
              <input class="collect-input" data-key="${escapeHtml(group.key)}" data-field="unit2" value="${this.formatNumber(unit2)}" style="width:90px; text-align:right;">
            </label>
          </td>
          <td data-price-key="${escapeHtml(group.key)}" data-price-field="price2">${this.formatNumber(price2)}</td>
          <td>
            <input class="collect-input" data-key="${escapeHtml(group.key)}" data-field="vendor2" value="${escapeHtml(meta.vendor2 || "")}" style="width:110px;">
          </td>
        </tr>
        <tr class="collect-detail-row" data-detail-key="${escapeHtml(group.key)}" style="display:none;">
          <td colspan="15">
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

    this.bindCollectEvents(groups);

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
