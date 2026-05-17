/* ===== extracted inline script #5 (inline) ===== */

(function(){
  const SUPABASE_URL = 'https://mbqpsovlwvedwrtbbauj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY';

  const hasConfig = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');
  if(!window.__attendanceSupabaseClient && window.supabase && hasConfig){
    window.__attendanceSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  const supabaseClient = window.__attendanceSupabaseClient || null;

  let syncChain = Promise.resolve();
  let fallbackWarned = false;

  function dbError(prefix, error){
    console.error(prefix, error);
    const detail = error?.message || error?.details || error?.hint || '';
    alert(prefix + (detail ? '\n' + detail : ''));
  }
  function queueSync(job, prefix){
    if(!supabaseClient) return Promise.resolve();
    syncChain = syncChain.then(job).catch(err => dbError(prefix, err));
    return syncChain;
  }
  function notifyFallback(){
    if(supabaseClient || fallbackWarned) return;
    fallbackWarned = true;
    console.warn('Supabase URL/ANON KEY가 비어 있어 localStorage 모드로 동작합니다.');
  }
  function normalizeManagedRows(rows){
    const map = new Map();
    (rows || []).forEach(row => {
      const empNo = String(row.manager_employee_no || '').trim();
      const teamCode = String(row.team_code || '').trim();
      if(!empNo || !teamCode) return;
      if(!map.has(empNo)) map.set(empNo, []);
      map.get(empNo).push(teamCode);
    });
    return map;
  }

  async function fetchAllAttendanceRecordsFromSupabase(){
    if(!supabaseClient) return [];

    // Supabase select()는 기본 응답 행 수 제한이 있어 여러 달 누적 시 일부 월이 잘릴 수 있습니다.
    // 1,000건 단위로 끝까지 가져와 선택 월 계산이 항상 전체 records 기준으로 되게 합니다.
    const pageSize = 1000;
    let from = 0;
    const allRows = [];

    while(true){
      const to = from + pageSize - 1;
      const { data, error } = await supabaseClient
        .from('attendance_records')
        .select('*')
        .order('work_date', { ascending: true })
        .order('employee_no', { ascending: true })
        .range(from, to);

      if(error) throw error;

      const pageRows = Array.isArray(data) ? data : [];
      allRows.push(...pageRows);

      if(pageRows.length < pageSize) break;
      from += pageSize;
    }

    return allRows;
  }

  async function loadAttendanceFromSupabase(){
    if(!supabaseClient){
      resetAttendanceClientState();
      HOLIDAY_DATE_SET = buildHolidayDateSet();
      return;
    }

    const data = await fetchAllAttendanceRecordsFromSupabase();

    if(Array.isArray(data) && data.length){
      REAL_ATTENDANCE_DATA = data.map(row => ({
        recordId: String(row.id || '').trim(),
        date: String(row.work_date || '').trim(),
        employeeId: String(row.employee_no || '').trim(),
        name: normalizeEmployeeName(row.employee_name || ''),
        division: String(row.division_name || '').trim(),
        team: String(row.team_name || '').trim(),
        start: String(row.clock_in || '').trim(),
        end: String(row.clock_out || '').trim(),
        workHours: row.work_hours == null ? '' : String(row.work_hours),
        realWorkHours: row.work_hours == null ? '' : String(row.work_hours),
        erpActualOvertime: Number(row.overtime_hours || 0),
        erpAppliedOvertime: 0,
        erpReason: String(row.reason || '').trim(),
        reason: String(row.reason || '').trim(),
        overtimeCheck: String(row.overtime_check_result || row.overtime_check || '').trim(),
        overtimeCheckResult: String(row.overtime_check_result || '').trim(),
        overtime_check_result: String(row.overtime_check_result || '').trim(),
        approvedOvertimeDisplay: String(row.approved_overtime_override || '').trim(),
        approved_overtime_override: String(row.approved_overtime_override || '').trim(),
        absenceDecision: String(row.absence_decision || '').trim(),
        absence_decision: String(row.absence_decision || '').trim(),
        status: String(row.status || '').trim(),
        grade: ''
      }));
      try{ localStorage.setItem(ATTENDANCE_UPLOAD_STORAGE_KEY, JSON.stringify(REAL_ATTENDANCE_DATA || [])); }catch(e){}
      HOLIDAY_DATE_SET = buildHolidayDateSet();
      return;
    }

    resetAttendanceClientState();
    HOLIDAY_DATE_SET = buildHolidayDateSet();
  }

  window.fetchAllAttendanceRecordsFromSupabase = fetchAllAttendanceRecordsFromSupabase;
  window.loadAttendanceFromSupabase = loadAttendanceFromSupabase;

  async function saveOrgMasterToSupabase(sourceOrgMaster){
    const orgRows = normalizeOrgMaster(sourceOrgMaster || orgMaster);
    const divisions = orgRows.map(div => ({
      division_code: String(div.divisionCode || '').trim(),
      division_name: String(div.divisionName || '').trim(),
      is_active: div.active !== false
    })).filter(x => x.division_code && x.division_name);

    const teams = orgRows.flatMap(div => (div.teams || []).map(team => ({
      division_code: String(div.divisionCode || '').trim(),
      team_code: String(team.teamCode || '').trim(),
      team_name: String(team.teamName || '').trim(),
      is_active: team.active !== false
    }))).filter(x => x.division_code && x.team_code && x.team_name);

    if(divisions.length){
      const { error } = await supabaseClient.from('divisions').upsert(divisions, { onConflict: 'division_code' });
      if(error) throw error;
    }
    if(teams.length){
      const { error } = await supabaseClient.from('teams').upsert(teams, { onConflict: 'team_code' });
      if(error) throw error;
    }
  }

  async function saveEmpMasterToSupabase(sourceEmpMaster){
    const source = Array.isArray(sourceEmpMaster) ? sourceEmpMaster : empMaster;
    const employees = source.map(migrateEmployeeRecord).map(emp => ({
      employee_no: String(emp.id || '').trim(),
      name: normalizeEmployeeName(emp.name),
      division_code: String(emp.divisionCode || '').trim(),
      team_code: String(emp.teamCode || '').trim(),
      sort_order: Number.isFinite(Number(emp.sortOrder)) ? Number(emp.sortOrder) : 0,
      grade: String(emp.grade || '').trim(),
      authority: String(emp.authority || '').trim(),
      email: String(emp.email || '').trim() || null,
      attendance_target: String(emp.attendanceTarget || 'Y') === 'Y',
      status: String(emp.status || '재직').trim(),
      join_date: emp.joinDate || null,
      leave_date: emp.leaveDate || null,
      memo: String(emp.memo || '').trim() || null
    })).filter(x => x.employee_no && x.name && x.division_code && x.team_code);

    if(employees.length){
      const { error } = await supabaseClient.from('employees').upsert(employees, { onConflict: 'employee_no' });
      if(error) throw error;
    }

    const managedRows = source
      .map(migrateEmployeeRecord)
      .filter(emp => String(emp.authority || '').trim() === '담당')
      .flatMap(emp => normalizeManagedTeams(emp.managedTeams, emp.teamCode).map(teamCode => ({
        manager_employee_no: String(emp.id || '').trim(),
        team_code: String(teamCode || '').trim()
      })))
      .filter(x => x.manager_employee_no && x.team_code);

    const { error: deleteError } = await supabaseClient.from('managed_teams').delete().neq('manager_employee_no', '');
    if(deleteError) throw deleteError;
    if(managedRows.length){
      const { error } = await supabaseClient.from('managed_teams').insert(managedRows);
      if(error) throw error;
    }
  }

  async function ensureSeeds(){
    // 포털 DB를 마스터로 사용한다. 근태 파일에서 기본 조직/사원 데이터를 자동 생성하지 않는다.
    return;
  }


  const originalRender = window.render;

  window.loadOrgMaster = async function(){
    if(!supabaseClient){
      throw new Error('포털 DB(Supabase) 연결이 필요합니다.');
    }

    const { data: divisions, error: divError } = await supabaseClient
      .from('divisions')
      .select('*')
      .order('division_code', { ascending: true });
    if(divError) throw divError;

    const { data: teams, error: teamError } = await supabaseClient
      .from('teams')
      .select('*')
      .order('team_code', { ascending: true });
    if(teamError) throw teamError;

    orgMaster = (divisions || []).map(div => ({
      divisionCode: String(div.division_code || '').trim(),
      divisionName: String(div.division_name || '').trim(),
      active: div.is_active !== false,
      teams: (teams || [])
        .filter(team => String(team.division_code || '').trim() === String(div.division_code || '').trim())
        .map(team => ({
          teamCode: String(team.team_code || '').trim(),
          teamName: String(team.team_name || '').trim(),
          active: team.is_active !== false
        }))
    }));
  };

  window.saveOrgMaster = function(){
    if(!supabaseClient){
      return Promise.reject(new Error('포털 DB(Supabase) 연결이 필요합니다.'));
    }
    return queueSync(() => saveOrgMasterToSupabase(orgMaster), '조직정보 Supabase 저장 중 오류가 발생했습니다.');
  };

  window.loadEmpMaster = async function(){
    if(!supabaseClient){
      throw new Error('포털 DB(Supabase) 연결이 필요합니다.');
    }

    const { data: employees, error: empError } = await supabaseClient
      .from('employees')
      .select('*')
      .order('division_code', { ascending: true })
      .order('team_code', { ascending: true })
      .order('sort_order', { ascending: true });
    if(empError) throw empError;

    const { data: managedRows, error: managedError } = await supabaseClient
      .from('managed_teams')
      .select('*');
    if(managedError) throw managedError;

    const managedMap = new Map();
    (managedRows || []).forEach(row => {
      const no = String(row.manager_employee_no || '').trim();
      const teamCode = String(row.team_code || '').trim();
      if(!no || !teamCode) return;
      if(!managedMap.has(no)) managedMap.set(no, []);
      managedMap.get(no).push(teamCode);
    });

    empMaster = (employees || []).map(emp => ({
      id: String(emp.employee_no || '').trim(),
      name: normalizeEmployeeName(emp.name),
      divisionCode: String(emp.division_code || '').trim(),
      division: getDivisionNameByCode(String(emp.division_code || '').trim()),
      teamCode: String(emp.team_code || '').trim(),
      team: getTeamNameByCode(String(emp.division_code || '').trim(), String(emp.team_code || '').trim()),
      sortOrder: Number.isFinite(Number(emp.sort_order)) ? Number(emp.sort_order) : 0,
      grade: String(emp.grade || '').trim(),
      authority: String(emp.authority || '').trim() || '팀원',
      managedTeams: normalizeManagedTeams(managedMap.get(String(emp.employee_no || '').trim()) || [], String(emp.team_code || '').trim()),
      attendanceTarget: emp.attendance_target === false ? 'N' : 'Y',
      status: String(emp.status || '재직').trim(),
      joinDate: emp.join_date || '',
      leaveDate: emp.leave_date || '',
      retireReason: String(emp.leave_reason || '').trim(),
      email: String(emp.email || '').replace(/​/g,'').trim(),
      memo: String(emp.memo || '').trim()
    }));
  };

  window.saveEmpMaster = function(){
    if(!supabaseClient){
      return Promise.reject(new Error('포털 DB(Supabase) 연결이 필요합니다.'));
    }
    return queueSync(() => saveEmpMasterToSupabase(empMaster), '사원정보 Supabase 저장 중 오류가 발생했습니다.');
  };

  window.saveEmpForm = function(){
    const data = validateEmpForm();
    if(!data) return;
    if(empEditMode){
      const idx = empMaster.findIndex(x=>x.id===empEditingId);
      if(idx >= 0) empMaster[idx] = data;
    }else{
      empMaster.push(data);
    }
    saveEmpMaster().finally(() => {
      closeEmpModal();
            });
  };

  window.empRetire = function(id){
    const emp = empMaster.find(x=>x.id===id);
    if(!emp) return;
    const leaveDate = prompt('퇴사일을 입력하세요. (YYYY-MM-DD)', emp.leaveDate || '');
    if(leaveDate === null) return;
    if(!leaveDate.trim()){
      alert('퇴사일이 필요합니다.');
      return;
    }
    emp.status = '퇴사';
    emp.leaveDate = leaveDate.trim();
  if(!emp.retireReason) emp.retireReason = '기타';
    saveEmpMaster().finally(() => {
            });
  };

  window.empRestore = function(id){
    const emp = empMaster.find(x=>x.id===id);
    if(!emp) return;
    emp.status = '재직';
    emp.leaveDate = '';
  emp.retireReason = '';
    saveEmpMaster().finally(() => {
            });
  };


  const KPI_LAYOUT_KEY = 'dashboard_kpi_layout_v3_slots';
  const KPI_SLOT_COUNT = 19;

  function getKpiContainer(){
    return document.getElementById('dashboardKpis');
  }

  function getKpiCards(){
    const container = getKpiContainer();
    return container ? [...container.querySelectorAll('[data-kpi-card]')] : [];
  }

  function createKpiSlots(){
    const container = getKpiContainer();
    if(!container || container.dataset.slotReady === 'Y') return;

    const cards = getKpiCards();
    container.innerHTML = '';

    for(let i = 0; i < KPI_SLOT_COUNT; i += 1){
      const slot = document.createElement('div');
      slot.className = 'kpi-slot empty';
      slot.setAttribute('data-kpi-slot', String(i + 1));
      container.appendChild(slot);
    }

    const slots = [...container.querySelectorAll('.kpi-slot')];
    cards.forEach((card, idx) => {
      if(slots[idx]) slots[idx].appendChild(card);
    });

    container.dataset.slotReady = 'Y';
    refreshKpiSlotState();
  }

  function refreshKpiSlotState(){
    const container = getKpiContainer();
    if(!container) return;
    container.querySelectorAll('.kpi-slot').forEach(slot => {
      const hasCard = !!slot.querySelector('[data-kpi-card]');
      slot.classList.toggle('empty', !hasCard);
    });
  }

  function saveKpiSlotLayout(){
    const container = getKpiContainer();
    if(!container) return;
    const layout = [...container.querySelectorAll('.kpi-slot')].map(slot => {
      const card = slot.querySelector('[data-kpi-card]');
      return card ? card.getAttribute('data-kpi-card') : null;
    });
    localStorage.setItem(KPI_LAYOUT_KEY, JSON.stringify(layout));
  }

  function applySavedKpiSlotLayout(){
    const container = getKpiContainer();
    if(!container) return;

    let savedLayout = [];
    try{
      savedLayout = JSON.parse(localStorage.getItem(KPI_LAYOUT_KEY) || '[]');
    }catch(e){
      savedLayout = [];
    }

    const slots = [...container.querySelectorAll('.kpi-slot')];
    if(!Array.isArray(savedLayout) || !savedLayout.length || !slots.length) {
      refreshKpiSlotState();
      return;
    }

    const cardMap = new Map(getKpiCards().map(card => [card.getAttribute('data-kpi-card'), card]));
    const usedIds = new Set();

    slots.forEach((slot, idx) => {
      const id = savedLayout[idx];
      if(!id) return;
      const card = cardMap.get(id);
      if(card){
        slot.appendChild(card);
        usedIds.add(id);
      }
    });

    const remainingCards = getKpiCards().filter(card => !usedIds.has(card.getAttribute('data-kpi-card')));
    const emptySlots = slots.filter(slot => !slot.querySelector('[data-kpi-card]'));
    remainingCards.forEach((card, idx) => {
      if(emptySlots[idx]) emptySlots[idx].appendChild(card);
    });

    refreshKpiSlotState();
  }

  function setupKpiCardDragging(){
    const container = getKpiContainer();
    if(!container || container.dataset.dragReady === 'Y') return;

    let draggingCard = null;
    let originSlot = null;

    getKpiCards().forEach(card => {
      card.setAttribute('draggable', 'true');

      card.addEventListener('dragstart', () => {
        draggingCard = card;
        originSlot = card.parentElement;
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        container.querySelectorAll('.kpi-slot.drag-over').forEach(slot => slot.classList.remove('drag-over'));
        draggingCard = null;
        originSlot = null;
        refreshKpiSlotState();
        saveKpiSlotLayout();
      });
    });

    container.querySelectorAll('.kpi-slot').forEach(slot => {
      slot.addEventListener('dragover', e => {
        e.preventDefault();
        if(!draggingCard) return;
        container.querySelectorAll('.kpi-slot.drag-over').forEach(el => { if(el !== slot) el.classList.remove('drag-over'); });
        slot.classList.add('drag-over');
      });

      slot.addEventListener('dragleave', e => {
        if(e.relatedTarget && slot.contains(e.relatedTarget)) return;
        slot.classList.remove('drag-over');
      });

      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        if(!draggingCard) return;

        const targetCard = slot.querySelector('[data-kpi-card]');
        if(targetCard && originSlot && originSlot !== slot){
          originSlot.appendChild(targetCard);
        }
        if(originSlot === slot) return;
        slot.appendChild(draggingCard);
        refreshKpiSlotState();
        saveKpiSlotLayout();
      });
    });

    container.dataset.dragReady = 'Y';
  }

  function initKpiCardLayout(){
    createKpiSlots();
    applySavedKpiSlotLayout();
    setupKpiCardDragging();
    refreshKpiSlotState();
  }

  function syncFloatingFilterOptions(){
    const pairs = [
      ['period','stickyPeriod'],
      ['division','stickyDivision'],
      ['team','stickyTeam']
    ];
    pairs.forEach(([sourceId,targetId]) => {
      const source = document.getElementById(sourceId);
      const target = document.getElementById(targetId);
      if(!source || !target) return;
      const sourceHtml = source.innerHTML || '';
      if(target.innerHTML !== sourceHtml) target.innerHTML = sourceHtml;
      target.value = source.value || '';
      if(target.value !== (source.value || '')) target.value = '';
    });
  }

  function bindFloatingFilterEvents(){
    const pairs = [
      ['stickyPeriod','period'],
      ['stickyDivision','division'],
      ['stickyTeam','team']
    ];
    pairs.forEach(([stickyId,sourceId]) => {
      const sticky = document.getElementById(stickyId);
      const source = document.getElementById(sourceId);
      if(!sticky || !source || sticky.dataset.bound === 'Y') return;
      sticky.addEventListener('change', (e) => {
        if(source.value !== e.target.value){
          source.value = e.target.value;
          source.dispatchEvent(new Event('change', { bubbles:true }));
        }
      });
      sticky.dataset.bound = 'Y';
    });
  }

  function updateFloatingFilterVisibility(){
    const hero = document.querySelector('.hero');
    const floating = document.getElementById('floatingFilters');
    if(!hero || !floating) return;
    const heroBottom = hero.getBoundingClientRect().bottom;
    const shouldShow = heroBottom <= 12;

    // 스크롤 고정 필터가 표시되는 순간마다 상단 필터의 최신 옵션/선택값을 다시 동기화
    // - period / division / team 값이 상황에 따라 이전값 또는 기본값으로 보이는 현상 방지
    if(shouldShow && typeof syncFloatingFilterOptions === 'function'){
      syncFloatingFilterOptions();
    }

    floating.classList.toggle('show', shouldShow);
    floating.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  function refreshFloatingFilters(){
    syncFloatingFilterOptions();
    bindFloatingFilterEvents();
    updateFloatingFilterVisibility();
    trendBindPeriodModeButtons();
    trendUpdatePeriodControlVisibility();
  }

  window.addEventListener('scroll', updateFloatingFilterVisibility, { passive:true });
  window.addEventListener('resize', updateFloatingFilterVisibility);

  

const ADMIN_UPLOAD_MANAGEMENT = window.ADMIN_UPLOAD_MANAGEMENT || {
  years: [],
  selectedYear: null,
  monthStats: [],
  batchRows: [],
  extraYears: []
};
window.ADMIN_UPLOAD_MANAGEMENT = ADMIN_UPLOAD_MANAGEMENT;

function formatAdminDateTime(value){
  if(!value) return '-';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
function getMonthRange(year, month){
  const y = Number(year);
  const mo = Number(month);
  const start = `${y}-${String(mo).padStart(2,'0')}-01`;
  const endDate = new Date(y, mo, 0).getDate();
  const end = `${y}-${String(mo).padStart(2,'0')}-${String(endDate).padStart(2,'0')}`;
  const nextM = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const endExclusive = `${nextY}-${String(nextM).padStart(2,'0')}-01`;
  return { start, end, endExclusive };
}
function deriveMonthState(stat){
  const hasErp = Number(stat.erpCount || 0) > 0;
  const hasSecom = Number(stat.secomCount || 0) > 0;
  const hasRecords = Number(stat.recordCount || 0) > 0;
  const batchCount = Number(stat.batchCount || 0);
  if(batchCount > 1) return { key:'dup', label:'중복주의' };
  if(hasErp && hasSecom && hasRecords) return { key:'ok', label:'완료' };
  if(hasErp || hasSecom || hasRecords) return { key:'partial', label:'일부완료' };
  return { key:'empty', label:'미업로드' };
}
const ADMIN_EXTRA_YEARS_STORAGE_KEY = 'attendance_admin_extra_years_v1';
function getDefaultAdminYearRange(){
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, idx) => currentYear - 2 + idx);
}
function loadAdminExtraYears(){
  try{
    const parsed = JSON.parse(localStorage.getItem(ADMIN_EXTRA_YEARS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(y => Number.isFinite(y) && y >= 2000 && y <= 2099) : [];
  }catch(e){ return []; }
}
function saveAdminExtraYears(years){
  try{
    const clean = [...new Set((years || []).map(Number).filter(y => Number.isFinite(y) && y >= 2000 && y <= 2099))].sort((a,b) => a - b);
    localStorage.setItem(ADMIN_EXTRA_YEARS_STORAGE_KEY, JSON.stringify(clean));
    ADMIN_UPLOAD_MANAGEMENT.extraYears = clean;
  }catch(e){}
}
function mergeAdminYears(){
  const values = [...getDefaultAdminYearRange(), ...(ADMIN_UPLOAD_MANAGEMENT.extraYears || []), ...(ADMIN_UPLOAD_MANAGEMENT.years || [])];
  return [...new Set(values.map(Number).filter(y => Number.isFinite(y) && y >= 2000 && y <= 2099))].sort((a,b) => b - a);
}
function addAdminSelectableYear(year){
  const y = Number(year);
  if(!Number.isFinite(y) || y < 2000 || y > 2099){
    alert('연도는 2000~2099 사이로 입력해주세요.');
    return false;
  }
  const extras = loadAdminExtraYears();
  if(!extras.includes(y)) extras.push(y);
  saveAdminExtraYears(extras);
  ADMIN_UPLOAD_MANAGEMENT.years = mergeAdminYears();
  ADMIN_UPLOAD_MANAGEMENT.selectedYear = y;
  return true;
}

async function fetchAdminUploadYears(){
  if(!supabaseClient) return [];
  const years = new Set();
  const nowYear = new Date().getFullYear();
  years.add(nowYear);
  try{
    const { data, error } = await supabaseClient.from('attendance_records').select('work_date').order('work_date', { ascending:false }).limit(4000);
    if(error) throw error;
    (data || []).forEach(row => {
      const m = String(row.work_date || '').match(/^(\d{4})-/);
      if(m) years.add(Number(m[1]));
    });
  }catch(err){
    console.warn('[ADMIN YEARS attendance_records]', err);
  }
  try{
    const { data, error } = await supabaseClient.from('attendance_upload_batches').select('*').limit(500);
    if(error) throw error;
    (data || []).forEach(row => {
      const combined = [row.upload_month, row.created_at, row.uploaded_at, row.secom_filename, row.erp_filename, row.secom_file_name, row.erp_file_name, row.note, row.batch_id, row.id].filter(Boolean).join(' ');
      const matches = String(combined).match(/20\d{2}/g) || [];
      matches.forEach(y => years.add(Number(y)));
    });
  }catch(err){
    console.warn('[ADMIN YEARS batches]', err);
  }
  ADMIN_UPLOAD_MANAGEMENT.extraYears = loadAdminExtraYears();
  ADMIN_UPLOAD_MANAGEMENT.years = [...years];
  return mergeAdminYears();
}
async function fetchMonthCountMap(tableName, year){
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const map = new Map();
  const batchDateMap = new Map();
  if(!supabaseClient) return { countMap: map, batchDateMap };
  const columns = tableName === 'attendance_records' ? 'work_date' : 'work_date, upload_batch_id';

  // ✅ Supabase REST는 한 번에 1,000행까지만 내려오는 환경이 있어 .limit(50000)만으로는 부족합니다.
  // 2월 588건 + 3월 651건처럼 연간 합계가 1,000건을 넘으면 3월이 412건으로 잘려 보이는 문제가 생깁니다.
  // 따라서 range()로 전 구간을 페이지 단위로 모두 읽어서 월카드 카운트를 계산합니다.
  const pageSize = 1000;
  let from = 0;

  try{
    while(true){
      const to = from + pageSize - 1;
      const { data, error } = await supabaseClient
        .from(tableName)
        .select(columns)
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date', { ascending:true })
        .range(from, to);

      if(error) throw error;

      const rows = data || [];
      rows.forEach(row => {
        const workDate = String(row.work_date || '');
        const m = workDate.match(/^\d{4}-(\d{2})-/);
        if(!m) return;
        const month = Number(m[1]);
        map.set(month, (map.get(month) || 0) + 1);
        if('upload_batch_id' in row && row.upload_batch_id){
          if(!batchDateMap.has(row.upload_batch_id)) batchDateMap.set(row.upload_batch_id, []);
          batchDateMap.get(row.upload_batch_id).push(workDate);
        }
      });

      if(rows.length < pageSize) break;
      from += pageSize;
    }
  }catch(err){
    console.warn(`[ADMIN MONTH MAP ${tableName}]`, err);
  }
  return { countMap: map, batchDateMap };
}

function extractBatchYearMonth(row){
  const uploadMonth = String(row?.upload_month || row?.target_month || '').trim();
  let m = uploadMonth.match(/^(20\d{2})-(\d{1,2})$/);
  if(m) return { year:Number(m[1]), month:Number(m[2]) };

  const filenameJoined = [row?.erp_filename, row?.secom_filename, row?.erp_file_name, row?.secom_file_name, row?.note]
    .filter(Boolean)
    .join(' ');

  m = filenameJoined.match(/(20\d{2})[^0-9]?(0?[1-9]|1[0-2])/);
  if(m) return { year:Number(m[1]), month:Number(m[2]) };

  m = filenameJoined.match(/(?:^|[^0-9])(\d{2})[^0-9]?(0?[1-9]|1[0-2])(?:[^0-9]|$)/);
  if(m) return { year:Number(`20${m[1]}`), month:Number(m[2]) };

  const created = String(row?.created_at || row?.uploaded_at || '');
  const createdMatch = created.match(/^(20\d{2})-(\d{2})/);
  if(createdMatch) return { year:Number(createdMatch[1]), month:Number(createdMatch[2]) };

  return { year:null, month:null };
}


async function fetchAdminBatchRows(year, secomBatchDateMap, erpBatchDateMap){
  if(!supabaseClient) return [];
  const rows = [];
  try{
    const { data, error } = await supabaseClient
      .from('attendance_upload_batches')
      .select('*')
      .order('created_at', { ascending:false })
      .limit(1000);
    if(error) throw error;

    (data || []).forEach(row => {
      const key = getBatchPublicKey(row);
      const inferred = extractBatchYearMonth(row);
      const secomDates = (key && secomBatchDateMap.get(key)) || [];
      const erpDates = (key && erpBatchDateMap.get(key)) || [];
      const allDates = [...secomDates, ...erpDates].sort();
      const monthSource = allDates[0] || '';
      const dateMatch = monthSource.match(/^(20\d{2})-(\d{2})/);
      const rowYear = inferred.year || (dateMatch ? Number(dateMatch[1]) : null);
      const rowMonth = inferred.month || (dateMatch ? Number(dateMatch[2]) : null);
      if(rowYear !== year || !rowMonth) return;
      rows.push({
        id: key || String(row.id || ''),
        raw_id: row.id,
        batch_id: row.batch_id || '',
        created_at: row.created_at || row.uploaded_at || null,
        secom_filename: row.secom_filename || row.secom_file_name || '',
        erp_filename: row.erp_filename || row.erp_file_name || '',
        note: row.note || '',
        month: rowMonth,
        secomCount: secomDates.length,
        erpCount: erpDates.length,
        minDate: allDates[0] || null,
        maxDate: allDates[allDates.length - 1] || null
      });
    });
  }catch(err){
    console.warn('[ADMIN BATCH ROWS]', err);
  }
  rows.sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return rows;
}

function renderAdminYearOptions(){
  const select = document.getElementById('adminUploadYear');
  if(!select) return;
  ADMIN_UPLOAD_MANAGEMENT.extraYears = loadAdminExtraYears();
  const years = mergeAdminYears();
  ADMIN_UPLOAD_MANAGEMENT.years = years;
  const current = ADMIN_UPLOAD_MANAGEMENT.selectedYear || new Date().getFullYear();
  select.innerHTML = years.map(y => `<option value="${y}">${y}년</option>`).join('');
  select.value = String(current);
}
function renderAdminYearSummary(){
  const wrap = document.getElementById('adminUploadYearSummary');
  if(!wrap) return;
  const stats = ADMIN_UPLOAD_MANAGEMENT.monthStats || [];
  const summary = { ok:0, partial:0, dup:0, empty:0 };
  stats.forEach(stat => {
    const state = deriveMonthState(stat).key;
    summary[state] = (summary[state] || 0) + 1;
  });
  wrap.innerHTML = `
    <div class="adminSummaryPill">선택 연도 <span>${ADMIN_UPLOAD_MANAGEMENT.selectedYear || '-'}</span></div>
    <div class="adminSummaryPill">완료 <span>${summary.ok}개월</span></div>
    <div class="adminSummaryPill">일부완료 <span>${summary.partial}개월</span></div>
    <div class="adminSummaryPill">중복주의 <span>${summary.dup}개월</span></div>
    <div class="adminSummaryPill">미업로드 <span>${summary.empty}개월</span></div>`;
}
function renderAdminMonthCards(){
  const grid = document.getElementById('adminUploadMonthGrid');
  if(!grid) return;
  const stats = ADMIN_UPLOAD_MANAGEMENT.monthStats || [];
  grid.innerHTML = stats.map(stat => {
    const state = deriveMonthState(stat);
    const latestText = stat.latestUploadedAt ? formatAdminDateTime(stat.latestUploadedAt) : '-';
    const deleteDisabled = (!stat.erpCount && !stat.secomCount && !stat.recordCount && !stat.batchCount) ? 'disabled' : '';
    return `
      <div class="adminMonthCard ${state.key}">
        <div class="adminMonthHead">
          <div class="adminMonthTitle">${stat.month}월</div>
          <span class="adminMonthState ${state.key}">${state.label}</span>
        </div>
        <div class="adminMonthMetrics">
          <div class="adminMetricMini"><div class="k">ERP raw</div><div class="v">${stat.erpCount || 0}건</div></div>
          <div class="adminMetricMini"><div class="k">세콤 raw</div><div class="v">${stat.secomCount || 0}건</div></div>
          <div class="adminMetricMini"><div class="k">records</div><div class="v">${stat.recordCount || 0}건</div></div>
          <div class="adminMetricMini"><div class="k">배치</div><div class="v">${stat.batchCount || 0}건</div></div>
        </div>
        <div class="adminMonthMeta">
          <div>최근 업로드: <strong style="color:var(--text)">${latestText}</strong></div>
          <div>파일: ERP ${stat.erpFileNames.length ? stat.erpFileNames[0] : '-'} / 세콤 ${stat.secomFileNames.length ? stat.secomFileNames[0] : '-'}</div>
        </div>
        <div class="adminMonthActions">
          <button type="button" class="adminActionBtn" data-admin-detail-month="${stat.month}">상세</button>
          <button type="button" class="adminActionBtn danger" data-admin-delete-month="${stat.month}" ${deleteDisabled}>월 삭제</button>
        </div>
      </div>`;
  }).join('');
}
function renderAdminBatchHistory(){
  const body = document.getElementById('adminBatchHistoryBody');
  const empty = document.getElementById('adminBatchHistoryEmpty');
  if(!body || !empty) return;
  const rows = ADMIN_UPLOAD_MANAGEMENT.batchRows || [];
  if(!rows.length){
    body.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = rows.map(row => `
    <tr>
      <td>${row.month ? `${row.month}월` : '-'}</td>
      <td>${formatAdminDateTime(row.created_at)}</td>
      <td title="${row.erp_filename || ''}">${row.erp_filename || '-'}</td>
      <td title="${row.secom_filename || ''}">${row.secom_filename || '-'}</td>
      <td>${row.erpCount || 0}</td>
      <td>${row.secomCount || 0}</td>
      <td style="font-family:monospace;font-size:12px">${row.id}</td>
      <td><button type="button" class="adminActionBtn danger" data-admin-delete-batch="${row.id}">삭제</button></td>
    </tr>`).join('');
}
function initAdminManagementEventDelegation(){
  const root = document.getElementById('main-admin');
  if(!root || root.dataset.adminDelegated === 'Y') return;
  root.addEventListener('click', (e) => {
    const addYearBtn = e.target.closest('#adminAddYearBtn');
    if(addYearBtn){
      e.preventDefault();
      const input = document.getElementById('adminAddYearInput');
      const yearValue = Number(input?.value || '');
      if(addAdminSelectableYear(yearValue)){
        if(input) input.value = '';
        (async () => {
          try{ await refreshAdminUploadManagement(true); }
          catch(err){ console.error('[ADMIN ADD YEAR]', err); }
        })();
      }
      return;
    }
    const refreshBtn = e.target.closest('#adminRefreshBtn');
    if(refreshBtn){
      e.preventDefault();
      (async () => {
        try{
          ADMIN_UPLOAD_MANAGEMENT.selectedYear = Number(document.getElementById('adminUploadYear')?.value) || new Date().getFullYear();
          await refreshAdminUploadManagement(true);
        }catch(err){
          console.error('[ADMIN REFRESH BTN]', err);
        }
      })();
      return;
    }
    const detailBtn = e.target.closest('[data-admin-detail-month]');
    if(detailBtn){
      if(detailBtn.disabled) return;
      const month = Number(detailBtn.getAttribute('data-admin-detail-month'));
      console.log('admin detail month', month);
      if(!Number.isFinite(month)){
        console.error('[ADMIN DETAIL] invalid month attribute', detailBtn.getAttribute('data-admin-detail-month'));
        return;
      }
      try{
        showAdminMonthDetail(month);
      }catch(err){
        console.error('[ADMIN DETAIL FAILED]', err);
        alert('월 상세 표시 중 오류가 발생했습니다.');
      }
      return;
    }
    const delMonthBtn = e.target.closest('[data-admin-delete-month]');
    if(delMonthBtn){
      if(delMonthBtn.disabled) return;
      const month = Number(delMonthBtn.getAttribute('data-admin-delete-month'));
      console.log('admin delete month', month);
      if(!Number.isFinite(month)){
        console.error('[ADMIN DELETE MONTH] invalid month attribute', delMonthBtn.getAttribute('data-admin-delete-month'));
        return;
      }
      (async () => {
        try{
          await deleteAdminMonthData(month);
        }catch(err){
          console.error('[ADMIN DELETE MONTH CLICK]', err);
        }
      })();
      return;
    }
    const delBatchBtn = e.target.closest('[data-admin-delete-batch]');
    if(delBatchBtn){
      const batchId = delBatchBtn.getAttribute('data-admin-delete-batch');
      console.log('admin delete batch', batchId);
      if(!batchId){
        console.error('[ADMIN DELETE BATCH] missing batch id on button');
        return;
      }
      (async () => {
        try{
          await deleteAdminBatchData(batchId);
        }catch(err){
          console.error('[ADMIN DELETE BATCH CLICK]', err);
        }
      })();
    }
  });
  root.addEventListener('change', (e) => {
    const sel = e.target;
    if(!sel || sel.id !== 'adminUploadYear') return;
    (async () => {
      try{
        ADMIN_UPLOAD_MANAGEMENT.selectedYear = Number(sel.value) || new Date().getFullYear();
        await refreshAdminUploadManagement();
      }catch(err){
        console.error('[ADMIN YEAR CHANGE]', err);
      }
    })();
  });
  root.dataset.adminDelegated = 'Y';
}
function bindAdminManagementEvents(){
  initAdminManagementEventDelegation();
}
function showAdminMonthDetail(month){
  const stat = (ADMIN_UPLOAD_MANAGEMENT.monthStats || []).find(x => Number(x.month) === Number(month));
  if(!stat){
    console.error('[ADMIN MONTH DETAIL] stat not found for month', month);
    alert('월 상세 정보를 찾을 수 없습니다.');
    return;
  }
  const detailLines = [
    `${ADMIN_UPLOAD_MANAGEMENT.selectedYear}년 ${month}월 업로드 현황`,
    `상태: ${deriveMonthState(stat).label}`,
    `ERP raw: ${stat.erpCount || 0}건`,
    `세콤 raw: ${stat.secomCount || 0}건`,
    `최종 records: ${stat.recordCount || 0}건`,
    `배치 수: ${stat.batchCount || 0}건`,
    `최근 업로드: ${stat.latestUploadedAt ? formatAdminDateTime(stat.latestUploadedAt) : '-'}`
  ];
  if(stat.erpFileNames.length) detailLines.push(`ERP 파일: ${stat.erpFileNames.join(', ')}`);
  if(stat.secomFileNames.length) detailLines.push(`세콤 파일: ${stat.secomFileNames.join(', ')}`);
  const monthRows = (ADMIN_UPLOAD_MANAGEMENT.batchRows || []).filter(row => Number(row.month) === Number(month));
  if(monthRows.length){
    detailLines.push('');
    detailLines.push('배치 목록');
    monthRows.forEach(row => detailLines.push(`- ${formatAdminDateTime(row.created_at)} | ${row.id}`));
  }
  alert(detailLines.join('\n'));
}

async function deleteAdminMonthData(month){
  if(!supabaseClient){
    console.error('[ADMIN DELETE MONTH] supabaseClient missing');
    alert('Supabase 연결이 필요합니다.');
    return;
  }

  const year = Number(ADMIN_UPLOAD_MANAGEMENT.selectedYear || new Date().getFullYear());
  const m = Number(month);

  if(!Number.isFinite(year) || !Number.isFinite(m) || m < 1 || m > 12){
    console.error('[ADMIN DELETE MONTH] invalid year/month', { year, month });
    alert('연도 또는 월 값이 올바르지 않습니다.');
    return;
  }

  const uploadMonth = `${year}-${String(m).padStart(2, '0')}`;
  const range = getMonthRangeFromKey(uploadMonth);
  if(!range){
    alert('삭제할 월 정보를 해석하지 못했습니다.');
    return;
  }

  if(!confirm(`${year}년 ${m}월 데이터를 삭제할까요?\nERP raw + 세콤 raw + attendance_records + 배치 이력이 함께 삭제됩니다.`)) return;

  const countMonth = async (tableName) => {
    const { count, error } = await supabaseClient
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .gte('work_date', range.start)
      .lt('work_date', range.endExclusive);
    if(error){
      console.warn(`[ADMIN DELETE MONTH COUNT FAILED] ${tableName}`, error);
      return null;
    }
    return count ?? 0;
  };

  try{
    console.log('[ADMIN DELETE MONTH] start', { year, month: m, uploadMonth, ...range });
    await deleteServerAttendanceMonth(uploadMonth);

    const afterErp = await countMonth('attendance_erp_raw');
    const afterSecom = await countMonth('attendance_secom_raw');
    const afterRec = await countMonth('attendance_records');

    if((afterErp ?? 0) !== 0 || (afterSecom ?? 0) !== 0 || (afterRec ?? 0) !== 0){
      throw new Error(`삭제 검증 실패: ERP ${afterErp ?? 'null'}건 / 세콤 ${afterSecom ?? 'null'}건 / records ${afterRec ?? 'null'}건 남음`);
    }

    if(Array.isArray(REAL_ATTENDANCE_DATA)){
      REAL_ATTENDANCE_DATA = REAL_ATTENDANCE_DATA.filter(row => {
        const d = row?.work_date || row?.date || '';
        return !(d >= range.start && d < range.endExclusive);
      });
      saveUploadedAttendanceData();
    }

    await refreshAttendanceAfterAdminMutation({ forceYearReload: true, refreshFilters: true, targetYear: year });

    alert(`${year}년 ${m}월 데이터 삭제가 완료되었습니다.`);
  }catch(error){
    console.error('[ADMIN DELETE MONTH FAILED]', error);
    alert(`월 삭제 중 오류가 발생했습니다.\n${error?.message || error}`);
  }
}


async function deleteAdminBatchData(batchId){
  if(!supabaseClient || !batchId){
    console.error('[ADMIN DELETE BATCH] supabaseClient or batchId missing', { batchId });
    alert('Supabase 연결이 필요합니다.');
    return;
  }
  if(!confirm(`선택한 배치(${batchId})를 삭제할까요?\n해당 배치 raw와 같은 날짜 범위의 attendance_records도 함께 삭제됩니다.`)) return;
  try{
    const { data: secomRows, error: secomReadError } = await supabaseClient
      .from('attendance_secom_raw')
      .select('work_date')
      .eq('upload_batch_id', batchId)
      .limit(50000);
    if(secomReadError) throw secomReadError;

    const { data: erpRows, error: erpReadError } = await supabaseClient
      .from('attendance_erp_raw')
      .select('work_date')
      .eq('upload_batch_id', batchId)
      .limit(50000);
    if(erpReadError) throw erpReadError;

    const dates = [...new Set([
      ...(secomRows || []).map(x => x.work_date).filter(Boolean),
      ...(erpRows || []).map(x => x.work_date).filter(Boolean)
    ])].sort();
    const minDate = dates[0] || null;
    const maxDate = dates[dates.length - 1] || null;

    let result = await supabaseClient.from('attendance_secom_raw').delete().eq('upload_batch_id', batchId);
    if(result.error) throw result.error;

    result = await supabaseClient.from('attendance_erp_raw').delete().eq('upload_batch_id', batchId);
    if(result.error) throw result.error;

    if(minDate && maxDate){
      result = await supabaseClient.from('attendance_records').delete().gte('work_date', minDate).lte('work_date', maxDate);
      if(result.error) console.warn('[ADMIN DELETE BATCH RECORDS]', result.error);
    }

    await safeDeleteBatchMetaByKey(batchId);

    if(Array.isArray(REAL_ATTENDANCE_DATA) && minDate && maxDate){
      REAL_ATTENDANCE_DATA = REAL_ATTENDANCE_DATA.filter(row => {
        const d = row?.work_date || row?.date || '';
        return !(d >= minDate && d <= maxDate);
      });
      saveUploadedAttendanceData();
    }

    const deletedBatchYear = Number(String(minDate || '').slice(0, 4)) || Number(ADMIN_UPLOAD_MANAGEMENT.selectedYear || new Date().getFullYear());
    await refreshAttendanceAfterAdminMutation({ forceYearReload: true, refreshFilters: true, targetYear: deletedBatchYear });
    alert('배치 삭제가 완료되었습니다.');
  }catch(error){
    console.error('[ADMIN DELETE BATCH FAILED]', error);
    alert(`배치 삭제 중 오류가 발생했습니다.\n${error?.message || error}`);
  }
}

async function refreshAdminMonthCardsImmediately(options = {}){
  const targetYear = Number(options.targetYear || ADMIN_UPLOAD_MANAGEMENT.selectedYear || document.getElementById('adminUploadYear')?.value || new Date().getFullYear());
  const forceYearReload = options.forceYearReload === true;
  if(Number.isFinite(targetYear)){
    ADMIN_UPLOAD_MANAGEMENT.selectedYear = targetYear;
    if(!ADMIN_UPLOAD_MANAGEMENT.years.includes(targetYear)){
      ADMIN_UPLOAD_MANAGEMENT.years = [targetYear, ...ADMIN_UPLOAD_MANAGEMENT.years].filter(Number.isFinite);
      ADMIN_UPLOAD_MANAGEMENT.years = [...new Set(ADMIN_UPLOAD_MANAGEMENT.years)].sort((a,b) => b - a);
    }
    const yearSelect = document.getElementById('adminUploadYear');
    if(yearSelect){
      const hasOption = [...yearSelect.options].some(opt => Number(opt.value) === targetYear);
      if(!hasOption){
        const opt = document.createElement('option');
        opt.value = String(targetYear);
        opt.textContent = String(targetYear) + '년';
        yearSelect.appendChild(opt);
      }
      yearSelect.value = String(targetYear);
    }
  }

  if(typeof refreshAdminUploadManagement === 'function'){
    await refreshAdminUploadManagement(forceYearReload);
    await new Promise(resolve => setTimeout(resolve, 250));
    if(Number.isFinite(targetYear)){
      ADMIN_UPLOAD_MANAGEMENT.selectedYear = targetYear;
      const yearSelect = document.getElementById('adminUploadYear');
      if(yearSelect) yearSelect.value = String(targetYear);
    }
    await refreshAdminUploadManagement(false);
  }
}

async function refreshAdminUploadManagement(forceYearReload = false){
  const grid = document.getElementById('adminUploadMonthGrid');
  const historyBody = document.getElementById('adminBatchHistoryBody');
  if(!grid || !historyBody){
    bindAdminManagementEvents();
    return;
  }
  if(!supabaseClient){
    grid.innerHTML = '<div class="adminHistoryEmpty" style="grid-column:1/-1">Supabase 연결 후 사용할 수 있습니다.</div>';
    historyBody.innerHTML = '';
    const emptyEl = document.getElementById('adminBatchHistoryEmpty');
    if(emptyEl) emptyEl.style.display = '';
    bindAdminManagementEvents();
    return;
  }
  try{
    ADMIN_UPLOAD_MANAGEMENT.extraYears = loadAdminExtraYears();
    if(forceYearReload || !ADMIN_UPLOAD_MANAGEMENT.years.length){
      ADMIN_UPLOAD_MANAGEMENT.years = await fetchAdminUploadYears();
    } else {
      ADMIN_UPLOAD_MANAGEMENT.years = mergeAdminYears();
    }
    if(!ADMIN_UPLOAD_MANAGEMENT.selectedYear){
      ADMIN_UPLOAD_MANAGEMENT.selectedYear = new Date().getFullYear();
    }
    renderAdminYearOptions();
    const year = Number(document.getElementById('adminUploadYear')?.value) || ADMIN_UPLOAD_MANAGEMENT.selectedYear;
    ADMIN_UPLOAD_MANAGEMENT.selectedYear = year;

    const [{ countMap: recordMap }, { countMap: secomMap, batchDateMap: secomBatchDateMap }, { countMap: erpMap, batchDateMap: erpBatchDateMap }] = await Promise.all([
      fetchMonthCountMap('attendance_records', year),
      fetchMonthCountMap('attendance_secom_raw', year),
      fetchMonthCountMap('attendance_erp_raw', year)
    ]);

    const batchRows = await fetchAdminBatchRows(year, secomBatchDateMap, erpBatchDateMap);
    ADMIN_UPLOAD_MANAGEMENT.batchRows = batchRows;
    ADMIN_UPLOAD_MANAGEMENT.monthStats = Array.from({ length:12 }, (_, idx) => {
      const month = idx + 1;
      const monthBatchRows = batchRows.filter(row => Number(row.month) === month);
      return {
        month,
        recordCount: recordMap.get(month) || 0,
        secomCount: secomMap.get(month) || 0,
        erpCount: erpMap.get(month) || 0,
        batchCount: monthBatchRows.length,
        latestUploadedAt: monthBatchRows[0]?.created_at || null,
        erpFileNames: [...new Set(monthBatchRows.map(row => row.erp_filename).filter(Boolean))],
        secomFileNames: [...new Set(monthBatchRows.map(row => row.secom_filename).filter(Boolean))]
      };
    });

    renderAdminYearSummary();
    renderAdminMonthCards();
    renderAdminBatchHistory();
  }catch(err){
    console.error('[REFRESH ADMIN UPLOAD MANAGEMENT]', err);
  }finally{
    bindAdminManagementEvents();
  }
}

window.refreshAdminUploadManagement = refreshAdminUploadManagement;
window.refreshAdminMonthCardsImmediately = refreshAdminMonthCardsImmediately;
window.applyUploadedFiles = applyUploadedFiles;
window.refreshAdminUploadManagementStrong = refreshAdminUploadManagementStrong;

  window.render = async function(){
    const keepTab = getActiveAttendanceMainTab('attendance');
    saveAttendanceMainTab(keepTab);
    if(!window.__empMasterInitialized){
      try{
        await window.loadOrgMaster();
        await window.loadEmpMaster();
      }catch(error){
        dbError('초기 데이터 로딩 중 오류가 발생했습니다.', error);
      }
              bindUploadRuntimeEvents();
      try{
        await window.loadAttendanceFromSupabase();
      }catch(error){
        console.error('attendance_records 로딩 오류', error);
        resetAttendanceClientState();
      }
      try{
        await loadSpecialNotes();
      }catch(error){
        console.error('employee_special_notes 로딩 오류', error);
      }
      window.__empMasterInitialized = true;
    }
    dedupeEmpMasterByName();
    if(Array.isArray(REAL_ATTENDANCE_DATA) && REAL_ATTENDANCE_DATA.length){
      rebuildDerivedMetricsFromAttendance();
    }else{
      syncDashboardDataFromEmpMaster();
    }
    updateUploadStatus();
    renderFilters();
    refreshFloatingFilters();
            const months = periodMonths();
    const scoped = scopedEmployees();
    renderKpis(scoped);
    initKpiCardLayout();
    renderSummary(months);
    renderAlerts(months);
    renderAttendanceTab();
    renderAttendanceMissingAnalysis();
    renderTopCharts(scoped, months);
    renderInsight(scoped, months);
    renderRisk(scoped);
    renderPeople(scoped);
    renderTrendAnalysis();
    bindMainTabs();
    restoreSavedMainTab(keepTab);
    renderTabs();
    await refreshAdminUploadManagement();
    };

  window.refreshAdminUploadManagement = refreshAdminUploadManagement;
  window.refreshAdminMonthCardsImmediately = refreshAdminMonthCardsImmediately;
  window.refreshAttendanceAfterAdminMutation = refreshAttendanceAfterAdminMutation;
  window.ADMIN_UPLOAD_MANAGEMENT = ADMIN_UPLOAD_MANAGEMENT;

  bindAdminManagementEvents();

})();


(function(){
  const list = scopedEmployees();
  const totalOT = list.reduce((a,b)=>a+(b.scopedMonthlyOvertime||0),0);
  const activity = list.reduce((a,b)=>a+((b.businessTripDays||0)+(b.outdoorDays||0)),0);
  const count = Math.max(1,list.length);

  document.getElementById('kpiTotalOT').textContent = (totalOT).toFixed(0) + "시간";
  document.getElementById('kpiMobility').textContent = (activity/count).toFixed(1);
  document.getElementById('kpiComplex').textContent = (activity).toFixed(1) + "건";
})();
