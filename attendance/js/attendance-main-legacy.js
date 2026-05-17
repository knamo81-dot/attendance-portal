/* ===== extracted inline script #4 (inline) ===== */

const SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";
  if(!window.__attendanceSupabaseClient && window.supabase){
    window.__attendanceSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  const supabaseClient = window.__attendanceSupabaseClient || null;


function getBusinessDaysForPeriod(){
  const months = (typeof periodMonths === 'function' ? periodMonths() : []) || [];
  const label = typeof periodLabel === 'function' ? String(periodLabel() || '') : '';
  const yearMatch = label.match(/^(\d{2})\./);
  const baseYear = yearMatch ? 2000 + Number(yearMatch[1]) : new Date().getFullYear();

  const monthNumbers = months
    .map(m => {
      const raw = String((m && m.month) || '').trim();
      const match = raw.match(/(\d{1,2})월/);
      return match ? Number(match[1]) : null;
    })
    .filter(v => Number.isFinite(v));

  if(!monthNumbers.length){
    const labelMonthMatch = label.match(/\.(\d{2})$/);
    if(labelMonthMatch) monthNumbers.push(Number(labelMonthMatch[1]));
  }

  if(!monthNumbers.length) return 0;

  let total = 0;
  monthNumbers.forEach(month => {
    const lastDay = new Date(baseYear, month, 0).getDate();
    for(let day = 1; day <= lastDay; day++){
      const dow = new Date(baseYear, month - 1, day).getDay();
      if(dow !== 0 && dow !== 6) total += 1;
    }
  });
  return total;
}

function updatePerPersonOT(){
  const totalEl = document.getElementById('kpiOver');
  const targetEl = document.getElementById('kpiOverPerPerson');
  if(!totalEl || !targetEl) return;

  const totalText = String(totalEl.textContent || '').replace(/[^\d.\-]/g, '');
  const total = parseFloat(totalText);
  const businessDays = getBusinessDaysForPeriod();

  if(!isFinite(total) || !isFinite(businessDays) || businessDays <= 0){
    targetEl.textContent = '';
    return;
  }

  const dailyAverage = (total / businessDays).toFixed(1);
  targetEl.textContent = `(1인 1일 평균 ${dailyAverage}시간)`;
}




const normalizeManagedTeams = (value, fallbackTeamCode='') => {
  const items = Array.isArray(value)
    ? value
    : String(value || '').split(',').map(v => v.trim()).filter(Boolean);
  const unique = [...new Set(items.filter(Boolean))];
  if(unique.length) return unique;
  return fallbackTeamCode ? [String(fallbackTeamCode).trim()] : [];
};
const managedTeamsToString = (value, fallbackTeamCode='') => normalizeManagedTeams(value, fallbackTeamCode).join(', ');


const ORG_MASTER_KEY = 'org_master_v5_master_excel';
let orgMaster = [];

function normalizeOrgMaster(raw){
  const normalized = [];
  (Array.isArray(raw) ? raw : []).forEach((div, idx) => {
    const divisionCode = (div.divisionCode || div.code || '').trim();
    const divisionName = (div.divisionName || div.name || '').trim();
    if(!divisionCode || !divisionName) return;
    const teamsRaw = Array.isArray(div.teams) ? div.teams : [];
    const teams = teamsRaw.map((team, tIdx) => {
      if(typeof team === 'string'){
        return { teamCode: team, teamName: team, active: true };
      }
      return {
        teamCode: (team.teamCode || team.code || '').trim(),
        teamName: (team.teamName || team.name || '').trim(),
        active: team.active !== false
      };
    }).filter(t => t.teamCode && t.teamName);
    normalized.push({
      divisionCode,
      divisionName,
      active: div.active !== false,
      teams
    });
  });
  return normalized;
}
function loadOrgMaster(){
  const raw = localStorage.getItem(ORG_MASTER_KEY);
  if(raw === null){
    orgMaster = JSON.parse(JSON.stringify(REAL_ORG_SEED));
    saveOrgMaster();
    return;
  }
  try{
    orgMaster = normalizeOrgMaster(JSON.parse(raw));
  }catch(e){
    orgMaster = [];
    saveOrgMaster();
  }
}
function saveOrgMaster(){
  localStorage.setItem(ORG_MASTER_KEY, JSON.stringify(orgMaster));
}
function totalOrgTeamCount(){
  return orgMaster.reduce((sum, d) => sum + (d.teams?.length || 0), 0);
}
function getDivisionByCode(code){
  return orgMaster.find(d => d.divisionCode === code);
}
function getActiveDivisions(){
  return orgMaster.filter(d => d.active);
}
function getTeamByCode(divisionCode, teamCode){
  const division = getDivisionByCode(divisionCode);
  return division?.teams?.find(t => t.teamCode === teamCode);
}
function getDivisionNameByCode(code){
  const division = getDivisionByCode(code);
  return division ? (division.divisionName || division.name || code || '-') : (code || '-');
}
function getTeamNameByCode(divisionCode, teamCode){
  const team = getTeamByCode(divisionCode, teamCode);
  return team ? (team.teamName || team.name || teamCode || '-') : (teamCode || '-');
}
function getActiveTeams(divisionCode){
  const division = getDivisionByCode(divisionCode);
  return (division?.teams || []).filter(t => t.active);
}
function renderOrgDivisionSelects(selectedDivisionCode=''){
  const activeDivisions = [...getActiveDivisions()].sort((a,b) => String(a.divisionCode||'').localeCompare(String(b.divisionCode||''), 'ko'));
  const options = ['<option value="">선택</option>'].concat(
    activeDivisions.map(d => `<option value="${d.divisionCode}" ${d.divisionCode===selectedDivisionCode?'selected':''}>${d.divisionName} (${d.divisionCode})</option>`)
  ).join('');
  if($('#mEmpDivision')) $('#mEmpDivision').innerHTML = options;
  if($('#teamDivisionSelect')) $('#teamDivisionSelect').innerHTML = ['<option value="">본부 선택</option>'].concat(
    [...orgMaster]
      .sort((a,b) => String(a.divisionCode||'').localeCompare(String(b.divisionCode||''), 'ko'))
      .map(d => `<option value="${d.divisionCode}">${d.divisionName} (${d.divisionCode})${d.active?'':' [미사용]'}</option>`)
  ).join('');
}
function renderOrgTeamSelect(selectedDivisionCode='', selectedTeamCode=''){
  const teams = [...getActiveTeams(selectedDivisionCode)].sort((a,b) => String(a.teamCode||'').localeCompare(String(b.teamCode||''), 'ko'));
  if($('#mEmpTeam')){
    $('#mEmpTeam').innerHTML = ['<option value="">선택</option>'].concat(
      teams.map(t => `<option value="${t.teamCode}" ${t.teamCode===selectedTeamCode?'selected':''}>${t.teamName} (${t.teamCode})</option>`)
    ).join('');
  }
}

function isVirtualTeam(divisionCode, teamCode){
  return String(divisionCode||'').trim() && String(teamCode||'').trim() === String(divisionCode||'').trim();
}
function getOrgFiltered(){
  const divisionFilter = ($('#orgDivisionFilter')?.value || '').trim();
  const teamFilter = ($('#orgTeamFilter')?.value || '').trim();
  return orgMaster
    .filter(div => !divisionFilter || div.divisionCode === divisionFilter)
    .map(div => ({
      ...div,
      teams: (div.teams || []).filter(team => !teamFilter || team.teamCode === teamFilter)
    }))
    .filter(div => div.teams.length || !teamFilter);
}
function refreshOrgFilters(){
  if(!$('#orgDivisionFilter') || !$('#orgTeamFilter')) return;
  const selectedDivision = ($('#orgDivisionFilter').value || '').trim();
  let selectedTeam = ($('#orgTeamFilter').value || '').trim();
  if(!selectedDivision) selectedTeam = '';

  const sortedDivisions = [...orgMaster].sort((a,b) => String(a.divisionCode||'').localeCompare(String(b.divisionCode||''), 'ko'));
  const divisionOptions = ['<option value="">전체 본부</option>'].concat(
    sortedDivisions.map(div => `<option value="${div.divisionCode}" ${div.divisionCode===selectedDivision?'selected':''}>${div.divisionName} (${div.divisionCode})</option>`)
  ).join('');
  $('#orgDivisionFilter').innerHTML = divisionOptions;

  const teamPool = selectedDivision
    ? (getDivisionByCode(selectedDivision)?.teams || []).map(team => ({...team, divisionCode: selectedDivision}))
    : orgMaster.flatMap(div => (div.teams || []).map(team => ({...team, divisionCode: div.divisionCode, divisionName: div.divisionName})));
  const sortedTeams = [...teamPool].sort((a,b) => String(a.teamCode||'').localeCompare(String(b.teamCode||''), 'ko'));

  const teamOptions = ['<option value="">전체 팀</option>'].concat(
    sortedTeams.map(team => {
      const isVirtual = isVirtualTeam(team.divisionCode || selectedDivision, team.teamCode);
      const label = selectedDivision
        ? `${team.teamName} (${team.teamCode})${isVirtual ? ' [가상팀]' : ''}`
        : `${team.teamName} (${team.teamCode}) - ${(team.divisionName || getDivisionByCode(team.divisionCode)?.divisionName || '')}${isVirtual ? ' [가상팀]' : ''}`;
      return `<option value="${team.teamCode}" ${team.teamCode===selectedTeam?'selected':''}>${label}</option>`;
    })
  ).join('');
  $('#orgTeamFilter').innerHTML = teamOptions;

  if(selectedTeam && !sortedTeams.some(team => team.teamCode === selectedTeam)){
    $('#orgTeamFilter').value = '';
  }
}
function refreshEmpFilters(){
  if(!$('#empDivisionFilter') || !$('#empTeamFilter')) return;
  const selectedDivision = ($('#empDivisionFilter').value || '').trim();
  let selectedTeam = ($('#empTeamFilter').value || '').trim();
  if(!selectedDivision) selectedTeam = '';

  const sortedDivisions = [...orgMaster].sort((a,b) => String(a.divisionCode||'').localeCompare(String(b.divisionCode||''), 'ko'));
  const divisionOptions = ['<option value="">전체 본부</option>'].concat(
    sortedDivisions.map(div => `<option value="${div.divisionCode}" ${div.divisionCode===selectedDivision?'selected':''}>${div.divisionName} (${div.divisionCode})</option>`)
  ).join('');
  $('#empDivisionFilter').innerHTML = divisionOptions;

  const teamPool = selectedDivision
    ? (getDivisionByCode(selectedDivision)?.teams || []).map(team => ({...team, divisionCode:selectedDivision}))
    : orgMaster.flatMap(div => (div.teams || []).map(team => ({...team, divisionCode: div.divisionCode, divisionName: div.divisionName})));
  const sortedTeams = [...teamPool].sort((a,b) => String(a.teamCode||'').localeCompare(String(b.teamCode||''), 'ko'));

  const teamOptions = ['<option value="">전체 팀</option>'].concat(
    sortedTeams.map(team => {
      const isVirtual = isVirtualTeam(team.divisionCode, team.teamCode);
      const label = selectedDivision
        ? `${team.teamName} (${team.teamCode})${isVirtual ? ' [가상팀]' : ''}`
        : `${team.teamName} (${team.teamCode}) - ${(team.divisionName || getDivisionByCode(team.divisionCode)?.divisionName || '')}${isVirtual ? ' [가상팀]' : ''}`;
      return `<option value="${team.teamCode}" ${team.teamCode===selectedTeam?'selected':''}>${label}</option>`;
    })
  ).join('');
  $('#empTeamFilter').innerHTML = teamOptions;

  if(selectedTeam && !sortedTeams.some(team => team.teamCode === selectedTeam)){
    $('#empTeamFilter').value = '';
  }
}

function renderOrgTree(){
  if(!$('#orgTree')) return;
  refreshOrgFilters();
  const filteredOrgMaster = getOrgFiltered();
  const allTeams = orgMaster.flatMap(div => (div.teams || []).map(team => ({...team, divisionCode: div.divisionCode})));
  $('#orgDivisionCount').textContent = orgMaster.length;
  $('#orgTeamCount').textContent = allTeams.filter(team => !isVirtualTeam(team.divisionCode, team.teamCode)).length;
  if($('#orgVirtualTeamCount')) $('#orgVirtualTeamCount').textContent = allTeams.filter(team => isVirtualTeam(team.divisionCode, team.teamCode)).length;
  if(!orgMaster.length){
    $('#orgTree').innerHTML = '<div class="employeeEmpty">등록된 조직이 없습니다. 본부와 팀을 먼저 등록하세요.</div>';
    renderOrgDivisionSelects();
    renderOrgTeamSelect();
    return;
  }
  const visibleDivisions = filteredOrgMaster.filter(div => div.teams.length || !($('#orgTeamFilter')?.value || '').trim());
  $('#orgTree').innerHTML = visibleDivisions.map(div => `
    <div class="orgItem">
      <div class="orgItemHead">
        <div>
          <strong>${div.divisionName} (${div.divisionCode})</strong>
          <div class="orgMeta">${div.active ? '사용중' : '미사용'} · 실제팀 ${div.teams.filter(team => !isVirtualTeam(div.divisionCode, team.teamCode)).length}개 / 가상팀 ${div.teams.filter(team => isVirtualTeam(div.divisionCode, team.teamCode)).length}개</div>
        </div>
        <div class="orgActionGroup">
          <span class="badge ${div.active ? 'green' : 'statusOff'}">${div.active ? '사용중' : '미사용'}</span>
          <button class="small" onclick="editDivision('${div.divisionCode}')">수정</button>
          <button class="small" onclick="toggleDivisionActive('${div.divisionCode}')">${div.active ? '미사용' : '사용'}</button>
          <button class="small dangerText" onclick="deleteDivision('${div.divisionCode}')">삭제</button>
        </div>
      </div>
      <div class="orgSubList">
        ${div.teams.length ? div.teams.map(team => `
          <div class="orgChip">
            <div>
              <strong>${team.teamName} (${team.teamCode})</strong>
              <div class="orgMeta">${team.active ? '사용중' : '미사용'}${isVirtualTeam(div.divisionCode, team.teamCode) ? ' · 가상팀' : ''}</div>
            </div>
            <div class="orgActionGroup">
              <span class="badge ${team.active ? 'green' : 'statusOff'}">${team.active ? '사용중' : '미사용'}</span>
              <button class="small" onclick="editTeam('${div.divisionCode}','${team.teamCode}')">수정</button>
              <button class="small" onclick="toggleTeamActive('${div.divisionCode}','${team.teamCode}')">${team.active ? '미사용' : '사용'}</button>
              <button class="small dangerText" onclick="deleteTeam('${div.divisionCode}','${team.teamCode}')">삭제</button>
            </div>
          </div>
        `).join('') : '<span class="label">등록된 팀 없음</span>'}
      </div>
    </div>
  `).join('');
  renderOrgDivisionSelects();
}
function addDivision(){
  const divisionCode = ($('#newDivisionCode')?.value || '').trim().toUpperCase();
  const divisionName = ($('#newDivisionName')?.value || '').trim();
  if(!divisionCode || !divisionName){ alert('본부 코드와 본부명을 입력해주세요.'); return; }
  if(orgMaster.some(d => d.divisionCode === divisionCode)){ alert('같은 본부 코드가 이미 존재합니다.'); return; }
  if(orgMaster.some(d => d.divisionName === divisionName)){ alert('같은 본부명이 이미 존재합니다.'); return; }
  orgMaster.push({ divisionCode, divisionName, active:true, teams:[] });
  orgMaster.sort((a,b)=>a.divisionCode.localeCompare(b.divisionCode,'ko'));
  saveOrgMaster();
  $('#newDivisionCode').value = '';
  $('#newDivisionName').value = '';
}
function addTeam(){
  const divisionCode = ($('#teamDivisionSelect')?.value || '').trim();
  const teamCode = ($('#newTeamCode')?.value || '').trim().toUpperCase();
  const teamName = ($('#newTeamName')?.value || '').trim();
  if(!divisionCode){ alert('본부를 먼저 선택해주세요.'); return; }
  if(!teamCode || !teamName){ alert('팀 코드와 팀명을 입력해주세요.'); return; }
  const division = getDivisionByCode(divisionCode);
  if(!division){ alert('선택한 본부를 찾을 수 없습니다.'); return; }
  if(division.teams.some(t => t.teamCode === teamCode)){ alert('같은 팀 코드가 이미 존재합니다.'); return; }
  if(division.teams.some(t => t.teamName === teamName)){ alert('같은 팀명이 이미 존재합니다.'); return; }
  division.teams.push({ teamCode, teamName, active:true });
  division.teams.sort((a,b)=>a.teamCode.localeCompare(b.teamCode,'ko'));
  saveOrgMaster();
  $('#newTeamCode').value = '';
  $('#newTeamName').value = '';
}
window.editDivision = function(divisionCode){
  const div = getDivisionByCode(divisionCode);
  if(!div) return;
  const nextCode = prompt('본부 코드를 수정하세요.', div.divisionCode);
  if(nextCode === null) return;
  const cleanedCode = nextCode.trim().toUpperCase();
  const nextName = prompt('본부명을 수정하세요.', div.divisionName);
  if(nextName === null) return;
  const cleanedName = nextName.trim();
  if(!cleanedCode || !cleanedName){ alert('본부 코드와 본부명은 비울 수 없습니다.'); return; }
  if(orgMaster.some(d => d.divisionCode === cleanedCode && d.divisionCode !== div.divisionCode)){ alert('같은 본부 코드가 이미 존재합니다.'); return; }
  if(orgMaster.some(d => d.divisionName === cleanedName && d.divisionCode !== div.divisionCode)){ alert('같은 본부명이 이미 존재합니다.'); return; }
  const oldCode = div.divisionCode;
  const oldName = div.divisionName;
  div.divisionCode = cleanedCode;
  div.divisionName = cleanedName;
  empMaster = empMaster.map(emp => {
    if(emp.divisionCode === oldCode || emp.division === oldName){
      return { ...emp, divisionCode: cleanedCode, division: cleanedName };
    }
    return emp;
  });
  saveOrgMaster();
  saveEmpMaster();
  alert('본부 수정이 완료되었습니다. 관련 사원정보도 함께 반영되었습니다.');
}
window.editTeam = function(divisionCode, teamCode){
  const div = getDivisionByCode(divisionCode);
  const team = div?.teams?.find(t => t.teamCode === teamCode);
  if(!div || !team) return;
  const nextCode = prompt('팀 코드를 수정하세요.', team.teamCode);
  if(nextCode === null) return;
  const cleanedCode = nextCode.trim().toUpperCase();
  const nextName = prompt('팀명을 수정하세요.', team.teamName);
  if(nextName === null) return;
  const cleanedName = nextName.trim();
  if(!cleanedCode || !cleanedName){ alert('팀 코드와 팀명은 비울 수 없습니다.'); return; }
  if(div.teams.some(t => t.teamCode === cleanedCode && t.teamCode !== team.teamCode)){ alert('같은 팀 코드가 이미 존재합니다.'); return; }
  if(div.teams.some(t => t.teamName === cleanedName && t.teamCode !== team.teamCode)){ alert('같은 팀명이 이미 존재합니다.'); return; }
  const oldCode = team.teamCode;
  const oldName = team.teamName;
  team.teamCode = cleanedCode;
  team.teamName = cleanedName;
  empMaster = empMaster.map(emp => {
    if((emp.divisionCode === divisionCode || emp.division === div.divisionName) && (emp.teamCode === oldCode || emp.team === oldName)){
      return { ...emp, divisionCode, division: div.divisionName, teamCode: cleanedCode, team: cleanedName };
    }
    return emp;
  });
  saveOrgMaster();
  saveEmpMaster();
  alert('팀 수정이 완료되었습니다. 관련 사원정보도 함께 반영되었습니다.');
}
window.toggleDivisionActive = function(divisionCode){
  const div = getDivisionByCode(divisionCode);
  if(!div) return;
  div.active = !div.active;
  saveOrgMaster();
}
window.toggleTeamActive = function(divisionCode, teamCode){
  const team = getTeamByCode(divisionCode, teamCode);
  if(!team) return;
  team.active = !team.active;
  saveOrgMaster();
}
window.deleteDivision = function(divisionCode){
  const div = getDivisionByCode(divisionCode);
  if(!div) return;
  const used = empMaster.some(e => e.divisionCode === divisionCode || e.division === div.divisionName);
  if(used){ alert('이 본부를 사용하는 사원정보가 있어 삭제할 수 없습니다. 미사용 처리 후 새 조직을 등록하세요.'); return; }
  if(!confirm(`${div.divisionName} (${div.divisionCode}) 본부를 삭제할까요?`)) return;
  orgMaster = orgMaster.filter(d => d.divisionCode !== divisionCode);
  saveOrgMaster();
}
window.deleteTeam = function(divisionCode, teamCode){
  const div = getDivisionByCode(divisionCode);
  const team = getTeamByCode(divisionCode, teamCode);
  if(!div || !team) return;
  const used = empMaster.some(e => (e.divisionCode === divisionCode || e.division === div.divisionName) && (e.teamCode === teamCode || e.team === team.teamName));
  if(used){ alert('이 팀을 사용하는 사원정보가 있어 삭제할 수 없습니다. 미사용 처리 후 새 팀을 등록하세요.'); return; }
  if(!confirm(`${team.teamName} (${team.teamCode}) 팀을 삭제할까요?`)) return;
  div.teams = div.teams.filter(t => t.teamCode !== teamCode);
  saveOrgMaster();
}
function bindOrgEvents(){
  $('#addDivisionBtn')?.addEventListener('click', addDivision);
  $('#addTeamBtn')?.addEventListener('click', addTeam);
  $('#mEmpDivision')?.addEventListener('change', (e) => {
    renderOrgTeamSelect(e.target.value, '');
  });
  $('#mEmpTeam')?.addEventListener('change', (e) => {
    if($('#mEmpAuthority')?.value === '담당' && !$('#mEmpManagedTeams').value.trim()){
      $('#mEmpManagedTeams').value = e.target.value || '';
    }
  });
  $('#orgDivisionFilter')?.addEventListener('change', ()=>{ if($('#orgTeamFilter')) $('#orgTeamFilter').value = ''; refreshOrgFilters(); renderOrgTree(); });
  $('#orgTeamFilter')?.addEventListener('change', renderOrgTree);
}

const EMP_MASTER_KEY = 'org_employee_master_v5_master_excel';
const DEFAULT_MASTER = [{"id": "2026012", "name": "윤복영", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01", "team": "중앙연구소", "sortOrder": 1, "grade": "이사", "authority": "소장", "attendanceTarget": "N", "status": "재직", "joinDate": "2026-02-05", "leaveDate": "", "email": "byyoon@scd.co.kr", "memo": ""}, {"id": "2013044", "name": "이지혜", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-01", "team": "제제연구팀", "sortOrder": 1, "grade": "차장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2013-05-13", "leaveDate": "", "email": "ljhyni@scd.co.kr", "memo": ""}, {"id": "2024003", "name": "노광재", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-01", "team": "제제연구팀", "sortOrder": 2, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2024-02-01", "leaveDate": "", "email": "noh302@scd.co.kr", "memo": ""}, {"id": "2024004", "name": "임수현", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-01", "team": "제제연구팀", "sortOrder": 3, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2024-02-01", "leaveDate": "", "email": "sooohyeony@scd.co.kr", "memo": ""}, {"id": "2019048", "name": "현창용", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-01", "team": "제제연구팀", "sortOrder": 4, "grade": "대리", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2019-09-16", "leaveDate": "", "email": "cyhyeon@scd.co.kr", "memo": ""}, {"id": "2020026", "name": "강태호", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-01", "team": "제제연구팀", "sortOrder": 5, "grade": "대리", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2020-05-18", "leaveDate": "", "email": "xoghgkgk@scd.co.kr", "memo": ""}, {"id": "2023026", "name": "송지명", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-01", "team": "제제연구팀", "sortOrder": 6, "grade": "대리", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2023-04-01", "leaveDate": "", "email": "songjm@scd.co.kr", "memo": ""}, {"id": "2023016", "name": "박현진", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-01", "team": "제제연구팀", "sortOrder": 7, "grade": "주임", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2023-03-02", "leaveDate": "", "email": "hyunjin1460@scd.co.kr", "memo": ""}, {"id": "2013011", "name": "김남호", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-02", "team": "연구지원팀", "sortOrder": 1, "grade": "차장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2025-10-01", "leaveDate": "", "email": "zipiz@scd.co.kr", "memo": ""}, {"id": "2023059", "name": "정아현", "divisionCode": "AA01", "division": "중앙연구소", "teamCode": "AA01-02", "team": "연구지원팀", "sortOrder": 2, "grade": "사원", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2023-09-11", "leaveDate": "", "email": "ah2023@scd.co.kr", "memo": ""}, {"id": "2024039", "name": "프라샨트", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01", "team": "글로벌연구소", "sortOrder": 1, "grade": "차장", "authority": "소장", "attendanceTarget": "N", "status": "재직", "joinDate": "2024-09-23", "leaveDate": "", "email": "prashant@scd.co.kr", "memo": ""}, {"id": "2016037", "name": "권병수", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌R&D팀", "sortOrder": 1, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2016-12-01", "leaveDate": "", "email": "bskwon@scd.co.kr", "memo": ""}, {"id": "2021027", "name": "이슬기", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌R&D팀", "sortOrder": 2, "grade": "대리", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2021-10-18", "leaveDate": "", "email": "seulki.Lee@scd.co.kr", "memo": ""}, {"id": "2026025", "name": "조민철", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌R&D팀", "sortOrder": 3, "grade": "대리", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2026-04-01", "leaveDate": "", "email": "minchul_jo@scd.co.kr", "memo": ""}, {"id": "2022004", "name": "김영훈", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌R&D팀", "sortOrder": 4, "grade": "주임", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2022-01-01", "leaveDate": "", "email": "net5855@scd.co.kr", "memo": ""}, {"id": "2022074", "name": "차주선", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌R&D팀", "sortOrder": 5, "grade": "주임", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2022-10-04", "leaveDate": "", "email": "koko_5231@scd.co.kr", "memo": ""}, {"id": "2023001", "name": "최승아", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌R&D팀", "sortOrder": 6, "grade": "주임", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2023-01-02", "leaveDate": "", "email": "csa03@scd.co.kr", "memo": ""}, {"id": "2025039", "name": "최민지", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌R&D팀", "sortOrder": 7, "grade": "사원", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2025-05-07", "leaveDate": "", "email": "imblue1020@scd.co.kr", "memo": ""}, {"id": "2025053", "name": "송승은", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌R&D팀", "sortOrder": 8, "grade": "사원", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2025-06-09", "leaveDate": "", "email": "ssong@scd.co.kr", "memo": ""}, {"id": "2025091", "name": "박천영", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-01", "team": "글로벌지원팀", "sortOrder": 1, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2025-12-01", "leaveDate": "", "email": "cheonyy@scd.co.kr", "memo": ""}, {"id": "2021006", "name": "김선희", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-02", "team": "연구품질보증팀", "sortOrder": 1, "grade": "주임", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2021-02-15", "leaveDate": "", "email": "shkim@scd.co.kr", "memo": ""}, {"id": "2023056", "name": "정민지", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-03", "team": "연구품질보증팀", "sortOrder": 2, "grade": "사원", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2023-09-01", "leaveDate": "", "email": "jmj6250@scd.co.kr", "memo": ""}, {"id": "2025056", "name": "김지현", "divisionCode": "AB01", "division": "글로벌연구소", "teamCode": "AB01-03", "team": "연구품질보증팀", "sortOrder": 3, "grade": "사원", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2023-06-23", "leaveDate": "", "email": "hazel.jihyunkim@scd.co.kr", "memo": ""}, {"id": "2014010", "name": "하병집", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01", "team": "바이오연구소", "sortOrder": 1, "grade": "전무", "authority": "소장", "attendanceTarget": "N", "status": "재직", "joinDate": "2014-02-01", "leaveDate": "", "email": "byungha@scd.co.kr", "memo": ""}, {"id": "2021005", "name": "유창훈", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-02", "team": "바이오팀", "sortOrder": 1, "grade": "이사", "authority": "담당", "managedTeams": ["AC01-02"], "attendanceTarget": "N", "status": "재직", "joinDate": "2021-02-15", "leaveDate": "", "email": "ch_yoo@scd.co.kr", "memo": ""}, {"id": "2024033", "name": "전춘주", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-03", "team": "바이오RA팀", "sortOrder": 1, "grade": "이사", "authority": "담당", "managedTeams": ["AC01-03"], "attendanceTarget": "N", "status": "재직", "joinDate": "2024-09-02", "leaveDate": "", "email": "cjjeon@scd.co.kr", "memo": ""}, {"id": "2022026", "name": "김은진", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-01", "team": "임상개발팀", "sortOrder": 1, "grade": "부장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2022-04-18", "leaveDate": "", "email": "cgw@scd.co.kr", "memo": ""}, {"id": "2014009", "name": "이재호", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-01", "team": "임상개발팀", "sortOrder": 2, "grade": "차장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2014-02-01", "leaveDate": "", "email": "laon8@scd.co.kr", "memo": ""}, {"id": "2014006", "name": "김동규", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-01", "team": "임상개발팀", "sortOrder": 3, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2014-01-20", "leaveDate": "", "email": "toyohashi@scd.co.kr", "memo": ""}, {"id": "2026030", "name": "이현아", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-01", "team": "임상개발팀", "sortOrder": 4, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2026-04-06", "leaveDate": "", "email": "hyunah.lee@scd.co.kr", "memo": ""}, {"id": "2015015", "name": "정재인", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-02", "team": "바이오팀", "sortOrder": 1, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2015-03-01", "leaveDate": "", "email": "ejk@scd.co.kr", "memo": ""}, {"id": "2020016", "name": "최경원", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-02", "team": "바이오팀", "sortOrder": 2, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2020-02-17", "leaveDate": "", "email": "espresso7@scd.co.kr", "memo": ""}, {"id": "2021033", "name": "김선진", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-02", "team": "바이오팀", "sortOrder": 3, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2021-12-01", "leaveDate": "", "email": "laon8@scd.co.kr", "memo": ""}, {"id": "2023011", "name": "조홍현", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-02", "team": "바이오팀", "sortOrder": 4, "grade": "과장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2023-02-01", "leaveDate": "", "email": "h.shin@scd.co.kr", "memo": ""}, {"id": "2025068", "name": "박나원", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-03", "team": "바이오RA팀", "sortOrder": 1, "grade": "부장", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2025-08-18", "leaveDate": "", "email": "nawon.park@scd.co.kr", "memo": ""}, {"id": "2023009", "name": "오사랑", "divisionCode": "AC01", "division": "바이오연구소", "teamCode": "AC01-03", "team": "바이오RA팀", "sortOrder": 2, "grade": "주임", "authority": "팀원", "attendanceTarget": "Y", "status": "재직", "joinDate": "2023-01-25", "leaveDate": "", "email": "sharon@scd.co.kr", "memo": ""}];
let empMaster = [];
let empEditMode = false;
let empEditingId = null;

function migrateEmployeeRecord(emp){
  const div = orgMaster.find(d => d.divisionName === emp.division || d.divisionCode === emp.divisionCode);
  const team = div?.teams?.find(t => t.teamName === emp.team || t.teamCode === emp.teamCode);
  const divisionCode = emp.divisionCode || div?.divisionCode || '';
  const division = emp.division || div?.divisionName || '';
  const teamCode = emp.teamCode || team?.teamCode || '';
  const teamName = emp.team || team?.teamName || '';
  const authority = emp.authority || emp.role || '팀원';
  return {
    ...emp,
    divisionCode,
    division,
    teamCode,
    team: teamName,
    sortOrder: Number.isFinite(Number(emp.sortOrder)) ? Number(emp.sortOrder) : 0,
    authority,
    managedTeams: normalizeManagedTeams(emp.managedTeams || emp.managed_teams, authority === '담당' ? teamCode : ''),
    attendanceTarget: emp.attendanceTarget || (authority === '소장' || authority === '담당' ? 'N' : 'Y'),
    email: String(emp.email || '').replace(/\u200b/g,'').trim()
  };
}
function loadEmpMaster(){
  const raw = localStorage.getItem(EMP_MASTER_KEY);
  if(raw === null){
    empMaster = [...DEFAULT_MASTER].map(emp => ({
      ...emp,
      sortOrder: Number.isFinite(Number(emp.sortOrder)) ? Number(emp.sortOrder) : 0,
      id: String(emp.id || normalizeEmployeeName(emp.name)),
      name: normalizeEmployeeName(emp.name),
      authority: emp.authority || emp.role || '팀원',
      managedTeams: normalizeManagedTeams(emp.managedTeams || emp.managed_teams, (emp.authority || emp.role) === '담당' ? (emp.teamCode || '') : ''),
      attendanceTarget: emp.attendanceTarget || ((emp.authority || emp.role) === '소장' || (emp.authority || emp.role) === '담당' ? 'N' : 'Y'),
      email: String(emp.email || '').replace(/\u200b/g,'').trim(),
    retireReason: String(emp.retireReason || emp.retire_reason || '').trim()
    }));
    saveEmpMaster();
    return;
  }
  try{
    empMaster = JSON.parse(raw);
    if(!Array.isArray(empMaster)) empMaster = [];
    empMaster = empMaster.map(migrateEmployeeRecord).map(emp => ({
      ...emp,
      sortOrder: Number.isFinite(Number(emp.sortOrder)) ? Number(emp.sortOrder) : 0,
      id: String(emp.id || normalizeEmployeeName(emp.name)),
      name: normalizeEmployeeName(emp.name),
      authority: emp.authority || emp.role || '팀원',
      managedTeams: normalizeManagedTeams(emp.managedTeams || emp.managed_teams, (emp.authority || emp.role) === '담당' ? (emp.teamCode || '') : ''),
      attendanceTarget: emp.attendanceTarget || ((emp.authority || emp.role) === '소장' || (emp.authority || emp.role) === '담당' ? 'N' : 'Y'),
      email: String(emp.email || '').replace(/\u200b/g,'').trim()
    }));
  }catch(e){
    empMaster = [];
    saveEmpMaster();
  }
}
function saveEmpMaster(){
  localStorage.setItem(EMP_MASTER_KEY, JSON.stringify(empMaster));
}
function empBadge(status){
  return status === '재직'
    ? '<span class="badge green">재직</span>'
    : '<span class="badge red">퇴사</span>';
}
function getEmpFiltered(){
  const keyword = ($('#empSearch')?.value || '').trim().toLowerCase();
  const divisionFilter = ($('#empDivisionFilter')?.value || '').trim();
  const teamFilter = ($('#empTeamFilter')?.value || '').trim();
  const status = $('#empStatusFilter')?.value || '전체';
  return empMaster.filter(emp=>{
    const matchKeyword = !keyword || String(emp.id||'').toLowerCase().includes(keyword) || String(emp.name||'').toLowerCase().includes(keyword);
    const matchDivision = !divisionFilter || emp.divisionCode === divisionFilter;
    const matchTeam = !teamFilter || emp.teamCode === teamFilter;
    const matchStatus = status === '전체' || emp.status === status;
    return matchKeyword && matchDivision && matchTeam && matchStatus;
  });
}
function dedupeEmpMasterByName(){
  const map = new Map();
  empMaster.forEach(emp => {
    const key = normalizeEmployeeName(emp.name);
    const cleaned = { ...emp, name: key, id: emp.id || key };
    const prev = map.get(key);
    if(!prev){
      map.set(key, cleaned);
      return;
    }
    map.set(key, {
      ...prev,
      ...cleaned,
      name: key,
      id: prev.id || cleaned.id,
      division: prev.division || cleaned.division,
      divisionCode: prev.divisionCode || cleaned.divisionCode,
      team: prev.team || cleaned.team,
      teamCode: prev.teamCode || cleaned.teamCode,
      grade: prev.grade || cleaned.grade,
      status: prev.status === '재직' ? '재직' : cleaned.status,
      memo: prev.memo || cleaned.memo
    });
  });
  empMaster = Array.from(map.values());
}

function renderEmpMaster(){
  if(!$('#empTbody')) return;
  refreshEmpFilters();
  const list = getEmpFiltered().sort((a,b)=>{
    const d = String(a.divisionCode||'').localeCompare(String(b.divisionCode||''),'ko');
    if(d) return d;
    const t = String(a.teamCode||'').localeCompare(String(b.teamCode||''),'ko');
    if(t) return t;
    const s = Number(a.sortOrder||0) - Number(b.sortOrder||0);
    if(s) return s;
    return String(a.id||'').localeCompare(String(b.id||''),'ko');
  });
  $('#empTotalCount').textContent = empMaster.length;
  $('#empActiveCount').textContent = empMaster.filter(x=>x.status==='재직').length;
  $('#empLeaveCount').textContent = empMaster.filter(x=>x.status==='퇴사').length;

  $('#empTbody').innerHTML = list.map(emp=>`
    <tr>
      <td>${emp.id}</td>
      <td><strong>${emp.name}</strong></td>
      <td>${emp.sortOrder ?? '-'}</td>
      <td>${emp.division || '-'}${emp.divisionCode ? `<div class="orgMeta">${emp.divisionCode}</div>` : ''}</td>
      <td>${emp.team || '-'}${emp.teamCode ? `<div class="orgMeta">${emp.teamCode}</div>` : ''}</td>
      <td>${emp.grade || '-'}</td>
      <td>${emp.authority || '-'}</td>
      <td>${emp.email || '-'}</td>
      <td>${managedTeamsToString(emp.managedTeams, (emp.authority === '담당' ? emp.teamCode : '')) || '-'}</td>
      <td>${emp.attendanceTarget || '-'}</td>
      <td>${empBadge(emp.status)}</td>
      <td>${emp.joinDate || '-'}</td>
      <td>${emp.leaveDate || '-'}</td>
      <td>${emp.memo || '-'}</td>
      <td>
        <div class="employeeToolbar">
          <button class="small" onclick="empEdit('${emp.id}')">수정</button>
          ${emp.status === '재직'
            ? `<button class="small red" onclick="empRetire('${emp.id}')">퇴사 처리</button>`
            : `<button class="small" onclick="empRestore('${emp.id}')">재직 복구</button>`}
        </div>
      </td>
    </tr>
  `).join('');
  $('#empEmpty').style.display = list.length ? 'none' : 'block';
}
function openEmpModal(isEdit=false, emp=null){
  empEditMode = isEdit;
  empEditingId = emp ? emp.id : null;
  $('#empModalTitle').textContent = isEdit ? '사원 수정' : '사원 추가';
  $('#mEmpId').disabled = false;
  $('#mEmpId').value = emp?.id || '';
  $('#mEmpName').value = emp?.name || '';
  renderOrgDivisionSelects(emp?.divisionCode || '');
  renderOrgTeamSelect(emp?.divisionCode || '', emp?.teamCode || '');
  if($('#mEmpSortOrder')) $('#mEmpSortOrder').value = emp?.sortOrder ?? '';
  $('#mEmpGrade').value = emp?.grade || '';
  $('#mEmpAuthority').value = emp?.authority || '팀원';
  $('#mEmpManagedTeams').value = managedTeamsToString(emp?.managedTeams, ((emp?.authority) === '담당' ? (emp?.teamCode || '') : ''));
  $('#mEmpAttendanceTarget').value = emp?.attendanceTarget || (((emp?.authority) === '소장' || (emp?.authority) === '담당') ? 'N' : 'Y');
  $('#mEmpStatus').value = emp?.status || '재직';
  $('#mJoinDate').value = emp?.joinDate || '';
  $('#mLeaveDate').value = emp?.leaveDate || '';
  $('#mRetireReason').value = emp?.retireReason || '';
  $('#mEmpEmail').value = emp?.email || '';
  $('#mEmpMemo').value = emp?.memo || '';
  $('#empModalBg').classList.add('show');
}
function closeEmpModal(){
  $('#empModalBg').classList.remove('show');
  empEditMode = false;
  empEditingId = null;
  $('#mEmpId').disabled = false;
}
function validateEmpForm(){
  const id = $('#mEmpId').value.trim();
  const name = $('#mEmpName').value.trim();
  const divisionCode = $('#mEmpDivision').value.trim();
  const teamCode = $('#mEmpTeam').value.trim();
  const sortOrder = Number($('#mEmpSortOrder')?.value || 0);
  const grade = $('#mEmpGrade').value.trim();
  const authority = $('#mEmpAuthority').value.trim();
  const attendanceTarget = $('#mEmpAttendanceTarget').value;
  const email = $('#mEmpEmail').value.trim().replace(/\u200b/g,'');
  const status = $('#mEmpStatus').value;
  const joinDate = $('#mJoinDate').value;
  const leaveDate = $('#mLeaveDate').value;
  const retireReason = $('#mRetireReason').value.trim();
  if(!id || !name || !divisionCode || !teamCode || !grade || !authority || !joinDate){
    alert('필수 항목을 모두 입력해주세요.');
    return null;
  }
  if(!orgMaster.length){
    alert('먼저 조직 관리에서 본부와 팀을 등록해주세요.');
    return null;
  }
  const div = getDivisionByCode(divisionCode);
  const team = getTeamByCode(divisionCode, teamCode);
  if(!div || !div.active){
    alert('선택한 본부가 존재하지 않거나 미사용 상태입니다.');
    return null;
  }
  if(!team || !team.active){
    alert('선택한 팀이 존재하지 않거나 미사용 상태입니다.');
    return null;
  }
  if((!empEditMode && empMaster.some(x=>String(x.id)===id)) || (empEditMode && empMaster.some(x=>String(x.id)===id && String(x.id)!==String(empEditingId)))){
    alert('같은 사번이 이미 존재합니다.');
    return null;
  }
  if(status === '퇴사' && !leaveDate){
    alert('퇴사 상태일 때는 퇴사일을 입력해야 합니다.');
    return null;
  }
  return {
    id, name,
    divisionCode, division: div.divisionName,
    teamCode, team: team.teamName,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    grade, authority,
    managedTeams: normalizeManagedTeams(managedTeamsInput, authority === '담당' ? teamCode : ''),
    attendanceTarget, email, status, joinDate,
    leaveDate: leaveDate || '',
    retireReason: retireReason || '',
    memo: $('#mEmpMemo').value.trim()
  };
}
function saveEmpForm(){
  const data = validateEmpForm();
  if(!data) return;
  if(empEditMode){
    const idx = empMaster.findIndex(x=>x.id===empEditingId);
    if(idx >= 0) empMaster[idx] = data;
  }else{
    empMaster.push(data);
  }
  saveEmpMaster();
  closeEmpModal();
}
window.empEdit = function(id){
  const emp = empMaster.find(x=>x.id===id);
  if(emp) openEmpModal(true, emp);
}
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
  saveEmpMaster();
}
window.empRestore = function(id){
  const emp = empMaster.find(x=>x.id===id);
  if(!emp) return;
  emp.status = '재직';
  emp.leaveDate = '';
  emp.retireReason = '';
  saveEmpMaster();
}
function bindEmpMasterEvents(){
  $('#empAddBtn')?.addEventListener('click', ()=>openEmpModal(false));
  $('#empModalClose')?.addEventListener('click', closeEmpModal);
  $('#empModalSave')?.addEventListener('click', saveEmpForm);
  $('#empSearch')?.addEventListener('input', renderEmpMaster);
  $('#empDivisionFilter')?.addEventListener('change', ()=>{ if($('#empTeamFilter')) $('#empTeamFilter').value = ''; refreshEmpFilters(); renderEmpMaster(); });
  $('#empTeamFilter')?.addEventListener('change', renderEmpMaster);
  $('#empStatusFilter')?.addEventListener('change', renderEmpMaster);
  $('#empResetBtn')?.addEventListener('click', ()=>{
    if(!confirm('사원정보를 빈 상태로 유지할까요? 현재 저장된 사원정보는 비워집니다.')) return;
    empMaster = [];
    saveEmpMaster();
      });
  $('#empClearBtn')?.addEventListener('click', ()=>{
    if(!confirm('저장된 사원정보를 전체 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.')) return;
    empMaster = [];
    saveEmpMaster();
      });
  $('#empModalBg')?.addEventListener('click', (e)=>{
    if(e.target.id === 'empModalBg') closeEmpModal();
  });
  $('#mEmpStatus')?.addEventListener('change', ()=>{
    if($('#mEmpStatus').value === '재직') {
      $('#mLeaveDate').value = '';
      if($('#mRetireReason')) $('#mRetireReason').value = '';
    }
  });
  $('#mEmpAuthority')?.addEventListener('change', ()=>{
    const authority = $('#mEmpAuthority').value;
    if(['소장','담당'].includes(authority)) $('#mEmpAttendanceTarget').value = 'N';
    if(['팀장','팀원'].includes(authority)) $('#mEmpAttendanceTarget').value = 'Y';
    if(authority === '담당' && !$('#mEmpManagedTeams').value.trim()){
      $('#mEmpManagedTeams').value = $('#mEmpTeam').value || '';
    }
    if(authority !== '담당'){
      $('#mEmpManagedTeams').value = '';
    }
  });
}

