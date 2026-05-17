/* ===== Trend Analysis: real graph rendering from uploaded attendance data ===== */
function trendClamp(v, min=0, max=100){
  const n = Number(v || 0);
  if(!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function trendRound(v, d=1){ return +Number(v || 0).toFixed(d); }
function trendMonthLabel(ym){ return /^\d{4}-\d{2}$/.test(String(ym||'')) ? `${String(ym).slice(2,4)}.${String(ym).slice(5,7)}` : String(ym||''); }
function trendScopeLabel(){
  const div = String(STATE.division || '전체').trim() || '전체';
  const team = String(STATE.team || '전체').trim() || '전체';
  if(div === '전체' && team === '전체') return '전체 조직';
  if(div !== '전체' && team === '전체') return `${div} 전체`;
  if(div === '전체' && team !== '전체') return `${team}`;
  return `${div} > ${team}`;
}
function trendOrgMatchesRow(row, metaByName){
  const cleanName = normalizeEmployeeName(row?.name || row?.employeeName || '');
  const meta = metaByName.get(cleanName) || {};
  const div = String(meta.division || row?.division || '').trim();
  const team = String(meta.team || row?.team || '').trim();
  return (STATE.division === '전체' || div === STATE.division) && (STATE.team === '전체' || team === STATE.team);
}
function trendDecoratedRows(){
  const metaByName = new Map((empMaster || []).map(e => [normalizeEmployeeName(e.name), e]));
  const rows = getMergedRawAttendanceData()
    .map(row => decorateAttendanceRow(row, metaByName))
    .filter(Boolean)
    .filter(row => !isDisplayExcludedAttendance(row))
    .filter(row => isAttendanceTargetIncludedRow(row, metaByName))
    .filter(row => !(STATE.dashboardExcludeLeave !== false && isAttendanceContinuousLeaveRow(row)))
    .filter(row => trendOrgMatchesRow(row, metaByName));
  return { rows, metaByName };
}
function trendGetAvailableMonths(){
  const { rows } = trendDecoratedRows();
  const set = new Set(rows
    .map(row => String(row?.date || '').trim().slice(0,7))
    .filter(v => /^\d{4}-\d{2}$/.test(v)));
  return [...set].sort((a,b)=>a.localeCompare(b));
}
function trendSelectedEndMonth(months){
  const available = Array.isArray(months) ? months : trendGetAvailableMonths();
  if(!available.length) return '';
  const selected = String(STATE.period || '').trim();
  if(/^\d{4}-\d{2}$/.test(selected) && available.includes(selected)) return selected;
  if(/^\d{4}-\d{2}$/.test(selected)){
    const beforeOrEqual = available.filter(m => m <= selected);
    return beforeOrEqual.length ? beforeOrEqual[beforeOrEqual.length - 1] : available[available.length - 1];
  }
  return available[available.length - 1];
}
function trendLast12Months(){
  const months = trendGetAvailableMonths();
  if(!months.length) return [];
  const end = trendSelectedEndMonth(months);
  if(!end) return [];
  const endY = Number(end.slice(0,4));
  const endM = Number(end.slice(5,7));
  const list=[];
  for(let i=11;i>=0;i--){
    const d = new Date(endY, endM-1-i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if(months.includes(ym)) list.push(ym);
  }
  return list.length ? list : months.filter(m => m <= end).slice(-12);
}
function trendRowsForMonth(ym){
  const metaByName = new Map((empMaster || []).map(e => [normalizeEmployeeName(e.name), e]));
  const rows = getMergedRawAttendanceData()
    .map(row => decorateAttendanceRow(row, metaByName))
    .filter(Boolean)
    .filter(row => String(row.date || '').startsWith(`${ym}-`))
    .filter(row => !isDisplayExcludedAttendance(row))
    .filter(row => isAttendanceTargetIncludedRow(row, metaByName))
    .filter(row => !(STATE.dashboardExcludeLeave !== false && isAttendanceContinuousLeaveRow(row)))
    .filter(row => trendOrgMatchesRow(row, metaByName));
  return { rows, metaByName };
}
function trendEmployeesForMonth(ym){
  // ✅ 월별 추세 안정화
  // 선택된 기준월과 동일한 월도 scopedEmployees() 전역/현재월 캐시를 쓰지 않고,
  // trendRowsForMonth(ym)에서 해당 월 raw 데이터만 다시 집계한다.
  // 이렇게 해야 리스크 변화 흐름의 월별 점수가 선택월 변경에 따라 흔들리지 않는다.
  const { rows, metaByName } = trendRowsForMonth(ym);
  const byName = new Map();
  rows.forEach(row => {
    const cleanName = normalizeEmployeeName(row.name);
    const meta = metaByName.get(cleanName) || {};
    const person = byName.get(cleanName) || {
      id: meta.id || row.id || row.employeeId || cleanName,
      name: cleanName,
      division: meta.division || row.division || '',
      team: meta.team || row.team || '',
      grade: meta.grade || row.grade || '',
      monthlyHours:0, avgDailyHours:0,
      monthlyAdjustedWorkHours:0, avgAdjustedWorkHours:0,
      monthlyBaseWorkHours:0, avgBaseWorkHours:0,
      monthlyHiddenOvertime:0, avgHiddenOvertime:0,
      overtime:0, avgDailyOvertime:0,
      businessTripDays:0, outdoorDays:0,
      leaveUsed:0, workDays:0, issueDays: 0, recoveryIssueDays: 0, conditionalRiskDays: 0,
      risk:0, focusRatio:1
    };
    const totalWork = parseWorkDurationToHours(row.totalWork || row.workHours || row.realWorkHours);
    const erpOT = Number(row.erpActualOvertime || 0) > 0 ? Number(row.erpActualOvertime || 0) : 0;
    const hasActualWork = hasAttendanceActualWork(row);
    const reason = getAttendanceBaseReason(row);
    const analysisFields = getAttendanceAnalysisFields(row);
    const adjustedWork = parseWorkDurationToHours(analysisFields.adjustedWorkDisplay);
    const baseWork = parseWorkDurationToHours(analysisFields.baseWorkDisplay);
    const hiddenOvertime = parseWorkDurationToHours(analysisFields.hiddenOvertimeDisplay);
    if(totalWork !== null) person.monthlyHours += totalWork;
    if(adjustedWork !== null) person.monthlyAdjustedWorkHours += adjustedWork;
    if(baseWork !== null) person.monthlyBaseWorkHours += baseWork;
    if(hiddenOvertime !== null) person.monthlyHiddenOvertime += hiddenOvertime;
    person.overtime += erpOT;
    const countsAsWork = hasActualWork || adjustedWork !== null || baseWork !== null || erpOT > 0;
    if(countsAsWork) person.workDays += 1;
    if(isVacationReason(reason)) person.leaveUsed += isHalfDayVacationReason(reason) ? 0.5 : 1;
    const rawReasonText = [row.erpReason,row.reason,row.attendanceType,row.statusReason,reason].filter(Boolean).join(' ');
    const normalizedReason = String(rawReasonText || '').replace(/<br\s*\/?>/gi,' ').replace(/\([^)]*\)/g,' ').replace(/\s+/g,'').toLowerCase();
    if(normalizedReason.includes('출장')) person.businessTripDays += 1;
    if(normalizedReason.includes('오전외근')) person.outdoorDays += 0.5;
    if(normalizedReason.includes('오후외근')) person.outdoorDays += 0.5;
    if(normalizedReason.includes('외근') && !normalizedReason.includes('오전외근') && !normalizedReason.includes('오후외근')) person.outdoorDays += 1;
    const isRiskIssue = isRiskRelatedIssueReason(row, reason);
    if(row.bucket === '문제' && isRiskIssue){ person.risk += 20; person.issueDays += 1; if(isRecoveryRelatedIssueReason(reason)) person.recoveryIssueDays = Number(person.recoveryIssueDays || 0) + 1; }
    else if(row.bucket === '주의' && isRiskIssue){ person.risk += 8; person.issueDays += 1; if(isRecoveryRelatedIssueReason(reason)) person.recoveryIssueDays = Number(person.recoveryIssueDays || 0) + 1; }
    // 개인 위험지수 추가 가산 정리
    // 직접 가산: 결근, 실제 연장근무만 반영한다.
    // 조건부: 외근/오전외근/오후외근/조퇴는 연장·숨은초과·총부하 동반 시 약하게만 반영한다.
    if(reason.includes('결근')) person.risk += 20;
    if(erpOT >= 2) person.risk += 6;
    if(erpOT >= 4) person.risk += 8;
    const conditionalRiskWeight = getConditionalPersonalRiskWeight(row, reason);
    if(conditionalRiskWeight > 0){
      person.conditionalRiskDays = Number(person.conditionalRiskDays || 0) + conditionalRiskWeight;
      person.risk += 3;
    }
    byName.set(cleanName, person);
  });
  const base = [...byName.values()].map(e => {
    const days = Math.max(1, Number(e.workDays || 0));
    const avgDailyHours = Number(e.monthlyAdjustedWorkHours || e.monthlyHours || 0) / days;
    const avgAdjustedWorkHours = Number(e.monthlyAdjustedWorkHours || 0) / days;
    const avgBaseWorkHours = Number(e.monthlyBaseWorkHours || 0) / days;
    const avgHiddenOvertime = Number(e.monthlyHiddenOvertime || 0) / days;
    const avgDailyOvertime = Number(e.overtime || 0) / days;
    const avgTotalLoad = (Number(e.monthlyBaseWorkHours || 0) + Number(e.overtime || 0) + Number(e.monthlyHiddenOvertime || 0)) / days;
    const focusRatio = Number(((avgBaseWorkHours + avgDailyOvertime + avgHiddenOvertime) / ANALYSIS_FULL_DAY_HOURS).toFixed(1));
    const adjustedRisk = Math.min(100, Math.round(Number(e.risk || 0) + Math.min(8, Number(e.conditionalRiskDays || 0) * 2) + Math.max(0,(focusRatio - 1.1) * 10) + (avgHiddenOvertime >= 0.5 ? 4 : 0) + (Number(e.leaveUsed || 0) === 0 && days >= 10 ? 8 : 0)));
    return {
      ...e,
      monthlyHours:trendRound(e.monthlyAdjustedWorkHours || e.monthlyHours,1), avgDailyHours:trendRound(avgDailyHours,1),
      monthlyAdjustedWorkHours:trendRound(e.monthlyAdjustedWorkHours,1), avgAdjustedWorkHours:trendRound(avgAdjustedWorkHours,1),
      monthlyBaseWorkHours:trendRound(e.monthlyBaseWorkHours,1), avgBaseWorkHours:trendRound(avgBaseWorkHours,1),
      monthlyHiddenOvertime:trendRound(e.monthlyHiddenOvertime,1), avgHiddenOvertime:trendRound(avgHiddenOvertime,1),
      overtime:trendRound(e.overtime,1), avgDailyOvertime:trendRound(avgDailyOvertime,1), avgTotalLoad:trendRound(avgTotalLoad,1),
      focusRatio, risk:adjustedRisk,
      scopedMonthlyHours:trendRound(e.monthlyAdjustedWorkHours || e.monthlyHours,1),
      scopedMonthlyOvertime:trendRound(e.overtime,1), scopedDailyOvertime:trendRound(avgDailyOvertime,1),
      scopedDailyHours:trendRound(avgDailyHours,1), scopedDailyBaseWorkHours:trendRound(avgBaseWorkHours,1),
      scopedDailyHiddenOvertime:trendRound(avgHiddenOvertime,1), scopedDailyTotalLoad:trendRound(avgTotalLoad,1),
      scopedIssueDays:Number(e.issueDays || 0), scopedRecoveryIssueDays:Number(e.recoveryIssueDays || 0), scopedRisk:adjustedRisk
    };
  });
  return applyAttritionRiskModel(base);
}

function trendDeepRadarMetricsForMonth(ym, people){
  const scoped = Array.isArray(people) ? people.filter(Boolean) : [];
  if(!scoped.length){
    return {
      fatigueRisk:0,
      workConcentrationRisk:0,
      gradeImbalanceRisk:0,
      attritionRisk:0,
      leaveDefRisk:0
    };
  }

  const workConMetrics = getWorkConcentrationMetrics(scoped);
  const concentration = Math.min(100, Math.round(Number(workConMetrics.workConcentrationRate || 0)));

  const gradeMetrics = getGradeImbalanceMetrics(scoped);
  const gradeImbalance = Math.min(100, Math.round(Number(gradeMetrics.gradeImbalanceScore || 0)));

  const scopedRiskValues = scoped
    .map(x => Number(x.scopedRisk || 0))
    .filter(v => Number.isFinite(v))
    .sort((a,b)=>b-a);
  const attritionAvg = scopedRiskValues.length
    ? scopedRiskValues.reduce((sum, value) => sum + value, 0) / scopedRiskValues.length
    : 0;
  const topRiskCount = Math.max(1, Math.ceil(scopedRiskValues.length * 0.2));
  const topRiskAvg = scopedRiskValues.length
    ? scopedRiskValues.slice(0, topRiskCount).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(topRiskCount, scopedRiskValues.length))
    : 0;
  const riskRatio = scopedRiskValues.length
    ? (scopedRiskValues.filter(v => v >= 75).length / scopedRiskValues.length) * 100
    : 0;
  const attrition = Math.min(100, Math.round(
    (attritionAvg * 0.70) +
    (topRiskAvg * 0.20) +
    (riskRatio * 0.10)
  ));

  const selectedYmForDeepRadar = String(getSelectedAttendancePeriodMeta()?.value || STATE.period || '').trim();
  const trendLeavePeriodItems = (String(ym || '').trim() === selectedYmForDeepRadar && typeof periodMonths === 'function')
    ? periodMonths()
    : [{ month: `${Number(String(ym || selectedYmForDeepRadar || '').slice(5,7)) || 0}월` }];
  const expectedLeaveMap = typeof buildExpectedLeaveMapForPeriod === 'function'
    ? buildExpectedLeaveMapForPeriod(trendLeavePeriodItems, scoped)
    : new Map();
  const expectedLeaveTotal = scoped.reduce((sum, e) => sum + Number(expectedLeaveMap.get(normalizeEmployeeName(e.name))?.expectedLeave || 0), 0);
  const actualLeaveTotal = scoped.reduce((sum, e) => sum + Number(e.leaveUsed || 0), 0);
  const leaveDef = expectedLeaveTotal > 0
    ? Math.min(100, Math.max(0, Math.round((1 - (actualLeaveTotal / expectedLeaveTotal)) * 100)))
    : 0;

  const avgDailyTotalLoad = scoped.length
    ? scoped.reduce((sum, person) => {
        const totalLoad = Number(person.scopedDailyTotalLoad || (
          Number(person.scopedDailyBaseWorkHours || 0) +
          Number(person.scopedDailyOvertime || 0) +
          Number(person.scopedDailyHiddenOvertime || 0)
        ) || 0);
        return sum + totalLoad;
      }, 0) / scoped.length
    : 0;
  const avgHiddenDaily = scoped.length
    ? scoped.reduce((sum, person) => sum + Number(person.scopedDailyHiddenOvertime || person.avgHiddenOvertime || 0), 0) / scoped.length
    : 0;
  const issueRatio = scoped.length
    ? Math.min(100, (scoped.filter(person => Number(person.scopedIssueDays || person.issueDays || 0) >= 4).length / scoped.length) * 100)
    : 0;
  const recoveryPoorRatio = scoped.length
    ? Math.min(100, (scoped.filter(person => Number(person.leaveUsed || 0) <= 0.5).length / scoped.length) * 100)
    : 0;

  const totalLoadScore =
    avgDailyTotalLoad >= 10.5 ? 100 :
    avgDailyTotalLoad >= 9.5 ? 75 :
    avgDailyTotalLoad >= 8.5 ? 35 :
    avgDailyTotalLoad >= 7.0 ? 10 :
    avgDailyTotalLoad > 0 ? 5 : 0;
  const hiddenScore =
    avgHiddenDaily >= 1.0 ? 100 :
    avgHiddenDaily >= 0.5 ? 75 :
    avgHiddenDaily > 0 ? 40 : 0;
  const totalOT = scoped.reduce((s,p)=>s+Number(p.scopedMonthlyOvertime || p.overtime || 0),0);
  const avgOTPerPerson = totalOT / Math.max(1, scoped.length);
  const otScore = Math.min(100, Math.max(0, (avgOTPerPerson / 20) * 100));

  let fatigueWeights = { total:0.35, hidden:0.20, issue:0.15, recovery:0.15, ot:0.15 };
  if(STATE.fatigueMode === 'concentration'){
    fatigueWeights = { total:0.25, hidden:0.15, issue:0.30, recovery:0.10, ot:0.20 };
  }else if(STATE.fatigueMode === 'leave'){
    fatigueWeights = { total:0.20, hidden:0.15, issue:0.10, recovery:0.35, ot:0.20 };
  }

  const fatigue = Math.min(100, Math.round(
    (totalLoadScore * fatigueWeights.total) +
    (hiddenScore * fatigueWeights.hidden) +
    (issueRatio * fatigueWeights.issue) +
    (recoveryPoorRatio * fatigueWeights.recovery) +
    (otScore * fatigueWeights.ot)
  ));

  return {
    fatigueRisk:fatigue,
    workConcentrationRisk:concentration,
    gradeImbalanceRisk:gradeImbalance,
    attritionRisk:attrition,
    leaveDefRisk:leaveDef
  };
}

function trendMetricsForMonth(ym){
  // 선택월은 심층분석 레이더와 동일한 현재 월 최종 집계(scopedEmployees)를 그대로 사용한다.
  // 그 외 월은 월별 trend 집계로 계산하여 비교 흐름을 유지한다.
  const selectedYmForDeepRadar = String(getSelectedAttendancePeriodMeta()?.value || STATE.period || '').trim();
  const people = (String(ym || '').trim() === selectedYmForDeepRadar && typeof scopedEmployees === 'function')
    ? scopedEmployees()
    : trendEmployeesForMonth(ym);
  const count = people.length;
  if(!count){
    return { ym, label:trendMonthLabel(ym), employeeCount:0, avgOvertimePerPerson:0, highRisk:0, leaveZero:0, fatigueRisk:0, workConcentrationRisk:0, gradeImbalanceRisk:0, attritionRisk:0, leaveDefRisk:0, overtimeRisk:0, mobilityRisk:0, operationalRisk:0, leaveRisk:0, holidayWorkCount:0 };
  }
  const holidayWorkCount = (() => {
    try {
      const monthRows = trendRowsForMonth(ym)?.rows || [];
      return monthRows.filter(row => {
        const baseReason = getAttendanceBaseReason(row);
        const rawText = [row.erpReason,row.reason,row.attendanceType,row.statusReason,baseReason].filter(Boolean).join(' ');
        const erpOT = Number(row.erpActualOvertime || 0);
        return /공휴일근무|휴일근무/.test(rawText) || ((/공휴일|휴일|휴무일/.test(rawText)) && erpOT > 0);
      }).length;
    } catch(e) {
      console.warn('holidayWorkCount 계산 실패', e);
      return 0;
    }
  })();
  const totalOT = people.reduce((s,p)=>s+Number(p.scopedMonthlyOvertime || p.overtime || 0),0);
  const avgOvertimePerPerson = totalOT / Math.max(1,count);
  const highRisk = people.filter(p => Number(p.scopedRisk || p.risk || 0) >= 75).length;
  const leaveZero = people.filter(p => Number(p.leaveUsed || 0) === 0).length;
  const deepRadar = trendDeepRadarMetricsForMonth(ym, people);
  const fatigueRisk = trendClamp(deepRadar.fatigueRisk);
  const workConcentrationRisk = trendClamp(deepRadar.workConcentrationRisk);
  const gradeImbalanceRisk = trendClamp(deepRadar.gradeImbalanceRisk);
  const attritionRisk = trendClamp(deepRadar.attritionRisk);
  const leaveDefRisk = trendClamp(deepRadar.leaveDefRisk);

  // 기존 트렌드 필드명은 다른 차트/요약과의 호환성을 위해 유지하되,
  // 값은 심층분석 레이더의 5개 지표 체계와 동일하게 맞춥니다.
  const overtimeRisk = fatigueRisk;
  const mobilityRisk = gradeImbalanceRisk;
  const operationalRisk = attritionRisk;
  const leaveRisk = leaveDefRisk;

  return {
    ym, label:trendMonthLabel(ym), employeeCount:count,
    avgOvertimePerPerson:trendRound(avgOvertimePerPerson,1), highRisk, leaveZero,
    fatigueRisk, workConcentrationRisk, gradeImbalanceRisk, attritionRisk, leaveDefRisk,
    overtimeRisk, mobilityRisk, operationalRisk, leaveRisk,
    holidayWorkCount
  };
}
function trendPeriodMode(){
  if(STATE.trendPeriodMode !== 'rolling' && STATE.trendPeriodMode !== 'year') STATE.trendPeriodMode = 'year';
  return STATE.trendPeriodMode;
}
let __trendPeriodRenderTimer = null;
function trendSetPeriodMode(mode){
  const nextMode = mode === 'rolling' ? 'rolling' : 'year';
  if(STATE.trendPeriodMode === nextMode){
    trendSyncPeriodModeButtons();
    return;
  }
  STATE.trendPeriodMode = nextMode;
  trendSyncPeriodModeButtons();
  if(__trendPeriodRenderTimer) cancelAnimationFrame(__trendPeriodRenderTimer);
  __trendPeriodRenderTimer = requestAnimationFrame(() => {
    __trendPeriodRenderTimer = null;
    renderTrendAnalysis();
  });
}
function trendSyncPeriodModeButtons(){
  const mode = trendPeriodMode();
  document.querySelectorAll('[data-trend-period-mode]').forEach(btn => {
    const active = btn.getAttribute('data-trend-period-mode') === mode;
    btn.classList.toggle('active', active);
  });
}
function trendBindPeriodModeButtons(){
  document.querySelectorAll('[data-trend-period-mode]').forEach(btn => {
    if(btn.dataset.bound === 'Y') return;
    btn.addEventListener('click', () => trendSetPeriodMode(btn.getAttribute('data-trend-period-mode')));
    btn.dataset.bound = 'Y';
  });
  trendSyncPeriodModeButtons();
}
function trendUpdatePeriodControlVisibility(){
  const isTrend = !!document.querySelector('.mainTab[data-main="trend-analysis"]')?.classList.contains('active');
  ['trendPeriodControl','stickyTrendPeriodControl'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle('show', isTrend);
    el.setAttribute('aria-hidden', isTrend ? 'false' : 'true');
  });
}
function trendYearMonths(){
  const months = trendGetAvailableMonths();
  const selected = String(STATE.period || '').trim();
  const base = /^\d{4}-\d{2}$/.test(selected) ? selected : trendSelectedEndMonth(months);
  if(!base) return [];
  const year = Number(base.slice(0,4));
  const availableSet = new Set(months);
  const list = [];
  for(let m=1;m<=12;m++){
    const ym = `${year}-${String(m).padStart(2,'0')}`;
    if(availableSet.has(ym)) list.push(ym);
  }
  return list;
}
function trendPeriodMonths(){
  return trendPeriodMode() === 'rolling' ? trendLast12Months() : trendYearMonths();
}
function trendDisplayMonths(){
  const mode = trendPeriodMode();
  const months = trendGetAvailableMonths();
  const selected = String(STATE.period || '').trim();
  const base = /^\d{4}-\d{2}$/.test(selected) ? selected : trendSelectedEndMonth(months);
  if(!base) return [];
  if(mode === 'rolling'){
    const endY = Number(base.slice(0,4));
    const endM = Number(base.slice(5,7));
    const list=[];
    for(let i=11;i>=0;i--){
      const d = new Date(endY, endM-1-i, 1);
      list.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return list;
  }
  const year = Number(base.slice(0,4));
  return Array.from({length:12}, (_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
}
function trendBuildData(){
  const availableSet = new Set(trendGetAvailableMonths());
  return trendDisplayMonths().map(ym => {
    const hasData = availableSet.has(ym);
    if(hasData){
      const metric = trendMetricsForMonth(ym);
      metric.__hasData = true;
      return metric;
    }
    return {
      ym, label:trendMonthLabel(ym), employeeCount:0, __hasData:false,
      avgOvertimePerPerson:null, highRisk:null, leaveZero:null,
      fatigueRisk:null, workConcentrationRisk:null, gradeImbalanceRisk:null, attritionRisk:null, leaveDefRisk:null, overtimeRisk:null, mobilityRisk:null, operationalRisk:null, leaveRisk:null
    };
  });
}
function trendColor(idx){ return ['#2563eb','#64748b','#f59e0b','#0f766e','#7c3aed','#ef4444'][idx % 6]; }
function trendValueExtent(data, keys){
  const nums = data.flatMap(d => keys.map(k => Number(d[k] || 0))).filter(Number.isFinite);
  const max = Math.max(1, ...nums);
  return Math.ceil(max * 1.15);
}
function trendLineSVG(el, data, series, options={}){
  if(!el) return;
  if(!data || !data.length){ renderEmptyChart(el, '업로드된 월별 데이터가 없습니다.'); return; }
  const validRows = data.filter(d => d && d.__hasData !== false);
  if(!validRows.length){ renderEmptyChart(el, '표시할 월별 데이터가 없습니다.'); return; }
  const width = el.clientWidth || 900, height = el.clientHeight || 360;
  const margin = {top:28,right:28,bottom:44,left:54};
  const pw = width - margin.left - margin.right, ph = height - margin.top - margin.bottom;
  const keys = series.map(s=>s.key);
  const nums = validRows.flatMap(d => keys.map(k => Number(d[k]))).filter(Number.isFinite);
  const maxV = options.maxValue || Math.ceil(Math.max(1, ...nums) * 1.15);
  const denom = Math.max(1, data.length - 1);
  const x = i => margin.left + (data.length === 1 ? pw/2 : (pw * i / denom));
  const y = v => margin.top + ph - (Number(v || 0) / maxV) * ph;
  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>`;
  for(let t=0;t<=4;t++){
    const yy = margin.top + ph * t / 4;
    const val = Math.round(maxV * (1 - t/4));
    svg += `<line x1="${margin.left}" y1="${yy}" x2="${width-margin.right}" y2="${yy}" stroke="#e2e8f0"/>`;
    svg += `<text x="${margin.left-10}" y="${yy+4}" text-anchor="end" style="font-size:11px;fill:#64748b">${val}</text>`;
  }
  data.forEach((d,i)=>{
    svg += `<text x="${x(i)}" y="${height-16}" text-anchor="middle" style="font-size:12px;fill:#64748b;font-weight:700">${d.label}</text>`;
  });
  series.forEach((s, si)=>{
    const color = s.color || trendColor(si);
    let segment = [];
    const flushSegment = () => {
      if(segment.length >= 2){
        svg += `<polyline points="${segment.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      segment = [];
    };
    data.forEach((d,i)=>{
      const val = Number(d[s.key]);
      if(d.__hasData === false || !Number.isFinite(val)){
        flushSegment();
        return;
      }
      segment.push(`${x(i)},${y(val)}`);
    });
    flushSegment();
    data.forEach((d,i)=>{
      const val = Number(d[s.key]);
      if(d.__hasData === false || !Number.isFinite(val)) return;
      svg += `<circle cx="${x(i)}" cy="${y(val)}" r="4" fill="${color}"/>`;
      const visiblePointCount = validRows.length;
      if(visiblePointCount <= 6){ svg += `<text x="${x(i)}" y="${y(val)-9}" text-anchor="middle" style="font-size:11px;fill:${color};font-weight:800">${val}${s.suffix || ''}</text>`; }
    });
  });
  svg += `</svg>`;
  el.innerHTML = svg;
}
function trendRadarMultiSVG(el, labels, datasets){
  if(!el) return;
  if(!datasets || !datasets.length){ renderEmptyChart(el, '체크박스로 표시할 기준을 선택하세요.'); return; }
  const width = el.clientWidth || 620, height = el.clientHeight || 420;
  const cx = width/2, cy = height/2 + 8, r = Math.min(width, height) * 0.31;
  const n = labels.length;
  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
  for(let lv=1; lv<=5; lv++){
    const rr = r * lv / 5;
    const pts=[];
    for(let i=0;i<n;i++){ const a=-Math.PI/2+Math.PI*2*i/n; pts.push(`${cx+rr*Math.cos(a)},${cy+rr*Math.sin(a)}`); }
    svg += `<polygon points="${pts.join(' ')}" fill="none" stroke="#e2e8f0"/>`;
  }
  labels.forEach((label,i)=>{
    const a=-Math.PI/2+Math.PI*2*i/n;
    svg += `<line x1="${cx}" y1="${cy}" x2="${cx+r*Math.cos(a)}" y2="${cy+r*Math.sin(a)}" stroke="#e2e8f0"/>`;
    svg += `<text x="${cx+(r+34)*Math.cos(a)}" y="${cy+(r+34)*Math.sin(a)+4}" text-anchor="middle" style="font-size:12px;fill:#475569;font-weight:800">${label}</text>`;
  });
  datasets.forEach((ds, idx)=>{
    const color = ds.color || trendColor(idx);
    const pts = ds.values.map((v,i)=>{
      const a=-Math.PI/2+Math.PI*2*i/n; const rr = r * trendClamp(v)/100;
      return `${cx+rr*Math.cos(a)},${cy+rr*Math.sin(a)}`;
    }).join(' ');
    svg += `<polygon points="${pts}" fill="${color}22" stroke="${color}" stroke-width="${idx===0?3:2}" stroke-dasharray="${ds.dash || ''}"/>`;
    ds.values.forEach((v,i)=>{ const a=-Math.PI/2+Math.PI*2*i/n; const rr=r*trendClamp(v)/100; svg += `<circle cx="${cx+rr*Math.cos(a)}" cy="${cy+rr*Math.sin(a)}" r="3" fill="${color}"/>`; });
  });
  let lx = 18, ly = 20;
  datasets.forEach((ds,idx)=>{
    const color = ds.color || trendColor(idx);
    svg += `<rect x="${lx}" y="${ly-10}" width="10" height="10" rx="3" fill="${color}"/><text x="${lx+16}" y="${ly}" style="font-size:12px;fill:#475569;font-weight:800">${ds.name}</text>`;
    ly += 20;
  });
  svg += `</svg>`;
  el.innerHTML = svg;
}
function trendAverageMetrics(data, count){
  const slice = data.slice(-count);
  const avgKey = key => slice.length ? slice.reduce((s,d)=>s+Number(d[key]||0),0)/slice.length : 0;
  return {
    label:`${count}개월 평균`,
    fatigueRisk:Math.round(avgKey('fatigueRisk')),
    workConcentrationRisk:Math.round(avgKey('workConcentrationRisk')),
    gradeImbalanceRisk:Math.round(avgKey('gradeImbalanceRisk')),
    attritionRisk:Math.round(avgKey('attritionRisk')),
    leaveDefRisk:Math.round(avgKey('leaveDefRisk')),
    // 호환 필드
    overtimeRisk:Math.round(avgKey('fatigueRisk')),
    mobilityRisk:Math.round(avgKey('gradeImbalanceRisk')),
    operationalRisk:Math.round(avgKey('attritionRisk')),
    leaveRisk:Math.round(avgKey('leaveDefRisk'))
  };
}
function trendRadarOptionData(data){
  if(!data.length) return [];
  const current = data[data.length-1];
  const prev = data.length >= 2 ? data[data.length-2] : null;
  const opts = [{id:'current', name:`현재월 ${current.label}`, source:current, color:'#2563eb'}];
  if(prev) opts.push({id:'prev', name:`전월 ${prev.label}`, source:prev, color:'#64748b'});
  opts.push({id:'avg3', name:'3개월 평균', source:trendAverageMetrics(data,3), color:'#f59e0b', dash:'4 4'});
  opts.push({id:'avg6', name:'6개월 평균', source:trendAverageMetrics(data,6), color:'#0f766e', dash:'4 4'});
  opts.push({id:'avg12', name:'12개월 평균', source:trendAverageMetrics(data,12), color:'#7c3aed', dash:'4 4'});
  return opts;
}
function trendSelectedRadarIds(){
  if(!Array.isArray(STATE.trendRadarSelected) || !STATE.trendRadarSelected.length){
    STATE.trendRadarSelected = ['current','avg12'];
  }
  return STATE.trendRadarSelected;
}
function renderTrendRadar(data){
  const options = trendRadarOptionData(data);
  const host = $('#trendRadarChecks');
  const selected = new Set(trendSelectedRadarIds());
  if(host){
    host.innerHTML = options.map(opt => `<label class="${selected.has(opt.id)?'active':''}"><input type="checkbox" data-trend-radar="${opt.id}" ${selected.has(opt.id)?'checked':''}>${opt.name}</label>`).join('');
    host.querySelectorAll('[data-trend-radar]').forEach(input => {
      input.onchange = () => {
        const checked = [...host.querySelectorAll('[data-trend-radar]:checked')].map(x=>x.getAttribute('data-trend-radar'));
        if(checked.length > 4){ input.checked = false; alert('레이더 비교는 최대 4개까지 선택 가능합니다.'); return; }
        if(!checked.length){ input.checked = true; return; }
        STATE.trendRadarSelected = checked;
        renderTrendAnalysis();
      };
    });
  }
  const labels = ['피로도','업무집중','직급불균형','위험지수','연차부족'];
  const keys = ['fatigueRisk','workConcentrationRisk','gradeImbalanceRisk','attritionRisk','leaveDefRisk'];
  const datasets = options.filter(opt => selected.has(opt.id)).map(opt => ({
    name:opt.name, color:opt.color, dash:opt.dash,
    values:keys.map(k=>Number(opt.source[k] || 0))
  }));
  trendRadarMultiSVG($('#trendRadarChart'), labels, datasets);
}
function trendRiskState(score){
  const n = Number(score || 0);
  if(n >= 75) return { label:'위험', cls:'risk' };
  if(n >= 50) return { label:'주의', cls:'warn' };
  return { label:'정상', cls:'normal' };
}
function trendPersonRiskMapForMonth(ym){
  const map = new Map();
  if(!/^\d{4}-\d{2}$/.test(String(ym||''))) return map;
  const people = trendEmployeesForMonth(ym) || [];
  people.forEach(p => {
    const name = normalizeEmployeeName(p.name || p.employeeName || '');
    if(!name) return;
    const score = Number(p.scopedRisk ?? p.risk ?? p.riskScore ?? 0);
    map.set(name, { name, score: Number.isFinite(score) ? Math.round(score) : 0 });
  });
  return map;
}
function trendPersonFlowInfo(name, monthMaps, displayMonths, selected){
  const scored = displayMonths
    .map(ym => {
      const item = monthMaps.get(ym)?.get(name);
      if(!item) return null;
      const score = Number(item.score || 0);
      return { ym, score, state: trendRiskState(score) };
    })
    .filter(Boolean);
  if(!scored.length) return { label:'흐름 데이터 없음', cls:'normal' };
  const selectedItem = scored.find(x => x.ym === selected) || scored[scored.length - 1];
  const last3 = scored.filter(x => x.ym <= selected).slice(-3);
  const last2 = scored.filter(x => x.ym <= selected).slice(-2);
  if(last3.length >= 3 && last3.every(x => x.score >= 75)) return { label:'위험 지속', cls:'risk' };
  if(last3.length >= 3 && last3.every(x => x.score >= 50 && x.score < 75)) return { label:'주의 지속', cls:'warn' };
  if(last3.length >= 3 && last3.every(x => x.score < 50)) return { label:'정상 유지', cls:'normal' };
  if(last2.length >= 2){
    const prev = last2[0];
    const curr = last2[1];
    const prevState = trendRiskState(prev.score);
    const currState = trendRiskState(curr.score);
    if(curr.score - prev.score >= 10) return { label:`${prevState.label} → ${currState.label} 악화`, cls:'up' };
    if(prev.score - curr.score >= 10) return { label:`${prevState.label} → ${currState.label} 개선`, cls:'down' };
    if(prevState.label !== currState.label){
      if(curr.score > prev.score) return { label:`${prevState.label} → ${currState.label}`, cls:'up' };
      return { label:`${prevState.label} → ${currState.label}`, cls:'down' };
    }
  }
  return { label:`${selectedItem.state.label} ${selectedItem.score}점`, cls:selectedItem.state.cls };
}
function trendRankDeltaInfo(name, selected, displayMonths){
  const currentMap = trendPersonRiskMapForMonth(selected);
  const currentList = [...currentMap.values()].sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name,'ko'));
  const currentRank = currentList.findIndex(x => x.name === name) + 1;
  const prevYm = [...displayMonths].filter(ym => ym < selected && trendGetAvailableMonths().includes(ym)).pop();
  if(!prevYm || !currentRank) return { label:'순위 비교 없음', cls:'none' };
  const prevMap = trendPersonRiskMapForMonth(prevYm);
  const prevList = [...prevMap.values()].sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name,'ko'));
  const prevRank = prevList.findIndex(x => x.name === name) + 1;
  if(!prevRank) return { label:'신규 진입', cls:'up' };
  const delta = prevRank - currentRank;
  if(delta > 0) return { label:`전월 대비 +${delta}위 ↑`, cls:'up' };
  if(delta < 0) return { label:`전월 대비 ${delta}위 ↓`, cls:'down' };
  return { label:'순위 변동 없음', cls:'same' };
}
function renderTrendTopPeople(){
  const host = document.getElementById('trendTopPeopleTable');
  if(!host) return;
  const available = trendGetAvailableMonths();
  const selected = trendSelectedEndMonth(available);
  const displayMonths = trendDisplayMonths();
  if(!selected || !displayMonths.length){
    host.innerHTML = '<div class="trendTopNote">표시할 월별 담당자 데이터가 없습니다.</div>';
    return;
  }

  // 월별 담당자 위험점수는 한 번만 계산해 재사용한다. (최근 12개월 전환 시 지연 방지)
  const selectedMap = trendPersonRiskMapForMonth(selected);
  const monthMaps = new Map();
  displayMonths.forEach(ym => {
    monthMaps.set(ym, ym === selected ? selectedMap : trendPersonRiskMapForMonth(ym));
  });

  const people = [...selectedMap.values()].sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name,'ko'));
  if(!people.length){
    host.innerHTML = '<div class="trendTopNote">선택 기준월에 표시할 담당자 데이터가 없습니다.</div>';
    return;
  }

  const prevYm = [...displayMonths].filter(ym => ym < selected && available.includes(ym)).pop();
  const prevMap = prevYm ? (monthMaps.get(prevYm) || new Map()) : new Map();
  const prevRanks = new Map([...prevMap.values()]
    .sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name,'ko'))
    .map((p,idx)=>[p.name, idx+1]));

  const rankDeltaFor = (person, idx) => {
    const currentRank = idx + 1;
    if(!prevYm) return { label:'순위 비교 없음', cls:'none' };
    const prevRank = prevRanks.get(person.name);
    if(!prevRank) return { label:'신규 진입', cls:'up' };
    const delta = prevRank - currentRank;
    if(delta > 0) return { label:`전월 대비 +${delta}위 ↑`, cls:'up' };
    if(delta < 0) return { label:`전월 대비 ${delta}위 ↓`, cls:'down' };
    return { label:'순위 변동 없음', cls:'same' };
  };

  const modeLabel = trendPeriodMode() === 'rolling' ? '최근 12개월' : '해당년도';
  const headerMonths = displayMonths.map(ym => `<th class="${ym===selected?'trendSelectedMonth':''}">${trendMonthLabel(ym)}</th>`).join('');
  const rows = people.map((person, idx) => {
    const flow = trendPersonFlowInfo(person.name, monthMaps, displayMonths, selected);
    const rankDelta = rankDeltaFor(person, idx);
    const cells = displayMonths.map(ym => {
      const item = monthMaps.get(ym)?.get(person.name);
      if(!item) return `<td class="${ym===selected?'trendSelectedMonth':''}"><span class="trendStateCell empty"><span class="state">-</span><span class="score">-</span></span></td>`;
      const st = trendRiskState(item.score);
      return `<td class="${ym===selected?'trendSelectedMonth':''}"><span class="trendStateCell ${st.cls}"><span class="state">${st.label}</span><span class="score">${item.score}</span></span></td>`;
    }).join('');
    return `<tr><td><div class="trendTopPerson"><span class="trendTopRank">${idx+1}</span><div class="trendTopPersonMain"><div class="trendTopPersonHead"><strong>${person.name}</strong><span class="trendRankDelta ${rankDelta.cls}">${rankDelta.label}</span></div><span class="trendTopFlow ${flow.cls}">${flow.label}</span></div></div></td>${cells}</tr>`;
  }).join('');
  host.innerHTML = `
    <div class="trendTopPeopleTableWrap">
      <table class="trendTopPeopleTable">
        <thead><tr><th>담당자</th>${headerMonths}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="trendTopLegend">
      <span><i class="dot" style="background:#ef4444"></i>위험 75점 이상</span>
      <span><i class="dot" style="background:#f59e0b"></i>주의 50~74점</span>
      <span><i class="dot" style="background:#16a34a"></i>정상 50점 미만</span>
      <span><i class="dot" style="background:#dcfce7;border:1px solid #86efac"></i>음영: 선택 기준월</span>
    </div>
    <div class="trendTopNote">※ 순위는 현재 필터에서 선택한 기준월(${trendMonthLabel(selected)})의 위험지수 기준입니다. 담당자명 오른쪽은 전월 대비 순위 변화, 이름 아래는 최근 흐름 상태를 표시합니다. 월별 셀은 ${modeLabel} 기준으로 같은 담당자의 상태와 점수를 표시합니다.</div>`;
}

