// Supabase 연결 설정 | research-staff tenant session bridge
// - 부모 포탈 portalSession 우선 사용
// - activeCompanyId / company_id 자동 적용
// - 인력운영현황 앱의 주요 테이블 select/update/delete/insert/upsert에 company_id scope 적용

const SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

const USERS_TABLE = "users";
const EMPLOYEES_TABLE = "employees";
const USER_APP_ROLES_TABLE = "user_app_roles";
const RESEARCH_STAFF_APP_KEYS = ["research_staff", "research-staff", "researchStaff"];

const RESEARCH_STAFF_TENANT_TABLES = new Set([
  "users",
  "employees",
  "divisions",
  "teams",
  "employee_special_notes",
  "research_staff_profiles",
  "user_app_roles",
  "activity_logs",
  "app_role_assignments",
  "system_settings"
]);

let supabaseClient = null;
let rawSupabaseClient = null;

function getParentPortalSession() {
  try {
    if (window.parent && window.parent !== window && typeof window.parent.getPortalSession === "function") {
      return window.parent.getPortalSession();
    }
  } catch (_) {}

  try {
    if (window.parent && window.parent !== window && window.parent.portalSession) {
      return window.parent.portalSession;
    }
  } catch (_) {}

  return window.portalSession || window.currentPortalSession || null;
}

function getResearchStaffCompanyId() {
  const session = getParentPortalSession() || window.portalSession || window.currentPortalSession || {};
  const companyId =
    session.activeCompanyId ||
    session.active_company_id ||
    session.selectedCompanyId ||
    session.selected_company_id ||
    session.activeCompany?.id ||
    session.active_company?.id ||
    session.companyId ||
    session.company_id ||
    session.company?.id ||
    session.company?.company_id ||
    session.profile?.company_id ||
    window.currentCompanyId ||
    "";

  if (companyId) return String(companyId).trim();

  try {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("company_id") || params.get("companyId") || "").trim();
  } catch (_) {
    return "";
  }
}

function getResearchStaffCompanyName() {
  const session = getParentPortalSession() || window.portalSession || window.currentPortalSession || {};
  return String(
    session.activeCompanyName ||
    session.active_company_name ||
    session.activeCompany?.company_name ||
    session.active_company?.company_name ||
    session.companyName ||
    session.company_name ||
    session.company?.company_name ||
    window.currentCompanyName ||
    ""
  ).trim();
}


function normalizeResearchStaffRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "관리자") return "admin";
  if (normalized === "운영자") return "operator";
  if (normalized === "조회") return "viewer";
  if (normalized === "일반") return "user";
  if (["admin", "administrator", "manager"].includes(normalized)) return "admin";
  if (["operator", "editor", "write", "writer"].includes(normalized)) return "operator";
  if (["viewer", "read", "reader"].includes(normalized)) return "viewer";
  if (["user", "blocked"].includes(normalized)) return normalized;
  return "";
}

function getResearchStaffPortalRole() {
  const session = getParentPortalSession() || window.portalSession || window.currentPortalSession || {};
  const role =
    session.appRoles?.research_staff?.role ||
    session.app_roles?.research_staff?.role ||
    session.appRoles?.researchStaff?.role ||
    session.app_roles?.researchStaff?.role ||
    session.appRoles?.research_staffs?.role ||
    session.app_roles?.research_staffs?.role ||
    session.researchStaffRole ||
    session.research_staff_role ||
    "";

  const normalized = normalizeResearchStaffRole(role);

  // service_admin이 서비스 운영 모드에서 회사를 선택해 들어온 경우:
  // 포탈이 appRoles를 내려주지 못한 구형 세션이어도 선택 회사의 관리자 대리접속으로 처리합니다.
  if (
    !normalized &&
    (session.mode === "service" || session.portalMode === "service" || session.portal_mode === "service") &&
    session.isServiceAdmin === true &&
    (session.isImpersonating === true || session.activeCompanyId || session.active_company_id)
  ) {
    return "admin";
  }

  return normalized;
}

function hasExplicitResearchStaffPortalRole() {
  const session = getParentPortalSession() || window.portalSession || window.currentPortalSession || {};
  return !!(
    session.appRoles?.research_staff?.role ||
    session.app_roles?.research_staff?.role ||
    session.appRoles?.researchStaff?.role ||
    session.app_roles?.researchStaff?.role ||
    session.appRoles?.research_staffs?.role ||
    session.app_roles?.research_staffs?.role ||
    session.researchStaffRole ||
    session.research_staff_role ||
    (
      (session.mode === "service" || session.portalMode === "service" || session.portal_mode === "service") &&
      session.isServiceAdmin === true &&
      (session.isImpersonating === true || session.activeCompanyId || session.active_company_id)
    )
  );
}

function researchStaffRoleToRoleNames(role) {
  const normalized = normalizeResearchStaffRole(role);
  if (normalized === "admin") return ["research_staff_admin"];
  if (normalized === "operator") return ["research_staff_operator"];
  if (normalized === "viewer" || normalized === "user") return ["research_staff_viewer"];
  return [];
}


function publishResearchStaffSession() {
  const parent = getParentPortalSession() || {};
  const companyId = getResearchStaffCompanyId();
  const companyName = getResearchStaffCompanyName();
  const merged = {
    ...parent,
    supabase: supabaseClient || rawSupabaseClient || parent.supabase || null,
    companyId,
    company_id: companyId,
    activeCompanyId: companyId,
    active_company_id: companyId,
    companyName,
    company_name: companyName,
    activeCompanyName: companyName,
    active_company_name: companyName
  };

  window.portalSession = merged;
  window.currentPortalSession = merged;
  window.currentCompanyId = companyId;
  window.currentCompanyName = companyName;
  return merged;
}

function addCompanyIdToPayload(payload, companyId) {
  if (!companyId) return payload;

  if (Array.isArray(payload)) {
    return payload.map(row =>
      row && typeof row === "object"
        ? { ...row, company_id: row.company_id || companyId }
        : row
    );
  }

  if (payload && typeof payload === "object") {
    return { ...payload, company_id: payload.company_id || companyId };
  }

  return payload;
}

function createScopedBuilder(initialBuilder, tableName, alreadyScoped = false) {
  const state = { builder: initialBuilder, scoped: !!alreadyScoped };
  const shouldScope = () => RESEARCH_STAFF_TENANT_TABLES.has(String(tableName || ""));

  const ensureScope = () => {
    const companyId = getResearchStaffCompanyId();
    if (!shouldScope() || !companyId || state.scoped) return;

    try {
      if (state.builder && typeof state.builder.eq === "function") {
        state.builder = state.builder.eq("company_id", companyId);
        state.scoped = true;
      }
    } catch (error) {
      console.warn("[research-staff] company scope failed:", tableName, error);
    }
  };

  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        ensureScope();
        return state.builder.then.bind(state.builder);
      }
      if (prop === "catch") {
        ensureScope();
        return state.builder.catch.bind(state.builder);
      }
      if (prop === "finally") {
        ensureScope();
        return state.builder.finally.bind(state.builder);
      }

      const value = state.builder[prop];
      if (typeof value !== "function") return value;

      return function (...args) {
        const companyId = getResearchStaffCompanyId();

        if ((prop === "insert" || prop === "upsert") && shouldScope()) {
          args[0] = addCompanyIdToPayload(args[0], companyId);
        }

        if ((prop === "single" || prop === "maybeSingle" || prop === "csv" || prop === "geojson" || prop === "explain") && shouldScope()) {
          ensureScope();
        }

        const next = value.apply(state.builder, args);
        if (next && typeof next === "object") {
          return createScopedBuilder(next, tableName, state.scoped);
        }
        return next;
      };
    }
  });
}

function createTenantScopedClient(baseClient) {
  return new Proxy(baseClient, {
    get(target, prop) {
      if (prop === "from") {
        return function (tableName) {
          const builder = target.from(tableName);
          return createScopedBuilder(builder, tableName, false);
        };
      }

      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function initSupabase() {
  if (!window.supabase && !(window.parent && window.parent.portalSupabase)) {
    console.error("Supabase CDN을 불러오지 못했습니다.");
    return null;
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL === "YOUR_SUPABASE_URL" ||
    SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
  ) {
    console.warn("Supabase URL/KEY가 아직 설정되지 않았습니다.");
    return null;
  }

  try {
    const parentSession = getParentPortalSession();
    if (parentSession?.supabase) {
      rawSupabaseClient = parentSession.supabase;
    }
  } catch (_) {}

  try {
    if (!rawSupabaseClient && window.parent && window.parent !== window && window.parent.portalSupabase) {
      rawSupabaseClient = window.parent.portalSupabase;
    }
  } catch (_) {}

  if (!rawSupabaseClient && window.portalSupabase) {
    rawSupabaseClient = window.portalSupabase;
  }

  if (!rawSupabaseClient && window.supabase && typeof window.supabase.createClient === "function") {
    rawSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  if (!rawSupabaseClient) return null;

  window.portalSupabase = rawSupabaseClient;
  supabaseClient = createTenantScopedClient(rawSupabaseClient);
  publishResearchStaffSession();
  return supabaseClient;
}

function getSupabase() {
  return supabaseClient || initSupabase();
}

function getRawSupabase() {
  if (!rawSupabaseClient) initSupabase();
  return rawSupabaseClient;
}

async function getResearchStaffRoles(email) {
  const client = getSupabase();
  const roles = [];
  const targetEmail = String(email || "").trim();
  const targetEmailLower = targetEmail.toLowerCase();

  const pushRole = (role) => {
    if (role && !roles.includes(role)) roles.push(role);
  };

  // 포탈 표준 세션에 인력 앱 권한이 명시되어 있으면 DB 재조회보다 이 값을 우선합니다.
  // 이렇게 해야 service_admin 대리접속과 workspace 일반권한이 섞이지 않습니다.
  const portalRole = getResearchStaffPortalRole();
  if (hasExplicitResearchStaffPortalRole() && portalRole) {
    researchStaffRoleToRoleNames(portalRole).forEach(pushRole);
    return roles;
  }

  if (!client || !targetEmail) return roles;

  let employeeNo = "";

  try {
    const { data: commonUser, error } = await client
      .from(USERS_TABLE)
      .select("email,role")
      .ilike("email", targetEmail)
      .maybeSingle();

    if (error) console.warn("공통 관리자 권한 조회 실패:", error);
    if (String(commonUser?.role || "").trim().toLowerCase() === "admin") {
      pushRole("research_staff_admin");
    }
  } catch (error) {
    console.warn("공통 관리자 권한 조회 건너뜀:", error);
  }

  try {
    const { data: employee, error } = await client
      .from(EMPLOYEES_TABLE)
      .select("employee_no,email")
      .ilike("email", targetEmail)
      .maybeSingle();

    if (error) console.warn("사원정보 권한 키 조회 실패:", error);
    employeeNo = String(employee?.employee_no || "").trim();
  } catch (error) {
    console.warn("사원정보 권한 키 조회 건너뜀:", error);
  }

  try {
    const { data, error } = await client
      .from(USER_APP_ROLES_TABLE)
      .select("employee_no,email,app_key,role_key")
      .in("app_key", RESEARCH_STAFF_APP_KEYS);

    if (error) {
      console.warn("인력운영현황 중앙 권한 조회 실패:", error);
    } else {
      (Array.isArray(data) ? data : [])
        .filter(row => {
          const rowEmail = String(row.email || "").trim().toLowerCase();
          const rowEmployeeNo = String(row.employee_no || "").trim();
          return (
            (targetEmailLower && rowEmail === targetEmailLower) ||
            (employeeNo && rowEmployeeNo === employeeNo)
          );
        })
        .forEach(row => {
          const roleKey = String(row.role_key || "").trim().toLowerCase();

          if (["admin", "administrator", "manager"].includes(roleKey)) {
            pushRole("research_staff_admin");
          } else if (["operator", "editor", "write", "writer"].includes(roleKey)) {
            pushRole("research_staff_operator");
          } else if (["viewer", "read", "reader"].includes(roleKey)) {
            pushRole("research_staff_viewer");
          }
        });
    }
  } catch (error) {
    console.warn("인력운영현황 중앙 권한 조회 건너뜀:", error);
  }

  return roles;
}

window.getResearchStaffCompanyId = getResearchStaffCompanyId;
window.getResearchStaffCompanyName = getResearchStaffCompanyName;
window.getResearchStaffPortalRole = getResearchStaffPortalRole;
window.hasExplicitResearchStaffPortalRole = hasExplicitResearchStaffPortalRole;
window.researchStaffRoleToRoleNames = researchStaffRoleToRoleNames;
window.publishResearchStaffSession = publishResearchStaffSession;
window.getRawSupabase = getRawSupabase;
const AppState = {
  employees: [],
  profiles: [],
  divisions: [],
  teams: [],
  specialNotes: [],
  merged: [],
  currentView: "dashboard",
  referenceMonth: "",
  leaveMode: "exclude",
  filterDivision: "",
  filterTeam: "",
  currentEmployee: null,
  orgAccess: { scope: "all", division: "", team: "", reason: "" },
  currentUser: null,
  currentRoles: [],
  currentRole: "",
  isAdmin: false,
  isOperator: false
};

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindCommonEvents();
  await initializeAuthState();
  await loadAllData();
});

function bindNavigation() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      setView(view);
    });
  });
}



async function initializeAuthState() {
  if (typeof publishResearchStaffSession === "function") {
    publishResearchStaffSession();
  }
  AppState.currentUser = await resolvePortalUser();
  if (typeof publishResearchStaffSession === "function") {
    publishResearchStaffSession();
  }
  await loadMyResearchStaffRoles();
}

