window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.productManagement = {
  products: [],
  requests: [],
  editingProductId: null,
  activeRequestStatus: "",

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
    this.loadProducts();
    this.loadRequests();
  },

  getEls() {
    return {
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

  bindEvents() {
    const els = this.getEls();

    [els.productKeyword, els.productCategory, els.productActive].forEach((el) => {
      el?.addEventListener("input", () => this.renderProducts());
      el?.addEventListener("change", () => this.renderProducts());
    });

    els.saveProduct?.addEventListener("click", () => this.saveProduct());
    els.resetProduct?.addEventListener("click", () => this.resetProductForm());
    els.deactivateProduct?.addEventListener("click", () => this.deactivateCurrentProduct());

    [els.requestKeyword, els.requestStatus].forEach((el) => {
      el?.addEventListener("input", () => this.renderRequests());
      el?.addEventListener("change", () => this.renderRequests());
    });

    els.refreshRequests?.addEventListener("click", () => this.loadRequests());
  },

  async loadProducts() {
    if (!this.sb) {
      this.toast("Supabase 연결 정보가 없습니다. supabase.js 로딩을 확인하세요.", "warn");
      return;
    }

    const { data, error } = await this.sb
      .from("product_master")
      .select("*")
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });

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
        <td><button class="product-link" data-pm-edit="${p.id}" type="button">${this.html(p.name)}</button></td>
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

    this.requests = Array.isArray(data) ? data : [];
    this.renderRequests();
  },

  getFilteredRequests() {
    const els = this.getEls();
    const keyword = String(els.requestKeyword?.value || "").trim().toLowerCase();
    const status = els.requestStatus?.value || "";

    return this.requests.filter((r) => {
      const text = [r.category, r.name, r.maker, r.code, r.capacity, r.cas, r.grade, r.usage, r.requester, r.team, r.reject_reason]
        .join(" ")
        .toLowerCase();

      if (keyword && !text.includes(keyword)) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  },

  renderRequests() {
    const els = this.getEls();
    if (!els.requestList) return;

    const rows = this.getFilteredRequests();
    if (els.requestCount) els.requestCount.textContent = `요청 ${rows.length}건`;

    if (!rows.length) {
      els.requestList.innerHTML = `<tr><td class="empty" colspan="12">제품 등록 요청이 없습니다.</td></tr>`;
      return;
    }

    els.requestList.innerHTML = rows.map((r) => `
      <tr>
        <td>${this.html(r.status || "요청")}</td>
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
            ${r.status === "요청" ? `<button class="ghost-btn" data-pm-request-progress="${r.id}" type="button">확인중</button>` : ""}
            ${["요청", "확인중"].includes(r.status || "요청") ? `<button class="ghost-btn" data-pm-request-approve="${r.id}" type="button">승인</button><button class="ghost-btn" data-pm-request-reject="${r.id}" type="button">반려</button>` : ""}
          </div>
        </td>
      </tr>
    `).join("");

    els.requestList.querySelectorAll("[data-pm-request-progress]").forEach((btn) => {
      btn.addEventListener("click", () => this.markRequestInProgress(Number(btn.dataset.pmRequestProgress)));
    });

    els.requestList.querySelectorAll("[data-pm-request-approve]").forEach((btn) => {
      btn.addEventListener("click", () => this.approveRequest(Number(btn.dataset.pmRequestApprove)));
    });

    els.requestList.querySelectorAll("[data-pm-request-reject]").forEach((btn) => {
      btn.addEventListener("click", () => this.rejectRequest(Number(btn.dataset.pmRequestReject)));
    });
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
  }
};
