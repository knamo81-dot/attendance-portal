const SUPABASE_URL="https://mbqpsovlwvedwrtbbauj.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

const WASTEWATER_SCREEN={
  key:"collection",
  title:"수거등록",
  description:"기존 수거등록 중 폐수 수거 기능만 분리하여 관리합니다.",
  phase:"기존 기능 정리·이관",
  device:"pc",
  tables:["wastewater_pickups", "wastewater_vendors"]
};

(function initWastewaterBase(){
  function portalSession(){
    try{
      if(window.parent && window.parent!==window && typeof window.parent.getPortalSession==='function'){
        return window.parent.getPortalSession()||{};
      }
    }catch(e){}
    try{
      if(window.parent && window.parent!==window && window.parent.portalSession){
        return window.parent.portalSession||{};
      }
    }catch(e){}
    return window.portalSession||window.currentPortalSession||{};
  }

  function companyId(){
    const s=portalSession()||{};
    const c=s.activeCompany||s.active_company||s.selectedCompany||s.selected_company||s.company||{};
    const value=
      s.activeCompanyId||
      s.active_company_id||
      s.selectedCompanyId||
      s.selected_company_id||
      c.id||
      c.company_id||
      s.companyId||
      s.company_id||
      s.profile?.company_id||
      window.currentCompanyId||
      '';
    if(value)return String(value).trim();
    try{
      const p=new URLSearchParams(location.search);
      return String(p.get('company_id')||p.get('companyId')||'').trim();
    }catch(e){
      return '';
    }
  }

  function userEmail(){
    const s=portalSession()||{};
    return String(s.email||s.user?.email||s.profile?.email||'').trim();
  }

  function normalizeRole(value){
    const role=String(value||'').trim().toLowerCase();
    if(['admin','administrator','관리자'].includes(role))return 'admin';
    if(['operator','manager','운영자','담당자'].includes(role))return 'operator';
    if(['approver','reviewer','결재자','검토자','승인자'].includes(role))return 'approver';
    if(['viewer','readonly','read_only','조회','조회자'].includes(role))return 'viewer';
    if(['blocked','block','disabled','차단'].includes(role))return 'blocked';
    return role||'user';
  }

  function appRole(){
    const s=portalSession()||{};
    const row=s.appRoles?.wastewater||s.app_roles?.wastewater||s.wastewaterRole||s.wastewater_role||{};
    if(typeof row==='string')return normalizeRole(row);
    return normalizeRole(row.role||row.role_key||row.roleKey||row.permission||row.permission_key||'user');
  }

  function canManage(){
    const role=appRole();
    return role==='admin'||role==='operator';
  }

  function canApprove(){
    const role=appRole();
    if(role==='admin'||role==='approver')return true;
    const s=portalSession()||{};
    const row=s.appRoles?.wastewater||s.app_roles?.wastewater||{};
    const approval=typeof row==='object'
      ? normalizeRole(row.approvalRole||row.approval_role||row.reviewerRole||row.reviewer_role||'')
      : '';
    return approval==='approver';
  }

  function rawClient(){
    const s=portalSession()||{};
    if(s.supabase)return s.supabase;
    try{
      if(window.parent && window.parent!==window && window.parent.portalSupabase){
        return window.parent.portalSupabase;
      }
    }catch(e){}
    if(window.portalSupabase)return window.portalSupabase;
    if(window.supabase && typeof window.supabase.createClient==='function'){
      window.portalSupabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
      return window.portalSupabase;
    }
    return null;
  }

  window.wastewaterBase={
    portalSession,
    companyId,
    userEmail,
    appRole,
    canManage,
    canApprove,
    sb:rawClient()
  };
})();

const WW=window.wastewaterBase;
const $=(selector)=>document.querySelector(selector);
const esc=(value)=>String(value??'').replace(/[&<>'"]/g,(m)=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[m]));

function renderStructureReady(){
  const role=WW.appRole();
  const tables=WASTEWATER_SCREEN.tables.map(t=>`<code>${esc(t)}</code>`).join('');
  $('#app').innerHTML=`
    <section class="shell-card">
      <div class="screen-kicker">Wastewater Management · ${WASTEWATER_SCREEN.device==='mobile'?'Mobile':'PC'}</div>
      <div class="screen-head">
        <div>
          <h1>${esc(WASTEWATER_SCREEN.title)}</h1>
          <p>${esc(WASTEWATER_SCREEN.description)}</p>
        </div>
        <span class="stage-badge">${esc(WASTEWATER_SCREEN.phase)}</span>
      </div>

      <div class="ready-panel">
        <div class="ready-icon" aria-hidden="true">✓</div>
        <div>
          <strong>기능별 독립 폴더 구조 생성 완료</strong>
          <p>현재 단계에서는 기존 운영 화면을 끊지 않도록 새 경로만 준비했습니다. 다음 단계에서 기존 기능을 이 화면으로 순차 이관합니다.</p>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-box">
          <span>화면 경로</span>
          <strong>${esc(location.pathname)}</strong>
        </div>
        <div class="meta-box">
          <span>회사 연결</span>
          <strong>${WW.companyId()? 'Portal Session 연결됨':'Portal Session 확인 필요'}</strong>
        </div>
        <div class="meta-box">
          <span>폐수 권한</span>
          <strong>${esc(role)}</strong>
        </div>
        <div class="meta-box">
          <span>관리 기능</span>
          <strong>${WW.canManage()?'사용 가능':'조회 기준'}</strong>
        </div>
      </div>

      <div class="table-plan">
        <div class="plan-title">연결 예정 DB</div>
        <div class="code-list">${tables}</div>
      </div>
    </section>`;
}

renderStructureReady();