async function loadMyResearchStaffRoles() {
  const email = String(AppState.currentUser?.email || "").trim();

  AppState.currentRoles = [];
  AppState.currentRole = "viewer";
  AppState.isAdmin = false;
  AppState.isOperator = false;

  try {
    const roles = typeof getResearchStaffRoles === "function"
      ? await getResearchStaffRoles(email)
      : [];

    AppState.currentRoles = Array.isArray(roles) ? roles : [];
    AppState.isAdmin = AppState.currentRoles.includes("research_staff_admin");
    AppState.isOperator = AppState.currentRoles.includes("research_staff_operator");
    AppState.currentRole = AppState.isAdmin
      ? "admin"
      : (AppState.isOperator ? "operator" : "viewer");

    // 포탈 세션 권한을 앱 상태에 함께 기록해 디버깅과 후속 브릿지 작업이 쉽도록 합니다.
    try {
      const portalRole = typeof getResearchStaffPortalRole === "function" ? getResearchStaffPortalRole() : "";
      AppState.portalRole = portalRole || AppState.currentRole;
    } catch (_) {}
  } catch (error) {
    console.warn("인력운영현황 권한 조회 실패:", error);
    AppState.currentRoles = [];
    AppState.currentRole = "viewer";
    AppState.isAdmin = false;
    AppState.isOperator = false;
  }

  if (!email && !AppState.currentRoles.length) {
    console.warn("포탈 로그인 이메일을 확인하지 못해 운영인력 리스트는 조회 전용으로 동작합니다.");
  }
}

function canEditOperatingStaffList() {
  return Boolean(AppState.isAdmin);
}

async function resolvePortalUser() {
  const parentUser = readPortalUserFromParentSession();
  if (parentUser?.email) return parentUser;

  const queryUser = readPortalUserFromQuery();
  if (queryUser?.email) return queryUser;

  const storageUser = readPortalUserFromStorage();
  if (storageUser?.email) return storageUser;

  const supabaseUser = await readSupabaseAuthUser();
  if (supabaseUser?.email) return supabaseUser;

  if (window.__PORTAL_USER__?.email) return window.__PORTAL_USER__;

  const messageUser = await waitForPortalUserMessage(450);
  if (messageUser?.email) return messageUser;

  return null;
}

function readPortalUserFromParentSession() {
  try {
    let session = null;

    if (window.parent && window.parent !== window && typeof window.parent.getPortalSession === "function") {
      session = window.parent.getPortalSession();
    } else if (window.parent && window.parent !== window && window.parent.portalSession) {
      session = window.parent.portalSession;
    } else {
      session = window.portalSession || window.currentPortalSession || null;
    }

    if (!session) return null;

    const email = String(
      session.user?.email ||
      session.profile?.email ||
      session.email ||
      ""
    ).trim();

    if (!email) return null;

    const companyId = String(
      session.activeCompanyId ||
      session.active_company_id ||
      session.companyId ||
      session.company_id ||
      session.company?.id ||
      session.profile?.company_id ||
      ""
    ).trim();

    window.portalSession = {
      ...(window.portalSession || {}),
      ...session,
      companyId,
      company_id: companyId,
      activeCompanyId: companyId,
      active_company_id: companyId
    };
    window.currentPortalSession = window.portalSession;
    window.currentCompanyId = companyId || window.currentCompanyId || "";

    const employee = session.employee || {};
    return {
      email,
      name: employee.name || session.profile?.name || session.user?.user_metadata?.name || session.user?.name || session.name || "",
      company_id: companyId,
      employee_no: employee.employee_no || employee.employeeNo || session.profile?.employee_no || "",
      department: employee.department || employee.division_name || session.profile?.department || "",
      team: employee.team || employee.team_name || session.profile?.team || ""
    };
  } catch (error) {
    console.warn("부모 포탈 세션 확인 실패:", error);
    return null;
  }
}

function readPortalUserFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("portalEmail") || params.get("portal_email") || params.get("userEmail") || params.get("email") || "";
    const name = params.get("portalName") || params.get("name") || "";
    const companyId = params.get("company_id") || params.get("companyId") || "";

    if (companyId) {
      window.portalSession = {
        ...(window.portalSession || {}),
        companyId,
        company_id: companyId,
        activeCompanyId: companyId,
        active_company_id: companyId
      };
      window.currentCompanyId = companyId;
    }

    if (email) return { email, name, company_id: companyId };
  } catch (error) {
    console.warn("포탈 사용자 URL 확인 실패:", error);
  }
  return null;
}

function readPortalUserFromStorage() {
  const keys = [
    "portal_auth_user",
    "portalUser",
    "labPortalUser",
    "attendance_portal_user",
    "reagent_current_user",
    "currentUser",
    "loggedInUser",
    "authUser"
  ];

  for (const key of keys) {
    try {
      const raw = window.sessionStorage?.getItem(key) || window.localStorage?.getItem(key);
      if (!raw) continue;

      const parsed = parseMaybeJson(raw);
      const email = extractEmailFromUser(parsed);
      if (email) {
        return {
          email,
          name: parsed?.name || parsed?.user?.name || parsed?.employee?.name || ""
        };
      }
    } catch (error) {
      console.warn("포탈 사용자 저장 정보 확인 실패:", error);
    }
  }

  return null;
}

function extractEmailFromUser(value) {
  if (!value) return "";
  if (typeof value === "string") {
    return value.includes("@") ? value.trim() : "";
  }

  return String(
    value.email ||
    value.user_email ||
    value.portalEmail ||
    value.user?.email ||
    value.profile?.email ||
    value.employee?.email ||
    ""
  ).trim();
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

async function readSupabaseAuthUser() {
  try {
    const client = getSupabase();
    if (!client?.auth?.getUser) return null;

    const { data } = await client.auth.getUser();
    const user = data?.user;
    if (user?.email) return { email: user.email, name: user.user_metadata?.name || "" };
  } catch (error) {
    console.warn("Supabase 로그인 사용자 확인 실패:", error);
  }

  return null;
}

function waitForPortalUserMessage(timeout = 450) {
  return new Promise((resolve) => {
    let done = false;

    const finish = (user) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(user || null);
    };

    const onMessage = (event) => {
      const data = event.data || {};
      if (data?.type !== "portal-auth" && data?.type !== "PORTAL_AUTH_USER" && data?.type !== "portal-session-ready" && data?.type !== "portal-session-changed") return;

      const session = data.session || data.detail || null;
      const payload = data.user || data.payload || session?.user || session?.profile || data;
      const company = data.company || session?.company || payload?.company || {};
      const email = String(payload?.email || session?.user?.email || session?.profile?.email || "").trim();
      const companyId = String(
        payload?.company_id ||
        payload?.companyId ||
        company?.id ||
        company?.company_id ||
        session?.activeCompanyId ||
        session?.active_company_id ||
        session?.companyId ||
        session?.company_id ||
        session?.profile?.company_id ||
        ""
      ).trim();

      if (companyId) {
        window.portalSession = {
          ...(window.portalSession || {}),
          ...(session || {}),
          companyId,
          company_id: companyId,
          activeCompanyId: companyId,
          active_company_id: companyId
        };
        window.currentPortalSession = window.portalSession;
        window.currentCompanyId = companyId;
      }

      if (email) finish({ email, name: payload?.name || session?.profile?.name || "", company_id: companyId });
    };

    const timer = setTimeout(() => finish(null), timeout);
    window.addEventListener("message", onMessage);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "portal-auth-request", app: "research-staff" }, "*");
        window.parent.postMessage({ type: "portal-session-request", app: "research-staff" }, "*");
      }
    } catch (_) {}
  });
}

function bindCommonEvents() {
  const referenceMonthInput = document.getElementById("referenceMonth");
  if (referenceMonthInput) {
    referenceMonthInput.value = getCurrentMonthValue();
    AppState.referenceMonth = referenceMonthInput.value;

    referenceMonthInput.addEventListener("change", () => {
      AppState.referenceMonth = referenceMonthInput.value || getCurrentMonthValue();
      renderAll();
    });
  }

  document.querySelectorAll(".leave-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.leaveMode || "exclude";
      AppState.leaveMode = mode;

      document.querySelectorAll(".leave-toggle-btn").forEach(item => {
        item.classList.toggle("active", item.dataset.leaveMode === mode);
      });

      renderAll();
    });
  });

  bindOrgFilterEvents();
}


function bindOrgFilterEvents() {
  const divisionSelect = document.getElementById("filterDivision");
  const teamSelect = document.getElementById("filterTeam");

  divisionSelect?.addEventListener("change", () => {
    AppState.filterDivision = divisionSelect.value || "";
    AppState.filterTeam = "";
    populateTeamFilterOptions();
    renderAll();
  });

  teamSelect?.addEventListener("change", () => {
    AppState.filterTeam = teamSelect.value || "";
    renderAll();
  });
}

function populateOrgFilters() {
  applyOrgAccessDefaults();
  populateDivisionFilterOptions();
  populateTeamFilterOptions();
  updateOrgFilterControls();
  updateOrgFilterHint();
}

function populateDivisionFilterOptions() {
  const select = document.getElementById("filterDivision");
  if (!select) return;

  const access = getOrgAccess();
  const current = AppState.filterDivision || "";
  const divisions = buildDivisionOptions().filter(item => {
    if (access.scope === "all") return true;
    return sameOrgValue(item.value, access.division);
  });

  select.innerHTML = [
    ...(access.scope === "all" ? [`<option value="">전체 본부</option>`] : []),
    ...divisions.map(item => `<option value="${escapeAttr(item.value)}">${escapeHtmlText(item.label)}</option>`)
  ].join("");

  if (access.scope !== "all" && access.division) {
    select.value = access.division;
  } else {
    select.value = divisions.some(item => item.value === current) ? current : "";
  }

  AppState.filterDivision = select.value;
}

function populateTeamFilterOptions() {
  const select = document.getElementById("filterTeam");
  if (!select) return;

  const access = getOrgAccess();
  const current = AppState.filterTeam || "";
  const teams = buildTeamOptions(AppState.filterDivision).filter(item => {
    if (access.scope !== "team") return true;
    return sameOrgValue(item.value, access.team);
  });

  select.innerHTML = [
    ...(access.scope !== "team" ? [`<option value="">전체 팀</option>`] : []),
    ...teams.map(item => `<option value="${escapeAttr(item.value)}">${escapeHtmlText(item.label)}</option>`)
  ].join("");

  if (access.scope === "team" && access.team) {
    select.value = access.team;
  } else {
    select.value = teams.some(item => item.value === current) ? current : "";
  }

  if (access.scope === "division" && select.value && isVirtualTeamName(select.selectedOptions?.[0]?.textContent || "")) {
    select.value = "";
  }

  AppState.filterTeam = select.value;
  updateOrgFilterControls();
  updateOrgFilterHint();
}

function buildDivisionOptions() {
  const map = new Map();

  (AppState.merged || []).forEach(row => {
    const value = String(row.division_code || row.department || "").trim();
    const label = String(row.department || row.division_name || row.division || row.division_code || "미지정 본부").trim() || "미지정 본부";
    if (!value) return;
    if (!map.has(value)) {
      map.set(value, { value, label, sort: String(row.division_code || label) });
    }
  });

  return [...map.values()].sort((a, b) => String(a.sort).localeCompare(String(b.sort), "ko", { numeric: true, sensitivity: "base" }));
}

function buildTeamOptions(divisionValue = "") {
  const map = new Map();
  const teams = Array.isArray(AppState.teams) ? AppState.teams : [];

  if (teams.length) {
    teams
      .filter(team => !isVirtualTeamOption(team))
      .filter(team => teamBelongsToDivision(team, divisionValue))
      .forEach(team => {
        const value = getTeamOptionValue(team);
        const label = getTeamOptionLabel(team);
        if (!value || !label) return;
        if (!map.has(value)) {
          map.set(value, {
            value,
            label,
            sort: getTeamSortKey(team, label)
          });
        }
      });
  }

  (AppState.merged || [])
    .filter(row => rowBelongsToDivision(row, divisionValue))
    .forEach(row => {
      const value = String(row.team_code || row.team || "").trim();
      const label = String(row.team || row.team_name || row.team_code || "미지정 팀").trim() || "미지정 팀";
      if (!value || isVirtualTeamName(label)) return;
      if (!map.has(value)) {
        map.set(value, { value, label, sort: String(row.team_code || label) });
      }
    });

  return [...map.values()].sort((a, b) => String(a.sort).localeCompare(String(b.sort), "ko", { numeric: true, sensitivity: "base" }));
}

function getTeamOptionValue(team) {
  return String(
    team.team_code ||
    team.code ||
    team.id ||
    team.team_id ||
    team.value ||
    team.team_name ||
    team.name ||
    ""
  ).trim();
}

function getTeamOptionLabel(team) {
  return String(
    team.team_name ||
    team.name ||
    team.label ||
    team.team_code ||
    team.code ||
    ""
  ).trim();
}

function getTeamDivisionValue(team) {
  return String(
    team.division_code ||
    team.department_code ||
    team.parent_division_code ||
    team.parent_code ||
    team.division_id ||
    team.department_id ||
    ""
  ).trim();
}

function getTeamSortKey(team, fallback = "") {
  return String(
    team.sort_order ||
    team.display_order ||
    team.order_no ||
    team.team_code ||
    team.code ||
    fallback ||
    ""
  ).trim();
}

function getDivisionLabelByValue(value) {
  const target = String(value || "").trim();
  if (!target) return "";

  const division = (AppState.divisions || []).find(item => String(
    item.division_code ||
    item.code ||
    item.id ||
    item.value ||
    item.division_name ||
    item.name ||
    ""
  ).trim() === target);

  if (division) {
    return String(division.division_name || division.name || division.label || division.division_code || division.code || "").trim();
  }

  const row = (AppState.merged || []).find(item => String(item.division_code || item.department || "").trim() === target);
  return String(row?.department || row?.division_name || row?.division || "").trim();
}

