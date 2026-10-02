(function(global){
  'use strict';

  const state = {
    session: null,
    client: null,
    access: { read:false, write:false, admin:false },
    readyPromise: null
  };

  function qs(name){ return new URLSearchParams(location.search).get(name) || ''; }
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function normalizeRole(v){ return clean(v).toLowerCase(); }

  function parentSafe(fn, fallback){
    try { return fn(); } catch (_) { return fallback; }
  }

  function getParentSession(){
    return parentSafe(function(){
      if (window.parent && window.parent !== window) {
        if (typeof window.parent.getPortalSession === 'function') return window.parent.getPortalSession() || {};
        return window.parent.portalSession || window.parent.currentPortalSession || {};
      }
      return {};
    }, {});
  }

  function getSession(){
    const p = getParentSession();
    const companyId = clean(
      p.activeCompanyId || p.companyId || p.company_id || p.company?.id || p.company?.company_id ||
      qs('company_id')
    );
    const employee = p.employee || {};
    const user = p.user || {};
    return {
      ...p,
      companyId,
      company_id: companyId,
      companyName: clean(p.activeCompanyName || p.companyName || p.company_name || qs('company_name')),
      companyCode: clean(p.activeCompanyCode || p.companyCode || p.company_code || qs('company_code')),
      email: clean(p.email || user.email || qs('email')),
      employeeNo: clean(employee.employee_no || employee.employeeNo || p.employee_no || p.employeeNo),
      employeeName: clean(employee.name || p.name || user.name),
      role: clean(p.role || user.role),
      accountRole: clean(p.accountRole || p.account_role || user.accountRole || user.account_role),
      employee
    };
  }

  function getClient(){
    return parentSafe(function(){
      if (window.parent && window.parent !== window) {
        return window.parent.portalSupabase || window.parent.portalSessionInternal?.supabase || null;
      }
      return null;
    }, null);
  }

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function resolveContext(){
    if (state.readyPromise) return state.readyPromise;
    state.readyPromise = (async function(){
      for (let i=0;i<30;i++){
        const session = getSession();
        const client = getClient();
        if (session.companyId && client){
          state.session = session;
          state.client = client;
          break;
        }
        await sleep(120);
      }
      if (!state.session) state.session = getSession();
      if (!state.client) state.client = getClient();
      if (!state.client) throw new Error('Portal Supabase 연결을 찾을 수 없습니다. 포털에서 프로그램을 열어 주세요.');
      if (!state.session.companyId) throw new Error('회사 정보를 확인할 수 없습니다. 포털에서 회사를 다시 선택해 주세요.');
      await refreshAccess();
      return { session: state.session, client: state.client, access: state.access };
    })();
    return state.readyPromise;
  }

  async function rpcBool(name){
    try {
      const { data, error } = await state.client.rpc(name, { p_company_id: state.session.companyId });
      if (error) throw error;
      return data === true;
    } catch (e){
      console.warn('[Patent] '+name+' failed', e);
      return false;
    }
  }

  async function refreshAccess(){
    if (!state.client || !state.session?.companyId) return state.access;
    const [read, write, admin] = await Promise.all([
      rpcBool('pat_can_read'), rpcBool('pat_can_write'), rpcBool('pat_is_admin')
    ]);
    state.access = { read, write, admin };
    return state.access;
  }

  function table(name){ return state.client.from(name); }
  function companyQuery(name, columns='*'){
    return table(name).select(columns).eq('company_id', state.session.companyId);
  }
  function companyPayload(payload){ return { ...payload, company_id: state.session.companyId }; }

  function escapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function fmtDate(v){
    if (!v) return '-';
    const s = String(v).slice(0,10);
    const d = new Date(s+'T00:00:00');
    return Number.isNaN(d.getTime()) ? String(v) : s;
  }
  function fmtMoney(v,currency='KRW'){
    const n = Number(v || 0);
    try { return new Intl.NumberFormat('ko-KR',{style:'currency',currency,maximumFractionDigits:currency==='KRW'?0:2}).format(n); }
    catch(_){ return n.toLocaleString('ko-KR') + (currency==='KRW'?'원':' '+currency); }
  }
  function todayStart(){ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
  function daysUntil(v){
    if (!v) return null;
    const d = new Date(String(v).slice(0,10)+'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    return Math.ceil((d - todayStart())/86400000);
  }
  function dday(v){
    const n=daysUntil(v); if (n===null) return '-'; if(n===0) return 'D-DAY'; return n>0?'D-'+n:'D+'+Math.abs(n);
  }
  function ddayClass(v){ const n=daysUntil(v); if(n===null)return 'ok'; if(n<0||n<=7)return 'danger'; if(n<=30)return 'warn'; return 'ok'; }

  function statusClass(v){
    const s=clean(v).toLowerCase();
    if (/등록|완료|paid|active|registered/.test(s)) return 'green';
    if (/출원|filed|application|공개/.test(s)) return 'blue';
    if (/심사|examin|review|결재|approv/.test(s)) return 'orange';
    if (/소멸|거절|포기|overdue|cancel|expired|extinguish/.test(s)) return 'red';
    if (/예정|planned|invoice|request/.test(s)) return 'gold';
    return 'gray';
  }
  function badge(v,label){ return '<span class="pat-badge '+statusClass(v)+'">'+escapeHtml(label == null ? (v||'-') : label)+'</span>'; }

  function classifyPatentStatus(v){
    const s=clean(v).toLowerCase();
    if (/소멸|포기|거절|취하|expired|extinguish|abandon|rejected/.test(s)) return 'extinct';
    if (/등록|registered|active|grant/.test(s)) return 'registered';
    if (/심사|examin|office action|review/.test(s)) return 'examining';
    if (/출원|공개|filed|application|published/.test(s)) return 'filed';
    return 'other';
  }

  function patentStatusLabel(v){
    const c=classifyPatentStatus(v);
    return ({registered:'등록',examining:'심사중',filed:'출원중',extinct:'소멸',other:clean(v)||'기타'})[c];
  }

  function paymentTypeLabel(v){
    return ({ANNUAL_FEE:'연차료',REGISTRATION_FEE:'등록료',APPLICATION_FEE:'출원비',EXAMINATION_FEE:'심사청구비',AGENCY_INVOICE:'특허사무소 청구',OTHER:'기타'})[v] || v || '-';
  }
  function paymentStatusLabel(v){
    return ({PLANNED:'납부예정',INVOICE_RECEIVED:'청구서 수령',PAYMENT_REQUESTED:'지급요청',APPROVING:'결재중',PAID:'지급완료',OVERDUE:'기한초과',CANCELLED:'취소'})[v] || v || '-';
  }
  function deadlineTypeLabel(v){
    return ({ANNUAL_FEE:'연차료',REGISTRATION_FEE:'등록료',EXAMINATION_REQUEST:'심사청구',OFFICE_ACTION_RESPONSE:'의견서 제출',AMENDMENT:'보정서 제출',FOREIGN_FILING:'해외출원',PRIORITY:'우선권',EXPIRATION:'존속기간 만료',OTHER:'기타'})[v] || v || '-';
  }
  function paymentMethodLabel(v){ return v==='DIRECT'?'직접납부':v==='AGENCY'?'특허사무소 대행':'-'; }

  function makeToastWrap(){
    let wrap=document.querySelector('.pat-toast-wrap');
    if(!wrap){ wrap=document.createElement('div'); wrap.className='pat-toast-wrap'; document.body.appendChild(wrap); }
    return wrap;
  }
  function toast(message,type='success',timeout=2600){
    const el=document.createElement('div'); el.className='pat-toast '+type; el.textContent=message; makeToastWrap().appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(4px)'; setTimeout(()=>el.remove(),180); },timeout);
  }
  function setLoading(target,message='불러오는 중입니다...'){ if(target) target.innerHTML='<div class="pat-loading">'+escapeHtml(message)+'</div>'; }
  function setError(target,error){ if(target) target.innerHTML='<div class="pat-error">'+escapeHtml(error?.message || String(error || '오류가 발생했습니다.'))+'</div>'; }

  function modalOpen(id){ document.getElementById(id)?.classList.add('show'); }
  function modalClose(id){ document.getElementById(id)?.classList.remove('show'); }
  function bindModalClose(){
    document.addEventListener('click',function(e){
      const close=e.target.closest('[data-modal-close]'); if(close) modalClose(close.getAttribute('data-modal-close'));
      if(e.target.classList.contains('pat-modal-backdrop')) e.target.classList.remove('show');
    });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.pat-modal-backdrop.show').forEach(x=>x.classList.remove('show')); });
  }

  function postParent(payload){ parentSafe(()=>window.parent.postMessage(payload,'*'),null); }
  function navigate(view,params={}){ postParent({type:'patent-navigate',view,params,source:'patent-app'}); }
  function notifyAccessUpdated(){ postParent({type:'patent-access-updated',source:'patent-app'}); }

  async function invokeKipris(body){
    if (!state.client?.functions?.invoke) throw new Error('Edge Function 호출 기능을 사용할 수 없습니다.');
    const { data, error } = await state.client.functions.invoke('patent-kipris',{ body });
    if (error) throw new Error(error.message || 'KIPRIS 연동 함수 호출에 실패했습니다.');
    if (data?.error) throw new Error(data.error);
    return data;
  }

  function annualRangeLabel(from,to){
    if(!from && !to) return '-';
    const a=Number(from||to), b=Number(to||from);
    return a===b ? a+'년차' : a+'~'+b+'년차 ('+(b-a+1)+'개년)';
  }

  function safeFileName(name){ return String(name||'file').replace(/[\\/:*?"<>|#%]/g,'_').replace(/\s+/g,'_'); }

  async function uploadPatentFile({patentId,paymentId=null,deadlineId=null,file,category='OTHER',description=''}){
    if(!file) throw new Error('파일을 선택해 주세요.');
    const bucket='patent-files';
    const path=[state.session.companyId,patentId,Date.now()+'_'+safeFileName(file.name)].join('/');
    const { error:upErr } = await state.client.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(upErr) throw new Error('파일 업로드 실패: '+upErr.message+' (patent-files Storage bucket 설정을 확인해 주세요.)');
    const payload=companyPayload({patent_id:patentId,payment_id:paymentId,deadline_id:deadlineId,file_category:category,original_file_name:file.name,storage_bucket:bucket,storage_path:path,mime_type:file.type||null,file_size:file.size||null,description,uploaded_by_employee_no:state.session.employeeNo||null});
    const {data,error}=await state.client.from('pat_files').insert(payload).select().single();
    if(error){ await state.client.storage.from(bucket).remove([path]); throw error; }
    return data;
  }

  async function downloadPatentFile(row){
    const bucket=row.storage_bucket||'patent-files';
    const {data,error}=await state.client.storage.from(bucket).createSignedUrl(row.storage_path,60);
    if(error) throw error;
    window.open(data.signedUrl,'_blank','noopener');
  }

  async function deletePatentFile(row){
    const {error:delErr}=await state.client.from('pat_files').delete().eq('id',row.id).eq('company_id',state.session.companyId);
    if(delErr) throw delErr;
    if(row.storage_path){ try{ await state.client.storage.from(row.storage_bucket||'patent-files').remove([row.storage_path]); }catch(_){} }
  }

  function setText(id,value){ const el=document.getElementById(id); if(el) el.textContent=value; }
  function val(id){ return document.getElementById(id)?.value ?? ''; }
  function boolVal(id){ return !!document.getElementById(id)?.checked; }
  function setVal(id,value){ const el=document.getElementById(id); if(el) el.value=value ?? ''; }

  bindModalClose();

  global.PatentCommon={
    state, resolveContext, refreshAccess, getSession, getClient, table, companyQuery, companyPayload,
    escapeHtml, fmtDate, fmtMoney, daysUntil, dday, ddayClass, statusClass, badge,
    classifyPatentStatus, patentStatusLabel, paymentTypeLabel, paymentStatusLabel, deadlineTypeLabel, paymentMethodLabel,
    toast, setLoading, setError, modalOpen, modalClose, postParent, navigate, notifyAccessUpdated,
    invokeKipris, annualRangeLabel, uploadPatentFile, downloadPatentFile, deletePatentFile,
    setText, val, boolVal, setVal, clean
  };
})(window);
