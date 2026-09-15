(function(){
  const state={products:[], query:'', status:'all'};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function setMessage(text,type=''){const el=$('sdsMessage'); if(!el)return; el.textContent=text||''; el.className='message'+(type?' '+type:'');}
  function statusOf(){ return 'missing'; } // 1차: SDS DB 연결 전 모든 사용중 제품은 미첨부로 표시
  function filtered(){
    const q=state.query.trim().toLowerCase();
    return state.products.filter(p=>{
      if(state.status!=='all' && statusOf(p)!==state.status) return false;
      if(!q) return true;
      return [p.name,p.maker,p.code,p.cas].some(v=>String(v||'').toLowerCase().includes(q));
    });
  }
  function render(){
    const rows=filtered(); const body=$('sdsProductList');
    if(!rows.length){body.innerHTML='<tr><td colspan="10" class="empty">조회된 제품이 없습니다.</td></tr>';return;}
    body.innerHTML=rows.map(p=>`<tr>
      <td>${esc(p.name||'-')}</td><td>${esc(p.maker||'-')}</td><td>${esc(p.code||'-')}</td><td>${esc(p.capacity||'-')}</td><td>${esc(p.cas||'-')}</td><td>${esc(p.grade||'-')}</td>
      <td><button class="btn primary" type="button" disabled title="다음 단계에서 SDS 등록 기능을 연결합니다.">등록</button></td><td>-</td><td>-</td><td>-</td>
    </tr>`).join('');
  }
  async function loadProducts(){
    const companyId=window.SDSApp.getCompanyId();
    if(!companyId){setMessage('회사 정보(company_id)를 확인하지 못했습니다. 포털에서 SDS 앱을 열어 주세요.','error'); $('sdsProductList').innerHTML='<tr><td colspan="10" class="empty">회사 정보를 확인할 수 없습니다.</td></tr>';return;}
    setMessage('사용중 제품을 불러오는 중입니다.');
    const {data,error}=await window.SDSApp.db.from('product_master')
      .select('id, company_id, category, name, maker, code, capacity, cas, grade, is_active')
      .eq('company_id',companyId).eq('is_active',true).eq('category','시약')
      .order('maker',{ascending:true}).order('name',{ascending:true}).order('capacity',{ascending:true}).order('code',{ascending:true});
    if(error){console.error('[SDS] product load error',error);setMessage('제품 목록을 불러오지 못했습니다: '+error.message,'error');return;}
    state.products=data||[]; setMessage(`사용중 제품 ${state.products.length.toLocaleString()}건`); render();
  }
  function notifyPortal(){try{window.parent?.postMessage({type:'portal-tabs-ready',tabs:[],source:'sds'},'*');window.parent?.postMessage({type:'portal-filters-ready',enabled:false,filters:[],source:'sds'},'*');}catch(_){}}
  document.addEventListener('DOMContentLoaded',()=>{
    $('sdsSearch').addEventListener('input',e=>{state.query=e.target.value;render();});
    $('sdsStatus').addEventListener('change',e=>{state.status=e.target.value;render();});
    loadProducts(); notifyPortal();
  });
  window.addEventListener('message',e=>{if(e.data?.type==='portal-tabs-request'||e.data?.type==='portal-filters-request') notifyPortal();});
})();
