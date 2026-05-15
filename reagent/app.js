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

window.ReagentApp.getPortalSession = function () {
  try {
    if (window.parent && window.parent !== window && window.parent.portalSession) {
      return window.parent.portalSession || {};
    }
  } catch (_) {}

  return window.portalSession || {};
};

window.ReagentApp.getCompanyId = function () {
  const session = window.ReagentApp.getPortalSession?.() || {};
  const profile = session.profile || {};
  const user = session.user || {};

  return String(
    session.companyId ||
    session.company_id ||
    profile.company_id ||
    profile.companyId ||
    user.company_id ||
    user.companyId ||
    ""
  ).trim();
};

window.ReagentApp.isPortalAdminSession = function () {
  const session = window.ReagentApp.getPortalSession?.() || {};
  const profile = session.profile || {};
  const user = session.user || {};
  const roles = [
    session.role,
    session.user_role,
    session.role_key,
    profile.role,
    profile.user_role,
    profile.role_key,
    user.role,
    user.user_role,
    user.role_key
  ];

  return roles.some((role) => {
    const normalized = String(role || "").trim().toLowerCase();
    return normalized === "admin" || normalized === "관리자";
  });
};

window.ReagentApp.getPortalUserHint = function () {
  const session = window.ReagentApp.getPortalSession?.() || {};
  const profile = session.profile || {};
  const user = session.user || {};

  return {
    company_id: window.ReagentApp.getCompanyId?.() || "",
    email: profile.email || user.email || session.email || "",
    employee_no: profile.employee_no || profile.employeeNo || user.employee_no || user.employeeNo || session.employee_no || session.employeeNo || "",
    name: profile.name || profile.employee_name || profile.username || user.name || user.employee_name || session.name || "",
    division_code: profile.division_code || user.division_code || session.division_code || "",
    team_code: profile.team_code || user.team_code || session.team_code || "",
    division_name: profile.division_name || profile.department || user.division_name || user.department || session.division_name || session.department || "",
    team_name: profile.team_name || profile.team || user.team_name || user.team || session.team_name || session.team || "",
    position: profile.position || user.position || session.position || "",
    role: profile.authority || profile.role || user.authority || user.role || session.role || ""
  };
};


window.ReagentApp.getCleanLabel = function (el) {
  return String(el?.textContent || "").replace(/\s+/g, "").trim();
};

window.ReagentApp.isGlobalAdmin = function () {
  const user = window.ReagentApp.currentUser || {};
  const role = String(user.user_role || user.role || "").trim().toLowerCase();
  return role === "admin" || role === "관리자" || user.is_global_admin === true || window.ReagentApp.isPortalAdminSession?.() === true;
};

window.ReagentApp.isReagentOperator = function () {
  const user = window.ReagentApp.currentUser || {};
  return window.ReagentApp.isGlobalAdmin?.() === true || user.is_reagent_operator === true;
};

window.ReagentApp.hasReagentOperatorAccess = function () {
  return window.ReagentApp.isReagentOperator?.() === true;
};

window.ReagentApp.hasReagentAdminAccess = function () {
  return window.ReagentApp.isGlobalAdmin?.() === true;
};


// index.html 초기 권한 숨김 클래스 보정
// 권한 조회 후 실제 권한에 맞게 html 클래스를 갱신합니다.
window.ReagentApp.syncRoleClass = function () {
  const root = document.documentElement;
  if (!root) return;

  root.classList.remove("reagent-role-general", "reagent-role-operator", "reagent-role-admin");

  if (window.ReagentApp.hasReagentAdminAccess?.() === true) {
    root.classList.add("reagent-role-admin");
  } else if (window.ReagentApp.hasReagentOperatorAccess?.() === true) {
    root.classList.add("reagent-role-operator");
  } else {
    root.classList.add("reagent-role-general");
  }
};

window.ReagentApp.getTabAccessLevel = function (target) {
  const tab = typeof target === "string" ? target : String(target?.dataset?.tab || "");
  const label = typeof target === "string" ? "" : window.ReagentApp.getCleanLabel(target);

  if (
    tab === "collect" ||
    tab === "prepare" ||
    tab === "product-management" ||
    label === "제품취합" ||
    label === "취합정리" ||
    label === "제품관리"
  ) {
    return "operator";
  }

  if (
    tab === "request" ||
    label === "제품신청"
  ) {
    return "all";
  }

  return "operator";
};

window.ReagentApp.canAccessTab = function (target) {
  const level = window.ReagentApp.getTabAccessLevel?.(target);
  if (level === "all") return true;
  if (level === "operator") return window.ReagentApp.hasReagentOperatorAccess?.() === true;
  if (level === "admin") return window.ReagentApp.hasReagentAdminAccess?.() === true;
  return false;
};

