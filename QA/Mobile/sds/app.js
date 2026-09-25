(() => {
  "use strict";

  const BUCKET = "qa-sds-files";
  const db = window.SDSApp?.db;
  const $ = (id) => document.getElementById(id);

  const state = {
    products: [],
    query: "",
    status: "all",
    pdfFiles: [],
    pdfIndex: 0,
    pdfSignedUrls: []
  };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

  function setMessage(text = "", type = "") {
    const el = $("sdsMessage");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", type === "error");
  }

  function notifyPortal() {
    try {
      window.parent?.postMessage({ type:"portal-tabs-ready", tabs:[{id:"qa-sds",label:"SDS 관리"}], source:"qa-sds-mobile" }, "*");
      window.parent?.postMessage({ type:"portal-tab-active", activeTabId:"qa-sds", tabId:"qa-sds", source:"qa-sds-mobile" }, "*");
      window.parent?.postMessage({ type:"portal-filters-ready", enabled:false, filters:[], source:"qa-sds-mobile" }, "*");
    } catch (_) {}
  }

  function versionFiles(version) {
    if (!version) return [];
    if (Array.isArray(version.files) && version.files.length) return version.files.filter((f) => f?.file_path);
    return version.file_path ? [{ file_path:version.file_path, file_name:version.file_name || "SDS PDF", sort_order:1 }] : [];
  }

  function statusOf(product) {
    const docStatus = product?.sds_document?.status || "missing";
    if (docStatus === "registered") return versionFiles(product.current_version).length ? "registered" : "missing";
    return docStatus;
  }

  function productCasNumbers(product) {
    const values = Array.isArray(product?.cas_numbers)
      ? product.cas_numbers.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    if (values.length) return values;
    const fallback = String(product?.cas || "").trim();
    return fallback ? [fallback] : [];
  }

  function filteredProducts() {
    const q = state.query.trim().toLowerCase();
    return state.products.filter((product) => {
      const status = statusOf(product);
      if (state.status !== "all" && status !== state.status) return false;
      if (!q) return true;
      const values = [product.name, product.maker, product.code, product.capacity, product.grade, ...productCasNumbers(product)];
      return values.some((v) => String(v || "").toLowerCase().includes(q));
    });
  }

  function updateSummary() {
    const counts = { all:state.products.length, registered:0, missing:0, none:0 };
    state.products.forEach((product) => {
      const status = statusOf(product);
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    });
    $("sdsTotalCount").textContent = `${counts.all.toLocaleString()}건`;
    $("sdsAttachedCount").textContent = `${counts.registered.toLocaleString()}건`;
    $("sdsMissingCount").textContent = `${counts.missing.toLocaleString()}건`;
    $("sdsNoneCount").textContent = `${counts.none.toLocaleString()}건`;
  }

  function render() {
    updateSummary();
    const rows = filteredProducts();
    const list = $("sdsProductList");
    if (!rows.length) {
      list.innerHTML = '<div class="empty-card">조회된 제품이 없습니다.</div>';
      return;
    }

    list.innerHTML = rows.map((product) => {
      const status = statusOf(product);
      const meta = [product.maker, product.code, product.capacity, product.grade].filter(Boolean).join(" · ") || "-";
      const cas = productCasNumbers(product);
      const casText = cas.length ? `CAS ${cas.join(" / ")}` : "CAS -";
      let action = '<button class="state-btn" type="button" disabled>미등록</button>';
      if (status === "registered") action = `<button class="view-btn" type="button" data-view-id="${esc(product.id)}">보기</button>`;
      if (status === "none") action = '<button class="state-btn none" type="button" disabled>해당없음</button>';
      return `<article class="product-row">
        <div class="product-info">
          <div class="product-name">${esc(product.name || `제품 #${product.id}`)}</div>
          <div class="product-meta">${esc(meta)}</div>
          <div class="product-cas">${esc(casText)}</div>
        </div>
        <div class="sds-action">${action}</div>
      </article>`;
    }).join("");
  }

  async function loadProducts() {
    if (!db) {
      setMessage("Supabase 연결 정보를 확인할 수 없습니다.", "error");
      return;
    }
    const companyId = String(window.SDSApp?.getCompanyId?.() || "").trim();
    if (!companyId) {
      setMessage("회사 정보를 확인할 수 없습니다.", "error");
      $("sdsProductList").innerHTML = '<div class="empty-card">회사 정보를 확인할 수 없습니다.</div>';
      return;
    }

    setMessage("SDS 정보를 불러오는 중입니다.");
    try {
      const [productsRes, docsRes] = await Promise.all([
        db.from("product_master")
          .select("id,company_id,category,name,maker,code,capacity,cas,grade,is_active")
          .eq("company_id", companyId).eq("is_active", true).eq("category", "시약")
          .order("maker", {ascending:true}).order("name", {ascending:true}).order("capacity", {ascending:true}).order("code", {ascending:true}),
        db.from("qa_sds_documents")
          .select("id,company_id,product_id,status,last_checked_date,no_sds_reason,no_sds_note,created_at,updated_at")
          .eq("company_id", companyId)
      ]);
      const firstError = productsRes.error || docsRes.error;
      if (firstError) throw firstError;

      const products = productsRes.data || [];
      const productIds = products.map((p) => Number(p.id)).filter(Number.isFinite);
      let productCasRows = [];
      for (let i=0; i<productIds.length; i+=150) {
        const {data,error} = await db.from("product_cas")
          .select("id,product_id,cas_no,sort_order")
          .in("product_id", productIds.slice(i,i+150))
          .order("product_id", {ascending:true}).order("sort_order", {ascending:true}).order("id", {ascending:true});
        if (error) throw error;
        productCasRows.push(...(data || []));
      }

      const casByProduct = new Map();
      productCasRows.forEach((row) => {
        const productId = Number(row.product_id);
        const casNo = String(row.cas_no || "").trim();
        if (!productId || !casNo) return;
        const arr = casByProduct.get(productId) || [];
        if (!arr.includes(casNo)) arr.push(casNo);
        casByProduct.set(productId, arr);
      });

      const docs = docsRes.data || [];
      const docIds = docs.map((d) => Number(d.id)).filter(Number.isFinite);
      let versions = [];
      for (let i=0; i<docIds.length; i+=150) {
        const {data,error} = await db.from("qa_sds_versions")
          .select("id,sds_document_id,revision_date,file_path,file_name,file_size,registered_by,registered_at,is_current,deleted_at")
          .in("sds_document_id", docIds.slice(i,i+150))
          .eq("is_current", true).is("deleted_at", null);
        if (error) throw error;
        versions.push(...(data || []));
      }

      const versionIds = versions.map((v) => Number(v.id)).filter(Number.isFinite);
      let files = [];
      for (let i=0; i<versionIds.length; i+=150) {
        const {data,error} = await db.from("qa_sds_files")
          .select("id,sds_version_id,file_path,file_name,file_size,sort_order,created_at")
          .in("sds_version_id", versionIds.slice(i,i+150))
          .order("sort_order", {ascending:true});
        if (error) throw error;
        files.push(...(data || []));
      }

      const filesByVersion = new Map();
      files.forEach((file) => {
        const key = Number(file.sds_version_id);
        const arr = filesByVersion.get(key) || [];
        arr.push(file);
        filesByVersion.set(key, arr);
      });
      versions.forEach((version) => { version.files = filesByVersion.get(Number(version.id)) || []; });

      const docByProduct = new Map(docs.map((doc) => [Number(doc.product_id), doc]));
      const versionByDoc = new Map(versions.map((version) => [Number(version.sds_document_id), version]));
      state.products = products.map((product) => {
        const productId = Number(product.id);
        const doc = docByProduct.get(productId) || null;
        return {
          ...product,
          cas_numbers: casByProduct.get(productId) || [],
          sds_document: doc,
          current_version: doc ? (versionByDoc.get(Number(doc.id)) || null) : null
        };
      });

      setMessage("");
      render();
    } catch (error) {
      console.error("[Mobile SDS] load error", error);
      setMessage(`SDS 정보를 불러오지 못했습니다: ${error?.message || "알 수 없는 오류"}`, "error");
      $("sdsProductList").innerHTML = '<div class="empty-card">SDS 정보를 불러오지 못했습니다.</div>';
    }
  }

  async function makeSignedUrls(files) {
    return Promise.all(files.map(async (file) => {
      const {data,error} = await db.storage.from(BUCKET).createSignedUrl(file.file_path, 300);
      return {...file, signedUrl:error ? "" : data?.signedUrl || "", signedError:error?.message || ""};
    }));
  }

  function closePdf() {
    $("pdfModal").hidden = true;
    $("pdfFrame").removeAttribute("src");
    $("pdfTabs").innerHTML = "";
    state.pdfFiles = [];
    state.pdfSignedUrls = [];
    state.pdfIndex = 0;
  }

  function pdfFitUrl(url) {
    if (!url) return "";
    const clean = String(url).split("#")[0];
    // 모바일 PDF 뷰어의 최초 표시를 페이지 가로폭 맞춤으로 요청합니다.
    // 이후 확대/축소는 브라우저의 기본 핀치 줌을 그대로 사용합니다.
    return `${clean}#view=FitH&zoom=page-width`;
  }

  function showPdf(index) {
    const file = state.pdfSignedUrls[index];
    if (!file) return;
    state.pdfIndex = index;
    $("pdfFileName").textContent = file.file_name || `PDF ${index+1}`;
    $("pdfTabs").querySelectorAll("[data-pdf-index]").forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.pdfIndex) === index));
    const loading = $("pdfLoading");
    const frame = $("pdfFrame");
    loading.hidden = false;
    loading.textContent = file.signedUrl ? "PDF를 화면 폭에 맞춰 불러오는 중입니다." : `PDF를 불러오지 못했습니다: ${file.signedError || "URL 생성 실패"}`;
    frame.removeAttribute("src");
    if (file.signedUrl) frame.src = pdfFitUrl(file.signedUrl);
  }

  async function openCurrent(product) {
    const files = versionFiles(product.current_version);
    if (!files.length) return;
    state.pdfFiles = files;
    $("pdfModal").hidden = false;
    $("pdfFileName").textContent = "";
    $("pdfLoading").hidden = false;
    $("pdfLoading").textContent = "PDF를 불러오는 중입니다.";

    const tabs = $("pdfTabs");
    tabs.hidden = files.length <= 1;
    tabs.innerHTML = files.length > 1
      ? files.map((file,index) => `<button class="pdf-tab${index===0?" active":""}" type="button" data-pdf-index="${index}">${esc(file.file_name || `PDF ${index+1}`)}</button>`).join("")
      : "";

    state.pdfSignedUrls = await makeSignedUrls(files);
    showPdf(0);
  }

  function bindEvents() {
    $("sdsSearch").addEventListener("input", (event) => { state.query = event.target.value; render(); });
    $("sdsStatus").addEventListener("change", (event) => { state.status = event.target.value; render(); });
    $("sdsProductList").addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-view-id]");
      if (!btn) return;
      const product = state.products.find((p) => Number(p.id) === Number(btn.dataset.viewId));
      if (product) await openCurrent(product);
    });
    $("pdfClose").addEventListener("click", closePdf);
    $("pdfModal").addEventListener("click", (event) => { if (event.target === $("pdfModal")) closePdf(); });
    $("pdfTabs").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-pdf-index]");
      if (btn) showPdf(Number(btn.dataset.pdfIndex));
    });
    $("pdfFrame").addEventListener("load", () => { $("pdfLoading").hidden = true; });
    window.addEventListener("message", (event) => {
      const p = event?.data || {};
      if (p.type === "portal-tabs-request" || p.type === "portal-filters-request") notifyPortal();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    notifyPortal();
    loadProducts();
  });
})();
