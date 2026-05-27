/* portal-home-auth-session.js | Phase 1 split from original portal-home.html
   원본 inline script #6를 실행 순서 그대로 외부 파일로 분리했습니다. */

(function(){
  const URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";
  if(!window.supabase || !window.supabase.createClient) return;
  if (!window.portalSupabase) {
    window.portalSupabase = window.supabase.createClient(URL, KEY);
  }
  function getParentPortalSession(){
    try{
      if(window.parent && window.parent !== window && typeof window.parent.getPortalSession === 'function'){
        return window.parent.getPortalSession();
      }
    }catch(_){}
    try{
      if(window.parent && window.parent !== window && window.parent.portalSession){
        return window.parent.portalSession;
      }
    }catch(_){}
    return window.portalSession || window.currentPortalSession || null;
  }

  function getActiveCompanyId(){
    const session = getParentPortalSession() || window.portalSession || window.currentPortalSession || {};
    return String(
      session.activeCompanyId ||
      session.active_company_id ||
      session.selectedCompanyId ||
      session.selected_company_id ||
      session.activeCompany?.id ||
      session.active_company?.id ||
      session.companyId ||
      session.company_id ||
      session.company?.id ||
      session.profile?.company_id ||
      window.currentCompanyId ||
      ''
    ).trim();
  }

  function getActiveCompanyName(){
    const session = getParentPortalSession() || window.portalSession || window.currentPortalSession || {};
    return String(
      session.activeCompanyName ||
      session.active_company_name ||
      session.activeCompany?.company_name ||
      session.active_company?.company_name ||
      session.companyName ||
      session.company_name ||
      session.company?.company_name ||
      window.currentCompanyName ||
      ''
    ).trim();
  }

  function publishChildTenantSession(){
    const parent = getParentPortalSession() || {};
    const companyId = getActiveCompanyId();
    const companyName = getActiveCompanyName();
    const merged = {
      ...parent,
      supabase: window.portalSupabase,
      companyId,
      company_id: companyId,
      activeCompanyId: companyId,
      active_company_id: companyId,
      companyName,
      company_name: companyName,
      activeCompanyName: companyName,
      active_company_name: companyName
    };
    window.portalSession = merged;
    window.currentPortalSession = merged;
    window.currentCompanyId = companyId;
    window.currentCompanyName = companyName;
    return merged;
  }

  function addCompanyIdToPayload(payload, companyId){
    if(!companyId) return payload;
    if(Array.isArray(payload)){
      return payload.map(row => row && typeof row === 'object' ? { ...row, company_id: row.company_id || companyId } : row);
    }
    if(payload && typeof payload === 'object'){
      return { ...payload, company_id: payload.company_id || companyId };
    }
    return payload;
  }

  const TENANT_TABLES = new Set([
    'activity_logs','app_role_assignments','approval_logs',
    'divisions','teams','employees','managed_teams','users',
    'employee_special_notes','team_change_history',
    'portal_memos','portal_schedules','portal_reservations','portal_reservation_resources',
    'research_staff_profiles','system_settings','user_app_roles',
    'wastewater','wastewater_approvers','wastewater_pickups',
    'attendance_records','attendance_erp_raw','attendance_secom_raw','attendance_upload_batches','attendance_upload_logs'
  ]);

  function createScopedBuilder(initialBuilder, tableName, alreadyScoped){
    const state = { builder: initialBuilder, scoped: !!alreadyScoped };
    const shouldScope = () => TENANT_TABLES.has(String(tableName || ''));
    const ensureScope = () => {
      const companyId = getActiveCompanyId();
      if(!shouldScope() || !companyId || state.scoped) return;
      try{
        if(state.builder && typeof state.builder.eq === 'function'){
          state.builder = state.builder.eq('company_id', companyId);
          state.scoped = true;
        }
      }catch(error){
        console.warn('[portal-home-auth-session] company scope failed:', tableName, error);
      }
    };

    return new Proxy({}, {
      get(_target, prop){
        if(prop === 'then'){
          ensureScope();
          return state.builder.then.bind(state.builder);
        }
        if(prop === 'catch'){
          ensureScope();
          return state.builder.catch.bind(state.builder);
        }
        if(prop === 'finally'){
          ensureScope();
          return state.builder.finally.bind(state.builder);
        }

        const value = state.builder[prop];
        if(typeof value !== 'function') return value;

        return function(...args){
          const companyId = getActiveCompanyId();

          if((prop === 'insert' || prop === 'upsert') && shouldScope()){
            args[0] = addCompanyIdToPayload(args[0], companyId);
          }

          if((prop === 'single' || prop === 'maybeSingle' || prop === 'csv' || prop === 'geojson' || prop === 'explain') && shouldScope()){
            ensureScope();
          }

          const next = value.apply(state.builder, args);
          if(next && typeof next === 'object'){
            return createScopedBuilder(next, tableName, state.scoped);
          }
          return next;
        };
      }
    });
  }

  function createTenantScopedClient(baseClient){
    return new Proxy(baseClient, {
      get(target, prop){
        if(prop === 'from'){
          return function(tableName){
            const builder = target.from(tableName);
            return createScopedBuilder(builder, tableName, false);
          };
        }
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }

  const rawSupabaseClient = window.portalSupabase;
  publishChildTenantSession();
  const sb = createTenantScopedClient(rawSupabaseClient);

  const dataState = {
    divisions: [],
    teams: [],
    employees: [],
    users: [],
    teamHistory: [],
    specialNotes: [],
    reservationResources: [],
    selectedTeamChangeNos: new Set(),
    editingIssueId: null,
    editingDivisionCode: null,
    editingTeamCode: null
  };

  const $ = (id)=>document.getElementById(id);
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const isVirtualTeam = (team) => {
    if(!team) return false;
    return !!team.is_virtual || String(team.team_code || '') === String(team.division_code || '');
  };
  const setFeedback = (id, msg, variant=false) => {
    const el=$(id); if(!el) return;
    el.textContent = msg || '';
    let cls = 'real-feedback';
    if(msg){
      if(variant === 'loading') cls += ' loading';
      else if(variant === true) cls += ' ok';
      else cls += ' error';
    }
    el.className = cls;
  };


  function syncLocalEmployeeRow(payload){
    const managedCodes = ($('realEmpManagedTeams')?.value || '').split(',').map(v=>v.trim()).filter(Boolean).join(', ');
    const row = {
      employee_no: payload.employee_no,
      name: payload.name,
      sort_order: payload.sort_order,
      division_code: payload.division_code,
      team_code: payload.team_code,
      grade: payload.grade,
      authority: payload.authority,
      email: payload.email,
      managed_team_codes: managedCodes || null,
      attendance_target: !!payload.attendance_target,
      status: payload.status,
      join_date: payload.join_date,
      leave_date: payload.leave_date,
      leave_reason: payload.leave_reason,
      memo: payload.memo,
      role: payload.role || 'viewer'
    };
    const idx = dataState.employees.findIndex(e => String(e.employee_no) === String(payload.employee_no));
    if(idx >= 0) dataState.employees[idx] = { ...dataState.employees[idx], ...row };
    else dataState.employees.unshift(row);
    renderEmployees();
  }

  async function ensurePortalUserRow(payload){
    try{
      const emailLower = String(payload.email || '').trim().toLowerCase();
      const emailRaw = String(payload.email_raw || payload.email || '').trim();
      const role = payload.role || 'viewer';
      const empNo = String(payload.employee_no || '').trim();

      let canonicalEmail = emailLower;
      const hitLower = await sb.from('users').select('email').eq('email', emailLower).maybeSingle();
      if(!hitLower.error && hitLower.data && hitLower.data.email) canonicalEmail = hitLower.data.email;
      else if(emailRaw && emailRaw !== emailLower){
        const hitRaw = await sb.from('users').select('email').eq('email', emailRaw).maybeSingle();
        if(!hitRaw.error && hitRaw.data && hitRaw.data.email) canonicalEmail = hitRaw.data.email;
      }

      const portalUser = {
        email: canonicalEmail,
        name: payload.name,
        role,
        is_active: payload.is_active !== false,
        must_change_password: true,
        employee_no: payload.employee_no,
        updated_at: new Date().toISOString()
      };
      const res = await sb.from('users').upsert(portalUser, { onConflict: 'email' }).select();
      if(res.error) return { ok:false, error: res.error };

      let roleRes = await sb.from('users').update({ role }).eq('email', canonicalEmail).select();
      if((!roleRes.data || !roleRes.data.length) && empNo && !roleRes.error){
        roleRes = await sb.from('users').update({ role }).eq('employee_no', empNo).select();
      }
      if(roleRes.error) return { ok:false, error: roleRes.error };

      const row = (roleRes.data && roleRes.data[0]) || (res.data && res.data[0]) || null;
      if(!row){
        return { ok:false, error: { message: 'public.users에 반영된 행을 찾지 못했습니다. email·employee_no 매칭·RLS(select/update)를 확인하세요.' } };
      }
      if(String(row.role || '') !== String(role)){
        return { ok:false, error: { message: `users.role이 ${role}(으)로 저장되지 않았습니다(현재 ${row.role}). Edge Function·DB 트리거·다른 동기화가 덮어쓰는지 확인하세요.` } };
      }

      const rowEmailKey = String(row.email || '').toLowerCase();
      dataState.users = (dataState.users || []).filter(u => String(u.email||'').toLowerCase() !== rowEmailKey);
      dataState.users.push(row);
      dataState.users.sort((a,b)=>String(a.email||'').localeCompare(String(b.email||'')));
      return { ok:true };
    }catch(err){
      return { ok:false, error: err };
    }
  }

  async function safeSelect(table, query){
    try{
      let q = sb.from(table).select(query || '*');
      const { data, error } = await q;
      if(error) throw error;
      return { data: data || [], error: null };
    }catch(err){
      return { data: [], error: err };
    }
  }

  function fillDivisionSelects(){
    const activeDivs = dataState.divisions.filter(d=>d.is_active !== false);
    ['realOrgDivisionFilter','realTeamDivisionCode','realEmpDivisionFilter','realEmpDivisionSelect','realBeforeDivision','realAfterDivision','realIssueDivision'].forEach(id=>{
      const el=$(id); if(!el) return;
      const current = el.value;
      let placeholder = '<option value="">' + (id.includes('Issue')||id.includes('Before')||id.includes('After')||id.includes('EmpDivisionSelect')||id==='realTeamDivisionCode' ? '선택' : '전체 본부') + '</option>';
      el.innerHTML = placeholder + activeDivs.map(d=>`<option value="${esc(d.division_code)}">${esc(d.division_name)} ${esc(d.division_code)}</option>`).join('');
      if(activeDivs.some(d=>d.division_code===current)) el.value=current;
    });
  }

  function fillTeamSelect(selectId, divisionCode, includeAll=false, selectedValue=''){
    const el=$(selectId); if(!el) return;
    const current = selectedValue || el.value || '';
    let teams = dataState.teams.filter(t=>t.is_active !== false);
    if(divisionCode) teams = teams.filter(t=>t.division_code===divisionCode);

    let visibleTeams = teams.filter(t => isVirtualTeam(t) || t.team_code !== t.division_code);

    if(current && !visibleTeams.some(t=>t.team_code===current)){
      const fallback = dataState.teams.find(t => t.team_code===current && (!divisionCode || t.division_code===divisionCode));
      if(fallback) visibleTeams = [fallback, ...visibleTeams];
    }

    const ph = includeAll ? '<option value="">전체 팀</option>' : '<option value="">선택</option>';
    el.innerHTML = ph + visibleTeams.map(t=>`<option value="${esc(t.team_code)}">${esc(t.team_name)} (${esc(t.team_code)})${isVirtualTeam(t) ? ' · 가상' : ''}</option>`).join('');
    if(current && visibleTeams.some(t=>t.team_code===current)) el.value=current;
  }

  function renderOrganizations(){
    const container=$('realOrgTree');
    if(!container) return;
    const divFilter = $('realOrgDivisionFilter')?.value || '';
    const teamFilter = $('realOrgTeamFilter')?.value || '';
    let divisions = dataState.divisions.slice();
    if(divFilter) divisions = divisions.filter(d=>d.division_code===divFilter);
    if(!divisions.length){
      container.innerHTML = '<div class="real-empty">표시할 조직이 없습니다.</div>';
      return;
    }
    const allTeams = dataState.teams.slice();
    const visibleAllTeams = allTeams.filter(t => (isVirtualTeam(t) || t.team_code !== t.division_code) && t.is_active !== false);
    const realTeamCount = visibleAllTeams.filter(t=>!isVirtualTeam(t)).length;
    const virtualTeamCount = visibleAllTeams.filter(t=>isVirtualTeam(t)).length;
    $('realOrgSummary').textContent = `본부 ${dataState.divisions.filter(d=>d.is_active!==false).length}개 / 실제팀 ${realTeamCount}개 / 가상팀 ${virtualTeamCount}개`;
    container.innerHTML = divisions.map(div=>{
      let teams = allTeams.filter(t=>t.division_code===div.division_code);
      teams = teams.filter(t => isVirtualTeam(t) || t.team_code !== t.division_code);
      if(teamFilter) teams = teams.filter(t=>t.team_code===teamFilter);
      const activeTeams = teams.filter(t=>t.is_active!==false);
      const realCnt = activeTeams.filter(t=>!isVirtualTeam(t)).length;
      const virCnt = activeTeams.filter(t=>isVirtualTeam(t)).length;
      return `<div class="real-division-card">
        <div class="real-division-head">
          <div>
            <div class="real-division-name">${esc(div.division_name)} (${esc(div.division_code)})</div>
            <div class="real-division-sub">${div.is_active!==false ? '사용중' : '미사용'} · 실제팀 ${realCnt}개 / 가상팀 ${virCnt}개</div>
          </div>
          <div class="real-actions left">
            <span class="real-status-chip ${div.is_active!==false?'active':'inactive'}">${div.is_active!==false?'사용중':'미사용'}</span>
            <button class="real-btn ghost" data-div-edit="${esc(div.division_code)}">수정</button>
            <button class="real-btn ghost" data-div-toggle="${esc(div.division_code)}">${div.is_active!==false?'미사용':'사용'}</button>
            <button class="real-btn danger" data-div-delete="${esc(div.division_code)}">삭제</button>
          </div>
        </div>
        <div class="real-team-grid">
          ${teams.map(team=>`<div class="real-team-card">
            <div class="real-team-main">
              <strong>${esc(team.team_name)} (${esc(team.team_code)})</strong>
              <div class="real-division-sub">${team.is_active!==false ? '사용중' : '미사용'}${isVirtualTeam(team) ? ' · 가상팀' : ''}</div>
            </div>
            <div class="real-actions left compact">
              <span class="real-status-chip ${team.is_active!==false?'active':'inactive'}">${team.is_active!==false?'사용중':'미사용'}</span>
              <button class="real-btn ghost" data-team-edit="${esc(team.team_code)}">수정</button>
              <button class="real-btn ghost" data-team-toggle="${esc(team.team_code)}">${team.is_active!==false?'미사용':'사용'}</button>
              <button class="real-btn danger" data-team-delete="${esc(team.team_code)}">삭제</button>
            </div>
          </div>`).join('') || '<div class="real-empty">표시할 팀이 없습니다.</div>'}
        </div>
      </div>`;
    }).join('');
  }

  async function loadOrgData(){
    const [divRes, teamRes] = await Promise.all([
      sb.from('divisions').select('*').order('division_code'),
      sb.from('teams').select('*').order('division_code').order('team_code')
    ]);
    if(divRes.error){ setFeedback('realOrgFeedback', divRes.error.message); return; }
    if(teamRes.error){ setFeedback('realOrgFeedback', teamRes.error.message); return; }
    dataState.divisions = divRes.data || [];
    dataState.teams = teamRes.data || [];
    fillDivisionSelects();
    fillTeamSelect('realOrgTeamFilter', $('realOrgDivisionFilter')?.value || '', true);
    fillTeamSelect('realEmpTeamFilter', $('realEmpDivisionFilter')?.value || '', true);
    fillTeamSelect('realEmpTeamSelect', $('realEmpDivisionSelect')?.value || '');
    fillTeamSelect('realBeforeTeam', $('realBeforeDivision')?.value || '');
    fillTeamSelect('realAfterTeam', $('realAfterDivision')?.value || '');
    fillTeamSelect('realIssueTeam', $('realIssueDivision')?.value || '');
    renderOrganizations();
    renderEmployees();
    renderTeamCandidates();
    renderSpecialEmployeeOptions();
  }

  function resetDivisionForm(){
    dataState.editingDivisionCode = null;
    if($('realDivisionCode')){
      $('realDivisionCode').value = '';
      $('realDivisionCode').disabled = false;
    }
    if($('realDivisionName')) $('realDivisionName').value = '';
    if($('realAddDivisionBtn')) $('realAddDivisionBtn').textContent = '본부 추가';
    if($('realCancelDivisionBtn')) $('realCancelDivisionBtn').style.display = 'none';
  }

  function resetTeamForm(){
    dataState.editingTeamCode = null;
    if($('realTeamDivisionCode')) $('realTeamDivisionCode').value = '';
    if($('realTeamCode')){
      $('realTeamCode').value = '';
      $('realTeamCode').disabled = false;
    }
    if($('realTeamName')) $('realTeamName').value = '';
    if($('realTeamVirtual')) $('realTeamVirtual').value = 'false';
    if($('realTeamActive')) $('realTeamActive').value = 'true';
    if($('realAddTeamBtn')) $('realAddTeamBtn').textContent = '팀 추가';
    if($('realCancelTeamBtn')) $('realCancelTeamBtn').style.display = 'none';
  }

  function resetOrganizationForms(){
    resetDivisionForm();
    resetTeamForm();
  }

  async function addDivision(){
    const code=$('realDivisionCode').value.trim();
    const name=$('realDivisionName').value.trim();
    if(!code || !name){ setFeedback('realOrgFeedback','본부 코드와 본부명을 입력하세요.'); return; }

    if(dataState.editingDivisionCode){
      const payload={ division_name:name };
      const {error}=await sb.from('divisions').update(payload).eq('division_code', dataState.editingDivisionCode);
      if(error){ setFeedback('realOrgFeedback', error.message); return; }
      setFeedback('realOrgFeedback','본부 정보를 수정했습니다.', true);
    }else{
      const payload={division_code:code, division_name:name, is_active:true};
      const {error}=await sb.from('divisions').insert([payload]);
      if(error){ setFeedback('realOrgFeedback', error.message); return; }
      setFeedback('realOrgFeedback','본부를 추가했습니다.', true);
    }

    resetDivisionForm();
    await loadOrgData();
  }

  async function addTeam(){
    const division=$('realTeamDivisionCode').value;
    const code=$('realTeamCode').value.trim();
    const name=$('realTeamName').value.trim();
    if(!division || !code || !name){ setFeedback('realOrgFeedback','소속 본부, 팀 코드, 팀명을 입력하세요.'); return; }

    const payload={
      division_code:division,
      team_name:name,
      is_virtual:($('realTeamVirtual').value==='true') || code === division,
      is_active:$('realTeamActive').value==='true'
    };

    if(dataState.editingTeamCode){
      const {error}=await sb.from('teams').update(payload).eq('team_code', dataState.editingTeamCode);
      if(error){ setFeedback('realOrgFeedback', error.message); return; }
      setFeedback('realOrgFeedback','팀 정보를 수정했습니다.', true);
    }else{
      const insertPayload={
        team_code:code,
        ...payload
      };
      const {error}=await sb.from('teams').insert([insertPayload]);
      if(error){ setFeedback('realOrgFeedback', error.message); return; }
      setFeedback('realOrgFeedback','팀을 추가했습니다.', true);
    }

    resetTeamForm();
    await loadOrgData();
  }

  async function toggleDivision(code, nextActive){
    const {error}=await sb.from('divisions').update({is_active:nextActive}).eq('division_code', code);
    if(error){ setFeedback('realOrgFeedback', error.message); return; }
    await loadOrgData();
  }
  async function deleteDivision(code){
    const {error}=await sb.from('divisions').delete().eq('division_code', code);
    if(error){ setFeedback('realOrgFeedback', error.message); return; }
    await loadOrgData();
  }
  async function toggleTeam(code, nextActive){
    const {error}=await sb.from('teams').update({is_active:nextActive}).eq('team_code', code);
    if(error){ setFeedback('realOrgFeedback', error.message); return; }
    await loadOrgData();
  }
  async function deleteTeam(code){
    const {error}=await sb.from('teams').delete().eq('team_code', code);
    if(error){ setFeedback('realOrgFeedback', error.message); return; }
    await loadOrgData();
  }

  function editDivision(code){
    const row = dataState.divisions.find(d=>d.division_code===code);
    if(!row) return;
    dataState.editingDivisionCode = row.division_code;
    $('realDivisionCode').value=row.division_code;
    $('realDivisionCode').disabled=true;
    $('realDivisionName').value=row.division_name;
    $('realAddDivisionBtn').textContent='본부 수정 저장';
    $('realCancelDivisionBtn').style.display='inline-flex';
    setFeedback('realOrgFeedback', `본부 수정 모드: ${row.division_name} (${row.division_code})`, true);
  }
  function editTeam(code){
    const row = dataState.teams.find(t=>t.team_code===code);
    if(!row) return;
    dataState.editingTeamCode = row.team_code;
    $('realTeamDivisionCode').value=row.division_code;
    $('realTeamCode').value=row.team_code;
    $('realTeamCode').disabled=true;
    $('realTeamName').value=row.team_name;
    $('realTeamVirtual').value=String(!!row.is_virtual);
    $('realTeamActive').value=String(!!row.is_active);
    $('realAddTeamBtn').textContent='팀 수정 저장';
    $('realCancelTeamBtn').style.display='inline-flex';
    setFeedback('realOrgFeedback', `팀 수정 모드: ${row.team_name} (${row.team_code})`, true);
  }

  async function loadEmployees(){
    const [empRes, managedRes] = await Promise.all([
      sb.from('employees').select('*').order('division_code').order('team_code').order('sort_order'),
      safeSelect('managed_teams','*')
    ]);
    if(empRes.error){
      $('realEmployeeTbody').innerHTML='<tr><td colspan="15" class="real-empty-row">'+esc(empRes.error.message)+'</td></tr>'; return;
    }
    const managedMap = new Map();
    (managedRes.data || []).forEach(row=>{
      const empNo = String(row.manager_employee_no || '').trim();
      const teamCode = String(row.team_code || '').trim();
      if(!empNo || !teamCode) return;
      if(!managedMap.has(empNo)) managedMap.set(empNo, []);
      managedMap.get(empNo).push(teamCode);
    });
    dataState.managedTeamsMap = managedMap;
    dataState.employees = (empRes.data || []).map(e=>({
      ...e,
      managed_team_codes: (managedMap.get(String(e.employee_no)) || []).join(', ')
    }));
    renderEmployees();
    renderTeamCandidates();
    renderSpecialEmployeeOptions();
  }

  function uniqueSorted(arr){
    return [...new Set(arr.map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  }

  function populateEmployeeModalSelectOptions(){
    const gradeOrder = ['사원','주임','대리','과장','차장','부장','이사부장','이사','전무'];
    const authorityOrder = ['팀원','팀장','담당','소장'];
    const leaveReasonDefaults = ['자발적 이직','개인사유','권고퇴직','계약만료','정년퇴직','기타'];

    const orderedUnique = (baseOrder, values) => {
      const cleaned = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
      return cleaned.sort((a, b) => {
        const ai = baseOrder.indexOf(a);
        const bi = baseOrder.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b, 'ko');
      });
    };

    const grades = orderedUnique(gradeOrder, [...gradeOrder, ...dataState.employees.map(e=>e.grade)]);
    const authorities = orderedUnique(authorityOrder, [...authorityOrder, ...dataState.employees.map(e=>e.authority)]);
    const leaveReasons = uniqueSorted([...leaveReasonDefaults, ...dataState.employees.map(e=>e.leave_reason)]);

    const gradeEl = $('realEmpGrade');
    const authorityEl = $('realEmpAuthority');
    const leaveReasonEl = $('realEmpLeaveReason');

    if(gradeEl){
      const current = gradeEl.value;
      gradeEl.innerHTML = '<option value="">선택</option>' + grades.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
      if(grades.includes(current)) gradeEl.value = current;
    }
    if(authorityEl){
      const current = authorityEl.value;
      authorityEl.innerHTML = '<option value="">선택</option>' + authorities.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
      if(authorities.includes(current)) authorityEl.value = current;
    }
    if(leaveReasonEl){
      const current = leaveReasonEl.value;
      leaveReasonEl.innerHTML = '<option value="">선택</option>' + leaveReasons.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
      if(leaveReasons.includes(current)) leaveReasonEl.value = current;
    }
  }

  function renderEmployees(){
    const tbody=$('realEmployeeTbody'); if(!tbody) return;
    const search=($('realEmpSearch')?.value || '').trim().toLowerCase();
    const div=($('realEmpDivisionFilter')?.value || '');
    const team=($('realEmpTeamFilter')?.value || '');
    const status=($('realEmpStatusFilter')?.value || '');
    const gradeFilter=($('realEmpGradeFilter')?.value || '');
    const authorityFilter=($('realEmpAuthorityFilter')?.value || '');
    let rows = dataState.employees.slice();
    if(search){
      rows = rows.filter(e=>{
        const n = String(e.name||'').toLowerCase();
        const no = String(e.employee_no||'').toLowerCase();
        const em = String(e.email||'').toLowerCase();
        return n.includes(search) || no.includes(search) || em.includes(search);
      });
    }
    if(div) rows = rows.filter(e=>e.division_code===div);
    if(team) rows = rows.filter(e=>e.team_code===team);
    if(status) rows = rows.filter(e=>e.status===status);
    if(gradeFilter) rows = rows.filter(e=>String(e.grade||'')===gradeFilter);
    if(authorityFilter) rows = rows.filter(e=>String(e.authority||'')===authorityFilter);

    populateEmployeeModalSelectOptions();

    const gradeSelect = $('realEmpGradeFilter');
    const authoritySelect = $('realEmpAuthorityFilter');
    if(gradeSelect){
      const current = gradeSelect.value;
      const grades = [...new Set(dataState.employees.map(e=>String(e.grade||'').trim()).filter(Boolean))];
      gradeSelect.innerHTML = '<option value="">전체 직급</option>' + grades.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
      if(grades.includes(current)) gradeSelect.value = current;
    }
    if(authoritySelect){
      const current = authoritySelect.value;
      const authorities = [...new Set(dataState.employees.map(e=>String(e.authority||'').trim()).filter(Boolean))];
      authoritySelect.innerHTML = '<option value="">전체 직책</option>' + authorities.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
      if(authorities.includes(current)) authoritySelect.value = current;
    }

    $('realEmpTotalStat').textContent = `전체 ${dataState.employees.length}명`;
    $('realEmpActiveStat').textContent = `재직 ${dataState.employees.filter(e=>e.status!=='퇴사').length}명`;
    $('realEmpLeaveStat').textContent = `퇴사 ${dataState.employees.filter(e=>e.status==='퇴사').length}명`;
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="15" class="real-empty-row">표시할 사원이 없습니다.</td></tr>'; return;
    }
    tbody.innerHTML = rows.map(e=>{
      const divName = dataState.divisions.find(d=>d.division_code===e.division_code)?.division_name || e.division_code || '-';
      const teamName = dataState.teams.find(t=>t.team_code===e.team_code)?.team_name || e.team_code || '-';
      return `<tr>
        <td>${esc(e.employee_no)}</td>
        <td><div><strong>${esc(e.name)}</strong></div><div class="real-box-sub" style="font-size:12px;margin-top:2px;line-height:1.35;">${esc(e.employee_no || '-')} / ${esc(e.email || '-')}</div></td>
        <td>${esc(e.sort_order ?? '-')}</td>
        <td>${esc(divName)}<br>${esc(e.division_code || '')}</td>
        <td>${esc(teamName)}<br>${esc(e.team_code || '')}</td>
        <td>${esc(e.grade || '-')}</td>
        <td>${esc(e.authority || '-')}</td>
        <td>${esc(e.email || '-')}</td>
        <td>${esc(e.managed_team_codes || '-')}</td>
        <td>${e.attendance_target ? 'Y' : 'N'}</td>
        <td><span class="real-status-chip ${e.status==='퇴사'?'inactive':'active'}">${esc(e.status || '-')}</span></td>
        <td>${esc(e.join_date || '-')}</td>
        <td>${esc(e.leave_date || '-')}</td>
        <td>${esc(e.leave_reason || '-')}</td>
        <td>-</td>
        <td>
          <div class="real-actions left" style="margin-top:0;">
            <button class="real-btn ghost" data-emp-edit="${esc(e.employee_no)}">수정</button>
            <button class="real-btn danger" data-emp-delete="${esc(e.employee_no)}">삭제</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function updateEmpRoleHint(){
    const hint = $('realEmpRoleLinkHint');
    if(!hint) return;
    const em = ($('realEmpEmail')?.value || '').trim();
    hint.textContent = em
      ? `이 권한은 아래 이메일과 같은 public.users 행의 role에 저장됩니다. (${em})`
      : '이메일을 입력한 뒤 저장하면 해당 이메일 기준 public.users.role에 반영됩니다.';
  }

  function setEmployeeModalSummary(row){
    const box = $('realEmployeeModalSummary');
    if(!box) return;
    if(!row){
      box.innerHTML = '<div><strong>신규 등록</strong></div><div class="real-box-sub" style="margin-top:6px;">employees는 <strong>사번</strong>, 로그인·권한(public.users)은 <strong>이메일</strong> 기준으로 연결됩니다. 동명이인·비슷한 이름은 사번·이메일로 구분하세요.</div>';
      return;
    }
    box.innerHTML = '<div style="margin-bottom:6px;"><strong>현재 수정 대상</strong> <span class="real-box-sub">(사번·이메일·이름)</span></div>'
      + `<div><strong>사번</strong> ${esc(String(row.employee_no||'-'))}</div>`
      + `<div><strong>이메일</strong> ${esc(String(row.email||'-'))}</div>`
      + `<div><strong>이름</strong> ${esc(String(row.name||'-'))}</div>`
      + '<div class="real-box-sub" style="margin-top:8px;">권한(users.role)은 위 이메일과 동일한 public.users 행에만 반영됩니다.</div>';
  }

  function fillEmployeeForm(employeeNo=''){
    setFeedback('realEmployeeFeedback','');
    populateEmployeeModalSelectOptions();
    const row = dataState.employees.find(e=>e.employee_no===employeeNo);
    if(!row){
      setEmployeeModalSummary(null);
      $('realEmpNo').value=''; $('realEmpName').value=''; $('realEmpSort').value='1'; $('realEmpEmail').value='';
      $('realEmpDivisionSelect').value=''; fillTeamSelect('realEmpTeamSelect','');
      $('realEmpGrade').value=''; $('realEmpAuthority').value=''; $('realEmpManagedTeams').value=''; $('realEmpAttendance').value='true';
      $('realEmpStatus').value='재직'; $('realEmpJoinDate').value=''; $('realEmpLeaveDate').value=''; $('realEmpLeaveReason').value=''; $('realEmpMemo').value='';
      const newRoleEl = document.getElementById('realEmpRole');
      if (newRoleEl) newRoleEl.value = 'viewer';
      updateEmpRoleHint();
      return;
    }
    $('realEmpNo').value=row.employee_no||'';
    $('realEmpName').value=row.name||'';
    $('realEmpSort').value=row.sort_order||1;
    $('realEmpEmail').value=row.email||'';
    $('realEmpDivisionSelect').value=row.division_code||'';
    fillTeamSelect('realEmpTeamSelect', row.division_code || '', false, row.team_code || '');
    $('realEmpTeamSelect').value=row.team_code||'';
    $('realEmpGrade').value=row.grade||'';
    $('realEmpAuthority').value=row.authority||'';
    $('realEmpManagedTeams').value=row.managed_team_codes||'';
    $('realEmpAttendance').value=String(!!row.attendance_target);
    $('realEmpStatus').value=row.status||'재직';
    $('realEmpJoinDate').value=row.join_date||'';
    $('realEmpLeaveDate').value=row.leave_date||'';
    $('realEmpLeaveReason').value=row.leave_reason||'';
    $('realEmpMemo').value=row.memo||'';
    const roleEl = document.getElementById('realEmpRole');
    if (roleEl) {
      const emailKey = String(row.email || '').trim().toLowerCase();
      const userRow = emailKey && Array.isArray(dataState.users)
        ? dataState.users.find(u => String(u.email || '').trim().toLowerCase() === emailKey)
        : null;
      const portalRole = userRow?.role ?? row?.role;
      roleEl.value = portalRole === 'admin' ? 'admin' : 'viewer';
    }
    setEmployeeModalSummary(row);
    updateEmpRoleHint();
  }

  async function saveEmployee(){
    const employeeNo = $('realEmpNo').value.trim();
    const employeeName = $('realEmpName').value.trim();
    const emailRaw = $('realEmpEmail').value.trim();
    const email = emailRaw.toLowerCase();
    if(!employeeNo || !employeeName){ setFeedback('realEmployeeFeedback','사번과 이름을 입력하세요.'); return; }

    const divisionCode = $('realEmpDivisionSelect').value || '';
    const teamCode = $('realEmpTeamSelect').value || '';

    if(!divisionCode){
      setFeedback('realEmployeeFeedback','본부를 선택하세요.');
      $('realEmpDivisionSelect')?.focus();
      return;
    }
    if(!teamCode){
      setFeedback('realEmployeeFeedback','팀을 선택하세요.');
      $('realEmpTeamSelect')?.focus();
      return;
    }
    if(!email){
      setFeedback('realEmployeeFeedback','로그인에 사용할 이메일을 입력하세요.');
      $('realEmpEmail')?.focus();
      return;
    }

    const payload = {
      employee_no: employeeNo,
      name: employeeName,
      sort_order: Number($('realEmpSort').value || 1),
      division_code: divisionCode,
      team_code: teamCode,
      grade: $('realEmpGrade').value.trim() || null,
      authority: $('realEmpAuthority').value.trim() || null,
      email,
      email_raw: emailRaw || email,
      attendance_target: $('realEmpAttendance').value === 'true',
      status: $('realEmpStatus').value,
      join_date: $('realEmpJoinDate').value || null,
      leave_date: $('realEmpLeaveDate').value || null,
      leave_reason: $('realEmpLeaveReason').value.trim() || null,
      memo: $('realEmpMemo').value.trim() || null,
      is_active: $('realEmpStatus').value !== '퇴사',
      role: document.getElementById('realEmpRole')?.value || 'viewer',
    };

    const isExistingEmployee = dataState.employees.some(e => String(e.employee_no) === String(employeeNo));
    const isNewEmployee = !isExistingEmployee;

    const fbPre = $('realEmployeeFeedback');
    if(fbPre){ fbPre.classList.remove('ok'); }
    setFeedback('realEmployeeFeedback','사원정보와 로그인 계정을 저장하는 중입니다...', 'loading');

    let edgeData = null;
    let edgeOk = false;
    if(isNewEmployee){
      const { data, error } = await sb.functions.invoke('create-employee-account', { body: payload });
      edgeData = data;
      edgeOk = !error && data && data.ok === true;
      const edgeMsg = (error && error.message) || (data && data.error) || '계정/사원 저장 Edge Function 호출에 실패했습니다.';
      if(!edgeOk){
        setFeedback('realEmployeeFeedback', edgeMsg, false);
        return;
      }
    }else{
      const empUpdate = {
        name: payload.name,
        sort_order: payload.sort_order,
        division_code: payload.division_code,
        team_code: payload.team_code,
        grade: payload.grade,
        authority: payload.authority,
        email: payload.email,
        attendance_target: payload.attendance_target,
        status: payload.status,
        join_date: payload.join_date,
        leave_date: payload.leave_date,
        leave_reason: payload.leave_reason,
        memo: payload.memo,
        is_active: payload.is_active
      };
      const empRes = await sb.from('employees').update(empUpdate).eq('employee_no', payload.employee_no);
      if(empRes.error){
        setFeedback('realEmployeeFeedback', empRes.error.message, false);
        return;
      }
      edgeOk = true;
    }

    const userSync = await ensurePortalUserRow(payload);
    if(!userSync.ok){
      const syncMsg = userSync.error?.message || 'users 동기화에 실패했습니다.';
      setFeedback('realEmployeeFeedback', syncMsg, false);
      return;
    }

    const managedCodes = ($('realEmpManagedTeams').value || '').split(',').map(v=>v.trim()).filter(Boolean);
    const managedDelete = await sb.from('managed_teams').delete().eq('manager_employee_no', employeeNo);
    if(managedDelete.error){ setFeedback('realEmployeeFeedback', managedDelete.error.message); return; }
    if(managedCodes.length){
      const rows = managedCodes.map(code => ({ manager_employee_no: employeeNo, team_code: code }));
      const managedInsert = await sb.from('managed_teams').insert(rows);
      if(managedInsert.error){ setFeedback('realEmployeeFeedback', managedInsert.error.message); return; }
    }

    syncLocalEmployeeRow(payload);
    await Promise.allSettled([loadEmployees(), loadUsers()]);
    const emailKey = String(payload.email || '').trim().toLowerCase();
    const uRow = (dataState.users || []).find(x => String(x.email || '').trim().toLowerCase() === emailKey);
    const wantRole = String(payload.role || 'viewer');
    const gotRole = uRow ? String(uRow.role || 'viewer') : '';
    if(!uRow || gotRole !== wantRole){
      setFeedback('realEmployeeFeedback', `저장 후 public.users.role 확인: 기대 ${wantRole}, 실제 ${uRow ? gotRole : 'users 행 없음'}`, false);
      return;
    }
    if(isNewEmployee){
      setFeedback('realEmployeeFeedback', (edgeData && edgeData.message) || '사원정보와 로그인 계정을 저장했습니다.', true);
    }else{
      setFeedback('realEmployeeFeedback', '사원정보와 사용자 권한(public.users)을 저장했습니다.', true);
    }
    if(window.__empSaveCloseTimer) clearTimeout(window.__empSaveCloseTimer);
    window.__empSaveCloseTimer = setTimeout(()=>{
      window.__empSaveCloseTimer = null;
      if(typeof window.closeEmployeeModal === 'function') window.closeEmployeeModal();
    }, 2200);
  }

  async function deleteEmployee(employeeNo){
    const row = dataState.employees.find(e => String(e.employee_no) === String(employeeNo));
    if(!row) return;
    if(!confirm(`사원 ${row.name || employeeNo} (${row.employee_no || '-'} / ${row.email || '-'}) 을(를) 삭제할까요?
포털 기준정보와 users 프로필에서 제거되며, 기존 Auth 계정은 남을 수 있습니다.`)) return;

    setFeedback('realEmployeeFeedback', '사원정보를 삭제하는 중입니다...', 'loading');
    const managedRes = await sb.from('managed_teams').delete().eq('manager_employee_no', employeeNo);
    if(managedRes.error){ setFeedback('realEmployeeFeedback', managedRes.error.message); return; }

    if(row.email){
      const userDelete = await sb.from('users').delete().eq('email', row.email);
      if(userDelete.error){ setFeedback('realEmployeeFeedback', userDelete.error.message); return; }
      dataState.users = dataState.users.filter(u => String(u.email||'').toLowerCase() !== String(row.email||'').toLowerCase());
    }

    const empDelete = await sb.from('employees').delete().eq('employee_no', employeeNo);
    if(empDelete.error){ setFeedback('realEmployeeFeedback', empDelete.error.message); return; }

    dataState.employees = dataState.employees.filter(e => String(e.employee_no) !== String(employeeNo));
    renderEmployees();
    fillEmployeeForm('');
    setFeedback('realEmployeeFeedback', '사원정보를 삭제했습니다. 기존 Auth 계정은 남아 있어도 포털 접근은 차단됩니다.', true);
  }

  async function bulkSyncEmployeeAccounts(){
    const candidates = dataState.employees.filter(e => String(e.email||'').trim());
    if(!candidates.length){ setFeedback('realEmployeeFeedback', '이메일이 등록된 사원이 없습니다.'); return; }
    if(!confirm(`이메일이 있는 사원 ${candidates.length}명의 계정/권한을 일괄 등록할까요?`)) return;

    setFeedback('realEmployeeFeedback', '전체 계정 등록을 진행하는 중입니다...', 'loading');
    let success = 0;
    let failed = [];

    for(const emp of candidates){
      const emailKey = String(emp.email || '').trim().toLowerCase();
      const uRow = emailKey && Array.isArray(dataState.users)
        ? dataState.users.find(u => String(u.email || '').trim().toLowerCase() === emailKey)
        : null;
      const bulkRole = uRow && uRow.role === 'admin' ? 'admin' : 'viewer';
      const payload = {
        employee_no: emp.employee_no,
        name: emp.name || '',
        sort_order: Number(emp.sort_order || 1),
        division_code: emp.division_code || '',
        team_code: emp.team_code || '',
        grade: emp.grade || null,
        authority: emp.authority || null,
        email: emailKey,
        email_raw: String(emp.email || '').trim() || emailKey,
        attendance_target: !!emp.attendance_target,
        status: emp.status || '재직',
        join_date: emp.join_date || null,
        leave_date: emp.leave_date || null,
        leave_reason: emp.leave_reason || null,
        memo: emp.memo || null,
        is_active: (emp.status || '재직') !== '퇴사',
        role: bulkRole,
      };
      const { data, error } = await sb.functions.invoke('create-employee-account', { body: payload });
      if(error || !data?.ok){
        failed.push(`${emp.name || emp.employee_no}: ${(error && error.message) || data?.error || '등록 실패'}`);
        continue;
      }
      const userSync = await ensurePortalUserRow(payload);
      if(!userSync.ok){
        failed.push(`${emp.name || emp.employee_no}: ${(userSync.error && userSync.error.message) || 'users 동기화 실패'}`);
        continue;
      }
      success += 1;
    }

    await Promise.allSettled([loadEmployees(), loadUsers()]);
    if(failed.length){
      setFeedback('realEmployeeFeedback', `전체 계정 등록 완료: 성공 ${success}건, 실패 ${failed.length}건 / ${failed.slice(0,3).join(' | ')}`);
    }else{
      setFeedback('realEmployeeFeedback', `전체 계정 등록이 완료되었습니다. 성공 ${success}건`, true);
    }
  }

  async function toggleEmployeeStatus(employeeNo){
    const row = dataState.employees.find(e=>e.employee_no===employeeNo);
    if(!row) return;
    const nextStatus = row.status==='퇴사' ? '재직' : '퇴사';
    const payload = { status: nextStatus, is_active: nextStatus!=='퇴사', leave_date: nextStatus==='퇴사' ? new Date().toISOString().slice(0,10) : null, leave_reason: nextStatus==='퇴사' ? '퇴사 처리' : null };
    const {error}=await sb.from('employees').update(payload).eq('employee_no', employeeNo);
    if(error){ setFeedback('realEmployeeFeedback', error.message); return; }
    await loadEmployees();
  }

  function getCandidateEmployees(){
    const div = $('realBeforeDivision').value;
    const team = $('realBeforeTeam').value;
    const search = ($('realTeamSearchText').value || '').trim().toLowerCase();
    if(!div || !team) return [];
    return dataState.employees.filter(e => {
      if(e.status === '퇴사' || e.division_code!==div || e.team_code!==team) return false;
      if(!search) return true;
      const n = String(e.name||'').toLowerCase();
      const no = String(e.employee_no||'').toLowerCase();
      const em = String(e.email||'').toLowerCase();
      return n.includes(search) || no.includes(search) || em.includes(search);
    });
  }

  function renderTeamCandidates(){
    const box=$('realTeamCandidates'); if(!box) return;
    const rows=getCandidateEmployees();
    if(!$('realBeforeDivision').value || !$('realBeforeTeam').value){
      box.innerHTML='변경 전 본부와 팀을 모두 선택해주세요.'; $('realSelectedCountBox').textContent='선택 인원 0명'; return;
    }
    if(!rows.length){
      box.innerHTML='검색 결과가 없습니다.'; $('realSelectedCountBox').textContent='선택 인원 0명'; return;
    }
    box.innerHTML = rows.map(e=>`<label class="real-selection-row"><input type="checkbox" data-team-move-no="${esc(e.employee_no)}" ${dataState.selectedTeamChangeNos.has(e.employee_no)?'checked':''}><span>${esc(e.employee_no)}</span><span><strong>${esc(e.name)}</strong> <span class="real-box-sub" style="font-size:11px;">/ ${esc(e.email || '-')}</span></span><span>${esc(e.grade || '-')}</span></label>`).join('');
    $('realSelectedCountBox').textContent = `선택 인원 ${dataState.selectedTeamChangeNos.size}명`;
  }

  async function loadTeamHistory(){
    const {data,error}=await safeSelect('team_change_history','*');
    if(error){ $('realTeamHistory').innerHTML=`<div class="real-empty">${esc(error.message)}</div>`; return; }
    dataState.teamHistory = (data || []).sort((a,b)=>String(b.change_date||'').localeCompare(String(a.change_date||'')));
    if(!dataState.teamHistory.length){ $('realTeamHistory').innerHTML='<div class="real-empty">변경 이력이 없습니다.</div>'; return; }
    $('realTeamHistory').innerHTML = dataState.teamHistory.map(r=>`<div class="real-history-item"><strong>${esc(r.employee_name || r.employee_no)}</strong> (${esc(r.employee_no)})<br>${esc(r.before_division_code || '-')} / ${esc(r.before_team_code || '-')} → ${esc(r.after_division_code || '-')} / ${esc(r.after_team_code || '-')}<br><span class="real-box-sub">${esc(r.change_date || '')} · ${esc(r.reason || '일괄 변경')}</span></div>`).join('');
  }

  async function applyTeamChange(){
    const employeeNos = Array.from(dataState.selectedTeamChangeNos);
    const afterDiv = $('realAfterDivision').value;
    const afterTeam = $('realAfterTeam').value;
    if(!employeeNos.length || !afterDiv || !afterTeam){ setFeedback('realTeamFeedback','선택 인원과 변경 후 본부/팀을 확인하세요.'); return; }
    for(const no of employeeNos){
      const emp = dataState.employees.find(e=>e.employee_no===no);
      if(!emp) continue;
      const upd = await sb.from('employees').update({division_code: afterDiv, team_code: afterTeam}).eq('employee_no', no);
      if(upd.error){ setFeedback('realTeamFeedback', upd.error.message); return; }
      await sb.from('team_change_history').insert([{
        employee_no: no,
        employee_name: emp.name || null,
        before_division_code: emp.division_code || null,
        before_team_code: emp.team_code || null,
        after_division_code: afterDiv,
        after_team_code: afterTeam,
        change_date: new Date().toISOString().slice(0,10),
        reason: '일괄 변경'
      }]);
    }
    dataState.selectedTeamChangeNos.clear();
    setFeedback('realTeamFeedback','선택 인원을 일괄 변경했습니다.', true);
    await loadEmployees();
    await loadTeamHistory();
  }

  function renderSpecialEmployeeOptions(){
    const div = $('realIssueDivision')?.value || '';
    const team = $('realIssueTeam')?.value || '';
    let rows = dataState.employees.filter(e=>e.status!=='퇴사');
    if(div) rows = rows.filter(e=>e.division_code===div);
    if(team) rows = rows.filter(e=>e.team_code===team);
    const sel = $('realIssueEmployee'); if(!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">선택</option>' + rows.map(e=>`<option value="${esc(e.employee_no)}">${esc(e.name)} (${esc(e.employee_no)} / ${esc(e.email || '-')})</option>`).join('');
    if(rows.some(r=>r.employee_no===current)) sel.value=current;
    const emp = rows.find(r=>r.employee_no===sel.value);
    $('realIssueEmployeeNo').value = emp ? emp.employee_no : '';
  }

  async function loadSpecialNotes(){
    const {data,error}=await safeSelect('employee_special_notes','*');

    if(error){
      dataState.specialNotes = [];
      $('realIssueCount').textContent = '총 0건';
      $('realIssueTbody').innerHTML = '<tr><td colspan="10" class="real-empty-row">' + esc(error.message) + '</td></tr>';
      return;
    }

    dataState.specialNotes = (data || [])
      .map(r => ({ ...r, source:'db' }))
      .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));

    $('realIssueCount').textContent = `총 ${dataState.specialNotes.length}건`;
    if(!dataState.specialNotes.length){
      $('realIssueTbody').innerHTML='<tr><td colspan="10" class="real-empty-row">등록된 특이사항이 없습니다.</td></tr>';
      return;
    }

    $('realIssueTbody').innerHTML = dataState.specialNotes.map(r=>{
      const rowDivisionName = r.division_name || dataState.divisions.find(d => String(d.division_code||'') === String(r.division_code||''))?.division_name || r.division_code || '-';
      const rowTeamName = r.team_name || dataState.teams.find(t => String(t.team_code||'') === String(r.team_code||''))?.team_name || r.team_code || '-';
      const empForNote = dataState.employees.find(e => String(e.employee_no||'') === String(r.employee_no||''));
      const rowEmployeeLabel = empForNote
        ? `${empForNote.name || '-'} (${empForNote.employee_no || '-'} / ${empForNote.email || '-'})`
        : (r.employee_name ? `${r.employee_name} (${r.employee_no || '-'})` : String(r.employee_no || '-'));
      return `
      <tr>
        <td>${esc(rowDivisionName)}</td>
        <td>${esc(rowTeamName)}</td>
        <td>${esc(r.employee_no || '-')}</td>
        <td>${esc(rowEmployeeLabel)}</td>
        <td>${esc(r.issue_type || '-')}</td>
        <td>${esc(r.start_date || '-')} ~ ${esc(r.end_date || '-')}</td>
        <td>${esc(r.total_work_hours || '-')}</td>
        <td>${esc(r.note || '-')}</td>
        <td>${esc(String(r.created_at || '').replace('T',' ').slice(0,16) || '-')}</td>
        <td><div class="real-actions left" style="margin-top:0"><button class="real-btn ghost" data-issue-edit="${esc(r.id)}">수정</button><button class="real-btn danger" data-issue-delete="${esc(r.id)}">삭제</button></div></td>
      </tr>`;
    }).join('');
  }

  function resetIssueForm(){
    dataState.editingIssueId = null;
    dataState.editingIssueSource = null;
    ['realIssueStartDate','realIssueEndDate','realIssueWorkHours','realIssueNote','realIssueEmployeeNo'].forEach(id=>$(id).value='');
    $('realIssueType').value=''; $('realIssueEmployee').value='';
  }

  function fillIssueEdit(id){
    const row = dataState.specialNotes.find(r=>String(r.id)===String(id));
    if(!row) return;
    dataState.editingIssueId = row.id;
    dataState.editingIssueSource = row.source || 'db';
    $('realIssueDivision').value = row.division_code || '';
    fillTeamSelect('realIssueTeam', row.division_code || '');
    $('realIssueTeam').value = row.team_code || '';
    renderSpecialEmployeeOptions();
    $('realIssueEmployee').value = row.employee_no || '';
    $('realIssueEmployeeNo').value = row.employee_no || '';
    $('realIssueStartDate').value = row.start_date || '';
    $('realIssueEndDate').value = row.end_date || '';
    $('realIssueType').value = row.issue_type || '';
    $('realIssueWorkHours').value = row.total_work_hours || '';
    $('realIssueNote').value = row.note || '';
  }

  async function saveIssue(){
    const employeeNo = $('realIssueEmployee').value;
    const emp = dataState.employees.find(e=>e.employee_no===employeeNo);
    if(!emp){ setFeedback('realIssueFeedback','담당자를 선택하세요.'); return; }

    const payload = {
      division_code: emp.division_code || null,
      team_code: emp.team_code || null,
      employee_no: emp.employee_no,
      employee_name: emp.name || null,
      issue_type: $('realIssueType').value || null,
      start_date: $('realIssueStartDate').value || null,
      end_date: $('realIssueEndDate').value || null,
      total_work_hours: $('realIssueWorkHours').value || null,
      note: $('realIssueNote').value.trim() || null
    };

    const dbExists = dataState.specialNotes.some(r => String(r.id)===String(dataState.editingIssueId));
    let res;
    if(dbExists && dataState.editingIssueId){
      res = await sb.from('employee_special_notes').update(payload).eq('id', dataState.editingIssueId);
    }else{
      res = await sb.from('employee_special_notes').insert([payload]);
    }

    if(res.error){
      setFeedback('realIssueFeedback','DB 저장 실패: ' + res.error.message, false);
      return;
    }

    setFeedback('realIssueFeedback','특이사항을 저장했습니다.', true);
    resetIssueForm();
    await loadSpecialNotes();

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'special-notes-updated' }, '*');
    }
    window.postMessage({ type: 'special-notes-updated' }, '*');
  }

  async function deleteIssue(id){
    const item = dataState.specialNotes.find(r=>String(r.id)===String(id));
    if(!item) return;

    const {error}=await sb.from('employee_special_notes').delete().eq('id', id);
    if(error){ setFeedback('realIssueFeedback', error.message, false); return; }

    setFeedback('realIssueFeedback','특이사항을 삭제했습니다.', true);
    await loadSpecialNotes();

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'special-notes-updated' }, '*');
    }
    window.postMessage({ type: 'special-notes-updated' }, '*');
  }

  async function loadUsers(){
    const {data,error}=await sb.from('users').select('*').order('email');
    if(error){
      dataState.users = [];
      console.error('loadUsers', error);
      return;
    }
    dataState.users = data || [];
  }

  function renderReservationResourcesAdmin(){
    const tb = $('realResResourceTbody');
    if(!tb) return;
    const rows = dataState.reservationResources || [];
    if(!rows.length){
      tb.innerHTML = '<tr><td colspan="4" class="real-empty-row">등록된 장소가 없습니다. 위에서 추가하세요.</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r=>{
      const id = r.id;
      const nm = esc(r.name);
      const so = esc(r.sort_order);
      const ck = r.is_active ? 'checked' : '';
      return `<tr>
        <td><input type="number" class="real-input" data-res-sort="${id}" value="${so}" style="width:72px;"></td>
        <td><input type="text" class="real-input" data-res-name="${id}" value="${nm}"></td>
        <td><label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" data-res-active="${id}" ${ck}> 사용</label></td>
        <td><button type="button" class="real-btn" data-res-save="${id}">저장</button></td>
      </tr>`;
    }).join('');
  }

  async function loadReservationResourcesAdmin(){
    const tb = $('realResResourceTbody');
    if(tb) tb.innerHTML = '<tr><td colspan="4" class="real-empty-row">불러오는 중입니다.</td></tr>';
    setFeedback('realResResourceFeedback', '불러오는 중...', 'loading');
    const { data, error } = await sb.from('portal_reservation_resources')
      .select('id,name,is_active,sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if(error){
      dataState.reservationResources = [];
      if(tb) tb.innerHTML = `<tr><td colspan="4" class="real-empty-row">${esc(error.message)}</td></tr>`;
      setFeedback('realResResourceFeedback', '조회 실패: ' + error.message, false);
      return;
    }
    dataState.reservationResources = data || [];
    renderReservationResourcesAdmin();
    setFeedback('realResResourceFeedback', '', false);
  }

  async function saveReservationResourceRow(rawId){
    const id = Number(rawId);
    if (!Number.isFinite(id)) return;
    const nameInp = document.querySelector(`[data-res-name="${rawId}"]`);
    const sortInp = document.querySelector(`[data-res-sort="${rawId}"]`);
    const actInp = document.querySelector(`[data-res-active="${rawId}"]`);
    const name = (nameInp?.value || '').trim();
    const sort_order = sortInp?.value !== '' && sortInp?.value != null ? Number(sortInp.value) : 0;
    const is_active = !!actInp?.checked;
    if(!name){
      setFeedback('realResResourceFeedback', '장소명을 입력해 주세요.', false);
      return;
    }
    const { error } = await sb.from('portal_reservation_resources')
      .update({ name, sort_order, is_active })
      .eq('id', id);
    if(error){
      setFeedback('realResResourceFeedback', '저장 실패: ' + error.message, false);
      return;
    }
    setFeedback('realResResourceFeedback', '저장했습니다.', true);
    await loadReservationResourcesAdmin();
    if (typeof window.loadReservationResourcesForPortal === 'function') {
      await window.loadReservationResourcesForPortal();
    }
  }

  if (typeof window !== 'undefined') {
    window.loadReservationResourcesAdminPage = loadReservationResourcesAdmin;
  }

  function bindStaticEvents(){
    $('realOrgDivisionFilter')?.addEventListener('change', ()=>{ fillTeamSelect('realOrgTeamFilter', $('realOrgDivisionFilter').value, true); renderOrganizations(); });
    $('realOrgTeamFilter')?.addEventListener('change', renderOrganizations);
    $('realAddDivisionBtn')?.addEventListener('click', addDivision);
    $('realCancelDivisionBtn')?.addEventListener('click', ()=>{ resetDivisionForm(); setFeedback('realOrgFeedback','본부 수정이 취소되었습니다.', true); });
    $('realAddTeamBtn')?.addEventListener('click', addTeam);
    $('realCancelTeamBtn')?.addEventListener('click', ()=>{ resetTeamForm(); setFeedback('realOrgFeedback','팀 수정이 취소되었습니다.', true); });

    $('realEmpDivisionFilter')?.addEventListener('change', ()=>{ fillTeamSelect('realEmpTeamFilter', $('realEmpDivisionFilter').value, true); $('realEmpTeamFilter').value=''; renderEmployees(); });
    $('realEmpTeamFilter')?.addEventListener('change', renderEmployees);
    $('realEmpStatusFilter')?.addEventListener('change', renderEmployees);
    $('realEmpGradeFilter')?.addEventListener('change', renderEmployees);
    $('realEmpAuthorityFilter')?.addEventListener('change', renderEmployees);
    $('realEmpSearch')?.addEventListener('input', renderEmployees);
    $('realEmpDivisionSelect')?.addEventListener('change', ()=>fillTeamSelect('realEmpTeamSelect', $('realEmpDivisionSelect').value));
    $('realEmpEmail')?.addEventListener('input', updateEmpRoleHint);
    $('realEmpSaveBtn')?.addEventListener('click', saveEmployee);
    $('realEmpAddBtn')?.addEventListener('click', ()=>fillEmployeeForm(''));
    $('realEmpResetBtn')?.addEventListener('click', ()=>fillEmployeeForm(''));
    $('realEmpRefreshBtn')?.addEventListener('click', async ()=>{ await Promise.allSettled([loadEmployees(), loadUsers()]); setFeedback('realEmployeeFeedback','목록을 새로고침했습니다.', true); });

    $('realBeforeDivision')?.addEventListener('change', ()=>{ fillTeamSelect('realBeforeTeam', $('realBeforeDivision').value); renderTeamCandidates(); });
    $('realBeforeTeam')?.addEventListener('change', renderTeamCandidates);
    $('realTeamSearchBtn')?.addEventListener('click', renderTeamCandidates);
    $('realTeamSearchText')?.addEventListener('input', renderTeamCandidates);
    $('realAfterDivision')?.addEventListener('change', ()=>fillTeamSelect('realAfterTeam', $('realAfterDivision').value));
    $('realApplyTeamChangeBtn')?.addEventListener('click', applyTeamChange);
    $('realTeamSelectAllBtn')?.addEventListener('click', ()=>{
      getCandidateEmployees().forEach(e=>dataState.selectedTeamChangeNos.add(e.employee_no)); renderTeamCandidates();
    });
    $('realTeamClearBtn')?.addEventListener('click', ()=>{ dataState.selectedTeamChangeNos.clear(); renderTeamCandidates(); });

    $('realIssueDivision')?.addEventListener('change', ()=>{ fillTeamSelect('realIssueTeam', $('realIssueDivision').value); renderSpecialEmployeeOptions(); });
    $('realIssueTeam')?.addEventListener('change', renderSpecialEmployeeOptions);
    $('realIssueEmployee')?.addEventListener('change', ()=>{ const emp = dataState.employees.find(e=>e.employee_no === $('realIssueEmployee').value); $('realIssueEmployeeNo').value = emp ? emp.employee_no : ''; });
    $('realIssueSaveBtn')?.addEventListener('click', saveIssue);
    $('realIssueResetBtn')?.addEventListener('click', resetIssueForm);

    $('realResAddBtn')?.addEventListener('click', async ()=>{
      const name = ($('realResNewName')?.value || '').trim();
      if(!name){
        setFeedback('realResResourceFeedback', '장소명을 입력해 주세요.', false);
        return;
      }
      const rows = dataState.reservationResources || [];
      const maxSort = rows.length ? Math.max(...rows.map(r => Number(r.sort_order) || 0)) : 0;
      const { error } = await sb.from('portal_reservation_resources').insert([{ name, is_active: true, sort_order: maxSort + 10 }]);
      if(error){
        setFeedback('realResResourceFeedback', '추가 실패: ' + error.message, false);
        return;
      }
      if($('realResNewName')) $('realResNewName').value = '';
      setFeedback('realResResourceFeedback', '추가했습니다.', true);
      await loadReservationResourcesAdmin();
      if (typeof window.loadReservationResourcesForPortal === 'function') {
        await window.loadReservationResourcesForPortal();
      }
    });
    $('realResRefreshBtn')?.addEventListener('click', async ()=>{
      await loadReservationResourcesAdmin();
      setFeedback('realResResourceFeedback', '목록을 새로고침했습니다.', true);
    });

    document.addEventListener('click', async (e)=>{
      const divEdit = e.target.closest('[data-div-edit]'); if(divEdit) return editDivision(divEdit.dataset.divEdit);
      const divToggle = e.target.closest('[data-div-toggle]'); if(divToggle) return toggleDivision(divToggle.dataset.divToggle, divToggle.textContent.trim()==='사용');
      const divDelete = e.target.closest('[data-div-delete]'); if(divDelete) return deleteDivision(divDelete.dataset.divDelete);
      const teamEdit = e.target.closest('[data-team-edit]'); if(teamEdit) return editTeam(teamEdit.dataset.teamEdit);
      const teamToggle = e.target.closest('[data-team-toggle]'); if(teamToggle) return toggleTeam(teamToggle.dataset.teamToggle, teamToggle.textContent.trim()==='사용');
      const teamDelete = e.target.closest('[data-team-delete]'); if(teamDelete) return deleteTeam(teamDelete.dataset.teamDelete);
      const empEdit = e.target.closest('[data-emp-edit]'); if(empEdit) return fillEmployeeForm(empEdit.dataset.empEdit);
      const empDelete = e.target.closest('[data-emp-delete]'); if(empDelete) return deleteEmployee(empDelete.dataset.empDelete);
      const empStat = e.target.closest('[data-emp-status]'); if(empStat) return toggleEmployeeStatus(empStat.dataset.empStatus);
      const teamChk = e.target.closest('[data-team-move-no]'); if(teamChk) return;
      const issueEdit = e.target.closest('[data-issue-edit]'); if(issueEdit) return fillIssueEdit(issueEdit.dataset.issueEdit);
      const issueDelete = e.target.closest('[data-issue-delete]'); if(issueDelete) return deleteIssue(issueDelete.dataset.issueDelete);
      const resSave = e.target.closest('[data-res-save]');
      if(resSave) return saveReservationResourceRow(resSave.dataset.resSave);
    });

    document.addEventListener('change', (e)=>{
      const t = e.target;
      if(t.matches('[data-team-move-no]')){
        if(t.checked) dataState.selectedTeamChangeNos.add(t.dataset.teamMoveNo); else dataState.selectedTeamChangeNos.delete(t.dataset.teamMoveNo);
        $('realSelectedCountBox').textContent = `선택 인원 ${dataState.selectedTeamChangeNos.size}명`;
      }
    });
  }

  async function initRealAdmin(){
    publishChildTenantSession();
    if(!getActiveCompanyId()){
      console.warn('[portal-home-auth-session] active company_id is missing. Tenant scoped admin data loading stopped.');
      return;
    }
    // portal-home.html 홈 화면에는 조직/사원 관리 DOM이 없을 수 있습니다.
    // 이 경우 관리자 초기화 로직을 실행하지 않아 null.innerHTML 오류를 방지합니다.
    const hasAdminDom = Boolean(
      document.getElementById('realOrgTree') ||
      document.getElementById('realEmployeeTbody') ||
      document.getElementById('realTeamHistory') ||
      document.getElementById('realIssueTbody') ||
      document.getElementById('realResResourceTbody')
    );

    if (!hasAdminDom) {
      return;
    }

    bindStaticEvents();
    await loadOrgData();
    await loadEmployees();
    await loadTeamHistory();
    await loadSpecialNotes();
    await loadUsers();
  }

  document.addEventListener('DOMContentLoaded', initRealAdmin);
})();