window.ReagentApp.enforcePermissionDom = function () {
  document.querySelectorAll(".tab-btn, button[data-tab]").forEach((btn) => {
    const allowed = window.ReagentApp.canAccessTab?.(btn) === true;
    if (!allowed) {
      btn.style.setProperty("display", "none", "important");
      btn.style.setProperty("visibility", "hidden", "important");
      btn.disabled = true;
      btn.style.setProperty("pointer-events", "none", "important");
      btn.setAttribute("aria-hidden", "true");
      btn.dataset.permissionHidden = "1";
    } else {
      btn.style.removeProperty("display");
      btn.style.removeProperty("visibility");
      btn.disabled = false;
      btn.style.removeProperty("pointer-events");
      btn.setAttribute("aria-hidden", "false");
      btn.dataset.permissionHidden = "0";
    }
  });

  const activeBtn = document.querySelector(".tab-btn.active, button[data-tab].active");
  if (activeBtn && window.ReagentApp.canAccessTab?.(activeBtn) === false) {
    window.ReagentApp.showTab?.("request");
  }
};

window.ReagentApp.applyPermissionUI = function () {
  window.ReagentApp.syncRoleClass?.();
  window.ReagentApp.enforcePermissionDom?.();

  if (!window.ReagentApp._permissionObserver) {
    window.ReagentApp._permissionObserver = new MutationObserver(() => {
      window.ReagentApp.enforcePermissionDom?.();
    });
    window.ReagentApp._permissionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
  }

  clearInterval(window.ReagentApp._permissionInterval);
  let count = 0;
  window.ReagentApp._permissionInterval = setInterval(() => {
    window.ReagentApp.enforcePermissionDom?.();
    count += 1;
    if (count > 100) clearInterval(window.ReagentApp._permissionInterval);
  }, 100);
};


window.ReagentApp.normalizeRemovedTab = function (tab) {
  return tab === "admin-management" ? "request" : tab;
};

window.ReagentApp.showTab = function (tab) {
  tab = window.ReagentApp.normalizeRemovedTab?.(tab) || tab || "request";
  const targetTab = document.querySelector(`.tab-btn[data-tab="${tab}"], button[data-tab="${tab}"]`);

  if (targetTab && window.ReagentApp.canAccessTab?.(targetTab) === false) {
    window.ReagentApp.toast?.("접근 권한이 없는 기능입니다.", "warn");
    tab = "request";
  }

  window.ReagentApp.forceShowTab?.(tab);
};

