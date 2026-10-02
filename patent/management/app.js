(function(){
  'use strict';
  const P=window.PatentCommon;
  let ctx=null, patents=[], payments=[], deadlines=[], agencies=[], employees=[], settings=null;
  let section='payments', editingPayment=null, editingDeadline=null, editingAgency=null, calendarDate=new Date();
  let companySearchData=null, companySearchPage=1, companySearchPageSize=50, companySearchLoading=false, companySearchCacheLoading=false;
  const query=new URLSearchParams(location.search);
  const $=id=>document.getElementById(id);

  async function init(){
    ctx=await P.resolveContext();
    if(!ctx.access.write){
      document.querySelector('.pat-app').innerHTML='<div class="pat-error">특허 운영자 또는 관리자만 이용할 수 있습니다.</div>';
      return;
    }
    if(ctx.access.admin){
      $('companySearchTab')?.classList.remove('hidden');
    }else{
      $('companySearchTab')?.classList.add('hidden');
    }

    section=query.get('section')||'payments';
    if(section==='company-search'&&!ctx.access.admin)section='payments';

    bind(); await loadAll(); showSection(section);
  }
  function bind(){
    document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>showSection(b.dataset.section)));
    $('refreshBtn').addEventListener('click',()=>{
      if(section==='company-search'&&ctx.access.admin){
        loadCompanySearchCachePage(
          currentCompanySearchName(),
          companySearchPage,
          {notify:true}
        ).catch(e=>P.toast(e.message,'error'));
        return;
      }
      loadAll().catch(e=>P.toast(e.message,'error'));
    });
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
     * 납부기한이 지난 미완료 납부건은 자동으로 OVERDUE(기한초과) 처리합니다.
     * PAID/CANCELLED 건은 자동 변경하지 않습니다.
     */
    if(ctx.access.write){
      await syncOverduePaymentStatuses();
    }

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

  function agencyName(id){
    if(!id)return '';
    return agencies.find(x=>x.id===id)?.agency_name||'';
  }

  function paymentForDeadline(deadline){
    if(!deadline?.related_payment_id)return null;
    return payments.find(x=>x.id===deadline.related_payment_id)||null;
  }

  function deadlineCalendarInfo(deadline){
    const payment=paymentForDeadline(deadline);
    const patentTitle=patentName(deadline.patent_id);

    if(!payment){
      return {
        main:deadline.title||P.deadlineTypeLabel(deadline.deadline_type),
        sub:patentTitle,
        tooltip:`${deadline.title||P.deadlineTypeLabel(deadline.deadline_type)} · ${patentTitle}`
      };
    }

    const annual=P.annualRangeLabel(
      payment.annual_year_from,
      payment.annual_year_to
    );

    const annualText=annual&&annual!=='-'
      ? annual.replace(/\s*\([^)]*\)\s*$/,'')
      : '';

    const paymentLabel=payment.payment_title
      ||P.paymentTypeLabel(payment.payment_type)
      ||deadline.title
      ||'납부';

    const tag=annualText||paymentLabel;

    let methodText='직접납부';

    if(payment.payment_method==='AGENCY'){
      methodText=agencyName(payment.agency_id)||'대행업체 미지정';
    }else if(payment.payment_method){
      methodText=P.paymentMethodLabel(payment.payment_method)||'직접납부';
    }

    return {
      main:`[${tag}] ${patentTitle}`,
      sub:methodText,
      tooltip:`${tag} · ${patentTitle} · ${methodText} · ${P.fmtDate(deadline.due_date)}`
    };
  }

  function upcomingDeadlineInfo(deadline){
    const info=deadlineCalendarInfo(deadline);
    const payment=paymentForDeadline(deadline);

    if(!payment){
      return {
        title:deadline.title||P.deadlineTypeLabel(deadline.deadline_type),
        sub:`${patentName(deadline.patent_id)} · ${P.fmtDate(deadline.due_date)}`
      };
    }

    const annual=P.annualRangeLabel(
      payment.annual_year_from,
      payment.annual_year_to
    );

    const annualText=annual&&annual!=='-'
      ? annual.replace(/\s*\([^)]*\)\s*$/,'')
      : (payment.payment_title||P.paymentTypeLabel(payment.payment_type)||'납부');

    let methodText='직접납부';

    if(payment.payment_method==='AGENCY'){
      methodText=agencyName(payment.agency_id)||'대행업체 미지정';
    }else if(payment.payment_method){
      methodText=P.paymentMethodLabel(payment.payment_method)||'직접납부';
    }

    return {
      title:`[${annualText}] ${patentName(deadline.patent_id)}`,
      sub:`${methodText} · ${P.fmtDate(deadline.due_date)}`
    };
  }
  function fillSelects(){
    const opts='<option value="">선택</option>'+patents.map(p=>`<option value="${p.id}">${P.escapeHtml((p.internal_no?p.internal_no+' · ':'')+p.invention_title)}</option>`).join(''); $('pay_patent_id').innerHTML=opts;$('dead_patent_id').innerHTML=opts;
    $('pay_agency_id').innerHTML='<option value="">선택</option>'+agencies.map(a=>`<option value="${a.id}">${P.escapeHtml(a.agency_name)}</option>`).join('');
  }
  function showSection(s){
    const allowed=['payments','deadlines','settings'];
    if(ctx?.access?.admin)allowed.push('company-search');
    section=allowed.includes(s)?s:'payments';

    document
      .querySelectorAll('[data-section]')
      .forEach(b=>b.classList.toggle('active',b.dataset.section===section));

    const sectionMap={
      payments:'sectionPayments',
      deadlines:'sectionDeadlines',
      settings:'sectionSettings',
      'company-search':'sectionCompanySearch'
    };

    Object.entries(sectionMap).forEach(([key,id])=>{
      $(id)?.classList.toggle('hidden',key!==section);
    });

    history.replaceState(null,'','?section='+encodeURIComponent(section));
    renderCurrent();

    // 회사특허 조회 화면은 진입할 때 KIPRIS API를 자동 호출하지 않습니다.
    // 저장된 결과가 있으면 DB 캐시에서만 불러옵니다.
    if(
      section==='company-search' &&
      ctx?.access?.admin &&
      !companySearchData &&
      !companySearchLoading &&
      !companySearchCacheLoading
    ){
      loadCompanySearchCachePage(
        defaultCompanySearchName(),
        companySearchPage,
        {notify:false}
      ).catch(e=>console.warn('[company-search-cache]',e));
    }
  }

  function renderCurrent(){
    if(section==='payments')renderPayments();
    if(section==='deadlines')renderDeadlines();
    if(section==='settings')renderSettings();
    if(section==='company-search')renderCompanySearch();
  }

  function paymentDue(x){return x.official_due_date||x.invoice_due_date||x.planned_payment_date;}

  function paymentStatusRank(status){
    if(status==='OVERDUE')return 0;

    if([
      'PLANNED',
      'INVOICE_RECEIVED',
      'PAYMENT_REQUESTED',
      'APPROVING'
    ].includes(status)){
      return 1;
    }

    if(status==='PAID')return 2;
    if(status==='CANCELLED')return 3;

    return 1;
  }

  function paymentDueSortValue(payment){
    const due=paymentDue(payment);

    if(!due){
      return Number.POSITIVE_INFINITY;
    }

    const time=new Date(`${due}T00:00:00`).getTime();

    return Number.isFinite(time)
      ? time
      : Number.POSITIVE_INFINITY;
  }

  function sortPaymentsForList(rows){
    return [...rows].sort((a,b)=>{
      const rankDiff=
        paymentStatusRank(a.status)-
        paymentStatusRank(b.status);

      if(rankDiff!==0){
        return rankDiff;
      }

      const dueDiff=
        paymentDueSortValue(a)-
        paymentDueSortValue(b);

      if(dueDiff!==0){
        return dueDiff;
      }

      return String(
        patentName(a.patent_id)
      ).localeCompare(
        String(
          patentName(b.patent_id)
        ),
        'ko'
      );
    });
  }

  async function syncOverduePaymentStatuses(){
    const overdueIds=payments
      .filter(payment=>{
        if([
          'PAID',
          'CANCELLED',
          'OVERDUE'
        ].includes(payment.status)){
          return false;
        }

        const due=paymentDue(payment);
        const days=P.daysUntil(due);

        return (
          due &&
          days!==null &&
          days<0
        );
      })
      .map(payment=>payment.id);

    if(!overdueIds.length){
      return false;
    }

    const {error}=await P.state.client
      .from('pat_payments')
      .update({
        status:'OVERDUE',
        updated_by_employee_no:
          ctx.session.employeeNo||null
      })
      .eq(
        'company_id',
        ctx.session.companyId
      )
      .in(
        'id',
        overdueIds
      );

    if(error){
      throw error;
    }

    const overdueSet=new Set(overdueIds);

    payments.forEach(payment=>{
      if(overdueSet.has(payment.id)){
        payment.status='OVERDUE';
        payment.updated_by_employee_no=
          ctx.session.employeeNo||null;
      }
    });

    return true;
  }

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
  function paymentActionHtml(payment){
    if(!ctx.access.write)return '-';

    const editButton=`
      <button
        class="pat-btn"
        data-pay-edit="${payment.id}"
      >
        수정
      </button>
    `;

    /*
     * 실제 지급완료(PAID) 건은 회계/이력 보존을 위해 삭제하지 않습니다.
     * 그 외 미지급/진행/취소 건은 잘못 등록한 경우 삭제할 수 있습니다.
     */
    const deleteButton=(
      ctx.access.admin &&
      payment.status!=='PAID'
    )
      ? `
        <button
          class="pat-btn danger"
          data-pay-delete="${payment.id}"
        >
          삭제
        </button>
      `
      : '';

    return `
      <div class="file-actions">
        ${editButton}
        ${deleteButton}
      </div>
    `;
  }

  function renderPaymentTable(){
    const search=P.clean(
      $('paymentSearch')?.value
    ).toLowerCase();

    const st=$('paymentStatus')?.value||'';
    const method=$('paymentMethod')?.value||'';

    const rows=sortPaymentsForList(
      payments.filter(x=>
        (!st||x.status===st)&&
        (!method||x.payment_method===method)&&
        (
          !search||
          [
            patentName(x.patent_id),
            P.paymentTypeLabel(x.payment_type),
            x.payment_title
          ]
            .join(' ')
            .toLowerCase()
            .includes(search)
        )
      )
    );

    $('paymentTable').innerHTML=`
      <div class="pat-card pat-card-pad">
        <div class="pat-table-wrap">
          <table class="pat-table management-table">
            <thead>
              <tr>
                <th>특허</th>
                <th>납부구분</th>
                <th>대상연차</th>
                <th>방식</th>
                <th>납부기한</th>
                <th>청구금액</th>
                <th>지급금액</th>
                <th>상태</th>
                <th>지급일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(x=>`
                    <tr>
                      <td>
                        ${P.escapeHtml(
                          patentName(x.patent_id)
                        )}
                      </td>
                      <td>
                        ${P.escapeHtml(
                          x.payment_title||
                          P.paymentTypeLabel(
                            x.payment_type
                          )
                        )}
                      </td>
                      <td>
                        ${P.annualRangeLabel(
                          x.annual_year_from,
                          x.annual_year_to
                        )}
                      </td>
                      <td>
                        ${P.paymentMethodLabel(
                          x.payment_method
                        )}
                        ${
                          x.agency_id
                            ? `
                              <div class="pat-card-desc">
                                ${P.escapeHtml(
                                  agencies.find(
                                    a=>a.id===x.agency_id
                                  )?.agency_name||''
                                )}
                              </div>
                            `
                            : ''
                        }
                      </td>
                      <td>
                        ${P.fmtDate(paymentDue(x))}
                        <div class="pat-dday ${P.ddayClass(paymentDue(x))}">
                          ${P.dday(paymentDue(x))}
                        </div>
                      </td>
                      <td class="num">
                        ${P.fmtMoney(
                          x.billed_amount,
                          x.currency
                        )}
                      </td>
                      <td class="num">
                        ${P.fmtMoney(
                          x.paid_amount,
                          x.currency
                        )}
                      </td>
                      <td>
                        ${P.badge(
                          x.status,
                          P.paymentStatusLabel(
                            x.status
                          )
                        )}
                      </td>
                      <td>
                        ${P.fmtDate(x.paid_date)}
                      </td>
                      <td>
                        ${paymentActionHtml(x)}
                      </td>
                    </tr>
                  `).join('')
                  : `
                    <tr>
                      <td
                        colspan="10"
                        class="pat-empty"
                      >
                        납부내역이 없습니다.
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    document
      .querySelectorAll('[data-pay-edit]')
      .forEach(button=>{
        button.addEventListener(
          'click',
          ()=>openPaymentModal(
            payments.find(
              x=>x.id===button.dataset.payEdit
            )
          )
        );
      });

    document
      .querySelectorAll('[data-pay-delete]')
      .forEach(button=>{
        button.addEventListener(
          'click',
          ()=>deletePayment(
            button.dataset.payDelete
          )
        );
      });
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

  async function deletePayment(paymentId){
    if(!ctx.access.admin)return;

    const payment=payments.find(
      x=>x.id===paymentId
    );

    if(!payment){
      P.toast(
        '납부정보를 찾을 수 없습니다.',
        'warn'
      );
      return;
    }

    if(payment.status==='PAID'){
      P.toast(
        '지급완료된 납부정보는 삭제할 수 없습니다.',
        'warn'
      );
      return;
    }

    const title=
      payment.payment_title||
      P.paymentTypeLabel(
        payment.payment_type
      )||
      '납부정보';

    const confirmed=confirm(
      `${patentName(payment.patent_id)}\n`+
      `${title}\n\n`+
      '이 납부정보를 삭제할까요?\n'+
      '자동 생성된 기한정보도 함께 삭제됩니다.'
    );

    if(!confirmed)return;

    try{
      /*
       * 1) 자동 생성된 기한을 먼저 제거합니다.
       *    pat_payments를 먼저 지우면 FK의 ON DELETE SET NULL 때문에
       *    기한이 일반 기한처럼 남을 수 있으므로 순서를 지킵니다.
       */
      const deadlineResult=
        await P.state.client
          .from('pat_deadlines')
          .delete()
          .eq(
            'related_payment_id',
            payment.id
          )
          .eq(
            'company_id',
            ctx.session.companyId
          );

      if(deadlineResult.error){
        throw deadlineResult.error;
      }

      /*
       * 2) 납부건에 연결된 첨부파일은 삭제하지 않고
       *    특허 공통 첨부문서로 보존합니다.
       *    (DB FK가 payment 삭제 시 cascade이므로 사전에 연결만 해제)
       */
      const fileResult=
        await P.state.client
          .from('pat_files')
          .update({
            payment_id:null
          })
          .eq(
            'payment_id',
            payment.id
          )
          .eq(
            'company_id',
            ctx.session.companyId
          );

      if(fileResult.error){
        throw fileResult.error;
      }

      /*
       * 3) 납부정보 삭제
       */
      const paymentResult=
        await P.state.client
          .from('pat_payments')
          .delete()
          .eq(
            'id',
            payment.id
          )
          .eq(
            'company_id',
            ctx.session.companyId
          );

      if(paymentResult.error){
        throw paymentResult.error;
      }

      P.toast(
        '납부정보와 자동 기한정보를 삭제했습니다.'
      );

      await loadAll();
      showSection('payments');
    }catch(e){
      P.toast(
        e.message,
        'error'
      );
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
  function renderCalendar(){
    const y=calendarDate.getFullYear();
    const m=calendarDate.getMonth();

    $('calendarMonth').textContent=`${y}년 ${m+1}월`;

    const first=new Date(y,m,1);
    const start=new Date(y,m,1-first.getDay());

    const heads=['일','월','화','수','목','금','토']
      .map(x=>`<div class="pat-cal-head">${x}</div>`)
      .join('');

    let cells='';

    for(let i=0;i<42;i++){
      const d=new Date(start);
      d.setDate(start.getDate()+i);

      const ds=[
        d.getFullYear(),
        String(d.getMonth()+1).padStart(2,'0'),
        String(d.getDate()).padStart(2,'0')
      ].join('-');

      const dayEvents=deadlines
        .filter(x=>x.due_date===ds&&x.status==='OPEN')
        .sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));

      const visibleEvents=dayEvents.slice(0,2);

      const eventHtml=visibleEvents.map(deadline=>{
        const info=deadlineCalendarInfo(deadline);
        const isPayment=!!deadline.related_payment_id;

        const colorClass=P.daysUntil(deadline.due_date)<=7
          ? 'red'
          : isPayment
            ? 'gold'
            : 'blue';

        return `
          <div
            class="pat-cal-event pat-cal-event-detail ${colorClass}"
            title="${P.escapeHtml(info.tooltip)}"
          >
            <div class="pat-cal-event-main">
              ${P.escapeHtml(info.main)}
            </div>
            <div class="pat-cal-event-sub">
              ${P.escapeHtml(info.sub)}
            </div>
          </div>
        `;
      }).join('');

      const moreCount=dayEvents.length-visibleEvents.length;

      const moreHtml=moreCount>0
        ? `<div class="pat-cal-more">+${moreCount}건 더보기</div>`
        : '';

      cells+=`
        <div class="pat-cal-cell ${d.getMonth()!==m?'muted':''}">
          <div class="pat-cal-date">${d.getDate()}</div>
          ${eventHtml}
          ${moreHtml}
        </div>
      `;
    }

    $('calendar').innerHTML=heads+cells;
  }

  function renderUpcoming(){
    const rows=deadlines
      .filter(x=>x.status==='OPEN')
      .sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)))
      .slice(0,8);

    $('upcomingDeadlines').innerHTML=rows.length
      ? rows.map(deadline=>{
          const info=upcomingDeadlineInfo(deadline);

          return `
            <div class="upcoming-item">
              <div class="upcoming-top">
                <div class="upcoming-title">
                  ${P.escapeHtml(info.title)}
                </div>
                <div class="pat-dday ${P.ddayClass(deadline.due_date)}">
                  ${P.dday(deadline.due_date)}
                </div>
              </div>
              <div class="upcoming-sub">
                ${P.escapeHtml(info.sub)}
              </div>
            </div>
          `;
        }).join('')
      : '<div class="pat-empty">다가오는 기한이 없습니다.</div>';
  }

  function deadlineActionHtml(deadline){
    if(!ctx.access.write)return '-';

    if(deadline.related_payment_id){
      return `
        <button
          class="pat-btn secondary"
          data-dead-payment="${deadline.related_payment_id}"
        >
          납부관리
        </button>
      `;
    }

    const completeButton=deadline.status==='OPEN'
      ? `
        <button
          class="pat-btn success"
          data-dead-complete="${deadline.id}"
        >
          완료
        </button>
      `
      : '';

    return `
      <button
        class="pat-btn"
        data-dead-edit="${deadline.id}"
      >
        수정
      </button>
      ${completeButton}
    `;
  }

  function renderDeadlineTable(){
    const type=$('deadlineTypeFilter')?.value||'';
    const rows=deadlines.filter(x=>!type||x.deadline_type===type);

    $('deadlineTable').innerHTML=`
      <div class="pat-card pat-card-pad">
        <div class="pat-table-wrap">
          <table class="pat-table">
            <thead>
              <tr>
                <th>특허</th>
                <th>구분</th>
                <th>기한명</th>
                <th>기한일</th>
                <th>D-Day</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(x=>`
                    <tr>
                      <td>${P.escapeHtml(patentName(x.patent_id))}</td>
                      <td>${P.deadlineTypeLabel(x.deadline_type)}</td>
                      <td>${P.escapeHtml(x.title)}</td>
                      <td>${P.fmtDate(x.due_date)}</td>
                      <td>
                        <span class="pat-dday ${P.ddayClass(x.due_date)}">
                          ${P.dday(x.due_date)}
                        </span>
                      </td>
                      <td>
                        ${
                          P.badge(
                            x.status,
                            x.status==='OPEN'
                              ? '진행중'
                              : x.status==='COMPLETED'
                                ? '완료'
                                : x.status
                          )
                        }
                      </td>
                      <td>
                        ${deadlineActionHtml(x)}
                      </td>
                    </tr>
                  `).join('')
                  : `
                    <tr>
                      <td colspan="7" class="pat-empty">
                        기한정보가 없습니다.
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    document
      .querySelectorAll('[data-dead-edit]')
      .forEach(button=>{
        button.addEventListener('click',()=>{
          openDeadlineModal(
            deadlines.find(
              x=>x.id===button.dataset.deadEdit
            )
          );
        });
      });

    document
      .querySelectorAll('[data-dead-complete]')
      .forEach(button=>{
        button.addEventListener(
          'click',
          ()=>completeDeadline(
            button.dataset.deadComplete
          )
        );
      });

    document
      .querySelectorAll('[data-dead-payment]')
      .forEach(button=>{
        button.addEventListener('click',()=>{
          const payment=payments.find(
            x=>x.id===button.dataset.deadPayment
          );

          if(!payment){
            P.toast(
              '연결된 납부정보를 찾을 수 없습니다.',
              'warn'
            );
            return;
          }

          showSection('payments');
          openPaymentModal(payment);
        });
      });
  }
  function clearDead(){['patent_id','deadline_type','title','base_date','due_date','additional_due_date','status','completed_date','note'].forEach(k=>P.setVal('dead_'+k,''));P.setVal('dead_deadline_type','ANNUAL_FEE');P.setVal('dead_status','OPEN');P.setVal('dead_alert_days_before',(settings?.alert_days_before||[90,30,7]).join(','));}
  function openDeadlineModal(x=null){if(!ctx.access.write)return;editingDeadline=x?.id||null;clearDead();$('deadlineModalTitle').textContent=x?'기한 수정':'기한 등록';if(x){Object.keys(x).forEach(k=>{if($('dead_'+k))P.setVal('dead_'+k,Array.isArray(x[k])?x[k].join(','):x[k]??'');});}P.modalOpen('deadlineModal');}
  async function saveDeadline(){const pid=P.val('dead_patent_id'),title=P.val('dead_title'),due=P.val('dead_due_date');if(!pid||!title||!due){P.toast('특허, 기한명, 기한일을 입력해 주세요.','warn');return;}const alerts=P.val('dead_alert_days_before').split(',').map(x=>Number(x.trim())).filter(x=>Number.isFinite(x)&&x>=0);const payload=P.companyPayload({patent_id:pid,deadline_type:P.val('dead_deadline_type'),title,base_date:P.val('dead_base_date')||null,due_date:due,additional_due_date:P.val('dead_additional_due_date')||null,status:P.val('dead_status')||'OPEN',completed_date:P.val('dead_completed_date')||null,alert_days_before:alerts.length?alerts:[90,30,7],note:P.val('dead_note')||null,source:'MANUAL',updated_by_employee_no:ctx.session.employeeNo||null});try{let res;if(editingDeadline)res=await P.state.client.from('pat_deadlines').update(payload).eq('id',editingDeadline).eq('company_id',ctx.session.companyId);else{payload.created_by_employee_no=ctx.session.employeeNo||null;res=await P.state.client.from('pat_deadlines').insert(payload);}if(res.error)throw res.error;P.modalClose('deadlineModal');P.toast('기한정보를 저장했습니다.');editingDeadline=null;await loadAll();showSection('deadlines');}catch(e){P.toast(e.message,'error');}}
  async function completeDeadline(id){const {error}=await P.state.client.from('pat_deadlines').update({status:'COMPLETED',completed_date:new Date().toISOString().slice(0,10),updated_by_employee_no:ctx.session.employeeNo||null}).eq('id',id).eq('company_id',ctx.session.companyId);if(error){P.toast(error.message,'error');return;}P.toast('완료 처리했습니다.');await loadAll();showSection('deadlines');}


  function defaultCompanySearchName(){
    const sessionName=String(ctx?.session?.companyName||'').trim();
    return sessionName||'삼천당제약';
  }


  function currentCompanySearchName(){
    return String(
      $('companySearchName')?.value||
      companySearchData?.company_name||
      defaultCompanySearchName()
    ).trim();
  }

  function companySearchCacheKey(value){
    return String(value||'')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g,'');
  }

  function numberDigits(value){
    return String(value||'').replace(/\D/g,'');
  }

  function refreshPortalRegistrationFlags(data){
    if(!data||!Array.isArray(data.patents))return data;

    const byApplication=new Map();
    const byRegistration=new Map();

    patents.forEach(patent=>{
      const appNo=numberDigits(patent.application_no);
      const regNo=numberDigits(patent.registration_no);

      if(appNo)byApplication.set(appNo,patent);
      if(regNo)byRegistration.set(regNo,patent);
    });

    data.patents=data.patents.map(item=>{
      const appNo=numberDigits(item.application_no);
      const regNo=numberDigits(item.registration_no);

      const existing=
        (appNo?byApplication.get(appNo):null)||
        (regNo?byRegistration.get(regNo):null)||
        null;

      return {
        ...item,
        portal_registered:!!existing,
        portal_patent_id:existing?.id||null
      };
    });

    return data;
  }

  function cloneCompanySearchResponse(data){
    const copy=JSON.parse(JSON.stringify(data||{}));
    delete copy._cache_meta;
    return copy;
  }

  function isMissingCompanySearchCacheTable(error){
    const text=String(error?.message||'').toLowerCase();
    return (
      error?.code==='42P01' ||
      (
        text.includes('pat_company_search_cache') &&
        text.includes('does not exist')
      )
    );
  }

  function applyCompanySearchData(data,cacheMeta=null){
    if(!data)return false;

    const normalized=refreshPortalRegistrationFlags(
      cloneCompanySearchResponse(data)
    );

    normalized._cache_meta={
      cached:!!cacheMeta?.cached,
      saved:cacheMeta?.saved!==false,
      synced_at:
        cacheMeta?.synced_at||
        normalized?.source?.searched_at||
        null
    };

    companySearchData=normalized;
    companySearchPage=
      Math.max(1,Number(normalized.page||companySearchPage)||1);
    companySearchPageSize=
      Math.max(1,Number(normalized.page_size||companySearchPageSize)||50);

    return true;
  }

  async function loadCompanySearchCachePage(
    companyName,
    page=1,
    options={}
  ){
    if(!ctx?.access?.admin)return false;
    if(companySearchCacheLoading)return false;

    const name=String(companyName||defaultCompanySearchName()).trim();
    if(!name)return false;

    const targetPage=Math.max(1,Number(page)||1);
    const key=companySearchCacheKey(name);

    companySearchCacheLoading=true;

    try{
      const {data,error}=await P.state.client
        .from('pat_company_search_cache')
        .select(
          'search_name,page,page_size,total_count,returned_count,has_more,response_json,synced_at'
        )
        .eq('company_id',ctx.session.companyId)
        .eq('search_name_key',key)
        .eq('country_code','KR')
        .eq('page',targetPage)
        .eq('page_size',companySearchPageSize)
        .maybeSingle();

      if(error){
        if(isMissingCompanySearchCacheTable(error)){
          if(options.notify){
            P.toast(
              '회사특허 저장 테이블이 없습니다. 포함된 SQL을 먼저 실행해 주세요.',
              'warn',
              5200
            );
          }
          return false;
        }
        throw error;
      }

      if(!data?.response_json){
        if(options.notify){
          P.toast(
            '저장된 조회결과가 없습니다. KIPRIS 새로조회를 눌러주세요.',
            'warn'
          );
        }
        return false;
      }

      applyCompanySearchData(
        data.response_json,
        {
          cached:true,
          saved:true,
          synced_at:data.synced_at
        }
      );

      companySearchPage=targetPage;
      renderCompanySearch();

      if(options.notify){
        P.toast('저장된 회사특허 조회결과를 불러왔습니다.');
      }

      return true;
    }finally{
      companySearchCacheLoading=false;
    }
  }

  async function saveCompanySearchCachePage(companyName,data){
    if(!ctx?.access?.admin||!data)return false;

    const name=String(companyName||data.company_name||'').trim();
    if(!name)return false;

    const payload={
      company_id:ctx.session.companyId,
      search_name_key:companySearchCacheKey(name),
      search_name:name,
      country_code:String(data.country_code||'KR').toUpperCase(),
      page:Math.max(1,Number(data.page||companySearchPage)||1),
      page_size:Math.max(1,Number(data.page_size||companySearchPageSize)||50),
      total_count:Math.max(0,Number(data.total_count||0)||0),
      returned_count:Math.max(0,Number(data.returned_count||0)||0),
      has_more:!!data.has_more,
      response_json:cloneCompanySearchResponse(data),
      synced_at:
        data?.source?.searched_at||
        new Date().toISOString(),
      synced_by_employee_no:ctx.session.employeeNo||null
    };

    const {error}=await P.state.client
      .from('pat_company_search_cache')
      .upsert(
        payload,
        {
          onConflict:
            'company_id,search_name_key,country_code,page,page_size'
        }
      );

    if(error){
      if(isMissingCompanySearchCacheTable(error)){
        P.toast(
          'KIPRIS 조회는 완료됐지만 저장 테이블이 없어 결과를 저장하지 못했습니다. 포함된 SQL을 실행해 주세요.',
          'warn',
          6000
        );
        return false;
      }
      throw error;
    }

    return true;
  }

  async function openCompanySearchPage(page){
    const targetPage=Math.max(1,Number(page)||1);
    const companyName=currentCompanySearchName();

    const loaded=await loadCompanySearchCachePage(
      companyName,
      targetPage,
      {notify:false}
    );

    if(loaded)return;

    // 아직 조회하지 않은 페이지는 최초 1회만 API 호출 후 자동 저장합니다.
    await searchCompanyPatents(targetPage);
  }

  function companyOwnershipClass(status){
    const map={
      '현재보유':'owned',
      '공동보유':'joint',
      '권리이전':'transferred',
      '출원중':'pending',
      '소멸':'expired',
      '거절':'rejected',
      '포기':'abandoned',
      '확인필요':'review'
    };
    return map[status]||'review';
  }

  function companyLegalStatusClass(status){
    const map={
      '등록':'registered',
      '출원중':'pending',
      '심사중':'examining',
      '거절':'rejected',
      '포기':'abandoned',
      '소멸':'expired'
    };
    return map[status]||'neutral';
  }

  function ipTypeLabel(value){
    if(value==='PATENT')return '특허';
    if(value==='UTILITY')return '실용신안';
    return value||'-';
  }

  function countryLabel(value){
    const code=String(value||'').toUpperCase();
    if(code==='KR')return '한국';
    return code||'-';
  }

  function normalizeSearchText(value){
    return String(value??'').trim().toLowerCase();
  }

  function companyPatentMatchesFilter(item){
    // 이미 특허목록(pat_master)에 등록된 건은 회사특허 조회 대상에서 제외합니다.
    if(item.portal_registered)return false;

    const search=normalizeSearchText($('companyResultSearch')?.value);
    const ownership=$('companyOwnershipFilter')?.value||'';

    if(ownership&&item.ownership_status!==ownership)return false;

    if(!search)return true;

    return [
      item.invention_title,
      item.application_no,
      item.registration_no,
      ...(Array.isArray(item.applicant_names)?item.applicant_names:[]),
      ...(Array.isArray(item.right_holder_names)?item.right_holder_names:[])
    ]
      .join(' ')
      .toLowerCase()
      .includes(search);
  }

  function renderCompanySearch(){
    const root=$('sectionCompanySearch');
    if(!root)return;

    if(!ctx.access.admin){
      root.innerHTML='<div class="pat-error">회사 관리자만 회사특허 조회를 사용할 수 있습니다.</div>';
      return;
    }

    if(companySearchLoading){
      root.innerHTML=`
        <article class="pat-card pat-card-pad company-search-loading">
          <div class="pat-loading">KIPRIS에서 회사 특허와 현재 권리자를 확인하고 있습니다...</div>
          <div class="pat-note company-search-loading-note">
            조회가 끝나면 결과를 DB에 저장합니다. 이후에는 저장자료를 우선 사용해 API 호출 횟수를 줄입니다.
          </div>
        </article>
      `;
      return;
    }

    const data=companySearchData;
    const defaultName=data?.company_name||defaultCompanySearchName();

    root.innerHTML=`
      <div class="company-search-head">
        <div>
          <div class="pat-card-title">회사특허 조회</div>
          <div class="pat-card-desc">
            KIPRIS 출원인 검색 결과를 현재 권리자와 포털 특허목록에 비교합니다.
            이미 포털에 등록된 특허는 자동 제외하고 미등록 후보만 표시합니다.
          </div>
        </div>
      </div>

      <div class="company-search-query">
        <div class="company-search-name">
          <label>회사명 / 출원인명</label>
          <input
            id="companySearchName"
            class="pat-input"
            value="${P.escapeHtml(defaultName)}"
            placeholder="예: 삼천당제약"
          >
        </div>
        <div class="company-search-actions">
          <button id="companyCacheLoadBtn" class="pat-btn secondary" type="button">
            저장자료 불러오기
          </button>
          <button id="companySearchBtn" class="pat-btn primary" type="button">
            KIPRIS 새로조회
          </button>
        </div>
      </div>

      <div class="pat-note company-search-note">
        저장된 조회결과가 있으면 API를 다시 호출하지 않고 DB 자료를 사용합니다.
        포털 특허목록에 이미 등록된 건은 화면에서 자동 제외합니다.
        <b>KIPRIS 새로조회</b>를 누른 경우에만 최신 KIPRIS 결과를 확인하고 다시 저장합니다.
      </div>

      ${data?renderCompanySearchResults(data):`
        <article class="pat-card pat-card-pad company-search-empty-card">
          <div class="pat-empty">
            저장자료가 없으면 <b>KIPRIS 새로조회</b>를 눌러주세요.
          </div>
        </article>
      `}
    `;

    $('companySearchBtn')?.addEventListener('click',()=>searchCompanyPatents(1));
    $('companyCacheLoadBtn')?.addEventListener('click',()=>(
      loadCompanySearchCachePage(
        currentCompanySearchName(),
        1,
        {notify:true}
      )
    ));

    if(data){
      ['companyResultSearch','companyOwnershipFilter']
        .forEach(id=>{
          const el=$(id);
          if(!el)return;
          el.addEventListener(id==='companyResultSearch'?'input':'change',renderCompanySearchTable);
        });

      $('companyPrevPage')?.addEventListener('click',()=>{
        if(companySearchPage>1)openCompanySearchPage(companySearchPage-1);
      });

      $('companyNextPage')?.addEventListener('click',()=>{
        if(data.has_more)openCompanySearchPage(companySearchPage+1);
      });

      renderCompanySearchTable();
    }
  }

  function renderCompanySearchResults(data){
    const rawRows=Array.isArray(data.patents)?data.patents:[];
    const rows=rawRows.filter(x=>!x.portal_registered);
    const excludedRegisteredCount=rawRows.length-rows.length;

    const summary={
      current_owned:rows.filter(x=>x.ownership_status==='현재보유').length,
      jointly_owned:rows.filter(x=>x.ownership_status==='공동보유').length,
      transferred:rows.filter(x=>x.ownership_status==='권리이전').length,
      pending:rows.filter(x=>x.ownership_status==='출원중').length,
      expired:rows.filter(x=>x.ownership_status==='소멸').length,
      needs_review:rows.filter(x=>x.ownership_status==='확인필요').length
    };

    const pageLabel=`${Number(data.page||companySearchPage)}페이지`;
    const cacheMeta=data._cache_meta||{};
    const syncAt=cacheMeta.synced_at||data?.source?.searched_at||null;
    const syncText=syncAt
      ?new Date(syncAt).toLocaleString('ko-KR')
      :'-';

    return `
      <div class="company-search-summary-note">
        <span>
          KIPRIS 전체 <b>${Number(data.total_count||0).toLocaleString('ko-KR')}건</b>
          · 현재 ${P.escapeHtml(pageLabel)}
          · 검토대상 <b>${rows.length.toLocaleString('ko-KR')}건</b>
          ${excludedRegisteredCount?`· 포털 등록 ${excludedRegisteredCount.toLocaleString('ko-KR')}건 제외`:''}
        </span>
        <span class="company-cache-info">
          <span class="company-cache-badge ${cacheMeta.cached?'cached':'fresh'}">
            ${cacheMeta.cached?'저장자료':'API 조회'}
          </span>
          마지막 API 조회 ${P.escapeHtml(syncText)}
        </span>
      </div>

      <div class="company-search-kpis">
        <div class="pat-kpi gold">
          <div class="pat-kpi-label">현재보유</div>
          <div class="pat-kpi-value">${Number(summary.current_owned||0)}</div>
          <div class="pat-kpi-note">미등록 후보</div>
        </div>
        <div class="pat-kpi blue">
          <div class="pat-kpi-label">공동보유</div>
          <div class="pat-kpi-value">${Number(summary.jointly_owned||0)}</div>
          <div class="pat-kpi-note">미등록 후보</div>
        </div>
        <div class="pat-kpi orange">
          <div class="pat-kpi-label">권리이전</div>
          <div class="pat-kpi-value">${Number(summary.transferred||0)}</div>
          <div class="pat-kpi-note">미등록 후보</div>
        </div>
        <div class="pat-kpi green">
          <div class="pat-kpi-label">출원중</div>
          <div class="pat-kpi-value">${Number(summary.pending||0)}</div>
          <div class="pat-kpi-note">미등록 후보</div>
        </div>
        <div class="pat-kpi red">
          <div class="pat-kpi-label">검토대상</div>
          <div class="pat-kpi-value">${rows.length}</div>
          <div class="pat-kpi-note">포털 등록 제외</div>
        </div>
      </div>

      <div class="company-search-filters">
        <input
          id="companyResultSearch"
          class="pat-input"
          placeholder="발명의 명칭, 출원번호, 등록번호, 권리자 검색"
        >
        <select id="companyOwnershipFilter" class="pat-select">
          <option value="">전체 소유구분</option>
          <option value="현재보유">현재보유</option>
          <option value="공동보유">공동보유</option>
          <option value="권리이전">권리이전</option>
          <option value="출원중">출원중</option>
          <option value="소멸">소멸</option>
          <option value="거절">거절</option>
          <option value="포기">포기</option>
          <option value="확인필요">확인필요</option>
        </select>
      </div>

      <div id="companySearchTable"></div>

      <div class="company-search-pagination">
        <button
          id="companyPrevPage"
          class="pat-btn secondary"
          type="button"
          ${companySearchPage<=1?'disabled':''}
        >
          이전
        </button>
        <span>${Number(data.page||companySearchPage)} / ${
          Math.max(1,Math.ceil(Number(data.total_count||0)/Number(data.page_size||companySearchPageSize)))
        } 페이지</span>
        <button
          id="companyNextPage"
          class="pat-btn secondary"
          type="button"
          ${data.has_more?'':'disabled'}
        >
          다음
        </button>
      </div>

      ${Array.isArray(data.warnings)&&data.warnings.length?`
        <details class="company-search-warnings">
          <summary>API 확인사항 ${data.warnings.length}건</summary>
          <div>${data.warnings.map(x=>`<div>${P.escapeHtml(x)}</div>`).join('')}</div>
        </details>
      `:''}
    `;
  }

  function renderCompanySearchTable(){
    const target=$('companySearchTable');
    if(!target||!companySearchData)return;

    const allRows=Array.isArray(companySearchData.patents)
      ?companySearchData.patents
      :[];

    const rows=allRows
      .filter(x=>!x.portal_registered)
      .filter(companyPatentMatchesFilter);
    const pageOffset=(companySearchPage-1)*companySearchPageSize;

    target.innerHTML=`
      <div class="pat-card pat-card-pad company-search-table-card">
        <div class="pat-table-wrap">
          <table class="pat-table company-patent-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>상태</th>
                <th>등록번호</th>
                <th>발명의 명칭</th>
                <th>국가</th>
                <th>구분</th>
                <th>출원일</th>
                <th>등록일</th>
                <th>만료예정일</th>
                <th>현재권리자</th>
                <th>소유구분</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length?rows.map((item,index)=>{
                const holders=Array.isArray(item.right_holder_names)
                  ?item.right_holder_names.filter(Boolean)
                  :[];

                const applicants=Array.isArray(item.applicant_names)
                  ?item.applicant_names.filter(Boolean)
                  :[];

                const ownerText=holders.length
                  ?holders
                  :(
                    item.registration_no
                      ?['권리자 확인필요']
                      :applicants.length
                        ?applicants
                        :['-']
                  );

                const warningTitle=Array.isArray(item.warnings)&&item.warnings.length
                  ?` title="${P.escapeHtml(item.warnings.join(' | '))}"`
                  :'';

                return `
                  <tr${item.ownership_status==='권리이전'?' class="company-transferred-row"':''}>
                    <td class="num">${pageOffset+index+1}</td>
                    <td>
                      <span class="company-status-badge ${companyLegalStatusClass(item.legal_status)}">
                        ${P.escapeHtml(item.legal_status||'-')}
                      </span>
                    </td>
                    <td>${P.escapeHtml(item.registration_no||'-')}</td>
                    <td class="company-title-cell">
                      <div class="company-title-main">
                        ${P.escapeHtml(item.invention_title||'-')}
                      </div>
                      <div class="company-title-sub">
                        출원 ${P.escapeHtml(item.application_no||'-')}
                      </div>
                    </td>
                    <td>${P.escapeHtml(countryLabel(item.country_code))}</td>
                    <td>${P.escapeHtml(ipTypeLabel(item.ip_type))}</td>
                    <td>${P.fmtDate(item.application_date)}</td>
                    <td>${P.fmtDate(item.registration_date)}</td>
                    <td>${P.fmtDate(item.expiration_date)}</td>
                    <td class="company-owner-cell"${warningTitle}>
                      ${ownerText.map(x=>`<div>${P.escapeHtml(x)}</div>`).join('')}
                    </td>
                    <td>
                      <span class="company-ownership-badge ${companyOwnershipClass(item.ownership_status)}">
                        ${P.escapeHtml(item.ownership_status||'확인필요')}
                      </span>
                    </td>
                  </tr>
                `;
              }).join(''):`
                <tr>
                  <td colspan="11" class="pat-empty">
                    조건에 맞는 특허가 없습니다.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function searchCompanyPatents(page=1){
    if(!ctx.access.admin){
      P.toast('회사 관리자만 회사특허 조회를 사용할 수 있습니다.','warn');
      return;
    }

    const companyName=currentCompanySearchName();

    if(!companyName){
      P.toast('회사명 또는 출원인명을 입력해 주세요.','warn');
      return;
    }

    companySearchPage=Math.max(1,Number(page)||1);
    companySearchLoading=true;
    renderCompanySearch();

    try{
      const data=await P.invokeKipris({
        action:'search-company',
        company_id:ctx.session.companyId,
        company_name:companyName,
        page:companySearchPage,
        page_size:companySearchPageSize,
        include_registration_detail:true
      });

      applyCompanySearchData(
        data||null,
        {
          cached:false,
          saved:false,
          synced_at:data?.source?.searched_at||new Date().toISOString()
        }
      );

      companySearchPage=Number(data?.page||companySearchPage)||1;
      companySearchPageSize=Number(data?.page_size||companySearchPageSize)||50;

      let saved=false;

      try{
        saved=await saveCompanySearchCachePage(
          companyName,
          data
        );
      }catch(cacheError){
        console.error('[company-search-cache-save]',cacheError);
        P.toast(
          `KIPRIS 조회는 완료됐지만 저장 중 오류가 발생했습니다: ${cacheError.message}`,
          'warn',
          6000
        );
      }

      if(companySearchData?._cache_meta){
        companySearchData._cache_meta.saved=saved;
      }

      const count=Number(data?.returned_count||0);
      const total=Number(data?.total_count||0);

      P.toast(
        saved
          ?`KIPRIS 조회 완료 · ${count}건 표시 / 전체 ${total}건 · 조회결과 저장됨`
          :`KIPRIS 조회 완료 · ${count}건 표시 / 전체 ${total}건`
      );
    }catch(e){
      P.toast(e.message,'error',5200);
    }finally{
      companySearchLoading=false;
      renderCompanySearch();
    }
  }

  function renderSettings(){
    const canAdmin=ctx.access.admin;const s=settings||{};
    $('sectionSettings').innerHTML=`<div class="settings-grid"><div class="settings-stack"><article class="pat-card pat-card-pad"><div class="pat-card-title">일반 설정</div><div class="setting-row"><div class="setting-label">알림 기준 (D-Day)</div><div class="setting-control"><input id="settingAlerts" class="pat-input" value="${P.escapeHtml((s.alert_days_before||[90,30,7]).join(','))}" ${canAdmin?'':'disabled'}></div></div><div class="setting-row"><div class="setting-label">기본 국가</div><div class="setting-control"><input id="settingCountry" class="pat-input" value="${P.escapeHtml(s.default_country_code||'KR')}" ${canAdmin?'':'disabled'}></div></div><div class="setting-row"><div class="setting-label">기본 통화</div><div class="setting-control"><input id="settingCurrency" class="pat-input" value="${P.escapeHtml(s.default_currency||'KRW')}" ${canAdmin?'':'disabled'}></div></div><div class="setting-row"><div class="setting-label">KIPRIS 연동</div><div class="setting-control"><label class="switch-row"><input id="settingKipris" type="checkbox" ${s.kipris_sync_enabled!==false?'checked':''} ${canAdmin?'':'disabled'}> 사용</label></div></div><div class="setting-row"><div class="setting-label">KIPRIS 자동갱신</div><div class="setting-control"><label class="switch-row"><input id="settingAutoSync" type="checkbox" ${s.kipris_auto_sync_enabled?'checked':''} ${canAdmin?'':'disabled'}> 사용</label></div></div>${canAdmin?'<div style="margin-top:10px"><button id="saveSettingsBtn" class="pat-btn primary">설정 저장</button></div>':''}</article><article class="pat-card pat-card-pad"><div class="pat-card-title">KIPRIS API 상태</div><div class="pat-note form-top-gap">API Key는 브라우저나 DB가 아닌 Supabase Edge Function Secret에 보관합니다. 프로그램은 <b>patent-kipris</b> Edge Function을 통해 조회하도록 준비되어 있습니다.</div><div style="margin-top:10px"><button id="testKiprisBtn" class="pat-btn secondary">연동 테스트</button></div></article></div><div class="settings-stack"><article class="pat-card pat-card-pad"><div class="settings-section-head"><div><div class="pat-card-title">특허사무소 관리</div><div class="pat-card-desc">대행납부 및 청구 관리에 사용합니다.</div></div>${canAdmin?'<button id="newAgencyBtn" class="pat-btn primary">＋ 사무소 등록</button>':''}</div><div class="pat-table-wrap"><table class="pat-table agency-table"><thead><tr><th>사무소</th><th>담당자</th><th>연락처</th><th>이메일</th><th>관리</th></tr></thead><tbody>${agencies.length?agencies.map(a=>`<tr><td>${P.escapeHtml(a.agency_name)}</td><td>${P.escapeHtml(a.contact_name||'-')}</td><td>${P.escapeHtml(a.phone||'-')}</td><td>${P.escapeHtml(a.email||'-')}</td><td>${canAdmin?`<button class="pat-btn" data-ag-edit="${a.id}">수정</button>`:'-'}</td></tr>`).join(''):'<tr><td colspan="5" class="pat-empty">등록된 특허사무소가 없습니다.</td></tr>'}</tbody></table></div></article><article class="pat-card pat-card-pad"><div class="pat-card-title">접근 권한</div><div class="pat-card-desc">Portal 특허 권한 기준으로 조회와 운영 권한을 구분합니다.</div><div class="pat-note form-top-gap"><b>일반사용자</b>는 특허현황·특허목록을 조회할 수 있고, <b>특허 운영자</b>는 납부·기한 등 운영기능을 사용할 수 있습니다. <b>회사특허 조회</b>는 회사 관리자에게만 표시됩니다.</div></article></div></div>`;
    $('saveSettingsBtn')?.addEventListener('click',saveSettings);$('testKiprisBtn')?.addEventListener('click',testKipris);$('newAgencyBtn')?.addEventListener('click',()=>openAgencyModal());document.querySelectorAll('[data-ag-edit]').forEach(b=>b.addEventListener('click',()=>openAgencyModal(agencies.find(x=>x.id===b.dataset.agEdit))));
  }
  async function saveSettings(){const alerts=P.val('settingAlerts').split(',').map(x=>Number(x.trim())).filter(x=>Number.isFinite(x)&&x>=0);const payload=P.companyPayload({alert_days_before:alerts.length?alerts:[90,30,7],default_country_code:(P.val('settingCountry')||'KR').toUpperCase(),default_currency:(P.val('settingCurrency')||'KRW').toUpperCase(),kipris_sync_enabled:$('settingKipris').checked,kipris_auto_sync_enabled:$('settingAutoSync').checked,updated_by_employee_no:ctx.session.employeeNo||null});const {error}=await P.state.client.from('pat_settings').upsert(payload,{onConflict:'company_id'});if(error){P.toast(error.message,'error');return;}P.toast('설정을 저장했습니다.');await loadAll();showSection('settings');}
  async function testKipris(){
    const btn=this;
    btn.disabled=true;
    try{
      await P.invokeKipris({
        action:'search-company',
        company_id:ctx.session.companyId,
        company_name:defaultCompanySearchName(),
        page:1,
        page_size:1,
        include_registration_detail:false
      });
      P.toast('KIPRIS Edge Function 연결이 정상입니다.');
    }catch(e){
      P.toast(e.message,'warn',4500);
    }finally{
      btn.disabled=false;
    }
  }
  function clearAgency(){['name','contact_name','phone','email','address','memo'].forEach(k=>P.setVal('agency_'+k,''));}
  function openAgencyModal(a=null){editingAgency=a?.id||null;clearAgency();$('agencyModalTitle').textContent=a?'특허사무소 수정':'특허사무소 등록';if(a){['name','contact_name','phone','email','address','memo'].forEach(k=>P.setVal('agency_'+k,a['agency_'+k]??a[k]??''));P.setVal('agency_name',a.agency_name||'');}P.modalOpen('agencyModal');}
  async function saveAgency(){const name=P.val('agency_name').trim();if(!name){P.toast('사무소명을 입력해 주세요.','warn');return;}const payload=P.companyPayload({agency_name:name,contact_name:P.val('agency_contact_name')||null,phone:P.val('agency_phone')||null,email:P.val('agency_email')||null,address:P.val('agency_address')||null,memo:P.val('agency_memo')||null,is_active:true});let res;if(editingAgency)res=await P.state.client.from('pat_agencies').update(payload).eq('id',editingAgency).eq('company_id',ctx.session.companyId);else res=await P.state.client.from('pat_agencies').insert(payload);if(res.error){P.toast(res.error.message,'error');return;}P.modalClose('agencyModal');P.toast('특허사무소를 저장했습니다.');editingAgency=null;await loadAll();showSection('settings');}

  init().catch(e=>{console.error(e);document.querySelector('.pat-app').innerHTML='<div class="pat-error">'+P.escapeHtml(e.message)+'</div>';});
})();
