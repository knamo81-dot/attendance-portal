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

let types=[],units=[],vendors=[],collections=[];
async function load(){const [t,u,v,c]=await Promise.all([A.list('waste_types','*','sort_order',true),A.list('waste_container_units','*','sort_order',true),A.list('waste_vendors','*','vendor_name',true),A.list('waste_collections','*,processor:waste_vendors!waste_collections_processor_vendor_id_fkey(*),transporter:waste_vendors!waste_collections_transporter_vendor_id_fkey(*),waste_collection_items(*,waste_types(*),waste_container_units(*))','collection_date',false)]);types=(t.data||[]).filter(x=>x.active);units=(u.data||[]).filter(x=>x.active);vendors=(v.data||[]).filter(x=>x.active);collections=c.data||[];render();}
function itemRow(i=0){return `<div class="soft item" data-i="${i}"><div class="inline"><div class="field"><label>폐기물 종류</label><select class="itype">${types.map(x=>`<option value="${x.id}">${esc(typeName(x))}</option>`).join('')}</select></div><div class="field"><label>용기</label><select class="iunit"><option value="">선택 안함</option>${units.map(x=>`<option value="${x.id}">${esc(x.unit_name)}</option>`).join('')}</select></div></div><div class="inline"><div class="field"><label>개수/수량</label><input class="iqty" type="number" min="0" step="0.001" value="0"></div><div class="field"><label>실제 양 (T)</label><input class="iton" type="number" min="0" step="0.000001" placeholder="예: 0.0725"></div></div><button type="button" class="btn small danger remove-item">항목 삭제</button></div>`}
function render(){const processors=vendors.filter(v=>v.is_processor),transporters=vendors.filter(v=>v.is_transporter);$('#app').innerHTML=`<div id="notice" class="notice"></div><div class="grid two"><div class="card"><div class="card-title">🚚 폐기물 수거등록</div><form id="form"><div class="field"><label>수거일</label><input id="collection_date" type="date" value="${dateKey()}" required></div><div class="field"><label>확인서 일련번호</label><input id="certificate_no"></div><div class="field"><label>처리방법</label><select id="treatment_method"><option value="위탁처리" selected>위탁처리</option><option value="직접처리">직접처리</option></select></div><div id="vendor-fields"><div class="field"><label>처리업소</label><select id="processor_vendor_id"><option value="">선택 안함</option>${processors.map(v=>`<option value="${v.id}">${esc(v.vendor_name)}</option>`).join('')}</select></div><div class="field"><label>운반업체</label><select id="transporter_vendor_id"><option value="">선택 안함</option>${transporters.map(v=>`<option value="${v.id}">${esc(v.vendor_name)}</option>`).join('')}</select></div></div><div id="direct-hint" class="hint" style="display:none;margin:-2px 0 12px;">직접처리는 외부 처리업소·운반업체를 입력하지 않습니다.</div><div class="section-head"><h2>폐기물별 수거량</h2><div class="spacer"></div><button class="btn small" type="button" id="add-item">+ 항목 추가</button></div><div id="items">${itemRow(0)}</div><br><div class="field"><label>비고</label><textarea id="note"></textarea></div><button class="btn primary" type="submit">수거 등록 저장</button></form></div><div class="card"><div class="card-title">📋 수거내역</div><div class="table-wrap"><table><thead><tr><th>수거일</th><th>처리방법</th><th>확인서</th><th>처리업소</th><th>운반업체</th><th>폐기물 내역</th><th>총 중량</th><th>관리</th></tr></thead><tbody>${collections.length?collections.map(r=>{const its=r.waste_collection_items||[];return `<tr><td>${r.collection_date}</td><td>${esc(r.treatment_method||'위탁처리')}</td><td>${esc(r.certificate_no||'-')}</td><td>${esc(r.processor?.vendor_name||'-')}</td><td>${esc(r.transporter?.vendor_name||'-')}</td><td>${its.map(x=>`${esc(typeName(x.waste_types||{}))} ${num(x.quantity,0)}${esc(x.waste_container_units?.quantity_unit||'개')}`).join('<br>')}</td><td class="num">${num(its.reduce((s,x)=>s+Number(x.weight_kg||0),0)/1000,4)} T</td><td><button class="btn small danger" data-del="${r.id}">삭제</button></td></tr>`}).join(''):`<tr><td colspan="8" class="empty">수거내역이 없습니다.</td></tr>`}</tbody></table></div></div></div>`;$('#add-item').onclick=()=>{const box=$('#items');box.insertAdjacentHTML('beforeend',itemRow(box.children.length));bindItems()};$('#treatment_method').onchange=syncTreatmentUI;syncTreatmentUI();bindItems();$('#form').onsubmit=save;document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>del(b.dataset.del));}
function syncTreatmentUI(){const method=$('#treatment_method')?.value||'위탁처리';const isDirect=method==='직접처리';const box=$('#vendor-fields');const hint=$('#direct-hint');const p=$('#processor_vendor_id');const t=$('#transporter_vendor_id');if(box)box.style.display=isDirect?'none':'block';if(hint)hint.style.display=isDirect?'block':'none';if(p){p.disabled=isDirect;if(isDirect)p.value='';}if(t){t.disabled=isDirect;if(isDirect)t.value='';}}
function bindItems(){document.querySelectorAll('.remove-item').forEach(b=>b.onclick=()=>{if(document.querySelectorAll('.item').length<=1)return notice('폐기물 항목은 최소 1개 필요합니다.','err');b.closest('.item').remove()})}
async function save(e){e.preventDefault();const itemEls=[...document.querySelectorAll('.item')];const items=itemEls.map(el=>({waste_type_id:el.querySelector('.itype').value,container_unit_id:el.querySelector('.iunit').value||null,quantity:Number(el.querySelector('.iqty').value||0),weight_kg:el.querySelector('.iton').value===''?null:Number(el.querySelector('.iton').value)*1000})).filter(x=>x.quantity>0||x.weight_kg>0);if(!items.length)return notice('수거 폐기물을 1개 이상 입력하세요.','err');const method=$('#treatment_method').value||'위탁처리';const head={collection_date:$('#collection_date').value,certificate_no:$('#certificate_no').value,processor_vendor_id:method==='위탁처리'?($('#processor_vendor_id').value||null):null,transporter_vendor_id:method==='위탁처리'?($('#transporter_vendor_id').value||null):null,treatment_method:method,note:$('#note').value};const h=await A.insert('waste_collections',head);if(h.error)return notice(h.error.message,'err');for(const it of items){const x=await A.insert('waste_collection_items',{...it,collection_id:h.data.id});if(x.error)return notice('수거 상세 저장 중 오류: '+x.error.message,'err')}await load();notice('수거등록을 저장했습니다.');}
async function del(id){if(!confirm('수거건과 상세내역을 삭제하시겠습니까?'))return;const x=await A.remove('waste_collections',id);if(x.error)return notice(x.error.message,'err');await load();notice('삭제되었습니다.');}
load();

