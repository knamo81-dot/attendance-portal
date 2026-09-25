(() => {
  "use strict";

  const db = window.SDSApp?.db;
  const $ = (id) => document.getElementById(id);

  const state = {
    view: "today",
    year: 0,
    month: 0,
    selectedDay: 0,
    todayQuery: "",
    monthlyQuery: "",
    substances: [],
    products: [],
    productCas: [],
    receipts: [],
    records: [],
    rows: [],
    dailyTableReady: true,
    saving: false,
    companyId: "",
    userEmail: "",
    userName: "",
    expandedToday: new Set(),
    expandedMonthly: new Set()
  };

  const pad2 = (v) => String(v).padStart(2, "0");
  const localDateString = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const monthKey = (y,m) => `${y}-${pad2(m)}`;
  const monthStart = (y,m) => `${monthKey(y,m)}-01`;
  const daysInMonth = (y,m) => new Date(y,m,0).getDate();
  const monthEnd = (y,m) => `${monthKey(y,m)}-${pad2(daysInMonth(y,m))}`;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const normalizeCas = (v) => String(v || "").trim().replace(/\s+/g, "");
  const numberText = (v) => { const n=Number(v); return Number.isFinite(n) ? String(Math.trunc(n)) : "0"; };
  const currentToday = () => localDateString();
  const dateInSelectedMonth = (day) => `${monthKey(state.year,state.month)}-${pad2(day)}`;

  function sessionInfo(){
    const s = window.SDSApp?.getPortalSession?.() || {};
    const companyId = s.activeCompanyId || s.company_id || s.companyId || s.activeCompany?.id || s.company?.id || window.SDSApp?.getCompanyId?.() || "";
    const email = s.email || s.user?.email || s.employee_email || "";
    const name = s.name || s.employee_name || s.user?.user_metadata?.name || "";
    return { companyId:String(companyId||""), email:String(email||""), name:String(name||"") };
  }

  function setMessage(id,text="",type=""){
    const el=$(id); if(!el)return;
    el.textContent=text;
    el.classList.toggle("error",type==="error");
    el.classList.toggle("success",type==="success");
  }

  function notifyPortal(){
    try{
      window.parent?.postMessage({type:"portal-tabs-ready",tabs:[{id:"qa-storage",label:"특별관리물질 보관"}],source:"qa-storage-mobile"},"*");
      window.parent?.postMessage({type:"portal-tab-active",activeTabId:"qa-storage",tabId:"qa-storage",source:"qa-storage-mobile"},"*");
      window.parent?.postMessage({type:"portal-filters-ready",enabled:false,filters:[],source:"qa-storage-mobile"},"*");
    }catch(_){ }
  }

  function contentText(info){
    const a=info?.content_min,b=info?.content_max;
    const hasA=a!==null&&a!==undefined&&a!==""&&!Number.isNaN(Number(a));
    const hasB=b!==null&&b!==undefined&&b!==""&&!Number.isNaN(Number(b));
    if(hasA&&hasB){const n1=Number(a),n2=Number(b);return n1===n2?`${n1}%`:`${n1}~${n2}%`;}
    if(hasA)return `${Number(a)}% 이상`;
    if(hasB)return `${Number(b)}% 이하`;
    return "";
  }

  function casListOfSubstance(r){
    const list=(r.qa_special_substance_cas||[]).slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||(a.id??0)-(b.id??0)).map(x=>normalizeCas(x.cas_no)).filter(Boolean);
    if(list.length)return list;
    const fallback=normalizeCas(r.cas_no); return fallback?[fallback]:[];
  }

  function specialActiveInMonth(row){
    const start=monthStart(state.year,state.month),end=monthEnd(state.year,state.month);
    if(row.effective_from&&row.effective_from>end)return false;
    if(row.effective_to&&row.effective_to<=start)return false;
    return true;
  }

  function fillPeriodOptions(){
    const now=new Date(), currentYear=now.getFullYear();
    const yearEl=$("yearSelect"),monthEl=$("monthSelect");
    yearEl.innerHTML=""; monthEl.innerHTML="";
    for(let y=currentYear-5;y<=currentYear+2;y++){
      const o=document.createElement("option");o.value=String(y);o.textContent=`${y}년`;yearEl.appendChild(o);
    }
    for(let m=1;m<=12;m++){
      const o=document.createElement("option");o.value=String(m);o.textContent=`${m}월`;monthEl.appendChild(o);
    }
    state.year=currentYear; state.month=now.getMonth()+1; state.selectedDay=now.getDate();
    yearEl.value=String(state.year);monthEl.value=String(state.month);
    $("todayLabel").textContent=`${currentYear}.${pad2(now.getMonth()+1)}.${pad2(now.getDate())}`;
  }

  async function loadBaseData(){
    if(!db)throw new Error("Supabase 연결 정보를 확인할 수 없습니다.");
    const {companyId,email,name}=sessionInfo();
    state.companyId=companyId;state.userEmail=email;state.userName=name;
    if(!companyId)throw new Error("회사 정보를 확인할 수 없습니다.");

    const [{data:subs,error:sErr},{data:products,error:pErr}]=await Promise.all([
      db.from("qa_special_substances")
        .select("id,name_ko,name_en,cas_no,effective_from,effective_to,qa_special_substance_cas(id,cas_no,sort_order)")
        .order("name_ko",{ascending:true}),
      db.from("product_master")
        .select("id,company_id,category,name,maker,code,capacity,grade,cas,is_active")
        .eq("company_id",companyId).eq("category","시약").eq("is_active",true)
    ]);
    if(sErr)throw sErr;if(pErr)throw pErr;
    state.substances=(subs||[]).filter(specialActiveInMonth);
    state.products=products||[];

    const ids=state.products.map(p=>p.id); state.productCas=[];
    for(let i=0;i<ids.length;i+=150){
      const {data,error}=await db.from("product_cas")
        .select("id,product_id,cas_no,content_min,content_max,sort_order")
        .in("product_id",ids.slice(i,i+150)).order("sort_order",{ascending:true}).order("id",{ascending:true});
      if(error)throw error; state.productCas.push(...(data||[]));
    }
  }

  async function loadReceiptsAndRecords(){
    const ids=state.products.map(p=>p.id); state.receipts=[];state.records=[];state.dailyTableReady=true;
    if(!ids.length)return;
    const end=monthEnd(state.year,state.month);
    for(let i=0;i<ids.length;i+=150){
      const part=ids.slice(i,i+150);
      const {data,error}=await db.from("reagent_collect_items")
        .select("id,product_id,collected_qty,receipt_date")
        .eq("company_id",state.companyId).in("product_id",part).not("receipt_date","is",null).lte("receipt_date",end);
      if(error)throw error; state.receipts.push(...(data||[]));

      const {data:daily,error:dErr}=await db.from("qa_special_storage_daily")
        .select("id,company_id,product_id,record_date,quantity,created_by,created_name,created_at,updated_by,updated_name,updated_at")
        .eq("company_id",state.companyId).in("product_id",part).lte("record_date",end).order("record_date",{ascending:true});
      if(dErr){
        const msg=String(dErr.message||"");
        if(/qa_special_storage_daily|relation .* does not exist|schema cache/i.test(msg))state.dailyTableReady=false;
        else throw dErr;
      }else state.records.push(...(daily||[]));
    }
  }

  function buildRows(){
    const subByCas=new Map();
    state.substances.forEach(s=>casListOfSubstance(s).forEach(cas=>{
      if(!subByCas.has(cas))subByCas.set(cas,[]);subByCas.get(cas).push(s);
    }));
    const casByProduct=new Map();
    state.productCas.forEach(c=>{
      const k=String(c.product_id);if(!casByProduct.has(k))casByProduct.set(k,[]);casByProduct.get(k).push(c);
    });
    const receiptsByProduct=new Map();
    state.receipts.forEach(r=>{
      const k=String(r.product_id);if(!receiptsByProduct.has(k))receiptsByProduct.set(k,[]);
      receiptsByProduct.get(k).push({date:r.receipt_date,qty:Math.max(0,Math.trunc(Number(r.collected_qty||0)))});
    });
    receiptsByProduct.forEach(list=>list.sort((a,b)=>String(a.date).localeCompare(String(b.date))));
    const recordsByProduct=new Map();
    state.records.forEach(r=>{
      const k=String(r.product_id);if(!recordsByProduct.has(k))recordsByProduct.set(k,[]);recordsByProduct.get(k).push(r);
    });
    recordsByProduct.forEach(list=>list.sort((a,b)=>String(a.record_date).localeCompare(String(b.record_date))));

    const start=monthStart(state.year,state.month),end=monthEnd(state.year,state.month),today=currentToday();
    const result=[];
    state.products.forEach(p=>{
      let pcas=casByProduct.get(String(p.id))||[];
      if(!pcas.length&&normalizeCas(p.cas))pcas=[{product_id:p.id,cas_no:p.cas,content_min:null,content_max:null,sort_order:1}];
      const matched=[];
      pcas.forEach(ci=>{
        const cas=normalizeCas(ci.cas_no);
        (subByCas.get(cas)||[]).forEach(s=>{
          const key=`${s.id}__${cas}`;
          if(!matched.some(x=>x.key===key))matched.push({key,substance:s,casInfo:ci});
        });
      });
      if(!matched.length)return;

      const receipts=receiptsByProduct.get(String(p.id))||[];
      const records=recordsByProduct.get(String(p.id))||[];
      if(!receipts.length&&!records.length)return;
      const receiptMap=new Map();receipts.forEach(r=>receiptMap.set(r.date,(receiptMap.get(r.date)||0)+r.qty));
      const recordMap=new Map(records.map(r=>[r.record_date,r]));
      const eventDates=[...new Set([...receipts.map(x=>x.date),...records.map(x=>x.record_date)].filter(Boolean))].sort();
      if(!eventDates.length)return;
      let qty=null;
      for(const ds of eventDates){
        if(ds>=start)break;
        const inc=receiptMap.get(ds)||0;
        if(qty===null&&inc>0)qty=0;
        if(qty!==null)qty+=inc;
        if(recordMap.has(ds))qty=Math.max(0,Math.trunc(Number(recordMap.get(ds).quantity||0)));
      }
      const startQty=qty,monthly={};
      const endCursor=end<today?end:today;
      if(start<=endCursor){
        const cursor=new Date(`${start}T00:00:00`),stop=new Date(`${endCursor}T00:00:00`);
        while(cursor<=stop){
          const ds=localDateString(cursor),inc=receiptMap.get(ds)||0;
          if(qty===null&&inc>0)qty=0;
          if(qty!==null)qty+=inc;
          if(recordMap.has(ds))qty=Math.max(0,Math.trunc(Number(recordMap.get(ds).quantity||0)));
          monthly[Number(ds.slice(-2))]=qty;
          cursor.setDate(cursor.getDate()+1);
        }
      }
      const inMonthReceipt=receipts.some(r=>r.date>=start&&r.date<=end);
      const inMonthRecord=records.some(r=>r.record_date>=start&&r.record_date<=end);
      if(!(Number(startQty)>0||inMonthReceipt||inMonthRecord))return;
      const todayRecord=records.find(r=>r.record_date===today)||null;
      result.push({product:p,matched,receipts,records,monthly,todayRecord});
    });
    result.sort((a,b)=>String(a.product.name||"").localeCompare(String(b.product.name||""),"ko")||Number(a.product.id)-Number(b.product.id));
    state.rows=result;
  }

  function searchableText(row){
    const p=row.product;
    const special=row.matched.map(x=>`${x.substance.name_ko||""} ${x.substance.name_en||""} ${x.casInfo.cas_no||""}`).join(" ");
    return `${p.name||""} ${p.maker||""} ${p.code||""} ${p.capacity||""} ${p.grade||""} ${special}`.toLowerCase();
  }

  function specialDetailHtml(row){
    return `<div class="special-detail"><div class="special-title">특별관리물질 정보</div><div class="special-list">${row.matched.map(x=>{
      const content=contentText(x.casInfo);
      return `<div class="special-item"><div class="special-name">${esc(x.substance.name_ko||x.substance.name_en||"-")}</div><div class="special-meta">CAS ${esc(x.casInfo.cas_no||"-")}${content?` · ${esc(content)}`:""}</div></div>`;
    }).join("")}</div></div>`;
  }

  function productInfoHtml(row,expanded,context){
    const p=row.product,meta=[p.maker,p.code,p.capacity,p.grade].filter(Boolean).join(" · ");
    return `<button class="product-toggle" type="button" data-toggle-product="${esc(p.id)}" data-context="${context}"><span class="product-chevron">›</span><span class="product-info"><span class="product-name">${esc(p.name||`제품 #${p.id}`)}</span><span class="product-meta">${esc(meta||"-")}</span></span></button>`;
  }

  function renderToday(){
    const q=state.todayQuery.trim().toLowerCase();
    const rows=state.rows.filter(r=>!q||searchableText(r).includes(q));
    if(!rows.length){$("todayList").innerHTML='<div class="empty-card">현재 보관 대상으로 표시할 제품이 없습니다.</div>';syncSaveButton();return;}
    $("todayList").innerHTML=rows.map(row=>{
      const p=row.product,expanded=state.expandedToday.has(String(p.id));
      const value=row.todayRecord?numberText(row.todayRecord.quantity):"";
      return `<article class="product-card${expanded?" expanded":""}" data-product-card="${esc(p.id)}"><div class="product-main-row">${productInfoHtml(row,expanded,"today")}<div class="qty-cell"><div class="qty-input-wrap"><input class="qty-input" data-qty-product="${esc(p.id)}" type="number" min="0" step="1" inputmode="numeric" value="${esc(value)}"><span class="qty-unit">병</span></div><span class="qty-caption">보관수량</span></div></div>${specialDetailHtml(row)}</article>`;
    }).join("");
    bindProductToggles("todayList");
    document.querySelectorAll("#todayList .qty-input").forEach(input=>input.addEventListener("input",()=>{
      const raw=input.value.trim();
      if(raw!=="")input.value=String(Math.max(0,Math.trunc(Number(raw)||0)));
      input.closest(".product-card")?.classList.add("changed");
      syncSaveButton();
    }));
    syncSaveButton();
  }

  function renderCalendar(){
    $("monthLabel").textContent=`${state.year}년 ${state.month}월`;
    const firstDow=new Date(state.year,state.month-1,1).getDay(),dim=daysInMonth(state.year,state.month),today=currentToday();
    const anyByDay={};
    for(let d=1;d<=dim;d++)anyByDay[d]=state.rows.some(r=>r.monthly[d]!==undefined&&r.monthly[d]!==null);
    let html="";
    for(let i=0;i<firstDow;i++)html+='<span class="calendar-spacer"></span>';
    for(let d=1;d<=dim;d++){
      const date=new Date(state.year,state.month-1,d),dow=date.getDay(),ds=dateInSelectedMonth(d);
      const cls=["calendar-day"];
      if(dow===0)cls.push("sun");if(dow===6)cls.push("sat");if(ds===today)cls.push("today");if(d===state.selectedDay)cls.push("selected");if(anyByDay[d])cls.push("has-data");
      html+=`<button class="${cls.join(" ")}" type="button" data-day="${d}">${d}</button>`;
    }
    $("calendarGrid").innerHTML=html;
    $("calendarGrid").querySelectorAll("[data-day]").forEach(btn=>btn.addEventListener("click",()=>{
      state.selectedDay=Number(btn.dataset.day);renderCalendar();renderMonthlyList();
    }));
  }

  function renderMonthlyList(){
    const dim=daysInMonth(state.year,state.month);
    if(state.selectedDay<1||state.selectedDay>dim)state.selectedDay=1;
    const dateText=`${state.year}년 ${state.month}월 ${state.selectedDay}일 보관현황`;
    $("selectedDateTitle").textContent=dateText;
    const q=state.monthlyQuery.trim().toLowerCase();
    const rows=state.rows.filter(r=>r.monthly[state.selectedDay]!==undefined&&r.monthly[state.selectedDay]!==null).filter(r=>!q||searchableText(r).includes(q));
    if(!rows.length){$("monthlyList").innerHTML='<div class="empty-card">선택한 날짜에 표시할 보관수량이 없습니다.</div>';return;}
    $("monthlyList").innerHTML=rows.map(row=>{
      const p=row.product,expanded=state.expandedMonthly.has(String(p.id)),v=row.monthly[state.selectedDay];
      return `<article class="product-card${expanded?" expanded":""}" data-product-card="${esc(p.id)}"><div class="product-main-row">${productInfoHtml(row,expanded,"monthly")}<div class="qty-cell readonly"><div class="qty-value${Number(v)===0?" zero":""}">${numberText(v)}<span class="qty-unit"> 병</span></div><span class="qty-caption">보관수량</span></div></div>${specialDetailHtml(row)}</article>`;
    }).join("");
    bindProductToggles("monthlyList");
  }

  function bindProductToggles(containerId){
    $(containerId).querySelectorAll("[data-toggle-product]").forEach(btn=>btn.addEventListener("click",()=>{
      const id=String(btn.dataset.toggleProduct),set=btn.dataset.context==="monthly"?state.expandedMonthly:state.expandedToday;
      if(set.has(id))set.delete(id);else set.add(id);
      btn.closest(".product-card")?.classList.toggle("expanded",set.has(id));
    }));
  }

  function syncSaveButton(){
    const btn=$("saveQuantities");
    const editable=state.view==="today"&&state.dailyTableReady&&!state.saving;
    const hasChanged=[...document.querySelectorAll("#todayList .product-card.changed .qty-input")].some(i=>i.value.trim()!=="");
    btn.disabled=!editable||!hasChanged;
  }

  async function saveAll(){
    if(state.saving||state.view!=="today"||!state.dailyTableReady)return;
    const inputs=[...document.querySelectorAll("#todayList .product-card.changed .qty-input")].filter(i=>i.value.trim()!=="");
    if(!inputs.length){setMessage("todayMessage","저장할 수량이 없습니다.");return;}
    const today=currentToday();state.saving=true;syncSaveButton();setMessage("todayMessage",`${inputs.length}개 제품의 보관수량을 저장하는 중입니다.`);
    try{
      for(const input of inputs){
        const productId=Number(input.dataset.qtyProduct),quantity=Math.max(0,Math.trunc(Number(input.value)||0));
        const existing=state.records.find(r=>Number(r.product_id)===productId&&r.record_date===today);
        const payload={company_id:state.companyId,product_id:productId,record_date:today,quantity,updated_by:state.userEmail||null,updated_name:state.userName||null,updated_at:new Date().toISOString()};
        let result;
        if(existing?.id)result=await db.from("qa_special_storage_daily").update(payload).eq("id",existing.id).select("*").single();
        else{payload.created_by=state.userEmail||null;payload.created_name=state.userName||null;result=await db.from("qa_special_storage_daily").insert(payload).select("*").single();}
        if(result.error)throw result.error;
      }
      setMessage("todayMessage",`${inputs.length}개 제품의 오늘 보관수량을 저장했습니다.`,"success");
      await refresh(false);
    }catch(error){console.error(error);setMessage("todayMessage",`수량 저장 실패: ${error?.message||"알 수 없는 오류"}`,"error");}
    finally{state.saving=false;syncSaveButton();}
  }

  async function refresh(showLoading=true){
    const messageId=state.view==="today"?"todayMessage":"monthlyMessage";
    if(showLoading)setMessage(messageId,"특별관리물질 보관 현황을 불러오는 중입니다.");
    try{
      await loadBaseData();await loadReceiptsAndRecords();buildRows();
      if(state.view==="today")renderToday();else{renderCalendar();renderMonthlyList();}
      if(!state.dailyTableReady)setMessage(messageId,"보관수량 저장용 DB 테이블을 확인해 주세요.","error");
      else if(showLoading)setMessage(messageId,"");
    }catch(error){console.error(error);setMessage(messageId,`불러오기 실패: ${error?.message||"알 수 없는 오류"}`,"error");}
  }

  async function switchView(view){
    if(view===state.view)return;
    state.view=view;
    $("todayTab").classList.toggle("active",view==="today");$("monthlyTab").classList.toggle("active",view==="monthly");
    $("todayView").hidden=view!=="today";$("monthlyView").hidden=view!=="monthly";
    const now=new Date();
    if(view==="today"){
      state.year=now.getFullYear();state.month=now.getMonth()+1;
      state.selectedDay=now.getDate();
    }
    $("yearSelect").value=String(state.year);$("monthSelect").value=String(state.month);
    await refresh();
  }

  function shiftMonth(delta){
    let y=state.year,m=state.month+delta;
    if(m<1){m=12;y--;}else if(m>12){m=1;y++;}
    state.year=y;state.month=m;
    const now=new Date(),dim=daysInMonth(y,m);
    state.selectedDay=(y===now.getFullYear()&&m===now.getMonth()+1)?Math.min(now.getDate(),dim):1;
    $("yearSelect").value=String(y);$("monthSelect").value=String(m);
    return refresh();
  }

  function bindEvents(){
    $("todayTab").addEventListener("click",()=>switchView("today"));
    $("monthlyTab").addEventListener("click",()=>switchView("monthly"));
    $("todaySearch").addEventListener("input",()=>{state.todayQuery=$("todaySearch").value;renderToday();});
    $("monthlySearch").addEventListener("input",()=>{state.monthlyQuery=$("monthlySearch").value;renderMonthlyList();});
    $("yearSelect").addEventListener("change",async()=>{state.year=Number($("yearSelect").value);state.selectedDay=1;await refresh();});
    $("monthSelect").addEventListener("change",async()=>{state.month=Number($("monthSelect").value);state.selectedDay=1;await refresh();});
    $("prevMonthBtn").addEventListener("click",()=>shiftMonth(-1));
    $("nextMonthBtn").addEventListener("click",()=>shiftMonth(1));
    $("saveQuantities").addEventListener("click",saveAll);
    window.addEventListener("message",e=>{const p=e?.data||{};if(p.type==="portal-tabs-request"||p.type==="portal-filters-request")notifyPortal();});
  }

  async function init(){
    fillPeriodOptions();bindEvents();notifyPortal();await refresh();
  }

  document.addEventListener("DOMContentLoaded",init);
})();
