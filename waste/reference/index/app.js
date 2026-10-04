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

let rows=[],editing=null;
async function load(){const x=await A.list('waste_reference_materials','*','sort_order',true);rows=x.data||[];render();}
function render(){ $('#app').innerHTML=`<div id="notice" class="notice"></div><div class="grid two"><div class="card"><div class="card-title">📚 관련자료 등록</div><form id="form"><div class="field"><label>분류</label><select id="category"><option>환경점검 대응</option><option>Q&A</option><option>운영 매뉴얼</option><option>법령/기준</option><option>기타</option></select></div><div class="field"><label>제목</label><input id="title" required value="${esc(editing?.title||'')}"></div><div class="field"><label>내용</label><textarea id="content" style="min-height:260px">${esc(editing?.content||'')}</textarea></div><div class="field"><label>파일 경로/URL (선택)</label><input id="file_path" value="${esc(editing?.file_path||'')}"></div><button class="btn primary" type="submit">저장</button> ${editing?'<button class="btn" id="cancel" type="button">취소</button>':''}</form></div><div class="card"><div class="card-title">자료 목록</div>${rows.length?rows.map(r=>`<div class="card" style="box-shadow:none"><div class="section-head"><h2>${esc(r.title)}</h2><div class="spacer"></div><span class="pill">${esc(r.category)}</span></div><div class="hint" style="white-space:pre-wrap;color:#344054">${esc((r.content||'').slice(0,350))}${(r.content||'').length>350?'…':''}</div><br><div class="row-actions"><button class="btn small" data-edit="${r.id}">수정</button><button class="btn small danger" data-del="${r.id}">삭제</button>${r.file_path?`<a class="btn small" href="${esc(r.file_path)}" target="_blank" style="text-decoration:none;display:inline-flex;align-items:center">파일</a>`:''}</div></div>`).join(''):'<div class="empty">등록된 관련자료가 없습니다.</div>'}</div></div>`;$('#category').value=editing?.category||'환경점검 대응';$('#form').onsubmit=save;if($('#cancel'))$('#cancel').onclick=()=>{editing=null;render()};document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editing=rows.find(r=>r.id===b.dataset.edit);render()});document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>del(b.dataset.del));}
async function save(e){e.preventDefault();const p={category:$('#category').value,title:$('#title').value,content:$('#content').value,file_path:$('#file_path').value||null};const x=editing?await A.update('waste_reference_materials',editing.id,p):await A.insert('waste_reference_materials',p);if(x.error)return notice(x.error.message,'err');editing=null;await load();notice('저장되었습니다.');}
async function del(id){if(!confirm('삭제하시겠습니까?'))return;const x=await A.remove('waste_reference_materials',id);if(x.error)return notice(x.error.message,'err');await load();}
load();
