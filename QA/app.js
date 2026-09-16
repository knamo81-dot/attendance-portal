(function () {
  const BUCKET = 'qa-sds-files';
  const state = {
    products: [],
    query: '',
    status: 'all',
    selected: null
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));

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

  function dateOnly(value) {
    if (!value) return '-';
    return String(value).slice(0, 10);
  }

  function getUserName() {
    const s = window.SDSApp.getPortalSession?.() || {};
    return s.employee?.name || s.employeeName || s.user?.name || s.userName || s.name || s.email || s.user?.email || '';
  }

  function statusOf(product) {
    const docStatus = product?.sds_document?.status || 'missing';
    if (docStatus === 'registered') {
      return product?.current_version?.file_path ? 'registered' : 'missing';
    }
    return docStatus;
  }

  function statusLabel(status) {
    if (status === 'registered') return '등록';
    if (status === 'none') return 'SDS없음';
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
      const fileButton = status === 'registered' && current.file_path
        ? `<button class="btn small" type="button" data-action="open" data-id="${product.id}">보기</button>`
        : '';
      const noneButton = status !== 'registered'
        ? `<button class="btn small" type="button" data-action="none" data-id="${product.id}">SDS없음</button>`
        : '';

      return `<tr>
        <td>${esc(product.name || '-')}</td>
        <td>${esc(product.maker || '-')}</td>
        <td>${esc(product.code || '-')}</td>
        <td>${esc(product.capacity || '-')}</td>
        <td>${esc(product.cas || '-')}</td>
        <td>${esc(product.grade || '-')}</td>
        <td>
          <div class="sds-actions">
            <span class="status-badge ${status}">${statusLabel(status)}</span>
            ${fileButton}
            <button class="btn small primary" type="button" data-action="edit" data-id="${product.id}">${mainAction}</button>
            ${noneButton}
          </div>
        </td>
        <td>
          <div class="date-stack">
            <span><b>개정</b>${dateOnly(current.revision_date)}</span>
            <span><b>등록</b>${dateOnly(current.registered_at)}</span>
          </div>
        </td>
        <td>
          <div class="date-stack">
            <span><b>확인</b>${dateOnly(doc.last_checked_date)}</span>
            <span><b>발주</b>${dateOnly(product.last_order_date)}</span>
          </div>
        </td>
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
      db.from('product_master')
        .select('id, company_id, category, name, maker, code, capacity, cas, grade, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('category', '시약')
        .order('maker', { ascending: true })
        .order('name', { ascending: true })
        .order('capacity', { ascending: true })
        .order('code', { ascending: true }),
      db.from('qa_sds_documents')
        .select('id, company_id, product_id, status, last_checked_date, no_sds_reason, no_sds_note, created_at, updated_at')
        .eq('company_id', companyId),
      db.from('reagent_collect_items')
        .select('product_id, order_date')
        .eq('company_id', companyId)
        .not('product_id', 'is', null)
        .not('order_date', 'is', null)
    ]);

    const firstError = productsRes.error || docsRes.error || ordersRes.error;
    if (firstError) {
      console.error('[SDS] load error', firstError);
      setMessage(`SDS 정보를 불러오지 못했습니다: ${firstError.message}`, 'error');
      return;
    }

    const docs = docsRes.data || [];
    const docIds = docs.map((d) => d.id);
    let versions = [];

    if (docIds.length) {
      const versionsRes = await db.from('qa_sds_versions')
        .select('id, sds_document_id, revision_date, file_path, file_name, file_size, registered_by, registered_at, is_current, deleted_at')
        .in('sds_document_id', docIds)
        .eq('is_current', true)
        .is('deleted_at', null);

      if (versionsRes.error) {
        console.error('[SDS] version load error', versionsRes.error);
        setMessage(`SDS 최신본 정보를 불러오지 못했습니다: ${versionsRes.error.message}`, 'error');
        return;
      }
      versions = versionsRes.data || [];
    }

    const docByProduct = new Map(docs.map((d) => [Number(d.product_id), d]));
    const versionByDoc = new Map(versions.map((v) => [Number(v.sds_document_id), v]));
    const lastOrderByProduct = new Map();

    (ordersRes.data || []).forEach((row) => {
      const productId = Number(row.product_id);
      const current = lastOrderByProduct.get(productId);
      if (!current || String(row.order_date) > String(current)) lastOrderByProduct.set(productId, row.order_date);
    });

    state.products = (productsRes.data || []).map((product) => {
      const doc = docByProduct.get(Number(product.id)) || null;
      return {
        ...product,
        sds_document: doc,
        current_version: doc ? (versionByDoc.get(Number(doc.id)) || null) : null,
        last_order_date: lastOrderByProduct.get(Number(product.id)) || null
      };
    });

    setMessage('');
    render();
  }

  function openModal(id) {
    $(id).hidden = false;
  }

  function closeModal(id) {
    $(id).hidden = true;
  }

  function openEdit(product) {
    state.selected = product;
    const isUpdate = statusOf(product) === 'registered';
    $('sdsEditTitle').textContent = isUpdate ? 'SDS 갱신' : 'SDS 등록';
    $('sdsEditProduct').innerHTML = productSummary(product);
    $('sdsRevisionDate').value = isUpdate ? (product.current_version?.revision_date || '') : '';
    $('sdsLastCheckedDate').value = today();
    $('sdsFile').value = '';
    $('sdsFileHint').textContent = isUpdate
      ? '새 개정본 PDF를 선택하면 기존 파일은 이력으로 유지됩니다.'
      : 'PDF 파일을 선택해 주세요.';
    openModal('sdsEditModal');
  }

  function openNone(product) {
    state.selected = product;
    $('sdsNoneProduct').innerHTML = productSummary(product);
    $('sdsNoneReason').value = product.sds_document?.no_sds_reason || 'supplier_not_provided';
    $('sdsNoneCheckedDate').value = product.sds_document?.last_checked_date || today();
    $('sdsNoneNote').value = product.sds_document?.no_sds_note || '';
    openModal('sdsNoneModal');
  }

  async function ensureDocument(product, values) {
    const db = window.SDSApp.db;
    const companyId = window.SDSApp.getCompanyId();
    const payload = {
      company_id: companyId,
      product_id: product.id,
      ...values
    };

    const { data, error } = await db.from('qa_sds_documents')
      .upsert(payload, { onConflict: 'company_id,product_id' })
      .select('id, company_id, product_id, status, last_checked_date, no_sds_reason, no_sds_note')
      .single();

    if (error) throw error;
    return data;
  }

  async function saveSds() {
    const product = state.selected;
    if (!product) return;

    const revisionDate = $('sdsRevisionDate').value;
    const checkedDate = $('sdsLastCheckedDate').value;
    const file = $('sdsFile').files?.[0];

    if (!revisionDate) {
      setMessage('SDS 개정일을 입력해 주세요.', 'error');
      return;
    }
    if (!checkedDate) {
      setMessage('최종확인일을 입력해 주세요.', 'error');
      return;
    }
    if (!file) {
      setMessage('등록할 SDS PDF 파일을 선택해 주세요.', 'error');
      return;
    }
    if (file.type && file.type !== 'application/pdf') {
      setMessage('SDS 파일은 PDF만 등록할 수 있습니다.', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage('SDS 파일은 20MB 이하만 등록할 수 있습니다.', 'error');
      return;
    }

    const saveButton = $('sdsSave');
    saveButton.disabled = true;
    setMessage('SDS 파일을 저장하는 중입니다.');

    let uploadedPath = null;
    let createdDocId = null;

    try {
      const db = window.SDSApp.db;
      const companyId = window.SDSApp.getCompanyId();

      // 문서 레코드는 먼저 확보하되, 실제 SDS 버전 등록이 끝나기 전에는
      // registered 상태로 바꾸지 않습니다.
      let doc = product.sds_document;
      if (!doc?.id) {
        doc = await ensureDocument(product, {
          status: 'missing',
          last_checked_date: null,
          no_sds_reason: null,
          no_sds_note: null
        });
        createdDocId = doc.id;
      }

      const safeName = file.name.replace(/[^0-9A-Za-z가-힣._-]+/g, '_');
      const filePath = `${companyId}/${product.id}/${Date.now()}_${safeName}`;
      const uploadRes = await db.storage.from(BUCKET).upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: false
      });
      if (uploadRes.error) throw uploadRes.error;
      uploadedPath = filePath;

      // 새 버전을 먼저 일반 이력으로 저장합니다. 이 단계까지 실패하면
      // 기존 현재본/등록상태는 그대로 유지됩니다.
      const versionRes = await db.from('qa_sds_versions')
        .insert({
          sds_document_id: doc.id,
          revision_date: revisionDate,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          registered_by: getUserName(),
          is_current: false
        })
        .select('id')
        .single();
      if (versionRes.error) throw versionRes.error;

      const newVersionId = versionRes.data.id;

      // 기존 현재본 해제 후 새 버전을 현재본으로 지정합니다.
      const clearRes = await db.from('qa_sds_versions')
        .update({ is_current: false })
        .eq('sds_document_id', doc.id)
        .neq('id', newVersionId)
        .eq('is_current', true)
        .is('deleted_at', null);
      if (clearRes.error) throw clearRes.error;

      const currentRes = await db.from('qa_sds_versions')
        .update({ is_current: true })
        .eq('id', newVersionId);
      if (currentRes.error) throw currentRes.error;

      // 파일과 버전이 모두 정상 저장된 뒤 마지막에 등록 상태를 확정합니다.
      const docRes = await db.from('qa_sds_documents')
        .update({
          status: 'registered',
          last_checked_date: checkedDate,
          no_sds_reason: null,
          no_sds_note: null
        })
        .eq('id', doc.id);
      if (docRes.error) throw docRes.error;

      closeModal('sdsEditModal');
      setMessage('SDS가 저장되었습니다.', 'success');
      await loadProducts();
    } catch (error) {
      console.error('[SDS] save error', error);

      // 새 등록 도중 실패했다면 업로드된 파일과 빈 문서 레코드를 정리합니다.
      if (uploadedPath) {
        try {
          await window.SDSApp.db.storage.from(BUCKET).remove([uploadedPath]);
        } catch (_) {}
      }
      if (createdDocId) {
        try {
          const versions = await window.SDSApp.db.from('qa_sds_versions')
            .select('id')
            .eq('sds_document_id', createdDocId)
            .is('deleted_at', null)
            .limit(1);
          if (!versions.error && !(versions.data || []).length) {
            await window.SDSApp.db.from('qa_sds_documents').delete().eq('id', createdDocId);
          }
        } catch (_) {}
      }

      setMessage(`SDS 저장에 실패했습니다: ${error.message}`, 'error');
      await loadProducts();
    } finally {
      saveButton.disabled = false;
    }
  }

  async function saveNone() {
    const product = state.selected;
    if (!product) return;

    const checkedDate = $('sdsNoneCheckedDate').value;
    if (!checkedDate) {
      setMessage('최종확인일을 입력해 주세요.', 'error');
      return;
    }

    const button = $('sdsNoneSave');
    button.disabled = true;
    try {
      await ensureDocument(product, {
        status: 'none',
        last_checked_date: checkedDate,
        no_sds_reason: $('sdsNoneReason').value,
        no_sds_note: $('sdsNoneNote').value.trim() || null
      });
      closeModal('sdsNoneModal');
      setMessage('SDS 없음 상태가 저장되었습니다.', 'success');
      await loadProducts();
    } catch (error) {
      console.error('[SDS] none save error', error);
      setMessage(`SDS 없음 저장에 실패했습니다: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function openFile(filePath) {
    if (!filePath) return;
    const { data, error } = await window.SDSApp.db.storage.from(BUCKET).createSignedUrl(filePath, 300);
    if (error) {
      setMessage(`SDS 파일을 열지 못했습니다: ${error.message}`, 'error');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function openCurrent(product) {
    await openFile(product.current_version?.file_path);
  }

  async function openHistory(product) {
    state.selected = product;
    $('sdsHistoryProduct').innerHTML = productSummary(product);
    const body = $('sdsHistoryList');
    body.innerHTML = '<tr><td colspan="6" class="empty">이력을 불러오는 중입니다.</td></tr>';
    openModal('sdsHistoryModal');

    const docId = product.sds_document?.id;
    if (!docId) {
      body.innerHTML = '<tr><td colspan="6" class="empty">등록된 SDS 이력이 없습니다.</td></tr>';
      return;
    }

    const { data, error } = await window.SDSApp.db.from('qa_sds_versions')
      .select('id, sds_document_id, revision_date, file_path, file_name, registered_by, registered_at, is_current, deleted_at')
      .eq('sds_document_id', docId)
      .is('deleted_at', null)
      .order('registered_at', { ascending: false });

    if (error) {
      body.innerHTML = `<tr><td colspan="6" class="empty">${esc(error.message)}</td></tr>`;
      return;
    }

    if (!data?.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">등록된 SDS 이력이 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = data.map((row) => `<tr>
      <td>${row.is_current ? '<span class="status-badge registered">현재</span>' : '이전'}</td>
      <td>${dateOnly(row.revision_date)}</td>
      <td>${dateOnly(row.registered_at)}</td>
      <td>${esc(row.registered_by || '-')}</td>
      <td><button class="btn small" type="button" data-history-action="open" data-path="${esc(row.file_path)}">보기</button></td>
      <td><button class="btn small danger" type="button" data-history-action="delete" data-version-id="${row.id}" data-current="${row.is_current ? '1' : '0'}">삭제</button></td>
    </tr>`).join('');
  }

  async function deleteVersion(versionId, isCurrent) {
    if (!confirm('이 SDS 이력을 삭제 처리하시겠습니까? 파일 이력은 복구를 위해 DB에 보존됩니다.')) return;
    const db = window.SDSApp.db;
    const nowIso = new Date().toISOString();

    const { error } = await db.from('qa_sds_versions')
      .update({ deleted_at: nowIso, is_current: false })
      .eq('id', versionId);
    if (error) {
      setMessage(`SDS 이력 삭제에 실패했습니다: ${error.message}`, 'error');
      return;
    }

    if (isCurrent && state.selected?.sds_document?.id) {
      const docId = state.selected.sds_document.id;
      const previous = await db.from('qa_sds_versions')
        .select('id')
        .eq('sds_document_id', docId)
        .is('deleted_at', null)
        .order('registered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!previous.error && previous.data?.id) {
        await db.from('qa_sds_versions').update({ is_current: true }).eq('id', previous.data.id);
      } else {
        await db.from('qa_sds_documents').update({ status: 'missing' }).eq('id', docId);
      }
    }

    setMessage('SDS 이력이 삭제 처리되었습니다.', 'success');
    const productId = state.selected?.id;
    await loadProducts();
    const refreshed = state.products.find((p) => Number(p.id) === Number(productId));
    if (refreshed) await openHistory(refreshed);
  }

  function downloadExcel() {
    const rows = filtered();
    if (!rows.length) {
      setMessage('엑셀로 다운로드할 제품이 없습니다.', 'error');
      return;
    }
    if (!window.XLSX) {
      setMessage('엑셀 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error');
      return;
    }

    const data = rows.map((product) => ({
      '품명': product.name || '',
      '제조사': product.maker || '',
      '제품코드': product.code || '',
      '규격': product.capacity || '',
      'CAS': product.cas || '',
      '등급': product.grade || '',
      'SDS': statusLabel(statusOf(product)),
      '개정일': dateOnly(product.current_version?.revision_date).replace('-', ''),
      '등록일': dateOnly(product.current_version?.registered_at).replace('-', ''),
      '최종확인일': dateOnly(product.sds_document?.last_checked_date).replace('-', ''),
      '최종발주일': dateOnly(product.last_order_date).replace('-', '')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SDS 관리');
    XLSX.writeFile(wb, `SDS관리_${today().replaceAll('-', '')}.xlsx`);
  }

  function notifyPortal() {
    try {
      window.parent?.postMessage({ type: 'portal-tabs-ready', tabs: [{ id: 'sds', label: 'SDS 관리' }], source: 'qa' }, '*');
      window.parent?.postMessage({ type: 'portal-tab-active', activeTabId: 'sds', tabId: 'sds', source: 'qa' }, '*');
      window.parent?.postMessage({ type: 'portal-filters-ready', enabled: false, filters: [], source: 'qa' }, '*');
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('sdsSearch').addEventListener('input', (e) => {
      state.query = e.target.value;
      render();
    });

    $('sdsStatus').addEventListener('change', (e) => {
      state.status = e.target.value;
      render();
    });

    $('sdsDownloadExcel').addEventListener('click', downloadExcel);
    $('sdsSave').addEventListener('click', saveSds);
    $('sdsNoneSave').addEventListener('click', saveNone);

    document.addEventListener('click', async (e) => {
      const close = e.target.closest('[data-close]');
      if (close) {
        closeModal(close.dataset.close);
        return;
      }

      const actionButton = e.target.closest('[data-action]');
      if (actionButton) {
        const product = state.products.find((p) => Number(p.id) === Number(actionButton.dataset.id));
        if (!product) return;
        if (actionButton.dataset.action === 'edit') openEdit(product);
        if (actionButton.dataset.action === 'none') openNone(product);
        if (actionButton.dataset.action === 'open') await openCurrent(product);
        if (actionButton.dataset.action === 'history') await openHistory(product);
        return;
      }

      const historyButton = e.target.closest('[data-history-action]');
      if (historyButton) {
        if (historyButton.dataset.historyAction === 'open') await openFile(historyButton.dataset.path);
        if (historyButton.dataset.historyAction === 'delete') {
          await deleteVersion(Number(historyButton.dataset.versionId), historyButton.dataset.current === '1');
        }
      }
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal(backdrop.id);
      });
    });

    loadProducts();
    notifyPortal();
  });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'portal-tabs-request' || e.data?.type === 'portal-filters-request') notifyPortal();
  });
})();