const REAL_ORG_SEED = [{"divisionCode": "AA01", "divisionName": "중앙연구소", "active": true, "teams": [{"teamCode": "AA01", "teamName": "중앙연구소", "active": true}, {"teamCode": "AA01-01", "teamName": "제제연구팀", "active": true}, {"teamCode": "AA01-02", "teamName": "연구지원팀", "active": true}]}, {"divisionCode": "AB01", "divisionName": "글로벌연구소", "active": true, "teams": [{"teamCode": "AB01", "teamName": "글로벌연구소", "active": true}, {"teamCode": "AB01-01", "teamName": "글로벌R&D팀", "active": true}, {"teamCode": "AB01-02", "teamName": "연구품질보증팀", "active": true}, {"teamCode": "AB01-03", "teamName": "연구품질보증팀", "active": true}]}, {"divisionCode": "AC01", "divisionName": "바이오연구소", "active": true, "teams": [{"teamCode": "AC01", "teamName": "바이오연구소", "active": true}, {"teamCode": "AC01-01", "teamName": "임상개발팀", "active": true}, {"teamCode": "AC01-02", "teamName": "바이오팀", "active": true}, {"teamCode": "AC01-03", "teamName": "바이오RA팀", "active": true}]}];
let REAL_ATTENDANCE_DATA = [];
let REAL_EMPLOYEE_METRICS = [];
let REAL_MONTHLY_METRICS = [];

let EMPLOYEES = [];
let MONTHLY = [];

