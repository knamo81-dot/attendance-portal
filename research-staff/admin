function renderAdmin() {
  const tbody = document.getElementById("adminTableBody");
  if (!tbody) return;

  const keyword = (document.getElementById("adminSearch")?.value || "").trim().toLowerCase();

  const rows = AppState.merged.filter(row => {
    if (!keyword) return true;
    return [
      row.name,
      row.department,
      row.team,
      row.position,
      row.employee_no
    ].some(value => String(value || "").toLowerCase().includes(keyword));
  });

  tbody.innerHTML = rows.map(row => renderAdminRow(row)).join("");

  bindAdminInputs();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("adminSearch")?.addEventListener("input", renderAdmin);
  document.getElementById("saveAllBtn")?.addEventListener("click", saveAllProfiles);
});

function renderAdminRow(row) {
  const employeeNo = escapeHtml(row.employee_no || "");

  return `
    <tr data-employee-no="${employeeNo}">
      <td><input type="checkbox" data-field="is_research_staff" ${row.is_research_staff ? "checked" : ""}></td>
      <td>${employeeNo}</td>
      <td>${escapeHtml(row.name || "")}</td>
      <td>${escapeHtml(row.department || "")}</td>
      <td>${escapeHtml(row.team || "")}</td>
      <td>${escapeHtml(row.position || "")}</td>
      <td>${escapeHtml(row.status || "")}</td>
      <td>
        <select data-field="research_type">
          ${option("", "선택", row.research_type)}
          ${option("전담요원", "전담요원", row.research_type)}
          ${option("보조원", "보조원", row.research_type)}
          ${option("관리직원", "관리직원", row.research_type)}
        </select>
      </td>
      <td>
        <select data-field="gender">
          ${option("", "선택", row.gender)}
          ${option("남", "남", row.gender)}
          ${option("여", "여", row.gender)}
        </select>
      </td>
      <td><input type="date" data-field="birth_date" value="${row.birth_date || ""}"></td>
      <td><input type="date" data-field="lab_assign_date" value="${row.lab_assign_date || ""}"></td>
      <td>
        <select data-field="degree">
          ${option("", "선택", row.degree)}
          ${option("박사", "박사", row.degree)}
          ${option("석사", "석사", row.degree)}
          ${option("학사", "학사", row.degree)}
          ${option("전문학사", "전문학사", row.degree)}
          ${option("기타", "기타", row.degree)}
        </select>
      </td>
      <td><input type="text" data-field="remarks" value="${escapeHtml(row.remarks || "")}" placeholder="비고"></td>
    </tr>
  `;
}

function bindAdminInputs() {
  document.querySelectorAll("#adminTableBody input, #adminTableBody select").forEach(input => {
    input.addEventListener("change", event => {
      const tr = event.target.closest("tr");
      if (tr) tr.classList.add("edited");
    });
  });
}

async function saveAllProfiles() {
  const client = getSupabase();

  if (!client) {
    alert("Supabase 연결값을 먼저 설정해주세요.");
    return;
  }

  const editedRows = [...document.querySelectorAll("#adminTableBody tr.edited")];

  if (!editedRows.length) {
    alert("변경된 내용이 없습니다.");
    return;
  }

  const payloads = editedRows.map(tr => {
    const employeeNo = tr.dataset.employeeNo;
    const payload = { employee_no: employeeNo };

    tr.querySelectorAll("[data-field]").forEach(input => {
      const field = input.dataset.field;
      payload[field] = input.type === "checkbox" ? input.checked : input.value || null;
    });

    payload.updated_at = new Date().toISOString();
    return payload;
  });

  try {
    const { error } = await client
      .from("research_staff_profiles")
      .upsert(payloads, { onConflict: "employee_no" });

    if (error) throw error;

    alert("저장되었습니다.");
    await loadAllData();
  } catch (error) {
    console.error(error);
    alert(`저장 실패: ${error.message || error}`);
  }
}

function option(value, label, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
