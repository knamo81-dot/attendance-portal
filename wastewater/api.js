const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";
window.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const DAILY_TABLE='wastewater';
const DAILY_VIEW='wastewater_calendar_view';
const PICKUP_TABLE='wastewater_pickups';
const USERS_TABLE='users';
const WASTEWATER_ROLE_VIEW='wastewater_role_view';
const LOG_TABLE='activity_logs';
const APPROVAL_TABLE='monthly_approvals';
const APPROVAL_LOG_TABLE='approval_logs';
const REFERENCE_TABLE='reference_docs';
const CM_LIMIT=154;
const TON_TO_CM=22;
const MAX_TON_M3=7;

async function getMyRoles(email){
  const { data, error } = await sb.from(WASTEWATER_ROLE_VIEW).select('role_name').ilike('email', email);
  if(error){
    console.error('role load failed:', error);
    return [];
  }
  return (data||[]).map(r => r.role_name).filter(Boolean);
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
function updateUserSignature(email,signatureUrl){ return sb.from(USERS_TABLE).update({signature_url:signatureUrl}).eq('email',email); }

async function logActivity(actorEmail,action,targetType,targetId,details){
  return sb.from(LOG_TABLE).insert([{actor_email:actorEmail||'unknown',action,target_type:targetType,target_id:String(targetId||''),details:JSON.stringify(details||{})}]);
}

async function logApprovalAction(actorEmail,monthKey,action,reason=''){
  return sb.from(APPROVAL_LOG_TABLE).insert([{month_key:monthKey,actor_email:actorEmail||'unknown',action,reason}]);
}

window.WastewaterApi={
  SUPABASE_URL,SUPABASE_KEY,
  DAILY_TABLE,DAILY_VIEW,PICKUP_TABLE,USERS_TABLE,WASTEWATER_ROLE_VIEW,LOG_TABLE,APPROVAL_TABLE,APPROVAL_LOG_TABLE,REFERENCE_TABLE,CM_LIMIT,TON_TO_CM,MAX_TON_M3,
  getMyRoles,loadAllData,saveReferenceDoc,deleteReferenceDocById,insertDailyRow,insertPickupRow,deleteDailyRowById,deletePickupRowById,upsertWriterApproval,updateApprovalByMonth,updateUserRole,approveUserByEmail,deleteUserByEmail,updateUserSignature,logActivity,logApprovalAction
};
