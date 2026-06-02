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
    session.activeCompanyId ||
    session.active_company_id ||
    session.activeCompany?.id ||
    session.activeCompany?.company_id ||
    session.selectedCompanyId ||
    session.selected_company_id ||
    session.companyId ||
    session.company_id ||
    session.company?.id ||
    session.company?.company_id ||
    window.activeCompanyId ||
    window.currentActiveCompanyId ||
    window.currentCompanyId ||
    "";

  if (fromSession) return String(fromSession);

  try {
    const params = new URLSearchParams(location.search);
    return params.get("active_company_id") ||
      params.get("activeCompanyId") ||
      params.get("company_id") ||
      params.get("companyId") ||
      "";
  } catch (_) {
    return "";
  }
};

window.ReagentApp.getCompanyName = function () {
  const session = window.ReagentApp.getPortalSession?.() || {};
  return String(
    session.activeCompanyName ||
    session.active_company_name ||
    session.activeCompany?.company_name ||
    session.activeCompany?.name ||
    session.companyName ||
    session.company_name ||
    session.company?.company_name ||
    session.company?.name ||
    ""
  );
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

window.ReagentApp.refreshForCompanyChange = function () {
  try {
    window.ReagentApp.request?.loadServerRows?.();
    window.ReagentApp.request?.loadProductMaster?.(true);
    window.ReagentApp.collect?.loadServerCollectItems?.();
    window.ReagentApp.request?.renderRequest?.();
    window.ReagentApp.collect?.renderCollect?.();
    window.ReagentApp.collect?.renderPrepare?.();
    window.ReagentApp.orderReceipt?.refresh?.();
  } catch (error) {
    console.warn("회사 전환 후 시약 화면 갱신 실패:", error);
  }
};

// 발주/입고 관리 날짜 저장 테이블명
window.ReagentApp.ORDER_RECEIPT_TABLE = "reagent_collect_items";
