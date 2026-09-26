(() => {
  const state={rows:[],view:'status',filter:'target',manualId:null,loading:false,status:{loaded:false,employees:[],notes:[],exams:[],examHazards:[],hazards:[],year:new Date().getFullYear()}};
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client=()=>window.parent?.portalSupabase||window.portalSupabase||null;
  const fmtDate=v=>v?new Date(v).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\. /g,'.').replace(/\.$/,''):'-';
  
  function toast(msg,bad=false){const t=$('#toast');t.textContent=msg;t.className='toast '+(bad?'bad':'');setTimeout(()=>t.classList.add('hidden'),2600)}
  
  function setView(view){state.view=view;$$('.inner-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#standardsView').classList.toggle('hidden',view!=='standards');$('#statusView').classList.toggle('hidden',view!=='status');$('#resultsView').classList.toggle('hidden',view!=='results');if(view==='status'&&!state.status.loaded)loadStatus();}
  $$('.inner-tabs button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  
  function setFilter(filter){state.filter=filter;
  
  // 요약 카드 필터
  $$('.stat-card[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
    render();}
  $$('.stat-card[data-filter]').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
  
  function rowProducts(r){return r.products||[]}
  
  function render(){const q=$('#searchInput').value.trim().toLowerCase(),source=$('#sourceFilter').value,first=$('#firstExamFilter').value,cycle=$('#cycleFilter').value;
    let rows=state.rows.filter(r=>state.filter==='unverified'?r.verification_status==='kosha_not_found':r.is_target===true&&r.verification_status!=='kosha_not_found').filter(r=>{const hay=[r.cas_no,r.name_ko,r.name_en,rowProducts(r).map(p=>p.name).join(' ')].join(' ').toLowerCase();
    const src=r.data_source==='MANUAL'?'MANUAL':(r.source||'KOSHA');return(!q||hay.includes(q))&&(!source||src===source)&&(!first||String(r.first_exam_months||'')===first)&&(!cycle||String(r.exam_cycle_months||'')===cycle)});rows.sort((a,b)=>String(b.latest_usage||'').localeCompare(String(a.latest_usage||''))||String(b.latest_receipt||'').localeCompare(String(a.latest_receipt||''))||String(a.cas_no).localeCompare(String(b.cas_no)));
    $('#standardsBody').innerHTML=rows.length?rows.map(r=>{const src=r.data_source==='MANUAL'?'수기':(r.source||'KOSHA');
    const action=state.filter==='unverified'?`<button class="mini" data-manual="${r.id}">수기확인</button>`:`<span class="status-ok">${r.status==='inactive'?'비대상':'적용중'}</span>`;
    return `<tr><td><b>${esc(r.cas_no)}</b></td><td>${esc(r.name_ko||'-')}</td><td>${esc(r.name_en||'-')}</td><td><span class="badge ${src==='수기'?'manual':''}">${esc(src)}</span></td><td>${r.first_exam_months?`<span class="badge green">${esc(r.first_exam_months)}개월</span>`:'-'}</td><td>${r.exam_cycle_months?`<span class="badge">${esc(r.exam_cycle_months)}개월</span>`:'-'}</td><td><div class="products">${rowProducts(r).map(p=>`<div class="product-line">• <b>${esc(p.name)}</b> <small>${esc([p.manufacturer,p.code].filter(Boolean).join(' · '))}</small></div>`).join('')||'-'}</div></td><td class="date"><b>${esc(r.latest_receipt||'-')}</b></td><td class="date"><b>${esc(r.latest_usage||'-')}</b></td><td>${action}</td></tr>`}).join(''):`<tr><td colspan="10" class="empty">${state.filter==='unverified'?'KOSHA 미확인 물질이 없습니다.':'표시할 특수건강진단 대상 유해인자가 없습니다.'}</td></tr>`;
    $$('[data-manual]').forEach(b=>b.addEventListener('click',()=>openManual(Number(b.dataset.manual))));
  }
  
  function fillFilters(){const vals=k=>[...new Set(state.rows.map(r=>r[k]).filter(Boolean))].sort((a,b)=>a-b);
    $('#firstExamFilter').innerHTML='<option value="">전체</option>'+vals('first_exam_months').map(v=>`<option value="${v}">${v}개월</option>`).join('');
    $('#cycleFilter').innerHTML='<option value="">전체</option>'+vals('exam_cycle_months').map(v=>`<option value="${v}">${v}개월</option>`).join('')}
  
  async function load(){const sb=client();
    if(!sb){$('#standardsBody').innerHTML='<tr><td colspan="10" class="empty">포털 Supabase 연결을 찾을 수 없습니다.</td></tr>';return}try{const {data:standards,error}=await sb.from('qa_special_health_exam_standards').select('*').order('chemical_id');
    if(error)throw error;
    const ids=[...new Set((standards||[]).map(x=>x.chemical_id))];
    let chemicals=[];
    if(ids.length){const q=await sb.from('qa_chemical_master').select('id,cas_no,chem_name_ko,chem_name_en,ke_no').in('id',ids);
    if(q.error)throw q.error;chemicals=q.data||[]}const cm=new Map(chemicals.map(x=>[x.id,x]));
    let productsByCas=new Map();
    let productIdsByCas=new Map();
    let latestReceiptByProduct=new Map();
    let latestUsageByProduct=new Map();

    try {
      const cas=chemicals.map(x=>x.cas_no).filter(Boolean);
      if(cas.length){
        const pc=await sb.from('product_cas').select('*').in('cas_no',cas);
        if(!pc.error&&pc.data?.length){
          const pids=[...new Set(pc.data.map(x=>x.product_id).filter(Boolean))];
          let pm=[];

          if(pids.length){
            const pq=await sb.from('product_master').select('*').in('id',pids);
            if(!pq.error)pm=pq.data||[];

            const rq=await sb.from('reagent_collect_items')
              .select('product_id,receipt_date')
              .in('product_id',pids)
              .not('receipt_date','is',null);

            if(!rq.error){
              (rq.data||[]).forEach(x=>{
                const prev=latestReceiptByProduct.get(x.product_id);
                if(!prev||String(x.receipt_date)>String(prev)){
                  latestReceiptByProduct.set(x.product_id,x.receipt_date);
                }
              });
            } else {
              console.warn('최근입고일 조회 생략',rq.error);
            }

            const uq=await sb.from('qa_reagent_usage_records')
              .select('product_id,usage_date')
              .in('product_id',pids)
              .not('usage_date','is',null);

            if(!uq.error){
              (uq.data||[]).forEach(x=>{
                const prev=latestUsageByProduct.get(x.product_id);
                if(!prev||String(x.usage_date)>String(prev)){
                  latestUsageByProduct.set(x.product_id,x.usage_date);
                }
              });
            } else {
              console.warn('최근사용일 조회 생략',uq.error);
            }
          }

          const pmap=new Map(pm.map(p=>[p.id,p]));
          pc.data.forEach(link=>{
            const p=pmap.get(link.product_id);
            if(!p)return;

            const arr=productsByCas.get(link.cas_no)||[];
            arr.push({
              id:p.id,
              name:p.product_name||p.name||p.chem_name||p.item_name||`제품 #${p.id}`,
              manufacturer:p.manufacturer||p.maker||'',
              code:p.product_code||p.code||''
            });
            productsByCas.set(link.cas_no,arr);

            const ids=productIdsByCas.get(link.cas_no)||[];
            if(!ids.includes(p.id))ids.push(p.id);
            productIdsByCas.set(link.cas_no,ids);
          });
        }
      }
    }
    catch (e){console.warn('제품/입고/사용 연결 조회 생략',e)}

    state.rows=(standards||[]).map(s=>{
      const c=cm.get(s.chemical_id)||{};
      const pids=productIdsByCas.get(c.cas_no)||[];
      const receiptDates=pids.map(id=>latestReceiptByProduct.get(id)).filter(Boolean).sort();
      const usageDates=pids.map(id=>latestUsageByProduct.get(id)).filter(Boolean).sort();

      return {
        ...s,
        cas_no:c.cas_no||'',
        name_ko:c.chem_name_ko||'',
        name_en:c.chem_name_en||'',
        products:productsByCas.get(c.cas_no)||[],
        latest_receipt:receiptDates.at(-1)||null,
        latest_usage:usageDates.at(-1)||null
      };
    });
      const targets=state.rows.filter(r=>r.is_target===true&&r.verification_status!=='kosha_not_found');
    const unv=state.rows.filter(r=>r.verification_status==='kosha_not_found');
    $('#hazardCount').textContent=targets.length+'종';
    $('#unverifiedCount').textContent=unv.length+'종';
    $('#productCount').textContent=targets.reduce((n,r)=>n+r.products.length,0)+'개';
    const checked=state.rows.map(r=>r.api_checked_at).filter(Boolean).sort().at(-1);
    $('#apiChecked').textContent=fmtDate(checked);fillFilters();render();
    }
    catch (e){console.error(e);
    $('#standardsBody').innerHTML=`<tr><td colspan="10" class="empty">기준정보 조회 실패: ${esc(e.message||e)}</td></tr>`;toast('기준정보를 불러오지 못했습니다.',true)}}

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

  const dateOnly=v=>v?String(v).slice(0,10):null, isTrue=v=>v===true||v==='true'||v==='Y'||v===1||v==='1';
  const companyId=()=>String(window.parent?.portalSession?.activeCompanyId||window.portalSession?.activeCompanyId||'').trim();
  const yearOf=v=>v?+String(v).slice(0,4):null, monthOf=v=>v?+String(v).slice(5,7):null, today=()=>new Date().toISOString().slice(0,10);
  function addMonths(s,m){if(!s||!m)return null;const d=new Date(s+'T00:00:00'),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+Number(m));d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return d.toISOString().slice(0,10)}
  const inRange=(d,s,e)=>!!d&&(!s||d>=s)&&(!e||d<=e);
  function activeAbsence(no){const d=today();return state.status.notes.some(n=>String(n.employee_no)===String(no)&&n.issue_group==='absent'&&inRange(d,dateOnly(n.start_date),dateOnly(n.end_date)))}
  function latestExam(empNo,chemId){const ids=new Set(state.status.exams.filter(e=>String(e.employee_no)===String(empNo)).map(e=>String(e.id)));return state.status.examHazards.filter(h=>ids.has(String(h.exam_id))&&String(h.chemical_id)===String(chemId)).map(h=>({h,e:state.status.exams.find(e=>String(e.id)===String(h.exam_id))})).filter(x=>x.e?.exam_date).sort((a,b)=>String(b.e.exam_date).localeCompare(String(a.e.exam_date)))[0]||null}
  function dueFor(emp,h){const last=latestExam(emp.employee_no,h.chemical_id);if(last)return{...h,due:addMonths(dateOnly(last.e.exam_date),last.h.exam_cycle_months||h.exam_cycle_months),kind:'cycle',last:dateOnly(last.e.exam_date)};const start=[dateOnly(emp.join_date),h.first_usage].filter(Boolean).sort().at(-1);return{...h,due:addMonths(start,h.first_exam_months),kind:'first',last:null}}
  const empHazards=emp=>state.status.hazards.filter(h=>h.active_usage).map(h=>dueFor(emp,h)).filter(h=>h.due);
  const divisionName=code=>state.status.divisions.find(x=>String(x.division_code)===String(code))?.division_name||code||'-';
  const teamName=code=>state.status.teams.find(x=>String(x.team_code)===String(code))?.team_name||code||'-';
  function updateTeams(){const div=$('#statusDivision').value,cur=$('#statusTeam').value;const employeeTeamCodes=new Set(state.status.employees.filter(e=>!div||String(e.division_code)===String(div)).map(e=>e.team_code).filter(Boolean).map(String));const vals=state.status.teams.filter(t=>(!div||String(t.division_code)===String(div))&&employeeTeamCodes.has(String(t.team_code))).sort((a,b)=>String(a.team_name||a.team_code).localeCompare(String(b.team_name||b.team_code),'ko'));$('#statusTeam').innerHTML='<option value="">전체</option>'+vals.map(t=>`<option value="${esc(t.team_code)}">${esc(t.team_name||t.team_code)} (${esc(t.team_code)})</option>`).join('');if(vals.some(t=>String(t.team_code)===String(cur)))$('#statusTeam').value=cur}
  function fillStatusFilters(){const y=$('#statusYear'),now=new Date().getFullYear();y.innerHTML='';for(let n=now+1;n>=now-5;n--)y.insertAdjacentHTML('beforeend',`<option value="${n}">${n}년</option>`);y.value=state.status.year;const employeeDivCodes=new Set(state.status.employees.map(e=>e.division_code).filter(Boolean).map(String));const ds=state.status.divisions.filter(d=>employeeDivCodes.has(String(d.division_code))).sort((a,b)=>String(a.division_name||a.division_code).localeCompare(String(b.division_name||b.division_code),'ko'));$('#statusDivision').innerHTML='<option value="">전체</option>'+ds.map(d=>`<option value="${esc(d.division_code)}">${esc(d.division_name||d.division_code)} (${esc(d.division_code)})</option>`).join('');updateTeams()}
  function visibleEmps(){const d=$('#statusDivision').value,t=$('#statusTeam').value,q=$('#statusSearch').value.trim().toLowerCase();return state.status.employees.filter(e=>isTrue(e.special_health_exam_target)&&e.status!=='퇴사'&&!activeAbsence(e.employee_no)).filter(e=>(!d||e.division_code===d)&&(!t||e.team_code===t)&&(!q||`${e.name||''} ${e.employee_no||''}`.toLowerCase().includes(q))).sort((a,b)=>String(a.division_code||'').localeCompare(String(b.division_code||''),'ko',{numeric:true})||String(a.team_code||'').localeCompare(String(b.team_code||''),'ko',{numeric:true})||Number(a.sort_order??9999)-Number(b.sort_order??9999)||String(a.name||'').localeCompare(String(b.name||''),'ko'))}
  function renderStatus(){if(!state.status.loaded)return;const year=+$('#statusYear').value;state.status.year=year;const rows=visibleEmps(),now=today();let doneP=0,dueN=0,overN=0;$('#statusBody').innerHTML=rows.map(emp=>{const hz=empHazards(emp),ex=state.status.exams.filter(e=>String(e.employee_no)===String(emp.employee_no)&&yearOf(e.exam_date)===year);if(ex.length)doneP++;const ev=Array.from({length:12},()=>[]);ex.forEach(e=>ev[monthOf(e.exam_date)-1]?.push({type:'done',exam:e}));hz.forEach(h=>{if(yearOf(h.due)===year){const type=h.due<now?'overdue':'due';ev[monthOf(h.due)-1]?.push({type,h});type==='overdue'?overN++:dueN++}});const next=hz.map(h=>h.due).sort()[0]||null;const months=ev.map((a,i)=>{if(!a.length)return`<td class="month-cell" data-emp="${esc(emp.employee_no)}" data-month="${i+1}"></td>`;const dn=a.filter(x=>x.type==='done').length,on=a.filter(x=>x.type==='overdue').length,un=a.filter(x=>x.type==='due').length,type=on?'overdue':dn?'done':'due',label=[dn&&`완료 ${dn}`,on&&`초과 ${on}`,un&&`예정 ${un}`].filter(Boolean).join(' ');return`<td class="month-cell" data-emp="${esc(emp.employee_no)}" data-month="${i+1}"><span class="month-chip ${type}">${label}</span></td>`}).join('');return`<tr><td class="employee-cell"><strong>${esc(emp.name||'-')}</strong><small>${esc(emp.employee_no)}</small></td><td class="org-cell"><strong>${esc(divisionName(emp.division_code))}</strong><small>${esc(teamName(emp.team_code))}</small></td><td><span class="next-date ${next&&next<now?'overdue':''}">${esc(next||'-')}</span></td>${months}</tr>`}).join('')||'<tr><td colspan="15" class="empty">조건에 해당하는 특수검진 대상자가 없습니다.</td></tr>';$('#statusTargetCount').textContent=rows.length+'명';$('#statusDoneCount').textContent=doneP+'명';$('#statusDueCount').textContent=dueN+'건';$('#statusOverdueCount').textContent=overN+'건';$$('.month-cell').forEach(x=>x.addEventListener('click',()=>openDrawer(x.dataset.emp,+x.dataset.month)))}
  function openDrawer(no,m){const emp=state.status.employees.find(e=>String(e.employee_no)===String(no)),year=state.status.year,hz=empHazards(emp),ex=state.status.exams.filter(e=>String(e.employee_no)===String(no)&&yearOf(e.exam_date)===year&&monthOf(e.exam_date)===m),due=hz.filter(h=>yearOf(h.due)===year&&monthOf(h.due)===m);$('#drawerName').textContent=`${emp.name||'-'} · ${year}년 ${m}월`;$('#drawerMeta').textContent=`${emp.employee_no} · ${divisionName(emp.division_code)} / ${teamName(emp.team_code)} · 입사일 ${emp.join_date||'-'}`;const exHtml=ex.length?ex.map(e=>{const hs=state.status.examHazards.filter(h=>String(h.exam_id)===String(e.id)).map(h=>state.status.hazards.find(x=>String(x.chemical_id)===String(h.chemical_id))).filter(Boolean);return`<div class="drawer-hazard"><b>${esc(dateOnly(e.exam_date))} 검진완료</b><small>${esc(e.exam_institution||'검진기관 미입력')} · ${esc(hs.map(x=>x.cas_no+' '+(x.name_ko||x.name_en||'')).join(', ')||'유해인자 미등록')}</small></div>`}).join(''):'<div class="drawer-hazard">해당 월 검진이력이 없습니다.</div>';const dueHtml=due.length?due.map(h=>`<div class="drawer-hazard"><b>${esc(h.cas_no)} · ${esc(h.name_ko||h.name_en||'-')}</b><small>${h.kind==='first'?'최초검진':'정기검진'} · 기한 ${esc(h.due)} · 주기 ${esc(h.exam_cycle_months||'-')}개월${h.last?' · 최근검진 '+esc(h.last):''}</small></div>`).join(''):'<div class="drawer-hazard">해당 월 예정 유해인자가 없습니다.</div>';$('#drawerBody').innerHTML=`<section class="drawer-section"><h3>검진이력</h3>${exHtml}</section><section class="drawer-section"><h3>검진예정 유해인자</h3>${dueHtml}</section><section class="drawer-section"><h3>현재 적용 유해인자</h3>${hz.length?hz.map(h=>`<div class="drawer-row"><span>${esc(h.cas_no)}</span><b>${esc(h.name_ko||h.name_en||'-')}</b></div>`).join(''):'<div class="drawer-hazard">최근 12개월 사용기록 기준 적용 유해인자가 없습니다.</div>'}</section>`;$('#healthDrawer').classList.remove('hidden');$('#healthDrawerBackdrop').classList.remove('hidden')}
  function closeDrawer(){$('#healthDrawer').classList.add('hidden');$('#healthDrawerBackdrop').classList.add('hidden')}
  async function loadStatus(){const sb=client();if(!sb)return;try{const cid=companyId();let eq=sb.from('employees').select('*');if(cid)eq=eq.eq('company_id',cid);let dq=sb.from('divisions').select('division_code,division_name,company_id,is_active');let tq=sb.from('teams').select('team_code,team_name,division_code,company_id,is_active');if(cid){dq=dq.eq('company_id',cid);tq=tq.eq('company_id',cid)}const [er,nr,xr,hr,sr,cr,pr,ur,dr,tr]=await Promise.all([eq,sb.from('employee_special_notes').select('*'),sb.from('qa_special_health_exams').select('*'),sb.from('qa_special_health_exam_hazards').select('*'),sb.from('qa_special_health_exam_standards').select('*'),sb.from('qa_chemical_master').select('id,cas_no,chem_name_ko,chem_name_en'),sb.from('product_cas').select('product_id,cas_no'),sb.from('qa_reagent_usage_records').select('product_id,usage_date'),dq,tq]);for(const r of[er,nr,xr,hr,sr,cr,pr,ur,dr,tr])if(r.error)throw r.error;state.status.employees=er.data||[];state.status.divisions=(dr.data||[]).filter(x=>x.is_active!==false);state.status.teams=(tr.data||[]).filter(x=>x.is_active!==false);state.status.notes=(nr.data||[]).filter(n=>!cid||!n.company_id||String(n.company_id)===cid);state.status.exams=(xr.data||[]).filter(e=>!cid||String(e.company_id)===cid);state.status.examHazards=hr.data||[];const cm=new Map((cr.data||[]).map(c=>[c.id,c])),cp=new Map(),up=new Map();(pr.data||[]).forEach(x=>{const a=cp.get(x.cas_no)||[];a.push(x.product_id);cp.set(x.cas_no,a)});(ur.data||[]).forEach(u=>{if(!u.usage_date)return;const a=up.get(u.product_id)||[];a.push(dateOnly(u.usage_date));up.set(u.product_id,a)});const cut=new Date();cut.setFullYear(cut.getFullYear()-1);const cs=cut.toISOString().slice(0,10);state.status.hazards=(sr.data||[]).filter(s=>s.is_target===true&&s.status!=='inactive'&&s.verification_status!=='kosha_not_found').map(s=>{const c=cm.get(s.chemical_id)||{},dates=(cp.get(c.cas_no)||[]).flatMap(id=>up.get(id)||[]).sort();return{...s,cas_no:c.cas_no||'',name_ko:c.chem_name_ko||'',name_en:c.chem_name_en||'',first_usage:dates[0]||null,latest_usage:dates.at(-1)||null,active_usage:dates.some(d=>d>=cs)}});state.status.loaded=true;fillStatusFilters();renderStatus()}catch(e){console.error(e);$('#statusBody').innerHTML=`<tr><td colspan="15" class="empty">현황 조회 실패: ${esc(e.message||e)}</td></tr>`;toast('특수건강진단 현황을 불러오지 못했습니다.',true)}}
  $('#statusYear')?.addEventListener('change',renderStatus);$('#statusDivision')?.addEventListener('change',()=>{updateTeams();renderStatus()});$('#statusTeam')?.addEventListener('change',renderStatus);$('#statusSearch')?.addEventListener('input',renderStatus);$('#drawerClose')?.addEventListener('click',closeDrawer);$('#healthDrawerBackdrop')?.addEventListener('click',closeDrawer);

  load();
  loadStatus();
})();
