const AppState = {
  employees: [],
  profiles: [],
  divisions: [],
  teams: [],
  merged: [],
  currentView: "dashboard",
  referenceMonth: "",
  isAdmin: true
};

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindCommonEvents();
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

function bindCommonEvents() {
  document.getElementById("refreshBtn")?.addEventListener("click", loadAllData);

  const referenceMonthInput = document.getElementById("referenceMonth");
  if (referenceMonthInput) {
    referenceMonthInput.value = getCurrentMonthValue();
    AppState.referenceMonth = referenceMonthInput.value;

    referenceMonthInput.addEventListener("change", () => {
      AppState.referenceMonth = referenceMonthInput.value || getCurrentMonthValue();
      renderAll();
    });
  }
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
    const [employeesResult, profilesResult, divisionsResult, teamsResult] = await Promise.all([
      client.from("employees").select("*").order("name", { ascending: true }),
      client.from("research_staff_profiles").select("*"),
      client.from("divisions").select("*"),
      client.from("teams").select("*")
    ]);

    if (employeesResult.error) throw employeesResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (divisionsResult.error) throw divisionsResult.error;
    if (teamsResult.error) throw teamsResult.error;

    AppState.employees = employeesResult.data || [];
    AppState.profiles = profilesResult.data || [];
    AppState.divisions = divisionsResult.data || [];
    AppState.teams = teamsResult.data || [];
    AppState.merged = mergeEmployeeProfiles(
      AppState.employees,
      AppState.profiles,
      AppState.divisions,
      AppState.teams
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
  return getReferenceFilteredRows(AppState.merged).filter(row => isResearchStaffRow(row));
}

function getAdminRows() {
  return getReferenceFilteredRows(AppState.merged);
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

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
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
