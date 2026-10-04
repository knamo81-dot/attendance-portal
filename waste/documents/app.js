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

let rows=[],vendors=[],editing=null;
async function load(){const [d,v]=await Promise.all([A.list('waste_documents','*,waste_vendors(*)','expiry_date',true),A.list('waste_vendors','*','vendor_name',true)]);rows=d.data||[];vendors=(v.data||[]).filter(x=>x.active);render();}
function render(){ $('#app').innerHTML=`<div id="notice" class="notice"></div><div class="grid two"><div class="card"><div class="card-title">📁 관련서류 등록</div><div class="hint">v0.1에서는 파일 경로/URL을 저장합니다. Supabase Storage 업로드는 bucket 정책 확인 후 다음 단계에서 연결합니다.</div><br><form id="form"><div class="field"><label>문서종류</label><select id="document_type"><option>사업자등록증</option><option>폐기물 처리업 허가증</option><option>폐기물 수집운반업 허가증</option><option>위탁계약서</option><option>교육확인서</option><option>인증서</option><option>기타</option></select></div><div class="field"><label>제목</label><input id="title" required value="${esc(editing?.title||'')}"></div><div class="field"><label>관련 업체</label><select id="vendor_id"><option value="">없음</option>${vendors.map(v=>`<option value="${v.id}">${esc(v.vendor_name)}</option>`).join('')}</select></div><div class="inline"><div class="field"><label>발급일</label><input id="issue_date" type="date" value="${editing?.issue_date||''}"></div><div class="field"><label>유효기간</label><input id="expiry_date" type="date" value="${editing?.expiry_date||''}"></div></div><div class="field"><label>파일 경로/URL</label><input id="file_path" value="${esc(editing?.file_path||'')}"></div><div class="field"><label>비고</label><textarea id="note">${esc(editing?.note||'')}</textarea></div><button class="btn primary" type="submit">저장</button> ${editing?'<button class="btn" id="cancel" type="button">취소</button>':''}</form></div><div class="card"><div class="card-title">관련서류 목록</div><div class="table-wrap"><table><thead><tr><th>종류</th><th>제목</th><th>업체</th><th>발급일</th><th>유효기간</th><th>파일</th><th>관리</th></tr></thead><tbody>${rows.length?rows.map(r=>{const exp=r.expiry_date&&new Date(r.expiry_date)<new Date();return `<tr><td>${esc(r.document_type)}</td><td>${esc(r.title)}</td><td>${esc(r.waste_vendors?.vendor_name||'-')}</td><td>${r.issue_date||'-'}</td><td class="${exp?'warning':''}">${r.expiry_date||'-'}</td><td>${r.file_path?`<a href="${esc(r.file_path)}" target="_blank">열기</a>`:'-'}</td><td><div class="row-actions"><button class="btn small" data-edit="${r.id}">수정</button><button class="btn small danger" data-del="${r.id}">삭제</button></div></td></tr>`}).join(''):`<tr><td colspan="7" class="empty">등록된 관련서류가 없습니다.</td></tr>`}</tbody></table></div></div></div>`;$('#document_type').value=editing?.document_type||'사업자등록증';$('#vendor_id').value=editing?.vendor_id||'';$('#form').onsubmit=save;if($('#cancel'))$('#cancel').onclick=()=>{editing=null;render()};document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editing=rows.find(r=>r.id===b.dataset.edit);render()});document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>del(b.dataset.del));}
async function save(e){e.preventDefault();const p={document_type:$('#document_type').value,title:$('#title').value,vendor_id:$('#vendor_id').value||null,issue_date:$('#issue_date').value||null,expiry_date:$('#expiry_date').value||null,file_path:$('#file_path').value||null,note:$('#note').value};const x=editing?await A.update('waste_documents',editing.id,p):await A.insert('waste_documents',p);if(x.error)return notice(x.error.message,'err');editing=null;await load();notice('저장되었습니다.');}
async function del(id){if(!confirm('삭제하시겠습니까?'))return;const x=await A.remove('waste_documents',id);if(x.error)return notice(x.error.message,'err');await load();}
load();
