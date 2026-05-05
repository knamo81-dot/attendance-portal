window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.els = {
  category: document.getElementById("category"),
  productName: document.getElementById("productName"),
  maker: document.getElementById("maker"),
  code: document.getElementById("code"),
  capacity: document.getElementById("capacity"),
  cas: document.getElementById("cas"),
  grade: document.getElementById("grade"),
  qty: document.getElementById("qty"),
  usage: document.getElementById("usage"),

  openSearch: document.getElementById("openSearch"),
  closeSearch: document.getElementById("closeSearch"),
  searchModal: document.getElementById("searchModal"),
  searchInput: document.getElementById("searchInput"),
  searchCategory: document.getElementById("searchCategory"),
  searchMaker: document.getElementById("searchMaker"),
  sortMode: document.getElementById("sortMode"),
  searchResults: document.getElementById("searchResults"),
  resultInfo: document.getElementById("resultInfo"),

  addItem: document.getElementById("addItem"),
  clearForm: document.getElementById("clearForm"),
  requestNew: document.getElementById("requestNew"),
  loadSample: document.getElementById("loadSample"),
  clearDraft: document.getElementById("clearDraft"),
  addToCollect: document.getElementById("addToCollect"),

  draftTableBody: document.getElementById("draftTableBody"),
  draftCountBadge: document.getElementById("draftCountBadge"),
  sumDraftCount: document.getElementById("sumDraftCount"),
  sumReagent: document.getElementById("sumReagent"),
  sumGlass: document.getElementById("sumGlass"),
  sumSafety: document.getElementById("sumSafety"),

  collectKeyword: document.getElementById("collectKeyword"),
  collectCategory: document.getElementById("collectCategory"),
  collectList: document.getElementById("collectList"),
  collectCount: document.getElementById("collectCount"),
  collectQty: document.getElementById("collectQty"),
  collectMix: document.getElementById("collectMix"),
  confirmSelectedCollect: document.getElementById("confirmSelectedCollect"),
  excludeSelectedCollect: document.getElementById("excludeSelectedCollect"),
  sendToPrepare: document.getElementById("sendToPrepare"),
  refreshPrepare: document.getElementById("refreshPrepare"),
  finalizePrepareMonth: document.getElementById("finalizePrepareMonth"),
  showQuoteMain: document.getElementById("showQuoteMain"),
  showQuoteSafety: document.getElementById("showQuoteSafety"),

  inlineRequest: document.getElementById("inlineRequest"),
  openReagentAdmin: document.getElementById("openReagentAdmin"),
  toastWrap: document.getElementById("toastWrap")
};

window.ReagentApp.toast = function (message, type = "") {
  const wrap = window.ReagentApp.els.toastWrap;
  if (!wrap) {
    alert(message);
    return;
  }

  const div = document.createElement("div");
  div.className = `toast ${type}`.trim();
  div.textContent = message;
  wrap.appendChild(div);
  setTimeout(() => div.remove(), 2500);
};

window.ReagentApp.setValue = function (el, value) {
  if (el) el.value = value;
};

window.ReagentApp.escapeHtml = function (value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};


window.ReagentApp.isGlobalAdmin = function () {
  const user = window.ReagentApp.currentUser || {};
  const role = String(user.user_role || user.role || "").trim();
  return ["admin", "관리자", "Admin"].includes(role) || user.is_global_admin === true;
};

window.ReagentApp.isReagentOperator = function () {
  const user = window.ReagentApp.currentUser || {};
  const role = String(user.role || user.user_role || "").trim();
  return window.ReagentApp.isGlobalAdmin?.() === true ||
    user.is_reagent_operator === true ||
    ["operator", "운영자", "Operator"].includes(role);
};

window.ReagentApp.hasReagentOperatorAccess = function () {
  return window.ReagentApp.isReagentOperator?.() === true;
};

window.ReagentApp.hasReagentAdminAccess = function () {
  return window.ReagentApp.isGlobalAdmin?.() === true;
};

window.ReagentApp.canAccessTab = function (tab) {
  if (!tab || tab === "request") return true;
  if (["collect", "prepare", "product-management"].includes(tab)) {
    return window.ReagentApp.hasReagentOperatorAccess?.() === true;
  }
  if (tab === "admin-management") {
    return window.ReagentApp.hasReagentAdminAccess?.() === true;
  }
  return true;
};

