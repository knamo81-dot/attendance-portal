const SDS_SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
const SDS_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";
window.SDSApp = window.SDSApp || {};
window.SDSApp.permissionBuild = '20260927-perm2';
window.SDSApp.db = window.supabase.createClient(SDS_SUPABASE_URL, SDS_SUPABASE_KEY);
window.SDSApp.getPortalSession = function(){
  try{ if(window.parent && typeof window.parent.getPortalSession === 'function') return window.parent.getPortalSession(); }catch(_){}
  try{ if(window.parent && window.parent.portalSession) return window.parent.portalSession; }catch(_){}
  try{ return JSON.parse(sessionStorage.getItem('portalSession')||'null') || JSON.parse(localStorage.getItem('portalSession')||'null'); }catch(_){ return null; }
};
window.SDSApp.getCompanyId = function(){
  const s=window.SDSApp.getPortalSession()||{};
  const id=s.activeCompanyId||s.companyId||s.company_id||s.activeCompany?.id||s.activeCompany?.company_id||s.company?.id||s.company?.company_id;
  if(id) return String(id);
  const p=new URLSearchParams(location.search); return p.get('company_id')||p.get('active_company_id')||'';
};

/* ===== QA permission helpers (2026-09-27) ===== */
window.SDSApp.normalizePortalRole = function(role, fallback='user'){
  const clean=String(role||'').trim().toLowerCase();
  if(['admin','administrator','관리자'].includes(clean)) return 'admin';
  if(['operator','manager','운영자'].includes(clean)) return 'operator';
  if(['viewer','readonly','read_only','조회','조회자'].includes(clean)) return 'viewer';
  if(['blocked','block','disabled','차단'].includes(clean)) return 'blocked';
  if(['user','member','일반','일반사용자'].includes(clean)) return 'user';
  return fallback;
};
window.SDSApp.getQaRole = function(){
  const s=window.SDSApp.getPortalSession()||{};
  const appRoles=s.appRoles||s.app_roles||{};
  const q=appRoles.qa||{};
  const raw=(typeof q==='string'?q:(q.role||q.role_key||q.permission||q.permission_key||''));
  return window.SDSApp.normalizePortalRole(raw,'user');
};
window.SDSApp.isQaOperator = function(){
  const s=window.SDSApp.getPortalSession()||{};
  if(s.isServiceAdmin===true||s.is_service_admin===true||s.serviceAdmin===true||s.service_admin===true) return true;
  const globalRole=window.SDSApp.normalizePortalRole(
    s.role||s.workspaceRole||s.workspace_role||s.user?.role||s.profile?.workspace_role||s.profile?.portal_role||s.profile?.company_role||s.profile?.tenant_role||s.profile?.user_role||s.profile?.role||s.employee?.role||'',
    'user'
  );
  if(globalRole==='admin') return true;
  const qaRole=window.SDSApp.getQaRole();
  return qaRole==='admin'||qaRole==='operator';
};
window.SDSApp.getQaHealthScope = function(){
  if(window.SDSApp.isQaOperator()) return {type:'all',label:'전체'};
  const s=window.SDSApp.getPortalSession()||{};
  const e=s.employee||{};
  const raw=e.raw||{};
  const authority=String(e.authority||raw.authority||e.duty||raw.duty||raw.job_duty||raw.job_title||raw.responsibility||raw.role_title||'').trim();
  const employeeNo=String(e.employee_no||e.employeeNo||s.employee_no||s.employeeNo||s.user?.employee_no||s.user?.employeeNo||'').trim();
  const divisionCode=String(e.division_code||raw.division_code||'').trim();
  const teamCode=String(e.team_code||raw.team_code||'').trim();
  const parseTeams=(value)=>{
    if(Array.isArray(value)) return value.map(v=>String(v||'').trim()).filter(Boolean);
    const text=String(value||'').trim();
    if(!text) return [];
    try{const parsed=JSON.parse(text);if(Array.isArray(parsed))return parsed.map(v=>String(v||'').trim()).filter(Boolean);}catch(_){}
    return text.split(',').map(v=>v.trim()).filter(Boolean);
  };
  if(authority.includes('대표이사')) return {type:'all',label:'회사 전체'};
  if(authority.includes('소장')||authority.includes('본부장')) return {type:'division',division_code:divisionCode,label:'소속 본부'};
  if(authority.includes('담당')){
    const teamCodes=parseTeams(e.managed_team_codes||raw.managed_team_codes||raw.managedTeamCodes);
    if(!teamCodes.length&&teamCode) teamCodes.push(teamCode);
    return {type:'teams',team_codes:teamCodes,label:'관리 팀'};
  }
  if(authority.includes('팀장')) return {type:'teams',team_codes:teamCode?[teamCode]:[],label:'소속 팀'};
  return {type:'self',employee_no:employeeNo,label:'본인'};
};
window.SDSApp.qaHealthScopeAllowsEmployee = function(employee){
  const scope=window.SDSApp.getQaHealthScope();
  if(scope.type==='all') return true;
  if(scope.type==='division') return !!scope.division_code&&String(employee?.division_code||'')===String(scope.division_code);
  if(scope.type==='teams') return (scope.team_codes||[]).map(String).includes(String(employee?.team_code||''));
  return !!scope.employee_no&&String(employee?.employee_no||'')===String(scope.employee_no);
};
