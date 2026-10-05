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
const STORAGE_BUCKET='waste-editor-files';

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
function uid(){
  if(window.crypto?.randomUUID)return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);
  });
}
function safeFileName(name){
  return String(name||'file').normalize('NFKC').replace(/[^\w가-힣.\-() ]+/g,'_').replace(/\s+/g,'_').slice(0,120);
}
function plainTextFromHtml(html){
  const d=document.createElement('div');
  d.innerHTML=String(html||'');
  return (d.textContent||'').replace(/\s+/g,' ').trim();
}
function looksLikeHtml(v){
  return /<\/?[a-z][\s\S]*>/i.test(String(v||''));
}
function legacyOrHtml(v){
  if(!v)return '<p></p>';
  if(looksLikeHtml(v))return sanitizeHtml(v,true);
  return `<p>${esc(v).replace(/\n/g,'<br>')}</p>`;
}
function sanitizeStyle(styleText){
  const allow=new Set(['text-align','font-family','font-size','color','background-color','font-weight','font-style','text-decoration','width','height','max-width']);
  const out=[];
  String(styleText||'').split(';').forEach(part=>{
    const i=part.indexOf(':');
    if(i<0)return;
    const prop=part.slice(0,i).trim().toLowerCase();
    let val=part.slice(i+1).trim();
    if(!allow.has(prop))return;
    if(/url\s*\(|expression\s*\(|javascript:/i.test(val))return;
    if(prop==='font-size'&&!/^\d{1,2}px$/.test(val))return;
    if((prop==='width'||prop==='height'||prop==='max-width')&&!/^(\d{1,4}px|\d{1,3}%|auto)$/.test(val))return;
    out.push(`${prop}:${val}`);
  });
  return out.join(';');
}
function sanitizeHtml(html,forSave=false){
  const parser=new DOMParser();
  const doc=parser.parseFromString(`<div id="root">${String(html||'')}</div>`,'text/html');
  const root=doc.querySelector('#root');
  const allowed=new Set(['P','DIV','BR','SPAN','STRONG','B','EM','I','U','S','STRIKE','UL','OL','LI','BLOCKQUOTE','A','IMG','TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','HR','H1','H2','H3','FONT']);
  const nodes=[...root.querySelectorAll('*')];

  nodes.forEach(el=>{
    if(!allowed.has(el.tagName)){
      el.replaceWith(...el.childNodes);
      return;
    }

    [...el.attributes].forEach(a=>{
      const n=a.name.toLowerCase();
      if(n.startsWith('on'))return el.removeAttribute(a.name);

      const common=n==='style';
      const ok=
        common ||
        (el.tagName==='A' && ['href','target','rel'].includes(n)) ||
        (el.tagName==='IMG' && ['src','alt','data-storage-path','width','height'].includes(n)) ||
        (el.tagName==='FONT' && ['face','size','color'].includes(n)) ||
        (['TD','TH'].includes(el.tagName) && ['colspan','rowspan'].includes(n));

      if(!ok)el.removeAttribute(a.name);
    });

    if(el.hasAttribute('style')){
      const clean=sanitizeStyle(el.getAttribute('style'));
      clean?el.setAttribute('style',clean):el.removeAttribute('style');
    }

    if(el.tagName==='A'){
      const href=String(el.getAttribute('href')||'').trim();
      if(href && !/^(https?:|mailto:)/i.test(href))el.removeAttribute('href');
      el.setAttribute('target','_blank');
      el.setAttribute('rel','noopener noreferrer');
    }

    if(el.tagName==='IMG'){
      const path=el.getAttribute('data-storage-path');
      const src=String(el.getAttribute('src')||'');
      if(forSave && path)el.removeAttribute('src');
      else if(src && !/^(https?:|blob:)/i.test(src))el.removeAttribute('src');
      el.setAttribute('style',`${sanitizeStyle(el.getAttribute('style'))};max-width:100%;height:auto`.replace(/^;/,''));
    }
  });

  return root.innerHTML;
}

let savedRange=null;
function editorEl(){return $('#rich-editor')}
function rememberRange(){
  const ed=editorEl();
  const sel=window.getSelection();
  if(!ed||!sel||!sel.rangeCount)return;
  const r=sel.getRangeAt(0);
  if(ed.contains(r.commonAncestorContainer))savedRange=r.cloneRange();
}
function restoreRange(){
  if(!savedRange)return;
  const sel=window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
}
function execEditor(cmd,value=null){
  const ed=editorEl();
  if(!ed)return;
  ed.focus();
  restoreRange();
  document.execCommand('styleWithCSS',false,true);
  document.execCommand(cmd,false,value);
  rememberRange();
}
function applyFontSize(px){
  const map={'12':'2','14':'3','16':'3','18':'4','20':'4','24':'5','28':'6','32':'6'};
  execEditor('fontSize',map[String(px)]||'3');
  document.querySelectorAll('#rich-editor font[size]').forEach(el=>{
    el.removeAttribute('size');
    el.style.fontSize=`${px}px`;
  });
}
function normalizeUrl(v){
  let url=String(v||'').trim();
  if(!url)return '';
  if(!/^[a-z]+:/i.test(url))url='https://'+url;
  return url;
}
function insertLink(){
  rememberRange();
  const url=normalizeUrl(prompt('링크 주소를 입력하세요.'));
  if(url)execEditor('createLink',url);
}
function insertTable(){
  rememberRange();
  const rows=Math.min(10,Math.max(1,Number(prompt('행 수를 입력하세요.','3')||0)));
  const cols=Math.min(10,Math.max(1,Number(prompt('열 수를 입력하세요.','3')||0)));
  if(!rows||!cols)return;
  let html='<table><tbody>';
  for(let r=0;r<rows;r++){
    html+='<tr>';
    for(let c=0;c<cols;c++)html+='<td><br></td>';
    html+='</tr>';
  }
  html+='</tbody></table><p><br></p>';
  execEditor('insertHTML',html);
}
function toolbarHtml(){
  return `
    <div class="editor-toolbar" id="editor-toolbar">
      <div class="tool-group">
        <select id="tool-block" title="문단 형식">
          <option value="p">본문</option>
          <option value="h1">제목 1</option>
          <option value="h2">제목 2</option>
          <option value="h3">제목 3</option>
        </select>
        <select id="tool-font" title="글꼴">
          <option value="'Noto Sans KR',sans-serif">Noto Sans KR</option>
          <option value="'Nanum Gothic',sans-serif">나눔고딕</option>
          <option value="'Nanum Myeongjo',serif">나눔명조</option>
          <option value="Arial,sans-serif">Arial</option>
        </select>
        <select id="tool-size" title="글자 크기">
          ${[12,14,16,18,20,24,28,32].map(n=>`<option value="${n}" ${n===16?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>

      <div class="tool-group">
        <button type="button" class="tool-btn" data-cmd="bold" title="굵게"><b>B</b></button>
        <button type="button" class="tool-btn" data-cmd="italic" title="기울임"><i>I</i></button>
        <button type="button" class="tool-btn" data-cmd="underline" title="밑줄"><u>U</u></button>
        <button type="button" class="tool-btn" data-cmd="strikeThrough" title="취소선"><s>S</s></button>
        <label class="color-tool" title="글자색">A<input type="color" id="tool-color" value="#10203c"></label>
        <label class="color-tool highlight" title="배경색">A<input type="color" id="tool-bg" value="#fff2a8"></label>
      </div>

      <div class="tool-group">
        <button type="button" class="tool-btn" data-cmd="justifyLeft" title="왼쪽 정렬">≡</button>
        <button type="button" class="tool-btn" data-cmd="justifyCenter" title="가운데 정렬">≣</button>
        <button type="button" class="tool-btn" data-cmd="justifyRight" title="오른쪽 정렬">≡</button>
        <button type="button" class="tool-btn" data-cmd="justifyFull" title="양쪽 정렬">☷</button>
        <button type="button" class="tool-btn" data-cmd="insertUnorderedList" title="글머리표">• 목록</button>
        <button type="button" class="tool-btn" data-cmd="insertOrderedList" title="번호목록">1. 목록</button>
      </div>

      <div class="tool-group">
        <button type="button" class="tool-btn" id="tool-quote" title="인용구">❝</button>
        <button type="button" class="tool-btn" data-cmd="outdent" title="내어쓰기">←</button>
        <button type="button" class="tool-btn" data-cmd="indent" title="들여쓰기">→</button>
        <button type="button" class="tool-btn" data-cmd="insertHorizontalRule" title="구분선">―</button>
        <button type="button" class="tool-btn" id="tool-link" title="링크">🔗</button>
        <button type="button" class="tool-btn" id="tool-table" title="표">▦</button>
      </div>

      <div class="tool-group">
        <button type="button" class="tool-btn text" id="tool-image" title="본문 이미지">🖼 사진</button>
        <button type="button" class="tool-btn text" id="tool-file" title="첨부파일">📎 파일</button>
        <button type="button" class="tool-btn" data-cmd="undo" title="실행취소">↶</button>
        <button type="button" class="tool-btn" data-cmd="redo" title="다시실행">↷</button>
        <button type="button" class="tool-btn text" data-cmd="removeFormat" title="서식 지우기">서식삭제</button>
      </div>
    </div>
    <input id="image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
    <input id="file-input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/jpeg,image/png,image/webp,image/gif" hidden>
  `;
}
function bindToolbar(onImage,onFile){
  document.querySelectorAll('[data-cmd]').forEach(b=>{
    b.onmousedown=e=>e.preventDefault();
    b.onclick=()=>execEditor(b.dataset.cmd);
  });
  $('#tool-block').onchange=e=>execEditor('formatBlock',e.target.value);
  $('#tool-font').onchange=e=>execEditor('fontName',e.target.value);
  $('#tool-size').onchange=e=>applyFontSize(e.target.value);
  $('#tool-color').oninput=e=>execEditor('foreColor',e.target.value);
  $('#tool-bg').oninput=e=>execEditor('hiliteColor',e.target.value);
  $('#tool-quote').onclick=()=>execEditor('formatBlock','blockquote');
  $('#tool-link').onclick=insertLink;
  $('#tool-table').onclick=insertTable;
  $('#tool-image').onclick=()=>{rememberRange();$('#image-input').click()};
  $('#tool-file').onclick=()=>{$('#file-input').click()};
  $('#image-input').onchange=async e=>{
    const f=e.target.files?.[0]; e.target.value='';
    if(f)await onImage(f);
  };
  $('#file-input').onchange=async e=>{
    const f=e.target.files?.[0]; e.target.value='';
    if(f)await onFile(f);
  };
  const ed=editorEl();
  ['mouseup','keyup','input','click'].forEach(evt=>ed?.addEventListener(evt,rememberRange));
}
async function createSignedUrl(path,expires=3600){
  const x=await A.sb.storage.from(STORAGE_BUCKET).createSignedUrl(path,expires);
  return x.error?null:x.data?.signedUrl||null;
}
async function hydrateInlineImages(container){
  if(!container)return;
  const imgs=[...container.querySelectorAll('img[data-storage-path]')];
  for(const img of imgs){
    const path=img.dataset.storagePath;
    if(!path)continue;
    const url=await createSignedUrl(path,3600);
    if(url)img.src=url;
  }
}
async function openStoredFile(file){
  const url=await createSignedUrl(file.storage_path,300);
  if(!url)return notice('파일을 열 수 없습니다.','err');
  window.open(url,'_blank','noopener');
}

const OWNER_TYPE='reference';
let rows=[];
let categories=[];
let files=[];
let selectedCategoryId='';
let mode='list'; // list | editor | view
let editing=null;
let viewing=null;
let ownerId='';
let sessionUploadedIds=new Set();

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
function rowFiles(id){
  return files.filter(f=>f.owner_type===OWNER_TYPE && f.owner_id===id && f.active!==false);
}
async function load(){
  const [c,r,f]=await Promise.all([
    A.list('waste_reference_categories','*','sort_order',true),
    A.list('waste_reference_materials','*','created_at',false),
    A.list('waste_editor_files','*','created_at',true)
  ]);
  if(c.error)return renderError(c.error.message);
  if(r.error)return renderError(r.error.message);
  if(f.error)return renderError(f.error.message);
  categories=(c.data||[]).filter(x=>x.active);
  rows=(r.data||[]).filter(x=>x.active!==false);
  files=f.data||[];
  if(!selectedCategoryId || !categories.some(x=>x.id===selectedCategoryId))selectedCategoryId=categories[0]?.id||'';
  render();
}
function renderError(message){$('#app').innerHTML=`<div class="notice show err">${esc(message)}</div>`}
function categoryButtons(){
  if(!categories.length)return `<div class="empty">설정된 관련자료 종류가 없습니다.<br>폐기물현황 &gt; 설정에서 먼저 등록해 주세요.</div>`;
  return categories.map(c=>{
    const count=rows.filter(r=>rowBelongs(r,c)).length;
    return `<button class="library-category ${c.id===selectedCategoryId?'active':''}" data-category="${c.id}"><span>${esc(c.category_name)}</span><b>${count}</b></button>`;
  }).join('');
}
function listRows(){
  const cat=selectedCategory();
  const filtered=cat?rows.filter(r=>rowBelongs(r,cat)):[];
  if(!filtered.length)return `<tr><td colspan="5" class="empty">등록된 관련자료가 없습니다.</td></tr>`;
  return filtered.map((r,i)=>{
    const cnt=rowFiles(r.id).length+(r.file_path?1:0);
    const preview=plainTextFromHtml(r.content||'');
    return `<tr>
      <td class="num">${i+1}</td>
      <td>${formatDate(r.created_at)}</td>
      <td>
        <button class="title-link" data-view="${r.id}">${esc(r.title)}</button>
        ${cnt?`<span class="pill amber">첨부 ${cnt}</span>`:''}
        ${preview?`<div class="row-preview">${esc(preview.slice(0,120))}${preview.length>120?'…':''}</div>`:''}
      </td>
      <td>${esc(r.created_by||'-')}</td>
      <td><div class="row-actions">
        <button class="btn small" data-view="${r.id}">보기</button>
        <button class="btn small" data-edit="${r.id}">수정</button>
        <button class="btn small danger" data-del="${r.id}">삭제</button>
      </div></td>
    </tr>`;
  }).join('');
}
function attachmentsHtml(id,editable=false){
  const list=rowFiles(id).filter(f=>f.file_role==='attachment');
  if(!list.length)return `<div class="attachment-empty">첨부파일 없음</div>`;
  return `<div class="attachment-list">${list.map(f=>`
    <div class="attachment-item">
      <button type="button" class="attachment-open" data-open-file="${f.id}">📎 ${esc(f.file_name)}</button>
      <span>${f.size_bytes?`${Math.ceil(f.size_bytes/1024)} KB`:''}</span>
      ${editable?`<button type="button" class="attachment-remove" data-remove-file="${f.id}">삭제</button>`:''}
    </div>`).join('')}</div>`;
}
function listContent(){
  const cat=selectedCategory();
  return `
    <div class="library-list-head">
      <strong>${cat?esc(cat.category_name):'관련자료'}</strong>
      <span class="hint">${cat?rows.filter(r=>rowBelongs(r,cat)).length:0}건</span>
    </div>
    <div class="table-wrap"><table class="library-table"><thead><tr>
      <th style="width:70px">순번</th><th style="width:130px">작성일</th><th>제목</th><th style="width:200px">작성자</th><th style="width:190px">작업</th>
    </tr></thead><tbody>${listRows()}</tbody></table></div>`;
}
function editorContent(){
  const cat=editing?categoryForRow(editing):selectedCategory();
  return `
    <div class="writer-head">
      <div><h2>🔥 ${esc(cat?.category_name||'관련자료')} ${editing?'수정':'글 작성'}</h2><div class="hint">본문은 HTML 형식으로 저장되며 이미지와 첨부파일은 전용 Storage에 보관됩니다.</div></div>
    </div>
    <form id="writer-form" class="writer-form">
      <div class="field">
        <label>자료 종류</label>
        <select id="category_id" required>${categories.map(c=>`<option value="${c.id}" ${cat?.id===c.id?'selected':''}>${esc(c.category_name)}</option>`).join('')}</select>
      </div>
      <div class="field title-field">
        <label>제목</label>
        <input id="title" required value="${esc(editing?.title||'')}" placeholder="제목을 입력해 주세요.">
      </div>
      <div class="field">
        <label>내용</label>
        <div class="rich-editor-shell">
          ${toolbarHtml()}
          <div id="rich-editor" class="rich-editor" contenteditable="true" data-placeholder="내용을 입력하세요.">${editing?legacyOrHtml(editing.content||''):'<p><br></p>'}</div>
        </div>
      </div>
      <div class="attachment-panel">
        <div class="attachment-title">첨부파일</div>
        <div id="attachment-box">${attachmentsHtml(ownerId,true)}</div>
      </div>
      ${editing?.file_path?`<div class="legacy-file">기존 파일 경로: <a href="${esc(editing.file_path)}" target="_blank" rel="noopener">${esc(editing.file_path)}</a></div>`:''}
      <div class="writer-actions">
        <button class="btn" type="button" id="back-list">목록으로</button>
        <button class="btn primary" type="submit">${editing?'수정 저장':'게시글 저장'}</button>
      </div>
    </form>`;
}
function viewContent(){
  if(!viewing)return listContent();
  const cat=categoryForRow(viewing);
  return `
    <div class="article-view">
      <div class="article-head">
        <div class="article-category">${esc(cat?.category_name||viewing.category||'관련자료')}</div>
        <h2>${esc(viewing.title)}</h2>
        <div class="article-meta">작성자 ${esc(viewing.created_by||'-')} · ${formatDate(viewing.created_at)}</div>
      </div>
      <div id="article-body" class="article-body">${legacyOrHtml(viewing.content||'')}</div>
      <div class="attachment-panel">
        <div class="attachment-title">첨부파일</div>
        ${attachmentsHtml(viewing.id,false)}
        ${viewing.file_path?`<div class="attachment-item"><a class="attachment-open" href="${esc(viewing.file_path)}" target="_blank" rel="noopener">📎 기존 첨부파일 열기</a></div>`:''}
      </div>
      <div class="writer-actions">
        <button class="btn" id="view-back">목록으로</button>
        <button class="btn primary" id="view-edit">수정</button>
      </div>
    </div>`;
}
function render(){
  const cat=selectedCategory();
  $('#app').innerHTML=`
    <div id="notice" class="notice"></div>
    <div class="card library-card">
      <div class="section-head library-head">
        <div><h2>📚 관련자료</h2><div class="hint">외부 점검 대응자료, Q&A, 운영 매뉴얼 등 참고자료를 종류별로 관리합니다.</div></div>
        <div class="spacer"></div>
        ${mode==='list'?`<button class="btn primary" id="write" ${categories.length?'':'disabled'}>글쓰기</button>`:''}
      </div>
      <div class="library-layout">
        <aside class="library-sidebar">${categoryButtons()}</aside>
        <section class="library-content">${mode==='editor'?editorContent():mode==='view'?viewContent():listContent()}</section>
      </div>
    </div>`;

  document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{
    selectedCategoryId=b.dataset.category; editing=null; viewing=null; mode='list'; render();
  });
  if($('#write'))$('#write').onclick=()=>openEditor(null);
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>openView(b.dataset.view));
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(rows.find(r=>r.id===b.dataset.edit)||null));
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>del(b.dataset.del));
  bindFileActions();

  if(mode==='editor'){
    bindToolbar(uploadInlineImage,uploadAttachment);
    hydrateInlineImages(editorEl());
    $('#writer-form').onsubmit=save;
    $('#back-list').onclick=cancelEditor;
  }
  if(mode==='view'){
    hydrateInlineImages($('#article-body'));
    $('#view-back').onclick=()=>{viewing=null;mode='list';render()};
    $('#view-edit').onclick=()=>openEditor(viewing);
  }
}
function openEditor(row){
  editing=row||null;
  viewing=null;
  ownerId=row?.id||uid();
  sessionUploadedIds=new Set();
  const cat=row?categoryForRow(row):selectedCategory();
  if(cat)selectedCategoryId=cat.id;
  mode='editor';
  render();
}
function openView(id){
  viewing=rows.find(r=>r.id===id)||null;
  if(!viewing)return;
  const cat=categoryForRow(viewing); if(cat)selectedCategoryId=cat.id;
  mode='view'; render();
}
async function uploadFile(file,role){
  if(!file)return null;
  if(file.size>20*1024*1024)return notice('파일은 20MB 이하만 업로드할 수 있습니다.','err');
  const cid=A.companyId();
  if(!cid)return notice('회사 정보를 확인할 수 없습니다.','err');
  const path=`${cid}/${OWNER_TYPE}/${ownerId}/${uid()}_${safeFileName(file.name)}`;
  const up=await A.sb.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined});
  if(up.error)return notice(up.error.message,'err');
  const meta=await A.insert('waste_editor_files',{
    owner_type:OWNER_TYPE,owner_id:ownerId,file_role:role,file_name:file.name,
    storage_bucket:STORAGE_BUCKET,storage_path:path,mime_type:file.type||null,size_bytes:file.size,sort_order:rowFiles(ownerId).length+1,active:true
  });
  if(meta.error){
    await A.sb.storage.from(STORAGE_BUCKET).remove([path]);
    return notice(meta.error.message,'err');
  }
  files.push(meta.data); sessionUploadedIds.add(meta.data.id);
  renderAttachmentBox();
  return meta.data;
}
async function uploadInlineImage(file){
  if(!file.type.startsWith('image/'))return notice('이미지 파일을 선택하세요.','err');
  const meta=await uploadFile(file,'inline_image');
  if(!meta)return;
  const url=await createSignedUrl(meta.storage_path,3600);
  if(!url)return notice('이미지 URL을 만들 수 없습니다.','err');
  restoreRange(); editorEl()?.focus();
  execEditor('insertHTML',`<p><img src="${esc(url)}" data-storage-path="${esc(meta.storage_path)}" alt="${esc(meta.file_name)}" style="max-width:100%;height:auto"></p>`);
}
async function uploadAttachment(file){await uploadFile(file,'attachment')}
function renderAttachmentBox(){
  const box=$('#attachment-box');
  if(box)box.innerHTML=attachmentsHtml(ownerId,true);
  bindFileActions();
}
function bindFileActions(){
  document.querySelectorAll('[data-open-file]').forEach(b=>b.onclick=()=>{
    const f=files.find(x=>x.id===b.dataset.openFile); if(f)openStoredFile(f);
  });
  document.querySelectorAll('[data-remove-file]').forEach(b=>b.onclick=()=>removeFile(b.dataset.removeFile));
}
async function removeFile(id){
  const f=files.find(x=>x.id===id); if(!f)return;
  if(!confirm(`${f.file_name} 파일을 삭제하시겠습니까?`))return;
  const s=await A.sb.storage.from(STORAGE_BUCKET).remove([f.storage_path]);
  if(s.error)return notice(s.error.message,'err');
  const d=await A.remove('waste_editor_files',id);
  if(d.error)return notice(d.error.message,'err');
  files=files.filter(x=>x.id!==id); sessionUploadedIds.delete(id); renderAttachmentBox();
}
async function cleanupSessionUploads(){
  const targets=files.filter(f=>sessionUploadedIds.has(f.id));
  for(const f of targets){
    await A.sb.storage.from(STORAGE_BUCKET).remove([f.storage_path]);
    await A.remove('waste_editor_files',f.id);
  }
  files=files.filter(f=>!sessionUploadedIds.has(f.id));
  sessionUploadedIds.clear();
}
async function cancelEditor(){
  if(sessionUploadedIds.size && !confirm('저장하지 않은 첨부파일도 함께 삭제됩니다. 목록으로 돌아갈까요?'))return;
  await cleanupSessionUploads();
  editing=null; ownerId=''; mode='list'; render();
}
async function save(e){
  e.preventDefault();
  const category=categories.find(c=>c.id===$('#category_id').value);
  if(!category)return notice('자료 종류를 선택하세요.','err');
  const title=$('#title').value.trim();
  if(!title)return notice('제목을 입력하세요.','err');
  const content=sanitizeHtml(editorEl().innerHTML,true);
  const payload={
    category_id:category.id,category:category.category_name,title,content,content_format:'html',active:true
  };
  if(!editing)payload.id=ownerId;
  const x=editing?await A.update('waste_reference_materials',editing.id,payload):await A.insert('waste_reference_materials',payload);
  if(x.error)return notice(x.error.message,'err');
  sessionUploadedIds.clear(); selectedCategoryId=category.id; editing=null; ownerId=''; mode='list';
  await load(); notice('저장되었습니다.');
}
async function del(id){
  if(!confirm('이 관련자료와 첨부파일을 삭제하시겠습니까?'))return;
  const owned=rowFiles(id);
  if(owned.length){
    await A.sb.storage.from(STORAGE_BUCKET).remove(owned.map(f=>f.storage_path));
    for(const f of owned)await A.remove('waste_editor_files',f.id);
  }
  const x=await A.remove('waste_reference_materials',id);
  if(x.error)return notice(x.error.message,'err');
  await load(); notice('삭제되었습니다.');
}
load();
