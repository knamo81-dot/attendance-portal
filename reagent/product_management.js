window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.productManagement = {
  products: [],
  requests: [],
  editingProductId: null,
  activeRequestStatus: "",
  activeManagementPanel: "product",
  operatorSearchResults: [],
  reagentOperators: [],

  get sb() {
    return window.ReagentApp.sb;
  },

  html(value) {
    return window.ReagentApp.escapeHtml
      ? window.ReagentApp.escapeHtml(value)
      : String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
  },

  toast(message, type = "") {
    if (window.ReagentApp.toast) {
      window.ReagentApp.toast(message, type);
    } else {
      alert(message);
    }
  },

  getCurrentUser() {
    const user = window.ReagentApp.currentUser || {};
    return {
      name: user.name || user.user_name || user.userName || user.employee_no || user.employeeNo || "미지정",
      team: user.team || "",
      role: user.role || ""
    };
  },

  isAdminUser() {
    return window.ReagentApp.hasReagentOperatorAccess?.() === true;
  },

  getDisplayRequestStatus(status) {
    const value = String(status || "요청").trim();
    if (["등록완료", "등록"].includes(value)) return "등록";
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

    let masterRows = Array.isArray(this.products) ? this.products : [];

    if (!masterRows.length && this.sb) {
      const { data, error } = await this.sb
        .from("product_master")
        .select("id, category, name, maker, code, capacity, cas, grade, default_vendor, memo, is_active")
        .limit(3000);

      if (error) {
        console.warn("제품 마스터 중복 확인 실패:", error);
        return true;
      }

      masterRows = Array.isArray(data) ? data : [];
    }

    const excludeProductId = options.excludeProductId ? Number(options.excludeProductId) : null;
    const duplicateProducts = masterRows.filter((product) => {
      if (excludeProductId && Number(product.id) === excludeProductId) return false;

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

  init() {
    if (!this.isAdminUser()) {
      window.ReagentApp.toast?.("제품관리 기능은 관리자·운영자만 사용할 수 있습니다.", "warn");
      window.ReagentApp.showTab?.("request");
      return;
    }

    this.bindEvents();
    this.setProductManagementPanel("product");
    this.loadProducts();
    this.loadRequests();
  },

  getEls() {
    return {
      pageTitle: document.getElementById("pmPageTitle"),
      pageDesc: document.getElementById("pmPageDesc"),
      showProductPanel: document.getElementById("showPmProductPanel"),
      showRequestPanel: document.getElementById("showPmRequestPanel"),
      productPanel: document.getElementById("pmProductMasterPanel"),
      requestPanel: document.getElementById("pmRegistrationRequestPanel"),

      productKeyword: document.getElementById("pmProductKeyword"),
      productCategory: document.getElementById("pmProductCategory"),
      productActive: document.getElementById("pmProductActive"),
      productList: document.getElementById("pmProductList"),
      productCount: document.getElementById("pmProductCount"),
      totalCount: document.getElementById("pmTotalCount"),
      activeCount: document.getElementById("pmActiveCount"),
      inactiveCount: document.getElementById("pmInactiveCount"),
      pendingCount: document.getElementById("pmPendingCount"),

      formTitle: document.getElementById("pmFormTitle"),
      productId: document.getElementById("pmProductId"),
      category: document.getElementById("pmCategory"),
      name: document.getElementById("pmName"),
      maker: document.getElementById("pmMaker"),
      code: document.getElementById("pmCode"),
      capacity: document.getElementById("pmCapacity"),
      cas: document.getElementById("pmCas"),
      grade: document.getElementById("pmGrade"),
      defaultVendor: document.getElementById("pmDefaultVendor"),
      memo: document.getElementById("pmMemo"),
      isActive: document.getElementById("pmIsActive"),
      saveProduct: document.getElementById("pmSaveProduct"),
      resetProduct: document.getElementById("pmResetProduct"),
      deactivateProduct: document.getElementById("pmDeactivateProduct"),

      requestKeyword: document.getElementById("pmRequestKeyword"),
      requestStatus: document.getElementById("pmRequestStatus"),
      requestList: document.getElementById("pmRequestList"),
      requestCount: document.getElementById("pmRequestCount"),
      refreshRequests: document.getElementById("pmRefreshRequests")
    };
  },

  ensureRequestFilterControls() {
    const legacyStatus = document.getElementById("pmRequestStatus");
    const statusField = legacyStatus?.closest?.(".field");

    if (statusField && !document.getElementById("pmRequestStatusFilter")) {
      statusField.innerHTML = `
        <label>상태</label>
        <select id="pmRequestStatusFilter">
          <option value="">전체</option>
          <option value="요청" selected>요청</option>
          <option value="등록">등록</option>
          <option value="반려">반려</option>
        </select>
      `;

      const periodField = document.createElement("div");
      periodField.className = "field";
      periodField.innerHTML = `
        <label>기간</label>
        <select id="pmRequestPeriodFilter">
          <option value="1m">최근 1개월</option>
          <option value="3m" selected>최근 3개월</option>
          <option value="6m">최근 6개월</option>
          <option value="all">전체</option>
        </select>
      `;

      statusField.insertAdjacentElement("afterend", periodField);
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

  bindEvents() {
    this.ensureRequestFilterControls?.();

    const els = this.getEls();

    if (els.showProductPanel && !els.showProductPanel.dataset.bound) {
      els.showProductPanel.dataset.bound = "1";
      els.showProductPanel.addEventListener("click", () => this.setProductManagementPanel("product"));
    }

    if (els.showRequestPanel && !els.showRequestPanel.dataset.bound) {
      els.showRequestPanel.dataset.bound = "1";
      els.showRequestPanel.addEventListener("click", () => this.setProductManagementPanel("request"));
    }

    [els.productKeyword, els.productCategory, els.productActive].forEach((el) => {
      el?.addEventListener("input", () => this.renderProducts());
      el?.addEventListener("change", () => this.renderProducts());
    });

    els.saveProduct?.addEventListener("click", () => this.saveProduct());
    els.resetProduct?.addEventListener("click", () => this.resetProductForm());
    els.deactivateProduct?.addEventListener("click", () => this.deactivateCurrentProduct());

    [
      els.requestKeyword,
      document.getElementById("pmRequestStatusFilter"),
      document.getElementById("pmRequestPeriodFilter")
    ].forEach((el) => {
      el?.addEventListener("input", () => this.renderRequests());
      el?.addEventListener("change", () => this.renderRequests());
    });

    els.refreshRequests?.addEventListener("click", () => this.loadRequests());
  },


  setProductManagementPanel(panel = "product") {
    const els = this.getEls();
    const showRequest = panel === "request";
    this.activeManagementPanel = showRequest ? "request" : "product";

    if (els.productPanel) els.productPanel.style.display = showRequest ? "none" : "";
    if (els.requestPanel) els.requestPanel.style.display = showRequest ? "" : "none";

    els.showProductPanel?.classList.toggle("primary", !showRequest);
    els.showRequestPanel?.classList.toggle("primary", showRequest);

    if (els.pageTitle) els.pageTitle.textContent = "제품 관리";
    if (els.pageDesc) {
      els.pageDesc.textContent = "관리자·운영자 전용 제품 마스터 및 미등록 제품 요청 관리 화면입니다.";
    }

    if (showRequest) {
      this.renderRequests();
    } else {
      this.renderProducts();
    }
  },



  getOperatorEls() {
    return {
      keyword: document.getElementById("opEmployeeKeyword"),
      searchBtn: document.getElementById("opSearchEmployees"),
      refreshBtn: document.getElementById("opRefreshOperators"),
      searchList: document.getElementById("opEmployeeSearchList"),
      operatorList: document.getElementById("opOperatorList"),
      currentCount: document.getElementById("opCurrentCount")
    };
  },

  initOperatorManagement() {
    if (window.ReagentApp.hasReagentAdminAccess?.() !== true) {
      window.ReagentApp.toast?.("관리자 기능은 관리자만 사용할 수 있습니다.", "warn");
      window.ReagentApp.showTab?.("request");
      return;
    }

    this.bindOperatorEvents();
    this.loadReagentOperators();
  },

  bindOperatorEvents() {
    const els = this.getOperatorEls();

    if (els.searchBtn && !els.searchBtn.dataset.bound) {
      els.searchBtn.dataset.bound = "1";
      els.searchBtn.addEventListener("click", () => this.searchEmployeesForOperator());
    }

    if (els.keyword && !els.keyword.dataset.bound) {
      els.keyword.dataset.bound = "1";
      els.keyword.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.searchEmployeesForOperator();
      });
    }

    if (els.refreshBtn && !els.refreshBtn.dataset.bound) {
      els.refreshBtn.dataset.bound = "1";
      els.refreshBtn.addEventListener("click", () => this.loadReagentOperators());
    }

    if (els.searchList && !els.searchList.dataset.bound) {
      els.searchList.dataset.bound = "1";
      els.searchList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-op-add]");
        if (!btn) return;
        this.addReagentOperator(Number(btn.dataset.opAdd));
      });
    }

    if (els.operatorList && !els.operatorList.dataset.bound) {
      els.operatorList.dataset.bound = "1";
      els.operatorList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-op-remove]");
        if (!btn) return;
        this.removeReagentOperator(btn.dataset.opRemove);
      });
    }
  },

  getEmployeeDepartment(row = {}) {
    return row.department || row.division_name || row.division || row.division_code || "";
  },

  getEmployeeTeam(row = {}) {
    return row.team || row.team_name || row.team_code || "";
  },

  async searchEmployeesForOperator() {
    const els = this.getOperatorEls();
    const keyword = String(els.keyword?.value || "").trim();

    if (!this.sb) {
      this.toast("Supabase 연결 정보가 없습니다.", "warn");
      return;
    }

    if (!keyword) {
      if (els.searchList) els.searchList.innerHTML = `<tr><td class="empty" colspan="7">사번 또는 이름을 입력하세요.</td></tr>`;
      return;
    }

    const safeKeyword = keyword.replaceAll("%", "\\\\%").replaceAll(",", " ");
    const pattern = `%${safeKeyword}%`;

    const { data, error } = await this.sb
      .from("employees")
      .select("*")
      .or(`employee_no.ilike.${pattern},name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(20);

    if (error) {
      console.error("사원 검색 실패:", error);
      this.toast(`사원 검색 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.operatorSearchResults = Array.isArray(data) ? data : [];
    this.renderEmployeeSearchResults();
  },

  renderEmployeeSearchResults() {
    const els = this.getOperatorEls();
    if (!els.searchList) return;

    if (!this.operatorSearchResults.length) {
      els.searchList.innerHTML = `<tr><td class="empty" colspan="7">검색된 사원이 없습니다.</td></tr>`;
      return;
    }

    els.searchList.innerHTML = this.operatorSearchResults.map((row, index) => {
      const employeeNo = row.employee_no || row.employeeNo || "";
      const isAlready = this.reagentOperators.some((op) => String(op.employee_no) === String(employeeNo) && op.is_active !== false);

      return `
        <tr>
          <td>${this.html(employeeNo)}</td>
          <td>${this.html(row.name || "")}</td>
          <td>${this.html(this.getEmployeeDepartment(row))}</td>
          <td>${this.html(this.getEmployeeTeam(row))}</td>
          <td>${this.html(row.position || "")}</td>
          <td>${this.html(row.email || "")}</td>
          <td>
            ${isAlready
              ? `<span class="badge blue">${this.reagentOperators.find((op) => String(op.employee_no) === String(employeeNo))?.is_admin ? "관리자" : "운영자"}</span>`
              : `<button class="ghost-btn" data-op-add="${index}" type="button">운영자 지정</button>`}
          </td>
        </tr>
      `;
    }).join("");
  },

  async loadReagentOperators() {
    const els = this.getOperatorEls();

    if (!this.sb) {
      if (els.operatorList) els.operatorList.innerHTML = `<tr><td class="empty" colspan="8">Supabase 연결 정보가 없습니다.</td></tr>`;
      return;
    }

    const { data: operators, error: operatorError } = await this.sb
      .from("reagent_operators")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (operatorError) {
      console.error("운영자 목록 조회 실패:", operatorError);
      this.toast(`운영자 목록 조회 실패: ${operatorError.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    // 관리자 권한은 사원정보관리에서 저장되는 public.users.role = admin 기준으로 자동 포함합니다.
    const { data: adminUsers, error: adminUserError } = await this.sb
      .from("users")
      .select("*")
      .eq("role", "admin");

    if (adminUserError) {
      console.warn("관리자 권한 조회 실패:", adminUserError);
      this.toast(`관리자 권한 조회 실패: ${adminUserError.message || "원인을 확인하세요."}`, "warn");
    }

    const adminEmails = (Array.isArray(adminUsers) ? adminUsers : [])
      .map((row) => String(row.email || row.user_email || "").trim())
      .filter(Boolean);

    let adminEmployees = [];

    if (adminEmails.length) {
      const { data: employeeRows, error: employeeError } = await this.sb
        .from("employees")
        .select("*")
        .in("email", adminEmails);

      if (employeeError) {
        console.warn("관리자 사원정보 매칭 실패:", employeeError);
        this.toast(`관리자 사원정보 매칭 실패: ${employeeError.message || "원인을 확인하세요."}`, "warn");
      } else {
        adminEmployees = Array.isArray(employeeRows) ? employeeRows : [];
      }
    }

    const adminRows = (Array.isArray(adminUsers) ? adminUsers : []).map((userRow) => {
      const email = String(userRow.email || userRow.user_email || "").trim();
      const employee = adminEmployees.find((emp) => String(emp.email || "").trim() === email) || {};

      return {
        employee_no: employee.employee_no || userRow.employee_no || userRow.employeeNo || "",
        name: employee.name || userRow.name || userRow.user_name || email || "",
        department: this.getEmployeeDepartment(employee),
        team: this.getEmployeeTeam(employee),
        role: "관리자",
        is_active: true,
        is_admin: true,
        created_by: "사원정보",
        created_at: userRow.updated_at || userRow.created_at || employee.updated_at || employee.created_at || "",
        email
      };
    });

    const operatorRows = (Array.isArray(operators) ? operators : [])
      .filter((op) => {
        const opEmployeeNo = String(op.employee_no || "");
        const opEmail = String(op.email || "");
        return !adminRows.some((admin) =>
          (admin.employee_no && String(admin.employee_no) === opEmployeeNo) ||
          (admin.email && String(admin.email) === opEmail)
        );
      })
      .map((op) => ({
        ...op,
        role: op.role || "운영자",
        is_admin: false
      }));

    this.reagentOperators = [...adminRows, ...operatorRows].sort((a, b) => {
      if (a.is_admin && !b.is_admin) return -1;
      if (!a.is_admin && b.is_admin) return 1;

      const teamA = String(a.team || "");
      const teamB = String(b.team || "");
      if (teamA !== teamB) return teamA.localeCompare(teamB, "ko");

      return String(a.name || "").localeCompare(String(b.name || ""), "ko");
    });

    this.renderReagentOperators();
    this.renderEmployeeSearchResults();
  },

  renderReagentOperators() {
    const els = this.getOperatorEls();
    if (!els.operatorList) return;

    if (els.currentCount) els.currentCount.textContent = `${this.reagentOperators.length}명`;

    if (!this.reagentOperators.length) {
      els.operatorList.innerHTML = `<tr><td class="empty" colspan="8">지정된 운영자가 없습니다.</td></tr>`;
      return;
    }

    els.operatorList.innerHTML = this.reagentOperators.map((row) => {
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      const dateText = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleDateString("ko-KR")
        : "";

      const actionHtml = row.is_admin
        ? `<span class="badge blue">자동 포함</span>`
        : `<button class="ghost-btn" data-op-remove="${this.html(row.employee_no)}" type="button">해제</button>`;

      return `
        <tr>
          <td>${this.html(row.employee_no)}</td>
          <td>${this.html(row.name)}</td>
          <td>${this.html(row.department || "")}</td>
          <td>${this.html(row.team || "")}</td>
          <td>${row.is_admin ? `<span class="badge blue">관리자</span>` : this.html(row.role || "운영자")}</td>
          <td>${this.html(row.created_by || "")}</td>
          <td>${this.html(dateText)}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join("");
  },

  async addReagentOperator(index) {
    const employee = this.operatorSearchResults[index];
    if (!employee) return;

    const employeeNo = employee.employee_no || employee.employeeNo || "";
    if (!employeeNo) {
      this.toast("사번이 없는 사원은 운영자로 지정할 수 없습니다.", "warn");
      return;
    }

    const ok = confirm(`${employee.name || employeeNo} 님을 시약·초자 프로그램 운영자로 지정하시겠습니까?`);
    if (!ok) return;

    const user = this.getCurrentUser();
    const row = {
      employee_no: employeeNo,
      name: employee.name || "",
      department: this.getEmployeeDepartment(employee),
      team: this.getEmployeeTeam(employee),
      role: "운영자",
      is_active: true,
      created_by: user.name
    };

    const { error } = await this.sb
      .from("reagent_operators")
      .upsert(row, { onConflict: "employee_no" });

    if (error) {
      console.error("운영자 지정 실패:", error);
      this.toast(`운영자 지정 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.toast("운영자로 지정되었습니다.", "success");
    await this.loadReagentOperators();
  },

  async removeReagentOperator(employeeNo) {
    if (!employeeNo) return;

    const ok = confirm("이 운영자 권한을 해제하시겠습니까?");
    if (!ok) return;

    const user = this.getCurrentUser();
    const { error } = await this.sb
      .from("reagent_operators")
      .update({ is_active: false, updated_by: user.name })
      .eq("employee_no", employeeNo);

    if (error) {
      console.error("운영자 해제 실패:", error);
      this.toast(`운영자 해제 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.toast("운영자 권한이 해제되었습니다.", "success");
    await this.loadReagentOperators();
  },

  async refreshLinkedRequestStatus() {
    // 관리자 처리 결과가 담당자 화면의 [제품 등록 요청 현황]에도 즉시 반영되도록 동기화합니다.
    try {
      await window.ReagentApp.request?.loadMyRegistrationRequests?.(true);
      if (window.ReagentApp.request?.activeRequestPanel === "status") {
        window.ReagentApp.request?.renderMyRegistrationRequests?.();
      }
    } catch (error) {
      console.warn("내 요청 현황 갱신 실패:", error);
    }
  },

  async loadProducts() {
    if (!this.sb) {
      this.toast("Supabase 연결 정보가 없습니다. supabase.js 로딩을 확인하세요.", "warn");
      return;
    }

    const { data, error } = await this.sb
      .from("product_master")
      .select("*")
      .order("maker", { ascending: true })
      .order("name", { ascending: true })
      .order("capacity", { ascending: true })
      .order("code", { ascending: true });

    if (error) {
      console.error("제품 마스터 조회 실패:", error);
      this.toast(`제품 마스터 조회 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.products = Array.isArray(data) ? data : [];
    this.renderProducts();
  },

  getFilteredProducts() {
    const els = this.getEls();
    const keyword = String(els.productKeyword?.value || "").trim().toLowerCase();
    const category = els.productCategory?.value || "";
    const active = els.productActive?.value || "";

    return this.products.filter((p) => {
      const text = [p.category, p.name, p.maker, p.code, p.capacity, p.cas, p.grade, p.default_vendor, p.memo]
        .join(" ")
        .toLowerCase();

      if (keyword && !text.includes(keyword)) return false;
      if (category && p.category !== category) return false;
      if (active === "active" && p.is_active !== true) return false;
      if (active === "inactive" && p.is_active === true) return false;
      return true;
    });
  },

  updateManagementKpi() {
    const els = this.getEls();
    const products = Array.isArray(this.products) ? this.products : [];
    const requests = Array.isArray(this.requests) ? this.requests : [];

    const total = products.length;
    const active = products.filter((p) => p.is_active !== false).length;
    const inactive = products.filter((p) => p.is_active === false).length;
    const pending = requests.filter((r) => this.getDisplayRequestStatus(r.status) === "요청").length;

    if (els.totalCount) els.totalCount.textContent = `${total}건`;
    if (els.activeCount) els.activeCount.textContent = `${active}건`;
    if (els.inactiveCount) els.inactiveCount.textContent = `${inactive}건`;
    if (els.pendingCount) els.pendingCount.textContent = `${pending}건`;

    // 이전 버전 index.html과 같이 쓰더라도 카운트가 깨지지 않도록 유지합니다.
    if (els.productCount) els.productCount.textContent = `제품 ${total}건`;
    if (els.requestCount) els.requestCount.textContent = `요청 ${pending}건`;
  },

  renderProducts() {
    const els = this.getEls();
    if (!els.productList) return;

    const rows = this.getFilteredProducts();
    this.updateManagementKpi();

    if (!rows.length) {
      els.productList.innerHTML = `<tr><td class="empty" colspan="11">등록된 제품이 없습니다.</td></tr>`;
      return;
    }

    els.productList.innerHTML = rows.map((p) => `
      <tr class="${p.is_active ? "" : "request-row-collected"}">
        <td>${this.html(p.category)}</td>
        <td>${this.html(p.name)}</td>
        <td>${this.html(p.maker)}</td>
        <td>${this.html(p.code)}</td>
        <td>${this.html(p.capacity)}</td>
        <td>${this.html(p.cas)}</td>
        <td>${this.html(p.grade)}</td>
        <td>${this.html(p.default_vendor)}</td>
        <td>${p.is_active ? "사용" : "사용중지"}</td>
        <td>${this.html(p.updated_by || p.created_by || "")}</td>
        <td><button class="ghost-btn" data-pm-edit="${p.id}" type="button">수정</button></td>
      </tr>
    `).join("");

    els.productList.querySelectorAll("[data-pm-edit]").forEach((btn) => {
      btn.addEventListener("click", () => this.fillProductForm(Number(btn.dataset.pmEdit)));
    });
  },

  fillProductForm(id) {
    const product = this.products.find((p) => Number(p.id) === Number(id));
    if (!product) return;

    const els = this.getEls();
    this.editingProductId = product.id;

    if (els.formTitle) els.formTitle.textContent = "제품 수정";
    if (els.productId) els.productId.value = product.id || "";
    if (els.category) els.category.value = product.category || "";
    if (els.name) els.name.value = product.name || "";
    if (els.maker) els.maker.value = product.maker || "";
    if (els.code) els.code.value = product.code || "";
    if (els.capacity) els.capacity.value = product.capacity || "";
    if (els.cas) els.cas.value = product.cas || "";
    if (els.grade) els.grade.value = product.grade || "";
    if (els.defaultVendor) els.defaultVendor.value = product.default_vendor || "";
    if (els.memo) els.memo.value = product.memo || "";
    if (els.isActive) els.isActive.value = product.is_active ? "true" : "false";
    if (els.deactivateProduct) els.deactivateProduct.style.display = product.is_active ? "" : "none";
  },

  resetProductForm() {
    const els = this.getEls();
    this.editingProductId = null;

    if (els.formTitle) els.formTitle.textContent = "제품 등록";
    [els.productId, els.category, els.name, els.maker, els.code, els.capacity, els.cas, els.grade, els.defaultVendor, els.memo].forEach((el) => {
      if (el) el.value = "";
    });
    if (els.isActive) els.isActive.value = "true";
    if (els.deactivateProduct) els.deactivateProduct.style.display = "none";
  },

  getProductFormRow() {
    const els = this.getEls();
    const user = this.getCurrentUser();

    return {
      category: String(els.category?.value || "").trim(),
      name: String(els.name?.value || "").trim(),
      maker: String(els.maker?.value || "").trim(),
      code: String(els.code?.value || "").trim(),
      capacity: String(els.capacity?.value || "").trim(),
      cas: String(els.cas?.value || "").trim(),
      grade: String(els.grade?.value || "").trim(),
      default_vendor: String(els.defaultVendor?.value || "").trim(),
      memo: String(els.memo?.value || "").trim(),
      is_active: els.isActive?.value !== "false",
      updated_by: user.name
    };
  },

  async saveProduct() {
    if (!this.sb) {
      this.toast("Supabase 연결 정보가 없습니다.", "warn");
      return;
    }

    const row = this.getProductFormRow();
    const user = this.getCurrentUser();

    if (!row.name) {
      this.toast("품명은 필수입니다.", "warn");
      return;
    }

    const canSaveProduct = await this.confirmProductMasterDuplicate(row, {
      excludeProductId: this.editingProductId,
      prefix: this.editingProductId ? "제품 수정 중 중복 가능성이 있습니다." : "제품 등록 중 중복 가능성이 있습니다."
    });

    if (!canSaveProduct) return;

    try {
      let error;
      if (this.editingProductId) {
        ({ error } = await this.sb
          .from("product_master")
          .update(row)
          .eq("id", this.editingProductId));
      } else {
        ({ error } = await this.sb
          .from("product_master")
          .insert({ ...row, created_by: user.name })
          .select()
          .single());
      }

      if (error) throw error;

      this.toast(this.editingProductId ? "제품 정보가 수정되었습니다." : "제품이 등록되었습니다.", "success");
      this.resetProductForm();
      await this.loadProducts();
      window.ReagentApp.request?.loadProductMaster?.(true);
    } catch (error) {
      console.error("제품 저장 실패:", error);
      this.toast(`제품 저장 실패: ${error.message || "원인을 확인하세요."}`, "warn");
    }
  },

  async deactivateCurrentProduct() {
    if (!this.editingProductId) return;

    const ok = confirm("이 제품을 사용중지 처리하시겠습니까?\n제품신청 검색에서는 더 이상 노출되지 않습니다.");
    if (!ok) return;

    const user = this.getCurrentUser();
    const { error } = await this.sb
      .from("product_master")
      .update({ is_active: false, updated_by: user.name })
      .eq("id", this.editingProductId);

    if (error) {
      console.error("제품 사용중지 실패:", error);
      this.toast(`사용중지 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.toast("제품이 사용중지 처리되었습니다.", "success");
    this.resetProductForm();
    await this.loadProducts();
    window.ReagentApp.request?.loadProductMaster?.(true);
  },

  async loadRequests() {
    if (!this.sb) return;

    const { data, error } = await this.sb
      .from("product_registration_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("제품 등록 요청 조회 실패:", error);
      this.toast(`제품 등록 요청 조회 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    const statusOrder = { "요청": 0, "반려": 1, "등록": 2 };
    this.requests = (Array.isArray(data) ? data : []).sort((a, b) => {
      const statusA = this.getDisplayRequestStatus(a.status);
      const statusB = this.getDisplayRequestStatus(b.status);
      const orderA = Object.prototype.hasOwnProperty.call(statusOrder, statusA) ? statusOrder[statusA] : 99;
      const orderB = Object.prototype.hasOwnProperty.call(statusOrder, statusB) ? statusOrder[statusB] : 99;

      if (orderA !== orderB) return orderA - orderB;

      const timeA = new Date(a.created_at || a.id || 0).getTime();
      const timeB = new Date(b.created_at || b.id || 0).getTime();
      const safeTimeA = Number.isNaN(timeA) ? 0 : timeA;
      const safeTimeB = Number.isNaN(timeB) ? 0 : timeB;

      return safeTimeB - safeTimeA;
    });
    this.renderRequests();
  },

  getFilteredRequests() {
    this.ensureRequestFilterControls?.();

    const els = this.getEls();
    const keyword = String(els.requestKeyword?.value || "").trim().toLowerCase();
    const statusFilter = document.getElementById("pmRequestStatusFilter")?.value ?? "요청";
    const periodFilter = document.getElementById("pmRequestPeriodFilter")?.value || "3m";

    return this.requests.filter((r) => {
      const text = [r.category, r.name, r.maker, r.code, r.capacity, r.cas, r.grade, r.usage, r.requester, r.team, r.reject_reason, r.handled_by]
        .join(" ")
        .toLowerCase();

      const displayStatus = this.getDisplayRequestStatus(r.status);

      if (keyword && !text.includes(keyword)) return false;
      if (statusFilter && displayStatus !== statusFilter) return false;
      if (!this.isWithinRequestPeriod(r.created_at || r.id, periodFilter)) return false;
      return true;
    });
  },

  renderRequests() {
    const els = this.getEls();
    if (!els.requestList) return;

    if (!els.requestList.dataset.pmRequestDelegatedBound) {
      els.requestList.dataset.pmRequestDelegatedBound = "1";
      els.requestList.addEventListener("click", (e) => {
        const editBtn = e.target.closest("[data-pm-request-edit]");
        const approveBtn = e.target.closest("[data-pm-request-approve]");
        const rejectBtn = e.target.closest("[data-pm-request-reject]");

        if (editBtn) {
          this.openRequestEditModal(Number(editBtn.dataset.pmRequestEdit));
          return;
        }

        if (approveBtn) {
          this.approveRequest(Number(approveBtn.dataset.pmRequestApprove));
          return;
        }

        if (rejectBtn) {
          this.rejectRequest(Number(rejectBtn.dataset.pmRequestReject));
          return;
        }

      });
    }

    const rows = this.getFilteredRequests();
    this.updateManagementKpi();
    if (els.requestCount) els.requestCount.textContent = `요청 ${rows.length}건`;

    if (!rows.length) {
      els.requestList.innerHTML = `<tr><td class="empty" colspan="12">제품 등록 요청이 없습니다.</td></tr>`;
      return;
    }

    els.requestList.innerHTML = rows.map((r) => {
      const displayStatus = this.getDisplayRequestStatus(r.status);
      return `
      <tr>
        <td>${this.html(displayStatus)}</td>
        <td>${this.html(r.category)}</td>
        <td>${this.html(r.name)}</td>
        <td>${this.html(r.maker)}</td>
        <td>${this.html(r.code)}</td>
        <td>${this.html(r.capacity)}</td>
        <td>${this.html(r.cas)}</td>
        <td>${this.html(r.grade)}</td>
        <td>${this.html(r.usage)}</td>
        <td>${this.html([r.team, r.requester].filter(Boolean).join(" / "))}</td>
        <td>${this.html(r.reject_reason || r.handled_by || "")}</td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${displayStatus === "요청" ? `
              <button class="ghost-btn" data-pm-request-edit="${r.id}" type="button">수정</button>
              <button class="ghost-btn" data-pm-request-approve="${r.id}" type="button">승인</button>
              <button class="ghost-btn" data-pm-request-reject="${r.id}" type="button">반려</button>
            ` : ""}
          </div>
        </td>
      </tr>
    `;
    }).join("");

    // 버튼 클릭은 renderRequests 시작 부분의 이벤트 위임에서 처리합니다.

  },

  ensureRequestEditModal() {
    let modal = document.getElementById("pmRequestEditModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "pmRequestEditModal";
    modal.innerHTML = `
      <div class="modal" style="width:min(860px,100%);">
        <div class="modal-head">
          <div>
            <h3>제품 등록 요청 수정</h3>
            <div class="small">담당자가 요청한 내용을 확인한 뒤 표준 규격으로 수정해 저장합니다.</div>
          </div>
          <button type="button" class="btn" id="pmCloseRequestEditModal">닫기</button>
        </div>
        <div class="card-body">
          <input type="hidden" id="pmEditRequestId" />
          <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start;">
            <div class="field">
              <label>분류</label>
              <select id="pmReqCategory">
                <option value="">선택</option>
                <option value="시약">시약</option>
                <option value="초자">초자</option>
                <option value="안전용품">안전용품</option>
              </select>
            </div>
            <div class="field"><label>품명 <span style="color:#dc2626;">*</span></label><input id="pmReqName" placeholder="예: Ethanol"/></div>
            <div class="field"><label>제조사</label><input id="pmReqMaker" placeholder="예: Sigma"/></div>
            <div class="field"><label>제품코드</label><input id="pmReqCode" placeholder="예: E7023"/></div>
            <div class="field"><label>CAS</label><input id="pmReqCas" placeholder="예: 64-17-5"/></div>
            <div class="field"><label>등급</label><input id="pmReqGrade" placeholder="예: ACS"/></div>
            <div class="field"><label>규격</label><input id="pmReqCapacity" placeholder="예: 500 mL"/></div>
            <div class="field"><label>요청사유 / 용도</label><input id="pmReqUsage" placeholder="예: 효능평가 전처리용"/></div>
          </div>
          <div class="small" style="margin-top:12px; color:#64748b;">
            수정 저장 후 승인하면 이 값 그대로 제품 마스터에 등록됩니다.
          </div>
          <div class="actions" style="justify-content:flex-end; margin-top:18px;">
            <button type="button" class="btn" id="pmCancelRequestEdit">취소</button>
            <button type="button" class="btn primary" id="pmSaveRequestEdit">수정 저장</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.classList.remove("show");
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("#pmCloseRequestEditModal")?.addEventListener("click", close);
    modal.querySelector("#pmCancelRequestEdit")?.addEventListener("click", close);
    modal.querySelector("#pmSaveRequestEdit")?.addEventListener("click", () => this.saveRequestEditFromModal());

    return modal;
  },

  setRequestEditValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  },

  getRequestEditValue(id) {
    return String(document.getElementById(id)?.value || "").trim();
  },

  openRequestEditModal(id) {
    const request = this.requests.find((r) => Number(r.id) === Number(id));
    if (!request) {
      this.toast("수정할 요청을 찾지 못했습니다.", "warn");
      return;
    }

    const modal = this.ensureRequestEditModal();

    this.setRequestEditValue("pmEditRequestId", request.id);
    this.setRequestEditValue("pmReqCategory", request.category || "");
    this.setRequestEditValue("pmReqName", request.name || "");
    this.setRequestEditValue("pmReqMaker", request.maker || "");
    this.setRequestEditValue("pmReqCode", request.code || "");
    this.setRequestEditValue("pmReqCas", request.cas || "");
    this.setRequestEditValue("pmReqGrade", request.grade || "");
    this.setRequestEditValue("pmReqCapacity", request.capacity || "");
    this.setRequestEditValue("pmReqUsage", request.usage || "");

    modal.classList.add("show");
    setTimeout(() => document.getElementById("pmReqName")?.focus(), 0);
  },

  async saveRequestEditFromModal() {
    if (!this.sb) {
      this.toast("Supabase 연결 정보가 없습니다.", "warn");
      return;
    }

    const id = Number(this.getRequestEditValue("pmEditRequestId"));
    if (!id) {
      this.toast("요청 ID를 찾지 못했습니다.", "warn");
      return;
    }

    const user = this.getCurrentUser();
    const row = {
      category: this.getRequestEditValue("pmReqCategory"),
      name: this.getRequestEditValue("pmReqName"),
      maker: this.getRequestEditValue("pmReqMaker"),
      code: this.getRequestEditValue("pmReqCode"),
      capacity: this.getRequestEditValue("pmReqCapacity"),
      cas: this.getRequestEditValue("pmReqCas"),
      grade: this.getRequestEditValue("pmReqGrade"),
      usage: this.getRequestEditValue("pmReqUsage"),
      status: "요청",
      handled_by: "",
      handled_at: null,
      reject_reason: ""
    };

    if (!row.name) {
      this.toast("품명은 필수입니다.", "warn");
      return;
    }

    const canSaveRequestEdit = await this.confirmProductMasterDuplicate(row, {
      prefix: "제품 등록 요청 수정 중 중복 가능성이 있습니다."
    });

    if (!canSaveRequestEdit) return;

    const { error } = await this.sb
      .from("product_registration_requests")
      .update(row)
      .eq("id", id);

    if (error) {
      console.error("제품 등록 요청 수정 실패:", error);
      this.toast(`제품 등록 요청 수정 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    document.getElementById("pmRequestEditModal")?.classList.remove("show");
    this.toast("제품 등록 요청이 수정되었습니다.", "success");
    await this.loadRequests();
    await this.refreshLinkedRequestStatus();
  },

  async markRequestInProgress(id) {
    const user = this.getCurrentUser();
    const { error } = await this.sb
      .from("product_registration_requests")
      .update({ status: "확인중", handled_by: user.name })
      .eq("id", id);

    if (error) {
      this.toast(`상태 변경 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.toast("요청 상태가 확인중으로 변경되었습니다.", "success");
    await this.loadRequests();
    await this.refreshLinkedRequestStatus();
  },

  async approveRequest(id) {
    const request = this.requests.find((r) => Number(r.id) === Number(id));
    if (!request) return;

    const ok = confirm("이 요청을 제품 마스터에 등록하고 등록완료 처리하시겠습니까?");
    if (!ok) return;

    const user = this.getCurrentUser();

    try {
      const productRow = {
        category: request.category || "",
        name: request.name || "",
        maker: request.maker || "",
        code: request.code || "",
        capacity: request.capacity || "",
        cas: request.cas || "",
        grade: request.grade || "",
        memo: request.usage ? `등록요청 용도: ${request.usage}` : "",
        is_active: true,
        created_by: user.name,
        updated_by: user.name
      };

      const canApprove = await this.confirmProductMasterDuplicate(productRow, {
        prefix: "요청 승인 중 중복 가능성이 있습니다."
      });

      if (!canApprove) return;

      const { error: insertError } = await this.sb
        .from("product_master")
        .insert(productRow);

      if (insertError) throw insertError;

      const { error: updateError } = await this.sb
        .from("product_registration_requests")
        .update({
          status: "등록완료",
          handled_by: user.name,
          handled_at: new Date().toISOString(),
          reject_reason: ""
        })
        .eq("id", id);

      if (updateError) throw updateError;

      this.toast("제품 마스터 등록 및 요청 처리가 완료되었습니다.", "success");
      await Promise.all([this.loadProducts(), this.loadRequests()]);
      await this.refreshLinkedRequestStatus();
      window.ReagentApp.request?.loadProductMaster?.(true);
    } catch (error) {
      console.error("요청 승인 실패:", error);
      this.toast(`요청 승인 실패: ${error.message || "원인을 확인하세요."}`, "warn");
    }
  },

  async rejectRequest(id) {
    const reason = prompt("반려 사유를 입력하세요.");
    if (reason === null) return;
    if (!String(reason).trim()) {
      this.toast("반려 사유를 입력해야 합니다.", "warn");
      return;
    }

    const user = this.getCurrentUser();
    const { error } = await this.sb
      .from("product_registration_requests")
      .update({
        status: "반려",
        reject_reason: String(reason).trim(),
        handled_by: user.name,
        handled_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      console.error("요청 반려 실패:", error);
      this.toast(`요청 반려 실패: ${error.message || "원인을 확인하세요."}`, "warn");
      return;
    }

    this.toast("요청이 반려 처리되었습니다.", "success");
    await this.loadRequests();
    await this.refreshLinkedRequestStatus();
  },

};
