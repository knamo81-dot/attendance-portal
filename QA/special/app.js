(() => {
  "use strict";
  const db = window.SDSApp?.db;
  if (!db) { alert("Supabase 연결을 확인할 수 없습니다."); return; }

  const $ = id => document.getElementById(id);
  let rows = [];
  let isSaving = false;
  let productMatches = new Map();
  let orderMatches = new Map();

  function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function stateOf(row){const t=todayISO();if(row.effective_from&&t<row.effective_from)return"scheduled";if(row.effective_to){if(t>=row.effective_to)return"ended";return"ending";}return"active";}
  const stateLabel={active:"적용중",scheduled:"적용예정",ending:"제외예정",ended:"제외"};
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function thresholdText(r){const unit=esc(r.threshold_unit||"%");const basis=esc(r.threshold_basis||"");if(r.threshold_type==="conditional"){const g=r.general_threshold_value;const sp=r.special_threshold_value;if((g===null||g===undefined||g==="")&&(sp===null||sp===undefined||sp===""))return"-";const parts=[];if(g!==null&&g!==undefined&&g!=="")parts.push(`일반 ${g}${unit}`);if(sp!==null&&sp!==undefined&&sp!=="")parts.push(`특별관리 해당 ${sp}${unit}`);return `${parts.join(" · ")} ${basis}`.trim();}if(r.threshold_value===null||r.threshold_value===undefined||r.threshold_value==="")return"-";return `${r.threshold_value}${unit} ${basis} 이상`.trim();}
  function casValues(r){const list=(r.qa_special_substance_cas||[]).slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||(a.id??0)-(b.id??0)).map(x=>x.cas_no).filter(Boolean);return list.length?list:(r.cas_no?[r.cas_no]:[]);}
  function casHtml(r){const list=casValues(r);return list.length?`<div class="cas-list">${list.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:"-";}
  function conditionHtml(r){return r.is_conditional&&r.condition_text?`<span class="condition-note">조건부 · ${esc(r.condition_text)}</span>`:"";}
  function normalizeCas(v){return String(v||"").trim().replace(/\s+/g,"");}
  function productsFor(r){
    const seen=new Set(), out=[];
    casValues(r).forEach(cas=>{
      (productMatches.get(normalizeCas(cas))||[]).forEach(p=>{
        const key=String(p.id);
        if(!seen.has(key)){seen.add(key);out.push(p);}
      });
    });
    return out;
  }
  function periodRange(){
    const type=$("orderPeriod")?.value||"1y";
    if(type==="all")return {start:null,end:null};
    if(type==="custom")return {start:$("orderStartDate")?.value||null,end:$("orderEndDate")?.value||null};
    const years=type==="5y"?5:type==="3y"?3:1;
    const end=todayISO(), d=new Date(`${end}T00:00:00`);
    d.setFullYear(d.getFullYear()-years);
    const start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return {start,end};
  }
  function orderInfoForProduct(productId){
    const dates=(orderMatches.get(String(productId))||[]).filter(Boolean);
    const {start,end}=periodRange();
    const filtered=dates.filter(d=>(!start||d>=start)&&(!end||d<=end)).sort();
    return filtered.length?{ordered:true,latestOrderDate:filtered[filtered.length-1],orderCount:filtered.length}:null;
  }
  function latestDateForProducts(products){
    const dates=products.map(p=>orderInfoForProduct(p.id)?.latestOrderDate).filter(Boolean).sort();
    return dates.length?dates[dates.length-1]:null;
  }
  function productSort(a,b){
    const ad=orderInfoForProduct(a.id)?.latestOrderDate||"", bd=orderInfoForProduct(b.id)?.latestOrderDate||"";
    if(ad!==bd)return bd.localeCompare(ad);
    return String(a.name||"").localeCompare(String(b.name||""),"ko");
  }
  function productDisplay(p){
    const parts=[p.name,p.maker,p.code,p.capacity].filter(Boolean), oi=orderInfoForProduct(p.id);
    return `<div class="matched-product${oi?.ordered?" ordered":""}"><span class="product-name">${esc(parts.join(" / ")||`제품 #${p.id}`)}</span>${oi?.ordered?`<span class="order-date">${esc(oi.latestOrderDate||"-")}</span>`:`<span class="no-order">기간 내 발주 없음</span>`}</div>`;
  }
  async function loadProductAndOrders(){
    productMatches=new Map();orderMatches=new Map();
    const session=window.SDSApp?.getPortalSession?.()||{};
    const companyId=session.activeCompanyId||session.company_id||session.companyId||null;

    let pq=db.from("product_master")
      .select("id, company_id, category, name, maker, code, capacity, cas, grade, is_active")
      .eq("is_active",true)
      .eq("category","시약");
    if(companyId)pq=pq.eq("company_id",companyId);
    const {data:products,error:pErr}=await pq;
    if(pErr)throw pErr;

    const productIds=(products||[]).map(p=>p.id);
    if(!productIds.length)return;

    // CAS 기준정보는 product_master.cas가 아니라 product_cas 전체 CAS를 사용합니다.
    // product_cas가 아직 없는 기존 제품만 product_master.cas를 fallback으로 사용합니다.
    const productCasByProduct=new Map();
    const chunkSize=150;
    for(let i=0;i<productIds.length;i+=chunkSize){
      const ids=productIds.slice(i,i+chunkSize);
      const {data:casRows,error:casErr}=await db.from("product_cas")
        .select("product_id, cas_no, sort_order, id")
        .in("product_id",ids)
        .order("sort_order",{ascending:true})
        .order("id",{ascending:true});
      if(casErr)throw casErr;
      (casRows||[]).forEach(row=>{
        if(row.product_id==null)return;
        const id=String(row.product_id);
        const list=productCasByProduct.get(id)||[];
        const cas=normalizeCas(row.cas_no);
        if(cas&&!list.includes(cas))list.push(cas);
        productCasByProduct.set(id,list);
      });
    }

    (products||[]).forEach(p=>{
      const casList=productCasByProduct.get(String(p.id))||[];
      const effectiveCasList=casList.length?casList:[normalizeCas(p.cas)].filter(Boolean);
      effectiveCasList.forEach(key=>{
        if(!productMatches.has(key))productMatches.set(key,[]);
        const matched=productMatches.get(key);
        if(!matched.some(item=>String(item.id)===String(p.id)))matched.push(p);
      });
    });

    // 발주이력은 product_id를 기준으로 기존 reagent_collect_items에서 조회합니다.
    for(let i=0;i<productIds.length;i+=chunkSize){
      const ids=productIds.slice(i,i+chunkSize);
      let oq=db.from("reagent_collect_items")
        .select("product_id, order_date")
        .in("product_id",ids)
        .not("order_date","is",null);
      if(companyId)oq=oq.eq("company_id",companyId);
      const {data:orders,error:oErr}=await oq;
      if(oErr)throw oErr;
      (orders||[]).forEach(o=>{
        if(o.product_id==null)return;
        const key=String(o.product_id);
        const dates=orderMatches.get(key)||[];
        if(o.order_date&&!dates.includes(o.order_date))dates.push(o.order_date);
        orderMatches.set(key,dates);
      });
    }
  }

  function filtered(searchId,statusId,typeId){const q=($(searchId)?.value||"").trim().toLowerCase();const status=$(statusId)?.value||"all";const type=$(typeId)?.value||"all";return rows.filter(r=>{const text=`${r.name_ko||""} ${r.name_en||""} ${r.cas_no||""} ${casValues(r).join(" ")} ${r.condition_text||""}`.toLowerCase();const typeMatch=type==="all"||(type==="conditional"?!!r.is_conditional:!r.is_conditional);return(!q||text.includes(q))&&(status==="all"||stateOf(r)===status)&&typeMatch;});}
  function badge(r){const s=stateOf(r);return `<span class="badge ${s}">${stateLabel[s]}</span>`;}
  function renderSummary(){$("totalCount").textContent=`${rows.length}종`;$('activeCount').textContent=`${rows.filter(r=>stateOf(r)==='active').length}종`;$('scheduledCount').textContent=`${rows.filter(r=>stateOf(r)==='scheduled').length}종`;$('endedCount').textContent=`${rows.filter(r=>['ending','ended'].includes(stateOf(r))).length}종`;}
  function renderStatus(){
    const list=filtered("statusSearch","statusFilter","statusType").slice().sort((a,b)=>{
      const aLatest=latestDateForProducts(productsFor(a).filter(p=>orderInfoForProduct(p.id)?.ordered))||"";
      const bLatest=latestDateForProducts(productsFor(b).filter(p=>orderInfoForProduct(p.id)?.ordered))||"";
      if(aLatest!==bLatest)return bLatest.localeCompare(aLatest);
      return String(a.name_ko||"").localeCompare(String(b.name_ko||""),"ko");
    });
    const matchedCount=rows.filter(r=>productsFor(r).length>0).length;
    const orderedCount=rows.filter(r=>productsFor(r).some(p=>orderInfoForProduct(p.id)?.ordered)).length;
    if($("matchedSubstanceCount"))$("matchedSubstanceCount").textContent=`${matchedCount}종`;
    if($("orderedSubstanceCount"))$("orderedSubstanceCount").textContent=`${orderedCount}종`;
    const rawLimit=$("displayLimit")?.value||"10", limit=rawLimit==="all"?Infinity:Number(rawLimit);
    $("statusList").innerHTML=list.length?list.map(r=>{
      const products=productsFor(r).slice().sort(productSort);
      const orderedProducts=products.filter(p=>orderInfoForProduct(p.id)?.ordered);
      const displayProducts=orderedProducts.slice(0,limit);
      const hiddenCount=Math.max(0,orderedProducts.length-displayProducts.length), latest=latestDateForProducts(orderedProducts);
      return `<tr><td class="strong">${esc(r.name_ko)}${r.name_en?`<span class="sub-name">${esc(r.name_en)}</span>`:""}</td><td>${casHtml(r)}</td><td>${thresholdText(r)}${conditionHtml(r)}</td><td>${orderedProducts.length?`<div class="product-list">${displayProducts.map(productDisplay).join("")}${hiddenCount?`<div class="more-products">+ ${hiddenCount}제품 더 있음</div>`:""}</div>`:`<span class="muted">기간 내 발주제품 없음</span>`}</td><td>${orderedProducts.length?`<span class="badge ordered-badge">${orderedProducts.length}제품</span>`:`<span class="muted">-</span>`}</td><td>${esc(latest||"-")}</td><td>${badge(r)}</td></tr>`;
    }).join(""):`<tr><td colspan="7" class="empty">등록된 특별관리물질이 없습니다.</td></tr>`;
  }
  function renderMaster(){const list=filtered("masterSearch","masterStatus","masterType");$("masterList").innerHTML=list.length?list.map(r=>`<tr><td class="strong">${esc(r.name_ko)}</td><td>${esc(r.name_en||"-")}</td><td>${casHtml(r)}</td><td>${r.is_conditional?'조건부':'특별관리물질'}</td><td>${thresholdText(r)}${conditionHtml(r)}</td><td>${esc(r.effective_from||"-")}</td><td>${esc(r.effective_to||"-")}</td><td>${badge(r)}</td><td class="actions-cell"><button class="mini-btn" data-edit="${r.id}" type="button">수정</button><button class="mini-btn danger" data-delete="${r.id}" type="button">삭제</button></td></tr>`).join(""):`<tr><td colspan="9" class="empty">등록된 특별관리물질이 없습니다.</td></tr>`;}

  async function load(){
    setMessage("기준정보를 불러오는 중입니다.");
    const {data,error}=await db.from("qa_special_substances")
      .select("*, qa_special_substance_cas(id, cas_no, sort_order)")
      .order("name_ko",{ascending:true});
    if(error){console.error(error);setMessage(`불러오기 실패: ${error.message}`,true);return;}
    rows=data||[];
    let matchError=null;
    try{
      await loadProductAndOrders();
    }catch(error){
      console.error("제품/발주 연동 실패",error);
      matchError=error;
    }
    setMessage("");
    renderSummary();renderStatus();renderMaster();
    const notice=$("matchNotice");
    if(notice){
      notice.textContent=matchError
        ? `기준정보는 정상입니다. 제품/발주 연동 실패: ${matchError?.message||"알 수 없는 오류"}`
        : "제품 CAS는 product_cas 전체 CAS를 기준으로 매칭하며, 현황에는 선택한 발주기간 내 실제 발주가 확인된 제품만 제품별 최신 발주일로 표시합니다.";
      notice.classList.toggle("error",!!matchError);
    }
  }
  function setMessage(msg,error=false){const el=$("message");el.textContent=msg||"";el.classList.toggle("error",!!error);}
  function switchView(view){const master=view==="master";$("statusView").hidden=master;$("masterView").hidden=!master;$("statusViewBtn").classList.toggle("active",!master);$("masterViewBtn").classList.toggle("active",master);$("pageTitle").textContent=master?"특별관리물질 기준관리":"특별관리물질 현황";$("pageDesc").textContent=master?"법령 기준 특별관리물질의 등록·수정 및 제외 정보를 관리합니다.":"특별관리물질 기준정보와 제품 연계 현황을 관리합니다.";}

  function addCasInput(value=""){const row=document.createElement("div");row.className="cas-input-row";row.innerHTML=`<input class="cas-input" type="text" placeholder="예: 71-43-2" value="${esc(value)}"><button class="mini-btn cas-remove-btn" type="button">삭제</button>`;row.querySelector(".cas-remove-btn").addEventListener("click",()=>{const all=$("casInputs").querySelectorAll(".cas-input-row");if(all.length===1){row.querySelector("input").value="";}else row.remove();});$("casInputs").appendChild(row);}
  function getCasInputs(){const vals=[...$("casInputs").querySelectorAll(".cas-input")].map(x=>x.value.trim()).filter(Boolean);return [...new Set(vals)];}
  function syncConditionalUI(){const conditional=$("conditionType").value==="conditional";$("conditionTextWrap").hidden=!conditional;if(!conditional)$("conditionText").value="";}
  function syncThresholdUI(){const conditional=$("thresholdType").value==="conditional";$("singleThresholdWrap").hidden=conditional;$("generalThresholdWrap").hidden=!conditional;$("specialThresholdWrap").hidden=!conditional;}
  function openModal(row=null){$("editForm").reset();$("casInputs").innerHTML="";$("thresholdUnit").value="%";$("thresholdBasis").value="중량비율";$("matchType").value="single";$("conditionType").value="normal";$("thresholdType").value="single";$("editId").value=row?.id||"";$("nameKo").value=row?.name_ko||"";$("nameEn").value=row?.name_en||"";const cases=row?casValues(row):[];(cases.length?cases:[""]).forEach(addCasInput);$("matchType").value=row?.match_type||"single";$("conditionType").value=row?.is_conditional?"conditional":"normal";$("conditionText").value=row?.condition_text||"";$("thresholdType").value=row?.threshold_type||"single";$("thresholdValue").value=row?.threshold_value??"";$("generalThresholdValue").value=row?.general_threshold_value??"";$("specialThresholdValue").value=row?.special_threshold_value??"";$("thresholdUnit").value=row?.threshold_unit||"%";$("thresholdBasis").value=row?.threshold_basis||"중량비율";$("effectiveFrom").value=row?.effective_from||"";$("effectiveTo").value=row?.effective_to||"";$("note").value=row?.note||"";syncConditionalUI();syncThresholdUI();$("modalTitle").textContent=row?"특별관리물질 수정":"특별관리물질 신규 입력";$("editModal").hidden=false;}
  function closeModal(){if(!isSaving)$("editModal").hidden=true;}

  async function save(e){e.preventDefault();if(isSaving)return;const id=$("editId").value;const casList=getCasInputs();const isConditional=$("conditionType").value==="conditional";const payload={name_ko:$("nameKo").value.trim(),name_en:$("nameEn").value.trim()||null,cas_no:casList[0]||null,match_type:$("matchType").value,threshold_type:$("thresholdType").value,threshold_value:$("thresholdType").value==="single"?($("thresholdValue").value===""?null:Number($("thresholdValue").value)):null,general_threshold_value:$("thresholdType").value==="conditional"?($("generalThresholdValue").value===""?null:Number($("generalThresholdValue").value)):null,special_threshold_value:$("thresholdType").value==="conditional"?($("specialThresholdValue").value===""?null:Number($("specialThresholdValue").value)):null,threshold_unit:$("thresholdUnit").value.trim()||"%",threshold_basis:$("thresholdBasis").value.trim()||"중량비율",is_conditional:isConditional,condition_text:isConditional?($("conditionText").value.trim()||null):null,effective_from:$("effectiveFrom").value||null,effective_to:$("effectiveTo").value||null,note:$("note").value.trim()||null};
    if(!payload.name_ko)return;if(payload.match_type==="single"&&!casList.length){alert("단일물질은 CAS No를 1개 이상 입력해 주세요.");return;}if(isConditional&&!payload.condition_text){alert("조건부 물질은 조건 내용을 입력해 주세요.");return;}if(payload.threshold_type==="single"&&payload.threshold_value===null){alert("특별관리물질의 혼합물 기준값을 입력해 주세요.");return;}if(payload.threshold_type==="conditional"&&(payload.general_threshold_value===null||payload.special_threshold_value===null)){alert("조건부는 일반 기준값과 특별관리 해당 기준값을 모두 입력해 주세요.");return;}if(payload.effective_from&&payload.effective_to&&payload.effective_to<payload.effective_from){alert("제외일은 시행일보다 빠를 수 없습니다.");return;}
    const submitBtn=$("editForm").querySelector('button[type="submit"]');const originalText=submitBtn?.textContent||"저장";isSaving=true;if(submitBtn){submitBtn.disabled=true;submitBtn.textContent="저장 중...";}
    try{const session=window.SDSApp?.getPortalSession?.()||{};let substanceId=id?Number(id):null;let parentResult;if(id){parentResult=await db.from("qa_special_substances").update(payload).eq("id",substanceId).select("id").single();}else{payload.created_by=session.email||session.user?.email||null;parentResult=await db.from("qa_special_substances").insert(payload).select("id").single();}if(parentResult.error)throw parentResult.error;substanceId=parentResult.data.id;
      const del=await db.from("qa_special_substance_cas").delete().eq("substance_id",substanceId);if(del.error)throw del.error;
      if(casList.length){const casRows=casList.map((cas_no,i)=>({substance_id:substanceId,cas_no,sort_order:i}));const ins=await db.from("qa_special_substance_cas").insert(casRows);if(ins.error)throw ins.error;}
      $("editModal").hidden=true;await load();
    }catch(error){console.error(error);alert(`저장 실패: ${error?.message||"알 수 없는 오류"}`);}finally{isSaving=false;if(submitBtn){submitBtn.disabled=false;submitBtn.textContent=originalText;}}
  }

  async function deleteRow(row){if(!row)return;const ok=confirm(`"${row.name_ko}" 기준정보를 완전히 삭제할까요?\n\n잘못 입력한 자료를 삭제할 때만 사용하세요.\n법령상 제외된 물질은 삭제하지 말고 '제외일'을 입력해 주세요.`);if(!ok)return;const {error}=await db.from("qa_special_substances").delete().eq("id",row.id);if(error){console.error(error);alert(`삭제 실패: ${error.message}`);return;}await load();}

  $("statusViewBtn").addEventListener("click",()=>switchView("status"));$("masterViewBtn").addEventListener("click",()=>switchView("master"));$("newBtn").addEventListener("click",()=>openModal());$("addCasBtn").addEventListener("click",()=>addCasInput());$("conditionType").addEventListener("change",syncConditionalUI);$("thresholdType").addEventListener("change",syncThresholdUI);$("closeModal").addEventListener("click",closeModal);$("cancelBtn").addEventListener("click",closeModal);$("editModal").addEventListener("click",e=>{if(e.target===$("editModal"))closeModal();});$("editForm").addEventListener("submit",save);["statusSearch","statusFilter","statusType"].forEach(id=>$(id).addEventListener("input",renderStatus));["masterSearch","masterStatus","masterType"].forEach(id=>$(id).addEventListener("input",renderMaster));$("masterList").addEventListener("click",e=>{const editBtn=e.target.closest("[data-edit]");if(editBtn){const row=rows.find(r=>String(r.id)===editBtn.dataset.edit);if(row)openModal(row);return;}const deleteBtn=e.target.closest("[data-delete]");if(deleteBtn){const row=rows.find(r=>String(r.id)===deleteBtn.dataset.delete);if(row)deleteRow(row);}});
  $("orderPeriod").addEventListener("change",()=>{$("customPeriod").hidden=$("orderPeriod").value!=="custom";renderStatus();});
  ["orderStartDate","orderEndDate"].forEach(id=>$(id).addEventListener("change",()=>{if($("orderStartDate").value&&$("orderEndDate").value&&$("orderEndDate").value<$("orderStartDate").value)$("orderEndDate").value=$("orderStartDate").value;renderStatus();}));
  $("displayLimit").addEventListener("change",renderStatus);
  switchView("status");load();
})();
