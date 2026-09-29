(() => {
  const state = { rows: [], filter: 'target', manualId: null, loading: false };
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = () => window.parent?.portalSupabase || window.portalSupabase || null;
  const fmtDate = v => v ? new Date(v).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\. /g,'.').replace(/\.$/,'') : '-';
  const normCas = v => String(v || '').trim().replace(/\s+/g,'');

  function portalSession(){
    try{ if(window.parent && typeof window.parent.getPortalSession === 'function') return window.parent.getPortalSession() || {}; }catch(_){}
    try{ if(window.parent?.portalSession) return window.parent.portalSession; }catch(_){}
    try{ return window.portalSession || window.currentPortalSession || {}; }catch(_){ return {}; }
  }
  function companyId(){
    const s=portalSession(), e=s.employee||{}, u=s.user||{}, c=s.company||s.activeCompany||{};
    return String(s.activeCompanyId||s.companyId||s.company_id||c.id||c.company_id||e.company_id||u.company_id||'').trim();
  }
  function normalizeRole(role,fallback='user'){
    const clean=String(role||'').trim().toLowerCase();
    if(['admin','administrator','관리자'].includes(clean))return'admin';
    if(['operator','manager','운영자'].includes(clean))return'operator';
    if(['viewer','readonly','read_only','조회','조회자'].includes(clean))return'viewer';
    return fallback;
  }
  function canManageQa(){
    const s=portalSession(), appRoles=s.appRoles||s.app_roles||{}, q=appRoles.qa||{};
    if(s.isServiceAdmin===true||s.is_service_admin===true||s.serviceAdmin===true||s.service_admin===true)return true;
    const globalRole=normalizeRole(s.role||s.workspaceRole||s.workspace_role||s.user?.role||s.profile?.workspace_role||s.profile?.portal_role||s.profile?.company_role||s.profile?.tenant_role||s.profile?.user_role||s.profile?.role||s.employee?.role||'','user');
    if(globalRole==='admin')return true;
    const qaRole=normalizeRole(typeof q==='string'?q:(q.role||q.role_key||q.permission||q.permission_key||''),'user');
    return qaRole==='admin'||qaRole==='operator';
  }
  function toast(msg,bad=false){
    const t=$('#toast'); if(!t)return;
    t.textContent=msg; t.className='toast '+(bad?'bad':'');
    clearTimeout(toast._timer); toast._timer=setTimeout(()=>t.classList.add('hidden'),2800);
  }
  function applyPermissionUi(){
    const manage=canManageQa();
    $('#refreshBtn').hidden=!manage;
    $('#actionHead').hidden=!manage;
    document.body.classList.toggle('qa-workenv-viewer',!manage);
  }
  function setView(view){
    $$('.inner-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('#statusView').classList.toggle('hidden',view!=='status');
    $('#standardsView').classList.toggle('hidden',view!=='standards');
  }
  $$('.inner-tabs button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('#openStandardsBtn')?.addEventListener('click',()=>setView('standards'));

  function setFilter(filter){
    state.filter=filter;
    $$('.stat-card[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
    render();
  }
  $$('.stat-card[data-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));

  function sourceKey(r){ return r.data_source==='MANUAL' || r.source==='MANUAL' ? 'MANUAL' : 'KOSHA'; }
  function matchRank(status){ return ({applicable:3,review_required:2,not_applicable:1}[status]||0); }
  function rowMatch(r){
    const statuses=(r.products||[]).map(p=>p.match_status);
    if(statuses.includes('applicable')) return 'applicable';
    if(statuses.includes('review_required')) return 'review_required';
    if(statuses.includes('not_applicable')) return 'not_applicable';
    return '';
  }
  function matchBadge(status){
    if(status==='applicable') return '<span class="badge green">적용</span>';
    if(status==='review_required') return '<span class="badge warn">검토필요</span>';
    if(status==='not_applicable') return '<span class="badge gray">기준미만</span>';
    return '<span class="badge gray">연결없음</span>';
  }
  function percentText(p){
    if(p.content_assumed_100) return '100% 간주';
    const min=p.content_min, max=p.content_max;
    if(min!=null && max!=null && Number(min)!==Number(max)) return `${min}~${max}%`;
    if(min!=null) return `${min}%`;
    if(max!=null) return `~${max}%`;
    return '-';
  }
  function thresholdText(r){
    if(r.threshold_text) return r.threshold_text;
    if(r.threshold_min_percent!=null) return `${r.threshold_min_percent}% 이상`;
    if(r.threshold_rule==='manual_review') return '작업조건 확인 필요';
    return '-';
  }
  function rowStatusHtml(r){
    if(r.verification_status==='kosha_not_found') return '<div class="row-status"><span class="badge warn">KOSHA 미확인</span></div>';
    const agg=rowMatch(r);
    return `<div class="row-status">${matchBadge(agg)}<small>${(r.products||[]).length}개 제품 연결</small></div>`;
  }

  function render(){
    const q=$('#searchInput').value.trim().toLowerCase();
    const source=$('#sourceFilter').value;
    const threshold=$('#thresholdFilter').value;
    const match=$('#matchFilter').value;
    let rows=state.rows.filter(r=>state.filter==='unverified' ? r.verification_status==='kosha_not_found' : r.is_target===true && r.verification_status!=='kosha_not_found');
    rows=rows.filter(r=>{
      const hay=[r.cas_no,r.name_ko,r.name_en,(r.products||[]).map(p=>`${p.product_name||''} ${p.maker||''} ${p.product_code||''}`).join(' ')].join(' ').toLowerCase();
      const rk=sourceKey(r), th=thresholdText(r), rm=rowMatch(r);
      return (!q||hay.includes(q)) && (!source||rk===source) && (!threshold||th===threshold) && (!match||rm===match);
    });
    rows.sort((a,b)=>String(b.latest_usage||'').localeCompare(String(a.latest_usage||'')) || String(b.latest_receipt||'').localeCompare(String(a.latest_receipt||'')) || String(a.cas_no).localeCompare(String(b.cas_no)));

    $('#standardsBody').innerHTML = rows.length ? rows.map(r=>{
      const src=sourceKey(r)==='MANUAL'?'수기':(r.source||'KOSHA');
      const products=(r.products||[]).slice().sort((a,b)=>matchRank(b.match_status)-matchRank(a.match_status)||String(a.product_name||'').localeCompare(String(b.product_name||'')));
      const productHtml=products.length ? products.map(p=>`<div class="product-line"><div class="product-main"><b>${esc(p.product_name||`제품 #${p.product_id}`)}</b>${matchBadge(p.match_status)}</div><small>${esc([p.maker,p.product_code].filter(Boolean).join(' · '))}</small><div class="product-meta"><span class="product-percent">${esc(percentText(p))}</span>${p.content_assumed_100?'<span class="badge gray">미표기</span>':''}</div></div>`).join('') : '-';
      const action=state.filter==='unverified' ? (canManageQa()?`<button class="mini" data-manual="${r.id}">수기확인</button>`:'-') : '<span class="status-ok">적용중</span>';
      return `<tr><td><b>${esc(r.cas_no||'-')}</b></td><td>${esc(r.name_ko||'-')}</td><td>${esc(r.name_en||'-')}</td><td><span class="badge ${src==='수기'?'manual':''}">${esc(src)}</span></td><td><span class="badge ${r.threshold_rule==='manual_review'?'warn':''}">${esc(thresholdText(r))}</span></td><td>${rowStatusHtml(r)}</td><td><div class="products">${productHtml}</div></td><td class="date"><b>${esc(r.latest_receipt||'-')}</b></td><td class="date"><b>${esc(r.latest_usage||'-')}</b></td><td>${action}</td></tr>`;
    }).join('') : `<tr><td colspan="10" class="empty">${state.filter==='unverified'?'KOSHA 미확인 물질이 없습니다.':'표시할 작업환경측정 대상물질이 없습니다.'}</td></tr>`;
    $$('[data-manual]').forEach(b=>b.addEventListener('click',()=>openManual(Number(b.dataset.manual))));
  }

  function fillFilters(){
    const values=[...new Set(state.rows.filter(r=>r.is_target===true).map(thresholdText).filter(v=>v&&v!=='-'))].sort();
    $('#thresholdFilter').innerHTML='<option value="">전체</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }

  async function queryRecent(sb, table, dateField, pids, cid){
    if(!pids.length)return [];
    let q=sb.from(table).select(`product_id,${dateField}`).in('product_id',pids).not(dateField,'is',null);
    if(cid) q=q.eq('company_id',cid);
    let r=await q;
    if(r.error && cid){
      r=await sb.from(table).select(`product_id,${dateField}`).in('product_id',pids).not(dateField,'is',null);
    }
    if(r.error){ console.warn(`${table} 조회 생략`,r.error); return []; }
    return r.data||[];
  }

  async function load(){
    const sb=client();
    if(!sb){ $('#standardsBody').innerHTML='<tr><td colspan="10" class="empty">포털 Supabase 연결을 찾을 수 없습니다.</td></tr>'; return; }
    try{
      const cid=companyId();
      const [sr,cr]=await Promise.all([
        sb.from('qa_work_environment_standards').select('*').order('chemical_id'),
        sb.from('qa_chemical_master').select('id,cas_no,chem_name_ko,chem_name_en,ke_no')
      ]);
      if(sr.error)throw sr.error; if(cr.error)throw cr.error;
      const standards=sr.data||[], chemicals=cr.data||[];
      const cm=new Map(chemicals.map(c=>[c.id,c]));

      let mq=sb.from('vw_qa_work_environment_product_matches').select('*').eq('is_active',true);
      if(cid) mq=mq.eq('company_id',cid);
      const mr=await mq;
      if(mr.error) throw new Error('제품 자동판정 VIEW 조회 실패: '+mr.error.message);
      const matches=mr.data||[];
      const productIds=[...new Set(matches.map(x=>x.product_id).filter(Boolean))];
      const [receipts,usages]=await Promise.all([
        queryRecent(sb,'reagent_collect_items','receipt_date',productIds,cid),
        queryRecent(sb,'qa_reagent_usage_records','usage_date',productIds,cid)
      ]);
      const latestReceipt=new Map(), latestUsage=new Map();
      receipts.forEach(x=>{const p=latestReceipt.get(x.product_id);if(!p||String(x.receipt_date)>String(p))latestReceipt.set(x.product_id,x.receipt_date)});
      usages.forEach(x=>{const p=latestUsage.get(x.product_id);if(!p||String(x.usage_date)>String(p))latestUsage.set(x.product_id,x.usage_date)});

      const matchesByStandard=new Map();
      matches.forEach(m=>{
        const key=String(m.standard_id);
        const arr=matchesByStandard.get(key)||[];
        if(!arr.some(x=>String(x.product_id)===String(m.product_id))) arr.push(m);
        matchesByStandard.set(key,arr);
      });

      state.rows=standards.map(s=>{
        const c=cm.get(s.chemical_id)||{};
        const products=matchesByStandard.get(String(s.id))||[];
        const rec=products.map(p=>latestReceipt.get(p.product_id)).filter(Boolean).sort().at(-1)||null;
        const use=products.map(p=>latestUsage.get(p.product_id)).filter(Boolean).sort().at(-1)||null;
        return {...s,cas_no:c.cas_no||'',name_ko:c.chem_name_ko||'',name_en:c.chem_name_en||'',products,latest_receipt:rec,latest_usage:use};
      });

      const targets=state.rows.filter(r=>r.is_target===true&&r.verification_status!=='kosha_not_found');
      const unv=state.rows.filter(r=>r.verification_status==='kosha_not_found');
      const linked=new Set(targets.flatMap(r=>(r.products||[]).map(p=>String(p.product_id))));
      $('#hazardCount').textContent=targets.length+'종';
      $('#unverifiedCount').textContent=unv.length+'종';
      $('#productCount').textContent=linked.size+'개';
      const checked=state.rows.map(r=>r.api_checked_at).filter(Boolean).sort().at(-1);
      $('#apiChecked').textContent=fmtDate(checked);
      fillFilters(); render();
    }catch(e){
      console.error(e);
      $('#standardsBody').innerHTML=`<tr><td colspan="10" class="empty">기준정보 조회 실패: ${esc(e.message||e)}</td></tr>`;
      toast('작업환경측정 대상물질 기준정보를 불러오지 못했습니다.',true);
    }
  }

  ['searchInput','sourceFilter','thresholdFilter','matchFilter'].forEach(id=>$('#'+id)?.addEventListener(id==='searchInput'?'input':'change',render));

  $('#refreshBtn')?.addEventListener('click',async()=>{
    if(!canManageQa())return toast('조회 전용 사용자입니다. 기준정보 갱신은 QA 운영자만 가능합니다.',true);
    if(state.loading)return;
    const sb=client(); if(!sb)return toast('Supabase 연결을 찾을 수 없습니다.',true);
    state.loading=true; const b=$('#refreshBtn'); b.disabled=true; b.textContent='갱신 중…';
    try{
      const {data,error}=await sb.functions.invoke('kosha-work-environment-sync',{body:{mode:'all'}});
      if(error)throw error; if(!data?.success)throw new Error(data?.error||'API 갱신 실패');
      toast(`갱신 완료 · 대상 ${data.summary?.target??0} / 미확인 ${data.summary?.not_found??0}`);
      await load(); setFilter('target');
    }catch(e){ console.error(e); toast('API 기준정보 갱신에 실패했습니다: '+String(e.message||e),true); }
    finally{ state.loading=false; b.disabled=false; b.textContent='↻ API 기준정보 갱신'; }
  });

  function openManual(id){
    if(!canManageQa())return toast('조회 전용 사용자입니다. 수기확인은 QA 운영자만 가능합니다.',true);
    const r=state.rows.find(x=>Number(x.id)===Number(id)); if(!r)return;
    state.manualId=id;
    $('#manualChemical').textContent=`${r.cas_no} · ${r.name_ko||r.name_en||'-'}`;
    $('#manualTarget').value='true';
    $('#manualRule').value=r.threshold_rule||'gte';
    $('#manualThreshold').value=r.threshold_min_percent??'1';
    $('#manualThresholdText').value=r.threshold_text||'1% 이상';
    $('#manualSource').value=r.manual_source||'';
    $('#manualNote').value=r.manual_note||'';
    $('#manualModal').classList.remove('hidden');
  }
  function closeManual(){ state.manualId=null; $('#manualModal').classList.add('hidden'); }
  $('#modalClose')?.addEventListener('click',closeManual); $('#modalCancel')?.addEventListener('click',closeManual);
  $('#manualModal')?.addEventListener('click',e=>{if(e.target===$('#manualModal'))closeManual()});
  $('#manualRule')?.addEventListener('change',()=>{
    const manual=$('#manualRule').value==='manual_review';
    $('#manualThreshold').disabled=manual;
    if(manual){$('#manualThreshold').value='';$('#manualThresholdText').value='작업조건 확인 필요'}
  });

  $('#manualSave')?.addEventListener('click',async()=>{
    if(!canManageQa())return toast('조회 전용 사용자입니다. 수기확인은 QA 운영자만 가능합니다.',true);
    const sb=client(), r=state.rows.find(x=>Number(x.id)===Number(state.manualId)); if(!sb||!r)return;
    const isTarget=$('#manualTarget').value==='true', rule=$('#manualRule').value;
    const thresholdRaw=$('#manualThreshold').value.trim(), threshold=thresholdRaw===''?null:Number(thresholdRaw);
    const thresholdLabel=$('#manualThresholdText').value.trim();
    const source=$('#manualSource').value.trim(), note=$('#manualNote').value.trim();
    if(isTarget&&rule==='gte'&&(threshold===null||!Number.isFinite(threshold)))return toast('대상 물질의 최소 함유량 기준을 입력해 주세요.',true);
    if(!source)return toast('확인 출처/근거를 입력해 주세요.',true);
    const now=new Date().toISOString(), btn=$('#manualSave'); btn.disabled=true;
    try{
      const payload={
        is_target:isTarget,
        threshold_min_percent:isTarget&&rule==='gte'?threshold:null,
        threshold_max_percent:null,
        threshold_unit:'%',
        threshold_basis:isTarget&&rule==='gte'?'중량/용량비율':null,
        threshold_rule:isTarget?rule:null,
        threshold_text:isTarget?(thresholdLabel||(rule==='gte'?`${threshold}% 이상`:'작업조건 확인 필요')):null,
        criterion_text:isTarget&&rule==='manual_review'?'수기 확인 결과 제품 함유량만으로 확정하지 않고 작업조건을 별도 검토합니다.':null,
        source:'MANUAL',data_source:'MANUAL',verification_status:'manual_confirmed',manual_source:source,manual_note:note,manual_confirmed_at:now,
        status:isTarget?'active':'inactive',updated_at:now
      };
      const {error}=await sb.from('qa_work_environment_standards').update(payload).eq('id',r.id);
      if(error)throw error;
      closeManual(); toast(isTarget?'수기 확인 완료 · 대상물질기준에 반영했습니다.':'수기 확인 완료 · 비대상 기록을 보존합니다.');
      await load(); setFilter('target');
    }catch(e){ console.error(e); toast('수기 확인 저장에 실패했습니다: '+String(e.message||e),true); }
    finally{ btn.disabled=false; }
  });

  window.addEventListener('message',event=>{
    const p=event.data||{};
    if(p.type==='portal-tab-change' && (p.tabId==='qa-work-environment'||p.tab==='qa-work-environment')){
      try{window.parent?.postMessage({type:'portal-tab-active',activeTabId:'qa-work-environment',source:'qa-work-environment'},'*')}catch(_){}
    }
  });
  try{window.parent?.postMessage({type:'portal-tab-active',activeTabId:'qa-work-environment',source:'qa-work-environment'},'*')}catch(_){}

  applyPermissionUi();
  setView('standards');
  load();
})();
