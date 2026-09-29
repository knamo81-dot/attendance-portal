(function(){
  'use strict';

  const APP = window.ReagentApp = window.ReagentApp || {};
  const esc = (value) => APP.escapeHtml ? APP.escapeHtml(value) : String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const attr = esc;
  const num = (value) => {
    const n = Number(String(value ?? '').replace(/,/g,''));
    return Number.isFinite(n) ? n : 0;
  };
  const money = (value) => {
    const n = num(value);
    return n ? n.toLocaleString('ko-KR') : '0';
  };

  function ensureAfter(anchor, id, className='mobile-data-list'){
    let el = document.getElementById(id);
    if (el) return el;
    if (!anchor) return null;
    el = document.createElement('div');
    el.id = id;
    el.className = className;
    anchor.insertAdjacentElement('afterend', el);
    return el;
  }

  function toggleCard(card){
    if (!card) return;
    const open = !card.classList.contains('open');
    card.classList.toggle('open', open);
    const summary = card.querySelector('.mobile-data-summary');
    summary?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function bindCardToggles(container){
    container?.querySelectorAll('.mobile-data-summary').forEach((summary)=>{
      if (summary.dataset.mobileToggleBound === '1') return;
      summary.dataset.mobileToggleBound = '1';
      summary.addEventListener('click',(event)=>{
        if (event.target.closest('input,select,textarea,button,label,a')) return;
        toggleCard(summary.closest('.mobile-data-card'));
      });
      summary.addEventListener('keydown',(event)=>{
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target.closest('input,select,textarea,button,label,a')) return;
        event.preventDefault();
        toggleCard(summary.closest('.mobile-data-card'));
      });
    });
  }

  /* --------------------- 제품신청 조회년월 --------------------- */
  function getRequestMonths(){
    const request = APP.request;
    if (!request) return [];
    const current = request.getMonthKey?.(new Date(),0) || '';
    const next = request.getMonthKey?.(new Date(),1) || '';
    const selected = request.getCurrentOrderMonth?.() || '';
    const fromRows = (request.requestRows || []).map((row)=>row.order_month).filter(Boolean);
    return [...new Set([current,next,selected,...fromRows].filter(Boolean))].sort().reverse();
  }

  function syncRequestMonthFilter(){
    const request = APP.request;
    const panel = document.getElementById('requestApplicationPanel');
    if (!request || !panel) return;

    let wrap = document.getElementById('mobileRequestMonthFilterWrap');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.id = 'mobileRequestMonthFilterWrap';
      wrap.className = 'mobile-request-month-filter';
      wrap.innerHTML = '<label for="mobileRequestMonthFilter">조회년월</label><select id="mobileRequestMonthFilter" aria-label="제품신청 조회년월"></select>';
      panel.insertBefore(wrap, panel.firstChild);
      const select = wrap.querySelector('select');
      const applyMonth = (event)=>{
        const value = String(event?.target?.value || '').trim();
        if (!value) return;

        const current = String(request.getCurrentOrderMonth?.() || '').trim();

        // 모바일 브라우저는 native select에서 change가 picker 종료 뒤에 늦게 오는 경우가 있어
        // input 이벤트에서도 즉시 주문월을 적용합니다.
        if (current !== value){
          request.setCurrentOrderMonth?.(value);
        } else {
          // 같은 값을 다시 선택한 경우에도 현재 화면을 즉시 다시 그려 필터 반응을 보장합니다.
          request.renderRequest?.();
        }

        window.requestAnimationFrame(()=>{
          try { syncRequestMonthFilter(); } catch (_) {}
        });
      };

      select.addEventListener('input', applyMonth);
      select.addEventListener('change', applyMonth);
    }

    const select = document.getElementById('mobileRequestMonthFilter');
    if (!select) return;
    const months = getRequestMonths();
    const selected = request.getCurrentOrderMonth?.() || months[0] || '';
    const signature = months.join('|');
    if (select.dataset.monthSignature !== signature){
      select.dataset.monthSignature = signature;
      select.innerHTML = months.map((m)=>`<option value="${attr(m)}">${esc(request.formatOrderMonthLabel?.(m) || m)}</option>`).join('');
    }
    select.value = selected;
  }

  function wrapRequestRender(){
    const request = APP.request;
    if (!request || request.__mobileRenderWrapped) return;
    request.__mobileRenderWrapped = true;
    const original = request.renderRequest?.bind(request);
    if (!original) return;
    request.renderRequest = function(...args){
      const result = original(...args);
      try { syncRequestMonthFilter(); } catch (error) { console.warn('모바일 제품신청 년월 필터 갱신 실패', error); }
      return result;
    };
  }

  /* --------------------- 제품취합 카드 --------------------- */
  function getCollectDisplayKeys(){
    const body = document.getElementById('collectList');
    if (!body) return [];
    return Array.from(body.children)
      .map((tr)=>tr.querySelector('.collect-check')?.dataset?.key || '')
      .filter(Boolean);
  }

  function getAllCollectGroups(){
    const request = APP.request;
    if (!request) return [];
    return request.groupItems?.(request.getRowsForCurrentOrderMonth ? request.getRowsForCurrentOrderMonth() : request.requestRows) || [];
  }

  function renderCollectMobileCards(){
    const collect = APP.collect;
    const request = APP.request;
    const tableWrap = document.querySelector('#page-collect .collect-table-wrap');
    const container = ensureAfter(tableWrap, 'collectMobileCards');
    if (!collect || !request || !container) return;

    const keys = getCollectDisplayKeys();
    if (!keys.length){
      container.innerHTML = '<div class="mobile-empty">취합할 항목이 없습니다.</div>';
      return;
    }

    const groupMap = new Map(getAllCollectGroups().map((g)=>[String(g.key),g]));
    const cards = keys.map((key)=>{
      const group = groupMap.get(String(key));
      if (!group) return '';
      const meta = collect.applyDefaultVendorToMeta?.(group, collect.getMeta(key)) || collect.getMeta(key) || {};
      const qty = Number(group.collectedQty || 0);
      const unit1 = collect.normalizeNumber?.(meta.unit1) ?? num(meta.unit1);
      const unit2 = collect.normalizeNumber?.(meta.unit2) ?? num(meta.unit2);
      collect.setAutoPriceIfNeeded?.(meta,1,qty);
      collect.setAutoPriceIfNeeded?.(meta,2,qty);
      const price1 = collect.getEffectiveAmount?.(meta,1,qty) ?? num(meta.price1);
      const price2 = collect.getEffectiveAmount?.(meta,2,qty) ?? num(meta.price2);
      const selectedVendor = meta.confirmed ? meta.selectedVendor : (collect.autoSelectVendor?.(meta,qty) || '');
      const checked = collect.selectedKeys?.includes(key) ? 'checked' : '';
      const disabled = meta.confirmed ? 'disabled' : '';
      const readonly = meta.confirmed ? 'readonly' : '';
      const defaultInfo = collect.getDefaultVendorInfoForGroup?.(group) || {};
      const reason = String(meta.prepareRemark || defaultInfo.reason || '').trim();
      const hasFixedReason = String(meta.vendor1 || '').trim() && reason && reason !== '최저가 구매';
      const casHtml = collect.renderCasLinesForGroup?.(group) || esc(group.cas || '-');
      const qtyText = [group.collectedQty > 0 ? `완료 ${group.collectedQty}` : '', group.newQty > 0 ? `추가 ${group.newQty}` : ''].filter(Boolean).join(' / ') || '0';
      const entries = (group.entries || []).map((item)=>`
        <div class="mobile-entry-item">
          <b>${esc(item.team || '-')} / ${esc(item.requester || '-')}</b><br>
          수량 ${esc(item.qty ?? '-')} · ${esc(item.usage || '용도 미입력')}
        </div>`).join('');
      const actionButton = meta.confirmed
        ? `<button type="button" class="ghost-btn mobile-collect-cancel" data-key="${attr(key)}">확정 취소</button>`
        : `<button type="button" class="ghost-btn mobile-collect-exclude" data-key="${attr(key)}">취합 제외</button>`;

      return `
        <article class="mobile-data-card mobile-collect-card" data-key="${attr(key)}">
          <div class="mobile-data-summary mobile-two-line-summary mobile-two-line-summary-select" role="button" tabindex="0" aria-expanded="false">
            <label class="mobile-collect-check-wrap" onclick="event.stopPropagation();">
              <input type="checkbox" class="mobile-collect-check" data-key="${attr(key)}" ${checked} ${disabled} aria-label="${attr(group.name || '품목')} 선택">
            </label>
            <span class="mobile-category-badge">${esc(group.category || '-')}</span>
            <div class="mobile-two-line-info">
              <strong class="mobile-two-line-name">${esc(group.name || '-')}</strong>
              <div class="mobile-two-line-meta">
                <span>${esc(group.maker || '-')}</span>
                <i>/</i>
                <span>${esc(group.code || '-')}</span>
              </div>
            </div>
          </div>
          <div class="mobile-data-detail">
            <div class="mobile-detail-grid">
              <span>CAS</span><b>${casHtml || '-'}</b>
              <span>등급 / 규격</span><b>${esc([group.grade,group.capacity].filter(Boolean).join(' / ') || '-')}</b>
              <span>총수량</span><b>${esc(qtyText)}</b>
            </div>
            ${entries ? `<div class="mobile-entry-list">${entries}</div>` : ''}
            <div class="mobile-vendor-section">
              <div class="mobile-vendor-title">거래처 / 견적</div>
              <div class="mobile-vendor-block ${selectedVendor === 'vendor1' ? 'auto-selected' : ''}" data-mobile-vendor-group="vendor1">
                <div class="mobile-vendor-grid">
                  <label>거래처1</label><input class="mobile-collect-input" data-key="${attr(key)}" data-field="vendor1" value="${attr(meta.vendor1 || '')}" ${readonly}>
                  <label>단가</label><input class="mobile-collect-input" inputmode="decimal" data-key="${attr(key)}" data-field="unit1" value="${attr(collect.formatMoneyInput?.(unit1) ?? unit1)}" ${readonly}>
                  <label>가격</label><input class="mobile-collect-input" inputmode="decimal" data-key="${attr(key)}" data-field="price1" value="${attr(collect.formatMoneyInput?.(price1) ?? price1)}" ${readonly}>
                </div>
              </div>
              ${hasFixedReason ? `
                <div class="mobile-vendor-block"><div class="mobile-detail-grid"><span>비교견적</span><b>${esc(reason)}</b></div></div>
              ` : `
                <div class="mobile-vendor-block ${selectedVendor === 'vendor2' ? 'auto-selected' : ''}" data-mobile-vendor-group="vendor2">
                  <div class="mobile-vendor-grid">
                    <label>거래처2</label><input class="mobile-collect-input" data-key="${attr(key)}" data-field="vendor2" value="${attr(meta.vendor2 || '')}" ${readonly}>
                    <label>단가</label><input class="mobile-collect-input" inputmode="decimal" data-key="${attr(key)}" data-field="unit2" value="${attr(collect.formatMoneyInput?.(unit2) ?? unit2)}" ${readonly}>
                    <label>가격</label><input class="mobile-collect-input" inputmode="decimal" data-key="${attr(key)}" data-field="price2" value="${attr(collect.formatMoneyInput?.(price2) ?? price2)}" ${readonly}>
                  </div>
                </div>`}
            </div>
            <div class="mobile-detail-actions">${actionButton}</div>
          </div>
        </article>`;
    }).join('');

    container.innerHTML = cards;

    bindCardToggles(container);

    container.querySelectorAll('.mobile-collect-check').forEach((checkbox)=>{
      checkbox.addEventListener('change',(event)=>{
        const key = event.target.dataset.key || '';
        if (!key) return;
        if (event.target.checked){
          if (!collect.selectedKeys.includes(key)) collect.selectedKeys.push(key);
        } else {
          collect.selectedKeys = collect.selectedKeys.filter((v)=>v !== key);
        }
        // Keep the hidden PC checkbox synchronized because the existing confirmation logic reads it.
        document.querySelectorAll('#collectList .collect-check').forEach((hidden)=>{
          if (hidden.dataset.key === key) hidden.checked = event.target.checked;
        });
        collect.saveSelectedKeys?.();
        collect.syncCollectAllToggle?.();
      });
    });

    container.querySelectorAll('.mobile-collect-input').forEach((input)=>{
      input.addEventListener('input',(event)=>{
        const el = event.target;
        const key = el.dataset.key || '';
        const field = el.dataset.field || '';
        const meta = collect.getMeta(key);
        if (!key || !field || meta.confirmed) return;
        const group = groupMap.get(String(key));
        const qty = Number(group?.collectedQty || 0);

        if (field === 'unit1' || field === 'unit2'){
          meta[field] = collect.normalizeNumber?.(el.value) ?? num(el.value);
          collect.setAutoPriceIfNeeded?.(meta, field === 'unit1' ? 1 : 2, qty);
          const priceField = field === 'unit1' ? 'price1' : 'price2';
          const priceInput = el.closest('.mobile-data-card')?.querySelector(`.mobile-collect-input[data-field="${priceField}"]`);
          if (priceInput && !meta[`${priceField}Manual`]){
            const amount = collect.getEffectiveAmount?.(meta, field === 'unit1' ? 1 : 2, qty) ?? num(meta[priceField]);
            priceInput.value = collect.formatMoneyInput?.(amount) ?? String(amount);
          }
        } else if (field === 'price1' || field === 'price2'){
          const value = collect.normalizeNumber?.(el.value) ?? num(el.value);
          meta[field] = value;
          meta[`${field}Manual`] = value > 0;
        } else {
          meta[field] = el.value;
        }

        collect.saveCollectMeta?.();
        collect.scheduleCollectItemSave?.(key);
        collect.updateAutoBadges?.(key);
        const selected = meta.confirmed ? meta.selectedVendor : (collect.autoSelectVendor?.(meta,qty) || '');
        el.closest('.mobile-data-card')?.querySelectorAll('[data-mobile-vendor-group]').forEach((block)=>{
          block.classList.toggle('auto-selected', block.dataset.mobileVendorGroup === selected);
        });
      });
      input.addEventListener('blur',(event)=>{
        const field = event.target.dataset.field || '';
        if (['unit1','unit2','price1','price2'].includes(field)){
          event.target.value = collect.formatMoneyInput?.(event.target.value) ?? event.target.value;
        }
      });
    });

    container.querySelectorAll('.mobile-collect-cancel').forEach((btn)=>btn.addEventListener('click',(event)=>{
      event.stopPropagation();
      collect.cancelConfirmByKey?.(btn.dataset.key);
    }));
    container.querySelectorAll('.mobile-collect-exclude').forEach((btn)=>btn.addEventListener('click',(event)=>{
      event.stopPropagation();
      collect.excludeCollectByKey?.(btn.dataset.key);
    }));
  }

  function wrapCollectRender(){
    const collect = APP.collect;
    if (!collect || collect.__mobileCollectWrapped) return;
    collect.__mobileCollectWrapped = true;
    const original = collect.renderCollect?.bind(collect);
    if (!original) return;
    collect.renderCollect = function(...args){
      const result = original(...args);
      try { renderCollectMobileCards(); } catch (error) { console.warn('모바일 제품취합 카드 렌더링 실패', error); }
      return result;
    };
  }

  /* --------------------- 취합정리 카드 --------------------- */
  function prepareCard(row){
    return `
      <article class="mobile-data-card">
        <div class="mobile-data-summary mobile-two-line-summary" role="button" tabindex="0" aria-expanded="false">
          <span class="mobile-category-badge">${esc(row.category || '-')}</span>
          <div class="mobile-two-line-info">
            <strong class="mobile-two-line-name">${esc(row.name || '-')}</strong>
            <div class="mobile-two-line-meta">
              <span>${esc(row.maker || '-')}</span>
              <i>/</i>
              <span>${esc(row.code || '-')}</span>
            </div>
          </div>
        </div>
        <div class="mobile-data-detail">
          <div class="mobile-detail-grid">
            <span>CAS</span><b>${esc(row.cas || '-')}</b>
            <span>등급 / 규격</span><b>${esc([row.grade,row.capacity].filter(Boolean).join(' / ') || '-')}</b>
            <span>수량</span><b>${esc(row.qty ?? 0)}</b>
            <span>용도</span><b>${esc(row.usage || '-')}</b>
            <span>구매 단가</span><b>${money(row.purchaseUnit)}원</b>
            <span>구매 금액</span><b>${money(row.purchaseAmount)}원</b>
            <span>구매 거래처</span><b>${esc(row.purchaseVendor || '-')}</b>
            <span>비교 단가</span><b>${num(row.compareUnit) ? money(row.compareUnit)+'원' : '-'}</b>
            <span>비교 금액</span><b>${num(row.compareAmount) ? money(row.compareAmount)+'원' : '-'}</b>
            <span>비교 거래처</span><b>${esc(row.compareVendor || '-')}</b>
            <span>비고</span><b>${esc(row.remark || '-')}</b>
          </div>
        </div>
      </article>`;
  }

  function renderPrepareMobileCards(){
    const collect = APP.collect;
    if (!collect) return;
    const summaryWrap = document.querySelector('#prepareSummaryPanel .table-wrap');
    const quoteWrap = document.querySelector('#prepareQuotePanel .table-wrap');
    const summaryContainer = ensureAfter(summaryWrap,'prepareSummaryMobileCards');
    const quoteContainer = ensureAfter(quoteWrap,'prepareQuoteMobileCards');
    if (!summaryContainer || !quoteContainer) return;

    const view = collect.getPrepareActiveView?.() || 'main';
    const summaryRows = collect.getPrepareRowsByView?.(view,'summary') || [];
    const quoteRows = collect.getPrepareRowsByView?.(view,'quote') || [];
    summaryContainer.innerHTML = summaryRows.length ? summaryRows.map(prepareCard).join('') : '<div class="mobile-empty">취합 정리 반영된 자료가 없습니다.</div>';
    quoteContainer.innerHTML = quoteRows.length ? quoteRows.map(prepareCard).join('') : '<div class="mobile-empty">비교견적 자료가 없습니다.</div>';
    bindCardToggles(summaryContainer);
    bindCardToggles(quoteContainer);
  }

  function wrapPrepareRender(){
    const collect = APP.collect;
    if (!collect || collect.__mobilePrepareWrapped) return;
    collect.__mobilePrepareWrapped = true;
    const original = collect.renderPrepare?.bind(collect);
    if (!original) return;
    collect.renderPrepare = function(...args){
      const result = original(...args);
      try { renderPrepareMobileCards(); } catch (error) { console.warn('모바일 취합정리 카드 렌더링 실패', error); }
      return result;
    };
  }

  /* --------------------- 제품관리 카드 --------------------- */
  function renderProductMobileCards(){
    const pm = APP.productManagement;
    if (!pm) return;
    const list = document.getElementById('pmProductList');
    const tableWrap = list?.closest('.table-wrap');
    if (tableWrap) tableWrap.classList.add('mobile-hide-pm-table');
    const container = ensureAfter(tableWrap,'pmProductMobileCards');
    if (!container) return;

    const rows = pm.getFilteredProducts?.() || [];
    if (!rows.length){
      container.innerHTML = '<div class="mobile-empty">등록된 제품이 없습니다.</div>';
      return;
    }

    container.innerHTML = `
      ${rows.map((p)=>{
        const cas = pm.getProductCasNumbers?.(p)?.join(', ') || p.cas || '-';
        return `
          <article class="mobile-data-card ${p.is_active === false ? 'is-inactive' : ''}" data-product-id="${attr(p.id)}">
            <div class="mobile-data-summary mobile-two-line-summary" role="button" tabindex="0" aria-expanded="false">
              <span class="mobile-category-badge">${esc(p.category || '-')}</span>
              <div class="mobile-two-line-info">
                <strong class="mobile-two-line-name">${esc(p.name || '-')}</strong>
                <div class="mobile-two-line-meta">
                  <span>${esc(p.maker || '-')}</span>
                  <i>/</i>
                  <span>${esc(p.code || '-')}</span>
                </div>
              </div>
            </div>
            <div class="mobile-data-detail">
              <div class="mobile-detail-grid">
                <span>규격</span><b>${esc(p.capacity || '-')}</b>
                <span>CAS</span><b>${esc(cas)}</b>
                <span>등급</span><b>${esc(p.grade || '-')}</b>
                <span>기본거래처</span><b>${esc(p.default_vendor || '-')}</b>
                <span>선정사유</span><b>${esc(p.default_vendor_reason || '-')}</b>
                <span>사용여부</span><b>${p.is_active === false ? '사용중지' : '사용'}</b>
                <span>수정자</span><b>${esc(p.updated_by || p.created_by || '-')}</b>
                <span>비고</span><b>${esc(p.memo || '-')}</b>
              </div>
              <div class="mobile-detail-actions">
                <button type="button" class="btn primary mobile-pm-edit" data-id="${attr(p.id)}">제품 정보 수정</button>
              </div>
            </div>
          </article>`;
      }).join('')}`;

    bindCardToggles(container);
    container.querySelectorAll('.mobile-pm-edit').forEach((btn)=>btn.addEventListener('click',(event)=>{
      event.stopPropagation();
      pm.fillProductForm?.(Number(btn.dataset.id));
    }));
  }

  function wrapProductRender(){
    const pm = APP.productManagement;
    if (!pm || pm.__mobileProductWrapped) return;
    pm.__mobileProductWrapped = true;
    const original = pm.renderProducts?.bind(pm);
    if (!original) return;
    pm.renderProducts = function(...args){
      const result = original(...args);
      try { renderProductMobileCards(); } catch (error) { console.warn('모바일 제품관리 카드 렌더링 실패', error); }
      return result;
    };
  }

  /* Shared methods are already loaded before this script. Wrap now so first render uses mobile additions. */
  wrapRequestRender();
  wrapCollectRender();
  wrapPrepareRender();
  wrapProductRender();

  document.addEventListener('DOMContentLoaded',()=>{
    document.documentElement.classList.add('reagent-mobile-build');
    try { syncRequestMonthFilter(); } catch (_) {}

    // In case another script replaced a renderer during startup, ensure wrappers once more.
    wrapRequestRender();
    wrapCollectRender();
    wrapPrepareRender();
    wrapProductRender();

    window.setTimeout(()=>{
      try { syncRequestMonthFilter(); } catch (_) {}
      try { renderCollectMobileCards(); } catch (_) {}
      try { renderPrepareMobileCards(); } catch (_) {}
      try { renderProductMobileCards(); } catch (_) {}
    },350);
  });
})();
