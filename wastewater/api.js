const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

/* =========================================================
   Wastewater API tenant bridge
   - 포탈 부모 portalSession을 우선 사용
   - iframe 내부에서 자체 로그인/회사검증을 반복하지 않음
   - company_id 대상 테이블은 select/update/delete에 자동 스코프 적용
   - insert/upsert payload에는 company_id 자동 주입
========================================================= */
function getWastewaterPortalSession(){
  try{
    if(window.parent && window.parent !== window && typeof window.parent.getPortalSession === 'function'){
      return window.parent.getPortalSession();
    }
  }catch(e){}
  try{
    if(window.parent && window.parent !== window && window.parent.portalSession){
      return window.parent.portalSession;
    }
  }catch(e){}
  return window.portalSession || window.currentPortalSession || null;
}

function getWastewaterRawSupabaseClient(){
  const session = getWastewaterPortalSession();
  try{
    if(session && session.supabase) return session.supabase;
  }catch(e){}
  try{
    if(window.parent && window.parent !== window && window.parent.portalSupabase){
      return window.parent.portalSupabase;
    }
  }catch(e){}
  if(window.portalSupabase) return window.portalSupabase;
  if(window.sb && window.sb.__isWastewaterTenantScoped !== true) return window.sb;
  if(window.supabase && typeof window.supabase.createClient === 'function'){
    window.portalSupabase = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    return window.portalSupabase;
  }
  return null;
}

function getWastewaterCompanyId(){
  const session=getWastewaterPortalSession() || {};
  const activeCompany=session.activeCompany || session.active_company || session.selectedCompany || session.selected_company || session.company || {};
  const fromSession=
    session.activeCompanyId ||
    session.active_company_id ||
    session.selectedCompanyId ||
    session.selected_company_id ||
    activeCompany.id ||
    activeCompany.company_id ||
    session.companyId ||
    session.company_id ||
    session.company?.id ||
    session.company?.company_id ||
    session.profile?.company_id ||
    window.currentCompanyId ||
    '';
  if(fromSession) return String(fromSession).trim();
  try{
    const params=new URLSearchParams(location.search);
    return String(params.get('company_id')||params.get('companyId')||'').trim();
  }catch(e){
    return '';
  }
}

function publishWastewaterTenantSession(){
  const parent=getWastewaterPortalSession() || {};
  const companyId=getWastewaterCompanyId();
  const merged={
    ...parent,
    supabase: window.portalSupabase || getWastewaterRawSupabaseClient(),
    companyId,
    company_id: companyId,
    activeCompanyId: companyId,
    active_company_id: companyId
  };
  window.portalSession=merged;
  window.currentPortalSession=merged;
  window.currentCompanyId=companyId || window.currentCompanyId || null;
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

const WASTEWATER_TENANT_TABLES = new Set([
  'wastewater','wastewater_pickups','monthly_approvals','approval_logs','activity_logs',
  'reference_docs','wastewater_approvers','wastewater_operators',
  'users','employees','user_app_roles',
  'divisions','teams','managed_teams',
  'attendance_records','attendance_erp_raw','attendance_secom_raw','attendance_upload_batches','attendance_upload_logs'
]);

function createWastewaterScopedBuilder(initialBuilder, tableName, alreadyScoped){
  const state={builder:initialBuilder, scoped:!!alreadyScoped};
  const shouldScope=()=>WASTEWATER_TENANT_TABLES.has(String(tableName||''));
  const ensureScope=()=>{
    const companyId=getWastewaterCompanyId();
    if(!shouldScope() || !companyId || state.scoped) return;
    try{
      if(state.builder && typeof state.builder.eq === 'function'){
        state.builder=state.builder.eq('company_id', companyId);
        state.scoped=true;
      }
    }catch(error){
      console.warn('[wastewater api] company scope failed:', tableName, error);
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

      const value=state.builder[prop];
      if(typeof value !== 'function') return value;

      return function(...args){
        const companyId=getWastewaterCompanyId();

        if((prop === 'insert' || prop === 'upsert') && shouldScope()){
          args[0]=addCompanyIdToPayload(args[0], companyId);
        }

        if((prop === 'single' || prop === 'maybeSingle' || prop === 'csv' || prop === 'geojson' || prop === 'explain') && shouldScope()){
          ensureScope();
        }

        const next=value.apply(state.builder,args);
        if(next && typeof next === 'object'){
          return createWastewaterScopedBuilder(next, tableName, state.scoped);
        }
        return next;
      };
    }
  });
}