function getDivisionNameSet() {
  const names = new Set();

  (AppState.divisions || []).forEach(division => {
    const name = String(division.division_name || division.name || division.label || division.department || "").trim();
    if (name) names.add(name);
  });

  (AppState.merged || []).forEach(row => {
    const name = String(row.department || row.division_name || row.division || "").trim();
    if (name) names.add(name);
  });

  return names;
}

function isVirtualTeamOption(team) {
  const truthyKeys = ["is_virtual", "isVirtual", "virtual", "virtual_team", "is_virtual_team", "isVirtualTeam"];
  if (truthyKeys.some(key => isTruthyValue(team?.[key]))) return true;

  const textKeys = ["team_type", "type", "category", "note", "memo", "description", "remarks"];
  if (textKeys.some(key => String(team?.[key] || "").includes("가상"))) return true;

  return isVirtualTeamName(getTeamOptionLabel(team));
}

function isVirtualTeamName(teamName) {
  const name = String(teamName || "").trim();
  if (!name) return false;
  if (name.includes("가상")) return true;
  return getDivisionNameSet().has(name);
}

function isTruthyValue(value) {
  if (value === true) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "y", "yes", "사용", "가상", "virtual"].includes(text);
}

function resolveCurrentEmployeeRow() {
  const email = String(AppState.currentUser?.email || "").trim().toLowerCase();
  if (!email) return null;

  return (AppState.merged || []).find(row => {
    const candidates = [
      row.email,
      row.work_email,
      row.company_email,
      row.user_email,
      row.portal_email
    ].map(value => String(value || "").trim().toLowerCase());

    return candidates.includes(email);
  }) || null;
}

function applyOrgAccessDefaults() {
  AppState.currentEmployee = AppState.currentEmployee || resolveCurrentEmployeeRow();
  AppState.orgAccess = buildOrgAccess();

  const access = getOrgAccess();
  if (access.scope === "division" || access.scope === "team") {
    AppState.filterDivision = access.division || "";
  }

  if (access.scope === "division") {
    AppState.filterTeam = "";
  }

  if (access.scope === "team") {
    AppState.filterTeam = access.team || "";
  }
}

function buildOrgAccess() {
  if (AppState.isAdmin || AppState.currentRole === "admin" || AppState.currentRole === "operator") {
    return { scope: "all", division: "", team: "", reason: "관리자/운영자" };
  }

  const employee = resolveCurrentEmployeeRow();

  if (!employee) {
    return { scope: "team", division: "", team: "", reason: "로그인 사용자 조직정보 없음" };
  }

  const division = getEmployeeDivisionScopeValue(employee);
  const team = getRowTeamValue(employee);

  if (isCompanyLevelUser(employee)) {
    return { scope: "all", division: "", team: "", reason: "대표이사/사장" };
  }

  if (isDivisionLevelUser(employee) || isVirtualTeamRow(employee)) {
    return { scope: "division", division, team: "", reason: "소장/본부장" };
  }

  return { scope: "team", division, team, reason: "팀 단위 조회" };
}

function getOrgAccess() {
  return AppState.orgAccess || { scope: "all", division: "", team: "", reason: "" };
}

function getEmployeeAuthorityText(row) {
  if (!row) return "";

  return [
    row.authority,
    row.duty,
    row.role,
    row.job_role,
    row.job_title,
    row.position,
    row.grade,
    row.title,
    row.rank,
    row.employee_role
  ].map(value => String(value || "").trim()).join(" ");
}

function isCompanyLevelUser(row) {
  const text = getEmployeeAuthorityText(row);
  return /대표이사|사장/.test(text);
}

function isDivisionLevelUser(row) {
  const text = getEmployeeAuthorityText(row);
  return /소장|본부장|부문장|센터장/.test(text);
}

function getEmployeeDivisionScopeValue(row) {
  if (!row) return "";

  const directDivision = getRowDivisionValue(row);
  const teamValue = getRowTeamValue(row);
  const matchedTeam = findTeamByValue(teamValue);

  if (matchedTeam && isVirtualTeamOption(matchedTeam)) {
    return (
      getTeamDivisionValue(matchedTeam) ||
      matchedTeam.division_code ||
      matchedTeam.parent_division_code ||
      matchedTeam.parent_code ||
      directDivision ||
      getTeamOptionValue(matchedTeam) ||
      getTeamOptionLabel(matchedTeam) ||
      ""
    );
  }

  return directDivision;
}

function isVirtualTeamRow(row) {
  if (!row) return false;

  const teamValue = getRowTeamValue(row);
  const matchedTeam = findTeamByValue(teamValue);
  if (matchedTeam && isVirtualTeamOption(matchedTeam)) return true;

  const teamName = String(row.team || row.team_name || "").trim();
  if (teamName && isVirtualTeamName(teamName)) return true;

  const divisionName = String(row.department || row.division_name || row.division || "").trim();
  return Boolean(teamName && divisionName && normalizeOrgValue(teamName) === normalizeOrgValue(divisionName));
}

function updateOrgFilterControls() {
  const access = getOrgAccess();
  const divisionSelect = document.getElementById("filterDivision");
  const teamSelect = document.getElementById("filterTeam");

  if (divisionSelect) {
    divisionSelect.disabled = access.scope === "division" || access.scope === "team";
    divisionSelect.title = divisionSelect.disabled ? `${access.reason} 권한으로 본부가 고정됩니다.` : "본부 선택";
  }

  if (teamSelect) {
    teamSelect.disabled = access.scope === "team";
    teamSelect.title = teamSelect.disabled ? `${access.reason} 권한으로 팀이 고정됩니다.` : "팀 선택";
  }
}

function getOrgScopedRows(rows) {
  const access = getOrgAccess();
  const source = Array.isArray(rows) ? rows : [];

  return source.filter(row => {
    const rowTeam = getRowTeamValue(row);

    if (access.scope === "division" && access.division && !rowBelongsToDivision(row, access.division)) return false;
    if (access.scope === "team") {
      if (access.division && !rowBelongsToDivision(row, access.division)) return false;
      if (access.team && !sameOrgValue(rowTeam, access.team)) return false;
      if (!access.team) return false;
    }

    if (AppState.filterDivision && !rowBelongsToDivision(row, AppState.filterDivision)) return false;
    if (AppState.filterTeam && !sameOrgValue(rowTeam, AppState.filterTeam)) return false;

    return true;
  });
}

function getRowDivisionValue(row) {
  if (!row) return "";
  return String(row.division_code || row.department_code || row.dept_code || row.department || row.division_name || row.division || "").trim();
}

function getRowTeamValue(row) {
  if (!row) return "";
  return String(row.team_code || row.team_id || row.team || row.team_name || "").trim();
}

function sameOrgValue(a, b) {
  const av = normalizeOrgValue(a);
  const bv = normalizeOrgValue(b);
  return Boolean(av && bv && av === bv);
}

function normalizeOrgValue(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function teamBelongsToDivision(team, divisionValue = "") {
  if (!divisionValue) return true;

  const related = getDivisionRelatedValueSet(divisionValue);
  const teamValue = getTeamOptionValue(team);
  const teamLabel = getTeamOptionLabel(team);
  const teamDivision = getTeamDivisionValue(team);
  const parentValues = [
    team.parent_code,
    team.parent_team_code,
    team.parent_id,
    team.parent_name,
    team.division_name,
    team.department,
    team.division
  ];

  if (valueInOrgSet(teamDivision, related)) return true;
  if (parentValues.some(value => valueInOrgSet(value, related))) return true;
  if (valueInOrgSet(teamLabel, related) && isVirtualTeamOption(team)) return true;

  const virtualCodes = getVirtualTeamCodesForDivision(divisionValue);
  return virtualCodes.some(code => {
    const normalizedCode = normalizeOrgValue(code);
    const normalizedTeam = normalizeOrgValue(teamValue);
    return Boolean(normalizedCode && normalizedTeam && normalizedTeam.startsWith(`${normalizedCode}-`));
  });
}

function rowBelongsToDivision(row, divisionValue = "") {
  if (!divisionValue) return true;
  if (!row) return false;

  const related = getDivisionRelatedValueSet(divisionValue);
  const rowDivisionValues = [
    row.division_code,
    row.department_code,
    row.dept_code,
    row.department,
    row.division_name,
    row.division
  ];

  if (rowDivisionValues.some(value => valueInOrgSet(value, related))) return true;

  const rowTeam = getRowTeamValue(row);
  const matchedTeam = findTeamByValue(rowTeam);
  if (matchedTeam && teamBelongsToDivision(matchedTeam, divisionValue)) return true;

  const virtualCodes = getVirtualTeamCodesForDivision(divisionValue);
  return virtualCodes.some(code => {
    const normalizedCode = normalizeOrgValue(code);
    const normalizedTeam = normalizeOrgValue(rowTeam);
    return Boolean(normalizedCode && normalizedTeam && (normalizedTeam === normalizedCode || normalizedTeam.startsWith(`${normalizedCode}-`)));
  });
}

function getDivisionRelatedValueSet(divisionValue = "") {
  const set = new Set();
  const add = value => {
    const normalized = normalizeOrgValue(value);
    if (normalized) set.add(normalized);
  };

  add(divisionValue);
  const divisionLabel = getDivisionLabelByValue(divisionValue);
  add(divisionLabel);

  (AppState.divisions || []).forEach(division => {
    const values = [
      division.division_code,
      division.code,
      division.id,
      division.value,
      division.division_name,
      division.name,
      division.label,
      division.department
    ];
    if (values.some(value => sameOrgValue(value, divisionValue) || sameOrgValue(value, divisionLabel))) {
      values.forEach(add);
    }
  });

  (AppState.teams || []).forEach(team => {
    if (!isVirtualTeamOption(team)) return;
    const teamValues = [
      getTeamOptionValue(team),
      getTeamOptionLabel(team),
      getTeamDivisionValue(team),
      team.parent_code,
      team.parent_team_code,
      team.parent_name,
      team.division_name,
      team.department,
      team.division
    ];
    if (teamValues.some(value => valueInOrgSet(value, set))) {
      teamValues.forEach(add);
    }
  });

  return set;
}

function valueInOrgSet(value, set) {
  const normalized = normalizeOrgValue(value);
  return Boolean(normalized && set?.has(normalized));
}

function getVirtualTeamCodesForDivision(divisionValue = "") {
  const related = getDivisionRelatedValueSet(divisionValue);
  return (AppState.teams || [])
    .filter(team => isVirtualTeamOption(team))
    .filter(team => {
      const values = [
        getTeamOptionValue(team),
        getTeamOptionLabel(team),
        getTeamDivisionValue(team),
        team.parent_code,
        team.parent_team_code,
        team.parent_name,
        team.division_name,
        team.department,
        team.division
      ];
      return values.some(value => valueInOrgSet(value, related));
    })
    .map(team => getTeamOptionValue(team))
    .filter(Boolean);
}

function findTeamByValue(value) {
  const target = normalizeOrgValue(value);
  if (!target) return null;

  return (AppState.teams || []).find(team => {
    const values = [
      getTeamOptionValue(team),
      getTeamOptionLabel(team),
      team.team_id,
      team.id,
      team.code,
      team.team_code,
      team.team_name,
      team.name
    ];
    return values.some(item => normalizeOrgValue(item) === target);
  }) || null;
}

function updateOrgFilterHint() {
  const hint = document.getElementById("orgFilterHint");
  if (!hint) return;
  hint.textContent = "";
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtmlText(value);
}

function setView(view) {
  AppState.currentView = view;

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  document.querySelectorAll(".view").forEach(section => {
    section.classList.toggle("active", section.id === `view-${view}`);
  });
}

async function loadAllData() {
  setConnectionStatus("서버 연결 확인 중", "muted");

  const client = getSupabase();

  if (!client) {
    setConnectionStatus("연결값 필요", "warning");
    useSampleData();
    renderAll();
    return;
  }

  try {
    const [employeesResult, profilesResult, divisionsResult, teamsResult, specialNotesResult] = await Promise.all([
      client.from("employees").select("*").order("name", { ascending: true }),
      client.from("research_staff_profiles").select("*"),
      client.from("divisions").select("*"),
      client.from("teams").select("*"),
      client.from("employee_special_notes").select("*")
    ]);

    if (employeesResult.error) throw employeesResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (divisionsResult.error) throw divisionsResult.error;
    if (teamsResult.error) throw teamsResult.error;

    if (specialNotesResult.error) {
      console.warn("특이사항 조회 실패:", specialNotesResult.error);
    }

    AppState.employees = employeesResult.data || [];
    AppState.profiles = profilesResult.data || [];
    AppState.divisions = divisionsResult.data || [];
    AppState.teams = teamsResult.data || [];
    AppState.specialNotes = specialNotesResult.error ? [] : (specialNotesResult.data || []);
    AppState.merged = sortStaffRows(
      mergeEmployeeProfiles(
        AppState.employees,
        AppState.profiles,
        AppState.divisions,
        AppState.teams
      )
    );
    AppState.currentEmployee = resolveCurrentEmployeeRow();

    populateOrgFilters();

    setConnectionStatus("서버 연결 완료", "success");
    renderAll();
  } catch (error) {
    console.error(error);
    setConnectionStatus("서버 조회 실패", "danger");
    useSampleData();
    renderAll();
  }
}

function mergeEmployeeProfiles(employees, profiles, divisions = [], teams = []) {
  const profileMap = new Map(profiles.map(profile => [String(profile.employee_no), profile]));
  const divisionMap = new Map(divisions.map(division => [
    String(division.division_code || ""),
    division.division_name || division.name || division.division_code || ""
  ]));
  const teamMap = new Map(teams.map(team => [
    String(team.team_code || ""),
    team.team_name || team.name || team.team_code || ""
  ]));

  return employees.map(employee => {
    const employeeNo = String(employee.employee_no || employee.employee_id || employee.id || "");
    const profile = profileMap.get(employeeNo) || {};
    const divisionCode = String(employee.division_code || "");
    const teamCode = String(employee.team_code || "");
    const hireDate = getEmployeeHireDate(employee);
    const effectiveLabAssignDate = profile.lab_assign_date || hireDate || "";

    return {
      ...employee,

      department:
        employee.department ||
        employee.division_name ||
        employee.division ||
        divisionMap.get(divisionCode) ||
        employee.division_code ||
        "",

      team:
        employee.team ||
        employee.team_name ||
        teamMap.get(teamCode) ||
        employee.team_code ||
        "",

      position:
        employee.position ||
        employee.grade ||
        employee.job_title ||
        "",

      division_code: employee.division_code || "",
      team_code: employee.team_code || "",
      sort_order: Number(employee.sort_order || 999999),
      hire_date: hireDate,
      resignation_date: getEmployeeResignationDate(employee),

      employee_no: employeeNo,
      profile_id: profile.id || null,
      is_research_staff: Boolean(profile.is_research_staff),
      research_type: profile.research_type || "",
      gender: profile.gender || "",
      birth_date: profile.birth_date || "",
      lab_assign_date: effectiveLabAssignDate,
      saved_lab_assign_date: profile.lab_assign_date || "",
      degree: profile.degree || "",
      remarks: profile.remarks || ""
    };
  });
}

function sortStaffRows(rows) {
  return [...rows].sort((a, b) => {
    const divisionCompare = String(a.division_code || a.department || "").localeCompare(String(b.division_code || b.department || ""), "ko");
    if (divisionCompare !== 0) return divisionCompare;

    const teamCompare = String(a.team_code || a.team || "").localeCompare(String(b.team_code || b.team || ""), "ko");
    if (teamCompare !== 0) return teamCompare;

    const aOrder = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 999999;
    const bOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 999999;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return String(a.employee_no || "").localeCompare(String(b.employee_no || ""), "ko");
  });
}

function renderAll() {
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderAnalysis === "function") renderAnalysis();
  if (typeof renderAdmin === "function") renderAdmin();
}

