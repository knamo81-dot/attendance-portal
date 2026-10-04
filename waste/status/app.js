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
  window.wasteApi={sb,portalSession,companyId,userEmail,list,insert,update,remove};
})();

const A=window.wasteApi;
const $=(s)=>document.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const num=(v,d=2)=>Number(v||0).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
function typeName(r){return r.display_name||`${r.legal_name}${r.physical_state==='liquid'?'(액상)':r.physical_state==='solid'?'(고상)':''}`}
function dateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function notice(msg,type='ok'){const el=$('#notice');if(!el)return;el.textContent=msg;el.className='notice show '+type;setTimeout(()=>el.classList.remove('show'),3500)}

let screenMode='status';
let year=String(new Date().getFullYear());
let typeFilter='';
let settingsTab='types';

const settingsConfigs={
  types:{table:'waste_types',title:'폐기물 종류',fields:[['legal_name','폐기물명','text'],['physical_state','성상','select',['liquid:액상','solid:고상','mixed:혼합','other:기타']],['legal_code','법정코드','text'],['default_quantity_unit','기본 수량단위','text'],['sort_order','순서','number']]},
  vendors:{table:'waste_vendors',title:'업체',fields:[['vendor_name','업체명','text'],['business_no','사업자번호','text'],['permit_no','허가번호','text'],['contact_name','담당자','text'],['phone','연락처','text']]},
  locations:{table:'waste_storage_locations',title:'보관장소',fields:[['location_name','보관장소명','text'],['description','설명','text'],['max_weight_kg','최대보관량(kg)','number'],['sort_order','순서','number']]},
  units:{table:'waste_container_units',title:'용기·단위',fields:[['unit_name','용기명','text'],['quantity_unit','수량단위','text'],['capacity_l','용량(L)','number'],['sort_order','순서','number']]},
  opening:{table:'waste_opening_balances',title:'기초·이월량',fields:[]}
};

async function renderStatus(){
  const [types,daily,cols,opening]=await Promise.all([
    A.list('waste_types','*','sort_order',true),
    A.list('waste_daily_entries','*,waste_types(*)','entry_date',false),
    A.list('waste_collections','*,waste_collection_items(*,waste_types(*))','collection_date',false),
    A.list('waste_opening_balances','*,waste_types(*)','balance_date',false)
  ]);
  const activeTypes=(types.data||[]).filter(x=>x.active);
  const yf=r=>String(r.entry_date||r.collection_date||r.balance_date||'').startsWith(year);
  const d=(daily.data||[]).filter(yf).filter(r=>!typeFilter||r.waste_type_id===typeFilter);
  const c=(cols.data||[]).filter(yf).map(h=>({...h,waste_collection_items:(h.waste_collection_items||[]).filter(i=>!typeFilter||i.waste_type_id===typeFilter)})).filter(h=>h.waste_collection_items.length);
  const o=(opening.data||[]).filter(r=>!typeFilter||r.waste_type_id===typeFilter);
  const genConfirmed=d.filter(r=>r.weight_status==='confirmed').reduce((s,r)=>s+Number(r.weight_kg||0),0);
  const genUnknown=d.filter(r=>r.weight_status!=='confirmed').length;
  const collected=c.flatMap(x=>x.waste_collection_items).reduce((s,x)=>s+Number(x.weight_kg||0),0);
  const openingKg=o.reduce((s,x)=>s+Number(x.weight_kg||0),0);
  const current=openingKg+genConfirmed-collected;
  const months=Array.from({length:12},(_,i)=>{const m=String(i+1).padStart(2,'0');const md=d.filter(r=>String(r.entry_date).slice(5,7)===m);const mc=c.filter(r=>String(r.collection_date).slice(5,7)===m);return {m,gen:md.filter(r=>r.weight_status==='confirmed').reduce((s,r)=>s+Number(r.weight_kg||0),0),unknown:md.filter(r=>r.weight_status!=='confirmed').length,col:mc.flatMap(x=>x.waste_collection_items).reduce((s,x)=>s+Number(x.weight_kg||0),0),count:mc.length}});
  $('#app').innerHTML=`
    <div id="notice" class="notice"></div>
    <div class="toolbar">
      <select id="year" class="btn">${[Number(year)-2,Number(year)-1,Number(year),Number(year)+1].map(y=>`<option ${String(y)===year?'selected':''}>${y}</option>`).join('')}</select>
      <select id="type" class="btn"><option value="">전체 폐기물</option>${activeTypes.map(t=>`<option value="${t.id}" ${t.id===typeFilter?'selected':''}>${esc(typeName(t))}</option>`).join('')}</select>
      <span class="spacer"></span><button id="open-settings" class="btn">⚙ 설정</button>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="label">확정 발생량</div><div class="value">${num(genConfirmed/1000,4)} T</div></div>
      <div class="kpi"><div class="label">처리량</div><div class="value">${num(collected/1000,4)} T</div></div>
      <div class="kpi"><div class="label">확정 기준 현재 보관량</div><div class="value">${num(current/1000,4)} T</div></div>
      <div class="kpi"><div class="label">중량 미확정 발생건</div><div class="value ${genUnknown?'warning':''}">${genUnknown}건</div></div>
    </div>
    <div class="card"><div class="card-title">📊 ${year}년 폐기물 현황</div><div class="hint">중량 미확정 일일입력은 무게 합계에서 제외됩니다. 따라서 현재 보관량은 확정 중량 기준입니다.</div><br>
      <div class="table-wrap"><table><thead><tr><th>월</th><th>확정 발생량(T)</th><th>중량 미확정(건)</th><th>수거횟수</th><th>처리량(T)</th></tr></thead><tbody>${months.map(x=>`<tr><td>${Number(x.m)}월</td><td class="num">${num(x.gen/1000,4)}</td><td class="num">${x.unknown}</td><td class="num">${x.count}</td><td class="num">${num(x.col/1000,4)}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
  $('#year').onchange=e=>{year=e.target.value;renderStatus()};
  $('#type').onchange=e=>{typeFilter=e.target.value;renderStatus()};
  $('#open-settings').onclick=()=>{screenMode='settings';renderSettings();};
}

