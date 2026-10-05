const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

(function(){
  function portalSession(){
    try{
      if(window.parent && window.parent!==window && typeof window.parent.getPortalSession==='function'){
        return window.parent.getPortalSession()||{};
      }
    }catch(e){}
    try{
      if(window.parent && window.parent!==window && window.parent.portalSession){
        return window.parent.portalSession||{};
      }
    }catch(e){}
    return window.portalSession||window.currentPortalSession||{};
  }

  function rawClient(){
    const s=portalSession();
    if(s && s.supabase) return s.supabase;
    try{
      if(window.parent && window.parent!==window && window.parent.portalSupabase){
        return window.parent.portalSupabase;
      }
    }catch(e){}
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
    const v=s.activeCompanyId||s.active_company_id||s.selectedCompanyId||s.selected_company_id||
      c.id||c.company_id||s.companyId||s.company_id||s.profile?.company_id||window.currentCompanyId||'';
    if(v) return String(v).trim();
    try{
      const p=new URLSearchParams(location.search);
      return String(p.get('company_id')||p.get('companyId')||'').trim();
    }catch(e){
      return '';
    }
  }

  function userEmail(){
    const s=portalSession();
    return String(s.email||s.user?.email||s.profile?.email||'').trim();
  }

  const sb=rawClient();

  async function list(table,select='*',orderCol='created_at',ascending=false){
    let q=sb.from(table).select(select);
    const cid=companyId();
    if(cid) q=q.eq('company_id',cid);
    if(orderCol) q=q.order(orderCol,{ascending});
    return q;
  }

  async function insert(table,payload){
    const cid=companyId();
    const row={
      ...payload,
      company_id:payload.company_id||cid,
      created_by:payload.created_by||userEmail()||null
    };
    return sb.from(table).insert([row]).select('*').single();
  }

  async function update(table,id,payload){
    let q=sb.from(table).update(payload).eq('id',id);
    const cid=companyId();
    if(cid) q=q.eq('company_id',cid);
    return q.select('*').single();
  }

  async function remove(table,id){
    let q=sb.from(table).delete().eq('id',id);
    const cid=companyId();
    if(cid) q=q.eq('company_id',cid);
    return q;
  }

  window.wasteApi={sb,portalSession,companyId,userEmail,list,insert,update,remove};
})();

const A=window.wasteApi;
const $=(s)=>document.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>'"]/g,m=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[m]));
const num=(v,d=2)=>Number(v||0).toLocaleString('ko-KR',{
  minimumFractionDigits:d,
  maximumFractionDigits:d
});

function notice(msg,type='ok'){
  const el=$('#notice');
  if(!el)return;
  el.textContent=msg;
  el.className='notice show '+type;
  setTimeout(()=>el.classList.remove('show'),3500);
}

function typeName(r){
  return r.display_name||
    `${r.legal_name||''}${r.physical_state==='liquid'?'(액상)':r.physical_state==='solid'?'(고상)':''}`;
}

function dateKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function weekendInfo(date){
  const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return {isWeekend:false,reason:null,dow:null};
  const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  const dow=d.getDay();
  return {
    isWeekend:dow===0||dow===6,
    reason:dow===0?'일요일':dow===6?'토요일':null,
    dow
  };
}

function effectiveHoliday(date,isHoliday,reason){
  const w=weekendInfo(date);
  return {
    isHoliday:w.isWeekend||!!isHoliday,
    reason:w.reason||String(reason||'').trim()||null,
    isWeekend:w.isWeekend
  };
}

let editing=null;
let types=[];
let locs=[];
let units=[];
let generalRows=[];
let facilityRows=[];

async function load(){
  const [t,l,u,d,f]=await Promise.all([
    A.list('waste_types','*','sort_order',true),
    A.list('waste_storage_locations','*','sort_order',true),
    A.list('waste_container_units','*','sort_order',true),
    A.list(
      'waste_daily_entries',
      '*,waste_types(*),waste_storage_locations(*),waste_container_units(*)',
      'entry_date',
      false
    ),
    A.list(
      'waste_facility_daily_logs',
      '*,waste_types(*)',
      'entry_date',
      false
    )
  ]);

  types=(t.data||[]).filter(x=>x.active);
  locs=(l.data||[]).filter(x=>x.active);
  units=(u.data||[]).filter(x=>x.active);
  generalRows=d.data||[];
  facilityRows=f.data||[];

  render();
}

function currentEditingData(){
  return editing?.data||null;
}

function isFacilityEditing(){
  return editing?.mode==='facility';
}