function setConnectionStatus(text, type = "muted") {
  const el = document.getElementById("connectionStatus");
  if (!el) return;
  el.textContent = text;
  el.className = `status-pill ${type}`;
}

function getResearchRows() {
  const rows = getReferenceFilteredRows(AppState.merged).filter(row => isResearchStaffRow(row));

  if (AppState.leaveMode === "include") {
    return rows;
  }

  return rows.filter(row => !isReferenceLeaveRow(row));
}

function getAdminRows() {
  const rows = getReferenceFilteredRows(AppState.merged);

  if (AppState.leaveMode === "include") {
    return rows;
  }

  return rows.filter(row => !isAdminLeaveRow(row));
}

function isResearchStaffRow(row) {
  return Boolean(
    row.profile_id ||
    row.research_type ||
    row.degree ||
    row.gender ||
    row.birth_date ||
    row.saved_lab_assign_date
  );
}

function getReferenceFilteredRows(rows) {
  const month = AppState.referenceMonth || getCurrentMonthValue();
  const { start, end } = getMonthRange(month);

  const referenceRows = rows.filter(row => {
    const labAssignDate = parseDateOnly(row.lab_assign_date || row.hire_date);
    const resignationDate = parseDateOnly(row.resignation_date);

    if (!labAssignDate || labAssignDate > end) return false;
    if (resignationDate && resignationDate < start) return false;

    if (!resignationDate && String(row.status || "").includes("퇴사")) {
      return false;
    }

    return true;
  });

  return getOrgScopedRows(referenceRows);
}

function isLeaveStatus(row) {
  const statusText = String(row.status || row.employment_status || "");
  const leaveTypeText = String(row.leave_type || "");
  return statusText.includes("휴직") || Boolean(leaveTypeText);
}

const ADMIN_LEAVE_SPECIAL_TYPES = [
  "파견",
  "병가",
  "육아휴직",
  "출산휴가",
  "일반휴직",
  "가족돌봄휴직"
];

function isReferenceLeaveRow(row) {
  return Boolean(getAdminReferenceSpecialStatus(row)) || isLeaveStatus(row);
}

function isAdminLeaveRow(row) {
  return isReferenceLeaveRow(row);
}

function getAdminDisplayStatus(row) {
  const specialStatus = getAdminReferenceSpecialStatus(row);
  if (specialStatus) return specialStatus;

  const leaveType = String(row.leave_type || "").trim();
  if (leaveType) return leaveType;

  return String(row.status || row.employment_status || "").trim();
}

function getAdminReferenceSpecialStatus(row) {
  const employeeNo = String(row.employee_no || row.employee_id || row.id || "").trim();
  if (!employeeNo) return "";

  const referenceDate = getReferenceDate();

  const matches = (AppState.specialNotes || [])
    .filter(note => String(note.employee_no || note.employee_id || "").trim() === employeeNo)
    .filter(note => ADMIN_LEAVE_SPECIAL_TYPES.includes(String(note.issue_type || note.special_type || note.type || "").trim()))
    .filter(note => isSpecialNoteActiveOnDate(note, referenceDate))
    .sort((a, b) => {
      const aDate = parseDateOnly(a.start_date) || new Date(0);
      const bDate = parseDateOnly(b.start_date) || new Date(0);
      return bDate - aDate;
    });

  if (!matches.length) return "";

  return String(matches[0].issue_type || matches[0].special_type || matches[0].type || "").trim();
}

function isSpecialNoteActiveOnDate(note, date) {
  const startDate = parseDateOnly(note.start_date || note.from_date || note.begin_date);
  const endDate = parseDateOnly(note.end_date || note.to_date || note.finish_date);

  if (!startDate) return false;
  if (startDate > date) return false;
  if (endDate && endDate < date) return false;

  return true;
}

function getReferenceDate() {
  const { end } = getMonthRange(AppState.referenceMonth || getCurrentMonthValue());
  return end;
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRange(monthValue) {
  const [year, month] = String(monthValue || getCurrentMonthValue()).split("-").map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0)
  };
}

function parseDateOnly(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEmployeeHireDate(employee) {
  return (
    employee.hire_date ||
    employee.join_date ||
    employee.joined_date ||
    employee.employment_date ||
    employee.enter_date ||
    employee.start_date ||
    ""
  );
}

function getEmployeeResignationDate(employee) {
  return (
    employee.resignation_date ||
    employee.retire_date ||
    employee.leave_date ||
    employee.end_date ||
    employee.termination_date ||
    ""
  );
}

function calculateAge(birthDate) {
  if (!birthDate) return null;
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return null;

  const referenceDate = getReferenceDate();
  let age = referenceDate.getFullYear() - date.getFullYear();
  const monthDiff = referenceDate.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < date.getDate())) {
    age -= 1;
  }

  return age;
}

function getAgeGroup(birthDate) {
  const age = calculateAge(birthDate);
  if (age === null) return "미입력";
  if (age < 30) return "20대";
  if (age < 40) return "30대";
  if (age < 50) return "40대";
  return "50대+";
}

function pct(part, total) {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function countBy(rows, key, value) {
  return rows.filter(row => (row[key] || "") === value).length;
}

function countGender(rows, gender) {
  return rows.filter(row => row.gender === gender).length;
}

function useSampleData() {
  AppState.employees = [
    { employee_no: "E001", name: "강태호", department: "중앙연구소", team: "제제연구팀", position: "선임연구원", status: "재직" },
    { employee_no: "E002", name: "권병수", department: "중앙연구소", team: "글로벌R&D팀", position: "책임연구원", status: "재직" },
    { employee_no: "E003", name: "김동규", department: "중앙연구소", team: "임상개발팀", position: "책임연구원", status: "재직" },
    { employee_no: "E004", name: "김선진", department: "중앙연구소", team: "바이오팀", position: "선임연구원", status: "재직" },
    { employee_no: "E005", name: "이하나", department: "중앙연구소", team: "분석팀", position: "연구원", status: "재직" },
    { employee_no: "E006", name: "박민수", department: "중앙연구소", team: "제제연구팀", position: "연구원", status: "재직" }
  ];

  AppState.specialNotes = [];

  AppState.profiles = [
    { employee_no: "E001", is_research_staff: true, research_type: "전담요원", gender: "남", birth_date: "1991-03-12", lab_assign_date: "2020-05-18", degree: "석사", remarks: "" },
    { employee_no: "E002", is_research_staff: true, research_type: "전담요원", gender: "남", birth_date: "1987-07-04", lab_assign_date: "2016-12-01", degree: "석사", remarks: "" },
    { employee_no: "E003", is_research_staff: true, research_type: "전담요원", gender: "남", birth_date: "1988-09-21", lab_assign_date: "2014-01-20", degree: "박사", remarks: "" },
    { employee_no: "E004", is_research_staff: true, research_type: "전담요원", gender: "여", birth_date: "1990-11-08", lab_assign_date: "2021-12-01", degree: "학사", remarks: "" },
    { employee_no: "E005", is_research_staff: true, research_type: "보조원", gender: "여", birth_date: "1997-02-14", lab_assign_date: "2023-03-01", degree: "학사", remarks: "" },
    { employee_no: "E006", is_research_staff: true, research_type: "관리직원", gender: "남", birth_date: "1981-05-30", lab_assign_date: "2019-06-01", degree: "기타", remarks: "" }
  ];

  AppState.merged = mergeEmployeeProfiles(AppState.employees, AppState.profiles);
  AppState.currentEmployee = resolveCurrentEmployeeRow();
  populateOrgFilters();
}
const RESEARCH_TYPES = ["전담요원", "보조원", "관리직원"];
const DEGREES = ["박사", "석사", "학사", "전문학사", "기타"];
const AGE_GROUPS = ["20대", "30대", "40대", "50대+"];

function renderDashboard() {
  const rows = getResearchRows();

  renderSummaryCards(rows);
  renderResearchTypeTable(rows);
  renderDashboardDegreeBars(rows);
  renderDegreeTable(rows);
  renderAgeTable(rows);
  renderDegreePyramid(rows);
  renderPyramid(rows);
}

function renderSummaryCards(rows) {
  const total = rows.length;
  const dedicated = countBy(rows, "research_type", "전담요원");
  const assistant = countBy(rows, "research_type", "보조원");
  const manager = countBy(rows, "research_type", "관리직원");
  const female = countGender(rows, "여");
  const masterPlus = rows.filter(row => row.degree === "석사" || row.degree === "박사").length;

  setText("cardTotal", total);
  setText("cardDedicated", dedicated);
  setText("cardAssistant", assistant);
  setText("cardManager", manager);
  setText("cardFemale", female);
  setText("cardMasterPlus", masterPlus);

  setText("cardDedicatedSub", pct(dedicated, total));
  setText("cardAssistantSub", pct(assistant, total));
  setText("cardManagerSub", pct(manager, total));
  setText("cardFemaleRate", pct(female, total));
  setText("cardMasterPlusRate", pct(masterPlus, total));

  const leaveLabel = AppState.leaveMode === "include" ? "휴직 포함 기준" : "휴직 제외 기준";
  setText("cardTotalSub", leaveLabel);

  renderKpiLeaveSummaries(rows);
}


function renderKpiLeaveSummaries(rows) {
  const leaveEnabled = AppState.leaveMode === "include";

  const targets = [
    { id: "cardTotal", label: "휴직", rows },
    { id: "cardDedicated", label: "휴직", rows: rows.filter(row => row.research_type === "전담요원") },
    { id: "cardAssistant", label: "휴직", rows: rows.filter(row => row.research_type === "보조원") },
    { id: "cardManager", label: "휴직", rows: rows.filter(row => row.research_type === "관리직원") },
    { id: "cardFemale", label: "여성 휴직", rows: rows.filter(row => row.gender === "여") },
    { id: "cardMasterPlus", label: "휴직", rows: rows.filter(row => row.degree === "석사" || row.degree === "박사") }
  ];

  targets.forEach(target => {
    const card = document.getElementById(target.id)?.closest(".summary-card");
    if (!card) return;

    let box = card.querySelector(".kpi-leave-summary");
    if (!box) {
      box = document.createElement("div");
      box.className = "kpi-leave-summary";
      card.appendChild(box);
    }

    if (!leaveEnabled) {
      box.innerHTML = "";
      box.classList.remove("show");
      return;
    }

    const counts = getLeaveReasonCounts(target.rows);
    const total = counts.reduce((sum, item) => sum + item.count, 0);

    if (!total) {
      box.innerHTML = "";
      box.classList.remove("show");
      return;
    }

    box.classList.add("show");
    box.innerHTML = `
      <div class="kpi-leave-total">${target.label} <strong>${total}명</strong></div>
      <div class="kpi-leave-items ${counts.length > 4 ? "two-columns" : "one-column"}">
        ${counts.map(item => `<span>${escapeDashboardHtml(formatLeaveReasonLabel(item.type))} <b>${item.count}</b></span>`).join("")}
      </div>
    `;
  });
}

function getLeaveReasonCounts(rows) {
  const order = getLeaveReasonOrder();
  const map = new Map(order.map(type => [type, 0]));

  rows.forEach(row => {
    const type = getDashboardLeaveType(row);
    if (!type || !map.has(type)) return;
    map.set(type, map.get(type) + 1);
  });

  return [...map.entries()]
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({ type, count }));
}

function getLeaveReasonOrder() {
  if (typeof ADMIN_LEAVE_SPECIAL_TYPES !== "undefined" && Array.isArray(ADMIN_LEAVE_SPECIAL_TYPES)) {
    return ADMIN_LEAVE_SPECIAL_TYPES;
  }

  return ["파견", "병가", "육아휴직", "출산휴가", "일반휴직", "가족돌봄휴직"];
}

