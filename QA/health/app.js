(() => {
  const state={rows:[],view:'standards',filter:'target',manualId:null,loading:false};
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client=()=>window.parent?.portalSupabase||window.portalSupabase||null;
  const fmtDate=v=>v?new Date(v).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\. /g,'.').replace(/\.$/,''):'-';
  
  function toast(msg,bad=false){const t=$('#toast');t.textContent=msg;t.className='toast '+(bad?'bad':'');setTimeout(()=>t.classList.add('hidden'),2600)}
  
  function setView(view){state.view=view;
  
  // 내부 탭 전환
  $$('.inner-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('#standardsView').classList.toggle('hidden',view!=='standards');
    $('#emptyView').classList.toggle('hidden',view==='standards');
    if(view!=='standards')$('#emptyTitle').textContent=view==='status'?'특수건강진단 현황':'검진결과';}
  $$('.inner-tabs button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  
  function setFilter(filter){state.filter=filter;
  
  // 요약 카드 필터
  $$('.stat-card[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
    $('#listTitle').textContent=filter==='unverified'?'KOSHA 미확인 물질':'특수건강진단 대상 유해인자';
    $('#listDesc').textContent=filter==='unverified'?'KOSHA API에서 확인되지 않은 CAS입니다. 수기 확인 후 기준정보로 관리할 수 있습니다.':'KOSHA 또는 수기로 확인된 대상 기준정보를 표시합니다.';render();}
  $$('.stat-card[data-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
  
  function rowProducts(r){return r.products||[]}
  
  function render(){const q=$('#searchInput').value.trim().toLowerCase(),source=$('#sourceFilter').value,first=$('#firstExamFilter').value,cycle=$('#cycleFilter').value;
    let rows=state.rows.filter(r=>state.filter==='unverified'?r.verification_status==='kosha_not_found':r.is_target===true&&r.verification_status!=='kosha_not_found').filter(r=>{const hay=[r.cas_no,r.name_ko,r.name_en,rowProducts(r).map(p=>p.name).join(' ')].join(' ').toLowerCase();
    const src=r.data_source==='MANUAL'?'MANUAL':(r.source||'KOSHA');return(!q||hay.includes(q))&&(!source||src===source)&&(!first||String(r.first_exam_months||'')===first)&&(!cycle||String(r.exam_cycle_months||'')===cycle)});rows.sort((a,b)=>String(b.latest_receipt||'').localeCompare(String(a.latest_receipt||''))||String(a.cas_no).localeCompare(String(b.cas_no)));
    $('#standardsBody').innerHTML=rows.length?rows.map(r=>{const src=r.data_source==='MANUAL'?'수기':(r.source||'KOSHA');
    const action=state.filter==='unverified'?`<button class="mini" data-manual="${r.id}">수기확인</button>`:`<span class="status-ok">${r.status==='inactive'?'비대상':'적용중'}</span>`;
    return `<tr><td><b>${esc(r.cas_no)}</b></td><td>${esc(r.name_ko||'-')}</td><td>${esc(r.name_en||'-')}</td><td><span class="badge ${src==='수기'?'manual':''}">${esc(src)}</span></td><td>${r.first_exam_months?`<span class="badge green">${esc(r.first_exam_months)}개월</span>`:'-'}</td><td>${r.exam_cycle_months?`<span class="badge">${esc(r.exam_cycle_months)}개월</span>`:'-'}</td><td><div class="products">${rowProducts(r).map(p=>`<div class="product-line">• <b>${esc(p.name)}</b> <small>${esc([p.manufacturer,p.code].filter(Boolean).join(' · '))}</small></div>`).join('')||'-'}</div></td><td class="date"><b>${esc(r.latest_receipt||'-')}</b></td><td>${action}</td></tr>`}).join(''):`<tr><td colspan="9" class="empty">${state.filter==='unverified'?'KOSHA 미확인 물질이 없습니다.':'표시할 특수건강진단 대상 유해인자가 없습니다.'}</td></tr>`;
    $$('[data-manual]').forEach(b=>b.addEventListener('click',()=>openManual(Number(b.dataset.manual))));
  }
  
  function fillFilters(){const vals=k=>[...new Set(state.rows.map(r=>r[k]).filter(Boolean))].sort((a,b)=>a-b);
    $('#firstExamFilter').innerHTML='<option value="">전체</option>'+vals('first_exam_months').map(v=>`<option value="${v}">${v}개월</option>`).join('');
    $('#cycleFilter').innerHTML='<option value="">전체</option>'+vals('exam_cycle_months').map(v=>`<option value="${v}">${v}개월</option>`).join('')}
  
  async function load(){const sb=client();
    if(!sb){$('#standardsBody').innerHTML='<tr><td colspan="9" class="empty">포털 Supabase 연결을 찾을 수 없습니다.</td></tr>';return}try{const {data:standards,error}=await sb.from('qa_special_health_exam_standards').select('*').order('chemical_id');
    if(error)throw error;
    const ids=[...new Set((standards||[]).map(x=>x.chemical_id))];
    let chemicals=[];
    if(ids.length){const q=await sb.from('qa_chemical_master').select('id,cas_no,chem_name_ko,chem_name_en,ke_no').in('id',ids);
    if(q.error)throw q.error;chemicals=q.data||[]}const cm=new Map(chemicals.map(x=>[x.id,x]));
    let productsByCas=new Map();
    try {const cas=chemicals.map(x=>x.cas_no).filter(Boolean);
    if(cas.length){const pc=await sb.from('product_cas').select('*').in('cas_no',cas);
    if(!pc.error&&pc.data?.length){const pids=[...new Set(pc.data.map(x=>x.product_id).filter(Boolean))];
    let pm=[];
    if(pids.length){const pq=await sb.from('product_master').select('*').in('id',pids);
    if(!pq.error)pm=pq.data||[]}const pmap=new Map(pm.map(p=>[p.id,p]));pc.data.forEach(link=>{const p=pmap.get(link.product_id);
    if(!p)return;
    const arr=productsByCas.get(link.cas_no)||[];arr.push({name:p.product_name||p.name||p.chem_name||p.item_name||`제품 #${p.id}`,manufacturer:p.manufacturer||p.maker||'',code:p.product_code||p.code||''});productsByCas.set(link.cas_no,arr)})}}}
    catch (e){console.warn('제품 연결 조회 생략',e)}
      state.rows=(standards||[]).map(s=>{const c=cm.get(s.chemical_id)||{};
    return {...s,cas_no:c.cas_no||'',name_ko:c.chem_name_ko||'',name_en:c.chem_name_en||'',products:productsByCas.get(c.cas_no)||[],latest_receipt:null}});
      const targets=state.rows.filter(r=>r.is_target===true&&r.verification_status!=='kosha_not_found');
    const unv=state.rows.filter(r=>r.verification_status==='kosha_not_found');
    $('#hazardCount').textContent=targets.length+'종';
    $('#unverifiedCount').textContent=unv.length+'종';
    $('#productCount').textContent=targets.reduce((n,r)=>n+r.products.length,0)+'개';
    const checked=state.rows.map(r=>r.api_checked_at).filter(Boolean).sort().at(-1);
    $('#apiChecked').textContent=fmtDate(checked);fillFilters();render();
    }
    catch (e){console.error(e);
    $('#standardsBody').innerHTML=`<tr><td colspan="9" class="empty">기준정보 조회 실패: ${esc(e.message||e)}</td></tr>`;toast('기준정보를 불러오지 못했습니다.',true)}}

  // 검색 / 필터 이벤트
  ['searchInput','sourceFilter','firstExamFilter','cycleFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchInput'?'input':'change',render));

  // KOSHA 기준정보 전체 갱신
  $('#refreshBtn').addEventListener('click',async()=>{if(state.loading)return;
    const sb=client();
    if(!sb)return toast('Supabase 연결을 찾을 수 없습니다.',true);
    state.loading=true;
    const b=$('#refreshBtn');b.disabled=true;b.textContent='갱신 중…';
    try {const {data,error}=await sb.functions.invoke('kosha-special-health-sync',{body:{mode:'all'}});
    if(error)throw error;
    if(!data?.success)throw new Error(data?.error||'API 갱신 실패');toast(`갱신 완료 · 대상 ${data.summary?.target??0} / 미확인 ${data.summary?.not_found??0}`);
    await load()}
    catch (e){console.error(e);toast('API 기준정보 갱신에 실패했습니다.',true)}
    finally {state.loading=false;b.disabled=false;b.textContent='↻ API 기준정보 갱신'}});
  
  function openManual(id){const r=state.rows.find(x=>x.id===id);
    if(!r)return;
    state.manualId=id;
    $('#manualChemical').textContent=`${r.cas_no} · ${r.name_ko||r.name_en||'-'}`;
    $('#manualTarget').value='true';
    $('#manualCycle').value='';
    $('#manualFirst').value='';
    $('#manualSource').value=r.manual_source||'';
    $('#manualNote').value=r.manual_note||'';
    $('#manualModal').classList.remove('hidden')}
  
  function closeManual(){state.manualId=null;
    $('#manualModal').classList.add('hidden')}
  $('#modalClose').addEventListener('click',closeManual);
    $('#modalCancel').addEventListener('click',closeManual);
    $('#manualModal').addEventListener('click',e=>{if(e.target===$('#manualModal'))closeManual()});

  // 미확인 물질 수기 확인 저장
  $('#manualSave').addEventListener('click',async()=>{const sb=client(),r=state.rows.find(x=>x.id===state.manualId);
    if(!sb||!r)return;
    const isTarget=$('#manualTarget').value==='true',cycle=$('#manualCycle').value?Number($('#manualCycle').value):null,first=$('#manualFirst').value?Number($('#manualFirst').value):null,source=$('#manualSource').value.trim(),note=$('#manualNote').value.trim();
    if(isTarget&&!cycle)return toast('대상 물질은 검진주기를 입력해 주세요.',true);
    if(!source)return toast('확인 출처/근거를 입력해 주세요.',true);
    const btn=$('#manualSave');btn.disabled=true;
    try {const now=new Date().toISOString();
    const {error}=await sb.from('qa_special_health_exam_standards').update({is_target:isTarget,first_exam_months:first,exam_cycle_months:isTarget?cycle:null,source:'MANUAL',data_source:'MANUAL',verification_status:'manual_confirmed',manual_source:source,manual_note:note,manual_confirmed_at:now,status:isTarget?'active':'inactive',updated_at:now}).eq('id',r.id);
    if(error)throw error;closeManual();toast(isTarget?'수기 확인 완료 · 기준관리에 반영했습니다.':'수기 확인 완료 · 비대상 기록을 보존합니다.');setFilter('target');
    await load()}
    catch (e){console.error(e);toast('수기 확인 저장에 실패했습니다.',true)}
    finally {btn.disabled=false}});
  load();
})();
