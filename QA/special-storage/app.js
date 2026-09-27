(() => {
  "use strict";

  const db = window.SDSApp?.db;
  const $ = (id) => document.getElementById(id);

  const state = {
    year: 0,
    month: 0,
    query: "",
    stockFilter: "all",
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
    currentView: "storage",
    usageYear: 0,
    usageMonth: 0,
    usageQuery: "",
    usageAccidentFilter: "all",
    usageRows: [],
    usageLoaded: false,
    canManage: false
  };

  function pad2(v){ return String(v).padStart(2, "0"); }
  function localDateString(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
  function monthKey(year, month){ return `${year}-${pad2(month)}`; }
  function monthStart(year, month){ return `${monthKey(year, month)}-01`; }
  function daysInMonth(year, month){ return new Date(year, month, 0).getDate(); }
  function monthEnd(year, month){ return `${monthKey(year, month)}-${pad2(daysInMonth(year, month))}`; }
  function esc(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function normalizeCas(v){ return String(v || "").trim().replace(/\s+/g, ""); }
  function numberText(v){ const n = Number(v); return Number.isFinite(n) ? String(Math.trunc(n)) : "0"; }
  function isTodayMonth(){ const d = new Date(); return state.year === d.getFullYear() && state.month === d.getMonth()+1; }
  function currentToday(){ return localDateString(); }
  function dateInSelectedMonth(day){ return `${monthKey(state.year,state.month)}-${pad2(day)}`; }
  function sessionInfo(){
    const s = window.SDSApp?.getPortalSession?.() || {};
    const companyId = s.activeCompanyId || s.company_id || s.companyId || s.activeCompany?.id || s.company?.id || window.SDSApp?.getCompanyId?.() || "";
    const email = s.email || s.user?.email || s.employee_email || "";
    const name = s.name || s.employee_name || s.user?.user_metadata?.name || "";
    return { companyId:String(companyId || ""), email:String(email || ""), name:String(name || "") };
  }
  function setMessage(text="", type=""){
    const el = $("message");
    el.textContent = text;
    el.classList.toggle("error", type === "error");
    el.classList.toggle("success", type === "success");
  }
  function notifyPortal(){
    try{
      window.parent?.postMessage({ type:"portal-tabs-ready", tabs:[{id:"qa-storage",label:"특별관리물질 현황"}], source:"qa-storage" }, "*");
      window.parent?.postMessage({ type:"portal-tab-active", activeTabId:"qa-storage", tabId:"qa-storage", source:"qa-storage" }, "*");
      window.parent?.postMessage({ type:"portal-filters-ready", enabled:false, filters:[], source:"qa-storage" }, "*");
    }catch(_){ }
  }

  function fillPeriodOptions(){
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearEl = $("yearSelect");
    const monthEl = $("monthSelect");
    yearEl.innerHTML = "";
    for(let y=currentYear-5; y<=currentYear+2; y++){
      const o=document.createElement("option"); o.value=String(y); o.textContent=`${y}년`; yearEl.appendChild(o);
    }
    monthEl.innerHTML = "";
    for(let m=1; m<=12; m++){
      const o=document.createElement("option"); o.value=String(m); o.textContent=`${m}월`; monthEl.appendChild(o);
    }
    state.year=currentYear; state.month=now.getMonth()+1;
    yearEl.value=String(state.year); monthEl.value=String(state.month);

    const usageYearEl = $("usageYearSelect");
    const usageMonthEl = $("usageMonthSelect");
    if(usageYearEl && usageMonthEl){
      usageYearEl.innerHTML = yearEl.innerHTML;
      usageMonthEl.innerHTML = monthEl.innerHTML;
      state.usageYear=currentYear; state.usageMonth=now.getMonth()+1;
      usageYearEl.value=String(state.usageYear); usageMonthEl.value=String(state.usageMonth);
    }
  }

  function specialActiveInMonth(row){
    const start=monthStart(state.year,state.month), end=monthEnd(state.year,state.month);
    if(row.effective_from && row.effective_from > end) return false;
    if(row.effective_to && row.effective_to <= start) return false;
    return true;
  }
  function casListOfSubstance(r){
    const list=(r.qa_special_substance_cas || []).slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||(a.id??0)-(b.id??0)).map(x=>normalizeCas(x.cas_no)).filter(Boolean);
    if(list.length) return list;
    const fallback=normalizeCas(r.cas_no); return fallback?[fallback]:[];
  }
  function contentText(info){
    const a=info?.content_min, b=info?.content_max;
    const hasA=a!==null&&a!==undefined&&a!==""&&!Number.isNaN(Number(a));
    const hasB=b!==null&&b!==undefined&&b!==""&&!Number.isNaN(Number(b));
    if(hasA&&hasB){ const n1=Number(a), n2=Number(b); return n1===n2?`${n1}%`:`${n1}~${n2}%`; }
    if(hasA) return `${Number(a)}% 이상`;
    if(hasB) return `${Number(b)}% 이하`;
    return "";
  }

  async function loadBaseData(){
    if(!db) throw new Error("Supabase 연결 정보를 확인할 수 없습니다.");
    const {companyId,email,name}=sessionInfo();
    state.companyId=companyId; state.userEmail=email; state.userName=name;
    if(!companyId) throw new Error("회사 정보를 확인할 수 없습니다.");

    const [{data:subs,error:sErr},{data:products,error:pErr}] = await Promise.all([
      db.from("qa_special_substances")
        .select("id,name_ko,name_en,cas_no,effective_from,effective_to,qa_special_substance_cas(id,cas_no,sort_order)")
        .order("name_ko",{ascending:true}),
      db.from("product_master")
        .select("id,company_id,category,name,maker,code,capacity,grade,cas,is_active")
        .eq("company_id",companyId)
        .eq("category","시약")
        .eq("is_active",true)
    ]);
    if(sErr) throw sErr; if(pErr) throw pErr;
    state.substances=(subs||[]).filter(specialActiveInMonth);
    state.products=products||[];

    const ids=state.products.map(p=>p.id);
    state.productCas=[];
    if(ids.length){
      const chunk=150;
      for(let i=0;i<ids.length;i+=chunk){
        const {data,error}=await db.from("product_cas")
          .select("id,product_id,cas_no,content_min,content_max,sort_order")
          .in("product_id",ids.slice(i,i+chunk))
          .order("sort_order",{ascending:true}).order("id",{ascending:true});
        if(error) throw error;
        state.productCas.push(...(data||[]));
      }
    }
  }

  async function loadReceiptsAndRecords(){
    const ids=state.products.map(p=>p.id);
    state.receipts=[]; state.records=[]; state.dailyTableReady=true;
    if(!ids.length) return;
    const end=monthEnd(state.year,state.month);
    const chunk=150;
    for(let i=0;i<ids.length;i+=chunk){
      const part=ids.slice(i,i+chunk);
      let rq=db.from("reagent_collect_items")
        .select("id,product_id,collected_qty,receipt_date")
        .eq("company_id",state.companyId)
        .in("product_id",part)
        .not("receipt_date","is",null)
        .lte("receipt_date",end);
      const {data,error}=await rq;
      if(error) throw error;
      state.receipts.push(...(data||[]));

      const {data:daily,error:dErr}=await db.from("qa_special_storage_daily")
        .select("id,company_id,product_id,record_date,quantity,created_by,created_name,created_at,updated_by,updated_name,updated_at")
        .eq("company_id",state.companyId)
        .in("product_id",part)
        .lte("record_date",end)
        .order("record_date",{ascending:true});
      if(dErr){
        const msg=String(dErr.message||"");
        if(/qa_special_storage_daily|relation .* does not exist|schema cache/i.test(msg)){
          state.dailyTableReady=false;
        }else throw dErr;
      }else{
        state.records.push(...(daily||[]));
      }
    }
  }

  function buildRows(){
    const subByCas=new Map();
    state.substances.forEach(s=>{
      casListOfSubstance(s).forEach(cas=>{
        if(!subByCas.has(cas)) subByCas.set(cas,[]);
        subByCas.get(cas).push(s);
      });
    });
    const casByProduct=new Map();
    state.productCas.forEach(c=>{
      const key=String(c.product_id);
      if(!casByProduct.has(key)) casByProduct.set(key,[]);
      casByProduct.get(key).push(c);
    });

    const receiptsByProduct=new Map();
    state.receipts.forEach(r=>{
      const key=String(r.product_id);
      if(!receiptsByProduct.has(key)) receiptsByProduct.set(key,[]);
      receiptsByProduct.get(key).push({ date:r.receipt_date, qty:Math.max(0,Math.trunc(Number(r.collected_qty||0))) });
    });
    receiptsByProduct.forEach(list=>list.sort((a,b)=>String(a.date).localeCompare(String(b.date))));

    const recordsByProduct=new Map();
    state.records.forEach(r=>{
      const key=String(r.product_id);
      if(!recordsByProduct.has(key)) recordsByProduct.set(key,[]);
      recordsByProduct.get(key).push(r);
    });
    recordsByProduct.forEach(list=>list.sort((a,b)=>String(a.record_date).localeCompare(String(b.record_date))));

    const start=monthStart(state.year,state.month), end=monthEnd(state.year,state.month), today=currentToday();
    const dim=daysInMonth(state.year,state.month);
    const result=[];

    state.products.forEach(p=>{
      let productCas=casByProduct.get(String(p.id)) || [];
      if(!productCas.length && normalizeCas(p.cas)) productCas=[{product_id:p.id,cas_no:p.cas,content_min:null,content_max:null,sort_order:1}];
      const matched=[];
      productCas.forEach(ci=>{
        const cas=normalizeCas(ci.cas_no);
        (subByCas.get(cas)||[]).forEach(s=>{
          const key=`${s.id}__${cas}`;
          if(!matched.some(x=>x.key===key)) matched.push({key,substance:s,casInfo:ci});
        });
      });
      if(!matched.length) return;

      const receipts=receiptsByProduct.get(String(p.id)) || [];
      const records=recordsByProduct.get(String(p.id)) || [];
      const hasAnyActivity=receipts.length || records.length;
      if(!hasAnyActivity) return;

      const receiptMap=new Map();
      receipts.forEach(r=>receiptMap.set(r.date,(receiptMap.get(r.date)||0)+r.qty));
      const recordMap=new Map(records.map(r=>[r.record_date,r]));

      const eventDates=[...new Set([...receipts.map(x=>x.date),...records.map(x=>x.record_date)].filter(Boolean))].sort();
      if(!eventDates.length) return;
      let qty=null;
      for(const ds of eventDates){
        if(ds>=start) break;
        const inc=receiptMap.get(ds)||0;
        if(qty===null && inc>0) qty=0;
        if(qty!==null) qty += inc;
        if(recordMap.has(ds)) qty=Math.max(0,Math.trunc(Number(recordMap.get(ds).quantity||0)));
      }
      const startQty=qty;
      const monthly={};
      const endCursor=end < today ? end : today;
      if(start<=endCursor){
        const cursor=new Date(`${start}T00:00:00`);
        const stop=new Date(`${endCursor}T00:00:00`);
        while(cursor<=stop){
          const ds=localDateString(cursor);
          const inc=receiptMap.get(ds)||0;
          if(qty===null && inc>0) qty=0;
          if(qty!==null) qty += inc;
          if(recordMap.has(ds)) qty=Math.max(0,Math.trunc(Number(recordMap.get(ds).quantity||0)));
          monthly[Number(ds.slice(-2))]=qty;
          cursor.setDate(cursor.getDate()+1);
        }
      }
      const inMonthReceipt=receipts.some(r=>r.date>=start&&r.date<=end);
      const inMonthRecord=records.some(r=>r.record_date>=start&&r.record_date<=end);
      if(!(Number(startQty)>0 || inMonthReceipt || inMonthRecord)) return;

      const latestReceipt=receipts.filter(r=>r.date<=end).map(r=>r.date).sort().pop() || "";
      const todayRecord=records.find(r=>r.record_date===today) || null;
      const currentDay=Number(today.slice(-2));
      const effectiveToday=(state.year===Number(today.slice(0,4))&&state.month===Number(today.slice(5,7))) ? monthly[currentDay] : null;

      result.push({ product:p, matched, receipts, records, monthly, latestReceipt, todayRecord, effectiveToday, dim });
    });

    result.sort((a,b)=>String(a.product.name||"").localeCompare(String(b.product.name||""),"ko")||Number(a.product.id)-Number(b.product.id));
    state.rows=result;
  }

  function filteredRows(){
    const q=state.query.trim().toLowerCase();
    const dayLimit=isTodayMonth()?Number(currentToday().slice(-2)):daysInMonth(state.year,state.month);
    return state.rows.filter(row=>{
      const p=row.product;
      const specialText=row.matched.map(x=>`${x.substance.name_ko||""} ${x.substance.name_en||""} ${x.casInfo.cas_no||""}`).join(" ");
      const hay=`${p.name||""} ${p.maker||""} ${p.code||""} ${p.capacity||""} ${p.grade||""} ${specialText}`.toLowerCase();
      if(q&&!hay.includes(q)) return false;
      let last=null; for(let d=1;d<=dayLimit;d++){ if(row.monthly[d]!==undefined&&row.monthly[d]!==null) last=row.monthly[d]; }
      if(state.stockFilter==="positive" && !(Number(last)>0)) return false;
      if(state.stockFilter==="zero" && last!==0) return false;
      return true;
    });
  }

  function renderHeader(){
    const dim=daysInMonth(state.year,state.month);
    const weekdayNames=["일","월","화","수","목","금","토"];
    let row1=`<tr><th class="product-col" rowspan="2">제품정보</th><th class="special-col" rowspan="2">특별관리물질 정보</th><th class="input-col" rowspan="2">보관수량 입력<br><small>수량(병)</small></th><th class="receipt-col" rowspan="2">최근입고일</th><th class="month-title" colspan="${dim}"><div class="month-title-wrap"><button class="month-nav" type="button" data-shift-month="-1" aria-label="이전 달">&#8249;</button><span>${state.year}년 ${state.month}월</span><button class="month-nav" type="button" data-shift-month="1" aria-label="다음 달">&#8250;</button></div></th></tr>`;
    let row2="<tr>";
    for(let d=1;d<=dim;d++){
      const date=new Date(state.year,state.month-1,d);
      const dow=date.getDay();
      const ds=dateInSelectedMonth(d);
      const cls=["day-col"];
      if(dow===0||dow===6)cls.push("weekend");
      if(ds===currentToday())cls.push("today");
      row2+=`<th class="${cls.join(" ")}"><span class="day-num">${d}</span><span class="weekday">${weekdayNames[dow]}</span></th>`;
    }
    row2+="</tr>";
    $("storageHead").innerHTML=row1+row2;
  }

  function renderBody(){
    const rows=filteredRows();
    const dim=daysInMonth(state.year,state.month);
    const today=currentToday();
    const canEdit=isTodayMonth() && state.dailyTableReady && state.canManage;
    if(!rows.length){ $("storageBody").innerHTML=`<tr><td class="empty" colspan="${4+dim}">조회기간에 표시할 특별관리물질 보관 제품이 없습니다.</td></tr>`; return; }

    $("storageBody").innerHTML=rows.map(row=>{
      const p=row.product;
      const special=row.matched.map(x=>{
        const content=contentText(x.casInfo);
        return `<div class="special-item"><div class="special-name">${esc(x.substance.name_ko||x.substance.name_en||"-")}</div><div class="special-meta">CAS ${esc(x.casInfo.cas_no||"-")}${content?` · ${esc(content)}`:""}</div></div>`;
      }).join("");
      const productMeta=[p.maker,p.code,p.capacity,p.grade].filter(Boolean).join(" · ");
      const inputValue=canEdit && row.todayRecord ? numberText(row.todayRecord.quantity) : "";
      const disabled=canEdit?"":"disabled";
      let days="";
      for(let d=1;d<=dim;d++){
        const ds=dateInSelectedMonth(d), date=new Date(state.year,state.month-1,d), dow=date.getDay();
        const cls=[]; if(dow===0||dow===6)cls.push("weekend"); if(ds===today)cls.push("today");
        const v=row.monthly[d];
        days+=`<td class="${cls.join(" ")}">${v===undefined||v===null?`<span class="day-value">-</span>`:`<span class="day-value${Number(v)===0?" zero":""}">${numberText(v)}</span>`}</td>`;
      }
      return `<tr data-product-id="${esc(p.id)}"><td class="product-col"><div class="product-name">${esc(p.name||`제품 #${p.id}`)}</div><div class="product-meta">${esc(productMeta||"-")}</div></td><td class="special-col"><div class="special-list">${special}</div></td><td class="input-col"><div class="qty-wrap"><input class="qty-input" data-qty-product="${esc(p.id)}" type="number" min="0" step="1" inputmode="numeric" value="${esc(inputValue)}" ${disabled}/><span class="qty-unit">병</span></div></td><td class="receipt-col">${esc(row.latestReceipt||"-")}</td>${days}</tr>`;
    }).join("");

    document.querySelectorAll(".qty-input:not(:disabled)").forEach(input=>{
      input.addEventListener("input",()=>{
        let value=input.value.trim();
        if(value!==""){
          const n=Math.max(0,Math.trunc(Number(value)||0));
          if(String(n)!==value) input.value=String(n);
        }
        input.closest("tr")?.classList.add("changed-row");
        syncSaveButton();
      });
    });
  }

  function syncSaveButton(){
    const btn=$("saveQuantities");
    const editable=isTodayMonth()&&state.dailyTableReady&&!state.saving&&state.canManage;
    const hasChanged=[...document.querySelectorAll("tr.changed-row .qty-input:not(:disabled)")].some(i=>i.value.trim()!=="");
    btn.disabled=!editable||!hasChanged;
    const guide=$("saveGuide");
    if(guide) guide.textContent="";
  }

  function render(){ renderHeader(); renderBody(); syncSaveButton(); }

  async function saveAll(){
    if(!state.canManage){ setMessage("조회 전용 사용자입니다. 보관수량 입력·수정은 QA 운영자만 가능합니다.","error"); return; }
    if(state.saving||!isTodayMonth()||!state.dailyTableReady) return;
    const inputs=[...document.querySelectorAll("tr.changed-row .qty-input:not(:disabled)")].filter(i=>i.value.trim()!=="");
    if(!inputs.length){ setMessage("저장할 수량이 없습니다."); return; }
    const today=currentToday();
    state.saving=true; syncSaveButton(); setMessage(`${inputs.length}개 제품의 보관수량을 저장하는 중입니다.`);
    try{
      for(const input of inputs){
        const productId=Number(input.dataset.qtyProduct);
        const quantity=Math.max(0,Math.trunc(Number(input.value)||0));
        const existing=state.records.find(r=>Number(r.product_id)===productId&&r.record_date===today);
        const payload={
          company_id:state.companyId,
          product_id:productId,
          record_date:today,
          quantity,
          updated_by:state.userEmail||null,
          updated_name:state.userName||null,
          updated_at:new Date().toISOString()
        };
        let result;
        if(existing?.id){
          result=await db.from("qa_special_storage_daily").update(payload).eq("id",existing.id).select("*").single();
        }else{
          payload.created_by=state.userEmail||null; payload.created_name=state.userName||null;
          result=await db.from("qa_special_storage_daily").insert(payload).select("*").single();
        }
        if(result.error) throw result.error;
      }
      setMessage(`${inputs.length}개 제품의 오늘 보관수량을 저장했습니다.`,"success");
      await refresh(false);
    }catch(error){
      console.error(error);
      setMessage(`수량 저장 실패: ${error?.message||"알 수 없는 오류"}`,"error");
    }finally{
      state.saving=false; syncSaveButton();
    }
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
    const parts=String(value||"").split(":").map(Number);
    if(!Number.isFinite(parts[0])) return "-";
    const hours=(parts[0]||0)+(parts[1]||0)/60+(parts[2]||0)/3600;
    if(!hours) return "-";
    return `${Number(hours.toFixed(2))}시간`;
  }

  function ppeText(row){
    const values=Array.isArray(row?.ppe)?row.ppe:[];
    const labels=values.map(code=>{
      if(code==="other" && row?.ppe_other) return `기타(${row.ppe_other})`;
      return PPE_LABELS[code]||code;
    }).filter(Boolean);
    return labels.length?labels.join(" · "):"-";
  }

  function usagePeriodRange(){
    return {
      start:monthStart(state.usageYear,state.usageMonth),
      end:monthEnd(state.usageYear,state.usageMonth)
    };
  }

  function usageSetMessage(text="",type=""){
    const el=$("usageMessage");
    if(!el) return;
    el.textContent=text;
    el.classList.toggle("error",type==="error");
    el.classList.toggle("success",type==="success");
  }

  async function fetchInChunks(table, select, column, values, extraBuilder=null){
    const result=[];
    const list=[...new Set((values||[]).filter(v=>v!==null&&v!==undefined&&v!==""))];
    for(let i=0;i<list.length;i+=200){
      let q=db.from(table).select(select).in(column,list.slice(i,i+200));
      if(typeof extraBuilder==="function") q=extraBuilder(q);
      const {data,error}=await q;
      if(error) throw error;
      result.push(...(data||[]));
    }
    return result;
  }

  async function loadUsageLog(showLoading=true){
    if(!db) return;
    if(!state.companyId){
      const info=sessionInfo();
      state.companyId=info.companyId; state.userEmail=info.email; state.userName=info.name;
    }
    if(!state.companyId){ usageSetMessage("회사 정보를 확인할 수 없습니다.","error"); return; }
    const {start,end}=usagePeriodRange();
    if(showLoading) usageSetMessage("특별관리물질 사용일지를 불러오는 중입니다.");
    try{
      const baseResult=await db.from("qa_reagent_usage_records")
        .select("id,company_id,employee_no,employee_name,employee_email,product_id,usage_date,usage_time,quantity_type,quantity,unit,created_at")
        .eq("company_id",state.companyId)
        .gte("usage_date",start)
        .lte("usage_date",end)
        .order("usage_date",{ascending:true})
        .order("id",{ascending:true});
      if(baseResult.error) throw baseResult.error;
      const baseRows=baseResult.data||[];
      if(!baseRows.length){ state.usageRows=[]; state.usageLoaded=true; renderUsageLog(); usageSetMessage(""); return; }

      const usageIds=baseRows.map(r=>r.id);
      const specialRows=await fetchInChunks(
        "qa_special_substance_usage_records",
        "id,usage_record_id,company_id,journal_no,work_content,ppe,ppe_other,accident_occurred,damage_detail,action_detail,created_by,created_at,updated_at",
        "usage_record_id",
        usageIds,
        q=>q.eq("company_id",state.companyId)
      );
      if(!specialRows.length){ state.usageRows=[]; state.usageLoaded=true; renderUsageLog(); usageSetMessage(""); return; }

      const specialIds=specialRows.map(r=>r.id);
      const itemRows=await fetchInChunks(
        "qa_special_substance_usage_items",
        "id,special_usage_id,substance_id,substance_name_snapshot,cas_no_snapshot,percent_snapshot,created_at",
        "special_usage_id",
        specialIds
      );

      const productIds=[...new Set(baseRows.map(r=>r.product_id).filter(Boolean))];
      const products=productIds.length ? await fetchInChunks(
        "product_master",
        "id,name,maker,code,capacity,grade",
        "id",
        productIds
      ) : [];

      const usageById=new Map(baseRows.map(r=>[Number(r.id),r]));
      const productById=new Map(products.map(p=>[Number(p.id),p]));
      const specialById=new Map(specialRows.map(r=>[Number(r.id),r]));
      const itemsBySpecial=new Map();
      itemRows.forEach(item=>{
        const key=Number(item.special_usage_id);
        if(!itemsBySpecial.has(key)) itemsBySpecial.set(key,[]);
        itemsBySpecial.get(key).push(item);
      });
      itemsBySpecial.forEach(list=>list.sort((a,b)=>Number(a.id)-Number(b.id)));

      const rows=[];
      specialRows.forEach(sr=>{
        const usage=usageById.get(Number(sr.usage_record_id));
        if(!usage) return;
        const product=productById.get(Number(usage.product_id))||null;
        const items=itemsBySpecial.get(Number(sr.id))||[];
        const journalNo=Number(sr.journal_no);
        items.forEach(item=>{
          rows.push({
            journal_no:journalNo,
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
          });
        });
      });
      rows.sort((a,b)=>Number(a.journal_no)-Number(b.journal_no) || Number(a.item_id)-Number(b.item_id));
      state.usageRows=rows;
      state.usageLoaded=true;
      renderUsageLog();
      usageSetMessage("");
    }catch(error){
      console.error("[QA Special Usage Log] load failed",error);
      state.usageRows=[]; state.usageLoaded=true;
      renderUsageLog();
      const msg=String(error?.message||"알 수 없는 오류");
      if(/qa_special_substance_usage_records|qa_special_substance_usage_items|relation .* does not exist|schema cache/i.test(msg)){
        usageSetMessage("특별관리물질 사용일지 DB 테이블을 확인해 주세요. qa_special_substance_usage_records / qa_special_substance_usage_items가 필요합니다.","error");
      }else{
        usageSetMessage(`사용일지 불러오기 실패: ${msg}`,"error");
      }
    }
  }

  function filteredUsageRows(){
    const q=state.usageQuery.trim().toLowerCase();
    return state.usageRows.filter(row=>{
      if(state.usageAccidentFilter==="yes" && !row.accident_occurred) return false;
      if(state.usageAccidentFilter==="none" && row.accident_occurred) return false;
      if(!q) return true;
      const hay=[
        row.journal_no,row.usage_date,row.employee_name,row.employee_no,
        row.substance_name,row.cas_no,row.product_name,row.product_meta,row.quantity,row.unit,row.percent,
        row.work_content,ppeText(row),row.accident_occurred?"사고 있음":"사고 없음"
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function renderUsageLog(){
    const body=$("usageLogBody");
    if(!body) return;
    const rows=filteredUsageRows();
    if(!rows.length){
      body.innerHTML='<tr><td class="empty" colspan="12">조회기간에 등록된 특별관리물질 사용기록이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML=rows.map(row=>{
      const product=`<div class="log-main">${esc(row.product_name)}</div>${row.product_meta?`<div class="log-sub">${esc(row.product_meta)}</div>`:""}`;
      const author=`<div class="log-main">${esc(row.employee_name)}</div>${row.employee_no?`<div class="log-sub">${esc(row.employee_no)}</div>`:""}`;
      const accident=row.accident_occurred?'<span class="accident-badge yes">있음</span>':'<span class="accident-badge">없음</span>';
      return `<tr data-journal-no="${row.journal_no}" data-item-id="${row.item_id}">
        <td class="journal-no-col">${row.journal_no}</td>
        <td class="date-col">${esc(row.usage_date||"-")}</td>
        <td class="author-col">${author}</td>
        <td class="substance-col">${esc(row.substance_name||"-")}</td>
        <td class="cas-col">${esc(row.cas_no||"-")}</td>
        <td class="usage-product-col">${product}</td>
        <td class="amount-col">${esc(`${row.quantity ?? "-"}${row.unit?` ${row.unit}`:""}`)}</td>
        <td class="percent-col">${esc(row.percent||"-")}</td>
        <td class="work-col">${esc(row.work_content||"-")}</td>
        <td class="ppe-col">${esc(ppeText(row))}</td>
        <td class="accident-col">${accident}</td>
        <td class="detail-col"><button type="button" class="detail-btn" data-usage-detail="${row.item_id}">상세</button></td>
      </tr>`;
    }).join("");
  }

  function openUsageDetail(itemId){
    const row=state.usageRows.find(r=>Number(r.item_id)===Number(itemId));
    if(!row) return;
    $("usageDetailTitle").textContent=`특별관리물질 사용기록 No.${row.journal_no}`;
    $("usageDetailSubtitle").textContent=`${row.usage_date||"-"} · ${row.employee_name||"-"}`;
    const accidentHtml=row.accident_occurred
      ? `<div class="detail-item full detail-accident"><span class="detail-label">피해 내용</span><div class="detail-value">${esc(row.damage_detail||"-")}</div></div><div class="detail-item full detail-accident"><span class="detail-label">조치 사항</span><div class="detail-value">${esc(row.action_detail||"-")}</div></div>`
      : "";
    $("usageDetailBody").innerHTML=`<div class="detail-grid">
      <div class="detail-item"><span class="detail-label">사용일지 No.</span><div class="detail-value">${row.journal_no}</div></div>
      <div class="detail-item"><span class="detail-label">취급일자 / 작성자</span><div class="detail-value">${esc(row.usage_date||"-")} / ${esc(row.employee_name||"-")}${row.employee_no?` (${esc(row.employee_no)})`:""}</div></div>
      <div class="detail-item full"><span class="detail-label">사용제품</span><div class="detail-value">${esc(row.product_name)}${row.product_meta?`\n${esc(row.product_meta)}`:""}</div></div>
      <div class="detail-item"><span class="detail-label">제품 취급량</span><div class="detail-value">${esc(`${row.quantity ?? "-"}${row.unit?` ${row.unit}`:""}`)}</div></div>
      <div class="detail-item"><span class="detail-label">사용시간</span><div class="detail-value">${esc(formatUsageTime(row.usage_time))}</div></div>
      <div class="detail-item"><span class="detail-label">특별관리물질</span><div class="detail-value">${esc(row.substance_name||"-")}</div></div>
      <div class="detail-item"><span class="detail-label">CAS No. / 함유량</span><div class="detail-value">${esc(row.cas_no||"-")} / ${esc(row.percent||"-")}</div></div>
      <div class="detail-item full"><span class="detail-label">작업내용</span><div class="detail-value">${esc(row.work_content||"-")}</div></div>
      <div class="detail-item full"><span class="detail-label">착용 보호구</span><div class="detail-value">${esc(ppeText(row))}</div></div>
      <div class="detail-item full${row.accident_occurred?" detail-accident":""}"><span class="detail-label">사고 발생</span><div class="detail-value">${row.accident_occurred?"있음":"없음"}</div></div>
      ${accidentHtml}
    </div>`;
    $("usageDetailModal").hidden=false;
  }

  function closeUsageDetail(){
    if($("usageDetailModal")) $("usageDetailModal").hidden=true;
  }

  async function switchView(view){
    state.currentView=view==="usage"?"usage":"storage";
    const usage=state.currentView==="usage";
    $("storageView").hidden=usage;
    $("usageView").hidden=!usage;
    $("storageViewBtn").classList.toggle("active",!usage);
    $("usageViewBtn").classList.toggle("active",usage);
    $("pageTitle").textContent=usage?"특별관리물질 사용일지":"특별관리물질 보관";
    $("pageDesc").textContent=usage
      ? "QA 사용일지의 사용정보 입력에서 등록된 특별관리물질 취급기록을 조회합니다."
      : "특별관리물질이 포함된 제품의 보관 병수를 일자별로 확인하고 관리합니다.";
    if(usage && !state.usageLoaded) await loadUsageLog();
  }

  function shiftMonth(delta){
    let y=state.year;
    let m=state.month + delta;
    if(m < 1){ m = 12; y -= 1; }
    else if(m > 12){ m = 1; y += 1; }
    state.year = y;
    state.month = m;
    $("yearSelect").value = String(y);
    $("monthSelect").value = String(m);
    return refresh();
  }

  async function refresh(showLoading=true){
    if(showLoading)setMessage("특별관리물질 보관 현황을 불러오는 중입니다.");
    try{
      await loadBaseData();
      await loadReceiptsAndRecords();
      buildRows();
      render();
      if(!state.dailyTableReady){
        setMessage("보관수량 저장용 qa_special_storage_daily 테이블이 아직 없습니다. 포함된 SQL 파일을 Supabase에서 먼저 실행해 주세요.","error");
      }else if(showLoading){ setMessage(""); }
    }catch(error){
      console.error(error);
      setMessage(`불러오기 실패: ${error?.message||"알 수 없는 오류"}`,"error");
      $("storageBody").innerHTML=`<tr><td class="empty">데이터를 불러오지 못했습니다.</td></tr>`;
    }
  }

  function bindEvents(){
    $("storageViewBtn").addEventListener("click",()=>switchView("storage"));
    $("usageViewBtn").addEventListener("click",()=>switchView("usage"));

    $("yearSelect").addEventListener("change",async()=>{state.year=Number($("yearSelect").value);await refresh();});
    $("monthSelect").addEventListener("change",async()=>{state.month=Number($("monthSelect").value);await refresh();});
    $("storageHead").addEventListener("click",(e)=>{
      const btn=e.target.closest("[data-shift-month]");
      if(!btn) return;
      shiftMonth(Number(btn.dataset.shiftMonth)||0);
    });
    $("searchInput").addEventListener("input",()=>{state.query=$("searchInput").value;renderBody();syncSaveButton();});
    $("stockFilter").addEventListener("change",()=>{state.stockFilter=$("stockFilter").value;renderBody();syncSaveButton();});
    $("saveQuantities").addEventListener("click",saveAll);

    $("usageYearSelect").addEventListener("change",async()=>{state.usageYear=Number($("usageYearSelect").value);await loadUsageLog();});
    $("usageMonthSelect").addEventListener("change",async()=>{state.usageMonth=Number($("usageMonthSelect").value);await loadUsageLog();});
    $("usageSearchInput").addEventListener("input",()=>{state.usageQuery=$("usageSearchInput").value;renderUsageLog();});
    $("usageAccidentFilter").addEventListener("change",()=>{state.usageAccidentFilter=$("usageAccidentFilter").value;renderUsageLog();});
    $("usageLogBody").addEventListener("click",e=>{
      const detail=e.target.closest("[data-usage-detail]");
      if(detail) openUsageDetail(detail.dataset.usageDetail);
    });
    $("usageDetailClose").addEventListener("click",closeUsageDetail);
    $("usageDetailModal").addEventListener("click",e=>{ if(e.target===$("usageDetailModal")) closeUsageDetail(); });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !$("usageDetailModal").hidden) closeUsageDetail(); });

    window.addEventListener("message",e=>{const p=e?.data||{};if(p.type==="portal-tabs-request"||p.type==="portal-filters-request")notifyPortal();});
  }

  function applyPermissionUi(){
    state.canManage=!!window.SDSApp?.isQaOperator?.();
    const saveBtn=$("saveQuantities");
    if(saveBtn){saveBtn.hidden=!state.canManage;saveBtn.style.display=state.canManage?"":"none";}
    const guide=$("saveGuide");
    if(guide && !state.canManage) guide.textContent="조회 전용";
  }

  async function init(){
    applyPermissionUi(); fillPeriodOptions(); bindEvents(); notifyPortal(); await switchView("storage"); await refresh();
  }

  document.addEventListener("DOMContentLoaded",init);
})();
