const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

function portalSession(){
  try{if(parent&&parent!==window&&typeof parent.getPortalSession==='function')return parent.getPortalSession()||{}}catch(e){}
  try{if(parent&&parent!==window&&parent.portalSession)return parent.portalSession||{}}catch(e){}
  return window.portalSession||window.currentPortalSession||{};
}
function companyId(){const s=portalSession(),c=s.activeCompany||s.active_company||s.selectedCompany||s.company||{};return String(s.activeCompanyId||s.active_company_id||s.selectedCompanyId||s.selected_company_id||c.id||c.company_id||s.companyId||s.company_id||s.profile?.company_id||'').trim()}
function userEmail(){const s=portalSession();return String(s.email||s.user?.email||s.profile?.email||'').trim()}
function portalRole(){const s=portalSession(),r=(s.appRoles||s.app_roles||{}).wastewater||{};let v=typeof r==='string'?r:(r.role||r.role_key||'user');v=String(v).trim().toLowerCase();if(['관리자','administrator'].includes(v))v='admin';if(['운영자','manager'].includes(v))v='operator';return v}
function canManage(){return ['admin','operator'].includes(portalRole()) || (portalSession()?.mode==='service'&&portalSession()?.isServiceAdmin===true)}
function rawClient(){const s=portalSession();if(s?.supabase)return s.supabase;try{if(parent&&parent!==window&&parent.portalSupabase)return parent.portalSupabase}catch(e){}if(window.portalSupabase)return window.portalSupabase;window.portalSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return window.portalSupabase}
const DB=rawClient();
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const num=(v,d=2)=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'-'};
const dateKey=v=>String(v||'').slice(0,10);
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function q(table){let x=DB.from(table).select('*');const c=companyId();if(c)x=x.eq('company_id',c);return x}
function notice(msg,type='ok'){const e=$('#notice');if(!e)return;e.textContent=msg;e.className='notice show '+type;setTimeout(()=>e.classList.remove('show'),3500)}
function errorView(msg){$('#app').innerHTML=`<div class="notice show err">${esc(msg)}</div>`}

const DEFAULT_SETTINGS={facility_name:'폐수배출시설',measurement_mode:'height',volume_unit:'m3',tank_height_cm:154,tank_capacity_m3:7,ton_to_cm:22,active:true};
let mode='status',settingsTab='facility';
let settings={...DEFAULT_SETTINGS},daily=[],pickups=[],vendors=[],locations=[],units=[],openings=[],refCats=[],docTypes=[];
let editId=null;

