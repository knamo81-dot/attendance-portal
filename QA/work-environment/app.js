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
    historyRows: []
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
      const productHtml=products.length ? products.map(p=>`<div class="product-line"><div class="product-main"><b>${esc(p.product_name||`제품 #${p.product_id}`)}</b>${matchBadge(p.match_status)}</div><small>${esc([p.maker,p.product_code].filter(Boolean).join(' · '))}</small><div class="product-meta"><span class="product-percent">${esc(percentText(p))}</span>${p.content_assumed_100?'<span class="badge gray">미표기</span>':''}</div></div>`).join('') : '-';
      const action=state.filter==='unverified' ? (canManageQa()?`<button class="mini" data-manual="${r.id}">수기확인</button>`:'-') : '<span class="status-ok">적용중</span>';
      return `<tr><td><b>${esc(r.cas_no||'-')}</b></td><td>${esc(r.name_ko||'-')}</td><td>${esc(r.name_en||'-')}</td><td><span class="badge ${src==='수기'?'manual':''}">${esc(src)}</span></td><td><span class="badge ${r.threshold_rule==='manual_review'?'warn':''}">${esc(thresholdText(r))}</span></td><td>${rowStatusHtml(r)}</td><td><div class="products">${productHtml}</div></td><td class="date"><b>${esc(r.latest_receipt||'-')}</b></td><td class="date"><b>${esc(r.latest_usage||'-')}</b></td><td>${action}</td></tr>`;
    }).join('') : `<tr><td colspan="10" class="empty">${state.filter==='unverified'?'KOSHA 미확인 물질이 없습니다.':'표시할 작업환경측정 대상물질이 없습니다.'}</td></tr>`;
    $$('[data-manual]').forEach(b=>b.addEventListener('click',()=>openManual(Number(b.dataset.manual))));
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
    if(!sb){ $('#standardsBody').innerHTML='<tr><td colspan="10" class="empty">포털 Supabase 연결을 찾을 수 없습니다.</td></tr>'; return; }
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
      $('#standardsBody').innerHTML=`<tr><td colspan="10" class="empty">기준정보 조회 실패: ${esc(e.message||e)}</td></tr>`;
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
  function fillStatusOrgFilters(){
    const divSel=$('#statusDivision'), teamSel=$('#statusTeam');
    const prevDiv=divSel.value, prevTeam=teamSel.value;
    const divisions=[...new Set(state.statusRows.map(r=>String(r.division_name||'').trim()).filter(Boolean))].sort();
    divSel.innerHTML='<option value="">전체</option>'+divisions.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(divisions.includes(prevDiv))divSel.value=prevDiv;
    const selectedDiv=divSel.value;
    const teams=[...new Set(state.statusRows.filter(r=>!selectedDiv||r.division_name===selectedDiv).map(r=>String(r.team_name||'').trim()).filter(Boolean))].sort();
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
      const hay=[r.cas_no,r.chem_name_ko,r.chem_name_en,r.division_name,r.team_name,r.work_area,r.process_name,r.latest_measurement_company].join(' ').toLowerCase();
      return relevantToYear(r,year) && (!status||s===status) && (!division||r.division_name===division) && (!team||r.team_name===team) && (!q||hay.includes(q));
    });
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
      const location=[r.division_name,r.team_name].filter(Boolean).join(' / ')||'-';
      const place=[r.work_area,r.process_name].filter(Boolean).join(' · ')||'-';
      const report=r.report_file_path?`<button type="button" class="report-btn" data-report="${r.latest_measurement_id}">보기</button>`:'<button type="button" class="report-btn" disabled>없음</button>';
      const actions=canManageQa()?`<div class="status-actions"><button class="mini" data-measure="${r.target_id}">측정입력</button><button class="mini gray" data-history="${r.target_id}">이력</button><button class="mini gray" data-target-edit="${r.target_id}">대상수정</button><button class="mini red" data-target-end="${r.target_id}">대상종료</button></div>`:'-';
      return `<tr>
        <td>${scheduleBadge(status)}</td>
        <td><b>${esc(r.cas_no||'-')}</b></td>
        <td><div class="hazard-main"><b>${esc(r.chem_name_ko||r.chem_name_en||'-')}</b><small>${esc(r.chem_name_en||'')}</small></div></td>
        <td><div class="location-main"><b>${esc(location)}</b></div></td>
        <td><div class="location-main"><b>${esc(place)}</b>${r.first_applied_date?`<small>관리시작 ${esc(r.first_applied_date)}</small>`:''}</div></td>
        <td><b>${esc(r.latest_measurement_date||'-')}</b></td>
        <td>${measurementText(r)}</td>
        <td>${esc(r.latest_measurement_company||'-')}</td>
        <td><b>${esc(r.next_measurement_date||'-')}</b></td>
        <td>${report}</td>
        <td>${actions}</td>
      </tr>`;
    }).join(''):`<tr><td colspan="11" class="empty">조건에 맞는 작업환경측정 현황이 없습니다.</td></tr>`;

    $$('[data-measure]').forEach(b=>b.addEventListener('click',()=>openMeasurementModal(Number(b.dataset.measure))));
    $$('[data-history]').forEach(b=>b.addEventListener('click',()=>openHistoryModal(Number(b.dataset.history))));
    $$('[data-target-edit]').forEach(b=>b.addEventListener('click',()=>openTargetModal(Number(b.dataset.targetEdit))));
    $$('[data-target-end]').forEach(b=>b.addEventListener('click',()=>endTarget(Number(b.dataset.targetEnd))));
    $$('[data-report]').forEach(b=>b.addEventListener('click',()=>openLatestReport(Number(b.dataset.report))));
  }

  async function loadStatus(){
    const sb=client(); if(!sb)return;
    const cid=companyId();
    try{
      let q=sb.from('vw_qa_work_environment_status').select('*').eq('target_status','active');
      if(cid)q=q.eq('company_id',cid);
      const {data,error}=await q.order('cas_no').order('division_name').order('team_name');
      if(error)throw error;
      state.statusRows=data||[];
      fillStatusYears();
      fillStatusOrgFilters();
      renderStatus();
    }catch(e){
      console.error(e);
      $('#statusBody').innerHTML=`<tr><td colspan="11" class="empty">현황 DB 조회 실패: ${esc(e.message||e)}<br>database/QA_작업환경측정_현황_DB_2단계.sql 실행 여부를 확인해 주세요.</td></tr>`;
      $('#statusTargetCount').textContent='-'; $('#statusDoneCount').textContent='-'; $('#statusDueCount').textContent='-'; $('#statusOverdueCount').textContent='-';
    }
  }

  function eligibleStandards(){
    return state.rows.filter(r=>r.is_target===true&&r.verification_status!=='kosha_not_found');
  }
  function standardOptionLabel(r){
    return `${r.cas_no} · ${r.name_ko||r.name_en||'-'} · ${thresholdText(r)}`;
  }
  function populateTargetStandards(selected){
    const sel=$('#targetStandard');
    const rows=eligibleStandards().sort((a,b)=>String(a.cas_no).localeCompare(String(b.cas_no)));
    sel.innerHTML=rows.map(r=>`<option value="${r.id}">${esc(standardOptionLabel(r))}</option>`).join('');
    if(selected!=null)sel.value=String(selected);
  }
  function closeTargetModal(){state.targetEditId=null;$('#targetModal').classList.add('hidden')}
  function openTargetModal(id=null){
    if(!canManageQa())return toast('조회 전용 사용자입니다.',true);
    state.targetEditId=id;
    const row=id?state.statusRows.find(r=>Number(r.target_id)===Number(id)):null;
    $('#targetModalTitle').textContent=row?'측정대상 수정':'측정대상 등록';
    populateTargetStandards(row?.standard_id);
    $('#targetStandard').disabled=!!row;
    $('#targetDivision').value=row?.division_name||'';
    $('#targetTeam').value=row?.team_name||'';
    $('#targetWorkArea').value=row?.work_area||'';
    $('#targetProcess').value=row?.process_name||'';
    $('#targetFirstDate').value=row?.first_applied_date||'';
    $('#targetNote').value=row?.target_note||'';
    $('#targetModal').classList.remove('hidden');
  }

  $('#newTargetBtn')?.addEventListener('click',()=>openTargetModal());
  $('#targetModalClose')?.addEventListener('click',closeTargetModal);
  $('#targetModalCancel')?.addEventListener('click',closeTargetModal);
  $('#targetModal')?.addEventListener('click',e=>{if(e.target===$('#targetModal'))closeTargetModal()});

  $('#targetSave')?.addEventListener('click',async()=>{
    if(!canManageQa())return toast('조회 전용 사용자입니다.',true);
    const sb=client(), cid=companyId(); if(!sb||!cid)return toast('회사정보 또는 Supabase 연결을 확인해 주세요.',true);
    const standardId=Number($('#targetStandard').value);
    const standard=state.rows.find(r=>Number(r.id)===standardId);
    const workArea=$('#targetWorkArea').value.trim();
    if(!standard)return toast('대상물질을 선택해 주세요.',true);
    if(!workArea)return toast('작업장 / 장소를 입력해 주세요.',true);
    const payload={
      company_id:cid,
      standard_id:standardId,
      chemical_id:standard.chemical_id,
      division_name:$('#targetDivision').value.trim()||null,
      team_name:$('#targetTeam').value.trim()||null,
      work_area:workArea,
      process_name:$('#targetProcess').value.trim()||null,
      first_applied_date:$('#targetFirstDate').value||null,
      note:$('#targetNote').value.trim()||null,
      status:'active',
      updated_by:userName()
    };
    const btn=$('#targetSave');btn.disabled=true;
    try{
      if(state.targetEditId){
        const {error}=await sb.from('qa_work_environment_targets').update(payload).eq('id',state.targetEditId).eq('company_id',cid);
        if(error)throw error;
      }else{
        payload.created_by=userName();
        const {error}=await sb.from('qa_work_environment_targets').insert(payload);
        if(error)throw error;
      }
      closeTargetModal();toast(state.targetEditId?'측정대상을 수정했습니다.':'측정대상을 등록했습니다.');await loadStatus();
    }catch(e){console.error(e);toast('측정대상 저장 실패: '+String(e.message||e),true)}
    finally{btn.disabled=false}
  });

  async function endTarget(id){
    if(!canManageQa())return;
    const row=state.statusRows.find(r=>Number(r.target_id)===Number(id)); if(!row)return;
    if(!confirm(`${row.cas_no} · ${row.chem_name_ko||row.chem_name_en||'-'}\n${row.work_area||'-'} 측정대상을 종료할까요?\n기존 측정이력은 보존됩니다.`))return;
    const sb=client(),cid=companyId();
    const {error}=await sb.from('qa_work_environment_targets').update({status:'inactive',updated_by:userName()}).eq('id',id).eq('company_id',cid);
    if(error)return toast('측정대상 종료 실패: '+error.message,true);
    toast('측정대상을 종료했습니다.');await loadStatus();
  }

  function targetSummary(row){
    return `${row.cas_no||'-'} · ${row.chem_name_ko||row.chem_name_en||'-'} · ${[row.division_name,row.team_name,row.work_area,row.process_name].filter(Boolean).join(' / ')}`;
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
    if(error){$('#historyBody').innerHTML=`<tr><td colspan="7" class="empty">이력 조회 실패: ${esc(error.message)}</td></tr>`;return}
    state.historyRows=data||[];
    $('#historyBody').innerHTML=state.historyRows.length?state.historyRows.map(m=>{
      const value=m.measurement_value!=null?`${m.measurement_value}${m.measurement_unit?' '+m.measurement_unit:''}`:'-';
      const actions=canManageQa()?`<div class="history-actions"><button class="mini gray" data-history-edit="${m.id}">수정</button><button class="mini red" data-history-delete="${m.id}">삭제</button></div>`:'-';
      const report=m.report_file_path?`<button class="report-btn" data-history-report="${m.id}">보기</button>`:'-';
      return `<tr><td><b>${esc(m.measurement_date||'-')}</b></td><td>${esc(value)}${m.exposure_limit_text?`<br><small>${esc(m.exposure_limit_text)}</small>`:''}</td><td>${resultBadge(m.result_status)}</td><td>${esc(m.measurement_company||'-')}</td><td>${esc(m.next_measurement_date||'-')}</td><td>${report}</td><td>${actions}</td></tr>`;
    }).join(''):'<tr><td colspan="7" class="empty">등록된 측정이력이 없습니다.</td></tr>';
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
  Promise.all([loadStandards(),loadStatus()]).finally(()=>setView('status'));
})();