function previousFacilityUsage(date,typeId,currentId=''){
  const candidates=facilityRows
    .filter(r=>r.id!==currentId)
    .filter(r=>r.waste_type_id===typeId)
    .filter(r=>String(r.entry_date||'')<String(date||''))
    .filter(r=>!effectiveHoliday(r.entry_date,r.is_holiday,r.holiday_reason).isHoliday && r.usage!=null)
    .sort((a,b)=>String(b.entry_date).localeCompare(String(a.entry_date)));

  return candidates.length?Number(candidates[0].usage):null;
}

function generalFormHtml(data){
  return `
    <div id="general-fields">
      <div class="inline">
        <div class="field">
          <label>용기·단위</label>
          <select id="container_unit_id">
            <option value="">선택 안함</option>
            ${units.map(x=>`<option value="${x.id}" ${data?.container_unit_id===x.id?'selected':''}>${esc(x.unit_name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>수량</label>
          <input id="quantity" type="number" min="0" step="0.001" value="${data?.quantity??1}" required>
        </div>
      </div>

      <div class="inline">
        <div class="field">
          <label>발생중량(kg)</label>
          <input id="weight_kg" type="number" min="0" step="0.001"
            value="${data?.weight_kg??''}" placeholder="모르면 공란">
        </div>
        <div class="field">
          <label>중량 상태</label>
          <select id="weight_status">
            <option value="unknown">미확인</option>
            <option value="estimated">추정</option>
            <option value="confirmed">확정</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label>보관장소</label>
        <select id="storage_location_id">
          <option value="">선택 안함</option>
          ${locs.map(x=>`<option value="${x.id}" ${data?.storage_location_id===x.id?'selected':''}>${esc(x.location_name)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>기타사항</label>
        <textarea id="note">${esc(data?.note||'')}</textarea>
      </div>
    </div>`;
}

function facilityFormHtml(data){
  return `
    <div id="facility-fields">
      <div class="field">
        <label>용수 금일 지침 (누적값 m³)</label>
        <input id="facility_usage" type="number" min="0" step="0.01"
          value="${data?.usage??''}">
      </div>

      <div class="field">
        <label>폐수높이 (cm)</label>
        <input id="facility_height" type="number" min="0" step="0.1"
          value="${data?.height??''}">
      </div>

      <label class="toggle-row" for="facility_is_holiday">
        <input id="facility_is_holiday" type="checkbox"
          ${effectiveHoliday(data?.entry_date,data?.is_holiday,data?.holiday_reason).isHoliday?'checked':''}>
        <span>휴일 입력 <small id="weekend-auto-label" class="weekend-auto-label"></small></span>
      </label>

      <div id="holiday-box" class="expand-box">
        <div class="field">
          <label>휴일 사유</label>
          <input id="facility_holiday_reason" type="text"
            value="${esc(effectiveHoliday(data?.entry_date,data?.is_holiday,data?.holiday_reason).reason||'')}"
            placeholder="예: 회사 단체휴무, 임시휴무, 샌드위치 휴무">
        </div>
      </div>

      <div class="field">
        <label>기타사항</label>
        <textarea id="facility_note">${esc(data?.note||'')}</textarea>
      </div>

      <label class="toggle-row" for="facility_has_external">
        <input id="facility_has_external" type="checkbox" ${data?.has_external?'checked':''}>
        <span>외부보관 있음</span>
      </label>

      <div id="external-box" class="expand-box">
        <div class="inline">
          <div class="field">
            <label>외부보관량 (T)</label>
            <input id="facility_external_ton" type="number" min="0" step="0.1"
              value="${data?.external_ton??1}">
          </div>
          <div class="field">
            <label>환산높이 (cm)</label>
            <input id="facility_external_cm" type="number" min="0" step="0.1"
              value="${data?.external_cm??22}">
          </div>
        </div>
      </div>

      <div class="facility-preview">
        <div>
          <span>용수 전일 지침</span>
          <strong id="pv-prev-usage">-</strong>
        </div>
        <div>
          <span>당일 용수사용량</span>
          <strong id="pv-water-used">-</strong>
        </div>
        <div>
          <span>외부보관 높이</span>
          <strong id="pv-external-cm">0.0 cm</strong>
        </div>
        <div>
          <span>합산 높이</span>
          <strong id="pv-total-cm">-</strong>
        </div>
      </div>
    </div>`;
}

function combinedRowsHtml(){
  const combined=[
    ...generalRows.map(r=>({mode:'general',date:r.entry_date,data:r})),
    ...facilityRows.map(r=>({mode:'facility',date:r.entry_date,data:r}))
  ].sort((a,b)=>{
    const d=String(b.date).localeCompare(String(a.date));
    if(d!==0)return d;
    return String(b.data.created_at||'').localeCompare(String(a.data.created_at||''));
  });

  if(!combined.length){
    return `<tr><td colspan="7" class="empty">등록된 일일입력 기록이 없습니다.</td></tr>`;
  }

  return combined.map(x=>{
    const r=x.data;

    if(x.mode==='facility'){
      const holiday=effectiveHoliday(r.entry_date,r.is_holiday,r.holiday_reason);
      const detail=holiday.isHoliday
        ? `<span class="pill amber">휴일</span>${holiday.reason?` ${esc(holiday.reason)}`:''}`
        : [
            r.usage!=null?`용수 ${num(r.usage,2)} m³`:'',
            r.height!=null?`높이 ${num(r.height,1)} cm`:'',
            r.has_external?`외부 ${num(r.external_ton,2)} T / ${num(r.external_cm,1)} cm`:''
          ].filter(Boolean).join('<br>');

      return `
        <tr>
          <td>${r.entry_date}</td>
          <td>${esc(typeName(r.waste_types||{}))}</td>
          <td><span class="pill green">폐수배출시설 운영일지</span></td>
          <td>${detail||'-'}</td>
          <td>${r.has_external?'<span class="pill amber">외부보관</span>':'-'}</td>
          <td>${esc(r.note||'')}</td>
          <td>
            <div class="row-actions">
              <button class="btn small" data-edit-facility="${r.id}">수정</button>
              <button class="btn small danger" data-del-facility="${r.id}">삭제</button>
            </div>
          </td>
        </tr>`;
    }

    const quantityText=r.waste_container_units?.unit_name
      ? `${num(r.quantity,0)} / ${esc(r.waste_container_units.unit_name)}`
      : `${num(r.quantity,0)}`;

    const weightText=r.weight_kg==null
      ? `<span class="pill amber">중량 미확인</span>`
      : `${num(r.weight_kg,3)} kg <span class="pill ${r.weight_status==='confirmed'?'green':'amber'}">${r.weight_status==='confirmed'?'확정':'추정'}</span>`;

    return `
      <tr>
        <td>${r.entry_date}</td>
        <td>${esc(typeName(r.waste_types||{}))}</td>
        <td><span class="pill">일반 발생기록</span></td>
        <td>${quantityText}<br>${weightText}</td>
        <td>${esc(r.waste_storage_locations?.location_name||'-')}</td>
        <td>${esc(r.note||'')}</td>
        <td>
          <div class="row-actions">
            <button class="btn small" data-edit-general="${r.id}">수정</button>
            <button class="btn small danger" data-del-general="${r.id}">삭제</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function render(){
  const data=currentEditingData();
  const facilityMode=isFacilityEditing();

  $('#app').innerHTML=`
    <div id="notice" class="notice"></div>

    <div class="grid two">
      <div class="card">
        <div class="card-title">🗓 폐기물 일일입력</div>
        <div class="hint">
          일반 폐기물은 수량/중량 방식으로 기록하고, 폐수시설에 모아 관리하는 경우
          '폐수배출시설 운영일지'를 선택해 별도 DB에 저장합니다.
        </div>
        <br>

        <form id="form">
          <div class="field">
            <label>발생일</label>
            <input id="entry_date" type="date"
              value="${data?.entry_date||dateKey()}" required>
          </div>

          <div class="field">
            <label>폐기물 종류</label>
            <select id="waste_type_id" required>
              ${types.map(x=>`<option value="${x.id}" ${data?.waste_type_id===x.id?'selected':''}>${esc(typeName(x))}</option>`).join('')}
            </select>
          </div>

          <label class="mode-switch ${editing?'locked':''}" for="facility_mode">
            <input id="facility_mode" type="checkbox"
              ${facilityMode?'checked':''}
              ${editing?'disabled':''}>
            <span>
              <strong>폐수배출시설 운영일지</strong>
              <small>체크하면 폐수 일일입력 방식으로 전환됩니다.</small>
            </span>
          </label>

          ${generalFormHtml(!facilityMode?data:null)}
          ${facilityFormHtml(facilityMode?data:null)}

          <div class="form-actions">
            <button class="btn primary" type="submit">
              ${editing?'수정 저장':'저장'}
            </button>
            ${editing?'<button class="btn" type="button" id="cancel">취소</button>':''}
          </div>
        </form>
      </div>

      <div class="card">
        <div class="section-head">
          <h2>일일입력 현황</h2>
          <div class="spacer"></div>
          <span class="hint">최근 순</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>발생일</th>
                <th>폐기물</th>
                <th>구분</th>
                <th>입력내용</th>
                <th>보관/상태</th>
                <th>비고</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>${combinedRowsHtml()}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  const mode=$('#facility_mode');

  if(!editing){
    mode.onchange=toggleMode;
  }

  if(!facilityMode){
    if(data && editing?.mode==='general'){
      $('#weight_status').value=data.weight_status||'unknown';
    }
  }

  bindFacilityEvents();
  syncModeVisibility();

  $('#form').onsubmit=save;

  if($('#cancel')){
    $('#cancel').onclick=()=>{
      editing=null;
      render();
    };
  }

  document.querySelectorAll('[data-edit-general]').forEach(b=>{
    b.onclick=()=>{
      const row=generalRows.find(r=>r.id===b.dataset.editGeneral);
      editing={mode:'general',data:row};
      render();
    };
  });

  document.querySelectorAll('[data-edit-facility]').forEach(b=>{
    b.onclick=()=>{
      const row=facilityRows.find(r=>r.id===b.dataset.editFacility);
      editing={mode:'facility',data:row};
      render();
    };
  });

  document.querySelectorAll('[data-del-general]').forEach(b=>{
    b.onclick=()=>delGeneral(b.dataset.delGeneral);
  });

  document.querySelectorAll('[data-del-facility]').forEach(b=>{
    b.onclick=()=>delFacility(b.dataset.delFacility);
  });
}

function toggleMode(){
  syncModeVisibility();
}

function syncModeVisibility(){
  const facility=$('#facility_mode')?.checked||false;
  const generalBox=$('#general-fields');
  const facilityBox=$('#facility-fields');

  if(generalBox) generalBox.style.display=facility?'none':'block';
  if(facilityBox) facilityBox.style.display=facility?'block':'none';

  if(facility){
    syncWeekendHolidayFromDate();
    toggleHolidayBox();
    toggleExternalBox();
    updateFacilityPreview();
  }
}

function syncWeekendHolidayFromDate(){
  if(!$('#facility_mode')?.checked)return;

  const date=$('#entry_date')?.value||'';
  const info=weekendInfo(date);
  const holiday=$('#facility_is_holiday');
  const reason=$('#facility_holiday_reason');
  const label=$('#weekend-auto-label');

  if(!holiday||!reason)return;

  if(info.isWeekend){
    holiday.checked=true;
    holiday.disabled=true;
    reason.value=info.reason;
    reason.readOnly=true;
    if(label)label.textContent=`· ${info.reason} 자동`;
  }else{
    holiday.disabled=false;
    reason.readOnly=false;
    if(label)label.textContent='';
  }
}

function bindFacilityEvents(){
  const holiday=$('#facility_is_holiday');
  const external=$('#facility_has_external');

  if(holiday){
    holiday.onchange=()=>{
      toggleHolidayBox();
      updateFacilityPreview();
    };
  }

  if(external){
    external.onchange=()=>{
      toggleExternalBox();
      updateFacilityPreview();
    };
  }

  [
    '#entry_date',
    '#waste_type_id',
    '#facility_usage',
    '#facility_height',
    '#facility_external_ton',
    '#facility_external_cm'
  ].forEach(sel=>{
    const el=$(sel);
    if(!el)return;

    if(sel==='#entry_date'){
      const sync=()=>{
        syncWeekendHolidayFromDate();
        toggleHolidayBox();
        updateFacilityPreview();
      };
      el.oninput=sync;
      el.onchange=sync;
      return;
    }

    el.oninput=updateFacilityPreview;
    if(el.tagName==='SELECT')el.onchange=updateFacilityPreview;
  });

  syncWeekendHolidayFromDate();
}

function toggleHolidayBox(){
  const checked=$('#facility_is_holiday')?.checked||false;
  const box=$('#holiday-box');
  if(box) box.style.display=checked?'block':'none';
}

function toggleExternalBox(){
  const checked=$('#facility_has_external')?.checked||false;
  const box=$('#external-box');
  if(box) box.style.display=checked?'block':'none';
}

function updateFacilityPreview(){
  if(!$('#facility_mode')?.checked)return;

  const date=$('#entry_date')?.value||'';
  const typeId=$('#waste_type_id')?.value||'';
  const isHoliday=effectiveHoliday(
    date,
    $('#facility_is_holiday')?.checked||false,
    $('#facility_holiday_reason')?.value||''
  ).isHoliday;
  const currentId=editing?.mode==='facility'?editing.data?.id:'';

  const prev=previousFacilityUsage(date,typeId,currentId);
  const usageRaw=$('#facility_usage')?.value??'';
  const heightRaw=$('#facility_height')?.value??'';
  const hasExternal=$('#facility_has_external')?.checked||false;
  const externalCmRaw=$('#facility_external_cm')?.value??'';

  const usage=usageRaw===''?null:Number(usageRaw);
  const height=heightRaw===''?null:Number(heightRaw);
  const extCm=hasExternal ? Number(externalCmRaw||0) : 0;

  const used=(!isHoliday && usage!=null && prev!=null) ? usage-prev : null;
  const totalCm=(!isHoliday && height!=null) ? height+extCm : null;

  if($('#pv-prev-usage')){
    $('#pv-prev-usage').textContent=prev==null?'-':`${num(prev,2)} m³`;
  }
  if($('#pv-water-used')){
    $('#pv-water-used').textContent=isHoliday?'휴일':(used==null?'-':`${num(used,2)} m³`);
  }
  if($('#pv-external-cm')){
    $('#pv-external-cm').textContent=isHoliday?'휴일':`${num(extCm,1)} cm`;
  }
  if($('#pv-total-cm')){
    $('#pv-total-cm').textContent=isHoliday?'휴일':(totalCm==null?'-':`${num(totalCm,1)} cm`);
  }
}

async function save(e){
  e.preventDefault();

  const facilityMode=$('#facility_mode').checked;
  const entryDate=$('#entry_date').value;
  const wasteTypeId=$('#waste_type_id').value;

  if(!entryDate)return notice('발생일은 필수입니다.','err');
  if(!wasteTypeId)return notice('폐기물 종류를 선택하세요.','err');

  if(facilityMode){
    const holidayInfo=effectiveHoliday(
      entryDate,
      $('#facility_is_holiday').checked,
      $('#facility_holiday_reason').value
    );
    const isHoliday=holidayInfo.isHoliday;
    const holidayReason=holidayInfo.reason||'';
    const usage=$('#facility_usage').value;
    const height=$('#facility_height').value;
    const note=$('#facility_note').value;
    const hasExternal=$('#facility_has_external').checked;
    const externalTon=$('#facility_external_ton').value;
    const externalCm=$('#facility_external_cm').value;

    if(isHoliday && !holidayReason){
      return notice('휴일 사유를 입력하세요.','err');
    }

    if(!isHoliday && (usage==='' || height==='')){
      return notice('용수 금일 지침과 폐수높이를 입력하세요.','err');
    }

    const p={
      entry_date:entryDate,
      waste_type_id:wasteTypeId,
      usage:isHoliday?0:Number(usage),
      height:isHoliday?0:Number(height),
      is_holiday:isHoliday,
      holiday_reason:isHoliday?holidayReason:null,
      note,
      has_external:isHoliday?false:hasExternal,
      external_ton:isHoliday?0:(hasExternal?Number(externalTon||0):0),
      external_cm:isHoliday?0:(hasExternal?Number(externalCm||0):0)
    };

    const x=editing?.mode==='facility'
      ? await A.update('waste_facility_daily_logs',editing.data.id,p)
      : await A.insert('waste_facility_daily_logs',p);

    if(x.error)return notice(x.error.message,'err');

    editing=null;
    await load();
    notice('폐수배출시설 운영일지를 저장했습니다.');
    return;
  }

  const w=$('#weight_kg').value;
  let status=$('#weight_status').value;
  if(w==='')status='unknown';

  const p={
    entry_date:entryDate,
    waste_type_id:wasteTypeId,
    container_unit_id:$('#container_unit_id').value||null,
    quantity:Number($('#quantity').value||0),
    weight_kg:w===''?null:Number(w),
    weight_status:status,
    storage_location_id:$('#storage_location_id').value||null,
    note:$('#note').value
  };

  const x=editing?.mode==='general'
    ? await A.update('waste_daily_entries',editing.data.id,p)
    : await A.insert('waste_daily_entries',p);

  if(x.error)return notice(x.error.message,'err');

  editing=null;
  await load();
  notice('폐기물 발생기록을 저장했습니다.');
}

async function delGeneral(id){
  if(!confirm('이 발생기록을 삭제하시겠습니까?'))return;
  const x=await A.remove('waste_daily_entries',id);
  if(x.error)return notice(x.error.message,'err');
  await load();
  notice('삭제되었습니다.');
}

async function delFacility(id){
  if(!confirm('이 폐수배출시설 운영일지를 삭제하시겠습니까?'))return;
  const x=await A.remove('waste_facility_daily_logs',id);
  if(x.error)return notice(x.error.message,'err');
  await load();
  notice('삭제되었습니다.');
}

load();