function getDashboardLeaveType(row) {
  let specialStatus = "";

  if (typeof getAdminReferenceSpecialStatus === "function") {
    specialStatus = getAdminReferenceSpecialStatus(row);
  }

  const order = getLeaveReasonOrder();
  if (order.includes(specialStatus)) return specialStatus;

  const leaveType = String(row.leave_type || "").trim();
  if (order.includes(leaveType)) return leaveType;

  const statusText = String(row.status || row.employment_status || "").trim();
  if (order.includes(statusText)) return statusText;
  if (statusText.includes("휴직")) return "일반휴직";

  return "";
}

function formatLeaveReasonLabel(type) {
  return type === "가족돌봄휴직" ? "가족돌봄" : type;
}

function escapeDashboardHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResearchTypeTable(rows) {
  const tbody = document.getElementById("researchTypeTable");
  if (!tbody) return;

  const lines = RESEARCH_TYPES.map(type => {
    const typeRows = rows.filter(row => row.research_type === type);
    const male = countGender(typeRows, "남");
    const female = countGender(typeRows, "여");

    return `
      <tr>
        <td>${type}</td>
        <td>${typeRows.length}</td>
        <td>${male}</td>
        <td>${female}</td>
        <td>${pct(female, typeRows.length)}</td>
      </tr>
    `;
  });

  const totalMale = countGender(rows, "남");
  const totalFemale = countGender(rows, "여");

  lines.push(`
    <tr class="total-row">
      <td>합계</td>
      <td>${rows.length}</td>
      <td>${totalMale}</td>
      <td>${totalFemale}</td>
      <td>${pct(totalFemale, rows.length)}</td>
    </tr>
  `);

  tbody.innerHTML = lines.join("");
}