const TEST_PREFIX = 'T';
// 근태 분석 로직: 규칙기반 판정 + 실데이터 집계 방식으로 변경
function seededNumber(seed, min, max){
  let h = 0;
  for(let i=0;i<seed.length;i++) h = ((h << 5) - h) + seed.charCodeAt(i);
  h = Math.abs(h);
  return min + (h % (max - min + 1));
}
function buildDashboardEmployeesFromMaster(){
  return empMaster
    .filter(e => e.status === '재직')
    .filter(e => String(e.attendanceTarget || 'Y').trim().toUpperCase() !== 'N')
    .map(e => ({
      id: e.id,
      name: e.name,
      division: e.division,
      team: e.team,
      grade: e.grade,
      monthlyHours: 0,
      avgDailyHours: 0,
      monthlyAdjustedWorkHours: 0,
      avgAdjustedWorkHours: 0,
      monthlyBaseWorkHours: 0,
      avgBaseWorkHours: 0,
      monthlyHiddenOvertime: 0,
      avgHiddenOvertime: 0,
      overtime: 0,
      avgDailyOvertime: 0,
      risk: 0,
      focusRatio: 1,
      leaveUsed: 0,
      workDays: 0,
      issueDays: 0, recoveryIssueDays: 0
    }));
}
function buildMonthlyFromEmployees(list){
  if(!list.length){
    return [{month:'3월', overtime:0, highRisk:0, leaveZero:0, avgDailyHours:0, avgAdjustedWorkHours:0, avgBaseWorkHours:0, avgHiddenOvertime:0, concentration:0, riskScore:0}];
  }
  const highRisk = list.filter(x => Number(x.risk || 0) >= 75).length;
  const leaveZero = list.filter(x => Number(x.leaveUsed || 0) === 0).length;
  const avgDailyHours = +avg(list,'avgDailyHours').toFixed(1);
  const overtime = +avg(list,'overtime').toFixed(1);
  const concentration = Math.min(100, Math.round(avg(list,'focusRatio') * 50));
  const riskScore = Math.min(100, Math.round(avg(list,'risk')));
  return [
    {month:'3월', overtime, highRisk, leaveZero, avgDailyHours, concentration, riskScore}
  ];
}
function normalizeEmployeeName(name){
  return String(name || '')
    .replace(/\s*\([^)]*\)\s*$/g,'')
    .replace(/\s+/g,' ')
    .trim();
}
function pickFilledValue(){
  for(const value of arguments){
    if(value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}
function mergeClockStart(a,b){
  const vals = [a,b].filter(v => /^\d{1,2}:\d{2}$/.test(String(v||'')));
  if(!vals.length) return pickFilledValue(a,b);
  return vals.sort((x,y)=>x.localeCompare(y))[0];
}
function mergeClockEnd(a,b){
  const vals = [a,b].filter(v => /^\d{1,2}:\d{2}$/.test(String(v||'')));
  if(!vals.length) return pickFilledValue(a,b);
  return vals.sort((x,y)=>x.localeCompare(y)).slice(-1)[0];
}
function mergeWorkDuration(a,b){
  const ah = parseWorkDurationToHours(a);
  const bh = parseWorkDurationToHours(b);
  if(ah === null && bh === null) return pickFilledValue(a,b);
  if(ah === null) return b;
  if(bh === null) return a;
  return ah >= bh ? a : b;
}
function getMergedRawAttendanceData(){
  const merged = new Map();
  const employeeIdByName = new Map();
  for(const sourceRow of REAL_ATTENDANCE_DATA || []){
    const sourceName = normalizeEmployeeName(sourceRow?.name);
    const sourceId = String(sourceRow?.employeeId || sourceRow?.employee_no || sourceRow?.id || '').trim();
    if(sourceName && sourceId && !employeeIdByName.has(sourceName)) employeeIdByName.set(sourceName, sourceId);
  }
  for(const row of REAL_ATTENDANCE_DATA){
    const cleanName = normalizeEmployeeName(row.name);
    const normalizedEmployeeId = String(row.employeeId || row.employee_no || row.id || employeeIdByName.get(cleanName) || '').trim();
    const keyPerson = normalizedEmployeeId || cleanName;
    const key = `${row.date}__${keyPerson}`;
    const current = merged.get(key);
    if(!current){
      merged.set(key, { ...row, name: cleanName, employeeId: normalizedEmployeeId || row.employeeId || '' });
      continue;
    }
    const currentReason = String(current.erpReason || current.reason || '').trim();
    const nextReason = String(row.erpReason || row.reason || '').trim();
    const currentHasWork = !!(current.start || current.end || current.workHours || Number(current.erpActualOvertime || 0) > 0 || Number(current.seccomOvertimeHours || 0) > 0);
    const nextHasWork = !!(row.start || row.end || row.workHours || Number(row.erpActualOvertime || 0) > 0 || Number(row.seccomOvertimeHours || 0) > 0);
    merged.set(key, {
      ...current,
      ...row,
      name: cleanName,
      employeeId: pickFilledValue(current.employeeId, normalizedEmployeeId, row.employeeId),
      division: pickFilledValue(currentHasWork ? current.division : '', nextHasWork ? row.division : '', current.division, row.division),
      team: pickFilledValue(currentHasWork ? current.team : '', nextHasWork ? row.team : '', current.team, row.team),
      grade: pickFilledValue(current.grade, row.grade),
      start: mergeClockStart(current.start, row.start),
      end: mergeClockEnd(current.end, row.end),
      workHours: mergeWorkDuration(current.workHours, row.workHours),
      realWorkHours: mergeWorkDuration(current.realWorkHours, row.realWorkHours),
      seccomOvertimeHours: Math.max(Number(current.seccomOvertimeHours || 0), Number(row.seccomOvertimeHours || 0)),
      erpAppliedOvertime: Math.max(Number(current.erpAppliedOvertime || 0), Number(row.erpAppliedOvertime || 0)),
      erpActualOvertime: Math.max(Number(current.erpActualOvertime || 0), Number(row.erpActualOvertime || 0)),
      erpReason: pickFilledValue(currentReason, nextReason),
      reason: pickFilledValue(currentReason, nextReason),
      overtimeCheck: pickFilledValue(current.overtimeCheckResult, row.overtimeCheckResult, current.overtime_check_result, row.overtime_check_result, current.overtimeCheck, row.overtimeCheck),
      overtimeCheckResult: pickFilledValue(current.overtimeCheckResult, row.overtimeCheckResult, current.overtime_check_result, row.overtime_check_result),
      overtime_check_result: pickFilledValue(current.overtimeCheckResult, row.overtimeCheckResult, current.overtime_check_result, row.overtime_check_result),
      recordId: pickFilledValue(current.recordId, row.recordId),
      jobName: pickFilledValue(current.jobName, row.jobName)
    });
  }
  return [...merged.values()]
    .filter(row => row.date && row.name)
    .sort((a,b) => (String(a.date)+String(a.employeeId || a.name)).localeCompare(String(b.date)+String(b.employeeId || b.name),'ko'));
}

function syncDashboardDataFromEmpMaster(){
  if(Array.isArray(REAL_ATTENDANCE_DATA) && REAL_ATTENDANCE_DATA.length){
    rebuildDerivedMetricsFromAttendance();
    return;
  }
  REAL_EMPLOYEE_METRICS = buildDashboardEmployeesFromMaster();
  REAL_MONTHLY_METRICS = buildMonthlyFromEmployees(REAL_EMPLOYEE_METRICS);
  EMPLOYEES = REAL_EMPLOYEE_METRICS.slice();
  MONTHLY = REAL_MONTHLY_METRICS.slice();
  window.debugDailyHours = function(){
    console.table(EMPLOYEES.map(e => ({
      name: e.name,
      division: e.division,
      team: e.team,
      monthlyHours: e.monthlyHours,
      workDays: e.workDays,
      avgDailyHours: e.avgDailyHours,
      overtime: e.overtime,
      avgDailyOvertime: e.avgDailyOvertime
    })));
    return EMPLOYEES;
  };
}
function seedTestData(){
  if(!confirm('테스트 데이터를 생성할까요? 기존 실제 데이터는 유지되고, 테스트 데이터는 T로 시작하는 코드/사번으로 추가됩니다.')) return;
  const testDivs = [
    { divisionCode:'T_AA01', divisionName:'중앙연구소', teams:[{teamCode:'T_AA01_T01', teamName:'연구지원팀', active:true},{teamCode:'T_AA01_T02', teamName:'효능평가팀', active:true}], active:true },
    { divisionCode:'T_BB01', divisionName:'제품개발본부', teams:[{teamCode:'T_BB01_T01', teamName:'기획개발팀', active:true},{teamCode:'T_BB01_T02', teamName:'포뮬러팀', active:true}], active:true },
    { divisionCode:'T_CC01', divisionName:'운영혁신본부', teams:[{teamCode:'T_CC01_T01', teamName:'인사운영팀', active:true},{teamCode:'T_CC01_T02', teamName:'경영지원팀', active:true}], active:true }
  ];

  // remove old test data first
  orgMaster = orgMaster.filter(d => !String(d.divisionCode || '').startsWith(TEST_PREFIX));
  empMaster = empMaster.filter(e => !String(e.id || '').startsWith(TEST_PREFIX));

  testDivs.forEach(d => orgMaster.push(d));

  const gradePool = ['사원','주임','대리','과장','차장','부장'];
  const names = ['김테스트','이샘플','박가상','최예시','정시안','한모형','오테스트','강임시','윤데모','장샘플','임모의','조가상'];
  let idx = 1;
  testDivs.forEach(div => {
    div.teams.forEach(team => {
      const count = team.teamCode.endsWith('T01') ? 4 : 3;
      for(let i=0;i<count;i++){
        const no = `${TEST_PREFIX}${String(idx).padStart(4,'0')}`;
        empMaster.push({
          id:no,
          name:names[(idx-1)%names.length] + idx,
          divisionCode:div.divisionCode,
          division:div.divisionName,
          teamCode:team.teamCode,
          team:team.teamName,
          grade:gradePool[(idx-1)%gradePool.length],
          status:'재직',
          joinDate:`202${(idx%4)+1}-0${(idx%9)+1}-0${(idx%9)+1}`,
          leaveDate:'',
          memo:'테스트 데이터',
          _checked:false
        });
        idx += 1;
      }
    });
  });

  saveOrgMaster();
  saveEmpMaster();
  syncDashboardDataFromEmpMaster();
  render();
  alert('테스트 데이터 생성이 완료되었습니다.');
}
function clearTestData(){
  if(!confirm('T로 시작하는 테스트 본부/팀/사원 데이터를 삭제할까요? 실제 데이터는 유지됩니다.')) return;
  orgMaster = orgMaster.filter(d => !String(d.divisionCode || '').startsWith(TEST_PREFIX));
  empMaster = empMaster.filter(e => !String(e.id || '').startsWith(TEST_PREFIX));
  saveOrgMaster();
  saveEmpMaster();
  syncDashboardDataFromEmpMaster();
  render();
  alert('테스트 데이터 삭제가 완료되었습니다.');
}

const ATTENDANCE_UPLOAD_STORAGE_KEY = 'attendance_upload_runtime_v1';

function updateUploadStatus(){
  const label = $('#uploadStatusLabel');
  const bar = $('#uploadStatusBar');
  if(!label || !bar) return;
  const total = Array.isArray(REAL_ATTENDANCE_DATA) ? REAL_ATTENDANCE_DATA.length : 0;
  if(!total){
    label.textContent = '업로드된 근태 데이터가 없습니다. 파일을 직접 올려서 반영하세요.';
    bar.style.width = '0%';
    return;
  }
  const dates = [...new Set(REAL_ATTENDANCE_DATA.map(r => String(r.date || '').trim()).filter(Boolean))].sort();
  const start = dates[0] || '-';
  const end = dates[dates.length - 1] || '-';
  const mergedCount = (typeof getMergedRawAttendanceData === 'function') ? getMergedRawAttendanceData().length : total;
  label.textContent = `${start} ~ ${end} 기준 원본(raw) ${total}행 반영 / 분석(records) ${mergedCount}건 생성됨 · 조직관리 / 사원정보관리는 유지됨`;
  bar.style.width = '100%';
}

function saveUploadedAttendanceData(){
  try{
    localStorage.setItem(ATTENDANCE_UPLOAD_STORAGE_KEY, JSON.stringify(REAL_ATTENDANCE_DATA || []));
  }catch(e){}
}

function createUploadBatchId(){
  try{
    if(window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  }catch(e){}
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}


async function insertRowsInChunks(tableName, rows, chunkSize = 500){
  if(!supabaseClient || !Array.isArray(rows) || !rows.length) return;

  for(let i = 0; i < rows.length; i += chunkSize){
    const chunk = rows.slice(i, i + chunkSize);

    const { error } = await supabaseClient
      .from(tableName)
      .insert(chunk);

    if(error) throw error;
  }
}

function getAttendanceRowYM(row){
  const rawDate = String(row?.work_date || row?.date || '').trim();
  if(!rawDate) return '';

  let m = rawDate.match(/^(20\d{2})-(\d{2})-/);
  if(m) return `${m[1]}-${m[2]}`;

  m = rawDate.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if(m) return `${m[1]}-${m[2]}`;

  const d = new Date(rawDate);
  if(!Number.isNaN(d.getTime())){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  return '';
}

function getUniqueAttendanceYMs(rows = []){
  return [...new Set((rows || []).map(getAttendanceRowYM).filter(Boolean))].sort();
}

function assertSingleUploadMonth(rows = [], label = '파일'){
  const yms = getUniqueAttendanceYMs(rows);
  if(!yms.length) return null;
  if(yms.length > 1){
    throw new Error(`${label} 안에 여러 년월 데이터가 섞여 있습니다: ${yms.join(', ')}. 한 번에는 같은 년월 데이터만 업로드해주세요.`);
  }
  return yms[0];
}

function getAttendanceUploadMonthKey({ secomRows = [], erpRows = [], secomFilename = '', erpFilename = '' } = {}){
  const secomYM = assertSingleUploadMonth(secomRows, '세콤 파일');
  const erpYM = assertSingleUploadMonth(erpRows, 'ERP 파일');

  if(secomYM && erpYM && secomYM !== erpYM){
    throw new Error(`세콤과 ERP의 기준 년월이 다릅니다. 세콤: ${secomYM}, ERP: ${erpYM}. 같은 년월 파일을 선택해주세요.`);
  }

  if(secomYM || erpYM) return secomYM || erpYM;

  const fileText = `${secomFilename || ''} ${erpFilename || ''}`;
  let m = fileText.match(/(20\d{2})[^0-9]?(0?[1-9]|1[0-2])/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;

  m = fileText.match(/(?:^|[^0-9])(\d{2})[^0-9]?(0?[1-9]|1[0-2])(?:[^0-9]|$)/);
  if(m) return `20${m[1]}-${String(m[2]).padStart(2, '0')}`;

  return null;
}

function getMonthRangeFromKey(monthKey){
  const m = String(monthKey || '').match(/^(20\d{2})-(\d{2})$/);
  if(!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { year, month, start, endExclusive };
}

function getBatchPublicKey(row){
  return String(row?.batch_id || row?.upload_batch_id || row?.id || '').trim();
}

async function safeDeleteBatchMetaByKey(batchKey){
  if(!supabaseClient || !batchKey) return;
  try{
    const r = await supabaseClient.from('attendance_upload_batches').delete().eq('batch_id', batchKey);
    if(r.error) console.warn('[DELETE BATCH META batch_id]', r.error);
  }catch(e){ console.warn('[DELETE BATCH META batch_id]', e); }

  if(/^\d+$/.test(String(batchKey))){
    try{
      const r = await supabaseClient.from('attendance_upload_batches').delete().eq('id', Number(batchKey));
      if(r.error) console.warn('[DELETE BATCH META id]', r.error);
    }catch(e){ console.warn('[DELETE BATCH META id]', e); }
  }
}

async function createServerUploadBatchMeta(batchId, meta = {}){
  if(!supabaseClient) return null;

  const fullPayload = {
    batch_id: batchId,
    upload_month: meta?.uploadMonth || null,
    upload_type: 'manual_upload',
    secom_filename: meta?.secomFilename || null,
    erp_filename: meta?.erpFilename || null,
    uploaded_by: meta?.uploadedBy || null
  };

  const minimalPayload = {
    batch_id: batchId,
    upload_month: meta?.uploadMonth || null,
    upload_type: 'manual_upload'
  };

  let result = await supabaseClient
    .from('attendance_upload_batches')
    .insert([fullPayload])
    .select()
    .single();

  if(result.error){
    console.warn('[BATCH META FULL INSERT FAILED - fallback minimal]', result.error);
    result = await supabaseClient
      .from('attendance_upload_batches')
      .insert([minimalPayload])
      .select()
      .single();
  }

  if(result.error) throw result.error;
  return result.data?.id ?? result.data?.batch_id ?? null;
}

async function deleteUploadBatchesForMonth(uploadMonth){
  if(!supabaseClient || !uploadMonth) return;
  const range = getMonthRangeFromKey(uploadMonth);
  const batchKeys = new Set();

  try{
    const { data, error } = await supabaseClient
      .from('attendance_upload_batches')
      .select('*')
      .limit(2000);
    if(error) throw error;
    (data || []).forEach(row => {
      const inferred = extractBatchYearMonth(row);
      if(inferred.year === range?.year && inferred.month === range?.month){
        const key = getBatchPublicKey(row);
        if(key) batchKeys.add(key);
      }
    });
  }catch(e){
    console.warn('[DELETE MONTH BATCH SELECT FAILED]', e);
  }

  try{
    const r = await supabaseClient
      .from('attendance_upload_batches')
      .delete()
      .eq('upload_month', uploadMonth);
    if(r.error) console.warn('[DELETE MONTH BATCH upload_month]', r.error);
  }catch(e){ console.warn('[DELETE MONTH BATCH upload_month]', e); }

  for(const key of batchKeys){
    await safeDeleteBatchMetaByKey(key);
  }
}

async function deleteServerAttendanceMonth(uploadMonth){
  if(!supabaseClient || !uploadMonth) return;
  const range = getMonthRangeFromKey(uploadMonth);
  if(!range) throw new Error(`업로드 월을 해석할 수 없습니다: ${uploadMonth}`);
  const { start, endExclusive } = range;

  let result = await supabaseClient.from('attendance_records').delete().gte('work_date', start).lt('work_date', endExclusive);
  if(result.error) throw result.error;

  result = await supabaseClient.from('attendance_secom_raw').delete().gte('work_date', start).lt('work_date', endExclusive);
  if(result.error) throw result.error;

  result = await supabaseClient.from('attendance_erp_raw').delete().gte('work_date', start).lt('work_date', endExclusive);
  if(result.error) throw result.error;

  await deleteUploadBatchesForMonth(uploadMonth);
}

function buildMergedAttendanceRowsForServer(secomRows = [], erpRows = []){
  return buildStableAttendanceRowsForServer(secomRows, erpRows);
}

function resolveEmployeeMetaForServer(row, metaById, metaByName){
  const rowEmpNo = String(row?.employeeId || row?.employee_no || row?.emp_no || row?.id || '').trim();
  const cleanName = normalizeEmployeeName(row?.name || row?.employee_name || '');
  return metaById.get(rowEmpNo) || metaByName.get(cleanName) || {};
}

function buildStableAttendanceRowsForServer(secomRows = [], erpRows = []){
  // records final fix: include every valid employee-date raw row; do not drop regular ERP rows with no clock/overtime values.
  const metaByName = new Map((empMaster || []).map(e => [normalizeEmployeeName(e.name), e]));
  const metaById = new Map((empMaster || []).map(e => [String(e.id || e.employee_no || '').trim(), e]).filter(([id]) => id));
  const idByName = new Map();

  [...(secomRows || []), ...(erpRows || [])].forEach(row => {
    const cleanName = normalizeEmployeeName(row?.name || row?.employee_name || '');
    const rowEmpNo = String(row?.employeeId || row?.employee_no || row?.emp_no || row?.id || '').trim();
    const meta = resolveEmployeeMetaForServer(row, metaById, metaByName);
    const metaEmpNo = String(meta?.id || meta?.employee_no || '').trim();
    const resolvedId = rowEmpNo || metaEmpNo;
    if(cleanName && resolvedId && !idByName.has(cleanName)) idByName.set(cleanName, resolvedId);
  });

  function rowDate(row){
    return String(row?.date || row?.work_date || '').trim();
  }

  function rowName(row){
    return normalizeEmployeeName(row?.name || row?.employee_name || '');
  }

  function rowEmployeeId(row){
    const cleanName = rowName(row);
    const directId = String(row?.employeeId || row?.employee_no || row?.emp_no || row?.id || '').trim();
    const meta = resolveEmployeeMetaForServer(row, metaById, metaByName);
    const metaId = String(meta?.id || meta?.employee_no || '').trim();
    return directId || metaId || idByName.get(cleanName) || '';
  }

  function makeKey(row){
    const date = rowDate(row);
    const empId = rowEmployeeId(row);
    const cleanName = rowName(row);
    return `${date}|${empId || cleanName}`;
  }

  function hasClockOrWork(row){
    const workHours = parseWorkDurationToHours(row?.workHours || row?.realWorkHours || '');
    return !!(row?.start || row?.end || (workHours !== null && workHours > 0) || Number(row?.seccomOvertimeHours || 0) > 0 || Number(row?.erpActualOvertime || 0) > 0);
  }

  function mergeBase(current, next){
    if(!current) return { ...next };
    const merged = { ...current };
    const nextName = rowName(next);
    const nextEmpId = rowEmployeeId(next);
    if(!merged.name && nextName) merged.name = nextName;
    if(!merged.employeeId && nextEmpId) merged.employeeId = nextEmpId;

    merged.start = mergeClockStart(merged.start, next.start);
    merged.end = mergeClockEnd(merged.end, next.end);
    merged.workHours = mergeWorkDuration(merged.workHours, next.workHours);
    merged.seccomOvertimeHours = Math.max(Number(merged.seccomOvertimeHours || 0), Number(next.seccomOvertimeHours || 0));
    merged.erpActualOvertime = Math.max(Number(merged.erpActualOvertime || 0), Number(next.erpActualOvertime || 0));
    merged.erpApprovedOvertime = Math.max(Number(merged.erpApprovedOvertime || 0), Number(next.erpApprovedOvertime || 0));
    merged.erpReason = pickFilledValue(merged.erpReason, next.erpReason);
    merged.reason = pickFilledValue(merged.reason, next.reason);
    merged.status = pickFilledValue(merged.status, next.status);
    merged.overtimeCheckResult = pickFilledValue(merged.overtimeCheckResult, next.overtimeCheckResult, next.overtime_check_result, next.overtimeCheck);
    return merged;
  }

  const map = new Map();
  [...(secomRows || []), ...(erpRows || [])].forEach(row => {
    const date = rowDate(row);
    if(!date) return;
    const cleanName = rowName(row);
    const empId = rowEmployeeId(row);
    if(!cleanName && !empId) return;
    const normalized = { ...row, date, name: cleanName || row?.name || '', employeeId: empId || String(row?.employeeId || '').trim() };
    const key = makeKey(normalized);
    const existing = map.get(key);
    map.set(key, mergeBase(existing, normalized));
  });

  return [...map.values()]
    .filter(row => row.date && (row.employeeId || row.name))
    .sort((a,b) => (String(a.date)+String(a.employeeId || a.name)).localeCompare(String(b.date)+String(b.employeeId || b.name),'ko'));
}

function buildAttendanceRecordPayloads(batchId, secomRows = [], erpRows = []){
  const metaByName = new Map((empMaster || []).map(e => [normalizeEmployeeName(e.name), e]));
  const metaById = new Map((empMaster || []).map(e => [String(e.id || e.employee_no || '').trim(), e]).filter(([id]) => id));
  const stableRows = buildStableAttendanceRowsForServer(secomRows, erpRows);
  return stableRows.map(row => {
    const name = normalizeEmployeeName(row.name);
    const rowEmpNo = String(row.employeeId || row.employee_no || row.emp_no || '').trim();
    const meta = metaById.get(rowEmpNo) || metaByName.get(name) || {};
    const workHours = parseWorkDurationToHours(row.workHours || row.realWorkHours || '');
    const overtime = Number(row.erpActualOvertime || row.seccomOvertimeHours || 0) || 0;
    const reason = String(row.erpReason || row.reason || row.status || '').trim();
    return {
      work_date: row.date || null,
      employee_no: String(rowEmpNo || meta.id || meta.employee_no || '').trim() || null,
      employee_name: name || null,
      division_name: String(meta.division || row.division || '').trim() || null,
      team_name: String(meta.team || row.team || '').trim() || null,
      clock_in: row.start || null,
      clock_out: row.end || null,
      work_hours: workHours,
      overtime_hours: overtime,
      reason: reason || null,
      status: String(row.status || '').trim() || null,
      overtime_check_result: String(row.overtimeCheckResult || row.overtime_check_result || row.overtimeCheck || '').trim() || null,
      approved_overtime_override: String(row.approvedOvertimeDisplay || row.approved_overtime_override || '').trim() || null,
      absence_decision: String(row.absenceDecision || row.absence_decision || '').trim() || null
    };
  }).filter(row => row.work_date && (row.employee_no || row.employee_name));
}

async function insertAttendanceRecordsInChunks(rows, chunkSize = 500){
  if(!supabaseClient || !Array.isArray(rows) || !rows.length) return;
  for(let i = 0; i < rows.length; i += chunkSize){
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabaseClient
      .from('attendance_records')
      .insert(chunk);
    if(error) throw error;
  }
}

async function backupUploadedAttendanceRawToSupabase({
  batchId,
  secomRows = [],
  erpRows = [],
  secomFilename = '',
  erpFilename = '',
  targetMonth = ''
}){
  if(!supabaseClient) {
    return { ok:false, skipped:true, reason:'supabase-disabled' };
  }

  const forcedMonth = String(targetMonth || '').trim();
  const uploadMonth = forcedMonth || getAttendanceUploadMonthKey({ secomRows, erpRows, secomFilename, erpFilename });
  if(!uploadMonth){
    throw new Error('업로드 월을 찾지 못했습니다. 파일명 또는 데이터 날짜를 확인해주세요.');
  }
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(uploadMonth)){
    throw new Error(`업로드 대상월 형식이 올바르지 않습니다: ${uploadMonth}`);
  }

  const uploadedBy = (() => {
    try{
      const currentUser = window.__portalCurrentUser || window.currentUser || null;
      if(currentUser && typeof currentUser === 'object'){
        return String(currentUser.email || currentUser.user_email || currentUser.name || '').trim() || null;
      }
    }catch(e){}
    return null;
  })();

  const targetSecomRows = (secomRows || []).filter(row => getAttendanceRowYM(row) === uploadMonth);
  const targetErpRows = (erpRows || []).filter(row => getAttendanceRowYM(row) === uploadMonth);

  if((secomRows || []).length !== targetSecomRows.length || (erpRows || []).length !== targetErpRows.length){
    const secomMonths = getUniqueAttendanceYMs(secomRows || []);
    const erpMonths = getUniqueAttendanceYMs(erpRows || []);
    throw new Error(`월카드 기준월(${uploadMonth})과 다른 날짜가 포함되어 있습니다. 세콤: ${secomMonths.join(', ') || '-'} / ERP: ${erpMonths.join(', ') || '-'}`);
  }

  await deleteServerAttendanceMonth(uploadMonth);

  const secomPayload = (targetSecomRows || []).map(row => ({
    upload_batch_id: batchId,
    work_date: row.date || null,
    emp_no: String(row.employeeId || '').trim() || null,
    name: row.name || null,
    in_time: row.start || null,
    out_time: row.end || null,
    raw_data: row
  }));

  const erpPayload = (targetErpRows || []).map(row => ({
    upload_batch_id: batchId,
    work_date: row.date || null,
    emp_no: String(row.employeeId || '').trim() || null,
    name: row.name || null,
    erp_start: row.start || null,
    erp_end: row.end || null,
    overtime: Number(row.erpActualOvertime || 0),
    raw_data: row
  }));

  if(secomPayload.length){
    await insertRowsInChunks('attendance_secom_raw', secomPayload);
  }

  if(erpPayload.length){
    await insertRowsInChunks('attendance_erp_raw', erpPayload);
  }

  const recordPayload = buildAttendanceRecordPayloads(batchId, targetSecomRows, targetErpRows);
  if(recordPayload.length){
    await insertAttendanceRecordsInChunks(recordPayload);
  }

  const batchRowId = await createServerUploadBatchMeta(batchId, {
    uploadMonth,
    secomFilename,
    erpFilename,
    uploadedBy
  });

  return {
    ok: true,
    skipped: false,
    batchId,
    batchRowId,
    uploadMonth,
    secomCount: secomPayload.length,
    erpCount: erpPayload.length,
    recordsCount: recordPayload.length
  };
}

function loadUploadedAttendanceData(){
  try{
    const raw = localStorage.getItem(ATTENDANCE_UPLOAD_STORAGE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed)) REAL_ATTENDANCE_DATA = parsed;
  }catch(e){}
  HOLIDAY_DATE_SET = buildHolidayDateSet();
}
function clearUploadedAttendanceData(){
  if(!confirm('업로드된 세콤DB / ERP 근태 데이터를 비울까요? 조직관리와 사원정보관리는 유지됩니다.')) return;
  resetAttendanceClientState();
  updateUploadStatus();
  render();
  alert('업로드 데이터가 비워졌습니다.');
}
function parseExcelDateValue(v){
  if(v === undefined || v === null || v === '') return '';
  if(v instanceof Date && !Number.isNaN(v.getTime())){
    const year = v.getFullYear();
    const month = String(v.getMonth()+1).padStart(2,'0');
    const day = String(v.getDate()).padStart(2,'0');
    return `${year}-${month}-${day}`;
  }
  if(typeof v === 'number'){
    // Excel serial date
    const utcDays = Math.floor(v - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const year = dateInfo.getUTCFullYear();
    const month = String(dateInfo.getUTCMonth()+1).padStart(2,'0');
    const day = String(dateInfo.getUTCDate()).padStart(2,'0');
    return `${year}-${month}-${day}`;
  }
  const s = String(v).trim();
  if(!s) return '';
  if(/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  let m = s.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/(\d{1,2})[-./월\s]+(\d{1,2})/);
  if(m){
    const yearGuess = (typeof getAttendanceUploadMonthKey === 'function') ? String(new Date().getFullYear()) : String(new Date().getFullYear());
    return `${yearGuess}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  return s;
}

function parseExcelTimeValue(v){
  if(v === undefined || v === null || v === '') return '';
  if(v instanceof Date && !Number.isNaN(v.getTime())){
    return `${String(v.getHours()).padStart(2,'0')}:${String(v.getMinutes()).padStart(2,'0')}`;
  }
  if(typeof v === 'number'){
    // Excel time fraction. If a date serial is accidentally included, use only the fractional part.
    const fraction = ((v % 1) + 1) % 1;
    if(fraction === 0 && v >= 1) return '';
    const totalMinutes = Math.round(fraction * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }
  let s = String(v).trim();
  if(!s || s === '-' || s === '미입력') return '';
  const isPm = /오후|PM/i.test(s);
  const isAm = /오전|AM/i.test(s);
  s = s.replace(/오전|오후|AM|PM/gi,'').trim();
  let m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if(m){
    let hh = Number(m[1]);
    const mm = m[2];
    if(isPm && hh < 12) hh += 12;
    if(isAm && hh === 12) hh = 0;
    if(hh >= 0 && hh <= 23) return `${String(hh).padStart(2,'0')}:${mm}`;
    return '';
  }
  m = s.match(/^(\d{3,4})$/);
  if(m){
    const raw = m[1].padStart(4,'0');
    const hh = Number(raw.slice(0,2));
    const mm = Number(raw.slice(2,4));
    if(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }
  return '';
}

function parseDurationCell(v){
  if(v === undefined || v === null || v === '') return '';
  if(v instanceof Date && !Number.isNaN(v.getTime())){
    const totalMinutes = v.getHours() * 60 + v.getMinutes();
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${hh}:${String(mm).padStart(2,'0')}`;
  }
  if(typeof v === 'number'){
    if(!Number.isFinite(v) || v < 0) return '';
    let hours;
    if(v > 0 && v < 1){
      // Excel duration fraction of a day
      hours = v * 24;
    }else if(v <= 48){
      // Already hours
      hours = v;
    }else{
      // Date serial or broken value: do not treat it as thousands of hours.
      return '';
    }
    const totalMinutes = Math.round(hours * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${hh}:${String(mm).padStart(2,'0')}`;
  }
  let s = String(v).trim();
  if(!s || s === '-' || s === '미입력') return '';
  s = s.replace(/시간/g, ':').replace(/분/g, '').replace(/\s+/g, '');
  let m = s.match(/^(\d{1,3}):(\d{1,2})(?::\d{1,2})?$/);
  if(m){
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if(hh <= 48 && mm >= 0 && mm <= 59) return `${hh}:${String(mm).padStart(2,'0')}`;
    return '';
  }
  if(/^\d+(?:\.\d+)?$/.test(s)){
    const n = Number(s);
    if(!Number.isFinite(n) || n < 0 || n > 48) return '';
    const totalMinutes = Math.round(n * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${hh}:${String(mm).padStart(2,'0')}`;
  }
  return '';
}

function parseDurationHoursValue(v){
  const durationText = parseDurationCell(v);
  const hours = parseWorkDurationToHours(durationText);
  return hours === null ? 0 : hours;
}

function parseHourNumber(mainValue, hValue, mValue){
  const fromMain = parseDurationHoursValue(mainValue);
  if(fromMain > 0) return +fromMain.toFixed(2);
  const hhRaw = String(hValue ?? '').trim();
  const mmRaw = String(mValue ?? '').trim();
  const hh = Number(hhRaw || 0);
  const mm = Number(mmRaw || 0);
  if(!Number.isFinite(hh) && !Number.isFinite(mm)) return 0;
  const val = (Number.isFinite(hh) ? hh : 0) + (Number.isFinite(mm) ? mm : 0) / 60;
  if(val < 0 || val > 48) return 0;
  return +val.toFixed(2);
}

function normalizeColumnKey(key){
  return String(key || '')
    .replace(/\s+/g,'')
    .replace(/[()\[\]{}_.:\-\/\\]/g,'')
    .toLowerCase();
}

function makeNormalizedRowMap(row){
  const map = new Map();
  Object.keys(row || {}).forEach(k => {
    const nk = normalizeColumnKey(k);
    if(nk && !map.has(nk)) map.set(nk, row[k]);
  });
  return map;
}

function pickCell(row, exactNames = [], containsRules = []){
  const map = makeNormalizedRowMap(row);
  for(const name of exactNames){
    const key = normalizeColumnKey(name);
    if(map.has(key)){
      const v = map.get(key);
      if(v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
  }
  const entries = Object.keys(row || {}).map(k => ({ raw:k, key:normalizeColumnKey(k), value:row[k] }));
  for(const rule of containsRules){
    const found = entries.find(e => {
      if(e.value === undefined || e.value === null || String(e.value).trim() === '') return false;
      if(typeof rule === 'function') return rule(e.key, e.raw);
      return String(rule || '').split('|').every(part => e.key.includes(part));
    });
    if(found) return found.value;
  }
  return '';
}

function pickFirstNonEmpty(){
  for(const v of arguments){
    if(v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

async function readWorkbook(file){
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, {type:'array', cellDates:true});
}
function firstSheetRows(workbook){
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {defval:'', raw:true});
}
function parseSecomWorkbookRows(rows){
  return (rows || []).map(r => {
    const date = parseExcelDateValue(pickCell(r,
      ['근무일자','근무일','일자','날짜','출입일자','출근일자'],
      [(key)=>key.includes('근무') && key.includes('일'), (key)=>key.includes('일자')]
    ));
    const name = normalizeEmployeeName(pickCell(r,
      ['이름','성명','사원명','사용자명','대상자'],
      [(key)=>key.includes('이름'), (key)=>key.includes('성명'), (key)=>key.includes('사원') && key.includes('명')]
    ));
    if(!date || !name) return null;

    const org = String(pickCell(r, ['조직','부서','부서명','본부','소속','소속부서'], [(key)=>key.includes('조직'), (key)=>key.includes('부서'), (key)=>key.includes('소속')]) || '').trim();
    const team = String(pickCell(r, ['팀','팀명','조직','부서','부서명'], [(key)=>key.includes('팀'), (key)=>key.includes('조직')]) || org).trim();
    const startRaw = pickCell(r,
      ['출근시간','출근시각','출근','입실시간','입실시각','최초출입','최초출입시간','출근일시'],
      [(key)=>key.includes('출근') && !key.includes('퇴근'), (key)=>key.includes('입실'), (key)=>key.includes('최초')]
    );
    const endRaw = pickCell(r,
      ['퇴근시간','퇴근시각','퇴근','퇴실시간','퇴실시각','최종출입','최종출입시간','퇴근일시'],
      [(key)=>key.includes('퇴근'), (key)=>key.includes('퇴실'), (key)=>key.includes('최종')]
    );
    const workRaw = pickCell(r,
      ['총근무시간','실제근무시간','근무시간','정상근무시간','실근무시간'],
      [(key)=>key.includes('근무') && key.includes('시간'), (key)=>key.includes('실근무')]
    );
    const realWorkRaw = pickCell(r,
      ['실제근무시간','실근무시간','정상근무시간','총근무시간','근무시간'],
      [(key)=>key.includes('실제') && key.includes('근무'), (key)=>key.includes('실근무')]
    );
    const secomOtRaw = pickCell(r,
      ['연장근무시간','휴일근무시간','초과근무시간','연장시간','초과시간'],
      [(key)=>key.includes('연장') && key.includes('시간'), (key)=>key.includes('초과') && key.includes('시간'), (key)=>key.includes('휴일') && key.includes('시간')]
    );

    return {
      date,
      division: org,
      team,
      name,
      employeeId: String(pickCell(r, ['사원번호','사번','직원번호','사용자ID','아이디','ID'], [(key)=>key.includes('사번'), (key)=>key.includes('사원') && key.includes('번호')]) || '').trim(),
      grade: String(pickCell(r, ['직급','직위','직책'], [(key)=>key.includes('직급'), (key)=>key.includes('직위')]) || '').trim(),
      start: parseExcelTimeValue(startRaw),
      end: parseExcelTimeValue(endRaw),
      workHours: parseDurationCell(workRaw),
      realWorkHours: parseDurationCell(realWorkRaw || workRaw),
      seccomOvertimeHours: parseDurationHoursValue(secomOtRaw),
      erpReason: '',
      reason: '',
      status: '',
      dayType: '',
      erpAppliedOvertime: 0,
      erpActualOvertime: 0,
      jobName: ''
    };
  }).filter(Boolean);
}
function parseErpWorkbookRows(rows){
  return (rows || []).map(r => {
    const date = parseExcelDateValue(pickCell(r,
      ['일자','근무일자','근무일','날짜','신청일자'],
      [(key)=>key.includes('일자'), (key)=>key.includes('근무') && key.includes('일')]
    ));
    const name = normalizeEmployeeName(pickCell(r,
      ['성명','이름','사원명','대상자','신청자'],
      [(key)=>key.includes('성명'), (key)=>key.includes('이름'), (key)=>key.includes('사원') && key.includes('명')]
    ));
    if(!date || !name) return null;

    const reason = String(pickCell(r,
      ['근태구분','근태구분명','근태명','근태','사유','휴가구분'],
      [(key)=>key.includes('근태') && key.includes('구분'), (key)=>key.includes('사유'), (key)=>key.includes('휴가') && key.includes('구분')]
    ) || '').trim();

    const appliedMain = pickCell(r,
      ['연장신청_시간','연장신청시간','연장신청','신청연장','연장근무신청','신청OT','OT신청'],
      [(key)=>key.includes('연장') && key.includes('신청') && key.includes('시간'), (key)=>key.includes('신청') && key.includes('ot')]
    );
    const appliedH = pickCell(r, ['연장신청_시','연장신청시','신청연장시'], [(key)=>key.includes('연장') && key.includes('신청') && key.endsWith('시')]);
    const appliedM = pickCell(r, ['연장신청_분','연장신청분','신청연장분'], [(key)=>key.includes('연장') && key.includes('신청') && key.endsWith('분')]);
    const actualMain = pickCell(r,
      ['실제연장_시간','실제연장시간','실제연장','실제OT','OT실제','연장실적','연장근무시간','실연장'],
      [(key)=>key.includes('실제') && key.includes('연장'), (key)=>key.includes('연장') && key.includes('실적'), (key)=>key.includes('실제') && key.includes('ot')]
    );
    const actualH = pickCell(r, ['실제연장_시','실제연장시','실연장시'], [(key)=>key.includes('실제') && key.includes('연장') && key.endsWith('시')]);
    const actualM = pickCell(r, ['실제연장_분','실제연장분','실연장분'], [(key)=>key.includes('실제') && key.includes('연장') && key.endsWith('분')]);

    return {
      date,
      division: '',
      team: '',
      name,
      employeeId: String(pickCell(r, ['사원번호','사번','직원번호'], [(key)=>key.includes('사번'), (key)=>key.includes('사원') && key.includes('번호')]) || '').trim(),
      grade: '',
      start: '',
      end: '',
      workHours: '',
      realWorkHours: '',
      seccomOvertimeHours: 0,
      erpReason: reason,
      reason,
      status: '',
      dayType: '',
      erpAppliedOvertime: parseHourNumber(appliedMain, appliedH, appliedM),
      erpActualOvertime: parseHourNumber(actualMain, actualH, actualM),
      jobName: String(pickCell(r, ['업무명칭','업무명','업무','비고','내용'], [(key)=>key.includes('업무'), (key)=>key.includes('비고')]) || '').trim()
    };
  }).filter(Boolean);
}
function rebuildDerivedMetricsFromAttendance(){
  const metaByName = new Map(empMaster.map(e => [normalizeEmployeeName(e.name), e]));
  const rows = getMergedRawAttendanceData()
    .map(row => decorateAttendanceRow(row, metaByName))
    .filter(Boolean)
    // 월별 분석 안정화: 분석/심층/담당자 지표는 반드시 선택 월로 먼저 제한한 뒤 계산합니다.
    // 2월+3월이 함께 저장되어도 26.03 선택 시 3월 단독 업로드와 동일한 기준으로 계산됩니다.
    .filter(row => rowMatchesSelectedPeriod(row.date))
    .filter(row => !isDisplayExcludedAttendance(row))
    .filter(row => isAttendanceTargetIncludedRow(row, metaByName));

  const dashboardRows = rows.filter(row => !(STATE.dashboardExcludeLeave !== false && isAttendanceContinuousLeaveRow(row)));
  const byName = new Map();
  const byMonth = new Map();

  dashboardRows.forEach(row => {
    const cleanName = normalizeEmployeeName(row.name);
    const meta = metaByName.get(cleanName);
    const person = byName.get(cleanName) || {
      id: meta?.id || row.id || row.employeeId || cleanName,
      name: cleanName,
      division: meta?.division || row.division || '',
      team: meta?.team || row.team || '',
      grade: meta?.grade || row.grade || '',
      monthlyHours: 0,
      avgDailyHours: 0,
      monthlyAdjustedWorkHours: 0,
      avgAdjustedWorkHours: 0,
      monthlyBaseWorkHours: 0,
      avgBaseWorkHours: 0,
      monthlyHiddenOvertime: 0,
      avgHiddenOvertime: 0,
      overtime: 0,
      businessTripDays: 0,
      outdoorDays: 0,
      risk: 0,
      focusRatio: 1,
      leaveUsed: 0,
      workDays: 0,
      issueDays: 0, recoveryIssueDays: 0, conditionalRiskDays: 0
    };

    const totalWork = parseWorkDurationToHours(row.totalWork || row.workHours || row.realWorkHours);
    const overtimeCheckRaw = String(row.overtimeCheck || '').trim();
  const overtimeCheckHours = parseWorkDurationToHours(overtimeCheckRaw);
  const erpOT = Number(row.erpActualOvertime || 0) > 0
    ? Number(row.erpActualOvertime || 0)
    : 0;
    const hasActualWork = hasAttendanceActualWork(row);
    const reason = getAttendanceBaseReason(row);
    const monthKey = String(row.date || '').slice(5, 7) || '03';
    const monthLabel = `${Number(monthKey)}월`;
    const analysisFields = getAttendanceAnalysisFields(row);
    const adjustedWorkForMetrics = parseWorkDurationToHours(analysisFields.adjustedWorkDisplay);
    const baseWorkForMetrics = parseWorkDurationToHours(analysisFields.baseWorkDisplay);
    const hiddenOvertimeForMetrics = parseWorkDurationToHours(analysisFields.hiddenOvertimeDisplay);

    if(totalWork !== null) person.monthlyHours += totalWork;
    if(adjustedWorkForMetrics !== null) person.monthlyAdjustedWorkHours += adjustedWorkForMetrics;
    if(baseWorkForMetrics !== null) person.monthlyBaseWorkHours += baseWorkForMetrics;
    if(hiddenOvertimeForMetrics !== null) person.monthlyHiddenOvertime += hiddenOvertimeForMetrics;
    person.overtime += erpOT;

    const countsAsEvaluatedWorkDay = hasActualWork || baseWorkForMetrics !== null || adjustedWorkForMetrics !== null || erpOT > 0;
    if(countsAsEvaluatedWorkDay) person.workDays += 1;
    // 연차/반차는 ERP 사유 문자열이 다른 상태값과 함께 합쳐져도 인식되도록 포함 검색으로 집계합니다.
    if(isVacationReason(reason)) person.leaveUsed += isHalfDayVacationReason(reason) ? 0.5 : 1;

    const rawReasonText = [
      row.erpReason,
      row.reason,
      row.attendanceType,
      row.statusReason,
      reason
    ].filter(Boolean).join(' ');
    const normalizedReason = String(rawReasonText || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, '')
      .toLowerCase();

    const hasMorningOutdoor = normalizedReason.includes('오전외근');
    const hasAfternoonOutdoor = normalizedReason.includes('오후외근');
    const hasTrip = normalizedReason.includes('출장');
    const hasFullOutdoor = normalizedReason.includes('외근') && !hasMorningOutdoor && !hasAfternoonOutdoor;

    if(hasTrip) person.businessTripDays += 1;
    if(hasMorningOutdoor) person.outdoorDays += 0.5;
    if(hasAfternoonOutdoor) person.outdoorDays += 0.5;
    if(hasFullOutdoor) person.outdoorDays += 1;

    const isRiskIssue = isRiskRelatedIssueReason(row, reason);
    if(row.bucket === '문제' && isRiskIssue){
      person.risk += 20;
      person.issueDays += 1;
      if(isRecoveryRelatedIssueReason(reason)) person.recoveryIssueDays = Number(person.recoveryIssueDays || 0) + 1;
    }else if(row.bucket === '주의' && isRiskIssue){
      person.risk += 8;
      person.issueDays += 1;
      if(isRecoveryRelatedIssueReason(reason)) person.recoveryIssueDays = Number(person.recoveryIssueDays || 0) + 1;
    }

    // 개인 위험지수 추가 가산 정리
    // 직접 가산: 결근, 실제 연장근무만 반영한다.
    // 제외: 출퇴근미입력, 근무시간부족, 단축근무, 지각, 병가, 파견, 휴가/반차 등.
    if(reason.includes('결근')) person.risk += 20;
    if(erpOT >= 2) person.risk += 6;
    if(erpOT >= 4) person.risk += 8;
    const conditionalRiskWeight = getConditionalPersonalRiskWeight(row, reason);
    if(conditionalRiskWeight > 0){
      person.conditionalRiskDays = Number(person.conditionalRiskDays || 0) + conditionalRiskWeight;
      person.risk += 3;
    }

    const month = byMonth.get(monthLabel) || {
      month: monthLabel,
      overtime: 0,
      highRisk: 0,
      leaveZero: 0,
      avgDailyHours: 0,
      avgAdjustedWorkHours: 0,
      avgBaseWorkHours: 0,
      avgHiddenOvertime: 0,
      avgTotalLoad: 0,
      concentration: 0,
      riskScore: 0,
      _count: 0,
      _workDayCount: 0,
      _riskSum: 0,
      _focusSum: 0
    };

    if(totalWork !== null){
      const fallbackBaseMinutesForRow = getFallbackBaseMinutesByReason(reason);
const analysisWork = totalWork !== null ? getAnalysisWorkHours(totalWork) : (fallbackBaseMinutesForRow !== null ? fallbackBaseMinutesForRow / 60 : null);
      month.avgDailyHours += analysisWork;
    }
    if(adjustedWorkForMetrics !== null) month.avgAdjustedWorkHours += adjustedWorkForMetrics;
    if(baseWorkForMetrics !== null) month.avgBaseWorkHours += baseWorkForMetrics;
    if(hiddenOvertimeForMetrics !== null) month.avgHiddenOvertime += hiddenOvertimeForMetrics;
    month.avgTotalLoad += (baseWorkForMetrics || 0) + erpOT + (hiddenOvertimeForMetrics || 0);
    if(countsAsEvaluatedWorkDay) month._workDayCount += 1;
    month.overtime += erpOT;
    month._count += 1;

    byName.set(cleanName, person);
    byMonth.set(monthLabel, month);
  });

  REAL_EMPLOYEE_METRICS = Array.from(byName.values()).map(e => {
    const safeWorkDays = Math.max(1, Number(e.workDays || 0));
    const monthlyHours = Number(e.monthlyHours || 0);
    const monthlyAdjustedWorkHours = Number(e.monthlyAdjustedWorkHours || 0);
    const monthlyBaseWorkHours = Number(e.monthlyBaseWorkHours || 0);
    const monthlyHiddenOvertime = Number(e.monthlyHiddenOvertime || 0);
    const monthlyOvertime = Number(e.overtime || 0);
    const avgDailyHours = monthlyHours / safeWorkDays;
    const avgAdjustedWorkHours = monthlyAdjustedWorkHours / safeWorkDays;
    const avgBaseWorkHours = monthlyBaseWorkHours / safeWorkDays;
    const avgHiddenOvertime = monthlyHiddenOvertime / safeWorkDays;
    const avgDailyOvertime = monthlyOvertime / safeWorkDays;
    const avgTotalLoad = (monthlyBaseWorkHours + monthlyOvertime + monthlyHiddenOvertime) / safeWorkDays;
    const focusLoadHours = avgBaseWorkHours + avgDailyOvertime + avgHiddenOvertime;
    const focusRatio = Number((focusLoadHours / ANALYSIS_FULL_DAY_HOURS).toFixed(1));
    const adjustedRisk = Math.min(
      100,
      Math.round(
        Number(e.risk || 0)
        + Math.min(8, Number(e.conditionalRiskDays || 0) * 2)
        + Math.max(0, (focusRatio - 1.1) * 10)
        + (avgHiddenOvertime >= 0.5 ? 4 : 0)
        + (Number(e.leaveUsed || 0) === 0 && safeWorkDays >= 10 ? 8 : 0)
      )
    );
    return {
      ...e,
      monthlyHours: +monthlyHours.toFixed(1),
      avgDailyHours: +avgDailyHours.toFixed(1),
      monthlyAdjustedWorkHours: +monthlyAdjustedWorkHours.toFixed(1),
      avgAdjustedWorkHours: +avgAdjustedWorkHours.toFixed(1),
      monthlyBaseWorkHours: +monthlyBaseWorkHours.toFixed(1),
      avgBaseWorkHours: +avgBaseWorkHours.toFixed(1),
      monthlyHiddenOvertime: +monthlyHiddenOvertime.toFixed(1),
      avgHiddenOvertime: +avgHiddenOvertime.toFixed(1),
      avgTotalLoad: +avgTotalLoad.toFixed(1),
      overtime: +monthlyOvertime.toFixed(1),
      avgDailyOvertime: +avgDailyOvertime.toFixed(1),
      focusRatio,
      risk: adjustedRisk
    };
  });

  const employeeMap = new Map(REAL_EMPLOYEE_METRICS.map(e => [e.name, e]));
  dashboardRows.forEach(row => {
    const name = normalizeEmployeeName(row.name);
    const emp = employeeMap.get(name);
    if(!emp) return;
    const monthKey = String(row.date || '').slice(5, 7) || '03';
    const monthLabel = `${Number(monthKey)}월`;
    const month = byMonth.get(monthLabel);
    if(!month) return;
    month._riskSum += Number(emp.risk || 0);
    month._focusSum += Number(emp.focusRatio || 1);
  });

  REAL_MONTHLY_METRICS = Array.from(byMonth.values())
    .map(month => {
      const memberNames = new Set(
        dashboardRows.filter(r => `${Number(String(r.date || '').slice(5,7) || '03')}월` === month.month)
           .map(r => normalizeEmployeeName(r.name))
      );
      const monthEmployees = REAL_EMPLOYEE_METRICS.filter(e => memberNames.has(e.name));
      const highRisk = monthEmployees.filter(e => e.risk >= 75).length;
      const leaveZero = monthEmployees.filter(e => e.leaveUsed === 0).length;
      const employeeCount = Math.max(1, monthEmployees.length);
      return {
        month: month.month,
        overtime: +(month.overtime / Math.max(1, month._count)).toFixed(1),
        avgDailyOvertime: +(month.overtime / Math.max(1, month._workDayCount)).toFixed(1),
        avgOvertimePerPerson: +(month.overtime / employeeCount).toFixed(1),
        highRisk,
        leaveZero,
        avgDailyHours: +(month.avgDailyHours / Math.max(1, month._workDayCount)).toFixed(1),
        concentration: Math.min(100, Math.round(month._focusSum / Math.max(1, month._count) * 50)),
        riskScore: Math.min(100, Math.round(month._riskSum / Math.max(1, month._count)))
      };
    })
    .sort((a, b) => Number(a.month.replace('월','')) - Number(b.month.replace('월','')));

  if(!REAL_MONTHLY_METRICS.length){
    REAL_MONTHLY_METRICS = buildMonthlyFromEmployees(REAL_EMPLOYEE_METRICS);
  }

  EMPLOYEES = REAL_EMPLOYEE_METRICS.slice();
  MONTHLY = REAL_MONTHLY_METRICS.slice();
}
function resetAttendanceClientState(options = {}){
  const keepStorage = options.keepStorage === true;
  REAL_ATTENDANCE_DATA = [];
  REAL_EMPLOYEE_METRICS = [];
  REAL_MONTHLY_METRICS = [];
  EMPLOYEES = [];
  MONTHLY = [];
  HOLIDAY_DATE_SET = buildHolidayDateSet();
  if(!keepStorage){
    try{ localStorage.removeItem(ATTENDANCE_UPLOAD_STORAGE_KEY); }catch(e){}
  }
}

function getSelectedAdminUploadYear(){
  const selected = Number(document.getElementById('adminUploadYear')?.value || window.ADMIN_UPLOAD_MANAGEMENT?.selectedYear || new Date().getFullYear());
  return Number.isFinite(selected) ? selected : new Date().getFullYear();
}
function makeAdminTargetMonth(month){
  const year = getSelectedAdminUploadYear();
  const m = Number(month);
  if(!Number.isFinite(m) || m < 1 || m > 12) return '';
  return `${year}-${String(m).padStart(2, '0')}`;
}
function getAdminSelectedUploadFiles(){
  return {
    secomFile: $('#secomUploadInput')?.files?.[0] || null,
    erpFile: $('#erpUploadInput')?.files?.[0] || null
  };
}
function showMonthCardUploadGuide(){
  alert('파일을 먼저 선택한 뒤, 아래 연도별 업로드 현황에서 해당 월카드의 [업로드] 버튼을 눌러주세요.\n\n예: 2026년 3월 자료는 2026년 선택 → 3월 카드 [업로드]');
}

function getSelectedUploadTargetMonth(){
  const year = String(document.getElementById('uploadTargetYear')?.value || '').trim();
  const month = String(document.getElementById('uploadTargetMonth')?.value || '').trim().padStart(2, '0');
  if(!/^20\d{2}$/.test(year) || !/^(0[1-9]|1[0-2])$/.test(month)) return '';
  return `${year}-${month}`;
}

function ensureUploadTargetYearOptions(preferredYear){
  const select = document.getElementById('uploadTargetYear');
  if(!select) return;
  const currentYear = new Date().getFullYear();
  const values = new Set([currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
  try{ (loadAdminExtraYears?.() || []).forEach(y => values.add(Number(y))); }catch(e){}
  const p = Number(preferredYear);
  if(Number.isFinite(p) && p >= 2000 && p <= 2099) values.add(p);
  const selected = String(select.value || preferredYear || currentYear);
  select.innerHTML = [...values].filter(y => Number.isFinite(y) && y >= 2000 && y <= 2099).sort((a,b)=>b-a).map(y => `<option value="${y}">${y}년</option>`).join('');
  if([...select.options].some(opt => opt.value === selected)) select.value = selected;
  else select.value = String((Number.isFinite(p) && p) || currentYear);
}

function updateUploadMonthCheckMessage(info = null){
  const msg = document.getElementById('uploadMonthCheckMessage');
  if(!msg) return;
  const target = getSelectedUploadTargetMonth();
  if(!info){
    msg.textContent = target ? `업로드 기준월: ${target}` : '파일을 선택해주세요.';
    msg.style.color = '';
    return;
  }
  const { secomMonths = [], erpMonths = [], allMonths = [] } = info;
  if(!target){
    msg.textContent = '업로드 기준월을 선택해주세요.';
    msg.style.color = '#b45309';
  }else if(allMonths.length === 1 && allMonths[0] === target){
    msg.textContent = `파일 월 확인 완료 · 세콤 ${secomMonths[0] || '-'} / ERP ${erpMonths[0] || '-'}`;
    msg.style.color = '#15803d';
  }else if(allMonths.length){
    msg.textContent = `파일 월과 선택 월을 확인하세요 · 세콤 ${secomMonths.join(', ') || '-'} / ERP ${erpMonths.join(', ') || '-'}`;
    msg.style.color = '#b45309';
  }else{
    msg.textContent = '파일 날짜를 아직 감지하지 못했습니다.';
    msg.style.color = '';
  }
}

function setUploadTargetMonth(monthKey, sourceLabel = ''){
  const match = String(monthKey || '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if(!match) return false;
  ensureUploadTargetYearOptions(Number(match[1]));
  const yearEl = document.getElementById('uploadTargetYear');
  const monthEl = document.getElementById('uploadTargetMonth');
  const detectedEl = document.getElementById('detectedUploadMonth');
  if(yearEl) yearEl.value = match[1];
  if(monthEl) monthEl.value = match[2];
  if(detectedEl) detectedEl.textContent = sourceLabel ? `${monthKey} (${sourceLabel})` : monthKey;
  updateUploadMonthCheckMessage();
  return true;
}

function detectSingleUploadMonthFromRows(secomRows = [], erpRows = []){
  const secomMonths = getUniqueAttendanceYMs(secomRows || []);
  const erpMonths = getUniqueAttendanceYMs(erpRows || []);
  const allMonths = [...new Set([...secomMonths, ...erpMonths])];
  return { secomMonths, erpMonths, allMonths, detectedMonth: allMonths.length === 1 ? allMonths[0] : '' };
}

async function detectUploadMonthFromSelectedFiles(){
  const { secomFile, erpFile } = getAdminSelectedUploadFiles();
  const detectedEl = document.getElementById('detectedUploadMonth');
  if(!secomFile && !erpFile){
    if(detectedEl) detectedEl.textContent = '-';
    updateUploadMonthCheckMessage();
    return null;
  }
  if(typeof XLSX === 'undefined'){
    updateUploadMonthCheckMessage();
    return null;
  }
  try{
    const [secomRows, erpRows] = await Promise.all([
      secomFile ? readWorkbook(secomFile).then(wb => parseSecomWorkbookRows(firstSheetRows(wb))) : Promise.resolve([]),
      erpFile ? readWorkbook(erpFile).then(wb => parseErpWorkbookRows(firstSheetRows(wb))) : Promise.resolve([])
    ]);
    const info = detectSingleUploadMonthFromRows(secomRows, erpRows);
    if(info.detectedMonth){
      setUploadTargetMonth(info.detectedMonth, '자동감지');
    }else if(detectedEl){
      detectedEl.textContent = info.allMonths.length ? `복수 월 감지: ${info.allMonths.join(', ')}` : '-';
    }
    updateUploadMonthCheckMessage(info);
    return info;
  }catch(err){
    console.error('[UPLOAD MONTH DETECT FAILED]', err);
    if(detectedEl) detectedEl.textContent = '감지 실패';
    const msg = document.getElementById('uploadMonthCheckMessage');
    if(msg){
      msg.textContent = '파일 년월 감지 중 오류가 발생했습니다.';
      msg.style.color = '#b91c1c';
    }
    return null;
  }
}


function sleepMs(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function getNextMonthKey(monthKey){
  const [y,m] = String(monthKey || '').split('-').map(Number);
  if(!y || !m) return '';
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0') }`;
}
async function waitForAttendanceRecordCount(monthKey, expectedCount, options = {}){
  if(!supabaseClient || !monthKey || !Number.isFinite(Number(expectedCount))) return null;
  const start = `${monthKey}-01`;
  const nextMonth = getNextMonthKey(monthKey);
  if(!nextMonth) return null;
  const endExclusive = `${nextMonth}-01`;
  const maxTry = Number(options.maxTry || 8);
  const delay = Number(options.delay || 450);
  let lastCount = null;
  for(let i=0; i<maxTry; i++){
    const { count, error } = await supabaseClient
      .from('attendance_records')
      .select('id', { count:'exact', head:true })
      .gte('work_date', start)
      .lt('work_date', endExclusive);
    if(error){
      console.warn('[WAIT RECORD COUNT]', error);
      break;
    }
    lastCount = Number(count || 0);
    if(lastCount === Number(expectedCount)) return lastCount;
    await sleepMs(delay);
  }
  return lastCount;
}
async function refreshAdminUploadManagementStrong(monthKey, expectedRecordCount){
  const targetYear = Number(String(monthKey || '').slice(0,4)) || new Date().getFullYear();
  if(window.ADMIN_UPLOAD_MANAGEMENT) window.ADMIN_UPLOAD_MANAGEMENT.selectedYear = targetYear;
  await waitForAttendanceRecordCount(monthKey, Number(expectedRecordCount), { maxTry:8, delay:450 });
  if(typeof window.loadAttendanceFromSupabase === 'function'){
    try{ await window.loadAttendanceFromSupabase(); }catch(e){ console.warn('[STRONG REFRESH LOAD]', e); }
  }
  if(typeof window.refreshAdminUploadManagement === 'function'){
    await window.refreshAdminUploadManagement(true);
    await sleepMs(350);
    if(window.ADMIN_UPLOAD_MANAGEMENT) window.ADMIN_UPLOAD_MANAGEMENT.selectedYear = targetYear;
    const yearSelect = document.getElementById('adminUploadYear');
    if(yearSelect) yearSelect.value = String(targetYear);
    await window.refreshAdminUploadManagement(false);
  }
}

async function applyUploadedFiles(targetMonth = ''){
  const uploadMonth = String(targetMonth || getSelectedUploadTargetMonth()).trim();
  if(!uploadMonth){
    alert('업로드 기준 년월을 선택해주세요.');
    return;
  }

  const { secomFile, erpFile } = getAdminSelectedUploadFiles();
  if(!secomFile || !erpFile){
    alert('세콤DB와 ERP 근태 파일을 모두 선택해주세요.');
    return;
  }
  if(typeof XLSX === 'undefined'){
    alert('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결 상태를 확인해주세요.');
    return;
  }

  const applyBtn = $('#applyUploadBtn');
  const originalBtnText = applyBtn ? applyBtn.textContent : '';
  if(applyBtn){
    applyBtn.disabled = true;
    applyBtn.textContent = '업로드 처리 중...';
  }

  try{
    const [secomWb, erpWb] = await Promise.all([readWorkbook(secomFile), readWorkbook(erpFile)]);
    const secomRows = parseSecomWorkbookRows(firstSheetRows(secomWb));
    const erpRows = parseErpWorkbookRows(firstSheetRows(erpWb));
    const secomMonths = getUniqueAttendanceYMs(secomRows);
    const erpMonths = getUniqueAttendanceYMs(erpRows);
    if(!secomRows.length || !erpRows.length){
      throw new Error('세콤 또는 ERP 파일에서 날짜/이름 기준 데이터를 찾지 못했습니다. 파일 양식을 확인해주세요.');
    }
    if(secomMonths.length !== 1 || secomMonths[0] !== uploadMonth || erpMonths.length !== 1 || erpMonths[0] !== uploadMonth){
      throw new Error(`선택한 업로드 기준월(${uploadMonth})과 파일 날짜가 맞지 않습니다. 세콤: ${secomMonths.join(', ') || '-'} / ERP: ${erpMonths.join(', ') || '-'}`);
    }
    if(!confirm(`${uploadMonth} 데이터를 업로드할까요?\n기존 ${uploadMonth} raw/records는 삭제 후 재생성됩니다.`)) return;
    const nextRows = [...secomRows, ...erpRows];

    const batchId = createUploadBatchId();
    const backupResult = await backupUploadedAttendanceRawToSupabase({
      batchId,
      secomRows,
      erpRows,
      secomFilename: secomFile.name,
      erpFilename: erpFile.name,
      targetMonth: uploadMonth
    });

    if(!backupResult || !backupResult.ok){
      throw new Error(backupResult?.reason || '서버 저장에 실패했습니다.');
    }

    // ✅ 업로드 직후 화면 데이터 안정화
    // 방금 업로드한 원본 nextRows만 화면 데이터로 사용하면,
    // 여러 달 데이터가 누적된 상태에서 선택 월이 일부 데이터로 계산될 수 있습니다.
    // 서버 저장 완료 후 attendance_records 전체를 다시 불러오고, 기존 선택 월은 유지합니다.
    const previousSelectedPeriod = String(STATE?.period || '').trim();

    if (supabaseClient && typeof window.loadAttendanceFromSupabase === 'function') {
      await window.loadAttendanceFromSupabase();
    } else {
      REAL_ATTENDANCE_DATA = nextRows;
      HOLIDAY_DATE_SET = buildHolidayDateSet();
      rebuildDerivedMetricsFromAttendance();
      saveUploadedAttendanceData();
    }

    const availablePeriodsAfterUpload = getAvailableAttendancePeriodOptions();
    if (previousSelectedPeriod && availablePeriodsAfterUpload.some(item => item.value === previousSelectedPeriod)) {
      STATE.period = previousSelectedPeriod;
    } else if (backupResult?.uploadMonth && availablePeriodsAfterUpload.some(item => item.value === backupResult.uploadMonth)) {
      STATE.period = backupResult.uploadMonth;
    }

    updateUploadStatus();
    const uploadedYear = Number(String(backupResult?.uploadMonth || '').slice(0, 4)) || new Date().getFullYear();
    if (window.ADMIN_UPLOAD_MANAGEMENT) window.ADMIN_UPLOAD_MANAGEMENT.selectedYear = uploadedYear;

    await updateAttendanceViewsAfterDataChange({ refreshFilters: true, keepMainTab: getActiveAttendanceMainTab('admin') });
    if (typeof refreshAdminUploadManagementStrong === 'function') {
      await refreshAdminUploadManagementStrong(backupResult.uploadMonth, backupResult.recordsCount);
    } else if (typeof window.refreshAdminMonthCardsImmediately === 'function') {
      await window.refreshAdminMonthCardsImmediately({ targetYear: uploadedYear, forceYearReload: true });
    } else if (typeof window.refreshAdminUploadManagement === 'function') {
      await window.refreshAdminUploadManagement(true);
    }

    alert(`업로드 데이터 반영이 완료되었습니다. 조직관리와 사원정보관리는 유지되었습니다.
서버 저장 완료 · ${backupResult.uploadMonth || ''} · Batch: ${backupResult.batchId}
원본 raw ${nextRows.length}행 / 분석 records ${backupResult.recordsCount ?? '-'}건
※ records는 ERP/세콤 원본을 사번·날짜 기준으로 통합한 분석용 건수입니다.`);
  }catch(error){
    console.error('[ATTENDANCE UPLOAD FAILED]', {
  message: error?.message,
  name: error?.name,
  stack: error?.stack,
  error
});

alert('업로드 실패 상세: ' + (error?.message || JSON.stringify(error)));
    resetAttendanceClientState();
    try{
      await window.loadAttendanceFromSupabase();
    }catch(loadError){
      console.error('[ATTENDANCE RELOAD FAILED AFTER UPLOAD ERROR]', loadError);
      resetAttendanceClientState();
    }
    updateUploadStatus();
    render();
    return;
  } finally {
    if(applyBtn){
      applyBtn.disabled = false;
      applyBtn.textContent = originalBtnText || '업로드 실행';
    }
  }
}
function bindUploadRuntimeEvents(){
  ensureUploadTargetYearOptions(new Date().getFullYear());
  const yearEl = document.getElementById('uploadTargetYear');
  const monthEl = document.getElementById('uploadTargetMonth');
  if(yearEl && !yearEl.value) yearEl.value = String(new Date().getFullYear());
  if(monthEl && !monthEl.value) monthEl.value = String(new Date().getMonth() + 1).padStart(2, '0');
  updateUploadMonthCheckMessage();
  $('#applyUploadBtn')?.addEventListener('click', () => {
    applyUploadedFiles();
  });
  $('#clearUploadBtn')?.addEventListener('click', clearUploadedAttendanceData);
  $('#secomUploadInput')?.addEventListener('change', () => { detectUploadMonthFromSelectedFiles(); });
  $('#erpUploadInput')?.addEventListener('change', () => { detectUploadMonthFromSelectedFiles(); });
  $('#uploadTargetYear')?.addEventListener('change', () => { updateUploadMonthCheckMessage(); });
  $('#uploadTargetMonth')?.addEventListener('change', () => { updateUploadMonthCheckMessage(); });
}


const GRADE_ORDER = ['사원','주임','대리','과장','차장','부장','이사부장'];
const COLORS = ['#2563eb','#0f766e','#f59e0b','#ef4444','#7c3aed','#14b8a6','#334155'];
const STATE = { period:'3M', division:'전체', team:'전체', attendanceIncludeLeave:true, dashboardExcludeLeave:true, leaveCauseFocus:'', fatigueMode:'recommended' };

const ATTENDANCE_UI_STATE_KEYS = {
  // mainTab은 sessionStorage에만 저장합니다.
  // - 같은 브라우저 탭에서 새로고침: 현재 탭 유지
  // - 새 브라우저 탭/새 접속: 근태관리 홈에서 시작
  mainTab: 'attendanceActiveMainTab',
  period: 'attendanceSelectedPeriod'
};
let ATTENDANCE_CURRENT_MAIN_TAB = 'attendance';
function getActiveAttendanceMainTab(fallback = 'attendance'){
  try{
    const active = document.querySelector('.mainTab.active')?.dataset?.main;
    return String(active || ATTENDANCE_CURRENT_MAIN_TAB || fallback || 'attendance').trim() || 'attendance';
  }catch(e){
    return String(ATTENDANCE_CURRENT_MAIN_TAB || fallback || 'attendance').trim() || 'attendance';
  }
}
function saveAttendanceUiState(key, value){
  try{
    if(!key) return;
    localStorage.setItem(key, String(value || '').trim());
  }catch(e){}
}
function readAttendanceUiState(key){
  try{ return String(localStorage.getItem(key) || '').trim(); }catch(e){ return ''; }
}

const ATTENDANCE_ADMIN_ACCESS_STATE = { resolved:false, loading:false, isAdmin:false, email:'', reason:'' };
function normalizeAttendanceAdminRole(value){
  const s = String(value || '').trim().toLowerCase();
  if(!s) return '';
  if(s === 'admin' || s === 'administrator' || s === '관리자' || s === '시스템관리자' || s === '시스템 관리자') return 'admin';
  return s;
}
function isAttendanceAdminRole(value){
  return normalizeAttendanceAdminRole(value) === 'admin';
}
function readAttendanceStoredUsers(){
  const rows = [];
  const keys = ['portal_auth_user','portalUser','attendance_portal_user','currentUser','__portalCurrentUser'];
  try{
    if(window.__portalCurrentUser && typeof window.__portalCurrentUser === 'object') rows.push(window.__portalCurrentUser);
    if(window.currentUser && typeof window.currentUser === 'object') rows.push(window.currentUser);
  }catch(e){}
  keys.forEach(key => {
    try{
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if(!raw) return;
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed === 'object'){
        rows.push(parsed);
        if(parsed.user && typeof parsed.user === 'object') rows.push(parsed.user);
        if(parsed.profile && typeof parsed.profile === 'object') rows.push(parsed.profile);
      }
    }catch(e){}
  });
  return rows;
}
function getAttendanceRoleFromIdentity(obj){
  if(!obj || typeof obj !== 'object') return '';
  return obj.role || obj.system_role || obj.systemRole || obj.user_role || obj.userRole || obj.portal_role || obj.portalRole || obj.access_role || obj.accessRole || obj.auth_role || obj.authRole || '';
}
function getAttendanceEmailFromIdentity(obj){
  if(!obj || typeof obj !== 'object') return '';
  return String(obj.email || obj.user_email || obj.userEmail || obj.mail || obj?.user?.email || obj?.profile?.email || '').trim().toLowerCase();
}


/* general user scope: 일반사용자는 근태관리 탭 + 본인 데이터만 조회 */
const ATTENDANCE_GENERAL_USER_ACCESS_STATE = { resolved:false, loading:false, isGeneral:false, name:'', email:'', employeeNo:'', reason:'' };
function normalizeAttendanceGeneralRole(value){
  const s = String(value || '').trim().toLowerCase().replace(/\s+/g,'');
  if(!s) return '';
  if(['admin','administrator','관리자','시스템관리자'].includes(s)) return 'admin';
  if(['operator','운영자'].includes(s)) return 'operator';
  if(['director','소장','본부장','담당','팀장','manager','leader','supervisor','책임자'].includes(s)) return 'privileged';
  if(['user','general','normal','일반','일반사용자','일반유저','사용자','팀원','일반권한'].includes(s)) return 'general';
  return s;
}
function getAttendanceNameFromIdentity(obj){
  if(!obj || typeof obj !== 'object') return '';
  return String(obj.name || obj.user_name || obj.userName || obj.employee_name || obj.employeeName || obj.displayName || obj.display_name || obj?.user?.name || obj?.profile?.name || obj?.profile?.employee_name || '').trim();
}
function getAttendanceCurrentIdentitySummary(){
  const identities = readAttendanceStoredUsers();
  let email = '', employeeNo = '', name = '', role = '';
  for(const item of identities){
    if(!email) email = getAttendanceEmailFromIdentity(item);
    if(!employeeNo && typeof getAttendanceEmployeeNoFromIdentity === 'function') employeeNo = getAttendanceEmployeeNoFromIdentity(item);
    if(!employeeNo) employeeNo = String(item?.employee_no || item?.employeeNo || item?.emp_no || item?.empNo || item?.id || item?.user_id || item?.userId || item?.profile?.employee_no || item?.profile?.employeeNo || '').trim();
    if(!name) name = getAttendanceNameFromIdentity(item);
    if(!role) role = getAttendanceRoleFromIdentity(item);
    if(email && employeeNo && name && role) break;
  }
  return { email, employeeNo, name, role };
}
function getAttendanceEmployeeAuthority(emp){
  if(!emp || typeof emp !== 'object') return '';
  return String(emp.authority || emp.access_authority || emp.accessAuthority || emp.duty || emp.position_role || emp.positionRole || '').trim();
}
function isAttendanceAutoAuthorityEmployee(emp){
  const authority = normalizeAttendanceGeneralRole(getAttendanceEmployeeAuthority(emp));
  return authority === 'privileged' || authority === 'admin' || authority === 'operator';
}
function isAttendanceAutoAuthorityRoleValue(value){
  const role = normalizeAttendanceGeneralRole(value);
  return role === 'privileged' || role === 'admin' || role === 'operator';
}
function lockAttendanceGeneralUserFilters(){
  if(!isCurrentAttendanceGeneralUser()) return;
  STATE.division = '전체';
  STATE.team = '전체';
  ['division','team'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.value = '';
    el.disabled = true;
    el.title = '일반사용자는 본인 데이터만 조회합니다.';
    el.dataset.generalLocked = 'Y';
  });
}
function unlockAttendanceGeneralUserFilters(){
  if(isCurrentAttendanceGeneralUser()) return;
  ['division','team'].forEach(id => {
    const el = document.getElementById(id);
    if(!el || el.dataset.generalLocked !== 'Y') return;
    el.disabled = false;
    el.title = '';
    delete el.dataset.generalLocked;
  });
}
function findAttendanceEmployeeForCurrentUser(summary){
  const employees = Array.isArray(empMaster) ? empMaster : [];
  const email = String(summary?.email || '').trim().toLowerCase();
  const no = String(summary?.employeeNo || '').trim();
  const name = String(summary?.name || '').trim();
  const normName = (typeof normalizeEmployeeName === 'function') ? normalizeEmployeeName(name) : name;
  return employees.find(emp => {
    const empEmail = String(emp?.email || emp?.mail || emp?.user_email || '').trim().toLowerCase();
    const empNo = String(emp?.employee_no || emp?.employeeNo || emp?.id || '').trim();
    const empName = String(emp?.name || emp?.employee_name || '').trim();
    const empNormName = (typeof normalizeEmployeeName === 'function') ? normalizeEmployeeName(empName) : empName;
    return (email && empEmail && email === empEmail) || (no && empNo && no === empNo) || (normName && empNormName && normName === empNormName);
  }) || null;
}
function isCurrentAttendanceGeneralUser(){
  const access = (window.currentAccess || (typeof ATTENDANCE_EFFECTIVE_ACCESS_STATE !== 'undefined' ? ATTENDANCE_EFFECTIVE_ACCESS_STATE.access : null) || {});
  const effectivePrivileged = !!(
    access.isAdmin || access.isOperator || access.isDirector || access.isManager || access.isTeamLeader || access.isLeader ||
    access.canViewAll || access.canViewDivision || access.canViewManagedTeams || access.canViewTeam ||
    ['admin','operator','director','manager','teamLeader','teamleader','leader'].includes(String(access.role || access.primaryRole || '').trim())
  );
  if(effectivePrivileged) return false;
  return ATTENDANCE_GENERAL_USER_ACCESS_STATE.isGeneral === true;
}
function rowMatchesCurrentGeneralUser(row){
  if(!isCurrentAttendanceGeneralUser()) return true;
  const state = ATTENDANCE_GENERAL_USER_ACCESS_STATE;
  const rowNo = String(row?.id || row?.employee_no || row?.employeeNo || row?.employeeId || row?.employee_no || '').trim();
  const rowEmail = String(row?.email || row?.mail || row?.user_email || '').trim().toLowerCase();
  const rowName = String(row?.name || row?.employee_name || '').trim();
  const rowNormName = (typeof normalizeEmployeeName === 'function') ? normalizeEmployeeName(rowName) : rowName;
  const myNo = String(state.employeeNo || '').trim();
  const myEmail = String(state.email || '').trim().toLowerCase();
  const myNormName = (typeof normalizeEmployeeName === 'function') ? normalizeEmployeeName(state.name || '') : String(state.name || '').trim();
  return (!!myNo && rowNo === myNo) || (!!myEmail && rowEmail && rowEmail === myEmail) || (!!myNormName && rowNormName === myNormName);
}
function scopeAttendanceRowsForGeneralUser(rows){
  const list = Array.isArray(rows) ? rows : [];
  return isCurrentAttendanceGeneralUser() ? list.filter(rowMatchesCurrentGeneralUser) : list;
}


/* effective access scope filter: 상단 본부/팀 필터와 실제 표시 데이터를 현재 권한 범위 안으로 제한 */
function attendanceTextEquals(a, b){
  return String(a || '').trim() && String(b || '').trim() && String(a || '').trim() === String(b || '').trim();
}
function getAttendanceOrgDivisionMetaByAny(value){
  const key = String(value || '').trim();
  if(!key) return null;
  return (Array.isArray(orgMaster) ? orgMaster : []).find(div =>
    String(div?.divisionCode || '').trim() === key || String(div?.divisionName || '').trim() === key
  ) || null;
}
function getAttendanceOrgTeamMetaByAny(value){
  const key = String(value || '').trim();
  if(!key) return null;
  for(const div of (Array.isArray(orgMaster) ? orgMaster : [])){
    const team = (div.teams || []).find(t =>
      String(t?.teamCode || '').trim() === key || String(t?.teamName || '').trim() === key
    );
    if(team) return { ...team, divisionCode: div.divisionCode || '', divisionName: div.divisionName || '' };
  }
  return null;
}
function getAttendanceDivisionAliases(value){
  const meta = getAttendanceOrgDivisionMetaByAny(value);
  return attendanceUniqueArray([value, meta?.divisionCode, meta?.divisionName]);
}
function getAttendanceTeamAliases(value){
  const meta = getAttendanceOrgTeamMetaByAny(value);
  return attendanceUniqueArray([value, meta?.teamCode, meta?.teamName]);
}
function getAttendanceScopeTokens(values, kind){
  const source = attendanceUniqueArray(values || []);
  return source.flatMap(v => kind === 'division' ? getAttendanceDivisionAliases(v) : getAttendanceTeamAliases(v));
}
function getAttendanceRowOrEmployeeMeta(row){
  const name = normalizeEmployeeName(String(row?.name || row?.employee_name || row?.employeeName || '').trim());
  const emp = name && Array.isArray(empMaster) ? empMaster.find(e => normalizeEmployeeName(e?.name || e?.employee_name || '') === name) : null;
  return emp || null;
}
function getAttendanceRowDivisionTokens(row){
  const emp = getAttendanceRowOrEmployeeMeta(row);
  return attendanceUniqueArray([
    row?.divisionCode, row?.division_code, row?.division,
    emp?.divisionCode, emp?.division_code, emp?.division,
    getAttendanceEmployeeDivisionCode(emp)
  ]).flatMap(getAttendanceDivisionAliases);
}
function getAttendanceRowTeamTokens(row){
  const emp = getAttendanceRowOrEmployeeMeta(row);
  return attendanceUniqueArray([
    row?.teamCode, row?.team_code, row?.team,
    emp?.teamCode, emp?.team_code, emp?.team,
    getAttendanceEmployeeTeamCode(emp)
  ]).flatMap(getAttendanceTeamAliases);
}
function attendanceTokenIntersects(left, right){
  const l = new Set(attendanceUniqueArray(left));
  return attendanceUniqueArray(right).some(v => l.has(v));
}
function isAttendanceAllAccess(access){
  const a = access || (typeof getAttendanceEffectiveAccess === 'function' ? getAttendanceEffectiveAccess() : window.currentAccess) || {};
  return !!(a.isAdmin || a.isOperator || a.canViewAll || ['admin','operator'].includes(String(a.role || a.primaryRole || '').trim()));
}
function rowMatchesEffectiveAccessScope(row){
  const access = (typeof getAttendanceEffectiveAccess === 'function') ? getAttendanceEffectiveAccess() : (window.currentAccess || {});
  if(isAttendanceAllAccess(access)) return true;
  if(typeof isCurrentAttendanceGeneralUser === 'function' && isCurrentAttendanceGeneralUser()) return rowMatchesCurrentGeneralUser(row);
  const scope = access.scope || {};
  const role = String(access.role || access.primaryRole || '').trim();
  const rowDivTokens = getAttendanceRowDivisionTokens(row);
  const rowTeamTokens = getAttendanceRowTeamTokens(row);
  if(access.isDirector || access.canViewDivision || role === 'director'){
    const allowedDivs = getAttendanceScopeTokens(scope.divisionCodes || [], 'division');
    return allowedDivs.length ? attendanceTokenIntersects(rowDivTokens, allowedDivs) : false;
  }
  if(access.isManager || access.canViewManagedTeams || role === 'manager'){
    const allowedTeams = getAttendanceScopeTokens([...(scope.managedTeamCodes || []), ...(scope.teamCodes || [])], 'team');
    if(allowedTeams.length) return attendanceTokenIntersects(rowTeamTokens, allowedTeams);
    const allowedDivs = getAttendanceScopeTokens(scope.divisionCodes || [], 'division');
    return allowedDivs.length ? attendanceTokenIntersects(rowDivTokens, allowedDivs) : false;
  }
  if(access.isTeamLeader || access.isLeader || access.canViewTeam || role === 'teamLeader' || role === 'teamleader' || role === 'leader'){
    const allowedTeams = getAttendanceScopeTokens(scope.teamCodes || [], 'team');
    return allowedTeams.length ? attendanceTokenIntersects(rowTeamTokens, allowedTeams) : false;
  }
  if(access.isGeneral || access.canViewSelfOnly || role === 'general') return rowMatchesCurrentGeneralUser(row);
  return true;
}
function scopeRowsByEffectiveAccess(rows){
  const list = Array.isArray(rows) ? rows : [];
  return isAttendanceAllAccess() ? list.slice() : list.filter(rowMatchesEffectiveAccessScope);
}
function getAttendanceEmployeesWithinEffectiveScope(source){
  return scopeRowsByEffectiveAccess(Array.isArray(source) ? source : []);
}

function getAttendanceFilterAccessMode(){
  const access = (typeof getAttendanceEffectiveAccess === 'function') ? getAttendanceEffectiveAccess() : (window.currentAccess || {});
  const role = String(access?.role || access?.primaryRole || '').trim();
  const isAll = isAttendanceAllAccess(access);
  const isDirector = !!(access?.isDirector || access?.canViewDivision || role === 'director');
  const isManager = !!(access?.isManager || access?.canViewManagedTeams || role === 'manager');
  const isTeamLeader = !!(access?.isTeamLeader || access?.isLeader || access?.canViewTeam || role === 'teamLeader' || role === 'teamleader' || role === 'leader');
  return {
    access,
    role,
    isAll,
    isDirector,
    isManager,
    isTeamLeader,
    lockDivision: !isAll && (isDirector || isManager || isTeamLeader),
    allowDivisionAll: isAll || !(isDirector || isManager || isTeamLeader),
    allowTeamAll: isAll || isDirector || (!isManager && !isTeamLeader),
    requireSpecificTeam: !isAll && (isManager || isTeamLeader),
    lockSingleTeam: !isAll && isTeamLeader
  };
}
function attendanceOptionEscape(value){
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setAttendanceFilterLockState(id, locked, title){
  const el = document.getElementById(id);
  if(!el) return;
  if(locked){
    el.disabled = true;
    el.dataset.accessLocked = 'Y';
    el.title = title || '현재 권한 범위로 고정되었습니다.';
  }else if(el.dataset.accessLocked === 'Y'){
    el.disabled = false;
    el.title = '';
    delete el.dataset.accessLocked;
  }
}
function applyAttendanceGeneralUserVisibility(){
  const isGeneral = isCurrentAttendanceGeneralUser();
  if(!isGeneral){
    unlockAttendanceGeneralUserFilters();
    if(typeof applyAttendanceMainMenuAccess === 'function') applyAttendanceMainMenuAccess();
    return;
  }
  lockAttendanceGeneralUserFilters();
  document.querySelectorAll('.mainTab').forEach(btn => {
    const allowed = btn?.dataset?.main === 'attendance';
    btn.dataset.generalHidden = allowed ? 'N' : 'Y';
    btn.style.setProperty('display', allowed ? '' : 'none', allowed ? '' : 'important');
    btn.disabled = !allowed;
    btn.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    btn.classList.toggle('active', allowed);
  });
  document.querySelectorAll('.mainPanel').forEach(panel => {
    const allowed = panel?.id === 'main-attendance';
    panel.dataset.generalHidden = allowed ? 'N' : 'Y';
    panel.style.setProperty('display', allowed ? '' : 'none', allowed ? '' : 'important');
    panel.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    panel.classList.toggle('active', allowed);
  });
  ATTENDANCE_CURRENT_MAIN_TAB = 'attendance';
  try{ sessionStorage.setItem(ATTENDANCE_UI_STATE_KEYS.mainTab, 'attendance'); }catch(e){}
  try{ localStorage.removeItem(ATTENDANCE_UI_STATE_KEYS.mainTab); }catch(e){}
  if(typeof trendUpdatePeriodControlVisibility === 'function') trendUpdatePeriodControlVisibility();
  if(typeof applyAttendanceManualEditControls === 'function') applyAttendanceManualEditControls();
}
async function resolveAttendanceGeneralUserAccess(force){
  if(ATTENDANCE_GENERAL_USER_ACCESS_STATE.loading && !force) return isCurrentAttendanceGeneralUser();
  if(ATTENDANCE_GENERAL_USER_ACCESS_STATE.resolved && !force) return isCurrentAttendanceGeneralUser();
  ATTENDANCE_GENERAL_USER_ACCESS_STATE.loading = true;
  try{
    if(isCurrentAttendanceAdmin() || (typeof isCurrentAttendanceOperator === 'function' && isCurrentAttendanceOperator())){
      Object.assign(ATTENDANCE_GENERAL_USER_ACCESS_STATE, { resolved:true, isGeneral:false, reason:'admin/operator' });
      return false;
    }
    const summary = getAttendanceCurrentIdentitySummary();
    const client = window.__attendanceSupabaseClient || (window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null);
    if(client && client.auth && typeof client.auth.getSession === 'function'){
      try{
        const sessionRes = await client.auth.getSession();
        const sessionEmail = String(sessionRes?.data?.session?.user?.email || '').trim().toLowerCase();
        if(sessionEmail && !summary.email) summary.email = sessionEmail;
      }catch(e){}
    }
    if(client && summary.email){
      try{
        const res = await client.from('users').select('email,name,role,employee_no,is_active').eq('email', summary.email).maybeSingle();
        if(!res?.error && res?.data && res.data.is_active !== false){
          summary.role = summary.role || res.data.role || '';
          summary.name = summary.name || res.data.name || '';
          summary.employeeNo = summary.employeeNo || res.data.employee_no || '';
        }
      }catch(e){}
    }
    const emp = findAttendanceEmployeeForCurrentUser(summary);
    if(emp){
      summary.name = summary.name || String(emp.name || emp.employee_name || '').trim();
      summary.employeeNo = summary.employeeNo || String(emp.employee_no || emp.employeeNo || emp.id || '').trim();
      summary.role = summary.role || getAttendanceEmployeeAuthority(emp) || String(emp.role || '').trim();
    }
    const normalizedRole = normalizeAttendanceGeneralRole(summary.role);
    const normalizedAuthority = normalizeAttendanceGeneralRole(getAttendanceEmployeeAuthority(emp));
    const effectiveAccessForGeneralCheck = (window.currentAccess || (typeof getAttendanceEffectiveAccess === 'function' ? getAttendanceEffectiveAccess() : {}) || {});
    const effectiveRoleForGeneralCheck = String(effectiveAccessForGeneralCheck.role || effectiveAccessForGeneralCheck.primaryRole || '').trim();
    const effectivePrivileged = !!(
      effectiveAccessForGeneralCheck.isAdmin || effectiveAccessForGeneralCheck.isOperator ||
      effectiveAccessForGeneralCheck.isDirector || effectiveAccessForGeneralCheck.isManager ||
      effectiveAccessForGeneralCheck.isTeamLeader || effectiveAccessForGeneralCheck.isLeader ||
      effectiveAccessForGeneralCheck.canViewAll || effectiveAccessForGeneralCheck.canViewDivision ||
      effectiveAccessForGeneralCheck.canViewManagedTeams || effectiveAccessForGeneralCheck.canViewTeam ||
      ['admin','operator','director','manager','teamLeader','teamleader','leader'].includes(effectiveRoleForGeneralCheck)
    );
    const privileged = effectivePrivileged || normalizedRole === 'admin' || normalizedRole === 'operator' || normalizedRole === 'privileged' || normalizedAuthority === 'admin' || normalizedAuthority === 'operator' || normalizedAuthority === 'privileged';
    // 일반사용자 기준 고정:
    // 관리자(users.role=admin), 운영자(attendance_operators), 자동권한자(소장/본부장/담당/팀장)가 아니면 모두 일반사용자입니다.
    // 따라서 사원 마스터의 '팀원' 또는 권한 공란/일반 role은 본인조회 전용으로 잠급니다.
    const hasIdentity = !!(summary.email || summary.employeeNo || summary.name || emp);
    const isGeneral = hasIdentity && !privileged;
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.isGeneral = isGeneral;
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.name = summary.name || '';
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.email = summary.email || '';
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.employeeNo = summary.employeeNo || '';
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.reason = isGeneral ? 'general user scoped' : 'not general user';
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.resolved = true;
    applyAttendanceGeneralUserVisibility();
    return isGeneral;
  }catch(e){
    console.warn('[GENERAL USER ACCESS] 일반사용자 권한 확인 실패:', e);
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.isGeneral = false;
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.reason = 'check exception';
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.resolved = true;
    return false;
  }finally{
    ATTENDANCE_GENERAL_USER_ACCESS_STATE.loading = false;
  }
}
window.isCurrentAttendanceGeneralUser = isCurrentAttendanceGeneralUser;
window.scopeAttendanceRowsForGeneralUser = scopeAttendanceRowsForGeneralUser;
window.resolveAttendanceGeneralUserAccess = resolveAttendanceGeneralUserAccess;
function isCurrentAttendanceAdmin(){
  return ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin === true;
}
function getAttendanceFallbackAdminByStorage(){
  const identities = readAttendanceStoredUsers();
  for(const item of identities){
    if(isAttendanceAdminRole(getAttendanceRoleFromIdentity(item))) return true;
  }
  return false;
}
function applyAttendanceAdminVisibility(isAdmin){
  const allowed = isAdmin === true;
  const adminTab = document.querySelector('.mainTab[data-main="admin"]');
  const adminPanel = document.getElementById('main-admin');
  if(adminTab){
    adminTab.dataset.adminHidden = allowed ? 'N' : 'Y';
    adminTab.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    adminTab.disabled = !allowed;
  }
  if(adminPanel){
    adminPanel.dataset.adminHidden = allowed ? 'N' : 'Y';
    adminPanel.setAttribute('aria-hidden', allowed ? 'false' : 'true');
  }
  if(!allowed && adminPanel && adminPanel.classList.contains('active')){
    activateMainTabWithoutRender('attendance');
  }
}
async function resolveAttendanceAdminAccess(force){
  if(ATTENDANCE_ADMIN_ACCESS_STATE.loading && !force) return ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin;
  if(ATTENDANCE_ADMIN_ACCESS_STATE.resolved && !force) return ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin;
  ATTENDANCE_ADMIN_ACCESS_STATE.loading = true;
  try{
    if(getAttendanceFallbackAdminByStorage()){
      ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin = true;
      ATTENDANCE_ADMIN_ACCESS_STATE.reason = 'local role admin';
      ATTENDANCE_ADMIN_ACCESS_STATE.resolved = true;
      applyAttendanceAdminVisibility(true);
      return true;
    }
    const client = window.__attendanceSupabaseClient || (window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null);
    let email = '';
    if(client && client.auth && typeof client.auth.getSession === 'function'){
      try{
        const sessionRes = await client.auth.getSession();
        email = String(sessionRes?.data?.session?.user?.email || '').trim().toLowerCase();
      }catch(e){}
    }
    if(!email){
      const identities = readAttendanceStoredUsers();
      for(const item of identities){
        email = getAttendanceEmailFromIdentity(item);
        if(email) break;
      }
    }
    ATTENDANCE_ADMIN_ACCESS_STATE.email = email;
    if(client && email){
      const res = await client.from('users').select('email,name,role,is_active').eq('email', email).maybeSingle();
      if(!res?.error && res?.data && res.data.is_active !== false && isAttendanceAdminRole(res.data.role)){
        ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin = true;
        ATTENDANCE_ADMIN_ACCESS_STATE.reason = 'users.role admin';
      }else{
        ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin = false;
        ATTENDANCE_ADMIN_ACCESS_STATE.reason = res?.error ? 'users lookup failed' : 'not admin';
      }
    }else{
      ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin = false;
      ATTENDANCE_ADMIN_ACCESS_STATE.reason = 'no user email';
    }
    ATTENDANCE_ADMIN_ACCESS_STATE.resolved = true;
    applyAttendanceAdminVisibility(ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin);
    return ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin;
  }catch(e){
    console.warn('[ADMIN ACCESS] 관리자 권한 확인 실패:', e);
    ATTENDANCE_ADMIN_ACCESS_STATE.isAdmin = false;
    ATTENDANCE_ADMIN_ACCESS_STATE.reason = 'check exception';
    ATTENDANCE_ADMIN_ACCESS_STATE.resolved = true;
    applyAttendanceAdminVisibility(false);
    return false;
  }finally{
    ATTENDANCE_ADMIN_ACCESS_STATE.loading = false;
  }
}
window.isCurrentAttendanceAdmin = isCurrentAttendanceAdmin;
window.resolveAttendanceAdminAccess = resolveAttendanceAdminAccess;


const ATTENDANCE_MANUAL_EDIT_ACCESS_STATE = { resolved:false, loading:false, isOperator:false, email:'', employeeNo:'', reason:'' };
function normalizeAttendanceManualEmail(v){
  return String(v || '').trim().toLowerCase();
}
function getAttendanceEmployeeNoFromIdentity(obj){
  if(!obj || typeof obj !== 'object') return '';
  return String(obj.employee_no || obj.employeeNo || obj.emp_no || obj.empNo || obj.id || obj.user_id || obj.userId || obj?.profile?.employee_no || obj?.profile?.employeeNo || '').trim();
}
function getAttendanceManualIdentityCandidates(){
  const identities = readAttendanceStoredUsers();
  const emails = new Set();
  const employeeNos = new Set();
  identities.forEach(item => {
    const email = getAttendanceEmailFromIdentity(item);
    const no = getAttendanceEmployeeNoFromIdentity(item);
    if(email) emails.add(normalizeAttendanceManualEmail(email));
    if(no) employeeNos.add(String(no).trim());
  });
  return { emails, employeeNos };
}
function isCurrentAttendanceOperator(){
  return ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.isOperator === true;
}
function canEditAttendanceManualChecks(){
  return isCurrentAttendanceAdmin() || isCurrentAttendanceOperator();
}
function applyAttendanceManualEditControls(){
  const canEdit = canEditAttendanceManualChecks();
  try{
    const saveBtn = document.querySelector('.attHeaderBtn.save');
    if(saveBtn){
      saveBtn.disabled = !canEdit;
      saveBtn.title = canEdit ? '' : '관리자 또는 운영자만 저장할 수 있습니다.';
    }
  }catch(_e){}
}
async function resolveAttendanceManualEditAccess(force){
  if(ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.loading && !force) return canEditAttendanceManualChecks();
  if(ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.resolved && !force) return canEditAttendanceManualChecks();
  ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.loading = true;
  try{
    const admin = await resolveAttendanceAdminAccess(force);
    if(admin){
      ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.isOperator = false;
      ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.reason = 'admin can edit';
      ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.resolved = true;
      applyAttendanceManualEditControls();
      return true;
    }

    const client = window.__attendanceSupabaseClient || (window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null);
    const ids = getAttendanceManualIdentityCandidates();
    let sessionEmail = '';
    if(client && client.auth && typeof client.auth.getSession === 'function'){
      try{
        const sessionRes = await client.auth.getSession();
        sessionEmail = normalizeAttendanceManualEmail(sessionRes?.data?.session?.user?.email || '');
        if(sessionEmail) ids.emails.add(sessionEmail);
      }catch(_e){}
    }
    ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.email = Array.from(ids.emails)[0] || '';
    ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.employeeNo = Array.from(ids.employeeNos)[0] || '';

    if(client && (ids.emails.size || ids.employeeNos.size)){
      const res = await client
        .from('attendance_operators')
        .select('employee_no,email,name,is_active')
        .eq('is_active', true);
      if(res && !res.error){
        const rows = Array.isArray(res.data) ? res.data : [];
        ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.isOperator = rows.some(row => {
          const rowEmail = normalizeAttendanceManualEmail(row?.email || '');
          const rowNo = String(row?.employee_no || row?.employeeNo || '').trim();
          return (rowEmail && ids.emails.has(rowEmail)) || (rowNo && ids.employeeNos.has(rowNo));
        });
        ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.reason = ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.isOperator ? 'attendance_operators match' : 'not operator';
      }else{
        console.warn('[ATTENDANCE MANUAL EDIT ACCESS] 운영자 조회 실패:', res?.error);
        ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.isOperator = false;
        ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.reason = 'operator lookup failed';
      }
    }else{
      ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.isOperator = false;
      ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.reason = 'no identity';
    }
    ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.resolved = true;
    applyAttendanceManualEditControls();
    return canEditAttendanceManualChecks();
  }catch(e){
    console.warn('[ATTENDANCE MANUAL EDIT ACCESS] 권한 확인 실패:', e);
    ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.isOperator = false;
    ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.reason = 'check exception';
    ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.resolved = true;
    applyAttendanceManualEditControls();
    return canEditAttendanceManualChecks();
  }finally{
    ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.loading = false;
  }
}
window.isCurrentAttendanceOperator = isCurrentAttendanceOperator;
window.canEditAttendanceManualChecks = canEditAttendanceManualChecks;
window.resolveAttendanceManualEditAccess = resolveAttendanceManualEditAccess;
window.applyAttendanceManualEditControls = applyAttendanceManualEditControls;


/* effectiveAccess: 로그인 사용자 권한/조회범위 통합 객체 */
const ATTENDANCE_EFFECTIVE_ACCESS_STATE = { resolved:false, loading:false, access:null, reason:'' };
function attendanceUniqueArray(values){
  const out = [];
  (Array.isArray(values) ? values : [values]).forEach(v => {
    if(Array.isArray(v)){
      v.forEach(x => { const s = String(x || '').trim(); if(s && !out.includes(s)) out.push(s); });
      return;
    }
    const s = String(v || '').trim();
    if(s && !out.includes(s)) out.push(s);
  });
  return out;
}
function getAttendanceEmployeeNo(emp){
  if(!emp || typeof emp !== 'object') return '';
  return String(emp.employee_no || emp.employeeNo || emp.id || emp.emp_no || emp.empNo || '').trim();
}
function getAttendanceEmployeeEmail(emp){
  if(!emp || typeof emp !== 'object') return '';
  return String(emp.email || emp.mail || emp.user_email || emp.userEmail || '').trim().toLowerCase();
}
function getAttendanceEmployeeName(emp){
  if(!emp || typeof emp !== 'object') return '';
  return String(emp.name || emp.employee_name || emp.employeeName || '').trim();
}
function getAttendanceEmployeeDivisionCode(emp){
  if(!emp || typeof emp !== 'object') return '';
  return String(emp.divisionCode || emp.division_code || emp.division || emp.divisionName || '').trim();
}
function getAttendanceEmployeeTeamCode(emp){
  if(!emp || typeof emp !== 'object') return '';
  return String(emp.teamCode || emp.team_code || emp.team || emp.teamName || '').trim();
}
function getAttendanceEmployeeManagedTeamCodes(emp){
  if(!emp || typeof emp !== 'object') return [];
  const fallback = getAttendanceEmployeeAuthority(emp) === '담당' ? getAttendanceEmployeeTeamCode(emp) : '';
  if(typeof normalizeManagedTeams === 'function') return normalizeManagedTeams(emp.managedTeams || emp.managed_teams || emp.managedTeamCodes || emp.managed_team_codes || emp.manageTeamCode || emp.manage_team_code || '', fallback);
  const raw = emp.managedTeams || emp.managed_teams || emp.managedTeamCodes || emp.managed_team_codes || emp.manageTeamCode || emp.manage_team_code || '';
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const normalized = attendanceUniqueArray(list.map(v => String(v || '').trim()).filter(Boolean));
  return normalized.length ? normalized : (fallback ? [fallback] : []);
}
function buildEffectiveAccess(options){
  options = options || {};
  const summary = options.summary || getAttendanceCurrentIdentitySummary();
  const emp = options.employee || findAttendanceEmployeeForCurrentUser(summary) || null;
  const authority = String(getAttendanceEmployeeAuthority(emp) || summary.role || '').trim();
  const normalizedRole = normalizeAttendanceGeneralRole(summary.role);
  const isAdmin = options.isAdmin === true || isCurrentAttendanceAdmin() || normalizedRole === 'admin';
  const isOperator = !isAdmin && (options.isOperator === true || (typeof isCurrentAttendanceOperator === 'function' && isCurrentAttendanceOperator()) || normalizedRole === 'operator');
  const isDirector = !isAdmin && !isOperator && ['소장','본부장'].includes(authority);
  const isManager = !isAdmin && !isOperator && authority === '담당';
  const isTeamLeader = !isAdmin && !isOperator && authority === '팀장';
  const hasIdentity = !!(summary.email || summary.employeeNo || summary.name || emp);
  const isGeneral = hasIdentity && !isAdmin && !isOperator && !isDirector && !isManager && !isTeamLeader;
  const employeeNo = String(summary.employeeNo || getAttendanceEmployeeNo(emp) || '').trim();
  const email = String(summary.email || getAttendanceEmployeeEmail(emp) || '').trim().toLowerCase();
  const name = String(summary.name || getAttendanceEmployeeName(emp) || '').trim();
  const divisionCode = getAttendanceEmployeeDivisionCode(emp);
  const teamCode = getAttendanceEmployeeTeamCode(emp);
  const managedTeamCodes = isManager ? getAttendanceEmployeeManagedTeamCodes(emp) : [];
  let scopeLevel = 'none';
  let scopeLabel = '미확인';
  let divisionCodes = [];
  let teamCodes = [];
  let employeeNos = [];
  if(isAdmin){
    scopeLevel = 'all';
    scopeLabel = '전체 조회';
  }else if(isOperator){
    scopeLevel = 'all';
    scopeLabel = '운영자 전체 조회';
  }else if(isDirector){
    scopeLevel = 'division';
    divisionCodes = attendanceUniqueArray([divisionCode]);
    scopeLabel = divisionCode ? `${divisionCode} 하위 전체` : '소속 본부/연구소 전체';
  }else if(isManager){
    scopeLevel = 'managedTeams';
    divisionCodes = attendanceUniqueArray([divisionCode]);
    teamCodes = attendanceUniqueArray(managedTeamCodes);
    scopeLabel = teamCodes.length ? `관리팀 ${teamCodes.join(', ')}` : '관리팀 미지정';
  }else if(isTeamLeader){
    scopeLevel = 'team';
    divisionCodes = attendanceUniqueArray([divisionCode]);
    teamCodes = attendanceUniqueArray([teamCode]);
    scopeLabel = teamCode ? `${teamCode} 팀` : '소속 팀';
  }else if(isGeneral){
    scopeLevel = 'self';
    divisionCodes = attendanceUniqueArray([divisionCode]);
    teamCodes = attendanceUniqueArray([teamCode]);
    employeeNos = attendanceUniqueArray([employeeNo]);
    scopeLabel = '본인 데이터';
  }
  const primaryRole = isAdmin ? 'admin' : isOperator ? 'operator' : isDirector ? 'director' : isManager ? 'manager' : isTeamLeader ? 'teamLeader' : isGeneral ? 'general' : 'unknown';
  const primaryRoleLabel = isAdmin ? '관리자' : isOperator ? '운영자' : isDirector ? '소장/본부장' : isManager ? '담당' : isTeamLeader ? '팀장' : isGeneral ? '일반사용자' : '미확인';
  return {
    resolvedAt: new Date().toISOString(),
    primaryRole,
    primaryRoleLabel,
    role: primaryRole,
    roleLabel: primaryRoleLabel,
    authority,
    isAdmin,
    isOperator,
    isDirector,
    isManager,
    isTeamLeader,
    isLeader: isTeamLeader,
    isGeneral,
    canAccessAdmin: isAdmin,
    canEditManualChecks: isAdmin || isOperator,
    canViewAll: isAdmin || isOperator,
    canViewDivision: isDirector,
    canViewManagedTeams: isManager,
    canViewTeam: isTeamLeader,
    canViewSelfOnly: isGeneral,
    user: { employeeNo, email, name, divisionCode, teamCode },
    employee: emp || null,
    scope: {
      level: scopeLevel,
      label: scopeLabel,
      divisionCodes,
      teamCodes,
      managedTeamCodes,
      employeeNos,
      email: isGeneral ? email : ''
    },
    debug: {
      adminReason: ATTENDANCE_ADMIN_ACCESS_STATE.reason || '',
      operatorReason: ATTENDANCE_MANUAL_EDIT_ACCESS_STATE.reason || '',
      matchedEmployee: !!emp
    }
  };
}
async function resolveAttendanceEffectiveAccess(force){
  if(ATTENDANCE_EFFECTIVE_ACCESS_STATE.loading && !force) return ATTENDANCE_EFFECTIVE_ACCESS_STATE.access;
  if(ATTENDANCE_EFFECTIVE_ACCESS_STATE.resolved && !force) return ATTENDANCE_EFFECTIVE_ACCESS_STATE.access;
  ATTENDANCE_EFFECTIVE_ACCESS_STATE.loading = true;
  try{
    await resolveAttendanceAdminAccess(force);
    await resolveAttendanceManualEditAccess(force);
    const summary = getAttendanceCurrentIdentitySummary();
    const client = window.__attendanceSupabaseClient || (window.supabase && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined' ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null);
    if(client && client.auth && typeof client.auth.getSession === 'function'){
      try{
        const sessionRes = await client.auth.getSession();
        const sessionEmail = String(sessionRes?.data?.session?.user?.email || '').trim().toLowerCase();
        if(sessionEmail && !summary.email) summary.email = sessionEmail;
      }catch(e){}
    }
    if(client && summary.email){
      try{
        const res = await client.from('users').select('email,name,role,employee_no,is_active').eq('email', summary.email).maybeSingle();
        if(!res?.error && res?.data && res.data.is_active !== false){
          summary.role = summary.role || res.data.role || '';
          summary.name = summary.name || res.data.name || '';
          summary.employeeNo = summary.employeeNo || res.data.employee_no || '';
        }
      }catch(e){}
    }
    const emp = findAttendanceEmployeeForCurrentUser(summary);
    if(emp){
      summary.name = summary.name || getAttendanceEmployeeName(emp);
      summary.employeeNo = summary.employeeNo || getAttendanceEmployeeNo(emp);
      summary.role = summary.role || getAttendanceEmployeeAuthority(emp) || String(emp.role || '').trim();
    }
    const access = buildEffectiveAccess({ summary, employee: emp, isAdmin:isCurrentAttendanceAdmin(), isOperator:isCurrentAttendanceOperator() });
    ATTENDANCE_EFFECTIVE_ACCESS_STATE.access = access;
    ATTENDANCE_EFFECTIVE_ACCESS_STATE.resolved = true;
    ATTENDANCE_EFFECTIVE_ACCESS_STATE.reason = 'resolved';
    window.currentAccess = access;
    window.ATTENDANCE_EFFECTIVE_ACCESS = access;
    try{ console.info('[ATTENDANCE EFFECTIVE ACCESS]', access); }catch(e){}
    return access;
  }catch(e){
    console.warn('[ATTENDANCE EFFECTIVE ACCESS] 권한 객체 생성 실패:', e);
    const access = buildEffectiveAccess({});
    ATTENDANCE_EFFECTIVE_ACCESS_STATE.access = access;
    ATTENDANCE_EFFECTIVE_ACCESS_STATE.resolved = true;
    ATTENDANCE_EFFECTIVE_ACCESS_STATE.reason = 'fallback';
    window.currentAccess = access;
    window.ATTENDANCE_EFFECTIVE_ACCESS = access;
    return access;
  }finally{
    ATTENDANCE_EFFECTIVE_ACCESS_STATE.loading = false;
  }
}
function getAttendanceEffectiveAccess(){
  return ATTENDANCE_EFFECTIVE_ACCESS_STATE.access || window.currentAccess || buildEffectiveAccess({});
}
window.buildEffectiveAccess = buildEffectiveAccess;
window.resolveAttendanceEffectiveAccess = resolveAttendanceEffectiveAccess;
window.getAttendanceEffectiveAccess = getAttendanceEffectiveAccess;


/* effective access menu binding: 메뉴 접근은 currentAccess 하나만 기준으로 판단 */
const ATTENDANCE_ANALYSIS_MAIN_TABS = ['dashboard','deep-analysis','trend-analysis','attendance-missing'];
function normalizeAttendanceMainTabName(tabName){
  return String(tabName || '').trim();
}
function canAccessAttendanceMainTab(tabName){
  const targetName = normalizeAttendanceMainTabName(tabName);
  if(!targetName) return false;
  if(targetName === 'attendance') return true;
  const access = (typeof getAttendanceEffectiveAccess === 'function') ? getAttendanceEffectiveAccess() : (window.currentAccess || {});
  const isAdmin = !!(access.isAdmin || (typeof isCurrentAttendanceAdmin === 'function' && isCurrentAttendanceAdmin()));
  const isOperator = !!(access.isOperator || (typeof isCurrentAttendanceOperator === 'function' && isCurrentAttendanceOperator()));
  const isDirector = !!access.isDirector;
  const isManager = !!access.isManager;
  const isTeamLeader = !!(access.isTeamLeader || access.isLeader);
  const effectivePrivileged = isAdmin || isOperator || isDirector || isManager || isTeamLeader || !!access.canViewAll || !!access.canViewDivision || !!access.canViewManagedTeams || !!access.canViewTeam;
  const isGeneral = !effectivePrivileged && !!(access.isGeneral || (typeof isCurrentAttendanceGeneralUser === 'function' && isCurrentAttendanceGeneralUser()));
  if(targetName === 'admin') return isAdmin;
  if(isGeneral) return false;
  if(ATTENDANCE_ANALYSIS_MAIN_TABS.includes(targetName)){
    return isAdmin || isOperator || isDirector || isManager || isTeamLeader || !!access.canViewAll || !!access.canViewDivision || !!access.canViewManagedTeams || !!access.canViewTeam;
  }
  return isAdmin || isOperator || isDirector || isManager || isTeamLeader;
}
function getAttendanceMainTabDenyMessage(tabName){
  const targetName = normalizeAttendanceMainTabName(tabName);
  if(targetName === 'admin') return '관리자만 접근할 수 있습니다.';
  if(typeof isCurrentAttendanceGeneralUser === 'function' && isCurrentAttendanceGeneralUser()) return '일반사용자는 근태관리 탭에서 본인 데이터만 조회할 수 있습니다.';
  return '현재 권한으로 접근할 수 없는 메뉴입니다.';
}
function applyAttendanceMainMenuAccess(){
  const tabs = Array.from(document.querySelectorAll('.mainTab'));
  const panels = Array.from(document.querySelectorAll('.mainPanel'));
  let activeAllowed = true;
  tabs.forEach(btn => {
    const mainName = normalizeAttendanceMainTabName(btn?.dataset?.main);
    const allowed = canAccessAttendanceMainTab(mainName);
    btn.dataset.accessHidden = allowed ? 'N' : 'Y';
    btn.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    btn.disabled = !allowed;
    btn.style.setProperty('display', allowed ? '' : 'none', allowed ? '' : 'important');
    if(btn.classList.contains('active') && !allowed) activeAllowed = false;
  });
  panels.forEach(panel => {
    const mainName = normalizeAttendanceMainTabName(String(panel?.id || '').replace(/^main-/, ''));
    const allowed = canAccessAttendanceMainTab(mainName);
    panel.dataset.accessHidden = allowed ? 'N' : 'Y';
    panel.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    panel.style.setProperty('display', allowed ? '' : 'none', allowed ? '' : 'important');
    if(panel.classList.contains('active') && !allowed) activeAllowed = false;
  });
  const savedTab = readAttendanceMainTab ? readAttendanceMainTab() : '';
  if(!activeAllowed || (savedTab && !canAccessAttendanceMainTab(savedTab))){
    activateMainTabWithoutRender('attendance');
    saveAttendanceMainTab('attendance');
  }
  if(typeof trendUpdatePeriodControlVisibility === 'function') trendUpdatePeriodControlVisibility();
}
window.canAccessAttendanceMainTab = canAccessAttendanceMainTab;
window.applyAttendanceMainMenuAccess = applyAttendanceMainMenuAccess;

function saveAttendanceMainTab(tabName){
  try{
    const value = String(tabName || '').trim();
    if(!value) return;
    ATTENDANCE_CURRENT_MAIN_TAB = value;
    sessionStorage.setItem(ATTENDANCE_UI_STATE_KEYS.mainTab, value);
  }catch(e){}
}
function readAttendanceMainTab(){
  try{
    return String(sessionStorage.getItem(ATTENDANCE_UI_STATE_KEYS.mainTab) || ATTENDANCE_CURRENT_MAIN_TAB || '').trim();
  }catch(e){ return String(ATTENDANCE_CURRENT_MAIN_TAB || '').trim(); }
}
function restoreSavedAttendancePeriod(){
  const savedPeriod = readAttendanceUiState(ATTENDANCE_UI_STATE_KEYS.period);
  if(savedPeriod) STATE.period = savedPeriod;
}
function activateMainTabWithoutRender(tabName){
  const targetName = String(tabName || '').trim();
  if(!targetName) return false;
  if(typeof canAccessAttendanceMainTab === 'function' && !canAccessAttendanceMainTab(targetName)) return false;
  const btn = document.querySelector(`.mainTab[data-main="${targetName}"]`);
  const panel = document.querySelector(`#main-${targetName}`);
  if(!btn || !panel) return false;
  document.querySelectorAll('.mainTab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.mainPanel').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  panel.classList.add('active');
  ATTENDANCE_CURRENT_MAIN_TAB = targetName;
  try{ sessionStorage.setItem(ATTENDANCE_UI_STATE_KEYS.mainTab, targetName); }catch(e){}
  return true;
}
function restoreSavedMainTab(preferredTab){
  if(isCurrentAttendanceGeneralUser()){
    activateMainTabWithoutRender('attendance');
    saveAttendanceMainTab('attendance');
    applyAttendanceGeneralUserVisibility();
    return;
  }
  const targetTab = String(preferredTab || readAttendanceMainTab() || 'attendance').trim() || 'attendance';
  const restored = activateMainTabWithoutRender(targetTab);
  if(!restored){
    activateMainTabWithoutRender('attendance');
    saveAttendanceMainTab('attendance');
  }
  if(typeof trendUpdatePeriodControlVisibility === 'function') trendUpdatePeriodControlVisibility();
}
restoreSavedAttendancePeriod();
applyAttendanceAdminVisibility(false);
resolveAttendanceAdminAccess(false).then(function(isAdmin){
  if(isAdmin && readAttendanceMainTab() === 'admin') activateMainTabWithoutRender('admin');
  if(!isAdmin && readAttendanceMainTab() === 'admin') saveAttendanceMainTab('attendance');
  return resolveAttendanceManualEditAccess(false);
}).then(function(){
  return resolveAttendanceEffectiveAccess(false);
}).then(function(){
  return resolveAttendanceGeneralUserAccess(false);
}).then(function(){
  return resolveAttendanceEffectiveAccess(true);
}).then(function(){
  applyAttendanceGeneralUserVisibility();
  if(typeof applyAttendanceMainMenuAccess === 'function') applyAttendanceMainMenuAccess();
  if(typeof render === 'function') render();
}).catch(function(e){
  console.warn('[ATTENDANCE ACCESS INIT] 권한 초기화 실패:', e);
});


const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function renderEmptyChart(el, message='데이터 없음'){
  const width = el.clientWidth || 900;
  const height = el.clientHeight || 320;
  el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>
    <text x="${width/2}" y="${height/2}" text-anchor="middle" style="fill:#94a3b8;font-size:16px">${message}</text>
  </svg>`;
}

function avg(arr, key){ return arr.length ? arr.reduce((s,x)=>s+(x[key]||0),0)/arr.length : 0; }
function groupBy(arr, key){ return arr.reduce((a,c)=>((a[c[key]]??=[]).push(c),a),{}); }
function getAvailableAttendancePeriodOptions(){
  const monthSet = new Set(
    (Array.isArray(REAL_ATTENDANCE_DATA) ? REAL_ATTENDANCE_DATA : [])
      .map(row => String(row?.date || '').trim().slice(0, 7))
      .filter(value => /^\d{4}-\d{2}$/.test(value))
  );
  return Array.from(monthSet)
    .sort((a,b) => a.localeCompare(b, 'ko'))
    .map(value => ({
      value,
      label: `${value.slice(2,4)}.${value.slice(5,7)}`,
      monthText: `${parseInt(value.slice(5,7), 10)}월`
    }));
}
function getSelectedAttendancePeriodMeta(){
  const options = getAvailableAttendancePeriodOptions();
  if(!options.length){
    return { value:'ALL', label:'전체', monthText:'전체' };
  }
  const matched = options.find(item => item.value === STATE.period);
  if(matched) return matched;
  return options[options.length - 1];
}
function rowMatchesSelectedPeriod(dateText){
  const date = String(dateText || '').trim();
  if(!date) return false;
  const selected = getSelectedAttendancePeriodMeta();
  if(!selected || selected.value === 'ALL') return true;
  return date.startsWith(`${selected.value}-`);
}
function periodLabel(){
  return String(getSelectedAttendancePeriodMeta()?.label || '전체');
}
function buildScopedPeriodMonths(list){
  const scoped = Array.isArray(list) ? list : [];
  const selected = getSelectedAttendancePeriodMeta();
  if(!scoped.length){
    return [{month:selected.monthText || '전체', overtime:0, avgDailyOvertime:0, avgOvertimePerPerson:0, highRisk:0, leaveZero:0, avgDailyHours:0, avgAdjustedWorkHours:0, avgBaseWorkHours:0, avgHiddenOvertime:0, concentration:0, riskScore:0, avgTotalLoad:0, totalMonthlyOvertime:0}];
  }
  const totalMonthlyOT = scoped.reduce((sum, item) => sum + Number(item.scopedMonthlyOvertime || 0), 0);
  const avgDailyHours = avg(scoped, 'scopedDailyHours');
  const avgDailyOvertime = avg(scoped, 'scopedDailyOvertime');
  const avgOvertimePerPerson = avg(scoped, 'scopedMonthlyOvertime');
  const avgTotalLoad = avg(scoped, 'scopedDailyTotalLoad');
  const highRisk = scoped.filter(item => Number(item.scopedRisk || 0) >= 75).length;
  const leaveZero = scoped.filter(item => Number(item.leaveUsed || 0) === 0).length;
  const workConMetrics = getWorkConcentrationMetrics(scoped);
  const concentration = Math.min(100, Math.round(Number(workConMetrics.workConcentrationRate || 0)));
  const riskScore = Math.min(100, Math.round(avg(scoped, 'scopedRisk')));
  return [{
    month:selected.monthText || '전체',
    overtime:+avgDailyOvertime.toFixed(1),
    avgDailyOvertime:+avgDailyOvertime.toFixed(1),
    avgTotalLoad:+avgTotalLoad.toFixed(1),
    avgOvertimePerPerson:+avgOvertimePerPerson.toFixed(1),
    totalMonthlyOvertime:+totalMonthlyOT.toFixed(1),
    highRisk,
    leaveZero,
    avgDailyHours:+avgDailyHours.toFixed(1),
    concentration,
    riskScore
  }];
}
function periodMonths(){ return buildScopedPeriodMonths(scopedEmployees()); }
function periodMultiplier(){ return 1; }
function periodRiskAdder(){ return 0; }
function getDashboardEmployeeBase(){
  const base = EMPLOYEES.filter(e =>
    String(e.status || '재직') === '재직' &&
    String(e.attendanceTarget || 'Y') === 'Y' &&
    (STATE.division==='전체' || e.division===STATE.division) &&
    (STATE.team==='전체' || e.team===STATE.team)
  );
  return scopeRowsByEffectiveAccess(base);
}
function filteredEmployees(){
  return getDashboardEmployeeBase();
}

function getRetirementRiskMetrics(baseScoped){
  const scoped = Array.isArray(baseScoped) ? baseScoped : [];
  const source = Array.isArray(empMaster) && empMaster.length ? empMaster : EMPLOYEES;
  const selectedMonthNumbers = new Set((periodMonths() || [])
    .map(item => parseInt(String(item?.month || '').replace(/[^0-9]/g, ''), 10))
    .filter(num => Number.isFinite(num) && num >= 1 && num <= 12));

  const reasonWeightMap = {
    '자발적 이직': 1.0,
    '권고퇴직': 0.8,
    '정년퇴직': 0.2,
    '개인사유': 0.3,
    '기타': 0.5
  };

  const scopedRetired = source.filter(emp => {
    if(String(emp?.status || '') !== '퇴사') return false;
    if(STATE.division !== '전체' && String(emp?.division || '') !== STATE.division) return false;
    if(STATE.team !== '전체' && String(emp?.team || '') !== STATE.team) return false;
    const leaveDate = String(emp?.leaveDate || '').trim();
    if(!leaveDate) return false;
    const dt = new Date(leaveDate);
    if(Number.isNaN(dt.getTime())) return false;
    if(selectedMonthNumbers.size && !selectedMonthNumbers.has(dt.getMonth() + 1)) return false;
    return true;
  });

  const weightedRetireCount = scopedRetired.reduce((sum, emp) => {
    const reason = String(emp?.retireReason || '').trim();
    const weight = Object.prototype.hasOwnProperty.call(reasonWeightMap, reason) ? reasonWeightMap[reason] : 0.5;
    return sum + weight;
  }, 0);

  const denominator = Math.max(1, scoped.length + scopedRetired.length);
  const weightedRate = denominator > 0 ? (weightedRetireCount / denominator) * 100 : 0;
  const rawRate = denominator > 0 ? (scopedRetired.length / denominator) * 100 : 0;
  const score = Math.min(100, Math.round(weightedRate * 12));

  let riskClass = 'green';
  let riskLabel = '정상';
  let riskAction = '안정';
  if(score >= 70 || weightedRate >= 6){
    riskClass = 'red';
    riskLabel = '위험';
    riskAction = '대응';
  }else if(score >= 40 || weightedRate >= 3){
    riskClass = 'amber';
    riskLabel = '주의';
    riskAction = '관찰';
  }

  const reasonCounts = scopedRetired.reduce((acc, emp) => {
    const key = String(emp?.retireReason || '기타').trim() || '기타';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topReason = Object.entries(reasonCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || '-';

  return {
    count: scopedRetired.length,
    weightedRetireCount: +weightedRetireCount.toFixed(1),
    weightedRate,
    rawRate,
    score,
    riskClass,
    riskLabel,
    riskAction,
    topReason
  };
}

function normalizeRealWorkHours(rawHours){
  const n = Number(rawHours || 0);
  if(!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, +(n - 1).toFixed(1)); // 기존 보정 함수 유지
}
function normalizeOverloadHours(rawHours){
  const realHours = normalizeRealWorkHours(rawHours);
  return Math.max(0, +(realHours - 8.5).toFixed(1)); // 기존 보정 함수 유지
}

const ANALYSIS_LUNCH_HOURS = 1;
const ANALYSIS_FULL_DAY_HOURS = 8;
const ANALYSIS_FULL_DAY_SNAP_MIN = 7.5;
const ANALYSIS_FULL_DAY_TOLERANCE = 0.25; // 15분

function roundAnalysisHours(value){
  return +Number(value || 0).toFixed(1);
}
function getAnalysisWorkHoursFromValue(hours){
  const n = Number(hours || 0);
  if(!Number.isFinite(n) || n <= 0) return 0;
  if(n >= ANALYSIS_FULL_DAY_SNAP_MIN && n <= (ANALYSIS_FULL_DAY_HOURS + ANALYSIS_FULL_DAY_TOLERANCE)){
    return ANALYSIS_FULL_DAY_HOURS;
  }
  return Math.max(0, roundAnalysisHours(n));
}
function getAnalysisWorkHours(rawHours){
  const n = Number(rawHours || 0);
  if(!Number.isFinite(n) || n <= 0) return 0;
  const deducted = Math.max(0, n - ANALYSIS_LUNCH_HOURS);
  return getAnalysisWorkHoursFromValue(deducted);
}
function getAnalysisOverloadFromValue(hours){
  const adjusted = getAnalysisWorkHoursFromValue(hours);
  if(adjusted <= (ANALYSIS_FULL_DAY_HOURS + ANALYSIS_FULL_DAY_TOLERANCE)) return 0;
  return Math.max(0, roundAnalysisHours(adjusted - (ANALYSIS_FULL_DAY_HOURS + ANALYSIS_FULL_DAY_TOLERANCE)));
}
function getAnalysisOverloadHours(rawHours){
  const n = Number(rawHours || 0);
  if(!Number.isFinite(n) || n <= 0) return 0;
  const deducted = Math.max(0, n - ANALYSIS_LUNCH_HOURS);
  return getAnalysisOverloadFromValue(deducted);
}
function getEmployeeAnalysisDailyHours(person){
  const scopedValue = Number(person?.scopedDailyHours);
  if(Number.isFinite(scopedValue) && scopedValue > 0){
    return getAnalysisWorkHoursFromValue(scopedValue);
  }
  return getAnalysisWorkHours(Number(person?.avgDailyHours || 0));
}
function getEmployeeAnalysisOverloadHours(person){
  const scopedValue = Number(person?.scopedDailyHours);
  if(Number.isFinite(scopedValue) && scopedValue > 0){
    return getAnalysisOverloadFromValue(scopedValue);
  }
  return getAnalysisOverloadHours(Number(person?.avgDailyHours || 0));
}

function applyAttritionRiskModel(scopedList){
  const list = Array.isArray(scopedList) ? scopedList.map(item => ({...item})) : [];
  if(!list.length) return list;

  const teamGroups = Object.entries(groupBy(list, 'team'));
  const teamMetricMap = new Map();

  teamGroups.forEach(([teamName, members]) => {
    const workConMetrics = getWorkConcentrationMetrics(members);
    const gradeMetrics = getGradeImbalanceMetrics(members);
    const overtimeSorted = [...members]
      .sort((a,b) => Number(b.scopedMonthlyOvertime || 0) - Number(a.scopedMonthlyOvertime || 0));
    const topCount = Math.max(1, Math.ceil(members.length * 0.2));
    const topOvertimeNames = new Set(
      overtimeSorted
        .slice(0, topCount)
        .filter(person => Number(person.scopedMonthlyOvertime || 0) > 0)
        .map(person => String(person.name || '').trim())
    );

    teamMetricMap.set(teamName, {
      workConcentrationRate: Number(workConMetrics.workConcentrationRate || 0),
      gradeImbalanceScore: Number(gradeMetrics.gradeImbalanceScore || 0),
      topOvertimeNames
    });
  });

  return list.map(person => {
    const teamMetrics = teamMetricMap.get(person.team) || {
      workConcentrationRate: 0,
      gradeImbalanceScore: 0,
      topOvertimeNames: new Set()
    };

    const overtimeScore = Math.min(100, (toSafeNumber(person.scopedMonthlyOvertime || 0) / 20) * 100);
    const overloadBase = getEmployeeAnalysisOverloadHours(person);
    const overloadScore = Math.min(100, Math.max(0, (overloadBase / 1.2) * 100));

    const totalLoadDaily = toSafeNumber(
      person.scopedDailyTotalLoad ||
      (toSafeNumber(person.scopedDailyBaseWorkHours || 0) + toSafeNumber(person.scopedDailyOvertime || 0) + toSafeNumber(person.scopedDailyHiddenOvertime || 0)) ||
      person.avgTotalLoad || 0
    );
    const hiddenDaily = toSafeNumber(person.scopedDailyHiddenOvertime || 0);
    const issueDays = toSafeNumber(person.scopedIssueDays || person.issueDays || 0);

    const totalLoadScore =
      totalLoadDaily >= 10.5 ? 100 :
      totalLoadDaily >= 9.5 ? 75 :
      totalLoadDaily >= 8.5 ? 35 :
      totalLoadDaily >= 7.0 ? 10 :
      totalLoadDaily > 0 ? 5 : 0;

    const hiddenOvertimeScore =
      hiddenDaily >= 1.5 ? 100 :
      hiddenDaily >= 1 ? 90 :
      hiddenDaily >= 0.5 ? 70 :
      hiddenDaily > 0 ? 35 : 0;

    const issueDaysScore =
      issueDays >= 10 ? 100 :
      issueDays >= 8 ? 90 :
      issueDays >= 6 ? 75 :
      issueDays >= 4 ? 55 :
      issueDays >= 2 ? 35 :
      issueDays >= 1 ? 15 : 0;

    const persistenceScore =
      (issueDays >= 5 && totalLoadDaily >= 9.5) ? 100 :
      (issueDays >= 4 && totalLoadDaily >= 9) ? 80 :
      (issueDays >= 3 && totalLoadDaily >= 9) ? 65 :
      (issueDays >= 2 && totalLoadDaily >= 8.5) ? 40 : 0;

    const recoveryScore =
      toSafeNumber(person.leaveUsed || 0) === 0 && toSafeNumber(person.workDays || 0) >= 10 ? 90 :
      toSafeNumber(person.leaveUsed || 0) <= 0.5 ? 65 : 25;
    const concentrationScore = Math.min(100, toSafeNumber(teamMetrics.workConcentrationRate || 0));
    const gradeScore = Math.min(100, toSafeNumber(teamMetrics.gradeImbalanceScore || 0));
    const topOvertimeBonus =
      teamMetrics.topOvertimeNames.has(String(person.name || '').trim()) && toSafeNumber(person.scopedMonthlyOvertime || 0) >= 10 ? 10 : 0;

    const baseRisk = Math.min(
      100,
      Math.round(
        (overtimeScore * 0.10) +
        (overloadScore * 0.08) +
        (totalLoadScore * 0.22) +
        (hiddenOvertimeScore * 0.18) +
        (issueDaysScore * 0.10) +
        (persistenceScore * 0.12) +
        (recoveryScore * 0.10) +
        (concentrationScore * 0.06) +
        (gradeScore * 0.04) +
        topOvertimeBonus
      )
    );

    // ===== 강제 조건 적용 =====
    const ot = toSafeNumber(person.scopedMonthlyOvertime || 0);
    const totalLoad = toSafeNumber(totalLoadDaily);
    const hidden = toSafeNumber(hiddenDaily);
    const monthlyHidden = toSafeNumber(person.scopedMonthlyHiddenOvertime || person.monthlyHiddenOvertime || 0);
    const issues = toSafeNumber(issueDays);
    const leave = toSafeNumber(person.leaveUsed || 0);

    let finalRisk = baseRisk;

    if (
      ot >= 45 ||
      totalLoad >= 10.5 ||
      hidden >= 1.0 ||
      (ot >= 30 && (totalLoad >= 9 || monthlyHidden >= 10)) ||
      (ot >= 40 && leave <= 1) ||
      (ot >= 40 && issues >= 5) ||
      (totalLoad >= 10 && hidden >= 0.5)
    ) {
      finalRisk = Math.max(baseRisk, 75);
    } else if (
      ot >= 30 ||
      totalLoad >= 9.5 ||
      hidden >= 0.5 ||
      issues >= 6
    ) {
      finalRisk = Math.max(baseRisk, 50);
    }

    // 월 8시보정 근무시간이 40h 미만이면 분석 가능한 최소 근무 데이터가 부족한 것으로 보고 위험지수만 0점 처리한다.
    // 총부하/근무/연장근로/이슈일수/숨은초과 표시값은 원래 계산값을 유지한다.
    const monthlyAdjustedWorkForRisk = toSafeNumber(
      person.scopedMonthlyHours ||
      person.monthlyAdjustedWorkHours ||
      person.monthlyBaseWorkHours ||
      0
    );
    const riskFloorExcluded = monthlyAdjustedWorkForRisk < 40;
    if(riskFloorExcluded){
      finalRisk = 0;
    }

    const attritionRisk = finalRisk;

    return {
      ...person,
      riskFloorExcluded,
      scopedRisk: attritionRisk,
      scopedAttritionRisk: attritionRisk,
      scopedAttritionDrivers: {
        overtimeScore: Math.round(overtimeScore),
        overloadScore: Math.round(overloadScore),
        totalLoadScore: Math.round(totalLoadScore),
        hiddenOvertimeScore: Math.round(hiddenOvertimeScore),
        issueDaysScore: Math.round(issueDaysScore),
        persistenceScore: Math.round(persistenceScore),
        recoveryScore: Math.round(recoveryScore),
        concentrationScore: Math.round(concentrationScore),
        gradeScore: Math.round(gradeScore),
        topOvertimeBonus: Math.round(topOvertimeBonus)
      }
    };
  });
}

function scopedEmployees(){
  const m = periodMultiplier(), a = periodRiskAdder();
  const employeeSource = scopeAttendanceRowsForGeneralUser(filteredEmployees());
  const base = employeeSource.map(e => ({
    ...e,
    scopedMonthlyHours:+(Number(e.monthlyAdjustedWorkHours || e.monthlyBaseWorkHours || e.monthlyHours || 0)*m).toFixed(1),
    scopedDailyHours:+Number(e.avgAdjustedWorkHours || e.avgDailyHours || 0).toFixed(1),
    scopedMonthlyBaseWorkHours:+(Number(e.monthlyBaseWorkHours || 0)*m).toFixed(1),
    scopedDailyBaseWorkHours:+Number(e.avgBaseWorkHours || 0).toFixed(1),
    scopedMonthlyHiddenOvertime:+(Number(e.monthlyHiddenOvertime || 0)*m).toFixed(1),
    scopedDailyHiddenOvertime:+Number(e.avgHiddenOvertime || 0).toFixed(1),
    scopedMonthlyOvertime:+(Number(e.overtime || 0)*m).toFixed(1),
    scopedDailyOvertime:+Number(e.avgDailyOvertime || 0).toFixed(1),
    scopedDailyTotalLoad:+Number(e.avgTotalLoad || 0).toFixed(1),
    scopedIssueDays:+(Number(e.issueDays || 0)*m).toFixed(1),
    scopedRecoveryIssueDays:+(Number(e.recoveryIssueDays || 0)*m).toFixed(1),
    scopedRisk:Math.min(100, Number(e.risk || 0)+a)
  }));
  return applyAttritionRiskModel(base).map(item => {
    if(item.riskFloorExcluded){
      return {
        ...item,
        scopedRisk: 0,
        scopedAttritionRisk: 0
      };
    }
    return {
      ...item,
      scopedRisk: Math.min(100, Number(item.scopedRisk || 0) + a),
      scopedAttritionRisk: Math.min(100, Number(item.scopedAttritionRisk || 0) + a)
    };
  });
}
function getOrgRiskMetrics(list){
  const members = Array.isArray(list) ? list.filter(Boolean) : [];
  const n = members.length || 0;
  if(!n){
    return {
      count:0,
      riskCount:0,
      warnCount:0,
      riskWarningRatio:0,
      avgTotalLoad:0,
      avgOvertime:0,
      avgIssueDays:0,
      avgHiddenOvertime:0,
      avgRecovery:100,
      ratioScore:0,
      totalLoadScore:0,
      overtimeScore:0,
      issueScore:0,
      hiddenScore:0,
      recoveryRiskScore:0,
      score:0
    };
  }
  const riskValues = members.map(x => toSafeNumber(
    (typeof x.scopedRisk !== 'undefined' ? x.scopedRisk : null) ??
    (typeof x.scopedAttritionRisk !== 'undefined' ? x.scopedAttritionRisk : null) ??
    x.risk ?? 0
  ));
  const riskCount = riskValues.filter(v => v >= 75).length;
  const warnCount = riskValues.filter(v => v >= 50 && v < 75).length;
  const weightedRiskRatio = (riskCount + warnCount * 0.5) / n;
  const avgTotalLoad = members.reduce((sum,x) => {
    const value = toSafeNumber(
      x.scopedDailyTotalLoad ||
      (toSafeNumber(x.scopedDailyBaseWorkHours || 0) + toSafeNumber(x.scopedDailyOvertime || 0) + toSafeNumber(x.scopedDailyHiddenOvertime || 0)) ||
      x.avgTotalLoad ||
      getEmployeeAnalysisDailyHours(x) ||
      0
    );
    return sum + value;
  },0) / n;
  const avgOvertime = members.reduce((sum,x) => sum + toSafeNumber(
    (typeof x.scopedMonthlyOvertime !== 'undefined' ? x.scopedMonthlyOvertime : null) ?? x.overtime ?? 0
  ),0) / n;
  const avgIssueDays = members.reduce((sum,x) => sum + toSafeNumber(
    (typeof x.scopedIssueDays !== 'undefined' ? x.scopedIssueDays : null) ?? x.issueDays ?? 0
  ),0) / n;
  const avgHiddenOvertime = members.reduce((sum,x) => sum + toSafeNumber(
    (typeof x.scopedMonthlyHiddenOvertime !== 'undefined' ? x.scopedMonthlyHiddenOvertime : null) ?? x.monthlyHiddenOvertime ?? 0
  ),0) / n;
  const avgRecovery = members.reduce((sum,x) => sum + toSafeNumber(getRecoveryIndex(x)),0) / n;

  const ratioScore = Math.min(100, Math.round((weightedRiskRatio / 0.35) * 100));
  const totalLoadScore = avgTotalLoad >= 9.5 ? 100 : avgTotalLoad >= 9 ? 80 : avgTotalLoad >= 8.5 ? 55 : avgTotalLoad >= 8 ? 25 : 0;
  const overtimeScore = avgOvertime >= 25 ? 100 : avgOvertime >= 20 ? 80 : avgOvertime >= 10 ? 50 : avgOvertime > 0 ? 20 : 0;
  const issueScore = avgIssueDays >= 4 ? 100 : avgIssueDays >= 3 ? 80 : avgIssueDays >= 1 ? 45 : avgIssueDays > 0 ? 20 : 0;
  const hiddenScore = avgHiddenOvertime >= 8 ? 100 : avgHiddenOvertime >= 6 ? 80 : avgHiddenOvertime >= 3 ? 50 : avgHiddenOvertime > 0 ? 20 : 0;
  const recoveryRiskScore = avgRecovery < 50 ? 100 : avgRecovery < 60 ? 75 : avgRecovery < 70 ? 45 : 10;

  const score = Math.min(100, Math.round(
    ratioScore * 0.35 +
    totalLoadScore * 0.25 +
    overtimeScore * 0.15 +
    issueScore * 0.10 +
    hiddenScore * 0.10 +
    recoveryRiskScore * 0.05
  ));

  return {
    count:n,
    riskCount,
    warnCount,
    riskWarningRatio:weightedRiskRatio,
    avgTotalLoad:+avgTotalLoad.toFixed(1),
    avgOvertime:+avgOvertime.toFixed(1),
    avgIssueDays:+avgIssueDays.toFixed(1),
    avgHiddenOvertime:+avgHiddenOvertime.toFixed(1),
    avgRecovery:Math.round(avgRecovery),
    ratioScore,
    totalLoadScore,
    overtimeScore,
    issueScore,
    hiddenScore,
    recoveryRiskScore,
    score
  };
}
function scoreTeam(list){
  return getOrgRiskMetrics(list).score;
}
function orgRiskBadge(score){ if(score>=65) return ['위험','red']; if(score>=35) return ['주의','amber']; return ['정상','green']; }
function orgRiskLegendHtml(){
  return `<div class="orgRiskLegend" aria-label="조직 위험 점수 기준">
    <span class="orgRiskLegendPill green">정상 0~34</span>
    <span class="orgRiskLegendPill amber">주의 35~64</span>
    <span class="orgRiskLegendPill red">위험 65+</span>
  </div>`;
}
function orgRiskTitleHtml(title){
  return `<div class="orgRiskTitleWrap"><div class="orgRiskTitleText">${title}</div>${orgRiskLegendHtml()}</div>`;
}
function orgRiskScaleHtml(score, statusText){
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  return `<div class="orgRiskScale" aria-label="조직 위험 점수 구간 기준">
    <div class="orgRiskScaleTrack"></div>
    <div class="orgRiskThreshold t35" title="주의 시작 35점"></div>
    <div class="orgRiskThreshold t65" title="위험 시작 65점"></div>
    <div class="orgRiskScaleMarker" style="--pos:${safeScore}%">
      <div class="orgRiskScaleMarkerDot"></div>
      <div class="orgRiskScaleMarkerLabel">현재 ${safeScore}점 · ${statusText}</div>
    </div>
    <div class="orgRiskAxis"><span class="p0">0 정상</span><span class="p35">35 주의</span><span class="p65">65 위험</span><span class="p100">100</span></div>
  </div>`;
}
function riskBadge(score){ if(score>=75) return ['위험','red']; if(score>=50) return ['주의','amber']; return ['정상','green']; }
function statusBucket(score){ return score>=75?'위험':score>=50?'주의':'정상'; }
function toSafeNumber(value){
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}



function isRecordMissingOnlyRiskIssue(row, reason){
  const missingTokens = [
    '출퇴근미입력','출퇴근 미입력',
    '출근미입력','출근 미입력','출근누락','출근 누락',
    '퇴근미입력','퇴근 미입력','퇴근누락','퇴근 누락'
  ];
  const riskTokens = [
    '연장근무','연장근로','야근','공휴일근무','휴일근무','휴무일근무',
    '숨은초과','초과근무','OT','ot','결근','조퇴','지각','근무시간 부족','단축근무 부족'
  ];
  const merged = normalizeAttendanceReasonText([
    reason,
    row?.reason,
    row?.originalErpReason,
    row?.erpReason,
    row?.statusReason,
    row?.status,
    row?.bucket,
    row?.displayStart,
    row?.displayEnd
  ].filter(Boolean).join(' '));
  const hasMissingToken = missingTokens.some(token => merged.includes(token));
  if(!hasMissingToken) return false;

  const hasRealRiskToken = riskTokens.some(token => merged.includes(token));
  if(hasRealRiskToken) return false;

  let withoutMissing = merged;
  missingTokens.forEach(token => {
    withoutMissing = withoutMissing.split(token).join(' ');
  });
  withoutMissing = withoutMissing
    .replace(/문제|주의|미입력|없음|-/g, ' ')
    .replace(/[-|/·,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const flags = (typeof getAttendanceWarningFlags === 'function')
    ? getAttendanceWarningFlags(row)
    : { isOvertime:false, isHoliday:false, isMissingStart:false, isMissingEnd:false };

  return !flags.isOvertime && !flags.isHoliday && (flags.isMissingStart || flags.isMissingEnd || hasMissingToken) && !withoutMissing;
}

function normalizePersonalRiskReasonText(value){
  return String(value || '')
    .replace(/<br\s*\/?>(?:\s*)/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\s\-_/|·,]+/g, '')
    .trim();
}

function getPersonalRiskReasonText(row, reason){
  return normalizePersonalRiskReasonText([
    reason,
    row?.reason,
    row?.erpReason,
    row?.attendanceType,
    row?.statusReason,
    row?.status
  ].filter(Boolean).join(' '));
}

function isDirectPersonalRiskReason(row, reason){
  const text = getPersonalRiskReasonText(row, reason);
  if(!text) return false;
  if(text.includes('결근')) return true;
  // 연장근무 계열만 개인 위험지수의 직접 반영 대상으로 둔다.
  // 공휴일/휴일 근무는 ERP 실제연장 시간이 있을 때만 연장근무성 리스크로 본다.
  if(text.includes('연장근무') || text.includes('연장근로') || text.includes('야근') || text.toLowerCase().includes('ot')) return true;
  if((text.includes('공휴일근무') || text.includes('휴일근무')) && toSafeNumber(row?.erpActualOvertime || row?.erpOT || 0) > 0) return true;
  return false;
}

function isConditionalPersonalRiskReason(row, reason){
  const text = getPersonalRiskReasonText(row, reason);
  if(!text) return false;
  if(text.includes('파견')) return false;
  return text.includes('조퇴') || text.includes('외근') || text.includes('오전외근') || text.includes('오후외근');
}

function getConditionalPersonalRiskWeight(row, reason){
  if(!isConditionalPersonalRiskReason(row, reason)) return 0;
  const analysisFields = (typeof getAttendanceAnalysisFields === 'function') ? getAttendanceAnalysisFields(row) : null;
  const hidden = parseWorkDurationToHours(analysisFields?.hiddenOvertimeDisplay) || 0;
  const base = parseWorkDurationToHours(analysisFields?.baseWorkDisplay) || 0;
  const adjusted = parseWorkDurationToHours(analysisFields?.adjustedWorkDisplay) || 0;
  const erpOT = toSafeNumber(row?.erpActualOvertime || row?.erpOT || 0);
  const totalLoad = base + hidden + erpOT;
  // 조건부 사유는 단독으로 위험 처리하지 않고, 연장·숨은초과·총부하가 동반될 때만 약하게 반영한다.
  if(erpOT > 0 || hidden >= 0.5 || totalLoad >= 9.5 || adjusted >= 9.5) return 1;
  return 0;
}

function isRiskRelatedIssueReason(row, reason){
  // 개인 위험지수 직접 반영 대상: 결근, 연장근무 계열만 issueDays에 반영한다.
  // 출퇴근미입력/근무시간부족/단축근무/휴가/병가/파견 등은 운영·제도·회복 성격으로 제외한다.
  // 외근·조퇴는 단독 issueDays가 아니라 조건부 약가산(getConditionalPersonalRiskWeight)으로만 처리한다.
  return isDirectPersonalRiskReason(row, reason);
}

function isRecoveryRelatedIssueReason(reason){
  const normalized = normalizeAttendanceReasonText(reason || '');
  if(!normalized) return false;

  // 출근/퇴근 미입력은 기록 누락 성격이므로 휴식지수 감점 대상에서 제외한다.
  // 단, 같은 행에 연장근무/공휴일근무/결근/조퇴/지각/숨은초과 등 실제 피로·부하 사유가 함께 있으면 감점 대상이다.
  const nonRecoveryTokens = [
    '출근미입력','퇴근미입력','출근 미입력','퇴근 미입력',
    '출근누락','퇴근누락','출근 누락','퇴근 누락'
  ];

  let withoutRecordMissing = normalized;
  nonRecoveryTokens.forEach(token => {
    withoutRecordMissing = withoutRecordMissing.split(token).join(' ');
  });
  withoutRecordMissing = withoutRecordMissing.replace(/[-|/·,]+/g, ' ').replace(/\s+/g, ' ').trim();

  if(!withoutRecordMissing) return false;

  const recoveryRelatedTokens = [
    '연장근무','연장근로','야근','공휴일근무','휴일근무',
    '숨은초과','초과근무','ot','OT',
    '결근','조퇴','지각'
  ];
  return recoveryRelatedTokens.some(token => normalized.includes(token));
}

function getRecoveryIndex(item){
  const leaveUsed = toSafeNumber(item.leaveUsed || 0);
  const issueDays = toSafeNumber(
    (typeof item.scopedRecoveryIssueDays !== 'undefined' ? item.scopedRecoveryIssueDays : null) ??
    (typeof item.recoveryIssueDays !== 'undefined' ? item.recoveryIssueDays : null) ??
    item.scopedIssueDays ??
    item.issueDays ??
    0
  );
  const hiddenDaily = toSafeNumber(item.scopedDailyHiddenOvertime || 0);
  const dailyTotalLoad = toSafeNumber(
    item.scopedDailyTotalLoad ||
    (toSafeNumber(item.scopedDailyBaseWorkHours || 0) + toSafeNumber(item.scopedDailyOvertime || 0) + toSafeNumber(item.scopedDailyHiddenOvertime || 0)) ||
    item.avgTotalLoad || 0
  );

  let score = 70;
  score += Math.min(20, leaveUsed * 8);       // 연차/반차 사용 가점
  score -= Math.min(25, issueDays * 4);       // 반복 이슈 감점
  score -= Math.min(20, hiddenDaily * 25);    // 숨은초과 감점
  score -= dailyTotalLoad >= 10 ? 18 : dailyTotalLoad >= 9 ? 10 : dailyTotalLoad >= 8.5 ? 4 : 0;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return score;
}
function recoveryBadge(score){
  if(score >= 70) return ['양호','green'];
  if(score >= 40) return ['보통','amber'];
  return ['부족','red'];
}

function renderFilters(){
  const periodOptions = getAvailableAttendancePeriodOptions();
  const fallbackPeriod = periodOptions.length ? periodOptions[periodOptions.length - 1].value : 'ALL';
  if(!periodOptions.some(item => item.value === STATE.period)){
    STATE.period = fallbackPeriod;
  }
  STATE.leaveCauseFocus = '';
  if(isCurrentAttendanceGeneralUser()){
    STATE.division = '전체';
    STATE.team = '전체';
  }
  $('#period').innerHTML = periodOptions.length
    ? periodOptions.map(item => `<option value="${item.value}">${item.label}</option>`).join('')
    : '<option value="ALL">전체</option>';
  $('#period').value = STATE.period;
  $('#period').onchange = e => {
    if(e?.preventDefault) e.preventDefault();
    const keepTab = getActiveAttendanceMainTab('attendance');
    saveAttendanceMainTab(keepTab);
    STATE.period = (e.target.value || fallbackPeriod || 'ALL').trim() || 'ALL';
    saveAttendanceUiState(ATTENDANCE_UI_STATE_KEYS.period, STATE.period);
    Promise.resolve(updateAttendanceViewsAfterDataChange({ refreshFilters: false, keepMainTab: keepTab })).finally(() => restoreSavedMainTab(keepTab));
  };

  const filterMode = getAttendanceFilterAccessMode();
  const optionEmployees = getAttendanceEmployeesWithinEffectiveScope(EMPLOYEES);
  const divisionMetaByName = new Map(orgMaster.map(div => [div.divisionName, div]));
  const employeeDivisionNames = [...new Set(optionEmployees.map(e => e.division).filter(Boolean))];
  const divisions = employeeDivisionNames.sort((a,b) => {
    const codeA = String(divisionMetaByName.get(a)?.divisionCode || 'ZZZ');
    const codeB = String(divisionMetaByName.get(b)?.divisionCode || 'ZZZ');
    return codeA.localeCompare(codeB, 'ko') || String(a).localeCompare(String(b), 'ko');
  });

  if(filterMode.lockDivision && divisions.length){
    if(STATE.division === '전체' || !divisions.includes(STATE.division)){
      STATE.division = divisions[0];
      STATE.team = '전체';
    }
  }else if(STATE.division !== '전체' && !divisions.includes(STATE.division)){
    STATE.division = '전체';
    STATE.team = '전체';
  }

  const divisionControlValue = STATE.division === '전체'
    ? (STATE.team !== '전체' ? '__ALL_WITH_TEAM_FILTER__' : '')
    : STATE.division;
  const divisionOptions = [];
  if(filterMode.allowDivisionAll){
    divisionOptions.push('<option value="">전체</option>');
    if(STATE.division === '전체' && STATE.team !== '전체') divisionOptions.push('<option value="__ALL_WITH_TEAM_FILTER__">전체</option>');
  }
  divisionOptions.push(...divisions.map(v=>`<option value="${attendanceOptionEscape(v)}">${attendanceOptionEscape(v)}</option>`));
  $('#division').innerHTML = divisionOptions.join('') || '<option value="">-</option>';
  $('#division').value = filterMode.lockDivision ? (STATE.division === '전체' ? (divisions[0] || '') : STATE.division) : divisionControlValue;
  if($('#division').value !== (filterMode.lockDivision ? (STATE.division === '전체' ? (divisions[0] || '') : STATE.division) : divisionControlValue)){
    if(filterMode.lockDivision && divisions.length){
      STATE.division = divisions[0];
      STATE.team = '전체';
      $('#division').value = STATE.division;
    }else{
      STATE.division = '전체';
      STATE.team = '전체';
      $('#division').value = '';
    }
  }
  setAttendanceFilterLockState('division', filterMode.lockDivision && divisions.length <= 1, '현재 권한의 본부로 고정되었습니다.');
  if(filterMode.lockDivision && divisions.length > 1){
    // 예외적으로 여러 본부가 허용되는 자동권한이면 드롭다운 선택은 허용하되 전체는 제외합니다.
    setAttendanceFilterLockState('division', false);
  }
  $('#division').onchange = e => {
    if(e?.preventDefault) e.preventDefault();
    const keepTab = getActiveAttendanceMainTab('attendance');
    saveAttendanceMainTab(keepTab);
    saveAttendanceMainTab(keepTab);
    const nextDivision = (e.target.value || '').trim();
    if(filterMode.lockDivision){
      STATE.division = divisions.includes(nextDivision) ? nextDivision : (divisions[0] || STATE.division || '전체');
      STATE.team = '전체';
    }else if(!nextDivision){
      STATE.division = '전체';
      STATE.team = '전체';
    }else if(nextDivision === '__ALL_WITH_TEAM_FILTER__'){
      STATE.division = '전체';
    }else{
      STATE.division = nextDivision;
      STATE.team = '전체';
    }
    Promise.resolve(updateAttendanceViewsAfterDataChange({ refreshFilters: true, keepMainTab: keepTab })).finally(() => restoreSavedMainTab(keepTab));
  };

  const teamBase = STATE.division==='전체' ? optionEmployees : optionEmployees.filter(e=>e.division===STATE.division);
  const employeeTeams = [...new Set(teamBase.map(e => e.team).filter(Boolean))];
  const teamMetaByName = new Map(
    orgMaster.flatMap(div => (div.teams || []).map(team => [team.teamName, { ...team, divisionCode: div.divisionCode }]))
  );
  const teams = employeeTeams.sort((a,b) => {
    const metaA = teamMetaByName.get(a) || {};
    const metaB = teamMetaByName.get(b) || {};
    return String(metaA.teamCode || 'ZZZ').localeCompare(String(metaB.teamCode || 'ZZZ'), 'ko')
      || String(a).localeCompare(String(b), 'ko');
  });
  if(filterMode.requireSpecificTeam && teams.length){
    if(STATE.team === '전체' || !teams.includes(STATE.team)) STATE.team = teams[0];
  }else if(STATE.team !== '전체' && !teams.includes(STATE.team)){
    STATE.team = '전체';
  }
  const teamOptions = [];
  if(filterMode.allowTeamAll) teamOptions.push('<option value="">전체</option>');
  teamOptions.push(...teams.map(v=>`<option value="${attendanceOptionEscape(v)}">${attendanceOptionEscape(v)}</option>`));
  $('#team').innerHTML = teamOptions.join('') || '<option value="">-</option>';
  $('#team').value = STATE.team === '전체' ? '' : STATE.team;
  lockAttendanceGeneralUserFilters();
  if($('#team').value !== (STATE.team === '전체' ? '' : STATE.team)){
    if(filterMode.requireSpecificTeam && teams.length){
      STATE.team = teams[0];
      $('#team').value = STATE.team;
    }else{
      STATE.team = '전체';
      $('#team').value = '';
    }
  }
  setAttendanceFilterLockState('team', filterMode.lockSingleTeam && teams.length <= 1, '현재 권한의 팀으로 고정되었습니다.');
  if(!filterMode.lockSingleTeam) setAttendanceFilterLockState('team', false);
  $('#team').onchange = e => {
    if(e?.preventDefault) e.preventDefault();
    const keepTab = getActiveAttendanceMainTab('attendance');
    saveAttendanceMainTab(keepTab);
    const nextTeam = (e.target.value || '').trim();
    if(filterMode.requireSpecificTeam){
      STATE.team = teams.includes(nextTeam) ? nextTeam : (teams[0] || STATE.team || '전체');
    }else{
      STATE.team = nextTeam || '전체';
    }
    Promise.resolve(updateAttendanceViewsAfterDataChange({ refreshFilters: true, keepMainTab: keepTab })).finally(() => restoreSavedMainTab(keepTab));
  };
}




async function updateAttendanceViewsAfterDataChange(options = {}){
  const keepTab = String(options.keepMainTab || getActiveAttendanceMainTab('attendance')).trim() || 'attendance';
  saveAttendanceMainTab(keepTab);
  try{
    dedupeEmpMasterByName();
    if(Array.isArray(REAL_ATTENDANCE_DATA) && REAL_ATTENDANCE_DATA.length){
      rebuildDerivedMetricsFromAttendance();
    }else{
      syncDashboardDataFromEmpMaster();
    }
    updateUploadStatus();
    if(options.refreshFilters !== false){
      renderFilters();
    }
    if(typeof refreshFloatingFilters === 'function') refreshFloatingFilters();
    const months = periodMonths();
    const scoped = scopedEmployees();
    renderKpis(scoped);
    if(typeof initKpiCardLayout === 'function') initKpiCardLayout();
    renderSummary(months);
    renderAlerts(months);
    renderAttendanceTab();
    renderAttendanceMissingAnalysis();
    renderTopCharts(scoped, months);
    renderInsight(scoped, months);
    renderRisk(scoped);
    renderPeople(scoped);
    renderTrendAnalysis();
    renderTabs();
    restoreSavedMainTab(keepTab);
  }catch(error){
    console.error('[UPDATE ATTENDANCE VIEWS FAILED]', error);
  }
}

async function refreshAttendanceAfterAdminMutation(options = {}){
  const keepTab = getActiveAttendanceMainTab('admin');
  const targetYear = Number(options.targetYear || window.ADMIN_UPLOAD_MANAGEMENT?.selectedYear || document.getElementById('adminUploadYear')?.value || new Date().getFullYear());
  saveAttendanceMainTab(keepTab);
  if(Number.isFinite(targetYear) && window.ADMIN_UPLOAD_MANAGEMENT){
    window.ADMIN_UPLOAD_MANAGEMENT.selectedYear = targetYear;
  }
  if(typeof window.loadAttendanceFromSupabase === 'function'){
    try{ await window.loadAttendanceFromSupabase(); }catch(e){ console.warn('[ADMIN MUTATION RELOAD WARN]', e); }
  }
  updateUploadStatus();
  await updateAttendanceViewsAfterDataChange({ refreshFilters: options.refreshFilters !== false, keepMainTab: keepTab });
  if(typeof window.refreshAdminMonthCardsImmediately === 'function'){
    await window.refreshAdminMonthCardsImmediately({ targetYear, forceYearReload: options.forceYearReload === true });
  } else if(typeof window.refreshAdminUploadManagement === 'function'){
    await window.refreshAdminUploadManagement(options.forceYearReload === true);
  }
}
function getHeadcountStatusSummary(){
  const employeeMetaMap = new Map((Array.isArray(empMaster) ? empMaster : EMPLOYEES).map(e => [normalizeEmployeeName(e.name), e]));
  const rows = getMergedRawAttendanceData()
    .map(row => decorateAttendanceRow(row, employeeMetaMap))
    .filter(Boolean)
    .filter(row => !shouldHideAttendanceRow(row))
    .filter(row => {
      const cleanName = normalizeEmployeeName(row.name);
      if(!cleanName) return false;
      const meta = employeeMetaMap.get(cleanName);
      const divisionValue = String(meta?.division || row.division || '').trim();
      const teamValue = String(meta?.team || row.team || '').trim();
      const attendanceTarget = String(meta?.attendanceTarget || 'Y').trim().toUpperCase();
      if(attendanceTarget === 'N') return false;
      if(STATE.division !== '전체' && divisionValue !== STATE.division) return false;
      if(STATE.team !== '전체' && teamValue !== STATE.team) return false;
      return true;
    });

  const byName = new Map();

  rows.forEach(row => {
    const cleanName = normalizeEmployeeName(row.name);
    if(!cleanName) return;

    const list = byName.get(cleanName) || [];
    const dateKey = String(row.date || '').slice(0, 10);
    const reason = getAttendanceBaseReason(row);
    const isLeave = isAttendanceContinuousLeaveRow(row) || ERP_CONTINUOUS_REASONS.includes(String(reason || '').trim());
    const hasActual = hasAttendanceActualWork(row);

    let state = '';
    if(isLeave) state = 'leave';
    else if(hasActual) state = 'work';
    else if(String(reason || '').trim()) state = 'work';

    if(!state) return;

    list.push({ date: dateKey, state });
    byName.set(cleanName, list);
  });

  const result = { leaveOnly: 0, returned: 0, leaveSwitched: 0 };

  byName.forEach(events => {
    const ordered = events
      .sort((a,b) => String(a.date).localeCompare(String(b.date)));

    const sequence = [];
    ordered.forEach(item => {
      const last = sequence[sequence.length - 1];
      if(last !== item.state) sequence.push(item.state);
    });

    const hasLeave = sequence.includes('leave');
    const hasWork = sequence.includes('work');

    if(hasLeave && !hasWork){
      result.leaveOnly += 1;
      return;
    }

    if(hasLeave && hasWork){
      const firstLeaveIdx = sequence.indexOf('leave');
      const firstWorkIdx = sequence.indexOf('work');

      if(firstLeaveIdx < firstWorkIdx) result.returned += 1;
      else if(firstWorkIdx < firstLeaveIdx) result.leaveSwitched += 1;
    }
  });

  return result;
}

function getWorkConcentrationMetrics(scoped){
  const list = Array.isArray(scoped) ? scoped.filter(Boolean) : [];
  const activityValue = x => 
    (Number(x.businessTripDays || 0) * 1.5) +
    (Number(x.outdoorDays || 0) * 1) +
    (Number(x.outdoorAM || 0) * 0.5) +
    (Number(x.outdoorPM || 0) * 0.5);
  const overtimeValue = x => Number(x.scopedMonthlyOvertime ?? x.monthlyOvertime ?? x.overtime ?? 0);

  if(!list.length){
    return {
      totalCount: 0,
      topCount: 0,
      totalMonthlyOT: 0,
      totalActivity: 0,
      overtimeConcentrationRate: 0,
      activityConcentrationRate: 0,
      workConcentrationRate: 0,
      workConcentrationClass: 'green',
      workConcentrationLabel: '정상',
      workConcentrationAction: '분산 안정',
      workConcentrationText: '업무가 고르게 분산된 상태',
      sortedOvertime: [],
      sortedActivity: [],
      overtimeValue,
      activityValue
    };
  }

  const totalCount = list.length;
  const topCount = Math.max(1, Math.ceil(totalCount * 0.2));
  const totalMonthlyOT = list.reduce((sum, person) => sum + overtimeValue(person), 0);
  const totalActivity = list.reduce((sum, person) => sum + activityValue(person), 0);
  const sortedOvertime = [...list].sort((a,b)=>overtimeValue(b)-overtimeValue(a));
  const sortedActivity = [...list].sort((a,b)=>activityValue(b)-activityValue(a));
  const topOvertimeSum = sortedOvertime.slice(0, topCount).reduce((sum, person) => sum + overtimeValue(person), 0);
  const topActivitySum = sortedActivity.slice(0, topCount).reduce((sum, person) => sum + activityValue(person), 0);
  const overtimeConcentrationRate = totalMonthlyOT > 0 ? (topOvertimeSum / totalMonthlyOT) * 100 : 0;
  const activityConcentrationRate = totalActivity > 0 ? (topActivitySum / totalActivity) * 100 : 0;
  const workConcentrationRate = Math.round((overtimeConcentrationRate * 0.6) + (activityConcentrationRate * 0.4));

  let workConcentrationClass = 'green';
  let workConcentrationLabel = '정상';
  let workConcentrationAction = '분산 안정';
  let workConcentrationText = '업무가 고르게 분산된 상태';

  if(workConcentrationRate >= 60){
    workConcentrationClass = 'red';
    workConcentrationLabel = '위험';
    workConcentrationAction = '집중 심화';
    workConcentrationText = '상위 20% 인원에 업무가 강하게 집중된 상태';
  }else if(workConcentrationRate >= 40){
    workConcentrationClass = 'amber';
    workConcentrationLabel = '주의';
    workConcentrationAction = '편중 관찰';
    workConcentrationText = '소수 인원 편중이 관찰되는 상태';
  }

  return {
    totalCount,
    topCount,
    totalMonthlyOT,
    totalActivity,
    overtimeConcentrationRate,
    activityConcentrationRate,
    workConcentrationRate,
    workConcentrationClass,
    workConcentrationLabel,
    workConcentrationAction,
    workConcentrationText,
    sortedOvertime,
    sortedActivity,
    overtimeValue,
    activityValue
  };
}

function getGradeImbalanceMetrics(scoped){
  const list = Array.isArray(scoped) ? scoped.filter(Boolean) : [];
  const activeList = list.filter(person => GRADE_ORDER.includes(String(person.grade || '').trim()));

  if(!activeList.length){
    return {
      totalCount: 0,
      rawTopTwoShare: 0,
      sizeWeight: 0,
      gradeImbalanceScore: 0,
      gradeImbalanceClass: 'green',
      gradeImbalanceLabel: '정상',
      gradeImbalanceText: '직급 분포 데이터 없음'
    };
  }

  const gradeMap = Object.fromEntries(GRADE_ORDER.map(g => [g, 0]));
  activeList.forEach(person => {
    const grade = String(person.grade || '').trim();
    if(gradeMap.hasOwnProperty(grade)) gradeMap[grade] += 1;
  });

  const totalCount = activeList.length;
  const shares = Object.entries(gradeMap)
    .filter(([,count]) => count > 0)
    .map(([grade,count]) => ({
      grade,
      count,
      share: (count / totalCount) * 100
    }))
    .sort((a,b) => b.share - a.share);

  const rawTopTwoShare = shares.slice(0, 2).reduce((sum, row) => sum + row.share, 0);

  let sizeWeight = 1;
  if(totalCount <= 2) sizeWeight = 0.35;
  else if(totalCount === 3) sizeWeight = 0.5;
  else if(totalCount === 4) sizeWeight = 0.7;
  else if(totalCount === 5) sizeWeight = 0.85;
  else sizeWeight = 1;

  const gradeImbalanceScore = Math.round(Math.min(100, rawTopTwoShare * sizeWeight));

  let gradeImbalanceClass = 'green';
  let gradeImbalanceLabel = '정상';
  let gradeImbalanceText = '직급 분포가 비교적 안정적인 상태';

  if(gradeImbalanceScore >= 60){
    gradeImbalanceClass = 'red';
    gradeImbalanceLabel = '구조 확인';
    gradeImbalanceText = '특정 직급 구간 쏠림이 커 직급 구조 확인이 필요한 상태';
  }else if(gradeImbalanceScore >= 40){
    gradeImbalanceClass = 'amber';
    gradeImbalanceLabel = '주의';
    gradeImbalanceText = '상위 직급 구간 편중이 관찰되는 상태';
  }

  return {
    totalCount,
    rawTopTwoShare,
    sizeWeight,
    gradeImbalanceScore,
    gradeImbalanceClass,
    gradeImbalanceLabel,
    gradeImbalanceText
  };
}



function renderKpis(scoped){
  const workConMetrics = getWorkConcentrationMetrics(scoped);
  const activityCount = workConMetrics.activityValue;
  const overtimeValue = workConMetrics.overtimeValue;
  const totalMonthlyOT = workConMetrics.totalMonthlyOT;
  const totalActivity = workConMetrics.totalActivity;
  const avgActivity = scoped.length ? totalActivity / scoped.length : 0;

  const participantCount = scoped.filter(x => activityCount(x) > 0).length;
  const participationRate = scoped.length ? (participantCount / scoped.length) * 100 : 0;

  const sortedActivity = workConMetrics.sortedActivity;
  const topCount = workConMetrics.topCount;
  const concentrationRate = workConMetrics.activityConcentrationRate;

  const sortedOvertime = workConMetrics.sortedOvertime;
  const overtimeConcentrationRate = workConMetrics.overtimeConcentrationRate;

  const avgMonthlyOvertimePerPerson = avg(scoped,'scopedMonthlyOvertime');
  const avgDailyOvertimePerPerson = avg(scoped,'scopedDailyOvertime');
  const activityLevel = avgActivity < 0.4 ? '낮음' : avgActivity < 0.9 ? '적정' : avgActivity < 1.5 ? '주의' : '높음';

  const headcountStatus = getHeadcountStatusSummary();
  $('#kpiTotal').textContent = `${scoped.length}명`;
  if($('#kpiLeaveOnlyCount')) $('#kpiLeaveOnlyCount').textContent = `${headcountStatus.leaveOnly}명`;
  if($('#kpiReturnCount')) $('#kpiReturnCount').textContent = `${headcountStatus.returned}명`;
  if($('#kpiLeaveSwitchCount')) $('#kpiLeaveSwitchCount').textContent = `${headcountStatus.leaveSwitched}명`;
  $('#kpiOver').textContent = `${avgMonthlyOvertimePerPerson.toFixed(1)}시간`;
  if($('#kpiOverSub')) $('#kpiOverSub').textContent = `(일평균 ${avgDailyOvertimePerPerson.toFixed(1)}시간)`;
  $('#kpiTotalOT').textContent = `${Math.floor(totalMonthlyOT)}시간`;
  const operRiskShare = overtimeConcentrationRate;
  const operRiskAvg = avgMonthlyOvertimePerPerson;
  let operRiskClass = 'green';
  let operRiskLabel = '정상';
  if(operRiskShare > 50 || operRiskAvg > 12){
    operRiskClass = 'red';
    operRiskLabel = '위험';
  }else if(operRiskShare > 40 || operRiskAvg > 6){
    operRiskClass = 'amber';
    operRiskLabel = '주의';
  }
  if($('#kpiOperRisk')) $('#kpiOperRisk').textContent = operRiskLabel;
  if($('#kpiOperRiskStatus')){
    $('#kpiOperRiskStatus').textContent = operRiskClass==='green' ? '안정' : operRiskClass==='amber' ? '관찰' : '대응';
    $('#kpiOperRiskStatus').style.color = operRiskClass==='green' ? '#16a34a' : operRiskClass==='amber' ? '#d97706' : '#ef4444';
  }
  document.querySelectorAll('[data-oper-guide]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-oper-guide') === operRiskClass);
  });

  const avgRiskScore = avg(scoped,'scopedRisk');
  const [riskLabel,riskClass] = riskBadge(avgRiskScore);
  const riskColor = riskClass==='red' ? '#ef4444' : riskClass==='amber' ? '#d97706' : '#16a34a';
  $('#kpiRisk').textContent = riskLabel;
  if($('#kpiRiskStatus')){
    const riskAction = riskClass==='green' ? '안정' : riskClass==='amber' ? '관찰' : '대응';
    $('#kpiRiskStatus').textContent = riskAction;
    $('#kpiRiskStatus').style.color = riskColor;
  }
  if($('#kpiRiskSub')){
    $('#kpiRiskSub').textContent = `평균 위험점수 ${Math.round(avgRiskScore)}점 · 선택 기간 기준`;
  }
  document.querySelectorAll('[data-risk-guide]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-risk-guide') === riskClass);
  });
  $('#kpiHigh').textContent = `${scoped.filter(x=>x.scopedRisk>=75).length}명`;
  $('#kpiLeave').textContent = `${scoped.filter(x=>x.leaveUsed===0).length}명`;

  $('#kpiMobility').textContent = `${avgActivity.toFixed(1)}`;
  $('#kpiMobilitySub').textContent = `(참여율 ${Math.round(participationRate)}%) · ${activityLevel}`;


  $('#kpiMobilitySkew').textContent = `${Math.round(concentrationRate)}%`;
  const topNamesEl = $('#kpiMobilityTopNames');
  if(topNamesEl){
    const rows = sortedActivity
      .slice(0, topCount)
      .filter(person => activityCount(person) > 0)
      .map(person => {
        const share = totalActivity > 0 ? (activityCount(person) / totalActivity) * 100 : 0;
        return `${String(person.name || '').trim()} ${share.toFixed(0)}%`;
      })
      .filter(Boolean);
    topNamesEl.innerHTML = rows.length
      ? `<strong>상위 20%</strong>${rows.join('<br>')}`
      : '<strong>상위 20%</strong>해당 없음';
  }

  $('#kpiOvertimeSkew').textContent = `${Math.round(overtimeConcentrationRate)}%`;
  const overtimeTopNamesEl = $('#kpiOvertimeTopNames');
  if(overtimeTopNamesEl){
    const overtimeRows = sortedOvertime
      .slice(0, topCount)
      .filter(person => overtimeValue(person) > 0)
      .map(person => {
        const share = totalMonthlyOT > 0 ? (overtimeValue(person) / totalMonthlyOT) * 100 : 0;
        return `${String(person.name || '').trim()} ${share.toFixed(0)}%`;
      })
      .filter(Boolean);
    overtimeTopNamesEl.innerHTML = overtimeRows.length
      ? `<strong>상위 20%</strong>${overtimeRows.join('<br>')}`
      : '<strong>상위 20%</strong>해당 없음';
  }

  const workConcentrationRate = Number(workConMetrics.workConcentrationRate || 0);
  if($('#kpiWorkConcentration')) $('#kpiWorkConcentration').textContent = `${Math.round(workConcentrationRate)}%`;
  if($('#kpiWorkConcentrationSub')){
    $('#kpiWorkConcentrationSub').textContent = `연장근로 60% + 외근/출장 40% 가중 기준`;
  }

  const workConTopNamesEl = $('#kpiWorkConcentrationTopNames');
  if(workConTopNamesEl){
    const workRows = [...scoped]
      .map(person => {
        const overtimeShare = totalMonthlyOT > 0 ? (overtimeValue(person) / totalMonthlyOT) * 100 : 0;
        const activityShare = totalActivity > 0 ? (activityCount(person) / totalActivity) * 100 : 0;
        const weightedShare = (overtimeShare * 0.6) + (activityShare * 0.4);
        return {
          name: String(person.name || '').trim(),
          weightedShare
        };
      })
      .filter(person => person.name && person.weightedShare > 0)
      .sort((a,b) => b.weightedShare - a.weightedShare)
      .slice(0, topCount)
      .map(person => `${person.name} ${person.weightedShare.toFixed(0)}%`);
    workConTopNamesEl.innerHTML = workRows.length
      ? `<strong>상위 20%</strong>${workRows.join('<br>')}`
      : '<strong>상위 20%</strong>해당 없음';
  }

  if($('#kpiWorkConcentrationStatusLabel')) $('#kpiWorkConcentrationStatusLabel').textContent = workConMetrics.workConcentrationLabel;
  if($('#kpiWorkConcentrationStatusAction')){
    $('#kpiWorkConcentrationStatusAction').textContent = workConMetrics.workConcentrationAction;
    $('#kpiWorkConcentrationStatusAction').style.color =
      workConMetrics.workConcentrationClass === 'green' ? '#16a34a' :
      workConMetrics.workConcentrationClass === 'amber' ? '#d97706' : '#ef4444';
  }
  if($('#kpiWorkConcentrationStatusSub')){
    $('#kpiWorkConcentrationStatusSub').textContent = `${Math.round(workConcentrationRate)}% · ${workConMetrics.workConcentrationText}`;
  }
  document.querySelectorAll('[data-work-con-guide]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-work-con-guide') === workConMetrics.workConcentrationClass);
  });

  let mobilityOperRiskClass = 'green';
  let mobilityOperRiskLabel = '정상';
  let mobilityOperRiskAction = '안정';

  if(participationRate < 40 && concentrationRate >= 60){
    mobilityOperRiskClass = 'red';
    mobilityOperRiskLabel = '위험';
    mobilityOperRiskAction = '대응';
  }else if(
    (participationRate >= 60 && concentrationRate >= 60) ||
    (participationRate >= 40 && participationRate < 60 && concentrationRate >= 60) ||
    (participationRate < 40 && concentrationRate >= 40 && concentrationRate < 60)
  ){
    mobilityOperRiskClass = 'amber';
    mobilityOperRiskLabel = '주의';
    mobilityOperRiskAction = '관찰';
  }

  if($('#kpiMobilityOperRisk')) $('#kpiMobilityOperRisk').textContent = mobilityOperRiskLabel;
  if($('#kpiMobilityOperRiskStatus')){
    $('#kpiMobilityOperRiskStatus').textContent = mobilityOperRiskAction;
    $('#kpiMobilityOperRiskStatus').style.color = mobilityOperRiskClass==='green' ? '#16a34a' : mobilityOperRiskClass==='amber' ? '#d97706' : '#ef4444';
  }
  if($('#kpiMobilityOperRiskSub')){
    const mobilityStateText = mobilityOperRiskClass==='green'
      ? '분산 안정 상태'
      : mobilityOperRiskClass==='amber'
        ? '편중 관찰 필요'
        : '소수 인원 집중';
    $('#kpiMobilityOperRiskSub').textContent = `참여율 ${Math.round(participationRate)}% · 편중도 ${Math.round(concentrationRate)}% · ${mobilityStateText}`;
  }
  document.querySelectorAll('[data-mob-oper-guide]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-mob-oper-guide') === mobilityOperRiskClass);
  });

  if($('#kpiComplex')) $('#kpiComplex').textContent = `${totalActivity.toFixed(1)}건`;

  const selectedMonths = typeof periodMonths === 'function' ? periodMonths() : [];
  const expectedLeaveMap = typeof buildExpectedLeaveMapForPeriod === 'function'
    ? buildExpectedLeaveMapForPeriod(selectedMonths, scoped)
    : new Map();
  const expectedLeaveTotal = scoped.reduce((sum, person) => sum + Number(expectedLeaveMap.get(normalizeEmployeeName(person.name))?.expectedLeave || 0), 0);
  const actualLeaveTotal = scoped.reduce((sum, person) => sum + Number(person.leaveUsed || 0), 0);
  const avgExpectedLeave = scoped.length ? expectedLeaveTotal / scoped.length : 0;
  const avgActualLeave = scoped.length ? actualLeaveTotal / scoped.length : 0;
  const leaveDefPct = expectedLeaveTotal > 0
    ? Math.min(100, Math.max(0, Math.round((1 - (actualLeaveTotal / expectedLeaveTotal)) * 100)))
    : 0;

  const leaveUserCount = scoped.filter(person => Number(person.leaveUsed || 0) > 0).length;
  const leaveNoUseCount = scoped.filter(person => Number(person.leaveUsed || 0) === 0).length;
  const leaveNoUseRate = scoped.length ? (leaveNoUseCount / scoped.length) * 100 : 0;
  const sortedLeaveUsers = [...scoped].sort((a,b)=>Number(b.leaveUsed || 0)-Number(a.leaveUsed || 0));
  const leaveTopCount = Math.max(1, Math.ceil(scoped.length * 0.2));
  const leaveTopSum = sortedLeaveUsers.slice(0, leaveTopCount).reduce((sum, person) => sum + Number(person.leaveUsed || 0), 0);
  const leaveConcentrationRate = actualLeaveTotal > 0 ? (leaveTopSum / actualLeaveTotal) * 100 : 0;

  let leaveDefClass = 'green';
  let leaveDefLabel = '정상';
  if(leaveDefPct >= 70){
    leaveDefClass = 'red';
    leaveDefLabel = '위험';
  }else if(leaveDefPct >= 40){
    leaveDefClass = 'amber';
    leaveDefLabel = '주의';
  }
  if($('#kpiLeaveDef')) $('#kpiLeaveDef').textContent = `${leaveDefPct}%`;
  if($('#kpiLeaveDefStatus')){
    $('#kpiLeaveDefStatus').textContent = leaveDefLabel;
    $('#kpiLeaveDefStatus').style.color = leaveDefClass==='green' ? '#16a34a' : leaveDefClass==='amber' ? '#d97706' : '#ef4444';
  }
  if($('#kpiLeaveDefSub')){
    $('#kpiLeaveDefSub').textContent = `(1인 평균 ${avgActualLeave.toFixed(2)}일 / 기준 ${avgExpectedLeave.toFixed(2)}일)`;
  }
  document.querySelectorAll('[data-leave-def-guide]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-leave-def-guide') === leaveDefClass);
  });

  let leaveRiskClass = 'green';
  let leaveRiskLabel = '정상';
  let leaveRiskAction = '안정';
  if(leaveNoUseRate >= 40 || (leaveConcentrationRate >= 70 && leaveDefPct >= 50) || leaveDefPct >= 70){
    leaveRiskClass = 'red';
    leaveRiskLabel = '위험';
    leaveRiskAction = '대응';
  }else if(leaveNoUseRate >= 25 || leaveConcentrationRate >= 55 || leaveDefPct >= 40){
    leaveRiskClass = 'amber';
    leaveRiskLabel = '주의';
    leaveRiskAction = '관찰';
  }
  if($('#kpiLeaveRisk')) $('#kpiLeaveRisk').textContent = leaveRiskLabel;
  if($('#kpiLeaveRiskStatus')){
    $('#kpiLeaveRiskStatus').textContent = leaveRiskAction;
    $('#kpiLeaveRiskStatus').style.color = leaveRiskClass==='green' ? '#16a34a' : leaveRiskClass==='amber' ? '#d97706' : '#ef4444';
  }
  if($('#kpiLeaveRiskSub')){
    const focusText = leaveRiskClass==='green' ? '분산 안정 상태' : leaveRiskClass==='amber' ? '관찰 필요' : '번아웃 대응 필요';
    $('#kpiLeaveRiskSub').textContent = `미사용 ${Math.round(leaveNoUseRate)}% · 상위 20% 사용 비중 ${Math.round(leaveConcentrationRate)}% · ${focusText}`;
  }
  document.querySelectorAll('[data-leave-risk-guide]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-leave-risk-guide') === leaveRiskClass);
  });

  // 종합 운영 리스크
  const overtimeRiskScore =
    Math.min(100, (Math.min(100, (avgMonthlyOvertimePerPerson / 12) * 100) * 0.5) + (overtimeConcentrationRate * 0.5));

  const leaveRiskScore =
    leaveRiskClass === 'red' ? 85 :
    leaveRiskClass === 'amber' ? 60 : 30;

  const retireRiskMetrics = getRetirementRiskMetrics(scoped);
  const retireRiskScore = Number(retireRiskMetrics.score || 0);

  const operationalRiskScore =
    (overtimeRiskScore * 0.35) +
    (workConcentrationRate * 0.30) +
    (leaveRiskScore * 0.20) +
    (retireRiskScore * 0.15);

  let operationalRiskClass = 'green';
  let operationalRiskLabel = '정상';
  let operationalRiskAction = '안정';

  if(operationalRiskScore >= 65){
    operationalRiskClass = 'red';
    operationalRiskLabel = '위험';
    operationalRiskAction = '대응';
  }else if(operationalRiskScore >= 45){
    operationalRiskClass = 'amber';
    operationalRiskLabel = '주의';
    operationalRiskAction = '관찰';
  }

  if($('#kpiOperationalRisk')) $('#kpiOperationalRisk').textContent = operationalRiskLabel;
  if($('#kpiOperationalRiskStatus')){
    $('#kpiOperationalRiskStatus').textContent = operationalRiskAction;
    $('#kpiOperationalRiskStatus').style.color =
      operationalRiskClass === 'green' ? '#16a34a' :
      operationalRiskClass === 'amber' ? '#d97706' : '#ef4444';
  }
  if($('#kpiRetireRisk')) $('#kpiRetireRisk').textContent = retireRiskMetrics.riskLabel;
  if($('#kpiRetireRiskStatus')){
    $('#kpiRetireRiskStatus').textContent = retireRiskMetrics.riskAction;
    $('#kpiRetireRiskStatus').style.color =
      retireRiskMetrics.riskClass === 'green' ? '#16a34a' :
      retireRiskMetrics.riskClass === 'amber' ? '#d97706' : '#ef4444';
  }
  if($('#kpiRetireRiskSub')){
    const reasonText = retireRiskMetrics.count ? `주사유 ${retireRiskMetrics.topReason}` : '퇴직 데이터 없음';
    $('#kpiRetireRiskSub').textContent = `퇴사 ${retireRiskMetrics.count}명 · 가중 이직률 ${retireRiskMetrics.weightedRate.toFixed(1)}% · ${reasonText}`;
  }
  document.querySelectorAll('[data-retire-risk-guide]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-retire-risk-guide') === retireRiskMetrics.riskClass);
  });

  if($('#kpiOperationalRiskSub')){
    $('#kpiOperationalRiskSub').textContent =
      `연장근로 ${Math.round(overtimeRiskScore)}점 · 업무집중 ${Math.round(workConcentrationRate)}점 · 연차 ${leaveRiskScore}점 · 퇴직 ${retireRiskScore}점`;
  }
  document.querySelectorAll('[data-operational-total-guide]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-operational-total-guide') === operationalRiskClass);
  });

  updatePerPersonOT();

  const overtimeGuideEl = $('#kpiOverGuide');
  if(overtimeGuideEl){
    const overtimeRows = [
      { key:'normal', range:'0~10', meaning:'정상' },
      { key:'warn', range:'10~20', meaning:'주의' },
      { key:'risk', range:'20↑', meaning:'위험' }
    ];
    const overtimeActiveKey = avgMonthlyOvertimePerPerson < 10 ? 'normal' : avgMonthlyOvertimePerPerson < 20 ? 'warn' : 'risk';
    overtimeGuideEl.innerHTML = overtimeRows.map(row => {
      const toneClass = row.key==='normal' ? 'guideToneGreen' : row.key==='warn' ? 'guideToneAmber' : 'guideToneRed';
      return `
      <div class="overtimeMiniGuideRow ${row.key===overtimeActiveKey ? 'active' : ''}">
        <span>${row.range}</span>
        <span class="${toneClass}">${row.meaning}</span>
      </div>
    `;
    }).join('');
    const overtimeActiveRow = overtimeRows.find(row => row.key===overtimeActiveKey);
    if($('#kpiOverStatus') && overtimeActiveRow){
      $('#kpiOverStatus').textContent = overtimeActiveRow.meaning;
      $('#kpiOverStatus').style.color =
        overtimeActiveKey==='normal' ? '#16a34a' :
        overtimeActiveKey==='warn' ? '#d97706' : '#ef4444';
    }
  }

  const inlineGuide = $('#kpiMobilityInlineGuide');
  if(inlineGuide){
    const rows = [
      { key:'normal', range:'0~0.9', meaning:'정상' },
      { key:'warn', range:'0.9~1.5', meaning:'주의' },
      { key:'risk', range:'1.5↑', meaning:'위험' }
    ];
    const activeKey = avgActivity < 0.9 ? 'normal' : avgActivity < 1.5 ? 'warn' : 'risk';
    inlineGuide.innerHTML = rows.map(row => {
      const toneClass = row.key==='normal' ? 'guideToneGreen' : row.key==='warn' ? 'guideToneAmber' : 'guideToneRed';
      return `
      <div class="mobilityMiniGuideRow ${row.key===activeKey ? 'active' : ''}">
        <span>${row.range}</span>
        <span class="${toneClass}">${row.meaning}</span>
      </div>
    `;
    }).join('');
    const mobilityActiveRow = rows.find(row => row.key===activeKey);
    if($('#kpiMobilityStatus') && mobilityActiveRow){
      $('#kpiMobilityStatus').textContent = mobilityActiveRow.meaning;
      $('#kpiMobilityStatus').style.color =
        activeKey==='normal' ? '#16a34a' :
        activeKey==='warn' ? '#d97706' : '#ef4444';
    }
  }
  applyDashboardRelayoutCards();
}


function parseDashboardMetricValue(id){
  const el = document.getElementById(id);
  if(!el) return 0;
  const text = String(el.textContent || '').replace(/,/g,'');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}
function ensureDashboardRelayoutStructure(){
  const container = document.getElementById('dashboardKpis');
  if(!container) return null;
  if(container.dataset.relayoutReady !== 'Y'){
    const cards = [...container.querySelectorAll('[data-kpi-card]')];
    container.innerHTML = `
      <section class="dashboardSection" data-dashboard-section="decision">
        <div class="dashboardSectionHead"><div><div class="dashboardSectionTitle">1. 결론 요약</div><div class="dashboardSectionDesc">현재 조직 상태를 빠르게 판단할 수 있는 핵심 결과 카드입니다. 점수는 그대로 유지하고, 해석과 조치 방향만 보강했습니다.</div></div></div>
        <div class="dashboardDecisionGrid" id="dashboardDecisionGrid"></div>
        <div class="dashboardActionStrip">
          <div class="dashboardActionBox"><strong>해석 포인트</strong>결론 카드는 현재 조직의 운영 상태를 한 번에 판단하기 위한 영역입니다. 위험/주의가 표시되면 숫자 자체보다 어떤 원인 카드가 함께 높게 나오는지를 먼저 확인합니다.</div>
          <div class="dashboardActionBox"><strong>관리자 체크</strong><div class="actionList"><div>상위 위험 인원과 반복 연장근로자 확인</div><div>업무 집중·연차 부족·외근 편중 중 주원인 확인</div><div>필요 시 업무 분산 또는 휴식 권고 검토</div></div></div>
        </div>
      </section>
      <section class="dashboardSection" data-dashboard-section="cause">
        <div class="dashboardSectionHead"><div><div class="dashboardSectionTitle">2. 핵심 원인</div><div class="dashboardSectionDesc">원인성 지표 후보 중 현재 값이 높은 상위 3개 카드를 자동 배치합니다. 이 영역은 “왜 주의/위험인지”를 설명하는 근거입니다.</div></div><span class="dashboardCauseBadge">자동 TOP 3</span></div>
        <div class="dashboardCauseGrid" id="dashboardCauseGrid"></div>
        <div class="dashboardSectionMiniNote">전월 대비 변화가 있는 원인 카드는 카드 내부에 작은 배지로 표시합니다. 변화가 없거나 비교월이 없으면 표시하지 않습니다.</div>
      </section>
      <section class="dashboardSection" data-dashboard-section="info">
        <div class="dashboardSectionHead"><div><div class="dashboardSectionTitle">3. 조직 상태 요약</div><div class="dashboardSectionDesc">인원, 미사용 연차, 총 연장근로처럼 판단에 필요한 기본 숫자입니다.</div></div></div>
        <div class="dashboardInfoGrid" id="dashboardInfoGrid"></div>
      </section>
      <section class="dashboardSection" data-dashboard-section="detail">
        <details class="dashboardDetailBox" id="dashboardDetailBox">
          <summary>4. 상세 지표 보기</summary>
          <div class="dashboardSectionDesc" style="margin:8px 0 12px">상세 지표는 기본 닫힘 상태로 두고, 열면 전체 내역을 한 번에 확인할 수 있게 그룹별로 모아 표시합니다.</div>
          <div class="dashboardDetailGroupGrid" id="dashboardDetailGroupGrid">
            <div class="dashboardDetailGroup" data-detail-group="overtime"><div class="dashboardDetailGroupHead"><strong>연장근로</strong><span>부하/집중</span></div><div class="dashboardDetailGroupBody" id="detailGroupOvertime"></div><div class="dashboardDetailGroupNote">총량이 높으면 부하 수준을, 집중도가 높으면 특정 인원 몰림을 우선 확인합니다. 반복자는 업무 재배분 검토 대상입니다.</div></div>
            <div class="dashboardDetailGroup" data-detail-group="leave"><div class="dashboardDetailGroupHead"><strong>연차/회복</strong><span>휴식/회복</span></div><div class="dashboardDetailGroupBody" id="detailGroupLeave"></div><div class="dashboardDetailGroupNote">연차 부족 또는 미사용 비중이 높으면 회복 부족 신호로 보고, 장기 미사용 인원 사용 권고를 검토합니다.</div></div>
            <div class="dashboardDetailGroup" data-detail-group="mobility"><div class="dashboardDetailGroupHead"><strong>외근/출장</strong><span>활동/편중</span></div><div class="dashboardDetailGroupBody" id="detailGroupMobility"></div><div class="dashboardDetailGroupNote">외근/출장은 단순 건수보다 특정 인원 편중 여부가 중요합니다. 편중이 높으면 담당 로테이션을 검토합니다.</div></div>
            <div class="dashboardDetailGroup" data-detail-group="operation"><div class="dashboardDetailGroupHead"><strong>조직/운영</strong><span>종합 판단</span></div><div class="dashboardDetailGroupBody" id="detailGroupOperation"></div><div class="dashboardDetailGroupNote">위험 인원, 업무집중, 퇴직 리스크를 함께 보며 조직 운영의 구조적 부담 여부를 확인합니다.</div></div>
          </div>
        </details>
      </section>
      <div id="dashboardHiddenCardPool" style="display:none"></div>
    `;
    cards.forEach(card => container.appendChild(card));
    const detailBox = document.getElementById('dashboardDetailBox');
    if(detailBox) detailBox.open = false;
    container.dataset.relayoutReady = 'Y';
  }
  return container;
}
function moveDashboardCard(cardId, targetId){
  const card = document.querySelector(`[data-kpi-card="${cardId}"]`);
  const target = document.getElementById(targetId);
  if(card && target) target.appendChild(card);
}
function stripIdsForDashboardClone(root){
  if(!root) return root;
  if(root.removeAttribute) root.removeAttribute('id');
  root.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  root.querySelectorAll('.kpiDragHandle').forEach(el => el.remove());
  root.setAttribute('data-detail-clone','Y');
  return root;
}
function cloneDashboardCardForDetail(cardId, targetId){
  const source = document.querySelector(`[data-kpi-card="${cardId}"]:not([data-detail-clone="Y"])`);
  const target = document.getElementById(targetId);
  if(!source || !target) return;
  const clone = stripIdsForDashboardClone(source.cloneNode(true));
  clone.setAttribute('data-kpi-card', `${cardId}_detail`);
  target.appendChild(clone);
}

function applyDashboardReinforcementGuides(){
  const guideMap = {
    operational_risk_total: { title:'종합 해석', body:'운영 리스크는 연장근로·업무집중·연차·퇴직 신호를 함께 본 최종 운영 판단 카드입니다.', action:'높게 나오면 핵심 원인 TOP3를 먼저 확인하고 담당자별 과부하 여부를 점검' },
    leave_risk: { title:'회복 해석', body:'미사용 인원과 사용 편중이 함께 높으면 조직 회복력이 낮아진 상태로 봅니다.', action:'연차 미사용자와 장기 과부하 인원에게 사용 권고' },
    operational_risk: { title:'연장근로 해석', body:'연장근로 리스크는 평균 시간과 특정 인원 집중도를 함께 반영합니다.', action:'반복 야근 업무와 상위 연장근로자 업무 분산 검토' },
    high_risk_count: { title:'인원 해석', body:'위험 인원은 개인 위험점수 75점 이상 인원으로, 즉시 확인이 필요한 대상입니다.', action:'상위 위험자 상세 사유와 근무 패턴 확인' },
    work_concentration: { title:'원인 해석', body:'상위 20% 인원이 전체 업무에서 차지하는 비중입니다. 높을수록 특정 인원 의존도가 큽니다.', action:'업무 분배 구조와 대체 가능 인력 확인' },
    overtime_concentration: { title:'원인 해석', body:'연장근로가 일부 인원에게 몰리는 정도입니다. 평균보다 편중 여부를 함께 봅니다.', action:'상위 연장근로자 반복 업무 확인' },
    leave_deficiency: { title:'원인 해석', body:'연차/반차 사용량이 기준 대비 부족한 정도입니다. 회복 부족 가능성을 보여줍니다.', action:'연차 사용 계획 안내 및 장기 미사용자 확인' },
    mobility_concentration: { title:'원인 해석', body:'외근/출장이 일부 인원에게 몰리는 정도입니다. 직무 특성을 고려해 해석합니다.', action:'담당 로테이션 또는 지원 인력 필요 여부 확인' },
    avg_overtime: { title:'원인 해석', body:'1인당 평균 연장근로 수준입니다. 조직 전체 부하의 기본 신호입니다.', action:'평균 상승 시 업무량 증가 원인 확인' },
    mobility_activity: { title:'원인 해석', body:'1인당 평균 외근/출장 활동량입니다. 이동성 업무 부담을 보여줍니다.', action:'활동량 증가 시 특정 업무 이벤트 여부 확인' }
  };
  Object.entries(guideMap).forEach(([cardId, info]) => {
    const card = document.querySelector(`[data-kpi-card="${cardId}"]:not([data-detail-clone="Y"])`);
    if(!card) return;
    card.querySelectorAll('.dashboardCardGuide').forEach(el => el.remove());
    const guide = document.createElement('div');
    guide.className = 'dashboardCardGuide';
    guide.innerHTML = `<strong>${info.title}</strong><div>${info.body}</div><div class="guideAction">${info.action}</div>`;
    card.appendChild(guide);
  });
}

function resetDashboardDetailGroups(){
  ['detailGroupOvertime','detailGroupLeave','detailGroupMobility','detailGroupOperation'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = '';
  });
}
function applyDashboardRelayoutCards(){
  const container = ensureDashboardRelayoutStructure();
  if(!container) return;

  const decisionIds = ['operational_risk_total','leave_risk','operational_risk','high_risk_count'];
  const infoIds = ['target_headcount','unused_leave','total_overtime'];
  const causeCandidates = [
    { id:'work_concentration', metric:'kpiWorkConcentration', weight:1.00 },
    { id:'overtime_concentration', metric:'kpiOvertimeSkew', weight:1.00 },
    { id:'leave_deficiency', metric:'kpiLeaveDef', weight:1.00 },
    { id:'mobility_concentration', metric:'kpiMobilitySkew', weight:1.00 },
    { id:'avg_overtime', metric:'kpiOver', weight:5.00 },
    { id:'mobility_activity', metric:'kpiMobility', weight:25.00 }
  ];

  decisionIds.forEach(id => moveDashboardCard(id, 'dashboardDecisionGrid'));

  const existingCandidateIds = new Set(causeCandidates.map(item => item.id));
  const scored = causeCandidates
    .map(item => ({ ...item, score: parseDashboardMetricValue(item.metric) * item.weight }))
    .filter(item => document.querySelector(`[data-kpi-card="${item.id}"]:not([data-detail-clone="Y"])`))
    .sort((a,b) => b.score - a.score);
  const topCauseIds = new Set(scored.slice(0,3).map(item => item.id));
  scored.forEach(item => moveDashboardCard(item.id, topCauseIds.has(item.id) ? 'dashboardCauseGrid' : 'dashboardHiddenCardPool'));

  infoIds.forEach(id => moveDashboardCard(id, 'dashboardInfoGrid'));

  applyDashboardReinforcementGuides();

  const fixedIds = new Set([...decisionIds, ...infoIds, ...existingCandidateIds]);
  [...container.querySelectorAll('[data-kpi-card]:not([data-detail-clone="Y"])')].forEach(card => {
    const id = card.getAttribute('data-kpi-card');
    if(!fixedIds.has(id)){
      const hiddenByDesign = card.style && String(card.style.display || '').includes('none');
      if(!hiddenByDesign) document.getElementById('dashboardHiddenCardPool')?.appendChild(card);
    }
  });

  // 상세지표는 상단 TOP3/결론 카드와 분산되지 않도록, 원본을 이동하지 않고 복제본으로 전체 내역을 그룹별 표시합니다.
  resetDashboardDetailGroups();
  [
    ['total_overtime','detailGroupOvertime'],
    ['avg_overtime','detailGroupOvertime'],
    ['overtime_concentration','detailGroupOvertime'],
    ['leave_deficiency','detailGroupLeave'],
    ['unused_leave','detailGroupLeave'],
    ['leave_risk','detailGroupLeave'],
    ['total_activity','detailGroupMobility'],
    ['mobility_activity','detailGroupMobility'],
    ['mobility_concentration','detailGroupMobility'],
    ['mobility_risk','detailGroupMobility'],
    ['work_concentration_status','detailGroupOperation'],
    ['high_risk_count','detailGroupOperation'],
    ['retirement_risk','detailGroupOperation']
  ].forEach(([cardId, targetId]) => cloneDashboardCardForDetail(cardId, targetId));
}


function dashboardTrendFormatDiff(diff, suffix){
  const value = Number(diff || 0);
  if(!Number.isFinite(value) || Math.abs(value) < 0.05) return '';
  const arrow = value > 0 ? '↑' : '↓';
  const sign = value > 0 ? '+' : '';
  const absValue = Math.abs(value) >= 10 || suffix === '%' ? value.toFixed(0) : value.toFixed(1);
  return `전월 대비 ${arrow} ${sign}${absValue}${suffix || ''}`;
}
function dashboardTrendMetricForCard(cardId, people, ym){
  const scoped = Array.isArray(people) ? people.filter(Boolean) : [];
  if(!scoped.length) return 0;
  const metrics = typeof getWorkConcentrationMetrics === 'function' ? getWorkConcentrationMetrics(scoped) : {};
  if(cardId === 'work_concentration') return Number(metrics.workConcentrationRate || 0);
  if(cardId === 'overtime_concentration') return Number(metrics.overtimeConcentrationRate || 0);
  if(cardId === 'mobility_concentration') return Number(metrics.activityConcentrationRate || 0);
  if(cardId === 'avg_overtime') return avg(scoped, 'scopedMonthlyOvertime');
  if(cardId === 'mobility_activity'){
    const activityValue = metrics.activityValue || (x => Number(x.businessTripDays || 0) + Number(x.outdoorDays || 0));
    const total = scoped.reduce((sum, item) => sum + Number(activityValue(item) || 0), 0);
    return total / Math.max(1, scoped.length);
  }
  if(cardId === 'leave_deficiency'){
    try{
      const radar = typeof trendDeepRadarMetricsForMonth === 'function' ? trendDeepRadarMetricsForMonth(ym, scoped) : null;
      return Number(radar?.leaveDefRisk || 0);
    }catch(e){ return 0; }
  }
  return 0;
}
function applyDashboardMonthlyTrendHints(){
  document.querySelectorAll('.dashboardTrendHint').forEach(el => el.remove());
  let selectedYm = String(getSelectedAttendancePeriodMeta()?.value || STATE.period || '').trim();
  if(!/^\d{4}-\d{2}$/.test(selectedYm)) return;
  const months = typeof trendGetAvailableMonths === 'function' ? trendGetAvailableMonths() : [];
  const prevYm = months.filter(m => m < selectedYm).slice(-1)[0];
  if(!prevYm) return;
  const currentPeople = typeof scopedEmployees === 'function' ? scopedEmployees() : [];
  const prevPeople = typeof trendEmployeesForMonth === 'function' ? trendEmployeesForMonth(prevYm) : [];
  const cardMeta = {
    work_concentration:{suffix:'%', min:1},
    overtime_concentration:{suffix:'%', min:1},
    leave_deficiency:{suffix:'%', min:1},
    mobility_concentration:{suffix:'%', min:1},
    avg_overtime:{suffix:'시간', min:0.1},
    mobility_activity:{suffix:'건', min:0.1}
  };
  Object.entries(cardMeta).forEach(([cardId, meta]) => {
    const card = document.querySelector(`[data-kpi-card="${cardId}"]:not([data-detail-clone="Y"])`);
    if(!card) return;
    const current = dashboardTrendMetricForCard(cardId, currentPeople, selectedYm);
    const prev = dashboardTrendMetricForCard(cardId, prevPeople, prevYm);
    const diff = current - prev;
    if(!Number.isFinite(diff) || Math.abs(diff) < meta.min) return;
    const hintText = dashboardTrendFormatDiff(diff, meta.suffix);
    if(!hintText) return;
    const hint = document.createElement('div');
    hint.className = 'dashboardTrendHint';
    hint.textContent = hintText;
    hint.style.color = diff > 0 ? '#dc2626' : '#059669';
    hint.style.borderColor = diff > 0 ? '#fecaca' : '#bbf7d0';
    hint.style.background = diff > 0 ? '#fef2f2' : '#f0fdf4';
    card.appendChild(hint);
  });
}

function renderSummary(months){
  const el = document.getElementById('summaryCards');
  if(el){ el.innerHTML = ''; el.style.display = 'none'; }
  if(typeof applyDashboardMonthlyTrendHints === 'function') applyDashboardMonthlyTrendHints();
}

function renderAlerts(months){
  const el = document.getElementById('alertCards');
  if(el){ el.innerHTML = ''; el.style.display = 'none'; }
}

function barSVG(el, data, keys, colors, rotated, options={}){
  if(!data || !data.length){ renderEmptyChart(el); return; }
  const timeFormat = !!options.timeFormat;
  const width=el.clientWidth||900, height=el.clientHeight||320, margin={top:28,right:20,bottom:rotated?82:42,left:timeFormat?56:44}, pw=width-margin.left-margin.right, ph=height-margin.top-margin.bottom;
  const rawMax=Math.max(...data.flatMap(d=>keys.map(k=>Number(d[k]||0))),1);
  const allIntegers = data.every(d => keys.every(k => Number.isInteger(Number(d[k] || 0))));
  const integerOnly = !timeFormat && allIntegers && rawMax <= 12;
  const tickStep = timeFormat ? Math.max(0.5, Math.ceil((rawMax / 4) * 2) / 2) : (integerOnly ? 1 : Math.max(1, Math.ceil(rawMax / 4)));
  const tickMax = integerOnly ? rawMax : Math.ceil(rawMax / tickStep) * tickStep;
  const tickValues = [];
  for(let value = 0; value <= tickMax + 0.0001; value += tickStep){ tickValues.push(Number(value.toFixed(2))); }
  if(Math.abs(tickValues[tickValues.length - 1] - tickMax) > 0.0001) tickValues.push(tickMax);
  const maxV = Math.max(tickMax, rawMax, 1);
  const groupW=pw/Math.max(data.length,1), barW=Math.max(12,Math.min(34,groupW/(keys.length+0.8)));
  let svg=`<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
  tickValues.forEach(v => {
    const ratio = maxV === 0 ? 0 : (v / maxV);
    const y = margin.top + ph - (ph * ratio);
    const tickLabel = timeFormat ? formatHoursToHM(v) : (integerOnly ? Math.round(v) : (Number.isInteger(v) ? v : Number(v.toFixed(1))));
    svg += `<line x1="${margin.left}" y1="${y}" x2="${width-margin.right}" y2="${y}" stroke="#e2e8f0"/><text x="${margin.left-8}" y="${y+5}" text-anchor="end" style="font-size:14px">${tickLabel}</text>`;
  });
  data.forEach((d,i)=>{
    const x0=margin.left+i*groupW+(groupW-(keys.length*barW))/2;
    keys.forEach((k,j)=>{
      const val=Number(d[k]||0), h=(val/maxV)*ph, x=x0+j*barW, y=margin.top+ph-h;
      const rectW = barW-4;
      const labelY = Math.max(margin.top - 2, y - 6);
      const valueLabel = timeFormat ? formatHoursToHM(val) : (allIntegers ? Math.round(val) : Number(val.toFixed(1)));
      svg += `<g><rect class="svg-bar" x="${x}" y="${y}" width="${rectW}" height="${h}" rx="6" fill="${colors[j]}"><title>${(d.name||d.month||'')} · ${k}: ${valueLabel}</title></rect>`;
      if(val > 0){
        svg += `<text class="svg-value-label" x="${x + rectW/2}" y="${labelY}" text-anchor="middle">${valueLabel}</text>`;
      }
      svg += `</g>`;
    });
    const tx=margin.left+i*groupW+groupW/2, label=d.name||d.month;
    svg += rotated?`<text x="${tx}" y="${height-16}" text-anchor="end" transform="rotate(-15 ${tx} ${height-16})" style="font-size:14px">${label}</text>`:`<text x="${tx}" y="${height-14}" text-anchor="middle" style="font-size:14px">${label}</text>`;
  });
  el.innerHTML = svg + '</svg>';
}

function lineSVG(el, data, series){
  if(!data || !data.length){ renderEmptyChart(el); return; }
  const width=el.clientWidth||900, height=el.clientHeight||320, margin={top:20,right:20,bottom:42,left:44}, pw=width-margin.left-margin.right, ph=height-margin.top-margin.bottom;
  const maxV=Math.max(...data.flatMap(d=>series.map(s=>d[s.key]||0)),1);
  let svg=`<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
  for(let i=0;i<=4;i++){ const y=margin.top+ph-ph*(i/4), v=Math.round(maxV*(i/4)); svg+=`<line x1="${margin.left}" y1="${y}" x2="${width-margin.right}" y2="${y}" stroke="#e2e8f0"/><text x="${margin.left-8}" y="${y+5}" text-anchor="end" style="font-size:14px">${v}</text>`; }
  data.forEach((d,i)=>{ const x=margin.left+(pw/Math.max(data.length-1,1))*i; svg+=`<text x="${x}" y="${height-16}" text-anchor="middle">${d.month}</text>`; });
  series.forEach(s=>{ let path=''; data.forEach((d,i)=>{ const x=margin.left+(pw/Math.max(data.length-1,1))*i, y=margin.top+ph-((d[s.key]||0)/maxV)*ph; path += `${i===0?'M':'L'} ${x} ${y} `; }); svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="3"/>`; data.forEach((d,i)=>{ const x=margin.left+(pw/Math.max(data.length-1,1))*i, y=margin.top+ph-((d[s.key]||0)/maxV)*ph; svg += `<circle cx="${x}" cy="${y}" r="4" fill="${s.color}"/>`; }); });
  el.innerHTML = svg + '</svg>';
}

function donutSVG(el, data){
  if(!data || !data.length){ renderEmptyChart(el); return; }
  const width=el.clientWidth||320, height=el.clientHeight||280, cx=width/2, cy=height/2, r=78, inner=46, total=data.reduce((s,d)=>s+d.count,0)||1;
  const labelRadius = inner + ((r - inner) * 0.58);
  let a=-Math.PI/2, svg=`<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
  data.forEach((d,i)=>{
    const frac=d.count/total, n=a+frac*Math.PI*2;
    const x1=cx+r*Math.cos(a), y1=cy+r*Math.sin(a), x2=cx+r*Math.cos(n), y2=cy+r*Math.sin(n);
    const large=frac>.5?1:0;
    const xi1=cx+inner*Math.cos(n), yi1=cy+inner*Math.sin(n), xi2=cx+inner*Math.cos(a), yi2=cy+inner*Math.sin(a);
    svg += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${COLORS[i%COLORS.length]}"/>`;

    const mid = a + ((n - a) / 2);
    const labelX = cx + labelRadius * Math.cos(mid);
    const labelY = cy + labelRadius * Math.sin(mid) + 4;
    const labelFont = frac < 0.12 ? 10 : frac < 0.2 ? 11 : 12;
    svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" style="font-size:${labelFont}px;fill:#ffffff;font-weight:800;pointer-events:none">${d.count}</text>`;
    a=n;
  });
  svg += `<circle cx="${cx}" cy="${cy}" r="${inner-2}" fill="white"/><text x="${cx}" y="${cy-4}" text-anchor="middle" style="font-size:24px;fill:#0f172a;font-weight:800">${total}</text><text x="${cx}" y="${cy+16}" text-anchor="middle">인원</text></svg>`;
  el.innerHTML = svg;
}

function singleCountSVG(el, count, label='인원'){
  const width=el.clientWidth||320, height=el.clientHeight||280, cx=width/2, cy=height/2;
  const safeCount = Number(count || 0);
  const svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">
    <text x="${cx}" y="${cy-6}" text-anchor="middle" style="font-size:24px;fill:#0f172a;font-weight:800">${safeCount}</text>
    <text x="${cx}" y="${cy+18}" text-anchor="middle" style="font-size:16px">${label}</text>
  </svg>`;
  el.innerHTML = svg;
}

function radarSVG(el, data){
  if(!data || !data.length){ renderEmptyChart(el); return; }
  const width=el.clientWidth||320, height=el.clientHeight||280, cx=width/2, cy=height/2+4, r=Math.min(width, height)*0.31, n=data.length;
  let svg=`<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
  for(let lv=1; lv<=4; lv++){ const rr=r*(lv/4), pts=[]; for(let i=0;i<n;i++){ const a=-Math.PI/2+Math.PI*2*i/n; pts.push(`${cx+rr*Math.cos(a)},${cy+rr*Math.sin(a)}`);} svg += `<polygon points="${pts.join(' ')}" fill="none" stroke="#e2e8f0"/>`; }
  data.forEach((d,i)=>{ const a=-Math.PI/2+Math.PI*2*i/n, x=cx+(r+22)*Math.cos(a), y=cy+(r+22)*Math.sin(a); svg += `<line x1="${cx}" y1="${cy}" x2="${cx+r*Math.cos(a)}" y2="${cy+r*Math.sin(a)}" stroke="#e2e8f0"/><text x="${x}" y="${y}" text-anchor="middle">${d.subject}</text>`; });
  const pts=[]; data.forEach((d,i)=>{ const a=-Math.PI/2+Math.PI*2*i/n, rr=r*(d.value/100); pts.push(`${cx+rr*Math.cos(a)},${cy+rr*Math.sin(a)}`); });
  el.innerHTML = svg + `<polygon points="${pts.join(' ')}" fill="rgba(124,58,237,.25)" stroke="#7c3aed" stroke-width="2"/></svg>`;
}


function getSelectedMonthNumbersFromMetrics(months){
  const source = Array.isArray(months) && months.length ? months : (typeof periodMonths === 'function' ? periodMonths() : []);
  const values = source.map(m => {
    const raw = String((m && m.month) || '').trim();
    const match = raw.match(/(\d{1,2})월/);
    return match ? Number(match[1]) : null;
  }).filter(v => Number.isFinite(v));
  return [...new Set(values)];
}
function getSelectedBaseYear(){
  const label = typeof periodLabel === 'function' ? String(periodLabel() || '') : '';
  const yearMatch = label.match(/^(\d{2})\./);
  return yearMatch ? 2000 + Number(yearMatch[1]) : new Date().getFullYear();
}
function countBusinessDaysInSelectedMonths(months){
  const monthNumbers = getSelectedMonthNumbersFromMetrics(months);
  const baseYear = getSelectedBaseYear();
  if(!monthNumbers.length) return 0;
  let total = 0;
  monthNumbers.forEach(month => {
    const lastDay = new Date(baseYear, month, 0).getDate();
    for(let day = 1; day <= lastDay; day++){
      const dateStr = `${baseYear}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dow = new Date(baseYear, month - 1, day).getDay();
      if(dow !== 0 && dow !== 6 && !HOLIDAY_DATE_SET.has(dateStr)) total += 1;
    }
  });
  return total;
}
function buildExpectedLeaveMapForPeriod(months, targetEmployees){
  const monthNumbers = getSelectedMonthNumbersFromMetrics(months);
  const selectedMonthCount = Math.max(1, monthNumbers.length || 1);
  const businessDays = countBusinessDaysInSelectedMonths(months);
  const empty = new Map();
  const employeeList = Array.isArray(targetEmployees) ? targetEmployees : [];
  employeeList.forEach(emp => {
    const name = normalizeEmployeeName(emp.name);
    empty.set(name, {
      expectedLeave: selectedMonthCount,
      continuousLeaveDays: 0,
      eligibleDays: businessDays,
      businessDays,
      workRatio: businessDays > 0 ? 1 : 0
    });
  });
  if(!businessDays || !employeeList.length) return empty;

  const targetNameSet = new Set(employeeList.map(emp => normalizeEmployeeName(emp.name)));
  const metaByName = new Map(empMaster.map(e => [normalizeEmployeeName(e.name), e]));
  const rows = getMergedRawAttendanceData()
    .map(row => decorateAttendanceRow(row, metaByName))
    .filter(Boolean)
    .filter(row => isAttendanceTargetIncludedRow(row, metaByName));

  rows.forEach(row => {
    const dateText = String(row.date || '');
    const month = Number(dateText.slice(5, 7));
    if(!monthNumbers.includes(month)) return;
    const cleanName = normalizeEmployeeName(row.name);
    if(!targetNameSet.has(cleanName)) return;
    const reason = getAttendanceBaseReason(row);
    if(!isContinuousLeaveReason(reason)) return;
    const current = empty.get(cleanName) || {
      expectedLeave: selectedMonthCount,
      continuousLeaveDays: 0,
      eligibleDays: businessDays,
      businessDays,
      workRatio: businessDays > 0 ? 1 : 0
    };
    current.continuousLeaveDays += 1;
    current.eligibleDays = Math.max(0, businessDays - current.continuousLeaveDays);
    current.workRatio = businessDays > 0 ? current.eligibleDays / businessDays : 0;
    current.expectedLeave = +(selectedMonthCount * current.workRatio).toFixed(2);
    empty.set(cleanName, current);
  });

  empty.forEach((value, key) => {
    if(value.continuousLeaveDays <= 0){
      value.expectedLeave = +selectedMonthCount.toFixed(2);
      value.eligibleDays = businessDays;
      value.businessDays = businessDays;
      value.workRatio = businessDays > 0 ? 1 : 0;
      empty.set(key, value);
    }
  });
  return empty;
}