window.ReagentApp.loadReagentPermission = async function () {
  const sb = window.ReagentApp.sb;
  const user = window.ReagentApp.currentUser || {};

  const companyId = window.ReagentApp.getCompanyId?.() || String(user.company_id || user.companyId || "").trim();
  const portalAdmin = window.ReagentApp.isPortalAdminSession?.() === true;

  user.company_id = companyId || user.company_id || user.companyId || "";
  user.user_role = portalAdmin ? "admin" : "";
  user.reagent_role = "";
  user.is_global_admin = portalAdmin;
  user.is_reagent_operator = portalAdmin;

  if (!sb) {
    window.ReagentApp.currentUser = user;
    return user;
  }

  try {
    let targetEmail = String(user.email || user.user_email || user.userEmail || "").trim();
    let targetEmployeeNo = String(user.employee_no || user.employeeNo || "").trim();
    const targetName = String(user.name || user.user_name || user.userName || "").trim();

    // 사번이 비어 있는 경우 email/name으로 employees를 한 번 더 확인합니다.
    // settings 권한관리(user_app_roles)가 employee_no 중심으로 저장된 경우를 보정하기 위함입니다.
    if (!targetEmployeeNo && (targetEmail || targetName)) {
      try {
        let empQuery = sb.from("employees").select("*").limit(1);
        if (targetEmail) empQuery = empQuery.ilike("email", targetEmail);
        else if (targetName) empQuery = empQuery.eq("name", targetName);

        const { data: empRow, error: empLookupError } = await empQuery.maybeSingle();
        if (empLookupError) {
          console.warn("시약초자 권한용 사원정보 보정 조회 실패:", empLookupError);
        } else if (empRow) {
          targetEmployeeNo = String(empRow.employee_no || empRow.employeeNo || "").trim();
          targetEmail = String(empRow.email || targetEmail || "").trim();
          user.employee_no = targetEmployeeNo || user.employee_no || "";
          user.email = targetEmail || user.email || "";
          user.name = empRow.name || user.name || "";
        }
      } catch (empLookupCatch) {
        console.warn("시약초자 권한용 사원정보 보정 조회 건너뜀:", empLookupCatch);
      }
    }

    const targetEmailLower = targetEmail.toLowerCase();

    // 1) 공통 관리자 권한: users.role = admin
    if (targetEmail) {
      const { data: userRoleRow, error: userRoleError } = await sb
        .from("users")
        .select("email, role")
        .ilike("email", targetEmail)
        .maybeSingle();

      if (userRoleError) {
        console.warn("공통 관리자 권한 조회 실패:", userRoleError);
      } else if (userRoleRow) {
        user.user_role = String(userRoleRow.role || "").trim();
        user.is_global_admin = user.user_role === "admin";
      }
    }

    // 2) 포탈 settings 권한관리 기준: user_app_roles
    //    app_key는 reagent를 기본으로 보되, 기존 명칭이 섞여 있어도 동작하도록 폭넓게 허용합니다.
    //    role_key도 operator/운영자를 모두 허용합니다.
    if (!user.is_global_admin) {
      const appKeys = ["reagent", "reagents", "supplies", "glassware", "reagent_glassware", "reagent-glassware"];
      const operatorRoleKeys = ["operator", "운영자"];

      let appRoleQuery = sb
        .from("user_app_roles")
        .select("company_id,employee_no,email,name,app_key,role_key")
        .in("app_key", appKeys);

      if (companyId) {
        appRoleQuery = appRoleQuery.eq("company_id", companyId);
      }

      const { data: appRoles, error: appRoleError } = await appRoleQuery;

      if (appRoleError) {
        console.warn("시약초자 중앙 권한 조회 실패:", appRoleError);
      } else {
        const matchedRole = (Array.isArray(appRoles) ? appRoles : []).find((row) => {
          const rowEmployeeNo = String(row.employee_no || "").trim();
          const rowEmail = String(row.email || "").trim().toLowerCase();
          const rowName = String(row.name || "").trim();
          const roleKey = String(row.role_key || "").trim();

          const sameEmployee = !!targetEmployeeNo && !!rowEmployeeNo && rowEmployeeNo === targetEmployeeNo;
          const sameEmail = !!targetEmailLower && !!rowEmail && rowEmail === targetEmailLower;
          const sameName = !targetEmployeeNo && !targetEmailLower && !!targetName && !!rowName && rowName === targetName;

          return operatorRoleKeys.includes(roleKey) && (sameEmployee || sameEmail || sameName);
        });

        if (matchedRole) {
          user.is_reagent_operator = true;
          user.reagent_role = "운영자";
        }
      }
    }

    // 3) 관리자는 시약초자 전체 운영권한도 자동 보유
    if (user.is_global_admin) {
      user.is_reagent_operator = true;
      user.reagent_role = "관리자";
    }
  } catch (err) {
    console.warn("시약초자 권한 조회 중 오류:", err);
    user.is_reagent_operator = user.is_global_admin === true;
    if (user.is_global_admin) user.reagent_role = "관리자";
  }

  window.ReagentApp.currentUser = user;
  try {
    localStorage.setItem("reagent_current_user", JSON.stringify(user));
  } catch (_) {}

  window.ReagentApp.syncRoleClass?.();
  window.ReagentApp.applyRequestAdminUI?.();

  return user;
};

window.ReagentApp.getTabButtonFromEvent = function (event) {
  const target = event?.target;
  if (!target || !target.closest) return null;
  return target.closest(".tab-btn, button[data-tab]");
};

window.ReagentApp.handleTabButtonClick = function (btn, event) {
  if (!btn) return false;

  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (window.ReagentApp.canAccessTab?.(btn) === false) {
    window.ReagentApp.toast?.("접근 권한이 없는 기능입니다.", "warn");
    window.ReagentApp.forceShowTab?.("request");
    return false;
  }

  const tab = btn.dataset?.tab || "request";
  window.ReagentApp.forceShowTab?.(tab);
  return true;
};

window.ReagentApp.installTabClickGuard = function () {
  if (window.ReagentApp._tabClickGuardInstalled) return;
  window.ReagentApp._tabClickGuardInstalled = true;

  document.addEventListener("click", function (e) {
    const btn = window.ReagentApp.getTabButtonFromEvent?.(e);
    if (!btn) return;
    window.ReagentApp.handleTabButtonClick?.(btn, e);
  }, false);
};

window.ReagentApp.bindTabs = function () {
  window.ReagentApp.installTabClickGuard?.();

  document.querySelectorAll(".tab-btn, button[data-tab]").forEach((btn) => {
    btn.disabled = false;
    btn.style.removeProperty("pointer-events");

    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", (e) => {
      window.ReagentApp.handleTabButtonClick?.(btn, e);
    });
  });
};


window.ReagentApp.isRequestAdmin = function () {
  return window.ReagentApp.hasReagentOperatorAccess?.() === true;
};

