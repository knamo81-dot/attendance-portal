const POSITION_ORDER = ["사원", "주임", "대리", "과장", "차장", "부장", "이사부장", "이사", "전무"];
const LOWER_TENURE_GROUPS = ["3~5년", "1~3년", "1년 미만"];

function renderAnalysis() {
  const rows = getReferenceFilteredRows(AppState.merged).filter(row => isResearchStaffRow(row));

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
    rows.filter(row => getTenureGroup(row.lab_assign_date || row.hire_date, tenureGroups) === group).length
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

  const female = countGender(rows, "여");
  const masterPlus = rows.filter(row => row.degree === "석사" || row.degree === "박사").length;
  const dedicated = countBy(rows, "research_type", "전담요원");

  const tenureGroups = getDynamicTenureGroups(rows);
  const tenureCounts = tenureGroups.map(group => ({
    group,
    count: rows.filter(row => getTenureGroup(row.lab_assign_date || row.hire_date, tenureGroups) === group).length
  }));
  const topTenure = tenureCounts
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

  const comments = [];
  comments.push(`현재 연구개발인력은 총 <strong>${total}명</strong>이며, 전담요원은 <strong>${dedicated}명</strong>으로 전체의 <strong>${pct(dedicated, total)}</strong>입니다.`);
  comments.push(`여성 연구인력은 <strong>${female}명</strong>이며, 여성 비율은 <strong>${pct(female, total)}</strong>입니다. 석사 이상 인력은 <strong>${masterPlus}명</strong>으로 전체의 <strong>${pct(masterPlus, total)}</strong>입니다.`);

  if (topTenure && topTenure.count > 0) {
    comments.push(`근속연수는 <strong>${topTenure.group}</strong> 구간이 가장 많아, 해당 구간이 현재 연구소 인력 구조의 중심층으로 보입니다.`);
  }

  if (coreCount > 0) {
    comments.push(`대리~차장 구간의 실무 허리층은 <strong>${coreCount}명</strong>으로 전체의 <strong>${pct(coreCount, total)}</strong>입니다. 이 비율은 과제 운영 안정성과 직접 연결됩니다.`);
  }

  if (seniorCount > 0) {
    comments.push(`부장 이상 리더/상위 직급 인력은 <strong>${seniorCount}명</strong>으로, 연구 방향성 관리와 후배 인력 육성의 핵심 축입니다.`);
  }

  if (topTeam) {
    comments.push(`팀별로는 <strong>${escapeAnalysisHtml(topTeam[0])}</strong> 인원이 <strong>${topTeam[1]}명</strong>으로 가장 많습니다.`);
  }

  if (latestYear) {
    comments.push(`가장 최근 발령연도는 <strong>${latestYear}년</strong>이며, 최신 유입 인력부터 과거 발령 인력까지 연도별 흐름을 확인할 수 있습니다.`);
  }

  el.innerHTML = comments.map(text => `<p>${text}</p>`).join("");
}

function getDynamicTenureGroups(rows) {
  const yearsList = rows
    .map(row => getTenureYears(row.lab_assign_date || row.hire_date))
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

  const referenceDate = getReferenceDate();
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

function escapeAnalysisHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
