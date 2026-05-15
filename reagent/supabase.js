const SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

window.ReagentApp = window.ReagentApp || {};
window.ReagentApp.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

window.ReagentApp.getPortalSession = function () {
  try {
    if (window.parent && typeof window.parent.getPortalSession === "function") {
      return window.parent.getPortalSession();
    }
  } catch (_) {}

  try {
    if (window.parent && window.parent.portalSession) {
      return window.parent.portalSession;
    }
  } catch (_) {}

  return window.portalSession || window.currentPortalSession || null;
};

window.ReagentApp.getCompanyId = function () {
  const session = window.ReagentApp.getPortalSession?.() || {};
  const fromSession =
    session.companyId ||
    session.company_id ||
    session.company?.id ||
    session.company?.company_id ||
    window.currentCompanyId ||
    "";

  if (fromSession) return String(fromSession);

  try {
    const params = new URLSearchParams(location.search);
    return params.get("company_id") || params.get("companyId") || "";
  } catch (_) {
    return "";
  }
};

window.ReagentApp.withCompanyPayload = function (payload = {}) {
  const companyId = window.ReagentApp.getCompanyId?.() || "";
  return companyId ? { ...payload, company_id: companyId } : { ...payload };
};

window.ReagentApp.withCompanyRows = function (rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => window.ReagentApp.withCompanyPayload(row));
};

window.ReagentApp.scopedCompanyQuery = function (query) {
  const companyId = window.ReagentApp.getCompanyId?.() || "";
  return companyId ? query.eq("company_id", companyId) : query;
};

