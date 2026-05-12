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
  currentUser: null,
  currentRoles: [],
  currentRole: "",
  isAdmin: false
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
  AppState.currentUser = await resolvePortalUser();
  await loadMyResearchStaffRoles();
}

async function loadMyResearchStaffRoles() {
  const email = String(AppState.currentUser?.email || "").trim();

  AppState.currentRoles = [];
  AppState.currentRole = "viewer";
  AppState.isAdmin = false;

  if (!email) {
    console.warn("포탈 로그인 이메일을 확인하지 못해 운영인력 리스트는 조회 전용으로 동작합니다.");
    return;
  }

  try {
    const roles = typeof getResearchStaffRoles === "function"
      ? await getResearchStaffRoles(email)
      : [];

    AppState.currentRoles = Array.isArray(roles) ? roles : [];
    AppState.isAdmin =
      AppState.currentRoles.includes("research_staff_admin") ||
      AppState.currentRoles.includes("research_staff_operator");
    AppState.currentRole = AppState.currentRoles.includes("research_staff_admin")
      ? "admin"
      : (AppState.currentRoles.includes("research_staff_operator") ? "operator" : "viewer");
  } catch (error) {
    console.warn("인력운영현황 권한 조회 실패:", error);
    AppState.currentRoles = [];
    AppState.currentRole = "viewer";
    AppState.isAdmin = false;
  }
}

function canEditOperatingStaffList() {
  return Boolean(AppState.isAdmin);
}

async function resolvePortalUser() {
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

function readPortalUserFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("portalEmail") || params.get("portal_email") || params.get("userEmail") || params.get("email") || "";
    const name = params.get("portalName") || params.get("name") || "";
    if (email) return { email, name };
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
      if (data?.type !== "portal-auth" && data?.type !== "PORTAL_AUTH_USER") return;

      const payload = data.user || data.payload || data;
      const email = String(payload?.email || "").trim();
      if (email) finish({ email, name: payload?.name || "" });
    };

    const timer = setTimeout(() => finish(null), timeout);
    window.addEventListener("message", onMessage);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "portal-auth-request", app: "research-staff" }, "*");
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

  return rows.filter(row => {
    const labAssignDate = parseDateOnly(row.lab_assign_date || row.hire_date);
    const resignationDate = parseDateOnly(row.resignation_date);

    if (!labAssignDate || labAssignDate > end) return false;
    if (resignationDate && resignationDate < start) return false;

    if (!resignationDate && String(row.status || "").includes("퇴사")) {
      return false;
    }

    return true;
  });
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
}
