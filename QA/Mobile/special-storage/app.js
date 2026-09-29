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
    expandedMonthly: new Set(),
    usageYear: 0,
    usageMonth: 0,
    usageQuery: "",
    usageRows: [],
    usageLoaded: false,
    expandedUsage: new Set(),
    canManage: false
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
      window.parent?.postMessage({type:"portal-tabs-ready",tabs:[{id:"qa-storage",label:"특별관리물질 현황"}],source:"qa-storage-mobile"},"*");
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

    const usageYearEl=$("usageYearSelect"), usageMonthEl=$("usageMonthSelect");
    usageYearEl.innerHTML=yearEl.innerHTML;
    usageMonthEl.innerHTML=monthEl.innerHTML;
    state.usageYear=currentYear; state.usageMonth=now.getMonth()+1;
    usageYearEl.value=String(state.usageYear); usageMonthEl.value=String(state.usageMonth);

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
      // product_master에서 이미 현재 회사의 product_id만 추렸으므로,
      // 기존 입고이력의 company_id 누락 여부와 관계없이 product_id 기준으로 조회합니다.
      const {data,error}=await db.from("reagent_collect_items")
        .select("id,product_id,collected_qty,receipt_date")
        .in("product_id",part).not("receipt_date","is",null).lte("receipt_date",end);
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
      const disabled=state.canManage?"":"disabled";
      return `<article class="product-card${expanded?" expanded":""}" data-product-card="${esc(p.id)}"><div class="product-main-row">${productInfoHtml(row,expanded,"today")}<div class="qty-cell${state.canManage?"":" readonly"}"><div class="qty-input-wrap"><input class="qty-input" data-qty-product="${esc(p.id)}" type="number" min="0" step="1" inputmode="numeric" value="${esc(value)}" ${disabled}><span class="qty-unit">병</span></div><span class="qty-caption">보관수량</span></div></div>${specialDetailHtml(row)}</article>`;
    }).join("");
    bindProductToggles("todayList");
    document.querySelectorAll("#todayList .qty-input:not(:disabled)").forEach(input=>input.addEventListener("input",()=>{
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
    const editable=state.view==="today"&&state.dailyTableReady&&!state.saving&&state.canManage;
    const hasChanged=[...document.querySelectorAll("#todayList .product-card.changed .qty-input")].some(i=>i.value.trim()!=="");
    btn.disabled=!editable||!hasChanged;
  }

  async function saveAll(){
    if(!state.canManage){setMessage("todayMessage","조회 전용 사용자입니다. 보관수량 입력·수정은 QA 운영자만 가능합니다.","error");return;}
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


  const PPE_LABELS = {
    lab_coat:"실험복",
    protective_gloves:"보호장갑",
    safety_glasses:"보안경",
    dust_mask:"방진마스크",
    gas_mask:"방독마스크",
    combined_mask:"방진·방독 겸용마스크",
    supplied_air:"송기마스크 / 공기호흡기",
    other:"기타"
  };

  function formatUsageTime(value){
    if(value===null||value===undefined||value==="") return "-";
    const raw=String(value).trim();
    if(/^\d+(?:\.\d+)?$/.test(raw)){
      const n=Number(raw);
      return Number.isFinite(n)&&n>0?`${Number(n.toFixed(2))}시간`:"-";
    }
    const parts=raw.split(":").map(Number);
    if(!Number.isFinite(parts[0])) return "-";
    const hours=(parts[0]||0)+(parts[1]||0)/60+(parts[2]||0)/3600;
    if(!hours) return "-";
    return `${Number(hours.toFixed(2))}시간`;
  }

  function ppeText(row){
    const values=Array.isArray(row?.ppe)?row.ppe:[];
    const labels=values.map(code=>{
      if(code==="other"&&row?.ppe_other) return `기타(${row.ppe_other})`;
      return PPE_LABELS[code]||code;
    }).filter(Boolean);
    return labels.length?labels.join(" · "):"-";
  }

  async function fetchInChunks(table,select,column,values,extraBuilder=null){
    const result=[];
    const list=[...new Set((values||[]).filter(v=>v!==null&&v!==undefined&&v!==""))];
    for(let i=0;i<list.length;i+=200){
      let q=db.from(table).select(select).in(column,list.slice(i,i+200));
      if(typeof extraBuilder==="function")q=extraBuilder(q);
      const {data,error}=await q;
      if(error)throw error;
      result.push(...(data||[]));
    }
    return result;
  }

  function usagePeriodRange(){
    return {start:monthStart(state.usageYear,state.usageMonth),end:monthEnd(state.usageYear,state.usageMonth)};
  }

  function usageSetMessage(text="",type=""){
    setMessage("usageMessage",text,type);
  }

  async function loadUsageLog(showLoading=true){
    if(!db)return;
    if(!state.companyId){
      const info=sessionInfo();
      state.companyId=info.companyId;state.userEmail=info.email;state.userName=info.name;
    }
    if(!state.companyId){usageSetMessage("회사 정보를 확인할 수 없습니다.","error");return;}
    const {start,end}=usagePeriodRange();
    if(showLoading)usageSetMessage("특별관리물질 사용일지를 불러오는 중입니다.");
    try{
      const baseResult=await db.from("qa_reagent_usage_records")
        .select("id,company_id,employee_no,employee_name,employee_email,product_id,usage_date,usage_time,quantity_type,quantity,unit,created_at")
        .eq("company_id",state.companyId)
        .gte("usage_date",start)
        .lte("usage_date",end)
        .order("usage_date",{ascending:true})
        .order("id",{ascending:true});
      if(baseResult.error)throw baseResult.error;
      const baseRows=baseResult.data||[];
      if(!baseRows.length){state.usageRows=[];state.usageLoaded=true;renderUsageLog();usageSetMessage("");return;}

      const usageIds=baseRows.map(r=>r.id);
      const specialRows=await fetchInChunks(
        "qa_special_substance_usage_records",
        "id,usage_record_id,company_id,journal_no,work_content,ppe,ppe_other,accident_occurred,damage_detail,action_detail,created_by,created_at,updated_at",
        "usage_record_id",
        usageIds,
        q=>q.eq("company_id",state.companyId)
      );
      if(!specialRows.length){state.usageRows=[];state.usageLoaded=true;renderUsageLog();usageSetMessage("");return;}

      const specialIds=specialRows.map(r=>r.id);
      const itemRows=await fetchInChunks(
        "qa_special_substance_usage_items",
        "id,special_usage_id,substance_id,substance_name_snapshot,cas_no_snapshot,percent_snapshot,created_at",
        "special_usage_id",
        specialIds
      );

      const productIds=[...new Set(baseRows.map(r=>r.product_id).filter(Boolean))];
      const products=productIds.length?await fetchInChunks(
        "product_master",
        "id,name,maker,code,capacity,grade",
        "id",
        productIds
      ):[];

      const usageById=new Map(baseRows.map(r=>[Number(r.id),r]));
      const productById=new Map(products.map(p=>[Number(p.id),p]));
      const itemsBySpecial=new Map();
      itemRows.forEach(item=>{
        const key=Number(item.special_usage_id);
        if(!itemsBySpecial.has(key))itemsBySpecial.set(key,[]);
        itemsBySpecial.get(key).push(item);
      });
      itemsBySpecial.forEach(list=>list.sort((a,b)=>Number(a.id)-Number(b.id)));

      const rows=[];
      specialRows.forEach(sr=>{
        const usage=usageById.get(Number(sr.usage_record_id));
        if(!usage)return;
        const product=productById.get(Number(usage.product_id))||null;
        const items=itemsBySpecial.get(Number(sr.id))||[];
        items.forEach(item=>rows.push({
          journal_no:Number(sr.journal_no),
          item_id:Number(item.id),
          special_usage_id:Number(sr.id),
          usage_record_id:Number(usage.id),
          usage_date:usage.usage_date,
          usage_time:usage.usage_time,
          employee_no:usage.employee_no||"",
          employee_name:usage.employee_name||usage.employee_email||"-",
          product_id:usage.product_id,
          product_name:product?.name||`제품 #${usage.product_id||"-"}`,
          product_meta:[product?.maker,product?.code,product?.capacity,product?.grade].filter(Boolean).join(" · "),
          quantity:usage.quantity,
          unit:usage.unit||"",
          substance_name:item.substance_name_snapshot||"-",
          cas_no:item.cas_no_snapshot||"-",
          percent:item.percent_snapshot||"-",
          work_content:sr.work_content||"-",
          ppe:sr.ppe||[],
          ppe_other:sr.ppe_other||"",
          accident_occurred:sr.accident_occurred===true,
          damage_detail:sr.damage_detail||"",
          action_detail:sr.action_detail||"",
          created_at:sr.created_at||usage.created_at||""
        }));
      });
      rows.sort((a,b)=>Number(b.journal_no)-Number(a.journal_no)||Number(a.item_id)-Number(b.item_id));
      state.usageRows=rows;state.usageLoaded=true;
      renderUsageLog();usageSetMessage("");
    }catch(error){
      console.error("[QA Mobile Special Usage Log] load failed",error);
      state.usageRows=[];state.usageLoaded=true;renderUsageLog();
      const msg=String(error?.message||"알 수 없는 오류");
      if(/qa_special_substance_usage_records|qa_special_substance_usage_items|relation .* does not exist|schema cache/i.test(msg)){
        usageSetMessage("특별관리물질 사용일지 DB 테이블을 확인해 주세요.","error");
      }else usageSetMessage(`사용일지 불러오기 실패: ${msg}`,"error");
    }
  }

  function filteredUsageRows(){
    const q=state.usageQuery.trim().toLowerCase();
    if(!q)return state.usageRows;
    return state.usageRows.filter(row=>[
      row.journal_no,row.usage_date,row.employee_name,row.employee_no,row.substance_name,row.cas_no,
      row.product_name,row.product_meta,row.quantity,row.unit,row.percent,row.work_content,ppeText(row),
      row.accident_occurred?"사고 있음":"사고 없음"
    ].join(" ").toLowerCase().includes(q));
  }

  function usageDetailHtml(row){
    const accidentExtra=row.accident_occurred
      ? `<div class="usage-detail-item full accident"><span class="usage-detail-label">피해 내용</span><div class="usage-detail-value">${esc(row.damage_detail||"-")}</div></div><div class="usage-detail-item full accident"><span class="usage-detail-label">조치 사항</span><div class="usage-detail-value">${esc(row.action_detail||"-")}</div></div>`
      : "";
    return `<div class="usage-card-detail"><div class="usage-detail-grid">
      <div class="usage-detail-item"><span class="usage-detail-label">함유량</span><div class="usage-detail-value">${esc(row.percent||"-")}</div></div>
      <div class="usage-detail-item"><span class="usage-detail-label">사용시간</span><div class="usage-detail-value">${esc(formatUsageTime(row.usage_time))}</div></div>
      <div class="usage-detail-item full"><span class="usage-detail-label">제품 정보</span><div class="usage-detail-value">${esc(row.product_meta||"-")}</div></div>
      <div class="usage-detail-item full"><span class="usage-detail-label">작업내용</span><div class="usage-detail-value">${esc(row.work_content||"-")}</div></div>
      <div class="usage-detail-item full"><span class="usage-detail-label">착용 보호구</span><div class="usage-detail-value">${esc(ppeText(row))}</div></div>
      <div class="usage-detail-item full${row.accident_occurred?" accident":""}"><span class="usage-detail-label">사고 발생</span><div class="usage-detail-value">${row.accident_occurred?"있음":"없음"}</div></div>
      ${accidentExtra}
    </div></div>`;
  }

  function renderUsageLog(){
    const list=$("usageList");if(!list)return;
    const rows=filteredUsageRows();
    if(!rows.length){list.innerHTML='<div class="empty-card">조회기간에 등록된 특별관리물질 사용기록이 없습니다.</div>';return;}
    list.innerHTML=rows.map(row=>{
      const key=String(row.item_id),expanded=state.expandedUsage.has(key);
      const amount=`${row.quantity??"-"}${row.unit?` ${row.unit}`:""}`;
      return `<article class="usage-card${expanded?" expanded":""}" data-usage-card="${row.item_id}">
        <button class="usage-card-toggle" type="button" data-usage-toggle="${row.item_id}" aria-expanded="${expanded?"true":"false"}">
          <span class="usage-line usage-line-1"><span class="usage-no">No.${Number.isFinite(row.journal_no)?row.journal_no:"-"}</span><span class="usage-date">${esc(row.usage_date||"-")}</span><span class="usage-author">${esc(row.employee_name||"-")}</span></span>
          <span class="usage-line usage-line-2"><span class="usage-substance">${esc(row.substance_name||"-")}</span><span class="usage-cas">CAS ${esc(row.cas_no||"-")}</span></span>
          <span class="usage-line usage-line-3"><span class="usage-product">${esc(row.product_name||"-")}</span><span class="usage-amount">· ${esc(amount)}</span></span>
        </button>
        ${usageDetailHtml(row)}
      </article>`;
    }).join("");
    list.querySelectorAll("[data-usage-toggle]").forEach(btn=>btn.addEventListener("click",()=>{
      const key=String(btn.dataset.usageToggle);
      if(state.expandedUsage.has(key))state.expandedUsage.delete(key);else state.expandedUsage.add(key);
      const card=btn.closest(".usage-card");
      const expanded=state.expandedUsage.has(key);
      card?.classList.toggle("expanded",expanded);btn.setAttribute("aria-expanded",expanded?"true":"false");
    }));
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
    if(!["today","monthly","usage"].includes(view))view="today";
    if(view===state.view){
      if(view==="usage"&&!state.usageLoaded)await loadUsageLog();
      return;
    }
    state.view=view;
    $("todayTab").classList.toggle("active",view==="today");
    $("monthlyTab").classList.toggle("active",view==="monthly");
    $("usageTab").classList.toggle("active",view==="usage");
    $("todayView").hidden=view!=="today";
    $("monthlyView").hidden=view!=="monthly";
    $("usageView").hidden=view!=="usage";

    if(view==="usage"){
      $("usageYearSelect").value=String(state.usageYear);
      $("usageMonthSelect").value=String(state.usageMonth);
      await loadUsageLog();
      return;
    }

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
    $("usageTab").addEventListener("click",()=>switchView("usage"));
    $("todaySearch").addEventListener("input",()=>{state.todayQuery=$("todaySearch").value;renderToday();});
    $("monthlySearch").addEventListener("input",()=>{state.monthlyQuery=$("monthlySearch").value;renderMonthlyList();});
    $("yearSelect").addEventListener("change",async()=>{state.year=Number($("yearSelect").value);state.selectedDay=1;await refresh();});
    $("monthSelect").addEventListener("change",async()=>{state.month=Number($("monthSelect").value);state.selectedDay=1;await refresh();});
    $("prevMonthBtn").addEventListener("click",()=>shiftMonth(-1));
    $("nextMonthBtn").addEventListener("click",()=>shiftMonth(1));
    $("saveQuantities").addEventListener("click",saveAll);
    $("usageYearSelect").addEventListener("change",async()=>{state.usageYear=Number($("usageYearSelect").value);state.expandedUsage.clear();await loadUsageLog();});
    $("usageMonthSelect").addEventListener("change",async()=>{state.usageMonth=Number($("usageMonthSelect").value);state.expandedUsage.clear();await loadUsageLog();});
    $("usageSearch").addEventListener("input",()=>{state.usageQuery=$("usageSearch").value;renderUsageLog();});
    window.addEventListener("message",e=>{const p=e?.data||{};if(p.type==="portal-tabs-request"||p.type==="portal-filters-request")notifyPortal();});
  }

  function applyPermissionUi(){
    state.canManage=!!window.SDSApp?.isQaOperator?.();
    const dock=document.querySelector(".save-dock");
    const space=document.querySelector(".save-dock-space");
    if(dock){dock.hidden=!state.canManage;dock.style.display=state.canManage?"":"none";}
    if(space){space.hidden=!state.canManage;space.style.display=state.canManage?"":"none";}
  }

  async function init(){
    applyPermissionUi();fillPeriodOptions();bindEvents();notifyPortal();await refresh();
  }

  document.addEventListener("DOMContentLoaded",init);
})();