function settingsFieldHtml(f){
  const [id,label,type,opts]=f;
  if(type==='select') return `<div class="field"><label>${label}</label><select id="${id}">${opts.map(x=>{const [v,t]=x.split(':');return `<option value="${v}">${t}</option>`}).join('')}</select></div>`;
  return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" ${['legal_name','vendor_name','location_name','unit_name'].includes(id)?'required':''}></div>`;
}

async function loadSettingsBase(){
  const [types,locs,units]=await Promise.all([
    A.list('waste_types','*','sort_order',true),
    A.list('waste_storage_locations','*','sort_order',true),
    A.list('waste_container_units','*','sort_order',true)
  ]);
  return {types:types.data||[],locs:locs.data||[],units:units.data||[]};
}

async function renderSettings(){
  $('#app').innerHTML=`<div id="notice" class="notice"></div><div class="toolbar"><button id="back-status" class="btn">← 폐기물현황</button><span class="spacer"></span></div><div class="subtabs">${Object.entries(settingsConfigs).map(([k,v])=>`<button data-setting-tab="${k}" class="${k===settingsTab?'active':''}">${v.title}</button>`).join('')}</div><div id="settings-body"></div>`;
  $('#back-status').onclick=()=>{screenMode='status';renderStatus();};
  document.querySelectorAll('[data-setting-tab]').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.settingTab;renderSettings();});
  if(settingsTab==='opening') return renderOpeningSettings();
  const c=settingsConfigs[settingsTab];
  const ordered=['types','locations','units'].includes(settingsTab);
  const res=await A.list(c.table,'*',ordered?'sort_order':'created_at',ordered);
  const rows=res.data||[];
  $('#settings-body').innerHTML=`<div class="grid two"><div class="card"><div class="card-title">⚙ ${c.title} 설정</div><form id="settings-form"><input type="hidden" id="edit-id">${c.fields.map(settingsFieldHtml).join('')}${settingsTab==='vendors'?`<div class="field"><label>역할</label><div class="check-row"><label class="check-option"><input type="checkbox" id="is_transporter"><span>운반업체</span></label><label class="check-option"><input type="checkbox" id="is_processor" checked><span>처리업체</span></label></div></div>`:''}<div class="field"><label>사용 여부</label><label class="check-option single"><input type="checkbox" id="active" checked><span>사용</span></label></div><button class="btn primary" type="submit">저장</button> <button class="btn" type="button" id="reset-settings">신규</button></form></div><div class="card"><div class="card-title">등록 목록</div><div class="table-wrap"><table><thead><tr><th>명칭</th><th>상세</th><th>사용</th><th>관리</th></tr></thead><tbody>${rows.length?rows.map(settingsRowHtml).join(''):`<tr><td colspan="4" class="empty">등록된 데이터가 없습니다.</td></tr>`}</tbody></table></div></div></div>`;
  $('#settings-form').onsubmit=saveSetting;
  $('#reset-settings').onclick=()=>renderSettings();
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editSetting(rows.find(r=>r.id===b.dataset.edit)));
}

