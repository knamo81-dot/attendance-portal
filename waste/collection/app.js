const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXJhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

(function(){
  function portalSession(){
    try{if(window.parent&&window.parent!==window&&typeof window.parent.getPortalSession==='function')return window.parent.getPortalSession()||{};}catch(e){}
    try{if(window.parent&&window.parent!==window&&window.parent.portalSession)return window.parent.portalSession||{};}catch(e){}
    return window.portalSession||window.currentPortalSession||{};
  }
  function rawClient(){
    const s=portalSession();
    if(s&&s.supabase)return s.supabase;
    try{if(window.parent&&window.parent!==window&&window.parent.portalSupabase)return window.parent.portalSupabase;}catch(e){}
    if(window.portalSupabase)return window.portalSupabase;
    if(window.supabase&&typeof window.supabase.createClient==='function'){
      window.portalSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
      return window.portalSupabase;
    }
    throw new Error('Supabase client 초기화 실패');
  }
  function companyId(){
    const s=portalSession();
    const c=s.activeCompany||s.active_company||s.selectedCompany||s.company||{};
    const v=s.activeCompanyId||s.active_company_id||s.selectedCompanyId||s.selected_company_id||c.id||c.company_id||s.companyId||s.company_id||s.profile?.company_id||window.currentCompanyId||'';
    if(v)return String(v).trim();
    try{const p=new URLSearchParams(location.search);return String(p.get('company_id')||p.get('companyId')||'').trim();}catch(e){return '';}
  }
  function userEmail(){const s=portalSession();return String(s.email||s.user?.email||s.profile?.email||'').trim();}
  const sb=rawClient();
  async function list(table,select='*',orderCol='created_at',ascending=false){
    let q=sb.from(table).select(select);const cid=companyId();if(cid)q=q.eq('company_id',cid);if(orderCol)q=q.order(orderCol,{ascending});return q;
  }
  async function insert(table,payload){
    const cid=companyId();const row={...payload,company_id:payload.company_id||cid,created_by:payload.created_by||userEmail()||null};
    return sb.from(table).insert([row]).select('*').single();
  }
  async function update(table,id,payload){
    let q=sb.from(table).update(payload).eq('id',id);const cid=companyId();if(cid)q=q.eq('company_id',cid);return q.select('*').single();
  }
  async function remove(table,id){
    let q=sb.from(table).delete().eq('id',id);const cid=companyId();if(cid)q=q.eq('company_id',cid);return q;
  }
  async function removeWhere(table,column,value){
    let q=sb.from(table).delete().eq(column,value);const cid=companyId();if(cid)q=q.eq('company_id',cid);return q;
  }
  window.wasteApi={sb,portalSession,companyId,userEmail,list,insert,update,remove,removeWhere};
})();

const A=window.wasteApi;
const $=(s)=>document.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const num=(v,d=2)=>Number(v||0).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
function notice(msg,type='ok'){const el=$('#notice');if(!el)return;el.textContent=msg;el.className='notice show '+type;setTimeout(()=>el.classList.remove('show'),3500)}
function typeName(r){return r.display_name||`${r.legal_name||''}${r.physical_state==='liquid'?'(액상)':r.physical_state==='solid'?'(고상)':''}`}
function dateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

let types=[],units=[],vendors=[],methods=[],collections=[];
let editingId=null;

async function load(){
  const [t,u,v,m,c]=await Promise.all([
    A.list('waste_types','*','sort_order',true),
    A.list('waste_container_units','*','sort_order',true),
    A.list('waste_vendors','*','vendor_name',true),
    A.list('waste_vendor_treatment_methods','*','sort_order',true),
    A.list(
      'waste_collections',
      '*,waste_collection_items(*,waste_types(*),waste_container_units(*),processor:waste_vendors!waste_collection_items_processor_vendor_id_fkey(*),transporter:waste_vendors!waste_collection_items_transporter_vendor_id_fkey(*),treatment_method:waste_vendor_treatment_methods!waste_collection_items_treatment_method_id_fkey(*))',
      'collection_date',
      false
    )
  ]);

  types=(t.data||[]).filter(x=>x.active);
  units=(u.data||[]).filter(x=>x.active);
  vendors=(v.data||[]).filter(x=>x.active);
  methods=(m.data||[]).filter(x=>x.active);
  collections=c.data||[];
  render();
}

function processorOptions(selected=''){
  return vendors.filter(v=>v.is_processor).map(v=>`<option value="${v.id}" ${v.id===selected?'selected':''}>${esc(v.vendor_name)}</option>`).join('');
}
function transporterOptions(selected=''){
  return vendors.filter(v=>v.is_transporter).map(v=>`<option value="${v.id}" ${v.id===selected?'selected':''}>${esc(v.vendor_name)}</option>`).join('');
}
function allMethodOptions(){
  const seen=new Set();
  return methods.filter(m=>{
    const key=String(m.method_name||'').trim().toLowerCase();
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  }).map(m=>`<option value="${m.id}">${esc(m.method_name)}</option>`).join('');
}

