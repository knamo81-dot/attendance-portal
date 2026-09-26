(() => {
  const state={rows:[],view:'status',filter:'target',manualId:null,loading:false,status:{loaded:false,employees:[],profiles:[],notes:[],exams:[],examHazards:[],hazards:[],year:new Date().getFullYear(),labWarningShown:false}};
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
  function profileFor(no){return state.status.profiles.find(p=>String(p.employee_no)===String(no))||null}
  function labAssignDate(emp){return dateOnly(profileFor(emp?.employee_no)?.lab_assign_date)}
  function yearBounds(year){return{start:`${year}-01-01`,end:`${year}-12-31`}}
  function monthBounds(year,month){const mm=String(month).padStart(2,'0'),last=new Date(year,month,0).getDate();return{start:`${year}-${mm}-01`,end:`${year}-${mm}-${String(last).padStart(2,'0')}`}}
  const overlap=(a1,a2,b1,b2)=>!!a1&&!!a2&&!!b1&&!!b2&&a1<=b2&&b1<=a2;
  const dayNo=v=>v?Math.floor(new Date(v+'T00:00:00Z').getTime()/86400000):null;
  function employeeYearRange(emp,year){const lab=labAssignDate(emp);if(!lab)return null;const y=yearBounds(year),leave=dateOnly(emp.leave_date);const start=lab>y.start?lab:y.start,end=leave&&leave<y.end?leave:y.end;if(start>end)return null;return{start,end,lab,leave}}
  function absenceNotes(no){return state.status.notes.filter(n=>String(n.employee_no)===String(no)&&n.issue_group==='absent'&&dateOnly(n.start_date))}
  function notesOverlapping(no,start,end){return absenceNotes(no).filter(n=>{const s=dateOnly(n.start_date),e=dateOnly(n.end_date)||'9999-12-31';return overlap(start,end,s,e)})}
  function absenceNotesForYear(emp,year){const r=employeeYearRange(emp,year);return r?notesOverlapping(emp.employee_no,r.start,r.end):[]}
  function rangeFullyAbsent(range,notes){if(!range||!notes.length)return false;const spans=notes.map(n=>{const s=dateOnly(n.start_date),e=dateOnly(n.end_date)||range.end;const a=s<range.start?range.start:s,b=e>range.end?range.end:e;return a<=b?{start:dayNo(a),end:dayNo(b)}:null}).filter(Boolean).sort((a,b)=>a.start-b.start||a.end-b.end);if(!spans.length)return false;let cur=dayNo(range.start);const end=dayNo(range.end);for(const x of spans){if(x.start>cur)return false;if(x.end>=cur)cur=Math.max(cur,x.end+1);if(cur>end)return true}return cur>end}
  function hasTargetPeriod(emp,year){const r=employeeYearRange(emp,year);return !!r&&!rangeFullyAbsent(r,absenceNotesForYear(emp,year))}
  function isAbsentOn(no,date){return absenceNotes(no).some(n=>{const s=dateOnly(n.start_date),e=dateOnly(n.end_date)||'9999-12-31';return !!s&&s<=date&&date<=e})}
  function currentSubjectState(emp){const ref=today(),lab=labAssignDate(emp),leave=dateOnly(emp.leave_date);if(!lab||lab>ref)return'not_started';if(leave&&leave<ref)return'excluded';if(isAbsentOn(emp.employee_no,ref))return'excluded';return'target'}
  function monthPeriodState(emp,year,month){
    const mb=monthBounds(year,month),lab=labAssignDate(emp),leave=dateOnly(emp.leave_date);
    if(!lab)return{type:'missing',label:'발령일 미등록',reason:'연구소 발령일 미등록',exam_type:null,noteId:null};
    if(mb.end<lab)return{type:'preassignment',label:'발령 전',reason:`연구소 발령일 ${lab}`,detail:`연구소 발령일 ${lab}`,exam_type:'preplacement',noteId:null};
    if(leave&&mb.start>leave)return{type:'retired',label:'퇴사',reason:`퇴사일 ${leave}`,detail:`퇴사일 ${leave}`,exam_type:null,noteId:null};
    const activeStart=mb.start<lab?lab:mb.start,activeEnd=leave&&leave<mb.end?leave:mb.end;
    if(activeStart>activeEnd)return{type:'outside',label:'대상외',reason:'연구소 관리기간 외',exam_type:null,noteId:null};
    const notes=notesOverlapping(emp.employee_no,activeStart,activeEnd).sort((a,b)=>String(b.start_date||'').localeCompare(String(a.start_date||'')));
    if(notes.length){
      const labels=[...new Set(notes.map(n=>String(n.issue_type||n.note||'연구소 부재').trim()).filter(Boolean))];
      const reason=labels.length>1?`${labels[0]} 외 ${labels.length-1}건`:(labels[0]||'연구소 부재');
      const detail=notes.map(n=>`${dateOnly(n.start_date)||'-'} ~ ${dateOnly(n.end_date)||'계속'} · ${n.issue_type||n.note||'연구소 부재'}${n.note&&n.issue_type?` · ${n.note}`:''}`).join('\n');
      const primary=notes[0]||null;
      return{type:'excluded',label:reason,reason,detail,exam_type:'return',noteId:primary?.id??null,note:primary};
    }
    return{type:'active',label:'',reason:'',exam_type:'special',noteId:null};
  }
  function latestExam(empNo,chemId){const ids=new Set(state.status.exams.filter(e=>String(e.employee_no)===String(empNo)).map(e=>String(e.id)));return state.status.examHazards.filter(h=>ids.has(String(h.exam_id))&&String(h.chemical_id)===String(chemId)).map(h=>({h,e:state.status.exams.find(e=>String(e.id)===String(h.exam_id))})).filter(x=>x.e?.exam_date).sort((a,b)=>String(b.e.exam_date).localeCompare(String(a.e.exam_date)))[0]||null}
  function dueFor(emp,h){const last=latestExam(emp.employee_no,h.chemical_id);if(last)return{...h,due:addMonths(dateOnly(last.e.exam_date),last.h.exam_cycle_months||h.exam_cycle_months),kind:'cycle',last:dateOnly(last.e.exam_date)};const start=[labAssignDate(emp),h.first_usage].filter(Boolean).sort().at(-1);return{...h,due:addMonths(start,h.first_exam_months),kind:'first',last:null}}
  const empHazards=emp=>state.status.hazards.filter(h=>h.active_usage).map(h=>dueFor(emp,h)).filter(h=>h.due);
  const divisionName=code=>state.status.divisions.find(x=>String(x.division_code)===String(code))?.division_name||code||'-';
  const teamName=code=>state.status.teams.find(x=>String(x.team_code)===String(code))?.team_name||code||'-';
  function updateTeams(){const div=$('#statusDivision').value,cur=$('#statusTeam').value;const employeeTeamCodes=new Set(state.status.employees.filter(e=>!div||String(e.division_code)===String(div)).map(e=>e.team_code).filter(Boolean).map(String));const vals=state.status.teams.filter(t=>(!div||String(t.division_code)===String(div))&&employeeTeamCodes.has(String(t.team_code))).sort((a,b)=>String(a.team_code||'').localeCompare(String(b.team_code||''),'en',{numeric:true}));$('#statusTeam').innerHTML='<option value="">전체</option>'+vals.map(t=>`<option value="${esc(t.team_code)}">${esc(t.team_name||t.team_code)}</option>`).join('');if(vals.some(t=>String(t.team_code)===String(cur)))$('#statusTeam').value=cur}
  function syncStatusCategoryForYear(forceDefault=false){const sel=$('#statusCategory'),year=Number($('#statusYear')?.value||state.status.year),currentYear=new Date().getFullYear();if(!sel)return;if(year!==currentYear){sel.value='all';sel.disabled=true;sel.title='현재연도가 아닌 경우 구분은 전체로 고정됩니다.';return}sel.disabled=false;sel.title='';if(forceDefault||!['all','target','excluded'].includes(sel.value))sel.value='target'}
  function fillStatusFilters(){const y=$('#statusYear'),now=new Date().getFullYear();y.innerHTML='';for(let n=now+1;n>=now-5;n--)y.insertAdjacentHTML('beforeend',`<option value="${n}">${n}년</option>`);y.value=state.status.year;syncStatusCategoryForYear(true);const employeeDivCodes=new Set(state.status.employees.map(e=>e.division_code).filter(Boolean).map(String));const ds=state.status.divisions.filter(d=>employeeDivCodes.has(String(d.division_code))).sort((a,b)=>String(a.division_code||'').localeCompare(String(b.division_code||''),'en',{numeric:true}));$('#statusDivision').innerHTML='<option value="">전체</option>'+ds.map(d=>`<option value="${esc(d.division_code)}">${esc(d.division_name||d.division_code)}</option>`).join('');updateTeams()}
  function visibleEmps(){const year=+$('#statusYear').value,category=$('#statusCategory')?.value||'target',d=$('#statusDivision').value,t=$('#statusTeam').value,q=$('#statusSearch').value.trim().toLowerCase();return state.status.employees.filter(e=>isTrue(e.special_health_exam_target)&&employeeYearRange(e,year)).filter(e=>category==='all'||currentSubjectState(e)===category).filter(e=>(!d||String(e.division_code)===String(d))&&(!t||String(e.team_code)===String(t))&&(!q||`${e.name||''} ${e.employee_no||''}`.toLowerCase().includes(q))).sort((a,b)=>String(a.division_code||'').localeCompare(String(b.division_code||''),'ko',{numeric:true})||String(a.team_code||'').localeCompare(String(b.team_code||''),'ko',{numeric:true})||Number(a.sort_order??9999)-Number(b.sort_order??9999)||String(a.name||'').localeCompare(String(b.name||''),'ko'))}
  function monthExams(empNo,year,month){return state.status.exams.filter(e=>String(e.employee_no)===String(empNo)&&((yearOf(e.exam_date)===year&&monthOf(e.exam_date)===month)||(yearOf(e.reservation_date)===year&&monthOf(e.reservation_date)===month))).sort((a,b)=>String(b.exam_date||b.reservation_date||'').localeCompare(String(a.exam_date||a.reservation_date||'')))}
  function monthExam(empNo,year,month){return monthExams(empNo,year,month)[0]||null}
  function normalizedExamType(e){return String(e?.exam_type||'special')}
  function examSortValue(e){return String(e?.exam_date||e?.reservation_date||e?.created_at||'')}
  function examNoteFor(e){return state.status.notes.find(n=>String(n.id)===String(e?.special_note_id))||null}
  function periodLabelForExam(e,period){
    const type=normalizedExamType(e);
    if(type==='preplacement')return '발령 전';
    if(type==='return')return String(examNoteFor(e)?.issue_type||period?.label||'복귀 전').trim()||'복귀 전';
    return period?.type==='excluded'?period.label:'';
  }
  function displayMonthExams(empNo,year,month){return monthExams(empNo,year,month)}
  function drawerExamFor(emp,year,month,examType,noteId){
    const empExams=state.status.exams.filter(e=>String(e.employee_no)===String(emp.employee_no)&&normalizedExamType(e)===examType);
    if(examType==='return'&&noteId){
      const linked=empExams.filter(e=>String(e.special_note_id||'')===String(noteId));
      if(linked.length)return linked.sort((a,b)=>examSortValue(b).localeCompare(examSortValue(a)))[0];
    }
    const inMonth=empExams.filter(e=>(yearOf(e.exam_date)===year&&monthOf(e.exam_date)===month)||(yearOf(e.reservation_date)===year&&monthOf(e.reservation_date)===month));
    if(inMonth.length)return inMonth.sort((a,b)=>examSortValue(b).localeCompare(examSortValue(a)))[0];
    if(examType==='preplacement'){
      const lab=labAssignDate(emp);
      const candidates=empExams.filter(e=>{const d=dateOnly(e.exam_date)||dateOnly(e.reservation_date);return d&&(!lab||d<=lab)}).sort((a,b)=>examSortValue(b).localeCompare(examSortValue(a)));
      return candidates[0]||null;
    }
    return null;
  }
  function renderStatus(){
    if(!state.status.loaded)return;
    const year=+$('#statusYear').value,category=$('#statusCategory')?.value||'target';
    state.status.year=year;
    const rows=visibleEmps(),now=today();
    let doneP=0,dueN=0,overN=0;
    $('#statusPrimaryLabel')&&($('#statusPrimaryLabel').textContent=category==='all'?'전체인원':category==='excluded'?'제외인원':'검진대상');
    $('#statusBody').innerHTML=rows.map(emp=>{
      const hz=empHazards(emp),ex=state.status.exams.filter(e=>String(e.employee_no)===String(emp.employee_no)&&yearOf(e.exam_date)===year&&e.exam_date);
      if(ex.length)doneP++;
      const ev=Array.from({length:12},()=>[]);
      hz.forEach(h=>{if(yearOf(h.due)===year){const type=h.due<now?'overdue':'due';ev[monthOf(h.due)-1]?.push({type,h});type==='overdue'?overN++:dueN++}});
      const next=hz.map(h=>h.due).sort()[0]||null;
      const months=ev.map((a,i)=>{
        const m=i+1,period=monthPeriodState(emp,year,m),monthRows=displayMonthExams(emp.employee_no,year,m);
        const doneRows=monthRows.filter(e=>e.exam_date&&yearOf(e.exam_date)===year&&monthOf(e.exam_date)===m);
        const reservedRows=monthRows.filter(e=>!e.exam_date&&e.reservation_date&&yearOf(e.reservation_date)===year&&monthOf(e.reservation_date)===m);
        const exam=doneRows[0]||reservedRows[0]||null;
        const over=a.filter(x=>x.type==='overdue'),due=a.filter(x=>x.type==='due');
        const examType=exam?normalizedExamType(exam):(period?.exam_type||'special');
        const examNoteId=examType==='return'?(exam?.special_note_id??period?.noteId??''):'';
        const periodLabel=exam?periodLabelForExam(exam,period):(period?.label||'');
        const shadedPre=period?.type==='preassignment';
        const shadedLeave=period?.type==='excluded';
        const disabled=['retired','missing','outside'].includes(period?.type);
        const classes=['month-cell'];
        if(shadedPre)classes.push('outside-period','preassignment-month','period-entry');
        if(shadedLeave)classes.push('exclusion-month','period-entry');
        if(disabled)classes.push('outside-period');
        const attrs=`data-emp="${esc(emp.employee_no)}" data-month="${m}" ${disabled?'data-disabled="true"':`data-entry-mode="${esc(examType)}"`}${examNoteId!==''?` data-note-id="${esc(examNoteId)}"`:''}`;
        const title=period?.detail||period?.reason||'';
        if(exam){
          const isDone=!!exam.exam_date,date=dateOnly(isDone?exam.exam_date:exam.reservation_date),md=date?date.slice(5).replace('-','.'):'-',inst=(exam.exam_institution||'').trim(),result=isDone?(exam.result_summary==='normal'?'정상':exam.result_summary==='abnormal'?'이상소견':''):'';
          const second=[inst,result].filter(Boolean).join(' · ')||'-',extra=monthRows.length-1;
          const contextBadge=(examType==='preplacement'||examType==='return'||shadedPre||shadedLeave)&&periodLabel?`<span class="period-state ${examType==='preplacement'?'preplacement':'return'}">${esc(periodLabel)}</span>`:'';
          return`<td class="${classes.join(' ')}" ${attrs} ${title?`title="${esc(title)}"`:''}><div class="month-event ${isDone?'done':'reserved'} ${contextBadge?'with-period':''}"><div class="month-context-line">${contextBadge}</div><div class="month-event-top"><span class="month-state">${isDone?'완료':'예약'}</span><b>${esc(md)}</b>${extra>0?`<em>+${extra}</em>`:''}</div><div class="month-event-sub ${result==='이상소견'?'abnormal':''}" title="${esc(second)}">${esc(second)}</div></div></td>`;
        }
        if(disabled)return`<td class="${classes.join(' ')}" ${attrs} title="${esc(title)}"><span class="period-label">${esc(periodLabel)}</span></td>`;
        if(shadedPre||shadedLeave)return`<td class="${classes.join(' ')}" ${attrs} title="${esc(title)}"><div class="period-only-card ${shadedPre?'preplacement':'return'}"><b>${esc(periodLabel)}</b><span>${shadedPre?'발령 전 검진 입력':'복귀 전 검진 입력'}</span></div></td>`;
        if(!a.length)return`<td class="month-cell" data-entry-mode="special" data-emp="${esc(emp.employee_no)}" data-month="${m}"></td>`;
        const type=over.length?'overdue':'due',label=over.length?`초과 ${over.length}`:`예정 ${due.length}`;
        return`<td class="month-cell" data-entry-mode="special" data-emp="${esc(emp.employee_no)}" data-month="${m}"><span class="month-chip ${type}">${label}</span></td>`;
      }).join('');
      return`<tr><td class="division-cell">${esc(divisionName(emp.division_code))}</td><td class="team-cell">${esc(teamName(emp.team_code))}</td><td class="employee-cell"><strong>${esc(emp.name||'-')}</strong><small>${esc(emp.employee_no)}</small></td><td><span class="next-date ${next&&next<now?'overdue':''}">${esc(next||'-')}</span></td>${months}</tr>`;
    }).join('')||`<tr><td colspan="16" class="empty">${category==='all'?'선택한 연도에 관리기간이 있는 직원이 없습니다.':category==='excluded'?'현재 기준 제외 상태이면서 선택한 연도에 관리기간이 있는 직원이 없습니다.':'현재 기준 대상 상태이면서 선택한 연도에 관리기간이 있는 직원이 없습니다.'}</td></tr>`;
    $('#statusTargetCount').textContent=rows.length+'명';$('#statusDoneCount').textContent=doneP+'명';$('#statusDueCount').textContent=dueN+'건';$('#statusOverdueCount').textContent=overN+'건';bindMonthCellClicks();
  }

  function showLabAssignWarning(){if(state.status.labWarningShown)return;const now=today(),missing=state.status.employees.filter(e=>isTrue(e.special_health_exam_target)).filter(e=>{const leave=dateOnly(e.leave_date);return(!leave||leave>=now)&&e.status!=='퇴사'&&!labAssignDate(e)}).sort((a,b)=>String(a.division_code||'').localeCompare(String(b.division_code||''),'ko',{numeric:true})||String(a.team_code||'').localeCompare(String(b.team_code||''),'ko',{numeric:true})||Number(a.sort_order??9999)-Number(b.sort_order??9999));if(!missing.length)return;state.status.labWarningShown=true;const body=$('#labAssignWarningList');if(body)body.innerHTML=missing.map(e=>`<div class="lab-warning-row"><b>${esc(e.name||'-')}</b><span>${esc(e.employee_no||'-')} · ${esc(divisionName(e.division_code))} / ${esc(teamName(e.team_code))}</span></div>`).join('');$('#labAssignWarningCount')&&($('#labAssignWarningCount').textContent=`${missing.length}명`);$('#labAssignWarningModal')?.classList.remove('hidden')}

  const monthDrag={active:false,month:null,empNos:new Set()};
  function clearMonthSelection(){$$('#statusBody .month-cell.bulk-selected').forEach(c=>c.classList.remove('bulk-selected'));monthDrag.empNos.clear();monthDrag.month=null}
  function addMonthSelection(cell){const month=Number(cell?.dataset?.month||0),emp=String(cell?.dataset?.emp||'');if(!month||!emp||month!==monthDrag.month)return;if(monthDrag.empNos.has(emp))return;monthDrag.empNos.add(emp);cell.classList.add('bulk-selected')}
  function startMonthDrag(cell,e){if(e.button!==0)return;e.preventDefault();e.stopPropagation();clearMonthSelection();monthDrag.active=true;monthDrag.month=Number(cell.dataset.month);addMonthSelection(cell)}
  function finishMonthDrag(){if(!monthDrag.active)return;monthDrag.active=false;const empNos=[...monthDrag.empNos],month=monthDrag.month;if(!empNos.length||!month)return;if(empNos.length===1)openDrawer(empNos[0],month);else openBulkDrawer(empNos,month)}
  function bindMonthCellClicks(){$$('#statusBody .month-cell').forEach(cell=>{
    if(cell.dataset.disabled==='true'){
      cell.onmousedown=null;cell.onmouseenter=null;cell.onclick=e=>{e.preventDefault();e.stopPropagation()};return;
    }
    const mode=String(cell.dataset.entryMode||'special');
    if(mode==='preplacement'||mode==='return'){
      cell.onmousedown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();monthDrag.active=false;clearMonthSelection()};
      cell.onmouseenter=null;
      cell.onclick=e=>{e.preventDefault();e.stopPropagation();openDrawer(cell.dataset.emp,Number(cell.dataset.month),mode,cell.dataset.noteId||null)};
      return;
    }
    cell.onmousedown=e=>startMonthDrag(cell,e);
    cell.onmouseenter=()=>{if(monthDrag.active)addMonthSelection(cell)};
    cell.onclick=e=>{e.preventDefault();e.stopPropagation()};
  })}
  document.addEventListener('mouseup',finishMonthDrag);

  let drawerCtx=null;
  const selectedHazardIds=()=>new Set($$('#drawerSelectedHazards [data-chemical-id]').map(x=>String(x.dataset.chemicalId)));
  function selectedHazardHtml(h,source='manual'){return`<div class="selected-hazard" data-chemical-id="${esc(h.chemical_id)}" data-source="${esc(source)}"><b>${esc(h.cas_no||'-')}</b><div class="hazard-name"><strong>${esc(h.name_ko||h.name_en||'-')}</strong><small>${esc(h.name_en||'')} · 주기 ${esc(h.exam_cycle_months||'-')}개월</small></div><div><span class="source-pill ${source==='manual'?'manual':''}">${source==='manual'?'수동추가':'자동'}</span>${source==='manual'?'<button class="remove-hazard" type="button" title="삭제">×</button>':''}</div></div>`}
  function bindHazardRemove(){$$('#drawerSelectedHazards .remove-hazard').forEach(b=>b.onclick=()=>b.closest('.selected-hazard')?.remove())}
  function drawerActionsHtml(isBulk=false,hasData=true){return`<div class="drawer-actions"><button class="delete" id="drawerDelete" type="button" ${hasData?'':'disabled'}>${isBulk?'일괄삭제':'삭제'}</button><button class="save" id="drawerSave" type="button">${isBulk?'일괄저장':'저장'}</button></div>`}

  function openDrawer(no,m,forcedType=null,forcedNoteId=null){
    const emp=state.status.employees.find(e=>String(e.employee_no)===String(no)),year=state.status.year;if(!emp)return;
    const period=monthPeriodState(emp,year,m),examType=forcedType||period?.exam_type||'special';
    if(!['special','preplacement','return'].includes(examType))return;
    const noteId=examType==='return'?(forcedNoteId||period?.noteId||null):null;
    const hz=empHazards(emp),due=examType==='special'?hz.filter(h=>yearOf(h.due)===year&&monthOf(h.due)===m):[];
    const exam=drawerExamFor(emp,year,m,examType,noteId);
    const linked=exam?state.status.examHazards.filter(x=>String(x.exam_id)===String(exam.id)).map(x=>{const h=state.status.hazards.find(z=>String(z.chemical_id)===String(x.chemical_id));return h?{...h,source_type:x.source_type||'auto'}:null}).filter(Boolean):[];
    const initial=linked.length?linked:due.map(h=>({...h,source_type:'auto'}));
    const note=examType==='return'?(state.status.notes.find(n=>String(n.id)===String(exam?.special_note_id||noteId))||period?.note||null):null;
    const contextLabel=examType==='preplacement'?'발령 전 검진':examType==='return'?'복귀 전 검진':'특수건강진단';
    const contextDetail=examType==='preplacement'?`연구소 발령일 ${labAssignDate(emp)||'-'}`:examType==='return'?`${note?.issue_type||period?.label||'연구소 부재'} · ${dateOnly(note?.start_date)||'-'} ~ ${dateOnly(note?.end_date)||'계속'}`:`연구소 발령일 ${labAssignDate(emp)||'-'}`;
    drawerCtx={mode:'single',emp,year,month:m,examId:exam?.id||null,examType,noteId:note?.id??noteId??null,period};
    $('#drawerName').textContent=`${emp.name||'-'} · ${year}년 ${m}월`;
    $('#drawerMeta').textContent=`${emp.employee_no} · ${divisionName(emp.division_code)} / ${teamName(emp.team_code)} · ${contextLabel}`;
    const bannerClass=examType==='preplacement'?'preplacement':examType==='return'?'return':'special';
    $('#drawerBody').innerHTML=`<div class="exam-context-banner ${bannerClass}"><b>${esc(contextLabel)}</b><span>${esc(contextDetail)}</span></div>
    <section class="drawer-section"><h3>검진정보</h3><div class="drawer-form"><label><span>${esc(contextLabel)} 예약일자</span><input id="drawerReservationDate" type="date" value="${esc(dateOnly(exam?.reservation_date)||'')}"></label><label><span>실제 검진일자</span><input id="drawerExamDate" type="date" value="${esc(dateOnly(exam?.exam_date)||'')}"></label><label class="wide"><span>검진기관</span><input id="drawerInstitution" value="${esc(exam?.exam_institution||'')}" placeholder="검진기관 입력"></label></div></section>
    <section class="drawer-section"><div class="drawer-section-head"><h3>검진대상 유해인자</h3><button class="add-hazard-btn" id="addHazardBtn" type="button">+ 유해인자 추가</button></div><div id="drawerSelectedHazards">${initial.length?initial.map(h=>selectedHazardHtml(h,h.source_type)).join(''):'<div class="drawer-empty">등록된 유해인자가 없습니다.</div>'}</div></section>
    <section class="drawer-section"><h3>검진결과</h3><div class="drawer-form"><label><span>결과 요약</span><select id="drawerResult"><option value="">미입력</option><option value="normal" ${exam?.result_summary==='normal'?'selected':''}>정상</option><option value="abnormal" ${exam?.result_summary==='abnormal'?'selected':''}>이상소견</option></select></label><label class="wide"><span>비고</span><textarea id="drawerNote" placeholder="필요한 참고사항 입력">${esc(exam?.note||'')}</textarea></label></div><div class="result-help">정상/이상소견은 포털 내부 현황용 요약값이며 원본 검진결과를 대체하지 않습니다.</div>${drawerActionsHtml(false,!!exam)}</section>`;
    bindHazardRemove();$('#addHazardBtn').onclick=openHazardPicker;$('#drawerSave').onclick=saveDrawer;$('#drawerDelete').onclick=deleteDrawer;$('#healthDrawer').classList.remove('hidden');$('#healthDrawerBackdrop').classList.remove('hidden');
  }

  function openBulkDrawer(empNos,m){const year=state.status.year,emps=empNos.map(no=>state.status.employees.find(e=>String(e.employee_no)===String(no))).filter(Boolean);if(emps.length<2){if(emps[0])openDrawer(emps[0].employee_no,m);return}const existing=emps.filter(e=>monthExams(e.employee_no,year,m).length).length;drawerCtx={mode:'bulk',emps,empNos:emps.map(e=>String(e.employee_no)),year,month:m,dirty:new Set()};const names=emps.slice(0,4).map(e=>e.name||e.employee_no).join(', ')+(emps.length>4?` 외 ${emps.length-4}명`:'');$('#drawerName').textContent=`${emps.length}명 선택 · ${year}년 ${m}월 일괄입력`;$('#drawerMeta').textContent=`${names} · 기존 입력 ${existing}명`;
    $('#drawerBody').innerHTML=`<div class="bulk-guide"><strong>변경한 항목만 선택 인원 전체에 적용합니다.</strong><span>빈칸은 기존 값을 유지합니다. 이미 입력된 값도 새 값을 입력하면 덮어씁니다.</span></div>
    <section class="drawer-section"><h3>검진정보</h3><div class="drawer-form"><label><span>특수검진 예약일자</span><input id="drawerReservationDate" data-bulk-field="reservation_date" type="date"></label><label><span>실제 검진일자</span><input id="drawerExamDate" data-bulk-field="exam_date" type="date"></label><label class="wide"><span>검진기관</span><input id="drawerInstitution" data-bulk-field="exam_institution" placeholder="변경할 경우에만 입력"></label></div><div class="bulk-field-note">※ 입력하지 않은 항목은 각 직원의 기존 데이터가 유지됩니다.</div></section>
    <section class="drawer-section"><div class="drawer-section-head"><h3>검진대상 유해인자 추가</h3><button class="add-hazard-btn" id="addHazardBtn" type="button">+ 유해인자 추가</button></div><div id="drawerSelectedHazards"><div class="drawer-empty">추가할 유해인자만 선택하세요. 각 직원의 기존 유해인자는 유지됩니다.</div></div></section>
    <section class="drawer-section"><h3>검진결과</h3><div class="drawer-form"><label><span>결과 요약</span><select id="drawerResult" data-bulk-field="result_summary"><option value="">변경 안 함</option><option value="normal">정상</option><option value="abnormal">이상소견</option></select></label><label class="wide"><span>비고</span><textarea id="drawerNote" data-bulk-field="note" placeholder="변경할 경우에만 입력"></textarea></label></div><div class="result-help">일괄입력에서는 실제로 변경한 항목과 새로 추가한 유해인자만 저장됩니다.</div>${drawerActionsHtml(true,existing>0)}</section>`;
    $$('[data-bulk-field]').forEach(el=>{const mark=()=>drawerCtx?.mode==='bulk'&&drawerCtx.dirty.add(el.dataset.bulkField);el.addEventListener(el.tagName==='SELECT'?'change':'input',mark);el.addEventListener('change',mark)});$('#addHazardBtn').onclick=openHazardPicker;$('#drawerSave').onclick=saveDrawer;$('#drawerDelete').onclick=deleteDrawer;$('#healthDrawer').classList.remove('hidden');$('#healthDrawerBackdrop').classList.remove('hidden')}

  function closeDrawer(){closeHazardPicker();$('#healthDrawer').classList.add('hidden');$('#healthDrawerBackdrop').classList.add('hidden');drawerCtx=null;monthDrag.active=false;clearMonthSelection()}
  function renderHazardPicker(){const q=$('#hazardPickerSearch').value.trim().toLowerCase(),selected=selectedHazardIds();const rows=state.status.hazards.filter(h=>!selected.has(String(h.chemical_id))).filter(h=>!q||`${h.cas_no} ${h.name_ko} ${h.name_en}`.toLowerCase().includes(q)).sort((a,b)=>String(b.latest_usage||'').localeCompare(String(a.latest_usage||''))||String(b.latest_receipt||'').localeCompare(String(a.latest_receipt||''))||String(a.cas_no).localeCompare(String(b.cas_no)));$('#hazardPickerBody').innerHTML=rows.map(h=>`<tr><td><input type="checkbox" data-pick-hazard="${esc(h.chemical_id)}"></td><td><b>${esc(h.cas_no||'-')}</b></td><td><b>${esc(h.name_ko||'-')}</b><small>${esc(h.name_en||'')}</small></td><td>${esc(h.exam_cycle_months||'-')}개월</td><td>${esc(h.latest_receipt||'-')}</td><td>${esc(h.latest_usage||'-')}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">추가할 수 있는 유해인자가 없습니다.</td></tr>'}
  function openHazardPicker(){$('#hazardPickerSearch').value='';renderHazardPicker();$('#hazardPickerModal').classList.remove('hidden')}
  function closeHazardPicker(){$('#hazardPickerModal').classList.add('hidden')}
  function addPickedHazards(){const ids=$$('[data-pick-hazard]:checked').map(x=>String(x.dataset.pickHazard));if(!ids.length)return toast('추가할 유해인자를 선택해 주세요.',true);const box=$('#drawerSelectedHazards');box.querySelector('.drawer-empty')?.remove();ids.forEach(id=>{const h=state.status.hazards.find(x=>String(x.chemical_id)===id);if(h&&!box.querySelector(`[data-chemical-id="${CSS.escape(id)}"]`))box.insertAdjacentHTML('beforeend',selectedHazardHtml(h,'manual'))});bindHazardRemove();closeHazardPicker()}

  async function saveSingleDrawer(){
    if(!drawerCtx||drawerCtx.mode!=='single')return;
    const sb=client(),cid=companyId(),ctx=drawerCtx,reservation=$('#drawerReservationDate').value||null,examDate=$('#drawerExamDate').value||null,institution=$('#drawerInstitution').value.trim()||null,result=$('#drawerResult').value||null,note=$('#drawerNote').value.trim()||null;
    if(!reservation&&!examDate)return toast('예약일자 또는 실제 검진일자를 입력해 주세요.',true);
    const btn=$('#drawerSave');btn.disabled=true;const originalText=btn.textContent;btn.textContent='저장 중…';
    try{
      let examId=ctx.examId;
      const payload={company_id:cid||null,employee_no:String(ctx.emp.employee_no),exam_type:ctx.examType||'special',special_note_id:(ctx.examType==='return'?(ctx.noteId||null):null),reservation_date:reservation,exam_date:examDate,exam_institution:institution,result_summary:result,note};
      let r;
      if(examId)r=await sb.from('qa_special_health_exams').update(payload).eq('id',examId).select('id').single();
      else r=await sb.from('qa_special_health_exams').insert(payload).select('id').single();
      if(r.error)throw r.error;examId=r.data.id;
      const del=await sb.from('qa_special_health_exam_hazards').delete().eq('exam_id',examId);if(del.error)throw del.error;
      const hazardRows=$$('#drawerSelectedHazards [data-chemical-id]').map(el=>{const h=state.status.hazards.find(x=>String(x.chemical_id)===String(el.dataset.chemicalId));return{exam_id:examId,chemical_id:Number(el.dataset.chemicalId),first_exam_months:h?.first_exam_months||null,exam_cycle_months:h?.exam_cycle_months||null,source_type:el.dataset.source||'manual'}});
      if(hazardRows.length){const ins=await sb.from('qa_special_health_exam_hazards').insert(hazardRows);if(ins.error)throw ins.error}
      const label=ctx.examType==='preplacement'?'발령 전 검진':ctx.examType==='return'?'복귀 전 검진':'특수건강진단';toast(`${label} 정보가 저장되었습니다.`);
      await loadStatus();openDrawer(ctx.emp.employee_no,ctx.month,ctx.examType,ctx.noteId);
    }catch(e){console.error(e);const msg=String(e.message||e);toast(msg.includes('exam_date')&&msg.includes('null')?'DB에서 exam_date NOT NULL 해제가 필요합니다.':'저장에 실패했습니다: '+msg,true)}
    finally{btn.disabled=false;btn.textContent=originalText||'저장'}
  }

  function bulkChanges(){const dirty=drawerCtx?.dirty||new Set(),changes={};const values={reservation_date:$('#drawerReservationDate')?.value||'',exam_date:$('#drawerExamDate')?.value||'',exam_institution:$('#drawerInstitution')?.value?.trim()||'',result_summary:$('#drawerResult')?.value||'',note:$('#drawerNote')?.value?.trim()||''};for(const k of dirty){if(values[k]!=='')changes[k]=values[k]}return changes}
  async function saveBulkDrawer(){if(!drawerCtx||drawerCtx.mode!=='bulk')return;const sb=client(),cid=companyId(),ctx=drawerCtx,changes=bulkChanges(),hazardIds=[...selectedHazardIds()];if(!Object.keys(changes).length&&!hazardIds.length)return toast('변경하거나 추가할 내용을 입력해 주세요.',true);const missing=ctx.emps.filter(emp=>!monthExam(emp.employee_no,ctx.year,ctx.month));if(missing.length&&!changes.reservation_date&&!changes.exam_date)return toast(`신규 입력 대상 ${missing.length}명은 예약일자 또는 실제 검진일자를 함께 입력해 주세요.`,true);const btn=$('#drawerSave');btn.disabled=true;const originalText=btn.textContent;btn.textContent='일괄 저장 중…';try{let saved=0;for(const emp of ctx.emps){let exam=monthExam(emp.employee_no,ctx.year,ctx.month),examId=exam?.id||null;if(examId&&Object.keys(changes).length){const up=await sb.from('qa_special_health_exams').update(changes).eq('id',examId).select('id').single();if(up.error)throw up.error;examId=up.data.id}else if(!examId){const payload={company_id:cid||null,employee_no:String(emp.employee_no),exam_type:'special',...changes};const ins=await sb.from('qa_special_health_exams').insert(payload).select('id').single();if(ins.error)throw ins.error;examId=ins.data.id}if(hazardIds.length){const existing=new Set(state.status.examHazards.filter(x=>String(x.exam_id)===String(examId)).map(x=>String(x.chemical_id)));const rows=hazardIds.filter(id=>!existing.has(String(id))).map(id=>{const h=state.status.hazards.find(x=>String(x.chemical_id)===String(id));return{exam_id:examId,chemical_id:Number(id),first_exam_months:h?.first_exam_months||null,exam_cycle_months:h?.exam_cycle_months||null,source_type:'manual'}});if(rows.length){const hi=await sb.from('qa_special_health_exam_hazards').insert(rows);if(hi.error)throw hi.error}}saved++}toast(`${saved}명의 특수건강진단 정보를 일괄 저장했습니다.`);closeDrawer();await loadStatus()}catch(e){console.error(e);toast('일괄 저장에 실패했습니다: '+String(e.message||e),true)}finally{btn.disabled=false;btn.textContent=originalText||'일괄저장'}}
  async function saveDrawer(){if(drawerCtx?.mode==='bulk')return saveBulkDrawer();return saveSingleDrawer()}

  async function deleteDrawer(){
    if(!drawerCtx)return;const sb=client(),ctx=drawerCtx;let exams=[];
    if(ctx.mode==='bulk')exams=ctx.emps.flatMap(emp=>monthExams(emp.employee_no,ctx.year,ctx.month));
    else if(ctx.examId){const hit=state.status.exams.find(e=>String(e.id)===String(ctx.examId));if(hit)exams=[hit]}
    const uniq=[...new Map(exams.map(e=>[String(e.id),e])).values()];
    if(!uniq.length)return toast('삭제할 검진정보가 없습니다.',true);
    const typeLabel=ctx.examType==='preplacement'?'발령 전 검진':ctx.examType==='return'?'복귀 전 검진':'검진정보';
    const label=ctx.mode==='bulk'?`선택한 ${ctx.emps.length}명의 ${ctx.year}년 ${ctx.month}월 검진정보 ${uniq.length}건`:`${ctx.emp.name||ctx.emp.employee_no}의 ${typeLabel}`;
    if(!window.confirm(`${label}을(를) 삭제하시겠습니까?\n예약일자, 검진일자, 병원, 결과, 비고, 연결 유해인자가 함께 삭제됩니다.`))return;
    const btn=$('#drawerDelete');btn.disabled=true;const originalText=btn.textContent;btn.textContent='삭제 중…';
    try{const ids=uniq.map(e=>e.id);const hd=await sb.from('qa_special_health_exam_hazards').delete().in('exam_id',ids);if(hd.error)throw hd.error;const ed=await sb.from('qa_special_health_exams').delete().in('id',ids);if(ed.error)throw ed.error;toast(ctx.mode==='bulk'?`${uniq.length}건의 검진정보를 일괄 삭제했습니다.`:'검진정보를 삭제했습니다.');closeDrawer();await loadStatus()}
    catch(e){console.error(e);toast('삭제에 실패했습니다: '+String(e.message||e),true)}finally{btn.disabled=false;btn.textContent=originalText}
  }

  async function loadStatus(){const sb=client();if(!sb)return;try{const cid=companyId();let eq=sb.from('employees').select('*');if(cid)eq=eq.eq('company_id',cid);let dq=sb.from('divisions').select('division_code,division_name,company_id,is_active');let tq=sb.from('teams').select('team_code,team_name,division_code,company_id,is_active');if(cid){dq=dq.eq('company_id',cid);tq=tq.eq('company_id',cid)}const [er,pfr,nr,xr,hr,sr,cr,pr,ur,rr,dr,tr]=await Promise.all([eq,sb.from('research_staff_profiles').select('*'),sb.from('employee_special_notes').select('*'),sb.from('qa_special_health_exams').select('*'),sb.from('qa_special_health_exam_hazards').select('*'),sb.from('qa_special_health_exam_standards').select('*'),sb.from('qa_chemical_master').select('id,cas_no,chem_name_ko,chem_name_en'),sb.from('product_cas').select('product_id,cas_no'),sb.from('qa_reagent_usage_records').select('product_id,usage_date'),sb.from('reagent_collect_items').select('product_id,receipt_date'),dq,tq]);for(const r of[er,pfr,nr,xr,hr,sr,cr,pr,ur,dr,tr])if(r.error)throw r.error;if(rr.error)console.warn('최근입고일 조회 생략',rr.error);state.status.employees=er.data||[];const empNos=new Set(state.status.employees.map(e=>String(e.employee_no)));state.status.profiles=(pfr.data||[]).filter(p=>empNos.has(String(p.employee_no))&&(!cid||!p.company_id||String(p.company_id)===cid));state.status.divisions=(dr.data||[]).filter(x=>x.is_active!==false);state.status.teams=(tr.data||[]).filter(x=>x.is_active!==false);state.status.notes=(nr.data||[]).filter(n=>!cid||!n.company_id||String(n.company_id)===cid);state.status.exams=(xr.data||[]).filter(e=>!cid||String(e.company_id)===cid);state.status.examHazards=hr.data||[];const cm=new Map((cr.data||[]).map(c=>[c.id,c])),cp=new Map(),up=new Map(),rp=new Map();(pr.data||[]).forEach(x=>{const a=cp.get(x.cas_no)||[];a.push(x.product_id);cp.set(x.cas_no,a)});(ur.data||[]).forEach(u=>{if(!u.usage_date)return;const a=up.get(u.product_id)||[];a.push(dateOnly(u.usage_date));up.set(u.product_id,a)});(rr.data||[]).forEach(r=>{if(!r.receipt_date)return;const a=rp.get(r.product_id)||[];a.push(dateOnly(r.receipt_date));rp.set(r.product_id,a)});const cut=new Date();cut.setFullYear(cut.getFullYear()-1);const cs=cut.toISOString().slice(0,10);state.status.hazards=(sr.data||[]).filter(s=>s.is_target===true&&s.status!=='inactive'&&s.verification_status!=='kosha_not_found').map(s=>{const c=cm.get(s.chemical_id)||{},pids=cp.get(c.cas_no)||[],dates=pids.flatMap(id=>up.get(id)||[]).sort(),receipts=pids.flatMap(id=>rp.get(id)||[]).sort();return{...s,cas_no:c.cas_no||'',name_ko:c.chem_name_ko||'',name_en:c.chem_name_en||'',first_usage:dates[0]||null,latest_usage:dates.at(-1)||null,latest_receipt:receipts.at(-1)||null,active_usage:dates.some(d=>d>=cs)}});state.status.loaded=true;fillStatusFilters();renderStatus();showLabAssignWarning()}catch(e){console.error(e);$('#statusBody').innerHTML=`<tr><td colspan="16" class="empty">현황 조회 실패: ${esc(e.message||e)}</td></tr>`;toast('특수건강진단 현황을 불러오지 못했습니다.',true)}}
  // 월 셀 클릭 이벤트는 renderStatus() 직후 각 셀에 직접 바인딩한다.
  $('#statusYear')?.addEventListener('change',()=>{state.status.year=Number($('#statusYear').value);syncStatusCategoryForYear(true);renderStatus()});$('#statusCategory')?.addEventListener('change',renderStatus);$('#statusDivision')?.addEventListener('change',()=>{updateTeams();renderStatus()});$('#statusTeam')?.addEventListener('change',renderStatus);$('#statusSearch')?.addEventListener('input',renderStatus);$('#drawerClose')?.addEventListener('click',closeDrawer);$('#healthDrawerBackdrop')?.addEventListener('click',closeDrawer);$('#hazardPickerClose')?.addEventListener('click',closeHazardPicker);$('#hazardPickerCancel')?.addEventListener('click',closeHazardPicker);$('#hazardPickerAdd')?.addEventListener('click',addPickedHazards);$('#hazardPickerSearch')?.addEventListener('input',renderHazardPicker);$('#labAssignWarningClose')?.addEventListener('click',()=>$('#labAssignWarningModal')?.classList.add('hidden'));$('#labAssignWarningOk')?.addEventListener('click',()=>$('#labAssignWarningModal')?.classList.add('hidden'));

  load();
  loadStatus();
})();