function renderTrendAnalysis(){
  trendBindPeriodModeButtons();
  trendUpdatePeriodControlVisibility();
  const data = trendBuildData();
  const trendDataWithValues = data.filter(d => d && d.__hasData !== false);
  const notice = $('#trendDataNotice');
  if(notice){
    const periodName = trendPeriodMode() === 'rolling' ? '최근 12개월' : '해당년도';
    const axisText = trendPeriodMode() === 'rolling'
      ? `${data[0]?.label || '-'} ~ ${data[data.length - 1]?.label || '-'}`
      : '1~12월';
    notice.textContent = data.length
      ? `현재 기준: ${periodLabel()} | ${periodName} (${axisText})`
      : `${trendScopeLabel()} 기준으로 표시할 근태 월 데이터가 없습니다.`;
  }
  if(!trendDataWithValues.length){
    renderEmptyChart($('#trendKpiChart'), '업로드된 월별 데이터가 없습니다.');
    renderEmptyChart($('#trendRiskChart'), '업로드된 월별 데이터가 없습니다.');
    renderEmptyChart($('#trendRadarChart'), '업로드된 월별 데이터가 없습니다.');
    if($('#trendSummaryCards')) $('#trendSummaryCards').innerHTML='';
    if($('#trendRadarCards')) $('#trendRadarCards').innerHTML='';
    if($('#trendTopPeopleTable')) $('#trendTopPeopleTable').innerHTML='';
    return;
  }
  const latest = trendDataWithValues[trendDataWithValues.length-1];
  const prev = trendDataWithValues.length >= 2 ? trendDataWithValues[trendDataWithValues.length-2] : null;
  const diffText = (key, suffix='') => prev ? `${Number(latest[key]||0) - Number(prev[key]||0) >= 0 ? '+' : ''}${trendRound(Number(latest[key]||0) - Number(prev[key]||0),1)}${suffix}` : '비교월 없음';
  if($('#trendSummaryCards')){
    $('#trendSummaryCards').innerHTML = [
      ['최근월', latest.label, `${latest.employeeCount}명 기준`],
      ['1인당 연장근로', `${latest.avgOvertimePerPerson}h`, `전월 대비 ${diffText('avgOvertimePerPerson','h')}`],
      ['위험 인원', `${latest.highRisk}명`, `전월 대비 ${diffText('highRisk','명')}`],
      ['위험지수', `${latest.attritionRisk}점`, `전월 대비 ${diffText('attritionRisk','점')}`]
    ].map(([k,v,s])=>`<div class="trendSummaryCard"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
  }
  trendLineSVG($('#trendKpiChart'), data, [
    {key:'avgOvertimePerPerson', color:'#2563eb', suffix:'h'},
    {key:'highRisk', color:'#ef4444', suffix:'명'},
    {key:'leaveZero', color:'#7c3aed', suffix:'명'}
  ]);
  renderTrendRadar(trendDataWithValues);
  trendLineSVG($('#trendRiskChart'), data, [
    {key:'fatigueRisk', color:'#2563eb', suffix:'점'},
    {key:'workConcentrationRisk', color:'#f59e0b', suffix:'점'},
    {key:'gradeImbalanceRisk', color:'#0f766e', suffix:'점'},
    {key:'attritionRisk', color:'#ef4444', suffix:'점'},
    {key:'leaveDefRisk', color:'#7c3aed', suffix:'점'}
  ], {maxValue:100});
  const radarCards = [
    ['피로도', latest.fatigueRisk, '충분한 휴식 없이 누적되는 업무 피로 수준'],
    ['업무집중', latest.workConcentrationRisk, '상위 인원에게 연장근로와 활동이 쏠린 정도'],
    ['직급불균형', latest.gradeImbalanceRisk, '직급 분포가 한쪽으로 치우친 정도'],
    ['위험지수', latest.attritionRisk, '담당자별 위험점수와 위험인원 비율을 종합 반영'],
    ['연차부족', latest.leaveDefRisk, '기대 연차 사용량 대비 부족 정도']
  ];
  if($('#trendRadarCards')){
    $('#trendRadarCards').innerHTML = radarCards.map(([k,v,d]) => `<div class="trendMetricCard"><div><div class="k">${k}</div><div class="d">${d}</div></div><div class="v">${v}점</div></div>`).join('');
  }
  renderTrendTopPeople();
}


function renderTopCharts(scoped, months){
  if($('#trendTitle')) $('#trendTitle').textContent = `${periodLabel()} 핵심 추이`;
  if($('#trendChart')) lineSVG($('#trendChart'), months, [{key:'avgOvertimePerPerson',color:'#2563eb'},{key:'highRisk',color:'#ef4444'},{key:'leaveZero',color:'#7c3aed'}]);

  const scopedEmployees = filteredEmployees();
  const pieTitleEl = $('#pieTitle');
  const pieLegendEl = $('#pieLegend');
  const pieChartEl = $('#pieChart');

  if(STATE.team !== '전체'){
    if(pieTitleEl) pieTitleEl.textContent = '선택 팀 인원';
    singleCountSVG(pieChartEl, scopedEmployees.length, '인원');
    pieLegendEl.innerHTML = `<span class="dot" style="background:${COLORS[0]}"></span>${STATE.team}`;
  }else if(STATE.division !== '전체'){
    const teamData = Object.entries(groupBy(scopedEmployees,'team')).map(([name,list])=>({name,count:list.length})).sort((a,b)=>b.count-a.count || String(a.name).localeCompare(String(b.name),'ko'));
    if(pieTitleEl) pieTitleEl.textContent = '팀 인원 분포';
    donutSVG(pieChartEl, teamData);
    pieLegendEl.innerHTML = teamData.length ? teamData.map((d,i)=>`<span class="dot" style="background:${COLORS[i%COLORS.length]}"></span>${d.name}`).join(' ') : '데이터 없음';
  }else{
    const divData = Object.entries(groupBy(scopedEmployees,'division')).map(([name,list])=>({name,count:list.length})).sort((a,b)=>b.count-a.count || String(a.name).localeCompare(String(b.name),'ko'));
    if(pieTitleEl) pieTitleEl.textContent = '본부 인원 분포';
    donutSVG(pieChartEl, divData);
    pieLegendEl.innerHTML = divData.length ? divData.map((d,i)=>`<span class="dot" style="background:${COLORS[i%COLORS.length]}"></span>${d.name}`).join(' ') : '데이터 없음';
  }

  const gradeMap = Object.fromEntries(GRADE_ORDER.map(g=>[g,0]));
  filteredEmployees().forEach(e=>gradeMap[e.grade]=(gradeMap[e.grade]||0)+1);
  const gradeData = GRADE_ORDER.map(name=>({name,value:gradeMap[name]||0})).filter(x=>x.value>0);
  barSVG($('#gradeChart'), gradeData, ['value'], ['#7c3aed'], false);

  if(!months.length){
    radarSVG($('#radarChart'), []);
    return;
  }

  const workConMetrics = getWorkConcentrationMetrics(scoped);
  const concentration = Math.min(100, Math.round(workConMetrics.workConcentrationRate));
  const gradeMetrics = getGradeImbalanceMetrics(scoped);
  const gradeImbalance = Math.min(100, Math.round(gradeMetrics.gradeImbalanceScore));

  const scopedRiskValues = scoped
    .map(x => Number(x.scopedRisk || 0))
    .filter(v => Number.isFinite(v))
    .sort((a,b)=>b-a);
  const attritionAvg = scopedRiskValues.length
    ? scopedRiskValues.reduce((sum, value) => sum + value, 0) / scopedRiskValues.length
    : 0;
  const topRiskCount = Math.max(1, Math.ceil(scopedRiskValues.length * 0.2));
  const topRiskAvg = scopedRiskValues.length
    ? scopedRiskValues.slice(0, topRiskCount).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(topRiskCount, scopedRiskValues.length))
    : 0;
  const riskRatio = scopedRiskValues.length
    ? (scopedRiskValues.filter(v => v >= 75).length / scopedRiskValues.length) * 100
    : 0;
  const attrition = Math.min(100, Math.round(
    (attritionAvg * 0.70) +
    (topRiskAvg * 0.20) +
    (riskRatio * 0.10)
  ));

  const expectedLeaveMap = buildExpectedLeaveMapForPeriod(months, scoped);
  const expectedLeaveTotal = scoped.reduce((sum, e) => sum + Number(expectedLeaveMap.get(normalizeEmployeeName(e.name))?.expectedLeave || 0), 0);
  const actualLeaveTotal = scoped.reduce((sum, e) => sum + Number(e.leaveUsed || 0), 0);
  const leaveDef = expectedLeaveTotal > 0
    ? Math.min(100, Math.max(0, Math.round((1 - (actualLeaveTotal / expectedLeaveTotal)) * 100)))
    : 0;

  const avgDailyTotalLoad = scoped.length
    ? scoped.reduce((sum, person) => {
        const totalLoad = Number(person.scopedDailyTotalLoad || (
          Number(person.scopedDailyBaseWorkHours || 0) +
          Number(person.scopedDailyOvertime || 0) +
          Number(person.scopedDailyHiddenOvertime || 0)
        ) || 0);
        return sum + totalLoad;
      }, 0) / scoped.length
    : 0;
  const avgHiddenDaily = scoped.length
    ? scoped.reduce((sum, person) => sum + Number(person.scopedDailyHiddenOvertime || 0), 0) / scoped.length
    : 0;
  const issueRatio = scoped.length
    ? Math.min(100, (scoped.filter(person => Number(person.scopedIssueDays || person.issueDays || 0) >= 4).length / scoped.length) * 100)
    : 0;
  const recoveryPoorRatio = scoped.length
    ? Math.min(100, (scoped.filter(person => Number(person.leaveUsed || 0) <= 0.5).length / scoped.length) * 100)
    : 0;

  const totalLoadScore =
    avgDailyTotalLoad >= 10.5 ? 100 :
    avgDailyTotalLoad >= 9.5 ? 75 :
    avgDailyTotalLoad >= 8.5 ? 35 :
    avgDailyTotalLoad >= 7.0 ? 10 :
    avgDailyTotalLoad > 0 ? 5 : 0;
  const hiddenScore =
    avgHiddenDaily >= 1.0 ? 100 :
    avgHiddenDaily >= 0.5 ? 75 :
    avgHiddenDaily > 0 ? 40 : 0;
  const avgOTPerPerson = avg(months,'avgOvertimePerPerson');
  const otScore = Math.min(100, Math.max(0, (avgOTPerPerson / 20) * 100));

  let fatigueModeLabel = '실무추천';
  let fatigueWeights = { total:0.35, hidden:0.20, issue:0.15, recovery:0.15, ot:0.15 };
  if(STATE.fatigueMode === 'concentration'){
    fatigueModeLabel = '집중도 강조';
    fatigueWeights = { total:0.25, hidden:0.15, issue:0.30, recovery:0.10, ot:0.20 };
  }else if(STATE.fatigueMode === 'leave'){
    fatigueModeLabel = '연차 강조';
    fatigueWeights = { total:0.20, hidden:0.15, issue:0.10, recovery:0.35, ot:0.20 };
  }

  const fatigue = Math.min(100, Math.round(
    (totalLoadScore * fatigueWeights.total) +
    (hiddenScore * fatigueWeights.hidden) +
    (issueRatio * fatigueWeights.issue) +
    (recoveryPoorRatio * fatigueWeights.recovery) +
    (otScore * fatigueWeights.ot)
  ));

  if($('#radarModeLabel')) $('#radarModeLabel').textContent = `피로도 기준: ${fatigueModeLabel}`;
  document.querySelectorAll('[data-fatigue-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-fatigue-mode') === STATE.fatigueMode);
  });

  const radarData = [
    {subject:'피로도',value:fatigue},
    {subject:'업무집중',value:concentration},
    {subject:'직급불균형',value:gradeImbalance},
    {subject:'위험지수',value:attrition},
    {subject:'연차부족',value:leaveDef}
  ];
  const radarMetricTone = (subject, value) => {
    if(subject === '피로도') return value >= 75 ? 'score-red' : value >= 50 ? 'score-amber' : 'score-green';
    if(subject === '업무집중') return value >= 70 ? 'score-red' : value >= 50 ? 'score-amber' : 'score-green';
    if(subject === '직급불균형') return value >= 60 ? 'score-red' : value >= 40 ? 'score-amber' : 'score-green';
    if(subject === '위험지수') return value >= 60 ? 'score-red' : value >= 40 ? 'score-amber' : 'score-green';
    if(subject === '연차부족') return value >= 70 ? 'score-red' : value >= 50 ? 'score-amber' : 'score-green';
    return value >= 75 ? 'score-red' : value >= 50 ? 'score-amber' : 'score-green';
  };
  radarSVG($('#radarChart'), radarData);
  const radarMetricsHost = $('#radarMetrics');
  if(radarMetricsHost){
    radarMetricsHost.innerHTML = radarData.map(item => `<div class="radarMetricCard ${radarMetricTone(item.subject, item.value)}"><div class="k">${item.subject}</div><div class="v">${item.value}점</div></div>`).join('');
  }
}

function insightForTeam(teamName, list, companyOverAvg){
  const parts=[];
  const teamAvg=avg(list,'scopedDailyOvertime');
  const maxPerson=[...list].sort((a,b)=>Number(b.scopedDailyOvertime||0)-Number(a.scopedDailyOvertime||0))[0];
  const workConMetrics = getWorkConcentrationMetrics(list);
  if(teamAvg>=companyOverAvg*1.4) parts.push(`${teamName}은 전사 평균 대비 연장근로 수준이 높아 조직 전체의 업무량 과다 또는 인력 부족 가능성이 있습니다.`);
  if(maxPerson && Number(maxPerson.scopedDailyOvertime || 0) >= Math.max(2, teamAvg * 1.8)) parts.push(`${maxPerson.name} 담당자는 팀 평균 대비 연장근로가 높아 개인 과부하가 우려됩니다.`);
  if(workConMetrics.workConcentrationRate >= 60) parts.push('상위 20% 인원 기준 연장근로와 외근/출장 편중이 높아 소수 인원 집중 상태로 해석됩니다.');
  else if(workConMetrics.workConcentrationRate >= 40) parts.push('업무가 일부 인원에 다소 모이는 경향이 보여 담당업무 재조정 또는 업무 분산 검토가 필요합니다.');
  if(!parts.length) parts.push(`${teamName}은 현재 기준으로 비교적 안정적인 수준입니다.`);
  return parts;
}

function renderInsight(scoped, months){
  if(!scoped.length){
    $('#scopeTitle').textContent = `${periodLabel()} 조직 비교`;
    $('#scopeDesc').textContent = '현재 분석 대상 사원정보가 없습니다.';
    renderEmptyChart($('#scopeChart'));
    $('#insightList').innerHTML = `<div class="alertCard"><div style="font-weight:800;margin-bottom:8px">안내</div><div class="desc">사원정보를 등록하고 근태 데이터를 업로드하면 자동 인사이트가 생성됩니다.</div></div>`;
    return;
  }
  const m=periodMultiplier(), add=periodRiskAdder();

  function sumBy(list, key){
    return list.reduce((acc, item) => acc + Number(item?.[key] || 0), 0);
  }

  function round1(n){ return +Number(n || 0).toFixed(1); }
  function avgFromTotals(total, days){
    return days > 0 ? total / days : 0;
  }
  function makeWeightedNode(name, list){
    const totalDays = sumBy(list, 'workDays');
    const totalBase = sumBy(list, 'monthlyBaseWorkHours');
    const totalOT = sumBy(list, 'overtime');
    const totalHidden = sumBy(list, 'monthlyHiddenOvertime');
    const avgBase = avgFromTotals(totalBase, totalDays);
    const avgOT = avgFromTotals(totalOT, totalDays);
    const avgHidden = avgFromTotals(totalHidden, totalDays);

    const displayBase = round1(avgBase);
    const displayOT = round1(avgOT);
    const displayHidden = round1(avgHidden);

    return {
      name,
      avgBaseWorkHours: displayBase,
      avgDailyOvertime: displayOT,
      avgHiddenOvertime: displayHidden,
      avgTotalLoad: round1(displayBase + displayOT + displayHidden)
    };
  }

  const divisionAvg = Object.entries(groupBy(filteredEmployees(),'division')).map(([name,list])=>makeWeightedNode(name, list));
  const teamBase = STATE.division==='전체'?[]:filteredEmployees().filter(e=>e.division===STATE.division);
  const teamAvg = Object.entries(groupBy(teamBase,'team')).map(([name,list])=>makeWeightedNode(name, list));

  const selectedTeamName = STATE.team!=='전체' ? STATE.team : (Object.entries(groupBy(scoped,'team')).map(([name,list])=>({name,risk:Math.min(100,scoreTeam(list)+add)})).sort((a,b)=>b.risk-a.risk)[0]?.name || '');
  const selectedMembers = scoped.filter(x=>x.team===selectedTeamName);
  const scopeData = STATE.division==='전체' && STATE.team==='전체'
    ? divisionAvg
    : STATE.division!=='전체' && STATE.team==='전체'
      ? teamAvg
      : selectedMembers.map(x=>{
          const days = Number(x.workDays || 0);
          const base = days > 0 ? Number(x.monthlyBaseWorkHours || 0) / days : 0;
          const overtime = days > 0 ? Number(x.overtime || 0) / days : 0;
          const hidden = days > 0 ? Number(x.monthlyHiddenOvertime || 0) / days : 0;

          const displayBase = round1(base);
          const displayOT = round1(overtime);
          const displayHidden = round1(hidden);

          return {
            name: x.name,
            avgBaseWorkHours: displayBase,
            avgDailyOvertime: displayOT,
            avgHiddenOvertime: displayHidden,
            avgTotalLoad: round1(displayBase + displayOT + displayHidden)
          };
        });

  $('#scopeTitle').textContent = STATE.division==='전체' && STATE.team==='전체'
    ? `${periodLabel()} 본부별 업무 부하 비교`
    : STATE.division!=='전체' && STATE.team==='전체'
      ? `${periodLabel()} ${STATE.division} 내 팀별 업무 부하 비교`
      : `${periodLabel()} ${STATE.team} 팀원별 업무 부하 비교`;
  $('#scopeDesc').textContent = STATE.division==='전체' && STATE.team==='전체'
    ? '전체 선택 시 각 본부의 실근무일수 기준 일평균 기본근무시간, ERP 기준 일평균 연장근로시간, 일평균 숨은초과시간과 총부하를 비교합니다. 주말·공휴일 근무는 기본근무 0시간, 연장근로로 반영합니다.'
    : STATE.division!=='전체' && STATE.team==='전체'
      ? '본부 선택 시 해당 본부 각 팀의 실근무일수 기준 일평균 기본근무시간, ERP 기준 일평균 연장근로시간, 일평균 숨은초과시간과 총부하를 비교합니다. 주말·공휴일 근무는 기본근무 0시간, 연장근로로 반영합니다.'
      : '팀 선택 시 해당 팀 구성원별 실근무일수 기준 일평균 기본근무시간, ERP 기준 일평균 연장근로시간, 일평균 숨은초과시간과 총부하를 비교합니다. 주말·공휴일 근무는 기본근무 0시간, 연장근로로 반영합니다.';
  barSVG($('#scopeChart'), scopeData, ['avgBaseWorkHours','avgDailyOvertime','avgHiddenOvertime','avgTotalLoad'], ['#2563eb','#ef4444','#d97706','#0f172a'], scopeData.length>4, {timeFormat:true});

  const workConMetrics = getWorkConcentrationMetrics(selectedMembers.length ? selectedMembers : scoped);
  const topOvertimeNames = workConMetrics.sortedOvertime
    .slice(0, workConMetrics.topCount)
    .filter(person => workConMetrics.overtimeValue(person) > 0)
    .map(person => String(person.name || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const topActivityNames = workConMetrics.sortedActivity
    .slice(0, workConMetrics.topCount)
    .filter(person => workConMetrics.activityValue(person) > 0)
    .map(person => String(person.name || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  const insights = insightForTeam(selectedTeamName||'선택 팀', selectedMembers, avg(months,'avgDailyOvertime'));
  const gradeMetrics = getGradeImbalanceMetrics(scoped);
  insights.unshift(`직급불균형은 ${gradeMetrics.gradeImbalanceScore}%이며,
상위 2개 직급 비율 ${Math.round(gradeMetrics.rawTopTwoShare)}% 기준으로 산출되었습니다. 
${
  gradeMetrics.gradeImbalanceScore >= 60
    ? '특정 직급 구간 쏠림이 커 중간 직급 공백 또는 구조 불균형 가능성이 있습니다.'
    : gradeMetrics.gradeImbalanceScore >= 40
    ? '일부 직급 구간에 편중이 나타나 구조 점검이 필요한 상태입니다.'
    : '직급 분포가 비교적 균형 잡힌 상태입니다.'
}`);
  const attritionAvg = Math.round(avg(scoped, 'scopedRisk'));
  const attritionTop = [...scoped]
    .sort((a,b) => Number(b.scopedRisk || 0) - Number(a.scopedRisk || 0))
    .slice(0,3)
    .map(person => String(person.name || '').trim())
    .filter(Boolean);
  insights.unshift(`위험도는 ${attritionAvg}점이며, 2단계에서는 총부하 · 숨은초과 · 반복 이슈일수 · 연장근로 · 회복부족 · 팀 업무집중 · 직급불균형을 함께 반영한 종합 모델입니다.${attritionTop.length ? ` 현재 상위 후보는 ${attritionTop.join(', ')} 입니다.` : ''}`);
  insights.unshift(`업무집중도는 ${workConMetrics.workConcentrationRate}%이며, 연장근로 상위 20% 비중 ${Math.round(workConMetrics.overtimeConcentrationRate)}% · 외근/출장 상위 20% 비중 ${Math.round(workConMetrics.activityConcentrationRate)}% 기준으로 산출됩니다.`);
  if(topOvertimeNames.length || topActivityNames.length){
    insights.push(`집중 인원은 연장근로 ${topOvertimeNames.length ? topOvertimeNames.join(', ') : '해당 없음'} / 외근·출장 ${topActivityNames.length ? topActivityNames.join(', ') : '해당 없음'} 중심으로 나타났습니다.`);
  }
  $('#insightList').innerHTML = insights.map((t,i)=>`<div class="alertCard"><div style="font-weight:800;margin-bottom:8px">분석 결과 ${i+1}</div><div class="desc">${t}</div></div>`).join('');
}

function personMini(item){
  const dailyTotalLoad = toSafeNumber(
    item.scopedDailyTotalLoad ||
    (toSafeNumber(item.scopedDailyBaseWorkHours || 0) + toSafeNumber(item.scopedDailyOvertime || 0) + toSafeNumber(item.scopedDailyHiddenOvertime || 0)) ||
    item.avgTotalLoad || 0
  );
  const recoveryIndex = getRecoveryIndex(item);
  const [recoveryText, recoveryCls] = recoveryBadge(recoveryIndex);
  const recoveryColor = recoveryCls === 'green' ? '#16a34a' : recoveryCls === 'amber' ? '#d97706' : '#ef4444';
  const issueDays = toSafeNumber(item.scopedIssueDays ?? item.issueDays ?? 0);
  const hiddenOvertime = toSafeNumber(item.scopedMonthlyHiddenOvertime ?? item.monthlyHiddenOvertime ?? 0);
  return `<div class="statusMini">
    <div style="font-weight:700">${item.name} <span class="label">${item.division} / ${item.team} / ${item.grade}</span></div>
    <div class="metrics" style="margin-top:8px">
      <div><div class="label">위험지수</div><strong>${item.scopedRisk}점</strong></div>
      <div><div class="label">일평균 총부하시간</div><strong>${dailyTotalLoad.toFixed(1)}h</strong></div>
      <div><div class="label">월 총 연장근로</div><strong>${item.scopedMonthlyOvertime}h</strong></div>
      <div><div class="label">이슈일수</div><strong>${issueDays.toFixed(0)}일</strong></div>
      <div><div class="label">숨은초과</div><strong>${hiddenOvertime.toFixed(1)}h</strong></div>
      <div><div class="label">월 총 근무시간</div><strong>${item.scopedMonthlyHours}h</strong></div>
      <div><div class="label">휴식지수</div><strong style="color:${recoveryColor}">${recoveryIndex}점 (${recoveryText})</strong></div>
    </div>
  </div>`;
}

function renderStatusCards(scoped){
  const groups = {
    '위험': scoped.filter(x=>x.scopedRisk>=75).sort((a,b)=>b.scopedRisk-a.scopedRisk),
    '주의': scoped.filter(x=>x.scopedRisk>=50 && x.scopedRisk<75).sort((a,b)=>b.scopedRisk-a.scopedRisk),
    '정상': scoped.filter(x=>x.scopedRisk<50).sort((a,b)=>b.scopedRisk-a.scopedRisk)
  };
  const defs = [
    ['위험','red'],
    ['주의','amber'],
    ['정상','green']
  ];
  $('#statusCards').innerHTML = defs.map(([label,cls])=>{
    const items = groups[label];
    return `<div class="statusCard ${cls}">
      <div class="statusHeader">
        <div style="font-size:18px;font-weight:800">${label}</div>
        <div class="badge ${cls}">${label} 인원 ${items.length}명</div>
      </div>
      <div class="statusList">
        ${items.map(personMini).join('') || '<div class="mini">해당 인원 없음</div>'}
      </div>
    </div>`;
  }).join('');
}


function getLeaveCauseMode(){
  if(STATE.division==='전체' && STATE.team==='전체') return 'division';
  if(STATE.division!=='전체' && STATE.team==='전체') return 'team';
  return 'person';
}
function getLeaveCauseTargetList(scoped, focusName=''){
  const mode = getLeaveCauseMode();
  if(mode==='person') return scoped;
  const all = filteredEmployees();
  if(mode==='division'){
    const target = focusName || STATE.leaveCauseFocus || '';
    if(target === '전체' || !target) return all;
    return all.filter(x => x.division === target);
  }
  const target = focusName || STATE.leaveCauseFocus || '';
  if(target === '전체' || !target) return all;
  return all.filter(x => x.team === target);
}
function renderLeaveCauseAnalysis(scoped, scoreItems){
  const host = $('#leaveCauseAnalysisCard');
  if(!host) return;
  const mode = getLeaveCauseMode();
  let focusName = '';
  if(mode==='person'){
    focusName = STATE.team !== '전체' ? STATE.team : (STATE.division !== '전체' ? STATE.division : '현재 선택 범위');
  }else{
    const isAllScope = STATE.division==='전체' && STATE.team==='전체';
    if(isAllScope){
      focusName = '전체';
      STATE.leaveCauseFocus = '전체';
    }else{
      const validNames = scoreItems.map(x=>x.name);
      if(validNames.includes(STATE.leaveCauseFocus)) focusName = STATE.leaveCauseFocus;
      else focusName = validNames[0] || '';
      STATE.leaveCauseFocus = focusName;
    }
  }
  const targetList = getLeaveCauseTargetList(scoped, focusName);
  if(!targetList.length){
    host.innerHTML = `<div class="leaveCauseEmpty">표시할 연차 사용 데이터가 없습니다.</div>`;
    return;
  }

  const total = Math.max(1, targetList.length);
  const expectedLeaveMap = buildExpectedLeaveMapForPeriod(periodMonths(), targetList);
  const totalLeave = targetList.reduce((sum, e) => sum + Number(e.leaveUsed || 0), 0);
  const expectedTotalLeave = targetList.reduce((sum, e) => sum + Number(expectedLeaveMap.get(normalizeEmployeeName(e.name))?.expectedLeave || 0), 0);
  const avgLeave = totalLeave / total;
  const expectedAvg = expectedTotalLeave / total;
  const shortage = expectedTotalLeave > 0
    ? Math.min(100, Math.max(0, Math.round((1 - (totalLeave / expectedTotalLeave)) * 100)))
    : 0;
  const noUseCount = targetList.filter(x => Number(x.leaveUsed || 0) === 0).length;
  const partialCount = targetList.filter(x => {
    const expected = Number(expectedLeaveMap.get(normalizeEmployeeName(x.name))?.expectedLeave || 0);
    const used = Number(x.leaveUsed || 0);
    return expected > 0 && used > 0 && used < expected;
  }).length;
  const fullEnoughCount = targetList.filter(x => Number(x.leaveUsed || 0) >= Number(expectedLeaveMap.get(normalizeEmployeeName(x.name))?.expectedLeave || 0)).length;
  const top3Share = totalLeave > 0
    ? Math.round((targetList.map(x=>Number(x.leaveUsed || 0)).sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0) / totalLeave) * 100)
    : 0;

  const leaveStatusCounts = { '정상':0, '부족':0, '미사용':0 };
  const leaveUnusedByDivision = {};
  const leaveDivisionTotals = {};
  const leaveUsageRanges = { '0일':0, '0.5일':0, '1일':0, '1.5일 이상':0 };
  targetList.forEach(item => {
    const used = Number(item.leaveUsed || 0);
    const expected = Number(expectedLeaveMap.get(normalizeEmployeeName(item.name))?.expectedLeave || 0);
    const divName = item.division || '미지정';
    leaveDivisionTotals[divName] = (leaveDivisionTotals[divName] || 0) + 1;
    const status = used === 0 ? '미사용' : used >= expected ? '정상' : '부족';
    leaveStatusCounts[status] = (leaveStatusCounts[status] || 0) + 1;
    if(status === '미사용'){
      leaveUnusedByDivision[divName] = (leaveUnusedByDivision[divName] || 0) + 1;
    }
    if(used === 0) leaveUsageRanges['0일'] += 1;
    else if(used <= 0.5) leaveUsageRanges['0.5일'] += 1;
    else if(used <= 1) leaveUsageRanges['1일'] += 1;
    else leaveUsageRanges['1.5일 이상'] += 1;
  });
  const statusNormalDeg = Math.round((leaveStatusCounts['정상'] / total) * 360);
  const statusPartialDeg = Math.round(((leaveStatusCounts['정상'] + leaveStatusCounts['부족']) / total) * 360);
  const statusNormalEnd = (leaveStatusCounts['정상'] / total) * 360;
  const statusPartialEnd = ((leaveStatusCounts['정상'] + leaveStatusCounts['부족']) / total) * 360;

  function buildLeaveDonutLabel(key, label, count, startDeg, endDeg, color){
    if(!count) return { labelHtml:'', lineHtml:'' };
    const mid = (startDeg + endDeg) / 2;
    const rad = mid * Math.PI / 180;
    const labelRadius = 116;
    const lineStart = 78;
    const lineEnd = 98;
    const x = Math.round(Math.sin(rad) * labelRadius);
    const y = Math.round(-Math.cos(rad) * labelRadius);
    const x1 = Math.round(Math.sin(rad) * lineStart);
    const y1 = Math.round(-Math.cos(rad) * lineStart);
    const x2 = Math.round(Math.sin(rad) * lineEnd);
    const y2 = Math.round(-Math.cos(rad) * lineEnd);
    return {
      labelHtml:`<div class="leaveDonutLabel ${key}" style="--label-x:${x};--label-y:${y}"><span class="leaveLegendDot" style="background:${color}"></span>${label} <b>${count}명</b></div>`,
      lineHtml:`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`
    };
  }

  const leaveDonutParts = [
    buildLeaveDonutLabel('normal','정상', leaveStatusCounts['정상'], 0, statusNormalEnd, '#16a34a'),
    buildLeaveDonutLabel('partial','부족', leaveStatusCounts['부족'], statusNormalEnd, statusPartialEnd, '#d97706'),
    buildLeaveDonutLabel('unused','미사용', leaveStatusCounts['미사용'], statusPartialEnd, 360, '#ef4444')
  ];
  const leaveDonutLabelsHtml = leaveDonutParts.map(x=>x.labelHtml).join('');
  const leaveDonutLeadersHtml = leaveDonutParts.map(x=>x.lineHtml).join('');

  const maxUsageRange = Math.max(1, ...Object.values(leaveUsageRanges));
  const unusedDivisionRows = Object.keys(leaveDivisionTotals).length
    ? Object.keys(leaveDivisionTotals).sort((a,b)=>{
        const rateA = (leaveUnusedByDivision[a] || 0) / Math.max(1, leaveDivisionTotals[a] || 0);
        const rateB = (leaveUnusedByDivision[b] || 0) / Math.max(1, leaveDivisionTotals[b] || 0);
        return rateB - rateA || String(a).localeCompare(String(b), 'ko');
      }).map(name => {
        const count = leaveUnusedByDivision[name] || 0;
        const divTotal = Math.max(1, leaveDivisionTotals[name] || 0);
        const pct = Math.round((count / divTotal) * 100);
        const tone = pct >= 40 ? 'red' : pct >= 30 ? 'amber' : 'green';
        return `<div class="leaveVizBarRow division"><div class="leaveVizBarLabel" title="${name}">${name}</div><div class="leaveVizBarBg"><div class="leaveVizBarFill ${tone}" style="width:${pct}%"></div></div><div class="leaveVizBarValue"><span class="pct">${pct}%</span> <span class="count">(${count}명)</span></div></div>`;
      }).join('')
    : '<div class="desc">표시할 본부 데이터가 없습니다.</div>';
  const usageRangeRows = Object.entries(leaveUsageRanges).map(([name,count]) => {
    const tone = name === '0일' ? 'red' : name === '0.5일' ? 'amber' : name === '1일' ? 'blue' : 'green';
    return `<div class="leaveVizBarRow"><div class="leaveVizBarLabel">${name}</div><div class="leaveVizBarBg"><div class="leaveVizBarFill ${tone}" style="width:${Math.round((count/maxUsageRange)*100)}%"></div></div><div class="leaveVizBarValue">${count}명</div></div>`;
  }).join('');

  let statusText = '정상';
  let statusClass = 'green';
  if(shortage >= 75){ statusText='위험'; statusClass='red'; }
  else if(shortage >= 50){ statusText='주의'; statusClass='amber'; }

  const scopeLabel = (mode==='division' && focusName==='전체') ? '전체'
    : mode==='division' ? '본부'
    : mode==='team' ? '팀'
    : '현재 선택';
  const insightLines = [];
  if(noUseCount / total >= 0.5) insightLines.push(`${scopeLabel} 인원 ${total}명 중 ${noUseCount}명이 선택 기간 동안 연차/반차를 한 번도 사용하지 않아 연차부족이 높게 계산되었습니다.`);
  if(top3Share >= 70 && totalLeave > 0) insightLines.push(`전체 사용량의 ${top3Share}%가 상위 일부 인원에게 집중되어 있어 실제 사용 사례가 있어도 평균은 낮게 유지됩니다.`);
  if(avgLeave < expectedAvg) insightLines.push(`1인당 평균 사용량은 ${avgLeave.toFixed(2)}일로, 부분 근무 비율을 반영한 기준 사용량 ${expectedAvg.toFixed(2)}일보다 낮습니다.`);
  if(!insightLines.length && fullEnoughCount === total) insightLines.push('선택 인원이 모두 기준 사용량 이상을 사용해 연차부족 리스크가 낮습니다.');
  else if(!insightLines.length) insightLines.push('일부 인원은 사용했지만 팀 평균 기준으로는 아직 여유가 부족한 상태입니다.');

  const rows = [...targetList]
    .sort((a,b)=>Number(b.leaveUsed || 0) - Number(a.leaveUsed || 0) || String(a.name).localeCompare(String(b.name), 'ko'))
    .map(item=>{
      const used = Number(item.leaveUsed || 0);
      const expected = Number(expectedLeaveMap.get(normalizeEmployeeName(item.name))?.expectedLeave || 0);
      const workRatio = Number(expectedLeaveMap.get(normalizeEmployeeName(item.name))?.workRatio || 0);
      const badge = used === 0
        ? '<span class="badge red">미사용</span>'
        : used >= expected
          ? '<span class="badge green">정상</span>'
          : '<span class="badge amber">부족</span>';
      return `<tr>
        <td>${item.name}</td>
        <td>${item.division}</td>
        <td>${item.team}</td>
        <td>${used.toFixed(1)}일</td>
        <td>${expected.toFixed(2)}일</td>
        <td>${Math.round(workRatio * 100)}%</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');

  host.innerHTML = `
    <div class="leaveCauseGrid">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div>
            <div class="label">${scopeLabel} 기준</div>
            <div style="font-size:24px;font-weight:800;margin-top:4px">${focusName || '현재 선택 범위'}</div>
          </div>
          <div class="badge ${statusClass}">${statusText} · 연차부족 ${shortage}%</div>
        </div>
        <div class="leaveCauseSummary">
          <div class="leaveCauseStat"><div class="k">대상 인원</div><div class="v">${total}명</div></div>
          <div class="leaveCauseStat"><div class="k">총 사용량</div><div class="v">${totalLeave.toFixed(1)}일</div></div>
          <div class="leaveCauseStat"><div class="k">1인당 평균</div><div class="v">${avgLeave.toFixed(2)}일</div></div>
          <div class="leaveCauseStat"><div class="k">기준 사용량</div><div class="v">${expectedAvg.toFixed(2)}일</div></div>
          <div class="leaveCauseStat"><div class="k">미사용 인원</div><div class="v">${noUseCount}명</div></div>
          <div class="leaveCauseStat"><div class="k">부분 사용 인원</div><div class="v">${partialCount}명</div></div>
        </div>
        <div class="leaveCauseTableWrap">
          <table class="leaveCauseTable">
            <thead>
              <tr><th>이름</th><th>본부</th><th>팀</th><th>사용량</th><th>기준</th><th>근무비율</th><th>판정</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div class="leaveVisualPanel">
        <div class="leaveVisualCard leaveVisualCardDonut">
          <div class="leaveVisualHead"><div class="leaveVisualTitle">연차 판정 분포</div><span class="leaveVisualChip ${statusClass}">${statusText}</span></div>
          <div class="leaveDonutWrap">
            <div class="leaveDonutStage">
              <svg class="leaveDonutLeaderSvg" viewBox="-140 -100 280 200" aria-hidden="true">${leaveDonutLeadersHtml}</svg>
              <div class="leaveDonut" style="--normalDeg:${statusNormalDeg}deg;--partialDeg:${statusPartialDeg}deg">
                <div class="leaveDonutCenter">${total}명<span>대상</span></div>
              </div>
              ${leaveDonutLabelsHtml}
            </div>
          </div>
        </div>
        <div class="leaveVisualCard">
          <div class="leaveVisualHead"><div class="leaveVisualTitle">본부별 미사용 인원</div><span class="leaveVisualSub">비율 + 인원</span></div>
          <div class="leaveVizBars">${unusedDivisionRows}</div>
        </div>
        <div class="leaveVisualCard">
          <div class="leaveVisualHead"><div class="leaveVisualTitle">사용량 구간 분포</div><span class="leaveVisualSub">연차/반차</span></div>
          <div class="leaveVizBars">${usageRangeRows}</div>
        </div>
        <div class="leaveVisualCard alert">
          <div class="leaveVisualHead"><div class="leaveVisualTitle">자동 해석</div><span class="leaveVisualChip amber">요약</span></div>
          ${insightLines.map((t,i)=>`<div class="alertCard" style="margin-top:${i===0?0:10}px"><div style="font-weight:800;margin-bottom:8px">해석 ${i+1}</div><div class="desc">${t}</div></div>`).join('')}
          <div class="alertCard" style="margin-top:10px">
            <div style="font-weight:800;margin-bottom:8px">추가 지표</div>
            <div class="desc">상위 3명 사용 집중도 ${top3Share}% · 기준 이상 사용 인원 ${fullEnoughCount}명</div>
          </div>
        </div>
      </div>
    </div>
  `;
}



function getOrgRiskItemSummary(item){
  const list = item?.list || [];
  if(!list.length) return '선택된 범위 기준 조직 위험 점수';
  const metrics = getOrgRiskMetrics(list);
  const reasons = [];
  const ratioPct = Math.round(metrics.riskWarningRatio * 100);

  if(metrics.riskCount || metrics.warnCount){
    reasons.push(`위험/주의 ${metrics.riskCount + metrics.warnCount}명`);
  }
  if(metrics.avgTotalLoad >= 9) reasons.push(`평균 총부하 ${formatHoursToHM(metrics.avgTotalLoad)}`);
  else if(metrics.avgTotalLoad >= 8.5) reasons.push(`총부하 상승 ${formatHoursToHM(metrics.avgTotalLoad)}`);
  if(metrics.avgOvertime >= 20) reasons.push(`평균 OT ${formatHoursToHM(metrics.avgOvertime)}`);
  else if(metrics.avgOvertime >= 10) reasons.push(`OT 증가 ${formatHoursToHM(metrics.avgOvertime)}`);
  if(metrics.avgIssueDays >= 3) reasons.push(`평균 이슈 ${metrics.avgIssueDays}일`);
  else if(metrics.avgIssueDays >= 1) reasons.push(`이슈 반복 ${metrics.avgIssueDays}일`);
  if(metrics.avgHiddenOvertime >= 6) reasons.push(`숨은초과 ${formatHoursToHM(metrics.avgHiddenOvertime)}`);
  else if(metrics.avgHiddenOvertime >= 3) reasons.push(`숨은초과 누적 ${formatHoursToHM(metrics.avgHiddenOvertime)}`);
  if(metrics.avgRecovery < 50) reasons.push(`휴식 ${metrics.avgRecovery}점`);
  else if(metrics.avgRecovery < 60) reasons.push(`회복 관찰 ${metrics.avgRecovery}점`);

  if(!reasons.length){
    reasons.push(item.score >= 35 ? '주의 요인 관찰 필요' : '상대적으로 안정');
  }
  return reasons.slice(0,3).join(' · ');
}

function buildOrgRiskInsights(overallItem, scoreItems){
  const items = scoreItems || [];
  const topItem = items[0] || overallItem;
  const lowItem = items[items.length-1] || topItem;
  const [overallStatus, overallCls] = orgRiskBadge(overallItem.score);
  const [topStatus, topCls] = orgRiskBadge(topItem.score);
  const overallMetrics = getOrgRiskMetrics(overallItem.list || []);
  const topMetrics = getOrgRiskMetrics(topItem.list || []);
  const topSummary = getOrgRiskItemSummary(topItem);
  const insights = [];

  insights.push({
    cls: overallCls,
    title: '해석 1',
    text: `${periodLabel()} 기준 전체 조직 평균은 ${overallItem.score}점으로 '${overallStatus}' 구간입니다. 조직 위험 점수는 위험/주의 인원 비율, 평균 총부하, 평균 연장근로, 평균 이슈일, 평균 월 숨은초과, 평균 휴식점수를 종합해 계산합니다.`
  });

  if(topItem && topItem.name){
    insights.push({
      cls: topCls,
      title: '해석 2',
      text: `${topItem.name}는 ${topItem.score}점으로 '${topStatus}' 구간이며, 주요 원인은 ${topSummary}입니다.`
    });
  }

  if(items.length >= 2){
    const gap = Math.max(0, Number(topItem.score || 0) - Number(lowItem.score || 0));
    insights.push({
      cls: gap >= 20 ? 'amber' : 'green',
      title: '해석 3',
      text: `${topItem.name}와 ${lowItem.name}의 조직 위험 점수 차이는 ${gap}점입니다. 차이가 클수록 조직 간 위험/주의 인원 비율, 총부하, 숨은초과, 회복 여력의 편차를 함께 점검하는 것이 좋습니다.`
    });
  }

  const riskCount = items.filter(x => Number(x.score || 0) >= 65).length;
  const warnCount = items.filter(x => Number(x.score || 0) >= 35 && Number(x.score || 0) < 65).length;
  const focusTexts = [];
  if(overallMetrics.riskWarningRatio >= 0.25) focusTexts.push('위험/주의 인원 비율');
  if(overallMetrics.avgTotalLoad >= 8.5) focusTexts.push('평균 총부하');
  if(overallMetrics.avgOvertime >= 10) focusTexts.push('평균 연장근로');
  if(overallMetrics.avgIssueDays >= 1) focusTexts.push('평균 이슈일');
  if(overallMetrics.avgHiddenOvertime >= 3) focusTexts.push('평균 월 숨은초과');
  if(overallMetrics.avgRecovery < 60) focusTexts.push('휴식점수');
  insights.push({
    cls: riskCount ? 'red' : warnCount ? 'amber' : 'green',
    title: '해석 4',
    text: riskCount
      ? `위험 구간 조직이 ${riskCount}개 있습니다. ${focusTexts.length ? focusTexts.slice(0,3).join(' · ') : '조직별 세부 지표'}를 우선 점검하고 업무 재배분과 회복 지표를 함께 확인하는 것이 좋습니다.`
      : warnCount
        ? `주의 구간 조직이 ${warnCount}개 있습니다. ${focusTexts.length ? focusTexts.slice(0,3).join(' · ') : '총부하와 회복 지표'}를 관찰해 위험 구간으로 전환되지 않도록 관리하는 것이 좋습니다.`
        : '현재 위험·주의 구간 조직은 없습니다. 다만 특정 인원에게 업무가 누적되는지 주기적으로 확인하면 됩니다.'
  });

  return insights;
}

function renderRisk(scoped){
  if(!scoped.length){
    $('#leaveCauseAnalysisCard').innerHTML = `<div class="leaveCauseEmpty">현재 표시할 연차 사용 데이터가 없습니다.</div>`;
    $('#statusCards').innerHTML = `<div class="statusCard"><div class="statusHeader"><div style="font-size:18px;font-weight:800">상태 분포</div></div><div class="desc">현재 표시할 사원/근태 데이터가 없습니다.</div></div>`;
    $('#scoreTitle').innerHTML = orgRiskTitleHtml(`${periodLabel()} 조직 위험 점수`);
    $('#scoreList').innerHTML = `<div class="rowCard">데이터 없음</div>`;
    $('#riskInsightList').innerHTML = `<div class="alertCard"><div style="font-weight:800;margin-bottom:8px">안내</div><div class="desc">사원정보와 근태 데이터를 등록한 뒤 위험 조직 분석을 진행하세요.</div></div>`;
    return;
  }
  renderStatusCards(scoped);
  const add=periodRiskAdder();

  // 본부/팀 조직 위험 점수는 개인 위험 결과를 조직 단위로 집계하고, 총부하·OT·이슈·숨은초과·휴식 지표를 함께 반영합니다.
  let scoreItems = STATE.division==='전체' && STATE.team==='전체'
    ? Object.entries(groupBy(filteredEmployees(),'division')).map(([name,list])=>({name,score:Math.min(100,scoreTeam(list)+add),list,type:'division'}))
    : STATE.division!=='전체' && STATE.team==='전체'
      ? Object.entries(groupBy(filteredEmployees(),'team')).map(([name,list])=>({name,score:Math.min(100,scoreTeam(list)+add),list,type:'team'}))
      : scoped.map(x=>({name:x.name,score:x.scopedRisk,list:[x],type:'person'}));

  scoreItems = scoreItems.sort((a,b)=>b.score-a.score || String(a.name).localeCompare(String(b.name), 'ko'));
  const orgRiskTitle = STATE.division==='전체' && STATE.team==='전체'
    ? `${periodLabel()} 본부별 조직 위험 점수`
    : STATE.division!=='전체' && STATE.team==='전체'
      ? `${periodLabel()} ${STATE.division} 내 팀별 위험 점수`
      : `${periodLabel()} ${STATE.team} 팀원별 위험 점수`;
  $('#scoreTitle').innerHTML = orgRiskTitleHtml(orgRiskTitle);

  renderLeaveCauseAnalysis(scoped, scoreItems);

  const overallScore = scoreItems.length
    ? Math.round(scoreItems.reduce((sum,item)=>sum + Number(item.score || 0),0) / scoreItems.length)
    : Math.min(100, scoreTeam(filteredEmployees()) + add);
  const overallItem = { name:'전체 조직 평균', score: overallScore, list: filteredEmployees(), type:'overall' };

  const renderScoreCard = (item, isOverall=false) => {
    const [txt,cls]=(isOverall || item.type !== 'person') ? orgRiskBadge(item.score) : riskBadge(item.score);
    const active = !isOverall && getLeaveCauseMode()!=='person' && (STATE.leaveCauseFocus === item.name);
    const overallActive = isOverall && STATE.leaveCauseFocus === '전체';
    const targetName = isOverall ? '전체' : item.name;
    const summary = isOverall ? '선택된 범위 기준 전체 조직 위험 점수' : getOrgRiskItemSummary(item);
    return `<div class="rowCard clickable ${isOverall?'orgRiskOverallCard':''} ${active || overallActive ? 'active' : ''}" data-leave-cause-target="${targetName}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><strong>${isOverall?'전체 조직 평균':item.name}</strong><div class="sub" style="margin-top:4px">${summary}</div></div><span class="badge ${cls}">${txt}</span></div>
      ${orgRiskScaleHtml(item.score, txt)}
      <div class="orgRiskScoreLabel"><span class="score">${isOverall?'전체 점수':'위험점수'} ${item.score} / 100</span><span class="summary">${isOverall?'현재 필터 기준':summary}</span></div>
    </div>`;
  };

  $('#scoreList').innerHTML = [renderScoreCard(overallItem, true)].concat(scoreItems.map(item=>renderScoreCard(item,false))).join('');

  $('#scoreList').querySelectorAll('[data-leave-cause-target]').forEach(card => {
    card.onclick = () => {
      STATE.leaveCauseFocus = card.getAttribute('data-leave-cause-target') || '';
      renderRisk(scoped);
    };
  });

  $('#riskInsightList').innerHTML = buildOrgRiskInsights(overallItem, scoreItems).map((item,i)=>`<div class="alertCard orgRiskInsightCard ${item.cls}"><div style="font-weight:800;margin-bottom:8px">${item.title}</div><div class="desc">${item.text}</div></div>`).join('');
}


function renderPeople(scoped){
  if(!scoped.length){
    $('#peopleList').innerHTML = `<div class="alertCard"><div style="font-weight:800;margin-bottom:8px">안내</div><div class="desc">현재 표시할 위험지수 상위 담당자 데이터가 없습니다.</div></div>`;
    return;
  }
  const top = [...scoped].sort((a,b)=>b.scopedRisk-a.scopedRisk);
  $('#peopleList').innerHTML = top.map(item=>{
    const [txt,cls]=riskBadge(item.scopedRisk);
    const dailyTotalLoad = toSafeNumber(
      item.scopedDailyTotalLoad ||
      (toSafeNumber(item.scopedDailyBaseWorkHours || 0) + toSafeNumber(item.scopedDailyOvertime || 0) + toSafeNumber(item.scopedDailyHiddenOvertime || 0)) ||
      item.avgTotalLoad || 0
    );
    const recoveryIndex = getRecoveryIndex(item);
    const [recoveryText, recoveryCls] = recoveryBadge(recoveryIndex);
    const recoveryColor = recoveryCls === 'green' ? '#16a34a' : recoveryCls === 'amber' ? '#d97706' : '#ef4444';
    const issueDays = toSafeNumber(item.scopedIssueDays ?? item.issueDays ?? 0);
    const hiddenOvertime = toSafeNumber(item.scopedMonthlyHiddenOvertime ?? item.monthlyHiddenOvertime ?? 0);
    return `<div class="riskItem"><div><div style="display:flex;gap:8px;align-items:center"><strong>${item.name}</strong><span class="badge ${cls}">${txt}</span></div><div class="label" style="margin-top:6px">${item.division} / ${item.team} / ${item.grade}</div></div><div class="riskInlineMetrics"><div class="riskInlineItem"><span class="k">위험지수</span><span class="v">${item.scopedRisk}점</span></div><div class="riskInlineItem"><span class="k">총부하</span><span class="v">${dailyTotalLoad.toFixed(1)}h</span></div><div class="riskInlineItem"><span class="k">연장근로</span><span class="v">${item.scopedMonthlyOvertime}h</span></div><div class="riskInlineItem"><span class="k">이슈</span><span class="v">${issueDays.toFixed(0)}일</span></div><div class="riskInlineItem"><span class="k">숨은초과</span><span class="v">${hiddenOvertime.toFixed(1)}h</span></div><div class="riskInlineItem"><span class="k">근무</span><span class="v">${item.scopedMonthlyHours}h</span></div><div class="riskInlineItem"><span class="k">휴식</span><span class="v" style="color:${recoveryColor}">${recoveryIndex}점 (${recoveryText})</span></div></div></div>`;
  }).join('');
}




function getActiveDivisionsForTransfer(){
  return getActiveDivisions().map(d => ({
    code: d.divisionCode,
    name: d.divisionName,
    teams: getActiveTeams(d.divisionCode).map(t => ({
      code: t.teamCode,
      name: t.teamName
    }))
  }));
}
function populateTransferDivisionOptions(){
  const divisions = getActiveDivisionsForTransfer();
  const from = $('#transferFromDivision');
  const to = $('#transferToDivision');
  const prevFrom = from ? from.value : '';
  const prevTo = to ? to.value : '';
  const options = ['<option value="">선택</option>']
    .concat(divisions.map(d => `<option value="${d.code}">${d.name} (${d.code})</option>`))
    .join('');

  if(from){
    from.innerHTML = options;
    if(divisions.some(d => d.code === prevFrom)) from.value = prevFrom;
  }
  if(to){
    to.innerHTML = options;
    if(divisions.some(d => d.code === prevTo)) to.value = prevTo;
  }

  populateTransferTeamOptions('transferFromTeam', from ? from.value : '');
  populateTransferTeamOptions('transferToTeam', to ? to.value : '');
}
function populateTransferTeamOptions(targetId, divisionCode){
  const el = $('#' + targetId);
  if(!el) return;
  if(!divisionCode){
    el.innerHTML = '<option value="">선택</option>';
    return;
  }
  const teams = getActiveTeams(divisionCode).map(t => ({
    code: t.teamCode,
    name: t.teamName
  }));
  el.innerHTML = ['<option value="">선택</option>']
    .concat(teams.map(t => `<option value="${t.code}">${t.name} (${t.code})</option>`))
    .join('');
}
function getTransferCandidates(){
  const fromDiv = ($('#transferFromDivision')?.value || '').trim();
  const fromTeam = ($('#transferFromTeam')?.value || '').trim();
  const keyword = ($('#transferKeyword')?.value || '').trim().toLowerCase();

  if(!fromDiv || !fromTeam) return [];

  return empMaster.filter(emp => {
    const sameOrg = emp.divisionCode === fromDiv && emp.teamCode === fromTeam;
    const sameKeyword = !keyword || emp.id.toLowerCase().includes(keyword) || emp.name.toLowerCase().includes(keyword);
    return sameOrg && sameKeyword;
  });
}
function renderTransferList(){
  const box = $('#transferList');
  if(!box) return;
  const items = getTransferCandidates();
  const selectedCount = empMaster.filter(x => x._checked).length;
  const countEl = $('#transferSelectedCount');
  if(countEl) countEl.textContent = selectedCount;

  const fromDiv = ($('#transferFromDivision')?.value || '').trim();
  const fromTeam = ($('#transferFromTeam')?.value || '').trim();

  if(!items.length){
    box.innerHTML = `<div class="transferEmpty">${(!fromDiv || !fromTeam) ? '변경 전 본부와 팀을 모두 선택해주세요.' : '검색된 사원이 없습니다.'}</div>`;
    return;
  }

  box.innerHTML = `
    <div class="transferRow head">
      <div></div><div>사번</div><div>이름</div><div>현재 본부</div><div>현재 팀</div><div>직급</div>
    </div>
    ${items.map(emp => `
      <label class="transferRow">
        <div><input type="checkbox" ${emp._checked ? 'checked' : ''} onchange="toggleTransferSelection('${emp.id}', this.checked)"></div>
        <div>${emp.id}</div>
        <div><strong>${emp.name}</strong></div>
        <div>${emp.division}</div>
        <div>${emp.team}</div>
        <div>${emp.grade}</div>
      </label>
    `).join('')}
  `;
}
window.toggleTransferSelection = function(id, checked){
  const emp = empMaster.find(x => x.id === id);
  if(emp) emp._checked = checked;
  const countEl = $('#transferSelectedCount');
  if(countEl) countEl.textContent = empMaster.filter(x => x._checked).length;
}
function transferSelectAll(flag){
  getTransferCandidates().forEach(emp => { emp._checked = flag; });
}
function applyTransferChanges(){
  const selected = empMaster.filter(x => x._checked);
  if(!selected.length){
    alert('변경할 사원을 먼저 선택해주세요.');
    return;
  }

  const toDiv = ($('#transferToDivision')?.value || '').trim();
  const toTeam = ($('#transferToTeam')?.value || '').trim();
  if(!toDiv || !toTeam){
    alert('변경 후 본부와 팀을 선택해주세요.');
    return;
  }

  const div = getDivisionByCode(toDiv);
  const team = getTeamByCode(toDiv, toTeam);
  if(!div || !team){
    alert('변경 후 조직 정보를 찾을 수 없습니다.');
    return;
  }

  if(!confirm(`선택한 ${selected.length}명의 소속을 ${div.divisionName} / ${team.teamName} 으로 변경할까요?`)){
    return;
  }

  selected.forEach(emp => {
    emp.divisionCode = div.divisionCode;
    emp.division = div.divisionName;
    emp.teamCode = team.teamCode;
    emp.team = team.teamName;
    emp._checked = false;
  });

  saveEmpMaster();
  syncDashboardDataFromEmpMaster();
  render();
  alert('선택 인원의 팀 변경이 완료되었습니다.');
}
function bindTransferTabEvents(){

  $('#seedTestDataBtn')?.addEventListener('click', seedTestData);
  $('#clearTestDataBtn')?.addEventListener('click', clearTestData);

  $('#transferFromDivision')?.addEventListener('change', (e) => {
    populateTransferTeamOptions('transferFromTeam', e.target.value);
    $('#transferFromTeam').value = '';
    });
  $('#transferToDivision')?.addEventListener('change', (e) => {
    populateTransferTeamOptions('transferToTeam', e.target.value);
    $('#transferToTeam').value = '';
  });
  $('#transferFromTeam')?.addEventListener('change', renderTransferList);
  $('#transferKeyword')?.addEventListener('input', renderTransferList);
  $('#transferSearchBtn')?.addEventListener('click', renderTransferList);
  $('#transferSelectAllBtn')?.addEventListener('click', () => transferSelectAll(true));
  $('#transferClearAllBtn')?.addEventListener('click', () => transferSelectAll(false));
  $('#transferApplyBtn')?.addEventListener('click', applyTransferChanges);
}



let specialNotes = [];

function mapDbSpecialNote(row){
  const divisionCode = String(row?.division_code || '').trim();
  const teamCode = String(row?.team_code || '').trim();
  const employeeId = String(row?.employee_no || '').trim();
  const mappedDivision = getDivisionByCode(divisionCode);
  const mappedTeam = getTeamByCode(divisionCode, teamCode);
  const mappedEmp = empMaster.find(x => String(x.id || '').trim() === employeeId);
  const createdAt = row?.created_at || '';
  return {
    id: String(row?.id ?? ''),
    divisionCode,
    division: mappedDivision?.divisionName || String(row?.division_name || '').trim() || divisionCode,
    teamCode,
    team: mappedTeam?.teamName || String(row?.team_name || '').trim() || teamCode,
    employeeId,
    employeeName: normalizeEmployeeName(row?.employee_name || mappedEmp?.name || ''),
    startDate: String(row?.start_date || '').trim(),
    endDate: String(row?.end_date || '').trim(),
    specialType: String(row?.issue_type || '').trim(),
    standardTime: String(row?.total_work_hours || '').trim(),
    remark: String(row?.note || '').trim(),
    createdAt,
    createdAtLabel: createdAt ? String(createdAt).replace('T',' ').slice(0,16) : '',
    updatedAt: String(row?.updated_at || '').trim(),
    updatedAtLabel: row?.updated_at ? String(row.updated_at).replace('T',' ').slice(0,16) : ''
  };
}
async function loadSpecialNotes(){
  if(!supabaseClient){
    console.error('Supabase client가 없어 특이사항을 불러올 수 없습니다.');
    specialNotes = [];
    return;
  }
  try{
    const { data, error } = await supabaseClient
      .from('employee_special_notes')
      .select('*')
      .order('created_at', { ascending:false });
    if(error) throw error;
    specialNotes = Array.isArray(data) ? data.map(mapDbSpecialNote) : [];
  }catch(e){
    console.error('employee_special_notes 조회 실패:', e);
    specialNotes = [];
  }
}
async function saveSpecialNotes(){
  return;
}
function getActiveEmployeesForSpecial(divisionCode='', teamCode=''){
  return empMaster
    .filter(emp => emp.status !== '퇴사')
    .filter(emp => !divisionCode || emp.divisionCode === divisionCode)
    .filter(emp => !teamCode || emp.teamCode === teamCode)
    .sort((a,b) => (Number(a.sortOrder||0) - Number(b.sortOrder||0)) || String(a.name||'').localeCompare(String(b.name||''),'ko'));
}
function populateSpecialDivisionOptions(){
  const el = $('#specialDivision');
  if(!el) return;
  const prev = el.value || '';
  const divisions = getActiveDivisions();
  el.innerHTML = ['<option value="">선택</option>']
    .concat(divisions.map(div => `<option value="${div.divisionCode}">${div.divisionName} (${div.divisionCode})</option>`))
    .join('');
  if(divisions.some(div => div.divisionCode === prev)) el.value = prev;
}
function populateSpecialTeamOptions(divisionCode){
  const el = $('#specialTeam');
  if(!el) return;
  const prev = el.value || '';
  const teams = divisionCode ? getActiveTeams(divisionCode) : [];
  el.innerHTML = ['<option value="">선택</option>']
    .concat(teams.map(team => `<option value="${team.teamCode}">${team.teamName} (${team.teamCode})</option>`))
    .join('');
  if(teams.some(team => team.teamCode === prev)) el.value = prev;
}
function populateSpecialEmployeeOptions(){
  const divisionCode = ($('#specialDivision')?.value || '').trim();
  const teamCode = ($('#specialTeam')?.value || '').trim();
  const el = $('#specialEmployee');
  if(!el) return;
  const prev = el.value || '';
  const items = getActiveEmployeesForSpecial(divisionCode, teamCode);
  el.innerHTML = ['<option value="">선택</option>']
    .concat(items.map(emp => `<option value="${emp.id}">${emp.name}</option>`))
    .join('');
  if(items.some(emp => emp.id === prev)) el.value = prev;
  syncSpecialEmployeeId();
}
function syncSpecialEmployeeId(){
  const empId = ($('#specialEmployee')?.value || '').trim();
  const emp = empMaster.find(x => x.id === empId);
  const input = $('#specialEmployeeId');
  if(input) input.value = emp ? emp.id : '';
}

function setSpecialFormMode(isEdit){
  if($('#specialSaveBtn')) $('#specialSaveBtn').textContent = isEdit ? '특이사항 수정저장' : '특이사항 저장';
  if($('#specialCancelEditBtn')) $('#specialCancelEditBtn').style.display = isEdit ? '' : 'none';
}
function findApplicableSpecialNote(row){
  const targetDate = String(row?.date || '').trim();
  if(!targetDate || !Array.isArray(specialNotes) || !specialNotes.length) return null;

  const candidateEmployeeIds = [
    String(row?.employeeId || '').trim(),
    String(row?.id || '').trim()
  ].filter(Boolean);
  const candidateNames = [
    normalizeEmployeeName(row?.name || ''),
    normalizeEmployeeName(row?.employeeName || '')
  ].filter(Boolean);

  return specialNotes.find(item => {
    if(!item) return false;
    const startDate = String(item.startDate || '').trim();
    const endDate = String(item.endDate || '').trim();
    const itemEmployeeId = String(item.employeeId || '').trim();
    const itemEmployeeName = normalizeEmployeeName(item.employeeName || '');

    const matchedEmployee = (itemEmployeeId && candidateEmployeeIds.includes(itemEmployeeId))
      || (itemEmployeeName && candidateNames.includes(itemEmployeeName));
    if(!matchedEmployee) return false;
    if(startDate && targetDate < startDate) return false;
    if(endDate && targetDate > endDate) return false;
    return true;
  }) || null;
}
function getAppliedShortWorkRule(row){
  const item = findApplicableSpecialNote(row);
  if(!item) return null;
  if(String(item.specialType || '').trim() !== '단축근무') return null;
  const standardTime = String(item.standardTime || '').trim();
  const standardHours = parseWorkDurationToHours(standardTime);
  if(standardHours === null) return null;
  return { item, standardTime, standardHours };
}
function formatSpecialWorkTimeInput(value){
  const digits = String(value || '').replace(/\D/g, '').slice(0,4);
  if(!digits) return '';
  if(digits.length <= 2) return digits;
  return `${digits.slice(0,2)}:${digits.slice(2)}`;
}
function toggleSpecialStandardTimeField(){
  const type = ($('#specialType')?.value || '').trim();
  const input = $('#specialStandardTime');
  if(!input) return;
  const enabled = type === '단축근무';
  input.disabled = !enabled;
  input.placeholder = enabled ? '예: 0600 또는 06:00' : '단축근무 선택 시 입력';
  if(!enabled) input.value = '';
}
function fillSpecialFormFromItem(item){
  if(!item) return;
  if($('#specialEditId')) $('#specialEditId').value = item.id || '';
  if($('#specialDivision')) $('#specialDivision').value = item.divisionCode || '';
  populateSpecialTeamOptions(item.divisionCode || '');
  if($('#specialTeam')) $('#specialTeam').value = item.teamCode || '';
  populateSpecialEmployeeOptions();
  if($('#specialEmployee')) $('#specialEmployee').value = item.employeeId || '';
  syncSpecialEmployeeId();
  if($('#specialStartDate')) $('#specialStartDate').value = item.startDate || '';
  if($('#specialEndDate')) $('#specialEndDate').value = item.endDate || '';
  if($('#specialType')) $('#specialType').value = item.specialType || '';
  if($('#specialStandardTime')) $('#specialStandardTime').value = formatSpecialWorkTimeInput(item.standardTime || '');
  toggleSpecialStandardTimeField();
  if($('#specialRemark')) $('#specialRemark').value = item.remark || '';
  setSpecialFormMode(true);
}
window.editSpecialNote = function(id){
  const item = specialNotes.find(x => x.id === id);
  if(!item) return;
  fillSpecialFormFromItem(item);
}
function resetSpecialForm(){
  if($('#specialEditId')) $('#specialEditId').value = '';
  if($('#specialDivision')) $('#specialDivision').value = '';
  populateSpecialTeamOptions('');
  if($('#specialTeam')) $('#specialTeam').value = '';
  populateSpecialEmployeeOptions();
  if($('#specialEmployee')) $('#specialEmployee').value = '';
  if($('#specialEmployeeId')) $('#specialEmployeeId').value = '';
  if($('#specialStartDate')) $('#specialStartDate').value = '';
  if($('#specialEndDate')) $('#specialEndDate').value = '';
  if($('#specialType')) $('#specialType').value = '';
  if($('#specialStandardTime')) $('#specialStandardTime').value = '';
  toggleSpecialStandardTimeField();
  if($('#specialRemark')) $('#specialRemark').value = '';
  setSpecialFormMode(false);
}
function renderSpecialNotes(){
  const tbody = $('#specialTbody');
  const empty = $('#specialEmpty');
  const count = $('#specialCount');
  if(!tbody || !empty) return;
  if(count) count.textContent = String(specialNotes.length);
  if(!specialNotes.length){
    tbody.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = [...specialNotes].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
    .map(item => `
      <tr>
        <td>${item.division || '-'}</td>
        <td>${item.team || '-'}</td>
        <td>${item.employeeId || '-'}</td>
        <td><strong>${item.employeeName || '-'}</strong></td>
        <td>${item.specialType || '-'}</td>
        <td>${item.startDate && item.endDate ? `${item.startDate} ~ ${item.endDate}` : (item.startDate ? `${item.startDate} ~` : '-') }</td>
        <td>${item.standardTime || '-'}</td>
        <td>${item.remark || '-'}</td>
        <td>${item.updatedAtLabel ? `${item.createdAtLabel || '-'} / 수정 ${item.updatedAtLabel}` : (item.createdAtLabel || '-')}</td>
        <td>
          <button type="button" onclick="editSpecialNote('${item.id}')">수정</button>
          <button type="button" onclick="deleteSpecialNote('${item.id}')">삭제</button>
        </td>
      </tr>
    `).join('');
}
window.deleteSpecialNote = async function(id){
  const item = specialNotes.find(x => x.id === id);
  if(!item) return;
  if(!confirm(`${item.employeeName} / ${item.specialType} 특이사항을 삭제할까요?`)) return;

  if(!supabaseClient || !String(id).trim() || !/^\d+$/.test(String(id).trim())){
    alert('배포용에서는 서버 저장 특이사항만 삭제할 수 있습니다.');
    return;
  }

  try{
    const { error } = await supabaseClient
      .from('employee_special_notes')
      .delete()
      .eq('id', Number(id));
    if(error) throw error;
  }catch(e){
    console.error('employee_special_notes 삭제 실패:', e);
    alert('DB 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  await loadSpecialNotes();
  renderSpecialNotes();
  renderAttendanceTab();
}
async function saveSpecialNoteEntry(){
  const divisionCode = ($('#specialDivision')?.value || '').trim();
  const teamCode = ($('#specialTeam')?.value || '').trim();
  const employeeId = ($('#specialEmployee')?.value || '').trim();
  const startDate = ($('#specialStartDate')?.value || '').trim();
  const endDate = ($('#specialEndDate')?.value || '').trim();
  const specialType = ($('#specialType')?.value || '').trim();
  const standardTime = formatSpecialWorkTimeInput(($('#specialStandardTime')?.value || '').trim());
  const remark = ($('#specialRemark')?.value || '').trim();

  const division = getDivisionByCode(divisionCode);
  const team = getTeamByCode(divisionCode, teamCode);
  const emp = empMaster.find(x => x.id === employeeId);

  if(!divisionCode || !division){
    alert('본부를 선택해주세요.');
    return;
  }
  if(!teamCode || !team){
    alert('팀을 선택해주세요.');
    return;
  }
  if(!employeeId || !emp){
    alert('담당자를 선택해주세요.');
    return;
  }
  if(!specialType){
    alert('특이사항을 선택해주세요.');
    return;
  }
  if(specialType === '단축근무' && !standardTime){
    alert('단축근무는 총 근무시간을 입력해주세요.');
    return;
  }
  if(specialType === '단축근무' && !/^\d{2}:\d{2}$/.test(standardTime)){
    alert('총 근무시간은 00:00 형식으로 입력해주세요.');
    return;
  }
  if(!startDate){
    alert('적용 시작일을 입력해주세요.');
    return;
  }
  if(!endDate){
    alert('적용 종료일을 입력해주세요.');
    return;
  }
  if(endDate < startDate){
    alert('적용 종료일은 시작일보다 빠를 수 없습니다.');
    return;
  }
  if(!supabaseClient){
    alert('배포용에서는 서버 연결이 필요합니다. Supabase 연결 상태를 확인해주세요.');
    return;
  }

  const editId = ($('#specialEditId')?.value || '').trim();
  const payload = {
    division_code: divisionCode,
    team_code: teamCode,
    employee_no: emp.id,
    employee_name: emp.name || null,
    issue_type: specialType,
    start_date: startDate,
    end_date: endDate,
    total_work_hours: standardTime || null,
    note: remark || null
  };

  try{
    if(editId && /^\d+$/.test(editId)){
      const { error } = await supabaseClient
        .from('employee_special_notes')
        .update(payload)
        .eq('id', Number(editId));
      if(error) throw error;
      alert('특이사항이 수정되었습니다.');
    }else{
      const { error } = await supabaseClient
        .from('employee_special_notes')
        .insert(payload);
      if(error) throw error;
      alert('특이사항이 저장되었습니다.');
    }

    await loadSpecialNotes();
    renderSpecialNotes();
    renderAttendanceTab();
    resetSpecialForm();
  }catch(e){
    console.error('employee_special_notes 저장 실패:', e);
    alert('DB 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}
async function bindSpecialTabEvents(){
  await loadSpecialNotes();
  populateSpecialDivisionOptions();
  populateSpecialTeamOptions('');
  populateSpecialEmployeeOptions();
  renderSpecialNotes();

  $('#specialDivision')?.addEventListener('change', (e) => {
    populateSpecialTeamOptions(e.target.value);
    if($('#specialTeam')) $('#specialTeam').value = '';
    populateSpecialEmployeeOptions();
  });
  $('#specialTeam')?.addEventListener('change', populateSpecialEmployeeOptions);
  $('#specialEmployee')?.addEventListener('change', syncSpecialEmployeeId);
  $('#specialType')?.addEventListener('change', toggleSpecialStandardTimeField);
  $('#specialStandardTime')?.addEventListener('input', (e) => {
    e.target.value = formatSpecialWorkTimeInput(e.target.value);
  });
  toggleSpecialStandardTimeField();
  $('#specialSaveBtn')?.addEventListener('click', saveSpecialNoteEntry);
  $('#specialResetBtn')?.addEventListener('click', resetSpecialForm);
  $('#specialCancelEditBtn')?.addEventListener('click', resetSpecialForm);
}

function bindAdminSubTabs(){
  return;
}



const ERP_CONTINUOUS_REASONS = ['육아휴직','출산휴가','산전후휴가','병가','휴직','가족돌봄휴직','장기휴직'];
const ERP_DAILY_REASONS = ['연차','반차','외근','출장','조퇴','결근','오후외근','오전외근','리프레쉬'];

function isHolidayDateByRows(dateText, rows){
  const raw = String(dateText || '').trim();
  if(!raw) return false;

  const d = new Date(raw);
  if(!Number.isNaN(d.getTime())){
    const day = d.getDay();
    if(day === 0 || day === 6) return true;
  }

  const sameDay = (Array.isArray(rows) ? rows : []).filter(r => String(r?.date || '').trim() === raw);
  return sameDay.some(r => {
    const text = [
      String(r?.status || '').trim(),
      String(r?.reason || '').trim(),
      String(r?.erpReason || '').trim()
    ].join(' ');
    return text.includes('공휴일') || text.includes('휴일') || text.includes('휴무일');
  });
}

function isWeekendLabel(dayText){
  return ['토','일','토요일','일요일'].includes(dayText);
}
function normalizeWeekendReason(dayType, erpReason){
  const reason = String(erpReason || '').trim();
  if(!reason) return { status:'정상', displayReason:'-', excludeFromIssue:false };

  const isWeekend = dayType === '주말';
  if(!isWeekend){
    return { status:'근태사유', displayReason:reason, excludeFromIssue:false };
  }

  if(ERP_CONTINUOUS_REASONS.includes(reason)){
    return { status:'근태사유', displayReason:`주말 ${reason}`, excludeFromIssue:true };
  }

  if(ERP_DAILY_REASONS.includes(reason)){
    return { status:'근태사유', displayReason:`주말 ${reason}(검토)`, excludeFromIssue:false };
  }

  return { status:'근태사유', displayReason:`주말 ${reason}`, excludeFromIssue:false };
}

function attendanceStatusBadge(status){
  if(status === '정상' || status === '정상출퇴근') return '<span class="badge green">정상출퇴근</span>';
  if(status === '주의') return '<span class="badge amber">주의</span>';
  if(status === '문제') return '<span class="badge red">문제</span>';
  return '<span class="attBadge blue">' + status + '</span>';
}

function buildHolidayDateSet(){
  const set = new Set();
  const rows = (typeof REAL_ATTENDANCE_DATA !== 'undefined' && Array.isArray(REAL_ATTENDANCE_DATA))
    ? REAL_ATTENDANCE_DATA
    : [];

  const byDate = new Map();
  rows.forEach(r => {
    const date = String(r.date || '').trim();
    if(!date) return;
    if(!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(r);
  });

  byDate.forEach((sameDay, date) => {
    const d = new Date(date);
    if(!Number.isNaN(d.getTime())){
      const day = d.getDay();
      if(day === 0 || day === 6){
        set.add(date);
        return;
      }
    }
    const hasHolidayStatus = sameDay.some(r => {
      const text = [
        String(r.status || '').trim(),
        String(r.erpReason || '').trim(),
        String(r.reason || '').trim()
      ].join(' ');
      return text.includes('공휴일') || text.includes('휴일') || text.includes('휴무일');
    });
    if(hasHolidayStatus) set.add(date);
  });

  return set;
}
let HOLIDAY_DATE_SET = buildHolidayDateSet();

function formatHoursToHM(h){
  if(h === null || h === undefined) return '미계산';
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}:${String(mm).padStart(2,'0')}`;
}

function parseWorkDurationToHours(v){
  const s = String(v || '').trim();
  if(!s || s === '-' || s === '미계산' || s === '미입력') return null;
  const hm = s.match(/^(\d{1,3}):(\d{2})$/);
  if(hm){
    const h = Number(hm[1]) + Number(hm[2]) / 60;
    return h > 48 ? null : h;
  }
  const hh = s.match(/^(\d+(?:\.\d+)?)h$/i);
  if(hh){
    const h = Number(hh[1]);
    return h > 48 ? null : h;
  }
  const n = Number(s);
  if(!Number.isFinite(n) || n < 0 || n > 48) return null;
  return n;
}

function timeStrToMinutes(v){
  const s = String(v || '').trim();
  if(!s || s === '-') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ✅ 조기출근 보정
// 08:00 이전(08:00 포함) 출근은 화면 표시와 근무시간 계산 기준을 모두 08:00으로 맞춘다.
// 단, 원본 startRaw 값은 덮어쓰지 않고 표시/계산 단계에서만 보정한다.
function normalizeEarlyStartToEight(value){
  const min = timeStrToMinutes(value);
  if(min === null) return value;
  return min <= 8 * 60 ? '08:00' : String(value || '').trim();
}

// ✅ 오전반차 근무시간 계산
// 오전반차는 오후 근무 기준 시작을 13:00으로 보고, 퇴근시간까지 실제 근무한 만큼 계산한다.
// 예) 16:50 => 3:50, 17:00 => 4:00, 17:30 => 4:30
function calcMorningHalfDayWorkText(endText){
  const endMinRaw = timeStrToMinutes(endText);
  if(endMinRaw === null) return '';
  const startMin = 13 * 60;
  let endMin = endMinRaw;
  if(endMin < startMin) endMin += 24 * 60;
  return formatHoursToHM(Math.max(0, (endMin - startMin) / 60));
}

// ✅ 오후반차 근무시간 계산
// 오후반차는 오전 근무 기준을 08:00~12:00으로 보고, 점심시간 차감 없이 4:00으로 고정한다.
// 오전반차(13:00~17:00 = 4:00)와 반차 인정 기준을 대칭으로 맞춘다.
function calcAfternoonHalfDayWorkText(){
  return '4:00';
}
function minutesToHourText(mins){
  if(mins === null || mins === undefined || mins === '') return '-';
  const totalMin = Math.max(0, Math.round(Number(mins)));
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}:${String(mm).padStart(2,'0')}`;
}
function buildOvertimeCheckStorageKeys(row){
  const rid = String(row?.recordId || row?.id || '').trim();
  const date = String(row?.date || '').trim();
  const empId = String(row?.employeeId || '').trim();
  const name = String(row?.name || '').trim();
  const keys = [];
  if(rid) keys.push(`otcheck:${rid}`);
  if(date && empId) keys.push(`otcheck:${date}:${empId}`);
  if(date && name) keys.push(`otcheck:${date}:${name}`);
  return keys;
}

function getSavedOvertimeCheckOverride(rowOrRecordId){
  try{
    if(typeof rowOrRecordId === 'string' || typeof rowOrRecordId === 'number'){
      const rid = String(rowOrRecordId || '').trim();
      return rid ? String(localStorage.getItem(`otcheck:${rid}`) || '').trim() : '';
    }
    const keys = buildOvertimeCheckStorageKeys(rowOrRecordId || {});
    for(const key of keys){
      const v = String(localStorage.getItem(key) || '').trim();
      if(v) return v;
    }
    return '';
  }catch(_e){
    return '';
  }
}

function buildApprovedOvertimeStorageKeys(row){
  const rid = String(row?.recordId || row?.id || '').trim();
  const date = String(row?.date || '').trim();
  const empId = String(row?.employeeId || '').trim();
  const name = String(row?.name || '').trim();
  const keys = [];
  if(rid) keys.push(`approvedOt:${rid}`);
  if(date && empId) keys.push(`approvedOt:${date}:${empId}`);
  if(date && name) keys.push(`approvedOt:${date}:${name}`);
  return keys;
}
function getSavedApprovedOvertimeOverride(rowOrRecordId){
  try{
    if(typeof rowOrRecordId === 'string' || typeof rowOrRecordId === 'number'){
      const rid = String(rowOrRecordId || '').trim();
      return rid ? String(localStorage.getItem(`approvedOt:${rid}`) || '').trim() : '';
    }
    const keys = buildApprovedOvertimeStorageKeys(rowOrRecordId || {});
    for(const key of keys){
      const v = String(localStorage.getItem(key) || '').trim();
      if(v) return v;
    }
    return '';
  }catch(_e){
    return '';
  }
}


let PENDING_OVERTIME_CHECK_CHANGES = {};
let PENDING_APPROVED_OVERTIME_CHANGES = {};
let PENDING_ABSENCE_DECISION_CHANGES = {};

function getPendingOvertimeCheck(recordId){
  const rid = String(recordId || '').trim();
  if(!rid) return '';
  return String(PENDING_OVERTIME_CHECK_CHANGES[rid] || '').trim();
}

function getPendingApprovedOvertime(recordId){
  const rid = String(recordId || '').trim();
  if(!rid) return '';
  return String(PENDING_APPROVED_OVERTIME_CHANGES[rid] || '').trim();
}

function getPendingAbsenceDecision(recordId){
  const rid = String(recordId || '').trim();
  if(!rid) return '';
  return String(PENDING_ABSENCE_DECISION_CHANGES[rid] || '').trim();
}

function getDefaultApprovedOvertimeValue(row, overtimeCheckValue){
  const checkValue = String(overtimeCheckValue || '').trim();
  const recordId = String(row?.recordId || '').trim();
  const erpApproved = String(row?.erpOTDisplay || '').trim();

  // ✅ OT확인을 '인정'으로 되돌릴 때는 부분인정에서 입력/생성된 pending/local 값을 보지 않고
  // ERP 실제연장 시간을 다시 기준값으로 복구한다. (예: 4:30 → 부분인정 0:00 → 인정 4:30)
  if(checkValue === '인정'){
    return (erpApproved && erpApproved !== '-') ? erpApproved : '0:00';
  }

  if(checkValue === '미인정'){
    return '0:00';
  }

  const pendingApproved = getPendingApprovedOvertime(recordId);
  const savedApproved = String(pendingApproved || row?.approvedOvertimeDisplay || row?.approved_overtime_override || getSavedApprovedOvertimeOverride(row) || '').trim();

  if(checkValue === '부분인정'){
    if(savedApproved && savedApproved !== '-') return savedApproved;
    if(String(row?.seccomOTDisplay || '').trim() && String(row.seccomOTDisplay).trim() !== '미계산'){
      return String(row.seccomOTDisplay).trim();
    }
    if(erpApproved && erpApproved !== '-') return erpApproved;
    return '0:00';
  }
  return savedApproved;
}

function markOvertimeCheckChanged(recordId, value){
  if(!canEditAttendanceManualChecks()){
    alert('관리자 또는 운영자만 OT확인을 수정할 수 있습니다.');
    return;
  }
  console.log('[OTCHECK] pending changed', { recordId, value });
  const rid = String(recordId || '').trim();
  const nextValue = String(value || '').trim();
  if(!rid) return;

  PENDING_OVERTIME_CHECK_CHANGES[rid] = nextValue;

  if(Array.isArray(REAL_ATTENDANCE_DATA)){
    REAL_ATTENDANCE_DATA = REAL_ATTENDANCE_DATA.map(row => {
      if(String(row.recordId || '') !== rid) return row;
      const approvedOvertimeValue = getDefaultApprovedOvertimeValue(row, nextValue);
      if(nextValue === '인정'){
        // ✅ 인정으로 재변경 시 기존 부분인정값(0:00 등)을 무시하고 ERP OT로 즉시 복구
        PENDING_APPROVED_OVERTIME_CHANGES[rid] = approvedOvertimeValue;
      } else if(nextValue === '미인정'){
        PENDING_APPROVED_OVERTIME_CHANGES[rid] = '0:00';
      } else if(nextValue === '부분인정' && !getPendingApprovedOvertime(rid)){
        PENDING_APPROVED_OVERTIME_CHANGES[rid] = approvedOvertimeValue;
      }
      const displayApprovedOvertime = nextValue === '인정'
        ? approvedOvertimeValue
        : (PENDING_APPROVED_OVERTIME_CHANGES[rid] || approvedOvertimeValue);
      return {
        ...row,
        overtimeCheckResult: nextValue,
        overtime_check_result: nextValue,
        overtimeCheck: nextValue,
        approvedOvertimeDisplay: displayApprovedOvertime
      };
    });
  }

  render();
}

function markApprovedOvertimeChanged(recordId, value){
  if(!canEditAttendanceManualChecks()){
    alert('관리자 또는 운영자만 OT확인을 수정할 수 있습니다.');
    return;
  }
  const rid = String(recordId || '').trim();
  const nextValue = String(value || '').trim();
  if(!rid) return;
  PENDING_APPROVED_OVERTIME_CHANGES[rid] = nextValue;
  if(Array.isArray(REAL_ATTENDANCE_DATA)){
    REAL_ATTENDANCE_DATA = REAL_ATTENDANCE_DATA.map(row =>
      String(row.recordId || '') === rid
        ? { ...row, approvedOvertimeDisplay: nextValue }
        : row
    );
  }
  render();
}

async function saveOvertimeCheckChanges(){
  console.log('[SAVE BUTTON] clicked');

  if(!canEditAttendanceManualChecks()){
    alert('관리자 또는 운영자만 결근확인/OT확인을 저장할 수 있습니다.');
    return;
  }

  if(!supabaseClient){
    alert('Supabase 연결이 필요합니다.');
    return;
  }

  const overtimeEntries = Object.entries(PENDING_OVERTIME_CHECK_CHANGES || {});
  const approvedEntries = Object.entries(PENDING_APPROVED_OVERTIME_CHANGES || {});
  const absenceEntries = Object.entries(PENDING_ABSENCE_DECISION_CHANGES || {});
  const targetIds = Array.from(new Set([
    ...overtimeEntries.map(([rid]) => String(rid)),
    ...approvedEntries.map(([rid]) => String(rid)),
    ...absenceEntries.map(([rid]) => String(rid))
  ].filter(Boolean)));

  console.log('[SAVE BUTTON] pending entries', {
    overtime: overtimeEntries,
    approvedOvertime: approvedEntries,
    absence: absenceEntries
  });

  if(!targetIds.length){
    alert('저장할 변경이 없습니다.');
    return;
  }

  for(const rid of targetIds){
    const targetRow = Array.isArray(REAL_ATTENDANCE_DATA)
      ? REAL_ATTENDANCE_DATA.find(row => String(row.recordId || '') === String(rid))
      : null;
    const payload = {};

    if(Object.prototype.hasOwnProperty.call(PENDING_OVERTIME_CHECK_CHANGES, rid)){
      payload.overtime_check_result = String(PENDING_OVERTIME_CHECK_CHANGES[rid] || '').trim() || null;
    }

    if(Object.prototype.hasOwnProperty.call(PENDING_APPROVED_OVERTIME_CHANGES, rid)){
      payload.approved_overtime_override = String(PENDING_APPROVED_OVERTIME_CHANGES[rid] || '').trim() || null;
    }

    if(Object.prototype.hasOwnProperty.call(PENDING_ABSENCE_DECISION_CHANGES, rid)){
      payload.absence_decision = String(PENDING_ABSENCE_DECISION_CHANGES[rid] || '').trim() || null;
    }

    // OT확인을 바꿨는데 부분인정 시간 payload가 없는 경우에도 현재 화면값을 서버에 같이 보관한다.
    if(payload.overtime_check_result !== undefined && payload.approved_overtime_override === undefined){
      const approvedValue = String(
        PENDING_APPROVED_OVERTIME_CHANGES[rid] ||
        targetRow?.approvedOvertimeDisplay ||
        targetRow?.approved_overtime_override ||
        getSavedApprovedOvertimeOverride(targetRow || { recordId: rid }) ||
        ''
      ).trim();
      if(approvedValue) payload.approved_overtime_override = approvedValue;
    }

    const { error } = await supabaseClient
      .from('attendance_records')
      .update(payload)
      .eq('id', Number(rid));

    if(error){
      console.error('[SAVE BUTTON] row update failed', { rid, payload, error });
      alert(`저장 실패: ${rid}`);
      return;
    }

    // 기존 브라우저 캐시도 동기화하되, 이후 화면 표시 기준은 Supabase 서버값을 우선한다.
    try{
      if(targetRow){
        if(payload.overtime_check_result !== undefined){
          for(const key of buildOvertimeCheckStorageKeys(targetRow)){ localStorage.setItem(key, payload.overtime_check_result || ''); }
        }
        if(payload.approved_overtime_override !== undefined){
          for(const key of buildApprovedOvertimeStorageKeys(targetRow)){ localStorage.setItem(key, payload.approved_overtime_override || ''); }
        }
      }
      if(payload.absence_decision !== undefined){
        localStorage.setItem(`absenceDecision:${rid}`, payload.absence_decision || '');
      }
    }catch(e){
      console.warn('[SAVE BUTTON] localStorage sync skipped', e);
    }
  }

  PENDING_OVERTIME_CHECK_CHANGES = {};
  PENDING_APPROVED_OVERTIME_CHANGES = {};
  PENDING_ABSENCE_DECISION_CHANGES = {};

  try{
    await window.loadAttendanceFromSupabase();
  }catch(reloadError){
    console.error('[SAVE BUTTON] reload failed', reloadError);
  }

  render();
  alert('저장 완료');
}

window.saveOvertimeCheckChanges = saveOvertimeCheckChanges;
window.markOvertimeCheckChanged = markOvertimeCheckChanged;
window.markApprovedOvertimeChanged = markApprovedOvertimeChanged;
window.updateOvertimeCheckResult = updateOvertimeCheckResult;
window.markAbsenceDecisionChanged = markAbsenceDecisionChanged;

window.addEventListener('beforeunload', function(event){
  if(Object.keys(PENDING_OVERTIME_CHECK_CHANGES).length > 0 || Object.keys(PENDING_APPROVED_OVERTIME_CHANGES).length > 0 || Object.keys(PENDING_ABSENCE_DECISION_CHANGES).length > 0){
    event.preventDefault();
    event.returnValue = '';
  }
});


function getSavedAbsenceDecision(recordId){
  const rid = String(recordId || '').trim();
  if(!rid) return '';
  try{
    return String(localStorage.getItem(`absenceDecision:${rid}`) || '').trim();
  }catch(_e){
    return '';
  }
}

function markAbsenceDecisionChanged(recordId, value){
  if(!canEditAttendanceManualChecks()){
    alert('관리자 또는 운영자만 결근확인을 수정할 수 있습니다.');
    return;
  }
  const rid = String(recordId || '').trim();
  const nextValue = String(value || '').trim();
  if(!rid) return;
  PENDING_ABSENCE_DECISION_CHANGES[rid] = nextValue;
  if(Array.isArray(REAL_ATTENDANCE_DATA)){
    REAL_ATTENDANCE_DATA = REAL_ATTENDANCE_DATA.map(row =>
      String(row.recordId || '') === rid ? { ...row, absenceDecision: nextValue, absence_decision: nextValue } : row
    );
  }
  render();
}

function renderAbsenceCheckSelect(row){
  const isBothMissing = row?.displayStart === '출근누락' && row?.displayEnd === '퇴근누락';
  if(!isBothMissing) return '-';
  const recordId = String(row?.recordId || '').trim();
  const currentValue = String(getPendingAbsenceDecision(recordId) || row?.absenceDecision || row?.absence_decision || getSavedAbsenceDecision(recordId) || '결근').trim();
  const canEdit = canEditAttendanceManualChecks();
  const disabled = (!canEdit || !recordId) ? 'disabled' : '';
  const cls = canEdit ? '' : 'class="attManualReadonly" title="관리자 또는 운영자만 수정할 수 있습니다."';
  return `<select ${disabled} ${cls} data-record-id="${recordId}" onchange="markAbsenceDecisionChanged(this.dataset.recordId, this.value)">
    <option value="결근" ${currentValue==='결근'?'selected':''}>결근</option>
    <option value="정상근무" ${currentValue==='정상근무'?'selected':''}>정상근무</option>
  </select>`;
}

function isAutoOvertimeInvalidDisplayRow(row){
  const recordId = String(row?.recordId || row?.id || '').trim();
  const pendingOverride = String(getPendingOvertimeCheck(recordId) || '').trim();
  // 현재 화면에서 사용자가 직접 변경한 값은 즉시 우선한다.
  if(['인정','부분인정','미인정','확인필요'].includes(pendingOverride)) return false;

  const hasErpOvertime = String(row?.erpOTDisplay || '').trim() && String(row?.erpOTDisplay || '').trim() !== '-';
  if(hasErpOvertime && row?.autoOtInvalid === true) return true;

  const manualOverride = String(getSavedOvertimeCheckOverride(row) || '').trim();
  if(['부분인정','미인정','확인필요'].includes(manualOverride)) return false;
  // 과거 자동값으로 저장된 '인정'은 자동 미인정 판정 표시를 막지 않도록 아래 조건으로 계속 검증한다.

  const checkValue = String(row?.overtimeCheck || row?.overtimeCheckResult || row?.overtime_check_result || '').trim();
  const reasonText = String([row?.reason, row?.primaryReason, row?.secondaryReason].filter(Boolean).join(' '));
  const statusText = String(row?.statusLabel || row?.status || '').trim();
  return hasErpOvertime && checkValue === '미인정' && (reasonText.includes('연장근무 미인정') || statusText === '문제');
}

function renderOvertimeCheckSelect(row){
  const hasOvertime = !!String(row?.erpOTDisplay || '').trim();
  if(!hasOvertime){
    return '-';
  }
  const recordId = String(row?.recordId || '').trim();
  const pendingValue = getPendingOvertimeCheck(recordId);
  const localOverride = getSavedOvertimeCheckOverride(row);
  const serverOverride = String(row?.overtimeCheckResult || row?.overtime_check_result || row?.overtimeCheck || '').trim();
  const forcedAutoUnapproved = isAutoOvertimeInvalidDisplayRow(row);
  const currentValue = forcedAutoUnapproved
    ? '미인정'
    : String(pendingValue || serverOverride || localOverride || '인정').trim();
  const canEdit = canEditAttendanceManualChecks();
  const disabled = (!canEdit || !recordId) ? 'disabled' : '';
  const cls = canEdit ? '' : 'class="attManualReadonly" title="관리자 또는 운영자만 수정할 수 있습니다."';
  const normalizedCurrentValue = (currentValue === '확인필요') ? '미인정' : currentValue;
  return `<select ${disabled} ${cls} data-record-id="${recordId}" onchange="markOvertimeCheckChanged(this.dataset.recordId, this.value)">
    <option value="인정" ${normalizedCurrentValue==='인정'?'selected':''}>인정</option>
    <option value="부분인정" ${normalizedCurrentValue==='부분인정'?'selected':''}>부분인정</option>
    <option value="미인정" ${normalizedCurrentValue==='미인정'?'selected':''}>미인정</option>
  </select>`;
}

function renderApprovedOvertimeInput(row){
  const hasOvertime = !!String(row?.erpOTDisplay || '').trim();
  if(!hasOvertime) return '-';
  const recordId = String(row?.recordId || '').trim();
  const forcedAutoUnapproved = isAutoOvertimeInvalidDisplayRow(row);
  const currentCheck = forcedAutoUnapproved
    ? '미인정'
    : String(getPendingOvertimeCheck(recordId) || row?.overtimeCheckResult || row?.overtime_check_result || row?.overtimeCheck || getSavedOvertimeCheckOverride(row) || '').trim();
  const erpApproved = String(row?.erpOTDisplay || '').trim();
  const currentApproved = String(getPendingApprovedOvertime(recordId) || row?.approvedOvertimeDisplay || row?.approved_overtime_override || getSavedApprovedOvertimeOverride(row) || '').trim();
  if(currentCheck === '미인정'){
    return '-';
  }
  if(currentCheck === '부분인정'){
    const value = currentApproved && currentApproved !== '-' ? currentApproved : (String(row?.seccomOTDisplay || '').trim() && String(row.seccomOTDisplay).trim() !== '미계산' ? String(row.seccomOTDisplay).trim() : erpApproved);
    const canEdit = canEditAttendanceManualChecks();
    const disabled = (!canEdit || !recordId) ? 'disabled' : '';
    const cls = canEdit ? '' : 'attManualReadonly';
    const title = canEdit ? '' : '관리자 또는 운영자만 수정할 수 있습니다.';
    return `<input type="text" value="${value}" ${disabled} class="${cls}" title="${title}" data-record-id="${recordId}" placeholder="예: 1:30" style="width:86px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px" onchange="markApprovedOvertimeChanged(this.dataset.recordId, this.value)">`;
  }
  // ✅ 인정 상태에서는 저장/pending 된 부분인정값이 남아 있어도 ERP OT를 우선 표시
  if(currentCheck === '인정'){
    return (erpApproved && erpApproved !== '-') ? erpApproved : '0:00';
  }
  return currentApproved || erpApproved || '-';
}

async function updateOvertimeCheckResult(recordId, value){
  markOvertimeCheckChanged(recordId, value);
}



const ATT_FILTERS = { date:[], id:[], name:[], division:[], team:[], start:[], end:[], work:[], ot:[], otapproved:[], status:[], absencecheck:[], otcheck:[], reason:[] };

function isHolidayLike(reason){
  return ['공휴일','휴일','휴무일'].includes(String(reason || '').trim());
}
function isLeaveLike(reason){
  return ['육아휴직','출산휴가','산전후휴가','병가','가족돌봄휴직','장기휴직','휴직','연차','반차','오전반차','오후반차','공가','보건휴가','리프레쉬'].includes(String(reason || '').trim());
}

function isHalfDayVacationReason(reason){
  const s = normalizeAttendanceReasonText(reason);
  return ["오전반차","오후반차","반차"].some(k => s === k || s.includes(k));
}
function isVacationReason(reason){
  const s = normalizeAttendanceReasonText(reason);
  return ["연차휴가","연차","오전반차","오후반차","반차","리프레쉬"].some(k => s === k || s.includes(k));
}
function isRefreshLeaveReason(reason){
  const s = normalizeAttendanceReasonText(reason);
  return s === '리프레쉬' || s.includes('리프레쉬');
}
function isOutsideReason(reason){
  return ['외근','출장','오전외근','오후외근'].includes(String(reason || '').trim());
}
const ATTENDANCE_CONTINUOUS_LEAVE_KEYWORDS = ['육아휴직','출산휴가','산전후휴가','병가','가족돌봄휴직','장기휴직','휴직'];
function isContinuousLeaveReason(reason){
  const s = normalizeAttendanceReasonText(reason);
  if(!s) return false;
  return ATTENDANCE_CONTINUOUS_LEAVE_KEYWORDS.some(key => s === key || s.includes(key));
}

// ✅ 누락 판정 전 사유 예외처리 보강
// ERP 사유가 "파견", "육아휴직", "외근", "오전반차"처럼 명확한 근태 사유이면
// 출근/퇴근 시간이 비어 있어도 출근미입력/퇴근미입력으로 먼저 잡지 않는다.
function normalizeAttendanceReasonText(reason){
  return String(reason || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/[,/|·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function reasonHas(reason, keywords){
  const s = normalizeAttendanceReasonText(reason);
  return (keywords || []).some(k => s.includes(k));
}
function reasonHasExactOrIncluded(reason, keywords){
  const s = normalizeAttendanceReasonText(reason);
  return (keywords || []).some(k => s === k || s.includes(k));
}
function isExcusedReasonBeforeMissing(reason){
  // 이 목록은 "시간이 없어도 누락으로 보면 안 되는" 근태 사유입니다.
  return reasonHasExactOrIncluded(reason, [
    '육아휴직','출산휴가','산전후휴가','병가','가족돌봄휴직','장기휴직','휴직',
    '연차','연차휴가','반차','오전반차','오후반차','공가','보건휴가','리프레쉬',
    '외근','오전외근','오후외근','출장','파견','재택근무','단축근무'
  ]);
}
function getPrimaryExcusedReason(reason){
  const s = normalizeAttendanceReasonText(reason);
  const ordered = [
    '육아휴직','출산휴가','산전후휴가','가족돌봄휴직','장기휴직','휴직','병가',
    '리프레쉬','오전반차','오후반차','반차','연차휴가','연차','공가','보건휴가',
    '오전외근','오후외근','외근','출장','파견','재택근무','단축근무'
  ];
  return ordered.find(k => s.includes(k)) || '';
}
function isMissingInputReason(reason){
  return reasonHas(reason, ['출근미입력','퇴근미입력','출퇴근미입력','출근누락','퇴근누락']);
}

// ✅ 00:00 보정
// 업로드/가공 과정에서 출근값이 비어 있을 때 00:00으로 들어오는 경우를
// 실제 자정 출근으로 보지 않고 "출근값 없음"으로 처리한다.
function isZeroClockValue(value){
  const s = String(value || '').trim();
  return s === '00:00' || s === '0:00' || s === '00:00:00' || s === '0';
}
function normalizeZeroClockStartForAttendance(startValue, row){
  const s = String(startValue || '').trim();
  if(!isZeroClockValue(s)) return s;

  const reasonText = normalizeAttendanceReasonText([row?.erpReason, row?.reason, row?.status].filter(Boolean).join(' '));
  const endText = String(row?.end || '').trim();

  // 회사 근태 데이터에서 출근 00:00은 대부분 "출근 미입력" 기본값이다.
  // 화면과 집계에서는 빈 값으로 넘겨 기존 누락 판정 로직이 처리하게 한다.
  if(endText || reasonText || row?.erpActualOvertime){
    return '';
  }
  return '';
}
function decorateAttendanceRow(row, metaByName){
  const cleanedName = normalizeEmployeeName(row.name);
  const meta = metaByName.get(cleanedName);
  const rawStatus = String(row.status || '').trim();
  const rawErpReason = String(row.erpReason || '').trim();
  const rawReason = String(rawErpReason || row.reason || rawStatus || '').trim();
  const originalStartRaw = String(row.start || '').trim();
  const startRaw = normalizeZeroClockStartForAttendance(originalStartRaw, row);
  const endRaw = String(row.end || '').trim();
  const workRaw = String(row.workHours || '').trim();
  const overtimeCheckRaw = String(row.overtimeCheck || '').trim();
  const overtimeCheckHours = parseWorkDurationToHours(overtimeCheckRaw);
  const baseErpOT = Number(row.erpActualOvertime || 0);
  // 연장근무 발생 여부는 ERP I열 '실제연장_시간'만 기준으로 한다.
  // F열 '연장신청_시간'은 신청값이므로 집계/OT발생/ERP OT 판정에서 제외한다.
  const erpOT = baseErpOT > 0 ? baseErpOT : 0;
  const isHolidayDate = HOLIDAY_DATE_SET.has(String(row.date || '').trim());

  const workHoursNum = parseWorkDurationToHours(workRaw);
  const actualWorkExists = !!startRaw || !!endRaw || ((workHoursNum !== null) && workHoursNum > 0) || erpOT > 0;
  const holidayLike = isHolidayDate || isHolidayLike(rawStatus) || isHolidayLike(rawErpReason) || isHolidayLike(rawReason);

  if (isHolidayDate || holidayLike) {
    if (erpOT <= 0) return null;
  }

  let displayStart = startRaw;
  let displayEnd = endRaw;
  let totalWork = workRaw;
  let statusLabel = '';
  let bucket = '정상';
  let reason = '-';
  let primaryReason = '';
  let secondaryReason = '';
  let overtimeCheck = '-';
  let seccomOT = null;
  const applicableSpecialNote = findApplicableSpecialNote({ ...row, name: cleanedName, employeeId: row.employeeId || meta?.id || row.id || '' });
  const specialType = String(applicableSpecialNote?.specialType || '').trim();
  // ✅ 파견 + 연차/반차 우선순위 보정
  // 파견 기간 중 연차휴가가 있는 경우, 계산은 연차/반차 사유를 우선 적용한다.
  // 단, 사유 표시에는 보조 사유로 '파견'을 유지한다.
  const isDispatchSpecial = specialType === '파견';
  const dispatchRule = isDispatchSpecial && !isVacationReason(rawReason);
  // ✅ 파견 + 반차 보정
  // 파견 기간 중 오전/오후반차는 출퇴근 누락으로 보지 않고,
  // 근무시간 컬럼은 '-'로 두되 실근무/8시보정/기본근무 분석값은 반차 기준 4:00으로 계산한다.
  const dispatchHalfDayRule = isDispatchSpecial && isHalfDayVacationReason(rawReason);
  const workFromHomeRule = specialType === '재택근무';
  const localOvertimeCheck = getSavedOvertimeCheckOverride(row);
  const savedOvertimeCheck = String(row.overtimeCheckResult || row.overtime_check_result || localOvertimeCheck || '').trim();
  const savedAbsenceDecision = String(row.absenceDecision || row.absence_decision || getSavedAbsenceDecision(row.recordId) || '').trim();

  function calcHoursText(startText, endText){
    const normalizedStartText = normalizeEarlyStartToEight(startText);
    const startMin = timeStrToMinutes(normalizedStartText);
    let endMin = timeStrToMinutes(endText);
    if(startMin === null || endMin === null) return '';
    if(endMin < startMin){
      endMin += 24 * 60;
    }
    return formatHoursToHM(Math.max(0, (endMin - startMin) / 60));
  }

  if (dispatchHalfDayRule) {
    displayStart = '-';
    displayEnd = '-';
    totalWork = '-';
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    overtimeCheck = '-';
    seccomOT = 0;

  } else if (dispatchRule) {
    displayStart = '-';
    displayEnd = '-';
    totalWork = '-';
    bucket = '근태사유';
    statusLabel = '';
    reason = '파견';
    overtimeCheck = '-';
    seccomOT = 0;

  } else if (isRefreshLeaveReason(rawReason)) {
    // ✅ 리프레쉬는 5년차 이상 직원이 연차에서 사용하는 장기휴가 성격이므로
    // 결근/출근미입력/퇴근미입력보다 우선하는 정상 휴가 사유로 처리한다.
    displayStart = '-';
    displayEnd = '-';
    totalWork = '-';
    bucket = '근태사유';
    statusLabel = '';
    reason = '리프레쉬';
    overtimeCheck = '-';
    seccomOT = 0;

  } else if (isContinuousLeaveReason(rawReason)) {
    if (!actualWorkExists) {
      displayStart = '-';
      displayEnd = '-';
      totalWork = '-';
    } else {
      displayStart = startRaw || '-';
      displayEnd = endRaw || '-';
      totalWork = workRaw || '-';
    }
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (rawReason === '오전외근') {
    displayStart = '-';
    displayEnd = endRaw || '퇴근누락';
    if (startRaw && endRaw) {
      totalWork = calcHoursText(startRaw, endRaw);
    } else {
      totalWork = '9:00';
    }
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (rawReason === '오후외근') {
    displayStart = startRaw || '출근누락';
    // ✅ 오후외근 퇴근 표시 기준 보정
    // 세콤 퇴근시간이 실제로 있으면 화면에도 퇴근시간을 표시하고,
    // 세콤 퇴근시간이 없을 때만 '-'로 표시하며 9:00/8:00 기준으로 보정한다.
    displayEnd = endRaw || '-';
    if (startRaw && endRaw) {
      totalWork = calcHoursText(startRaw, endRaw);
    } else {
      totalWork = '9:00';
    }
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (rawReason === '오전반차') {
    displayStart = '-';
    displayEnd = endRaw || '퇴근누락';
    totalWork = endRaw ? calcMorningHalfDayWorkText(endRaw) : '-';
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (rawReason === '오후반차') {
    displayStart = startRaw || '출근누락';
    displayEnd = '-';
    // ✅ 오후반차는 오전 근무 08:00~12:00 기준 4:00으로 고정
    // 일반근무의 점심시간 차감 로직을 반차에 중복 적용하지 않는다.
    totalWork = calcAfternoonHalfDayWorkText();
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (isHalfDayVacationReason(rawReason)) {
    displayStart = startRaw || '출근누락';
    displayEnd = endRaw || '퇴근누락';
    totalWork = '4:00';
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (isVacationReason(rawReason)) {
    displayStart = '-';
    displayEnd = '-';
    totalWork = '-';
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (rawReason === '외근' || rawReason === '출장') {
    displayStart = '-';
    displayEnd = '-';
    totalWork = '9:00';
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (isOutsideReason(rawReason)) {
    displayStart = startRaw || '-';
    displayEnd = endRaw || '-';
    totalWork = workRaw || '9:00';
    bucket = '근태사유';
    statusLabel = '';
    reason = rawReason;
    seccomOT = 0;

  } else if (workFromHomeRule) {
    displayStart = startRaw || '-';
    displayEnd = endRaw || '-';
    if (workRaw) {
      totalWork = workRaw;
    } else if (startRaw && endRaw && startRaw !== endRaw) {
      totalWork = calcHoursText(startRaw, endRaw);
    } else {
      totalWork = '9:00';
    }
    bucket = '근태사유';
    statusLabel = '';
    reason = '재택근무';
    seccomOT = 0;

  } else {
    if (startRaw && endRaw) {
      if (startRaw === endRaw) {
        displayEnd = '퇴근누락';
        totalWork = '9:00';
      } else {
        totalWork = calcHoursText(startRaw, endRaw);
      }
    } else if (!startRaw && endRaw) {
      displayStart = '출근누락';
      totalWork = calcHoursText('08:00', endRaw);
    } else if (startRaw && !endRaw) {
      displayEnd = '퇴근누락';
      totalWork = '9:00';
    } else if (!startRaw && !endRaw) {
      displayStart = '출근누락';
      displayEnd = '퇴근누락';
      if (savedAbsenceDecision === '정상근무') {
        totalWork = '9:00';
        reason = '-';
      } else {
        totalWork = '-';
        reason = '결근';
      }
    }
  }

  const totalHoursForOT = parseWorkDurationToHours(totalWork);
  const shortWorkRule = (!dispatchRule && !workFromHomeRule && specialType === '단축근무')
    ? getAppliedShortWorkRule({ ...row, name: cleanedName, employeeId: row.employeeId || meta?.id || row.id || '' })
    : null;
  if (bucket !== '근태사유') {
    if (displayEnd === '퇴근누락') {
      seccomOT = null;
    } else if (totalHoursForOT !== null) {
      seccomOT = Math.max(0, +(totalHoursForOT - 9).toFixed(2));
    }
  }

  if (bucket !== '근태사유') {
    if ((isHolidayDate || rawStatus === '공휴일' || rawReason === '공휴일') && erpOT > 0) {
      bucket = '주의';
      statusLabel = '주의';
      reason = '공휴일근무';
    } else if ((rawStatus === '휴일' || rawStatus === '휴무일' || rawReason === '휴일' || rawReason === '휴무일' || rawReason === '휴일근로' || rawReason === '휴일근무') && erpOT > 0) {
      bucket = '주의';
      statusLabel = '주의';
      reason = '휴일근무';
    } else if ((rawReason === '정상근무' || rawReason === '' || rawReason === '-') && !startRaw && !endRaw) {
      bucket = '주의';
      statusLabel = '주의';
      reason = '출퇴근미입력';
    } else if ((rawReason === '정상근무' || rawReason === '' || rawReason === '-') && !startRaw && endRaw) {
      bucket = '주의';
      statusLabel = '주의';
      reason = '출근미입력';
    } else if ((rawReason === '정상근무' || rawReason === '' || rawReason === '-') && startRaw && !endRaw) {
      bucket = '주의';
      statusLabel = '주의';
      reason = '퇴근미입력';
    } else if ((rawReason === '정상근무' || rawReason === '' || rawReason === '-') && erpOT > 0) {
      bucket = '주의';
      statusLabel = '주의';
      reason = '연장근무';
    } else if ((rawReason === '정상근무' || rawReason === '' || rawReason === '-')) {
      const requiredHours = shortWorkRule?.standardHours ?? 9;
      const shortageReason = shortWorkRule ? '단축근무 부족' : '근무시간 부족';
      const passReason = shortWorkRule ? '단축근무' : '-';
      if (totalHoursForOT !== null && totalHoursForOT >= requiredHours) {
        bucket = '정상';
        statusLabel = '';
        reason = passReason;
      } else {
        bucket = '문제';
        statusLabel = '문제';
        reason = shortageReason;
      }
    } else if (String(rawReason).includes('결근')) {
      bucket = '문제';
      statusLabel = '문제';
      reason = '결근';
    } else if (rawReason === '근무시간 부족') {
      bucket = '문제';
      statusLabel = '문제';
      reason = '근무시간 부족';
    } else if (rawReason) {
      bucket = '근태사유';
      statusLabel = '';
      reason = rawReason;
    }
  }

  // ✅ OT 자동판정 기준 변경
  // 기존: 근무시간(totalWork) - 9:00 >= ERP OT
  // 변경: 평일/기본근무 있음 → 8시보정값(adjustedWorkHours) - 기본근무값(baseWorkHours) >= ERP OT
  //       공휴일/휴일 등 기본근무 0:00 → 8시보정값(adjustedWorkHours) >= ERP OT
  // 이유: 8시보정에는 점심/저녁식사 차감 및 반차·외근·파견·누락 보정이 이미 반영되어 있어
  //       기본근무가 0:00인 공휴일근무도 실제 인정 가능한 시간 기준으로 ERP OT를 검증할 수 있다.
  let adjustedBasedOT = null;
  let autoOtInvalid = false;
  if (erpOT > 0) {
    const otValidationFields = getAttendanceAnalysisFields({
      ...row,
      name: cleanedName,
      displayStart,
      displayEnd,
      totalWork,
      reason,
      erpReason: rawErpReason,
      erpOTDisplay: formatHoursToHM(erpOT)
    });
    const adjustedHours = Number(otValidationFields?.adjustedWorkHours);
    const rawBaseHours = Number(otValidationFields?.baseWorkHours);
    if (Number.isFinite(adjustedHours)) {
      const comparableBaseHours = Number.isFinite(rawBaseHours) && rawBaseHours > 0 ? rawBaseHours : 0;
      adjustedBasedOT = Math.max(0, +(adjustedHours - comparableBaseHours).toFixed(2));
    }

    if (adjustedBasedOT === null) {
      overtimeCheck = '미인정';
      autoOtInvalid = true;
    } else if (adjustedBasedOT + 0.001 >= erpOT) {
      overtimeCheck = '인정';
    } else {
      overtimeCheck = '미인정';
      autoOtInvalid = true;
    }
  }

  const pendingOvertimeCheck = String(getPendingOvertimeCheck(row.recordId) || '').trim();
  const effectiveSavedOvertimeCheck = String(pendingOvertimeCheck || savedOvertimeCheck || '').trim();

  // ✅ 자동판정은 기본값으로만 사용하되, 자동 미인정 행의 기존 저장값 '인정'은 무시한다.
  // 이유: 과거 자동/기본값으로 저장된 '인정'이 있으면 8시보정-기본근무 < ERP OT 행이 다시 인정으로 돌아가는 문제가 발생한다.
  // 현재 화면에서 직접 바꾼 pending 값이나 부분인정/미인정 저장값은 계속 우선한다.
  const canUseSavedOvertimeCheck = !!pendingOvertimeCheck || !autoOtInvalid || effectiveSavedOvertimeCheck !== '인정';
  if (erpOT > 0 && canUseSavedOvertimeCheck && ['인정','부분인정','미인정','확인필요'].includes(effectiveSavedOvertimeCheck)) {
    overtimeCheck = (effectiveSavedOvertimeCheck === '확인필요' ? '미인정' : effectiveSavedOvertimeCheck);
    autoOtInvalid = false;
  } else if (erpOT <= 0) {
    overtimeCheck = '-';
  }

  const judgedReasonsWarning = ['출근미입력','퇴근미입력','출퇴근미입력','연장근무','휴일근무','공휴일근무'];
  const judgedReasonsIssue = ['결근','근무시간 부족','단축근무 부족'];

  let displayReason = (judgedReasonsWarning.includes(reason) || judgedReasonsIssue.includes(reason) || reason === '단축근무' || reason === '파견' || reason === '재택근무' || reason === '리프레쉬')
    ? reason
    : ((rawStatus && rawStatus !== '정상근무') ? rawStatus : '-');

  // 연장근로 시간이 있는데 사유가 비어 있으면 연장근무로 표기
  if (erpOT > 0 && (!displayReason || displayReason === '-')) {
    displayReason = '연장근무';
  }

  // 출근/퇴근 누락이 있는 경우 정상출근/정상퇴근 제거
  if (displayStart === '출근누락' || displayEnd === '퇴근누락') {
    if (displayReason === '정상출근' || displayReason === '정상퇴근') {
      displayReason = '-';
    }
    if (displayStart === '출근누락' && displayEnd === '퇴근누락') {
      displayReason = (savedAbsenceDecision === '정상근무') ? '-' : '결근';
    }
  }

  // 지각/조퇴는 최종 사유에서 따로 쓰지 않고 근무시간 부족으로 통일
  if (displayReason === '조퇴' || displayReason === '지각') {
    if (typeof totalHoursForOT !== 'undefined' && totalHoursForOT !== null && totalHoursForOT >= 9) {
      displayReason = '-';
    } else {
      displayReason = '근무시간 부족';
    }
  }

  // 원본 status/reason 이 조퇴/지각인 경우도 같은 규칙 적용
  if ((rawStatus === '조퇴' || rawStatus === '지각' || rawReason === '조퇴' || rawReason === '지각')
      && (!displayReason || displayReason === '-' || displayReason === '조퇴' || displayReason === '지각')) {
    if (typeof totalHoursForOT !== 'undefined' && totalHoursForOT !== null && totalHoursForOT >= 9) {
      displayReason = '-';
    } else {
      displayReason = '근무시간 부족';
    }
  }

  // 실제 계산 근무시간이 9시간 이상이면 근무시간 부족은 제거
  const shortageClearHours = shortWorkRule?.standardHours ?? 9;
  if (typeof totalHoursForOT !== 'undefined' && totalHoursForOT !== null && totalHoursForOT >= shortageClearHours) {
    if (displayReason === '근무시간 부족' || displayReason === '단축근무 부족' || rawStatus === '근무시간 부족' || rawReason === '근무시간 부족') {
      displayReason = shortWorkRule ? '단축근무' : '-';
    }
  }

  primaryReason = (displayReason && displayReason !== '-') ? displayReason : '';

  // 외근/출장/반차 등 근태사유에 연장근무가 함께 있는 경우,
  // 사유 컬럼에서 원인도 바로 보이도록 "(연장근무)"를 붙여준다.
  if (
    erpOT > 0 &&
    (overtimeCheck === '인정' || overtimeCheck === '부분인정') &&
    primaryReason &&
    !['출근미입력','퇴근미입력','출퇴근미입력','연장근무','휴일근무','공휴일근무','결근','근무시간 부족','단축근무 부족'].includes(primaryReason) &&
    !String(primaryReason).includes('연장근무')
  ) {
    primaryReason = `${primaryReason} (연장근무)`;
  }

  if (workFromHomeRule) {
    if (primaryReason && primaryReason !== '재택근무') {
      secondaryReason = '재택근무';
    } else {
      primaryReason = '';
      secondaryReason = '재택근무';
    }
  } else if (isDispatchSpecial) {
    if (primaryReason && primaryReason !== '파견') {
      secondaryReason = '파견';
    } else {
      primaryReason = '';
      secondaryReason = '파견';
    }
  }

  displayReason = primaryReason && secondaryReason
    ? `${primaryReason}<br><span style="color:#64748b;font-size:12px">(${secondaryReason})</span>`
    : (primaryReason || secondaryReason || '-');

  // ✅ 출근 컬럼 표시도 계산 기준과 동일하게 08:00 이전은 08:00으로 보정
  displayStart = normalizeEarlyStartToEight(displayStart);

  const pendingApprovedOvertime = String(getPendingApprovedOvertime(row.recordId) || '').trim();
  const savedApprovedOvertime = String(pendingApprovedOvertime || getSavedApprovedOvertimeOverride(row) || row.approvedOvertimeDisplay || '').trim();
  let approvedOvertimeDisplay = '';
  if(erpOT > 0){
    if(overtimeCheck === '미인정'){
      approvedOvertimeDisplay = '0:00';
    }else if(overtimeCheck === '부분인정'){
      approvedOvertimeDisplay = savedApprovedOvertime && savedApprovedOvertime !== '-'
        ? savedApprovedOvertime
        : (seccomOT === null ? formatHoursToHM(0) : formatHoursToHM(seccomOT));
    }else{
      approvedOvertimeDisplay = formatHoursToHM(erpOT);
    }
  }

  // 저장된/선택된 OT확인 값은 연장근로가 있을 때만 상태에 반영
  if (dispatchRule || dispatchHalfDayRule || workFromHomeRule) {
    statusLabel = '';
  } else if (erpOT > 0 && overtimeCheck === '미인정') {
    bucket = '문제';
    statusLabel = '문제';
  } else if (erpOT > 0 && (overtimeCheck === '인정' || overtimeCheck === '부분인정')) {
    bucket = '주의';
    statusLabel = '주의';
  } else if (judgedReasonsWarning.includes(displayReason)) {
    bucket = '주의';
    statusLabel = '주의';
  } else if (judgedReasonsIssue.includes(displayReason)) {
    bucket = '문제';
    statusLabel = '문제';
  } else {
    statusLabel = '';
  }

  return {
    ...row,
    originalStatus: rawStatus,
    originalErpReason: rawErpReason,
    date: row.date,
    id: meta?.id || row.employeeId || cleanedName,
    employeeId: row.employeeId || '',
    name: cleanedName,
    division: meta?.division || row.division,
    divisionCode: meta?.divisionCode || row.divisionCode || meta?.division || row.division,
    team: meta?.team || row.team,
    teamCode: meta?.teamCode || row.teamCode || meta?.team || row.team,
    grade: meta?.grade || row.grade,
    sortOrder: Number.isFinite(Number(meta?.sortOrder)) ? Number(meta.sortOrder) : 999999,
    displayStart,
    displayEnd,
    totalWork,
    statusLabel,
    bucket,
    primaryReason,
    secondaryReason,
    reason: displayReason,
    absenceDecision: (dispatchRule || dispatchHalfDayRule || workFromHomeRule) ? '' : (savedAbsenceDecision || ((displayStart === '출근누락' && displayEnd === '퇴근누락') ? '결근' : '')),
    overtimeCheck: (dispatchRule || dispatchHalfDayRule || workFromHomeRule) ? '-' : (erpOT > 0 ? overtimeCheck : '-'),
    overtimeCheckResult: (dispatchRule || dispatchHalfDayRule || workFromHomeRule) ? '' : (erpOT > 0 ? overtimeCheck : ''),
    overtime_check_result: (dispatchRule || dispatchHalfDayRule || workFromHomeRule) ? '' : (erpOT > 0 ? overtimeCheck : ''),
    autoOtInvalid: !!autoOtInvalid,
    approvedOvertimeDisplay: (dispatchRule || dispatchHalfDayRule || workFromHomeRule) ? '-' : (erpOT > 0 ? approvedOvertimeDisplay : ''),
    seccomOTDisplay: (dispatchRule || dispatchHalfDayRule || workFromHomeRule) ? '-' : (seccomOT === null ? '미계산' : formatHoursToHM(seccomOT)),
    erpOTDisplay: (dispatchRule || dispatchHalfDayRule || workFromHomeRule) ? '-' : (erpOT > 0 ? formatHoursToHM(erpOT) : '-')
  };
}
function hasAttendanceActualWork(row){
  const start = String(row?.start || '').trim();
  const end = String(row?.end || '').trim();
  const totalWork = String(row?.workHours || '').trim();
  const workHoursNum = parseWorkDurationToHours(totalWork);
  const overtimeCheckNum = parseWorkDurationToHours(String(row?.overtimeCheck || '').trim());
  return !!start
    || !!end
    || ((workHoursNum !== null) && workHoursNum > 0)
    || Number(row?.erpActualOvertime || 0) > 0
    || ((overtimeCheckNum !== null) && overtimeCheckNum > 0)
    || Number(row?.seccomOvertimeHours || 0) > 0;
}
function isHolidayDominantRow(row){
  const date = String(row?.date || '').trim();
  return HOLIDAY_DATE_SET.has(date);
}
function shouldHideAttendanceRow(row){
  const dateText = String(row?.date || '').trim();
  const statusText = String(row?.status || '').trim();
  const reasonText = String(row?.reason || '').trim();
  const erpReasonText = String(row?.erpReason || '').trim();
  const hasActualWork = hasAttendanceActualWork(row);
  const overtimeCheckNum = parseWorkDurationToHours(String(row?.overtimeCheck || '').trim());
  const overtimeBase = Number(row?.erpActualOvertime || 0);
  const overtime = overtimeBase > 0 ? overtimeBase : ((overtimeCheckNum !== null && overtimeCheckNum > 0) ? overtimeCheckNum : 0);
  const rawRows = Array.isArray(REAL_ATTENDANCE_DATA) ? REAL_ATTENDANCE_DATA : [];

  if(isHolidayDateByRows(dateText, rawRows) && !hasActualWork && overtime === 0){
    return true;
  }

  const merged = [statusText, reasonText, erpReasonText].filter(Boolean).join(' | ');
  const holidayLike = merged.includes('공휴일') || merged.includes('휴일') || merged.includes('휴무일');
  if(holidayLike && !hasActualWork && overtime === 0){
    return true;
  }

  return false;
}
function isDisplayExcludedAttendance(row){
  const dateText = String(row?.date || '').trim();
  const statusText = String(row?.status || '').trim();
  const reasonText = String(row?.reason || '').trim();
  const erpReasonText = String(row?.erpReason || '').trim();
  const hasActualWork = hasAttendanceActualWork(row);
  const overtimeCheckNum = parseWorkDurationToHours(String(row?.overtimeCheck || '').trim());
  const overtimeBase = Number(row?.erpActualOvertime || 0);
  const overtime = overtimeBase > 0 ? overtimeBase : ((overtimeCheckNum !== null && overtimeCheckNum > 0) ? overtimeCheckNum : 0);
  const rawRows = Array.isArray(REAL_ATTENDANCE_DATA) ? REAL_ATTENDANCE_DATA : [];

  if(isHolidayDateByRows(dateText, rawRows) && !hasActualWork && overtime === 0){
    return true;
  }

  const isContinuousLeave =
    isContinuousLeaveReason(statusText)
    || isContinuousLeaveReason(reasonText)
    || isContinuousLeaveReason(erpReasonText);

  if(isContinuousLeave && !hasActualWork && !isHolidayDateByRows(dateText, rawRows)){
    return false;
  }

  if(shouldHideAttendanceRow(row)) return true;
  return false;
}
function matchesAttendanceFilters(row){
  const selectedOrAll = (value, key) => {
    const selected = ATT_FILTERS[key] || [];
    if(!selected.length) return true;
    return selected.includes(String(value || ''));
  };
  return selectedOrAll(row.date || '-', 'date')
    && selectedOrAll(row.id, 'id')
    && selectedOrAll(row.name, 'name')
    && selectedOrAll(row.division, 'division')
    && selectedOrAll(row.team, 'team')
    && selectedOrAll(row.displayStart || '-', 'start')
    && selectedOrAll(row.displayEnd || '-', 'end')
    && selectedOrAll(row.totalWork || '-', 'work')
    && selectedOrAll(row.erpOTDisplay === '0:00' ? '-' : row.erpOTDisplay, 'ot')
    && selectedOrAll(row.approvedOvertimeDisplay === '0:00' ? '-' : (row.approvedOvertimeDisplay || '-'), 'otapproved')
    && selectedOrAll(row.statusLabel || '-', 'status')
    && selectedOrAll((row.absenceDecision || '-'), 'absencecheck')
    && selectedOrAll(row.overtimeCheck === '-' ? '-' : row.overtimeCheck, 'otcheck')
    && (() => {
      const selected = ATT_FILTERS.reason || [];
      if(!selected.length) return true;
      const tokens = getAttendanceReasonTokens(row);
      return selected.some(v => tokens.includes(String(v)));
    })();
}

function isAttendanceTargetIncludedRow(row, metaByName){
  const meta = metaByName.get(normalizeEmployeeName(row?.name || ''));
  if(!meta) return true;
  return String(meta.attendanceTarget || 'Y').trim().toUpperCase() !== 'N';
}

function buildAttendanceRows(){
  const metaByName = new Map(empMaster.map(e => [normalizeEmployeeName(e.name), e]));

  // 디버그용: 원본 병합 데이터와 단계별 필터 결과를 전역에 노출
  // 업로드/저장 로직에는 영향 없음. 화면 표시용 rows 생성 과정만 추적합니다.
  const rawRows = getMergedRawAttendanceData();
  const decoratedRows = rawRows.map(row => decorateAttendanceRow(row, metaByName));

  const afterDecorateRows = decoratedRows.filter(Boolean);
  const afterTargetRows = afterDecorateRows.filter(row => isAttendanceTargetIncludedRow(row, metaByName));
  const afterBucketRows = afterTargetRows.filter(row => row.bucket !== '제외');
  const afterPeriodRows = afterBucketRows.filter(row => rowMatchesSelectedPeriod(row.date));
  const afterDisplayRows = afterPeriodRows.filter(row => !isDisplayExcludedAttendance(row));
  const afterOrgRows = afterDisplayRows
    .filter(row => (STATE.division === '전체' || row.division === STATE.division) && (STATE.team === '전체' || row.team === STATE.team))
    .filter(rowMatchesEffectiveAccessScope);

  const rows = scopeAttendanceRowsForGeneralUser(afterOrgRows)
    .filter(matchesAttendanceFilters)
    .sort((a,b) => (String(a.date)+String(a.name)).localeCompare(String(b.date)+String(b.name),'ko'));

  window.__rawRows = rawRows;
  window.__decoratedRows = decoratedRows;
  window.__afterDecorateRows = afterDecorateRows;
  window.__afterTargetRows = afterTargetRows;
  window.__afterBucketRows = afterBucketRows;
  window.__afterPeriodRows = afterPeriodRows;
  window.__afterDisplayRows = afterDisplayRows;
  window.__afterOrgRows = afterOrgRows;
  window.__attendanceRows = rows;
  window.__attendanceDebugCounts = {
    raw: rawRows.length,
    decorated: decoratedRows.length,
    afterDecorate: afterDecorateRows.length,
    afterTarget: afterTargetRows.length,
    afterBucket: afterBucketRows.length,
    afterPeriod: afterPeriodRows.length,
    afterDisplay: afterDisplayRows.length,
    afterOrg: afterOrgRows.length,
    final: rows.length
  };

  return rows;
}

window.buildAttendanceRows = buildAttendanceRows;
window.__attendanceDebugRefresh = function(){
  const rows = buildAttendanceRows();
  console.table(window.__attendanceDebugCounts);
  return rows;
};
window.__findAttendanceDroppedRows = function(){
  buildAttendanceRows();
  const keyOfRaw = r => `${String(r?.date || r?.일자 || r?.work_date || '').trim()}|${String(r?.id || r?.사번 || r?.employeeId || r?.employee_no || '').trim()}|${String(r?.name || r?.이름 || '').trim()}`;
  const keyOfRow = r => `${String(r?.date || '').trim()}|${String(r?.id || r?.employeeId || r?.employee_no || '').trim()}|${String(r?.name || '').trim()}`;
  const finalKeys = new Set((window.__attendanceRows || []).map(keyOfRow));
  const decoratedKeys = new Set((window.__afterDecorateRows || []).map(keyOfRow));
  const rawRows = window.__rawRows || [];
  const result = rawRows.map((raw, idx) => {
    const rawKey = keyOfRaw(raw);
    const decoratedMatch = (window.__afterDecorateRows || []).find(row => keyOfRow(row) === rawKey);
    const finalMatch = decoratedMatch && finalKeys.has(keyOfRow(decoratedMatch));
    return { idx, rawKey, raw, decorated: decoratedMatch || null, finalIncluded: !!finalMatch };
  }).filter(x => !x.finalIncluded);
  console.table(result.map(x => ({ idx:x.idx, key:x.rawKey, date:x.decorated?.date || x.raw?.date || x.raw?.일자, id:x.decorated?.id || x.raw?.id || x.raw?.사번, name:x.decorated?.name || x.raw?.name || x.raw?.이름, bucket:x.decorated?.bucket, reason:x.decorated?.reason, status:x.decorated?.status })));
  return result;
};

buildAttendanceRows.unfiltered = function(){
  const currentDivision = STATE.division, currentTeam = STATE.team;
  STATE.division = '전체'; STATE.team = '전체';
  const rows = buildAttendanceRows().slice();
  STATE.division = currentDivision; STATE.team = currentTeam;
  return rows;
};

function getAttendanceBaseReason(row){
  const parts = [
    row?.reason,
    row?.erpReason,
    row?.originalErpReason,
    row?.status,
    row?.originalStatus,
    row?.primaryReason,
    row?.secondaryReason
  ];
  let raw = parts
    .map(v => String(v || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
  raw = raw.replace(/^주말\s+/, '').replace(/\(검토\)$/,'').trim();
  return raw;
}
function isAttendanceContinuousLeaveRow(row){
  return isContinuousLeaveReason(getAttendanceBaseReason(row));
}
function getAttendanceManagementRows(rows){
  const list = Array.isArray(rows) ? rows : [];
  return (STATE.attendanceIncludeLeave === false)
    ? list.filter(row => !isAttendanceContinuousLeaveRow(row))
    : list.slice();
}
function renderAttendanceLeaveToggle(){
  const el = $('#attendanceLeaveToggle');
  if(!el) return;
  el.innerHTML = `
    <button type="button" class="attToggleBtn ${STATE.attendanceIncludeLeave !== false ? 'active' : ''}" data-attendance-leave-mode="include">휴직 포함</button>
    <button type="button" class="attToggleBtn ${STATE.attendanceIncludeLeave === false ? 'active' : ''}" data-attendance-leave-mode="exclude">휴직 제외</button>
    <span class="attToggleHint">휴직 제외는 육아휴직·출산휴가·휴직·병가 등 연속 상태형 휴직만 제외합니다.</span>
  `;
  el.querySelectorAll('[data-attendance-leave-mode]').forEach(btn => {
    btn.onclick = () => {
      const next = btn.getAttribute('data-attendance-leave-mode') !== 'exclude';
      if(STATE.attendanceIncludeLeave === next) return;
      STATE.attendanceIncludeLeave = next;
      renderAttendanceTab();
    };
  });
}

const ATTENDANCE_REASON_EXCLUDE = ['출근미입력','퇴근미입력','출퇴근미입력','연장근무','휴일근무','공휴일근무'];
function dedupeAttendanceReasonKeyText(value){
  let key = String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if(!key) return '';

  const tokens = key.split(' ').map(v => v.trim()).filter(Boolean);
  if(!tokens.length) return '';

  // 같은 사유가 main/sub/original reason에서 중복 결합되는 경우만 제거한다.
  // 예: "출장추가 출장추가" → "출장추가", "근무시간 부족 근무시간 부족" → "근무시간 부족"
  const half = tokens.length / 2;
  if(Number.isInteger(half) && half > 0){
    const left = tokens.slice(0, half).join(' ');
    const right = tokens.slice(half).join(' ');
    if(left && left === right) return left;
  }

  const unique = [];
  const seen = new Set();
  tokens.forEach(token => {
    if(!seen.has(token)){
      seen.add(token);
      unique.push(token);
    }
  });
  return unique.join(' ');
}
function normalizeAttendanceReasonKey(value, mode='default'){
  let key = dedupeAttendanceReasonKeyText(value);
  if(mode === 'warning'){
    if (key.includes('출퇴근미입력')) key = '출퇴근미입력';
    else if (key.includes('출근미입력')) key = '출근미입력';
    else if (key.includes('퇴근미입력')) key = '퇴근미입력';
    else if (key.includes('공휴일근무')) key = '공휴일근무';
    else if (key.includes('휴일근무')) key = '휴일근무';
    else if (key.includes('연장근무')) key = '연장근무';
  }
  return key;
}
function countAttendanceReasonMap(list, excluded=[], mode='default'){
  return list.reduce((acc, row) => {
    const key = normalizeAttendanceReasonKey(getAttendanceBaseReason(row) || row.reason, mode);
    if(!key || key === '-' || excluded.includes(key)) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
function getAttendanceWarningFlags(row){
  const holidayWorkTypes = ['공휴일','휴일','휴무일'];
  const weekdayWorkTypes = ['정상근무','외근','오전외근','오후외근'];
  const erpReason = String(row?.originalErpReason || row?.erpReason || getAttendanceBaseReason(row) || row?.reason || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .trim();
  const erpOT = Number(row?.erpActualOvertime || 0);
  const hasActualOvertime = erpOT > 0;
  const isHolidayType = holidayWorkTypes.includes(erpReason);
  const isWeekdayWorkType = weekdayWorkTypes.includes(erpReason);
  const reasonKey = normalizeAttendanceReasonKey(row?.reason, 'warning');
  const fallbackOvertime = reasonKey === '연장근무';
  const fallbackHoliday = reasonKey === '공휴일근무';
  const fallbackWeekendHoliday = reasonKey === '휴일근무';
  const isOvertime = hasActualOvertime
    ? (isWeekdayWorkType || !isHolidayType)
    : fallbackOvertime;
  const isHoliday = hasActualOvertime
    ? isHolidayType
    : (fallbackHoliday || fallbackWeekendHoliday);
  const isMissingStart = String(row?.displayStart || '').trim() === '출근누락';
  const isMissingEnd = String(row?.displayEnd || '').trim() === '퇴근누락';
  return { isOvertime, isHoliday, isMissingStart, isMissingEnd, isWarning:isOvertime || isHoliday || isMissingStart || isMissingEnd };
}
function isAttendanceReasonDisplayRow(row){
  const key = normalizeAttendanceReasonKey(getAttendanceBaseReason(row) || row?.reason);
  if(!key || key === '-' || ATTENDANCE_REASON_EXCLUDE.includes(key)) return false;
  if(row?.bucket === '문제') return false;
  if(getAttendanceWarningFlags(row).isWarning) return false;
  return true;
}
function getAttendanceReasonRows(list){
  return (Array.isArray(list) ? list : []).filter(isAttendanceReasonDisplayRow);
}
function getAttendanceReasonCount(list){
  return Object.values(countAttendanceReasonMap(
    getAttendanceReasonRows(list),
    ATTENDANCE_REASON_EXCLUDE
  )).reduce((sum, value) => sum + value, 0);
}
function getAttendanceWarningEventSummary(list){
  const summary = {
    overtime: 0,
    holiday: 0,
    holidayWeekend: 0,
    pureMissingStart: 0,
    pureMissingEnd: 0,
    allMissingStart: 0,
    allMissingEnd: 0
  };

  const holidayWorkTypes = ['공휴일','휴일','휴무일'];
  const weekdayWorkTypes = ['정상근무','외근','오전외근','오후외근'];

  (list || []).forEach(row => {
    // 주의 요약의 연장/휴일근무 집계는 화면 사유·OT확인값이 아니라
    // ERP 원본 기준으로 고정한다.
    // - 연장근무: 실제연장_시간 > 0 AND 근태구분이 평일 근무계열
    // - 공휴일근무: 실제연장_시간 > 0 AND 근태구분이 공휴일/휴일/휴무일
    // 업로드/저장 로직은 건드리지 않고, 요약 집계 기준만 안정화한다.
    const flags = getAttendanceWarningFlags(row);
    const isOvertime = flags.isOvertime;
    const isHoliday = flags.isHoliday;
    const isMissingStart = flags.isMissingStart;
    const isMissingEnd = flags.isMissingEnd;
    const hasPriorityWork = isOvertime || isHoliday;

    if (isOvertime) summary.overtime += 1;
    if (isHoliday) summary.holiday += 1;

    if (isMissingStart) {
      summary.allMissingStart += 1;
      if (!hasPriorityWork) summary.pureMissingStart += 1;
    }
    if (isMissingEnd) {
      summary.allMissingEnd += 1;
      if (!hasPriorityWork) summary.pureMissingEnd += 1;
    }
  });

  summary.total = summary.overtime + summary.holiday + summary.pureMissingStart + summary.pureMissingEnd;
  return summary;
}
function formatAttendanceWarningDetail(summary){
  const parts = [];
  if (summary.overtime) parts.push(`연장근무 ${summary.overtime}`);
  if (summary.holiday) parts.push(`공휴일근무 ${summary.holiday}`);
  if (summary.pureMissingEnd || summary.allMissingEnd) parts.push(`퇴근미입력 ${summary.pureMissingEnd}(${summary.allMissingEnd})`);
  if (summary.pureMissingStart || summary.allMissingStart) parts.push(`출근미입력 ${summary.pureMissingStart}(${summary.allMissingStart})`);
  return parts.join(' | ');
}

function renderAttendanceKpis(rows){
  const warnSummary = getAttendanceWarningEventSummary(rows);
  const warn = warnSummary.total;
  const issue = rows.filter(r => r.bucket === '문제').length;
  const total = rows.length;
  const normal = Math.max(0, total - warn - issue);
  const reason = getAttendanceReasonCount(rows);
  const warningDetail = formatAttendanceWarningDetail(warnSummary);
  $('#attendanceKpis').innerHTML = [
    ['전체 표시건', `${total}건`, '현재 화면에 표시된 유효 근태 행 수입니다.'],
    ['정상', `${normal}건`, '전체 표시건에서 주의/문제를 제외한 정상 처리 건'],
    ['주의', `${warn}건`, warningDetail || '연장근무, 휴일/공휴일근무, 출퇴근 미입력 등 확인이 필요한 건'],
    ['문제', `${issue}건`, '결근·근무시간 부족·단축근무 미달'],
    ['사유', `${reason}건`, 'ERP 사유 중 주의/문제를 제외한 인정 근태']
  ].map(([label, value, sub]) => `<div class="card"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`).join('');
}
function getAttendanceGeneralUserChartLabel(rows){
  const stateName = String(ATTENDANCE_GENERAL_USER_ACCESS_STATE?.name || '').trim();
  if(stateName) return stateName;
  const list = Array.isArray(rows) ? rows : [];
  const row = list.find(r => String(r?.name || r?.employee_name || '').trim());
  return String(row?.name || row?.employee_name || '본인').trim() || '본인';
}
function renderAttendanceChart(rows){
  const isGeneralUserChart = (typeof isCurrentAttendanceGeneralUser === 'function' && isCurrentAttendanceGeneralUser());
  const byKey = isGeneralUserChart ? 'name' : ((STATE.division === '전체' && STATE.team === '전체') ? 'division' : (STATE.team === '전체' ? 'team' : 'name'));
  const generalUserLabel = isGeneralUserChart ? getAttendanceGeneralUserChartLabel(rows) : '';
  const grouped = groupBy(rows, byKey);
  const data = Object.entries(grouped).map(([name, list]) => {
    const reason = getAttendanceReasonCount(list);
    const warn = getAttendanceWarningEventSummary(list).total;
    const issue = list.filter(x => x.bucket === '문제').length;
    const total = list.length;
    const normal = Math.max(0, total - warn - issue);
    return { name: isGeneralUserChart ? generalUserLabel : name, total, normal, warn, issue, reason };
  });
  $('#attendanceChartTitle').textContent = isGeneralUserChart
    ? '내 근태 운영 상태'
    : (STATE.division === '전체' && STATE.team === '전체'
      ? '본부/팀별 근태 운영 상태'
      : STATE.team === '전체'
        ? `${STATE.division} 내 팀별 근태 운영 상태`
        : `${STATE.team} 구성원 근태 운영 상태`);
  barSVG($('#attendanceChart'), data, ['total','normal','warn','issue','reason'], ['#94a3b8','#16a34a','#d97706','#ef4444','#2563eb'], data.length > 4);
}
function renderAttendanceInsights(rows){
  const msgs = [];
  const issues = rows.filter(r => r.bucket === '문제');
  const warns = rows.filter(r => r.bucket === '주의');
  const reasons = getAttendanceReasonRows(rows);

  const issueCounts = countAttendanceReasonMap(issues);
  const warnSummary = getAttendanceWarningEventSummary(rows);
  const reasonCounts = countAttendanceReasonMap(reasons, ATTENDANCE_REASON_EXCLUDE);
  const reasonTotal = Object.values(reasonCounts).reduce((sum, value) => sum + value, 0);

  const formatDetail = (counts, orderedKeys) => {
    const preferred = orderedKeys.filter(key => counts[key]).map(key => [key, counts[key]]);
    const remain = Object.entries(counts)
      .filter(([key]) => !orderedKeys.includes(key))
      .sort((a,b) => b[1] - a[1]);
    const parts = preferred.concat(remain).map(([key, value]) => `${key} ${value}`);
    return parts.length ? `<div class="sub" style="margin-top:8px;line-height:1.6">${parts.join(' | ')}</div>` : '';
  };

  if(issues.length){
    msgs.push({
      title: `문제 ${issues.length}건`,
      desc: '결근, 근무시간 부족, 단축근무 기준 미달처럼 조치가 필요한 건입니다.',
      detail: formatDetail(issueCounts, ['결근','근무시간 부족','단축근무 부족'])
    });
  }
  if(warnSummary.total){
    msgs.push({
      title: `주의 ${warnSummary.total}건`,
      desc: '연장근무·휴일/공휴일근무는 우선 집계하고, 출퇴근 미입력은 순수 건수(괄호 안은 전체 발생건수)로 표시합니다.',
      detail: formatAttendanceWarningDetail(warnSummary) ? `<div class="sub" style="margin-top:8px;line-height:1.6">${formatAttendanceWarningDetail(warnSummary)}</div>` : ''
    });
  }
  if(Object.keys(reasonCounts).length){
    msgs.push({
      title: `사유 ${reasonTotal}건`,
      desc: 'ERP 사유 반영 건 중 주의/문제를 제외한 인정 근태 내역입니다.',
      detail: formatDetail(reasonCounts, ['연차','오전반차','오후반차','반차','외근','오전외근','오후외근','출장','재택근무','단축근무','파견','휴직','육아휴직','출산휴가','산전후휴가','병가','가족돌봄휴직','장기휴직','공가','보건휴가'])
    });
  }

  if(!msgs.length){
    msgs.push({ title:'이상 없음', desc:'현재 필터 기준으로 확인이 필요한 근태 이슈가 없습니다.', detail:'' });
  }

  document.getElementById('attendanceInsightList').innerHTML = msgs.map(msg => `
    <div class="alertCard">
      <div style="font-weight:800;margin-bottom:8px">${msg.title}</div>
      <div class="desc">${msg.desc}</div>
      ${msg.detail || ''}
    </div>
  `).join('');
}

function escapeHtmlSafe(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ATTENDANCE_REASON_ORDER = [
  '결근','출근미입력','퇴근미입력','출퇴근미입력',
  '연장근무','연장근무 미인정','연장근무 부분인정','공휴일근무','휴일근무',
  '근무시간 부족','단축근무','단축근무 부족',
  '연차','연차휴가','반차','오전반차','오후반차',
  '외근','오전외근','오후외근','출장','파견','재택근무',
  '육아휴직','출산휴가','산전후휴가','병가','휴직','가족돌봄휴직','장기휴직',
  '공가','보건휴가','지각','조퇴','근태사유','확인필요'
];

function normalizeReasonToken(value){
  let s = String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/^주말\s+/, '')
    .replace(/\(검토\)$/,'')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if(!s || s === '-' || s === '정상' || s === '정상근무' || s === '정상출퇴근') return '';

  if(/출퇴근미입력|출퇴근 미입력/.test(s)) return '출퇴근미입력';
  if(/출근미입력|출근 미입력|출근누락/.test(s)) return '출근미입력';
  if(/퇴근미입력|퇴근 미입력|퇴근누락/.test(s)) return '퇴근미입력';
  if(/공휴일근무|공휴일 근무/.test(s)) return '공휴일근무';
  if(/휴일근무|휴일 근무/.test(s)) return '휴일근무';
  if(/연장근무.*미인정|미인정.*연장근무/.test(s)) return '연장근무 미인정';
  if(/연장근무.*부분인정|부분인정.*연장근무/.test(s)) return '연장근무 부분인정';
  if(/연장근무|연장 근무/.test(s)) return '연장근무';
  if(/단축근무 부족/.test(s)) return '단축근무 부족';
  if(/근무시간 부족/.test(s)) return '근무시간 부족';
  if(/오전반차/.test(s)) return '오전반차';
  if(/오후반차/.test(s)) return '오후반차';
  if(/연차휴가/.test(s)) return '연차휴가';
  if(/육아휴직/.test(s)) return '육아휴직';
  if(/출산휴가/.test(s)) return '출산휴가';
  if(/산전후휴가/.test(s)) return '산전후휴가';
  if(/가족돌봄휴직/.test(s)) return '가족돌봄휴직';
  if(/장기휴직/.test(s)) return '장기휴직';
  if(/오전외근/.test(s)) return '오전외근';
  if(/오후외근/.test(s)) return '오후외근';

  return s;
}

function splitReasonTokens(value){
  const raw = String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '|')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[()]/g, '|')
    .replace(/[\/,，·;]/g, '|');

  return raw.split('|')
    .map(normalizeReasonToken)
    .filter(Boolean);
}

function uniqueOrderedReasonTokens(tokens){
  // ✅ 표시 전용 정리: 공휴일근무는 유지하되, 단독 휴일/공휴일 표기는 숨김
  // - 이유 칸에 연장근무 / 공휴일근무 / 휴일처럼 노출되던 휴일 상태값 제거
  // - KPI/집계/업로드/저장 로직에는 영향 없음
  const hiddenDisplayTokens = new Set(["휴일", "휴무일", "공휴일"]);
  const unique = [...new Set((tokens || [])
    .map(normalizeReasonToken)
    .filter(Boolean)
    .filter(token => !hiddenDisplayTokens.has(token))
  )];
  return unique.sort((a,b) => {
    const ai = ATTENDANCE_REASON_ORDER.indexOf(a);
    const bi = ATTENDANCE_REASON_ORDER.indexOf(b);
    if(ai !== -1 || bi !== -1){
      if(ai === -1) return 1;
      if(bi === -1) return -1;
      return ai - bi;
    }
    return String(a).localeCompare(String(b), 'ko');
  });
}

function getAttendanceReasonTokens(row){
  const tokens = [];

  tokens.push(...splitReasonTokens(row?.reason));
  tokens.push(...splitReasonTokens(row?.primaryReason));
  tokens.push(...splitReasonTokens(row?.secondaryReason));
  tokens.push(...splitReasonTokens(row?.originalErpReason));
  tokens.push(...splitReasonTokens(row?.originalStatus));

  const displayStart = String(row?.displayStart || '').trim();
  const displayEnd = String(row?.displayEnd || '').trim();
  if(displayStart === '출근누락') tokens.push('출근미입력');
  if(displayEnd === '퇴근누락') tokens.push('퇴근미입력');
  if(displayStart === '출근누락' && displayEnd === '퇴근누락') tokens.push('출퇴근미입력');

  const absenceDecision = String(row?.absenceDecision || '').trim();
  if(absenceDecision && absenceDecision !== '-') tokens.push(absenceDecision);

  const erpOT = String(row?.erpOTDisplay || '').trim();
  const overtimeCheck = String(row?.overtimeCheck || '').trim();
  if(erpOT && erpOT !== '-' && erpOT !== '0:00'){
    if(overtimeCheck === '미인정') tokens.push('연장근무 미인정');
    else if(overtimeCheck === '부분인정') tokens.push('연장근무 부분인정');
    else tokens.push('연장근무');
  }

  const bucket = String(row?.bucket || '').trim();
  if(bucket === '근태사유' && !tokens.length) tokens.push('근태사유');
  if(bucket === '문제' && !tokens.length) tokens.push('확인필요');

  return uniqueOrderedReasonTokens(tokens);
}

function formatAttendanceReasonHtml(reason, row){
  const tokens = row ? getAttendanceReasonTokens(row) : uniqueOrderedReasonTokens(splitReasonTokens(reason));
  if(!tokens.length) return '-';
  if(tokens.length === 1) return `<span class="reason-main">${escapeHtmlSafe(tokens[0])}</span>`;
  return `<span class="reason-main">${escapeHtmlSafe(tokens[0])}</span>` +
    tokens.slice(1).map(t => `<span class="reason-sub">${escapeHtmlSafe(t)}</span>`).join('');
}

function toMinutesFromHM(v){
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function formatMinutesToHM(mins){
  if(mins === null || mins === undefined || !Number.isFinite(Number(mins))) return '-';
  const total = Math.max(0, Math.round(Number(mins)));
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh}:${String(mm).padStart(2,'0')}`;
}

function getAttendanceLunchDeductionHours(startMinRaw, endMinRaw, fallbackHours = ANALYSIS_LUNCH_HOURS){
  if(startMinRaw === null || endMinRaw === null) return fallbackHours;
  let endMin = endMinRaw;
  if(endMin < startMinRaw) endMin += 24 * 60;
  const lunchStart = 12 * 60;
  const lunchEnd = 13 * 60;
  const overlapMinutes = Math.max(0, Math.min(endMin, lunchEnd) - Math.max(startMinRaw, lunchStart));
  return Math.min(ANALYSIS_LUNCH_HOURS, overlapMinutes / 60);
}

function getAttendanceDinnerDeductionHours(startMinRaw, endMinRaw){
  if(endMinRaw === null) return 0;

  const dinnerStart = 17 * 60;
  const dinnerEnd = 17 * 60 + 30;

  // ✅ 출근누락 / 오전외근 대응
  // 출근시간이 없더라도 17:30 이후까지 근무 + 연장근무가 존재하면
  // 연구소 저녁시간 30분을 동일하게 차감한다.
  if(startMinRaw === null){
    return endMinRaw >= dinnerEnd ? 0.5 : 0;
  }

  let endMin = endMinRaw;
  if(endMin < startMinRaw) endMin += 24 * 60;

  const overlapMinutes = Math.max(
    0,
    Math.min(endMin, dinnerEnd) - Math.max(startMinRaw, dinnerStart)
  );

  return Math.min(0.5, overlapMinutes / 60);
}
function getAttendanceAnalysisFields(row){
  const rawWorkHours = parseWorkDurationToHours(row?.totalWork);
  const startMinRaw = toMinutesFromHM(row?.displayStart);
  const endMinRaw = toMinutesFromHM(row?.displayEnd);
  const erpOTHoursRaw = parseWorkDurationToHours(row?.erpOTDisplay);
  const hasERPOT = Number.isFinite(erpOTHoursRaw) && erpOTHoursRaw > 0;

  const reasonBundle = (typeof getAttendanceReasonBundle === 'function')
    ? getAttendanceReasonBundle(row)
    : [
        row?.erpReason,
        row?.reason,
        row?.attendanceType,
        row?.statusReason,
        (typeof getAttendanceBaseReason === 'function' ? getAttendanceBaseReason(row) : '')
      ].filter(Boolean).join(' ');

  // ✅ 검진휴가 반일 처리
  // 검진휴가는 오전/오후 모두 가능한 공식 반일 휴가이므로,
  // 일반근무처럼 점심 1시간을 일괄 차감하지 않고 실제 출퇴근 구간을 그대로 실근무/8시보정에 반영한다.
  const isMedicalCheckupLeave = /검진휴가/.test(String(reasonBundle || ''));

  const isHalfDayLike = isMedicalCheckupLeave || ((typeof isHalfDayLikeBundle === 'function')
    ? isHalfDayLikeBundle(reasonBundle)
    : /오전반차|오후반차/.test(String(reasonBundle || '')));
  // ✅ 파견 + 연차휴가 분석값 보정
  // 연차휴가가 포함된 경우에는 파견 fallback 8:00을 적용하지 않는다.
  // 반차는 isHalfDayLike 기준으로 4:00을 유지한다.
  const isFullDayVacationLike = /연차휴가|연차/.test(String(reasonBundle || '')) && !isHalfDayLike;
  const isFieldLike = !isFullDayVacationLike && ((typeof isFieldWorkLikeBundle === 'function')
    ? isFieldWorkLikeBundle(reasonBundle)
    : /파견|외근|오전외근|오후외근/.test(String(reasonBundle || '')));
  const hasOvertimeLike = (typeof hasOvertimeLikeBundle === 'function')
    ? hasOvertimeLikeBundle(reasonBundle)
    : /연장근무/.test(String(reasonBundle || ''));

  const dinnerDeductHours = (hasERPOT || hasOvertimeLike)
    ? getAttendanceDinnerDeductionHours(startMinRaw, endMinRaw)
    : 0;

  const isHolidayWorkCandidate = ((typeof HOLIDAY_DATE_SET !== 'undefined' && HOLIDAY_DATE_SET.has(String(row?.date || ''))) ||
    (typeof isHolidayLike === 'function' && isHolidayLike(String(row?.reason || ''))));
  const analysisLunchDeductHours = isMedicalCheckupLeave
    ? 0
    : (isHolidayWorkCandidate
      ? getAttendanceLunchDeductionHours(startMinRaw, endMinRaw, ANALYSIS_LUNCH_HOURS)
      : ANALYSIS_LUNCH_HOURS);

  const baseCapHours = isHalfDayLike ? 4 : 8;
  const fallbackWorkHours = isHalfDayLike ? 4 : (isFieldLike ? 8 : null);

  const isMorningHalfDayLike = /오전반차/.test(String(reasonBundle || ''));
  const isAfternoonHalfDayLike = /오후반차/.test(String(reasonBundle || ''));
  let morningHalfDayWorkHours = null;
  if(isMorningHalfDayLike && endMinRaw !== null){
    const startMin = 13 * 60;
    let endMin = endMinRaw;
    if(endMin < startMin) endMin += 24 * 60;
    morningHalfDayWorkHours = Math.max(0, (endMin - startMin) / 60);
  }
  // ✅ 오후반차 분석 기준
  // 오후반차는 오전 08:00~12:00 근무 인정 4:00으로 고정하고, 점심 차감은 적용하지 않는다.
  const afternoonHalfDayWorkHours = isAfternoonHalfDayLike ? 4 : null;

  const analysisWorkHours = rawWorkHours === null ? null : Math.max(0, rawWorkHours - analysisLunchDeductHours);

  const hasOnlyMissingClock =
    rawWorkHours !== null &&
    (
      (startMinRaw === null && endMinRaw !== null) ||
      (startMinRaw !== null && endMinRaw === null)
    );

  let adjustedWorkHours = null;
  if(startMinRaw !== null && endMinRaw !== null){
    // ✅ 익일(00:00 이후) 퇴근 보정
    // 예: 출근 08:01 / 퇴근 00:30은 같은 날 00:30이 아니라 다음날 00:30으로 계산한다.
    let endMinForAdjusted = endMinRaw;
    if(endMinForAdjusted < startMinRaw) endMinForAdjusted += 24 * 60;
    if(endMinForAdjusted > Math.max(startMinRaw, 8 * 60)){
      adjustedWorkHours = Math.max(0, (endMinForAdjusted - Math.max(startMinRaw, 8 * 60)) / 60 - analysisLunchDeductHours);
    }
  }else if(hasOnlyMissingClock){
    adjustedWorkHours = analysisWorkHours;
  }

  let finalAnalysisWorkHours = analysisWorkHours;
  if(finalAnalysisWorkHours === null && fallbackWorkHours !== null){
    finalAnalysisWorkHours = fallbackWorkHours;
  }

  let finalAdjustedWorkHours = adjustedWorkHours;
  if(finalAdjustedWorkHours === null && fallbackWorkHours !== null){
    finalAdjustedWorkHours = fallbackWorkHours;
  }

  // ✅ 오전반차 분석값 보정
  // 표시/분석용 값만 13:00~퇴근시간 기준으로 맞추고, 원본 출퇴근/사유/OT 판정은 건드리지 않는다.
  if(morningHalfDayWorkHours !== null){
    finalAnalysisWorkHours = morningHalfDayWorkHours;
    finalAdjustedWorkHours = morningHalfDayWorkHours;
  }

  // ✅ 오후반차 분석값 보정
  // 오후반차는 오전 근무 인정 4:00으로 고정하고, 점심시간 차감/숨은초과 계산이 끼어들지 않게 한다.
  if(afternoonHalfDayWorkHours !== null){
    finalAnalysisWorkHours = afternoonHalfDayWorkHours;
    finalAdjustedWorkHours = afternoonHalfDayWorkHours;
  }

  // ✅ 연차휴가 + 파견 분석값 보정
  // 전일 연차는 다른 일반 연차와 동일하게 실근무/8시보정/기본근무를 '-'로 표시한다.
  if(isFullDayVacationLike){
    finalAnalysisWorkHours = null;
    finalAdjustedWorkHours = null;
  }

  // ✅ 오후외근 + 세콤 퇴근시간 없음 보정
  // 오후외근이지만 실제 퇴근시간이 없는 경우만 근무시간 9:00 / 실근무 8:00 / 8시보정 8:00 / 숨은초과 0:00 기준으로 고정한다.
  // 세콤 퇴근시간이 있는 오후외근은 실제 퇴근시간 기준 계산을 그대로 사용한다.
  const isAfternoonOutdoorWithoutEnd =
    /오후외근/.test(String(reasonBundle || '')) &&
    endMinRaw === null &&
    !isMorningHalfDayLike &&
    !isAfternoonHalfDayLike;

  if(isAfternoonOutdoorWithoutEnd && !hasERPOT){
    finalAnalysisWorkHours = 8;
    finalAdjustedWorkHours = 8;
  }

  // ✅ 퇴근누락/오후외근 퇴근 미입력 + ERP 실제연장 보정
  // 퇴근 시간이 없을 때 근무시간(totalWork)은 기존 기준(9:00)을 유지하되,
  // 공식 ERP OT가 있으면 실근무/8시보정에는 기본 실근무 8:00 + ERP OT를 반영한다.
  // 오후외근처럼 퇴근 컬럼이 '-'로 표시되는 외근성 퇴근 미입력도 같은 기준으로 처리한다.
  // 숨은초과는 공식 OT가 아니므로 증가시키지 않는다.
  const isAfternoonOutdoorEndBlankWithERPOT =
    hasERPOT &&
    endMinRaw === null &&
    !isMorningHalfDayLike &&
    !isAfternoonHalfDayLike &&
    /오후외근/.test(String(reasonBundle || '')) &&
    rawWorkHours !== null;

  const isEndMissingWithERPOT =
    hasERPOT &&
    endMinRaw === null &&
    !isMorningHalfDayLike &&
    !isAfternoonHalfDayLike &&
    rawWorkHours !== null &&
    (/퇴근/.test(String(row?.displayEnd || '')) || isAfternoonOutdoorEndBlankWithERPOT);

  if(isEndMissingWithERPOT){
    const missingEndBaseWorkHours = Number.isFinite(analysisWorkHours)
      ? analysisWorkHours
      : (isHalfDayLike ? 4 : 8);
    finalAnalysisWorkHours = missingEndBaseWorkHours + erpOTHoursRaw;
    finalAdjustedWorkHours = missingEndBaseWorkHours + erpOTHoursRaw;
  }

  const isHolidayWorkDay = isHolidayWorkCandidate
    ? (rawWorkHours !== null || hasERPOT || startMinRaw !== null || endMinRaw !== null)
    : false;

  // ✅ 연구소 연장근로 저녁시간 보정
  // 연장근로가 있는 날 실제 근무구간이 17:00~17:30과 겹치면
  // 실근무/8시보정에서만 저녁시간을 차감한다.
  // 근무시간, 기본근무, 숨은초과, ERP OT 원본은 여기서 직접 수정하지 않는다.
  if(dinnerDeductHours > 0){
    if(finalAnalysisWorkHours !== null){
      finalAnalysisWorkHours = Math.max(0, finalAnalysisWorkHours - dinnerDeductHours);
    }
    if(finalAdjustedWorkHours !== null){
      finalAdjustedWorkHours = Math.max(0, finalAdjustedWorkHours - dinnerDeductHours);
    }
  }

  let baseWorkHours = null;
  let hiddenOvertimeHours = null;
  let erpOTHours = hasERPOT ? erpOTHoursRaw : 0;

  if(isHolidayWorkDay){
    baseWorkHours = 0;
    hiddenOvertimeHours = 0;
  }else if(hasERPOT || hasOvertimeLike){
    baseWorkHours = baseCapHours;
    hiddenOvertimeHours = 0;
  }else if(finalAdjustedWorkHours !== null){
    baseWorkHours = Math.min(finalAdjustedWorkHours, baseCapHours);
    hiddenOvertimeHours = Math.max(0, finalAdjustedWorkHours - baseCapHours);
  }

  // ✅ 숨은초과 노이즈 제거
  // 10분 미만의 숨은초과는 출퇴근/근태 상세 단계에서 0:00으로 처리한다.
  // 이후 월 숨은초과, 평균 숨은초과, 총부하, 위험지수는 이 값을 기준으로 자동 집계된다.
if(
  hiddenOvertimeHours !== null &&
  Math.round(hiddenOvertimeHours * 60) < 10
){
  hiddenOvertimeHours = 0;
}

  return {
    analysisWorkDisplay: finalAnalysisWorkHours === null ? '-' : formatHoursToHM(finalAnalysisWorkHours),
    adjustedWorkDisplay: finalAdjustedWorkHours === null ? '-' : formatHoursToHM(finalAdjustedWorkHours),
    baseWorkDisplay: baseWorkHours === null ? '-' : formatHoursToHM(baseWorkHours),
    hiddenOvertimeDisplay: hiddenOvertimeHours === null ? '-' : formatHoursToHM(hiddenOvertimeHours),
    erpOTDisplayForCheck: hasERPOT ? formatHoursToHM(erpOTHours) : '-',
    analysisWorkHours: finalAnalysisWorkHours,
    adjustedWorkHours: finalAdjustedWorkHours,
    baseWorkHours,
    hiddenOvertimeHours,
    erpOTHours,
    totalLoadHours: (baseWorkHours || 0) + (erpOTHours || 0) + (hiddenOvertimeHours || 0)
  };
}

function renderAttendanceTable(rows){
  const normalizeHM = (v) => {
    const s = String(v || '').trim();
    if(!s || s === '-') return '-';
    const hm = s.match(/^(\d{1,2}):(\d{2})$/);
    if(hm) return s;
    const hh = s.match(/^(\d+(?:\.\d+)?)h$/i);
    if(hh) return formatHoursToHM(Number(hh[1]));
    const n = Number(s);
    if(Number.isFinite(n)) return formatHoursToHM(n);
    return s;
  };
  rows = scopeAttendanceRowsForGeneralUser(rows).filter(r => !isDisplayExcludedAttendance(r));
  $('#attendanceTbody').innerHTML = rows.map(r => `
    <tr>
      <td data-label="일자"><span style="white-space:nowrap;display:inline-block">${r.date || '-'}</span></td>
      <td data-label="사번">${r.id}</td>
      <td data-label="이름"><strong>${r.name}</strong></td>
      <td data-label="본부">${r.division}</td>
      <td data-label="팀">${r.team}</td>
      <td data-label="출근">${r.displayStart || '-'}</td>
      <td data-label="퇴근">${r.displayEnd || '-'}</td>
      <td data-label="근무시간">${normalizeHM(r.totalWork)}</td>
      <td data-label="OT발생">${r.erpOTDisplay || '-'}</td>
      <td data-label="OT인정">${renderApprovedOvertimeInput(r)}</td>
      <td data-label="상태">${r.statusLabel ? attendanceStatusBadge(r.statusLabel) : ''}</td>
      <td data-label="결근확인">${renderAbsenceCheckSelect(r)}</td>
      <td data-label="OT확인">${r.overtimeCheck === '-' ? '-' : renderOvertimeCheckSelect(r)}</td>
      <td data-label="사유">${formatAttendanceReasonHtml(r.reason || '-', r)}</td>
      ${(() => { const a = getAttendanceAnalysisFields(r); return `
      <td data-label="실근무" class="analysisCell">${a.analysisWorkDisplay}</td>
      <td data-label="8시보정" class="analysisCell dim">${a.adjustedWorkDisplay}</td>
      <td data-label="기본근무" class="analysisCell">${a.baseWorkDisplay}</td>
      <td data-label="숨은초과" class="analysisCell">${a.hiddenOvertimeDisplay}</td>
      <td data-label="ERP OT" class="analysisCell dim">${a.erpOTDisplayForCheck}</td>`; })()}
    </tr>
  `).join('');
  $('#attendanceEmpty').style.display = rows.length ? 'none' : 'block';
}

function bindAttendanceFilters(){
  const columns = {
    date: r => r.date || '-',
    id: r => r.id,
    name: r => r.name,
    division: r => r.division,
    team: r => r.team,
    start: r => r.displayStart || '-',
    end: r => r.displayEnd || '-',
    work: r => r.totalWork || '-',
    ot: r => (r.erpOTDisplay === '0:00' ? '-' : r.erpOTDisplay),
    otapproved: r => (r.approvedOvertimeDisplay === '0:00' ? '-' : (r.approvedOvertimeDisplay || '-')),
    status: r => r.statusLabel || '-',
    absencecheck: r => (r.absenceDecision || '-'),
    otcheck: r => (r.overtimeCheck === '-' ? '-' : r.overtimeCheck),
    reason: r => getAttendanceReasonTokens(r)
  };

  const baseRows = scopeAttendanceRowsForGeneralUser(getAttendanceManagementRows(buildAttendanceRows.unfiltered ? buildAttendanceRows.unfiltered() : [])).filter(r => !isDisplayExcludedAttendance(r));

  Object.entries(columns).forEach(([key, getter]) => {
    const dd = document.getElementById('dropdown-' + key);
    if(!dd) return;

    const rawValues = baseRows.flatMap(row => {
      const v = getter(row);
      return Array.isArray(v) ? v : [v];
    }).filter(v => String(v).trim() !== '');
    const values = key === 'reason'
      ? uniqueOrderedReasonTokens(rawValues)
      : [...new Set(rawValues.map(v => String(v)))].sort((a,b)=>String(a).localeCompare(String(b),'ko'));
    const committed = ATT_FILTERS[key] || [];
    dd.innerHTML = values.map(v => `<label><input type="checkbox" value="${String(v).replace(/"/g,'&quot;')}" ${committed.includes(String(v))?'checked':''}> <span>${v}</span></label>`).join('') + `
      <div class="filterActions">
        <button type="button" data-act="all">전체</button>
        <button type="button" data-act="clear">해제</button>
        <button type="button" data-act="apply">적용</button>
      </div>`;

    dd.onclick = (e) => {
      e.stopPropagation();
      const act = e.target.dataset.act;
      if(!act) return;
      e.preventDefault();
      if(act === 'all' || act === 'clear'){
        dd.querySelectorAll('input[type="checkbox"]').forEach(chk => {
          chk.checked = act === 'all';
        });
        return;
      }
      if(act === 'apply'){
        ATT_FILTERS[key] = [...dd.querySelectorAll('input[type="checkbox"]:checked')].map(x => x.value);
        dd.classList.remove('show');
        renderAttendanceTab();
      }
    };
  });

  document.querySelectorAll('.filterTrigger').forEach(btn => {
    if(btn.dataset.bound) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = 'dropdown-' + btn.dataset.filter;
      document.querySelectorAll('.filterDropdown').forEach(x => { if(x.id !== id) x.classList.remove('show'); });
      document.getElementById(id)?.classList.toggle('show');
    });
    btn.dataset.bound = '1';
  });

  if(!document.body.dataset.filterCloseBound){
    document.addEventListener('click', () => {
      document.querySelectorAll('.filterDropdown').forEach(x => x.classList.remove('show'));
    });
    document.body.dataset.filterCloseBound = '1';
  }
}

function renderAttendanceTab(){
  applyAttendanceGeneralUserVisibility();
  bindAttendanceFilters();
  renderAttendanceLeaveToggle();
  const rows = scopeAttendanceRowsForGeneralUser(getAttendanceManagementRows(buildAttendanceRows()));
  renderAttendanceKpis(rows);
  renderAttendanceChart(rows);
  renderAttendanceInsights(rows);
  renderAttendanceTable(rows);
}

function renderAttendanceMissingAnalysis(){
  const summaryEl = document.getElementById('attendanceMissingSummary');
  const top5El = document.getElementById('attendanceMissingTop5');
  const tbody = document.getElementById('attendanceMissingTbody');
  const emptyEl = document.getElementById('attendanceMissingEmpty');
  if(!summaryEl || !top5El || !tbody || !emptyEl) return;

  const stripHtmlText = (value) => String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizeNameSafe = (value) => {
    const raw = String(value || '').trim();
    return (typeof normalizeEmployeeName === 'function') ? normalizeEmployeeName(raw) : raw;
  };

  const selectedRowsIgnoringColumnFilters = () => {
    const backup = {};
    try{
      if(typeof ATT_FILTERS === 'object' && ATT_FILTERS){
        Object.keys(ATT_FILTERS).forEach(key => {
          backup[key] = Array.isArray(ATT_FILTERS[key]) ? ATT_FILTERS[key].slice() : [];
          ATT_FILTERS[key] = [];
        });
      }
      return (typeof buildAttendanceRows === 'function') ? buildAttendanceRows() : [];
    }catch(e){
      console.warn('[missing-analysis] build rows failed', e);
      return [];
    }finally{
      try{ Object.keys(backup).forEach(key => { ATT_FILTERS[key] = backup[key]; }); }catch(e){}
    }
  };

  const isContinuousLeaveRowSafe = (row) => {
    try{
      if(typeof isAttendanceContinuousLeaveRow === 'function' && isAttendanceContinuousLeaveRow(row)) return true;
      if(typeof isContinuousLeaveReason === 'function' && typeof getAttendanceBaseReason === 'function' && isContinuousLeaveReason(getAttendanceBaseReason(row))) return true;
    }catch(e){}
    return false;
  };

  // 기준 데이터: 근태관리 컬럼 필터와 무관하게 선택 월/본부/팀 기준 전체 행을 사용합니다.
  // 단, 출산휴가·육아휴직·휴직 등 연속 휴직성 행은 누락 집계에서 자동 제외합니다.
  const allRows = selectedRowsIgnoringColumnFilters();
  const continuousLeaveRows = (allRows || []).filter(isContinuousLeaveRowSafe);
  const rows = (allRows || []).filter(row => !isContinuousLeaveRowSafe(row));

  // 선택 기간에 휴직성 행만 존재하는 담당자는 담당자 목록에서도 자동 제외합니다.
  // 복직/휴직전환처럼 동일 기간에 실제 근무성 행이 있으면 제외하지 않습니다.
  const leaveOnlyNames = new Set();
  const rowsByNameForLeaveCheck = new Map();
  (allRows || []).forEach(row => {
    const name = normalizeNameSafe(row?.name);
    if(!name) return;
    const list = rowsByNameForLeaveCheck.get(name) || [];
    list.push(row);
    rowsByNameForLeaveCheck.set(name, list);
  });
  rowsByNameForLeaveCheck.forEach((personRows, name) => {
    const hasRows = personRows.length > 0;
    const hasNonLeaveRow = personRows.some(row => !isContinuousLeaveRowSafe(row));
    if(hasRows && !hasNonLeaveRow) leaveOnlyNames.add(name);
  });

  const byPerson = new Map();

  // 0건 담당자도 표시하기 위해 사원 마스터를 우선 사용합니다.
  // EMPLOYEES/분석집계에 아직 생성되지 않은 담당자(예: 김지현)도 여기서 빠지지 않습니다.
  const masterSource = (() => {
    if(Array.isArray(empMaster) && empMaster.length) return empMaster;
    if(typeof DEFAULT_MASTER !== 'undefined' && Array.isArray(DEFAULT_MASTER) && DEFAULT_MASTER.length) return DEFAULT_MASTER;
    if(Array.isArray(EMPLOYEES) && EMPLOYEES.length) return EMPLOYEES;
    return [];
  })();

  const isInCurrentOrgScope = (emp) => {
    const division = String(emp?.division || '').trim();
    const team = String(emp?.team || '').trim();
    if(STATE.division !== '전체' && division !== STATE.division) return false;
    if(STATE.team !== '전체' && team !== STATE.team) return false;
    return true;
  };

  masterSource
    .filter(emp => String(emp?.status || '재직').trim() === '재직')
    .filter(emp => String(emp?.attendanceTarget || 'Y').trim().toUpperCase() !== 'N')
    .filter(isInCurrentOrgScope)
    .forEach(emp => {
      const name = normalizeNameSafe(emp?.name);
      if(!name || leaveOnlyNames.has(name) || byPerson.has(name)) return;
      byPerson.set(name, {
        name,
        division: emp?.division || '',
        team: emp?.team || '',
        sortOrder: Number.isFinite(Number(emp?.sortOrder)) ? Number(emp.sortOrder) : 999999,
        startMissing: 0,
        endMissing: 0,
        potentialStart: 0,
        potentialEnd: 0
      });
    });

  const isBlankClockDisplay = (value) => {
    const v = stripHtmlText(value);
    return !v || v === '-' || v === '미입력' || v === '없음';
  };

  // 확정 누락: 근태관리 상세의 출근/퇴근 컬럼에 실제로 누락으로 표시된 건만 카운트
  const isDefiniteStartMissing = (row) => stripHtmlText(row?.displayStart) === '출근누락';
  const isDefiniteEndMissing = (row) => stripHtmlText(row?.displayEnd) === '퇴근누락';

  const getMissingPotentialReason = (row) => stripHtmlText(
    row?.originalErpReason ||
    row?.erpReason ||
    (typeof getAttendanceBaseReason === 'function' ? getAttendanceBaseReason(row) : '') ||
    row?.primaryReason ||
    row?.reason ||
    row?.originalStatus ||
    row?.status ||
    ''
  );

  const isExcludedPotentialReason = (reason) => {
    const r = stripHtmlText(reason);
    if(!r || r === '-' || r === '정상근무') return true;
    if(typeof isContinuousLeaveReason === 'function' && isContinuousLeaveReason(r)) return true;
    if(typeof isVacationReason === 'function' && isVacationReason(r)) return true;
    if(/연차|반차|휴가|휴무|휴직|출산|육아|병가|공가|경조|결근|재택근무|리프레쉬/.test(r)) return true;
    if(/출근미입력|퇴근미입력|출퇴근미입력|출근누락|퇴근누락/.test(r)) return true;
    return false;
  };

  const isPotentialStartCheck = (row) => {
    // 잠재출근은 잠재퇴근과 동일한 기준으로, 근태관리 표의 출근 칸이 비어 보이는 건을 그대로 확인 대상으로 집계합니다.
    // 파견/외근/연차/반차 등 사유가 있더라도 화면상 출근 '-' 건이면 사용자 검토용 잠재출근에 포함합니다.
    // 단, 위에서 출산휴가·육아휴직·휴직 등 연속 휴직성 행은 이미 rows에서 제외되어 있습니다.
    if(!isBlankClockDisplay(row?.displayStart)) return false;
    return true;
  };

  const isPotentialEndCheck = (row) => {
    // 잠재퇴근은 근태관리 표의 퇴근 칸이 비어 보이는 건을 그대로 확인 대상으로 집계합니다.
    // 오후반차/외근 등 사유가 있더라도 화면상 퇴근 '-' 건이면 사용자 검토용 잠재퇴근에 포함합니다.
    // 단, 위에서 출산휴가·육아휴직·휴직 등 연속 휴직성 행은 이미 rows에서 제외되어 있습니다.
    if(!isBlankClockDisplay(row?.displayEnd)) return false;
    return true;
  };

  (rows || []).forEach(row => {
    const name = normalizeNameSafe(row.name);
    if(!name || leaveOnlyNames.has(name)) return;
    const current = byPerson.get(name) || {
      name,
      division: row.division || '',
      team: row.team || '',
      sortOrder: Number.isFinite(Number(row?.sortOrder)) ? Number(row.sortOrder) : 999999,
      startMissing: 0,
      endMissing: 0,
      potentialStart: 0,
      potentialEnd: 0
    };

    if(isDefiniteStartMissing(row)) current.startMissing += 1;
    if(isDefiniteEndMissing(row)) current.endMissing += 1;
    if(isPotentialStartCheck(row)) current.potentialStart += 1;
    if(isPotentialEndCheck(row)) current.potentialEnd += 1;

    if(!current.division && row.division) current.division = row.division;
    if(!current.team && row.team) current.team = row.team;
    if((!Number.isFinite(Number(current.sortOrder)) || Number(current.sortOrder) === 999999) && Number.isFinite(Number(row?.sortOrder))) current.sortOrder = Number(row.sortOrder);
    byPerson.set(name, current);
  });

  const list = Array.from(byPerson.values())
    .map(item => {
      const total = item.startMissing + item.endMissing;
      const potentialTotal = item.potentialStart + item.potentialEnd;
      let status = '정상';
      let tone = 'normal';
      if(total >= 4){ status = '문제'; tone = 'danger'; }
      else if(total >= 2){ status = '주의'; tone = 'warn'; }
      return { ...item, total, potentialTotal, status, tone };
    })
    .sort((a,b) => {
      if(b.total !== a.total) return b.total - a.total;
      if(b.endMissing !== a.endMissing) return b.endMissing - a.endMissing;
      if(b.startMissing !== a.startMissing) return b.startMissing - a.startMissing;
      if(b.potentialTotal !== a.potentialTotal) return b.potentialTotal - a.potentialTotal;
      const divCompare = String(a.division || '').localeCompare(String(b.division || ''), 'ko');
      if(divCompare) return divCompare;
      const teamCompare = String(a.team || '').localeCompare(String(b.team || ''), 'ko');
      if(teamCompare) return teamCompare;
      if(Number(a.sortOrder || 999999) !== Number(b.sortOrder || 999999)) return Number(a.sortOrder || 999999) - Number(b.sortOrder || 999999);
      return a.name.localeCompare(b.name, 'ko');
    });

  const totalStart = list.reduce((sum, item) => sum + item.startMissing, 0);
  const totalEnd = list.reduce((sum, item) => sum + item.endMissing, 0);
  const totalPotentialStart = list.reduce((sum, item) => sum + item.potentialStart, 0);
  const totalPotentialEnd = list.reduce((sum, item) => sum + item.potentialEnd, 0);
  const totalPeople = list.filter(item => item.total > 0).length;
  const potentialPeople = list.filter(item => item.potentialTotal > 0).length;
  const topPerson = list.find(item => item.total > 0);
  const excludedLeavePeopleCount = leaveOnlyNames.size;
  const excludedLeaveRowCount = continuousLeaveRows.length;

  summaryEl.innerHTML = [
    ['출근누락 총건수', `${totalStart}건`, '출근 컬럼에 표시된 확정 누락 건수'],
    ['퇴근누락 총건수', `${totalEnd}건`, '퇴근 컬럼에 표시된 확정 누락 건수'],
    ['누락 발생 인원', `${totalPeople}명`, `0건 담당자 포함 전체 ${list.length}명 기준`],
    ['휴직 자동 제외', `${excludedLeavePeopleCount}명`, `출산휴가·육아휴직·휴직 등 연속 휴직성 행 ${excludedLeaveRowCount}건 제외`],
    ['잠재 확인 필요', `${totalPotentialStart + totalPotentialEnd}건`, `잠재출근 ${totalPotentialStart} · 잠재퇴근 ${totalPotentialEnd} / 대상 ${potentialPeople}명`],
    ['최다 누락 담당자', topPerson ? `${topPerson.name} ${topPerson.total}건` : '-', topPerson ? `출근 ${topPerson.startMissing} · 퇴근 ${topPerson.endMissing} · 잠재 ${topPerson.potentialTotal}` : '']
  ].map(([label, value, sub]) => `
    <div class="card" style="padding:18px;border-radius:18px;box-shadow:none">
      <div class="label">${label}</div>
      <div class="value" style="font-size:28px">${value}</div>
      <div class="sub">${sub}</div>
    </div>
  `).join('');

  const top5 = list.filter(item => item.total > 0).slice(0,5);
  const maxTotal = Math.max(...top5.map(item => item.total), 1);
  top5El.innerHTML = top5.length ? top5.map(item => `
    <div class="missingBarRow">
      <strong>${item.name}</strong>
      <div class="missingBarBg"><div class="missingBarFill" style="width:${(item.total / maxTotal) * 100}%"></div></div>
      <span>${item.total}건</span>
    </div>
  `).join('') : '<div class="employeeEmpty" style="padding:20px 0">확정 누락 데이터가 없습니다.</div>';

  tbody.innerHTML = list.map((item, idx) => `
    <tr class="${idx < 2 && item.total > 0 ? 'missingTopRow' : ''}">
      <td><span class="missingRank">${idx + 1}</span></td>
      <td><strong>${item.name}</strong></td>
      <td>${item.division || '-'}</td>
      <td>${item.team || '-'}</td>
      <td><span class="missingCount ${item.startMissing >= 4 ? 'danger' : item.startMissing >= 1 ? 'warn' : 'zero'}">${item.startMissing}</span></td>
      <td><span class="missingCount ${item.endMissing >= 4 ? 'danger' : item.endMissing >= 1 ? 'warn' : 'zero'}">${item.endMissing}</span></td>
      <td><span class="missingTotalPill ${item.tone === 'danger' ? 'danger' : item.tone === 'warn' ? 'warn' : ''}">${item.total}</span></td>
      <td><span class="missingCount ${item.potentialStart > 0 ? 'warn' : 'zero'}">${item.potentialStart}</span></td>
      <td><span class="missingCount ${item.potentialEnd > 0 ? 'warn' : 'zero'}">${item.potentialEnd}</span></td>
      <td><span class="missingStatePill ${item.tone}">${item.status}</span></td>
    </tr>
  `).join('');

  emptyEl.style.display = list.length ? 'none' : 'block';
}

function rerenderDashboardVisibleCharts(){
  const rerender = () => {
    const months = periodMonths();
    const scoped = scopedEmployees();
    renderTopCharts(scoped, months);
    renderInsight(scoped, months);
    renderRisk(scoped);
    renderPeople(scoped);
  };
  requestAnimationFrame(() => {
    rerender();
    setTimeout(rerender, 80);
  });
}

function bindMainTabs(){
  $$('.mainTab').forEach(btn => {
    btn.onclick = () => {
      const mainName = String(btn.dataset.main || '').trim();
      if(typeof canAccessAttendanceMainTab === 'function' && !canAccessAttendanceMainTab(mainName)){
        alert(getAttendanceMainTabDenyMessage(mainName));
        if(typeof applyAttendanceMainMenuAccess === 'function') applyAttendanceMainMenuAccess();
        activateMainTabWithoutRender('attendance');
        saveAttendanceMainTab('attendance');
        return;
      }
      if(mainName) saveAttendanceMainTab(mainName);
      $$('.mainTab').forEach(x => x.classList.remove('active'));
      $$('.mainPanel').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      const panel = $('#main-' + mainName);
      if(panel) panel.classList.add('active');
      if(mainName === 'dashboard' || mainName === 'deep-analysis'){
        rerenderDashboardVisibleCharts();
      }
      trendUpdatePeriodControlVisibility();
      if(mainName === 'trend-analysis'){
        requestAnimationFrame(() => { renderTrendAnalysis(); setTimeout(renderTrendAnalysis, 80); });
      }
      if(mainName === 'attendance-missing'){
        renderAttendanceMissingAnalysis();
      }
    };
  });
  if(typeof applyAttendanceMainMenuAccess === 'function') applyAttendanceMainMenuAccess();
}

function renderTabs(){
  $$('.tab').forEach(btn=>{
    btn.onclick=()=>{
      $$('.tab').forEach(x=>x.classList.remove('active'));
      $$('.panel').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      $('#panel-'+btn.dataset.tab).classList.add('active');
      if($('#main-dashboard')?.classList.contains('active') || $('#main-deep-analysis')?.classList.contains('active')){
        rerenderDashboardVisibleCharts();
      }
    };
  });
}

window.debugMobility = function(){
  const scoped = scopedEmployees();
  const score = x => (Number(x.businessTripDays || 0) * 1.5) + (Number(x.outdoorDays || 0) * 0.5);
  const rows = scoped.map(x => ({
    name: x.name,
    division: x.division,
    team: x.team,
    businessTripDays: Number(x.businessTripDays || 0),
    outdoorDays: Number(x.outdoorDays || 0),
    mobilityScore: Number(score(x).toFixed(1)),
    dailyOT: Number(x.scopedDailyOvertime || 0),
    monthlyOT: Number(x.scopedMonthlyOvertime || 0)
  })).sort((a,b) => b.mobilityScore - a.mobilityScore);
  console.table(rows);
  console.log('totalMobility=', rows.reduce((s,x)=>s + x.mobilityScore, 0).toFixed(1));
  return rows;
};

window.addEventListener('message', async (event) => {
  if(event?.data?.type !== 'special-notes-updated') return;
  await loadSpecialNotes();
  renderSpecialNotes();
  renderAttendanceTab();
});

function render(){
  const keepTab = getActiveAttendanceMainTab('attendance');
  saveAttendanceMainTab(keepTab);
  if(!window.__empMasterInitialized){
    loadOrgMaster();
    loadEmpMaster();
    bindUploadRuntimeEvents();
    loadUploadedAttendanceData();
    window.__empMasterInitialized = true;
  }
  dedupeEmpMasterByName();
  if(Array.isArray(REAL_ATTENDANCE_DATA) && REAL_ATTENDANCE_DATA.length){
    rebuildDerivedMetricsFromAttendance();
  }else{
    syncDashboardDataFromEmpMaster();
  }
  updateUploadStatus();
  renderFilters();
  const months=periodMonths(), scoped=scopedEmployees();
  renderKpis(scoped);
  renderSummary(months);
  renderAlerts(months);
  renderAttendanceTab();
  renderAttendanceMissingAnalysis();
  renderTopCharts(scoped, months);
  renderInsight(scoped, months);
  renderRisk(scoped);
  renderPeople(scoped);
  renderTrendAnalysis();
  bindMainTabs();
  restoreSavedMainTab(keepTab);
  renderTabs();
  if(typeof applyAttendanceManualEditControls === 'function') applyAttendanceManualEditControls();
}


function deriveAttendanceRow(row, metaByName){
  const cleanedName = normalizeEmployeeName(row.name);
  const meta = metaByName.get(cleanedName);
  const rawReason = String(row.erpReason || row.reason || '').trim();
  const startRaw = String(row.start || '').trim();
  const endRaw = String(row.end || '').trim();
  const workRaw = String(row.workHours || row.realWorkHours || '').trim();
  const erpOT = Number(row.erpActualOvertime || 0);
  const isHolidayDate = HOLIDAY_DATE_SET.has(String(row.date || ''));
  const holidayLike = isHolidayLike(rawReason) || isHolidayDate;
  const fullDayReasons = ['외근','오전외근','오후외근','출장'];
  const halfDayReasons = ['오전반차','오후반차','반차'];
  const leaveOnlyReasons = ['육아휴직','출산휴가','산전후휴가','병가','가족돌봄휴직','장기휴직','휴직','연차','공가','보건휴가'];
  const applicableSpecialNote = findApplicableSpecialNote({ ...row, name: cleanedName, employeeId: row.employeeId || meta?.id || row.id || '' });
  const specialType = String(applicableSpecialNote?.specialType || '').trim();
  const isDispatchSpecial = specialType === '파견';
  const dispatchHalfDayRule = isDispatchSpecial && halfDayReasons.includes(rawReason);

  let displayStart = startRaw || '';
  let displayEnd = endRaw || '';
  let totalWork = workRaw || '';
  let statusLabel = '정상출퇴근';
  let bucket = '정상';
  let reason = rawReason || '-';
  let overtimeCheck = '-';
  let seccomOT = null;

  if (holidayLike && !startRaw && !endRaw && !workRaw && erpOT <= 0) {
    return {
      ...row,
      date: row.date,
      id: meta?.id || row.employeeId || cleanedName,
      name: cleanedName,
      division: meta?.division || row.division,
      divisionCode: meta?.divisionCode || row.divisionCode || meta?.division || row.division,
      team: meta?.team || row.team,
      teamCode: meta?.teamCode || row.teamCode || meta?.team || row.team,
      grade: meta?.grade || row.grade,
      sortOrder: Number.isFinite(Number(meta?.sortOrder)) ? Number(meta.sortOrder) : 999999,
      displayStart: '',
      displayEnd: '',
      totalWork: '',
      statusLabel: '',
      bucket: '근태사유',
      reason: rawReason || '공휴일',
      overtimeCheck: '-',
      seccomOTDisplay: '',
      erpOTDisplay: ''
    };
  }

  if (holidayLike && (startRaw || endRaw || workRaw || erpOT > 0)) {
    reason = rawReason || '휴일근로';
  }

  if (leaveOnlyReasons.includes(rawReason)) {
    return {
      ...row,
      date: row.date,
      id: meta?.id || row.employeeId || cleanedName,
      name: cleanedName,
      division: meta?.division || row.division,
      divisionCode: meta?.divisionCode || row.divisionCode || meta?.division || row.division,
      team: meta?.team || row.team,
      teamCode: meta?.teamCode || row.teamCode || meta?.team || row.team,
      grade: meta?.grade || row.grade,
      sortOrder: Number.isFinite(Number(meta?.sortOrder)) ? Number(meta.sortOrder) : 999999,
      displayStart: '',
      displayEnd: '',
      totalWork: '',
      statusLabel: '',
      bucket: '근태사유',
      reason: rawReason,
      overtimeCheck: '-',
      seccomOTDisplay: '',
      erpOTDisplay: ''
    };
  }

  if (halfDayReasons.includes(rawReason)) {
    if(dispatchHalfDayRule){
      displayStart = '-';
      displayEnd = '-';
      totalWork = '';
    }else if(rawReason === '오전반차'){
      displayStart = '-';
      displayEnd = endRaw || '퇴근누락';
      totalWork = endRaw ? calcMorningHalfDayWorkText(endRaw) : '';
    }else if(rawReason === '오후반차'){
      // ✅ 오후반차는 오전 근무 08:00~12:00 기준 4:00으로 고정
      totalWork = calcAfternoonHalfDayWorkText();
      displayStart = startRaw || '출근누락';
      displayEnd = '-';
    }else{
      totalWork = totalWork || '4:00';
      if (!startRaw) displayStart = '출근누락';
      if (!endRaw) displayEnd = '퇴근누락';
    }
    bucket = '근태사유';
    statusLabel = '정상출퇴근';
    reason = rawReason;
    seccomOT = 0;
  } else if (fullDayReasons.includes(rawReason)) {
    bucket = '근태사유';
    statusLabel = '정상출퇴근';
    reason = rawReason;
    if (!(startRaw && endRaw && totalWork)) {
      totalWork = '9:00';
      if (!startRaw) displayStart = '출근누락';
      if (!endRaw) displayEnd = '퇴근누락';
      seccomOT = 0;
    }
  } else {
    if (!startRaw && endRaw) {
      displayStart = '출근누락';
      totalWork = totalWork || '9:00';
      bucket = '문제';
      statusLabel = '문제';
      reason = rawReason || '출근 기록 누락';
    } else if (startRaw && !endRaw) {
      displayEnd = '퇴근누락';
      totalWork = totalWork || '9:00';
      bucket = '문제';
      statusLabel = '문제';
      reason = rawReason || '퇴근 기록 누락';
    } else if (!startRaw && !endRaw) {
      displayStart = '출근누락';
      displayEnd = '퇴근누락';
      totalWork = '';
      seccomOT = 0;
      bucket = rawReason ? '근태사유' : '문제';
      statusLabel = rawReason ? '' : '문제';
      reason = rawReason || '출퇴근 기록 없음';
    }
  }

  const totalHoursForOT = parseWorkDurationToHours(totalWork);
  if (displayEnd === '퇴근누락') {
    seccomOT = null;
  } else if (seccomOT === null && totalHoursForOT !== null) {
    seccomOT = Math.max(0, +(totalHoursForOT - 9).toFixed(2));
  }

  // ✅ OT 자동판정 기준 변경
  // 기존: 근무시간(totalWork) - 9:00 >= ERP OT
  // 변경: 8시보정값(adjustedWorkHours) - 기본근무값(baseWorkHours) >= ERP OT
  let adjustedBasedOT = null;
  if (erpOT > 0) {
    const otValidationFields = getAttendanceAnalysisFields({
      ...row,
      name: cleanedName,
      displayStart,
      displayEnd,
      totalWork,
      reason,
      erpOTDisplay: formatHoursToHM(erpOT)
    });
    const adjustedHours = Number(otValidationFields?.adjustedWorkHours);
    const rawBaseHours = Number(otValidationFields?.baseWorkHours);
    if (Number.isFinite(adjustedHours)) {
      const comparableBaseHours = Number.isFinite(rawBaseHours) && rawBaseHours > 0 ? rawBaseHours : 0;
      adjustedBasedOT = Math.max(0, +(adjustedHours - comparableBaseHours).toFixed(2));
    }

    if (adjustedBasedOT === null) {
      overtimeCheck = '미인정';
      bucket = '문제';
      statusLabel = '문제';
    } else if (adjustedBasedOT + 0.001 >= erpOT) {
      overtimeCheck = '인정';
    } else {
      overtimeCheck = '미인정';
      bucket = '문제';
      statusLabel = '문제';
    }

    const pendingManualOvertimeCheck = String(getPendingOvertimeCheck(row.recordId || row.id) || '').trim();
    const savedManualOvertimeCheck = String(
      getSavedOvertimeCheckOverride(row) ||
      row.overtimeCheckResult ||
      row.overtime_check_result ||
      ''
    ).trim();
    const manualOvertimeCheck = String(pendingManualOvertimeCheck || savedManualOvertimeCheck || '').trim();
    const canUseManualOvertimeCheck = !!pendingManualOvertimeCheck || adjustedBasedOT === null || adjustedBasedOT + 0.001 >= erpOT || manualOvertimeCheck !== '인정';
    if(canUseManualOvertimeCheck && ['인정','부분인정','미인정','확인필요'].includes(manualOvertimeCheck)){
      overtimeCheck = (manualOvertimeCheck === '확인필요' ? '미인정' : manualOvertimeCheck);
      if(overtimeCheck === '미인정'){
        bucket = '문제';
        statusLabel = '문제';
      }else{
        bucket = '주의';
        statusLabel = '주의';
      }
    }
  }

  return {
    ...row,
    date: row.date,
    id: meta?.id || row.employeeId || cleanedName,
    name: cleanedName,
    division: meta?.division || row.division,
    team: meta?.team || row.team,
    grade: meta?.grade || row.grade,
    displayStart,
    displayEnd,
    totalWork,
    statusLabel,
    bucket,
    reason,
    overtimeCheck,
    seccomOTDisplay: seccomOT === null ? '미계산' : formatHoursToHM(seccomOT),
    erpOTDisplay: erpOT > 0 ? formatHoursToHM(erpOT) : ''
  };
}

function compareAttendanceRows(a, b){
  const cmpDate = String(a.date || '').localeCompare(String(b.date || ''), 'ko');
  if(cmpDate) return cmpDate;

  const aDivisionCode = String(a.divisionCode || a.division || '').trim();
  const bDivisionCode = String(b.divisionCode || b.division || '').trim();
  const cmpDivision = aDivisionCode.localeCompare(bDivisionCode, 'ko');
  if(cmpDivision) return cmpDivision;

  const aTeamCode = String(a.teamCode || a.team || '').trim();
  const bTeamCode = String(b.teamCode || b.team || '').trim();
  const cmpTeam = aTeamCode.localeCompare(bTeamCode, 'ko');
  if(cmpTeam) return cmpTeam;

  const aSort = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 999999;
  const bSort = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 999999;
  const cmpSort = aSort - bSort;
  if(cmpSort) return cmpSort;

  const cmpName = String(a.name || '').localeCompare(String(b.name || ''), 'ko');
  if(cmpName) return cmpName;

  return String(a.id || '').localeCompare(String(b.id || ''), 'ko');
}

buildAttendanceRows = function(){
  const metaByName = new Map(empMaster.map(e => [normalizeEmployeeName(e.name), e]));
  return REAL_ATTENDANCE_DATA
    .map(row => deriveAttendanceRow(row, metaByName))
    .filter(Boolean)
    .filter(row => isAttendanceTargetIncludedRow(row, metaByName))
    .filter(row => (STATE.division === '전체' || row.division === STATE.division) && (STATE.team === '전체' || row.team === STATE.team))
    .filter(matchesAttendanceFilters)
    .sort(compareAttendanceRows);
};

buildAttendanceRows.unfiltered = function(){
  const metaByName = new Map(empMaster.map(e => [normalizeEmployeeName(e.name), e]));
  return REAL_ATTENDANCE_DATA
    .map(row => deriveAttendanceRow(row, metaByName))
    .filter(Boolean)
    .filter(row => isAttendanceTargetIncludedRow(row, metaByName))
    .sort(compareAttendanceRows);
};

// 최종 판정 로직 재정의: 카드/지문 중복 통합 + 사유/주의/문제 기준 반영
buildAttendanceRows = function(){
  const metaByName = new Map(empMaster.map(e => [normalizeEmployeeName(e.name), e]));
  const mergedRows = getMergedRawAttendanceData();
  const sourceRows = Array.isArray(mergedRows) && mergedRows.length ? mergedRows : (Array.isArray(REAL_ATTENDANCE_DATA) ? REAL_ATTENDANCE_DATA : []);
  const mapper = Array.isArray(mergedRows) && mergedRows.length
    ? (row => decorateAttendanceRow(row, metaByName))
    : (row => deriveAttendanceRow(row, metaByName));
  return sourceRows
    .map(mapper)
    .filter(Boolean)
    .filter(row => isAttendanceTargetIncludedRow(row, metaByName))
    .filter(row => rowMatchesSelectedPeriod(row.date))
    .filter(row => !isDisplayExcludedAttendance(row))
    .filter(row => (STATE.division === '전체' || row.division === STATE.division) && (STATE.team === '전체' || row.team === STATE.team))
    .filter(matchesAttendanceFilters)
    .sort(compareAttendanceRows);
};

buildAttendanceRows.unfiltered = function(){
  const metaByName = new Map(empMaster.map(e => [normalizeEmployeeName(e.name), e]));
  const mergedRows = getMergedRawAttendanceData();
  const sourceRows = Array.isArray(mergedRows) && mergedRows.length ? mergedRows : (Array.isArray(REAL_ATTENDANCE_DATA) ? REAL_ATTENDANCE_DATA : []);
  const mapper = Array.isArray(mergedRows) && mergedRows.length
    ? (row => decorateAttendanceRow(row, metaByName))
    : (row => deriveAttendanceRow(row, metaByName));
  return sourceRows
    .map(mapper)
    .filter(Boolean)
    .filter(row => isAttendanceTargetIncludedRow(row, metaByName))
    .filter(row => rowMatchesSelectedPeriod(row.date))
    .filter(row => !isDisplayExcludedAttendance(row))
    .sort(compareAttendanceRows);
};

function debounce(fn, wait){
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

const renderLightweight = debounce(() => {
  const months = periodMonths();
  const scoped = scopedEmployees();
  renderAttendanceTab();
  renderAttendanceMissingAnalysis();
  renderTopCharts(scoped, months);
  renderInsight(scoped, months);
  renderRisk(scoped);
  renderPeople(scoped);
  renderTrendAnalysis();
}, 120);

document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-fatigue-mode]');
  if(!btn) return;
  const mode = btn.getAttribute('data-fatigue-mode') || 'recommended';
  if(STATE.fatigueMode === mode) return;
  STATE.fatigueMode = mode;
  const months = periodMonths();
  const scoped = scopedEmployees();
  renderTopCharts(scoped, months);
});

window.addEventListener('load', () => {
  render();
  const dashboardBtn = document.querySelector('.mainTab[data-main="dashboard"]');
  if(dashboardBtn && dashboardBtn.classList.contains('active')){
    rerenderDashboardVisibleCharts();
  }
}, { once:true });

window.addEventListener('resize', renderLightweight);


(function(){
  const list = scopedEmployees();
  const totalOT = list.reduce((a,b)=>a+(b.scopedMonthlyOvertime||0),0);
  const activity = list.reduce((a,b)=>a+((b.businessTripDays||0)+(b.outdoorDays||0)),0);
  const count = Math.max(1,list.length);

  document.getElementById('kpiTotalOT').textContent = (totalOT).toFixed(0) + "시간";
  document.getElementById('kpiMobility').textContent = (activity/count).toFixed(1);
  document.getElementById('kpiComplex').textContent = (activity).toFixed(1) + "건";
})();
