/* ===== extracted inline script #6 (inline) ===== */

(function(){
let currentReportKind='monthly_trend', currentReportPayload=null, currentReportStory=null, currentAdditionalDataNeeded=[];
function esc(v){return String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function safeCall(fn,fallback){try{return typeof fn==='function'?fn():fallback;}catch(e){console.warn('ai report safeCall',e);return fallback;}}
async function sha256(text){try{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');}catch(e){return String(text.length)+'_'+Date.now();}}
function stableStringify(obj){const seen=new WeakSet();const sort=v=>{if(v&&typeof v==='object'){if(seen.has(v))return null;seen.add(v);if(Array.isArray(v))return v.map(sort);return Object.keys(v).sort().reduce((a,k)=>(a[k]=sort(v[k]),a),{});}return v;};return JSON.stringify(sort(obj));}
function setStatus(text,tone){const el=document.getElementById('attendanceReportStatus');if(!el)return;el.className='reportAiStatus'+(tone?' '+tone:'');el.textContent=text;}

function normalizeAdditionalDataNeeded(story){
  const raw=story&&typeof story==='object'?(story.additionalDataNeeded||story.additionalDataRequests||story.additionalRequests||story.requiredAdditionalData):null;
  if(!Array.isArray(raw))return[];
  return raw.map((v,i)=>{
    if(v&&typeof v==='object')return String(v.title||v.name||v.label||v.item||v.question||`추가 확인 자료 ${i+1}`).trim();
    return String(v||'').trim();
  }).filter(Boolean).slice(0,8);
}
function hideAdditionalDataPanel(){
  const panel=document.getElementById('attendanceAdditionalDataPanel');
  if(!panel)return;
  panel.classList.remove('show','collapsed');
  panel.setAttribute('aria-hidden','true');
  panel.innerHTML='';
}
function renderAdditionalDataPanel(story){
  const panel=document.getElementById('attendanceAdditionalDataPanel');
  if(!panel)return;
  const list=normalizeAdditionalDataNeeded(story);
  currentAdditionalDataNeeded=list;
  if(!list.length){hideAdditionalDataPanel();return;}
  panel.classList.add('show','collapsed');
  panel.setAttribute('aria-hidden','false');
  panel.innerHTML=`
    <div class="reportAdditionalHead">
      <div>
        <div class="reportAdditionalTitle">AI 추가 확인 필요 데이터</div>
        <div class="reportAdditionalDesc">AI가 보고서 정확도를 높이기 위해 아래 자료 확인을 요청했습니다. 필요할 때만 펼쳐서 확인 여부와 메모를 입력하세요.</div>
        <div class="reportAdditionalCollapsedHint">접힌 상태입니다. 보고서 확인 공간을 확보하려면 그대로 두고, 자료를 입력할 때만 펼치세요.</div>
      </div>
      <div class="reportAdditionalHeadActions">
        <button id="attendanceAdditionalToggleBtn" class="reportAdditionalBtn secondary" type="button" aria-expanded="false">펼치기</button>
        <button id="attendanceAdditionalClearBtn" class="reportAdditionalBtn secondary" type="button">입력 초기화</button>
      </div>
    </div>
    <div class="reportAdditionalBody">
      <div class="reportAdditionalGrid">
        ${list.map((item,i)=>`<div class="reportAdditionalItem"><label><input type="checkbox" class="additionalCheck" data-additional-index="${i}"> ${esc(item)}</label><textarea class="additionalMemo" data-additional-index="${i}" rows="3" placeholder="확인 결과, 보유 자료, 해석에 반영할 내용 등을 입력하세요."></textarea></div>`).join('')}
      </div>
      <div class="reportAdditionalMemoWrap"><div class="reportAdditionalMemoLabel">공통 메모</div><textarea id="attendanceAdditionalGeneralMemo" class="reportAdditionalMemo" rows="3" placeholder="추가자료 전반에 대한 공통 의견이나 보고서에 반영할 관리 판단을 입력하세요."></textarea></div>
      <div class="reportAdditionalActions"><button id="attendanceAdditionalRegenerateBtn" class="reportAdditionalBtn" type="button">추가자료 반영 후 보고서 재생성</button></div>
    </div>`;
  const toggle=document.getElementById('attendanceAdditionalToggleBtn');
  if(toggle)toggle.addEventListener('click',()=>{
    const collapsed=panel.classList.toggle('collapsed');
    toggle.textContent=collapsed?'펼치기':'접기';
    toggle.setAttribute('aria-expanded', collapsed?'false':'true');
  });
  const regen=document.getElementById('attendanceAdditionalRegenerateBtn');
  if(regen)regen.addEventListener('click',()=>requestAiReport(currentReportKind,true,{includeAdditionalData:true}));
  const clear=document.getElementById('attendanceAdditionalClearBtn');
  if(clear)clear.addEventListener('click',()=>{panel.querySelectorAll('input[type="checkbox"]').forEach(el=>el.checked=false);panel.querySelectorAll('textarea').forEach(el=>el.value='');});
}
function collectAdditionalUserData(){
  const panel=document.getElementById('attendanceAdditionalDataPanel');
  if(!panel||!panel.classList.contains('show'))return null;
  const list=Array.isArray(currentAdditionalDataNeeded)?currentAdditionalDataNeeded:[];
  const items=list.map((title,i)=>{
    const checked=!!panel.querySelector(`.additionalCheck[data-additional-index="${i}"]`)?.checked;
    const memo=String(panel.querySelector(`.additionalMemo[data-additional-index="${i}"]`)?.value||'').trim();
    return {title,confirmed:checked,memo};
  });
  const generalMemo=String(document.getElementById('attendanceAdditionalGeneralMemo')?.value||'').trim();
  const hasAny=items.some(v=>v.confirmed||v.memo)||!!generalMemo;
  if(!hasAny)return null;
  return {confirmedAt:new Date().toISOString(),source:'attendance-report-ui',items,generalMemo};
}

function reportParseYearMonth(label){const s=String(label||'').trim();let m=s.match(/(\d{4})[-.\/]?(\d{1,2})/);if(m)return{year:Number(m[1]),month:Number(m[2])};m=s.match(/(\d{2})[.\-/](\d{1,2})/);if(m)return{year:2000+Number(m[1]),month:Number(m[2])};return null;}
function reportUploadDateFromPeriod(label){const ym=reportParseYearMonth(label);if(!ym)return new Date().toISOString().slice(0,10);let y=ym.year,mo=ym.month+1;if(mo>12){y+=1;mo=1;}return `${y}-${String(mo).padStart(2,'0')}-01`;}
function compactTrendRows(rows){return(rows||[]).filter(Boolean).map(d=>({label:d.label||d.month||'',hasData:d.__hasData!==false,highRisk:Number(d.highRisk||0),warning:Number(d.warning||0),normal:Number(d.normal||0),avgRisk:Number(d.avgRisk||0),avgOvertimePerPerson:Number(d.avgOvertimePerPerson||0),totalOvertime:Number(d.totalOvertime||0),missingStart:Number(d.missingStart||0),missingEnd:Number(d.missingEnd||0),leaveUsageRate:Number(d.leaveUsageRate||0),workloadRisk:Number(d.workloadRisk||0),restRisk:Number(d.restRisk||0),holidayWorkCount:Number(d.holidayWorkCount||d.holidayWork||d.holiday||d.holiday_work_count||0)}));}
function buildReportCoreData(){const trendData=safeCall(window.trendBuildData,[]);const dataWithValues=(trendData||[]).filter(d=>d&&d.__hasData!==false);const latest=dataWithValues[dataWithValues.length-1]||{};const scope=safeCall(window.trendScopeLabel,'전체 조직');const period=safeCall(window.periodLabel,'전체');const periodMode=safeCall(window.trendPeriodMode,'year');const available=safeCall(window.trendGetAvailableMonths,[]);const selectedYm=safeCall(()=>window.trendSelectedEndMonth(available),'');const selectedMap=selectedYm&&typeof window.trendPersonRiskMapForMonth==='function'?window.trendPersonRiskMapForMonth(selectedYm):new Map();const people=[...selectedMap.values()].sort((a,b)=>Number(b.score||0)-Number(a.score||0)||String(a.name).localeCompare(String(b.name),'ko'));const riskCount=people.filter(p=>Number(p.score||0)>=75).length;const warnCount=people.filter(p=>Number(p.score||0)>=50&&Number(p.score||0)<75).length;const normalCount=Math.max(0,people.length-riskCount-warnCount);const topPeople=people.filter(p=>Number(p.score||0)>=50).map(p=>({name:p.name,score:Number(p.score||0),division:p.division||'',team:p.team||'',overtime:Number(p.overtime||p.monthlyOvertime||0),leaveDays:Number(p.leaveDays||0),trend:p.trend||'확인 필요'}));const scoped=safeCall(window.scopedEmployees,[]);const scopedSummary={employeeCount:Array.isArray(scoped)?scoped.length:0,totalOvertime:Array.isArray(scoped)?scoped.reduce((a,b)=>a+Number(b.scopedMonthlyOvertime||b.overtime||0),0):0,totalBusinessTrip:Array.isArray(scoped)?scoped.reduce((a,b)=>a+Number(b.businessTripDays||0),0):0,totalOutdoor:Array.isArray(scoped)?scoped.reduce((a,b)=>a+Number(b.outdoorDays||0),0):0};const scopedEmployeesForReport=Array.isArray(scoped)?scoped.map(e=>({name:e.name||'',division:e.division||'',team:e.team||'',divisionCode:e.divisionCode||'',teamCode:e.teamCode||'',status:e.status||'',attendanceTarget:e.attendanceTarget||'',score:Number(e.riskScore||e.score||0),overtimeHours:Number(e.scopedMonthlyOvertime||e.overtime||0)})):[];return{scope,period,periodMode,selectedYm,writtenDate:reportUploadDateFromPeriod(period),trendData:compactTrendRows(trendData),latest,riskCount,warnCount,normalCount,topPeople,scopedSummary,scopedEmployees:scopedEmployeesForReport};}
function getSelectedHiringEmployee(){const sel=document.getElementById('hiringEmployeeSelect');if(!sel||!sel.value)return null;try{return JSON.parse(decodeURIComponent(sel.value));}catch(e){return null;}}
function buildHiringInput(){return{reason:document.getElementById('hiringReason')?.value||'퇴사/퇴사 예정',requestCount:Number(document.getElementById('hiringCount')?.value||1),neededDate:document.getElementById('hiringNeededDate')?.value||'',impact:document.getElementById('hiringImpact')?.value||'High',detail:document.getElementById('hiringDetail')?.value||'',employee:getSelectedHiringEmployee()};}
function fallbackReportHtml(payload){const d=payload.data||{},h=payload.hiringInput;if(payload.reportType==='hiring'){const emp=h?.employee;return `<div class="attReportHeaderTitle">${esc(d.period)} 충원 검토 보고서</div><div class="attReportMeta">작성일자: ${esc(d.writtenDate)}<br>보고대상: ${esc(d.scope)}<br>충원사유: ${esc(h?.reason||'-')}</div><div class="attReportIntro"><p>API 또는 서버 저장소 연결이 실패하여 임시 보고서를 표시합니다. Vercel API와 환경변수를 설정하면 이 영역은 생성된 보고서로 대체됩니다.</p></div><h2>1. 충원 요청 개요</h2><p>요청 인원은 ${esc(h?.requestCount||1)}명이며 필요 시점은 ${esc(h?.neededDate||'-')}입니다. 업무 공백 영향도는 ${esc(h?.impact||'-')}입니다.</p><h2>2. 대상자 정보</h2><p>${emp?`${esc(emp.name)} / ${esc(emp.employeeNo||emp.id||'-')} / ${esc(emp.division||'-')} / ${esc(emp.team||'-')} / ${esc(emp.position||'-')}`:'선택된 대상자 없음'}</p><h2>3. 현재 근태 참고 지표</h2><p>위험 ${d.riskCount||0}명, 주의 ${d.warnCount||0}명, 정상 ${d.normalCount||0}명입니다.</p><h2>4. 상세 사유</h2><p>${esc(h?.detail||'-')}</p>`;}return `<div class="attReportHeaderTitle">${esc(d.period)} 근태 분석 보고서</div><div class="attReportMeta">작성일자: ${esc(d.writtenDate)}<br>보고대상: ${esc(d.scope)}</div><div class="attReportIntro"><p>API 또는 서버 저장소 연결이 실패하여 임시 보고서를 표시합니다. Vercel API와 환경변수를 설정하면 이 영역은 생성된 보고서로 대체됩니다.</p></div><h2>1. 핵심 요약</h2><p>위험 ${d.riskCount||0}명, 주의 ${d.warnCount||0}명, 정상 ${d.normalCount||0}명입니다.</p><h2>2. 상위 담당자</h2><table class="attReportTable"><thead><tr><th>순위</th><th>담당자</th><th>점수</th></tr></thead><tbody>${(d.topPeople||[]).map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.name)}</td><td>${Math.round(Number(p.score||0))}</td></tr>`).join('')||'<tr><td colspan="3">데이터 없음</td></tr>'}</tbody></table>`;}
async function buildServerPayload(reportType,options){
  options=options||{};
  const includeAdditionalData=!!options.includeAdditionalData;
  const core=buildReportCoreData();
  const reportInfo={
    month: core.period,
    scope: core.scope || '연구소 전체',
    department: '',
    writerDepartment: '연구지원팀',
    writer: '김남호 차장',
    writtenDate: core.writtenDate,
    periodMode: core.periodMode,
    selectedYm: core.selectedYm || ''
  };
  const totalEmployees = Number(core?.scopedSummary?.employeeCount || (core.riskCount||0)+(core.warnCount||0)+(core.normalCount||0) || 0);
  const totalOvertime = Number(core?.latest?.totalOvertime || core?.scopedSummary?.totalOvertime || 0);
  const avgOvertime = totalEmployees ? Number((totalOvertime / Math.max(1,totalEmployees)).toFixed(1)) : Number(core?.latest?.avgOvertimePerPerson || 0);
  const monthlySummary={
    totalEmployees,
    riskCount: Number(core.riskCount || 0),
    warningCount: Number(core.warnCount || 0),
    normalCount: Number(core.normalCount || 0),
    averageOvertimeHours: avgOvertime,
    operationalRiskScore: Number(core?.latest?.avgRisk || core?.latest?.riskScore || 0)
  };
  const monthlyKpi={
    overtimeCount: totalOvertime,
    holidayWorkCount: Number(core?.latest?.holidayWorkCount ?? core?.latest?.holidayWork ?? core?.latest?.holiday ?? core?.latest?.holiday_work_count ?? 0),
    averageOvertimeHours: avgOvertime,
    riskEmployeeCount: monthlySummary.riskCount
  };
  const topPeople=Array.isArray(core.topPeople)?core.topPeople:[];
  const riskCandidates=topPeople.map(p=>{
    const score=Number(p.score||0);
    const status=score>=75?'위험':(score>=50?'주의':'정상');
    const issues=[];
    if(Number(p.overtime||0)>0) issues.push('연장근무');
    if(score>=75) issues.push('위험도 높음');
    if(status==='주의') issues.push('주의 상태');
    const orgInfo=resolveEmployeeOrgInfoForReport(p.name,{team:p.team||'',division:p.division||'',teamCode:p.teamCode||'',divisionCode:p.divisionCode||''});
    return {
      name:p.name,
      team:orgInfo.team||'',
      division:orgInfo.division||'',
      teamCode:orgInfo.teamCode||'',
      divisionCode:orgInfo.divisionCode||'',
      status,
      riskScore:score,
      issues,
      trend:p.trend||'확인 필요'
    };
  }).filter(p=>p.name);
  const riskOnly=riskCandidates.filter(p=>p.status==='위험');
  const warnOnly=riskCandidates.filter(p=>p.status==='주의');
  const selectedWarning=warnOnly.length<=5?warnOnly:warnOnly.slice(0,5);
  const riskUsers=[...riskOnly,...selectedWarning];
  const rows=Array.isArray(core.trendData)?core.trendData:[];
  const recentRows=rows.filter(r=>r&&r.hasData!==false).slice(-6);
  const trend={
    months: recentRows.map(r=>r.label||r.month||''),
    riskCount: recentRows.map(r=>Number(r.highRisk||0)),
    warningCount: recentRows.map(r=>Number(r.warning||0)),
    averageOvertimeHours: recentRows.map(r=>Number(r.avgOvertimePerPerson||0)),
    overtimeCount: recentRows.map(r=>Number(r.totalOvertime||r.overtime||0)),
    holidayWorkCount: recentRows.map(r=>Number(r.holidayWorkCount ?? r.holidayWork ?? r.holiday ?? r.holiday_work_count ?? 0))
  };
  const visualDecisionHints={
    monthlySummary:'cards',
    monthlyKpi:'bar_or_cards',
    trend:trend.months.length<=1?'limited_or_cards':'bar_or_line',
    riskUsers:'table_or_horizontal_bar'
  };
  const constraints={
    excludeMissingPunchAnalysis:true,
    doNotInventData:true,
    tone:'단정하지 않고 추후 확인 필요 중심',
    output:'A4 보고서 HTML 본문'
  };
  const sanitizedData={
    scope:core.scope,
    period:core.period,
    periodMode:core.periodMode,
    selectedYm:core.selectedYm,
    writtenDate:core.writtenDate,
    riskCount:core.riskCount,
    warnCount:core.warnCount,
    normalCount:core.normalCount,
    scopedSummary:core.scopedSummary,
    latest:{
      highRisk:Number(core?.latest?.highRisk||0),
      warning:Number(core?.latest?.warning||0),
      normal:Number(core?.latest?.normal||0),
      avgRisk:Number(core?.latest?.avgRisk||core?.latest?.riskScore||0),
      avgOvertimePerPerson:Number(core?.latest?.avgOvertimePerPerson||0),
      totalOvertime:Number(core?.latest?.totalOvertime||0),
      leaveUsageRate:Number(core?.latest?.leaveUsageRate||0),
      workloadRisk:Number(core?.latest?.workloadRisk||0),
      restRisk:Number(core?.latest?.restRisk||0)
    },
    topPeople:riskUsers,
    scopedEmployees:core.scopedEmployees||[],
    trendData:recentRows.map(r=>({
      label:r.label||r.month||'',
      highRisk:Number(r.highRisk||0),
      warning:Number(r.warning||0),
      normal:Number(r.normal||0),
      avgRisk:Number(r.avgRisk||0),
      avgOvertimePerPerson:Number(r.avgOvertimePerPerson||0),
      totalOvertime:Number(r.totalOvertime||r.overtime||0),
      leaveUsageRate:Number(r.leaveUsageRate||0),
      workloadRisk:Number(r.workloadRisk||0),
      restRisk:Number(r.restRisk||0)
    }))
  };
  const analysisProbe={reportInfo,data:sanitizedData,riskUsers:riskCandidates,scopedEmployees:core.scopedEmployees||[]};
  const analysisLevel=inferAttendanceAnalysisLevel(analysisProbe);
  const teamSummary=buildTeamSummaryForReport(analysisProbe);
  const analysisGuide={
    analysisLevel,
    comparisonTarget:analysisLevel==='team'?'담당자':'팀',
    instruction:analysisLevel==='team'
      ? '현재 선택 범위가 팀 단위이므로 담당자별 위험/주의 흐름을 중심으로 분석한다.'
      : '현재 선택 범위가 전체 또는 본부/연구소 단위이므로 팀별 위험/주의 집중도와 소속 본부 표기를 중심으로 분석한다.'
  };

  const payload={
    app:'attendance',
    version:'ai-report-v2',
    reportType,
    reportTitle:reportType==='hiring'?`${core.period} 충원 검토 보고서`:`${core.period} 근태 리스크 및 운영 분석 보고서`,
    reportInfo,
    monthlySummary,
    monthlyKpi,
    riskUsers,
    teamSummary,
    analysisLevel,
    analysisGuide,
    trend,
    visualDecisionHints,
    constraints,
    data:sanitizedData,
    hiringInput:reportType==='hiring'?buildHiringInput():null
  };
  const additionalUserData=includeAdditionalData?collectAdditionalUserData():null;
  if(additionalUserData){
    payload.additionalUserData=additionalUserData;
    payload.additionalDataRequested=Array.isArray(currentAdditionalDataNeeded)?currentAdditionalDataNeeded:[];
    payload.regenerationReason='additional_data_confirmed_by_user';
  }
  payload.dataHash=await sha256(stableStringify({reportType,reportInfo,monthlySummary,monthlyKpi,riskUsers,teamSummary:payload.teamSummary||[],analysisLevel:payload.analysisLevel||null,analysisGuide:payload.analysisGuide||null,trend,hiringInput:payload.hiringInput,additionalUserData:payload.additionalUserData||null,additionalDataRequested:payload.additionalDataRequested||[]}));
  payload.reportKey=`attendance:${reportType}:${reportInfo.scope}:${reportInfo.month}:${reportInfo.periodMode}:${payload.dataHash}`;
  return payload;
}

function cleanAiText(html){const tmp=document.createElement('div');tmp.innerHTML=String(html||'');tmp.querySelectorAll('script,style').forEach(n=>n.remove());return(tmp.textContent||'').replace(/\s+/g,' ').trim();}
function splitSentences(text){const s=String(text||'').replace(/\s+/g,' ').trim();if(!s)return[];return(s.match(/[^.!?。]+(?:[.!?。]|다\.|요\.|니다\.|습니다\.)?/g)||[s]).map(v=>v.trim()).filter(v=>v.length>12).slice(0,12);}
function getAiSentence(html,idx,fallback){return splitSentences(cleanAiText(html))[idx]||fallback;}
function fixedNum(v,d=0){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('ko-KR',{maximumFractionDigits:d,minimumFractionDigits:d?d:0}):'0';}
function fixedPct(v,m){
  const n=Math.max(0,Number(v||0));
  if(!n) return 0;
  return Math.max(5,Math.min(100,Math.round((n/Math.max(1,Number(m||0)))*100)));
}
function fixedStatusClass(s){return s==='위험'?'red':(s==='주의'?'amber':(s==='정상'?'green':'gray'));}

function updateFixedReportPageNumbers(){
  const scope=document.getElementById('attendanceReportPreview')||document;
  const pages=Array.from(scope.querySelectorAll('.fixedReportPage'));
  const total=pages.length;
  pages.forEach((page,index)=>{
    const num=page.querySelector('.fixedPageNumber');
    if(num) num.textContent=`${index+1}/${total}`;
  });
}
if(!window.__fixedReportPrintFooterBound){
  window.__fixedReportPrintFooterBound=true;
  window.addEventListener('beforeprint',updateFixedReportPageNumbers);
  window.addEventListener('afterprint',updateFixedReportPageNumbers);
}

function renderFixedHeader(label,title,info){return `<div class="fixedReportHeader"><div class="fixedReportTitleBlock"><div class="fixedReportLabel">${esc(label)}</div><div class="fixedReportTitle">${esc(title)}</div></div><div class="fixedReportMeta"><div class="fixedMetaRow"><span>작성일자</span><b>${esc(info.writtenDate||'-')}</b></div><div class="fixedMetaRow"><span>보고대상</span><b>${esc(info.scope||'-')}</b></div><div class="fixedMetaRow"><span>작성부서</span><b>연구지원팀</b></div><div class="fixedMetaRow"><span>작성자</span><b>김남호 차장</b></div></div></div>`;}
function renderFixedFooter(){return `<div class="fixedPrintFooter"><span>Attendance Report</span><span class="fixedPageNumber"></span></div>`;}
function renderFixedBars(items){const max=Math.max(1,...items.map(i=>Number(i.value||0)));return items.map(i=>`<div class="fixedBarRow"><div class="fixedBarLabel">${esc(i.label)}</div><div class="fixedBarBg"><div class="fixedBar ${i.tone||''}" style="width:${fixedPct(i.value,max)}%"></div></div><div class="fixedBarVal">${esc(i.display??fixedNum(i.value))}</div></div>`).join('');}
function renderFixedRiskTable(users){const rows=(users||[]).slice(0,8).map((p,i)=>`<tr><td>${i+1}</td><td><b>${esc(p.name||'-')}</b><br><span style="color:#64748b;font-size:11px">${esc(p.division||'')} ${esc(p.team||'')}</span></td><td><span class="fixedPill ${fixedStatusClass(p.status)}">${esc(p.status||'확인')}</span></td><td>${fixedNum(p.riskScore||p.score||0)}</td><td>${esc((p.issues||[]).join(' · ')||p.trend||'확인 필요')}</td></tr>`).join('');return `<table class="fixedTable"><thead><tr><th>순위</th><th>담당자</th><th>상태</th><th>점수</th><th>확인 필요사항</th></tr></thead><tbody>${rows||'<tr><td colspan="5">표시할 위험/주의 담당자 데이터가 없습니다.</td></tr>'}</tbody></table>`;}
function renderFixedTeamTable(teams){
  const rows=(teams||[]).slice(0,8).map((t,i)=>{
    const status=t.risk>0?'위험':(t.warning>0?'주의':'정상');
    const need=t.risk>0?'위험 팀 우선 점검':(t.warning>0?'주의 팀 모니터링':'안정 상태');
    return `<tr><td>${i+1}</td><td><b>${esc(t.team||'-')}</b><br><span style="color:#64748b;font-size:11px">${esc(t.division||'')}</span></td><td>${fixedNum(t.total||0)}명</td><td>${fixedNum(t.risk||0)}명</td><td>${fixedNum(t.warning||0)}명</td><td>${fixedNum(t.avgScore||0,1)}</td><td>${esc(need)}</td></tr>`;
  }).join('');
  return `<table class="fixedTable"><thead><tr><th>순위</th><th>팀 / 본부</th><th>인원</th><th>위험</th><th>주의</th><th>평균점수</th><th>확인 필요사항</th></tr></thead><tbody>${rows||'<tr><td colspan="7">표시할 팀별 리스크 데이터가 없습니다.</td></tr>'}</tbody></table>`;
}
function renderFixedTrendChart(trend,info){const months=trend?.months||[],risks=trend?.riskCount||[],warns=trend?.warningCount||[];const values=months.map((m,i)=>Number(risks[i]||0)+Number(warns[i]||0));const max=Math.max(1,...values);return `<div class="fixedChartBox"><div class="fixedChartTitle">월별 위험·주의 인원 흐름</div><div class="fixedChartMock">${months.length?months.map((m,i)=>`<div class="fixedMonthGroup"><div class="fixedMonthBar ${m===info.selectedYm||i===months.length-1?'active':''}" style="height:${fixedPct(values[i],max)}%">${fixedNum(values[i])}</div><div class="fixedMonthLabel">${esc(m)}</div></div>`).join(''):'<div class="fixedBlockText">추세 데이터가 충분하지 않아 기준점으로만 표시합니다.</div>'}</div></div>`;}
function parseReportMonthParts(raw){
  const s=String(raw||'').trim();
  let m=s.match(/(\d{4})[-.\/년\s]*(\d{1,2})/);
  if(m) return {year:Number(m[1]), month:Number(m[2])};
  m=s.match(/(\d{2})[.\-/](\d{1,2})/);
  if(m) return {year:2000+Number(m[1]), month:Number(m[2])};
  m=s.match(/(\d{1,2})\s*월/);
  if(m) return {year:null, month:Number(m[1])};
  return null;
}
function formatReportMonthLabel(raw){
  const parsed=parseReportMonthParts(raw);
  return parsed?.month ? `${parsed.month}월` : (String(raw||'').trim() || '해당월');
}
function formatReportShortMonthLabel(raw){
  const parsed=parseReportMonthParts(raw);
  if(parsed?.year && parsed?.month) return `${String(parsed.year).slice(2)}.${String(parsed.month).padStart(2,'0')}`;
  if(parsed?.month) return `${parsed.month}월`;
  return String(raw||'').trim() || '해당월';
}
function formatReportFullMonthTitle(raw){
  const parsed=parseReportMonthParts(raw);
  if(parsed?.year && parsed?.month) return `${parsed.year}년 ${parsed.month}월`;
  if(parsed?.month) return `${parsed.month}월`;
  return String(raw||'').trim() || '해당월';
}
function buildFixedCoreInsight(risk,warn,normal,total){
  const r=Number(risk||0), w=Number(warn||0), n=Number(normal||0), t=Number(total||0);
  const month=formatReportMonthLabel((currentReportPayload&&currentReportPayload.reportInfo&&currentReportPayload.reportInfo.month)||'해당월');
  if(!t) return '해당월 근태 운영 상태은 데이터 반영 상태를 기준으로 확인이 필요합니다. 위험·주의 인원의 발생 여부와 반복 가능성을 중심으로 검토하는 것이 적절합니다.';
  if(r>0 || w>0) return `${month} 현황은 전체 조직의 급격한 악화라기보다, 특정 담당자에게 누적되는 위험 신호를 조기에 확인해야 하는 형태로 볼 수 있습니다. 따라서 이번 달 보고서는 전체 평균보다 상위 리스크 인원의 반복성과 원인을 확인하는 방향이 적절합니다.`;
  return '해당월 현황은 전반적으로 안정적인 상태로 볼 수 있습니다. 다만 추후 동일 지표가 반복되는지 확인하기 위해 기준월 데이터를 누적 관리하는 것이 적절합니다.';
}


function normalizeScopeTextForAnalysis(value){
  return String(value || '').trim();
}
function inferAttendanceAnalysisLevel(payload){
  const info = payload?.reportInfo || {};
  const data = payload?.data || {};
  const scope = normalizeScopeTextForAnalysis(info.scope || data.scope || '');
  const team = normalizeScopeTextForAnalysis(info.team || data.team || '');
  const department = normalizeScopeTextForAnalysis(info.targetDepartment || data.targetDepartment || info.division || data.division || '');
  const lower = scope.toLowerCase();

  if (!scope || scope === '전체' || scope.includes('전체 조직') || lower === 'all') return 'organization';
  if (team || /팀$/.test(scope)) return 'team';
  if (department || scope.includes('본부') || scope.includes('연구소')) return 'division';
  return 'organization';
}
function getEmployeeMasterSourceForReport(){
  const source = [];
  if (Array.isArray(empMaster)) source.push(...empMaster);
  if (Array.isArray(EMPLOYEES)) source.push(...EMPLOYEES);
  try {
    const scoped = typeof scopedEmployees === 'function' ? scopedEmployees() : [];
    if (Array.isArray(scoped)) source.push(...scoped);
  } catch (_) {}
  return source.filter(Boolean);
}
function resolveEmployeeOrgInfoForReport(name, fallback={}){
  const cleanName = typeof normalizeEmployeeName === 'function'
    ? normalizeEmployeeName(name || fallback.name || '')
    : String(name || fallback.name || '').trim();
  const source = getEmployeeMasterSourceForReport();
  const found = source.find(emp => {
    const empName = typeof normalizeEmployeeName === 'function'
      ? normalizeEmployeeName(emp?.name || emp?.employeeName || '')
      : String(emp?.name || emp?.employeeName || '').trim();
    return empName && cleanName && empName === cleanName;
  }) || {};

  const divisionCode = String(found.divisionCode || found.division_code || fallback.divisionCode || fallback.division_code || '').trim();
  const teamCode = String(found.teamCode || found.team_code || fallback.teamCode || fallback.team_code || '').trim();
  let division = String(found.division || found.department || found.divisionName || fallback.division || fallback.department || '').trim();
  let team = String(found.team || found.teamName || fallback.team || '').trim();

  if (!division && divisionCode && typeof getDivisionNameByCode === 'function') division = getDivisionNameByCode(divisionCode);
  if (!team && teamCode && typeof getTeamNameByCode === 'function') team = getTeamNameByCode(divisionCode, teamCode);
  if (!division && teamCode && Array.isArray(orgMaster)) {
    const div = orgMaster.find(d => (d.teams || []).some(t => String(t.teamCode || '') === teamCode || String(t.teamName || '') === team));
    if (div) division = div.divisionName || div.name || div.divisionCode || '';
  }
  if (!team && Array.isArray(orgMaster)) {
    const div = orgMaster.find(d => String(d.divisionCode || '') === divisionCode || String(d.divisionName || '') === division);
    const teamObj = div?.teams?.find(t => String(t.teamCode || '') === teamCode || String(t.teamName || '') === String(fallback.team || ''));
    if (teamObj) team = teamObj.teamName || teamObj.name || teamObj.teamCode || '';
  }

  return {
    name: cleanName,
    division: division || '미지정본부',
    team: team || '미지정팀',
    divisionCode,
    teamCode,
  };
}
function getUserTeamNameForAnalysis(user){
  return resolveEmployeeOrgInfoForReport(user?.name || user?.담당자 || user?.employeeName || '', user || {}).team;
}
function getUserDivisionNameForAnalysis(user){
  return resolveEmployeeOrgInfoForReport(user?.name || user?.담당자 || user?.employeeName || '', user || {}).division;
}
function getUserRiskStatusForAnalysis(user){
  const raw = String(user?.status || user?.riskStatus || user?.state || user?.상태 || '').trim();
  const score = Number(user?.score || user?.riskScore || user?.점수 || 0);
  if (raw.includes('위험') || score >= 75) return '위험';
  if (raw.includes('주의') || score >= 50) return '주의';
  return '정상';
}
function buildTeamSummaryForReport(payload){
  const scoped = Array.isArray(payload?.scopedEmployees) ? payload.scopedEmployees : (Array.isArray(payload?.data?.scopedEmployees) ? payload.data.scopedEmployees : []);
  const riskUsers = Array.isArray(payload?.riskUsers) ? payload.riskUsers : [];
  const riskMap = new Map();
  riskUsers.forEach(user => {
    const name = typeof normalizeEmployeeName === 'function'
      ? normalizeEmployeeName(user?.name || user?.담당자 || user?.employeeName || '')
      : String(user?.name || user?.담당자 || user?.employeeName || '').trim();
    if(name) riskMap.set(name, user);
  });

  const baseUsers = scoped.length ? scoped : riskUsers;
  const map = new Map();

  baseUsers.forEach(base => {
    const cleanName = typeof normalizeEmployeeName === 'function'
      ? normalizeEmployeeName(base?.name || base?.담당자 || base?.employeeName || '')
      : String(base?.name || base?.담당자 || base?.employeeName || '').trim();
    const riskUser = riskMap.get(cleanName) || {};
    const merged = { ...base, ...riskUser, name: cleanName || base?.name || riskUser?.name || '' };
    const org = resolveEmployeeOrgInfoForReport(merged.name, merged);
    const team = org.team;
    const division = org.division;
    const key = `${division}||${team}`;
    if (!map.has(key)) {
      map.set(key, {
        division,
        team,
        label: division && division !== '미지정본부' ? `${team}(${division})` : team,
        total: 0,
        risk: 0,
        warning: 0,
        normal: 0,
        avgScore: 0,
        avgOvertimeHours: 0,
        members: [],
      });
    }
    const row = map.get(key);
    const status = riskMap.has(cleanName) ? getUserRiskStatusForAnalysis(merged) : '정상';
    const score = Number(merged?.score || merged?.riskScore || merged?.점수 || 0);
    const overtime = Number(merged?.overtimeHours || merged?.overtime || merged?.scopedMonthlyOvertime || merged?.연장근무 || merged?.연장시간 || 0);

    row.total += 1;
    if (status === '위험') row.risk += 1;
    else if (status === '주의') row.warning += 1;
    else row.normal += 1;
    row.avgScore += Number.isFinite(score) ? score : 0;
    row.avgOvertimeHours += Number.isFinite(overtime) ? overtime : 0;
    row.members.push({
      name: merged?.name || '',
      status,
      score: Number.isFinite(score) ? score : 0,
      overtimeHours: Number.isFinite(overtime) ? overtime : 0,
    });
  });

  return Array.from(map.values())
    .map(row => ({
      ...row,
      avgScore: row.total ? Number((row.avgScore / row.total).toFixed(1)) : 0,
      avgOvertimeHours: row.total ? Number((row.avgOvertimeHours / row.total).toFixed(1)) : 0,
      riskRate: row.total ? Number(((row.risk / row.total) * 100).toFixed(1)) : 0,
      warningRate: row.total ? Number(((row.warning / row.total) * 100).toFixed(1)) : 0,
    }))
    .sort((a,b) => (b.risk - a.risk) || (b.warning - a.warning) || (b.avgScore - a.avgScore) || a.label.localeCompare(b.label, 'ko'));
}
function enrichAttendanceReportPayloadForAnalysis(payload){
  const next = { ...(payload || {}) };
  const analysisLevel = next.analysisLevel || inferAttendanceAnalysisLevel(next);
  const existingTeamSummary = Array.isArray(next.teamSummary) ? next.teamSummary : [];
  const hasOnlyUnknownTeam = existingTeamSummary.length && existingTeamSummary.every(t => String(t?.team || '').includes('미지정') || !String(t?.team || '').trim());
  const teamSummary = existingTeamSummary.length && !hasOnlyUnknownTeam
    ? existingTeamSummary
    : buildTeamSummaryForReport(next);

  next.analysisLevel = analysisLevel;
  next.teamSummary = teamSummary;
  next.analysisGuide = {
    analysisLevel,
    comparisonTarget: analysisLevel === 'team' ? '담당자' : '팀',
    instruction: analysisLevel === 'team'
      ? '현재 선택 범위가 팀 단위이므로 담당자별 위험/주의 흐름을 중심으로 분석한다.'
      : '현재 선택 범위가 전체 또는 본부/연구소 단위이므로 팀별 위험/주의 집중도와 소속 본부 표기를 중심으로 분석한다.',
  };

  return next;
}
function getFixedReportComparisonLabel(payload){
  const level = payload?.analysisLevel || inferAttendanceAnalysisLevel(payload);
  if(level === 'team') return {target:'담당자', mode:'담당자별 위험 흐름', tableTitle:'담당자 리스크 요약'};
  return {target:'팀', mode:'팀별 위험 집중도', tableTitle:'팀별 리스크 요약'};
}

function renderFixedAttendanceReport(payload,aiHtml){
  if(!payload||payload.reportType==='hiring')return aiHtml||fallbackReportHtml(payload||{});
  const info=payload.reportInfo||{},d=payload.data||{},sum=payload.monthlySummary||{},kpi=payload.monthlyKpi||{},trend=payload.trend||{},users=payload.riskUsers||[];
  const analysisLevel=payload.analysisLevel||inferAttendanceAnalysisLevel(payload);
  const isTeamComparisonReport=analysisLevel==='organization'||analysisLevel==='division';
  const teamRows=Array.isArray(payload.teamSummary)?payload.teamSummary:[];
  const comparison=getFixedReportComparisonLabel({...payload,analysisLevel});
  const riskTableHtml=isTeamComparisonReport?renderFixedTeamTable(teamRows):renderFixedRiskTable(users);
  const focusTarget=isTeamComparisonReport?'팀':'담당자';
  const focusTargetText=isTeamComparisonReport?'팀별 위험·주의 집중도':'담당자별 위험·주의 흐름';
  const concentrationNote=isTeamComparisonReport?'특정 팀 집중형':'특정 인원 집중형';
  const monthText=info.month||d.period||'해당월';
  const monthKo=formatReportFullMonthTitle(info.selectedYm||info.monthKey||d.selectedYm||d.periodKey||monthText);
  const total=sum.totalEmployees||d?.scopedSummary?.employeeCount||0;
  const risk=sum.riskCount??d.riskCount??0,warn=sum.warningCount??d.warnCount??0,normal=sum.normalCount??d.normalCount??0;
  const story=(()=>{try{if(aiHtml&&typeof aiHtml==='object')return aiHtml;const raw=String(aiHtml||'').trim();if(!raw)return{};const cleaned=cleanAiText(raw);const target=(cleaned.match(/\{[\s\S]*\}/)||[cleaned])[0];const parsed=JSON.parse(target);return parsed&&typeof parsed==='object'?parsed:{};}catch(e){return{};}})();
  const storySections=(story&&story.sections&&typeof story.sections==='object')?story.sections:{};
  const pickStoryText=(...vals)=>vals.map(v=>v==null?'':String(v).trim()).find(Boolean)||'';
  const frameText=pickStoryText(story.intro,storySections.intro,story.frame,story.analysisFrame,`${monthText} 데이터는 단순 평균 비교보다 위험·주의 인원이 특정 ${focusTarget}에 집중되는지 확인하는 관점으로 해석합니다.`);
  const statusText=pickStoryText(story.status,storySections.status,getAiSentence(aiHtml,0,`${monthText} 기준 위험 인원 ${risk}명, 주의 인원 ${warn}명으로 확인됩니다. 현재 수치는 업무 집중과 근무시간 편중 가능성을 검토하기 위한 기준점으로 보는 것이 적절합니다.`));
  const ai1=pickStoryText(story.judge,storySections.judge,story.currentJudge,getAiSentence(aiHtml,1,`${monthText} 기준 위험 인원 ${risk}명, 주의 인원 ${warn}명으로 확인됩니다. 현재 수치는 업무 집중과 근무시간 편중 가능성을 검토하기 위한 기준점으로 보는 것이 적절합니다.`));
  const reasonText=pickStoryText(story.reason,storySections.reason,story.evidence,getAiSentence(aiHtml,2,`연장근무, 공휴일근무, 평균 연장시간, 위험 인원 지표를 함께 비교하여 업무 집중 또는 관리 확인이 필요한 구간을 파악합니다.`));
  const ai2=pickStoryText(story.trendStory,storySections.trendStory,story.trend,story.trendJudge,getAiSentence(aiHtml,3,`월별 흐름은 누적 데이터가 충분할수록 의미가 커지며, 현재는 기준월의 위험·주의 인원과 연장근무 흐름을 함께 확인하는 단계입니다.`));
  const ai3=pickStoryText(story.causeStory,storySections.causeStory,story.cause,story.summary,story.opinion,getAiSentence(aiHtml,4,`원인 가능성은 특정 개인의 문제로 단정하기보다 업무 집중, 근무 시간 편중, 휴식 부족 가능성을 함께 검토하는 방식이 적절합니다.`));
  const monitoringText=pickStoryText(story.monitoring,storySections.monitoring,isTeamComparisonReport?`상위 위험·주의 팀의 업무량, 구성원 배치, 동일 지표 반복 여부를 다음 월 데이터에서 함께 확인합니다.`:`상위 위험·주의 담당자의 최근 업무 배정과 동일 지표 반복 여부를 다음 월 데이터에서 함께 확인합니다.`);
  const cautionList=Array.isArray(story.cautions)?story.cautions:(Array.isArray(storySections.cautions)?storySections.cautions:[]);
  const cautionText=cautionList.map(v=>String(v||'').trim()).filter(Boolean).join(' · ');
  let conclusion=pickStoryText(story.conclusion,storySections.conclusion,getAiSentence(aiHtml,5,`현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.`));
  if(!String(conclusion).includes('현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.'))conclusion=`${String(conclusion).replace(/\s+$/,'')}
현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.`;
  const issueTitle=pickStoryText(story.issueTitle,storySections.issueTitle,story.mainIssueTitle,isTeamComparisonReport?'팀별 리스크 집중도':'담당자 리스크 흐름');
  const issueDescription=pickStoryText(story.issueDescription,storySections.issueDescription,story.riskFlowStory,storySections.riskFlowStory,story.issueStory,isTeamComparisonReport?`팀별 리스크 집중도는 위험·주의 인원이 특정 팀에 몰려 있는지, 또는 여러 팀에 분산되어 있는지를 확인하기 위한 영역입니다. 현재 기준에서는 팀별 위험·주의 편차를 통해 업무량 배분, 구성원 운영, 관리 우선순위를 검토하는 것이 필요합니다.`:`담당자별 리스크 흐름은 특정 인원이 반복적으로 위험 상태에 머무르는지, 또는 주의 단계에서 위험 단계로 전환되는지를 확인하기 위한 영역입니다. 현재 기준에서는 일부 인원에서 리스크 징후가 관찰되고 있어, 다음 월 데이터에서 동일한 흐름이 반복되는지 확인이 필요합니다.`);
  const causeIntro=pickStoryText(story.causeIntro,storySections.causeIntro,story.causeLead,isTeamComparisonReport?`현재 확인되는 흐름은 특정 팀에 업무 부담이 집중되었거나, 팀별 업무 특성 차이로 인해 위험·주의 지표가 다르게 나타났을 가능성이 있습니다. 다만 단일 월 기준에서는 원인을 확정하기 어렵기 때문에 팀별 업무량, 프로젝트 일정, 연장근무, 휴식 사용 등 세부 지표를 함께 확인하는 방식이 필요합니다.`:`현재 확인되는 흐름은 특정 개인에게 업무 부담이 집중되었거나, 일부 업무가 특정 기간에 몰리면서 리스크 점수가 높아졌을 가능성이 있습니다. 다만 단일 월 기준에서는 원인을 확정하기 어렵기 때문에 연장근무, 휴식 사용, 출퇴근 누락 등 세부 지표를 함께 확인하는 방식이 필요합니다.`);
  const cause1Title=pickStoryText(story.cause1Title,storySections.cause1Title,'가능 원인 1 · 업무 집중');
  const cause1Text=pickStoryText(story.cause1Text,storySections.cause1Text,ai3);
  const cause2Title=pickStoryText(story.cause2Title,storySections.cause2Title,'가능 원인 2 · 휴식 부족');
  const cause2Text=pickStoryText(story.cause2Text,storySections.cause2Text,'휴식 관련 지표가 낮은 상태에서 연장근무가 반복될 경우 위험 상태가 장기화될 수 있습니다. 연차 사용 및 업무 공백 여부를 함께 확인할 필요가 있습니다.');
  const shortTermTitle=pickStoryText(story.shortTermTitle,storySections.shortTermTitle,'단기 관리 방향');
  const shortTermText=pickStoryText(story.shortTermText,storySections.shortTermText,monitoringText);
  const nextMonthTitle=pickStoryText(story.nextMonthTitle,storySections.nextMonthTitle,'다음 월 확인 방향');
  const nextMonthText=pickStoryText(story.nextMonthText,storySections.nextMonthText,'동일 지표가 다음 월에도 반복되는지, 위험 상태가 해소되는지, 신규 위험 인원이 발생하는지를 비교합니다.');
  const summaryOpinion=pickStoryText(story.summaryOpinion,storySections.summaryOpinion,story.overallOpinion,`현재 조직은 전반적으로 안정 상태로 판단되나, 일부 인원에서 리스크 징후가 관찰되고 있어 추가적인 확인이 필요한 상황입니다. 특히 향후 월별 데이터가 누적될 경우, 현재의 리스크가 일시적 변동인지 반복적인 흐름인지 구분할 수 있을 것으로 판단됩니다.`);
  const bottomNote=pickStoryText(story.bottomNote,storySections.bottomNote,'본 보고서는 근태 데이터를 기반으로 작성되었으며, 실제 인력 운영 판단에는 담당자별 업무 상황, 프로젝트 일정, 예외 근무 정보 등을 함께 확인한 후 활용하는 것이 적절합니다.');
  const holidayWorkCount=Number(kpi.holidayWorkCount ?? kpi.holidayWork ?? kpi.holiday ?? kpi.holiday_work_count ?? (Array.isArray(trend.holidayWorkCount)?trend.holidayWorkCount.at(-1):0) ?? 0);
  const defaultBarItems=[
    {label:'연장근무',value:kpi.overtimeCount||0,display:`${fixedNum(kpi.overtimeCount||0,1)}h`,tone:'red'},
    {label:'공휴일근무',value:holidayWorkCount,display:`${fixedNum(holidayWorkCount)}건`,tone:'amber'},
    {label:'평균연장',value:kpi.averageOvertimeHours||0,display:`${fixedNum(kpi.averageOvertimeHours||0,1)}h`,tone:'blue'},
    {label:'위험인원',value:kpi.riskEmployeeCount||risk||0,display:`${fixedNum(kpi.riskEmployeeCount||risk||0)}명`,tone:'red'}
  ];
  const aiRiskIndicators=Array.isArray(story.riskIndicators)?story.riskIndicators:[];
  const barItems=(aiRiskIndicators.length?aiRiskIndicators.map(item=>({
    label:item.label||item.name||'리스크 지표',
    value:Number(item.value||0),
    display:`${fixedNum(item.value||0,item.unit==='h'||item.unit==='시간'?1:0)}${item.unit||''}`,
    tone:item.level==='high'||item.tone==='red'?'red':(item.level==='medium'||item.tone==='amber'?'amber':(item.tone||'blue'))
  })):defaultBarItems).slice(0,4);
  return `<div class="fixedRawText">${esc(cleanAiText(aiHtml))}</div>
  <section class="fixedReportPage">
    ${renderFixedHeader('ATTENDANCE\nREPORT',`${monthText} 근태 리스크 및 운영 분석 보고서`,info)}
    <div class="fixedCoverBand"><div class="fixedCoverPart">1부 · 해당월 현황</div><div class="fixedCoverTitle">${esc(monthKo)} 근태 운영 상태 요약</div><div class="fixedCoverText">해당월 데이터를 기준으로 현재 상태를 설명하고, 관리자가 확인해야 할 핵심 리스크를 정리합니다.</div></div>
    <div class="fixedFrameCards">
      <div class="fixedFrameCard"><div class="k">분석 기준</div><div class="v">${esc(monthKo)} 단일월</div></div>
      <div class="fixedFrameCard"><div class="k">보고 구성</div><div class="v">해당월 현황 + 트렌드</div></div>
      <div class="fixedFrameCard"><div class="k">주요 관점</div><div class="v">${esc(focusTargetText)}</div></div>
      <div class="fixedFrameCard"><div class="k">판단 방식</div><div class="v">추후 확인형</div></div>
    </div>
    <div class="fixedSectionBadge green">1부 · 해당월 현황</div>
    <div class="fixedCurrentTitle">${esc(monthKo)} 현재 상태</div>
    <p class="fixedCurrentLead">${esc(statusText)}</p>
    <div class="fixedMetaCards">
      <div class="fixedMetaCard red"><div class="k">위험 인원</div><div class="v">${fixedNum(risk)}명</div><div class="s">집중 관리 후보</div></div>
      <div class="fixedMetaCard amber"><div class="k">주의 인원</div><div class="v">${fixedNum(warn)}명</div><div class="s">반복 여부 확인</div></div>
      <div class="fixedMetaCard green"><div class="k">정상 인원</div><div class="v">${fixedNum(normal)}명</div><div class="s">전체 ${fixedNum(total)}명 기준</div></div>
      <div class="fixedMetaCard blue"><div class="k">월간 판단</div><div class="v">${risk>0?'부분 집중':'안정'}</div><div class="s">${esc(concentrationNote)}</div></div>
    </div>
    <div class="fixedStoryFlow">
      <div class="fixedStoryBox judge"><div class="fixedStoryLabel">핵심 판단 및 판단 근거</div><div class="fixedStoryText">${esc(`${ai1}

${reasonText}`)}</div></div>
    </div>
    <div class="fixedEvidenceSectionTitle">해당월 리스크 근거</div>
    <div class="fixedGrid2"><div class="fixedEvidence"><div class="fixedEvidenceTitle">리스크 근거 시각화</div>${renderFixedBars(barItems)}</div><div class="fixedEvidence"><div class="fixedEvidenceTitle">${esc(comparison.tableTitle)}</div>${riskTableHtml}</div></div>
    <div class="fixedTailNote">해당월 기준으로는 위험 인원이 전체를 대표한다고 보기 어렵지만, 연장근무와 입력 부수성 지표가 함께 나타나는 경우 실제 업무 집중, 근무시간 편중, 예외 근무 반영 여부를 함께 검토할 필요가 있습니다.</div>
    ${renderFixedFooter()}
  </section>
  <section class="fixedReportPage">
    ${renderFixedHeader('TREND\nANALYSIS',`${monthText} 트렌드 분석`,info)}
    <div class="fixedSectionBadge blue">2부 · 트렌드 분석</div>
    <div class="fixedCurrentTitle">${esc(formatReportMonthLabel(monthText))} 데이터를 기준점으로 보는 트렌드 분석</div>
    <p class="fixedCurrentLead">${esc(ai2)}</p>
    <div class="fixedMetaCards"><div class="fixedMetaCard red"><div class="k">기준월 위험</div><div class="v">${fixedNum(risk)}</div><div class="s">위험 상태</div></div><div class="fixedMetaCard amber"><div class="k">기준월 주의</div><div class="v">${fixedNum(warn)}</div><div class="s">주의 상태</div></div><div class="fixedMetaCard blue"><div class="k">기간 기준</div><div class="v">${fixedNum((trend.months||[]).length)}</div><div class="s">표시 월 수</div></div><div class="fixedMetaCard green"><div class="k">평균 연장</div><div class="v">${fixedNum(sum.averageOvertimeHours||kpi.averageOvertimeHours||0,1)}</div><div class="s">시간/인</div></div></div>
    ${renderFixedTrendChart(trend,info)}
    <div class="fixedGrid3"><div class="fixedMiniNote"><b>현재 판단</b><br>${esc(ai2)}</div><div class="fixedMiniNote"><b>다음 확인</b><br>${esc(isTeamComparisonReport?'동일 팀이 반복적으로 상위권에 남는지 확인합니다.':'동일 인원이 반복적으로 상위권에 남는지 확인합니다.')}</div><div class="fixedMiniNote"><b>관리 포인트</b><br>${esc(monitoringText)}</div></div>
    <div class="fixedCurrentTitle" style="font-size:20px;margin-top:20px">${esc(issueTitle)}</div>
    <p class="fixedCurrentLead">${esc(issueDescription)}</p>
    ${riskTableHtml}
    ${renderFixedFooter()}
  </section>
  <section class="fixedReportPage">
    ${renderFixedHeader('SUMMARY\nOPINION',`${monthText} 원인 가능성 및 종합 의견`,info)}
    <div class="fixedSectionBadge amber">3부 · 종합 검토</div>
    <div class="fixedCurrentTitle">원인 가능성 검토</div>
    <p class="fixedCurrentLead">${esc(causeIntro)}</p>
    <div class="fixedGrid2"><div class="fixedEvidence"><div class="fixedEvidenceTitle">${esc(cause1Title)}</div><div class="fixedBlockText">${esc(cause1Text)}</div></div><div class="fixedEvidence"><div class="fixedEvidenceTitle">${esc(cause2Title)}</div><div class="fixedBlockText">${esc(cause2Text)}</div></div></div>
    <div class="fixedCurrentTitle" style="font-size:18px;margin-top:16px">모니터링 및 검토 방향</div>
    <div class="fixedGrid2"><div class="fixedHighlightBox blue"><div class="fixedBlockTitle">${esc(shortTermTitle)}</div><div class="fixedBlockText">${esc(shortTermText)}</div></div><div class="fixedHighlightBox amber"><div class="fixedBlockTitle">${esc(nextMonthTitle)}</div><div class="fixedBlockText">${esc(nextMonthText)}</div></div></div>
    <div class="fixedCurrentTitle" style="font-size:20px;margin-top:18px">종합 의견</div>
    <p class="fixedCurrentLead">${esc(summaryOpinion)}</p>
    <div class="fixedConclusion"><b>결론</b><br>${esc(conclusion)}</div>
    ${Array.isArray(story.additionalDataNeeded)&&story.additionalDataNeeded.length?`<div class="fixedAdditionalData"><b>추가 확인 필요 데이터</b><br>${story.additionalDataNeeded.map(v=>`• ${esc(v)}`).join('<br>')}</div>`:''}
    <div class="fixedCaution">${esc(bottomNote)}</div>
    ${renderFixedFooter()}
  </section>`;
}
async function requestAiReport(reportType,forceRegenerate,options){
  options=options||{};
  const host=document.getElementById('attendanceReportPreview');
  if(!host)return;
  currentReportKind=reportType;
  currentReportPayload=await buildServerPayload(reportType,{includeAdditionalData:!!options.includeAdditionalData});
  currentReportPayload=enrichAttendanceReportPayloadForAnalysis(currentReportPayload);
  const title=document.getElementById('attendanceReportModalTitle'),desc=document.getElementById('attendanceReportModalDesc'),mode=document.getElementById('attendanceReportModeLabel');
  if(title)title.textContent=reportType==='hiring'?'충원 검토 보고서':'근태 분석 보고서';
  if(desc)desc.textContent=reportType==='hiring'?'충원 입력값과 현재 근태 데이터를 함께 분석해 보고서를 불러오거나 다시 생성합니다.':'월별 진단과 트렌드 데이터를 기반으로 보고서를 불러오거나 다시 생성합니다.';
  if(mode)mode.textContent=reportType==='hiring'?'충원 보고서':'월별+트렌드 보고서';
  host.innerHTML=`<div class="attReportIntro"><p>${options.includeAdditionalData?'추가 확인 자료를 반영해 새 보고서를 다시 생성하는 중입니다.':(forceRegenerate?'새 보고서를 다시 생성하는 중입니다.':'기존 저장 보고서를 불러오는 중입니다.')}</p></div>`;
  setStatus(options.includeAdditionalData?'추가 확인 자료를 포함해 새 보고서를 생성하는 중입니다.':(forceRegenerate?'최신 양식 기준으로 새 보고서를 생성하는 중입니다.':'서버에 저장된 기존 보고서를 조회하는 중입니다. 저장본이 없으면 새 보고서를 생성합니다.'),'warn');
  try{
    const res=await fetch('/api/generate-attendance-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...currentReportPayload,forceRegenerate:!!forceRegenerate})});
    const json=await res.json().catch(()=>({}));
    if(!res.ok||!json.ok)throw new Error(json.error||`HTTP ${res.status}`);
    currentReportStory=json.reportStory||json.story||json.storyJson||json.reportJson||null;
    const reportContent=currentReportStory||json.reportHtml||fallbackReportHtml(currentReportPayload);
    currentReportPayload=enrichAttendanceReportPayloadForAnalysis(currentReportPayload);
    host.innerHTML=renderFixedAttendanceReport(currentReportPayload,reportContent);
    updateFixedReportPageNumbers();
    renderAdditionalDataPanel(currentReportStory);
    setStatus(json.fromCache?'서버에 저장된 보고서를 불러왔습니다.':(options.includeAdditionalData?'추가 확인 자료를 반영한 새 보고서를 생성하고 서버에 저장했습니다.':'새 보고서를 생성하고 서버에 저장했습니다.'),'good');
  }catch(error){
    console.error('[REPORT FAILED]',error);
    currentReportStory=null;
    currentReportPayload=enrichAttendanceReportPayloadForAnalysis(currentReportPayload);
    host.innerHTML=renderFixedAttendanceReport(currentReportPayload,fallbackReportHtml(currentReportPayload));
    updateFixedReportPageNumbers();
    hideAdditionalDataPanel();
    setStatus(`보고서 생성 실패: ${error?.message||error}. 임시 보고서를 표시합니다.`,'bad');
  }
}
function openModal(reportType){
  const modal=document.getElementById('attendanceReportModal');
  if(!modal)return;
  currentReportKind=reportType||'monthly_trend';
  const title=document.getElementById('attendanceReportModalTitle'),desc=document.getElementById('attendanceReportModalDesc'),mode=document.getElementById('attendanceReportModeLabel'),host=document.getElementById('attendanceReportPreview');
  if(title)title.textContent=currentReportKind==='hiring'?'충원 검토 보고서':'근태 분석 보고서';
  if(desc)desc.textContent=currentReportKind==='hiring'?'충원 입력값과 현재 근태 데이터를 함께 분석해 보고서를 불러오거나 다시 생성합니다.':'월별 진단과 트렌드 데이터를 기반으로 보고서를 불러오거나 다시 생성합니다.';
  if(mode)mode.textContent=currentReportKind==='hiring'?'충원 보고서':'월별+트렌드 보고서';
  if(host)host.innerHTML='<div class="attReportIntro"><p>상단 버튼을 선택하세요. 기존 보고서 불러오기는 서버 저장본을 조회하고, 보고서 다시 생성은 최신 양식으로 새 보고서를 생성합니다.</p></div>';
  currentReportStory=null;currentAdditionalDataNeeded=[];hideAdditionalDataPanel();
  setStatus('보고서 요청 대기 중입니다.','');
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
}
function closeModal(){const modal=document.getElementById('attendanceReportModal');if(!modal)return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true');}
function printReport(){const doc=document.getElementById('attendanceReportPreview');if(!doc)return;const win=window.open('','_blank');if(!win){window.print();return;}win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>근태 보고서</title><style>${document.querySelector('style')?.innerHTML||''}body{background:#fff;padding:0}.attReportDoc{box-shadow:none;border:none;border-radius:0;max-width:none}.reportModalTop,.reportSettings,.reportAiStatus,.reportAdditionalPanel{display:none}</style></head><body><div class="attReportDoc">${doc.innerHTML}</div></body></html>`);win.document.close();setTimeout(()=>{win.focus();win.print();},300);}
function empForOption(e){return{employeeNo:e.employee_no||e.employeeNo||e.id||'',id:e.id||e.employee_no||'',name:e.name||'',division:e.department||e.division||'',team:e.team||'',position:e.position||e.grade||'',status:e.status||'',resignationDate:e.resignation_date||e.leaveDate||e.retireDate||'',memo:e.memo||''};}
function refreshHiringEmployeeOptions(){const input=document.getElementById('hiringEmployeeSearch'),sel=document.getElementById('hiringEmployeeSelect'),info=document.getElementById('hiringSelectedInfo');if(!input||!sel)return;const kw=String(input.value||'').trim().toLowerCase();const list=Array.isArray(window.empMaster)?window.empMaster:(typeof empMaster!=='undefined'&&Array.isArray(empMaster)?empMaster:[]);const matched=list.map(empForOption).filter(e=>!kw||String(e.name).toLowerCase().includes(kw)||String(e.employeeNo).toLowerCase().includes(kw)).slice(0,80);sel.innerHTML='<option value="">선택 안 함</option>'+matched.map(e=>`<option value="${encodeURIComponent(JSON.stringify(e))}">${esc(e.name)} (${esc(e.employeeNo||'-')}) · ${esc(e.division||'-')} / ${esc(e.team||'-')}</option>`).join('');if(info)info.textContent=matched.length?`${matched.length}명 검색됨. 대상자를 선택하면 상세 정보가 표시됩니다.`:'검색 결과가 없습니다.';}
function updateHiringSelectedInfo(){const info=document.getElementById('hiringSelectedInfo');if(!info)return;const e=getSelectedHiringEmployee();if(!e){info.textContent='퇴사/이탈 대상자를 선택하면 사번, 본부, 팀, 직급, 퇴사예정일 정보가 표시됩니다.';return;}info.innerHTML=`<b>선택 대상자</b> ${esc(e.name)} · 사번 ${esc(e.employeeNo||'-')} · ${esc(e.division||'-')} / ${esc(e.team||'-')} · 직급 ${esc(e.position||'-')} · 상태 ${esc(e.status||'-')} · 퇴사/예정일 ${esc(e.resignationDate||'-')}`;}
function bindReport(){
  const btn=document.getElementById('attendanceReportOpenBtn');
  if(btn&&btn.dataset.bound!=='Y'){
    btn.dataset.bound='Y';
    btn.addEventListener('click',()=>openModal('monthly_trend'));
  }
  const hbtn=document.getElementById('hiringReportOpenBtn');
  if(hbtn&&hbtn.dataset.bound!=='Y'){
    hbtn.dataset.bound='Y';
    hbtn.addEventListener('click',()=>openModal('hiring'));
  }
  const close=document.getElementById('attendanceReportCloseBtn');
  if(close&&close.dataset.bound!=='Y'){
    close.dataset.bound='Y';
    close.addEventListener('click',closeModal);
  }
  const print=document.getElementById('attendanceReportPrintBtn');
  if(print&&print.dataset.bound!=='Y'){
    print.dataset.bound='Y';
    print.addEventListener('click',printReport);
  }
  const load=document.getElementById('attendanceReportLoadBtn');
  if(load&&load.dataset.bound!=='Y'){
    load.dataset.bound='Y';
    load.addEventListener('click',()=>requestAiReport(currentReportKind,false));
  }
  const regen=document.getElementById('attendanceReportRegenerateBtn');
  if(regen&&regen.dataset.bound!=='Y'){
    regen.dataset.bound='Y';
    regen.addEventListener('click',()=>requestAiReport(currentReportKind,true));
  }
  const modal=document.getElementById('attendanceReportModal');
  if(modal&&modal.dataset.bound!=='Y'){
    modal.dataset.bound='Y';
    modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  }
  const search=document.getElementById('hiringEmployeeSearch');
  if(search&&search.dataset.bound!=='Y'){
    search.dataset.bound='Y';
    search.addEventListener('input',refreshHiringEmployeeOptions);
    refreshHiringEmployeeOptions();
  }
  const sel=document.getElementById('hiringEmployeeSelect');
  if(sel&&sel.dataset.bound!=='Y'){
    sel.dataset.bound='Y';
    sel.addEventListener('change',updateHiringSelectedInfo);
  }
}
document.addEventListener('DOMContentLoaded',bindReport);setTimeout(bindReport,500);window.openAttendanceAiReportModal=openModal;window.renderAttendanceReportPreview=function(){requestAiReport(currentReportKind,false);};
})();
