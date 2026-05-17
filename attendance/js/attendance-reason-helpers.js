/* ===== extracted inline script #3 (inline) ===== */

function isFieldWorkLikeReason(reason){
  const s = String(reason || '').trim();
  return ['파견','외근','오전외근','오후외근','오전반차','오후반차'].includes(s);
}
function isHalfDayReason(reason){
  const s = String(reason || '').trim();
  return s === '오전반차' || s === '오후반차';
}
function hasOvertimeLikeReason(reason){
  return String(reason || '').includes('연장근무');
}
function getFallbackBaseMinutesByReason(reason){
  if(isHalfDayReason(reason)) return 4 * 60;
  if(isFieldWorkLikeReason(reason)) return 8 * 60;
  return null;
}
function getFallbackAdjustedMinutesByReason(reason){
  return getFallbackBaseMinutesByReason(reason);
}

function getAttendanceReasonBundle(row){
  return [
    row?.erpReason,
    row?.reason,
    row?.attendanceType,
    row?.statusReason,
    getAttendanceBaseReason(row)
  ].filter(Boolean).join(' ');
}
function isFieldWorkLikeBundle(text){
  const s = String(text || '');
  return /파견|외근|오전외근|오후외근/.test(s);
}
function isHalfDayLikeBundle(text){
  const s = String(text || '');
  return /오전반차|오후반차/.test(s);
}
function hasOvertimeLikeBundle(text){
  return /연장근무/.test(String(text || ''));
}
