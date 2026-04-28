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

  inlineRequest: document.getElementById("inlineRequest"),
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

window.ReagentApp.bindTabs = function () {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const page = document.getElementById(`page-${btn.dataset.tab}`);
      if (page) page.classList.add("active");
    });
  });
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
  els.loadSample?.addEventListener("click", () => request.insertSample());
  els.clearDraft?.addEventListener("click", () => request.clearAllRows());
  els.addToCollect?.addEventListener("click", () => collect.addSelectedToCollect());

  els.collectKeyword?.addEventListener("input", () => collect.renderCollect());
  els.collectCategory?.addEventListener("change", () => collect.renderCollect());

  els.requestNew?.addEventListener("click", () => toast("제품 등록 요청 기능은 다음 단계에서 연결하면 됩니다.", "warn"));
  els.inlineRequest?.addEventListener("click", () => toast("제품 등록 요청 기능은 다음 단계에서 연결하면 됩니다.", "warn"));
  els.confirmSelectedCollect?.addEventListener("click", () => toast("선택 거래처 확정 기능은 다음 단계에서 연결하면 됩니다.", "warn"));
  els.excludeSelectedCollect?.addEventListener("click", () => toast("선택 취합 제외 기능은 다음 단계에서 연결하면 됩니다.", "warn"));

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
    department: storedHint.department || "",
    team: storedHint.team || "",
    position: storedHint.position || "",
    role: storedHint.role || ""
  };

  if (!sb) {
    console.warn("Supabase client가 없어 사용자 정보를 불러오지 못했습니다.");
    return window.ReagentApp.currentUser;
  }

  try {
    let query = sb
      .from("employees")
      .select("employee_no,name,department,team,position,role,email,status")
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
      window.ReagentApp.currentUser = {
        email: data.email || email || "",
        employee_no: data.employee_no || "",
        name: data.name || "",
        department: data.department || "",
        team: data.team || "",
        position: data.position || "",
        role: data.role || ""
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

  window.ReagentApp.bindTabs();
  window.ReagentApp.request.populateMakerOptions();
  window.ReagentApp.bindEvents();
  window.ReagentApp.request.renderSearchResults();
  window.ReagentApp.request.fetchData();
});
