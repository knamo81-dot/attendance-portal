(() => {
  const STORAGE_BUCKET = 'qa-sds-files';
  const state = {
    rows: [],
    filter: 'target',
    manualId: null,
    loading: false,
    currentView: 'status',
    statusRows: [],
    targetEditId: null,
    measurementTargetId: null,
    measurementEditId: null,
    historyTargetId: null,
    historyRows: [],
    targetStandardIds: new Set(),
    pickerDraftIds: new Set(),
    targetOrgRows: [],
    targetTaskRows: [],
    orgDirectory: { divisions: [], teams: [] }
  };

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = () => window.parent?.portalSupabase || window.portalSupabase || null;
  const fmtDate = v => v ? new Date(v).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\. /g,'.').replace(/\.$/,'') : '-';
  const isoToday = () => {
    const d=new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };
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
  function userName(){
    const s=portalSession(), e=s.employee||{}, u=s.user||{}, p=s.profile||{};
    return String(e.name||e.employee_name||u.name||u.user_name||p.name||p.full_name||s.name||'').trim() || null;
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
    clearTimeout(toast._timer); toast._timer=setTimeout(()=>t.classList.add('hidden'),3000);
  }

  function arr(v){
    if(Array.isArray(v))return v;
    if(v==null)return [];
    if(typeof v==='string'){
      try{const p=JSON.parse(v);return Array.isArray(p)?p:[]}catch(_){return []}
    }
    return [];
  }
  function uniqBy(list,keyFn){
    const out=[],seen=new Set();
    for(const item of list||[]){const k=keyFn(item);if(seen.has(k))continue;seen.add(k);out.push(item)}
    return out;
  }
  async function loadOrgDirectory(){
    const sb=client(); if(!sb)return;
    try{
      const [divRes,teamRes]=await Promise.all([
        sb.from('divisions').select('division_code,division_name,is_active').eq('is_active',true).order('division_code'),
        sb.from('teams').select('team_code,team_name,division_code,is_virtual,is_active').eq('is_active',true).order('division_code').order('team_code')
      ]);
      if(divRes.error)throw divRes.error;
      if(teamRes.error)throw teamRes.error;
      state.orgDirectory.divisions=divRes.data||[];
      state.orgDirectory.teams=teamRes.data||[];
    }catch(e){
      console.error('조직관리 조회 실패',e);
      state.orgDirectory.divisions=[];
      state.orgDirectory.teams=[];
      toast('설정의 조직정보를 불러오지 못했습니다.',true);
    }
  }
  function applyPermissionUi(){
    const manage=canManageQa();
    $('#refreshBtn').hidden=!manage;
    $('#newTargetBtn').hidden=!manage;
    $('#actionHead').hidden=!manage;
    $('#statusActionHead').hidden=!manage;
    document.body.classList.toggle('qa-workenv-viewer',!manage);
  }
  function setView(view){
    state.currentView=view;
    $$('.inner-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('#statusView').classList.toggle('hidden',view!=='status');
    $('#standardsView').classList.toggle('hidden',view!=='standards');
    if(view==='status') loadStatus();
  }
  $$('.inner-tabs button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

  // =========================================================
  // 대상물질기준
  // =========================================================
  function setFilter(filter){
    state.filter=filter;
    $$('.stat-card[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
    renderStandards();
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

  function renderStandards(){
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
      const productHtml=products.length ? products.map(p=>`<div class="mobile-product-line"><div><b>${esc(p.product_name||`제품 #${p.product_id}`)}</b><small>${esc([p.maker,p.product_code].filter(Boolean).join(' · ')||'-')}</small></div><div class="mobile-product-right">${matchBadge(p.match_status)}<span>${esc(percentText(p))}</span></div></div>`).join('') : '<div class="mobile-empty-sub">연결된 제품이 없습니다.</div>';
      const action=state.filter==='unverified' ? (canManageQa()?`<button class="mini" data-manual="${r.id}">수기확인</button>`:'') : '<span class="status-ok">적용중</span>';
      return `<article class="workenv-card" data-standard-card="${esc(r.id)}">
        <button type="button" class="workenv-card-head" data-standard-toggle="${esc(r.id)}">
          <span class="workenv-card-title">
            <strong>${esc(r.name_ko||r.name_en||'-')}</strong>
            <small>${esc(r.name_en||'')}</small>
          </span>
          <span class="workenv-card-side">
            <b>${esc(r.cas_no||'-')}</b>
            ${matchBadge(rowMatch(r))}
          </span>
        </button>
        <div class="workenv-card-summary">
          <span>${esc(src)}</span>
          <span>${esc(thresholdText(r))}</span>
          <span>제품 ${products.length}개</span>
        </div>
        <div class="workenv-card-detail">
          <div class="workenv-detail-grid">
            <div class="workenv-detail-item"><span>CAS No.</span><b>${esc(r.cas_no||'-')}</b></div>
            <div class="workenv-detail-item"><span>출처</span><b>${esc(src)}</b></div>
            <div class="workenv-detail-item"><span>적용기준</span><b>${esc(thresholdText(r))}</b></div>
            <div class="workenv-detail-item"><span>제품판정</span><div>${rowStatusHtml(r)}</div></div>
            <div class="workenv-detail-item"><span>최근입고일</span><b>${esc(r.latest_receipt||'-')}</b></div>
            <div class="workenv-detail-item"><span>최근사용일</span><b>${esc(r.latest_usage||'-')}</b></div>
            <div class="workenv-detail-item wide"><span>보유제품 · ${products.length}개</span><div class="mobile-products">${productHtml}</div></div>
          </div>
          ${action?`<div class="workenv-card-actions">${action}</div>`:''}
        </div>
      </article>`;
    }).join('') : `<div class="empty-card">${state.filter==='unverified'?'KOSHA 미확인 물질이 없습니다.':'표시할 작업환경측정 대상물질이 없습니다.'}</div>`;

    $$('[data-standard-toggle]').forEach(b=>b.addEventListener('click',()=>{
      const card=b.closest('.workenv-card');
      const wasOpen=card?.classList.contains('open');
      $$('#standardsBody .workenv-card.open').forEach(x=>x.classList.remove('open'));
      if(card&&!wasOpen)card.classList.add('open');
    }));
    $$('[data-manual]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openManual(Number(b.dataset.manual))}));
  }

  function fillStandardFilters(){
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

  async function loadStandards(){
    const sb=client();
    if(!sb){ $('#standardsBody').innerHTML='<div class="empty-card">포털 Supabase 연결을 찾을 수 없습니다.</div>'; return; }
    try{
      const cid=companyId();
      const sr=await sb.from('vw_qa_work_environment_standards').select('*').order('chemical_id');
      if(sr.error)throw sr.error;
      const standards=sr.data||[];

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
        const products=matchesByStandard.get(String(s.id))||[];
        const rec=products.map(p=>latestReceipt.get(p.product_id)).filter(Boolean).sort().at(-1)||null;
        const use=products.map(p=>latestUsage.get(p.product_id)).filter(Boolean).sort().at(-1)||null;
        return {
          ...s,
          cas_no:s.cas_no||'',
          name_ko:s.chem_name_ko||'',
          name_en:s.chem_name_en||'',
          products,
          latest_receipt:rec,
          latest_usage:use
        };
      });

      const targets=state.rows.filter(r=>r.is_target===true&&r.verification_status!=='kosha_not_found');
      const unv=state.rows.filter(r=>r.verification_status==='kosha_not_found');
      const linked=new Set(targets.flatMap(r=>(r.products||[]).map(p=>String(p.product_id))));
      $('#hazardCount').textContent=targets.length+'종';
      $('#unverifiedCount').textContent=unv.length+'종';
      $('#productCount').textContent=linked.size+'개';
      const checked=state.rows.map(r=>r.api_checked_at).filter(Boolean).sort().at(-1);
      $('#apiChecked').textContent=fmtDate(checked);
      fillStandardFilters();
      renderStandards();
    }catch(e){
      console.error(e);
      $('#standardsBody').innerHTML=`<div class="empty-card">기준정보 조회 실패: ${esc(e.message||e)}</div>`;
      toast('작업환경측정 대상물질 기준정보를 불러오지 못했습니다.',true);
    }
  }

  ['searchInput','sourceFilter','thresholdFilter','matchFilter'].forEach(id=>$('#'+id)?.addEventListener(id==='searchInput'?'input':'change',renderStandards));

  $('#refreshBtn')?.addEventListener('click',async()=>{
    if(!canManageQa())return toast('조회 전용 사용자입니다. 기준정보 갱신은 QA 운영자만 가능합니다.',true);
    if(state.loading)return;
    const sb=client(); if(!sb)return toast('Supabase 연결을 찾을 수 없습니다.',true);
    state.loading=true; const b=$('#refreshBtn'); b.disabled=true; b.textContent='갱신 중…';
    try{
      const {data,error}=await sb.functions.invoke('kosha-work-environment-sync',{body:{mode:'all'}});
      if(error)throw error; if(!data?.success)throw new Error(data?.error||'API 갱신 실패');
      toast(`갱신 완료 · 대상 ${data.summary?.target??0} / 미확인 ${data.summary?.not_found??0}`);
      await loadStandards(); setFilter('target');
    }catch(e){ console.error(e); toast('API 기준정보 갱신에 실패했습니다: '+String(e.message||e),true); }
    finally{ state.loading=false; b.disabled=false; b.textContent='↻ API 기준정보 갱신'; }
  });

  // =========================================================
  // 작업환경측정 현황
  // =========================================================
  function scheduleState(r){
    if(!r.latest_measurement_id) return 'unmeasured';
    if(r.latest_result_status==='exceeded') return 'exceeded';
    const next=String(r.next_measurement_date||'');
    if(next){
      if(next < isoToday()) return 'overdue';
      return 'due';
    }
    return 'done';
  }
  function scheduleBadge(status){
    const map={
      unmeasured:['미측정','unmeasured'],
      done:['측정완료','done'],
      due:['측정예정','due'],
      overdue:['기한초과','overdue'],
      exceeded:['기준초과','exceeded']
    };
    const [label,cls]=map[status]||['-','unmeasured'];
    return `<span class="schedule-badge ${cls}">${label}</span>`;
  }
  function resultBadge(status){
    if(status==='within_limit')return '<span class="badge green">기준 이하</span>';
    if(status==='exceeded')return '<span class="badge red">기준 초과</span>';
    if(status==='review')return '<span class="badge warn">확인 필요</span>';
    return '<span class="badge gray">미입력</span>';
  }
  function measurementText(r){
    const hasVal=r.latest_measurement_value!==null && r.latest_measurement_value!==undefined && r.latest_measurement_value!=='';
    const value=hasVal ? `${r.latest_measurement_value}${r.latest_measurement_unit?' '+r.latest_measurement_unit:''}` : '-';
    const limit=r.latest_exposure_limit_text||'';
    return `<div class="measurement-result"><b>${esc(value)}</b>${limit?`<small>${esc(limit)}</small>`:''}${resultBadge(r.latest_result_status)}</div>`;
  }
  function yearOf(v){ return String(v||'').slice(0,4); }
  function fillStatusYears(){
    const sel=$('#statusYear'); if(!sel)return;
    const current=new Date().getFullYear();
    const years=new Set([current-2,current-1,current,current+1]);
    state.statusRows.forEach(r=>{
      if(r.latest_measurement_date)years.add(Number(yearOf(r.latest_measurement_date)));
      if(r.next_measurement_date)years.add(Number(yearOf(r.next_measurement_date)));
    });
    const prev=sel.value;
    sel.innerHTML=[...years].filter(Number.isFinite).sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}년</option>`).join('');
    sel.value=prev && [...years].map(String).includes(prev) ? prev : String(current);
  }
  function rowSubstances(r){ return arr(r.substances); }
  function rowOrganizations(r){ return arr(r.organizations); }
  function rowTasks(r){ return arr(r.tasks); }

  function fillStatusOrgFilters(){
    const divSel=$('#statusDivision'), teamSel=$('#statusTeam');
    const prevDiv=divSel.value, prevTeam=teamSel.value;
    const allOrgs=state.statusRows.flatMap(rowOrganizations);
    const divisions=[...new Set(allOrgs.map(o=>String(o.division_name||'').trim()).filter(Boolean))].sort();
    divSel.innerHTML='<option value="">전체</option>'+divisions.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(divisions.includes(prevDiv))divSel.value=prevDiv;
    const selectedDiv=divSel.value;
    const teams=[...new Set(allOrgs.filter(o=>!selectedDiv||o.division_name===selectedDiv).map(o=>String(o.team_name||'').trim()).filter(Boolean))].sort();
    teamSel.innerHTML='<option value="">전체</option>'+teams.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(teams.includes(prevTeam))teamSel.value=prevTeam;
  }
  function relevantToYear(r,year){
    if(!year)return true;
    if(!r.latest_measurement_id)return true;
    return yearOf(r.latest_measurement_date)===year || yearOf(r.next_measurement_date)===year;
  }
  function filteredStatusRows(){
    const year=$('#statusYear').value;
    const status=$('#statusState').value;
    const division=$('#statusDivision').value;
    const team=$('#statusTeam').value;
    const q=$('#statusSearch').value.trim().toLowerCase();
    return state.statusRows.filter(r=>{
      const s=scheduleState(r);
      const subs=rowSubstances(r), orgs=rowOrganizations(r), tasks=rowTasks(r);
      const hay=[
        ...subs.flatMap(x=>[x.cas_no,x.chem_name_ko,x.chem_name_en]),
        ...orgs.flatMap(x=>[x.division_name,x.team_name]),
        ...tasks.flatMap(x=>[x.work_area,x.process_name]),
        r.latest_measurement_company
      ].join(' ').toLowerCase();
      const orgMatch=(!division&&!team) || orgs.some(o=>(!division||o.division_name===division)&&(!team||o.team_name===team));
      return relevantToYear(r,year) && (!status||s===status) && orgMatch && (!q||hay.includes(q));
    });
  }
  function compactLines(items,renderer,max=3){
    if(!items.length)return '-';
    const shown=items.slice(0,max).map(renderer).join('');
    const more=items.length>max?`<span class="more">외 ${items.length-max}건</span>`:'';
    return `<div class="multi-lines">${shown}${more}</div>`;
  }
  function renderStatus(){
    const rows=filteredStatusRows();
    const year=$('#statusYear').value;
    const base=state.statusRows.filter(r=>relevantToYear(r,year));
    $('#statusTargetCount').textContent=base.length+'건';
    $('#statusDoneCount').textContent=base.filter(r=>yearOf(r.latest_measurement_date)===year).length+'건';
    $('#statusDueCount').textContent=base.filter(r=>scheduleState(r)==='due').length+'건';
    $('#statusOverdueCount').textContent=base.filter(r=>scheduleState(r)==='overdue').length+'건';

    $('#statusBody').innerHTML=rows.length?rows.map(r=>{
      const status=scheduleState(r);
      const subs=rowSubstances(r),orgs=rowOrganizations(r),tasks=rowTasks(r);
      const title=subs.map(s=>s.chem_name_ko||s.chem_name_en).filter(Boolean).join(' · ')||'대상물질 미지정';
      const casText=subs.map(s=>s.cas_no).filter(Boolean).join(' · ')||'-';
      const orgText=orgs.map(o=>[o.division_name,o.team_name].filter(Boolean).join(' / ')).filter(Boolean).join(' · ')||'-';
      const taskText=tasks.map(t=>[t.work_area,t.process_name].filter(Boolean).join(' / ')).filter(Boolean).join(' · ')||'-';
      const report=r.report_file_path?`<button type="button" class="report-btn" data-report="${r.latest_measurement_id}">성적서 보기</button>`:'<span class="mobile-none">없음</span>';
      const actions=canManageQa()?`<div class="status-actions"><button class="mini" data-measure="${r.target_id}">측정입력</button><button class="mini gray" data-history="${r.target_id}">이력</button><button class="mini gray" data-target-edit="${r.target_id}">대상수정</button><button class="mini red" data-target-end="${r.target_id}">대상종료</button></div>`:'';
      return `<article class="workenv-card status-mobile-card" data-status-card="${esc(r.target_id)}">
        <button type="button" class="workenv-card-head" data-status-toggle="${esc(r.target_id)}">
          <span class="workenv-card-title">
            <strong>${esc(title)}</strong>
            <small>${esc(orgText)}</small>
          </span>
          <span class="workenv-card-side">${scheduleBadge(status)}</span>
        </button>
        <div class="workenv-card-summary status-summary-line">
          <span>최근 ${esc(r.latest_measurement_date||'-')}</span>
          <span>다음 ${esc(r.next_measurement_date||'-')}</span>
        </div>
        <div class="workenv-card-detail">
          <div class="workenv-detail-grid">
            <div class="workenv-detail-item wide"><span>CAS No.</span><b>${esc(casText)}</b></div>
            <div class="workenv-detail-item wide"><span>대상물질</span><b>${esc(title)}</b></div>
            <div class="workenv-detail-item wide"><span>본부 / 팀</span><b>${esc(orgText)}</b></div>
            <div class="workenv-detail-item wide"><span>작업장 / 공정</span><b>${esc(taskText)}</b>${r.first_applied_date?`<small>관리시작 ${esc(r.first_applied_date)}</small>`:''}</div>
            <div class="workenv-detail-item"><span>최근 측정일</span><b>${esc(r.latest_measurement_date||'-')}</b></div>
            <div class="workenv-detail-item"><span>다음 측정일</span><b>${esc(r.next_measurement_date||'-')}</b></div>
            <div class="workenv-detail-item wide"><span>측정결과</span><div>${measurementText(r)}</div></div>
            <div class="workenv-detail-item"><span>측정기관</span><b>${esc(r.latest_measurement_company||'-')}</b></div>
            <div class="workenv-detail-item"><span>성적서</span><div>${report}</div></div>
          </div>
          ${actions?`<div class="workenv-card-actions">${actions}</div>`:''}
        </div>
      </article>`;
    }).join(''):`<div class="empty-card">조건에 맞는 작업환경측정 현황이 없습니다.</div>`;

    $$('[data-status-toggle]').forEach(b=>b.addEventListener('click',()=>{
      const card=b.closest('.workenv-card');
      const wasOpen=card?.classList.contains('open');
      $$('#statusBody .workenv-card.open').forEach(x=>x.classList.remove('open'));
      if(card&&!wasOpen)card.classList.add('open');
    }));
    $$('[data-measure]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openMeasurementModal(Number(b.dataset.measure))}));
    $$('[data-history]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openHistoryModal(Number(b.dataset.history))}));
    $$('[data-target-edit]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openTargetModal(Number(b.dataset.targetEdit))}));
    $$('[data-target-end]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();endTarget(Number(b.dataset.targetEnd))}));
    $$('[data-report]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openLatestReport(Number(b.dataset.report))}));
  }


  async function loadStatus(){
    const sb=client(); if(!sb)return;
    const cid=companyId();
    try{
      let q=sb.from('vw_qa_work_environment_status').select('*').eq('target_status','active');
      if(cid)q=q.eq('company_id',cid);
      const {data,error}=await q.order('target_id',{ascending:true});
      if(error)throw error;
      state.statusRows=data||[];
      fillStatusYears();
      fillStatusOrgFilters();
      renderStatus();
    }catch(e){
      console.error(e);
      $('#statusBody').innerHTML=`<div class="empty-card">현황 DB 조회 실패: ${esc(e.message||e)}<br>database/QA_작업환경측정_복수연결_DB_3단계.sql 실행 여부를 확인해 주세요.</div>`;
      $('#statusTargetCount').textContent='-'; $('#statusDoneCount').textContent='-'; $('#statusDueCount').textContent='-'; $('#statusOverdueCount').textContent='-';
    }
  }

  function eligibleStandards(){
    return state.rows.filter(r=>r.is_target===true&&r.verification_status!=='kosha_not_found');
  }
  function standardOptionLabel(r){
    return `${r.cas_no} · ${r.name_ko||r.name_en||'-'} · ${thresholdText(r)}`;
  }
  function selectedStandards(){
    const map=new Map(state.rows.map(r=>[Number(r.id),r]));
    return [...state.targetStandardIds].map(id=>map.get(Number(id))).filter(Boolean);
  }
  function renderSelectedSubstances(){
    const box=$('#targetSubstanceSummary');
    const rows=selectedStandards();
    const has=rows.length>0;
    box.classList.toggle('empty',!has);
    box.innerHTML=has?rows.sort((a,b)=>String(a.cas_no).localeCompare(String(b.cas_no))).map(r=>`<span class="selected-chip"><b>${esc(r.cas_no)}</b><span>${esc(r.name_ko||r.name_en||'-')}</span><small>${esc(thresholdText(r))}</small></span>`).join(''):'선택된 대상물질이 없습니다.';
    $('#targetSubstanceSelect').classList.toggle('hidden',has);
    $('#targetSubstanceEdit').classList.toggle('hidden',!has);
    $('#targetSubstanceClear').classList.toggle('hidden',!has);
  }
  function renderSubstancePicker(){
    const q=$('#substancePickerSearch').value.trim().toLowerCase();
    const rows=eligibleStandards().filter(r=>!q||[r.cas_no,r.name_ko,r.name_en].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(a.cas_no).localeCompare(String(b.cas_no)));
    $('#substancePickerCount').textContent=`${state.pickerDraftIds.size}종 선택`;
    $('#substancePickerList').innerHTML=rows.length?rows.map(r=>`<label class="picker-item"><input type="checkbox" value="${r.id}" ${state.pickerDraftIds.has(Number(r.id))?'checked':''}><span class="cas">${esc(r.cas_no)}</span><span class="name"><b>${esc(r.name_ko||'-')}</b><small>${esc(r.name_en||'')}</small></span><span class="threshold">${esc(thresholdText(r))}</span></label>`).join(''):'<div class="empty">검색 결과가 없습니다.</div>';
    $$('#substancePickerList input[type="checkbox"]').forEach(ch=>ch.addEventListener('change',()=>{
      const id=Number(ch.value);
      if(ch.checked)state.pickerDraftIds.add(id);else state.pickerDraftIds.delete(id);
      $('#substancePickerCount').textContent=`${state.pickerDraftIds.size}종 선택`;
    }));
  }
  function openSubstancePicker(){
    state.pickerDraftIds=new Set([...state.targetStandardIds].map(Number));
    $('#substancePickerSearch').value='';
    renderSubstancePicker();
    $('#substancePickerModal').classList.remove('hidden');
  }
  function closeSubstancePicker(){ $('#substancePickerModal').classList.add('hidden'); }
  $('#targetSubstanceSelect')?.addEventListener('click',openSubstancePicker);
  $('#targetSubstanceEdit')?.addEventListener('click',openSubstancePicker);
  $('#targetSubstanceClear')?.addEventListener('click',()=>{
    state.targetStandardIds.clear();
    renderSelectedSubstances();
  });
  $('#substancePickerClose')?.addEventListener('click',closeSubstancePicker);
  $('#substancePickerCancel')?.addEventListener('click',closeSubstancePicker);
  $('#substancePickerModal')?.addEventListener('click',e=>{if(e.target===$('#substancePickerModal'))closeSubstancePicker()});
  $('#substancePickerSearch')?.addEventListener('input',renderSubstancePicker);
  $('#substancePickerApply')?.addEventListener('click',()=>{
    state.targetStandardIds=new Set([...state.pickerDraftIds].map(Number));
    renderSelectedSubstances();
    closeSubstancePicker();
  });

  function divisionOptions(selected=''){
    const rows=state.orgDirectory.divisions||[];
    return '<option value="">본부 선택</option>'+rows.map(d=>`<option value="${esc(d.division_code)}" ${String(d.division_code)===String(selected)?'selected':''}>${esc(d.division_name)} (${esc(d.division_code)})</option>`).join('');
  }
  function teamOptions(divisionCode,selected=''){
    const rows=(state.orgDirectory.teams||[]).filter(t=>String(t.division_code)===String(divisionCode));
    return '<option value="">팀 선택</option>'+rows.map(t=>`<option value="${esc(t.team_code)}" ${String(t.team_code)===String(selected)?'selected':''}>${esc(t.team_name)}${t.is_virtual?' · 가상팀':''}</option>`).join('');
  }
  function addOrgRow(seed={}){
    state.targetOrgRows.push({
      key:crypto?.randomUUID?.()||String(Date.now()+Math.random()),
      division_code:seed.division_code||'',
      division_name:seed.division_name||'',
      team_code:seed.team_code||'',
      team_name:seed.team_name||''
    });
    renderOrgRows();
  }
  function renderOrgRows(){
    const box=$('#targetOrgRows');
    if(!state.targetOrgRows.length){
      box.innerHTML='<div class="selected-summary empty">대상조직을 추가해 주세요.</div>';
      return;
    }
    box.innerHTML=state.targetOrgRows.map((o,i)=>`<div class="repeat-row" data-org-row="${i}">
      <label><span>본부</span><select data-org-division="${i}">${divisionOptions(o.division_code)}</select></label>
      <label><span>팀</span><select data-org-team="${i}">${teamOptions(o.division_code,o.team_code)}</select></label>
      <button type="button" class="row-remove" data-org-remove="${i}">삭제</button>
    </div>`).join('');
    $$('[data-org-division]').forEach(sel=>sel.addEventListener('change',()=>{
      const i=Number(sel.dataset.orgDivision),row=state.targetOrgRows[i];
      row.division_code=sel.value;
      const d=state.orgDirectory.divisions.find(x=>String(x.division_code)===String(sel.value));
      row.division_name=d?.division_name||'';
      row.team_code='';row.team_name='';
      renderOrgRows();
    }));
    $$('[data-org-team]').forEach(sel=>sel.addEventListener('change',()=>{
      const i=Number(sel.dataset.orgTeam),row=state.targetOrgRows[i];
      row.team_code=sel.value;
      const t=state.orgDirectory.teams.find(x=>String(x.team_code)===String(sel.value));
      row.team_name=t?.team_name||'';
    }));
    $$('[data-org-remove]').forEach(b=>b.addEventListener('click',()=>{
      state.targetOrgRows.splice(Number(b.dataset.orgRemove),1);renderOrgRows();
    }));
  }
  $('#targetOrgAdd')?.addEventListener('click',()=>addOrgRow());

  function addTaskRow(seed={}){
    state.targetTaskRows.push({
      key:crypto?.randomUUID?.()||String(Date.now()+Math.random()),
      work_area:seed.work_area||'',
      process_name:seed.process_name||''
    });
    renderTaskRows();
  }
  function renderTaskRows(){
    const box=$('#targetTaskRows');
    if(!state.targetTaskRows.length){
      box.innerHTML='<div class="selected-summary empty">작업장/장소와 공정/작업을 추가해 주세요.</div>';
      return;
    }
    box.innerHTML=state.targetTaskRows.map((t,i)=>`<div class="repeat-row" data-task-row="${i}">
      <label><span>작업장 / 장소 *</span><input data-task-area="${i}" value="${esc(t.work_area)}" placeholder="예: 제제실험실"></label>
      <label><span>공정 / 작업</span><input data-task-process="${i}" value="${esc(t.process_name)}" placeholder="예: 용매 조제"></label>
      <button type="button" class="row-remove" data-task-remove="${i}">삭제</button>
    </div>`).join('');
    $$('[data-task-area]').forEach(inp=>inp.addEventListener('input',()=>{state.targetTaskRows[Number(inp.dataset.taskArea)].work_area=inp.value}));
    $$('[data-task-process]').forEach(inp=>inp.addEventListener('input',()=>{state.targetTaskRows[Number(inp.dataset.taskProcess)].process_name=inp.value}));
    $$('[data-task-remove]').forEach(b=>b.addEventListener('click',()=>{state.targetTaskRows.splice(Number(b.dataset.taskRemove),1);renderTaskRows()}));
  }
  $('#targetTaskAdd')?.addEventListener('click',()=>addTaskRow());

  function closeTargetModal(){
    state.targetEditId=null;
    state.targetStandardIds=new Set();
    state.targetOrgRows=[];
    state.targetTaskRows=[];
    $('#targetModal').classList.add('hidden');
  }
  async function openTargetModal(id=null){
    if(!canManageQa())return toast('조회 전용 사용자입니다.',true);
    if(!state.orgDirectory.divisions.length)await loadOrgDirectory();
    state.targetEditId=id;
    const row=id?state.statusRows.find(r=>Number(r.target_id)===Number(id)):null;
    $('#targetModalTitle').textContent=row?'측정대상 수정':'측정대상 등록';
    state.targetStandardIds=new Set(row?rowSubstances(row).map(x=>Number(x.standard_id)).filter(Number.isFinite):[]);
    state.targetOrgRows=row?rowOrganizations(row).map(x=>({...x,key:crypto?.randomUUID?.()||String(Math.random())})):[];
    state.targetTaskRows=row?rowTasks(row).map(x=>({...x,key:crypto?.randomUUID?.()||String(Math.random())})):[];
    if(!state.targetOrgRows.length)addOrgRow(); else renderOrgRows();
    if(!state.targetTaskRows.length)addTaskRow(); else renderTaskRows();
    renderSelectedSubstances();
    $('#targetFirstDate').value=row?.first_applied_date||'';
    $('#targetNote').value=row?.target_note||'';
    $('#targetModal').classList.remove('hidden');
  }

  $('#newTargetBtn')?.addEventListener('click',()=>openTargetModal());
  $('#targetModalClose')?.addEventListener('click',closeTargetModal);
  $('#targetModalCancel')?.addEventListener('click',closeTargetModal);
  $('#targetModal')?.addEventListener('click',e=>{if(e.target===$('#targetModal'))closeTargetModal()});

  function normalizedOrgPayload(){
    return state.targetOrgRows.map(o=>{
      const d=state.orgDirectory.divisions.find(x=>String(x.division_code)===String(o.division_code));
      const t=state.orgDirectory.teams.find(x=>String(x.team_code)===String(o.team_code));
      return {
        division_code:o.division_code||null,
        division_name:d?.division_name||o.division_name||null,
        team_code:o.team_code||null,
        team_name:t?.team_name||o.team_name||null
      };
    }).filter(o=>o.division_code&&o.team_code);
  }
  function normalizedTaskPayload(){
    return state.targetTaskRows.map(t=>({work_area:String(t.work_area||'').trim(),process_name:String(t.process_name||'').trim()||null})).filter(t=>t.work_area);
  }

  $('#targetSave')?.addEventListener('click',async()=>{
    if(!canManageQa())return toast('조회 전용 사용자입니다.',true);
    const sb=client(),cid=companyId(); if(!sb||!cid)return toast('회사정보 또는 Supabase 연결을 확인해 주세요.',true);
    const standardIds=[...state.targetStandardIds].map(Number).filter(Number.isFinite);
    const orgs=normalizedOrgPayload();
    const tasks=normalizedTaskPayload();
    if(!standardIds.length)return toast('대상물질을 1개 이상 선택해 주세요.',true);
    if(!orgs.length)return toast('대상조직의 본부와 팀을 선택해 주세요.',true);
    if(!tasks.length)return toast('작업장 / 장소를 1개 이상 입력해 주세요.',true);

    const btn=$('#targetSave');btn.disabled=true;
    const wasEdit=!!state.targetEditId;
    try{
      const {data,error}=await sb.rpc('save_qa_work_environment_target',{
        p_company_id:cid,
        p_target_id:state.targetEditId||null,
        p_first_applied_date:$('#targetFirstDate').value||null,
        p_note:$('#targetNote').value.trim()||null,
        p_user_name:userName(),
        p_standard_ids:standardIds,
        p_orgs:orgs,
        p_tasks:tasks
      });
      if(error)throw error;
      closeTargetModal();
      toast(wasEdit?'측정대상을 수정했습니다.':'측정대상을 등록했습니다.');
      await loadStatus();
    }catch(e){console.error(e);toast('측정대상 저장 실패: '+String(e.message||e),true)}
    finally{btn.disabled=false}
  });

  async function endTarget(id){
    if(!canManageQa())return;
    const row=state.statusRows.find(r=>Number(r.target_id)===Number(id)); if(!row)return;
    if(!confirm(`${targetSummary(row)}
측정대상을 종료할까요?
기존 측정이력은 보존됩니다.`))return;
    const sb=client(),cid=companyId();
    const {error}=await sb.from('qa_work_environment_targets').update({status:'inactive',updated_by:userName()}).eq('id',id).eq('company_id',cid);
    if(error)return toast('측정대상 종료 실패: '+error.message,true);
    toast('측정대상을 종료했습니다.');await loadStatus();
  }

  function targetSummary(row){
    const subs=rowSubstances(row),orgs=rowOrganizations(row),tasks=rowTasks(row);
    const subText=subs.length?`${subs[0].cas_no||''} ${subs[0].chem_name_ko||subs[0].chem_name_en||''}${subs.length>1?` 외 ${subs.length-1}종`:''}`:'대상물질 없음';
    const orgText=orgs.length?`${[orgs[0].division_name,orgs[0].team_name].filter(Boolean).join('/')}${orgs.length>1?` 외 ${orgs.length-1}개 조직`:''}`:'조직 없음';
    const taskText=tasks.length?`${[tasks[0].work_area,tasks[0].process_name].filter(Boolean).join('/')}${tasks.length>1?` 외 ${tasks.length-1}개 작업`:''}`:'작업 없음';
    return `${subText} · ${orgText} · ${taskText}`;
  }
  function closeMeasurementModal(){
    state.measurementTargetId=null;state.measurementEditId=null;
    $('#measurementModal').classList.add('hidden');
    $('#measurementReport').value='';
  }
  async function openMeasurementModal(targetId,measurement=null){
    if(!canManageQa())return toast('조회 전용 사용자입니다.',true);
    const target=state.statusRows.find(r=>Number(r.target_id)===Number(targetId)); if(!target)return;
    state.measurementTargetId=targetId;
    state.measurementEditId=measurement?.id||null;
    $('#measurementModalTitle').textContent=measurement?'측정결과 수정':'측정결과 입력';
    $('#measurementTargetSummary').textContent=targetSummary(target);
    $('#measurementDate').value=measurement?.measurement_date||isoToday();
    $('#measurementResultStatus').value=measurement?.result_status||'within_limit';
    $('#measurementValue').value=measurement?.measurement_value??'';
    $('#measurementUnit').value=measurement?.measurement_unit||'';
    $('#measurementLimit').value=measurement?.exposure_limit_text||'';
    $('#measurementCompany').value=measurement?.measurement_company||'';
    $('#measurementNextDate').value=measurement?.next_measurement_date||'';
    $('#measurementNote').value=measurement?.note||'';
    $('#measurementReport').value='';
    const hasReport=!!measurement?.report_file_path;
    $('#currentReportBox').classList.toggle('hidden',!hasReport);
    $('#currentReportName').textContent=measurement?.report_file_name||'-';
    $('#currentReportOpen').dataset.path=measurement?.report_file_path||'';
    $('#measurementModal').classList.remove('hidden');
  }
  $('#measurementModalClose')?.addEventListener('click',closeMeasurementModal);
  $('#measurementModalCancel')?.addEventListener('click',closeMeasurementModal);
  $('#measurementModal')?.addEventListener('click',e=>{if(e.target===$('#measurementModal'))closeMeasurementModal()});
  $('#currentReportOpen')?.addEventListener('click',()=>openStoragePath($('#currentReportOpen').dataset.path));

  function safeFileName(name){return String(name||'report.pdf').replace(/[^0-9A-Za-z가-힣._-]+/g,'_')}
  function validateReport(file){
    if(!file)return;
    const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
    if(!isPdf)throw new Error('성적서는 PDF 파일만 등록할 수 있습니다.');
    if(file.size>20*1024*1024)throw new Error('성적서는 20MB 이하만 등록할 수 있습니다.');
  }
  async function uploadReport(sb,file,targetId,cid){
    validateReport(file);
    const path=`${cid}/work-environment/${targetId}/${Date.now()}_${safeFileName(file.name)}`;
    const {error}=await sb.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:'application/pdf',upsert:false});
    if(error)throw error;
    return {report_file_path:path,report_file_name:file.name,report_file_size:file.size};
  }
  async function openStoragePath(path){
    if(!path)return;
    const sb=client();if(!sb)return;
    const {data,error}=await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path,300);
    if(error)return toast('성적서를 열 수 없습니다: '+error.message,true);
    if(data?.signedUrl)window.open(data.signedUrl,'_blank','noopener');
  }

  $('#measurementSave')?.addEventListener('click',async()=>{
    if(!canManageQa())return toast('조회 전용 사용자입니다.',true);
    const sb=client(),cid=companyId(); if(!sb||!cid)return toast('회사정보 또는 Supabase 연결을 확인해 주세요.',true);
    const target=state.statusRows.find(r=>Number(r.target_id)===Number(state.measurementTargetId)); if(!target)return;
    const date=$('#measurementDate').value;
    if(!date)return toast('측정일을 입력해 주세요.',true);
    const file=$('#measurementReport').files?.[0]||null;
    try{validateReport(file)}catch(e){return toast(e.message,true)}
    const btn=$('#measurementSave');btn.disabled=true;
    let uploaded=null;
    try{
      let current=null;
      if(state.measurementEditId){
        const {data,error}=await sb.from('qa_work_environment_measurements').select('*').eq('id',state.measurementEditId).eq('company_id',cid).maybeSingle();
        if(error)throw error;current=data;
      }
      if(file)uploaded=await uploadReport(sb,file,target.target_id,cid);
      const valRaw=$('#measurementValue').value.trim();
      const payload={
        company_id:cid,
        target_id:target.target_id,
        measurement_date:date,
        measurement_value:valRaw===''?null:Number(valRaw),
        measurement_unit:$('#measurementUnit').value.trim()||null,
        exposure_limit_text:$('#measurementLimit').value.trim()||null,
        result_status:$('#measurementResultStatus').value,
        measurement_company:$('#measurementCompany').value.trim()||null,
        next_measurement_date:$('#measurementNextDate').value||null,
        note:$('#measurementNote').value.trim()||null,
        updated_by:userName(),
        ...(uploaded||{})
      };
      if(state.measurementEditId){
        const {error}=await sb.from('qa_work_environment_measurements').update(payload).eq('id',state.measurementEditId).eq('company_id',cid);
        if(error)throw error;
        if(uploaded && current?.report_file_path && current.report_file_path!==uploaded.report_file_path){
          sb.storage.from(STORAGE_BUCKET).remove([current.report_file_path]).then(()=>{}).catch(()=>{});
        }
      }else{
        payload.created_by=userName();
        const {error}=await sb.from('qa_work_environment_measurements').insert(payload);
        if(error)throw error;
      }
      closeMeasurementModal();toast(state.measurementEditId?'측정결과를 수정했습니다.':'측정결과를 등록했습니다.');
      await loadStatus();
      if(state.historyTargetId)await loadHistory(state.historyTargetId);
    }catch(e){
      console.error(e);
      if(uploaded?.report_file_path){try{await sb.storage.from(STORAGE_BUCKET).remove([uploaded.report_file_path])}catch(_){}}
      toast('측정결과 저장 실패: '+String(e.message||e),true);
    }finally{btn.disabled=false}
  });

  async function openLatestReport(measurementId){
    const sb=client(),cid=companyId();if(!sb)return;
    const {data,error}=await sb.from('qa_work_environment_measurements').select('report_file_path').eq('id',measurementId).eq('company_id',cid).maybeSingle();
    if(error||!data?.report_file_path)return toast('성적서를 찾을 수 없습니다.',true);
    openStoragePath(data.report_file_path);
  }

  function closeHistoryModal(){state.historyTargetId=null;state.historyRows=[];$('#historyModal').classList.add('hidden')}
  async function openHistoryModal(targetId){
    const target=state.statusRows.find(r=>Number(r.target_id)===Number(targetId));if(!target)return;
    state.historyTargetId=targetId;
    $('#historyTargetSummary').textContent=targetSummary(target);
    $('#historyModal').classList.remove('hidden');
    await loadHistory(targetId);
  }
  $('#historyModalClose')?.addEventListener('click',closeHistoryModal);
  $('#historyModalCloseBottom')?.addEventListener('click',closeHistoryModal);
  $('#historyModal')?.addEventListener('click',e=>{if(e.target===$('#historyModal'))closeHistoryModal()});
  $('#historyAddMeasurement')?.addEventListener('click',()=>{const id=state.historyTargetId;closeHistoryModal();if(id)openMeasurementModal(id)});

  async function loadHistory(targetId){
    const sb=client(),cid=companyId(); if(!sb)return;
    let q=sb.from('qa_work_environment_measurements').select('*').eq('target_id',targetId).eq('status','active');
    if(cid)q=q.eq('company_id',cid);
    const {data,error}=await q.order('measurement_date',{ascending:false}).order('id',{ascending:false});
    if(error){$('#historyBody').innerHTML=`<div class="empty-card">이력 조회 실패: ${esc(error.message)}</div>`;return}
    state.historyRows=data||[];
    $('#historyBody').innerHTML=state.historyRows.length?state.historyRows.map(m=>{
      const value=m.measurement_value!=null?`${m.measurement_value}${m.measurement_unit?' '+m.measurement_unit:''}`:'-';
      const actions=canManageQa()?`<div class="history-actions"><button class="mini gray" data-history-edit="${m.id}">수정</button><button class="mini red" data-history-delete="${m.id}">삭제</button></div>`:'';
      const report=m.report_file_path?`<button class="report-btn" data-history-report="${m.id}">보기</button>`:'<span class="mobile-none">없음</span>';
      return `<article class="history-mobile-card">
        <div class="history-mobile-head">
          <strong>${esc(m.measurement_date||'-')}</strong>
          ${resultBadge(m.result_status)}
        </div>
        <div class="workenv-detail-grid">
          <div class="workenv-detail-item"><span>측정결과</span><b>${esc(value)}</b>${m.exposure_limit_text?`<small>${esc(m.exposure_limit_text)}</small>`:''}</div>
          <div class="workenv-detail-item"><span>다음 측정일</span><b>${esc(m.next_measurement_date||'-')}</b></div>
          <div class="workenv-detail-item"><span>측정기관</span><b>${esc(m.measurement_company||'-')}</b></div>
          <div class="workenv-detail-item"><span>성적서</span><div>${report}</div></div>
        </div>
        ${actions?`<div class="workenv-card-actions">${actions}</div>`:''}
      </article>`;
    }).join(''):'<div class="empty-card">등록된 측정이력이 없습니다.</div>';
    $$('[data-history-report]').forEach(b=>b.addEventListener('click',()=>{
      const m=state.historyRows.find(x=>Number(x.id)===Number(b.dataset.historyReport));if(m?.report_file_path)openStoragePath(m.report_file_path);
    }));
    $$('[data-history-edit]').forEach(b=>b.addEventListener('click',()=>{
      const m=state.historyRows.find(x=>Number(x.id)===Number(b.dataset.historyEdit));const tid=state.historyTargetId;closeHistoryModal();if(tid&&m)openMeasurementModal(tid,m);
    }));
    $$('[data-history-delete]').forEach(b=>b.addEventListener('click',()=>deleteMeasurement(Number(b.dataset.historyDelete))));
  }


  async function deleteMeasurement(id){
    if(!canManageQa())return;
    const m=state.historyRows.find(x=>Number(x.id)===Number(id));if(!m)return;
    if(!confirm(`${m.measurement_date||'-'} 측정이력을 삭제할까요?`))return;
    const sb=client(),cid=companyId();
    const {error}=await sb.from('qa_work_environment_measurements').delete().eq('id',id).eq('company_id',cid);
    if(error)return toast('측정이력 삭제 실패: '+error.message,true);
    if(m.report_file_path){try{await sb.storage.from(STORAGE_BUCKET).remove([m.report_file_path])}catch(_){}}
    toast('측정이력을 삭제했습니다.');
    await loadStatus();
    if(state.historyTargetId)await loadHistory(state.historyTargetId);
  }

  ['statusYear','statusState','statusDivision','statusTeam'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{
    if(id==='statusDivision')fillStatusOrgFilters();
    renderStatus();
  }));
  $('#statusSearch')?.addEventListener('input',renderStatus);

  // =========================================================
  // KOSHA 미확인 수기확인
  // =========================================================
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
      await loadStandards(); setFilter('target');
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
  Promise.all([loadStandards(),loadStatus(),loadOrgDirectory()]).finally(()=>setView('status'));
})();
