(() => {
  "use strict";
  const db = window.SDSApp?.db;
  if (!db) { alert("Supabase 연결을 확인할 수 없습니다."); return; }

  const $ = id => document.getElementById(id);
  let rows = [];
  let isSaving = false;
  let productMatches = new Map();
  let receiptMatches = new Map();
  let openStatusId = null;
  let openMasterId = null;

  const canManageQa = () => {
    try { return !!window.SDSApp?.isQaOperator?.(); } catch (_) { return false; }
  };

  function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function stateOf(row){const t=todayISO();if(row.effective_from&&t<row.effective_from)return"scheduled";if(row.effective_to){if(t>=row.effective_to)return"ended";return"ending";}return"active";}
  const stateLabel={active:"적용중",scheduled:"적용예정",ending:"제외예정",ended:"제외"};
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function normalizeCas(v){return String(v||"").trim().replace(/\s+/g,"");}
  function formatNumber(v){if(v===null||v===undefined||v===""||Number.isNaN(Number(v)))return "";const n=Number(v);return Number.isInteger(n)?String(n):String(n).replace(/0+$/,"").replace(/\.$/,"");}
  function compactThreshold(r){
    const unit=String(r.threshold_unit||"%").trim()||"%";
    if(r.threshold_type==="conditional"){
      const g=formatNumber(r.general_threshold_value), sp=formatNumber(r.special_threshold_value);
      if(!g&&!sp)return "-";
      if(g&&sp)return `${g}${unit}/${sp}${unit}↑`;
      return `${g||sp}${unit}↑`;
    }
    const v=formatNumber(r.threshold_value);
    return v?`${v}${unit}↑`:"-";
  }
  function thresholdText(r){
    const unit=String(r.threshold_unit||"%").trim()||"%", basis=String(r.threshold_basis||"").trim();
    if(r.threshold_type==="conditional"){
      const g=formatNumber(r.general_threshold_value), sp=formatNumber(r.special_threshold_value), parts=[];
      if(g)parts.push(`일반 ${g}${unit}`);if(sp)parts.push(`특별관리 해당 ${sp}${unit}`);
      return parts.length?`${parts.join(" · ")}${basis?` · ${basis}`:""}`:"-";
    }
    const v=formatNumber(r.threshold_value);return v?`${v}${unit} 이상${basis?` · ${basis}`:""}`:"-";
  }
  function casValues(r){const list=(r.qa_special_substance_cas||[]).slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||(a.id??0)-(b.id??0)).map(x=>x.cas_no).filter(Boolean);return list.length?list:(r.cas_no?[r.cas_no]:[]);}
  function primaryCas(r){const list=casValues(r);return list[0]||"-";}
  function allCasText(r){const list=casValues(r);return list.length?list.join(" / "):"-";}
  function badge(r){const s=stateOf(r);return `<span class="badge ${s}">${stateLabel[s]}</span>`;}
  function productsFor(r){
    const byProduct=new Map();
    casValues(r).forEach(cas=>{
      const normalized=normalizeCas(cas);
      (productMatches.get(normalized)||[]).forEach(match=>{
        const p=match.product||match, key=String(p.id);let item=byProduct.get(key);
        if(!item){item={...p,_matchedCas:[]};byProduct.set(key,item);}
        const casInfo=match.casInfo||{cas_no:cas,content_min:null,content_max:null};
        if(!item._matchedCas.some(x=>normalizeCas(x.cas_no)===normalizeCas(casInfo.cas_no)))item._matchedCas.push(casInfo);
      });
    });
    return Array.from(byProduct.values());
  }
  function periodRange(){
    const type=$("orderPeriod")?.value||"1y";
    if(type==="all")return {start:null,end:null};
    if(type==="custom")return {start:$("orderStartDate")?.value||null,end:$("orderEndDate")?.value||null};
    const years=type==="5y"?5:type==="3y"?3:1,end=todayISO(),d=new Date(`${end}T00:00:00`);d.setFullYear(d.getFullYear()-years);
    return {start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,end};
  }
  function receiptInfoForProduct(productId){const dates=(receiptMatches.get(String(productId))||[]).filter(Boolean);const {start,end}=periodRange();const filtered=dates.filter(d=>(!start||d>=start)&&(!end||d<=end)).sort();return filtered.length?{ordered:true,latestReceiptDate:filtered[filtered.length-1],receiptCount:filtered.length}:null;}
  function latestDateForProducts(products){const dates=products.map(p=>receiptInfoForProduct(p.id)?.latestReceiptDate).filter(Boolean).sort();return dates.length?dates[dates.length-1]:null;}
  function productSortByReceipt(a,b){const ad=receiptInfoForProduct(a.id)?.latestReceiptDate||"",bd=receiptInfoForProduct(b.id)?.latestReceiptDate||"";if(ad!==bd)return bd.localeCompare(ad);return String(a.name||"").localeCompare(String(b.name||""),"ko");}
  function contentText(casInfo){const rawMin=casInfo?.content_min,rawMax=casInfo?.content_max;const hasMin=rawMin!==null&&rawMin!==undefined&&rawMin!==""&&!Number.isNaN(Number(rawMin)),hasMax=rawMax!==null&&rawMax!==undefined&&rawMax!==""&&!Number.isNaN(Number(rawMax));const min=hasMin?Number(rawMin):null,max=hasMax?Number(rawMax):null;if(hasMin&&hasMax){if(min===max)return `${formatNumber(min)}%`;return `${formatNumber(min)}~${formatNumber(max)}%`;}if(hasMin)return `${formatNumber(min)}% 이상`;if(hasMax)return `${formatNumber(max)}% 이하`;return "";}
  function matchedCasText(p){const list=Array.isArray(p._matchedCas)?p._matchedCas:[];if(!list.length||Number(p._casCount||0)<=1)return "";return list.map(info=>`CAS ${info.cas_no||"-"}${contentText(info)?` · ${contentText(info)}`:""}`).join(" / ");}

  async function loadProductAndReceipts(){
    productMatches=new Map();receiptMatches=new Map();
    const session=window.SDSApp?.getPortalSession?.()||{};const companyId=session.activeCompanyId||session.company_id||session.companyId||null;
    let pq=db.from("product_master").select("id, company_id, category, name, maker, code, capacity, cas, grade, is_active").eq("is_active",true).eq("category","시약");if(companyId)pq=pq.eq("company_id",companyId);
    const {data:products,error:pErr}=await pq;if(pErr)throw pErr;const productIds=(products||[]).map(p=>p.id);if(!productIds.length)return;
    const productCasByProduct=new Map(),chunkSize=150;
    for(let i=0;i<productIds.length;i+=chunkSize){const ids=productIds.slice(i,i+chunkSize);const {data:casRows,error:casErr}=await db.from("product_cas").select("product_id, cas_no, content_min, content_max, sort_order, id").in("product_id",ids).order("sort_order",{ascending:true}).order("id",{ascending:true});if(casErr)throw casErr;(casRows||[]).forEach(row=>{if(row.product_id==null)return;const id=String(row.product_id),list=productCasByProduct.get(id)||[],cas=normalizeCas(row.cas_no);if(cas&&!list.some(item=>normalizeCas(item.cas_no)===cas))list.push({cas_no:row.cas_no,content_min:row.content_min,content_max:row.content_max});productCasByProduct.set(id,list);});}
    (products||[]).forEach(p=>{const casList=productCasByProduct.get(String(p.id))||[],effectiveCasList=casList.length?casList:(normalizeCas(p.cas)?[{cas_no:p.cas,content_min:null,content_max:null}]:[]);p._casCount=effectiveCasList.length;effectiveCasList.forEach(casInfo=>{const key=normalizeCas(casInfo.cas_no);if(!key)return;if(!productMatches.has(key))productMatches.set(key,[]);const matched=productMatches.get(key);if(!matched.some(item=>String(item.product?.id||item.id)===String(p.id)))matched.push({product:p,casInfo});});});
    for(let i=0;i<productIds.length;i+=chunkSize){const ids=productIds.slice(i,i+chunkSize);let oq=db.from("reagent_collect_items").select("product_id, receipt_date").in("product_id",ids).not("receipt_date","is",null);if(companyId)oq=oq.eq("company_id",companyId);const {data:orders,error:oErr}=await oq;if(oErr)throw oErr;(orders||[]).forEach(o=>{if(o.product_id==null)return;const key=String(o.product_id),dates=receiptMatches.get(key)||[];if(o.receipt_date&&!dates.includes(o.receipt_date))dates.push(o.receipt_date);receiptMatches.set(key,dates);});}
  }

  function filtered(searchId,statusId,typeId){const q=($(searchId)?.value||"").trim().toLowerCase(),status=$(statusId)?.value||"all",type=$(typeId)?.value||"all";return rows.filter(r=>{const text=`${r.name_ko||""} ${r.name_en||""} ${r.cas_no||""} ${casValues(r).join(" ")} ${r.condition_text||""}`.toLowerCase();const typeMatch=type==="all"||(type==="conditional"?!!r.is_conditional:!r.is_conditional);return(!q||text.includes(q))&&(status==="all"||stateOf(r)===status)&&typeMatch;});}
  function renderSummary(){$("totalCount").textContent=`${rows.length}종`;$('activeCount').textContent=`${rows.filter(r=>stateOf(r)==='active').length}종`;$('scheduledCount').textContent=`${rows.filter(r=>stateOf(r)==='scheduled').length}종`;$('endedCount').textContent=`${rows.filter(r=>['ending','ended'].includes(stateOf(r))).length}종`;}

  function statusDetail(r){
    const products=productsFor(r).slice().sort(productSortByReceipt), receivedProducts=products.filter(p=>receiptInfoForProduct(p.id)?.ordered), latest=latestDateForProducts(receivedProducts);
    const productsHtml=receivedProducts.length?receivedProducts.map(p=>{const oi=receiptInfoForProduct(p.id),parts=[p.name,p.maker,p.code,p.capacity].filter(Boolean),casLine=matchedCasText(p);return `<div class="product-item"><div class="product-name">${esc(parts.join(" / ")||`제품 #${p.id}`)}</div>${casLine?`<div class="product-meta">${esc(casLine)}</div>`:""}<div class="product-receipt">최근 입고 ${esc(oi?.latestReceiptDate||"-")}</div></div>`;}).join(""):`<div class="no-products">선택한 기간 내 입고제품이 없습니다.</div>`;
    return `<div class="detail-grid"><div class="detail-item"><span class="detail-label">CAS No.</span><div class="detail-value">${esc(allCasText(r))}</div></div><div class="detail-item"><span class="detail-label">상태</span><div class="detail-value">${badge(r)}</div></div><div class="detail-item full"><span class="detail-label">혼합물 기준</span><div class="detail-value">${esc(thresholdText(r))}</div></div>${r.is_conditional&&r.condition_text?`<div class="detail-item full"><span class="detail-label">조건</span><div class="detail-value">${esc(r.condition_text)}</div></div>`:""}<div class="detail-item"><span class="detail-label">입고확인</span><div class="detail-value">${receivedProducts.length}제품</div></div><div class="detail-item"><span class="detail-label">최근 입고일</span><div class="detail-value">${esc(latest||"-")}</div></div><div class="detail-item full"><span class="detail-label">연결제품</span><div class="product-list">${productsHtml}</div></div></div>`;
  }

  function renderStatus(){
    const list=filtered("statusSearch","statusFilter","statusType").slice().sort((a,b)=>{const aLatest=latestDateForProducts(productsFor(a).filter(p=>receiptInfoForProduct(p.id)?.ordered))||"",bLatest=latestDateForProducts(productsFor(b).filter(p=>receiptInfoForProduct(p.id)?.ordered))||"";if(aLatest!==bLatest)return bLatest.localeCompare(aLatest);return String(a.name_ko||"").localeCompare(String(b.name_ko||""),"ko");});
    const matchedCount=rows.filter(r=>productsFor(r).length>0).length,receivedCount=rows.filter(r=>productsFor(r).some(p=>receiptInfoForProduct(p.id)?.ordered)).length;
    $("matchedSubstanceCount").textContent=`${matchedCount}종`;$("orderedSubstanceCount").textContent=`${receivedCount}종`;
    if(openStatusId&&!list.some(r=>String(r.id)===String(openStatusId)))openStatusId=null;
    $("statusList").innerHTML=list.length?list.map(r=>{const expanded=String(openStatusId)===String(r.id);return `<article class="substance-card${expanded?" expanded":""}" data-card-id="${r.id}"><button class="substance-toggle" type="button" data-toggle-status="${r.id}" aria-expanded="${expanded}"><div class="card-line1"><span class="name-ko">${esc(r.name_ko||"-")}</span><span class="cas-main">${esc(primaryCas(r))}</span></div><div class="name-en">${esc(r.name_en||"-")}</div></button><div class="card-detail">${expanded?statusDetail(r):""}</div></article>`;}).join(""):`<div class="empty-card">조건에 맞는 특별관리물질이 없습니다.</div>`;
  }

  function masterDetail(r){
    return `<div class="detail-grid"><div class="detail-item"><span class="detail-label">CAS No.</span><div class="detail-value">${esc(allCasText(r))}</div></div><div class="detail-item"><span class="detail-label">상태</span><div class="detail-value">${badge(r)}</div></div><div class="detail-item"><span class="detail-label">유형</span><div class="detail-value">${esc(r.is_conditional?"조건부":"특별관리물질")}</div></div><div class="detail-item"><span class="detail-label">기준 방식</span><div class="detail-value">${esc(r.threshold_basis||"-")}</div></div><div class="detail-item full"><span class="detail-label">혼합물 기준</span><div class="detail-value">${esc(thresholdText(r))}</div></div>${r.is_conditional&&r.condition_text?`<div class="detail-item full"><span class="detail-label">조건</span><div class="detail-value">${esc(r.condition_text)}</div></div>`:""}<div class="detail-item"><span class="detail-label">시행일</span><div class="detail-value">${esc(r.effective_from||"-")}</div></div><div class="detail-item"><span class="detail-label">제외일</span><div class="detail-value">${esc(r.effective_to||"-")}</div></div>${r.note?`<div class="detail-item full"><span class="detail-label">비고</span><div class="detail-value">${esc(r.note)}</div></div>`:""}</div><div class="card-actions"><button class="mini-btn" type="button" data-edit="${r.id}">수정</button><button class="mini-btn danger" type="button" data-delete="${r.id}">삭제</button></div>`;
  }

  function renderMaster(){
    if(!canManageQa()){$("masterList").innerHTML="";return;}
    const list=filtered("masterSearch","masterStatus","masterType");if(openMasterId&&!list.some(r=>String(r.id)===String(openMasterId)))openMasterId=null;
    $("masterList").innerHTML=list.length?list.map(r=>{const expanded=String(openMasterId)===String(r.id);return `<article class="substance-card${expanded?" expanded":""}" data-card-id="${r.id}"><button class="substance-toggle" type="button" data-toggle-master="${r.id}" aria-expanded="${expanded}"><div class="card-line1"><span class="name-ko">${esc(r.name_ko||"-")}</span><span class="cas-main">${esc(primaryCas(r))}</span></div><div class="name-en">${esc(r.name_en||"-")}</div><div class="criterion-compact">기준 ${esc(compactThreshold(r))}</div></button><div class="card-detail">${expanded?masterDetail(r):""}</div></article>`;}).join(""):`<div class="empty-card">조건에 맞는 기준정보가 없습니다.</div>`;
  }

  async function load(){
    setMessage("기준정보를 불러오는 중입니다.");$("statusMessage").textContent="기준정보를 불러오는 중입니다.";
    const {data,error}=await db.from("qa_special_substances").select("*, qa_special_substance_cas(id, cas_no, sort_order)").order("name_ko",{ascending:true});
    if(error){console.error(error);setMessage(`불러오기 실패: ${error.message}`,true);$("statusMessage").textContent=`불러오기 실패: ${error.message}`;$("statusMessage").classList.add("error");return;}
    rows=data||[];let matchError=null;try{await loadProductAndReceipts();}catch(error2){console.error("제품/입고 연동 실패",error2);matchError=error2;}
    setMessage("");$("statusMessage").textContent=matchError?`제품/입고 연동 실패: ${matchError?.message||"알 수 없는 오류"}`:"";$("statusMessage").classList.toggle("error",!!matchError);
    renderSummary();renderStatus();renderMaster();
  }
  function setMessage(msg,error=false){const el=$("message");el.textContent=msg||"";el.classList.toggle("error",!!error);}
  function switchView(view){if(view==="master"&&!canManageQa())view="status";const master=view==="master";$("statusView").hidden=master;$("masterView").hidden=!master;$("statusViewBtn").classList.toggle("active",!master);$("masterViewBtn").classList.toggle("active",master);}

  function addCasInput(value=""){const row=document.createElement("div");row.className="cas-input-row";row.innerHTML=`<input class="cas-input" type="text" placeholder="예: 71-43-2" value="${esc(value)}"><button class="mini-btn cas-remove-btn" type="button">삭제</button>`;row.querySelector(".cas-remove-btn").addEventListener("click",()=>{const all=$("casInputs").querySelectorAll(".cas-input-row");if(all.length===1)row.querySelector("input").value="";else row.remove();});$("casInputs").appendChild(row);}
  function getCasInputs(){const vals=[...$("casInputs").querySelectorAll(".cas-input")].map(x=>x.value.trim()).filter(Boolean);return [...new Set(vals)];}
  function syncConditionalUI(){const conditional=$("conditionType").value==="conditional";$("conditionTextWrap").hidden=!conditional;if(!conditional)$("conditionText").value="";}
  function syncThresholdUI(){const conditional=$("thresholdType").value==="conditional";$("singleThresholdWrap").hidden=conditional;$("generalThresholdWrap").hidden=!conditional;$("specialThresholdWrap").hidden=!conditional;}
  function openModal(row=null){if(!canManageQa()){alert("조회 전용 사용자입니다. 기준관리는 QA 운영자만 사용할 수 있습니다.");return;}$("editForm").reset();$("casInputs").innerHTML="";$("thresholdUnit").value="%";$("thresholdBasis").value="중량비율";$("matchType").value="single";$("conditionType").value="normal";$("thresholdType").value="single";$("editId").value=row?.id||"";$("nameKo").value=row?.name_ko||"";$("nameEn").value=row?.name_en||"";const cases=row?casValues(row):[];(cases.length?cases:[""]).forEach(addCasInput);$("matchType").value=row?.match_type||"single";$("conditionType").value=row?.is_conditional?"conditional":"normal";$("conditionText").value=row?.condition_text||"";$("thresholdType").value=row?.threshold_type||"single";$("thresholdValue").value=row?.threshold_value??"";$("generalThresholdValue").value=row?.general_threshold_value??"";$("specialThresholdValue").value=row?.special_threshold_value??"";$("thresholdUnit").value=row?.threshold_unit||"%";$("thresholdBasis").value=row?.threshold_basis||"중량비율";$("effectiveFrom").value=row?.effective_from||"";$("effectiveTo").value=row?.effective_to||"";$("note").value=row?.note||"";syncConditionalUI();syncThresholdUI();$("modalTitle").textContent=row?"특별관리물질 수정":"특별관리물질 신규 입력";$("editModal").hidden=false;}
  function closeModal(){if(!isSaving)$("editModal").hidden=true;}

  async function save(e){
    e.preventDefault();if(!canManageQa()){alert("조회 전용 사용자입니다. 기준관리는 QA 운영자만 사용할 수 있습니다.");return;}if(isSaving)return;
    const id=$("editId").value,casList=getCasInputs(),isConditional=$("conditionType").value==="conditional";
    const payload={name_ko:$("nameKo").value.trim(),name_en:$("nameEn").value.trim()||null,cas_no:casList[0]||null,match_type:$("matchType").value,threshold_type:$("thresholdType").value,threshold_value:$("thresholdType").value==="single"?($("thresholdValue").value===""?null:Number($("thresholdValue").value)):null,general_threshold_value:$("thresholdType").value==="conditional"?($("generalThresholdValue").value===""?null:Number($("generalThresholdValue").value)):null,special_threshold_value:$("thresholdType").value==="conditional"?($("specialThresholdValue").value===""?null:Number($("specialThresholdValue").value)):null,threshold_unit:$("thresholdUnit").value.trim()||"%",threshold_basis:$("thresholdBasis").value.trim()||"중량비율",is_conditional:isConditional,condition_text:isConditional?($("conditionText").value.trim()||null):null,effective_from:$("effectiveFrom").value||null,effective_to:$("effectiveTo").value||null,note:$("note").value.trim()||null};
    if(!payload.name_ko)return;if(payload.match_type==="single"&&!casList.length){alert("단일물질은 CAS No를 1개 이상 입력해 주세요.");return;}if(isConditional&&!payload.condition_text){alert("조건부 물질은 조건 내용을 입력해 주세요.");return;}if(payload.threshold_type==="single"&&payload.threshold_value===null){alert("특별관리물질의 혼합물 기준값을 입력해 주세요.");return;}if(payload.threshold_type==="conditional"&&(payload.general_threshold_value===null||payload.special_threshold_value===null)){alert("조건부는 일반 기준값과 특별관리 해당 기준값을 모두 입력해 주세요.");return;}if(payload.effective_from&&payload.effective_to&&payload.effective_to<payload.effective_from){alert("제외일은 시행일보다 빠를 수 없습니다.");return;}
    const submitBtn=$("editForm").querySelector('button[type="submit"]'),originalText=submitBtn?.textContent||"저장";isSaving=true;if(submitBtn){submitBtn.disabled=true;submitBtn.textContent="저장 중...";}
    try{const session=window.SDSApp?.getPortalSession?.()||{};let substanceId=id?Number(id):null,parentResult;if(id)parentResult=await db.from("qa_special_substances").update(payload).eq("id",substanceId).select("id").single();else{payload.created_by=session.email||session.user?.email||null;parentResult=await db.from("qa_special_substances").insert(payload).select("id").single();}if(parentResult.error)throw parentResult.error;substanceId=parentResult.data.id;const del=await db.from("qa_special_substance_cas").delete().eq("substance_id",substanceId);if(del.error)throw del.error;if(casList.length){const casRows=casList.map((cas_no,i)=>({substance_id:substanceId,cas_no,sort_order:i})),ins=await db.from("qa_special_substance_cas").insert(casRows);if(ins.error)throw ins.error;}$("editModal").hidden=true;openMasterId=substanceId;await load();}
    catch(error){console.error(error);alert(`저장 실패: ${error?.message||"알 수 없는 오류"}`);}finally{isSaving=false;if(submitBtn){submitBtn.disabled=false;submitBtn.textContent=originalText;}}
  }
  async function deleteRow(row){if(!canManageQa()){alert("조회 전용 사용자입니다. 기준관리는 QA 운영자만 사용할 수 있습니다.");return;}if(!row)return;const ok=confirm(`"${row.name_ko}" 기준정보를 완전히 삭제할까요?\n\n잘못 입력한 자료를 삭제할 때만 사용하세요.\n법령상 제외된 물질은 삭제하지 말고 '제외일'을 입력해 주세요.`);if(!ok)return;const {error}=await db.from("qa_special_substances").delete().eq("id",row.id);if(error){console.error(error);alert(`삭제 실패: ${error.message}`);return;}openMasterId=null;await load();}

  function applyPermissionUi(){const manage=canManageQa();$("masterViewBtn").hidden=!manage;$("masterViewBtn").style.display=manage?"":"none";if(!manage){$("masterView").hidden=true;$("statusView").hidden=false;}}

  applyPermissionUi();
  $("statusViewBtn").addEventListener("click",()=>switchView("status"));$("masterViewBtn").addEventListener("click",()=>switchView("master"));
  $("statusList").addEventListener("click",e=>{const btn=e.target.closest("[data-toggle-status]");if(!btn)return;const id=btn.dataset.toggleStatus;openStatusId=String(openStatusId)===String(id)?null:id;renderStatus();});
  $("masterList").addEventListener("click",e=>{const toggle=e.target.closest("[data-toggle-master]");if(toggle){const id=toggle.dataset.toggleMaster;openMasterId=String(openMasterId)===String(id)?null:id;renderMaster();return;}const editBtn=e.target.closest("[data-edit]");if(editBtn){const row=rows.find(r=>String(r.id)===editBtn.dataset.edit);if(row)openModal(row);return;}const deleteBtn=e.target.closest("[data-delete]");if(deleteBtn){const row=rows.find(r=>String(r.id)===deleteBtn.dataset.delete);if(row)deleteRow(row);}});
  $("newBtn").addEventListener("click",()=>openModal());$("addCasBtn").addEventListener("click",()=>addCasInput());$("conditionType").addEventListener("change",syncConditionalUI);$("thresholdType").addEventListener("change",syncThresholdUI);$("closeModal").addEventListener("click",closeModal);$("cancelBtn").addEventListener("click",closeModal);$("editModal").addEventListener("click",e=>{if(e.target===$("editModal"))closeModal();});$("editForm").addEventListener("submit",save);
  ["statusSearch","statusFilter","statusType"].forEach(id=>$(id).addEventListener("input",renderStatus));["masterSearch","masterStatus","masterType"].forEach(id=>$(id).addEventListener("input",renderMaster));
  $("orderPeriod").addEventListener("change",()=>{$("customPeriod").hidden=$("orderPeriod").value!=="custom";renderStatus();});
  ["orderStartDate","orderEndDate"].forEach(id=>$(id).addEventListener("change",()=>{if($("orderStartDate").value&&$("orderEndDate").value&&$("orderEndDate").value<$("orderStartDate").value)$("orderEndDate").value=$("orderStartDate").value;renderStatus();}));
  switchView("status");load();
})();