function measurementMode(){return settings?.measurement_mode==='volume'?'volume':'height'}
function volumeUnit(){return String(settings?.volume_unit||'m3').toUpperCase()==='L'?'L':'m3'}
function toM3(v,unit){const n=Number(v||0);return String(unit||'m3').toUpperCase()==='L'?n/1000:n}
function cmToM3(cm){const h=Number(settings?.tank_height_cm||154),cap=Number(settings?.tank_capacity_m3||7);return h>0?Number(cm||0)/h*cap:0}
function rowStorage(row){
  if(!row||row.is_holiday)return {main:0,external:0,total:0,over:false,display:'휴일'};
  const rm=row.measurement_mode==='volume'?'volume':(row.measurement_mode==='height'?'height':'height');
  if(rm==='volume' && row.volume_value!==null && row.volume_value!==undefined){
    const main=toM3(row.volume_value,row.volume_unit||settings.volume_unit);
    const ext=row.has_external?toM3(row.external_volume_value||0,row.external_volume_unit||row.volume_unit||settings.volume_unit):0;
    const total=main+ext,cap=Number(settings?.tank_capacity_m3||0);
    return {main,external:ext,total,over:cap>0&&total>cap,display:`${num(total,2)} m³`};
  }
  const mainCm=Number(row.height||0);
  const extCm=row.has_external?Number(row.external_cm||0):0;
  const totalCm=mainCm+extCm,total=cmToM3(totalCm),limit=Number(settings?.tank_height_cm||154);
  return {main:cmToM3(mainCm),external:cmToM3(extCm),total,over:totalCm>limit,totalCm,display:`${num(totalCm,1)} cm / ${num(total,2)} m³`};
}
function openingSeed(){return [...openings].sort((a,b)=>String(a.balance_date||'').localeCompare(String(b.balance_date||'')))[0]||null}
function pickupAfterM3(p){
  if(!p)return null;
  if(p.after_pickup_volume_value!==null&&p.after_pickup_volume_value!==undefined)return toM3(p.after_pickup_volume_value,p.after_pickup_volume_unit||settings.volume_unit);
  if(p.after_pickup_cm!==null&&p.after_pickup_cm!==undefined)return cmToM3(p.after_pickup_cm);
  return null;
}
function derive(){
  const seed=openingSeed();let prevMeter=Number(seed?.prev_usage||0),prevStore=Number(seed?.storage_m3||0)+Number(seed?.external_m3||0),water=0,generated=0;
  const pp=new Map(pickups.map(x=>[dateKey(x.pickup_date),x]));const rows=[];
  for(const r of [...daily].sort((a,b)=>dateKey(a.date).localeCompare(dateKey(b.date)))){
    const holiday=!!r.is_holiday;const meter=holiday?prevMeter:Number(r.usage||0);const used=holiday?0:Math.max(0,meter-prevMeter);if(!holiday)prevMeter=meter;
    const st=holiday?{total:prevStore,over:false}:rowStorage(r);const gen=holiday?0:(st.over?0:Math.max(0,st.total-prevStore));water+=used;generated+=gen;
    const pk=pp.get(dateKey(r.date));const after=pickupAfterM3(pk);if(!holiday)prevStore=after!==null?after:(st.over?prevStore:st.total);
    rows.push({...r,used,store:st.total,gen,storageInfo:st});
  }
  return {rows,water,generated,currentStore:prevStore};
}
function monthly(){const y=String(new Date().getFullYear()),d=derive();const m=Array.from({length:12},(_,i)=>({m:i+1,gen:0,pick:0}));d.rows.filter(r=>dateKey(r.date).startsWith(y)).forEach(r=>m[Number(dateKey(r.date).slice(5,7))-1].gen+=r.gen);pickups.filter(r=>dateKey(r.pickup_date).startsWith(y)).forEach(r=>m[Number(dateKey(r.pickup_date).slice(5,7))-1].pick+=Number(r.entrusted_amount||0));return m}

async function safeList(table,order='created_at',ascending=true){try{let x=q(table);if(order)x=x.order(order,{ascending});const r=await x;return r.error?[]:(r.data||[])}catch(e){return []}}
async function load(){
  try{
    const cid=companyId();if(!cid)return errorView('회사 정보를 확인할 수 없습니다. 포탈에서 다시 접속해 주세요.');
    const [s,d,p,v,l,u,o,rc,dt]=await Promise.all([
      q('wastewater_settings').maybeSingle(),
      q('wastewater').order('date',{ascending:true}),
      q('wastewater_pickups').eq('pickup_type','폐수').order('pickup_date',{ascending:true}),
      safeList('wastewater_vendors','sort_order',true),
      safeList('wastewater_storage_locations','sort_order',true),
      safeList('wastewater_container_units','sort_order',true),
      safeList('wastewater_opening_balances','balance_date',true),
      safeList('wastewater_reference_categories','sort_order',true),
      safeList('wastewater_document_types','sort_order',true)
    ]);
    if(s.error&&s.error.code!=='PGRST116')throw s.error;
    settings={...DEFAULT_SETTINGS,...(s.data||{})};daily=d.data||[];pickups=p.data||[];vendors=v;locations=l;units=u;openings=o;refCats=rc;docTypes=dt;render();
  }catch(e){errorView(e?.message||String(e))}
}

