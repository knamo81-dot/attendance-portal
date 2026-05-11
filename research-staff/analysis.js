function renderAnalysis() {
  const rows = getReferenceFilteredRows(AppState.merged).filter(row => isResearchStaffRow(row));
  renderTeamBars(rows);
  renderAnalysisComment(rows);
}

function renderTeamBars(rows) {
  const container = document.getElementById("teamBars");
  if (!container) return;

  const map = new Map();

  rows.forEach(row => {
    const key = row.team || row.department || "미지정";
    map.set(key, (map.get(key) || 0) + 1);
  });

  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, count]) => count));

  if (!entries.length) {
    container.innerHTML = `<div class="empty">표시할 데이터가 없습니다.</div>`;
    return;
  }

  container.innerHTML = entries.map(([name, count]) => `
    <div class="bar-row">
      <span>${name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <strong>${count}명</strong>
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

  el.innerHTML = `
    <p>현재 연구개발인력은 총 <strong>${total}명</strong>입니다.</p>
    <p>전담요원은 <strong>${dedicated}명</strong>으로 전체의 <strong>${pct(dedicated, total)}</strong>입니다.</p>
    <p>여성 연구인력은 <strong>${female}명</strong>이며, 여성 비율은 <strong>${pct(female, total)}</strong>입니다.</p>
    <p>석사 이상 인력은 <strong>${masterPlus}명</strong>으로 전체의 <strong>${pct(masterPlus, total)}</strong>입니다.</p>
  `;
}
