(() => {
  "use strict";
  const db = window.SDSApp?.db;
  if (!db) {
    alert("Supabase 연결을 확인할 수 없습니다.");
    return;
  }

  const $ = (id) => document.getElementById(id);
  let rows = [];

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function stateOf(row) {
    const today = todayISO();
    if (row.effective_from && today < row.effective_from) return "scheduled";
    if (row.effective_to) {
      if (today >= row.effective_to) return "ended";
      return "ending";
    }
    return "active";
  }

  const stateLabel = { active:"적용중", scheduled:"적용예정", ending:"제외예정", ended:"제외" };

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function thresholdText(r) {
    if (r.threshold_value === null || r.threshold_value === undefined || r.threshold_value === "") return "-";
    return `${r.threshold_value}${esc(r.threshold_unit || "%")} ${esc(r.threshold_basis || "")} 이상`.trim();
  }

  function filtered(searchId, statusId) {
    const q = ($(searchId)?.value || "").trim().toLowerCase();
    const status = $(statusId)?.value || "all";
    return rows.filter(r => {
      const text = `${r.name_ko||""} ${r.name_en||""} ${r.cas_no||""}`.toLowerCase();
      return (!q || text.includes(q)) && (status === "all" || stateOf(r) === status);
    });
  }

  function badge(r) {
    const s = stateOf(r);
    return `<span class="badge ${s}">${stateLabel[s]}</span>`;
  }

  function renderSummary() {
    $("totalCount").textContent = `${rows.length}종`;
    $("activeCount").textContent = `${rows.filter(r=>stateOf(r)==="active").length}종`;
    $("scheduledCount").textContent = `${rows.filter(r=>stateOf(r)==="scheduled").length}종`;
    $("endedCount").textContent = `${rows.filter(r=>["ending","ended"].includes(stateOf(r))).length}종`;
  }

  function renderStatus() {
    const list = filtered("statusSearch","statusFilter");
    $("statusList").innerHTML = list.length ? list.map(r => `
      <tr>
        <td class="strong">${esc(r.name_ko)}</td>
        <td>${esc(r.name_en || "-")}</td>
        <td>${esc(r.cas_no || "-")}</td>
        <td>${thresholdText(r)}</td>
        <td>${esc(r.effective_from || "-")}</td>
        <td>${badge(r)}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">등록된 특별관리물질이 없습니다.</td></tr>`;
  }

  function renderMaster() {
    const list = filtered("masterSearch","masterStatus");
    $("masterList").innerHTML = list.length ? list.map(r => `
      <tr>
        <td class="strong">${esc(r.name_ko)}</td>
        <td>${esc(r.name_en || "-")}</td>
        <td>${esc(r.cas_no || "-")}</td>
        <td>${r.match_type === "group" ? "그룹" : "단일"}</td>
        <td>${thresholdText(r)}</td>
        <td>${esc(r.effective_from || "-")}</td>
        <td>${esc(r.effective_to || "-")}</td>
        <td>${badge(r)}</td>
        <td><button class="mini-btn" data-edit="${r.id}" type="button">수정</button></td>
      </tr>`).join("") : `<tr><td colspan="9" class="empty">등록된 특별관리물질이 없습니다.</td></tr>`;
  }

  async function load() {
    setMessage("기준정보를 불러오는 중입니다.");
    const { data, error } = await db.from("qa_special_substances")
      .select("*")
      .order("name_ko", { ascending:true });
    if (error) {
      console.error(error);
      setMessage(`불러오기 실패: ${error.message}`, true);
      return;
    }
    rows = data || [];
    setMessage("");
    renderSummary();
    renderStatus();
    renderMaster();
  }

  function setMessage(msg, error=false) {
    const el = $("message");
    el.textContent = msg || "";
    el.classList.toggle("error", !!error);
  }

  function switchView(view) {
    const master = view === "master";
    $("statusView").hidden = master;
    $("masterView").hidden = !master;
    $("statusViewBtn").classList.toggle("active", !master);
    $("masterViewBtn").classList.toggle("active", master);
    $("pageTitle").textContent = master ? "특별관리물질 기준관리" : "특별관리물질 현황";
    $("pageDesc").textContent = master
      ? "법령 기준 특별관리물질의 등록·수정 및 제외 정보를 관리합니다."
      : "특별관리물질 기준정보와 제품 연계 현황을 관리합니다.";
  }

  function openModal(row=null) {
    $("editForm").reset();
    $("thresholdUnit").value = "%";
    $("thresholdBasis").value = "중량비율";
    $("matchType").value = "single";
    $("editId").value = row?.id || "";
    $("nameKo").value = row?.name_ko || "";
    $("nameEn").value = row?.name_en || "";
    $("casNo").value = row?.cas_no || "";
    $("matchType").value = row?.match_type || "single";
    $("thresholdValue").value = row?.threshold_value ?? "";
    $("thresholdUnit").value = row?.threshold_unit || "%";
    $("thresholdBasis").value = row?.threshold_basis || "중량비율";
    $("effectiveFrom").value = row?.effective_from || "";
    $("effectiveTo").value = row?.effective_to || "";
    $("note").value = row?.note || "";
    $("modalTitle").textContent = row ? "특별관리물질 수정" : "특별관리물질 신규 입력";
    $("editModal").hidden = false;
  }

  function closeModal() { $("editModal").hidden = true; }

  async function save(e) {
    e.preventDefault();
    const id = $("editId").value;
    const payload = {
      name_ko: $("nameKo").value.trim(),
      name_en: $("nameEn").value.trim() || null,
      cas_no: $("casNo").value.trim() || null,
      match_type: $("matchType").value,
      threshold_value: $("thresholdValue").value === "" ? null : Number($("thresholdValue").value),
      threshold_unit: $("thresholdUnit").value.trim() || "%",
      threshold_basis: $("thresholdBasis").value.trim() || "중량비율",
      effective_from: $("effectiveFrom").value || null,
      effective_to: $("effectiveTo").value || null,
      note: $("note").value.trim() || null
    };

    if (!payload.name_ko) return;
    if (payload.match_type === "single" && !payload.cas_no) {
      alert("단일물질은 CAS No를 입력해 주세요.");
      return;
    }
    if (payload.effective_from && payload.effective_to && payload.effective_to < payload.effective_from) {
      alert("제외일은 시행일보다 빠를 수 없습니다.");
      return;
    }

    const session = window.SDSApp?.getPortalSession?.() || {};
    payload.created_by = id ? undefined : (session.email || session.user?.email || null);
    if (id) delete payload.created_by;

    let result;
    if (id) result = await db.from("qa_special_substances").update(payload).eq("id", id);
    else result = await db.from("qa_special_substances").insert(payload);

    if (result.error) {
      console.error(result.error);
      alert(`저장 실패: ${result.error.message}`);
      return;
    }
    closeModal();
    await load();
  }

  $("statusViewBtn").addEventListener("click", ()=>switchView("status"));
  $("masterViewBtn").addEventListener("click", ()=>switchView("master"));
  $("newBtn").addEventListener("click", ()=>openModal());
  $("closeModal").addEventListener("click", closeModal);
  $("cancelBtn").addEventListener("click", closeModal);
  $("editModal").addEventListener("click", e => { if (e.target === $("editModal")) closeModal(); });
  $("editForm").addEventListener("submit", save);
  ["statusSearch","statusFilter"].forEach(id => $(id).addEventListener("input", renderStatus));
  ["masterSearch","masterStatus"].forEach(id => $(id).addEventListener("input", renderMaster));
  $("masterList").addEventListener("click", e => {
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    const row = rows.find(r => String(r.id) === btn.dataset.edit);
    if (row) openModal(row);
  });

  switchView("status");
  load();
})();
