const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

(function(){
  function portalSession(){
    try{ if(window.parent && window.parent!==window && typeof window.parent.getPortalSession==='function') return window.parent.getPortalSession()||{}; }catch(e){}
    try{ if(window.parent && window.parent!==window && window.parent.portalSession) return window.parent.portalSession||{}; }catch(e){}
    return window.portalSession||window.currentPortalSession||{};
  }
  function rawClient(){
    const s=portalSession();
    if(s && s.supabase) return s.supabase;
    try{ if(window.parent && window.parent!==window && window.parent.portalSupabase) return window.parent.portalSupabase; }catch(e){}
    if(window.portalSupabase) return window.portalSupabase;
    if(window.supabase && typeof window.supabase.createClient==='function'){
      window.portalSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
      return window.portalSupabase;
    }
    throw new Error('Supabase client 초기화 실패');
  }
  function companyId(){
    const s=portalSession();
    const c=s.activeCompany||s.active_company||s.selectedCompany||s.company||{};
    const v=s.activeCompanyId||s.active_company_id||s.selectedCompanyId||s.selected_company_id||c.id||c.company_id||s.companyId||s.company_id||s.profile?.company_id||window.currentCompanyId||'';
    if(v) return String(v).trim();
    try{ const p=new URLSearchParams(location.search); return String(p.get('company_id')||p.get('companyId')||'').trim(); }catch(e){ return ''; }
  }
  function userEmail(){ const s=portalSession(); return String(s.email||s.user?.email||s.profile?.email||'').trim(); }
  const sb=rawClient();
  async function list(table, select='*', orderCol='created_at', ascending=false){
    let q=sb.from(table).select(select); const cid=companyId(); if(cid) q=q.eq('company_id',cid); if(orderCol) q=q.order(orderCol,{ascending}); return q;
  }
  async function insert(table,payload){ const cid=companyId(); const row={...payload, company_id:payload.company_id||cid, created_by:payload.created_by||userEmail()||null}; return sb.from(table).insert([row]).select('*').single(); }
  async function update(table,id,payload){ let q=sb.from(table).update(payload).eq('id',id); const cid=companyId(); if(cid) q=q.eq('company_id',cid); return q.select('*').single(); }
  async function remove(table,id){ let q=sb.from(table).delete().eq('id',id); const cid=companyId(); if(cid) q=q.eq('company_id',cid); return q; }
  async function selectById(table,id){ let q=sb.from(table).select('*').eq('id',id); const cid=companyId(); if(cid) q=q.eq('company_id',cid); return q.maybeSingle(); }
  window.wasteApi={sb,portalSession,companyId,userEmail,list,insert,update,remove,selectById};
})();
const A=window.wasteApi;
const $=(s)=>document.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const num=(v,d=2)=>Number(v||0).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
const kgToT=(kg)=>Number(kg||0)/1000;
function notice(msg,type='ok'){const el=$('#notice');if(!el)return;el.textContent=msg;el.className='notice show '+type;setTimeout(()=>el.classList.remove('show'),3500)}
function typeName(r){return r.display_name||`${r.legal_name}${r.physical_state==='liquid'?'(액상)':r.physical_state==='solid'?'(고상)':''}`}
function dateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

