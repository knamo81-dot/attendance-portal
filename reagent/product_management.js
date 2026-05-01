window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.productManagement = {
  products: [],
  requests: [],
  editingProductId: null,
  activeRequestStatus: "",
  activeManagementPanel: "product",

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
    const user = window.ReagentApp.currentUser || {};
    const role = String(user.role || "").trim();
    return ["관리자", "운영자", "admin", "operator", "Admin", "Operator"].includes(role) || window.ReagentApp.isRequestAdmin?.() === true;
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
      const page = document.getElementById("page-product-management");
      if (page) {
        page.innerHTML = `
          <section class="card">
            <div class="card-body empty">제품관리 기능은 관리자·운영자만 사용할 수 있습니다.</div>
          </section>
        `;
      }
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

    if (els.pageTitle) els.pageTitle.textContent = showRequest ? "제품 등록 요청 관리" : "제품 마스터 관리";
    if (els.pageDesc) {
      els.pageDesc.textContent = showRequest
        ? "담당자가 제품신청 화면에서 요청한 미등록 제품을 확인하고 승인 또는 반려합니다."
        : "제품신청 화면의 제품검색과 자동입력에 사용되는 기준 데이터를 관리합니다.";
    }

    if (showRequest) {
      this.renderRequests();
    } else {
      this.renderProducts();
    }
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

  renderProducts() {
    const els = this.getEls();
    if (!els.productList) return;

    const rows = this.getFilteredProducts();
    if (els.productCount) els.productCount.textContent = `제품 ${rows.length}건`;

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
