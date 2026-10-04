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

let year=String(new Date().getFullYear()),typeFilter='';
async function load(){const [types,daily,cols,opening]=await Promise.all([A.list('waste_types','*','sort_order',true),A.list('waste_daily_entries','*,waste_types(*)','entry_date',false),A.list('waste_collections','*,waste_collection_items(*,waste_types(*))','collection_date',false),A.list('waste_opening_balances','*,waste_types(*)','balance_date',false)]);render((types.data||[]).filter(x=>x.active),daily.data||[],cols.data||[],opening.data||[]);}
function render(types,daily,cols,opening){const yf=r=>String(r.entry_date||r.collection_date||r.balance_date||'').startsWith(year);const d=daily.filter(yf).filter(r=>!typeFilter||r.waste_type_id===typeFilter);const c=cols.filter(yf).map(h=>({...h,waste_collection_items:(h.waste_collection_items||[]).filter(i=>!typeFilter||i.waste_type_id===typeFilter)})).filter(h=>h.waste_collection_items.length);const o=opening.filter(r=>!typeFilter||r.waste_type_id===typeFilter);const genConfirmed=d.filter(r=>r.weight_status==='confirmed').reduce((s,r)=>s+Number(r.weight_kg||0),0);const genUnknown=d.filter(r=>r.weight_status!=='confirmed').length;const collected=c.flatMap(x=>x.waste_collection_items).reduce((s,x)=>s+Number(x.weight_kg||0),0);const openingKg=o.reduce((s,x)=>s+Number(x.weight_kg||0),0);const current=openingKg+genConfirmed-collected;const months=Array.from({length:12},(_,i)=>{const m=String(i+1).padStart(2,'0');const md=d.filter(r=>String(r.entry_date).slice(5,7)===m);const mc=c.filter(r=>String(r.collection_date).slice(5,7)===m);return {m,gen:md.filter(r=>r.weight_status==='confirmed').reduce((s,r)=>s+Number(r.weight_kg||0),0),unknown:md.filter(r=>r.weight_status!=='confirmed').length,col:mc.flatMap(x=>x.waste_collection_items).reduce((s,x)=>s+Number(x.weight_kg||0),0),count:mc.length}});$('#app').innerHTML=`<div class="toolbar"><select id="year" class="btn">${[Number(year)-2,Number(year)-1,Number(year),Number(year)+1].map(y=>`<option ${String(y)===year?'selected':''}>${y}</option>`).join('')}</select><select id="type" class="btn"><option value="">전체 폐기물</option>${types.map(t=>`<option value="${t.id}" ${t.id===typeFilter?'selected':''}>${esc(typeName(t))}</option>`).join('')}</select></div><div class="kpis"><div class="kpi"><div class="label">확정 발생량</div><div class="value">${num(genConfirmed/1000,4)} T</div></div><div class="kpi"><div class="label">처리량</div><div class="value">${num(collected/1000,4)} T</div></div><div class="kpi"><div class="label">확정 기준 현재 보관량</div><div class="value">${num(current/1000,4)} T</div></div><div class="kpi"><div class="label">중량 미확정 발생건</div><div class="value ${genUnknown?'warning':''}">${genUnknown}건</div></div></div><div class="card"><div class="card-title">📊 ${year}년 폐기물 현황</div><div class="hint">중량 미확정 일일입력은 무게 합계에서 제외됩니다. 따라서 '현재 보관량'은 확정 중량 기준입니다.</div><br><div class="table-wrap"><table><thead><tr><th>월</th><th>확정 발생량(T)</th><th>중량 미확정(건)</th><th>수거횟수</th><th>처리량(T)</th></tr></thead><tbody>${months.map(x=>`<tr><td>${Number(x.m)}월</td><td class="num">${num(x.gen/1000,4)}</td><td class="num">${x.unknown}</td><td class="num">${x.count}</td><td class="num">${num(x.col/1000,4)}</td></tr>`).join('')}</tbody></table></div></div>`;$('#year').onchange=e=>{year=e.target.value;load()};$('#type').onchange=e=>{typeFilter=e.target.value;load()};}
load();