function renderStatus(){
  const y=String(new Date().getFullYear()),d=derive();const yrRows=d.rows.filter(r=>dateKey(r.date).startsWith(y));const yrWater=yrRows.reduce((s,r)=>s+r.used,0),yrGen=yrRows.reduce((s,r)=>s+r.gen,0),yrPick=pickups.filter(r=>dateKey(r.pickup_date).startsWith(y)).reduce((s,r)=>s+Number(r.entrusted_amount||0),0);const mm=monthly(),max=Math.max(1,...mm.flatMap(x=>[x.gen,x.pick]));
  $('#app').innerHTML=`<div id="notice" class="notice"></div>
  <div class="toolbar"><div><div class="page-title">폐수현황</div><div class="hint">${esc(settings.facility_name)} · ${y}년 기준 · ${measurementMode()==='height'?'높이 기준형':`볼륨 기준형 (${volumeUnit()==='L'?'L':'m³'})`}</div></div><div class="spacer"></div>${canManage()?'<button class="btn" id="open-settings">설정</button>':''}</div>
  <div class="kpis">
    <div class="kpi"><div class="label">현재 저장량</div><div class="value">${num(d.currentStore,2)} m³</div></div>
    <div class="kpi"><div class="label">연간 용수사용량</div><div class="value">${num(yrWater,2)} m³</div></div>
    <div class="kpi"><div class="label">연간 폐수발생량</div><div class="value">${num(yrGen,2)} m³</div></div>
    <div class="kpi"><div class="label">연간 수거량</div><div class="value">${num(yrPick,2)} m³</div></div>
  </div>
  <div class="grid two dashboard-grid">
    <div class="card"><div class="card-title">월별 폐수 발생량 / 수거량</div>${mm.map(x=>`<div class="bar-row"><b>${x.m}월</b><div><div class="bar-track"><div class="bar" style="width:${Math.min(100,x.gen/max*100)}%"></div></div><div class="bar-track"><div class="bar pick" style="width:${Math.min(100,x.pick/max*100)}%"></div></div></div><span>${num(x.gen,1)} / ${num(x.pick,1)}</span></div>`).join('')}</div>
    <div class="card"><div class="card-title">최근 수거내역</div><div class="table-wrap"><table><thead><tr><th>수거일</th><th>위탁량</th><th>처리업소</th></tr></thead><tbody>${[...pickups].reverse().slice(0,10).map(x=>`<tr><td>${esc(dateKey(x.pickup_date))}</td><td class="num">${num(x.entrusted_amount,2)} m³</td><td>${esc(x.contractor||'-')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">데이터 없음</td></tr>'}</tbody></table></div></div>
  </div>`;
  if($('#open-settings'))$('#open-settings').onclick=()=>{mode='settings';settingsTab='facility';editId=null;render()};
}

const tabs=[['facility','시설기준'],['vendors','업체'],['locations','보관장소'],['units','용기·단위'],['opening','기초·이월량'],['reference','관련자료 종류'],['documents','관련서류 종류']];
function tabsHtml(){return tabs.map(([k,t])=>`<button class="subtab ${settingsTab===k?'active':''}" data-tab="${k}">${t}</button>`).join('')}
function currentCriteria(){
  if(measurementMode()==='height')return `<div class="criteria-grid"><div><span>계측방식</span><strong>높이 기준형</strong></div><div><span>저장고 전체높이</span><strong>${num(settings.tank_height_cm,1)} cm</strong></div><div><span>저장용량</span><strong>${num(settings.tank_capacity_m3,2)} m³</strong></div><div><span>환산식</span><strong>현재높이 × 용량 ÷ 전체높이</strong></div></div>`;
  return `<div class="criteria-grid"><div><span>계측방식</span><strong>볼륨 기준형</strong></div><div><span>현장 입력단위</span><strong>${volumeUnit()==='L'?'L':'m³'}</strong></div><div><span>저장고 최대용량</span><strong>${volumeUnit()==='L'?num(Number(settings.tank_capacity_m3||0)*1000,0)+' L':num(settings.tank_capacity_m3,2)+' m³'}</strong></div><div><span>내부 계산기준</span><strong>m³</strong></div></div>`;
}
function facilityForm(){const vm=volumeUnit();return `<div class="grid two settings-grid"><div class="card"><div class="card-title">시설기준</div>
  <div class="field"><label>시설명</label><input id="facility_name" value="${esc(settings.facility_name)}"></div>
  <div class="field"><label>계측방식</label><select id="measurement_mode"><option value="height" ${measurementMode()==='height'?'selected':''}>높이 기준형</option><option value="volume" ${measurementMode()==='volume'?'selected':''}>볼륨 기준형</option></select></div>
  <div id="height-settings" style="display:${measurementMode()==='height'?'block':'none'}"><div class="field"><label>저장고 전체높이 (cm)</label><input id="tank_height_cm" type="number" step="0.1" value="${Number(settings.tank_height_cm||154)}"></div><div class="field"><label>저장용량 (m³)</label><input id="tank_capacity_m3_h" type="number" step="0.01" value="${Number(settings.tank_capacity_m3||7)}"></div></div>
  <div id="volume-settings" style="display:${measurementMode()==='volume'?'block':'none'}"><div class="field"><label>현장 표시단위</label><select id="volume_unit"><option value="m3" ${vm==='m3'?'selected':''}>m³</option><option value="L" ${vm==='L'?'selected':''}>L</option></select></div><div class="field"><label>저장고 최대용량 (<span id="capacity-unit-label">${vm==='L'?'L':'m³'}</span>)</label><input id="tank_capacity_volume" type="number" step="0.01" value="${vm==='L'?Number(settings.tank_capacity_m3||7)*1000:Number(settings.tank_capacity_m3||7)}"></div></div>
  <div class="hint-box">시설기준은 폐수 프로그램의 공통 원본입니다. 폐수 일일입력·수거등록·운영일지와 추후 폐기물의 폐수배출시설 운영일지가 동일 기준을 사용합니다.</div>
  <button class="btn primary" id="save-facility">저장</button></div>
  <div class="card"><div class="card-title">현재 기준</div>${currentCriteria()}<div class="hint" style="margin-top:12px">저장 후 이 영역은 DB의 실제 저장값으로 즉시 갱신됩니다.</div></div></div>`}

const configs={
  vendors:{table:'wastewater_vendors',title:'업체',name:'vendor_name',fields:[['vendor_name','업체명','text'],['business_no','사업자번호','text'],['permit_no','허가번호','text'],['contact_name','담당자','text'],['phone','연락처','text'],['note','비고','text']]},
  locations:{table:'wastewater_storage_locations',title:'보관장소',name:'location_name',fields:[['location_name','보관장소명','text'],['description','설명','text'],['max_volume_m3','최대보관량(m³)','number']]},
  units:{table:'wastewater_container_units',title:'용기·단위',name:'unit_name',fields:[['unit_name','용기명','text'],['quantity_unit','수량단위','text'],['capacity_l','용량(L)','number']]},
  reference:{table:'wastewater_reference_categories',title:'관련자료 종류',name:'category_name',fields:[['category_name','종류명','text'],['description','설명','text']]},
  documents:{table:'wastewater_document_types',title:'관련서류 종류',name:'type_name',fields:[['type_name','종류명','text'],['description','설명','text']]}
};
function listFor(k){return k==='vendors'?vendors:k==='locations'?locations:k==='units'?units:k==='reference'?refCats:docTypes}
function genericSettings(k){const c=configs[k],list=listFor(k),editing=list.find(x=>String(x.id)===String(editId))||{};return `<div class="grid two settings-grid"><div class="card"><div class="card-title">${c.title} ${editId?'수정':'추가'}</div>${c.fields.map(([f,l,t])=>`<div class="field"><label>${l}</label><input id="f-${f}" type="${t}" value="${esc(editing[f]??'')}"></div>`).join('')}<div class="inline-actions"><button class="btn primary" id="save-generic">${editId?'수정 저장':'추가'}</button>${editId?'<button class="btn" id="cancel-edit">취소</button>':''}</div></div><div class="card"><div class="card-title">${c.title} 목록</div><div class="table-wrap"><table><thead><tr><th>명칭</th><th>상세</th><th>관리</th></tr></thead><tbody>${list.map(x=>`<tr><td><b>${esc(x[c.name]||'')}</b></td><td>${esc(x.description||x.note||x.memo||x.quantity_unit||'')}</td><td><div class="row-actions"><button class="btn small" data-edit="${x.id}">수정</button><button class="btn small danger" data-del="${x.id}">삭제</button></div></td></tr>`).join('')||'<tr><td colspan="3" class="empty">등록 없음</td></tr>'}</tbody></table></div></div></div>`}
function openingForm(){const op=[...openings].sort((a,b)=>String(b.balance_date).localeCompare(String(a.balance_date)));const unit=volumeUnit();return `<div class="grid two settings-grid"><div class="card"><div class="card-title">기초·이월량 등록</div><div class="field"><label>기준일</label><input id="op-date" type="date" value="${todayKey()}"></div><div class="field"><label>용수 전일 지침 (m³)</label><input id="op-prev-usage" type="number" step="0.01"></div>${measurementMode()==='height'?`<div class="field"><label>폐수 기초높이 (cm)</label><input id="op-storage" type="number" step="0.1"></div><div class="field"><label>외부보관 높이 (cm)</label><input id="op-external" type="number" step="0.1" value="0"></div>`:`<div class="field"><label>폐수 기초량 (${unit==='L'?'L':'m³'})</label><input id="op-storage" type="number" step="0.01"></div><div class="field"><label>외부보관량 (${unit==='L'?'L':'m³'})</label><input id="op-external" type="number" step="0.01" value="0"></div>`}<div class="field"><label>보관장소</label><select id="op-location"><option value="">선택안함</option>${locations.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.location_name)}</option>`).join('')}</select></div><div class="field"><label>비고</label><textarea id="op-note"></textarea></div><button class="btn primary" id="save-opening">저장</button><div class="hint-box">기초·이월량은 최초 계산 시작값으로 사용하며, 이후 실제 일일입력 값이 계속 이어집니다.</div></div><div class="card"><div class="card-title">기초·이월량 목록</div><div class="table-wrap"><table><thead><tr><th>기준일</th><th>용수 전일</th><th>기초 저장량</th><th>비고</th><th>관리</th></tr></thead><tbody>${op.map(x=>`<tr><td>${esc(x.balance_date)}</td><td class="num">${num(x.prev_usage,2)}</td><td>${num(x.storage_m3,2)} m³${Number(x.external_m3||0)>0?` + 외부 ${num(x.external_m3,2)} m³`:''}</td><td>${esc(x.note||'')}</td><td><button class="btn small danger" data-op-del="${x.id}">삭제</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">등록 없음</td></tr>'}</tbody></table></div></div></div>`}

function renderSettings(){if(!canManage()){mode='status';return renderStatus()}let body=settingsTab==='facility'?facilityForm():settingsTab==='opening'?openingForm():genericSettings(settingsTab);$('#app').innerHTML=`<div id="notice" class="notice"></div><div class="toolbar"><div><div class="page-title">폐수현황 설정</div><div class="hint">폐기물 설정과 동일한 규격으로 구성</div></div><div class="spacer"></div><button class="btn" id="back-status">현황으로</button></div><div class="subtabs">${tabsHtml()}</div>${body}`;$('#back-status').onclick=()=>{mode='status';editId=null;render()};document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.tab;editId=null;render()});if(settingsTab==='facility')bindFacility();else if(settingsTab==='opening')bindOpening();else bindGeneric(settingsTab)}
function render(){mode==='settings'?renderSettings():renderStatus()}