window.ReagentApp.applyRequestAdminUI = function () {
  const allowed = window.ReagentApp.hasReagentOperatorAccess?.() === true;
  const adminArea = document.querySelector(".admin-request-actions");

  if (adminArea) adminArea.style.display = allowed ? "flex" : "none";

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
  if (!allowed) window.ReagentApp.toast?.("운영자 이상만 사용할 수 있는 기능입니다.", "warn");
  return allowed;
};


window.ReagentApp.bindEvents = function () {
  const { els, request, collect, toast } = window.ReagentApp;
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
      "",

    user_role:
      params.get("user_role") ||
      params.get("userRole") ||
      "",

    reagent_role:
      params.get("reagent_role") ||
      params.get("reagentRole") ||
      "",

    portal_auth:
      params.get("portal_auth") ||
      ""
  };
};

window.ReagentApp.loadCurrentUser = async function () {
  const sb = window.ReagentApp.sb;
  const toast = window.ReagentApp.toast || (() => {});

  const portalHint = window.ReagentApp.getPortalUserHint?.() || {};
  const storedHint = window.ReagentApp.getStoredUserHint?.() || {};
  const urlHint = window.ReagentApp.getUrlUserHint?.() || {};
  const companyId = portalHint.company_id || window.ReagentApp.getCompanyId?.() || "";

  const email =
    portalHint.email ||
    urlHint.email ||
    storedHint.email ||
    storedHint.user_email ||
    storedHint.userEmail ||
    "";

  const employeeNo =
    portalHint.employee_no ||
    urlHint.employee_no ||
    storedHint.employee_no ||
    storedHint.employeeNo ||
    storedHint.emp_no ||
    storedHint.empNo ||
    "";

  const userName =
    portalHint.name ||
    urlHint.name ||
    storedHint.name ||
    storedHint.user_name ||
    storedHint.userName ||
    "";

  window.ReagentApp.currentUser = {
    company_id: companyId || "",
    email: email || "",
    employee_no: employeeNo || "",
    name: userName || "",
    division_code: portalHint.division_code || storedHint.division_code || "",
    team_code: portalHint.team_code || storedHint.team_code || "",
    department: portalHint.division_name || storedHint.department || storedHint.division_name || "",
    division_name: portalHint.division_name || storedHint.division_name || storedHint.department || "",
    team: portalHint.team_name || storedHint.team || storedHint.team_name || "",
    team_name: portalHint.team_name || storedHint.team_name || storedHint.team || "",
    position: portalHint.position || storedHint.position || "",
    role: portalHint.role || storedHint.role || storedHint.authority || "",
    user_role: "",
    reagent_role: "",
    is_global_admin: false,
    is_reagent_operator: false
  };

  if (!sb) {
    console.warn("Supabase client가 없어 사용자 정보를 불러오지 못했습니다.");
    return window.ReagentApp.currentUser;
  }

  try {
    let query = sb
      .from("employees")
      .select("*")
      .limit(1);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    if (employeeNo) {
      query = query.eq("employee_no", employeeNo);
    } else if (email) {
      query = query.ilike("email", email);
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
      const divisionCode = data.division_code || data.department_code || data.division || "";
      const teamCode = data.team_code || data.team || "";
      const divisionName = data.division_name || data.department || data.division || "";
      const teamName = data.team_name || data.team || "";
      const displayTeam = teamName || divisionName || "";

      window.ReagentApp.currentUser = {
        company_id: data.company_id || companyId || "",
        email: data.email || email || "",
        employee_no: data.employee_no || data.employeeNo || employeeNo || "",
        name: data.name || userName || "",
        division_code: divisionCode,
        team_code: teamCode,
        department: divisionName,
        division_name: divisionName,
        team: displayTeam,
        team_name: teamName,
        position: data.position || "",
        role: data.authority || data.role || "",
        user_role: "",
        reagent_role: "",
        is_global_admin: false,
        is_reagent_operator: false
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
  window.ReagentApp.syncRoleClass?.();
  window.ReagentApp.applyRequestAdminUI?.();

  window.ReagentApp.bindTabs();
  window.ReagentApp.applyPermissionUI?.();
  window.ReagentApp.request.populateMakerOptions();
  window.ReagentApp.bindEvents();
  window.ReagentApp.request.bindRegistrationStatusPanel?.();
  window.ReagentApp.request.setRequestPanelView?.("list");
  window.ReagentApp.request.renderSearchResults();
  window.ReagentApp.request.fetchData();
  setTimeout(() => window.ReagentApp.applyPermissionUI?.(), 100);
  setTimeout(() => window.ReagentApp.applyPermissionUI?.(), 500);
  setTimeout(() => window.ReagentApp.applyPermissionUI?.(), 1500);

  if (document.querySelector('.tab-btn[data-tab="product-management"]')?.classList.contains("active")) {
    window.ReagentApp.productManagement?.init?.();
  }
});
