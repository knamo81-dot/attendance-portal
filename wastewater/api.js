const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";
window.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const DAILY_TABLE='wastewater';
const DAILY_VIEW='wastewater_calendar_view';
const PICKUP_TABLE='wastewater_pickups';
const USERS_TABLE='users';
const EMPLOYEES_TABLE='employees';
const WASTEWATER_ROLE_VIEW='wastewater_role_view';
const WASTEWATER_OPERATORS_TABLE='wastewater_operators';
const WASTEWATER_APPROVERS_TABLE='wastewater_approvers';
const LOG_TABLE='activity_logs';
const APPROVAL_TABLE='monthly_approvals';
const APPROVAL_LOG_TABLE='approval_logs';
const REFERENCE_TABLE='reference_docs';
const CM_LIMIT=154;
const TON_TO_CM=22;
const MAX_TON_M3=7;

async function getMyRoles(email){
  const roles = [];
  const targetEmail = String(email || '').trim();
  if(!targetEmail) return roles;

  const pushRole = (role) => {
    if(role && !roles.includes(role)) roles.push(role);
  };

  try{
    const { data, error } = await sb.from(WASTEWATER_ROLE_VIEW).select('role_name').ilike('email', targetEmail);
    if(error){
      console.warn('role view load failed:', error);
    }else{
      (data||[]).forEach(r => pushRole(r.role_name));
    }
  }catch(error){
    console.warn('role view load skipped:', error);
  }

  try{
    const { data: commonUser } = await sb.from(USERS_TABLE).select('email,role').ilike('email', targetEmail).maybeSingle();
    if(String(commonUser?.role || '').trim() === 'admin') pushRole('wastewater_admin');
  }catch(error){
    console.warn('common admin role load skipped:', error);
  }

  try{
    const { data: employee } = await sb.from(EMPLOYEES_TABLE).select('employee_no,email').ilike('email', targetEmail).maybeSingle();
    const employeeNo = employee?.employee_no;
    if(employeeNo){
      const { data: op } = await sb.from(WASTEWATER_OPERATORS_TABLE).select('employee_no,is_active').eq('employee_no', employeeNo).eq('is_active', true).maybeSingle();
      if(op) pushRole('wastewater_operator');
      const { data: ap } = await sb.from(WASTEWATER_APPROVERS_TABLE).select('employee_no,is_active').eq('employee_no', employeeNo).eq('is_active', true).maybeSingle();
      if(ap) pushRole('wastewater_approver');
    }
  }catch(error){
    console.warn('wastewater dedicated role load skipped:', error);
  }

  return roles;
}

function loadAllData(includeAdmin){
  return Promise.all([
    sb.from(DAILY_VIEW).select('*').order('date',{ascending:false}).order('created_at',{ascending:false}),
    sb.from(PICKUP_TABLE).select('*').order('pickup_date',{ascending:false}).order('created_at',{ascending:false}),
    includeAdmin?sb.from(WASTEWATER_ROLE_VIEW).select('email,role_name').order('email',{ascending:true}):Promise.resolve({data:[]}),
    includeAdmin?sb.from(LOG_TABLE).select('*').order('created_at',{ascending:false}).limit(200):Promise.resolve({data:[]}),
    sb.from(APPROVAL_TABLE).select('*').order('month_key',{ascending:false}),
    sb.from(REFERENCE_TABLE).select('*').order('doc_key',{ascending:true})
  ]);
}

function saveReferenceDoc(existingId,payload){
  if(existingId) return sb.from(REFERENCE_TABLE).update(payload).eq('id', existingId);
  return sb.from(REFERENCE_TABLE).insert([payload]);
}

function deleteReferenceDocById(id){
  return sb.from(REFERENCE_TABLE).delete().eq('id', id);
}

function insertDailyRow(payload){
  return sb.from(DAILY_TABLE).insert([payload]).select().single();
}

function insertPickupRow(payload){
  return sb.from(PICKUP_TABLE).insert([payload]).select().single();
}