function bindFacility(){
  const modeEl=$('#measurement_mode'),vunit=$('#volume_unit');
  function sync(){const isH=modeEl.value==='height';$('#height-settings').style.display=isH?'block':'none';$('#volume-settings').style.display=isH?'none':'block'}
  modeEl.onchange=sync;if(vunit)vunit.onchange=()=>{$('#capacity-unit-label').textContent=vunit.value==='L'?'L':'m³';const cap=$('#tank_capacity_volume');if(cap&&cap.dataset.lastUnit){const n=Number(cap.value||0);cap.value=vunit.value==='L'&&cap.dataset.lastUnit==='m3'?n*1000:vunit.value==='m3'&&cap.dataset.lastUnit==='L'?n/1000:n}cap.dataset.lastUnit=vunit.value};if(vunit){$('#tank_capacity_volume').dataset.lastUnit=vunit.value}
  $('#save-facility').onclick=saveFacility;
}
async function saveFacility(){const mm=$('#measurement_mode').value,vu=$('#volume_unit')?.value||'m3';let cap=mm==='height'?Number($('#tank_capacity_m3_h').value||0):Number($('#tank_capacity_volume').value||0);if(mm==='volume'&&vu==='L')cap/=1000;const row={company_id:companyId(),facility_name:$('#facility_name').value.trim()||'폐수배출시설',measurement_mode:mm,volume_unit:vu,tank_height_cm:mm==='height'?Number($('#tank_height_cm').value||154):Number(settings.tank_height_cm||154),tank_capacity_m3:cap||7,ton_to_cm:Number(settings.ton_to_cm||22),updated_by:userEmail(),active:true};const x=await DB.from('wastewater_settings').upsert([row],{onConflict:'company_id'}).select('*').single();if(x.error)return notice(x.error.message,'err');settings={...DEFAULT_SETTINGS,...x.data};notice('시설기준이 저장되었습니다.');renderSettings()}