function renderDashboardDegreeBars(rows) {
  const container = document.getElementById("dashboardDegreeBars");
  if (!container) return;

  const entries = DEGREES.map(degree => [degree, rows.filter(row => row.degree === degree).length]);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  const total = rows.length;

  if (!total) {
    container.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = entries.map(([name, count]) => `
    <div class="bar-row dashboard-degree-bar-row">
      <span>${name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <strong>${count}명 <em>${pct(count, total)}</em></strong>
    </div>
  `).join("");
}

function renderDegreeTable(rows) {
  const tbody = document.getElementById("degreeTable");
  if (!tbody) return;

  const lines = RESEARCH_TYPES.map(type => {
    const typeRows = rows.filter(row => row.research_type === type);
    const cells = DEGREES.map(degree => genderPair(typeRows.filter(row => row.degree === degree))).join("");

    return `
      <tr>
        <td>${type}</td>
        ${cells}
        <td>${typeRows.length}</td>
      </tr>
    `;
  });

  const totalCells = DEGREES.map(degree => genderPair(rows.filter(row => row.degree === degree))).join("");

  lines.push(`
    <tr class="total-row">
      <td>합계</td>
      ${totalCells}
      <td>${rows.length}</td>
    </tr>
  `);

  tbody.innerHTML = lines.join("");
}

function renderAgeTable(rows) {
  const tbody = document.getElementById("ageTable");
  if (!tbody) return;

  const lines = RESEARCH_TYPES.map(type => {
    const typeRows = rows.filter(row => row.research_type === type);
    const cells = AGE_GROUPS.map(group => genderPair(typeRows.filter(row => getAgeGroup(row.birth_date) === group))).join("");

    return `
      <tr>
        <td>${type}</td>
        ${cells}
        <td>${typeRows.length}</td>
      </tr>
    `;
  });

  const totalCells = AGE_GROUPS.map(group => genderPair(rows.filter(row => getAgeGroup(row.birth_date) === group))).join("");

  lines.push(`
    <tr class="total-row">
      <td>합계</td>
      ${totalCells}
      <td>${rows.length}</td>
    </tr>
  `);

  tbody.innerHTML = lines.join("");
}


function renderDegreePyramid(rows) {
  const container = document.getElementById("degreePyramidChart");
  if (!container) return;

  const groups = DEGREES;
  const max = Math.max(
    1,
    ...groups.map(group => rows.filter(row => row.degree === group && row.gender === "남").length),
    ...groups.map(group => rows.filter(row => row.degree === group && row.gender === "여").length)
  );

  container.innerHTML = `
    <div class="pyramid-col">
      ${groups.map(group => {
        const count = rows.filter(row => row.degree === group && row.gender === "남").length;
        return `<div class="pyramid-row left"><span>${count}명</span><div class="pyramid-bar male" style="width:${(count / max) * 100}%"></div></div>`;
      }).join("")}
    </div>
    <div class="pyramid-age">
      ${groups.map(group => `<div>${group}</div>`).join("")}
    </div>
    <div class="pyramid-col">
      ${groups.map(group => {
        const count = rows.filter(row => row.degree === group && row.gender === "여").length;
        return `<div class="pyramid-row right"><div class="pyramid-bar female" style="width:${(count / max) * 100}%"></div><span>${count}명</span></div>`;
      }).join("")}
    </div>
  `;
}

function renderPyramid(rows) {
  const container = document.getElementById("pyramidChart");
  if (!container) return;

  const groups = ["50대+", "40대", "30대", "20대"];
  const max = Math.max(
    1,
    ...groups.map(group => rows.filter(row => getAgeGroup(row.birth_date) === group && row.gender === "남").length),
    ...groups.map(group => rows.filter(row => getAgeGroup(row.birth_date) === group && row.gender === "여").length)
  );

  container.innerHTML = `
    <div class="pyramid-col">
      ${groups.map(group => {
        const count = rows.filter(row => getAgeGroup(row.birth_date) === group && row.gender === "남").length;
        return `<div class="pyramid-row left"><span>${count}명</span><div class="pyramid-bar male" style="width:${(count / max) * 100}%"></div></div>`;
      }).join("")}
    </div>
    <div class="pyramid-age">
      ${groups.map(group => `<div>${group}</div>`).join("")}
    </div>
    <div class="pyramid-col">
      ${groups.map(group => {
        const count = rows.filter(row => getAgeGroup(row.birth_date) === group && row.gender === "여").length;
        return `<div class="pyramid-row right"><div class="pyramid-bar female" style="width:${(count / max) * 100}%"></div><span>${count}명</span></div>`;
      }).join("")}
    </div>
  `;

  renderShapeInsight(rows);
}

function renderShapeInsight(rows) {
  const el = document.getElementById("shapeInsight");
  if (!el) return;

  const counts = {
    young: rows.filter(row => ["20대", "30대"].includes(getAgeGroup(row.birth_date))).length,
    middle: rows.filter(row => ["30대", "40대"].includes(getAgeGroup(row.birth_date))).length,
    senior: rows.filter(row => ["40대", "50대+"].includes(getAgeGroup(row.birth_date))).length
  };

  let message = "데이터가 충분하지 않아 인력구조 해석을 보류합니다.";

  if (rows.length > 0) {
    const age30 = rows.filter(row => getAgeGroup(row.birth_date) === "30대").length;
    const age20 = rows.filter(row => getAgeGroup(row.birth_date) === "20대").length;
    const age50 = rows.filter(row => getAgeGroup(row.birth_date) === "50대+").length;

    if (age30 >= age20 && age30 >= age50) {
      message = "현재는 30대 중심의 중간층 집중형 구조입니다. 운영 안정성은 좋지만, 20대 유입이 적으면 장기적으로 하단 인력층이 약해질 수 있습니다.";
    } else if (age20 > age30 && age20 > age50) {
      message = "20대 비중이 높은 피라미드형에 가깝습니다. 성장 여력은 크지만 숙련 인력 관리가 중요합니다.";
    } else if (age50 >= age20 && age50 >= age30) {
      message = "고연령층 비중이 높은 역피라미드형에 가깝습니다. 승계와 신규 인력 확보 계획이 필요합니다.";
    }
  }

  el.textContent = message;
}

function genderPair(rows) {
  const male = countGender(rows, "남");
  const female = countGender(rows, "여");
  return `<td><span class="gender-pair"><b class="male-text">${male}</b><i>/</i><b class="female-text">${female}</b></span></td>`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}const POSITION_ORDER = ["사원", "주임", "대리", "과장", "차장", "부장", "이사부장", "이사", "전무"];
const LOWER_TENURE_GROUPS = ["3~5년", "1~3년", "1년 미만"];

function getLatestAnalysisRows() {
  const source = Array.isArray(AppState?.merged) ? AppState.merged : [];
  const scoped = typeof getOrgScopedRows === "function" ? getOrgScopedRows(source) : source;

  return scoped
    .filter(row => typeof isResearchStaffRow === "function" ? isResearchStaffRow(row) : true)
    .filter(row => {
      const status = String(row.status || row.employment_status || "").trim();
      if (status === "퇴사") return false;
      if (row.resignation_date) return false;
      return true;
    });
}


function renderAnalysis() {
  const rows = getLatestAnalysisRows();

  renderDedicatedTrendChart();
  renderTenureBars(rows);
  renderPositionBars(rows);
  renderTeamBars(rows);
  renderAssignYearBars(rows);
  renderAnalysisComment(rows);
}

function renderTenureBars(rows) {
  const tenureGroups = getDynamicTenureGroups(rows);
  const entries = tenureGroups.map(group => [
    group,
    rows.filter(row => getTenureGroup(row.hire_date, tenureGroups) === group).length
  ]);

  renderAnalysisBars("tenureBars", entries, rows.length, { includeZero: true });
}

function renderPositionBars(rows) {
  const knownMap = new Map(POSITION_ORDER.map(position => [position, 0]));
  const extraMap = new Map();

  rows.forEach(row => {
    const position = normalizePosition(row.position);
    if (!position) {
      extraMap.set("미지정", (extraMap.get("미지정") || 0) + 1);
      return;
    }

    if (knownMap.has(position)) {
      knownMap.set(position, knownMap.get(position) + 1);
    } else {
      extraMap.set(position, (extraMap.get(position) || 0) + 1);
    }
  });

  const extraPositions = [...extraMap.entries()]
    .filter(([name]) => name !== "미지정")
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ko", { numeric: true }));

  const knownPositions = [...POSITION_ORDER]
    .reverse()
    .map(position => [position, knownMap.get(position) || 0])
    .filter(([, count]) => count > 0);

  const unspecified = extraMap.has("미지정") ? [["미지정", extraMap.get("미지정")]] : [];

  renderAnalysisBars("positionBars", [...extraPositions, ...knownPositions, ...unspecified], rows.length);
}

function renderTeamBars(rows) {
  const container = document.getElementById("teamBars");
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    return;
  }

  const deptMap = new Map();

  rows.forEach(row => {
    const department = String(row.department || "미지정 부서").trim() || "미지정 부서";
    const team = String(row.team || "미지정").trim() || "미지정";
    const deptCode = getDepartmentSortValue(row);
    const teamCode = getTeamSortValue(row);

    if (!deptMap.has(department)) {
      deptMap.set(department, {
        name: department,
        code: deptCode,
        count: 0,
        teams: new Map()
      });
    }

    const dept = deptMap.get(department);
    dept.count += 1;
    dept.code = pickBetterSortValue(dept.code, deptCode);

    if (!dept.teams.has(team)) {
      dept.teams.set(team, {
        name: team,
        code: teamCode,
        count: 0
      });
    }

    const teamItem = dept.teams.get(team);
    teamItem.count += 1;
    teamItem.code = pickBetterSortValue(teamItem.code, teamCode);
  });

  const departments = [...deptMap.values()].sort((a, b) => compareSortObjects(a, b));
  const max = Math.max(1, ...rows.map(() => 1), ...departments.flatMap(dept => [...dept.teams.values()].map(team => team.count)));

  container.innerHTML = departments.map((dept, deptIndex) => {
    const teams = [...dept.teams.values()].sort((a, b) => compareSortObjects(a, b));
    return `
      <div class="analysis-dept-group ${deptIndex > 0 ? "has-gap" : ""}">
        <div class="analysis-dept-header">
          <span title="${escapeAnalysisHtml(dept.name)}">${escapeAnalysisHtml(dept.name)}</span>
          <strong>${dept.count}명</strong>
        </div>
        <div class="analysis-dept-teams">
          ${teams.map(team => renderAnalysisBarRow(team.name, team.count, rows.length, max)).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function renderAssignYearBars(rows) {
  const map = new Map();

  rows.forEach(row => {
    const date = parseDateOnly(row.lab_assign_date || row.hire_date);
    const year = date ? String(date.getFullYear()) : "미입력";
    map.set(year, (map.get(year) || 0) + 1);
  });

  const entries = [...map.entries()].sort((a, b) => {
    if (a[0] === "미입력") return 1;
    if (b[0] === "미입력") return -1;
    return Number(b[0]) - Number(a[0]);
  });

  renderAnalysisBars("assignYearBars", entries, rows.length);
}

function renderAnalysisBars(containerId, entries, total, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const displayEntries = options.includeZero ? entries : entries.filter(([, count]) => count > 0);
  const max = Math.max(1, ...displayEntries.map(([, count]) => count));

  if (!displayEntries.length) {
    container.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = displayEntries.map(([name, count]) => renderAnalysisBarRow(name, count, total, max)).join("");
}

function renderAnalysisBarRow(name, count, total, max) {
  const width = count > 0 ? (count / max) * 100 : 0;
  return `
    <div class="bar-row analysis-bar-row ${count === 0 ? "zero-row" : ""}">
      <span title="${escapeAnalysisHtml(name)}">${escapeAnalysisHtml(name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      <strong>${count}명 <em>${pct(count, total)}</em></strong>
    </div>
  `;
}

function renderAnalysisComment(rows) {
  const el = document.getElementById("analysisComment");
  if (!el) return;

  const total = rows.length;
  if (!total) {
    el.textContent = "연구인력 데이터가 입력되면 자동 분석 코멘트가 표시됩니다.";
    return;
  }

  const dedicated = countBy(rows, "research_type", "전담요원");
  const masterPlus = rows.filter(row => row.degree === "석사" || row.degree === "박사").length;

  const tenureGroups = getDynamicTenureGroups(rows);
  const topTenure = tenureGroups
    .map(group => ({
      group,
      count: rows.filter(row => getTenureGroup(row.hire_date, tenureGroups) === group).length
    }))
    .filter(item => item.count > 0 && item.group !== "미입력")
    .sort((a, b) => b.count - a.count)[0];

  const corePositions = ["대리", "과장", "차장"];
  const coreCount = rows.filter(row => corePositions.includes(normalizePosition(row.position))).length;
  const seniorCount = rows.filter(row => ["부장", "이사부장", "이사", "전무"].includes(normalizePosition(row.position))).length;

  const teamMap = new Map();
  rows.forEach(row => {
    const department = String(row.department || "미지정 부서").trim() || "미지정 부서";
    const team = String(row.team || "미지정").trim() || "미지정";
    const key = `${department} / ${team}`;
    teamMap.set(key, (teamMap.get(key) || 0) + 1);
  });
  const topTeam = [...teamMap.entries()].sort((a, b) => b[1] - a[1])[0];

  const yearMap = new Map();
  rows.forEach(row => {
    const date = parseDateOnly(row.lab_assign_date || row.hire_date);
    if (!date) return;
    const year = String(date.getFullYear());
    yearMap.set(year, (yearMap.get(year) || 0) + 1);
  });
  const latestYear = [...yearMap.keys()].sort((a, b) => Number(b) - Number(a))[0];

  const insights = [];
  insights.push(`전담요원 비중은 <strong>${pct(dedicated, total)}</strong>로 연구 중심 조직 구조를 보여줍니다.`);
  insights.push(`석사 이상 인력은 <strong>${masterPlus}명</strong>으로 전체의 <strong>${pct(masterPlus, total)}</strong>입니다.`);

  if (topTenure) {
    insights.push(`입사일 기준 근속연수는 <strong>${topTenure.group}</strong> 구간이 가장 큰 비중을 차지합니다.`);
  }

  if (coreCount > 0) {
    insights.push(`대리~차장 실무 허리층은 <strong>${coreCount}명</strong>으로 전체의 <strong>${pct(coreCount, total)}</strong>입니다.`);
  }

  if (seniorCount > 0) {
    insights.push(`부장 이상 리더/상위 직급은 <strong>${seniorCount}명</strong>으로 조직 운영의 핵심 축입니다.`);
  }

  if (topTeam) {
    insights.push(`가장 큰 조직 단위는 <strong>${escapeAnalysisHtml(topTeam[0])}</strong>이며 <strong>${topTeam[1]}명</strong>입니다.`);
  }

  if (latestYear) {
    insights.push(`최근 연구소 발령연도는 <strong>${latestYear}년</strong>이며, 최신 유입 흐름을 우선 확인할 수 있습니다.`);
  }

  el.innerHTML = `<ul class="analysis-insight-list">${insights.map(text => `<li>${text}</li>`).join("")}</ul>`;
}

function getDynamicTenureGroups(rows) {
  const yearsList = rows
    .map(row => getTenureYears(row.hire_date))
    .filter(years => Number.isFinite(years) && years >= 0);

  const maxYears = Math.max(0, ...yearsList);
  const topBoundary = Math.max(15, Math.ceil(maxYears / 5) * 5 || 15);
  const groups = [`${topBoundary}년 이상`];

  for (let upper = topBoundary; upper > 10; upper -= 5) {
    groups.push(`${upper - 5}~${upper}년`);
  }

  groups.push("5~10년", ...LOWER_TENURE_GROUPS, "미입력");
  return [...new Set(groups)];
}

function getTenureGroup(dateValue, groups = null) {
  const years = getTenureYears(dateValue);
  if (!Number.isFinite(years) || years < 0) return "미입력";

  const dynamicGroups = groups || getDynamicTenureGroups([]);
  const topGroup = dynamicGroups[0];
  const topBoundary = Number(String(topGroup).replace(/[^0-9]/g, "")) || 15;

  if (years >= topBoundary) return topGroup;
  if (years >= 5) {
    const lower = Math.floor(years / 5) * 5;
    const upper = lower + 5;
    return `${lower}~${upper}년`;
  }
  if (years >= 3) return "3~5년";
  if (years >= 1) return "1~3년";
  return "1년 미만";
}

function getTenureYears(dateValue) {
  const startDate = parseDateOnly(dateValue);
  if (!startDate) return NaN;

  const referenceDate = getAnalysisReferenceDate();
  let months = (referenceDate.getFullYear() - startDate.getFullYear()) * 12;
  months += referenceDate.getMonth() - startDate.getMonth();
  if (referenceDate.getDate() < startDate.getDate()) months -= 1;
  if (months < 0) return NaN;
  return months / 12;
}

function normalizePosition(positionValue) {
  const text = String(positionValue || "").trim();
  if (!text) return "";

  const normalized = text.replace(/\s+/g, "");
  const ordered = [...POSITION_ORDER].sort((a, b) => b.length - a.length);
  const found = ordered.find(position => normalized.includes(position));
  return found || text;
}

function getDepartmentSortValue(row) {
  return firstValue(row, [
    "department_code", "dept_code", "division_code", "divisionCode", "department_order", "dept_order", "division_order", "department_sort", "sort_order_department"
  ]) || row.department || "";
}

function getTeamSortValue(row) {
  return firstValue(row, [
    "team_code", "teamCode", "team_order", "team_sort", "sort_order_team"
  ]) || row.team || "";
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function pickBetterSortValue(current, next) {
  if (!current) return next;
  if (!next) return current;
  return compareSortValues(next, current) < 0 ? next : current;
}

function compareSortObjects(a, b) {
  const codeCompare = compareSortValues(a.code, b.code);
  if (codeCompare !== 0) return codeCompare;
  return String(a.name || "").localeCompare(String(b.name || ""), "ko", { numeric: true });
}

function compareSortValues(a, b) {
  const av = String(a ?? "").trim();
  const bv = String(b ?? "").trim();
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv, "ko", { numeric: true, sensitivity: "base" });
}


function renderDedicatedTrendChart() {
  const container = document.getElementById("dedicatedTrendChart");
  const summaryEl = document.getElementById("dedicatedTrendSummary");
  if (!container) return;

  const months = getLatestTwelveMonths();
  const sourceRows = getDedicatedTrendSourceRows();
  const data = months.map(month => buildDedicatedTrendPoint(month, sourceRows));

  if (!data.length) {
    container.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    if (summaryEl) summaryEl.textContent = "최근 12개월 전담인력 데이터가 입력되면 운영 가능 인력 추이가 표시됩니다.";
    return;
  }

  container.innerHTML = buildDedicatedTrendSvg(data);
  renderDedicatedTrendSummary(summaryEl, data);
}

function getDedicatedTrendSourceRows() {
  const source = Array.isArray(AppState?.merged) ? AppState.merged : [];
  const scoped = typeof getOrgScopedRows === "function" ? getOrgScopedRows(source) : source;
  return scoped.filter(row => typeof isResearchStaffRow === "function" ? isResearchStaffRow(row) : true);
}

function getLatestTwelveMonths() {
  const now = new Date();
  const latest = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = [];

  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(latest.getFullYear(), latest.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      value,
      label: `${String(date.getMonth() + 1).padStart(2, "0")}월`,
      shortLabel: `${date.getMonth() + 1}월`,
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 0)
    });
  }

  return months;
}

function buildDedicatedTrendPoint(month, sourceRows) {
  const activeRows = sourceRows.filter(row => isActiveOnMonthEnd(row, month.end));
  const dedicatedRows = activeRows.filter(row => row.research_type === "전담요원");
  const actualRows = dedicatedRows.filter(row => !isUnavailableOnDate(row, month.end));

  return {
    month: month.value,
    label: month.label,
    shortLabel: month.shortLabel,
    totalDedicated: dedicatedRows.length,
    actualDedicated: actualRows.length,
    gap: dedicatedRows.length - actualRows.length
  };
}

function isActiveOnMonthEnd(row, monthEnd) {
  const startDate = parseDateOnly(row.hire_date || row.lab_assign_date);
  const resignationDate = parseDateOnly(row.resignation_date);
  const status = String(row.status || row.employment_status || "").trim();

  if (!startDate || startDate > monthEnd) return false;
  if (resignationDate && resignationDate <= monthEnd) return false;
  if (!resignationDate && status.includes("퇴사")) return false;

  return true;
}

function isUnavailableOnDate(row, date) {
  if (typeof getAdminReferenceSpecialStatusOnDate === "function") {
    return Boolean(getAdminReferenceSpecialStatusOnDate(row, date)) || isLeaveStatus(row);
  }

  const employeeNo = String(row.employee_no || row.employee_id || row.id || "").trim();
  const specialTypes = typeof ADMIN_LEAVE_SPECIAL_TYPES !== "undefined"
    ? ADMIN_LEAVE_SPECIAL_TYPES
    : ["파견", "병가", "육아휴직", "출산휴가", "일반휴직", "가족돌봄휴직"];

  const hasSpecialStatus = Boolean(employeeNo) && (AppState.specialNotes || []).some(note => {
    const noteEmployeeNo = String(note.employee_no || note.employee_id || "").trim();
    const type = String(note.issue_type || note.special_type || note.type || "").trim();
    if (noteEmployeeNo !== employeeNo) return false;
    if (!specialTypes.includes(type)) return false;
    return isSpecialNoteActiveOnDate(note, date);
  });

  return hasSpecialStatus || isLeaveStatus(row);
}

function buildDedicatedTrendSvg(data) {
  const width = 920;
  const height = 210;
  const padding = { top: 30, right: 24, bottom: 34, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.flatMap(item => [item.totalDedicated, item.actualDedicated]));
  const yMax = Math.max(5, Math.ceil(maxValue / 5) * 5);

  const x = index => padding.left + (data.length === 1 ? chartWidth / 2 : (chartWidth / (data.length - 1)) * index);
  const y = value => padding.top + chartHeight - (value / yMax) * chartHeight;
  const pointsTotal = data.map((item, index) => `${x(index)},${y(item.totalDedicated)}`).join(" ");
  const pointsActual = data.map((item, index) => `${x(index)},${y(item.actualDedicated)}`).join(" ");
  const yTicks = [0, Math.round(yMax / 2), yMax];

  return `
    <div class="dedicated-trend-legend">
      <span><i class="total"></i>총전담</span>
      <span><i class="actual"></i>실전담</span>
      <span class="trend-gap-note">두 선의 차이 = 휴직/파견 등 운영공백</span>
    </div>
    <svg class="dedicated-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="월별 운영 가능 전담인력 추이">
      ${yTicks.map(value => `
        <g>
          <line x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}" class="trend-grid-line"></line>
          <text x="${padding.left - 10}" y="${y(value) + 4}" text-anchor="end" class="trend-axis-label">${value}</text>
        </g>
      `).join("")}
      <polyline points="${pointsTotal}" class="trend-line total"></polyline>
      <polyline points="${pointsActual}" class="trend-line actual"></polyline>
      ${data.map((item, index) => `
        <g class="trend-point-group">
          <title>${item.month} / 총전담 ${item.totalDedicated}명 / 실전담 ${item.actualDedicated}명 / 차이 ${item.gap}명</title>
          <line x1="${x(index)}" y1="${padding.top}" x2="${x(index)}" y2="${padding.top + chartHeight}" class="trend-month-guide"></line>
          <circle cx="${x(index)}" cy="${y(item.totalDedicated)}" r="4.5" class="trend-point total"></circle>
          <circle cx="${x(index)}" cy="${y(item.actualDedicated)}" r="4.5" class="trend-point actual"></circle>
          <text x="${x(index)}" y="${Math.max(padding.top + 10, y(item.totalDedicated) - 10)}" text-anchor="middle" class="trend-value-label total">${item.totalDedicated}</text>
          <text x="${x(index)}" y="${Math.min(padding.top + chartHeight - 8, y(item.actualDedicated) + 18)}" text-anchor="middle" class="trend-value-label actual">${item.actualDedicated}</text>
          <text x="${x(index)}" y="${height - 12}" text-anchor="middle" class="trend-month-label">${escapeAnalysisHtml(item.shortLabel)}</text>
        </g>
      `).join("")}
    </svg>
  `;
}

function renderDedicatedTrendSummary(summaryEl, data) {
  if (!summaryEl) return;

  const latest = data[data.length - 1];
  const previous = data[data.length - 2] || latest;
  const totalDelta = latest.totalDedicated - previous.totalDedicated;
  const actualDelta = latest.actualDedicated - previous.actualDedicated;
  const gapText = latest.gap > 0
    ? `현재 총전담과 실전담 차이는 ${latest.gap}명입니다.`
    : "현재 총전담과 실전담 차이는 없습니다.";

  summaryEl.innerHTML = `
    <span>최근월 총전담 <strong>${latest.totalDedicated}명</strong></span>
    <span>실전담 <strong>${latest.actualDedicated}명</strong></span>
    <span>전월 대비 총전담 <strong>${formatSignedCount(totalDelta)}</strong>, 실전담 <strong>${formatSignedCount(actualDelta)}</strong></span>
    <span>${gapText}</span>
  `;
}

function formatSignedCount(value) {
  const number = Number(value || 0);
  if (number > 0) return `+${number}명`;
  if (number < 0) return `${number}명`;
  return "변동 없음";
}

function getAnalysisReferenceDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

function escapeAnalysisHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}function renderAdmin() {
  const tbody = document.getElementById("adminTableBody");
  if (!tbody) return;

  const keyword = (document.getElementById("adminSearch")?.value || "").trim().toLowerCase();

  const baseRows = typeof getAdminRows === "function" ? getAdminRows() : AppState.merged;
  const filteredRows = baseRows.filter(row => {
    if (!keyword) return true;
    const displayStatus = typeof getAdminDisplayStatus === "function" ? getAdminDisplayStatus(row) : row.status;
    return [
      row.name,
      row.department,
      row.team,
      row.position,
      row.employee_no,
      displayStatus
    ].some(value => String(value || "").toLowerCase().includes(keyword));
  });

  const rows = sortStaffRows(filteredRows);
  const canEdit = canEditAdminList();

  const countEl = document.getElementById("adminListCount");
  if (countEl) {
    const totalCount = baseRows.length;
    const filteredCount = rows.length;
    countEl.innerHTML = keyword
      ? `검색 ${filteredCount.toLocaleString()}명 <span>/ 전체 ${totalCount.toLocaleString()}명</span>`
      : `전체 ${totalCount.toLocaleString()}명`;
  }

  tbody.innerHTML = rows.map((row, index) => renderAdminRow(row, index, canEdit)).join("");

  updateAdminEditMode(canEdit);
  bindAdminInputs(canEdit);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("adminSearch")?.addEventListener("input", renderAdmin);
  document.getElementById("saveAllBtn")?.addEventListener("click", saveAllProfiles);
});

function canEditAdminList() {
  if (typeof canEditOperatingStaffList === "function") return canEditOperatingStaffList();
  return Boolean(AppState?.isAdmin);
}

function updateAdminEditMode(canEdit) {
  const view = document.getElementById("view-admin");
  const saveBtn = document.getElementById("saveAllBtn");
  const tableBody = document.getElementById("adminTableBody");

  view?.classList.toggle("admin-readonly", !canEdit);
  tableBody?.classList.toggle("admin-readonly-body", !canEdit);

  if (saveBtn) {
    saveBtn.hidden = !canEdit;
    saveBtn.disabled = !canEdit;
  }

  let badge = document.getElementById("adminReadonlyBadge");
  const actions = document.querySelector("#view-admin .admin-actions");

  if (!badge && actions) {
    badge = document.createElement("span");
    badge.id = "adminReadonlyBadge";
    badge.className = "readonly-badge";
    actions.prepend(badge);
  }

  if (badge) {
    badge.textContent = canEdit ? "관리자 수정 가능" : "조회 전용";
    badge.hidden = canEdit;
  }
}

function renderAdminRow(row, index, canEdit = true) {
  const employeeNo = escapeHtml(row.employee_no || "");
  const displayStatus = typeof getAdminDisplayStatus === "function" ? getAdminDisplayStatus(row) : (row.status || "");
  const isLeaveRow = typeof isAdminLeaveRow === "function" ? isAdminLeaveRow(row) : false;
  const rowClass = isLeaveRow ? "leave-row" : "";
  const disabledAttr = canEdit ? "" : " disabled";

  return `
    <tr class="${rowClass}" data-employee-no="${employeeNo}">
      <td class="admin-row-no">${index + 1}</td>
      <td class="admin-employee-no">${employeeNo}</td>
      <td>${escapeHtml(row.name || "")}</td>
      <td>${escapeHtml(row.department || "")}</td>
      <td>${escapeHtml(row.team || "")}</td>
      <td>${escapeHtml(row.position || "")}</td>
      <td class="status-cell">${formatAdminStatus(displayStatus)}</td>
      <td>
        <select data-field="research_type"${disabledAttr}>
          ${option("", "선택", row.research_type)}
          ${option("전담요원", "전담요원", row.research_type)}
          ${option("보조원", "보조원", row.research_type)}
          ${option("관리직원", "관리직원", row.research_type)}
        </select>
      </td>
      <td>
        <select data-field="gender"${disabledAttr}>
          ${option("", "선택", row.gender)}
          ${option("남", "남", row.gender)}
          ${option("여", "여", row.gender)}
        </select>
      </td>
      <td><input type="date" data-field="birth_date" value="${row.birth_date || ""}"${disabledAttr}></td>
      <td><input type="date" data-field="lab_assign_date" value="${row.lab_assign_date || ""}"${disabledAttr}></td>
      <td>
        <select data-field="degree"${disabledAttr}>
          ${option("", "선택", row.degree)}
          ${option("박사", "박사", row.degree)}
          ${option("석사", "석사", row.degree)}
          ${option("학사", "학사", row.degree)}
          ${option("전문학사", "전문학사", row.degree)}
          ${option("기타", "기타", row.degree)}
        </select>
      </td>
      <td><input type="text" data-field="remarks" value="${escapeHtml(row.remarks || "")}" placeholder="비고"${disabledAttr}></td>
    </tr>
  `;
}

function bindAdminInputs(canEdit = true) {
  if (!canEdit) return;

  document.querySelectorAll("#adminTableBody input, #adminTableBody select").forEach(input => {
    input.addEventListener("change", event => {
      const tr = event.target.closest("tr");
      if (tr) tr.classList.add("edited");
    });
  });
}

async function saveAllProfiles() {
  if (!canEditAdminList()) {
    alert("관리자만 수정할 수 있습니다.");
    return;
  }

  const client = getSupabase();

  if (!client) {
    alert("Supabase 연결값을 먼저 설정해주세요.");
    return;
  }

  const editedRows = [...document.querySelectorAll("#adminTableBody tr.edited")];

  if (!editedRows.length) {
    alert("변경된 내용이 없습니다.");
    return;
  }

  const payloads = editedRows.map(tr => {
    const employeeNo = tr.dataset.employeeNo;
    const payload = { employee_no: employeeNo };

    tr.querySelectorAll("[data-field]").forEach(input => {
      const field = input.dataset.field;
      payload[field] = input.type === "checkbox" ? input.checked : input.value || null;
    });

    payload.is_research_staff = true;
    payload.updated_at = new Date().toISOString();
    if (typeof getResearchStaffCompanyId === "function") {
      const companyId = getResearchStaffCompanyId();
      if (companyId) payload.company_id = companyId;
    }
    return payload;
  });

  try {
    const { error } = await client
      .from("research_staff_profiles")
      .upsert(payloads, { onConflict: (typeof getResearchStaffCompanyId === "function" && getResearchStaffCompanyId()) ? "employee_no,company_id" : "employee_no" });

    if (error) throw error;

    alert("저장되었습니다.");
    await loadAllData();
  } catch (error) {
    console.error(error);
    alert(`저장 실패: ${error.message || error}`);
  }
}

function option(value, label, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatAdminStatus(value) {
  const status = String(value || "").trim();

  if (status === "가족돌봄휴직") {
    return '<span class="status-text">가족돌봄<br>휴직</span>';
  }

  return `<span class="status-text">${escapeHtml(status)}</span>`;
}
/* =========================================================
   Mobile UI overrides | 2026-09-28
   - PC 데이터/권한/테넌트 로직 재사용
   - 모바일 렌더링만 별도 구성
========================================================= */

let MobileAdminEmployeeNo = "";
let MobileTrendSelectedIndex = -1;

function renderDashboard() {
  const rows = getResearchRows();
  renderSummaryCards(rows);
  renderMobileResearchTypeCards(rows);
  renderDashboardDegreeBars(rows);
  renderMobileDegreeSummary(rows);
  renderMobileAgeSummary(rows);
  renderDegreePyramid(rows);
  renderPyramid(rows);
}

function renderMobileResearchTypeCards(rows) {
  const container = document.getElementById("researchTypeCards");
  if (!container) return;
  const lines = RESEARCH_TYPES.map(type => {
    const typeRows = rows.filter(row => row.research_type === type);
    return mobileTypeCard(type, typeRows, false);
  });
  lines.push(mobileTypeCard("합계", rows, true));
  container.innerHTML = lines.join("");
}

function mobileTypeCard(label, rows, isTotal) {
  const male = countGender(rows, "남");
  const female = countGender(rows, "여");
  return `
    <div class="type-card ${isTotal ? "total" : ""}">
      <strong>${escapeDashboardHtml(label)}</strong>
      <div class="type-stat"><span>전체</span><b>${rows.length}</b></div>
      <div class="type-stat"><span>남</span><b>${male}</b></div>
      <div class="type-stat"><span>여</span><b>${female}</b></div>
    </div>`;
}

function renderMobileDegreeSummary(rows) {
  const summary = document.getElementById("mobileDegreeSummary");
  const detail = document.getElementById("mobileDegreeDetail");
  if (!summary || !detail) return;

  summary.innerHTML = DEGREES.map(degree => {
    const group = rows.filter(row => row.degree === degree);
    return mobileMetricTile(degree, group, rows.length);
  }).join("");

  detail.innerHTML = RESEARCH_TYPES.map(type => {
    const typeRows = rows.filter(row => row.research_type === type);
    const cells = DEGREES.map(degree => mobileBreakdownCell(
      degree,
      typeRows.filter(row => row.degree === degree)
    )).join("");
    return `
      <section class="breakdown-card">
        <strong>${escapeDashboardHtml(type)}</strong>
        <div class="breakdown-grid">
          ${cells}
          <div class="breakdown-cell breakdown-total"><span>합계</span><b>${typeRows.length}명</b></div>
        </div>
      </section>`;
  }).join("");
}

function renderMobileAgeSummary(rows) {
  const summary = document.getElementById("mobileAgeSummary");
  const detail = document.getElementById("mobileAgeDetail");
  if (!summary || !detail) return;

  summary.innerHTML = AGE_GROUPS.map(group => {
    const groupRows = rows.filter(row => getAgeGroup(row.birth_date) === group);
    return mobileMetricTile(group, groupRows, rows.length);
  }).join("");

  detail.innerHTML = RESEARCH_TYPES.map(type => {
    const typeRows = rows.filter(row => row.research_type === type);
    const cells = AGE_GROUPS.map(group => mobileBreakdownCell(
      group,
      typeRows.filter(row => getAgeGroup(row.birth_date) === group)
    )).join("");
    return `
      <section class="breakdown-card">
        <strong>${escapeDashboardHtml(type)}</strong>
        <div class="breakdown-grid">
          ${cells}
          <div class="breakdown-cell breakdown-total"><span>합계</span><b>${typeRows.length}명</b></div>
        </div>
      </section>`;
  }).join("");
}

function mobileMetricTile(label, rows, total) {
  const male = countGender(rows, "남");
  const female = countGender(rows, "여");
  return `
    <div class="metric-tile">
      <span>${escapeDashboardHtml(label)}</span>
      <div class="gender-value"><b class="male">${male}</b><i>/</i><b class="female">${female}</b></div>
      <small>합계 ${rows.length}명 · ${pct(rows.length, total)}</small>
    </div>`;
}

function mobileBreakdownCell(label, rows) {
  const male = countGender(rows, "남");
  const female = countGender(rows, "여");
  return `<div class="breakdown-cell"><span>${escapeDashboardHtml(label)}</span><b>${male} / ${female}</b></div>`;
}

function renderAnalysis() {
  const rows = getLatestAnalysisRows();
  renderMobileDedicatedTrendChart();
  renderTenureBars(rows);
  renderPositionBars(rows);
  renderTeamBars(rows);
  renderAssignYearBars(rows);
  renderAnalysisComment(rows);
}

function renderMobileDedicatedTrendChart() {
  const container = document.getElementById("dedicatedTrendChart");
  const summaryEl = document.getElementById("dedicatedTrendSummary");
  if (!container) return;

  const months = getLatestTwelveMonths();
  const sourceRows = getDedicatedTrendSourceRows();
  const data = months.map(month => buildDedicatedTrendPoint(month, sourceRows));

  if (!data.length) {
    container.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    if (summaryEl) summaryEl.textContent = "최근 12개월 전담인력 데이터가 입력되면 운영 가능 인력 추이가 표시됩니다.";
    return;
  }

  if (MobileTrendSelectedIndex < 0 || MobileTrendSelectedIndex >= data.length) {
    MobileTrendSelectedIndex = data.length - 1;
  }

  container.innerHTML = buildMobileTrendSvg(data, MobileTrendSelectedIndex);
  renderDedicatedTrendSummary(summaryEl, data);
  updateMobileTrendDetail(data, MobileTrendSelectedIndex);

  container.querySelectorAll("[data-trend-index]").forEach(node => {
    const activate = () => {
      MobileTrendSelectedIndex = Number(node.dataset.trendIndex || 0);
      container.innerHTML = buildMobileTrendSvg(data, MobileTrendSelectedIndex);
      updateMobileTrendDetail(data, MobileTrendSelectedIndex);
      container.querySelectorAll("[data-trend-index]").forEach(next => {
        next.addEventListener("click", () => {
          MobileTrendSelectedIndex = Number(next.dataset.trendIndex || 0);
          renderMobileDedicatedTrendChart();
        });
      });
    };
    node.addEventListener("click", activate);
  });
}

function buildMobileTrendSvg(data, selectedIndex) {
  const width = 720;
  const height = 250;
  const padding = { top: 24, right: 14, bottom: 42, left: 34 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.flatMap(item => [item.totalDedicated, item.actualDedicated]));
  const yMax = Math.max(5, Math.ceil(maxValue / 5) * 5);
  const x = index => padding.left + (data.length === 1 ? chartWidth / 2 : (chartWidth / (data.length - 1)) * index);
  const y = value => padding.top + chartHeight - (value / yMax) * chartHeight;
  const totalPoints = data.map((item, index) => `${x(index)},${y(item.totalDedicated)}`).join(" ");
  const actualPoints = data.map((item, index) => `${x(index)},${y(item.actualDedicated)}`).join(" ");
  const yTicks = [0, Math.round(yMax / 2), yMax];

  return `
    <div class="dedicated-trend-legend">
      <span><i></i>총전담</span>
      <span><i class="actual"></i>실전담</span>
      <span class="trend-gap-note">점을 누르면 해당 월 상세가 표시됩니다.</span>
    </div>
    <svg class="mobile-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="최근 12개월 운영 가능 전담인력 추이">
      ${yTicks.map(value => `
        <g><line x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}" class="trend-grid-line"></line>
        <text x="${padding.left - 8}" y="${y(value) + 4}" text-anchor="end" class="trend-axis-label">${value}</text></g>`).join("")}
      ${selectedIndex >= 0 ? `<line x1="${x(selectedIndex)}" y1="${padding.top}" x2="${x(selectedIndex)}" y2="${padding.top + chartHeight}" class="trend-selected-line"></line>` : ""}
      <polyline points="${totalPoints}" class="trend-line total"></polyline>
      <polyline points="${actualPoints}" class="trend-line actual"></polyline>
      ${data.map((item, index) => `
        <g class="trend-point-group ${index === selectedIndex ? "selected" : ""}" data-trend-index="${index}" tabindex="0">
          <circle cx="${x(index)}" cy="${y(item.totalDedicated)}" r="4" class="trend-point total"></circle>
          <circle cx="${x(index)}" cy="${y(item.actualDedicated)}" r="4" class="trend-point actual"></circle>
          <circle cx="${x(index)}" cy="${(y(item.totalDedicated)+y(item.actualDedicated))/2}" r="18" class="trend-hit"></circle>
          <text x="${x(index)}" y="${height - 14}" text-anchor="middle" class="trend-month-label">${escapeAnalysisHtml(String(Number(item.month.slice(5,7))))}</text>
        </g>`).join("")}
    </svg>`;
}

function updateMobileTrendDetail(data, index) {
  const detail = document.getElementById("trendPointDetail");
  if (!detail || !data.length) return;
  const item = data[Math.max(0, Math.min(index, data.length - 1))];
  detail.innerHTML = `
    <div><span>${escapeAnalysisHtml(item.label)}</span><strong>${escapeAnalysisHtml(item.month)}</strong></div>
    <div><span>총전담</span><strong>${item.totalDedicated}명</strong></div>
    <div><span>실전담 / 공백</span><strong>${item.actualDedicated}명 / ${item.gap}명</strong></div>`;
}

function renderAdmin() {
  const container = document.getElementById("adminCardList");
  if (!container) return;

  const keyword = String(document.getElementById("adminSearch")?.value || "").trim().toLowerCase();
  const baseRows = typeof getAdminRows === "function" ? getAdminRows() : AppState.merged;
  const filtered = baseRows.filter(row => {
    if (!keyword) return true;
    const displayStatus = typeof getAdminDisplayStatus === "function" ? getAdminDisplayStatus(row) : row.status;
    return [row.name,row.employee_no,row.department,row.team,row.position,displayStatus]
      .some(value => String(value || "").toLowerCase().includes(keyword));
  });
  const rows = sortStaffRows(filtered);
  const canEdit = canEditAdminList();

  const badge = document.getElementById("adminReadonlyBadge");
  if (badge) {
    badge.textContent = canEdit ? "관리자 수정 가능" : "조회 전용";
    badge.classList.toggle("editable", canEdit);
  }

  const count = document.getElementById("adminListCount");
  if (count) count.textContent = keyword ? `검색 ${rows.length}명 / 전체 ${baseRows.length}명` : `전체 ${baseRows.length}명`;

  container.innerHTML = rows.length ? rows.map((row, index) => {
    const status = typeof getAdminDisplayStatus === "function" ? getAdminDisplayStatus(row) : (row.status || "");
    const leave = typeof isAdminLeaveRow === "function" ? isAdminLeaveRow(row) : false;
    return `
      <button class="staff-card ${leave ? "leave" : ""}" type="button" data-staff-no="${escapeAttr(row.employee_no || "")}">
        <span class="staff-card-main">
          <span class="staff-card-top"><strong>${escapeHtmlText(row.name || "-")}</strong><span>${escapeHtmlText(row.employee_no || "-")}</span></span>
          <span class="staff-card-org">${escapeHtmlText(row.department || "-")} · ${escapeHtmlText(row.team || "-")}</span>
        </span>
        <span class="staff-card-side"><span class="status-chip">${escapeHtmlText(status || "-")}</span><b>›</b></span>
      </button>`;
  }).join("") : `<div class="empty">표시할 직원이 없습니다.</div>`;

  container.querySelectorAll("[data-staff-no]").forEach(card => {
    card.addEventListener("click", () => openMobileStaffDrawer(card.dataset.staffNo || ""));
  });
}

function openMobileStaffDrawer(employeeNo) {
  const row = (AppState.merged || []).find(item => String(item.employee_no || "") === String(employeeNo || ""));
  if (!row) return;
  MobileAdminEmployeeNo = String(row.employee_no || "");

  const setTextSafe = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value || "-"; };
  const setValueSafe = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ""; };

  setTextSafe("staffDrawerName", row.name || "-");
  setTextSafe("staffDrawerMeta", `${row.employee_no || "-"} · ${row.department || "-"} · ${row.team || "-"}`);
  setTextSafe("detailDepartment", row.department || "-");
  setTextSafe("detailTeam", row.team || "-");
  setTextSafe("detailPosition", row.position || "-");
  setTextSafe("detailStatus", typeof getAdminDisplayStatus === "function" ? getAdminDisplayStatus(row) : (row.status || "-"));
  setValueSafe("detailResearchType", row.research_type);
  setValueSafe("detailGender", row.gender);
  setValueSafe("detailBirthDate", row.birth_date);
  setValueSafe("detailLabAssignDate", row.lab_assign_date);
  setValueSafe("detailDegree", row.degree);
  setValueSafe("detailRemarks", row.remarks);

  const canEdit = canEditAdminList();
  ["detailResearchType","detailGender","detailBirthDate","detailLabAssignDate","detailDegree","detailRemarks"].forEach(id => {
    const el = document.getElementById(id); if (el) el.disabled = !canEdit;
  });
  const saveBtn = document.getElementById("staffDrawerSave");
  if (saveBtn) saveBtn.hidden = !canEdit;

  document.getElementById("staffDrawer")?.classList.remove("hidden");
  document.getElementById("staffDrawerBackdrop")?.classList.remove("hidden");
  document.getElementById("staffDrawer")?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeMobileStaffDrawer() {
  MobileAdminEmployeeNo = "";
  document.getElementById("staffDrawer")?.classList.add("hidden");
  document.getElementById("staffDrawerBackdrop")?.classList.add("hidden");
  document.getElementById("staffDrawer")?.setAttribute("aria-hidden", "true");
  document.body.style.removeProperty("overflow");
}

async function saveMobileStaffProfile() {
  if (!canEditAdminList()) return mobileToast("관리자만 수정할 수 있습니다.", true);
  if (!MobileAdminEmployeeNo) return;
  const client = getSupabase();
  if (!client) return mobileToast("Supabase 연결을 찾을 수 없습니다.", true);

  const payload = {
    employee_no: MobileAdminEmployeeNo,
    is_research_staff: true,
    research_type: document.getElementById("detailResearchType")?.value || null,
    gender: document.getElementById("detailGender")?.value || null,
    birth_date: document.getElementById("detailBirthDate")?.value || null,
    lab_assign_date: document.getElementById("detailLabAssignDate")?.value || null,
    degree: document.getElementById("detailDegree")?.value || null,
    remarks: document.getElementById("detailRemarks")?.value || null,
    updated_at: new Date().toISOString()
  };

  const companyId = typeof getResearchStaffCompanyId === "function" ? getResearchStaffCompanyId() : "";
  if (companyId) payload.company_id = companyId;

  const btn = document.getElementById("staffDrawerSave");
  if (btn) btn.disabled = true;
  try {
    const { error } = await client
      .from("research_staff_profiles")
      .upsert(payload, { onConflict: companyId ? "employee_no,company_id" : "employee_no" });
    if (error) throw error;
    mobileToast("저장되었습니다.");
    const reopenNo = MobileAdminEmployeeNo;
    await loadAllData();
    openMobileStaffDrawer(reopenNo);
  } catch (error) {
    console.error(error);
    mobileToast(`저장 실패: ${error.message || error}`, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function mobileToast(message, bad = false) {
  const el = document.getElementById("mobileToast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast${bad ? " bad" : ""}`;
  clearTimeout(mobileToast.timer);
  mobileToast.timer = setTimeout(() => el.classList.add("hidden"), 2600);
}

function bindMobileOnlyEvents() {
  const bindDetailToggle = (buttonId, targetId) => {
    const button = document.getElementById(buttonId);
    const target = document.getElementById(targetId);
    if (!button || !target) return;
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      target.classList.toggle("hidden", open);
    });
  };
  bindDetailToggle("degreeDetailToggle", "mobileDegreeDetail");
  bindDetailToggle("ageDetailToggle", "mobileAgeDetail");

  document.getElementById("adminSearch")?.addEventListener("input", renderAdmin);
  document.getElementById("staffDrawerClose")?.addEventListener("click", closeMobileStaffDrawer);
  document.getElementById("staffDrawerCancel")?.addEventListener("click", closeMobileStaffDrawer);
  document.getElementById("staffDrawerBackdrop")?.addEventListener("click", closeMobileStaffDrawer);
  document.getElementById("staffDrawerSave")?.addEventListener("click", saveMobileStaffProfile);
}

document.addEventListener("DOMContentLoaded", bindMobileOnlyEvents);

/* ===================== Portal bridge ===================== */
(function setupMobilePortalBridge(){
  const TABS = [
    { id: "dashboard", label: "메인 대시보드" },
    { id: "analysis", label: "현황분석" },
    { id: "admin", label: "운영인력 리스트" }
  ];
  const LEAVE_OPTIONS = [
    { value: "exclude", label: "휴직 제외" },
    { value: "include", label: "휴직 포함" }
  ];

  const activeView = () => document.querySelector('.tab-btn.active[data-view]')?.dataset.view || "dashboard";
  const optionsOf = el => !el ? [] : Array.from(el.options).map(option => ({ value: option.value, label: option.textContent || option.value }));
  const activeLeave = () => document.querySelector('.leave-toggle-btn.active[data-leave-mode]')?.dataset.leaveMode || "exclude";
  const getFilters = () => {
    const month = document.getElementById("referenceMonth");
    const division = document.getElementById("filterDivision");
    const team = document.getElementById("filterTeam");
    return [
      { id:"referenceMonth",label:"기준년월",type:"month",value:month?.value || "" },
      { id:"filterDivision",label:"본부",type:"select",value:division?.value || "",options:optionsOf(division) },
      { id:"filterTeam",label:"팀",type:"select",value:team?.value || "",options:optionsOf(team) },
      { id:"leaveMode",label:"휴직",type:"select",value:activeLeave(),options:LEAVE_OPTIONS }
    ];
  };
  const postTabs = () => { if (window.parent && window.parent !== window) window.parent.postMessage({type:"portal-tabs-ready",tabs:TABS,activeTabId:activeView(),source:"research-staff"},"*"); };
  const postFilters = () => { if (window.parent && window.parent !== window) window.parent.postMessage({type:"portal-filters-ready",enabled:true,filters:getFilters(),source:"research-staff"},"*"); };
  const postActiveTab = id => { if (window.parent && window.parent !== window && id) window.parent.postMessage({type:"portal-tab-active",activeTabId:id,tabId:id,source:"research-staff"},"*"); };
  const triggerChange = el => { if (!el) return; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); };
  const activateTab = id => { const btn=document.querySelector(`.tab-btn[data-view="${id}"]`); if(!btn)return false; btn.click(); postActiveTab(id); return true; };
  const setSelectValue = (el,value) => { if(!el)return false; const v=value||""; if(v!=="" && !Array.from(el.options).some(o=>o.value===v))return false; el.value=v; triggerChange(el); return true; };
  const setFilter = (id,value) => {
    if(id==="referenceMonth"){const el=document.getElementById(id);if(el){el.value=value||"";triggerChange(el);setTimeout(postFilters,0);}return;}
    if(id==="filterDivision"){const el=document.getElementById(id);if(setSelectValue(el,value)){setTimeout(postFilters,80);setTimeout(postFilters,300);}return;}
    if(id==="filterTeam"){if(setSelectValue(document.getElementById(id),value))setTimeout(postFilters,0);return;}
    if(id==="leaveMode"){const btn=document.querySelector(`.leave-toggle-btn[data-leave-mode="${value}"]`);if(btn){btn.click();setTimeout(postFilters,0);}}
  };

  window.portalTabs=TABS;
  window.portalFilters=getFilters;
  window.portalActivateTab=activateTab;
  window.portalSetFilter=setFilter;

  window.addEventListener("message", event => {
    const p=event?.data||{};
    if(p.type==="portal-tabs-request") return postTabs();
    if(p.type==="portal-filters-request") return postFilters();
    if(p.type==="portal-tab-change") return activateTab(p.tabId||p.tab||"");
    if(p.type==="portal-filter-change") return setFilter(p.filterId||"",p.value||"");
  });

  document.addEventListener("click", event => {
    const tab=event.target?.closest?.('.tab-btn[data-view]');
    if(tab)setTimeout(()=>postActiveTab(tab.dataset.view),0);
    const leave=event.target?.closest?.('.leave-toggle-btn[data-leave-mode]');
    if(leave)setTimeout(postFilters,0);
  });
  document.addEventListener("change", event => {
    if(["referenceMonth","filterDivision","filterTeam"].includes(event.target?.id)){setTimeout(postFilters,0);setTimeout(postFilters,300);}
  });

  const postAll=()=>{postTabs();postFilters();};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",postAll);else postAll();
  [200,700,1400,2500,4000].forEach(delay=>setTimeout(postAll,delay));
})();