function settingsRowHtml(r){
  let name='',detail='';
  if(settingsTab==='types'){name=typeName(r);detail=[r.legal_code,r.default_quantity_unit].filter(Boolean).join(' · ')}
  if(settingsTab==='vendors'){name=r.vendor_name;detail=[r.is_transporter?'운반':'',r.is_processor?'처리':'',r.permit_no].filter(Boolean).join(' · ')}
  if(settingsTab==='locations'){name=r.location_name;detail=r.description||''}
  if(settingsTab==='units'){name=r.unit_name;detail=[r.capacity_l?`${r.capacity_l}L`:'',r.quantity_unit].filter(Boolean).join(' · ')}
  return `<tr><td>${esc(name)}</td><td>${esc(detail)}</td><td>${r.active?'사용':'미사용'}</td><td><button class="btn small" data-edit="${r.id}">수정</button></td></tr>`;
}

function editSetting(r){
  if(!r)return;
  $('#edit-id').value=r.id;
  const c=settingsConfigs[settingsTab];
  c.fields.forEach(([id])=>{const e=$('#'+id);if(e)e.value=r[id]??''});
  $('#active').checked=r.active!==false;
  if(settingsTab==='vendors'){ $('#is_transporter').checked=!!r.is_transporter; $('#is_processor').checked=!!r.is_processor; }
}

async function saveSetting(e){
  e.preventDefault();
  const c=settingsConfigs[settingsTab],id=$('#edit-id').value,p={};
  c.fields.forEach(([fid,,type])=>{let v=$('#'+fid).value;if(type==='number')v=v===''?null:Number(v);p[fid]=v});
  p.active=$('#active').checked;
  if(settingsTab==='types') p.display_name=null;
  if(settingsTab==='vendors'){p.is_transporter=$('#is_transporter').checked;p.is_processor=$('#is_processor').checked;}
  const res=id?await A.update(c.table,id,p):await A.insert(c.table,p);
  if(res.error)return notice(res.error.message,'err');
  notice('저장되었습니다.');
  renderSettings();
}

async function renderOpeningSettings(){
  const base=await loadSettingsBase();
  const res=await A.list('waste_opening_balances','*,waste_types(*),waste_storage_locations(*),waste_container_units(*)','balance_date',false);
  const rows=res.data||[];
  $('#settings-body').innerHTML=`<div class="grid two"><div class="card"><div class="card-title">📦 기초·이월량</div><form id="open-form"><div class="field"><label>기준일</label><input id="balance_date" type="date" value="${dateKey()}" required></div><div class="field"><label>폐기물 종류</label><select id="waste_type_id" required>${base.types.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(typeName(x))}</option>`).join('')}</select></div><div class="field"><label>보관장소</label><select id="storage_location_id"><option value="">선택 안함</option>${base.locs.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.location_name)}</option>`).join('')}</select></div><div class="field"><label>용기·단위</label><select id="container_unit_id"><option value="">선택 안함</option>${base.units.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.unit_name)}</option>`).join('')}</select></div><div class="inline"><div class="field"><label>기초수량</label><input id="quantity" type="number" min="0" step="0.001" value="0"></div><div class="field"><label>기초중량(kg, 모르면 공란)</label><input id="weight_kg" type="number" min="0" step="0.001"></div></div><div class="field"><label>비고</label><textarea id="note"></textarea></div><button class="btn primary" type="submit">저장</button></form></div><div class="card"><div class="card-title">기초·이월량 목록</div><div class="table-wrap"><table><thead><tr><th>기준일</th><th>폐기물</th><th>수량</th><th>중량</th><th></th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${r.balance_date}</td><td>${esc(typeName(r.waste_types||{}))}</td><td>${num(r.quantity,0)}</td><td>${r.weight_kg==null?'-':num(r.weight_kg,3)+' kg'}</td><td><button class="btn small danger" data-del="${r.id}">삭제</button></td></tr>`).join(''):`<tr><td colspan="5" class="empty">데이터 없음</td></tr>`}</tbody></table></div></div></div>`;
  $('#open-form').onsubmit=async(e)=>{e.preventDefault();const p={balance_date:$('#balance_date').value,waste_type_id:$('#waste_type_id').value,storage_location_id:$('#storage_location_id').value||null,container_unit_id:$('#container_unit_id').value||null,quantity:Number($('#quantity').value||0),weight_kg:$('#weight_kg').value===''?null:Number($('#weight_kg').value),note:$('#note').value};const x=await A.insert('waste_opening_balances',p);if(x.error)return notice(x.error.message,'err');notice('기초량을 저장했습니다.');renderOpeningSettings()};
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('삭제하시겠습니까?'))return;const x=await A.remove('waste_opening_balances',b.dataset.del);if(x.error)return notice(x.error.message,'err');renderOpeningSettings()});
}

renderStatus();
