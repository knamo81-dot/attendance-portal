const SDS_SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
const SDS_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";
window.SDSApp = window.SDSApp || {};
window.SDSApp.db = window.supabase.createClient(SDS_SUPABASE_URL, SDS_SUPABASE_KEY);
window.SDSApp.getPortalSession = function(){
  try{ if(window.parent && typeof window.parent.getPortalSession === 'function') return window.parent.getPortalSession(); }catch(_){}
  try{ if(window.parent && window.parent.portalSession) return window.parent.portalSession; }catch(_){}
  try{ return JSON.parse(sessionStorage.getItem('portalSession')||'null') || JSON.parse(localStorage.getItem('portalSession')||'null'); }catch(_){ return null; }
};
window.SDSApp.getCompanyId = function(){
  const s=window.SDSApp.getPortalSession()||{};
  const id=s.activeCompanyId||s.companyId||s.company_id||s.activeCompany?.id||s.activeCompany?.company_id||s.company?.id||s.company?.company_id;
  if(id) return String(id);
  const p=new URLSearchParams(location.search); return p.get('company_id')||p.get('active_company_id')||'';
};
