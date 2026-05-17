/* ===== extracted inline script #7 (inline) ===== */

(function(){
  var ACCESS_ADMIN_STATE = { loaded:false, loading:false, rows:[] };
  var ACCESS_OPERATOR_STATE = { loaded:false, loading:false, rows:[] };
  var LEGACY_OPERATOR_KEY = 'attendance_access_operator_employee_ids_v1';

  function accessEsc(v){
    return String(v ?? '').replace(/[&<>'"]/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[ch];
    });
  }
  function getAccessEmployees(){
    try{
      if(typeof empMaster !== 'undefined' && Array.isArray(empMaster)) return empMaster.slice();
    }catch(e){}
    try{
      var raw = localStorage.getItem('org_employee_master_v5_master_excel');
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(e){ return []; }
  }
  function normalizeAccessAuthority(emp){
    return String(emp?.authority || emp?.role || '').trim();
  }
  function normalizeAccessStatus(emp){
    return String(emp?.status || '재직').trim() || '재직';
  }
  function getAccessId(emp){
    return String(emp?.id || emp?.employee_no || emp?.employeeNo || '').trim();
  }
  function getAccessName(emp){
    return String(emp?.name || emp?.employee_name || '').trim();
  }
  function getAccessOperatorRows(){
    return Array.isArray(ACCESS_OPERATOR_STATE.rows) ? ACCESS_OPERATOR_STATE.rows.slice() : [];
  }
  function getAccessOperatorIds(){
    return new Set(getAccessOperatorRows()
      .map(function(row){ return String(row.employee_no || row.employeeNo || row.id || '').trim(); })
      .filter(Boolean));
  }
  function getCurrentAccessActorName(){
    try{
      var keys = ['portal_auth_user','portalUser','attendance_portal_user'];
      for(var i=0;i<keys.length;i++){
        var raw = sessionStorage.getItem(keys[i]) || localStorage.getItem(keys[i]);
        if(!raw) continue;
        var parsed = JSON.parse(raw);
        var name = parsed?.name || parsed?.user?.name || parsed?.profile?.name || parsed?.email || parsed?.user?.email || '';
        if(name) return String(name).trim();
      }
    }catch(_e){}
    return '관리자';
  }
  function normalizeAccessOperatorRow(row){
    row = row || {};
    return {
      employee_no: String(row.employee_no || row.employeeNo || row.id || '').trim(),
      name: String(row.name || row.employee_name || '').trim(),
      department: String(row.department || row.division || row.division_name || row.division_code || '').trim(),
      team: String(row.team || row.team_name || row.team_code || '').trim(),
      position: String(row.position || row.authority || '').trim(),
      email: String(row.email || row.user_email || '').trim(),
      role: String(row.role || '운영자').trim() || '운영자',
      status: row.is_active === false ? '해제' : '재직',
      is_active: row.is_active !== false,
      created_at: row.created_at || '',
      updated_at: row.updated_at || ''
    };
  }
  async function refreshAccessOperatorRowsFromServer(force){
    if(ACCESS_OPERATOR_STATE.loading) return getAccessOperatorRows();
    if(ACCESS_OPERATOR_STATE.loaded && !force) return getAccessOperatorRows();
    ACCESS_OPERATOR_STATE.loading = true;
    try{
      var client = window.__attendanceSupabaseClient || null;
      if(!client){
        ACCESS_OPERATOR_STATE.rows = [];
        ACCESS_OPERATOR_STATE.loaded = true;
        return [];
      }
      var res = await client
        .from('attendance_operators')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending:false });
      if(res && res.error){
        console.warn('[ACCESS OPERATOR] 서버 조회 실패:', res.error);
        ACCESS_OPERATOR_STATE.rows = [];
      }else{
        ACCESS_OPERATOR_STATE.rows = (Array.isArray(res?.data) ? res.data : []).map(normalizeAccessOperatorRow);
      }
      ACCESS_OPERATOR_STATE.loaded = true;
      try{ localStorage.removeItem(LEGACY_OPERATOR_KEY); }catch(_e){}
      return getAccessOperatorRows();
    }catch(e){
      console.warn('[ACCESS OPERATOR] 서버 조회 예외:', e);
      ACCESS_OPERATOR_STATE.rows = [];
      ACCESS_OPERATOR_STATE.loaded = true;
      return [];
    }finally{
      ACCESS_OPERATOR_STATE.loading = false;
    }
  }
  function buildAttendanceOperatorPayload(emp, active){
    return {
      employee_no: getAccessId(emp),
      name: getAccessName(emp),
      department: getAccessDivision(emp),
      team: getAccessTeam(emp),
      position: normalizeAccessAuthority(emp),
      email: getAccessEmail(emp),
      role: '운영자',
      is_active: active !== false,
      updated_by: getCurrentAccessActorName(),
      updated_at: new Date().toISOString()
    };
  }
  async function upsertAttendanceOperator(emp){
    var client = window.__attendanceSupabaseClient || null;
    if(!client) throw new Error('Supabase 연결 객체가 없습니다.');
    var payload = buildAttendanceOperatorPayload(emp, true);
    payload.created_by = getCurrentAccessActorName();
    var result = await client
      .from('attendance_operators')
      .upsert(payload, { onConflict:'employee_no' })
      .select('*')
      .maybeSingle();
    if(result?.error){
      // created_by/updated_by 등 선택 컬럼이 다른 경우를 대비한 최소 저장 재시도
      var minimal = {
        employee_no: payload.employee_no,
        name: payload.name,
        department: payload.department,
        team: payload.team,
        position: payload.position,
        email: payload.email,
        role: '운영자',
        is_active: true
      };
      result = await client
        .from('attendance_operators')
        .upsert(minimal, { onConflict:'employee_no' })
        .select('*')
        .maybeSingle();
    }
    if(result?.error) throw result.error;
    return result?.data || payload;
  }
  async function deactivateAttendanceOperator(employeeNo){
    var client = window.__attendanceSupabaseClient || null;
    if(!client) throw new Error('Supabase 연결 객체가 없습니다.');
    employeeNo = String(employeeNo || '').trim();
    if(!employeeNo) throw new Error('사번이 없습니다.');

    // 운영자 해제는 이력 비활성화가 아니라 서버 행을 실제 삭제합니다.
    // 현재 운영자 목록과 Supabase attendance_operators 테이블이 1:1로 맞도록 유지합니다.
    var result = await client
      .from('attendance_operators')
      .delete()
      .eq('employee_no', employeeNo)
      .select('*');

    if(result?.error) throw result.error;
    return Array.isArray(result?.data) ? result.data[0] || null : null;
  }
  function normalizeAccessEmail(v){
    return String(v || '').trim().toLowerCase();
  }
  function normalizeAccessAdminRole(v){
    var s = String(v || '').trim().toLowerCase();
    if(!s) return '';
    if(s === 'admin' || s === 'administrator') return 'admin';
    if(s === '관리자' || s === '시스템관리자' || s === '시스템 관리자') return 'admin';
    return s;
  }
  function isAccessAdminRole(v){
    return normalizeAccessAdminRole(v) === 'admin';
  }
  function getAccessEmployeeAdminRole(emp){
    return emp?.system_role || emp?.systemRole || emp?.user_role || emp?.userRole || emp?.portal_role || emp?.portalRole || emp?.access_role || emp?.accessRole || '';
  }
  function getCurrentAdminRows(){
    if(ACCESS_ADMIN_STATE.rows && ACCESS_ADMIN_STATE.rows.length) return ACCESS_ADMIN_STATE.rows.slice();
    return [];
  }
  async function refreshAccessAdminRowsFromSettings(force){
    if(ACCESS_ADMIN_STATE.loading) return ACCESS_ADMIN_STATE.rows || [];
    if(ACCESS_ADMIN_STATE.loaded && !force) return ACCESS_ADMIN_STATE.rows || [];
    ACCESS_ADMIN_STATE.loading = true;
    try{
      var client = window.__attendanceSupabaseClient || null;
      var rows = [];
      if(client){
        // 관리자 자동표기 수정: users 테이블에 없는 컬럼(user_email/user_name/employee_no 등)을 select하면
        // Supabase가 전체 조회를 실패시켜 관리자 수가 0으로 표시될 수 있으므로 실제 필요한 기본 컬럼만 조회한다.
        var res = await client
          .from('users')
          .select('email,name,role,is_active,updated_at,created_at');
        if(res && res.error){
          console.warn('[ACCESS ADMIN SETTINGS] users.role=admin 조회 실패:', res.error);
        }else{
          var adminUsers = (Array.isArray(res?.data) ? res.data : []).filter(function(row){
            return isAccessAdminRole(row?.role);
          });
          var employees = getAccessEmployees();
          var employeeByEmail = new Map();
          var employeeByNo = new Map();
          employees.forEach(function(emp){
            var email = normalizeAccessEmail(getAccessEmail(emp));
            var no = getAccessId(emp);
            if(email) employeeByEmail.set(email, emp);
            if(no) employeeByNo.set(no, emp);
          });
          adminUsers.forEach(function(userRow){
            var email = String(userRow.email || userRow.user_email || '').trim();
            var no = String(userRow.employee_no || userRow.employeeNo || '').trim();
            var emp = (email && employeeByEmail.get(normalizeAccessEmail(email))) || (no && employeeByNo.get(no)) || null;
            rows.push({
              type:'관리자',
              badge:'admin',
              name:getAccessName(emp) || String(userRow.name || userRow.user_name || email || no || '관리자').trim(),
              id:getAccessId(emp) || no || '-',
              division:getAccessDivision(emp) || '-',
              team:getAccessTeam(emp) || '-',
              authority:'관리자',
              basis:(email ? 'users.role 관리자 설정값 · ' + accessEsc(email) : 'users.role 관리자 설정값')
            });
          });
        }
      }
      if(!rows.length){
        getAccessEmployees().forEach(function(emp){
          if(!isAccessAdminRole(getAccessEmployeeAdminRole(emp))) return;
          rows.push({
            type:'관리자',
            badge:'admin',
            name:getAccessName(emp) || '관리자',
            id:getAccessId(emp) || '-',
            division:getAccessDivision(emp) || '-',
            team:getAccessTeam(emp) || '-',
            authority:'관리자',
            basis:'사원정보 관리자 설정값'
          });
        });
      }
      ACCESS_ADMIN_STATE.rows = rows;
      ACCESS_ADMIN_STATE.loaded = true;
      return rows;
    }catch(e){
      console.warn('[ACCESS ADMIN SETTINGS] 관리자 자동표기 실패:', e);
      ACCESS_ADMIN_STATE.rows = [];
      ACCESS_ADMIN_STATE.loaded = true;
      return [];
    }finally{
      ACCESS_ADMIN_STATE.loading = false;
    }
  }
  function buildAutoAccessRows(){
    var employees = getAccessEmployees();
    var rows = getCurrentAdminRows();
    employees.filter(function(emp){ return normalizeAccessStatus(emp) === '재직'; }).forEach(function(emp){
      var authority = normalizeAccessAuthority(emp);
      var isDirector = ['소장','본부장'].includes(authority);
      var isManager = authority === '담당';
      var isLeader = authority === '팀장';
      if(!isDirector && !isManager && !isLeader) return;
      var type = isDirector ? '소장/본부장' : (isManager ? '담당' : '팀장');
      var badge = isDirector ? 'director' : (isManager ? 'manager' : 'leader');
      var basis = isDirector
        ? '본부코드: ' + accessEsc(emp.divisionCode || emp.division_code || '-') + ' · 하위 팀 전체'
        : (isManager
          ? '관리팀코드: ' + accessEsc(getAccessManagedTeams(emp) || '-')
          : '팀코드: ' + accessEsc(emp.teamCode || emp.team_code || '-'));
      rows.push({
        type:type,
        badge:badge,
        name:getAccessName(emp),
        id:getAccessId(emp),
        division:String(emp.division || emp.divisionName || emp.division_code || emp.divisionCode || '').trim(),
        team:String(emp.team || emp.teamName || emp.team_code || emp.teamCode || '').trim(),
        authority:authority,
        basis:basis
      });
    });
    return rows;
  }
  function getAccessDivision(emp){
    return String(emp?.division || emp?.divisionName || emp?.division_code || emp?.divisionCode || '').trim();
  }
  function getAccessTeam(emp){
    return String(emp?.team || emp?.teamName || emp?.team_code || emp?.teamCode || '').trim();
  }
  function getAccessEmail(emp){
    return String(emp?.email || emp?.mail || emp?.user_email || '').trim();
  }
  function getAccessManagedTeams(emp){
    return String(emp?.managedTeams || emp?.managed_teams || emp?.managedTeamCodes || emp?.managed_team_codes || emp?.manageTeamCode || emp?.manage_team_code || emp?.managementTeamCode || emp?.management_team_code || '').trim();
  }
  function findAccessEmployeeById(id){
    id = String(id || '').trim();
    return getAccessEmployees().find(function(emp){ return getAccessId(emp) === id; }) || null;
  }
  function renderAccessOperatorCounts(){
    var operatorCount = getAccessOperatorRows().filter(function(row){ return row.is_active !== false; }).length;
    var el = document.getElementById('accessOperatorCount');
    if(el) el.textContent = String(operatorCount);
  }
  function renderAccessAutoTable(){
    var rows = buildAutoAccessRows();
    var tbody = document.getElementById('accessAutoTbody');
    var directorCount = rows.filter(function(r){ return r.badge === 'director'; }).length;
    var managerCount = rows.filter(function(r){ return r.badge === 'manager'; }).length;
    var leaderCount = rows.filter(function(r){ return r.badge === 'leader'; }).length;
    var adminCount = rows.filter(function(r){ return r.badge === 'admin'; }).length;
    var setText = function(id, v){ var el = document.getElementById(id); if(el) el.textContent = String(v); };
    setText('accessAdminCount', adminCount);
    setText('accessDirectorCount', directorCount);
    setText('accessManagerCount', managerCount);
    setText('accessLeaderCount', leaderCount);
    renderAccessOperatorCounts();
    if(!tbody) return;
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="7" class="accessEmpty">자동 표기 대상이 없습니다. 사원정보의 직책을 확인해 주세요.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(r){
      return '<tr>'+
        '<td><span class="accessRoleBadge '+accessEsc(r.badge)+'">'+accessEsc(r.type)+'</span></td>'+
        '<td><strong>'+accessEsc(r.name || '-')+'</strong></td>'+
        '<td>'+accessEsc(r.id || '-')+'</td>'+
        '<td>'+accessEsc(r.division || '-')+'</td>'+
        '<td>'+accessEsc(r.team || '-')+'</td>'+
        '<td>'+accessEsc(r.authority || '-')+'</td>'+
        '<td><span class="muted">'+(r.basis || '-')+'</span></td>'+
      '</tr>';
    }).join('');
  }
  function buildAccessEmployeeRow(emp, mode){
    var serverMode = mode === 'current-server';
    var id = serverMode ? String(emp.employee_no || '').trim() : getAccessId(emp);
    var operatorIds = getAccessOperatorIds();
    var isOperator = operatorIds.has(id);
    var button = '';
    if(mode === 'current' || serverMode){
      button = '<button type="button" class="accessSmallBtn danger" data-access-operator-remove="'+accessEsc(id)+'">해제</button>';
    }else{
      button = isOperator
        ? '<button type="button" class="accessSmallBtn" disabled>지정됨</button>'
        : '<button type="button" class="accessSmallBtn primary" data-access-operator-add="'+accessEsc(id)+'">운영자 지정</button>';
    }
    var name = serverMode ? emp.name : getAccessName(emp);
    var email = serverMode ? emp.email : getAccessEmail(emp);
    var division = serverMode ? emp.department : getAccessDivision(emp);
    var team = serverMode ? emp.team : getAccessTeam(emp);
    var position = serverMode ? emp.position : normalizeAccessAuthority(emp);
    var status = serverMode ? '재직' : normalizeAccessStatus(emp);
    return '<tr>'+
      '<td>'+button+'</td>'+
      '<td><strong>'+accessEsc(name || '-')+'</strong><div class="muted">'+accessEsc(email)+'</div></td>'+
      '<td>'+accessEsc(id || '-')+'</td>'+
      '<td>'+accessEsc(division || '-')+'</td>'+
      '<td>'+accessEsc(team || '-')+'</td>'+
      '<td>'+accessEsc(position || '-')+'</td>'+
      '<td>'+accessEsc(status || '-')+'</td>'+
    '</tr>';
  }
  function searchAccessOperatorCandidates(){
    var input = document.getElementById('accessOperatorKeyword');
    var keyword = String(input?.value || '').trim().toLowerCase();
    var tbody = document.getElementById('accessOperatorResultTbody');
    if(!tbody) return;
    if(!keyword){
      tbody.innerHTML = '<tr><td colspan="7" class="accessEmpty">검색어를 입력한 뒤 사원 검색을 눌러주세요.</td></tr>';
      return;
    }
    var rows = getAccessEmployees().filter(function(emp){
      if(normalizeAccessStatus(emp) !== '재직') return false;
      var hay = [
        getAccessId(emp), getAccessName(emp), getAccessEmail(emp),
        getAccessDivision(emp), getAccessTeam(emp), normalizeAccessAuthority(emp)
      ].join(' ').toLowerCase();
      return hay.includes(keyword);
    }).sort(function(a,b){
      var da = getAccessDivision(a).localeCompare(getAccessDivision(b),'ko'); if(da) return da;
      var ta = getAccessTeam(a).localeCompare(getAccessTeam(b),'ko'); if(ta) return ta;
      return Number(a.sortOrder || a.sort_order || 0) - Number(b.sortOrder || b.sort_order || 0) || getAccessName(a).localeCompare(getAccessName(b),'ko');
    }).slice(0, 30);
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="7" class="accessEmpty">검색된 사원이 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(emp){ return buildAccessEmployeeRow(emp, 'search'); }).join('');
  }
  function renderCurrentOperatorTable(){
    var tbody = document.getElementById('accessCurrentOperatorTbody');
    if(!tbody) return;
    var rows = getAccessOperatorRows().filter(function(row){ return row.is_active !== false; }).sort(function(a,b){
      var da = String(a.department || '').localeCompare(String(b.department || ''),'ko'); if(da) return da;
      var ta = String(a.team || '').localeCompare(String(b.team || ''),'ko'); if(ta) return ta;
      return String(a.name || '').localeCompare(String(b.name || ''),'ko');
    });
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="7" class="accessEmpty">현재 지정된 운영자가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(row){ return buildAccessEmployeeRow(row, 'current-server'); }).join('');
  }
  async function setAccessOperator(id, shouldAdd){
    id = String(id || '').trim();
    if(!id) return;
    var msg = document.getElementById('accessSaveMsg');
    try{
      if(shouldAdd){
        var emp = findAccessEmployeeById(id);
        if(!emp) throw new Error('사원정보에서 대상을 찾지 못했습니다.');
        await upsertAttendanceOperator(emp);
      }else{
        await deactivateAttendanceOperator(id);
      }
      await refreshAccessOperatorRowsFromServer(true);
      renderAccessAutoTable();
      renderCurrentOperatorTable();
      searchAccessOperatorCandidates();
      if(msg){
        msg.textContent = shouldAdd ? '운영자가 서버에 저장되었습니다.' : '운영자 해제가 서버에서 삭제되었습니다.';
        msg.classList.add('show');
        clearTimeout(window.__accessSaveMsgTimer);
        window.__accessSaveMsgTimer = setTimeout(function(){ msg.classList.remove('show'); }, 2200);
      }
    }catch(e){
      console.error('[ACCESS OPERATOR] 저장/해제 실패:', e);
      alert('운영자 서버 반영 실패: ' + (e?.message || e));
    }
  }
  function renderAccessSettings(){
    try{ localStorage.removeItem(LEGACY_OPERATOR_KEY); }catch(_e){}
    renderAccessAutoTable();
    refreshAccessAdminRowsFromSettings(false).then(function(){ renderAccessAutoTable(); }).catch(function(){});
    refreshAccessOperatorRowsFromServer(true).then(function(){
      renderAccessAutoTable();
      renderCurrentOperatorTable();
      var resultBody = document.getElementById('accessOperatorResultTbody');
      if(resultBody && !String(document.getElementById('accessOperatorKeyword')?.value || '').trim()){
        resultBody.innerHTML = '<tr><td colspan="7" class="accessEmpty">검색어를 입력한 뒤 사원 검색을 눌러주세요.</td></tr>';
      }else{
        searchAccessOperatorCandidates();
      }
    }).catch(function(){ renderCurrentOperatorTable(); });
  }
  function bindAccessSettingEvents(){
    var keyword = document.getElementById('accessOperatorKeyword');
    if(keyword && !keyword.__accessBound){
      keyword.__accessBound = true;
      keyword.addEventListener('keydown', function(e){
        if(e.key === 'Enter') searchAccessOperatorCandidates();
      });
    }
    var searchBtn = document.getElementById('accessOperatorSearchBtn');
    if(searchBtn && !searchBtn.__accessBound){
      searchBtn.__accessBound = true;
      searchBtn.addEventListener('click', searchAccessOperatorCandidates);
    }
    var refreshBtn = document.getElementById('accessOperatorRefreshBtn');
    if(refreshBtn && !refreshBtn.__accessBound){
      refreshBtn.__accessBound = true;
      refreshBtn.addEventListener('click', function(){ ACCESS_ADMIN_STATE.loaded = false; ACCESS_OPERATOR_STATE.loaded = false; renderAccessSettings(); });
    }
    var panel = document.getElementById('adminFeatureAccessPanel');
    if(panel && !panel.__accessOperatorDelegated){
      panel.__accessOperatorDelegated = true;
      panel.addEventListener('click', function(e){
        var addBtn = e.target.closest('[data-access-operator-add]');
        if(addBtn){ setAccessOperator(addBtn.getAttribute('data-access-operator-add'), true); return; }
        var removeBtn = e.target.closest('[data-access-operator-remove]');
        if(removeBtn){ setAccessOperator(removeBtn.getAttribute('data-access-operator-remove'), false); }
      });
    }
  }
  function initAdminFeatureTabs(){
    var root = document.getElementById('main-admin');
    if(!root) return;
    var buttons = root.querySelectorAll('[data-admin-feature]');
    var uploadPanel = document.getElementById('adminFeatureUploadPanel');
    var accessPanel = document.getElementById('adminFeatureAccessPanel');
    if(!buttons.length || !uploadPanel || !accessPanel) return;
    buttons.forEach(function(btn){
      if(btn.__adminFeatureBound) return;
      btn.__adminFeatureBound = true;
      btn.addEventListener('click', function(){
        if(typeof isCurrentAttendanceAdmin === 'function' && !isCurrentAttendanceAdmin()){
          alert('관리자만 접근할 수 있습니다.');
          if(typeof applyAttendanceAdminVisibility === 'function') applyAttendanceAdminVisibility(false);
          if(typeof activateMainTabWithoutRender === 'function') activateMainTabWithoutRender('attendance');
          return;
        }
        var target = btn.getAttribute('data-admin-feature');
        buttons.forEach(function(b){ b.classList.toggle('active', b === btn); });
        uploadPanel.classList.toggle('active', target === 'upload');
        accessPanel.classList.toggle('active', target === 'access');
        uploadPanel.setAttribute('aria-hidden', target === 'upload' ? 'false' : 'true');
        accessPanel.setAttribute('aria-hidden', target === 'access' ? 'false' : 'true');
        if(target === 'access'){
          bindAccessSettingEvents();
          renderAccessSettings();
        }
      });
    });
    bindAccessSettingEvents();
    renderAccessSettings();
  }
  window.renderAttendanceAccessSettings = renderAccessSettings;
  window.refreshAttendanceAccessAdminSettings = function(){ ACCESS_ADMIN_STATE.loaded = false; return refreshAccessAdminRowsFromSettings(true).then(function(){ renderAccessAutoTable(); }); }; 
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminFeatureTabs);
  else initAdminFeatureTabs();
})();

/* portal bridge moved to ./portal-bridge.js */
