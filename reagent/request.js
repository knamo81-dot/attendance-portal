window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.request = {
  requestRows: [],
  selectedKeys: [],
  collectedMeta: {},

  saveRequestRows() {
    try {
      localStorage.setItem("reagent_request_rows", JSON.stringify(this.requestRows || []));
    } catch (_) {}
  },

  loadRequestRows() {
    try {
      const rows = JSON.parse(localStorage.getItem("reagent_request_rows") || "[]");
      this.requestRows = Array.isArray(rows) ? rows : [];
    } catch (_) {
      this.requestRows = [];
    }
  },

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

  getMonthKey(date = new Date(), offset = 0) {
    const d = new Date(date.getFullYear(), date.getMonth() + offset, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  },

  formatOrderMonthLabel(monthKey) {
    const [yyyy, mm] = String(monthKey || "").split("-");
    if (!yyyy || !mm) return monthKey || "";
    return `${yyyy}년 ${Number(mm)}월`;
  },

  getOrderMonthDescription(monthKey) {
    const [, mm] = String(monthKey || "").split("-");
    const month = Number(mm || 0);
    if (!month) return "선택한 주문월에 발주할 품목을 신청합니다.";
    return `${month}월 주문건은 전월 신청분과 ${month}월 추가신청분을 함께 취합할 수 있습니다.`;
  },

  getCurrentOrderMonth() {
    const saved = localStorage.getItem("reagent_order_month");
    return saved || this.getMonthKey(new Date(), 1);
  },

  setCurrentOrderMonth(monthKey) {
    if (!monthKey) return;

    try {
      localStorage.setItem("reagent_order_month", monthKey);
    } catch (_) {}

    const requestSelect = document.getElementById("orderMonthSelect");
    const collectSelect = document.getElementById("collectOrderMonthSelect");
    const prepareSelect = document.getElementById("prepareOrderMonthSelect");
    const requestDesc = document.getElementById("orderMonthDesc");
    const collectDesc = document.getElementById("collectOrderMonthDesc");
    const prepareDesc = document.getElementById("prepareOrderMonthDesc");

    [requestSelect, collectSelect, prepareSelect].forEach((select) => {
      if (select && select.value !== monthKey) select.value = monthKey;
    });

    const desc = this.getOrderMonthDescription(monthKey);
    if (requestDesc) requestDesc.textContent = desc;
    if (collectDesc) collectDesc.textContent = `선택한 주문월 기준으로 취합합니다. ${desc}`;
    if (prepareDesc) prepareDesc.textContent = `선택한 주문월의 거래처 확정 자료를 기안서/비교견적서 형태로 정리합니다. ${desc}`;

    this.renderRequest?.();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
  },

  initOrderMonthControls() {
    const requestSelect = document.getElementById("orderMonthSelect");
    const collectSelect = document.getElementById("collectOrderMonthSelect");
    const prepareSelect = document.getElementById("prepareOrderMonthSelect");
    const selects = [requestSelect, collectSelect, prepareSelect].filter(Boolean);

    if (!selects.length) return;

    const currentMonth = this.getMonthKey(new Date(), 0);
    const nextMonth = this.getMonthKey(new Date(), 1);
    const selectedMonth = this.getCurrentOrderMonth();

    const months = Array.from(new Set([currentMonth, nextMonth, selectedMonth]));

    selects.forEach((select) => {
      select.innerHTML = months
        .map((month) => `<option value="${this.attr(month)}">${this.html(this.formatOrderMonthLabel(month))}</option>`)
        .join("");

      select.value = selectedMonth;
      select.onchange = (e) => this.setCurrentOrderMonth(e.target.value);
    });

    const requestDesc = document.getElementById("orderMonthDesc");
    const collectDesc = document.getElementById("collectOrderMonthDesc");
    const prepareDesc = document.getElementById("prepareOrderMonthDesc");
    const desc = this.getOrderMonthDescription(selectedMonth);

    if (requestDesc) requestDesc.textContent = desc;
    if (collectDesc) collectDesc.textContent = `선택한 주문월 기준으로 취합합니다. ${desc}`;
    if (prepareDesc) prepareDesc.textContent = `선택한 주문월의 거래처 확정 자료를 기안서/비교견적서 형태로 정리합니다. ${desc}`;
  },

  getRowsForCurrentOrderMonth() {
    const month = this.getCurrentOrderMonth();
    return this.requestRows.filter((row) => (row.order_month || month) === month);
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


  getCurrentUser() {
    const user = window.ReagentApp.currentUser || {};

    return {
      employee_no: user.employee_no || user.employeeNo || "",
      name: user.name || user.user_name || user.userName || "미지정",
      team: user.team || "미지정팀",
      department: user.department || "",
      position: user.position || "",
      role: user.role || ""
    };
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

    const orderMonth = this.getCurrentOrderMonth();

    const itemKey = [
      orderMonth,
      els.category?.value || "",
      productName,
      els.maker?.value || "",
      els.code?.value || "",
      els.capacity?.value || "",
      els.cas?.value || "",
      els.grade?.value || ""
    ].join("||");

    let collectMeta = window.ReagentApp.collect?.collectMeta || {};

    try {
      const storedCollectMeta = JSON.parse(localStorage.getItem("reagent_collect_meta") || "{}");
      collectMeta = { ...storedCollectMeta, ...collectMeta };
    } catch (_) {}

    const isConfirmed = collectMeta[itemKey]?.confirmed === true;

    if (isConfirmed) {
      toast(
        "이미 거래처 확정이 완료된 품목입니다.\n추가 신청이 필요한 경우 제품취합 담당자에게 확정 취소를 요청해 주세요.",
        "warn"
      );
      return;
    }

    const currentUser = this.getCurrentUser();

    const row = {
      order_month: orderMonth,
      category: els.category?.value || "",
      name: productName,
      maker: els.maker?.value || "",
      code: els.code?.value || "",
      capacity: els.capacity?.value || "",
      cas: els.cas?.value || "",
      grade: els.grade?.value || "",
      qty,
      usage,
      employee_no: currentUser.employee_no,
      department: currentUser.department,
      team: currentUser.team,
      requester: currentUser.name,
      position: currentUser.position,
      role: currentUser.role,
      status: "신청"
    };

    const sb = window.ReagentApp.sb;

    if (!sb) {
      toast("Supabase 연결 정보가 없습니다. supabase.js 로딩을 확인하세요.", "warn");
      return;
    }

    const { data, error } = await sb
      .from("reagent_requests")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("신청 저장 실패:", error);
      toast(`서버 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.requestRows.unshift(data);
    this.clearForm();
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
    toast("신청이 서버에 저장되었습니다.", "success");
  },

  async clearAllRows(options = {}) {
    const skipConfirm = options.skipConfirm === true;

    if (!skipConfirm) {
      const ok = confirm(
        "신청 목록과 취합 상태를 모두 삭제합니다.\n\n서버 데이터까지 모두 비우시겠습니까?"
      );
      if (!ok) return;
    }

    const sb = window.ReagentApp.sb;

    if (sb) {
      const { error: collectDeleteError } = await sb
        .from("reagent_collect_items")
        .delete()
        .neq("id", 0);

      if (collectDeleteError) {
        console.error("취합 데이터 전체 삭제 실패:", collectDeleteError);
        window.ReagentApp.toast?.(`취합 서버 데이터 삭제 실패: ${collectDeleteError.message || "원인을 확인하세요."}`, "warn");
        return;
      }

      const { error } = await sb
        .from("reagent_requests")
        .delete()
        .neq("id", 0);

      if (error) {
        console.error("전체 삭제 실패:", error);
        window.ReagentApp.toast?.(`서버 데이터 삭제 실패: ${error.message || "원인을 확인하세요."}`, "warn");
        return;
      }
    }

    this.requestRows = [];
    this.selectedKeys = [];
    this.collectedMeta = {};

    localStorage.removeItem("reagent_request_rows");
    localStorage.removeItem("reagent_selected_keys");
    localStorage.removeItem("reagent_collected_meta");
    localStorage.removeItem("reagent_collect_meta");
    localStorage.removeItem("reagent_collect_selected_keys");
    localStorage.removeItem("reagent_prepare_month_status");

    this.saveSelectedKeys();
    this.saveCollectedMeta();
    window.ReagentApp.collect && (window.ReagentApp.collect.collectMeta = {});
    window.ReagentApp.collect && (window.ReagentApp.collect.selectedKeys = []);

    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
    window.ReagentApp.toast("전체 데이터가 비워졌습니다.", "success");
  },

  async clearUncollectedRows(options = {}) {
    const skipConfirm = options.skipConfirm === true;

    if (!skipConfirm) {
      const ok = confirm(
        "취합완료되지 않은 신청건만 삭제합니다.\n\n추가신청건/미취합건을 삭제하시겠습니까?"
      );
      if (!ok) return;
    }

    const groups = this.groupItems(this.requestRows);
    const completedKeys = new Set(
      groups
        .filter((group) => group.collectedQty > 0 && group.newQty === 0)
        .map((group) => group.key)
    );

    const deleteIds = [];
    const remainRows = [];

    this.requestRows.forEach((row) => {
      const key = [
        row.order_month || this.getCurrentOrderMonth(),
        row.category || "",
        row.name || "",
        row.maker || "",
        row.code || "",
        row.capacity || "",
        row.cas || "",
        row.grade || ""
      ].join("||");

      if (completedKeys.has(key)) {
        remainRows.push(row);
      } else if (row.id) {
        deleteIds.push(row.id);
      }
    });

    const sb = window.ReagentApp.sb;

    if (sb && deleteIds.length) {
      const { error } = await sb
        .from("reagent_requests")
        .delete()
        .in("id", deleteIds);

      if (error) {
        console.error("미취합/추가신청 삭제 실패:", error);
        window.ReagentApp.toast?.(`서버 데이터 삭제 실패: ${error.message || "원인을 확인하세요."}`, "warn");
        return;
      }
    }

    this.requestRows = remainRows;
    this.selectedKeys = this.selectedKeys.filter((key) => completedKeys.has(key));

    Object.keys(this.collectedMeta || {}).forEach((key) => {
      if (!completedKeys.has(key)) delete this.collectedMeta[key];
    });

    this.saveSelectedKeys();
    this.saveCollectedMeta();
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
    window.ReagentApp.toast("취합완료 건만 남기고 정리했습니다.", "success");
  },

  openClearDataDialog() {
    const choice = prompt(
      "삭제 옵션을 선택하세요.\n\n1. 전체 삭제\n2. 취합제외 삭제(미취합/추가신청건만 삭제)\n\n숫자 1 또는 2를 입력하세요."
    );

    if (choice === null || String(choice).trim() === "") return;

    const normalized = String(choice).trim();

    if (normalized === "1") {
      this.clearAllRows();
      return;
    }

    if (normalized === "2") {
      this.clearUncollectedRows();
      return;
    }

    window.ReagentApp.toast?.("삭제 옵션은 1 또는 2만 입력할 수 있습니다.", "warn");
  },

  async insertSample() {
    const orderMonth = this.getCurrentOrderMonth();
    const sampleRows = [
      {
        order_month: orderMonth,
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
        status: "신청"
      },
      {
        order_month: orderMonth,
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
        status: "신청"
      },
      {
        order_month: orderMonth,
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
        status: "신청"
      }
    ];

    const sb = window.ReagentApp.sb;

    if (!sb) {
      window.ReagentApp.toast?.("Supabase 연결 정보가 없습니다.", "warn");
      return;
    }

    const { data, error } = await sb
      .from("reagent_requests")
      .insert(sampleRows)
      .select();

    if (error) {
      console.error("샘플 저장 실패:", error);
      window.ReagentApp.toast?.(`샘플 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.requestRows = [...(data || []), ...this.requestRows];
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
    window.ReagentApp.toast("샘플 3건이 서버에 추가되었습니다.", "success");
  },

  async fetchData() {
    this.initOrderMonthControls();

    const sb = window.ReagentApp.sb;

    if (!sb) {
      window.ReagentApp.toast?.("Supabase 연결 정보가 없습니다. supabase.js 로딩을 확인하세요.", "warn");
      this.requestRows = [];
      this.collectedMeta = {};
    } else {
      const { data, error } = await sb
        .from("reagent_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("신청 목록 조회 실패:", error);
        window.ReagentApp.toast?.(`서버 데이터를 불러오지 못했습니다: ${error.message || "원인을 확인하세요."}`, "warn");
        this.requestRows = [];
      } else {
        this.requestRows = data || [];
      }

      const { data: collectData, error: collectError } = await sb
        .from("reagent_collect_items")
        .select("*");

      if (collectError) {
        console.error("취합 목록 조회 실패:", collectError);
        window.ReagentApp.toast?.(`취합 데이터를 불러오지 못했습니다: ${collectError.message || "원인을 확인하세요."}`, "warn");
        this.collectedMeta = {};
      } else {
        this.collectedMeta = {};
        (collectData || []).forEach((row) => {
          if (row.item_key) this.collectedMeta[row.item_key] = Number(row.collected_qty || 0);
        });

        const collect = window.ReagentApp.collect;
        if (collect) {
          collect.collectMeta = collect.collectMeta || {};
          (collectData || []).forEach((row) => {
            if (!row.item_key) return;
            const meta = collect.getMeta ? collect.getMeta(row.item_key) : (collect.collectMeta[row.item_key] || {});
            meta.confirmed = row.confirmed === true;
            meta.confirmedQty = Number(row.collected_qty || 0);
            collect.collectMeta[row.item_key] = meta;
          });
        }
      }
    }

    this.loadSelectedKeys();
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
  },

  groupItems(rows) {
    const grouped = {};

    rows.forEach((row) => {
      const orderMonth = row.order_month || this.getCurrentOrderMonth();
      const key = [
        orderMonth,
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
          order_month: orderMonth,
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
      group.entries.sort((a, b) => {
        const at = new Date(a.created_at || a.id || 0).getTime();
        const bt = new Date(b.created_at || b.id || 0).getTime();
        if (Number.isNaN(at) && Number.isNaN(bt)) return Number(a.id || 0) - Number(b.id || 0);
        if (Number.isNaN(at)) return 1;
        if (Number.isNaN(bt)) return -1;
        return at - bt || Number(a.id || 0) - Number(b.id || 0);
      });
      group.newQty = Math.max(0, group.totalQty - group.collectedQty);
      group.isConfirmed = Boolean(window.ReagentApp.collect?.collectMeta?.[group.key]?.confirmed);
    });

    return Object.values(grouped);
  },

  splitEntryStatus(group) {
    let remainCollected = Number(this.collectedMeta[group.key] || 0);

    return group.entries.map((entry) => {
      const qty = Number(entry.qty || 0);
      let rowStatus = "신청";

      if (remainCollected > 0 && remainCollected >= qty) {
        rowStatus = "취합완료";
        remainCollected -= qty;
      } else if (Number(this.collectedMeta[group.key] || 0) > 0) {
        rowStatus = "추가신청건";
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

  async editItem(id) {
    const row = this.requestRows.find((r) => Number(r.id) === Number(id));
    if (!row) return;

    const newQty = prompt("수량 수정", String(row.qty));
    if (newQty === null) return;

    const newUsage = prompt("용도 수정", row.usage || "");
    if (newUsage === null) return;

    const nextQty = Number(newQty || row.qty);
    const nextUsage = newUsage;

    const sb = window.ReagentApp.sb;

    if (sb) {
      const { data, error } = await sb
        .from("reagent_requests")
        .update({ qty: nextQty, usage: nextUsage })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("수정 실패:", error);
        window.ReagentApp.toast?.(`서버 수정 실패: ${error.message || "원인을 확인하세요."}`, "warn");
        return;
      }

      Object.assign(row, data);
    } else {
      row.qty = nextQty;
      row.usage = nextUsage;
    }

    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
    window.ReagentApp.toast("수정되었습니다.", "success");
  },

  async deleteItem(id) {
    if (!confirm("삭제하시겠습니까?")) return;

    const sb = window.ReagentApp.sb;

    if (sb) {
      const { error } = await sb
        .from("reagent_requests")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("삭제 실패:", error);
        window.ReagentApp.toast?.(`서버 삭제 실패: ${error.message || "원인을 확인하세요."}`, "warn");
        return;
      }
    }

    this.requestRows = this.requestRows.filter((r) => Number(r.id) !== Number(id));
    this.renderRequest();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
    window.ReagentApp.toast("삭제되었습니다.", "success");
  },

  renderRequest() {
    const { els } = window.ReagentApp;
    if (!els.draftTableBody) return;

    const groups = this.groupItems(this.getRowsForCurrentOrderMonth()).sort((a, b) => {
      const getPriority = (group) => {
        const isCompletedOnly = group.collectedQty > 0 && group.newQty === 0;
        return isCompletedOnly ? 1 : 0;
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
      const isVendorConfirmed = group.isConfirmed === true;

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
        const isPending = item.rowStatus === "추가신청건";
        const statusClass = isLocked ? "request-detail-collected" : (isPending ? "request-detail-pending" : "");
        const qtyClass = isVendorConfirmed
          ? (isLocked ? "qty-confirmed" : (isPending ? "qty-pending" : ""))
          : "";
        const statusTextClass = isVendorConfirmed
          ? (isLocked ? "qty-confirmed" : (isPending ? "qty-pending" : ""))
          : "";

        return `
          <tr class="${statusClass}">
            <td>${this.formatDateTime(item.created_at || item.id)}</td>
            <td>${this.html(item.team)} / ${this.html(item.requester)}</td>
            <td>${this.html(item.name)}</td>
            <td><span class="${qtyClass}">${item.qty}</span></td>
            <td>${this.html(item.usage)}</td>
            <td><span class="${statusTextClass}">${this.html(item.rowStatus)}</span></td>
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
        <tr class="${isCompletedOnly ? "request-row-collected" : ""}">
          <td>
            <input type="checkbox" class="request-check" data-key="${this.attr(group.key)}" ${checked} ${disabled}>
          </td>
          <td>${this.html(group.category)}</td>
          <td>${this.html(group.name)}</td>
          <td>${this.html(group.maker)}</td>
          <td>${this.html(group.code)}</td>
          <td>${this.html(group.cas)}</td>
          <td>${this.html(group.grade)}</td>
          <td>${this.html(group.capacity)}</td>
          <td>
            ${
              group.collectedQty === 0
                ? `${group.totalQty}`
                : isVendorConfirmed
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
              <table style="width:100%; min-width:0; table-layout:fixed;">
                <colgroup>
                  <col style="width:150px;">
                  <col style="width:170px;">
                  <col style="width:28%;">
                  <col style="width:80px;">
                  <col style="width:30%;">
                  <col style="width:110px;">
                  <col style="width:120px;">
                </colgroup>
                <thead>
                  <tr>
                    <th>신청일자</th>
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

  formatDateTime(value) {
    const raw = value?.created_at || value?.id || value;
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) return "-";

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
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