window.ReagentApp.showTab = function (tab) {
  const targetTab = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  const targetPage = document.getElementById(`page-${tab}`);

  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));

  targetTab?.classList.add("active");
  targetPage?.classList.add("active");

  if (tab === "prepare") {
    window.ReagentApp.collect?.initPrepareMonthControl?.();
    window.ReagentApp.collect?.renderPrepare?.();
  }

  if (tab === "product-management") {
    window.ReagentApp.productManagement?.init?.();
  }

  if (tab === "admin-management") {
    window.ReagentApp.productManagement?.initOperatorManagement?.();
  }
};

window.ReagentApp.applyPermissionUI = function () {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const tab = btn.dataset.tab || "";
    const allowed = window.ReagentApp.canAccessTab?.(tab) !== false;
    btn.style.display = allowed ? "" : "none";
    btn.disabled = !allowed;
  });

  const adminButton = window.ReagentApp.els?.openReagentAdmin;
  if (adminButton) {
    const adminAllowed = window.ReagentApp.hasReagentAdminAccess?.() === true;
    adminButton.style.display = adminAllowed ? "" : "none";
    adminButton.disabled = !adminAllowed;
  }

  const currentActive = document.querySelector(".tab-btn.active");
  if (currentActive && window.ReagentApp.canAccessTab?.(currentActive.dataset.tab) === false) {
    window.ReagentApp.showTab?.("request");
  }
};

window.ReagentApp.loadReagentPermission = async function () {
  const sb = window.ReagentApp.sb;
  const user = window.ReagentApp.currentUser || {};

  user.is_global_admin = ["admin", "관리자", "Admin"].includes(String(user.user_role || user.role || "").trim());
  user.is_reagent_operator = false;

  if (!sb) {
    window.ReagentApp.currentUser = user;
    return user;
  }

  try {
    if (user.email) {
      const { data: userRoleRow, error: userRoleError } = await sb
        .from("users")
        .select("email, role")
        .eq("email", user.email)
        .maybeSingle();

      if (userRoleError) {
        console.warn("공통 권한 조회 실패:", userRoleError);
      } else if (userRoleRow) {
        user.user_role = userRoleRow.role || "";
        if (String(userRoleRow.role || "").trim() === "admin") {
          user.is_global_admin = true;
        }
      }
    }

    if (!user.is_global_admin && user.employee_no) {
      const { data: operatorRow, error: operatorError } = await sb
        .from("reagent_operators")
        .select("employee_no, is_active, role")
        .eq("employee_no", user.employee_no)
        .eq("is_active", true)
        .maybeSingle();

      if (operatorError) {
        console.warn("시약초자 운영자 권한 조회 실패:", operatorError);
      } else if (operatorRow) {
        user.is_reagent_operator = true;
        user.reagent_role = operatorRow.role || "운영자";
      }
    }

    if (user.is_global_admin) {
      user.is_reagent_operator = true;
      user.reagent_role = "관리자";
    }
  } catch (err) {
    console.warn("시약초자 권한 조회 중 오류:", err);
  }

  window.ReagentApp.currentUser = user;
  try {
    localStorage.setItem("reagent_current_user", JSON.stringify(user));
  } catch (_) {}

  return user;
};


window.ReagentApp.bindTabs = function () {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab || "";

      if (window.ReagentApp.canAccessTab?.(tab) === false) {
        window.ReagentApp.toast?.("접근 권한이 없는 기능입니다.", "warn");
        window.ReagentApp.showTab?.("request");
        return;
      }

      window.ReagentApp.showTab?.(tab);
    });
  });
};


window.ReagentApp.isRequestAdmin = function () {
  return window.ReagentApp.hasReagentOperatorAccess?.() === true;
};

window.ReagentApp.applyRequestAdminUI = function () {
  const allowed = window.ReagentApp.hasReagentOperatorAccess?.() === true;
  const adminArea = document.querySelector(".admin-request-actions");

  if (adminArea) {
    adminArea.style.display = allowed ? "flex" : "none";
  }

  if (window.ReagentApp.els?.addToCollect) {
    window.ReagentApp.els.addToCollect.disabled = !allowed;
    window.ReagentApp.els.addToCollect.style.display = allowed ? "" : "none";
  }

  if (window.ReagentApp.els?.clearDraft) {
    window.ReagentApp.els.clearDraft.disabled = !allowed;
    window.ReagentApp.els.clearDraft.style.display = allowed ? "" : "none";
  }
};

window.ReagentApp.requireRequestAdmin = function () {
  const allowed = window.ReagentApp.hasReagentOperatorAccess?.() === true;
  if (!allowed) {
    window.ReagentApp.toast?.("운영자 이상만 사용할 수 있는 기능입니다.", "warn");
  }
  return allowed;
};


