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
