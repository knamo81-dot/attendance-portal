const RESEARCH_TYPES = ["전담요원", "보조원", "관리직원"];
const DEGREES = ["박사", "석사", "학사", "전문학사", "기타"];
const AGE_GROUPS = ["20대", "30대", "40대", "50대+"];

function renderDashboard() {
  const rows = getResearchRows();

  renderSummaryCards(rows);
  renderResearchTypeTable(rows);
  renderDegreeTable(rows);
  renderAgeTable(rows);
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
}
