const POSITION_ORDER = ["사원", "주임", "대리", "과장", "차장", "부장", "이사부장", "이사", "전무"];
const LOWER_TENURE_GROUPS = ["3~5년", "1~3년", "1년 미만"];

function getLatestAnalysisRows() {
  const source = Array.isArray(AppState?.merged) ? AppState.merged : [];
  return source
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
  return source.filter(row => typeof isResearchStaffRow === "function" ? isResearchStaffRow(row) : true);
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
  const height = 300;
  const padding = { top: 26, right: 24, bottom: 46, left: 44 };
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
          <text x="${x(index)}" y="${height - 17}" text-anchor="middle" class="trend-month-label">${escapeAnalysisHtml(item.shortLabel)}</text>
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
}