window.ReagentApp.bindEvents = function () {
  const { els, request, collect, toast } = window.ReagentApp;

  els.openReagentAdmin?.addEventListener("click", () => {
    if (window.ReagentApp.hasReagentAdminAccess?.() !== true) {
      window.ReagentApp.toast?.("관리자만 사용할 수 있는 기능입니다.", "warn");
      return;
    }
    window.ReagentApp.showTab?.("admin-management");
  });

  els.openSearch?.addEventListener("click", () => request.openSearchModal());
  els.closeSearch?.addEventListener("click", () => request.closeSearchModal());

  els.searchModal?.addEventListener("click", (e) => {
    if (e.target === els.searchModal) request.closeSearchModal();
  });

  [els.searchInput, els.searchCategory, els.searchMaker, els.sortMode].forEach((el) => {
    el?.addEventListener("input", () => request.renderSearchResults());
    el?.addEventListener("change", () => request.renderSearchResults());
  });

  els.addItem?.addEventListener("click", () => request.addCurrentItem());
  els.clearForm?.addEventListener("click", () => request.clearForm());
  els.clearDraft?.addEventListener("click", () => {
    request.openClearDataDialog?.();
  });
  els.addToCollect?.addEventListener("click", () => {
    collect.addSelectedToCollect();
  });

  els.collectKeyword?.addEventListener("input", () => collect.renderCollect());
  els.collectCategory?.addEventListener("change", () => collect.renderCollect());

  els.requestNew?.addEventListener("click", async () => {
    await request.openRegistrationRequestDialog?.();
  });

  els.inlineRequest?.addEventListener("click", async () => {
    await request.openRegistrationRequestDialog?.();
  });

  els.confirmSelectedCollect?.addEventListener("click", () => collect.confirmSelectedCollect?.());
  els.excludeSelectedCollect?.addEventListener("click", () => collect.excludeSelectedCollect?.());

  els.sendToPrepare?.addEventListener("click", () => collect.moveToPrepare?.());

  // 취합정리는 제품취합의 [취합정리 반영] 버튼 또는 탭 진입 시 자동 갱신됩니다.
  // 기존 HTML에 남아 있는 수동 새로고침 버튼은 혼동 방지를 위해 숨깁니다.
  if (els.refreshPrepare) {
    els.refreshPrepare.style.display = "none";
  }

  els.finalizePrepareMonth?.addEventListener("click", () => collect.finalizePrepareMonth?.());
  els.showQuoteMain?.addEventListener("click", () => collect.setPrepareActiveView?.("main"));
  els.showQuoteSafety?.addEventListener("click", () => collect.setPrepareActiveView?.("safety"));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") request.closeSearchModal();
  });
};


window.ReagentApp.getStoredUserHint = function () {
  const candidates = [
    "reagent_current_user",
    "currentUser",
    "portal_current_user",
    "lab_current_user",
    "loginUser",
    "user",
    "employee"
  ];

  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (_) {
      const raw = localStorage.getItem(key);
      if (raw) return { employee_no: raw };
    }
  }

  return {};
};

window.ReagentApp.getUrlUserHint = function () {
  const params = new URLSearchParams(window.location.search);

  return {
    email:
      params.get("email") ||
      params.get("user_email") ||
      params.get("userEmail") ||
      "",

    employee_no:
      params.get("employee_no") ||
      params.get("employeeNo") ||
      params.get("emp_no") ||
      params.get("empNo") ||
      "",

    name:
      params.get("name") ||
      params.get("user_name") ||
      params.get("userName") ||
      ""
  };
};