function bindGeneric(k){const c=configs[k];$('#save-generic').onclick=()=>saveGeneric(k);if($('#cancel-edit'))$('#cancel-edit').onclick=()=>{editId=null;renderSettings()};document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editId=b.dataset.edit;renderSettings()});document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteGeneric(k,b.dataset.del))}
async function saveGeneric(k){const c=configs[k],row={company_id:companyId(),active:true,updated_by:userEmail()};for(const [f,,t] of c.fields){let v=$(`#f-${f}`).value.trim();row[f]=t==='number'?(v===''?null:Number(v)):v||null}let x;if(editId){x=await DB.from(c.table).update(row).eq('id',editId).eq('company_id',companyId()).select('*').single()}else{const list=listFor(k);const maxSort=list.reduce((m,item)=>Math.max(m,Number(item.sort_order)||0),0);row.sort_order=maxSort+1;x=await DB.from(c.table).insert([{...row,created_by:userEmail()}]).select('*').single()}if(x.error)return notice(x.error.message,'err');editId=null;await load();mode='settings';settingsTab=k;notice('저장되었습니다.');renderSettings()}
async function deleteGeneric(k,id){if(!confirm('삭제하시겠습니까?'))return;const c=configs[k],x=await DB.from(c.table).delete().eq('id',id).eq('company_id',companyId());if(x.error)return notice(x.error.message,'err');await load();mode='settings';settingsTab=k;renderSettings()}

