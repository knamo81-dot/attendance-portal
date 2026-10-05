
const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";
function session(){try{if(parent&&parent!==window&&typeof parent.getPortalSession==='function')return parent.getPortalSession()||{}}catch(e){}try{if(parent&&parent!==window&&parent.portalSession)return parent.portalSession||{}}catch(e){}return window.portalSession||window.currentPortalSession||{}}
function companyId(){const s=session(),c=s.activeCompany||s.active_company||s.selectedCompany||s.company||{};return String(s.activeCompanyId||s.active_company_id||s.selectedCompanyId||s.selected_company_id||c.id||c.company_id||s.companyId||s.company_id||s.profile?.company_id||'').trim()}
function userEmail(){const s=session();return String(s.email||s.user?.email||s.profile?.email||'').trim()}
function role(){const s=session(),r=(s.appRoles||s.app_roles||{}).wastewater||{};let v=typeof r==='string'?r:(r.role||r.role_key||'user');v=String(v).toLowerCase();if(['관리자','administrator'].includes(v))v='admin';if(['운영자','manager'].includes(v))v='operator';return v}
function canManage(){return ['admin','operator'].includes(role())}
function sb(){const s=session();if(s.supabase)return s.supabase;try{if(parent&&parent!==window&&parent.portalSupabase)return parent.portalSupabase}catch(e){}if(window.portalSupabase)return window.portalSupabase;window.portalSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return window.portalSupabase}
const DB=sb(),$=q=>document.querySelector(q),esc=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
let mode='status',settingsTab='facility',settings=null,daily=[],pickups=[],vendors=[],refCats=[],docTypes=[];
function n(v,d=2){const x=Number(v);return Number.isFinite(x)?x.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'-'}
function dateKey(v){return String(v||'').slice(0,10)}
function notice(msg,type='ok'){const e=$('#notice');if(!e)return;e.textContent=msg;e.className='notice show '+type;setTimeout(()=>e.classList.remove('show'),3000)}
function q(table){let x=DB.from(table).select('*');const c=companyId();if(c)x=x.eq('company_id',c);return x}
async function load(){
  const [s,d,p,v,rc,dt]=await Promise.all([
    q('wastewater_settings').maybeSingle(),
    q('wastewater').order('date',{ascending:true}),
    q('wastewater_pickups').eq('pickup_type','폐수').order('pickup_date',{ascending:true}),
    q('wastewater_vendors').order('sort_order',{ascending:true}),
    q('wastewater_reference_categories').order('sort_order',{ascending:true}),
    q('wastewater_document_types').order('sort_order',{ascending:true})
  ]);
  if(s.error&&s.error.code!=='PGRST116')return error(s.error.message);
  settings=s.data||{tank_height_cm:154,tank_capacity_m3:7,ton_to_cm:22,facility_name:'폐수배출시설'};
  daily=d.data||[];pickups=p.data||[];vendors=v.data||[];refCats=rc.data||[];docTypes=dt.data||[];render();
}
function error(m){$('#app').innerHTML=`<div class="notice show err">${esc(m)}</div>`}
function derive(){
  const h=Number(settings?.tank_height_cm||154),cap=Number(settings?.tank_capacity_m3||7),toncm=Number(settings?.ton_to_cm||22);
  const pp=new Map(pickups.map(x=>[dateKey(x.pickup_date),x]));
  let prevMeter=null,prevStore=0;const rows=[];let water=0,generated=0;
  for(const r of daily){
    const holiday=!!r.is_holiday; const meter=Number(r.usage||0);
    const used=holiday?0:(prevMeter==null?0:Math.max(0,meter-prevMeter));
    if(!holiday)prevMeter=meter;
    const ext=holiday?0:(r.has_external?Number(r.external_cm||(Number(r.external_ton||0)*toncm)):0);
    const totalCm=holiday?prevStore:(Number(r.height||0)+ext);
    const store=totalCm/h*cap;
    const gen=holiday?0:Math.max(0,store-prevStore);
    water+=used;generated+=gen;
    const pk=pp.get(dateKey(r.date)); prevStore=pk?.after_pickup_cm!=null?Number(pk.after_pickup_cm)/h*cap:store;
    rows.push({...r,used,store,gen});
  }
  return {rows,water,generated};
}
function monthly(){
  const y=String(new Date().getFullYear()),d=derive();const m=Array.from({length:12},(_,i)=>({m:i+1,gen:0,pick:0}));
  d.rows.filter(r=>dateKey(r.date).startsWith(y)).forEach(r=>m[Number(dateKey(r.date).slice(5,7))-1].gen+=r.gen);
  pickups.filter(r=>dateKey(r.pickup_date).startsWith(y)).forEach(r=>m[Number(dateKey(r.pickup_date).slice(5,7))-1].pick+=Number(r.entrusted_amount||0));
  return m;
}
function renderStatus(){
  const y=String(new Date().getFullYear()),d=derive(),last=d.rows.at(-1),cur=last?.store||0;
  const yrRows=d.rows.filter(r=>dateKey(r.date).startsWith(y));const yrWater=yrRows.reduce((s,r)=>s+r.used,0),yrGen=yrRows.reduce((s,r)=>s+r.gen,0),yrPick=pickups.filter(r=>dateKey(r.pickup_date).startsWith(y)).reduce((s,r)=>s+Number(r.entrusted_amount||0),0);
  const mm=monthly(),max=Math.max(1,...mm.flatMap(x=>[x.gen,x.pick]));
  $('#app').innerHTML=`<div id="notice" class="notice"></div>
  <div class="head"><div><h2>💧 폐수현황</h2><div class="hint">${esc(settings?.facility_name||'폐수배출시설')} · ${y}년 기준</div></div><div class="spacer"></div>${canManage()?'<button class="btn" id="open-settings">⚙ 설정</button>':''}</div>
  <div class="kpis">
    <div class="card kpi"><span>현재 저장량</span><strong>${n(cur,2)} m³</strong></div>
    <div class="card kpi"><span>연간 용수사용량</span><strong>${n(yrWater,2)} m³</strong></div>
    <div class="card kpi"><span>연간 폐수발생량</span><strong>${n(yrGen,2)} m³</strong></div>
    <div class="card kpi"><span>연간 수거량</span><strong>${n(yrPick,2)} m³</strong></div>
  </div>
  <div class="grid">
   <div class="card panel"><h3>월별 폐수 발생량 / 수거량</h3>${mm.map(x=>`<div class="bar-row"><b>${x.m}월</b><div><div class="bar-track"><div class="bar" style="width:${Math.min(100,x.gen/max*100)}%"></div></div><div class="bar-track" style="margin-top:3px"><div class="bar pick" style="width:${Math.min(100,x.pick/max*100)}%"></div></div></div><span>${n(x.gen,1)} / ${n(x.pick,1)}</span></div>`).join('')}</div>
   <div class="card panel"><h3>최근 수거내역</h3><table><thead><tr><th>수거일</th><th>위탁량</th><th>처리업소</th></tr></thead><tbody>${[...pickups].reverse().slice(0,10).map(x=>`<tr><td>${esc(dateKey(x.pickup_date))}</td><td>${n(x.entrusted_amount,2)}m³</td><td class="left">${esc(x.contractor||'-')}</td></tr>`).join('')||'<tr><td colspan="3">데이터 없음</td></tr>'}</tbody></table></div>
  </div>`;
  if($('#open-settings'))$('#open-settings').onclick=()=>{mode='settings';render()};
}
function settingTabs(){return [['facility','시설기준'],['vendors','처리업소'],['reference','관련자료 종류'],['documents','관련서류 종류']].map(x=>`<button class="settings-tab ${settingsTab===x[0]?'active':''}" data-st="${x[0]}">${x[1]}</button>`).join('')}
function renderSettings(){
  if(!canManage()){mode='status';return renderStatus()}
  let body='';
  if(settingsTab==='facility')body=`<div class="settings-grid"><div class="card form-card"><h3>시설기준</h3>
    <div class="field"><label>시설명</label><input id="facility_name" value="${esc(settings?.facility_name||'폐수배출시설')}"></div>
    <div class="field"><label>저장고 전체높이 (cm)</label><input id="tank_height_cm" type="number" step="0.1" value="${settings?.tank_height_cm||154}"></div>
    <div class="field"><label>저장용량 (m³)</label><input id="tank_capacity_m3" type="number" step="0.1" value="${settings?.tank_capacity_m3||7}"></div>
    <div class="field"><label>1T 환산높이 (cm)</label><input id="ton_to_cm" type="number" step="0.1" value="${settings?.ton_to_cm||22}"></div>
    <button class="btn primary" id="save-facility">저장</button></div><div class="card list-card"><h3>현재 기준</h3><p class="hint">운영일지 계산에 적용되는 회사별 폐수시설 기준입니다.</p></div></div>`;
  if(settingsTab==='vendors')body=crudSection('vendor','처리업소',vendors,'vendor_name');
  if(settingsTab==='reference')body=crudSection('reference','관련자료 종류',refCats,'category_name');
  if(settingsTab==='documents')body=crudSection('document','관련서류 종류',docTypes,'type_name');
  $('#app').innerHTML=`<div id="notice" class="notice"></div><div class="card settings-shell"><div class="head"><div><h2>⚙ 폐수현황 설정</h2></div><div class="spacer"></div><button class="btn" id="back-status">현황으로</button></div><div class="settings-tabs">${settingTabs()}</div>${body}</div>`;
  $('#back-status').onclick=()=>{mode='status';render()};
  document.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.st;render()});
  if($('#save-facility'))$('#save-facility').onclick=saveFacility;
  bindCrud();
}
function crudSection(kind,title,list,nameField){
  return `<div class="settings-grid"><div class="card form-card"><h3>${title} 추가</h3><div class="field"><label>명칭</label><input id="crud-name"></div><div class="field"><label>설명/비고</label><textarea id="crud-desc"></textarea></div><button class="btn primary" data-add-kind="${kind}">추가</button></div><div class="card list-card"><h3>${title} 목록</h3><table><thead><tr><th>명칭</th><th>비고</th><th>관리</th></tr></thead><tbody>${list.map(x=>`<tr><td class="left">${esc(x[nameField]||'')}</td><td class="left">${esc(x.description||x.memo||'')}</td><td><button class="btn small danger" data-del-kind="${kind}" data-id="${x.id}">삭제</button></td></tr>`).join('')||'<tr><td colspan="3">등록 없음</td></tr>'}</tbody></table></div></div>`;
}
function bindCrud(){
  document.querySelectorAll('[data-add-kind]').forEach(b=>b.onclick=()=>addCrud(b.dataset.addKind));
  document.querySelectorAll('[data-del-kind]').forEach(b=>b.onclick=()=>delCrud(b.dataset.delKind,b.dataset.id));
}
async function saveFacility(){
  const row={company_id:companyId(),facility_name:$('#facility_name').value.trim()||'폐수배출시설',tank_height_cm:Number($('#tank_height_cm').value||154),tank_capacity_m3:Number($('#tank_capacity_m3').value||7),ton_to_cm:Number($('#ton_to_cm').value||22),updated_by:userEmail(),active:true};
  const x=await DB.from('wastewater_settings').upsert([row],{onConflict:'company_id'}).select('*').single();if(x.error)return notice(x.error.message,'err');settings=x.data;notice('저장되었습니다.');render();
}
function crudConfig(k){return k==='vendor'?['wastewater_vendors','vendor_name','memo']:k==='reference'?['wastewater_reference_categories','category_name','description']:['wastewater_document_types','type_name','description']}
async function addCrud(k){const [t,nf,df]=crudConfig(k),name=$('#crud-name').value.trim();if(!name)return notice('명칭을 입력하세요.','err');const row={company_id:companyId(),[nf]:name,[df]:$('#crud-desc').value.trim()||null,active:true,sort_order:100,created_by:userEmail(),updated_by:userEmail()};const x=await DB.from(t).insert([row]);if(x.error)return notice(x.error.message,'err');await load();mode='settings';settingsTab=k==='vendor'?'vendors':k==='reference'?'reference':'documents';render()}
async function delCrud(k,id){if(!confirm('삭제하시겠습니까?'))return;const [t]=crudConfig(k),x=await DB.from(t).delete().eq('id',id).eq('company_id',companyId());if(x.error)return notice(x.error.message,'err');await load();mode='settings';settingsTab=k==='vendor'?'vendors':k==='reference'?'reference':'documents';render()}
function render(){mode==='settings'?renderSettings():renderStatus()}
load();
try{parent.postMessage({type:'portal-tab-active',activeTabId:'ww-status',tabId:'ww-status',source:'wastewater'},'*')}catch(e){}
