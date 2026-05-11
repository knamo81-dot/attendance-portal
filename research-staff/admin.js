function renderAdmin() {
  const tbody = document.getElementById("adminTableBody");
  if (!tbody) return;

  const keyword = (document.getElementById("adminSearch")?.value || "").trim().toLowerCase();

  const baseRows = typeof getAdminRows === "function" ? getAdminRows() : AppState.merged;
  const filteredRows = baseRows.filter(row => {
    if (!keyword) return true;
    const displayStatus = typeof getAdminDisplayStatus === "function" ? getAdminDisplayStatus(row) : row.status;
    return [
      row.name,
      row.department,
      row.team,
      row.position,
      row.employee_no,
      displayStatus
    ].some(value => String(value || "").toLowerCase().includes(keyword));
  });

  const rows = sortStaffRows(filteredRows);
  const canEdit = canEditAdminList();

  const countEl = document.getElementById("adminListCount");
  if (countEl) {
    const totalCount = baseRows.length;
    const filteredCount = rows.length;
    countEl.innerHTML = keyword
      ? `검색 ${filteredCount.toLocaleString()}명 <span>/ 전체 ${totalCount.toLocaleString()}명</span>`
      : `전체 ${totalCount.toLocaleString()}명`;
  }

  tbody.innerHTML = rows.map((row, index) => renderAdminRow(row, index, canEdit)).join("");

  updateAdminEditMode(canEdit);
  bindAdminInputs(canEdit);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("adminSearch")?.addEventListener("input", renderAdmin);
  document.getElementById("saveAllBtn")?.addEventListener("click", saveAllProfiles);
});

function canEditAdminList() {
  if (typeof canEditOperatingStaffList === "function") return canEditOperatingStaffList();
  return Boolean(AppState?.isAdmin);
}

function updateAdminEditMode(canEdit) {
  const view = document.getElementById("view-admin");
  const saveBtn = document.getElementById("saveAllBtn");
  const tableBody = document.getElementById("adminTableBody");

  view?.classList.toggle("admin-readonly", !canEdit);
  tableBody?.classList.toggle("admin-readonly-body", !canEdit);

  if (saveBtn) {
    saveBtn.hidden = !canEdit;
    saveBtn.disabled = !canEdit;
  }

  let badge = document.getElementById("adminReadonlyBadge");
  const actions = document.querySelector("#view-admin .admin-actions");

  if (!badge && actions) {
    badge = document.createElement("span");
    badge.id = "adminReadonlyBadge";
    badge.className = "readonly-badge";
    actions.prepend(badge);
  }

  if (badge) {
    badge.textContent = canEdit ? "관리자 수정 가능" : "조회 전용";
    badge.hidden = canEdit;
  }
}

function renderAdminRow(row, index, canEdit = true) {
  const employeeNo = escapeHtml(row.employee_no || "");
  const displayStatus = typeof getAdminDisplayStatus === "function" ? getAdminDisplayStatus(row) : (row.status || "");
  const isLeaveRow = typeof isAdminLeaveRow === "function" ? isAdminLeaveRow(row) : false;
  const rowClass = isLeaveRow ? "leave-row" : "";
  const disabledAttr = canEdit ? "" : " disabled";

  return `
    <tr class="${rowClass}" data-employee-no="${employeeNo}">
      <td class="admin-row-no">${index + 1}</td>
      <td class="admin-employee-no">${employeeNo}</td>
      <td>${escapeHtml(row.name || "")}</td>
      <td>${escapeHtml(row.department || "")}</td>
      <td>${escapeHtml(row.team || "")}</td>
      <td>${escapeHtml(row.position || "")}</td>
      <td class="status-cell">${formatAdminStatus(displayStatus)}</td>
      <td>
        <select data-field="research_type"${disabledAttr}>
          ${option("", "선택", row.research_type)}
          ${option("전담요원", "전담요원", row.research_type)}
          ${option("보조원", "보조원", row.research_type)}
          ${option("관리직원", "관리직원", row.research_type)}
        </select>
      </td>
      <td>
        <select data-field="gender"${disabledAttr}>
          ${option("", "선택", row.gender)}
          ${option("남", "남", row.gender)}
          ${option("여", "여", row.gender)}
        </select>
      </td>
      <td><input type="date" data-field="birth_date" value="${row.birth_date || ""}"${disabledAttr}></td>
      <td><input type="date" data-field="lab_assign_date" value="${row.lab_assign_date || ""}"${disabledAttr}></td>
      <td>
        <select data-field="degree"${disabledAttr}>
          ${option("", "선택", row.degree)}
          ${option("박사", "박사", row.degree)}
          ${option("석사", "석사", row.degree)}
          ${option("학사", "학사", row.degree)}
          ${option("전문학사", "전문학사", row.degree)}
          ${option("기타", "기타", row.degree)}
        </select>
      </td>
      <td><input type="text" data-field="remarks" value="${escapeHtml(row.remarks || "")}" placeholder="비고"${disabledAttr}></td>
    </tr>
  `;
}

function bindAdminInputs(canEdit = true) {
  if (!canEdit) return;

  document.querySelectorAll("#adminTableBody input, #adminTableBody select").forEach(input => {
    input.addEventListener("change", event => {
      const tr = event.target.closest("tr");
      if (tr) tr.classList.add("edited");
    });
  });
}

async function saveAllProfiles() {
  if (!canEditAdminList()) {
    alert("관리자만 수정할 수 있습니다.");
    return;
  }

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

    payload.is_research_staff = true;
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


function formatAdminStatus(value) {
  const status = String(value || "").trim();

  if (status === "가족돌봄휴직") {
    return '<span class="status-text">가족돌봄<br>휴직</span>';
  }

  return `<span class="status-text">${escapeHtml(status)}</span>`;
}