let editing=null, types=[],locs=[],units=[],rows=[];
async function load(){const [t,l,u,d]=await Promise.all([A.list('waste_types','*','sort_order',true),A.list('waste_storage_locations','*','sort_order',true),A.list('waste_container_units','*','sort_order',true),A.list('waste_daily_entries','*,waste_types(*),waste_storage_locations(*),waste_container_units(*)','entry_date',false)]);types=(t.data||[]).filter(x=>x.active);locs=(l.data||[]).filter(x=>x.active);units=(u.data||[]).filter(x=>x.active);rows=d.data||[];render();}
function render(){ $('#app').innerHTML=`<div id="notice" class="notice"></div><div class="grid two"><div class="card"><div class="card-title">🗓 폐기물 일일입력</div><div class="hint">발생 시 실제 무게를 모르면 중량을 비워두고 '미확인'으로 저장할 수 있습니다.</div><br><form id="form"><div class="field"><label>발생일</label><input id="entry_date" type="date" value="${editing?.entry_date||dateKey()}" required></div><div class="field"><label>폐기물 종류</label><select id="waste_type_id" required>${types.map(x=>`<option value="${x.id}" ${editing?.waste_type_id===x.id?'selected':''}>${esc(typeName(x))}</option>`).join('')}</select></div><div class="inline"><div class="field"><label>용기·단위</label><select id="container_unit_id"><option value="">선택 안함</option>${units.map(x=>`<option value="${x.id}" ${editing?.container_unit_id===x.id?'selected':''}>${esc(x.unit_name)}</option>`).join('')}</select></div><div class="field"><label>수량</label><input id="quantity" type="number" min="0" step="0.001" value="${editing?.quantity??1}" required></div></div><div class="inline"><div class="field"><label>발생중량(kg)</label><input id="weight_kg" type="number" min="0" step="0.001" value="${editing?.weight_kg??''}" placeholder="모르면 공란"></div><div class="field"><label>중량 상태</label><select id="weight_status"><option value="unknown">미확인</option><option value="estimated">추정</option><option value="confirmed">확정</option></select></div></div><div class="field"><label>보관장소</label><select id="storage_location_id"><option value="">선택 안함</option>${locs.map(x=>`<option value="${x.id}" ${editing?.storage_location_id===x.id?'selected':''}>${esc(x.location_name)}</option>`).join('')}</select></div><div class="field"><label>기타사항</label><textarea id="note">${esc(editing?.note||'')}</textarea></div><button class="btn primary" type="submit">${editing?'수정 저장':'발생 등록'}</button> ${editing?'<button class="btn" type="button" id="cancel">취소</button>':''}</form></div><div class="card"><div class="section-head"><h2>일일입력 현황</h2><div class="spacer"></div><span class="hint">최근 순</span></div><div class="table-wrap"><table><thead><tr><th>발생일</th><th>폐기물</th><th>용기</th><th>수량</th><th>중량</th><th>보관장소</th><th>비고</th><th>관리</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${r.entry_date}</td><td>${esc(typeName(r.waste_types||{}))}</td><td>${esc(r.waste_container_units?.unit_name||'-')}</td><td class="num">${num(r.quantity,0)}</td><td class="num">${r.weight_kg==null?'<span class="pill amber">미확인</span>':`${num(r.weight_kg,3)} kg <span class="pill ${r.weight_status==='confirmed'?'green':'amber'}">${r.weight_status==='confirmed'?'확정':'추정'}</span>`}</td><td>${esc(r.waste_storage_locations?.location_name||'-')}</td><td>${esc(r.note||'')}</td><td><div class="row-actions"><button class="btn small" data-edit="${r.id}">수정</button><button class="btn small danger" data-del="${r.id}">삭제</button></div></td></tr>`).join(''):`<tr><td colspan="8" class="empty">등록된 발생기록이 없습니다.</td></tr>`}</tbody></table></div></div></div>`; if(editing)$('#weight_status').value=editing.weight_status||'unknown';$('#form').onsubmit=save;if($('#cancel'))$('#cancel').onclick=()=>{editing=null;render()};document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editing=rows.find(r=>r.id===b.dataset.edit);render()});document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>del(b.dataset.del));}
async function save(e){e.preventDefault();const w=$('#weight_kg').value;let status=$('#weight_status').value;if(w==='')status='unknown';const p={entry_date:$('#entry_date').value,waste_type_id:$('#waste_type_id').value,container_unit_id:$('#container_unit_id').value||null,quantity:Number($('#quantity').value||0),weight_kg:w===''?null:Number(w),weight_status:status,storage_location_id:$('#storage_location_id').value||null,note:$('#note').value};const x=editing?await A.update('waste_daily_entries',editing.id,p):await A.insert('waste_daily_entries',p);if(x.error)return notice(x.error.message,'err');editing=null;await load();notice('저장되었습니다.');}
async function del(id){if(!confirm('이 발생기록을 삭제하시겠습니까?'))return;const x=await A.remove('waste_daily_entries',id);if(x.error)return notice(x.error.message,'err');await load();notice('삭제되었습니다.');}
load();
