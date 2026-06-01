window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.request = {
  requestRows: [],
  selectedKeys: [],
  collectedMeta: {},
  productMasterRows: [],
  productMasterLoadedAt: 0,
  myRegistrationRequests: [],
  activeRequestPanel: "list",

  getCompanyId() {
    if (typeof window.ReagentApp.getCompanyId === "function") {
      return window.ReagentApp.getCompanyId() || "";
    }

    try {
      const session = window.parent?.portalSession || window.portalSession || {};
      return String(session.companyId || session.company_id || session.company?.id || session.company?.company_id || "").trim();
    } catch (_) {
      return "";
    }
  },

  withCompanyPayload(row = {}) {
    if (typeof window.ReagentApp.withCompanyPayload === "function") {
      return window.ReagentApp.withCompanyPayload(row);
    }

    const companyId = this.getCompanyId();
    return companyId ? { ...row, company_id: companyId } : { ...row };
  },

  withCompanyRows(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row) => this.withCompanyPayload(row));
  },

  scopedCompanyQuery(query) {
    if (typeof window.ReagentApp.scopedCompanyQuery === "function") {
      return window.ReagentApp.scopedCompanyQuery(query);
    }

    const companyId = this.getCompanyId();
    return companyId ? query.eq("company_id", companyId) : query;
  },

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

  normalizeProductRow(row = {}) {
    return {
      id: row.id || "",
      category: row.category || "",
      name: row.name || "",
      maker: row.maker || "",
      code: row.code || "",
      capacity: row.capacity || "",
      cas: row.cas || "",
      grade: row.grade || "",
      default_vendor: row.default_vendor || "",
      default_vendor_reason: row.default_vendor_reason || "",
      memo: row.memo || "",
      is_active: row.is_active !== false
    };
  },

  async loadProductMaster(force = false) {
    const now = Date.now();
    const cacheMs = 1000 * 60 * 3;

    if (!force && this.productMasterRows.length && now - this.productMasterLoadedAt < cacheMs) {
      return this.productMasterRows;
    }

    const sb = window.ReagentApp.sb;

    if (!sb) {
      this.productMasterRows = this.mockProducts.map((row) => this.normalizeProductRow(row));
      this.productMasterLoadedAt = now;
      return this.productMasterRows;
    }

    let productMasterQuery = sb
      .from("product_master")
      .select("id, category, name, maker, code, capacity, cas, grade, default_vendor, default_vendor_reason, memo, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(3000);

    productMasterQuery = this.scopedCompanyQuery(productMasterQuery);

    const { data, error } = await productMasterQuery;

    if (error) {
      console.error("제품 마스터 조회 실패:", error);
      window.ReagentApp.toast?.(`제품 마스터 조회 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      this.productMasterRows = this.mockProducts.map((row) => this.normalizeProductRow(row));
    } else {
      this.productMasterRows = (data || []).map((row) => this.normalizeProductRow(row));
    }

    this.productMasterLoadedAt = now;
    return this.productMasterRows;
  },

  filterProductMasterRows(rows = []) {
    const { els } = window.ReagentApp;
    const keyword = (els.searchInput?.value || "").trim().toLowerCase();
    const category = els.searchCategory?.value || "";
    const maker = els.searchMaker?.value || "";
    const sortMode = els.sortMode?.value || "relevance";

    let results = rows.filter((p) => p.is_active !== false);

    if (keyword) {
      results = results.filter((p) =>
        [p.category, p.name, p.maker, p.code, p.capacity, p.cas, p.grade, p.default_vendor, p.default_vendor_reason, p.memo]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      );
    }

    if (category) results = results.filter((p) => p.category === category);
    if (maker) results = results.filter((p) => p.maker === maker);

    if (sortMode === "name") {
      results.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
    } else if (sortMode === "maker") {
      results.sort((a, b) => (a.maker || "").localeCompare(b.maker || "", "ko"));
    }

    return results;
  },

  async populateMakerOptions() {
    const { els } = window.ReagentApp;
    if (!els.searchMaker) return;

    const rows = await this.loadProductMaster();
    const currentValue = els.searchMaker.value || "";
    const makers = [...new Set(rows.map((p) => p.maker).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "ko")
    );

    els.searchMaker.innerHTML =
      `<option value="">전체</option>` +
      makers.map((maker) => `<option value="${this.attr(maker)}">${this.html(maker)}</option>`).join("");

    if (currentValue && makers.includes(currentValue)) {
      els.searchMaker.value = currentValue;
    }
  },

  isMobileViewport() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  },

  isRequestFormModalOpen() {
    return !!document.getElementById("requestFormModalBackdrop")?.classList.contains("show");
  },

  hideRequestFormWhileSearching() {
    if (!this.isMobileViewport() || !this.isRequestFormModalOpen()) return false;

    const backdrop = document.getElementById("requestFormModalBackdrop");
    backdrop?.classList.add("request-search-hidden");
    backdrop?.classList.remove("show");

    document.body.classList.add("request-search-modal-open");
    document.documentElement.classList.add("request-search-modal-open");
    return true;
  },

  restoreRequestFormAfterSearching() {
    const shouldRestore = this._restoreRequestFormAfterSearch === true;
    this._restoreRequestFormAfterSearch = false;

    document.body.classList.remove("request-search-modal-open");
    document.documentElement.classList.remove("request-search-modal-open");

    const backdrop = document.getElementById("requestFormModalBackdrop");
    backdrop?.classList.remove("request-search-hidden");

    if (shouldRestore && this.isMobileViewport()) {
      document.body.classList.add("request-form-modal-open");
      document.documentElement.classList.add("request-form-modal-open");
      backdrop?.classList.add("show");
    }
  },

  async openSearchModal() {
    const { els } = window.ReagentApp;
    if (!els.searchModal) return;

    this._restoreRequestFormAfterSearch = this.hideRequestFormWhileSearching();

    document.body.classList.add("search-modal-open");
    document.documentElement.classList.add("search-modal-open");
    els.searchModal.classList.add("show");

    await this.populateMakerOptions();
    this.renderSearchResults();
    setTimeout(() => {
      els.searchInput?.focus?.({ preventScroll: true });
    }, 0);
  },

  closeSearchModal(options = {}) {
    const { els } = window.ReagentApp;
    els.searchModal?.classList.remove("show");

    document.body.classList.remove("search-modal-open");
    document.documentElement.classList.remove("search-modal-open");

    if (options.restoreRequestForm !== false) {
      this.restoreRequestFormAfterSearching();
    }
  },

  async renderSearchResults() {
    const { els } = window.ReagentApp;
    if (!els.searchResults) return;

    // 검색 입력 시 모달 높이가 순간적으로 줄었다 늘어나는 현상을 줄이기 위해
    // 결과 영역의 최소 높이를 고정하고, 캐시가 있을 때는 로딩 문구로 전체 교체하지 않습니다.
    els.searchResults.style.minHeight = "164px";

    const searchSeq = (this._searchRenderSeq || 0) + 1;
    this._searchRenderSeq = searchSeq;

    if (!this.productMasterRows.length) {
      els.searchResults.innerHTML = `<div class="empty">제품 마스터를 조회하는 중입니다.</div>`;
    }

    const rows = await this.loadProductMaster();
    if (searchSeq !== this._searchRenderSeq) return;

    const results = this.filterProductMasterRows(rows);

    if (els.resultInfo) {
      els.resultInfo.textContent = `검색 결과 ${results.length}건`;
    }

    if (!results.length) {
      els.searchResults.innerHTML = `
        <div class="empty">
          검색 결과가 없습니다.<br/>
          <button type="button" class="btn" id="emptyRequestProduct" style="margin-top:10px;">제품 등록 요청</button>
        </div>
      `;
      document.getElementById("emptyRequestProduct")?.addEventListener("click", () => this.openRegistrationRequestDialog());
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

    // 제품마스터의 기본거래처/선정사유를 신청 저장 시 함께 넘기기 위해 보관합니다.
    this.selectedProduct = this.normalizeProductRow(product);

    this.closeSearchModal({ restoreRequestForm: true });
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
    this.selectedProduct = null;
    setValue(els.qty, "");
    setValue(els.usage, "");
  },


  getCurrentSearchDraft() {
    const { els } = window.ReagentApp;
    return {
      category: els.searchCategory?.value || els.category?.value || "",
      name: els.searchInput?.value || els.productName?.value || "",
      maker: els.searchMaker?.value || els.maker?.value || "",
      code: els.code?.value || "",
      capacity: els.capacity?.value || "",
      cas: els.cas?.value || "",
      grade: els.grade?.value || "",
      usage: els.usage?.value || ""
    };
  },

  ensureRegistrationRequestModal() {
    let modal = document.getElementById("productRegistrationRequestModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "productRegistrationRequestModal";
    modal.innerHTML = `
      <div class="modal" style="width:min(860px,100%);">
        <div class="modal-head">
          <div>
            <h3>제품 등록 요청</h3>
            <div class="small">검색되지 않는 제품을 관리자/운영자에게 등록 요청합니다.</div>
          </div>
          <button type="button" class="btn" id="closeProductRequestModal">닫기</button>
        </div>
        <div class="card-body">
          <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start;">
            <div class="field"><label>분류</label><select id="reqCategory"><option value="">선택</option><option value="시약">시약</option><option value="초자">초자</option><option value="안전용품">안전용품</option></select></div>
            <div class="field"><label>품명 <span style="color:#dc2626;">*</span></label><input id="reqName" placeholder="예: Ethanol"/></div>
            <div class="field"><label>제조사</label><input id="reqMaker" placeholder="예: Sigma"/></div>
            <div class="field"><label>제품코드</label><input id="reqCode" placeholder="예: E7023"/></div>
            <div class="field"><label>CAS</label><input id="reqCas" placeholder="예: 64-17-5"/></div>
            <div class="field"><label>등급</label><input id="reqGrade" placeholder="예: ACS"/></div>
            <div class="field"><label>규격</label><input id="reqCapacity" placeholder="예: 500 mL"/></div>
            <div class="field"><label>요청사유 / 용도</label><input id="reqUsage" placeholder="예: 효능평가 전처리용"/></div>
          </div>
          <div class="actions" style="justify-content:flex-end; margin-top:18px;">
            <button type="button" class="btn" id="cancelProductRequest">취소</button>
            <button type="button" class="btn primary" id="submitProductRequest">요청</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
      modal.classList.remove("show");
      document.body.classList.remove("registration-request-modal-open");
      document.documentElement.classList.remove("registration-request-modal-open");
    };
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("#closeProductRequestModal")?.addEventListener("click", close);
    modal.querySelector("#cancelProductRequest")?.addEventListener("click", close);
    modal.querySelector("#submitProductRequest")?.addEventListener("click", async () => { await this.submitRegistrationRequestFromModal(); });

    return modal;
  },

  setModalValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  },

  getModalValue(id) {
    return (document.getElementById(id)?.value || "").trim();
  },

  async openRegistrationRequestDialog() {
    const modal = this.ensureRegistrationRequestModal();
    const draft = this.getCurrentSearchDraft();

    this.setModalValue("reqCategory", draft.category || "");
    this.setModalValue("reqName", draft.name || "");
    this.setModalValue("reqMaker", draft.maker || "");
    this.setModalValue("reqCode", draft.code || "");
    this.setModalValue("reqCas", draft.cas || "");
    this.setModalValue("reqGrade", draft.grade || "");
    this.setModalValue("reqCapacity", draft.capacity || "");
    this.setModalValue("reqUsage", draft.usage || "");

    document.body.classList.add("registration-request-modal-open");
    document.documentElement.classList.add("registration-request-modal-open");
    modal.classList.add("show");
    setTimeout(() => document.getElementById("reqName")?.focus({ preventScroll: true }), 0);
  },

  async submitRegistrationRequestFromModal() {
    const currentUser = this.getCurrentUser();
    const row = {
      category: this.getModalValue("reqCategory"),
      name: this.getModalValue("reqName"),
      maker: this.getModalValue("reqMaker"),
      code: this.getModalValue("reqCode"),
      capacity: this.getModalValue("reqCapacity"),
      cas: this.getModalValue("reqCas"),
      grade: this.getModalValue("reqGrade"),
      usage: this.getModalValue("reqUsage"),
      requester: currentUser.name,
      team: currentUser.team
    };

    const ok = await this.createRegistrationRequest(row);
    if (!ok) return;

    document.getElementById("productRegistrationRequestModal")?.classList.remove("show");
    document.body.classList.remove("registration-request-modal-open");
    document.documentElement.classList.remove("registration-request-modal-open");
    this.closeSearchModal?.();

    await this.loadMyRegistrationRequests?.(true);
    this.setRequestPanelView?.("status");
    window.ReagentApp.productManagement?.loadRequests?.();
    return true;
  },

  async createRegistrationRequest(row) {
    const sb = window.ReagentApp.sb;

    if (!sb) {
      window.ReagentApp.toast?.("Supabase 연결 정보가 없습니다. supabase.js 로딩을 확인하세요.", "warn");
      return false;
    }

    const payload = {
      category: row.category || "",
      name: row.name || "",
      maker: row.maker || "",
      code: row.code || "",
      capacity: row.capacity || "",
      cas: row.cas || "",
      grade: row.grade || "",
      usage: row.usage || "",
      requester: row.requester || "미지정",
      team: row.team || "미지정팀",
      status: "요청"
    };

    if (!payload.name) {
      window.ReagentApp.toast?.("제품명은 필수입니다.", "warn");
      return false;
    }

    const canCreateRequest = await this.confirmProductMasterDuplicate(payload, {
      prefix: "제품 등록 요청 중 중복 가능성이 있습니다."
    });

    if (!canCreateRequest) return false;

    const { error } = await sb
      .from("product_registration_requests")
      .insert(this.withCompanyPayload(payload));

    if (error) {
      console.error("제품 등록 요청 실패:", error);
      window.ReagentApp.toast?.(`제품 등록 요청 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return false;
    }

    window.ReagentApp.toast?.("제품 등록 요청이 저장되었습니다.", "success");
    window.ReagentApp.productManagement?.loadRequests?.();
    return true;
  },


  ensureMyRegistrationRequestFilters() {
    const legacyFilter = document.getElementById("myRequestStatusFilter");
    const filterField = legacyFilter?.closest?.(".field");

    if (filterField && !document.getElementById("myRequestUnifiedStatusFilter")) {
      filterField.innerHTML = `
        <label>상태</label>
        <select id="myRequestUnifiedStatusFilter">
          <option value="">전체</option>
          <option value="요청">요청</option>
          <option value="등록">등록</option>
          <option value="반려">반려</option>
        </select>
      `;

      const periodField = document.createElement("div");
      periodField.className = "field";
      periodField.innerHTML = `
        <label>기간</label>
        <select id="myRequestPeriodFilter">
          <option value="1m">최근 1개월</option>
          <option value="3m" selected>최근 3개월</option>
          <option value="6m">최근 6개월</option>
          <option value="all">전체</option>
        </select>
      `;

      filterField.insertAdjacentElement("afterend", periodField);
    }
  },

  getRequestProgressStatus(status) {
    return this.getDisplayRequestStatus(status);
  },

  isWithinRequestPeriod(createdAt, period = "3m") {
    if (!period || period === "all") return true;

    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return true;

    const months = period === "1m" ? 1 : period === "6m" ? 6 : 3;
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    start.setHours(0, 0, 0, 0);

    return created >= start;
  },

  bindRegistrationStatusPanel() {
    this.ensureMyRegistrationRequestFilters?.();

    const listBtn = document.getElementById("showRequestListPanel");
    const statusBtn = document.getElementById("showRequestStatusPanel");
    const statusFilter = document.getElementById("myRequestUnifiedStatusFilter");
    const periodFilter = document.getElementById("myRequestPeriodFilter");
    const refresh = document.getElementById("refreshMyRegistrationRequests");

    if (listBtn && !listBtn.dataset.bound) {
      listBtn.dataset.bound = "1";
      listBtn.addEventListener("click", () => this.setRequestPanelView("list"));
    }

    if (statusBtn && !statusBtn.dataset.bound) {
      statusBtn.dataset.bound = "1";
      statusBtn.addEventListener("click", async () => {
        await this.loadMyRegistrationRequests(true);
        this.setRequestPanelView("status");
      });
    }

    [statusFilter, periodFilter].forEach((filterEl) => {
      if (filterEl && !filterEl.dataset.bound) {
        filterEl.dataset.bound = "1";
        filterEl.addEventListener("change", () => this.renderMyRegistrationRequests());
      }
    });

    if (refresh && !refresh.dataset.bound) {
      refresh.dataset.bound = "1";
      refresh.addEventListener("click", () => this.loadMyRegistrationRequests(true));
    }
  },

  setRequestPanelView(view = "list") {
    this.activeRequestPanel = view === "status" ? "status" : "list";

    const appPanel = document.getElementById("requestApplicationPanel");
    const statusPanel = document.getElementById("registrationRequestStatusPanel");
    const listBtn = document.getElementById("showRequestListPanel");
    const statusBtn = document.getElementById("showRequestStatusPanel");
    const title = document.getElementById("requestListSectionTitle");
    const desc = document.getElementById("requestListSectionDesc");
    const showStatus = this.activeRequestPanel === "status";
    if (appPanel) appPanel.style.display = showStatus ? "none" : "";
    if (statusPanel) statusPanel.style.display = showStatus ? "" : "none";

    listBtn?.classList.toggle("primary", !showStatus);
    statusBtn?.classList.toggle("primary", showStatus);

    if (title) title.textContent = showStatus ? "제품 등록 요청 현황" : "신청 목록";
    if (desc) desc.textContent = showStatus ? "내가 요청한 미등록 제품의 진행상황을 확인합니다." : "체크한 품목만 취합 탭으로 반영됩니다.";
    if (showStatus) this.renderMyRegistrationRequests();
  },

  getDisplayRequestStatus(status) {
    const value = String(status || "요청").trim();
    if (value === "등록완료") return "등록";
    if (value === "반려") return "반려";
    return "요청";
  },

  normalizeDuplicateValue(value) {
    return String(value || "").trim().toLowerCase();
  },

  async confirmProductMasterDuplicate(row = {}, options = {}) {
    const nameKey = this.normalizeDuplicateValue(row.name);
    const codeKey = this.normalizeDuplicateValue(row.code);

    if (!nameKey && !codeKey) return true;

    const masterRows = await this.loadProductMaster(true);
    const duplicateProducts = (masterRows || []).filter((product) => {
      const sameName = nameKey && this.normalizeDuplicateValue(product.name) === nameKey;
      const sameCode = codeKey && this.normalizeDuplicateValue(product.code) === codeKey;
      return sameName || sameCode;
    });

    if (!duplicateProducts.length) return true;

    const sample = duplicateProducts[0] || {};
    const sameName = nameKey && this.normalizeDuplicateValue(sample.name) === nameKey;
    const sameCode = codeKey && this.normalizeDuplicateValue(sample.code) === codeKey;
    const reasonText = [sameName ? "품명" : "", sameCode ? "제품코드" : ""].filter(Boolean).join(" / ") || "품명 또는 제품코드";
    const prefix = options.prefix || "이미 등록된 제품이 있습니다.";

    return confirm(
      `${prefix}\n\n` +
      `${reasonText}가 같은 제품이 이미 제품 마스터에 등록되어 있습니다.\n\n` +
      `기존 품명: ${sample.name || "-"}\n` +
      `기존 제품코드: ${sample.code || "-"}\n` +
      `기존 제조사: ${sample.maker || "-"}\n` +
      `중복 후보: ${duplicateProducts.length}건\n\n` +
      "그래도 계속 진행하시겠습니까?"
    );
  },

  async loadMyRegistrationRequests(force = false) {
    const sb = window.ReagentApp.sb;
    const user = this.getCurrentUser();
    const requester = user.name || "미지정";

    if (!sb) {
      this.myRegistrationRequests = [];
      this.renderMyRegistrationRequests();
      return;
    }

    let query = sb
      .from("product_registration_requests")
      .select("*")
      .order("created_at", { ascending: false });

    query = this.scopedCompanyQuery(query);

    if (requester && requester !== "미지정") {
      query = query.eq("requester", requester);
    } else if (user.team) {
      query = query.eq("team", user.team);
    }

    const { data, error } = await query;

    if (error) {
      console.error("내 제품 등록 요청 조회 실패:", error);
      window.ReagentApp.toast?.("내 제품 등록 요청 조회 실패: " + (error.message || "원인을 확인하세요."), "warn");
      this.myRegistrationRequests = [];
      this.renderMyRegistrationRequests();
      return;
    }

    this.myRegistrationRequests = Array.isArray(data) ? data : [];
    this.renderMyRegistrationRequests();
  },

  renderMyRegistrationRequests() {
    this.ensureMyRegistrationRequestFilters?.();

    const tbody = document.getElementById("myRegistrationRequestList");
    const badge = document.getElementById("myRequestStatusBadge");
    const statusFilter = document.getElementById("myRequestUnifiedStatusFilter")?.value || "";
    const periodFilter = document.getElementById("myRequestPeriodFilter")?.value || "3m";
    if (!tbody) return;

    if (!tbody.dataset.myRegistrationDelegatedBound) {
      tbody.dataset.myRegistrationDelegatedBound = "1";
      tbody.addEventListener("click", (e) => {
        const editBtn = e.target.closest(".my-registration-edit-btn");
        const deleteBtn = e.target.closest(".my-registration-delete-btn");
        const reRequestBtn = e.target.closest(".my-registration-rerequest-btn");

        if (editBtn) {
          this.openMyRegistrationRequestEditModal(Number(editBtn.dataset.id));
          return;
        }

        if (deleteBtn) {
          this.deleteMyRegistrationRequest(Number(deleteBtn.dataset.id));
          return;
        }

        if (reRequestBtn) {
          this.reRequestMyRegistrationRequest(Number(reRequestBtn.dataset.id));
        }
      });
    }

    const rows = (this.myRegistrationRequests || []).filter((row) => {
      const displayStatus = this.getDisplayRequestStatus(row.status);

      if (statusFilter && displayStatus !== statusFilter) return false;
      if (!this.isWithinRequestPeriod(row.created_at || row.id, periodFilter)) return false;

      return true;
    });

    if (badge) badge.textContent = "내 요청 " + rows.length + "건";

    if (!rows.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="11">제품 등록 요청 현황이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const status = this.getDisplayRequestStatus(row.status);
      const statusColor = status === "등록" ? "#16a34a" : (status === "반려" ? "#dc2626" : "#1d4ed8");
      const handledText = row.reject_reason || row.handled_by || "";
      return `
        <tr>
          <td>${this.html(this.formatDateTime(row.created_at || row.id))}</td>
          <td><span style="font-weight:800; color:${statusColor};">${this.html(status)}</span></td>
          <td>${this.html(row.category)}</td>
          <td>${this.html(row.name)}</td>
          <td>${this.html(row.maker)}</td>
          <td>${this.html(row.code)}</td>
          <td>${this.html(row.cas)}</td>
          <td>${this.html(row.grade)}</td>
          <td>${this.html(row.capacity)}</td>
          <td>${this.html(row.usage)}</td>
          <td>
            <div>${this.html(handledText)}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
              ${
                status === "요청"
                  ? `
                    <button type="button" class="ghost-btn my-registration-edit-btn" data-id="${row.id}">수정</button>
                    <button type="button" class="ghost-btn my-registration-delete-btn" data-id="${row.id}">삭제</button>
                  `
                  : status === "반려"
                    ? `
                      ${row.retry_created ? "" : `<button type="button" class="ghost-btn my-registration-rerequest-btn" data-id="${row.id}">재요청</button>`}
                      <button type="button" class="ghost-btn my-registration-delete-btn" data-id="${row.id}">삭제</button>
                    `
                    : ""
              }
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // 버튼 클릭은 renderMyRegistrationRequests 시작 부분의 이벤트 위임에서 처리합니다.

  },

  ensureMyRegistrationRequestEditModal() {
    let modal = document.getElementById("myRegistrationRequestEditModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "myRegistrationRequestEditModal";
    modal.innerHTML = `
      <div class="modal" style="width:min(860px,100%);">
        <div class="modal-head">
          <div>
            <h3>제품 등록 요청 수정</h3>
            <div class="small">등록 또는 반려 처리 전 요청 내용을 수정합니다.</div>
          </div>
          <button type="button" class="btn" id="closeMyReqEditModal">닫기</button>
        </div>
        <div class="card-body">
          <input type="hidden" id="myReqEditId" />
          <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start;">
            <div class="field"><label>분류</label><select id="myReqEditCategory"><option value="">선택</option><option value="시약">시약</option><option value="초자">초자</option><option value="안전용품">안전용품</option></select></div>
            <div class="field"><label>품명 <span style="color:#dc2626;">*</span></label><input id="myReqEditName" placeholder="예: Ethanol"/></div>
            <div class="field"><label>제조사</label><input id="myReqEditMaker" placeholder="예: Sigma"/></div>
            <div class="field"><label>제품코드</label><input id="myReqEditCode" placeholder="예: E7023"/></div>
            <div class="field"><label>CAS</label><input id="myReqEditCas" placeholder="예: 64-17-5"/></div>
            <div class="field"><label>등급</label><input id="myReqEditGrade" placeholder="예: ACS"/></div>
            <div class="field"><label>규격</label><input id="myReqEditCapacity" placeholder="예: 500 mL"/></div>
            <div class="field"><label>요청사유 / 용도</label><input id="myReqEditUsage" placeholder="예: 효능평가 전처리용"/></div>
          </div>
          <div class="actions" style="justify-content:flex-end; margin-top:18px;">
            <button type="button" class="btn" id="cancelMyReqEdit">취소</button>
            <button type="button" class="btn primary" id="saveMyReqEdit">수정 저장</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.classList.remove("show");
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("#closeMyReqEditModal")?.addEventListener("click", close);
    modal.querySelector("#cancelMyReqEdit")?.addEventListener("click", close);
    modal.querySelector("#saveMyReqEdit")?.addEventListener("click", () => this.saveMyRegistrationRequestEdit());

    return modal;
  },

  setMyReqEditValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  },

  getMyReqEditValue(id) {
    return String(document.getElementById(id)?.value || "").trim();
  },

  openMyRegistrationRequestEditModal(id) {
    const row = (this.myRegistrationRequests || []).find((item) => Number(item.id) === Number(id));
    if (!row) {
      window.ReagentApp.toast?.("수정할 요청을 찾지 못했습니다.", "warn");
      return;
    }

    const status = this.getDisplayRequestStatus(row.status);
    if (status !== "요청") {
      window.ReagentApp.toast?.("요청 상태에서만 수정할 수 있습니다.", "warn");
      return;
    }

    const modal = this.ensureMyRegistrationRequestEditModal();
    this.setMyReqEditValue("myReqEditId", row.id);
    this.setMyReqEditValue("myReqEditCategory", row.category || "");
    this.setMyReqEditValue("myReqEditName", row.name || "");
    this.setMyReqEditValue("myReqEditMaker", row.maker || "");
    this.setMyReqEditValue("myReqEditCode", row.code || "");
    this.setMyReqEditValue("myReqEditCas", row.cas || "");
    this.setMyReqEditValue("myReqEditGrade", row.grade || "");
    this.setMyReqEditValue("myReqEditCapacity", row.capacity || "");
    this.setMyReqEditValue("myReqEditUsage", row.usage || "");

    modal.classList.add("show");
    setTimeout(() => document.getElementById("myReqEditName")?.focus(), 0);
  },

  async saveMyRegistrationRequestEdit() {
    const sb = window.ReagentApp.sb;
    if (!sb) {
      window.ReagentApp.toast?.("Supabase 연결 정보가 없습니다.", "warn");
      return;
    }

    const id = Number(this.getMyReqEditValue("myReqEditId"));
    if (!id) {
      window.ReagentApp.toast?.("요청 ID를 찾지 못했습니다.", "warn");
      return;
    }

    const row = {
      category: this.getMyReqEditValue("myReqEditCategory"),
      name: this.getMyReqEditValue("myReqEditName"),
      maker: this.getMyReqEditValue("myReqEditMaker"),
      code: this.getMyReqEditValue("myReqEditCode"),
      capacity: this.getMyReqEditValue("myReqEditCapacity"),
      cas: this.getMyReqEditValue("myReqEditCas"),
      grade: this.getMyReqEditValue("myReqEditGrade"),
      usage: this.getMyReqEditValue("myReqEditUsage"),
      status: "요청",
      reject_reason: ""
    };

    if (!row.name) {
      window.ReagentApp.toast?.("제품명은 필수입니다.", "warn");
      return;
    }

    const canSaveRequestEdit = await this.confirmProductMasterDuplicate(row, {
      prefix: "제품 등록 요청 수정 중 중복 가능성이 있습니다."
    });

    if (!canSaveRequestEdit) return;

    let updateRequestQuery = sb
      .from("product_registration_requests")
      .update(row)
      .eq("id", id);

    updateRequestQuery = this.scopedCompanyQuery(updateRequestQuery);

    const { data, error } = await updateRequestQuery
      .select()
      .single();

    if (error) {
      console.error("제품 등록 요청 수정 실패:", error);
      window.ReagentApp.toast?.(`제품 등록 요청 수정 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    const idx = this.myRegistrationRequests.findIndex((item) => Number(item.id) === id);
    if (idx >= 0) this.myRegistrationRequests[idx] = data || { ...this.myRegistrationRequests[idx], ...row };

    document.getElementById("myRegistrationRequestEditModal")?.classList.remove("show");
    this.renderMyRegistrationRequests();
    window.ReagentApp.productManagement?.loadRequests?.();
    window.ReagentApp.toast?.("제품 등록 요청이 수정되었습니다.", "success");
  },

  async deleteMyRegistrationRequest(id) {
    const row = (this.myRegistrationRequests || []).find((item) => Number(item.id) === Number(id));
    if (!row) {
      window.ReagentApp.toast?.("삭제할 요청을 찾지 못했습니다.", "warn");
      return;
    }

    const status = this.getDisplayRequestStatus(row.status);
    if (status === "등록") {
      window.ReagentApp.toast?.("등록 완료된 요청은 삭제할 수 없습니다.", "warn");
      return;
    }

    const ok = confirm("이 제품 등록 요청을 삭제하시겠습니까?");
    if (!ok) return;

    const sb = window.ReagentApp.sb;
    if (!sb) {
      window.ReagentApp.toast?.("Supabase 연결 정보가 없습니다.", "warn");
      return;
    }

    let deleteRequestQuery = sb
      .from("product_registration_requests")
      .delete()
      .eq("id", id);

    deleteRequestQuery = this.scopedCompanyQuery(deleteRequestQuery);

    const { error } = await deleteRequestQuery;

    if (error) {
      console.error("제품 등록 요청 삭제 실패:", error);
      window.ReagentApp.toast?.(`제품 등록 요청 삭제 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.myRegistrationRequests = this.myRegistrationRequests.filter((item) => Number(item.id) !== Number(id));
    this.renderMyRegistrationRequests();
    window.ReagentApp.productManagement?.loadRequests?.();
    window.ReagentApp.toast?.("제품 등록 요청이 삭제되었습니다.", "success");
  },

  async reRequestMyRegistrationRequest(id) {
    const row = (this.myRegistrationRequests || []).find((item) => Number(item.id) === Number(id));
    if (!row) {
      window.ReagentApp.toast?.("재요청할 요청을 찾지 못했습니다.", "warn");
      return;
    }

    const status = this.getDisplayRequestStatus(row.status);
    if (status !== "반려") {
      window.ReagentApp.toast?.("반려 상태의 요청만 재요청할 수 있습니다.", "warn");
      return;
    }

    const ok = confirm("반려된 내용을 복사해서 새 요청으로 다시 등록하시겠습니까?\n기존 반려건은 기록으로 남습니다.");
    if (!ok) return;

    const sb = window.ReagentApp.sb;
    if (!sb) {
      window.ReagentApp.toast?.("Supabase 연결 정보가 없습니다.", "warn");
      return;
    }

    const currentUser = this.getCurrentUser();
    const payload = {
      category: row.category || "",
      name: row.name || "",
      maker: row.maker || "",
      code: row.code || "",
      capacity: row.capacity || "",
      cas: row.cas || "",
      grade: row.grade || "",
      usage: row.usage || "",
      requester: row.requester || currentUser.name || "미지정",
      team: row.team || currentUser.team || "미지정팀",
      status: "요청",
      reject_reason: "",
      retry_created: false
    };

    if (!payload.name) {
      window.ReagentApp.toast?.("제품명은 필수입니다.", "warn");
      return;
    }

    const canReRequest = await this.confirmProductMasterDuplicate(payload, {
      prefix: "제품 등록 재요청 중 중복 가능성이 있습니다."
    });

    if (!canReRequest) return;

    const { data, error } = await sb
      .from("product_registration_requests")
      .insert(this.withCompanyPayload(payload))
      .select()
      .single();

    if (error) {
      console.error("제품 등록 재요청 실패:", error);
      window.ReagentApp.toast?.(`제품 등록 재요청 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    let markRetryQuery = sb
      .from("product_registration_requests")
      .update({ retry_created: true })
      .eq("id", id);

    markRetryQuery = this.scopedCompanyQuery(markRetryQuery);

    const { error: markError } = await markRetryQuery;

    if (markError) {
      console.error("기존 반려건 재요청 표시 업데이트 실패:", markError);
      window.ReagentApp.toast?.(`재요청은 저장되었지만 기존 반려건 표시 업데이트에 실패했습니다: ${markError.message || "원인을 확인하세요."}`, "warn");
    }

    if (data) this.myRegistrationRequests.unshift(data);

    const originalIdx = this.myRegistrationRequests.findIndex((item) => Number(item.id) === Number(id));
    if (originalIdx >= 0) {
      this.myRegistrationRequests[originalIdx] = {
        ...this.myRegistrationRequests[originalIdx],
        retry_created: true
      };
    }

    this.renderMyRegistrationRequests();
    window.ReagentApp.productManagement?.loadRequests?.();
    window.ReagentApp.toast?.("제품 등록 요청을 다시 등록했습니다.", "success");
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

    const selectedProduct = this.selectedProduct || {};
    const matchedProduct = this.productMasterRows.find((product) =>
      String(product.name || "") === productName &&
      String(product.maker || "") === String(els.maker?.value || "") &&
      String(product.code || "") === String(els.code?.value || "") &&
      String(product.capacity || "") === String(els.capacity?.value || "") &&
      String(product.cas || "") === String(els.cas?.value || "") &&
      String(product.grade || "") === String(els.grade?.value || "")
    ) || {};
    const defaultVendor = String(selectedProduct.default_vendor || matchedProduct.default_vendor || "").trim();
    const defaultVendorReason = String(selectedProduct.default_vendor_reason || matchedProduct.default_vendor_reason || "").trim();

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
      default_vendor: defaultVendor,
      default_vendor_reason: defaultVendorReason,
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
      .insert(this.withCompanyPayload(row))
      .select()
      .single();

    if (error) {
      console.error("신청 저장 실패:", error);
      toast(`서버 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.requestRows.unshift(data);
    this.clearForm();
    this.closeRequestFormMobile?.();
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
      let collectDeleteQuery = sb
        .from("reagent_collect_items")
        .delete()
        .neq("id", 0);

      collectDeleteQuery = this.scopedCompanyQuery(collectDeleteQuery);

      const { error: collectDeleteError } = await collectDeleteQuery;

      if (collectDeleteError) {
        console.error("취합 데이터 전체 삭제 실패:", collectDeleteError);
        window.ReagentApp.toast?.(`취합 서버 데이터 삭제 실패: ${collectDeleteError.message || "원인을 확인하세요."}`, "warn");
        return;
      }

      let requestDeleteQuery = sb
        .from("reagent_requests")
        .delete()
        .neq("id", 0);

      requestDeleteQuery = this.scopedCompanyQuery(requestDeleteQuery);

      const { error } = await requestDeleteQuery;

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
      let deleteQuery = sb
        .from("reagent_requests")
        .delete()
        .in("id", deleteIds);

      deleteQuery = this.scopedCompanyQuery(deleteQuery);

      const { error } = await deleteQuery;

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
      .insert(this.withCompanyRows(sampleRows))
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
    await this.loadProductMaster(true);
    await this.populateMakerOptions();

    const sb = window.ReagentApp.sb;

    if (!sb) {
      window.ReagentApp.toast?.("Supabase 연결 정보가 없습니다. supabase.js 로딩을 확인하세요.", "warn");
      this.requestRows = [];
      this.collectedMeta = {};
    } else {
      let requestQuery = sb
        .from("reagent_requests")
        .select("*")
        .order("created_at", { ascending: false });

      requestQuery = this.scopedCompanyQuery(requestQuery);

      const { data, error } = await requestQuery;

      if (error) {
        console.error("신청 목록 조회 실패:", error);
        window.ReagentApp.toast?.(`서버 데이터를 불러오지 못했습니다: ${error.message || "원인을 확인하세요."}`, "warn");
        this.requestRows = [];
      } else {
        this.requestRows = data || [];
      }

      let collectQuery = sb
        .from("reagent_collect_items")
        .select("*");

      collectQuery = this.scopedCompanyQuery(collectQuery);

      const { data: collectData, error: collectError } = await collectQuery;

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
          // 기존 ops.exelolab.com localStorage 입력값을 먼저 읽고, 서버값이 있으면 서버값으로 덮어씁니다.
          // 이렇게 해야 기존 입력값을 한 번 서버로 이관할 수 있습니다.
          collect._serverCollectMetaLoaded = false;
          collect.loadCollectMeta?.();
          collect.collectMeta = collect.collectMeta || {};

          const migrateTargets = [];

          (collectData || []).forEach((row) => {
            if (!row.item_key) return;
            const localMeta = collect.collectMeta[row.item_key] || {};
            const serverMeta = row.meta_json && typeof row.meta_json === "object" ? row.meta_json : null;
            const meta = collect.getMeta ? collect.getMeta(row.item_key) : (collect.collectMeta[row.item_key] || {});

            if (serverMeta) {
              Object.assign(meta, serverMeta);
            } else if (localMeta && Object.keys(localMeta).length) {
              Object.assign(meta, localMeta);
              migrateTargets.push(row.item_key);
            }

            meta.confirmed = serverMeta?.confirmed === true || row.confirmed === true || meta.confirmed === true;
            meta.confirmedQty = Number(serverMeta?.confirmedQty || row.collected_qty || meta.confirmedQty || 0);
            if (serverMeta?.selectedVendor) meta.selectedVendor = serverMeta.selectedVendor;
            if (serverMeta?.prepareRemark) meta.prepareRemark = serverMeta.prepareRemark;

            collect.collectMeta[row.item_key] = meta;
          });

          collect._serverCollectMetaLoaded = true;
          collect.saveCollectMeta?.();

          // 서버에 meta_json이 비어 있는 기존 취합건은 localStorage 입력값을 자동 업로드합니다.
          if (migrateTargets.length) {
            Promise.allSettled(
              migrateTargets.map((key) => collect.upsertCollectItem?.(key, this.collectedMeta?.[key] || 0))
            ).then((results) => {
              const failed = results.filter((result) => result.status === "rejected");
              if (failed.length) {
                console.warn("기존 견적 입력값 일부 서버 이관 실패:", failed);
              } else {
                console.info("기존 견적 입력값 서버 이관 완료:", migrateTargets.length);
              }
            });
          }
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
          default_vendor: row.default_vendor || "",
          default_vendor_reason: row.default_vendor_reason || "",
          entries: [],
          totalQty: 0,
          collectedQty: Number(this.collectedMeta[key] || 0),
          newQty: 0
        };
      }

      if (!grouped[key].default_vendor && row.default_vendor) grouped[key].default_vendor = row.default_vendor;
      if (!grouped[key].default_vendor_reason && row.default_vendor_reason) grouped[key].default_vendor_reason = row.default_vendor_reason;
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
      let updateQuery = sb
        .from("reagent_requests")
        .update({ qty: nextQty, usage: nextUsage })
        .eq("id", id);

      updateQuery = this.scopedCompanyQuery(updateQuery);

      const { data, error } = await updateQuery
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
      let deleteQuery = sb
        .from("reagent_requests")
        .delete()
        .eq("id", id);

      deleteQuery = this.scopedCompanyQuery(deleteQuery);

      const { error } = await deleteQuery;

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

  openRequestFormMobile() {
    if (!window.matchMedia || !window.matchMedia("(max-width: 760px)").matches) return;

    const backdrop = document.getElementById("requestFormModalBackdrop");
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    document.body.dataset.requestModalScrollY = String(scrollY);
    document.body.classList.add("request-form-modal-open");
    document.documentElement.classList.add("request-form-modal-open");
    backdrop?.classList.add("show");

    window.setTimeout(() => {
      const firstInput = document.getElementById("qty") || document.getElementById("productName");
      firstInput?.focus?.({ preventScroll: true });
    }, 80);
  },

  closeRequestFormMobile() {
    const backdrop = document.getElementById("requestFormModalBackdrop");
    const scrollY = Number(document.body.dataset.requestModalScrollY || 0);

    backdrop?.classList.remove("show");
    document.body.classList.remove("request-form-modal-open");
    document.documentElement.classList.remove("request-form-modal-open");

    if (Number.isFinite(scrollY) && scrollY >= 0) {
      window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }
  },

  bindMobileRequestForm() {
    const openBtns = [document.getElementById("openRequestFormMobile"), document.getElementById("openRequestFormMobileList")].filter(Boolean);
    const closeBtn = document.getElementById("closeRequestFormMobile");
    const backdrop = document.getElementById("requestFormModalBackdrop");
    const registrationBtns = [
      document.getElementById("requestNew"),
      document.getElementById("requestNewHeader"),
      document.getElementById("requestNewList")
    ].filter(Boolean);

    openBtns.forEach((openBtn) => {
      if (openBtn.dataset.bound) return;
      openBtn.dataset.bound = "1";
      openBtn.addEventListener("click", () => this.openRequestFormMobile());
    });

    registrationBtns.forEach((button) => {
      if (button.dataset.registrationBound) return;
      button.dataset.registrationBound = "1";
      button.addEventListener("click", async () => {
        this.closeRequestFormMobile();
        await this.openRegistrationRequestDialog?.();
      });
    });

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "1";
      closeBtn.addEventListener("click", () => this.closeRequestFormMobile());
    }

    if (backdrop && !backdrop.dataset.bound) {
      backdrop.dataset.bound = "1";
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) this.closeRequestFormMobile();
      });
    }

    const searchModal = document.getElementById("searchModal");
    const closeSearchBtn = document.getElementById("closeSearch");
    if (searchModal && !searchModal.dataset.requestSearchBound) {
      searchModal.dataset.requestSearchBound = "1";
      searchModal.addEventListener("click", (event) => {
        if (event.target === searchModal) this.closeSearchModal({ restoreRequestForm: true });
      });
    }
    if (closeSearchBtn && !closeSearchBtn.dataset.requestSearchBound) {
      closeSearchBtn.dataset.requestSearchBound = "1";
      closeSearchBtn.addEventListener("click", () => this.closeSearchModal({ restoreRequestForm: true }));
    }

    if (!this._requestFormEscBound) {
      this._requestFormEscBound = true;
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (window.ReagentApp?.els?.searchModal?.classList.contains("show")) {
          this.closeSearchModal({ restoreRequestForm: true });
          return;
        }
        this.closeRequestFormMobile();
      });
    }
  },

  renderMobileRequestCards(groups) {
    const container = document.getElementById("draftMobileCards");
    if (!container) return;

    if (!groups.length) {
      container.innerHTML = `<div class="request-mobile-empty">데이터 없음</div>`;
      return;
    }

    container.innerHTML = groups.map((group) => {
      const isCompletedOnly = group.collectedQty > 0 && group.newQty === 0;
      const isAdditional = group.collectedQty > 0 && group.newQty > 0;
      const isVendorConfirmed = group.isConfirmed === true;
      const checked = isCompletedOnly || (!isAdditional && this.selectedKeys.includes(group.key));
      const disabled = isCompletedOnly ? "disabled" : "";
      const qtyLabel = group.collectedQty === 0
        ? `${group.totalQty}`
        : isVendorConfirmed
          ? `${group.collectedQty > 0 ? `완료 ${group.collectedQty}` : ""}${group.newQty > 0 ? ` / 추가 ${group.newQty}` : ""}`
          : `${group.collectedQty > 0 ? `완료 ${group.collectedQty}` : ""}${group.newQty > 0 ? ` / 추가 ${group.newQty}` : ""}`;

      const detailItems = this.splitEntryStatus(group).map((item) => {
        const isLocked = item.rowStatus === "취합완료";
        const isPending = item.rowStatus === "추가신청건";
        const statusClass = isLocked ? "is-collected" : (isPending ? "is-pending" : "");
        return `
          <div class="request-mobile-detail-item ${statusClass}">
            <div class="request-mobile-detail-top">
              <strong>${this.html(item.team)} / ${this.html(item.requester)}</strong>
              <span>${this.html(item.rowStatus)}</span>
            </div>
            <div class="request-mobile-detail-grid">
              <span>신청일자</span><b>${this.html(this.formatDateTime(item.created_at || item.id))}</b>
              <span>수량</span><b>${this.html(item.qty)}</b>
              <span>용도</span><b>${this.html(item.usage || "-")}</b>
            </div>
            <div class="request-mobile-detail-actions">
              ${isLocked ? `<span class="request-mobile-lock">잠김</span>` : `<button type="button" class="ghost-btn detail-edit-btn" data-id="${item.id}">수정</button><button type="button" class="ghost-btn detail-delete-btn" data-id="${item.id}">삭제</button>`}
            </div>
          </div>
        `;
      }).join("");

      return `
        <article class="request-mobile-card ${isCompletedOnly ? "is-collected" : ""}" data-key="${this.attr(group.key)}">
          <div class="request-mobile-card-main" role="button" tabindex="0" data-mobile-detail-key="${this.attr(group.key)}">
            <div class="request-mobile-line1">
              <label class="request-mobile-check" onclick="event.stopPropagation();">
                <input type="checkbox" class="request-check" data-key="${this.attr(group.key)}" ${checked ? "checked" : ""} ${disabled}>
              </label>
              <strong>${this.html(group.name || "품명 없음")}</strong>
              <span>${this.html(this.getGroupActionLabel(group))}</span>
            </div>
            <div class="request-mobile-line2">
              <span>${this.html(group.maker || "제조사 없음")}</span>
              <b>수량 ${this.html(qtyLabel || "0")}</b>
            </div>
          </div>
          <div class="request-mobile-detail" data-mobile-detail-panel="${this.attr(group.key)}">
            <div class="request-mobile-spec">
              <span>구분</span><b>${this.html(group.category || "-")}</b>
              <span>제품코드</span><b>${this.html(group.code || "-")}</b>
              <span>CAS</span><b>${this.html(group.cas || "-")}</b>
              <span>등급/규격</span><b>${this.html([group.grade, group.capacity].filter(Boolean).join(" / ") || "-")}</b>
              <span>용도</span><b>${this.html(group.entries.map((e) => e.usage).filter(Boolean).join(" / ") || "-")}</b>
            </div>
            <div class="request-mobile-detail-list">${detailItems}</div>
          </div>
        </article>
      `;
    }).join("");

    container.querySelectorAll("[data-mobile-detail-key]").forEach((card) => {
      const toggle = () => {
        const wrapper = card.closest(".request-mobile-card");
        wrapper?.classList.toggle("open");
      };
      card.addEventListener("click", (event) => {
        if (event.target.closest("input,button,label")) return;
        toggle();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      });
    });
  },

  renderRequest() {
    this.bindMobileRequestForm?.();
    this.bindRegistrationStatusPanel?.();
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
      this.renderMobileRequestCards([]);
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

    this.renderMobileRequestCards(groups);

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