function deleteDailyRowById(id){ return sb.from(DAILY_TABLE).delete().eq('id',id); }
function deletePickupRowById(id){ return sb.from(PICKUP_TABLE).delete().eq('id',id); }

function upsertWriterApproval(monthKey,payload,rowExists){
  if(rowExists) return sb.from(APPROVAL_TABLE).update(payload).eq('month_key', monthKey);
  return sb.from(APPROVAL_TABLE).insert([payload]);
}

function updateApprovalByMonth(monthKey,payload){
  return sb.from(APPROVAL_TABLE).update(payload).eq('month_key',monthKey);
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
  const [adminRes, operatorRes, approverRes] = await Promise.all([
    sb.from(USERS_TABLE).select('*').eq('role','admin'),
    sb.from(WASTEWATER_OPERATORS_TABLE).select('*').eq('is_active', true).order('created_at',{ascending:false}),
    sb.from(WASTEWATER_APPROVERS_TABLE).select('*').eq('is_active', true).order('created_at',{ascending:false})
  ]);

  let adminEmployees = [];
  const adminUsers = Array.isArray(adminRes.data) ? adminRes.data : [];
  const adminEmails = adminUsers.map(row => String(row.email || row.user_email || '').trim()).filter(Boolean);

  if(adminEmails.length){
    const { data: employeeRows, error: employeeError } = await sb.from(EMPLOYEES_TABLE).select('*').in('email', adminEmails);
    if(employeeError) console.warn('관리자 사원정보 매칭 실패:', employeeError);
    adminEmployees = Array.isArray(employeeRows) ? employeeRows : [];
  }

  const signatureEmails = [
    ...adminUsers.map(row => String(row.email || row.user_email || '').trim()),
    ...(Array.isArray(operatorRes.data) ? operatorRes.data : []).map(row => String(row.email || '').trim()),
    ...(Array.isArray(approverRes.data) ? approverRes.data : []).map(row => String(row.email || '').trim())
  ].filter(Boolean);

  let signatureMap = new Map();
  if(signatureEmails.length){
    const uniqueEmails = [...new Set(signatureEmails)];
    const { data: signatureUsers, error: signatureError } = await sb
      .from(USERS_TABLE)
      .select('email,signature_url')
      .in('email', uniqueEmails);
    if(signatureError) console.warn('사인 이미지 조회 실패:', signatureError);
    (Array.isArray(signatureUsers) ? signatureUsers : []).forEach(row => {
      signatureMap.set(String(row.email || '').trim(), row.signature_url || '');
    });
  }

  const admins = adminUsers.map((userRow) => {
    const email = String(userRow.email || userRow.user_email || '').trim();
    const employee = adminEmployees.find(emp => String(emp.email || '').trim() === email) || {};
    return {
      employee_no: getEmployeeNo(employee) || userRow.employee_no || userRow.employeeNo || '',
      name: employee.name || userRow.name || userRow.user_name || email || '',
      department: getEmployeeDepartment(employee),
      team: getEmployeeTeam(employee),
      position: employee.position || '',
      email,
      signature_url: signatureMap.get(email) || userRow.signature_url || '',
      role: '관리자',
      created_by: '사원정보',
      created_at: userRow.updated_at || userRow.created_at || employee.updated_at || employee.created_at || '',
      is_admin: true,
      is_active: true
    };
  });

  const operators = (Array.isArray(operatorRes.data) ? operatorRes.data : []).map(row => ({
    ...row,
    signature_url: signatureMap.get(String(row.email || '').trim()) || row.signature_url || ''
  }));

  const approvers = (Array.isArray(approverRes.data) ? approverRes.data : []).map(row => ({
    ...row,
    signature_url: signatureMap.get(String(row.email || '').trim()) || row.signature_url || ''
  }));

  return {
    data: {
      admins,
      operators,
      approvers
    },
    errors: {
      admins: adminRes.error || null,
      operators: operatorRes.error || null,
      approvers: approverRes.error || null
    }
  };
}

