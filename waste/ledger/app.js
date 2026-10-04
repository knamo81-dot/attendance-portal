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

let year=String(new Date().getFullYear()),typeId='';
async function load(){const [types,daily,cols]=await Promise.all([A.list('waste_types','*','sort_order',true),A.list('waste_daily_entries','*,waste_types(*)','entry_date',true),A.list('waste_collections','*,processor:waste_vendors!waste_collections_processor_vendor_id_fkey(*),transporter:waste_vendors!waste_collections_transporter_vendor_id_fkey(*),waste_collection_items(*,waste_types(*))','collection_date',true)]);const ts=(types.data||[]).filter(x=>x.active);if(!typeId&&ts.length)typeId=ts[0].id;render(ts,daily.data||[],cols.data||[]);}
function render(types,daily,cols){const t=types.find(x=>x.id===typeId)||{};const ds=daily.filter(r=>r.waste_type_id===typeId&&String(r.entry_date).startsWith(year));const cs=cols.filter(r=>String(r.collection_date).startsWith(year)).map(h=>({...h,item:(h.waste_collection_items||[]).find(i=>i.waste_type_id===typeId)})).filter(h=>h.item);const byDate=new Map();for(const d of ds){const x=byDate.get(d.entry_date)||{date:d.entry_date,gens:[],cols:[]};x.gens.push(d);byDate.set(d.entry_date,x)}for(const c of cs){const x=byDate.get(c.collection_date)||{date:c.collection_date,gens:[],cols:[]};x.cols.push(c);byDate.set(c.collection_date,x)}let genCum=0,colCum=0;const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>{const gkg=x.gens.filter(r=>r.weight_status==='confirmed').reduce((s,r)=>s+Number(r.weight_kg||0),0),unknown=x.gens.some(r=>r.weight_status!=='confirmed');const ckg=x.cols.reduce((s,r)=>s+Number(r.item.weight_kg||0),0);genCum+=gkg;colCum+=ckg;return {...x,gkg,ckg,unknown,genCum,colCum,balance:genCum-colCum}});$('#app').innerHTML=`<div class="toolbar"><select id="year" class="btn">${[Number(year)-2,Number(year)-1,Number(year),Number(year)+1].map(y=>`<option ${String(y)===year?'selected':''}>${y}</option>`).join('')}</select><select id="type" class="btn">${types.map(x=>`<option value="${x.id}" ${x.id===typeId?'selected':''}>${esc(typeName(x))}</option>`).join('')}</select><div class="spacer"></div><button class="btn primary" id="print">인쇄</button></div><div class="card"><div class="section-head"><h2>사업장 폐기물 관리대장</h2><div class="spacer"></div><span class="hint">단위: 톤(T)</span></div><div class="hint">① 폐기물의 종류: <b>${esc(typeName(t))}</b> · 일일입력 및 수거등록 데이터를 기반으로 자동 작성</div><br><div class="table-wrap"><table style="min-width:1250px"><thead><tr><th colspan="4">② 발생내용</th><th colspan="3">③ 자가 처리내용</th><th colspan="6">④ 위탁 처리내용</th><th rowspan="2">⑤ 보관량(T)</th></tr><tr><th>연월일</th><th>성질·상태</th><th>발생량(T)</th><th>발생량 누계(T)</th><th>연월일</th><th>처리량(T)</th><th>처리방법</th><th>연월일</th><th>위탁 처리량(T)</th><th>운반자</th><th>처리자</th><th>처리방법</th><th>위탁 누계(T)</th></tr></thead><tbody>${rows.length?rows.map(r=>{const c=r.cols[0];return `<tr><td>${r.date}</td><td>${esc(t.physical_state==='liquid'?'액상':t.physical_state==='solid'?'고상':'')}</td><td class="num">${r.unknown&&r.gkg===0?'<span class="pill amber">미확정</span>':num(r.gkg/1000,4)}</td><td class="num">${num(r.genCum/1000,4)}</td><td>-</td><td>-</td><td>-</td><td>${c?c.collection_date:'-'}</td><td class="num">${r.ckg?num(r.ckg/1000,4):'-'}</td><td>${esc(c?.transporter?.vendor_name||'-')}</td><td>${esc(c?.processor?.vendor_name||'-')}</td><td>${esc(c?.treatment_method||'-')}</td><td class="num">${num(r.colCum/1000,4)}</td><td class="num">${num(r.balance/1000,4)}</td></tr>`}).join(''):`<tr><td colspan="14" class="empty">해당 기간 데이터가 없습니다.</td></tr>`}</tbody></table></div><br><div class="hint warning">※ 발생 시 중량 미확정 건은 법정 관리대장 발생량을 확정할 수 없으므로 '미확정'으로 표시합니다. 수거 시 계량값을 발생일별로 배분하는 운영규칙은 별도 확정 후 적용합니다.</div></div>`;$('#year').onchange=e=>{year=e.target.value;load()};$('#type').onchange=e=>{typeId=e.target.value;load()};$('#print').onclick=()=>window.print();}
load();