function createWastewaterTenantScopedClient(baseClient){
  const scoped=new Proxy(baseClient, {
    get(target, prop){
      if(prop === 'from'){
        return function(tableName){
          const builder=target.from(tableName);
          return createWastewaterScopedBuilder(builder, tableName, false);
        };
      }
      const value=target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  Object.defineProperty(scoped,'__isWastewaterTenantScoped',{value:true});
  return scoped;
}

const rawWastewaterSb=getWastewaterRawSupabaseClient();
if(!rawWastewaterSb){
  throw new Error('Supabase client를 초기화하지 못했습니다. 포탈 세션 또는 Supabase CDN 로드를 확인하세요.');
}
window.portalSupabase = window.portalSupabase || rawWastewaterSb;
publishWastewaterTenantSession();
const sb=createWastewaterTenantScopedClient(rawWastewaterSb);
window.sb=sb;

const DAILY_TABLE='wastewater';
const DAILY_VIEW='wastewater';
const PICKUP_TABLE='wastewater_pickups';
const USERS_TABLE='users';
const EMPLOYEES_TABLE='employees';
const WASTEWATER_ROLE_VIEW='wastewater_role_view';
const WASTEWATER_OPERATORS_TABLE='wastewater_operators';
const WASTEWATER_APPROVERS_TABLE='wastewater_approvers';
const USER_APP_ROLES_TABLE='user_app_roles';
const LOG_TABLE='activity_logs';
const APPROVAL_TABLE='monthly_approvals';
const APPROVAL_LOG_TABLE='approval_logs';
const REFERENCE_TABLE='reference_docs';
const RELATED_DOC_BUCKET='wastewater-docs';
const CM_LIMIT=154;
const TON_TO_CM=22;
const MAX_TON_M3=7;

function withCompanyPayload(payload){
  const companyId=getWastewaterCompanyId();
  return addCompanyIdToPayload(payload, companyId) || {...payload};
}
function scopedCompanyQuery(query){
  const companyId=getWastewaterCompanyId();
  return companyId ? query.eq('company_id', companyId) : query;
}


async function getMyRoles(email){
  const roles = [];
  const targetEmail = String(email || '').trim();
  const targetEmailLower = targetEmail.toLowerCase();
  if(!targetEmail) return roles;

  const pushRole = (role) => {
    if(role && !roles.includes(role)) roles.push(role);
  };

  let employeeNo = '';

  try{
    const { data: commonUser } = await sb
      .from(USERS_TABLE)
      .select('email,role')
      .ilike('email', targetEmail)
      .maybeSingle();
    if(String(commonUser?.role || '').trim() === 'admin') pushRole('wastewater_admin');
  }catch(error){
    console.warn('common admin role load skipped:', error);
  }

  try{
    const { data: employee } = await sb
      .from(EMPLOYEES_TABLE)
      .select('employee_no,email')
      .ilike('email', targetEmail)
      .maybeSingle();
    employeeNo = String(employee?.employee_no || '').trim();
  }catch(error){
    console.warn('employee role key load skipped:', error);
  }

  // 중앙 권한관리(settings > user_app_roles) 기준 권한입니다.
  // app_key='wastewater', role_key='operator|approver'만 폐수 앱에 반영합니다.
  try{
    let roleQuery = sb
      .from(USER_APP_ROLES_TABLE)
      .select('employee_no,email,app_key,role_key')
      .eq('app_key', 'wastewater');

    if(employeeNo){
      roleQuery = roleQuery.or(`employee_no.eq.${employeeNo},email.ilike.${targetEmailLower}`);
    }else{
      roleQuery = roleQuery.ilike('email', targetEmail);
    }

    const { data, error } = await roleQuery;
    if(error){
      console.warn('central wastewater role load failed:', error);
    }else{
      (data || []).forEach(row => {
        const roleKey = String(row.role_key || '').trim();
        if(roleKey === 'operator') pushRole('wastewater_operator');
        if(roleKey === 'approver') pushRole('wastewater_approver');
      });
    }
  }catch(error){
    console.warn('central wastewater role load skipped:', error);
  }

  // 과거 폐수 전용 권한 테이블이 남아있는 경우를 대비한 fallback입니다.
  try{
    if(employeeNo){
      const { data: op } = await sb.from(WASTEWATER_OPERATORS_TABLE).select('employee_no,is_active').eq('employee_no', employeeNo).eq('is_active', true).maybeSingle();
      if(op) pushRole('wastewater_operator');
      const { data: ap } = await sb.from(WASTEWATER_APPROVERS_TABLE).select('employee_no,is_active').eq('employee_no', employeeNo).eq('is_active', true).maybeSingle();
      if(ap) pushRole('wastewater_approver');
    }
  }catch(error){
    console.warn('legacy wastewater dedicated role load skipped:', error);
  }

  return roles;
}

async function loadWastewaterRoleRows(){
  const rows = [];

  try{
    const { data: adminUsers, error: adminError } = await sb
      .from(USERS_TABLE)
      .select('email,name,role')
      .eq('role','admin');
    if(adminError) console.warn('admin role rows load failed:', adminError);
    (Array.isArray(adminUsers) ? adminUsers : []).forEach(row => {
      const email = String(row.email || '').trim();
      if(email) rows.push({ email, role_name:'wastewater_admin' });
    });
  }catch(error){
    console.warn('admin role rows load skipped:', error);
  }

  try{
    const { data, error } = await sb
      .from(USER_APP_ROLES_TABLE)
      .select('email,employee_no,app_key,role_key')
      .eq('app_key','wastewater')
      .order('email',{ascending:true});
    if(error){
      console.warn('central wastewater role rows load failed:', error);
    }else{
      (Array.isArray(data) ? data : []).forEach(row => {
        const roleKey = String(row.role_key || '').trim();
        const email = String(row.email || '').trim();
        if(!email) return;
        if(roleKey === 'operator') rows.push({ email, role_name:'wastewater_operator' });
        if(roleKey === 'approver') rows.push({ email, role_name:'wastewater_approver' });
      });
    }
  }catch(error){
    console.warn('central wastewater role rows load skipped:', error);
  }

  return { data: rows, error: null };
}

function loadCoreData(){
  return Promise.all([
    scopedCompanyQuery(sb.from(DAILY_VIEW).select('*')).order('date',{ascending:false}).order('created_at',{ascending:false}),
    scopedCompanyQuery(sb.from(PICKUP_TABLE).select('*')).order('pickup_date',{ascending:false}).order('created_at',{ascending:false}),
    scopedCompanyQuery(sb.from(APPROVAL_TABLE).select('*')).order('month_key',{ascending:false})
  ]);
}

function loadAdminData(){
  return Promise.all([
    loadWastewaterRoleRows(),
    scopedCompanyQuery(sb.from(LOG_TABLE).select('*')).order('created_at',{ascending:false}).limit(200)
  ]);
}

function loadReferenceData(){
  return scopedCompanyQuery(
    sb.from(REFERENCE_TABLE).select('*')
  ).order('doc_key',{ascending:true});
}

function loadAllData(includeAdmin){
  return Promise.all([
    scopedCompanyQuery(sb.from(DAILY_VIEW).select('*')).order('date',{ascending:false}).order('created_at',{ascending:false}),
    scopedCompanyQuery(sb.from(PICKUP_TABLE).select('*')).order('pickup_date',{ascending:false}).order('created_at',{ascending:false}),
    includeAdmin?loadWastewaterRoleRows():Promise.resolve({data:[]}),
    includeAdmin?scopedCompanyQuery(sb.from(LOG_TABLE).select('*')).order('created_at',{ascending:false}).limit(200):Promise.resolve({data:[]}),
    scopedCompanyQuery(sb.from(APPROVAL_TABLE).select('*')).order('month_key',{ascending:false}),
    scopedCompanyQuery(sb.from(REFERENCE_TABLE).select('*')).order('doc_key',{ascending:true})
  ]);
}

function saveReferenceDoc(existingId,payload){
  if(existingId) return scopedCompanyQuery(sb.from(REFERENCE_TABLE).update(payload).eq('id', existingId));
  return sb.from(REFERENCE_TABLE).insert([withCompanyPayload(payload)]);
}

function deleteReferenceDocById(id){
  return scopedCompanyQuery(sb.from(REFERENCE_TABLE).delete().eq('id', id));
}

function insertDailyRow(payload){
  return sb.from(DAILY_TABLE).insert([withCompanyPayload(payload)]).select().single();
}

function insertPickupRow(payload){
  return sb.from(PICKUP_TABLE).insert([withCompanyPayload(payload)]).select().single();
}

function deleteDailyRowById(id){ return scopedCompanyQuery(sb.from(DAILY_TABLE).delete().eq('id',id)); }
function deletePickupRowById(id){ return scopedCompanyQuery(sb.from(PICKUP_TABLE).delete().eq('id',id)); }

function upsertWriterApproval(monthKey,payload,rowExists){
  if(rowExists) return scopedCompanyQuery(sb.from(APPROVAL_TABLE).update(payload).eq('month_key', monthKey));
  return sb.from(APPROVAL_TABLE).insert([withCompanyPayload(payload)]);
}

function updateApprovalByMonth(monthKey,payload){
  return scopedCompanyQuery(sb.from(APPROVAL_TABLE).update(payload).eq('month_key',monthKey));
}

function updateUserRole(email,newRole){ return sb.from(USERS_TABLE).update({role:newRole}).eq('email',email); }
function approveUserByEmail(email){ return sb.from(USERS_TABLE).update({approved:true}).eq('email',email); }
function deleteUserByEmail(email){ return sb.from(USERS_TABLE).delete().eq('email',email); }
function updateUserSignature(email,signatureUrl){
  return sb.from(USERS_TABLE).update({signature_url:signatureUrl}).ilike('email', String(email||'').trim());
}

function getUserSignature(email){
  return sb.from(USERS_TABLE)
    .select('email,signature_url')
    .ilike('email', String(email||'').trim())
    .maybeSingle();
}

function getEmployeeDepartment(row = {}){ return row.department || row.division_name || row.division || row.division_code || ''; }
function getEmployeeTeam(row = {}){ return row.team || row.team_name || row.team_code || ''; }
function getEmployeeNo(row = {}){ return row.employee_no || row.employeeNo || ''; }
function getEmployeeEmail(row = {}){ return row.email || row.user_email || ''; }

async function searchEmployees(keyword){
  const value = String(keyword || '').trim();
  if(!value) return { data: [], error: null };
  const safeKeyword = value.replaceAll('%','\\%').replaceAll(',',' ');
  const pattern = `%${safeKeyword}%`;
  return sb
    .from(EMPLOYEES_TABLE)
    .select('*')
    .or(`employee_no.ilike.${pattern},name.ilike.${pattern},email.ilike.${pattern}`)
    .limit(30);
}

async function loadWastewaterManagers(){
  const [adminRes, roleRes] = await Promise.all([
    sb.from(USERS_TABLE).select('*').eq('role','admin'),
    sb.from(USER_APP_ROLES_TABLE).select('*').eq('app_key','wastewater').order('created_at',{ascending:false})
  ]);

  const adminUsers = Array.isArray(adminRes.data) ? adminRes.data : [];
  const roleRows = Array.isArray(roleRes.data) ? roleRes.data : [];

  const emails = [
    ...adminUsers.map(row => String(row.email || row.user_email || '').trim()),
    ...roleRows.map(row => String(row.email || '').trim())
  ].filter(Boolean);
  const employeeNos = roleRows.map(row => String(row.employee_no || '').trim()).filter(Boolean);

  let employeeRows = [];
  if(emails.length || employeeNos.length){
    const filters = [];
    if(emails.length) filters.push(`email.in.(${[...new Set(emails)].join(',')})`);
    if(employeeNos.length) filters.push(`employee_no.in.(${[...new Set(employeeNos)].join(',')})`);
    try{
      const { data, error } = await sb.from(EMPLOYEES_TABLE).select('*').or(filters.join(','));
      if(error) console.warn('권한 사원정보 매칭 실패:', error);
      employeeRows = Array.isArray(data) ? data : [];
    }catch(error){
      console.warn('권한 사원정보 매칭 건너뜀:', error);
    }
  }

  let signatureMap = new Map();
  if(emails.length){
    const uniqueEmails = [...new Set(emails)];
    const { data: signatureUsers, error: signatureError } = await sb
      .from(USERS_TABLE)
      .select('email,signature_url')
      .in('email', uniqueEmails);
    if(signatureError) console.warn('사인 이미지 조회 실패:', signatureError);
    (Array.isArray(signatureUsers) ? signatureUsers : []).forEach(row => {
      signatureMap.set(String(row.email || '').trim(), row.signature_url || '');
    });
  }

  const findEmployee = (row) => {
    const email = String(row.email || row.user_email || '').trim();
    const employeeNo = String(row.employee_no || row.employeeNo || '').trim();
    return employeeRows.find(emp =>
      (email && String(emp.email || '').trim() === email) ||
      (employeeNo && String(emp.employee_no || '').trim() === employeeNo)
    ) || {};
  };

  const admins = adminUsers.map((userRow) => {
    const email = String(userRow.email || userRow.user_email || '').trim();
    const employee = findEmployee(userRow);
    return {
      employee_no: getEmployeeNo(employee) || userRow.employee_no || userRow.employeeNo || '',
      name: employee.name || userRow.name || userRow.user_name || email || '',
      department: getEmployeeDepartment(employee),
      team: getEmployeeTeam(employee),
      position: employee.position || '',
      email,
      signature_url: signatureMap.get(email) || userRow.signature_url || '',
      role: '관리자',
      created_by: 'users.role=admin',
      created_at: userRow.updated_at || userRow.created_at || employee.updated_at || employee.created_at || '',
      is_admin: true,
      is_active: true
    };
  });

  const toManagerRow = (row, roleLabel) => {
    const email = String(row.email || '').trim();
    const employee = findEmployee(row);
    return {
      id: row.id,
      employee_no: String(row.employee_no || getEmployeeNo(employee) || '').trim(),
      name: row.name || employee.name || email || '',
      department: getEmployeeDepartment(employee),
      team: getEmployeeTeam(employee),
      position: employee.position || '',
      email,
      signature_url: signatureMap.get(email) || '',
      role: roleLabel,
      memo: row.memo || '',
      created_by: '권한관리',
      created_at: row.updated_at || row.created_at || '',
      is_admin: false,
      is_active: true
    };
  };

  const operators = roleRows
    .filter(row => String(row.role_key || '').trim() === 'operator')
    .map(row => toManagerRow(row, '운영자'));

  const approvers = roleRows
    .filter(row => String(row.role_key || '').trim() === 'approver')
    .map(row => toManagerRow(row, '결재자'));

  return {
    data: { admins, operators, approvers },
    errors: { admins: adminRes.error || null, operators: roleRes.error || null, approvers: roleRes.error || null }
  };
}

function buildWastewaterRolePayload(employee, roleKey, memo){
  return {
    employee_no: getEmployeeNo(employee),
    email: getEmployeeEmail(employee),
    name: employee.name || '',
    app_key: 'wastewater',
    role_key: roleKey,
    memo: memo || '',
    updated_at: new Date().toISOString()
  };
}

function addWastewaterOperator(employee, actorName){
  const payload = buildWastewaterRolePayload(employee, 'operator', actorName ? `폐수 운영자 / ${actorName}` : '폐수 운영자');
  return sb
    .from(USER_APP_ROLES_TABLE)
    .upsert(payload, { onConflict: 'employee_no,app_key,role_key' })
    .select('*')
    .maybeSingle();
}

function removeWastewaterOperator(employeeNo, actorName){
  return sb
    .from(USER_APP_ROLES_TABLE)
    .delete()
    .eq('employee_no', employeeNo)
    .eq('app_key', 'wastewater')
    .eq('role_key', 'operator');
}

function addWastewaterApprover(employee, actorName){
  const payload = buildWastewaterRolePayload(employee, 'approver', actorName ? `폐수 결재자 / ${actorName}` : '폐수 결재자');
  return sb
    .from(USER_APP_ROLES_TABLE)
    .upsert(payload, { onConflict: 'employee_no,app_key,role_key' })
    .select('*')
    .maybeSingle();
}

function removeWastewaterApprover(employeeNo, actorName){
  return sb
    .from(USER_APP_ROLES_TABLE)
    .delete()
    .eq('employee_no', employeeNo)
    .eq('app_key', 'wastewater')
    .eq('role_key', 'approver');
}


function saveRelatedDocument(existingId,payload){
  if(existingId) return scopedCompanyQuery(sb.from(REFERENCE_TABLE).update(payload).eq('id', existingId)).select('*').maybeSingle();
  return sb.from(REFERENCE_TABLE).insert([withCompanyPayload(payload)]).select('*').maybeSingle();
}

function deleteRelatedDocumentById(id){
  return scopedCompanyQuery(sb.from(REFERENCE_TABLE).delete().eq('id', id));
}

function getTenantStoragePath(path){
  const companyId=getWastewaterCompanyId();
  const clean=String(path||'').replace(/^\/+/, '');
  if(!companyId) return clean;
  if(clean.startsWith(`companies/${companyId}/`)) return clean;
  return `companies/${companyId}/${clean}`;
}

async function uploadRelatedDocFile(file,path){
  return sb.storage.from(RELATED_DOC_BUCKET).upload(getTenantStoragePath(path),file,{cacheControl:'3600',upsert:true});
}

function getRelatedDocPublicUrl(path){
  return sb.storage.from(RELATED_DOC_BUCKET).getPublicUrl(getTenantStoragePath(path));
}

async function deleteRelatedDocFile(path){
  return sb.storage.from(RELATED_DOC_BUCKET).remove([getTenantStoragePath(path)]);
}

async function logActivity(actorEmail,action,targetType,targetId,details){
  return sb.from(LOG_TABLE).insert([withCompanyPayload({actor_email:actorEmail||'unknown',action,target_type:targetType,target_id:String(targetId||''),details:JSON.stringify(details||{})})]);
}

async function logApprovalAction(actorEmail,monthKey,action,reason=''){
  return sb.from(APPROVAL_LOG_TABLE).insert([withCompanyPayload({month_key:monthKey,actor_email:actorEmail||'unknown',action,reason})]);
}

window.WastewaterApi={
  getCompanyId:getWastewaterCompanyId,
  getPortalSession:getWastewaterPortalSession,
  SUPABASE_URL,SUPABASE_KEY,
  DAILY_TABLE,DAILY_VIEW,PICKUP_TABLE,USERS_TABLE,EMPLOYEES_TABLE,WASTEWATER_ROLE_VIEW,WASTEWATER_OPERATORS_TABLE,WASTEWATER_APPROVERS_TABLE,USER_APP_ROLES_TABLE,LOG_TABLE,APPROVAL_TABLE,APPROVAL_LOG_TABLE,REFERENCE_TABLE,RELATED_DOC_BUCKET,CM_LIMIT,TON_TO_CM,MAX_TON_M3,
  getMyRoles,loadCoreData,loadAdminData,loadReferenceData,loadAllData,saveReferenceDoc,deleteReferenceDocById,saveRelatedDocument,deleteRelatedDocumentById,uploadRelatedDocFile,getRelatedDocPublicUrl,deleteRelatedDocFile,insertDailyRow,insertPickupRow,deleteDailyRowById,deletePickupRowById,upsertWriterApproval,updateApprovalByMonth,updateUserRole,approveUserByEmail,deleteUserByEmail,updateUserSignature,getUserSignature,searchEmployees,loadWastewaterManagers,addWastewaterOperator,removeWastewaterOperator,addWastewaterApprover,removeWastewaterApprover,logActivity,logApprovalAction
};