function itemRow(i=0,data=null){
  const row=data||{};
  const selectedType=row.waste_type_id||row.waste_types?.id||types[0]?.id||'';
  const selectedUnit=row.container_unit_id||row.waste_container_units?.id||'';
  const qty=row.quantity==null?0:Number(row.quantity);
  const ton=row.weight_kg==null?'':Number(row.weight_kg)/1000;

  return `
    <div class="soft item" data-i="${i}">
      <div class="inline">
        <div class="field">
          <label>폐기물 종류</label>
          <select class="itype">${types.map(x=>`<option value="${x.id}" ${x.id===selectedType?'selected':''}>${esc(typeName(x))}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>용기</label>
          <select class="iunit"><option value="">선택 안함</option>${units.map(x=>`<option value="${x.id}" ${x.id===selectedUnit?'selected':''}>${esc(x.unit_name)}</option>`).join('')}</select>
        </div>
      </div>

      <div class="inline">
        <div class="field">
          <label>개수/수량</label>
          <input class="iqty" type="number" min="0" step="0.001" value="${qty}">
        </div>
        <div class="field">
          <label>실제 양 (T)</label>
          <input class="iton" type="number" min="0" step="0.000001" value="${ton}" placeholder="예: 0.0725">
        </div>
      </div>

      <div class="facility-field-slot"></div>

      <button type="button" class="btn small danger remove-item">항목 삭제</button>
    </div>`;
}

function render(){
  const editRow=editingId?collections.find(x=>x.id===editingId)||null:null;
  const editItems=editRow?.waste_collection_items||[];
  const firstItem=editItems[0]||{};
  const initialItems=editItems.length?editItems:[null];

  $('#app').innerHTML=`
    <div id="notice" class="notice"></div>
    <div class="grid two">
      <div class="card">
        <div class="card-title">🚚 ${editRow?'폐기물 수거수정':'폐기물 수거등록'}</div>

        <form id="form">
          <div class="field">
            <label>수거일</label>
            <input id="collection_date" type="date" value="${editRow?.collection_date||dateKey()}" required>
          </div>
          <div class="field">
            <label>확인서 일련번호</label>
            <input id="certificate_no" value="${esc(editRow?.certificate_no||'')}">
          </div>

          <label class="facility-log-switch" for="is_facility_log">
            <input id="is_facility_log" type="checkbox" ${editRow?.is_facility_log?'checked':''}>
            <span>
              <strong>폐수배출시설 운영일지</strong>
              <small>체크한 수거건만 폐기물용 폐수배출시설 운영일지에 반영됩니다.</small>
            </span>
          </label>

          <div class="inline">
            <div class="field">
              <label>처리구분</label>
              <select id="treatment_type">
                <option value="outsourced">위탁처리</option>
                <option value="self">자가처리</option>
              </select>
            </div>
            <div class="field">
              <label>운반업체</label>
              <select id="transporter_vendor_id">
                <option value="">선택 안함</option>
                ${transporterOptions()}
              </select>
            </div>
          </div>

          <div class="inline">
            <div class="field">
              <label>처리업소</label>
              <select id="processor_vendor_id">
                <option value="">선택 안함</option>
                ${processorOptions()}
              </select>
            </div>
            <div class="field">
              <label>처리방법</label>
              <select id="treatment_method_id">
                <option value="">처리업소를 먼저 선택</option>
              </select>
            </div>
          </div>

          <div id="treatment-hint" class="hint" style="margin:-4px 0 12px;"></div>

          <div class="section-head">
            <h2>폐기물별 수거량 및 처리정보</h2>
            <div class="spacer"></div>
            <button class="btn small" type="button" id="add-item">+ 항목 추가</button>
          </div>

          <div id="items">${initialItems.map((x,i)=>itemRow(i,x)).join('')}</div>

          <br>
          <div class="field"><label>비고</label><textarea id="note">${esc(editRow?.note||'')}</textarea></div>
          <div class="form-actions">
            <button class="btn primary" type="submit">${editRow?'수거 수정 저장':'수거 등록 저장'}</button>
            ${editRow?'<button class="btn" type="button" id="cancel-edit">수정 취소</button>':''}
          </div>
        </form>
      </div>

      <div class="card">
        <div class="card-title">📋 수거내역</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>수거일</th>
                <th>확인서</th>
                <th>운영일지</th>
                <th>폐기물</th>
                <th>처리구분</th>
                <th>처리방법</th>
                <th>처리업소</th>
                <th>운반업체</th>
                <th>중량</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              ${collections.length?collections.flatMap(r=>{
                const its=r.waste_collection_items||[];
                if(!its.length){
                  return [`<tr><td>${r.collection_date}</td><td>${esc(r.certificate_no||'-')}</td><td>${r.is_facility_log?`<span class="pill green">반영</span><br><span class="muted">${esc(r.facility_after_cm||'-')} cm</span>`:'-'}</td><td colspan="6" class="muted">상세내역 없음</td><td><div class="row-actions"><button class="btn small" data-edit="${r.id}">수정</button><button class="btn small danger" data-del="${r.id}">삭제</button></div></td></tr>`];
                }
                return its.map((x,idx)=>`
                  <tr>
                    <td>${idx===0?r.collection_date:''}</td>
                    <td>${idx===0?esc(r.certificate_no||'-'):''}</td>
                    <td>${idx===0?(r.is_facility_log?`<span class="pill green">반영</span><br><span class="muted">${esc(r.facility_after_cm||'-')}${r.facility_after_cm?' cm':''}</span>`:'-'):''}</td>
                    <td>${esc(typeName(x.waste_types||{}))}<br><span class="muted">${num(x.quantity,0)}${esc(x.waste_container_units?.quantity_unit||'개')}</span></td>
                    <td>${x.treatment_type==='self'?'자가처리':'위탁처리'}</td>
                    <td>${esc(x.treatment_method?.method_name||'-')}</td>
                    <td>${esc(x.processor?.vendor_name||'-')}</td>
                    <td>${esc(x.transporter?.vendor_name||'-')}</td>
                    <td class="num">${x.weight_kg==null?'-':num(Number(x.weight_kg)/1000,4)+' T'}</td>
                    <td>${idx===0?`<div class="row-actions"><button class="btn small" data-edit="${r.id}">수정</button><button class="btn small danger" data-del="${r.id}">삭제</button></div>`:''}</td>
                  </tr>`);
              }).join(''):`<tr><td colspan="10" class="empty">수거내역이 없습니다.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  $('#add-item').onclick=()=>{
    const box=$('#items');
    box.insertAdjacentHTML('beforeend',itemRow(box.children.length));
    bindItems();
    syncFacilityLogUI();
  };
  $('#treatment_type').onchange=syncCommonTreatment;
  $('#processor_vendor_id').onchange=syncCommonTreatment;
  $('#is_facility_log').onchange=syncFacilityLogUI;

  if(editRow){
    const treatmentType=firstItem.treatment_type||'outsourced';
    $('#treatment_type').value=treatmentType;
    $('#processor_vendor_id').value=firstItem.processor_vendor_id||firstItem.processor?.id||'';
    $('#transporter_vendor_id').value=firstItem.transporter_vendor_id||firstItem.transporter?.id||'';
    facilityAfterCache=String(editRow.facility_after_cm||'');
  }else{
    facilityAfterCache='';
  }

  syncCommonTreatment();

  if(editRow){
    $('#treatment_method_id').value=firstItem.treatment_method_id||firstItem.treatment_method?.id||'';
  }

  syncFacilityLogUI();
  bindItems();
  $('#form').onsubmit=save;

  if($('#cancel-edit')){
    $('#cancel-edit').onclick=()=>{
      editingId=null;
      facilityAfterCache='';
      render();
    };
  }

  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>startEdit(b.dataset.edit));
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>del(b.dataset.del));
}

function startEdit(id){
  const row=collections.find(x=>x.id===id);
  if(!row)return notice('수정할 수거건을 찾을 수 없습니다.','err');
  editingId=id;
  facilityAfterCache=String(row.facility_after_cm||'');
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}

function methodsForVendor(vendorId){
  return methods.filter(m=>m.vendor_id===vendorId&&m.active);
}

let facilityAfterCache='';

function syncFacilityLogUI(){
  const checked=$('#is_facility_log')?.checked||false;

  const existing=$('#facility_after_cm');
  if(existing) facilityAfterCache=existing.value;

  const slots=[...document.querySelectorAll('.facility-field-slot')];
  slots.forEach(slot=>slot.innerHTML='');

  if(!checked){
    facilityAfterCache='';
    return;
  }

  const firstSlot=slots[0];
  if(!firstSlot)return;

  firstSlot.innerHTML=`
    <div class="field facility-inline-field">
      <label>수거 후 높이 (괄호값, cm)</label>
      <input id="facility_after_cm" type="text"
        value="${esc(facilityAfterCache)}"
        placeholder="예: 0.0 또는 over 154">
    </div>`;
}

function syncCommonTreatment(){
  const type=$('#treatment_type')?.value||'outsourced';
  const processor=$('#processor_vendor_id');
  const transporter=$('#transporter_vendor_id');
  const method=$('#treatment_method_id');
  const hint=$('#treatment-hint');

  if(!processor||!transporter||!method)return;

  if(type==='self'){
    processor.disabled=true;
    transporter.disabled=true;
    processor.value='';
    transporter.value='';
    method.disabled=false;
    method.innerHTML=`<option value="">선택 안함</option>${allMethodOptions()}`;
    if(hint)hint.textContent='자가처리는 처리업소·운반업체 없이 처리방법만 선택합니다.';
    return;
  }

  processor.disabled=false;
  transporter.disabled=false;

  const vendorId=processor.value;
  const list=methodsForVendor(vendorId);

  method.disabled=!vendorId;
  method.innerHTML=vendorId
    ? `<option value="">선택</option>${list.map(m=>`<option value="${m.id}">${esc(m.method_name)}</option>`).join('')}`
    : `<option value="">처리업소를 먼저 선택</option>`;

  if(hint){
    hint.textContent=vendorId&&!list.length
      ? '선택한 처리업체에 등록된 처리방법이 없습니다. 설정 > 업체에서 처리방법을 추가해 주세요.'
      : '';
  }
}

function bindItems(){
  document.querySelectorAll('.remove-item').forEach(b=>b.onclick=()=>{
    if(document.querySelectorAll('.item').length<=1)return notice('폐기물 항목은 최소 1개 필요합니다.','err');
    const current=$('#facility_after_cm');
    if(current) facilityAfterCache=current.value;
    b.closest('.item').remove();
    syncFacilityLogUI();
  });
}

async function save(e){
  e.preventDefault();

  const treatmentType=$('#treatment_type').value||'outsourced';
  const processor=$('#processor_vendor_id').value||null;
  const method=$('#treatment_method_id').value||null;
  const transporter=$('#transporter_vendor_id').value||null;

  if(treatmentType==='outsourced'&&!processor){
    return notice('위탁처리는 처리업소를 선택하세요.','err');
  }
  if(!method){
    return notice('처리방법을 선택하세요.','err');
  }

  const itemEls=[...document.querySelectorAll('.item')];
  const items=[];

  for(const el of itemEls){
    const qty=Number(el.querySelector('.iqty').value||0);
    const tonEl=el.querySelector('.iton');
    const weightKg=tonEl.value===''?null:Number(tonEl.value)*1000;

    if(!(qty>0||Number(weightKg)>0))continue;

    items.push({
      waste_type_id:el.querySelector('.itype').value,
      container_unit_id:el.querySelector('.iunit').value||null,
      quantity:qty,
      weight_kg:weightKg,
      treatment_type:treatmentType,
      processor_vendor_id:treatmentType==='outsourced'?processor:null,
      treatment_method_id:method,
      transporter_vendor_id:treatmentType==='outsourced'?transporter:null
    });
  }

  if(!items.length)return notice('수거 폐기물을 1개 이상 입력하세요.','err');

  const facilityLog=$('#is_facility_log').checked;
  const facilityAfterCm=facilityLog
    ? String($('#facility_after_cm')?.value||'').trim()
    : '';

  const head={
    collection_date:$('#collection_date').value,
    certificate_no:$('#certificate_no').value,
    is_facility_log:facilityLog,
    facility_after_cm:facilityLog?(facilityAfterCm||null):null,
    processor_vendor_id:null,
    transporter_vendor_id:null,
    treatment_method:null,
    note:$('#note').value
  };

  if(editingId){
    const h=await A.update('waste_collections',editingId,head);
    if(h.error)return notice('수거정보 수정 오류: '+h.error.message,'err');

    const rm=await A.removeWhere('waste_collection_items','collection_id',editingId);
    if(rm.error)return notice('기존 수거 상세 정리 오류: '+rm.error.message,'err');

    for(const it of items){
      const x=await A.insert('waste_collection_items',{...it,collection_id:editingId});
      if(x.error)return notice('수거 상세 수정 중 오류: '+x.error.message,'err');
    }

    editingId=null;
    facilityAfterCache='';
    await load();
    notice('수거등록을 수정했습니다.');
    return;
  }

  const h=await A.insert('waste_collections',head);
  if(h.error)return notice(h.error.message,'err');

  for(const it of items){
    const x=await A.insert('waste_collection_items',{...it,collection_id:h.data.id});
    if(x.error)return notice('수거 상세 저장 중 오류: '+x.error.message,'err');
  }

  await load();
  notice('수거등록을 저장했습니다.');
}

async function del(id){
  if(!confirm('수거건과 상세내역을 삭제하시겠습니까?'))return;
  const x=await A.remove('waste_collections',id);
  if(x.error)return notice(x.error.message,'err');
  if(editingId===id)editingId=null;
  facilityAfterCache='';
  await load();
  notice('삭제되었습니다.');
}

load();
