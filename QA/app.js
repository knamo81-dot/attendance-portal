(function () {
  const BUCKET = 'qa-sds-files';
  const state = { products: [], query: '', status: 'all', selected: null, pdfFiles: [], pdfIndex: 0, pdfUrl: '' };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  function setMessage(text, type = '') {
    const el = $('sdsMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = `message${type ? ` ${type}` : ''}`;
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dateOnly(value) { return value ? String(value).slice(0, 10) : '-'; }

  function getUserName() {
    const s = window.SDSApp.getPortalSession?.() || {};
    return s.employee?.name || s.employeeName || s.user?.name || s.userName || s.name || s.email || s.user?.email || '';
  }

  function versionFiles(version) {
    if (!version) return [];
    if (Array.isArray(version.files) && version.files.length) return version.files;
    return version.file_path ? [{ file_path: version.file_path, file_name: version.file_name || 'SDS PDF', sort_order: 1 }] : [];
  }

  function statusOf(product) {
    const docStatus = product?.sds_document?.status || 'missing';
    if (docStatus === 'registered') return versionFiles(product?.current_version).length ? 'registered' : 'missing';
    return docStatus;
  }

  function statusLabel(status) {
    if (status === 'registered') return '등록';
    if (status === 'none') return '해당사항<br>없음';
    return '미등록';
  }

  function productSummary(product) {
    return `<strong>${esc(product.name || '-')}</strong> · ${esc(product.maker || '-')} · ${esc(product.code || '-')} · ${esc(product.capacity || '-')}`;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.products.filter((product) => {
      if (state.status !== 'all' && statusOf(product) !== state.status) return false;
      if (!q) return true;
      return [product.name, product.maker, product.code, product.cas].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  function updateSummary() {
    const counts = { all: state.products.length, registered: 0, missing: 0, none: 0 };
    state.products.forEach((product) => {
      const status = statusOf(product);
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    });
    $('sdsTotalCount').textContent = `${counts.all.toLocaleString()}건`;
    $('sdsAttachedCount').textContent = `${counts.registered.toLocaleString()}건`;
    $('sdsMissingCount').textContent = `${counts.missing.toLocaleString()}건`;
    $('sdsNoneCount').textContent = `${counts.none.toLocaleString()}건`;
  }

  function render() {
    updateSummary();
    const rows = filtered();
    const body = $('sdsProductList');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="10" class="empty">조회된 제품이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((product) => {
      const status = statusOf(product);
      const doc = product.sds_document || {};
      const current = product.current_version || {};
      const mainAction = status === 'registered' ? '갱신' : '등록';
      const currentFileCount = versionFiles(current).length;
      const fileButton = status === 'registered' && currentFileCount
        ? `<button class="btn small two-line-action" type="button" data-action="open" data-id="${product.id}"><span>보기</span><span>${currentFileCount}건</span></button>` : '';
      return `<tr>
        <td>${esc(product.name || '-')}</td><td>${esc(product.maker || '-')}</td><td>${esc(product.code || '-')}</td>
        <td>${esc(product.capacity || '-')}</td><td>${esc(product.cas || '-')}</td><td>${esc(product.grade || '-')}</td>
        <td><div class="sds-actions"><span class="status-badge ${status}${status === 'none' ? ' two-line-status' : ''}">${statusLabel(status)}</span>${fileButton}<button class="btn small primary" type="button" data-action="edit" data-id="${product.id}">${mainAction}</button></div></td>
        <td><div class="date-stack"><span><b>개정</b>${dateOnly(current.revision_date)}</span><span><b>등록</b>${dateOnly(current.registered_at)}</span></div></td>
        <td><div class="date-stack"><span><b>확인</b>${dateOnly(doc.last_checked_date)}</span><span><b>발주</b>${dateOnly(product.last_order_date)}</span></div></td>
        <td><button class="btn small" type="button" data-action="history" data-id="${product.id}">이력</button></td>
      </tr>`;
    }).join('');
  }

  async function loadProducts() {
    const companyId = window.SDSApp.getCompanyId();
    if (!companyId) {
      setMessage('회사 정보(company_id)를 확인하지 못했습니다. 포털에서 QA 앱을 열어 주세요.', 'error');
      $('sdsProductList').innerHTML = '<tr><td colspan="10" class="empty">회사 정보를 확인할 수 없습니다.</td></tr>';
      return;
    }
    setMessage('SDS 정보를 불러오는 중입니다.');
    const db = window.SDSApp.db;
    const [productsRes, docsRes, ordersRes] = await Promise.all([
      db.from('product_master').select('id, company_id, category, name, maker, code, capacity, cas, grade, is_active').eq('company_id', companyId).eq('is_active', true).eq('category', '시약').order('maker', { ascending: true }).order('name', { ascending: true }).order('capacity', { ascending: true }).order('code', { ascending: true }),
      db.from('qa_sds_documents').select('id, company_id, product_id, status, last_checked_date, no_sds_reason, no_sds_note, created_at, updated_at').eq('company_id', companyId),
      db.from('reagent_collect_items').select('product_id, order_date').eq('company_id', companyId).not('product_id', 'is', null).not('order_date', 'is', null)
    ]);
    const firstError = productsRes.error || docsRes.error || ordersRes.error;
    if (firstError) { setMessage(`SDS 정보를 불러오지 못했습니다: ${firstError.message}`, 'error'); return; }

    const docs = docsRes.data || [];
    const docIds = docs.map((d) => d.id);
    let versions = [];
    if (docIds.length) {
      const vr = await db.from('qa_sds_versions').select('id, sds_document_id, revision_date, file_path, file_name, file_size, registered_by, registered_at, is_current, deleted_at').in('sds_document_id', docIds).eq('is_current', true).is('deleted_at', null);
      if (vr.error) { setMessage(`SDS 최신본 정보를 불러오지 못했습니다: ${vr.error.message}`, 'error'); return; }
      versions = vr.data || [];
    }

    const versionIds = versions.map((v) => v.id);
    let files = [];
    if (versionIds.length) {
      const fr = await db.from('qa_sds_files').select('id, sds_version_id, file_path, file_name, file_size, sort_order, created_at').in('sds_version_id', versionIds).order('sort_order', { ascending: true });
      if (fr.error) { setMessage(`SDS 파일 정보를 불러오지 못했습니다: ${fr.error.message}`, 'error'); return; }
      files = fr.data || [];
    }
    const filesByVersion = new Map();
    files.forEach((f) => { const a = filesByVersion.get(Number(f.sds_version_id)) || []; a.push(f); filesByVersion.set(Number(f.sds_version_id), a); });
    versions.forEach((v) => { v.files = filesByVersion.get(Number(v.id)) || []; });

    const docByProduct = new Map(docs.map((d) => [Number(d.product_id), d]));
    const versionByDoc = new Map(versions.map((v) => [Number(v.sds_document_id), v]));
    const lastOrderByProduct = new Map();
    (ordersRes.data || []).forEach((row) => {
      const id = Number(row.product_id), cur = lastOrderByProduct.get(id);
      if (!cur || String(row.order_date) > String(cur)) lastOrderByProduct.set(id, row.order_date);
    });
    state.products = (productsRes.data || []).map((product) => {
      const doc = docByProduct.get(Number(product.id)) || null;
      return { ...product, sds_document: doc, current_version: doc ? (versionByDoc.get(Number(doc.id)) || null) : null, last_order_date: lastOrderByProduct.get(Number(product.id)) || null };
    });
    setMessage(''); render();
  }

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  function setMode(mode) {
    const radio = document.querySelector(`input[name="sdsMode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    $('sdsFileSection').hidden = mode !== 'file';
    $('sdsNoneSection').hidden = mode !== 'none';
  }

  function addFileRow() {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = '<input type="file" accept="application/pdf,.pdf" class="sds-file-input" /><button class="btn small danger file-remove" type="button">삭제</button>';
    $('sdsFileRows').appendChild(row);
  }

  function openEdit(product) {
    state.selected = product;
    const status = statusOf(product);
    $('sdsEditTitle').textContent = status === 'registered' ? 'SDS 갱신' : 'SDS 등록';
    $('sdsEditProduct').innerHTML = productSummary(product);
    $('sdsRevisionDate').value = status === 'registered' ? (product.current_version?.revision_date || '') : '';
    $('sdsLastCheckedDate').value = product.sds_document?.last_checked_date || today();
    $('sdsNoneCheckedDate').value = product.sds_document?.last_checked_date || today();
    $('sdsNoneReason').value = product.sds_document?.no_sds_reason || 'supplier_not_provided';
    $('sdsNoneNote').value = product.sds_document?.no_sds_note || '';
    $('sdsFileRows').innerHTML = '';
    addFileRow();

    const currentFiles = versionFiles(product.current_version);
    $('sdsCurrentFilesWrap').hidden = !currentFiles.length;
    $('sdsCurrentFiles').innerHTML = currentFiles.map((f, i) => `<button class="btn small" type="button" data-current-file="${esc(f.file_path)}" data-current-file-name="${esc(f.file_name || `PDF ${i + 1}`)}">${esc(f.file_name || `PDF ${i + 1}`)}</button>`).join('');
    $('sdsFileHint').textContent = status === 'registered' ? '새 PDF를 등록하면 현재본은 이력으로 유지됩니다. 여러 파일을 함께 추가할 수 있습니다.' : 'PDF 파일을 선택해 주세요. 여러 파일을 한 개정 이력에 함께 등록할 수 있습니다.';
    setMode(status === 'none' ? 'none' : 'file');
    openModal('sdsEditModal');
  }

  async function ensureDocument(product, values) {
    const payload = { company_id: window.SDSApp.getCompanyId(), product_id: product.id, ...values };
    const { data, error } = await window.SDSApp.db.from('qa_sds_documents').upsert(payload, { onConflict: 'company_id,product_id' }).select('id, company_id, product_id, status, last_checked_date, no_sds_reason, no_sds_note').single();
    if (error) throw error;
    return data;
  }

  function selectedFiles() {
    return Array.from(document.querySelectorAll('.sds-file-input')).map((el) => el.files?.[0]).filter(Boolean);
  }

  function validateFiles(files) {
    for (const file of files) {
      if (file.type && file.type !== 'application/pdf') throw new Error(`${file.name}: PDF 파일만 등록할 수 있습니다.`);
      if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: 20MB 이하만 등록할 수 있습니다.`);
    }
  }

  async function saveNoneIntegrated(product) {
    const checkedDate = $('sdsNoneCheckedDate').value;
    if (!checkedDate) throw new Error('최종확인일을 입력해 주세요.');
    await ensureDocument(product, { status: 'none', last_checked_date: checkedDate, no_sds_reason: $('sdsNoneReason').value, no_sds_note: $('sdsNoneNote').value.trim() || null });
  }

  async function saveFileVersion(product) {
    const revisionDate = $('sdsRevisionDate').value;
    const checkedDate = $('sdsLastCheckedDate').value;
    const files = selectedFiles();
    if (!revisionDate) throw new Error('SDS 개정일을 입력해 주세요.');
    if (!checkedDate) throw new Error('최종확인일을 입력해 주세요.');
    if (!files.length) throw new Error('등록할 SDS PDF 파일을 한 개 이상 선택해 주세요.');
    validateFiles(files);

    const db = window.SDSApp.db;
    const companyId = window.SDSApp.getCompanyId();
    let doc = product.sds_document;
    let createdDocId = null;
    const uploadedPaths = [];
    let newVersionId = null;

    try {
      if (!doc?.id) {
        doc = await ensureDocument(product, { status: 'missing', last_checked_date: null, no_sds_reason: null, no_sds_note: null });
        createdDocId = doc.id;
      }

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const safeName = file.name.replace(/[^0-9A-Za-z가-힣._-]+/g, '_');
        const path = `${companyId}/${product.id}/${Date.now()}_${i + 1}_${safeName}`;
        const up = await db.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
        if (up.error) throw up.error;
        uploadedPaths.push(path);
      }

      const first = files[0];
      const vr = await db.from('qa_sds_versions').insert({
        sds_document_id: doc.id, revision_date: revisionDate,
        file_path: uploadedPaths[0], file_name: first.name, file_size: first.size,
        registered_by: getUserName(), is_current: false
      }).select('id').single();
      if (vr.error) throw vr.error;
      newVersionId = vr.data.id;

      const fileRows = files.map((file, i) => ({ sds_version_id: newVersionId, file_path: uploadedPaths[i], file_name: file.name, file_size: file.size, sort_order: i + 1 }));
      const fr = await db.from('qa_sds_files').insert(fileRows);
      if (fr.error) throw fr.error;

      const clear = await db.from('qa_sds_versions').update({ is_current: false }).eq('sds_document_id', doc.id).neq('id', newVersionId).eq('is_current', true).is('deleted_at', null);
      if (clear.error) throw clear.error;
      const current = await db.from('qa_sds_versions').update({ is_current: true }).eq('id', newVersionId);
      if (current.error) throw current.error;
      const dr = await db.from('qa_sds_documents').update({ status: 'registered', last_checked_date: checkedDate, no_sds_reason: null, no_sds_note: null }).eq('id', doc.id);
      if (dr.error) throw dr.error;
    } catch (error) {
      if (newVersionId) await db.from('qa_sds_versions').delete().eq('id', newVersionId);
      if (uploadedPaths.length) await db.storage.from(BUCKET).remove(uploadedPaths);
      if (createdDocId) {
        const check = await db.from('qa_sds_versions').select('id').eq('sds_document_id', createdDocId).is('deleted_at', null).limit(1);
        if (!check.error && !(check.data || []).length) await db.from('qa_sds_documents').delete().eq('id', createdDocId);
      }
      throw error;
    }
  }

  async function saveSds() {
    const product = state.selected;
    if (!product) return;
    const button = $('sdsSave');
    button.disabled = true;
    setMessage('SDS 정보를 저장하는 중입니다.');
    try {
      const mode = document.querySelector('input[name="sdsMode"]:checked')?.value || 'file';
      if (mode === 'none') await saveNoneIntegrated(product);
      else await saveFileVersion(product);
      closeModal('sdsEditModal');
      setMessage(mode === 'none' ? '해당사항없음 상태가 저장되었습니다.' : 'SDS가 저장되었습니다.', 'success');
      await loadProducts();
    } catch (error) {
      console.error('[SDS] save error', error);
      setMessage(`SDS 저장에 실패했습니다: ${error.message}`, 'error');
      await loadProducts();
    } finally { button.disabled = false; }
  }

  function resetPdfViewerPosition() {
    const modal = document.querySelector('#sdsPdfModal .pdf-viewer-modal');
    if (!modal) return;
    modal.style.left = '';
    modal.style.top = '';
  }

  function initPdfViewerDrag() {
    const modal = document.querySelector('#sdsPdfModal .pdf-viewer-modal');
    const handle = document.querySelector('#sdsPdfModal .pdf-viewer-head');
    if (!modal || !handle) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (window.matchMedia('(max-width: 760px)').matches) return;
      if (e.target.closest('button, a, input')) return;
      const rect = modal.getBoundingClientRect();
      dragging = true;
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      handle.setPointerCapture?.(e.pointerId);
      modal.classList.add('dragging');
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - modal.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - modal.offsetHeight);
      const left = Math.min(Math.max(0, e.clientX - offsetX), maxLeft);
      const top = Math.min(Math.max(0, e.clientY - offsetY), maxTop);
      modal.style.left = `${left}px`;
      modal.style.top = `${top}px`;
    });

    const stopDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      modal.classList.remove('dragging');
      try { handle.releasePointerCapture?.(e.pointerId); } catch (_) {}
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
  }

  async function showPdfAt(index) {
    const file = state.pdfFiles[index];
    if (!file?.file_path) return;
    state.pdfIndex = index;
    $('sdsPdfLoading').hidden = false;
    $('sdsPdfFrame').removeAttribute('src');
    const { data, error } = await window.SDSApp.db.storage.from(BUCKET).createSignedUrl(file.file_path, 300);
    if (error) {
      $('sdsPdfLoading').textContent = `PDF를 불러오지 못했습니다: ${error.message}`;
      setMessage(`SDS 파일을 열지 못했습니다: ${error.message}`, 'error');
      return;
    }
    state.pdfUrl = data.signedUrl;
    $('sdsPdfFileName').textContent = file.file_name || `PDF ${index + 1}`;
    $('sdsPdfFrame').src = data.signedUrl;
    Array.from($('sdsPdfTabs').querySelectorAll('[data-pdf-index]')).forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.pdfIndex) === index);
    });
  }

  async function openPdfViewer(files, startIndex = 0) {
    const validFiles = (files || []).filter((f) => f?.file_path);
    if (!validFiles.length) return;
    state.pdfFiles = validFiles;
    state.pdfIndex = Math.min(Math.max(Number(startIndex) || 0, 0), validFiles.length - 1);
    state.pdfUrl = '';
    $('sdsPdfTabs').hidden = validFiles.length <= 1;
    $('sdsPdfTabs').innerHTML = validFiles.map((f, i) =>
      `<button class="btn small pdf-tab${i === state.pdfIndex ? ' active' : ''}" type="button" data-pdf-index="${i}">${esc(f.file_name || `PDF ${i + 1}`)}</button>`
    ).join('');
    $('sdsPdfLoading').textContent = 'PDF를 불러오는 중입니다.';
    openModal('sdsPdfModal');
    resetPdfViewerPosition();
    await showPdfAt(state.pdfIndex);
  }

  async function openFile(filePath, fileName = 'SDS PDF') {
    if (!filePath) return;
    await openPdfViewer([{ file_path: filePath, file_name: fileName }], 0);
  }

  async function openCurrent(product) {
    const files = versionFiles(product.current_version);
    if (files.length) return openPdfViewer(files, 0);
  }

  async function openHistory(product) {
    state.selected = product;
    $('sdsHistoryProduct').innerHTML = productSummary(product);
    const body = $('sdsHistoryList');
    body.innerHTML = '<tr><td colspan="6" class="empty">이력을 불러오는 중입니다.</td></tr>';
    openModal('sdsHistoryModal');
    const docId = product.sds_document?.id;
    if (!docId) { body.innerHTML = '<tr><td colspan="6" class="empty">등록된 SDS 이력이 없습니다.</td></tr>'; return; }

    const vr = await window.SDSApp.db.from('qa_sds_versions').select('id, sds_document_id, revision_date, file_path, file_name, registered_by, registered_at, is_current, deleted_at').eq('sds_document_id', docId).is('deleted_at', null).order('registered_at', { ascending: false });
    if (vr.error) { body.innerHTML = `<tr><td colspan="6" class="empty">${esc(vr.error.message)}</td></tr>`; return; }
    const versions = vr.data || [];
    if (!versions.length) { body.innerHTML = '<tr><td colspan="6" class="empty">등록된 SDS 이력이 없습니다.</td></tr>'; return; }

    const ids = versions.map((v) => v.id);
    const fr = await window.SDSApp.db.from('qa_sds_files').select('id, sds_version_id, file_path, file_name, sort_order').in('sds_version_id', ids).order('sort_order', { ascending: true });
    if (fr.error) { body.innerHTML = `<tr><td colspan="6" class="empty">${esc(fr.error.message)}</td></tr>`; return; }
    const byVersion = new Map();
    (fr.data || []).forEach((f) => { const a = byVersion.get(Number(f.sds_version_id)) || []; a.push(f); byVersion.set(Number(f.sds_version_id), a); });

    body.innerHTML = versions.map((row) => {
      let files = byVersion.get(Number(row.id)) || [];
      if (!files.length && row.file_path) files = [{ file_path: row.file_path, file_name: row.file_name || 'SDS PDF' }];
      const buttons = files.map((f, i) => `<button class="btn small history-file-btn" type="button" data-history-action="open" data-path="${esc(f.file_path)}" data-file-name="${esc(f.file_name || `PDF ${i + 1}`)}">${esc(f.file_name || `PDF ${i + 1}`)}</button>`).join('');
      return `<tr><td>${row.is_current ? '<span class="status-badge registered">현재</span>' : '이전'}</td><td>${dateOnly(row.revision_date)}</td><td>${dateOnly(row.registered_at)}</td><td>${esc(row.registered_by || '-')}</td><td><div class="history-files">${buttons || '-'}</div></td><td><button class="btn small danger" type="button" data-history-action="delete" data-version-id="${row.id}" data-current="${row.is_current ? '1' : '0'}">삭제</button></td></tr>`;
    }).join('');
  }

  async function deleteVersion(versionId, isCurrent) {
    if (!confirm('이 SDS 이력을 삭제 처리하시겠습니까? 파일 이력은 복구를 위해 DB에 보존됩니다.')) return;
    const db = window.SDSApp.db;
    const { error } = await db.from('qa_sds_versions').update({ deleted_at: new Date().toISOString(), is_current: false }).eq('id', versionId);
    if (error) { setMessage(`SDS 이력 삭제에 실패했습니다: ${error.message}`, 'error'); return; }
    if (isCurrent && state.selected?.sds_document?.id) {
      const docId = state.selected.sds_document.id;
      const previous = await db.from('qa_sds_versions').select('id').eq('sds_document_id', docId).is('deleted_at', null).order('registered_at', { ascending: false }).limit(1).maybeSingle();
      if (!previous.error && previous.data?.id) await db.from('qa_sds_versions').update({ is_current: true }).eq('id', previous.data.id);
      else await db.from('qa_sds_documents').update({ status: 'missing' }).eq('id', docId);
    }
    setMessage('SDS 이력이 삭제 처리되었습니다.', 'success');
    const productId = state.selected?.id;
    await loadProducts();
    const refreshed = state.products.find((p) => Number(p.id) === Number(productId));
    if (refreshed) await openHistory(refreshed);
  }

  function downloadExcel() {
    const rows = filtered();
    if (!rows.length) { setMessage('엑셀로 다운로드할 제품이 없습니다.', 'error'); return; }
    if (!window.XLSX) { setMessage('엑셀 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error'); return; }
    const data = rows.map((product) => ({ '품명': product.name || '', '제조사': product.maker || '', '제품코드': product.code || '', '규격': product.capacity || '', 'CAS': product.cas || '', '등급': product.grade || '', 'SDS': statusOf(product) === 'none' ? '해당사항없음' : statusLabel(statusOf(product)), '개정일': dateOnly(product.current_version?.revision_date).replace('-', ''), '등록일': dateOnly(product.current_version?.registered_at).replace('-', ''), '최종확인일': dateOnly(product.sds_document?.last_checked_date).replace('-', ''), '최종발주일': dateOnly(product.last_order_date).replace('-', '') }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'SDS 관리'); XLSX.writeFile(wb, `SDS관리_${today().replaceAll('-', '')}.xlsx`);
  }

  function notifyPortal() {
    try {
      window.parent?.postMessage({ type: 'portal-tabs-ready', tabs: [{ id: 'sds', label: 'SDS 관리' }], source: 'qa' }, '*');
      window.parent?.postMessage({ type: 'portal-tab-active', activeTabId: 'sds', tabId: 'sds', source: 'qa' }, '*');
      window.parent?.postMessage({ type: 'portal-filters-ready', enabled: false, filters: [], source: 'qa' }, '*');
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('sdsSearch').addEventListener('input', (e) => { state.query = e.target.value; render(); });
    $('sdsStatus').addEventListener('change', (e) => { state.status = e.target.value; render(); });
    $('sdsDownloadExcel').addEventListener('click', downloadExcel);
    $('sdsSave').addEventListener('click', saveSds);
    $('sdsAddFile').addEventListener('click', addFileRow);
    $('sdsPdfFrame').addEventListener('load', () => { $('sdsPdfLoading').hidden = true; });
    initPdfViewerDrag();
    document.querySelectorAll('input[name="sdsMode"]').forEach((r) => r.addEventListener('change', () => setMode(r.value)));

    document.addEventListener('click', async (e) => {
      const close = e.target.closest('[data-close]');
      if (close) { closeModal(close.dataset.close); return; }
      const remove = e.target.closest('.file-remove');
      if (remove) {
        const rows = document.querySelectorAll('.file-row');
        if (rows.length > 1) remove.closest('.file-row')?.remove();
        else remove.closest('.file-row')?.querySelector('input') && (remove.closest('.file-row').querySelector('input').value = '');
        return;
      }
      const pdfTab = e.target.closest('[data-pdf-index]');
      if (pdfTab) { await showPdfAt(Number(pdfTab.dataset.pdfIndex)); return; }
      if (e.target.closest('#sdsPdfNewWindow')) {
        if (state.pdfUrl) window.open(state.pdfUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const currentFile = e.target.closest('[data-current-file]');
      if (currentFile) { await openFile(currentFile.dataset.currentFile, currentFile.dataset.currentFileName || 'SDS PDF'); return; }
      const actionButton = e.target.closest('[data-action]');
      if (actionButton) {
        const product = state.products.find((p) => Number(p.id) === Number(actionButton.dataset.id));
        if (!product) return;
        if (actionButton.dataset.action === 'edit') openEdit(product);
        if (actionButton.dataset.action === 'open') await openCurrent(product);
        if (actionButton.dataset.action === 'history') await openHistory(product);
        return;
      }
      const historyButton = e.target.closest('[data-history-action]');
      if (historyButton) {
        if (historyButton.dataset.historyAction === 'open') await openFile(historyButton.dataset.path, historyButton.dataset.fileName || 'SDS PDF');
        if (historyButton.dataset.historyAction === 'delete') await deleteVersion(Number(historyButton.dataset.versionId), historyButton.dataset.current === '1');
      }
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(backdrop.id); }));
    loadProducts(); notifyPortal();
  });

  window.addEventListener('message', (e) => { if (e.data?.type === 'portal-tabs-request' || e.data?.type === 'portal-filters-request') notifyPortal(); });
})();

