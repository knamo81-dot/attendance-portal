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
let categories=[];
let selectedCategoryId='';
let editing=null;
let formOpen=false;

function categoryForRow(row){
  if(row.category_id){
    const found=categories.find(c=>c.id===row.category_id);
    if(found)return found;
  }
  return categories.find(c=>c.category_name===row.category)||null;
}

function rowBelongs(row,category){
  if(!category)return false;
  if(row.category_id)return row.category_id===category.id;
  return String(row.category||'').trim()===String(category.category_name||'').trim();
}

function selectedCategory(){
  return categories.find(c=>c.id===selectedCategoryId)||categories[0]||null;
}

async function load(){
  const [c,r]=await Promise.all([
    A.list('waste_reference_categories','*','sort_order',true),
    A.list('waste_reference_materials','*','created_at',false)
  ]);

  if(c.error)return renderError(c.error.message);
  if(r.error)return renderError(r.error.message);

  categories=(c.data||[]).filter(x=>x.active);
  rows=(r.data||[]).filter(x=>x.active!==false);

  if(!selectedCategoryId || !categories.some(x=>x.id===selectedCategoryId)){
    selectedCategoryId=categories[0]?.id||'';
  }
  render();
}

function renderError(message){
  $('#app').innerHTML=`<div class="notice show err">${esc(message)}</div>`;
}

function categoryButtons(){
  if(!categories.length){
    return `<div class="empty">설정된 관련자료 종류가 없습니다.<br>폐기물현황 &gt; 설정에서 먼저 등록해 주세요.</div>`;
  }

  return categories.map(c=>{
    const count=rows.filter(r=>rowBelongs(r,c)).length;
    return `
      <button class="library-category ${c.id===selectedCategoryId?'active':''}" data-category="${c.id}">
        <span>${esc(c.category_name)}</span>
        <b>${count}</b>
      </button>`;
  }).join('');
}

function listRows(){
  const cat=selectedCategory();
  const filtered=cat?rows.filter(r=>rowBelongs(r,cat)):[];
  if(!filtered.length){
    return `<tr><td colspan="5" class="empty">등록된 관련자료가 없습니다.</td></tr>`;
  }

  return filtered.map((r,i)=>`
    <tr>
      <td class="num">${i+1}</td>
      <td>${formatDate(r.created_at)}</td>
      <td>
        <div class="title-cell">
          <strong>${esc(r.title)}</strong>
          ${r.file_path?'<span class="pill amber">첨부</span>':''}
          ${r.content?`<small>${esc(String(r.content).replace(/\s+/g,' ').slice(0,100))}${String(r.content).length>100?'…':''}</small>`:''}
        </div>
      </td>
      <td>${esc(r.created_by||'-')}</td>
      <td>
        <div class="row-actions">
          ${r.file_path?`<a class="btn small" href="${esc(r.file_path)}" target="_blank" rel="noopener">열기</a>`:''}
          <button class="btn small" data-edit="${r.id}">수정</button>
          <button class="btn small danger" data-del="${r.id}">삭제</button>
        </div>
      </td>
    </tr>`).join('');
}

function formModal(){
  if(!formOpen)return '';
  const cat=selectedCategory();
  const currentCat=editing?categoryForRow(editing):cat;

  return `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-card">
        <div class="section-head">
          <h2>📚 관련자료 ${editing?'수정':'글쓰기'}</h2>
          <div class="spacer"></div>
          <button type="button" class="modal-close" id="modal-close">×</button>
        </div>

        <form id="form">
          <div class="field">
            <label>자료 종류</label>
            <select id="category_id" required>
              ${categories.map(c=>`<option value="${c.id}" ${currentCat?.id===c.id?'selected':''}>${esc(c.category_name)}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label>제목</label>
            <input id="title" required value="${esc(editing?.title||'')}">
          </div>

          <div class="field">
            <label>내용</label>
            <textarea id="content" class="content-editor">${esc(editing?.content||'')}</textarea>
          </div>

          <div class="field">
            <label>파일 경로/URL</label>
            <input id="file_path" value="${esc(editing?.file_path||'')}" placeholder="첨부파일 URL 또는 경로">
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
  const cat=selectedCategory();

  $('#app').innerHTML=`
    <div id="notice" class="notice"></div>

    <div class="card library-card">
      <div class="section-head library-head">
        <div>
          <h2>📚 관련자료</h2>
          <div class="hint">외부 점검 대응자료, Q&A, 운영 매뉴얼 등 참고자료를 종류별로 관리합니다.</div>
        </div>
        <div class="spacer"></div>
        <button class="btn primary" id="write" ${categories.length?'':'disabled'}>글쓰기</button>
      </div>

      <div class="library-layout">
        <aside class="library-sidebar">
          ${categoryButtons()}
        </aside>

        <section class="library-content">
          <div class="library-list-head">
            <strong>${cat?esc(cat.category_name):'관련자료'}</strong>
            <span class="hint">${cat?rows.filter(r=>rowBelongs(r,cat)).length:0}건</span>
          </div>

          <div class="table-wrap">
            <table class="library-table">
              <thead>
                <tr>
                  <th style="width:70px">순번</th>
                  <th style="width:130px">작성일</th>
                  <th>제목</th>
                  <th style="width:200px">작성자</th>
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

  document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{
    selectedCategoryId=b.dataset.category;
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
    const catForEdit=editing?categoryForRow(editing):null;
    if(catForEdit)selectedCategoryId=catForEdit.id;
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

  const categoryId=$('#category_id').value;
  const category=categories.find(c=>c.id===categoryId);
  if(!category)return notice('자료 종류를 선택하세요.','err');

  const p={
    category_id:category.id,
    category:category.category_name,
    title:$('#title').value.trim(),
    content:$('#content').value,
    file_path:$('#file_path').value.trim()||null,
    active:true
  };

  const x=editing
    ? await A.update('waste_reference_materials',editing.id,p)
    : await A.insert('waste_reference_materials',p);

  if(x.error)return notice(x.error.message,'err');

  selectedCategoryId=category.id;
  editing=null;
  formOpen=false;
  await load();
  notice('저장되었습니다.');
}

async function del(id){
  if(!confirm('삭제하시겠습니까?'))return;
  const x=await A.remove('waste_reference_materials',id);
  if(x.error)return notice(x.error.message,'err');
  await load();
  notice('삭제되었습니다.');
}

load();
