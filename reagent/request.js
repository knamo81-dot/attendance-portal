window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.request = {
  requestRows: [],
  selectedKeys: [],
  collectedMeta: {},

  mockProducts: [
    { category: "시약", name: "Ethanol", maker: "Sigma", code: "E7023", capacity: "500ml", cas: "64-17-5", grade: "ACS" },
    { category: "시약", name: "Methanol", maker: "Daejung", code: "M100", capacity: "1L", cas: "67-56-1", grade: "EP" },
    { category: "초자", name: "비커", maker: "Pyrex", code: "B100", capacity: "500ml", cas: "-", grade: "-" },
    { category: "안전용품", name: "니트릴 장갑", maker: "Ansell", code: "N200", capacity: "100매", cas: "-", grade: "-" }
  ],

  saveCollectedMeta() {
    try {
      localStorage.setItem("reagent_collected_meta", JSON.stringify(this.collectedMeta || {}));
    } catch (_) {}
  },

  loadCollectedMeta() {
    try {
      this.collectedMeta = JSON.parse(localStorage.getItem("reagent_collected_meta") || "{}");
    } catch (_) {
      this.collectedMeta = {};
    }
  },

  saveSelectedKeys() {
    try {
      localStorage.setItem("reagent_selected_keys", JSON.stringify(this.selectedKeys || []));
    } catch (_) {}
  },

  loadSelectedKeys() {
    try {
      this.selectedKeys = JSON.parse(localStorage.getItem("reagent_selected_keys") || "[]");
    } catch (_) {
      this.selectedKeys = [];
    }
  },

  populateMakerOptions() {
    const { els } = window.ReagentApp;
    if (!els.searchMaker) return;

    const makers = [...new Set(this.mockProducts.map((p) => p.maker).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "ko")
    );

    els.searchMaker.innerHTML =
      `<option value="">전체</option>` +
      makers.map((maker) => `<option value="${this.attr(maker)}">${this.html(maker)}</option>`).join("");
  },

  openSearchModal() {
    const { els } = window.ReagentApp;
    if (!els.searchModal) return;
    els.searchModal.classList.add("show");
    this.renderSearchResults();
    setTimeout(() => {
      els.searchInput?.focus();
    }, 0);
  },

  closeSearchModal() {
    const { els } = window.ReagentApp;
    els.searchModal?.classList.remove("show");
  },

  renderSearchResults() {
    const { els } = window.ReagentApp;
    if (!els.searchResults) return;

    const keyword = (els.searchInput?.value || "").trim().toLowerCase();
    const category = els.searchCategory?.value || "";
    const maker = els.searchMaker?.value || "";
    const sortMode = els.sortMode?.value || "relevance";

    let results = [...this.mockProducts];

    if (keyword) {
      results = results.filter((p) =>
        [p.category, p.name, p.maker, p.code, p.capacity, p.cas, p.grade]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      );
    }

    if (category) {
      results = results.filter((p) => p.category === category);
    }

    if (maker) {
      results = results.filter((p) => p.maker === maker);
    }

    if (sortMode === "name") {
      results.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else if (sortMode === "maker") {
      results.sort((a, b) => a.maker.localeCompare(b.maker, "ko"));
    }

    if (els.resultInfo) {
      els.resultInfo.textContent = `검색 결과 ${results.length}건`;
    }

    if (!results.length) {
      els.searchResults.innerHTML = `<div class="empty">검색 결과가 없습니다.</div>`;
      return;
    }

    els.searchResults.innerHTML = results.map((p, idx) => `
      <div class="result-item" data-result-idx="${idx}">
        <div class="result-title">${this.html(p.name)}</div>
        <div class="meta">
          <span>${this.html(p.category)}</span>
          <span>${this.html(p.maker)}</span>
          <span>${this.html(p.code)}</span>
          <span>${this.html(p.capacity)}</span>
          <span>${this.html(p.cas)}</span>
          <span>${this.html(p.grade)}</span>
        </div>
      </div>
    `).join("");

    els.searchResults.querySelectorAll("[data-result-idx]").forEach((item) => {
      item.addEventListener("click", () => {
        const idx = Number(item.dataset.resultIdx);
        const product = results[idx];
        this.selectProduct(product);
      });
    });
  },

  selectProduct(product) {
    const { els, setValue, toast } = window.ReagentApp;
    if (!product) return;

    setValue(els.category, product.category || "");
    setValue(els.productName, product.name || "");
    setValue(els.maker, product.maker || "");
    setValue(els.code, product.code || "");
    setValue(els.capacity, product.capacity || "");
    setValue(els.cas, product.cas || "");
    setValue(els.grade, product.grade || "");

    this.closeSearchModal();
    toast("제품이 선택되었습니다.", "success");
  },

  clearForm() {
    const { els, setValue } = window.ReagentApp;
    setValue(els.category, "");
    setValue(els.productName, "");
    setValue(els.maker, "");
    setValue(els.code, "");
    setValue(els.capacity, "");
    setValue(els.cas, "");
    setValue(els.grade, "");
    setValue(els.qty, "");
    setValue(els.usage, "");
  },

  async addCurrentItem() {
    const { els, toast } = window.ReagentApp;

    const productName = (els.productName?.value || "").trim();
    const qty = Number(els.qty?.value || 0);
    const usage = (els.usage?.value || "").trim();

    if (!productName) {
      toast("제품검색으로 품목을 먼저 선택하세요.", "warn");
      return;
    }

    if (!qty || qty < 1) {
      toast("수량을 1 이상 입력하세요.", "warn");
      return;
    }

    if (!usage) {
      toast("용도를 입력하세요.", "warn");
      return;
    }

    const row = {
      id: Date.now(),
      category: els.category?.value || "",
      name: productName,
      maker: els.maker?.value || "",
      code: els.code?.value || "",
      capacity: els.capacity?.value || "",
      cas: els.cas?.value || "",
      grade: els.grade?.value || "",
      qty,
      usage,
      team: "미지정팀",
      requester: "미지정",
      created_at: new Date().toISOString()
    };

    this.requestRows.push(row);
    this.clearForm();
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    toast("신청이 저장되었습니다.", "success");
  },

  clearAllRows() {
    this.requestRows = [];
    this.selectedKeys = [];
    this.collectedMeta = {};
    this.saveSelectedKeys();
    this.saveCollectedMeta();
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.toast("전체 데이터가 비워졌습니다.", "success");
  },

  insertSample() {
    const now = Date.now();
    this.requestRows.push(
      {
        id: now + 1,
        category: "시약",
        name: "Ethanol",
        maker: "Sigma",
        code: "E7023",
        capacity: "500ml",
        cas: "64-17-5",
        grade: "ACS",
        qty: 2,
        usage: "전처리용",
        team: "연구1팀",
        requester: "홍길동",
        created_at: new Date().toISOString()
      },
      {
        id: now + 2,
        category: "시약",
        name: "Ethanol",
        maker: "Sigma",
        code: "E7023",
        capacity: "500ml",
        cas: "64-17-5",
        grade: "ACS",
        qty: 1,
        usage: "분석용",
        team: "연구2팀",
        requester: "김민수",
        created_at: new Date().toISOString()
      },
      {
        id: now + 3,
        category: "초자",
        name: "비커",
        maker: "Pyrex",
        code: "B100",
        capacity: "500ml",
        cas: "-",
        grade: "-",
        qty: 3,
        usage: "실험용",
        team: "연구1팀",
        requester: "이수진",
        created_at: new Date().toISOString()
      }
    );

    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.toast("샘플 3건이 추가되었습니다.", "success");
  },

  async fetchData() {
    this.loadSelectedKeys();
    this.loadCollectedMeta();
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
  },

  groupItems(rows) {
    const grouped = {};

    rows.forEach((row) => {
      const key = [
        row.category || "",
        row.name || "",
        row.maker || "",
        row.code || "",
        row.capacity || "",
        row.cas || "",
        row.grade || ""
      ].join("||");

      if (!grouped[key]) {
        grouped[key] = {
          key,
          category: row.category || "",
          name: row.name || "",
          maker: row.maker || "",
          code: row.code || "",
          capacity: row.capacity || "",
          cas: row.cas || "",
          grade: row.grade || "",
          entries: [],
          totalQty: 0,
          collectedQty: Number(this.collectedMeta[key] || 0),
          newQty: 0
        };
      }

      grouped[key].entries.push(row);
      grouped[key].totalQty += Number(row.qty || 0);
    });

    Object.values(grouped).forEach((group) => {
      group.newQty = Math.max(0, group.totalQty - group.collectedQty);
    });

    return Object.values(grouped);
  },

  splitEntryStatus(group) {
    let remainCollected = Number(this.collectedMeta[group.key] || 0);

    return group.entries.map((entry) => {
      const qty = Number(entry.qty || 0);
      let rowStatus = "신청";

      if (remainCollected > 0) {
        if (remainCollected >= qty) {
          rowStatus = "취합완료";
          remainCollected -= qty;
        } else {
          rowStatus = "추가신청건";
          remainCollected = 0;
        }
      } else {
        rowStatus = Number(this.collectedMeta[group.key] || 0) > 0 ? "추가신청건" : "신청";
      }

      return { ...entry, rowStatus };
    });
  },

  getGroupActionLabel(group) {
    if (group.collectedQty > 0 && group.newQty === 0) return "취합완료";
    if (group.collectedQty > 0 && group.newQty > 0) return "추가신청건";
    return "-";
  },

  toggleDetail(key) {
    const detailRow = document.querySelector(`.detail-row[data-detail-key="${this.cssEscape(key)}"]`);
    if (!detailRow) return;
    detailRow.style.display = detailRow.style.display === "none" ? "" : "none";
  },

  editItem(id) {
    const row = this.requestRows.find((r) => Number(r.id) === Number(id));
    if (!row) return;

    const newQty = prompt("수량 수정", String(row.qty));
    if (newQty === null) return;

    const newUsage = prompt("용도 수정", row.usage || "");
    if (newUsage === null) return;

    row.qty = Number(newQty || row.qty);
    row.usage = newUsage;
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.toast("수정되었습니다.", "success");
  },

  deleteItem(id) {
    if (!confirm("삭제하시겠습니까?")) return;

    this.requestRows = this.requestRows.filter((r) => Number(r.id) !== Number(id));
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.toast("삭제되었습니다.", "success");
  },

  renderRequest() {
    const { els } = window.ReagentApp;
    if (!els.draftTableBody) return;

    const groups = this.groupItems(this.requestRows).sort((a, b) => {
      // 미취합건 / 추가신청건(체크박스가 열려있는 항목)을 위로,
      // 취합완료건(체크박스 잠김)을 아래로 정렬합니다.
      const getPriority = (group) => {
        const isCompletedOnly = group.collectedQty > 0 && group.newQty === 0;
        const isAdditional = group.collectedQty > 0 && group.newQty > 0;

        if (!isCompletedOnly) return 0; // 미취합 또는 추가신청건
        if (isAdditional) return 0;
        return 1; // 취합완료
      };

      const priorityDiff = getPriority(a) - getPriority(b);
      if (priorityDiff !== 0) return priorityDiff;

      return [a.category, a.name, a.maker, a.code].join(" ").localeCompare(
        [b.category, b.name, b.maker, b.code].join(" "),
        "ko"
      );
    });

    if (!groups.length) {
      els.draftTableBody.innerHTML = `<tr><td colspan="12" class="empty">데이터 없음</td></tr>`;
      if (els.sumDraftCount) els.sumDraftCount.textContent = "0";
      if (els.sumReagent) els.sumReagent.textContent = "0";
      if (els.sumGlass) els.sumGlass.textContent = "0";
      if (els.sumSafety) els.sumSafety.textContent = "0";
      if (els.draftCountBadge) els.draftCountBadge.textContent = "통합 항목 0건";
      return;
    }

    els.draftTableBody.innerHTML = groups.map((group) => {
      const isCompletedOnly = group.collectedQty > 0 && group.newQty === 0;
      const isAdditional = group.collectedQty > 0 && group.newQty > 0;

      let checked = "";
      let disabled = "";

      if (isCompletedOnly) {
        checked = "checked";
        disabled = "disabled";
      } else if (!isAdditional) {
        checked = this.selectedKeys.includes(group.key) ? "checked" : "";
      }

      const detailRows = this.splitEntryStatus(group).map((item) => {
        const isLocked = item.rowStatus === "취합완료";

        return `
          <tr>
            <td>${item.id}</td>
            <td>${this.html(item.team)} / ${this.html(item.requester)}</td>
            <td>${this.html(item.name)}</td>
            <td>${item.qty}</td>
            <td>${this.html(item.usage)}</td>
            <td>${this.html(item.rowStatus)}</td>
            <td>
              ${
                isLocked
                  ? `<span style="color:#94a3b8;">잠김</span>`
                  : `
                    <button type="button" class="ghost-btn detail-edit-btn" data-id="${item.id}">수정</button>
                    <button type="button" class="ghost-btn detail-delete-btn" data-id="${item.id}">삭제</button>
                  `
              }
            </td>
          </tr>
        `;
      }).join("");

      return `
        <tr>
          <td>
            <input type="checkbox" class="request-check" data-key="${this.attr(group.key)}" ${checked} ${disabled}>
          </td>
          <td>${this.html(group.category)}</td>
          <td>${this.html(group.name)}</td>
          <td>${this.html(group.maker)}</td>
          <td>${this.html(group.code)}</td>
          <td>${this.html(group.capacity)}</td>
          <td>${this.html(group.cas)}</td>
          <td>${this.html(group.grade)}</td>
          <td>
            ${group.collectedQty > 0 ? `완료 ${group.collectedQty}<br>` : ""}
            ${group.newQty > 0 ? `추가 ${group.newQty}` : ""}
            ${group.collectedQty === 0 ? `${group.totalQty}` : ""}
          </td>
          <td>
            <button type="button" class="ghost-btn detail-toggle-btn" data-key="${this.attr(group.key)}">
              ${group.entries.length}건 상세
            </button>
          </td>
          <td>${this.html(group.entries.map((e) => e.usage).join(" / "))}</td>
          <td>${this.html(this.getGroupActionLabel(group))}</td>
        </tr>
        <tr class="detail-row" data-detail-key="${this.attr(group.key)}" style="display:none;">
          <td colspan="12">
            <div style="padding:12px; background:#f8fafc; border-radius:12px;">
              <table style="width:100%; min-width:0;">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>신청자</th>
                    <th>품명</th>
                    <th>수량</th>
                    <th>용도</th>
                    <th>상태</th>
                    <th>작업</th>
                  </tr>
                </thead>
                <tbody>${detailRows}</tbody>
              </table>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll(".request-check").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        const key = e.target.dataset.key;
        const group = groups.find((g) => g.key === key);
        if (!group) return;

        const isCompletedOnly = group.collectedQty > 0 && group.newQty === 0;
        if (isCompletedOnly) {
          e.target.checked = true;
          return;
        }

        if (e.target.checked) {
          if (!this.selectedKeys.includes(key)) this.selectedKeys.push(key);
        } else {
          this.selectedKeys = this.selectedKeys.filter((k) => k !== key);
        }

        this.saveSelectedKeys();
      });
    });

    document.querySelectorAll(".detail-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.toggleDetail(btn.dataset.key));
    });

    document.querySelectorAll(".detail-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.editItem(Number(btn.dataset.id)));
    });

    document.querySelectorAll(".detail-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.deleteItem(Number(btn.dataset.id)));
    });

    if (els.sumDraftCount) els.sumDraftCount.textContent = String(groups.length);
    if (els.sumReagent) els.sumReagent.textContent = String(groups.filter((g) => g.category === "시약").length);
    if (els.sumGlass) els.sumGlass.textContent = String(groups.filter((g) => g.category === "초자").length);
    if (els.sumSafety) els.sumSafety.textContent = String(groups.filter((g) => g.category === "안전용품").length);
    if (els.draftCountBadge) els.draftCountBadge.textContent = `통합 항목 ${groups.length}건`;
  },

  html(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  },

  attr(value) {
    return this.html(value);
  },

  cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }
};