window.ReagentApp.loadCurrentUser = async function () {
  const sb = window.ReagentApp.sb;
  const toast = window.ReagentApp.toast || (() => {});

  const storedHint = window.ReagentApp.getStoredUserHint?.() || {};
  const urlHint = window.ReagentApp.getUrlUserHint?.() || {};

  const email =
    urlHint.email ||
    storedHint.email ||
    storedHint.user_email ||
    storedHint.userEmail ||
    "";

  const employeeNo =
    urlHint.employee_no ||
    storedHint.employee_no ||
    storedHint.employeeNo ||
    storedHint.emp_no ||
    storedHint.empNo ||
    "";

  const userName =
    urlHint.name ||
    storedHint.name ||
    storedHint.user_name ||
    storedHint.userName ||
    "";

  window.ReagentApp.currentUser = {
    email: email || "",
    employee_no: employeeNo || "",
    name: userName || "",
    division_code: storedHint.division_code || "",
    team_code: storedHint.team_code || "",
    department: storedHint.department || storedHint.division_name || "",
    division_name: storedHint.division_name || storedHint.department || "",
    team: storedHint.team || storedHint.team_name || "",
    team_name: storedHint.team_name || storedHint.team || "",
    position: storedHint.position || "",
    role: storedHint.role || storedHint.authority || ""
  };

  if (!sb) {
    console.warn("Supabase client가 없어 사용자 정보를 불러오지 못했습니다.");
    return window.ReagentApp.currentUser;
  }

  try {
    let query = sb
      .from("employees")
      .select("employee_no,name,division_code,team_code,position,authority,email,status")
      .limit(1);

    if (employeeNo) {
      query = query.eq("employee_no", employeeNo);
    } else if (email) {
      query = query.eq("email", email);
    } else if (userName) {
      query = query.eq("name", userName);
    } else {
      console.warn("사용자 조회 기준(employee_no/email/name)이 없어 미지정 사용자로 진행합니다.");
      return window.ReagentApp.currentUser;
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.warn("사용자 정보 조회 실패:", error);
      toast("사용자 정보를 불러오지 못해 미지정으로 저장됩니다.", "warn");
      return window.ReagentApp.currentUser;
    }

    if (data) {
      let divisionName = "";
      let teamName = "";

      const divisionCode = data.division_code || "";
      const teamCode = data.team_code || "";

      if (divisionCode || teamCode) {
        const codes = [divisionCode, teamCode].filter(Boolean);

        const { data: orgRows, error: orgError } = await sb
          .from("teams")
          .select("team_code,division_code,team_name")
          .in("team_code", codes);

        if (orgError) {
          console.warn("조직명 조회 실패:", orgError);
        } else if (Array.isArray(orgRows)) {
          const divisionRow = orgRows.find((row) => row.team_code === divisionCode);
          const teamRow = orgRows.find((row) => row.team_code === teamCode);

          divisionName = divisionRow?.team_name || "";
          teamName = teamRow?.team_name || "";
        }
      }

      // team_code가 본부 코드와 동일한 경우에는 본부명만 있고 팀명은 비어 있을 수 있습니다.
      // 이때 화면 표시용 team은 divisionName으로 대체합니다.
      const displayTeam = teamName || divisionName || "";

      window.ReagentApp.currentUser = {
        email: data.email || email || "",
        employee_no: data.employee_no || "",
        name: data.name || "",
        division_code: divisionCode,
        team_code: teamCode,
        department: divisionName,
        division_name: divisionName,
        team: displayTeam,
        team_name: teamName,
        position: data.position || "",
        role: data.authority || ""
      };

      try {
        localStorage.setItem("reagent_current_user", JSON.stringify(window.ReagentApp.currentUser));
      } catch (_) {}
    } else {
      console.warn("employees 테이블에서 사용자 정보를 찾지 못했습니다.", { employeeNo, email, userName });
      toast("사원정보를 찾지 못해 미지정으로 저장됩니다.", "warn");
    }

    return window.ReagentApp.currentUser;
  } catch (err) {
    console.warn("사용자 정보 조회 중 오류:", err);
    toast("사용자 정보를 불러오지 못해 미지정으로 저장됩니다.", "warn");
    return window.ReagentApp.currentUser;
  }
};


document.addEventListener("DOMContentLoaded", async () => {
  if (!window.ReagentApp.request) {
    console.error("request.js 로드 실패");
    return;
  }

  await window.ReagentApp.loadCurrentUser?.();
  await window.ReagentApp.loadReagentPermission?.();
  window.ReagentApp.applyRequestAdminUI?.();
  window.ReagentApp.applyPermissionUI?.();

  window.ReagentApp.bindTabs();
  window.ReagentApp.request.populateMakerOptions();
  window.ReagentApp.bindEvents();
  window.ReagentApp.request.bindRegistrationStatusPanel?.();
  window.ReagentApp.request.setRequestPanelView?.("list");
  window.ReagentApp.request.renderSearchResults();
  window.ReagentApp.request.fetchData();

  if (document.querySelector('.tab-btn[data-tab="product-management"]')?.classList.contains("active")) {
    window.ReagentApp.productManagement?.init?.();
  }

  if (document.querySelector('.tab-btn[data-tab="admin-management"]')?.classList.contains("active")) {
    window.ReagentApp.productManagement?.initOperatorManagement?.();
  }
});
