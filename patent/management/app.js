(function(){
  'use strict';
  const P=window.PatentCommon;
  let ctx=null, patents=[], payments=[], deadlines=[], agencies=[], employees=[], settings=null;
  let section='payments', editingPayment=null, editingDeadline=null, editingAgency=null, calendarDate=new Date();
  const query=new URLSearchParams(location.search);
  const $=id=>document.getElementById(id);

  async function init(){
    ctx=await P.resolveContext();
    if(!ctx.access.read){document.querySelector('.pat-app').innerHTML='<div class="pat-error">특허관리 접근 권한이 없습니다.</div>';return;}
    section=query.get('section')||'payments';
    bind(); await loadAll(); showSection(section);
  }
  function bind(){
    document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>showSection(b.dataset.section)));
    $('refreshBtn').addEventListener('click',()=>loadAll().catch(e=>P.toast(e.message,'error')));
    $('savePaymentBtn').addEventListener('click',savePayment); $('saveDeadlineBtn').addEventListener('click',saveDeadline); $('saveAgencyBtn').addEventListener('click',saveAgency);
    document.querySelectorAll('.money-field').forEach(el=>el.addEventListener('input',autoPaymentTotal));
    $('pay_payment_method').addEventListener('change',toggleAgencyField);
  }

  async function loadAll(){
    const jobs=[
      P.companyQuery('pat_master','id,invention_title,application_no,registration_no,internal_no,legal_status').eq('is_active',true).order('invention_title'),
      P.companyQuery('pat_payments','*').order('official_due_date',{ascending:true}),
      P.companyQuery('pat_deadlines','*').order('due_date',{ascending:true}),
      P.companyQuery('pat_agencies','*').eq('is_active',true).order('agency_name'),
      P.state.client.from('employees').select('employee_no,name,email').eq('company_id',ctx.session.companyId).order('name')
    ];
    jobs.push(P.companyQuery('pat_settings','*').maybeSingle());

    const [p,pay,dead,ag,emp,set]=await Promise.all(jobs);
    [p,pay,dead,ag].forEach(r=>{if(r.error)throw r.error;});

    patents=p.data||[];
    payments=pay.data||[];
    deadlines=dead.data||[];
    agencies=ag.data||[];
    employees=emp.error?[]:(emp.data||[]);
    settings=set.error?null:set.data;

    /*
     * 기존 납부관리 데이터도 기한관리로 자동 보정합니다.
     * - related_payment_id 기준으로 중복 생성 방지
     * - 납부 수정 시 연결 기한도 동기화
     * - 지급완료/취소 상태도 기한 상태에 반영
     */
    if(ctx.access.write){
      const changed=await syncAllPaymentDeadlines();
      if(changed){
        const refreshed=await P.companyQuery('pat_deadlines','*').order('due_date',{ascending:true});
        if(refreshed.error)throw refreshed.error;
        deadlines=refreshed.data||[];
      }
    }

    fillSelects();
    renderCurrent();
  }
  function patentName(id){const p=patents.find(x=>x.id===id);return p?.invention_title||'-';}
  function employeeName(no){return employees.find(x=>x.employee_no===no)?.name||no||'-';}
  function fillSelects(){
    const opts='<option value="">선택</option>'+patents.map(p=>`<option value="${p.id}">${P.escapeHtml((p.internal_no?p.internal_no+' · ':'')+p.invention_title)}</option>`).join(''); $('pay_patent_id').innerHTML=opts;$('dead_patent_id').innerHTML=opts;
    $('pay_agency_id').innerHTML='<option value="">선택</option>'+agencies.map(a=>`<option value="${a.id}">${P.escapeHtml(a.agency_name)}</option>`).join('');
  }
  function showSection(s){section=['payments','deadlines','settings'].includes(s)?s:'payments';document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===section));['Payments','Deadlines','Settings'].forEach(n=>$('section'+n).classList.toggle('hidden',n.toLowerCase()!==section));history.replaceState(null,'','?section='+section);renderCurrent();}
  function renderCurrent(){if(section==='payments')renderPayments();if(section==='deadlines')renderDeadlines();if(section==='settings')renderSettings();}

  function paymentDue(x){return x.official_due_date||x.invoice_due_date||x.planned_payment_date;}

  function paymentDeadlineType(paymentType){
    const map={
      ANNUAL_FEE:'ANNUAL_FEE',
      REGISTRATION_FEE:'REGISTRATION_FEE',
      EXAMINATION_FEE:'EXAMINATION_REQUEST',
      APPLICATION_FEE:'OTHER',
      AGENCY_INVOICE:'OTHER',
      OTHER:'OTHER'
    };
    return map[paymentType]||'OTHER';
  }

  function paymentDeadlineTitle(payment){
    if(payment.payment_title)return payment.payment_title;

    if(payment.payment_type==='ANNUAL_FEE'){
      const from=Number(payment.annual_year_from||0)||null;
      const to=Number(payment.annual_year_to||0)||from;

      if(from&&to){
        return from===to
          ? `${from}년차료`
          : `${from}~${to}년차 연차료`;
      }
      return '연차료 납부';
    }

    if(payment.payment_type==='REGISTRATION_FEE')return '등록료 납부';
    if(payment.payment_type==='EXAMINATION_FEE')return '심사청구료 납부';
    if(payment.payment_type==='APPLICATION_FEE')return '출원비 납부';
    if(payment.payment_type==='AGENCY_INVOICE')return '특허사무소 지급';
    return P.paymentTypeLabel(payment.payment_type)||'납부 기한';
  }

  function paymentDeadlineStatus(payment){
    if(payment.status==='PAID')return 'COMPLETED';
    if(payment.status==='CANCELLED')return 'CANCELLED';
    return 'OPEN';
  }

  function paymentDeadlineCompletedDate(payment){
    if(payment.status!=='PAID')return null;
    return payment.official_paid_date||payment.paid_date||null;
  }

  function sameValue(a,b){
    const av=Array.isArray(a)?JSON.stringify(a):String(a??'');
    const bv=Array.isArray(b)?JSON.stringify(b):String(b??'');
    return av===bv;
  }

  async function syncPaymentDeadline(payment){
    const existing=deadlines.find(x=>x.related_payment_id===payment.id)||null;
    const dueDate=paymentDue(payment);

    /*
     * 납부기한이 지워진 경우에는 연결 기한을 삭제하지 않고 취소 처리합니다.
     * 사용자가 나중에 다시 기한을 넣으면 같은 related_payment_id로 재활성화됩니다.
     */
    if(!dueDate){
      if(existing&&existing.status!=='CANCELLED'){
        const payload={
          status:'CANCELLED',
          completed_date:null,
          updated_by_employee_no:ctx.session.employeeNo||null
        };
        const {data,error}=await P.state.client
          .from('pat_deadlines')
          .update(payload)
          .eq('id',existing.id)
          .eq('company_id',ctx.session.companyId)
          .select()
          .single();

        if(error)throw error;
        Object.assign(existing,data||payload);
        return true;
      }
      return false;
    }

    const alertDays=existing?.alert_days_before?.length
      ? existing.alert_days_before
      : (settings?.alert_days_before||[90,30,7]);

    const payload=P.companyPayload({
      patent_id:payment.patent_id,
      deadline_type:paymentDeadlineType(payment.payment_type),
      title:paymentDeadlineTitle(payment),
      base_date:payment.registration_date||null,
      due_date:dueDate,
      additional_due_date:payment.additional_due_date||null,
      related_payment_id:payment.id,
      source:'SYSTEM',
      status:paymentDeadlineStatus(payment),
      alert_days_before:alertDays,
      completed_date:paymentDeadlineCompletedDate(payment),
      note:payment.note
        ? `납부관리 자동연동\\n${payment.note}`
        : '납부관리 자동연동',
      updated_by_employee_no:ctx.session.employeeNo||null
    });

    if(existing){
      const fields=[
        'patent_id',
        'deadline_type',
        'title',
        'due_date',
        'additional_due_date',
        'status',
        'completed_date',
        'note'
      ];

      const needsUpdate=fields.some(key=>!sameValue(existing[key],payload[key]));
      if(!needsUpdate)return false;

      const {data,error}=await P.state.client
        .from('pat_deadlines')
        .update(payload)
        .eq('id',existing.id)
        .eq('company_id',ctx.session.companyId)
        .select()
        .single();

      if(error)throw error;
      Object.assign(existing,data||payload);
      return true;
    }

    payload.created_by_employee_no=ctx.session.employeeNo||null;

    const {data,error}=await P.state.client
      .from('pat_deadlines')
      .insert(payload)
      .select()
      .single();

    if(error)throw error;
    if(data)deadlines.push(data);
    return true;
  }

  async function syncAllPaymentDeadlines(){
    let changed=false;

    for(const payment of payments){
      const synced=await syncPaymentDeadline(payment);
      if(synced)changed=true;
    }

    return changed;
  }
  function renderPayments(){
    const open=payments.filter(x=>!['PAID','CANCELLED'].includes(x.status)), overdue=open.filter(x=>P.daysUntil(paymentDue(x))<0), due30=open.filter(x=>{const d=P.daysUntil(paymentDue(x));return d!==null&&d>=0&&d<=30;}), paid=payments.filter(x=>x.status==='PAID');
    const total=paid.reduce((a,b)=>a+Number(b.paid_amount||b.billed_amount||0),0);
    $('sectionPayments').innerHTML=`<div class="management-summary"><div class="pat-kpi gold"><div class="pat-kpi-label">전체 납부건</div><div class="pat-kpi-value">${payments.length}</div><div class="pat-kpi-note">누적</div></div><div class="pat-kpi orange"><div class="pat-kpi-label">30일 이내</div><div class="pat-kpi-value">${due30.length}</div><div class="pat-kpi-note">납부임박</div></div><div class="pat-kpi red"><div class="pat-kpi-label">기한초과</div><div class="pat-kpi-value">${overdue.length}</div><div class="pat-kpi-note">즉시 확인</div></div><div class="pat-kpi green"><div class="pat-kpi-label">지급완료</div><div class="pat-kpi-value">${paid.length}</div><div class="pat-kpi-note">누적</div></div><div class="pat-kpi blue"><div class="pat-kpi-label">지급완료 금액</div><div class="pat-kpi-value money-kpi">${P.fmtMoney(total)}</div><div class="pat-kpi-note">누적 실지급</div></div></div>
    <div class="pat-filterbar"><input id="paymentSearch" class="pat-input" placeholder="특허명, 납부구분 검색"><select id="paymentStatus" class="pat-select"><option value="">전체 상태</option>${['PLANNED','INVOICE_RECEIVED','PAYMENT_REQUESTED','APPROVING','PAID','OVERDUE','CANCELLED'].map(x=>`<option value="${x}">${P.paymentStatusLabel(x)}</option>`).join('')}</select><select id="paymentMethod" class="pat-select"><option value="">전체 방식</option><option value="DIRECT">직접납부</option><option value="AGENCY">특허사무소 대행</option></select>${ctx.access.write?'<button id="newPaymentBtn" class="pat-btn primary">＋ 납부 등록</button>':''}</div><div id="paymentTable"></div>`;
    $('newPaymentBtn')?.addEventListener('click',()=>openPaymentModal()); ['paymentSearch','paymentStatus','paymentMethod'].forEach(id=>$(id).addEventListener(id==='paymentSearch'?'input':'change',renderPaymentTable)); renderPaymentTable();
  }
  function renderPaymentTable(){const search=P.clean($('paymentSearch')?.value).toLowerCase(),st=$('paymentStatus')?.value||'',method=$('paymentMethod')?.value||'';const rows=payments.filter(x=>(!st||x.status===st)&&(!method||x.payment_method===method)&&(!search||[patentName(x.patent_id),P.paymentTypeLabel(x.payment_type),x.payment_title].join(' ').toLowerCase().includes(search)));
    $('paymentTable').innerHTML=`<div class="pat-card pat-card-pad"><div class="pat-table-wrap"><table class="pat-table management-table"><thead><tr><th>특허</th><th>납부구분</th><th>대상연차</th><th>방식</th><th>납부기한</th><th>청구금액</th><th>지급금액</th><th>상태</th><th>지급일</th><th>관리</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${P.escapeHtml(patentName(x.patent_id))}</td><td>${P.escapeHtml(x.payment_title||P.paymentTypeLabel(x.payment_type))}</td><td>${P.annualRangeLabel(x.annual_year_from,x.annual_year_to)}</td><td>${P.paymentMethodLabel(x.payment_method)}${x.agency_id?'<div class="pat-card-desc">'+P.escapeHtml(agencies.find(a=>a.id===x.agency_id)?.agency_name||'')+'</div>':''}</td><td>${P.fmtDate(paymentDue(x))}<div class="pat-dday ${P.ddayClass(paymentDue(x))}">${P.dday(paymentDue(x))}</div></td><td class="num">${P.fmtMoney(x.billed_amount,x.currency)}</td><td class="num">${P.fmtMoney(x.paid_amount,x.currency)}</td><td>${P.badge(x.status,P.paymentStatusLabel(x.status))}</td><td>${P.fmtDate(x.paid_date)}</td><td>${ctx.access.write?`<button class="pat-btn" data-pay-edit="${x.id}">수정</button>`:'-'}</td></tr>`).join(''):'<tr><td colspan="10" class="pat-empty">납부내역이 없습니다.</td></tr>'}</tbody></table></div></div>`;
    document.querySelectorAll('[data-pay-edit]').forEach(b=>b.addEventListener('click',()=>openPaymentModal(payments.find(x=>x.id===b.dataset.payEdit))));
  }
  function clearPay(){['patent_id','payment_type','annual_year_from','annual_year_to','payment_title','payment_method','agency_id','status','official_due_date','additional_due_date','invoice_received_date','invoice_due_date','payment_request_date','planned_payment_date','paid_date','official_paid_date','official_fee','agency_fee','vat_amount','other_fee','billed_amount','paid_amount','note'].forEach(k=>P.setVal('pay_'+k,''));P.setVal('pay_payment_type','ANNUAL_FEE');P.setVal('pay_payment_method','DIRECT');P.setVal('pay_status','PLANNED');P.setVal('pay_currency','KRW');}
  function openPaymentModal(x=null){if(!ctx.access.write)return;editingPayment=x?.id||null;clearPay();$('paymentModalTitle').textContent=x?'납부 수정':'납부 등록';if(x)Object.keys(x).forEach(k=>{if($('pay_'+k))P.setVal('pay_'+k,x[k]??'');});const pid=query.get('patent_id');if(!x&&pid&&patents.some(p=>p.id===pid))P.setVal('pay_patent_id',pid);toggleAgencyField();P.modalOpen('paymentModal');}
  function toggleAgencyField(){const direct=$('pay_payment_method').value!=='AGENCY';$('pay_agency_id').disabled=direct;if(direct)$('pay_agency_id').value='';}
  function autoPaymentTotal(){const sum=['official_fee','agency_fee','vat_amount','other_fee'].reduce((a,k)=>a+Number(P.val('pay_'+k)||0),0);if(!P.val('pay_billed_amount'))P.setVal('pay_billed_amount',sum||'');}
  async function savePayment(){
    const patentId=P.val('pay_patent_id');

    if(!patentId){
      P.toast('특허를 선택해 주세요.','warn');
      return;
    }

    const from=Number(P.val('pay_annual_year_from')||0)||null;
    const to=Number(P.val('pay_annual_year_to')||0)||from;

    if(from&&to&&to<from){
      P.toast('종료 연차가 시작 연차보다 작을 수 없습니다.','warn');
      return;
    }

    const payload=P.companyPayload({
      patent_id:patentId,
      payment_type:P.val('pay_payment_type'),
      payment_title:P.val('pay_payment_title')||null,
      annual_year_from:from,
      annual_year_to:to,
      payment_method:P.val('pay_payment_method')||null,
      agency_id:P.val('pay_agency_id')||null,
      official_due_date:P.val('pay_official_due_date')||null,
      additional_due_date:P.val('pay_additional_due_date')||null,
      invoice_received_date:P.val('pay_invoice_received_date')||null,
      invoice_due_date:P.val('pay_invoice_due_date')||null,
      payment_request_date:P.val('pay_payment_request_date')||null,
      planned_payment_date:P.val('pay_planned_payment_date')||null,
      paid_date:P.val('pay_paid_date')||null,
      official_paid_date:P.val('pay_official_paid_date')||null,
      currency:(P.val('pay_currency')||'KRW').toUpperCase(),
      official_fee:Number(P.val('pay_official_fee')||0),
      agency_fee:Number(P.val('pay_agency_fee')||0),
      vat_amount:Number(P.val('pay_vat_amount')||0),
      other_fee:Number(P.val('pay_other_fee')||0),
      billed_amount:Number(P.val('pay_billed_amount')||0),
      paid_amount:Number(P.val('pay_paid_amount')||0),
      status:P.val('pay_status')||'PLANNED',
      note:P.val('pay_note')||null,
      updated_by_employee_no:ctx.session.employeeNo||null
    });

    try{
      let result;

      if(editingPayment){
        result=await P.state.client
          .from('pat_payments')
          .update(payload)
          .eq('id',editingPayment)
          .eq('company_id',ctx.session.companyId)
          .select()
          .single();
      }else{
        payload.created_by_employee_no=ctx.session.employeeNo||null;
        result=await P.state.client
          .from('pat_payments')
          .insert(payload)
          .select()
          .single();
      }

      if(result.error)throw result.error;

      const savedPayment=result.data;

      /*
       * 저장 즉시 기한관리에도 반영합니다.
       * 이후 loadAll()에서도 기존 납부건을 한 번 더 점검하므로
       * 과거 데이터까지 자동으로 보정됩니다.
       */
      if(savedPayment){
        const oldPaymentIndex=payments.findIndex(x=>x.id===savedPayment.id);

        if(oldPaymentIndex>=0)payments[oldPaymentIndex]=savedPayment;
        else payments.push(savedPayment);

        await syncPaymentDeadline(savedPayment);
      }

      P.modalClose('paymentModal');
      P.toast('납부정보와 기한정보를 저장했습니다.');
      editingPayment=null;

      await loadAll();
      showSection('payments');
    }catch(e){
      P.toast(e.message,'error');
    }
  }

  function renderDeadlines(){
    const open=deadlines.filter(x=>x.status==='OPEN'), due30=open.filter(x=>{const d=P.daysUntil(x.due_date);return d!==null&&d>=0&&d<=30;}), overdue=open.filter(x=>P.daysUntil(x.due_date)<0);
    $('sectionDeadlines').innerHTML=`<div class="management-summary"><div class="pat-kpi gold"><div class="pat-kpi-label">진행중 기한</div><div class="pat-kpi-value">${open.length}</div><div class="pat-kpi-note">OPEN</div></div><div class="pat-kpi orange"><div class="pat-kpi-label">30일 이내</div><div class="pat-kpi-value">${due30.length}</div><div class="pat-kpi-note">기한임박</div></div><div class="pat-kpi red"><div class="pat-kpi-label">기한초과</div><div class="pat-kpi-value">${overdue.length}</div><div class="pat-kpi-note">즉시 확인</div></div></div><div class="pat-filterbar">${ctx.access.write?'<button id="newDeadlineBtn" class="pat-btn primary">＋ 기한 등록</button><button id="syncPaymentDeadlinesBtn" class="pat-btn secondary">↻ 납부기한 동기화</button>':''}<select id="deadlineTypeFilter" class="pat-select"><option value="">전체 구분</option>${['ANNUAL_FEE','REGISTRATION_FEE','EXAMINATION_REQUEST','OFFICE_ACTION_RESPONSE','AMENDMENT','FOREIGN_FILING','PRIORITY','EXPIRATION','OTHER'].map(x=>`<option value="${x}">${P.deadlineTypeLabel(x)}</option>`).join('')}</select></div><div class="calendar-layout"><article class="pat-card pat-card-pad"><div class="calendar-head"><div class="pat-card-title">기한 캘린더</div><div class="calendar-nav"><button id="prevMonth" class="pat-btn icon">‹</button><div id="calendarMonth" class="calendar-month"></div><button id="nextMonth" class="pat-btn icon">›</button><button id="todayMonth" class="pat-btn">오늘</button></div></div><div class="pat-calendar-wrap"><div id="calendar" class="pat-calendar"></div></div></article><article class="pat-card pat-card-pad"><div class="pat-card-head"><div class="pat-card-title">다가오는 주요 기한</div></div><div id="upcomingDeadlines" class="upcoming-list"></div></article></div><div id="deadlineTable" style="margin-top:10px"></div>`;
    $('newDeadlineBtn')?.addEventListener('click',()=>openDeadlineModal());
    $('syncPaymentDeadlinesBtn')?.addEventListener('click',async()=>{
      const btn=$('syncPaymentDeadlinesBtn');
      btn.disabled=true;
      try{
        const changed=await syncAllPaymentDeadlines();
        const refreshed=await P.companyQuery('pat_deadlines','*').order('due_date',{ascending:true});
        if(refreshed.error)throw refreshed.error;
        deadlines=refreshed.data||[];
        renderDeadlines();
        P.toast(changed?'납부관리 기한을 동기화했습니다.':'이미 최신 상태입니다.');
      }catch(e){
        P.toast(e.message,'error');
      }finally{
        if($('syncPaymentDeadlinesBtn'))$('syncPaymentDeadlinesBtn').disabled=false;
      }
    });
    $('deadlineTypeFilter').addEventListener('change',renderDeadlineTable);$('prevMonth').addEventListener('click',()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1);renderCalendar();});$('nextMonth').addEventListener('click',()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1);renderCalendar();});$('todayMonth').addEventListener('click',()=>{calendarDate=new Date();renderCalendar();});renderCalendar();renderDeadlineTable();renderUpcoming();
  }
  function renderCalendar(){const y=calendarDate.getFullYear(),m=calendarDate.getMonth();$('calendarMonth').textContent=`${y}년 ${m+1}월`;const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());const heads=['일','월','화','수','목','금','토'].map(x=>`<div class="pat-cal-head">${x}</div>`).join('');let cells='';for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const ev=deadlines.filter(x=>x.due_date===ds&&x.status==='OPEN').slice(0,3);cells+=`<div class="pat-cal-cell ${d.getMonth()!==m?'muted':''}"><div class="pat-cal-date">${d.getDate()}</div>${ev.map(x=>`<span class="pat-cal-event ${P.daysUntil(x.due_date)<=7?'red':P.deadlineTypeLabel(x.deadline_type)==='연차료'?'gold':'blue'}" title="${P.escapeHtml(x.title)}">${P.escapeHtml(x.title)}</span>`).join('')}</div>`;}$('calendar').innerHTML=heads+cells;}
  function renderUpcoming(){const rows=deadlines.filter(x=>x.status==='OPEN').sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date))).slice(0,8);$('upcomingDeadlines').innerHTML=rows.length?rows.map(x=>`<div class="upcoming-item"><div class="upcoming-top"><div class="upcoming-title">${P.escapeHtml(x.title)}</div><div class="pat-dday ${P.ddayClass(x.due_date)}">${P.dday(x.due_date)}</div></div><div class="upcoming-sub">${P.escapeHtml(patentName(x.patent_id))} · ${P.fmtDate(x.due_date)}</div></div>`).join(''):'<div class="pat-empty">다가오는 기한이 없습니다.</div>';}
  function renderDeadlineTable(){const type=$('deadlineTypeFilter')?.value||'';const rows=deadlines.filter(x=>!type||x.deadline_type===type);$('deadlineTable').innerHTML=`<div class="pat-card pat-card-pad"><div class="pat-table-wrap"><table class="pat-table"><thead><tr><th>특허</th><th>구분</th><th>기한명</th><th>기한일</th><th>D-Day</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${P.escapeHtml(patentName(x.patent_id))}</td><td>${P.deadlineTypeLabel(x.deadline_type)}</td><td>${P.escapeHtml(x.title)}</td><td>${P.fmtDate(x.due_date)}</td><td><span class="pat-dday ${P.ddayClass(x.due_date)}">${P.dday(x.due_date)}</span></td><td>${P.badge(x.status,x.status==='OPEN'?'진행중':x.status==='COMPLETED'?'완료':x.status)}</td><td>${ctx.access.write?`<button class="pat-btn" data-dead-edit="${x.id}">수정</button> ${x.status==='OPEN'?`<button class="pat-btn success" data-dead-complete="${x.id}">완료</button>`:''}`:'-'}</td></tr>`).join(''):'<tr><td colspan="7" class="pat-empty">기한정보가 없습니다.</td></tr>'}</tbody></table></div></div>`;document.querySelectorAll('[data-dead-edit]').forEach(b=>b.addEventListener('click',()=>openDeadlineModal(deadlines.find(x=>x.id===b.dataset.deadEdit))));document.querySelectorAll('[data-dead-complete]').forEach(b=>b.addEventListener('click',()=>completeDeadline(b.dataset.deadComplete)));}
  function clearDead(){['patent_id','deadline_type','title','base_date','due_date','additional_due_date','status','completed_date','note'].forEach(k=>P.setVal('dead_'+k,''));P.setVal('dead_deadline_type','ANNUAL_FEE');P.setVal('dead_status','OPEN');P.setVal('dead_alert_days_before',(settings?.alert_days_before||[90,30,7]).join(','));}
  function openDeadlineModal(x=null){if(!ctx.access.write)return;editingDeadline=x?.id||null;clearDead();$('deadlineModalTitle').textContent=x?'기한 수정':'기한 등록';if(x){Object.keys(x).forEach(k=>{if($('dead_'+k))P.setVal('dead_'+k,Array.isArray(x[k])?x[k].join(','):x[k]??'');});}P.modalOpen('deadlineModal');}
  async function saveDeadline(){const pid=P.val('dead_patent_id'),title=P.val('dead_title'),due=P.val('dead_due_date');if(!pid||!title||!due){P.toast('특허, 기한명, 기한일을 입력해 주세요.','warn');return;}const alerts=P.val('dead_alert_days_before').split(',').map(x=>Number(x.trim())).filter(x=>Number.isFinite(x)&&x>=0);const payload=P.companyPayload({patent_id:pid,deadline_type:P.val('dead_deadline_type'),title,base_date:P.val('dead_base_date')||null,due_date:due,additional_due_date:P.val('dead_additional_due_date')||null,status:P.val('dead_status')||'OPEN',completed_date:P.val('dead_completed_date')||null,alert_days_before:alerts.length?alerts:[90,30,7],note:P.val('dead_note')||null,source:'MANUAL',updated_by_employee_no:ctx.session.employeeNo||null});try{let res;if(editingDeadline)res=await P.state.client.from('pat_deadlines').update(payload).eq('id',editingDeadline).eq('company_id',ctx.session.companyId);else{payload.created_by_employee_no=ctx.session.employeeNo||null;res=await P.state.client.from('pat_deadlines').insert(payload);}if(res.error)throw res.error;P.modalClose('deadlineModal');P.toast('기한정보를 저장했습니다.');editingDeadline=null;await loadAll();showSection('deadlines');}catch(e){P.toast(e.message,'error');}}
  async function completeDeadline(id){const {error}=await P.state.client.from('pat_deadlines').update({status:'COMPLETED',completed_date:new Date().toISOString().slice(0,10),updated_by_employee_no:ctx.session.employeeNo||null}).eq('id',id).eq('company_id',ctx.session.companyId);if(error){P.toast(error.message,'error');return;}P.toast('완료 처리했습니다.');await loadAll();showSection('deadlines');}

  function renderSettings(){
    const canAdmin=ctx.access.admin;const s=settings||{};
    $('sectionSettings').innerHTML=`<div class="settings-grid"><div class="settings-stack"><article class="pat-card pat-card-pad"><div class="pat-card-title">일반 설정</div><div class="setting-row"><div class="setting-label">알림 기준 (D-Day)</div><div class="setting-control"><input id="settingAlerts" class="pat-input" value="${P.escapeHtml((s.alert_days_before||[90,30,7]).join(','))}" ${canAdmin?'':'disabled'}></div></div><div class="setting-row"><div class="setting-label">기본 국가</div><div class="setting-control"><input id="settingCountry" class="pat-input" value="${P.escapeHtml(s.default_country_code||'KR')}" ${canAdmin?'':'disabled'}></div></div><div class="setting-row"><div class="setting-label">기본 통화</div><div class="setting-control"><input id="settingCurrency" class="pat-input" value="${P.escapeHtml(s.default_currency||'KRW')}" ${canAdmin?'':'disabled'}></div></div><div class="setting-row"><div class="setting-label">KIPRIS 연동</div><div class="setting-control"><label class="switch-row"><input id="settingKipris" type="checkbox" ${s.kipris_sync_enabled!==false?'checked':''} ${canAdmin?'':'disabled'}> 사용</label></div></div><div class="setting-row"><div class="setting-label">KIPRIS 자동갱신</div><div class="setting-control"><label class="switch-row"><input id="settingAutoSync" type="checkbox" ${s.kipris_auto_sync_enabled?'checked':''} ${canAdmin?'':'disabled'}> 사용</label></div></div>${canAdmin?'<div style="margin-top:10px"><button id="saveSettingsBtn" class="pat-btn primary">설정 저장</button></div>':''}</article><article class="pat-card pat-card-pad"><div class="pat-card-title">KIPRIS API 상태</div><div class="pat-note form-top-gap">API Key는 브라우저나 DB가 아닌 Supabase Edge Function Secret에 보관합니다. 프로그램은 <b>patent-kipris</b> Edge Function을 통해 조회하도록 준비되어 있습니다.</div><div style="margin-top:10px"><button id="testKiprisBtn" class="pat-btn secondary">연동 테스트</button></div></article></div><div class="settings-stack"><article class="pat-card pat-card-pad"><div class="settings-section-head"><div><div class="pat-card-title">특허사무소 관리</div><div class="pat-card-desc">대행납부 및 청구 관리에 사용합니다.</div></div>${canAdmin?'<button id="newAgencyBtn" class="pat-btn primary">＋ 사무소 등록</button>':''}</div><div class="pat-table-wrap"><table class="pat-table agency-table"><thead><tr><th>사무소</th><th>담당자</th><th>연락처</th><th>이메일</th><th>관리</th></tr></thead><tbody>${agencies.length?agencies.map(a=>`<tr><td>${P.escapeHtml(a.agency_name)}</td><td>${P.escapeHtml(a.contact_name||'-')}</td><td>${P.escapeHtml(a.phone||'-')}</td><td>${P.escapeHtml(a.email||'-')}</td><td>${canAdmin?`<button class="pat-btn" data-ag-edit="${a.id}">수정</button>`:'-'}</td></tr>`).join(''):'<tr><td colspan="5" class="pat-empty">등록된 특허사무소가 없습니다.</td></tr>'}</tbody></table></div></article><article class="pat-card pat-card-pad"><div class="pat-card-title">접근 권한</div><div class="pat-card-desc">특허관리 프로그램은 회사 관리자 전용입니다.</div><div class="pat-note form-top-gap">Portal 설정의 사원정보관리에서 <b>권한 = 관리자</b>로 지정된 회사 관리자만 특허현황·특허목록·납부관리·기한관리·설정에 접근할 수 있습니다. 일반사용자에게는 특허 메뉴가 표시되지 않습니다.</div></article></div></div>`;
    $('saveSettingsBtn')?.addEventListener('click',saveSettings);$('testKiprisBtn')?.addEventListener('click',testKipris);$('newAgencyBtn')?.addEventListener('click',()=>openAgencyModal());document.querySelectorAll('[data-ag-edit]').forEach(b=>b.addEventListener('click',()=>openAgencyModal(agencies.find(x=>x.id===b.dataset.agEdit))));
  }
  async function saveSettings(){const alerts=P.val('settingAlerts').split(',').map(x=>Number(x.trim())).filter(x=>Number.isFinite(x)&&x>=0);const payload=P.companyPayload({alert_days_before:alerts.length?alerts:[90,30,7],default_country_code:(P.val('settingCountry')||'KR').toUpperCase(),default_currency:(P.val('settingCurrency')||'KRW').toUpperCase(),kipris_sync_enabled:$('settingKipris').checked,kipris_auto_sync_enabled:$('settingAutoSync').checked,updated_by_employee_no:ctx.session.employeeNo||null});const {error}=await P.state.client.from('pat_settings').upsert(payload,{onConflict:'company_id'});if(error){P.toast(error.message,'error');return;}P.toast('설정을 저장했습니다.');await loadAll();showSection('settings');}
  async function testKipris(){const btn=this;btn.disabled=true;try{await P.invokeKipris({action:'health',company_id:ctx.session.companyId});P.toast('KIPRIS Edge Function 연결이 정상입니다.');}catch(e){P.toast(e.message+' 아직 Edge Function이 없으면 정상적인 안내입니다.','warn',4500);}finally{btn.disabled=false;}}
  function clearAgency(){['name','contact_name','phone','email','address','memo'].forEach(k=>P.setVal('agency_'+k,''));}
  function openAgencyModal(a=null){editingAgency=a?.id||null;clearAgency();$('agencyModalTitle').textContent=a?'특허사무소 수정':'특허사무소 등록';if(a){['name','contact_name','phone','email','address','memo'].forEach(k=>P.setVal('agency_'+k,a['agency_'+k]??a[k]??''));P.setVal('agency_name',a.agency_name||'');}P.modalOpen('agencyModal');}
  async function saveAgency(){const name=P.val('agency_name').trim();if(!name){P.toast('사무소명을 입력해 주세요.','warn');return;}const payload=P.companyPayload({agency_name:name,contact_name:P.val('agency_contact_name')||null,phone:P.val('agency_phone')||null,email:P.val('agency_email')||null,address:P.val('agency_address')||null,memo:P.val('agency_memo')||null,is_active:true});let res;if(editingAgency)res=await P.state.client.from('pat_agencies').update(payload).eq('id',editingAgency).eq('company_id',ctx.session.companyId);else res=await P.state.client.from('pat_agencies').insert(payload);if(res.error){P.toast(res.error.message,'error');return;}P.modalClose('agencyModal');P.toast('특허사무소를 저장했습니다.');editingAgency=null;await loadAll();showSection('settings');}

  init().catch(e=>{console.error(e);document.querySelector('.pat-app').innerHTML='<div class="pat-error">'+P.escapeHtml(e.message)+'</div>';});
})();
