// Supabase 연결 설정
const SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

const USERS_TABLE = "users";
const EMPLOYEES_TABLE = "employees";
const USER_APP_ROLES_TABLE = "user_app_roles";
const RESEARCH_STAFF_APP_KEYS = ["research_staff", "research-staff", "researchStaff"];

let supabaseClient = null;

function initSupabase() {
  if (!window.supabase) {
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

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

function getSupabase() {
  return supabaseClient || initSupabase();
}

async function getResearchStaffRoles(email) {
  const client = getSupabase();
  const roles = [];
  const targetEmail = String(email || "").trim();
  const targetEmailLower = targetEmail.toLowerCase();

  if (!client || !targetEmail) return roles;

  const pushRole = (role) => {
    if (role && !roles.includes(role)) roles.push(role);
  };

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
