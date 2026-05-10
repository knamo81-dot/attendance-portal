const AppState = {
  employees: [],
  profiles: [],
  merged: [],
  currentView: "dashboard",
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
    const [employeesResult, profilesResult] = await Promise.all([
      client.from("employees").select("*").order("name", { ascending: true }),
      client.from("research_staff_profiles").select("*")
    ]);

    if (employeesResult.error) throw employeesResult.error;
    if (profilesResult.error) throw profilesResult.error;

    AppState.employees = employeesResult.data || [];
    AppState.profiles = profilesResult.data || [];
    AppState.merged = mergeEmployeeProfiles(AppState.employees, AppState.profiles);

    setConnectionStatus("서버 연결 완료", "success");
    renderAll();
  } catch (error) {
    console.error(error);
    setConnectionStatus("서버 조회 실패", "danger");
    useSampleData();
    renderAll();
  }
}

function mergeEmployeeProfiles(employees, profiles) {
  const profileMap = new Map(profiles.map(profile => [String(profile.employee_no), profile]));

  return employees.map(employee => {
    const employeeNo = String(employee.employee_no || employee.employee_id || employee.id || "");
    const profile = profileMap.get(employeeNo) || {};

    return {
      ...employee,

      department:
        employee.department ||
        employee.division_name ||
        employee.division ||
        employee.division_code ||
        "",

      team:
        employee.team ||
        employee.team_name ||
        employee.team_code ||
        "",

      position:
        employee.position ||
        employee.grade ||
        employee.job_title ||
        "",

      employee_no: employeeNo,
      profile_id: profile.id || null,
      is_research_staff: Boolean(profile.is_research_staff),
      research_type: profile.research_type || "",
      gender: profile.gender || "",
      birth_date: profile.birth_date || "",
      lab_assign_date: profile.lab_assign_date || "",
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
  return AppState.merged.filter(row => row.is_research_staff);
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
