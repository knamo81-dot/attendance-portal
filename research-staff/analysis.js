const POSITION_ORDER = ["사원", "주임", "대리", "과장", "차장", "부장", "이사부장", "이사", "전무"];
const TENURE_GROUPS = ["1년 미만", "1~3년", "3~5년", "5~10년", "10년 이상", "미입력"];

function renderAnalysis() {
  const rows = getReferenceFilteredRows(AppState.merged).filter(row => isResearchStaffRow(row));

  renderTenureBars(rows);
  renderPositionBars(rows);
  renderTeamBars(rows);
  renderAssignYearBars(rows);
  renderAnalysisComment(rows);
}

function renderTenureBars(rows) {
  const entries = TENURE_GROUPS.map(group => [
    group,
    rows.filter(row => getTenureGroup(row.lab_assign_date || row.hire_date) === group).length
  ]);

  renderAnalysisBars("tenureBars", entries, rows.length);
}

function renderPositionBars(rows) {
  const map = new Map(POSITION_ORDER.map(position => [position, 0]));
  const extra = new Map();

  rows.forEach(row => {
    const position = normalizePosition(row.position);
    if (!position) {
      extra.set("미지정", (extra.get("미지정") || 0) + 1);
      return;
    }

    if (map.has(position)) {
      map.set(position, map.get(position) + 1);
    } else {
      extra.set(position, (extra.get(position) || 0) + 1);
    }
  });

  const ordered = [...map.entries()].filter(([, count]) => count > 0);
  const extras = [...extra.entries()].sort((a, b) => b[1] - a[1]);
  renderAnalysisBars("positionBars", [...ordered, ...extras], rows.length);
}

function renderTeamBars(rows) {
  const map = new Map();

  rows.forEach(row => {
    const key = row.team || row.department || "미지정";
    map.set(key, (map.get(key) || 0) + 1);
  });

  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
  renderAnalysisBars("teamBars", entries, rows.length);
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
    return Number(a[0]) - Number(b[0]);
  });

  renderAnalysisBars("assignYearBars", entries, rows.length);
}

function renderAnalysisBars(containerId, entries, total) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const filtered = entries.filter(([, count]) => count > 0);
  const max = Math.max(1, ...filtered.map(([, count]) => count));

  if (!filtered.length) {
    container.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = filtered.map(([name, count]) => `
    <div class="bar-row analysis-bar-row">
      <span title="${escapeAnalysisHtml(name)}">${escapeAnalysisHtml(name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <strong>${count}명 <em>${pct(count, total)}</em></strong>
    </div>
  `).join("");
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

  const tenureCounts = TENURE_GROUPS.map(group => ({
    group,
    count: rows.filter(row => getTenureGroup(row.lab_assign_date || row.hire_date) === group).length
  }));
  const topTenure = tenureCounts
    .filter(item => item.group !== "미입력")
    .sort((a, b) => b.count - a.count)[0];

  const positionCounts = POSITION_ORDER.map(position => ({
    position,
    count: rows.filter(row => normalizePosition(row.position) === position).length
  })).filter(item => item.count > 0);

  const corePositions = ["대리", "과장", "차장"];
  const coreCount = rows.filter(row => corePositions.includes(normalizePosition(row.position))).length;
  const seniorCount = rows.filter(row => ["부장", "이사부장", "이사", "전무"].includes(normalizePosition(row.position))).length;

  const teamMap = new Map();
  rows.forEach(row => {
    const key = row.team || row.department || "미지정";
    teamMap.set(key, (teamMap.get(key) || 0) + 1);
  });
  const topTeam = [...teamMap.entries()].sort((a, b) => b[1] - a[1])[0];

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

  el.innerHTML = comments.map(text => `<p>${text}</p>`).join("");
}

function getTenureGroup(dateValue) {
  const startDate = parseDateOnly(dateValue);
  if (!startDate) return "미입력";

  const referenceDate = getReferenceDate();
  let months = (referenceDate.getFullYear() - startDate.getFullYear()) * 12;
  months += referenceDate.getMonth() - startDate.getMonth();
  if (referenceDate.getDate() < startDate.getDate()) months -= 1;
  if (months < 0) return "미입력";

  const years = months / 12;
  if (years < 1) return "1년 미만";
  if (years < 3) return "1~3년";
  if (years < 5) return "3~5년";
  if (years < 10) return "5~10년";
  return "10년 이상";
}

function normalizePosition(positionValue) {
  const text = String(positionValue || "").trim();
  if (!text) return "";

  const normalized = text.replace(/\s+/g, "");
  const ordered = [...POSITION_ORDER].sort((a, b) => b.length - a.length);
  const found = ordered.find(position => normalized.includes(position));
  return found || text;
}

function escapeAnalysisHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