function bindOpening(){$('#save-opening').onclick=saveOpening;document.querySelectorAll('[data-op-del]').forEach(b=>b.onclick=()=>deleteOpening(b.dataset.opDel))}
async function saveOpening(){const date=$('#op-date').value,prev=Number($('#op-prev-usage').value||0),value=Number($('#op-storage').value||0),external=Number($('#op-external').value||0),unit=measurementMode()==='height'?'cm':volumeUnit();if(!date)return notice('기준일을 입력하세요.','err');let storageM3=0,externalM3=0;if(measurementMode()==='height'){storageM3=cmToM3(value);externalM3=cmToM3(external)}else{storageM3=toM3(value,unit);externalM3=toM3(external,unit)}const row={company_id:companyId(),balance_date:date,prev_usage:prev,measurement_mode:measurementMode(),storage_value:value,storage_unit:unit,storage_m3:storageM3,external_value:external,external_unit:unit,external_m3:externalM3,storage_location_id:$('#op-location').value||null,note:$('#op-note').value.trim()||null,created_by:userEmail(),updated_by:userEmail()};const x=await DB.from('wastewater_opening_balances').insert([row]);if(x.error)return notice(x.error.message,'err');await load();mode='settings';settingsTab='opening';notice('기초·이월량이 저장되었습니다.');renderSettings()}
async function deleteOpening(id){if(!confirm('삭제하시겠습니까?'))return;const x=await DB.from('wastewater_opening_balances').delete().eq('id',id).eq('company_id',companyId());if(x.error)return notice(x.error.message,'err');await load();mode='settings';settingsTab='opening';renderSettings()}

load();
