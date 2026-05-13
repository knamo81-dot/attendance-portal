/* portal-home-url-email-helper.js | Phase 1 split from original portal-home.html
   원본 inline script #2 (id=portal-home-url-email-helper)를 실행 순서 그대로 외부 파일로 분리했습니다. */

function getPortalInjectedEmail(){
  try{
    const params = new URLSearchParams(location.search);
    const qEmail = params.get('email');
    if(qEmail) return String(qEmail || '').trim().toLowerCase();
  }catch(e){}
  return '';
}
