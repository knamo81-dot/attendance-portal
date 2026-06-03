/* settings-asset.js | Asset setting management for Settings page */
(function () {
  'use strict';

  if (window.__SETTINGS_ASSET_ADMIN_LOADED__) return;
  window.__SETTINGS_ASSET_ADMIN_LOADED__ = true;

  const TABLE = 'asset_setting_items';

  const SETTING_TYPES = [
    { key: 'cost_type', title: '비용구분 관리', desc: '예: 일반, 제조, 연구소', placeholder: '예: 연구소' },
    { key: 'account_subject', title: '계정과목 관리', desc: '예: 구축물, 공구와기구, 비품, 기계장치', placeholder: '예: 기계장치' },
    { key: 'asset_status', title: '자산상태 관리', desc: '예: 사용중, 미사용, 폐기, 매각, 이관', placeholder: '예: 사용중' },
    { key: 'location', title: '위치 관리', desc: '예: 연구소 3층, 분석실, 제조동', placeholder: '예: 분석실' },
    { key: 'extra_field', title: '추가정보 관리', desc: '예: QA관리번호, Tax코드, ERP번호, CAPEX번호', placeholder: '예: QA관리번호' }
  ];

  const DEFAULT_ITEMS = {
    cost_type: ['일반', '제조', '연구소'],
    account_subject: ['구축물', '공구와기구', '비품', '기계장치', '건물부속설비', '차량운반구', '건물'],
    asset_status: ['사용중', '미사용', '폐기', '매각', '이관'],
    location: [],
    extra_field: ['QA관리번호', 'Tax코드']
  };

  let state = {
    loaded: false,
    rows: [],
    busy: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalize(value) {
    return String(value || '').trim();
  }

  function getSupabase() {
    const ctx = typeof window.getPortalAuthContext === 'function' ? window.getPortalAuthContext() : {};
    return window.settingsSupabase || ctx.supabase || null;
  }

  function getCompanyId() {
    try {
      if (typeof window.getSettingsCompanyId === 'function') return normalize(window.getSettingsCompanyId());
    } catch (_) {}
    try {
      if (typeof window.getPortalCompanyId === 'function') return normalize(window.getPortalCompanyId());
    } catch (_) {}
    try {
      if (typeof window.getCompanyId === 'function') return normalize(window.getCompanyId());
    } catch (_) {}
    try {
      const ctx = typeof window.getPortalAuthContext === 'function' ? window.getPortalAuthContext() : {};
      return normalize(ctx.activeCompanyId || ctx.active_company_id || ctx.profile?.company_id || ctx.user?.company_id || '');
    } catch (_) {}
    return '';
  }

  function canEdit() {
    try {
      const ctx = typeof window.getPortalAuthContext === 'function' ? window.getPortalAuthContext() : {};
      const role = normalize(ctx.role || ctx.profile?.role || '').toLowerCase();
      return ['admin', 'service_admin', 'service-admin', 'super_admin'].includes(role) || ctx.isServiceAdmin === true;
    } catch (_) {
      return true;
    }
  }

  function sortRows(rows) {
    return (rows || []).slice().sort((a, b) => {
      const ao = Number(a.sort_order || 0);
      const bo = Number(b.sort_order || 0);
      if (ao !== bo) return ao - bo;
      return String(a.item_name || '').localeCompare(String(b.item_name || ''), 'ko');
    });
  }

  function rowsByType(type) {
    return sortRows(state.rows.filter(row => row.setting_type === type));
  }

  function setFeedback(message, type) {
    const el = $('assetSettingsFeedback');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'asset-settings-feedback';
    if (message) el.classList.add(type || 'ok');
  }

  function injectStyle() {
    if ($('assetSettingsStyle')) return;
    const style = document.createElement('style');
    style.id = 'assetSettingsStyle';
    style.textContent = `
      #settings-page .asset-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
      #settings-page .asset-setting-card{border:1px solid #e2e8f0;border-radius:15px;background:#fff;padding:14px;box-shadow:0 5px 14px rgba(15,23,42,.045)}
      #settings-page .asset-setting-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      #settings-page .asset-setting-title{font-size:16px;font-weight:800;color:#0f172a}
      #settings-page .asset-setting-desc{margin-top:4px;font-size:11px;line-height:1.45;color:#64748b}
      #settings-page .asset-setting-count{display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 10px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;color:#334155;font-size:12px;font-weight:800;white-space:nowrap}
      #settings-page .asset-setting-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-bottom:10px}
      #settings-page .asset-setting-list{display:grid;gap:7px;min-height:40px}
      #settings-page .asset-setting-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:center;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:8px 9px}
      #settings-page .asset-setting-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:800;color:#0f172a}
      #settings-page .asset-setting-badge{display:inline-flex;align-items:center;justify-content:center;height:24px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap}
      #settings-page .asset-setting-badge.active{background:#dcfce7;color:#15803d}
      #settings-page .asset-setting-badge.inactive{background:#f1f5f9;color:#64748b}
      #settings-page .asset-setting-actions{display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:nowrap}
      #settings-page .asset-settings-feedback{margin-top:10px;font-size:12px;font-weight:800;line-height:1.45}
      #settings-page .asset-settings-feedback.ok{color:#15803d}
      #settings-page .asset-settings-feedback.error{color:#b91c1c}
      #settings-page .asset-settings-feedback.loading{color:#475569}
      #settings-page .asset-settings-sql{margin-top:10px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;color:#334155;padding:12px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow:auto}
      @media (max-width:1250px){#settings-page .asset-settings-grid{grid-template-columns:1fr}}
      @media (max-width:760px){#settings-page .asset-setting-add,#settings-page .asset-setting-row{grid-template-columns:1fr}.asset-setting-actions{justify-content:flex-start!important}}
    `;
    document.head.appendChild(style);
  }

  function renderShell() {
    const mount = $('assetSettingsMount');
    if (!mount) return;

    injectStyle();

    mount.innerHTML = `
      <div class="real-card">
        <div class="real-box-head">
          <div>
            <div class="real-box-title">자산관리 설정</div>
            <div class="real-box-sub">자산 프로그램에서 사용할 회사별 기준값을 관리합니다. 기존 데이터 보호를 위해 항목 삭제 대신 사용중/미사용 전환만 제공합니다.</div>
          </div>
          <button id="assetSettingsRefreshBtn" class="real-btn ghost" type="button">새로고침</button>
        </div>
        <div class="real-warning-box" style="margin-top:0;margin-bottom:10px;">
          추가정보는 예약장소설정처럼 항목명을 직접 추가하는 방식입니다. 예: QA관리번호, Tax코드, ERP번호, CAPEX번호. 미사용 처리한 항목은 신규 입력 화면에서는 숨기고, 기존 자산 상세/이력에서는 유지하는 구조로 사용합니다.
        </div>
        <div id="assetSettingsGrid" class="asset-settings-grid"></div>
        <div id="assetSettingsFeedback" class="asset-settings-feedback"></div>
      </div>
    `;

    $('assetSettingsRefreshBtn')?.addEventListener('click', () => load(true));
    renderCards();
  }

  function renderCards() {
    const grid = $('assetSettingsGrid');
    if (!grid) return;

    const editable = canEdit();
    grid.innerHTML = SETTING_TYPES.map(type => {
      const rows = rowsByType(type.key);
      const activeCount = rows.filter(row => row.is_active !== false).length;
      return `
        <section class="asset-setting-card" data-asset-setting-type="${esc(type.key)}">
          <div class="asset-setting-head">
            <div>
              <div class="asset-setting-title">${esc(type.title)}</div>
              <div class="asset-setting-desc">${esc(type.desc)}</div>
            </div>
            <div class="asset-setting-count">사용중 ${activeCount}</div>
          </div>
          <div class="asset-setting-add">
            <input class="real-input asset-setting-input" data-type="${esc(type.key)}" placeholder="${esc(type.placeholder)}" ${editable ? '' : 'disabled'}>
            <button class="real-btn asset-setting-add-btn" data-type="${esc(type.key)}" type="button" ${editable ? '' : 'disabled'}>추가</button>
          </div>
          <div class="asset-setting-list">
            ${rows.length ? rows.map(rowTemplate).join('') : '<div class="real-empty" style="padding:14px;">등록된 항목이 없습니다.</div>'}
          </div>
        </section>
      `;
    }).join('');

    grid.querySelectorAll('.asset-setting-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const input = grid.querySelector('.asset-setting-input[data-type="' + CSS.escape(type) + '"]');
        addItem(type, input?.value || '');
      });
    });

    grid.querySelectorAll('.asset-setting-input').forEach(input => {
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          addItem(input.getAttribute('data-type'), input.value || '');
        }
      });
    });

    grid.querySelectorAll('[data-asset-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-asset-action');
        const row = state.rows.find(item => String(item.id) === String(id));
        if (!row) return;
        if (action === 'toggle') toggleItem(row);
        if (action === 'rename') renameItem(row);
      });
    });
  }

  function rowTemplate(row) {
    const active = row.is_active !== false;
    const editable = canEdit();
    return `
      <div class="asset-setting-row">
        <div class="asset-setting-name" title="${esc(row.item_name)}">${esc(row.item_name)}</div>
        <span class="asset-setting-badge ${active ? 'active' : 'inactive'}">${active ? '사용중' : '미사용'}</span>
        <div class="asset-setting-actions">
          <button class="real-btn ghost" data-asset-action="rename" data-id="${esc(row.id)}" type="button" ${editable ? '' : 'disabled'}>수정</button>
          <button class="real-btn ${active ? 'danger' : 'soft'}" data-asset-action="toggle" data-id="${esc(row.id)}" type="button" ${editable ? '' : 'disabled'}>${active ? '미사용' : '사용중'}</button>
        </div>
      </div>
    `;
  }

  function tableMissingSql() {
    return `-- 자산관리 설정 테이블이 아직 없다면 Supabase SQL Editor에서 1회 실행하세요.
create table if not exists public.asset_setting_items (
  id bigint generated by default as identity primary key,
  company_id uuid not null,
  setting_type text not null,
  item_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_setting_items_type_check check (setting_type in ('cost_type','account_subject','asset_status','location','extra_field'))
);

create index if not exists idx_asset_setting_items_company_type
on public.asset_setting_items(company_id, setting_type, sort_order, id);

create unique index if not exists ux_asset_setting_items_company_type_name
on public.asset_setting_items(company_id, setting_type, item_name);`;
  }

  async function load(force) {
    renderShell();

    const sb = getSupabase();
    const companyId = getCompanyId();
    if (!sb) {
      setFeedback('Supabase 연결을 찾지 못했습니다.', 'error');
      return;
    }
    if (!companyId) {
      setFeedback('회사 정보(company_id)를 확인하지 못했습니다. 포탈에서 다시 접속해 주세요.', 'error');
      return;
    }

    setFeedback('자산관리 설정을 불러오는 중입니다.', 'loading');
    try {
      const { data, error } = await sb
        .from(TABLE)
        .select('*')
        .eq('company_id', companyId)
        .order('setting_type', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      state.rows = data || [];
      state.loaded = true;
      renderCards();
      setFeedback('자산관리 설정을 불러왔습니다.', 'ok');
    } catch (error) {
      console.error('[settings-asset] load failed:', error);
      const mount = $('assetSettingsMount');
      if (mount) {
        renderShell();
        const fb = $('assetSettingsFeedback');
        if (fb) {
          fb.className = 'asset-settings-feedback error';
          fb.textContent = '자산관리 설정 테이블을 불러오지 못했습니다. asset_setting_items 테이블 생성 여부를 확인해 주세요.';
        }
        const box = document.createElement('div');
        box.className = 'asset-settings-sql';
        box.textContent = tableMissingSql();
        mount.querySelector('.real-card')?.appendChild(box);
      }
    }
  }

  async function ensureDefaultItems(type) {
    const defaults = DEFAULT_ITEMS[type] || [];
    if (!defaults.length) return;
    const existing = rowsByType(type).map(row => normalize(row.item_name));
    const missing = defaults.filter(name => !existing.includes(name));
    for (const name of missing) {
      await insertItem(type, name, true);
    }
  }

  async function insertItem(type, name, silent) {
    const sb = getSupabase();
    const companyId = getCompanyId();
    const rows = rowsByType(type);
    const sortOrder = rows.length ? Math.max(...rows.map(row => Number(row.sort_order || 0))) + 10 : 10;
    const payload = {
      company_id: companyId,
      setting_type: type,
      item_name: name,
      is_active: true,
      sort_order: sortOrder,
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from(TABLE).insert(payload);
    if (error) throw error;
    if (!silent) setFeedback('항목을 추가했습니다.', 'ok');
  }

  async function addItem(type, value) {
    const name = normalize(value);
    if (!canEdit()) return;
    if (!name) {
      setFeedback('추가할 항목명을 입력해 주세요.', 'error');
      return;
    }
    if (rowsByType(type).some(row => normalize(row.item_name) === name)) {
      setFeedback('이미 등록된 항목입니다.', 'error');
      return;
    }
    try {
      await insertItem(type, name, false);
      const input = document.querySelector('.asset-setting-input[data-type="' + CSS.escape(type) + '"]');
      if (input) input.value = '';
      await load(true);
    } catch (error) {
      console.error('[settings-asset] add failed:', error);
      setFeedback(error?.message || '항목 추가 중 오류가 발생했습니다.', 'error');
    }
  }

  async function toggleItem(row) {
    if (!canEdit()) return;
    const sb = getSupabase();
    const companyId = getCompanyId();
    try {
      const next = row.is_active === false;
      const { error } = await sb
        .from(TABLE)
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('company_id', companyId);
      if (error) throw error;
      await load(true);
      setFeedback(next ? '사용중으로 변경했습니다.' : '미사용으로 변경했습니다. 기존 자산 데이터는 유지됩니다.', 'ok');
    } catch (error) {
      console.error('[settings-asset] toggle failed:', error);
      setFeedback(error?.message || '상태 변경 중 오류가 발생했습니다.', 'error');
    }
  }

  async function renameItem(row) {
    if (!canEdit()) return;
    const nextName = normalize(window.prompt('항목명을 수정합니다.', row.item_name || ''));
    if (!nextName || nextName === row.item_name) return;
    if (rowsByType(row.setting_type).some(item => String(item.id) !== String(row.id) && normalize(item.item_name) === nextName)) {
      setFeedback('이미 등록된 항목명입니다.', 'error');
      return;
    }
    const sb = getSupabase();
    const companyId = getCompanyId();
    try {
      const { error } = await sb
        .from(TABLE)
        .update({ item_name: nextName, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('company_id', companyId);
      if (error) throw error;
      await load(true);
      setFeedback('항목명을 수정했습니다.', 'ok');
    } catch (error) {
      console.error('[settings-asset] rename failed:', error);
      setFeedback(error?.message || '항목명 수정 중 오류가 발생했습니다.', 'error');
    }
  }

  async function seedDefaults() {
    const sb = getSupabase();
    const companyId = getCompanyId();
    if (!sb || !companyId) return;
    try {
      for (const type of SETTING_TYPES.map(item => item.key)) {
        await ensureDefaultItems(type);
      }
      await load(true);
      setFeedback('기본 항목을 생성했습니다.', 'ok');
    } catch (error) {
      console.warn('[settings-asset] seed default failed:', error);
    }
  }

  window.loadAssetSettingsAdminPage = function loadAssetSettingsAdminPage() {
    renderShell();
    load(true).then(() => {
      const hasAny = state.rows && state.rows.length > 0;
      if (!hasAny) seedDefaults();
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    if ($('adminSectionAsset') && !$('assetSettingsMount')?.dataset.initialized) {
      renderShell();
      const mount = $('assetSettingsMount');
      if (mount) mount.dataset.initialized = '1';
    }
  });
})();
