(function(){
  'use strict';
  const P=window.PatentCommon;
  let ctx=null, patents=[], payments=[], deadlines=[], agencies=[], employees=[], settings=null, companySearchTerms=[];
  let companySearchTermsTableReady=true;
  let section='payments', editingPayment=null, editingDeadline=null, editingAgency=null, calendarDate=new Date();
  let companySearchData=null, companySearchLoading=false, companySearchCacheLoading=false;
  let companySearchProgress='';
  let companySearchScopeFilter='ALL', companySearchCountryFilter='', companySearchOwnershipFilter='', companySearchTextFilter='';
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
        loadCompanySearchCacheAll({notify:true})
          .catch(e=>P.toast(e.message,'error'));
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
      P.companyQuery('pat_master','id,country_code,invention_title,application_no,registration_no,internal_no,legal_status').eq('is_active',true).order('invention_title'),
      P.companyQuery('pat_payments','*').order('official_due_date',{ascending:true}),
      P.companyQuery('pat_deadlines','*').order('due_date',{ascending:true}),
      P.companyQuery('pat_agencies','*').eq('is_active',true).order('agency_name'),
      P.state.client.from('employees').select('employee_no,name,email').eq('company_id',ctx.session.companyId).order('name')
    ];
    jobs.push(P.companyQuery('pat_settings','*').maybeSingle());
    jobs.push(
      P.companyQuery('pat_company_search_terms','*')
        .order('display_order',{ascending:true})
        .order('created_at',{ascending:true})
    );

    const [p,pay,dead,ag,emp,set,termRes]=await Promise.all(jobs);
    [p,pay,dead,ag].forEach(r=>{if(r.error)throw r.error;});

    patents=p.data||[];
    payments=pay.data||[];
    deadlines=dead.data||[];
    agencies=ag.data||[];
    employees=emp.error?[]:(emp.data||[]);
    settings=set.error?null:set.data;

    if(termRes?.error){
      if(isMissingCompanySearchTermsTable(termRes.error)){
        companySearchTerms=[];
        companySearchTermsTableReady=false;
      }else{
        console.warn('[company-search-terms-load]',termRes.error);
        companySearchTerms=[];
        companySearchTermsTableReady=false;
      }
    }else{
      companySearchTerms=termRes?.data||[];
      companySearchTermsTableReady=true;
    }

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
      loadCompanySearchCacheAll({notify:false})
        .catch(e=>console.warn('[company-search-cache]',e));
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




  const COMPANY_SEARCH_COUNTRIES=[
    ['KR','한국'],
    ['US','미국'],
    ['EP','유럽특허청'],
    ['JP','일본'],
    ['CN','중국'],
    ['WO','PCT'],
    ['RU','러시아'],
    ['CO','콜롬비아']
  ];

  const COMPANY_SEARCH_PAGE_SIZE=100;
  const COMPANY_SEARCH_MAX_PAGES=20;

  function normalizeCompanySearchCountry(value){
    const code=String(value||'KR').trim().toUpperCase();

    if(code==='CP')return 'CN';

    return COMPANY_SEARCH_COUNTRIES.some(([v])=>v===code)
      ?code
      :'KR';
  }

  function countryLabel(value){
    const code=normalizeCompanySearchCountry(value);
    const found=COMPANY_SEARCH_COUNTRIES.find(([v])=>v===code);

    return found
      ?`${found[1]} (${code})`
      :(code||'-');
  }

  function activeCompanySearchTerms(){
    return companySearchTerms
      .filter(item=>item.is_active!==false)
      .filter(item=>String(item.search_term||'').trim())
      .sort((a,b)=>{
        const order=(Number(a.display_order)||0)-(Number(b.display_order)||0);
        if(order!==0)return order;
        return String(a.search_term||'').localeCompare(
          String(b.search_term||''),
          'ko'
        );
      });
  }

  function companySearchTermLanguageLabel(value){
    const code=String(value||'ETC').toUpperCase();

    if(code==='KO')return '국문';
    if(code==='EN')return '영문';
    return '기타';
  }


  async function extractCompanySearchInvokeError(error){
    const fallback=String(
      error?.message||
      error||
      '알 수 없는 오류'
    );

    const context=error?.context||null;

    if(!context){
      return {
        message:fallback,
        status:null,
        detail:null
      };
    }

    try{
      const response=
        typeof context.clone==='function'
          ?context.clone()
          :context;

      const status=
        Number(response?.status)||null;

      const contentType=String(
        response?.headers?.get?.('content-type')||
        ''
      ).toLowerCase();

      let body=null;

      if(
        contentType.includes('application/json')&&
        typeof response?.json==='function'
      ){
        body=await response.json();
      }else if(
        typeof response?.text==='function'
      ){
        const text=await response.text();

        try{
          body=JSON.parse(text);
        }catch(_){
          body=text;
        }
      }

      if(body&&typeof body==='object'){
        const detail=String(
          body.error||
          body.message||
          body.detail||
          body.details||
          ''
        ).trim();

        if(detail){
          return {
            message:detail,
            status,
            detail:
              body.warnings||
              body.hint||
              null
          };
        }
      }

      if(typeof body==='string'&&body.trim()){
        return {
          message:body.trim(),
          status,
          detail:null
        };
      }

      return {
        message:fallback,
        status,
        detail:null
      };
    }catch(_){
      return {
        message:fallback,
        status:Number(context?.status)||null,
        detail:null
      };
    }
  }

  function companySearchErrorHelp(item){
    const country=
      normalizeCompanySearchCountry(
        item?.country_code||
        'KR'
      );

    if(country==='CN'){
      return (
        '중국 특허는 KIPRISPlus에서 중국원문(CP)과 중국 영문초록(CN) 데이터가 나뉘어 제공됩니다. '+
        '이번 실패는 해당 검색명과 중국 조회 조합에서 발생했으며, 다른 검색명·국가의 정상 조회 결과에는 영향을 주지 않습니다.'
      );
    }

    return (
      '해당 검색명·국가 조합만 조회에 실패했습니다. '+
      '다른 정상 조회 결과는 그대로 반영됩니다.'
    );
  }

  function ensureCompanySearchErrorModal(){
    let backdrop=
      document.getElementById(
        'companySearchErrorModal'
      );

    if(backdrop)return backdrop;

    backdrop=document.createElement('div');
    backdrop.id='companySearchErrorModal';
    backdrop.className=
      'company-error-modal-backdrop hidden';

    backdrop.innerHTML=`
      <div
        class="company-error-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="companySearchErrorModalTitle"
      >
        <div class="company-error-modal-head">
          <div>
            <div
              id="companySearchErrorModalTitle"
              class="company-error-modal-title"
            >
              일부 조회 실패
            </div>
            <div class="company-error-modal-desc">
              전체조회는 계속 진행되며, 실패한 검색 조합만 아래에 표시합니다.
            </div>
          </div>

          <button
            type="button"
            class="company-error-modal-close"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div
          id="companySearchErrorModalBody"
          class="company-error-modal-body"
        ></div>

        <div class="company-error-modal-actions">
          <button
            type="button"
            class="pat-btn primary company-error-modal-ok"
          >
            확인
          </button>
        </div>
      </div>
    `;

    const close=()=>{
      backdrop.classList.add('hidden');
    };

    backdrop
      .querySelector(
        '.company-error-modal-close'
      )
      ?.addEventListener(
        'click',
        close
      );

    backdrop
      .querySelector(
        '.company-error-modal-ok'
      )
      ?.addEventListener(
        'click',
        close
      );

    backdrop.addEventListener(
      'click',
      event=>{
        if(event.target===backdrop){
          close();
        }
      }
    );

    document.body.appendChild(
      backdrop
    );

    return backdrop;
  }

  function showCompanySearchErrorModal(errors){
    if(
      !Array.isArray(errors)||
      !errors.length
    )return;

    const backdrop=
      ensureCompanySearchErrorModal();

    const body=
      backdrop.querySelector(
        '#companySearchErrorModalBody'
      );

    if(!body)return;

    body.innerHTML=`
      <div class="company-error-modal-summary">
        실패 <b>${errors.length}건</b>
        · 정상 조회 결과는 그대로 저장·표시됩니다.
      </div>

      <div class="company-error-list">
        ${errors.map((item,index)=>`
          <article class="company-error-item">
            <div class="company-error-item-head">
              <span class="company-error-index">
                ${index+1}
              </span>

              <strong>
                ${P.escapeHtml(item.search_name||'-')}
              </strong>

              <span class="company-error-country">
                ${P.escapeHtml(
                  countryLabel(
                    item.country_code
                  )
                )}
              </span>
            </div>

            <div class="company-error-message">
              ${P.escapeHtml(
                item.message||
                '조회에 실패했습니다.'
              )}
            </div>

            ${item.status?`
              <div class="company-error-status">
                HTTP ${P.escapeHtml(String(item.status))}
              </div>
            `:''}

            <div class="company-error-help">
              ${P.escapeHtml(
                companySearchErrorHelp(item)
              )}
            </div>
          </article>
        `).join('')}
      </div>
    `;

    backdrop.classList.remove(
      'hidden'
    );
  }

  function companySearchCacheKey(value){
    const source=String(value||'');

    try{
      return source
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/\s+/g,'');
    }catch(_){
      return source
        .trim()
        .toLowerCase()
        .replace(/\s+/g,'');
    }
  }

  function patentNumberKey(value){
    const source=String(value||'');

    try{
      return source
        .normalize('NFKC')
        .replace(/[^0-9A-Za-z]/g,'')
        .toUpperCase();
    }catch(_){
      return source
        .replace(/[^0-9A-Za-z]/g,'')
        .toUpperCase();
    }
  }

  function portalPatentKey(country,value){
    const number=patentNumberKey(value);
    if(!number)return '';

    return `${normalizeCompanySearchCountry(country)}::${number}`;
  }

  function companyPatentDedupeKey(item,index=0){
    const country=normalizeCompanySearchCountry(item?.country_code||'KR');
    const app=patentNumberKey(item?.application_no);
    const reg=patentNumberKey(item?.registration_no);

    if(app)return `${country}::APP::${app}`;
    if(reg)return `${country}::REG::${reg}`;

    // 번호가 없는 자료는 잘못 합치지 않도록 별도 건으로 유지
    return `${country}::UNKEYED::${index}::${String(item?.invention_title||'')}`;
  }

  function normalizePatentArray(value){
    if(!value)return [];
    if(Array.isArray(value))return value.filter(Boolean);

    if(typeof value==='string'){
      return value
        .split(/[,\n;|]/)
        .map(x=>x.trim())
        .filter(Boolean);
    }

    return [];
  }

  function unionArray(...values){
    return [
      ...new Set(
        values
          .flatMap(value=>normalizePatentArray(value))
          .map(value=>String(value||'').trim())
          .filter(Boolean)
      )
    ];
  }

  function ownershipRank(value){
    const map={
      '현재보유':7,
      '공동보유':6,
      '출원중':5,
      '확인필요':4,
      '권리이전':3,
      '거절':2,
      '포기':1,
      '소멸':0
    };

    return map[value]??4;
  }

  function richerText(a,b){
    const aa=String(a||'').trim();
    const bb=String(b||'').trim();

    if(!aa)return b??null;
    if(!bb)return a??null;

    return bb.length>aa.length?b:a;
  }

  function mergeCompanyPatent(existing,incoming){
    if(!existing)return {
      ...incoming,
      matched_search_terms:unionArray(
        incoming.matched_search_terms
      )
    };

    const ownership=
      ownershipRank(incoming.ownership_status)>
      ownershipRank(existing.ownership_status)
        ?incoming.ownership_status
        :existing.ownership_status;

    return {
      ...existing,
      ...Object.fromEntries(
        Object.entries(incoming).filter(([,value])=>{
          if(value===null||value===undefined||value==='')return false;
          if(Array.isArray(value)&&!value.length)return false;
          return true;
        })
      ),

      invention_title:richerText(
        existing.invention_title,
        incoming.invention_title
      ),

      abstract_text:richerText(
        existing.abstract_text,
        incoming.abstract_text
      ),

      applicant_names:unionArray(
        existing.applicant_names,
        incoming.applicant_names
      ),

      right_holder_names:unionArray(
        existing.right_holder_names,
        incoming.right_holder_names
      ),

      agent_names:unionArray(
        existing.agent_names,
        incoming.agent_names
      ),

      ipc_codes:unionArray(
        existing.ipc_codes,
        incoming.ipc_codes
      ),

      cpc_codes:unionArray(
        existing.cpc_codes,
        incoming.cpc_codes
      ),

      inventors:unionArray(
        existing.inventors,
        incoming.inventors
      ),

      warnings:unionArray(
        existing.warnings,
        incoming.warnings
      ),

      current_owner_matches:unionArray(
        existing.current_owner_matches,
        incoming.current_owner_matches
      ),

      matched_search_terms:unionArray(
        existing.matched_search_terms,
        incoming.matched_search_terms
      ),

      ownership_status:ownership,

      portal_registered:
        !!existing.portal_registered||
        !!incoming.portal_registered,

      portal_patent_id:
        existing.portal_patent_id||
        incoming.portal_patent_id||
        null
    };
  }

  function refreshPortalRegistrationFlags(data){
    if(!data||!Array.isArray(data.patents))return data;

    const byApplication=new Map();
    const byRegistration=new Map();

    patents.forEach(patent=>{
      const country=normalizeCompanySearchCountry(
        patent.country_code||'KR'
      );

      const appKey=portalPatentKey(
        country,
        patent.application_no
      );

      const regKey=portalPatentKey(
        country,
        patent.registration_no
      );

      if(appKey)byApplication.set(appKey,patent);
      if(regKey)byRegistration.set(regKey,patent);
    });

    data.patents=data.patents.map(item=>{
      const country=normalizeCompanySearchCountry(
        item.country_code||'KR'
      );

      const appKey=portalPatentKey(
        country,
        item.application_no
      );

      const regKey=portalPatentKey(
        country,
        item.registration_no
      );

      const existing=
        (appKey?byApplication.get(appKey):null)||
        (regKey?byRegistration.get(regKey):null)||
        null;

      return {
        ...item,
        country_code:country,
        portal_registered:!!existing,
        portal_patent_id:existing?.id||null
      };
    });

    return data;
  }

  function isMissingCompanySearchCacheTable(error){
    const text=String(error?.message||'').toLowerCase();

    return (
      error?.code==='42P01'||
      (
        text.includes('pat_company_search_cache')&&
        text.includes('does not exist')
      )
    );
  }

  function isMissingCompanySearchTermsTable(error){
    const text=String(error?.message||'').toLowerCase();

    return (
      error?.code==='42P01'||
      (
        text.includes('pat_company_search_terms')&&
        text.includes('does not exist')
      )
    );
  }

  function cloneCompanySearchResponse(data){
    const copy=JSON.parse(JSON.stringify(data||{}));
    delete copy._cache_meta;
    return copy;
  }

  function buildCompanySearchAggregate(cacheRows,meta={}){
    const map=new Map();
    let seq=0;
    let newestSync=null;
    const queryRuns=[];

    for(const row of cacheRows||[]){
      const response=row?.response_json||{};
      const searchName=String(
        row?.search_name||
        response?.company_name||
        ''
      ).trim();

      const country=normalizeCompanySearchCountry(
        row?.country_code||
        response?.country_code||
        'KR'
      );

      const syncAt=
        row?.synced_at||
        response?.source?.searched_at||
        null;

      if(syncAt&&(!newestSync||syncAt>newestSync)){
        newestSync=syncAt;
      }

      queryRuns.push({
        search_name:searchName,
        country_code:country,
        page:Number(row?.page||response?.page||1)||1,
        total_count:Number(row?.total_count||response?.total_count||0)||0,
        returned_count:Number(row?.returned_count||response?.returned_count||0)||0,
        synced_at:syncAt
      });

      const patentRows=Array.isArray(response?.patents)
        ?response.patents
        :[];

      for(const raw of patentRows){
        const item={
          ...raw,
          country_code:normalizeCompanySearchCountry(
            raw?.country_code||country
          ),
          matched_search_terms:unionArray(
            raw?.matched_search_terms,
            searchName
          )
        };

        const key=companyPatentDedupeKey(item,seq++);
        map.set(
          key,
          mergeCompanyPatent(
            map.get(key),
            item
          )
        );
      }
    }

    const patents=[...map.values()];

    patents.sort((a,b)=>{
      const ad=String(a.application_date||'');
      const bd=String(b.application_date||'');

      if(ad!==bd)return bd.localeCompare(ad);

      const ar=String(a.registration_date||'');
      const br=String(b.registration_date||'');

      if(ar!==br)return br.localeCompare(ar);

      return String(a.invention_title||'')
        .localeCompare(
          String(b.invention_title||''),
          'ko'
        );
    });

    const data=refreshPortalRegistrationFlags({
      patents,
      query_runs:queryRuns,
      searched_terms:activeCompanySearchTerms().map(item=>({
        id:item.id,
        search_term:item.search_term,
        language_code:item.language_code,
        is_active:item.is_active
      })),
      searched_countries:COMPANY_SEARCH_COUNTRIES.map(([code])=>code),
      source:{
        provider:'KIPRISPlus',
        mode:'integrated-company-search',
        searched_at:newestSync
      },
      _cache_meta:{
        cached:meta.cached!==false,
        refreshed:!!meta.refreshed,
        synced_at:newestSync,
        errors:meta.errors||[]
      }
    });

    companySearchData=data;
    return data;
  }

  async function loadCompanySearchCacheAll(options={}){
    if(!ctx?.access?.admin)return false;
    if(companySearchCacheLoading)return false;

    const terms=activeCompanySearchTerms();

    if(!terms.length){
      companySearchData=null;
      renderCompanySearch();

      if(options.notify){
        P.toast(
          '설정 > 회사특허 검색명에서 검색명을 먼저 등록해 주세요.',
          'warn'
        );
      }

      return false;
    }

    companySearchCacheLoading=true;

    try{
      const keys=new Set(
        terms.map(item=>companySearchCacheKey(item.search_term))
      );

      const countries=COMPANY_SEARCH_COUNTRIES.map(([code])=>code);

      const {data,error}=await P.state.client
        .from('pat_company_search_cache')
        .select(
          'search_name_key,search_name,country_code,page,page_size,total_count,returned_count,has_more,response_json,synced_at'
        )
        .eq('company_id',ctx.session.companyId)
        .in('country_code',countries)
        .order('synced_at',{ascending:false});

      if(error){
        if(isMissingCompanySearchCacheTable(error)){
          if(options.notify){
            P.toast(
              '회사특허 조회 캐시 테이블이 없습니다. 포함된 SQL을 먼저 실행해 주세요.',
              'warn',
              5200
            );
          }
          return false;
        }

        throw error;
      }

      const relevant=(data||[]).filter(
        row=>keys.has(String(row.search_name_key||''))
      );

      if(!relevant.length){
        companySearchData=null;
        renderCompanySearch();

        if(options.notify){
          P.toast(
            '저장된 통합 조회자료가 없습니다. 전체 새로조회를 실행해 주세요.',
            'warn'
          );
        }

        return false;
      }

      buildCompanySearchAggregate(
        relevant,
        {
          cached:true,
          refreshed:false
        }
      );

      renderCompanySearch();

      if(options.notify){
        P.toast(
          `저장자료 ${companySearchData?.patents?.length||0}건을 통합해서 불러왔습니다.`
        );
      }

      return true;
    }finally{
      companySearchCacheLoading=false;
    }
  }

  async function saveCompanySearchCachePage(companyName,data){
    if(!ctx?.access?.admin||!data)return false;

    const name=String(
      companyName||
      data.company_name||
      ''
    ).trim();

    if(!name)return false;

    const payload={
      company_id:ctx.session.companyId,
      search_name_key:companySearchCacheKey(name),
      search_name:name,
      country_code:normalizeCompanySearchCountry(
        data.country_code||'KR'
      ),
      page:Math.max(1,Number(data.page||1)||1),
      page_size:Math.max(
        1,
        Number(data.page_size||COMPANY_SEARCH_PAGE_SIZE)||COMPANY_SEARCH_PAGE_SIZE
      ),
      total_count:Math.max(0,Number(data.total_count||0)||0),
      returned_count:Math.max(0,Number(data.returned_count||0)||0),
      has_more:!!data.has_more,
      response_json:cloneCompanySearchResponse(data),
      synced_at:
        data?.source?.searched_at||
        new Date().toISOString(),
      synced_by_employee_no:
        ctx.session.employeeNo||null
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
        throw new Error(
          '회사특허 조회 캐시 테이블이 없습니다. 포함된 SQL을 먼저 실행해 주세요.'
        );
      }

      throw error;
    }

    return true;
  }

  async function clearCompanySearchCacheSeries(searchName,country){
    const {error}=await P.state.client
      .from('pat_company_search_cache')
      .delete()
      .eq('company_id',ctx.session.companyId)
      .eq('search_name_key',companySearchCacheKey(searchName))
      .eq('country_code',normalizeCompanySearchCountry(country));

    if(error&&!isMissingCompanySearchCacheTable(error)){
      throw error;
    }
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

  function normalizeSearchText(value){
    return String(value??'').trim().toLowerCase();
  }

  function unregisteredCompanySearchRows(){
    const rows=Array.isArray(companySearchData?.patents)
      ?companySearchData.patents
      :[];

    return rows.filter(item=>!item.portal_registered);
  }

  function companySearchCountryStats(){
    const stats=new Map();

    for(const item of unregisteredCompanySearchRows()){
      const code=normalizeCompanySearchCountry(item.country_code);
      stats.set(code,(stats.get(code)||0)+1);
    }

    return [...stats.entries()]
      .sort((a,b)=>{
        const ai=COMPANY_SEARCH_COUNTRIES.findIndex(([code])=>code===a[0]);
        const bi=COMPANY_SEARCH_COUNTRIES.findIndex(([code])=>code===b[0]);
        return ai-bi;
      });
  }

  function companyPatentMatchesFilter(item){
    if(item.portal_registered)return false;

    const country=normalizeCompanySearchCountry(item.country_code);

    if(
      companySearchScopeFilter==='KR'&&
      country!=='KR'
    )return false;

    if(
      companySearchScopeFilter==='FOREIGN'&&
      country==='KR'
    )return false;

    if(
      companySearchCountryFilter&&
      country!==companySearchCountryFilter
    )return false;

    if(
      companySearchOwnershipFilter&&
      item.ownership_status!==companySearchOwnershipFilter
    )return false;

    const search=normalizeSearchText(companySearchTextFilter);

    if(!search)return true;

    return [
      item.invention_title,
      item.application_no,
      item.registration_no,
      ...(Array.isArray(item.applicant_names)?item.applicant_names:[]),
      ...(Array.isArray(item.right_holder_names)?item.right_holder_names:[]),
      ...(Array.isArray(item.matched_search_terms)?item.matched_search_terms:[])
    ]
      .join(' ')
      .toLowerCase()
      .includes(search);
  }

  function renderCompanySearch(){
    const root=$('sectionCompanySearch');
    if(!root)return;

    if(!ctx.access.admin){
      root.innerHTML=
        '<div class="pat-error">회사 관리자만 회사특허 조회를 사용할 수 있습니다.</div>';
      return;
    }

    const terms=activeCompanySearchTerms();

    if(companySearchLoading){
      root.innerHTML=`
        <article class="pat-card pat-card-pad company-search-loading">
          <div class="pat-loading">
            KIPRIS 국내·해외 회사특허를 통합 조회하고 있습니다...
          </div>
          <div class="company-search-progress">
            ${P.escapeHtml(companySearchProgress||'조회 준비 중')}
          </div>
          <div class="pat-note company-search-loading-note">
            검색명 × 국가별로 순차 조회하여 API 부하를 줄이고,
            결과는 DB 캐시에 저장합니다.
          </div>
        </article>
      `;
      return;
    }

    root.innerHTML=`
      <div class="company-search-head">
        <div>
          <div class="pat-card-title">회사특허 조회</div>
          <div class="pat-card-desc">
            설정에 등록한 회사 검색명으로 국내와 지원 해외국가를 한 번에 조회합니다.
            동일 특허는 국가 + 출원번호(우선), 등록번호 기준으로 중복 제거합니다.
          </div>
        </div>
        <div class="company-search-head-actions">
          <button id="goCompanySearchSettingsBtn" class="pat-btn secondary" type="button">
            검색명 설정
          </button>
        </div>
      </div>


      <div class="company-search-query integrated">
        <div class="company-search-supported">
          <span class="company-search-supported-label">조회 범위</span>
          <span>
            ${COMPANY_SEARCH_COUNTRIES
              .map(([code,label])=>`${label}(${code})`)
              .join(' · ')}
          </span>
        </div>

        <div class="company-search-actions">
          <button
            id="companyCacheLoadBtn"
            class="pat-btn secondary"
            type="button"
            ${terms.length?'':'disabled'}
          >
            저장자료 불러오기
          </button>

          <button
            id="companySearchBtn"
            class="pat-btn primary"
            type="button"
            ${terms.length?'':'disabled'}
          >
            전체 새로조회
          </button>
        </div>
      </div>


      ${!companySearchTermsTableReady?`
        <div class="pat-warning company-search-sql-warning">
          회사특허 검색명 테이블이 없습니다. 이번 패키지의 SQL을 먼저 실행해 주세요.
        </div>
      `:''}

      ${companySearchData
        ?renderCompanySearchResults(companySearchData)
        :`
          <article class="pat-card pat-card-pad company-search-empty-card">
            <div class="pat-empty">
              ${terms.length
                ?'저장된 조회자료가 없으면 <b>전체 새로조회</b>를 눌러주세요.'
                :'먼저 <b>설정 → 회사특허 검색명</b>에서 국문/영문 검색명을 등록해 주세요.'
              }
            </div>
          </article>
        `
      }
    `;

    $('companySearchBtn')?.addEventListener(
      'click',
      searchCompanyPatentsAll
    );

    $('companyCacheLoadBtn')?.addEventListener(
      'click',
      ()=>loadCompanySearchCacheAll({notify:true})
    );

    $('goCompanySearchSettingsBtn')?.addEventListener(
      'click',
      ()=>showSection('settings')
    );

    if(companySearchData){
      const search=$('companyResultSearch');
      if(search)search.value=companySearchTextFilter;

      const scope=$('companyScopeFilter');
      if(scope)scope.value=companySearchScopeFilter;

      const country=$('companyCountryFilter');
      if(country)country.value=companySearchCountryFilter;

      const ownership=$('companyOwnershipFilter');
      if(ownership)ownership.value=companySearchOwnershipFilter;

      $('companySearchErrorBtn')?.addEventListener(
        'click',
        ()=>showCompanySearchErrorModal(
          companySearchData?._cache_meta?.errors||[]
        )
      );

      search?.addEventListener('input',event=>{
        companySearchTextFilter=event.target.value||'';
        renderCompanySearchTable();
      });

      scope?.addEventListener('change',event=>{
        companySearchScopeFilter=event.target.value||'ALL';

        if(
          companySearchCountryFilter&&
          (
            (companySearchScopeFilter==='KR'&&companySearchCountryFilter!=='KR')||
            (companySearchScopeFilter==='FOREIGN'&&companySearchCountryFilter==='KR')
          )
        ){
          companySearchCountryFilter='';
          if(country)country.value='';
        }

        renderCompanySearchTable();
      });

      country?.addEventListener('change',event=>{
        companySearchCountryFilter=event.target.value||'';
        renderCompanySearchTable();
      });

      ownership?.addEventListener('change',event=>{
        companySearchOwnershipFilter=event.target.value||'';
        renderCompanySearchTable();
      });

      renderCompanySearchTable();
    }
  }

  function renderCompanySearchResults(data){
    const rows=unregisteredCompanySearchRows();
    const countryStats=companySearchCountryStats();

    const domesticCount=rows.filter(
      item=>normalizeCompanySearchCountry(item.country_code)==='KR'
    ).length;

    const foreignCount=rows.length-domesticCount;


    const cacheMeta=data._cache_meta||{};
    const syncAt=cacheMeta.synced_at||data?.source?.searched_at||null;

    const syncText=syncAt
      ?new Date(syncAt).toLocaleString('ko-KR')
      :'-';

    return `
      <div class="company-search-summary-note">
        <span>
          통합 검토대상 <b>${rows.length.toLocaleString('ko-KR')}건</b>
          · 국내 <b>${domesticCount.toLocaleString('ko-KR')}</b>
          · 해외 <b>${foreignCount.toLocaleString('ko-KR')}</b>
          · 검색국가 <b>${countryStats.length}</b>
        </span>
        <span class="company-cache-info">
          ${Array.isArray(cacheMeta.errors)&&cacheMeta.errors.length?`
            <button
              id="companySearchErrorBtn"
              type="button"
              class="company-error-view-btn"
            >
              오류 ${cacheMeta.errors.length}건 보기
            </button>
          `:''}

          <span class="company-cache-badge ${cacheMeta.refreshed?'fresh':'cached'}">
            ${cacheMeta.refreshed?'API 통합조회':'저장자료'}
          </span>

          마지막 API 조회 ${P.escapeHtml(syncText)}
        </span>
      </div>



      <div class="company-search-filters integrated">
        <select id="companyScopeFilter" class="pat-select">
          <option value="ALL">전체 · ${rows.length}건</option>
          <option value="KR">국내 · ${domesticCount}건</option>
          <option value="FOREIGN">해외 · ${foreignCount}건</option>
        </select>

        <select id="companyCountryFilter" class="pat-select">
          <option value="">전체 국가</option>
          ${countryStats.map(([code,count])=>`
            <option value="${P.escapeHtml(code)}">
              ${P.escapeHtml(countryLabel(code))} · ${count}건
            </option>
          `).join('')}
        </select>

        <select id="companyOwnershipFilter" class="pat-select">
          <option value="">전체 소유구분</option>
          <option value="현재보유">현재보유</option>
          <option value="공동보유">공동보유</option>
          <option value="출원중">출원중</option>
          <option value="권리이전">권리이전</option>
          <option value="거절">거절</option>
          <option value="포기">포기</option>
          <option value="소멸">소멸</option>
          <option value="확인필요">확인필요</option>
        </select>

        <input
          id="companyResultSearch"
          class="pat-input"
          placeholder="발명의 명칭 · 번호 · 권리자 · 검색명"
        >
      </div>

      <div id="companySearchTable"></div>
    `;
  }

  function inventorNamesFromPatent(patent){
    return normalizePatentArray(patent?.inventors)
      .map(item=>(
        typeof item==='string'
          ?item
          :(item?.name||item?.inventor_name||'')
      ))
      .map(name=>String(name||'').trim())
      .filter(Boolean);
  }

  async function findExistingPatentForCompanyItem(item){
    const appNo=String(item?.application_no||'').trim();
    const regNo=String(item?.registration_no||'').trim();
    const country=normalizeCompanySearchCountry(
      item?.country_code||'KR'
    );

    if(appNo){
      const {data,error}=await P.state.client
        .from('pat_master')
        .select(
          'id,country_code,invention_title,application_no,registration_no,legal_status'
        )
        .eq('company_id',ctx.session.companyId)
        .eq('country_code',country)
        .eq('application_no',appNo)
        .limit(1)
        .maybeSingle();

      if(error)throw error;
      if(data)return data;
    }

    if(regNo){
      const {data,error}=await P.state.client
        .from('pat_master')
        .select(
          'id,country_code,invention_title,application_no,registration_no,legal_status'
        )
        .eq('company_id',ctx.session.companyId)
        .eq('country_code',country)
        .eq('registration_no',regNo)
        .limit(1)
        .maybeSingle();

      if(error)throw error;
      if(data)return data;
    }

    return null;
  }

  function markCompanyPatentRegistered(item,row){
    if(row&&!patents.some(p=>p.id===row.id)){
      patents.push(row);
    }

    if(companySearchData){
      refreshPortalRegistrationFlags(companySearchData);
    }

    renderCompanySearch();
  }

  async function registerCompanyPatent(item,button){
    if(!ctx.access.admin||!item)return;

    const originalText=button?.textContent||'목록등록';

    if(button){
      button.disabled=true;
      button.textContent='등록중...';
    }

    try{
      const existing=
        await findExistingPatentForCompanyItem(item);

      if(existing){
        markCompanyPatentRegistered(item,existing);
        P.toast(
          '이미 특허목록에 등록된 특허입니다.',
          'warn'
        );
        return;
      }

      let lookupPatent=null;
      let lookupRaw=null;

      const lookupNumber=String(
        item.application_no||
        item.registration_no||
        item.literature_no||
        ''
      ).trim();

      if(lookupNumber){
        try{
          const itemCountry=
            normalizeCompanySearchCountry(
              item.country_code||'KR'
            );

          const detail=await P.invokeKipris({
            action:
              itemCountry==='KR'
                ?'lookup'
                :'lookup-foreign',
            number:lookupNumber,
            literature_no:item.literature_no||null,
            country_code:itemCountry,
            company_id:ctx.session.companyId
          });

          lookupPatent=
            detail?.patent||
            detail?.data||
            null;

          lookupRaw=
            lookupPatent||
            detail||
            null;
        }catch(error){
          console.warn(
            '[company-search-register] KIPRIS 상세조회 실패, 저장된 조회자료로 등록합니다.',
            error
          );
        }
      }

      const source={
        ...item,
        ...(lookupPatent||{})
      };

      const inventionTitle=String(
        source.invention_title||
        item.invention_title||
        ''
      ).trim();

      if(!inventionTitle){
        throw new Error(
          '발명의 명칭이 없어 특허목록에 등록할 수 없습니다.'
        );
      }

      const now=new Date().toISOString();

      const payload=P.companyPayload({
        internal_no:null,
        ip_type:source.ip_type||'PATENT',
        country_code:normalizeCompanySearchCountry(
          source.country_code||item.country_code||'KR'
        ),

        invention_title:inventionTitle,

        application_no:source.application_no||null,
        application_date:source.application_date||null,
        publication_no:source.publication_no||null,
        publication_date:source.publication_date||null,

        registration_no:source.registration_no||null,
        registration_date:source.registration_date||null,

        legal_status:source.legal_status||null,
        legal_status_detail:source.legal_status_detail||null,
        expiration_date:source.expiration_date||null,

        applicant_names:normalizePatentArray(
          source.applicant_names
        ),

        right_holder_names:normalizePatentArray(
          source.right_holder_names?.length
            ?source.right_holder_names
            :item.right_holder_names
        ),

        agent_names:normalizePatentArray(
          source.agent_names
        ),

        ipc_codes:normalizePatentArray(
          source.ipc_codes
        ),

        cpc_codes:normalizePatentArray(
          source.cpc_codes
        ),

        abstract_text:source.abstract_text||null,
        public_notice_url:source.public_notice_url||null,
        registration_notice_url:source.registration_notice_url||null,
        representative_image_url:source.representative_image_url||null,

        kipris_last_synced_at:now,
        kipris_raw:lookupRaw||item,

        division_code:null,
        manager_employee_no:null,
        related_project:null,
        related_product_technology:null,
        memo:null,

        is_active:true,
        created_by_employee_no:
          ctx.session.employeeNo||null,
        updated_by_employee_no:
          ctx.session.employeeNo||null
      });

      const {data:row,error}=await P.state.client
        .from('pat_master')
        .insert(payload)
        .select()
        .single();

      if(error)throw error;

      const inventorNames=
        inventorNamesFromPatent(source);

      if(inventorNames.length){
        const {error:inventorError}=await P.state.client
          .from('pat_inventors')
          .insert(
            inventorNames.map(
              (name,index)=>P.companyPayload({
                patent_id:row.id,
                inventor_name:name,
                display_order:index+1,
                source:'KIPRIS'
              })
            )
          );

        if(inventorError){
          console.warn(
            '[company-search-register] 발명자 저장 실패',
            inventorError
          );

          P.toast(
            '특허는 등록됐지만 발명자 정보 저장 중 오류가 있었습니다.',
            'warn',
            4800
          );
        }
      }

      markCompanyPatentRegistered(item,row);

      P.toast(
        '특허목록에 등록했습니다. 회사특허 조회 목록에서는 자동 제외됩니다.'
      );
    }catch(error){
      const message=String(
        error?.message||
        error
      );

      if(
        message.includes('uq_pat_master_company_application_no')||
        message.includes('uq_pat_master_company_registration_no')||
        message.toLowerCase().includes('duplicate key')
      ){
        const existing=
          await findExistingPatentForCompanyItem(item)
            .catch(()=>null);

        if(existing){
          markCompanyPatentRegistered(
            item,
            existing
          );
        }

        P.toast(
          '이미 특허목록에 등록된 특허입니다.',
          'warn'
        );
        return;
      }

      P.toast(
        message,
        'error',
        5600
      );
    }finally{
      if(
        button&&
        document.body.contains(button)
      ){
        button.disabled=false;
        button.textContent=originalText;
      }
    }
  }

  function renderCompanySearchTable(){
    const target=$('companySearchTable');
    if(!target||!companySearchData)return;

    const rows=unregisteredCompanySearchRows()
      .filter(companyPatentMatchesFilter);

    target.innerHTML=`
      <div class="pat-card pat-card-pad company-search-table-card">
        <div class="company-search-table-head">
          <span>
            현재 필터 <b>${rows.length.toLocaleString('ko-KR')}건</b>
          </span>
        </div>

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
                <th>목록등록</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length
                ?rows.map((item,index)=>{
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

                  const warningTitle=
                    Array.isArray(item.warnings)&&item.warnings.length
                      ?` title="${P.escapeHtml(item.warnings.join(' | '))}"`
                      :'';

                  const matchedTerms=unionArray(
                    item.matched_search_terms
                  );

                  return `
                    <tr${item.ownership_status==='권리이전'?' class="company-transferred-row"':''}>
                      <td class="num">${index+1}</td>

                      <td>
                        <span class="company-status-badge ${companyLegalStatusClass(item.legal_status)}">
                          ${P.escapeHtml(item.legal_status||'-')}
                        </span>
                      </td>

                      <td>
                        ${P.escapeHtml(item.registration_no||'-')}
                      </td>

                      <td class="company-title-cell">
                        <div
                          class="company-title-main"
                          title="${P.escapeHtml(item.invention_title||'-')}"
                        >
                          ${P.escapeHtml(item.invention_title||'-')}
                        </div>

                        <div class="company-title-sub">
                          출원 ${P.escapeHtml(item.application_no||'-')}
                        </div>

                        ${matchedTerms.length?`
                          <div class="company-title-search-term">
                            검색명 ${P.escapeHtml(matchedTerms.join(' · '))}
                          </div>
                        `:''}
                      </td>

                      <td>
                        ${P.escapeHtml(countryLabel(item.country_code))}
                      </td>

                      <td>
                        ${P.escapeHtml(ipTypeLabel(item.ip_type))}
                      </td>

                      <td>${P.fmtDate(item.application_date)}</td>
                      <td>${P.fmtDate(item.registration_date)}</td>
                      <td>${P.fmtDate(item.expiration_date)}</td>

                      <td class="company-owner-cell"${warningTitle}>
                        ${ownerText
                          .map(x=>`<div>${P.escapeHtml(x)}</div>`)
                          .join('')}
                      </td>

                      <td>
                        <span class="company-ownership-badge ${companyOwnershipClass(item.ownership_status)}">
                          ${P.escapeHtml(item.ownership_status||'확인필요')}
                        </span>
                      </td>

                      <td class="company-register-cell">
                        <button
                          type="button"
                          class="pat-btn primary company-register-btn"
                          data-company-register-index="${index}"
                        >
                          목록등록
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')
                :`
                  <tr>
                    <td colspan="12" class="pat-empty">
                      조건에 맞는 특허가 없습니다.
                    </td>
                  </tr>
                `
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    target
      .querySelectorAll('[data-company-register-index]')
      .forEach(button=>{
        button.addEventListener(
          'click',
          ()=>{
            if(!ctx.access.admin)return;

            const index=Number(
              button.dataset.companyRegisterIndex
            );

            const item=rows[index];

            if(!item){
              P.toast(
                '선택한 특허 정보를 찾을 수 없습니다.',
                'warn'
              );
              return;
            }

            registerCompanyPatent(
              item,
              button
            );
          }
        );
      });
  }

  async function searchCompanyPatentsAll(){
    if(!ctx.access.admin){
      P.toast(
        '회사 관리자만 회사특허 조회를 사용할 수 있습니다.',
        'warn'
      );
      return;
    }

    const terms=activeCompanySearchTerms();

    if(!companySearchTermsTableReady){
      P.toast(
        '회사특허 검색명 테이블이 없습니다. 포함된 SQL을 먼저 실행해 주세요.',
        'warn'
      );
      return;
    }

    if(!terms.length){
      P.toast(
        '설정 > 회사특허 검색명에서 검색명을 먼저 등록해 주세요.',
        'warn'
      );
      return;
    }

    companySearchLoading=true;
    companySearchProgress='조회 준비 중';
    renderCompanySearch();

    const countries=
      COMPANY_SEARCH_COUNTRIES.map(([code])=>code);

    const totalBaseJobs=
      terms.length*countries.length;

    let completedBaseJobs=0;
    const freshCacheRows=[];
    const errors=[];

    try{
      for(const term of terms){
        const searchName=
          String(term.search_term||'').trim();

        for(const country of countries){
          completedBaseJobs+=1;

          let page=1;
          let cleared=false;

          while(page<=COMPANY_SEARCH_MAX_PAGES){
            companySearchProgress=
              `${completedBaseJobs}/${totalBaseJobs} · `+
              `${searchName} · ${countryLabel(country)} · ${page}페이지`;

            renderCompanySearch();

            let data;

            try{
              data=await P.invokeKipris({
                action:'search-company',
                company_id:ctx.session.companyId,
                company_name:searchName,
                country_code:country,
                page,
                page_size:COMPANY_SEARCH_PAGE_SIZE,
                include_registration_detail:country==='KR'
              });
            }catch(error){
              const failure=
                await extractCompanySearchInvokeError(
                  error
                );

              errors.push({
                search_name:searchName,
                country_code:country,
                page,
                message:failure.message,
                status:failure.status,
                detail:failure.detail
              });

              break;
            }

            if(!cleared){
              try{
                await clearCompanySearchCacheSeries(
                  searchName,
                  country
                );
              }catch(error){
                errors.push({
                  search_name:searchName,
                  country_code:country,
                  page,
                  message:`캐시 정리 실패: ${String(error?.message||error)}`
                });
              }

              cleared=true;
            }

            try{
              await saveCompanySearchCachePage(
                searchName,
                data
              );
            }catch(error){
              errors.push({
                search_name:searchName,
                country_code:country,
                page,
                message:`캐시 저장 실패: ${String(error?.message||error)}`
              });
            }

            freshCacheRows.push({
              search_name_key:companySearchCacheKey(searchName),
              search_name:searchName,
              country_code:country,
              page:Number(data?.page||page)||page,
              page_size:Number(data?.page_size||COMPANY_SEARCH_PAGE_SIZE)||COMPANY_SEARCH_PAGE_SIZE,
              total_count:Number(data?.total_count||0)||0,
              returned_count:Number(data?.returned_count||0)||0,
              has_more:!!data?.has_more,
              response_json:data,
              synced_at:
                data?.source?.searched_at||
                new Date().toISOString()
            });

            if(!data?.has_more)break;

            page+=1;
          }

          if(page>COMPANY_SEARCH_MAX_PAGES){
            errors.push({
              search_name:searchName,
              country_code:country,
              page,
              message:`최대 ${COMPANY_SEARCH_MAX_PAGES}페이지까지 조회했습니다.`
            });
          }
        }
      }

      buildCompanySearchAggregate(
        freshCacheRows,
        {
          cached:false,
          refreshed:true,
          errors
        }
      );

      const count=
        unregisteredCompanySearchRows().length;

      if(errors.length){
        P.toast(
          `전체조회 완료 · ${count}건 통합 · 일부 조회 ${errors.length}건 확인 필요`,
          'warn',
          4200
        );

        setTimeout(
          ()=>showCompanySearchErrorModal(
            errors
          ),
          80
        );
      }else{
        P.toast(
          `전체조회 완료 · ${count}건 통합`
        );
      }
    }finally{
      companySearchLoading=false;
      companySearchProgress='';
      renderCompanySearch();
    }
  }

  async function reloadCompanySearchTerms(){
    const {data,error}=await P.companyQuery(
      'pat_company_search_terms',
      '*'
    )
      .order('display_order',{ascending:true})
      .order('created_at',{ascending:true});

    if(error){
      if(isMissingCompanySearchTermsTable(error)){
        companySearchTerms=[];
        companySearchTermsTableReady=false;
        return;
      }

      throw error;
    }

    companySearchTerms=data||[];
    companySearchTermsTableReady=true;
  }

  async function addCompanySearchTerm(){
    if(!ctx.access.admin)return;

    const term=String(
      P.val('newCompanySearchTerm')||''
    ).trim();

    const language=String(
      P.val('newCompanySearchLanguage')||
      'ETC'
    ).toUpperCase();

    if(!term){
      P.toast(
        '검색명을 입력해 주세요.',
        'warn'
      );
      return;
    }

    const key=companySearchCacheKey(term);

    if(!key){
      P.toast(
        '유효한 검색명을 입력해 주세요.',
        'warn'
      );
      return;
    }

    const payload=P.companyPayload({
      search_term:term,
      search_term_key:key,
      language_code:['KO','EN','ETC'].includes(language)
        ?language
        :'ETC',
      is_active:true,
      display_order:
        companySearchTerms.length+1,
      created_by_employee_no:
        ctx.session.employeeNo||null,
      updated_by_employee_no:
        ctx.session.employeeNo||null,
      updated_at:new Date().toISOString()
    });

    const {error}=await P.state.client
      .from('pat_company_search_terms')
      .insert(payload);

    if(error){
      if(
        error?.code==='23505'||
        String(error.message||'')
          .toLowerCase()
          .includes('duplicate')
      ){
        P.toast(
          '같은 검색명이 이미 등록되어 있습니다.',
          'warn'
        );
        return;
      }

      P.toast(
        error.message,
        'error'
      );
      return;
    }

    await reloadCompanySearchTerms();
    companySearchData=null;
    renderSettings();

    P.toast(
      '회사특허 검색명을 추가했습니다.'
    );
  }

  async function saveCompanySearchTerm(id){
    if(!ctx.access.admin)return;

    const current=companySearchTerms.find(
      item=>item.id===id
    );

    if(!current)return;

    const safeId=String(id).replace(/[^A-Za-z0-9_-]/g,'_');

    const term=String(
      $(`companyTermText_${safeId}`)?.value||
      ''
    ).trim();

    const language=String(
      $(`companyTermLang_${safeId}`)?.value||
      'ETC'
    ).toUpperCase();

    const active=
      !!$(`companyTermActive_${safeId}`)?.checked;

    if(!term){
      P.toast(
        '검색명을 입력해 주세요.',
        'warn'
      );
      return;
    }

    const newKey=
      companySearchCacheKey(term);

    const oldKey=
      companySearchCacheKey(
        current.search_term
      );

    const {error}=await P.state.client
      .from('pat_company_search_terms')
      .update({
        search_term:term,
        search_term_key:newKey,
        language_code:
          ['KO','EN','ETC'].includes(language)
            ?language
            :'ETC',
        is_active:active,
        updated_by_employee_no:
          ctx.session.employeeNo||null,
        updated_at:
          new Date().toISOString()
      })
      .eq('id',id)
      .eq('company_id',ctx.session.companyId);

    if(error){
      if(
        error?.code==='23505'||
        String(error.message||'')
          .toLowerCase()
          .includes('duplicate')
      ){
        P.toast(
          '같은 검색명이 이미 등록되어 있습니다.',
          'warn'
        );
        return;
      }

      P.toast(
        error.message,
        'error'
      );
      return;
    }

    if(oldKey!==newKey){
      await P.state.client
        .from('pat_company_search_cache')
        .delete()
        .eq('company_id',ctx.session.companyId)
        .eq('search_name_key',oldKey)
        .then(()=>{})
        .catch(()=>{});
    }

    await reloadCompanySearchTerms();
    companySearchData=null;
    renderSettings();

    P.toast(
      '회사특허 검색명을 저장했습니다.'
    );
  }

  async function deleteCompanySearchTerm(id){
    if(!ctx.access.admin)return;

    const current=companySearchTerms.find(
      item=>item.id===id
    );

    if(!current)return;

    if(
      !window.confirm(
        `"${current.search_term}" 검색명을 삭제할까요?`
      )
    )return;

    const key=
      companySearchCacheKey(
        current.search_term
      );

    const {error}=await P.state.client
      .from('pat_company_search_terms')
      .delete()
      .eq('id',id)
      .eq('company_id',ctx.session.companyId);

    if(error){
      P.toast(
        error.message,
        'error'
      );
      return;
    }

    await P.state.client
      .from('pat_company_search_cache')
      .delete()
      .eq('company_id',ctx.session.companyId)
      .eq('search_name_key',key)
      .then(()=>{})
      .catch(()=>{});

    await reloadCompanySearchTerms();
    companySearchData=null;
    renderSettings();

    P.toast(
      '회사특허 검색명을 삭제했습니다.'
    );
  }

  function renderCompanySearchTermSettings(canAdmin){
    const rows=companySearchTerms;

    if(!companySearchTermsTableReady){
      return `
        <article class="pat-card pat-card-pad">
          <div class="pat-card-title">회사특허 검색명</div>
          <div class="pat-warning form-top-gap">
            검색명 테이블이 없습니다. 이번 패키지의 SQL을 먼저 실행해 주세요.
          </div>
        </article>
      `;
    }

    return `
      <article class="pat-card pat-card-pad">
        <div class="settings-section-head">
          <div>
            <div class="pat-card-title">회사특허 검색명</div>
            <div class="pat-card-desc">
              회사특허 전체조회에서 사용할 국문·영문·기타 명칭입니다.
              활성 검색명은 국내와 지원 해외국가에 모두 적용됩니다.
            </div>
          </div>
        </div>

        <div class="company-term-settings-list">
          ${rows.length
            ?rows.map((item,index)=>{
              const safeId=String(item.id).replace(/[^A-Za-z0-9_-]/g,'_');

              return `
                <div class="company-term-settings-row">
                  <div class="company-term-order">
                    ${index+1}
                  </div>

                  <select
                    id="companyTermLang_${safeId}"
                    class="pat-select"
                    ${canAdmin?'':'disabled'}
                  >
                    <option value="KO" ${item.language_code==='KO'?'selected':''}>국문</option>
                    <option value="EN" ${item.language_code==='EN'?'selected':''}>영문</option>
                    <option value="ETC" ${!['KO','EN'].includes(item.language_code)?'selected':''}>기타</option>
                  </select>

                  <input
                    id="companyTermText_${safeId}"
                    class="pat-input"
                    value="${P.escapeHtml(item.search_term||'')}"
                    ${canAdmin?'':'disabled'}
                  >

                  <label class="company-term-active">
                    <input
                      id="companyTermActive_${safeId}"
                      type="checkbox"
                      ${item.is_active!==false?'checked':''}
                      ${canAdmin?'':'disabled'}
                    >
                    사용
                  </label>

                  ${canAdmin?`
                    <div class="company-term-row-actions">
                      <button
                        class="pat-btn secondary"
                        data-company-term-save="${P.escapeHtml(item.id)}"
                        type="button"
                      >
                        저장
                      </button>

                      <button
                        class="pat-btn danger"
                        data-company-term-delete="${P.escapeHtml(item.id)}"
                        type="button"
                      >
                        삭제
                      </button>
                    </div>
                  `:''}
                </div>
              `;
            }).join('')
            :`
              <div class="pat-empty company-term-empty">
                등록된 검색명이 없습니다.
              </div>
            `
          }
        </div>

        ${canAdmin?`
          <div class="company-term-add-row">
            <select id="newCompanySearchLanguage" class="pat-select">
              <option value="KO">국문</option>
              <option value="EN">영문</option>
              <option value="ETC">기타</option>
            </select>

            <input
              id="newCompanySearchTerm"
              class="pat-input"
              placeholder="예: 삼천당제약 / SAMCHUNDANG PHARMACEUTICAL"
              value="${rows.length?'':P.escapeHtml(String(ctx?.session?.companyName||''))}"
            >

            <button
              id="addCompanySearchTermBtn"
              class="pat-btn primary"
              type="button"
            >
              ＋ 검색명 추가
            </button>
          </div>
        `:''}

        <div class="pat-note form-top-gap">
          같은 특허가 여러 검색명에서 조회되면
          <b>국가 + 출원번호</b>를 우선 기준으로 1건으로 합치고,
          출원번호가 없으면 <b>국가 + 등록번호</b>를 사용합니다.
        </div>
      </article>
    `;
  }

  function renderSettings(){
    const canAdmin=ctx.access.admin;
    const s=settings||{};

    $('sectionSettings').innerHTML=`
      <div class="settings-grid">
        <div class="settings-stack">
          <article class="pat-card pat-card-pad">
            <div class="pat-card-title">일반 설정</div>

            <div class="setting-row">
              <div class="setting-label">알림 기준 (D-Day)</div>
              <div class="setting-control">
                <input
                  id="settingAlerts"
                  class="pat-input"
                  value="${P.escapeHtml((s.alert_days_before||[90,30,7]).join(','))}"
                  ${canAdmin?'':'disabled'}
                >
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-label">기본 국가</div>
              <div class="setting-control">
                <input
                  id="settingCountry"
                  class="pat-input"
                  value="${P.escapeHtml(s.default_country_code||'KR')}"
                  ${canAdmin?'':'disabled'}
                >
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-label">기본 통화</div>
              <div class="setting-control">
                <input
                  id="settingCurrency"
                  class="pat-input"
                  value="${P.escapeHtml(s.default_currency||'KRW')}"
                  ${canAdmin?'':'disabled'}
                >
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-label">KIPRIS 연동</div>
              <div class="setting-control">
                <label class="switch-row">
                  <input
                    id="settingKipris"
                    type="checkbox"
                    ${s.kipris_sync_enabled!==false?'checked':''}
                    ${canAdmin?'':'disabled'}
                  >
                  사용
                </label>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-label">KIPRIS 자동갱신</div>
              <div class="setting-control">
                <label class="switch-row">
                  <input
                    id="settingAutoSync"
                    type="checkbox"
                    ${s.kipris_auto_sync_enabled?'checked':''}
                    ${canAdmin?'':'disabled'}
                  >
                  사용
                </label>
              </div>
            </div>

            ${canAdmin?`
              <div style="margin-top:10px">
                <button id="saveSettingsBtn" class="pat-btn primary">
                  설정 저장
                </button>
              </div>
            `:''}
          </article>

          ${renderCompanySearchTermSettings(canAdmin)}

        </div>

        <div class="settings-stack">
          <article class="pat-card pat-card-pad">
            <div class="settings-section-head">
              <div>
                <div class="pat-card-title">특허사무소 관리</div>
                <div class="pat-card-desc">
                  대행납부 및 청구 관리에 사용합니다.
                </div>
              </div>

              ${canAdmin?`
                <button id="newAgencyBtn" class="pat-btn primary">
                  ＋ 사무소 등록
                </button>
              `:''}
            </div>

            <div class="pat-table-wrap">
              <table class="pat-table agency-table">
                <thead>
                  <tr>
                    <th>사무소</th>
                    <th>담당자</th>
                    <th>연락처</th>
                    <th>이메일</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  ${agencies.length
                    ?agencies.map(a=>`
                      <tr>
                        <td>${P.escapeHtml(a.agency_name)}</td>
                        <td>${P.escapeHtml(a.contact_name||'-')}</td>
                        <td>${P.escapeHtml(a.phone||'-')}</td>
                        <td>${P.escapeHtml(a.email||'-')}</td>
                        <td>
                          ${canAdmin
                            ?`<button class="pat-btn" data-ag-edit="${a.id}">수정</button>`
                            :'-'
                          }
                        </td>
                      </tr>
                    `).join('')
                    :`
                      <tr>
                        <td colspan="5" class="pat-empty">
                          등록된 특허사무소가 없습니다.
                        </td>
                      </tr>
                    `
                  }
                </tbody>
              </table>
            </div>
          </article>

        </div>
      </div>
    `;

    $('saveSettingsBtn')?.addEventListener(
      'click',
      saveSettings
    );

    $('newAgencyBtn')?.addEventListener(
      'click',
      ()=>openAgencyModal()
    );

    $('addCompanySearchTermBtn')?.addEventListener(
      'click',
      addCompanySearchTerm
    );

    document
      .querySelectorAll('[data-company-term-save]')
      .forEach(button=>{
        button.addEventListener(
          'click',
          ()=>saveCompanySearchTerm(
            button.dataset.companyTermSave
          )
        );
      });

    document
      .querySelectorAll('[data-company-term-delete]')
      .forEach(button=>{
        button.addEventListener(
          'click',
          ()=>deleteCompanySearchTerm(
            button.dataset.companyTermDelete
          )
        );
      });

    document
      .querySelectorAll('[data-ag-edit]')
      .forEach(button=>{
        button.addEventListener(
          'click',
          ()=>openAgencyModal(
            agencies.find(
              item=>item.id===button.dataset.agEdit
            )
          )
        );
      });
  }

  async function saveSettings(){const alerts=P.val('settingAlerts').split(',').map(x=>Number(x.trim())).filter(x=>Number.isFinite(x)&&x>=0);const payload=P.companyPayload({alert_days_before:alerts.length?alerts:[90,30,7],default_country_code:(P.val('settingCountry')||'KR').toUpperCase(),default_currency:(P.val('settingCurrency')||'KRW').toUpperCase(),kipris_sync_enabled:$('settingKipris').checked,kipris_auto_sync_enabled:$('settingAutoSync').checked,updated_by_employee_no:ctx.session.employeeNo||null});const {error}=await P.state.client.from('pat_settings').upsert(payload,{onConflict:'company_id'});if(error){P.toast(error.message,'error');return;}P.toast('설정을 저장했습니다.');await loadAll();showSection('settings');}
  async function testKipris(){
    const btn=this;
    btn.disabled=true;
    try{
      const firstTerm=
        activeCompanySearchTerms()[0]?.search_term||
        String(ctx?.session?.companyName||'').trim();

      if(!firstTerm){
        throw new Error(
          '회사특허 검색명을 먼저 등록해 주세요.'
        );
      }

      await P.invokeKipris({
        action:'search-company',
        company_id:ctx.session.companyId,
        company_name:firstTerm,
        country_code:'KR',
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

/* =========================================================
   Mobile dedicated UI enhancer
   - Long tables are converted to card layout on mobile.
   ========================================================= */
(() => {
  const MOBILE_QUERY = '(max-width: 768px)';
  const mq = window.matchMedia(MOBILE_QUERY);

  function cleanLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function enhanceTable(table) {
    if (!table || table.dataset.mobileEnhanced === '1') {
      // Rows can be replaced dynamically, so re-apply labels even when table is already marked.
    }

    const headers = Array.from(table.querySelectorAll('thead th'))
      .map(th => cleanLabel(th.textContent));

    if (!headers.length) return;

    table.classList.add('mobile-card-table');
    table.dataset.mobileEnhanced = '1';

    table.querySelectorAll('tbody tr').forEach(row => {
      const cells = Array.from(row.children).filter(el => el.tagName === 'TD');
      if (!cells.length) return;

      if (cells.length === 1 && Number(cells[0].getAttribute('colspan') || 1) > 1) {
        row.classList.add('mobile-empty-row');
        cells[0].removeAttribute('data-mobile-label');
        return;
      }

      row.classList.remove('mobile-empty-row');
      cells.forEach((cell, index) => {
        const label = headers[index] || '';
        if (label) cell.setAttribute('data-mobile-label', label);
        else cell.removeAttribute('data-mobile-label');
      });
    });
  }

  function scanTables() {
    document.querySelectorAll('.pat-table').forEach(enhanceTable);
  }

  function syncMobileClass() {
    document.body.classList.toggle('pat-mobile-view', mq.matches);
    scanTables();
  }

  const observer = new MutationObserver(() => {
    if (mq.matches) scanTables();
  });

  function init() {
    syncMobileClass();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', syncMobileClass);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(syncMobileClass);
  }
})();
