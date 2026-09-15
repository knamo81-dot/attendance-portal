(function(){
  const state={products:[], query:'', status:'all'};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function setMessage(text,type=''){const el=$('sdsMessage'); if(!el)return; el.textContent=text||''; el.className='message'+(type?' '+type:'');}
  function statusOf(p){ return p?.sds_status || 'missing'; } // SDS DB 연결 전 기본값: 미등록

  function filtered(){
    const q=state.query.trim().toLowerCase();
    return state.products.filter(p=>{
      if(state.status!=='all' && statusOf(p)!==state.status) return false;
      if(!q) return true;
      return [p.name,p.maker,p.code,p.cas].some(v=>String(v||'').toLowerCase().includes(q));
    });
  }

  function updateSummary(){
    const counts={all:state.products.length,attached:0,missing:0,none:0};
    state.products.forEach(p=>{const s=statusOf(p); if(Object.prototype.hasOwnProperty.call(counts,s)) counts[s]++;});
    $('sdsTotalCount').textContent=`${counts.all.toLocaleString()}건`;
    $('sdsAttachedCount').textContent=`${counts.attached.toLocaleString()}건`;
    $('sdsMissingCount').textContent=`${counts.missing.toLocaleString()}건`;
    $('sdsNoneCount').textContent=`${counts.none.toLocaleString()}건`;
  }

  function render(){
    updateSummary();
    const rows=filtered(); const body=$('sdsProductList');
    if(!rows.length){body.innerHTML='<tr><td colspan="10" class="empty">조회된 제품이 없습니다.</td></tr>';return;}
    body.innerHTML=rows.map(p=>`<tr>
      <td>${esc(p.name||'-')}</td><td>${esc(p.maker||'-')}</td><td>${esc(p.code||'-')}</td><td>${esc(p.capacity||'-')}</td><td>${esc(p.cas||'-')}</td><td>${esc(p.grade||'-')}</td>
      <td><button class="btn primary" type="button" disabled title="다음 단계에서 SDS 등록 기능을 연결합니다.">등록</button></td><td>-</td><td>-</td><td>-</td>
    </tr>`).join('');
  }

  function downloadExcel(){
    const rows=filtered();
    if(!rows.length){setMessage('엑셀로 다운로드할 제품이 없습니다.','error');return;}
    if(!window.XLSX){setMessage('엑셀 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.','error');return;}
    const data=rows.map(p=>({
      '품명':p.name||'', '제조사':p.maker||'', '제품코드':p.code||'', '규격':p.capacity||'', 'CAS':p.cas||'', '등급':p.grade||'',
      'SDS':statusOf(p)==='attached'?'등록':statusOf(p)==='none'?'SDS없음':'미등록', '개정일':p.revision_date||'', '등록일':p.registered_at||'', '이력':''
    }));
    const ws=XLSX.utils.json_to_sheet(data);
    ws['!cols']=[{wch:28},{wch:18},{wch:18},{wch:14},{wch:16},{wch:12},{wch:12},{wch:14},{wch:14},{wch:10}];
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'SDS 관리');
    const now=new Date(); const y=now.getFullYear(); const m=String(now.getMonth()+1).padStart(2,'0'); const d=String(now.getDate()).padStart(2,'0');
    XLSX.writeFile(wb,`SDS관리_${y}${m}${d}.xlsx`);
  }

  async function loadProducts(){
    const companyId=window.SDSApp.getCompanyId();
    if(!companyId){setMessage('회사 정보(company_id)를 확인하지 못했습니다. 포털에서 QA 앱을 열어 주세요.','error'); $('sdsProductList').innerHTML='<tr><td colspan="10" class="empty">회사 정보를 확인할 수 없습니다.</td></tr>';return;}
    setMessage('사용중 시약 제품을 불러오는 중입니다.');
    const {data,error}=await window.SDSApp.db.from('product_master')
      .select('id, company_id, category, name, maker, code, capacity, cas, grade, is_active')
      .eq('company_id',companyId).eq('is_active',true).eq('category','시약')
      .order('maker',{ascending:true}).order('name',{ascending:true}).order('capacity',{ascending:true}).order('code',{ascending:true});
    if(error){console.error('[SDS] product load error',error);setMessage('제품 목록을 불러오지 못했습니다: '+error.message,'error');return;}
    state.products=data||[]; setMessage(''); render();
  }

  function notifyPortal(){try{window.parent?.postMessage({type:'portal-tabs-ready',tabs:[{id:'sds',label:'SDS 관리'}],source:'qa'},'*');window.parent?.postMessage({type:'portal-tab-active',activeTabId:'sds',tabId:'sds',source:'qa'},'*');window.parent?.postMessage({type:'portal-filters-ready',enabled:false,filters:[],source:'qa'},'*');}catch(_){}}

  document.addEventListener('DOMContentLoaded',()=>{
    $('sdsSearch').addEventListener('input',e=>{state.query=e.target.value;render();});
    $('sdsStatus').addEventListener('change',e=>{state.status=e.target.value;render();});
    $('sdsDownloadExcel').addEventListener('click',downloadExcel);
    loadProducts(); notifyPortal();
  });
  window.addEventListener('message',e=>{if(e.data?.type==='portal-tabs-request'||e.data?.type==='portal-filters-request') notifyPortal();});
})();
