window.ReagentApp = window.ReagentApp || {};

try {
  document.documentElement.classList.add("permission-loading");
  document.body?.classList.add("permission-loading");
} catch (_) {}


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


window.ReagentApp.getCleanLabel = function (el) {
  return String(el?.textContent || "").replace(/\s+/g, "").trim();
};

window.ReagentApp.isGlobalAdmin = function () {
  const user = window.ReagentApp.currentUser || {};
  const role = String(user.user_role || "").trim();
  return role === "admin" || user.is_global_admin === true;
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

window.ReagentApp.getTabAccessLevel = function (target) {
  const tab = typeof target === "string" ? target : String(target?.dataset?.tab || "");
  const label = typeof target === "string" ? "" : window.ReagentApp.getCleanLabel(target);

  if (tab === "admin-management" || label === "관리자기능") return "admin";

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
      btn.setAttribute("aria-hidden", "true");
      btn.dataset.permissionHidden = "1";
    } else {
      btn.style.removeProperty("display");
      btn.style.removeProperty("visibility");
      btn.disabled = false;
      btn.setAttribute("aria-hidden", "false");
      btn.dataset.permissionHidden = "0";
    }
  });

  const adminButton = window.ReagentApp.els?.openReagentAdmin || document.getElementById("openReagentAdmin");
  if (adminButton) {
    const allowed = window.ReagentApp.hasReagentAdminAccess?.() === true;
    if (!allowed) {
      adminButton.style.setProperty("display", "none", "important");
      adminButton.disabled = true;
      adminButton.setAttribute("aria-hidden", "true");
    } else {
      adminButton.style.removeProperty("display");
      adminButton.disabled = false;
      adminButton.setAttribute("aria-hidden", "false");
    }
  }

  const activeBtn = document.querySelector(".tab-btn.active, button[data-tab].active");
  if (activeBtn && window.ReagentApp.canAccessTab?.(activeBtn) === false) {
    window.ReagentApp.showTab?.("request");
  }
};

window.ReagentApp.applyPermissionUI = function () {
  window.ReagentApp.enforcePermissionDom?.();

  try {
    document.documentElement.classList.remove("permission-loading");
    document.body?.classList.remove("permission-loading");
    document.documentElement.classList.add("permission-ready");
    document.body?.classList.add("permission-ready");
  } catch (_) {}

  if (!window.ReagentApp._permissionObserver) {
    window.ReagentApp._permissionObserver = new MutationObserver(() => {
      window.ReagentApp.enforcePermissionDom?.();
    });
    window.ReagentApp._permissionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-permission-hidden", "aria-hidden"]
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

window.ReagentApp.showTab = function (tab) {
  const targetTab = document.querySelector(`.tab-btn[data-tab="${tab}"], button[data-tab="${tab}"]`);

  if (targetTab && window.ReagentApp.canAccessTab?.(targetTab) === false) {
    window.ReagentApp.toast?.("접근 권한이 없는 기능입니다.", "warn");
    tab = "request";
  }

  const finalTab = document.querySelector(`.tab-btn[data-tab="${tab}"], button[data-tab="${tab}"]`);
  const finalPage = document.getElementById(`page-${tab}`);

  document.querySelectorAll(".tab-btn, button[data-tab]").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));

  finalTab?.classList.add("active");
  finalPage?.classList.add("active");

  window.ReagentApp.enforcePermissionDom?.();

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

window.ReagentApp.loadReagentPermission = async function () {
  const sb = window.ReagentApp.sb;
  const user = window.ReagentApp.currentUser || {};
  const urlHint = window.ReagentApp.getUrlUserHint?.() || {};
  const storedHint = window.ReagentApp.getStoredUserHint?.() || {};

  user.user_role = urlHint.user_role || user.user_role || storedHint.user_role || "";
  user.reagent_role = urlHint.reagent_role || user.reagent_role || storedHint.reagent_role || "";
  user.is_global_admin = user.user_role === "admin" || user.is_global_admin === true || storedHint.is_global_admin === true;
  user.is_reagent_operator = user.is_global_admin === true || user.is_reagent_operator === true || storedHint.is_reagent_operator === true || user.reagent_role === "관리자" || user.reagent_role === "운영자";

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
        user.is_global_admin = String(userRoleRow.role || "").trim() === "admin";
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

document.addEventListener("click", function (e) {
  const btn = e.target.closest?.(".tab-btn, button[data-tab]");
  if (!btn) return;

  if (window.ReagentApp.canAccessTab?.(btn) === false) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    window.ReagentApp.toast?.("접근 권한이 없는 기능입니다.", "warn");
    window.ReagentApp.showTab?.("request");
  }
}, true);


window.ReagentApp.bindTabs = function () {
  document.querySelectorAll(".tab-btn, button[data-tab]").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", (e) => {
      if (window.ReagentApp.canAccessTab?.(btn) === false) {
        e.preventDefault();
        e.stopPropagation();
        window.ReagentApp.toast?.("접근 권한이 없는 기능입니다.", "warn");
        window.ReagentApp.showTab?.("request");
        return;
      }

      window.ReagentApp.showTab?.(btn.dataset.tab || "request");
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
    role: storedHint.role || storedHint.authority || "",
    user_role: urlHint.user_role || storedHint.user_role || "",
    reagent_role: urlHint.reagent_role || storedHint.reagent_role || "",
    is_global_admin: storedHint.is_global_admin === true || urlHint.user_role === "admin",
    is_reagent_operator: storedHint.is_reagent_operator === true || urlHint.reagent_role === "관리자" || urlHint.reagent_role === "운영자"
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
        role: data.authority || "",
        user_role: urlHint.user_role || storedHint.user_role || "",
        reagent_role: urlHint.reagent_role || storedHint.reagent_role || "",
        is_global_admin: storedHint.is_global_admin === true || urlHint.user_role === "admin",
        is_reagent_operator: storedHint.is_reagent_operator === true || urlHint.reagent_role === "관리자" || urlHint.reagent_role === "운영자"
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

  if (document.querySelector('.tab-btn[data-tab="admin-management"]')?.classList.contains("active")) {
    window.ReagentApp.productManagement?.initOperatorManagement?.();
  }
});


// permission-loading fallback release
setTimeout(() => {
  try {
    window.ReagentApp.applyPermissionUI?.();
    document.documentElement.classList.remove("permission-loading");
    document.body?.classList.remove("permission-loading");
  } catch (_) {}
}, 2500);
