/* ===== extracted inline script #1 (inline) ===== */

(function(){
  var embed = false;
  try{ if(window.self !== window.top) embed = true; }catch(e){ embed = true; }
  var q = new URLSearchParams(window.location.search);
  if(q.get('embed') === '1' || q.get('embed') === 'true') embed = true;
  window.__ATTENDANCE_EMBED__ = embed;
  if(embed){
    document.documentElement.classList.add('embed-mode');
    document.body.classList.add('embed-mode');
  }
})();