function buildWastewaterRolePayload(employee, roleLabel, actorName){
  return {
    employee_no: getEmployeeNo(employee),
    name: employee.name || '',
    department: getEmployeeDepartment(employee),
    team: getEmployeeTeam(employee),
    position: employee.position || '',
    email: getEmployeeEmail(employee),
    role: roleLabel,
    is_active: true,
    created_by: actorName || '',
    updated_by: actorName || '',
    updated_at: new Date().toISOString()
  };
}

function addWastewaterOperator(employee, actorName){
  const payload = buildWastewaterRolePayload(employee, '운영자', actorName);
  return sb
    .from(WASTEWATER_OPERATORS_TABLE)
    .upsert(payload, { onConflict: 'employee_no' })
    .select('*')
    .maybeSingle();
}

function removeWastewaterOperator(employeeNo, actorName){
  return sb
    .from(WASTEWATER_OPERATORS_TABLE)
    .update({ is_active:false, updated_by:actorName || '', updated_at:new Date().toISOString() })
    .eq('employee_no', employeeNo)
    .select('*')
    .maybeSingle();
}

function addWastewaterApprover(employee, actorName){
  const payload = buildWastewaterRolePayload(employee, '결재자', actorName);
  return sb
    .from(WASTEWATER_APPROVERS_TABLE)
    .upsert(payload, { onConflict: 'employee_no' })
    .select('*')
    .maybeSingle();
}

function removeWastewaterApprover(employeeNo, actorName){
  return sb
    .from(WASTEWATER_APPROVERS_TABLE)
    .update({ is_active:false, updated_by:actorName || '', updated_at:new Date().toISOString() })
    .eq('employee_no', employeeNo)
    .select('*')
    .maybeSingle();
}


function loadRelatedDocuments(){
  return sb.from(REFERENCE_TABLE)
    .select('*')
    .like('doc_key','related_%')
    .order('updated_at',{ascending:false});
}

function saveRelatedDocument(existingId,payload){
  if(existingId) return sb.from(REFERENCE_TABLE).update(payload).eq('id', existingId).select('*').maybeSingle();
  return sb.from(REFERENCE_TABLE).insert([payload]).select('*').maybeSingle();
}

function deleteRelatedDocumentById(id){
  return sb.from(REFERENCE_TABLE).delete().eq('id', id);
}

async function logActivity(actorEmail,action,targetType,targetId,details){
  return sb.from(LOG_TABLE).insert([{actor_email:actorEmail||'unknown',action,target_type:targetType,target_id:String(targetId||''),details:JSON.stringify(details||{})}]);
}

async function logApprovalAction(actorEmail,monthKey,action,reason=''){
  return sb.from(APPROVAL_LOG_TABLE).insert([{month_key:monthKey,actor_email:actorEmail||'unknown',action,reason}]);
}

window.WastewaterApi={
  SUPABASE_URL,SUPABASE_KEY,
  DAILY_TABLE,DAILY_VIEW,PICKUP_TABLE,USERS_TABLE,EMPLOYEES_TABLE,WASTEWATER_ROLE_VIEW,WASTEWATER_OPERATORS_TABLE,WASTEWATER_APPROVERS_TABLE,LOG_TABLE,APPROVAL_TABLE,APPROVAL_LOG_TABLE,REFERENCE_TABLE,CM_LIMIT,TON_TO_CM,MAX_TON_M3,
  getMyRoles,loadAllData,saveReferenceDoc,deleteReferenceDocById,loadRelatedDocuments,saveRelatedDocument,deleteRelatedDocumentById,insertDailyRow,insertPickupRow,deleteDailyRowById,deletePickupRowById,upsertWriterApproval,updateApprovalByMonth,updateUserRole,approveUserByEmail,deleteUserByEmail,updateUserSignature,getUserSignature,searchEmployees,loadWastewaterManagers,addWastewaterOperator,removeWastewaterOperator,addWastewaterApprover,removeWastewaterApprover,logActivity,logApprovalAction
};
