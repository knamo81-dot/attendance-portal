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
  async function list(table,select='*',orderCol='created_at',ascending=false){
    let q=sb.from(table).select(select);
    const cid=companyId();
    if(cid) q=q.eq('company_id',cid);
    if(orderCol) q=q.order(orderCol,{ascending});
    return q;
  }
  async function insert(table,payload){
    const cid=companyId();
    const row={...payload,company_id:payload.company_id||cid,created_by:payload.created_by||userEmail()||null};
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
const esc=(v)=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
function notice(msg,type='ok'){
  const el=$('#notice');
  if(!el)return;
  el.textContent=msg;
  el.className='notice show '+type;
  setTimeout(()=>el.classList.remove('show'),3500);
}
function formatDate(v){
  if(!v)return '-';
  const s=String(v).slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[1]}. ${Number(m[2])}. ${Number(m[3])}.`:s;
}

let rows=[];
let types=[];
let vendors=[];
let selectedTypeId='';
let editing=null;
let formOpen=false;

function typeForRow(row){
  if(row.document_type_id){
    const found=types.find(t=>t.id===row.document_type_id);
    if(found)return found;
  }
  return types.find(t=>t.type_name===row.document_type)||null;
}

function rowBelongs(row,type){
  if(!type)return false;
  if(row.document_type_id)return row.document_type_id===type.id;
  return String(row.document_type||'').trim()===String(type.type_name||'').trim();
}

function selectedType(){
  return types.find(t=>t.id===selectedTypeId)||types[0]||null;
}

async function load(){
  const [t,d,v]=await Promise.all([
    A.list('waste_document_types','*','sort_order',true),
    A.list('waste_documents','*,waste_vendors(*)','created_at',false),
    A.list('waste_vendors','*','vendor_name',true)
  ]);

  if(t.error)return renderError(t.error.message);
  if(d.error)return renderError(d.error.message);
  if(v.error)return renderError(v.error.message);

  types=(t.data||[]).filter(x=>x.active);
  rows=d.data||[];
  vendors=(v.data||[]).filter(x=>x.active);

  if(!selectedTypeId || !types.some(x=>x.id===selectedTypeId)){
    selectedTypeId=types[0]?.id||'';
  }
  render();
}

function renderError(message){
  $('#app').innerHTML=`<div class="notice show err">${esc(message)}</div>`;
}

function typeButtons(){
  if(!types.length){
    return `<div class="empty">설정된 관련서류 종류가 없습니다.<br>폐기물현황 &gt; 설정에서 먼저 등록해 주세요.</div>`;
  }

  return types.map(t=>{
    const count=rows.filter(r=>rowBelongs(r,t)).length;
    return `
      <button class="library-category ${t.id===selectedTypeId?'active':''}" data-type="${t.id}">
        <span>${esc(t.type_name)}</span>
        <b>${count}</b>
      </button>`;
  }).join('');
}

function listRows(){
  const type=selectedType();
  const filtered=type?rows.filter(r=>rowBelongs(r,type)):[];
  if(!filtered.length){
    return `<tr><td colspan="7" class="empty">등록된 관련서류가 없습니다.</td></tr>`;
  }

  return filtered.map((r,i)=>{
    const expired=r.expiry_date && String(r.expiry_date)<new Date().toISOString().slice(0,10);
    return `
      <tr>
        <td class="num">${i+1}</td>
        <td>${formatDate(r.issue_date||r.created_at)}</td>
        <td>
          <div class="title-cell">
            <strong>${esc(r.title)}</strong>
            ${r.file_path?'<span class="pill amber">첨부</span>':''}
            ${r.note?`<small>${esc(String(r.note).replace(/\s+/g,' ').slice(0,90))}${String(r.note).length>90?'…':''}</small>`:''}
          </div>
        </td>
        <td>${esc(r.waste_vendors?.vendor_name||'-')}</td>
        <td class="${expired?'warning':''}">${r.expiry_date?formatDate(r.expiry_date):'-'}</td>
        <td>${esc(r.created_by||'-')}</td>
        <td>
          <div class="row-actions">
            ${r.file_path?`<a class="btn small" href="${esc(r.file_path)}" target="_blank" rel="noopener">열기</a>`:''}
            <button class="btn small" data-edit="${r.id}">수정</button>
            <button class="btn small danger" data-del="${r.id}">삭제</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function formModal(){
  if(!formOpen)return '';

  const selected=selectedType();
  const currentType=editing?typeForRow(editing):selected;

  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-card">
        <div class="section-head">
          <h2>📁 관련서류 ${editing?'수정':'글쓰기'}</h2>
          <div class="spacer"></div>
          <button type="button" class="modal-close" id="modal-close">×</button>
        </div>

        <form id="form">
          <div class="field">
            <label>서류 종류</label>
            <select id="document_type_id" required>
              ${types.map(t=>`<option value="${t.id}" ${currentType?.id===t.id?'selected':''}>${esc(t.type_name)}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label>제목</label>
            <input id="title" required value="${esc(editing?.title||'')}">
          </div>

          <div class="field">
            <label>관련 업체</label>
            <select id="vendor_id">
              <option value="">없음</option>
              ${vendors.map(v=>`<option value="${v.id}" ${editing?.vendor_id===v.id?'selected':''}>${esc(v.vendor_name)}</option>`).join('')}
            </select>
          </div>

          <div class="inline">
            <div class="field">
              <label>발급일</label>
              <input id="issue_date" type="date" value="${editing?.issue_date||''}">
            </div>
            <div class="field">
              <label>유효기간</label>
              <input id="expiry_date" type="date" value="${editing?.expiry_date||''}">
            </div>
          </div>

          <div class="field">
            <label>파일 경로/URL</label>
            <input id="file_path" value="${esc(editing?.file_path||'')}" placeholder="첨부파일 URL 또는 경로">
          </div>

          <div class="field">
            <label>비고</label>
            <textarea id="note">${esc(editing?.note||'')}</textarea>
          </div>

          <div class="modal-actions">
            <button class="btn primary" type="submit">${editing?'수정 저장':'저장'}</button>
            <button class="btn" type="button" id="cancel">취소</button>
          </div>
        </form>
      </div>
    </div>`;
}

function render(){
  const type=selectedType();

  $('#app').innerHTML=`
    <div id="notice" class="notice"></div>

    <div class="card library-card">
      <div class="section-head library-head">
        <div>
          <h2>📁 관련서류</h2>
          <div class="hint">허가증, 사업자등록증, 계약서, 교육확인서 등 증빙서류를 종류별로 관리합니다.</div>
        </div>
        <div class="spacer"></div>
        <button class="btn primary" id="write" ${types.length?'':'disabled'}>글쓰기</button>
      </div>

      <div class="library-layout">
        <aside class="library-sidebar">
          ${typeButtons()}
        </aside>

        <section class="library-content">
          <div class="library-list-head">
            <strong>${type?esc(type.type_name):'관련서류'}</strong>
            <span class="hint">${type?rows.filter(r=>rowBelongs(r,type)).length:0}건</span>
          </div>

          <div class="table-wrap">
            <table class="library-table">
              <thead>
                <tr>
                  <th style="width:70px">순번</th>
                  <th style="width:130px">발급일</th>
                  <th>제목</th>
                  <th style="width:190px">관련 업체</th>
                  <th style="width:130px">유효기간</th>
                  <th style="width:190px">작성자</th>
                  <th style="width:190px">작업</th>
                </tr>
              </thead>
              <tbody>${listRows()}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    ${formModal()}`;

  document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{
    selectedTypeId=b.dataset.type;
    editing=null;
    formOpen=false;
    render();
  });

  if($('#write'))$('#write').onclick=()=>{
    editing=null;
    formOpen=true;
    render();
  };

  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    editing=rows.find(r=>r.id===b.dataset.edit)||null;
    const typeForEdit=editing?typeForRow(editing):null;
    if(typeForEdit)selectedTypeId=typeForEdit.id;
    formOpen=true;
    render();
  });

  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>del(b.dataset.del));

  if($('#modal-close'))$('#modal-close').onclick=closeForm;
  if($('#cancel'))$('#cancel').onclick=closeForm;
  if($('#modal-backdrop'))$('#modal-backdrop').onclick=e=>{
    if(e.target.id==='modal-backdrop')closeForm();
  };
  if($('#form'))$('#form').onsubmit=save;
}

function closeForm(){
  editing=null;
  formOpen=false;
  render();
}

async function save(e){
  e.preventDefault();

  const typeId=$('#document_type_id').value;
  const type=types.find(t=>t.id===typeId);
  if(!type)return notice('서류 종류를 선택하세요.','err');

  const p={
    document_type_id:type.id,
    document_type:type.type_name,
    title:$('#title').value.trim(),
    vendor_id:$('#vendor_id').value||null,
    issue_date:$('#issue_date').value||null,
    expiry_date:$('#expiry_date').value||null,
    file_path:$('#file_path').value.trim()||null,
    note:$('#note').value
  };

  const x=editing
    ? await A.update('waste_documents',editing.id,p)
    : await A.insert('waste_documents',p);

  if(x.error)return notice(x.error.message,'err');

  selectedTypeId=type.id;
  editing=null;
  formOpen=false;
  await load();
  notice('저장되었습니다.');
}

async function del(id){
  if(!confirm('삭제하시겠습니까?'))return;
  const x=await A.remove('waste_documents',id);
  if(x.error)return notice(x.error.message,'err');
  await load();
  notice('삭제되었습니다.');
}

load();

