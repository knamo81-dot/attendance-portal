(function(){
  'use strict';
  const P=window.PatentCommon;
  const colors={registered:'#22c55e',examining:'#f59e0b',filed:'#3b82f6',extinct:'#ef4444',other:'#94a3b8'};
  const labels={registered:'등록',examining:'심사중',filed:'출원중',extinct:'소멸',other:'기타'};
  let ctx=null;

  function patentDueDate(p){ return p.official_due_date || p.invoice_due_date || p.planned_payment_date || null; }
  function openDueManagement(){ P.navigate('management',{section:'payments'}); }

  async function load(){
    ctx=await P.resolveContext();
    document.getElementById('companyName').textContent=ctx.session.companyName || '현재 회사';
    if(!ctx.access.read){ document.querySelector('.pat-app').innerHTML='<div class="pat-error">특허관리 접근 권한이 없습니다.</div>'; return; }

    const [patRes,payRes,deadRes,eventRes]=await Promise.all([
      P.companyQuery('pat_master','id,invention_title,application_no,registration_no,country_code,ip_type,legal_status,application_date,registration_date,expiration_date,created_at').order('created_at',{ascending:false}),
      P.companyQuery('pat_payments','id,patent_id,payment_type,payment_title,annual_year_from,annual_year_to,official_due_date,invoice_due_date,planned_payment_date,status,paid_amount,billed_amount,currency,paid_date').neq('status','CANCELLED'),
      P.companyQuery('pat_deadlines','id,patent_id,deadline_type,title,due_date,status,related_payment_id').eq('status','OPEN'),
      P.companyQuery('pat_events','id,patent_id,event_date,event_type,title,description').order('event_date',{ascending:false}).limit(8)
    ]);
    [patRes,payRes,deadRes,eventRes].forEach(r=>{ if(r.error) throw r.error; });
    const patents=patRes.data||[], payments=payRes.data||[], deadlines=deadRes.data||[], events=eventRes.data||[];
    const map=Object.fromEntries(patents.map(p=>[p.id,p]));
    renderKpis(patents,payments,deadlines);
    renderStatus(patents);
    renderYears(patents);
    renderDue(payments,deadlines,map);
    renderRecentPatents(patents);
    renderEvents(events,map);
  }

  function renderKpis(patents,payments,deadlines){
    const counts={registered:0,examining:0,filed:0,extinct:0,other:0};
    patents.forEach(x=>counts[P.classifyPatentStatus(x.legal_status)]++);
    const duePayments=payments.filter(x=>!['PAID','CANCELLED'].includes(x.status) && P.daysUntil(patentDueDate(x))!==null && P.daysUntil(patentDueDate(x))<=30);
    const dueDeadlines=deadlines.filter(x=>
      !x.related_payment_id &&
      P.daysUntil(x.due_date)!==null &&
      P.daysUntil(x.due_date)<=30
    );
    const paidThisYear=payments.filter(x=>x.status==='PAID' && String(x.paid_date||'').startsWith(String(new Date().getFullYear()))).reduce((a,b)=>a+Number(b.paid_amount||b.billed_amount||0),0);
    const data=[
      ['전체 특허',patents.length,'총 관리 건수','gold'],['출원중',counts.filed,'현재 출원 상태','blue'],['심사중',counts.examining,'심사 진행 중','orange'],['등록',counts.registered,'권리 보유','green'],['소멸',counts.extinct,'소멸·포기·거절','red'],['납부임박',duePayments.length,'30일 이내','orange'],['기한임박',dueDeadlines.length,'30일 이내 · 올해 지급 '+P.fmtMoney(paidThisYear),'red']
    ];
    document.getElementById('kpis').innerHTML=data.map(x=>`<div class="pat-kpi ${x[3]}"><div class="pat-kpi-label">${x[0]}</div><div class="pat-kpi-value">${x[1]}</div><div class="pat-kpi-note">${x[2]}</div></div>`).join('');
  }

  function renderStatus(patents){
    const counts={registered:0,examining:0,filed:0,extinct:0,other:0}; patents.forEach(x=>counts[P.classifyPatentStatus(x.legal_status)]++);
    const total=Math.max(1,patents.length); let cursor=0; const stops=[];
    Object.keys(counts).forEach(k=>{ const pct=counts[k]/total*100; if(pct>0){stops.push(`${colors[k]} ${cursor}% ${cursor+pct}%`);cursor+=pct;} });
    document.getElementById('statusDonut').style.background=stops.length?`conic-gradient(${stops.join(',')})`:'#e2e8f0';
    document.getElementById('donutTotal').textContent=patents.length;
    document.getElementById('statusLegend').innerHTML=Object.keys(counts).filter(k=>counts[k]>0||k!=='other').map(k=>`<div class="legend-item"><span class="legend-dot" style="background:${colors[k]}"></span><span class="legend-label">${labels[k]}</span><span class="legend-value">${counts[k]}건</span></div>`).join('');
  }

  function renderYears(patents){
    const year=new Date().getFullYear(), years=Array.from({length:6},(_,i)=>year-5+i); const stats={}; years.forEach(y=>stats[y]={filed:0,registered:0});
    patents.forEach(p=>{ const ay=Number(String(p.application_date||'').slice(0,4)), ry=Number(String(p.registration_date||'').slice(0,4)); if(stats[ay])stats[ay].filed++; if(stats[ry])stats[ry].registered++; });
    const max=Math.max(1,...years.flatMap(y=>[stats[y].filed,stats[y].registered]));
    document.getElementById('yearChart').innerHTML=years.map(y=>`<div class="year-col"><div class="year-bars"><div class="year-bar filed" title="출원 ${stats[y].filed}건" style="height:${Math.max(2,stats[y].filed/max*145)}px"><span class="year-bar-value">${stats[y].filed}</span></div><div class="year-bar registered" title="등록 ${stats[y].registered}건" style="height:${Math.max(2,stats[y].registered/max*145)}px"><span class="year-bar-value">${stats[y].registered}</span></div></div><div class="year-label">${y}</div></div>`).join('');
  }

  function renderDue(payments,deadlines,map){
    const items=[];
    payments.filter(x=>!['PAID','CANCELLED'].includes(x.status)).forEach(x=>{ const date=patentDueDate(x); if(!date)return; items.push({kind:'payment',date,title:x.payment_title||P.paymentTypeLabel(x.payment_type),sub:(map[x.patent_id]?.invention_title||'특허')+' · '+P.annualRangeLabel(x.annual_year_from,x.annual_year_to),patentId:x.patent_id}); });
    deadlines
      .filter(x=>!x.related_payment_id)
      .forEach(x=>items.push({
        kind:'deadline',
        date:x.due_date,
        title:x.title||P.deadlineTypeLabel(x.deadline_type),
        sub:map[x.patent_id]?.invention_title||'특허',
        patentId:x.patent_id
      }));
    items.sort((a,b)=>String(a.date).localeCompare(String(b.date))); const near=items.slice(0,6);
    const el=document.getElementById('dueList');
    if(!near.length){el.innerHTML='<div class="pat-empty">예정된 납부·기한 항목이 없습니다.</div>';return;}
    el.innerHTML=near.map(x=>`<div class="due-item" data-kind="${x.kind}"><div class="due-icon ${P.daysUntil(x.date)<=7?'red':''}">${x.kind==='payment'?'₩':'◷'}</div><div><div class="due-title">${P.escapeHtml(x.title)}</div><div class="due-sub">${P.escapeHtml(x.sub)}</div></div><div class="due-date">${P.fmtDate(x.date)}<strong class="pat-dday ${P.ddayClass(x.date)}">${P.dday(x.date)}</strong></div></div>`).join('');
  }

  function renderRecentPatents(patents){
    const rows=[...patents].sort((a,b)=>String(b.registration_date||b.created_at||'').localeCompare(String(a.registration_date||a.created_at||''))).slice(0,6);
    document.getElementById('recentPatentBody').innerHTML=rows.length?rows.map(p=>`<tr class="clickable" data-id="${p.id}"><td>${P.escapeHtml(p.registration_no||p.application_no||'-')}</td><td>${P.escapeHtml(p.invention_title)}</td><td>${P.escapeHtml(p.country_code||'-')}</td><td>${P.fmtDate(p.registration_date)}</td><td>${P.badge(p.legal_status,P.patentStatusLabel(p.legal_status))}</td></tr>`).join(''):'<tr><td colspan="5" class="pat-empty">등록된 특허가 없습니다.</td></tr>';
    document.querySelectorAll('#recentPatentBody tr[data-id]').forEach(tr=>tr.addEventListener('click',()=>P.navigate('list',{patent_id:tr.dataset.id})));
  }

  function renderEvents(events,map){
    const el=document.getElementById('eventList');
    if(!events.length){el.innerHTML='<div class="pat-empty">최근 진행이력이 없습니다.</div>';return;}
    el.innerHTML=events.map(e=>`<div class="event-row"><div class="event-date">${P.fmtDate(e.event_date)}</div><div><div class="event-title">${P.escapeHtml(e.title)}</div><div class="event-patent">${P.escapeHtml(map[e.patent_id]?.invention_title||'-')}</div></div>${P.badge(e.event_type,e.event_type||'이력')}</div>`).join('');
  }

  document.getElementById('refreshBtn').addEventListener('click',()=>load().catch(e=>P.toast(e.message,'error')));
  document.getElementById('goListBtn').addEventListener('click',()=>P.navigate('list'));
  document.getElementById('goManagementBtn').addEventListener('click',openDueManagement);
  load().catch(e=>{ console.error(e); document.querySelector('.pat-app').innerHTML='<div class="pat-error">'+P.escapeHtml(e.message)+'</div>'; });
})();
