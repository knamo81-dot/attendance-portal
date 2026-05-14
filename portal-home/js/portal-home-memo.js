/* portal-home-memo.js | 메모 데이터/렌더링 로직 분리 */

function memoBoardHeightStorageKey() {
      try {
        const em = String(portalAuth().email || '').trim().toLowerCase();
        return em ? `memoBoardHeight:${em}` : 'memoBoardHeight';
      } catch (_) {
        return 'memoBoardHeight';
      }
    }

    function hydrateMemoBoardHeightFromStorage() {
      try {
        const raw = localStorage.getItem(memoBoardHeightStorageKey());
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 720 && n <= 2200) {
          state.memoBoardHeight = Math.round(n);
        }
      } catch (_) { /* ignore */ }
    }

    function persistMemoBoardHeightToStorage(px) {
      try {
        const n = Math.round(Number(px));
        if (!Number.isFinite(n) || n < 720 || n > 2200) return;
        localStorage.setItem(memoBoardHeightStorageKey(), String(n));
      } catch (_) { /* ignore */ }
    }

    function parseLegacyMemoContentJson(raw) {
      if (!raw || !String(raw).trim().startsWith('{')) return null;
      try {
        const o = JSON.parse(raw);
        if (o && o.v === 1) {
          return { content: o.txt || '', image: o.img || '', imageOnly: !!o.imageOnly };
        }
      } catch (_) { /* ignore */ }
      return null;
    }

    function mapMemoRowToState(row) {
      let contentText = row.content != null ? String(row.content) : '';
      let imageUrl = row.image_url ? String(row.image_url) : '';
      let imageOnly = !!row.is_image_only;
      const legacy = parseLegacyMemoContentJson(contentText);
      if (legacy) {
        contentText = legacy.content;
        if (!imageUrl && legacy.image) imageUrl = legacy.image;
        imageOnly = legacy.imageOnly;
      }
      const color = row.color || '#fef3c7';
      const layout = {
        x: row.layout_x ?? 40,
        y: row.layout_y ?? 40,
        w: row.layout_w ?? 260,
        h: row.layout_h ?? (imageOnly ? 120 : 170),
        rotate: Number(row.rotate) || 0,
        color
      };
      return {
        id: String(row.id),
        serverId: row.id,
        memoDate: row.memo_date || todayDateKey,
        boardType: row.board_type || 'personal',
        title: row.title || '',
        tag: row.tag || '메모',
        pinned: !!row.pinned,
        imageOnly,
        content: contentText,
        image: imageUrl,
        z: row.z_index ?? 1,
        layout_w: row.layout_w,
        layout_h: row.layout_h,
        expandedWidth: row.layout_w || 320,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        is_deleted: !!row.is_deleted,
        deletedAt: row.deleted_at || null,
        deletedBy: row.deleted_by || null,
        layout: { x: layout.x, y: layout.y, rotate: layout.rotate, color: layout.color, w: layout.w, h: layout.h },
        originalLayout: {
          x: layout.x,
          y: layout.y,
          rotate: layout.rotate,
          color: layout.color,
          w: layout.w,
          h: layout.h
        }
      };
    }

    function memoStateToDbPayload(note, email, name) {
      const lw = Math.round(note.layout_w ?? note.layout?.w ?? note.expandedWidth ?? getMemoAutoWidth(note.title, note.content) ?? 320);
      const lh = Math.round(note.layout_h ?? note.layout?.h ?? (note.imageOnly ? 120 : 170));
      const payload = {
        created_by_email: email,
        created_by_name: name,
        title: note.title || '',
        content: note.content || '',
        tag: note.tag || '메모',
        color: note.layout?.color || note.color || '#fef3c7',
        pinned: !!note.pinned,
        layout_x: Math.round(note.layout?.x ?? 40),
        layout_y: Math.round(note.layout?.y ?? 40),
        layout_w: lw,
        layout_h: lh,
        rotate: Number(note.layout?.rotate) || 0,
        z_index: Math.round(note.z || 1),
        memo_date: note.memoDate || todayDateKey,
        is_image_only: !!note.imageOnly,
        image_url: note.image ? String(note.image) : null,
        board_type: note.boardType || 'personal',
        is_deleted: note.is_deleted === true,
        deleted_at: null,
        deleted_by: null
      };
      if (note.originalLayout) {
        payload.original_layout = {
          x: Math.round(note.originalLayout.x ?? note.layout?.x ?? 40),
          y: Math.round(note.originalLayout.y ?? note.layout?.y ?? 40),
          w: note.originalLayout.w != null ? Math.round(note.originalLayout.w) : Math.round(note.layout?.w ?? 260),
          h: note.originalLayout.h != null ? Math.round(note.originalLayout.h) : Math.round(note.layout?.h ?? 170),
          rotate: Number(note.originalLayout.rotate) || 0,
          color: note.originalLayout.color || note.layout?.color || '#fef3c7'
        };
      }
      return payload;
    }

    async function loadMemosFromServer() {
      state.memoLoading = true;
      try {
        const { sb, email } = portalAuth();
        if (!sb || !email) {
          state.notes = [];
          return;
        }
        const { data, error } = await sb.from('portal_memos')
          .select('*')
          .eq('created_by_email', email)
          .eq('is_deleted', false)
          .order('pinned', { ascending: false })
          .order('z_index', { ascending: false })
          .order('created_at', { ascending: true });
        if (error) throw error;
        state.notes = (data || []).map(mapMemoRowToState);
      } catch (e) {
        console.error('loadMemosFromServer', e);
        showPortalDataMessage(e?.message || '메모를 불러오지 못했습니다.', 'error', 'memo');
        state.notes = [];
      } finally {
        state.memoLoading = false;
      }
    }

    async function loadTrashMemosFromServer() {
      try {
        const { sb, email } = portalAuth();
        if (!sb || !email) {
          state.trash = [];
          return;
        }
        const { data, error } = await sb.from('portal_memos')
          .select('*')
          .eq('created_by_email', email)
          .eq('is_deleted', true)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        state.trash = (data || []).map(mapMemoRowToState);
      } catch (e) {
        console.error('loadTrashMemosFromServer', e);
        showPortalDataMessage(e?.message || '휴지통 메모를 불러오지 못했습니다.', 'error', 'memo');
        state.trash = [];
      }
    }

    async function createMemoOnServer(payload) {
      const { sb, email, name } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const insertRow = payload.created_by_email != null ? payload : memoStateToDbPayload(payload, email, name);
      const { data, error } = await sb.from('portal_memos').insert([insertRow]).select('*').single();
      if (error) throw error;
      return data;
    }

    /**
     * @param {object} [options]
     * @param {boolean} [options.silent] true면 위치·크기 등 조용한 저장: 이 함수 및 호출부에서 토스트를 띄우지 않음.
     */
    async function updateMemoOnServer(id, partialUiNote, options = {}) {
      const { sb, email, name } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const base = state.notes.find(n => String(n.serverId || n.id) === String(id));
      if (!base) throw new Error('메모를 찾을 수 없습니다.');
      const merged = {
        ...base,
        ...partialUiNote,
        layout: { ...base.layout, ...(partialUiNote.layout || {}) }
      };
      if (partialUiNote.originalLayout != null) {
        merged.originalLayout = {
          ...(base.originalLayout || base.layout || {}),
          ...partialUiNote.originalLayout
        };
      }
      if (partialUiNote.layout_w != null) merged.layout_w = partialUiNote.layout_w;
      if (partialUiNote.layout_h != null) merged.layout_h = partialUiNote.layout_h;
      const payload = memoStateToDbPayload(merged, email, name);
      delete payload.created_by_email;
      delete payload.created_by_name;
      delete payload.deleted_at;
      delete payload.deleted_by;
      const { data, error } = await sb.from('portal_memos').update(payload).eq('id', id).eq('created_by_email', email).select('*').single();
      if (error) throw error;
      return data;
    }

    async function patchMemoOnServer(id, patch) {
      const { sb, email } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const { data, error } = await sb.from('portal_memos').update(patch).eq('id', id).eq('created_by_email', email).select('*').single();
      if (error) throw error;
      return data;
    }

    async function softDeleteMemoOnServer(id) {
      const { email } = portalAuth();
      const em = String(email || '').trim().toLowerCase();
      await patchMemoOnServer(id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: em || null
      });
    }

    async function restoreMemoOnServer(id) {
      await patchMemoOnServer(id, {
        is_deleted: false,
        deleted_at: null,
        deleted_by: null
      });
    }

    async function permanentDeleteMemoOnServer(id) {
      const { sb, email } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const { error } = await sb.from('portal_memos').delete().eq('id', id).eq('created_by_email', email);
      if (error) throw error;
    }

    async function persistMemoLayoutFromDom(board, id) {
      const sid = String(id);
      const noteEl = board.querySelector(`[data-note-id="${CSS.escape(sid)}"]`);
      const n = state.notes.find(x => String(x.id) === sid);
      if (!noteEl || !n || !n.serverId) return;
      const r = noteEl.getBoundingClientRect();
      const w = Math.max(220, Math.round(r.width));
      const h = Math.max(120, Math.round(r.height));
      const x = Math.max(0, Math.round(parseFloat(noteEl.style.left) || n.layout?.x || 0));
      const y = Math.max(0, Math.round(parseFloat(noteEl.style.top) || n.layout?.y || 0));
      state.notes = state.notes.map(note => String(note.id) === sid
        ? {
            ...note,
            layout: { ...note.layout, x, y, w, h },
            originalLayout: { ...(note.originalLayout || note.layout), x, y, w, h },
            layout_w: w,
            layout_h: h,
            expandedWidth: w
          }
        : note);
      const moved = state.notes.find(x => String(x.id) === sid);
      await updateMemoOnServer(moved.serverId, {
        layout: moved.layout,
        originalLayout: moved.originalLayout,
        layout_w: w,
        layout_h: h,
        z: moved.z
      }, { silent: true });
    }

    

/* ===== memo UI helpers / renderer ===== */
function getMemoAutoWidth(title = '', content = '') {
      const canvas = getMemoAutoWidth.canvas || (getMemoAutoWidth.canvas = document.createElement('canvas'));
      const ctx = canvas.getContext('2d');
      const titleLines = String(title || '').split('\n');
      const contentLines = String(content || '').split('\n');
      const allLines = [...titleLines, ...contentLines, ''];
      let maxWidth = 0;

      ctx.font = '800 18px Arial';
      titleLines.forEach(line => {
        maxWidth = Math.max(maxWidth, ctx.measureText(line || '').width);
      });

      ctx.font = '400 13px Arial';
      contentLines.forEach(line => {
        maxWidth = Math.max(maxWidth, ctx.measureText(line || '').width);
      });

      const calculated = Math.ceil(maxWidth + 88);
      return Math.max(320, Math.min(1100, calculated));
    }

    const MEMO_CARD_COLLAPSED_W = 260;
    const MEMO_CARD_COLLAPSED_MIN = 240;
    const MEMO_CARD_COLLAPSED_MAX = 280;

    function getMemoStoredCardWidth(item) {
      const raw = Number(item?.layout?.w ?? item?.layout_w);
      if (!Number.isFinite(raw) || raw < 40) return MEMO_CARD_COLLAPSED_W;
      return Math.round(Math.max(220, Math.min(560, raw)));
    }

    function getMemoCollapsedMinHeight(item) {
      const raw = Number(item?.layout?.h ?? item?.layout_h);
      if (!Number.isFinite(raw) || raw < 80) return 170;
      return Math.round(Math.max(120, Math.min(900, raw)));
    }

    function getMemoDisplayWidth(item, isExpanded, isEditing) {
      if (isEditing && state.editMemo) {
        const ew = Number(state.editMemo.expandedWidth) || getMemoAutoWidth(state.editMemo.title, state.editMemo.content);
        return Math.round(Math.max(420, Math.min(1100, ew)));
      }
      if (isExpanded) {
        const ew = Number(item.expandedWidth) || getMemoAutoWidth(item.title, item.content);
        return Math.round(Math.max(420, Math.min(1100, ew)));
      }
      return MEMO_CARD_COLLAPSED_W;
    }

    function freezeMemoLayoutSnapshot(note) {
      const L = (note && note.layout) ? note.layout : {};
      const x = Number(L.x);
      const y = Number(L.y);
      const w = Number(L.w);
      const h = Number(L.h);
      return {
        x: Number.isFinite(x) ? Math.max(0, Math.round(x)) : 40,
        y: Number.isFinite(y) ? Math.max(0, Math.round(y)) : 40,
        w: Number.isFinite(w) ? Math.max(120, Math.round(w)) : Math.round(Number(note?.layout_w) || 260),
        h: Number.isFinite(h) ? Math.max(80, Math.round(h)) : Math.round(Number(note?.layout_h) || 170),
        rotate: Number(L.rotate) || 0,
        color: L.color || '#fef3c7'
      };
    }

    function memoNotePositionPx(item) {
      const s = freezeMemoLayoutSnapshot(item);
      return { x: s.x, y: s.y };
    }

    let lastMemoDragMoved = false;
    let memoDragOffset = { x: 0, y: 0 };

    
/* ===== Z-INDEX CLICK PRIORITY ===== */
let zIndexCounter = 100;



function renderMemoTab() {
      hydrateMemoBoardHeightFromStorage();
      const pinned = state.notes.filter(n => n.pinned);
      const recent = state.notes.filter(n => !n.pinned);
      const notes = [...pinned, ...recent];

      tabContent.innerHTML = `
        <div class="card memo-wrap">
          <div id="portalMemoFeedback" style="width:100%;font-size:13px;margin-bottom:10px;padding:8px 10px;border-radius:10px;display:${state.portalMemoFeedback?.msg ? 'block' : 'none'};background:${state.portalMemoFeedback?.kind === 'error' ? '#fef2f2' : '#ecfdf5'};color:${state.portalMemoFeedback?.kind === 'error' ? '#991b1b' : '#166534'};">${state.portalMemoFeedback?.msg ? escapeHtml(state.portalMemoFeedback.msg) : ''}</div>
          <div class="memo-top">
            <div>
              <div style="font-size:18px;font-weight:700;">개인 메모</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              <button class="small-btn" id="trash-toggle">휴지통 ${state.trash.length > 0 ? `(${state.trash.length})` : ''}</button>
              <button class="small-btn dark" id="new-memo-toggle">메모 추가</button>
            </div>
          </div>

          <div class="memo-board" id="memo-board" style="min-height:${state.memoBoardHeight}px;height:${state.memoBoardHeight}px;">
            <div class="memo-board-bg" aria-hidden="true">
              <div class="memo-grid"></div>
              <div class="board-dots">
                <div class="dot" style="background:#f87171"></div>
                <div class="dot" style="background:#fbbf24"></div>
                <div class="dot" style="background:#34d399"></div>
              </div>
            </div>

            ${state.memoLoading ? `<div class="memo-board-status" style="padding:12px 16px;color:#64748b;font-size:13px;">불러오는 중...</div>` : ''}
            ${!state.memoLoading && !notes.length ? `<div class="memo-board-status" style="padding:12px 16px;color:#94a3b8;font-size:13px;">등록된 메모가 없습니다.</div>` : ''}

            <div class="memo-board-notes" id="memo-board-notes">
            ${notes.map((item, idx) => {
              const isExpanded = state.memoExpandedId === item.id;
              const isEditing = state.memoEditingId === item.id;
              const pos = memoNotePositionPx(item);
              const noteWidth = getMemoDisplayWidth(item, isExpanded || isEditing, isEditing);
              const baseMinH = item.imageOnly ? null : getMemoCollapsedMinHeight(item);
              const noteMinH = item.imageOnly
                ? 'auto'
                : `${Math.max(baseMinH, (isExpanded || isEditing) ? 240 : baseMinH)}px`;
              const noteW = (isExpanded || isEditing)
                ? (item.imageOnly ? Math.max(220, Math.min(noteWidth, 360)) : noteWidth)
                : Math.max(MEMO_CARD_COLLAPSED_MIN, Math.min(MEMO_CARD_COLLAPSED_MAX, MEMO_CARD_COLLAPSED_W));
              const memoCanDrag = !isEditing;
              return `
                <div
                  class="memo-note ${item.imageOnly ? 'image-only' : ''} ${isExpanded || isEditing ? 'expanded' : ''} ${state.memoDraggingId === item.id ? 'dragging' : ''}"
                  data-note-id="${item.id}"
                  draggable="${memoCanDrag ? 'true' : 'false'}"
                  style="
                    left:${pos.x}px;
                    top:${pos.y}px;
                    width:${noteW}px;
                    min-height:${noteMinH};
                    background:${item.layout?.color || '#fef3c7'};
                    transform:rotate(${Number(item.layout?.rotate) || 0}deg);
                    z-index:${item.z || idx + 1};
                    cursor:${isEditing ? 'default' : 'grab'};
                  "
                >
                  <div class="memo-note-main">
                    <div class="memo-drag-handle" data-drag-id="${item.id}">
                      <div class="memo-tag">#${escapeHtml(isEditing ? state.editMemo?.tag || item.tag : item.tag)}</div>
                      <div class="${item.pinned ? 'memo-state pin' : 'memo-state'}">${item.pinned ? 'PIN' : 'MEMO'}</div>
                    </div>

                    ${isEditing ? `
                      <div class="field">
                        <label>색상</label>
                        <div class="color-row">
                          ${(state.editMemo.imageOnly ? imageColorOptions : colorOptions).map(c => `
                            <div class="color-swatch ${state.editMemo.color === c ? 'active' : ''}" data-edit-color="${c}" style="background:${c}"></div>
                          `).join('')}
                        </div>
                      </div>
                      <div class="field">
                        <input type="text" id="edit-title" value="${escapeAttr(state.editMemo.title)}" placeholder="제목" />
                      </div>
                      <div class="field">
                        <input type="text" id="edit-tag" value="${escapeAttr(state.editMemo.tag)}" placeholder="태그" />
                      </div>
                      <div class="field">
                        <textarea id="edit-content" rows="6" wrap="soft" spellcheck="false" placeholder="메모 내용">${escapeHtml(state.editMemo.content)}</textarea>
                      </div>
                      <label class="checkbox-row">
                        <input type="checkbox" id="edit-pinned" ${state.editMemo.pinned ? 'checked' : ''} />
                        상단 고정
                      </label>
                    ` : `
                      ${item.imageOnly ? `
                        ${item.image ? `
                          <div class="memo-image-frame">
                            <img src="${item.image}" alt="memo image" draggable="false" />
                          </div>
                        ` : ``}
                      ` : `
                        ${item.title ? `<div class="memo-title">${escapeHtml(item.title)}</div>` : ``}
                        ${item.image ? `
                          <div class="memo-image-frame" style="${isExpanded ? 'margin-top:10px;' : 'margin-top:10px;'}">
                            <img src="${item.image}" alt="memo image" draggable="false" style="${isExpanded ? 'max-height:280px;' : 'max-height:150px;'}" />
                          </div>
                        ` : ``}
                        ${isExpanded && item.content ? `<div class="memo-content-view">${escapeHtml(item.content)}</div>` : ``}
                      `}
                    `}
                  </div>

                  <div class="memo-footer">
                    <div class="memo-meta">
${item.imageOnly ? '이미지 메모' : (item.pinned ? '중요 메모' : '최근 메모')}<br/>
작성: ${new Date(item.createdAt).toLocaleDateString()}<br/>
수정: ${new Date(item.updatedAt).toLocaleDateString()}
</div>
                    <div class="memo-actions">
                      ${isEditing ? `
                        <button type="button" class="small-btn" draggable="false" data-memo-cancel="${item.id}">취소</button>
                        <button type="button" class="small-btn dark" draggable="false" data-memo-save="${item.id}">저장</button>
                      ` : `
                        ${isExpanded ? `
                          <button type="button" class="small-btn" draggable="false" data-memo-edit="${item.id}">수정</button>
                          <button type="button" class="small-btn" draggable="false" data-memo-delete="${item.id}" style="color:#b91c1c;border-color:#fecaca;background:#fff5f5;">삭제</button>
                        ` : ``}
                      `}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}

            ${state.newMemoOpen ? `
              <div class="memo-pop add" id="new-memo-pop" style="width:${Math.max(420, Math.min(1100, state.newMemo.expandedWidth || 420))}px;">
                <div style="font-size:16px;font-weight:700;margin-bottom:12px;">메모 추가</div>
                <div class="field">
                  <label>색상 선택</label>
                  <div class="color-row">
                    ${(state.newMemo.imageOnly ? imageColorOptions : colorOptions).map(c => `
                      <div class="color-swatch ${state.newMemo.color === c ? 'active' : ''}" data-new-color="${c}" style="background:${c}"></div>
                    `).join('')}
                  </div>
                </div>
                <div class="field">
                  <label>제목 (선택)</label>
                  <input type="text" id="new-title" value="${escapeAttr(state.newMemo.title)}" placeholder="비워두면 제목 없이 저장" autocomplete="off" />
                </div>
                <div class="field">
                  <label>태그</label>
                  <input type="text" id="new-tag" value="${escapeAttr(state.newMemo.tag)}" placeholder="예: 점검, 결재" autocomplete="off" />
                </div>
                <div class="field">
                  <label>이미지 업로드</label>
                  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <input type="file" id="new-image" accept="image/*" />
                    <label class="checkbox-row" style="margin:0;">
                      <input type="checkbox" id="new-image-only" ${state.newMemo.imageOnly ? 'checked' : ''} />
                      이미지만 올리기
                    </label>
                  </div>
                </div>
                <div class="field">
                  <label>내용</label>
                  <textarea id="new-content" rows="5" wrap="soft" spellcheck="false" placeholder="메모 내용을 입력하세요">${escapeHtml(state.newMemo.content)}</textarea>
                </div>
                <label class="checkbox-row">
                  <input type="checkbox" id="new-pinned" ${state.newMemo.pinned ? 'checked' : ''} />
                  상단 고정 메모로 추가
                </label>
                <div class="row-end">
                  <button class="small-btn" id="new-cancel">취소</button>
                  <button class="small-btn dark" id="new-save">추가</button>
                </div>
              </div>
            ` : ''}

            ${state.trashOpen ? `
              <div
                id="trash-pop"
                class="memo-pop trash ${state.newMemoOpen ? 'with-add-open' : ''}"
                style="${state.newMemoOpen ? `--memo-add-width:${Math.max(420, Math.min(1100, state.newMemo.expandedWidth || 420))}px;` : ''}"
              >
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                  <div style="font-size:16px;font-weight:700;">휴지통</div>
                  <button class="small-btn" id="trash-close">닫기</button>
                </div>
                ${state.trash.length === 0 ? `
                  <div style="font-size:13px;color:#94a3b8;">휴지통이 비어 있습니다.</div>
                ` : state.trash.map(item => `
                  <div class="trash-item">
                    <div class="trash-title">${escapeHtml(item.title)}</div>
                    <div class="trash-tag">#${escapeHtml(item.tag)}</div>
                    <div class="row-end">
                      <button class="small-btn" data-trash-restore="${item.id}">복원</button>
                      <button class="small-btn" data-trash-delete="${item.id}" style="color:#b91c1c;border-color:#fecaca;background:#fff5f5;">완전 삭제</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            </div>

            <div class="memo-board-resize-handle" id="memo-board-resize-handle" title="메모 보드 높이 조절"></div>
          </div>
        </div>
      `;

      bindMemoEvents();
    }

    function bindMemoEvents() {
      const board = document.getElementById('memo-board');
      const resizeHandle = document.getElementById('memo-board-resize-handle');

      resizeHandle?.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startY = e.clientY;
        const startHeight = board.getBoundingClientRect().height;

        board.classList.add('resizing');

        function onMouseMove(ev) {
          const nextHeight = Math.max(720, Math.min(2200, Math.round(startHeight + (ev.clientY - startY))));
          state.memoBoardHeight = nextHeight;
          board.style.height = `${nextHeight}px`;
          board.style.minHeight = `${nextHeight}px`;
        }

        function onMouseUp() {
          board.classList.remove('resizing');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          persistMemoBoardHeightToStorage(state.memoBoardHeight);
          renderMemoTab();
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      function applyLiveMemoWidth(noteId, title, content) {
        const width = Math.max(420, Math.min(1100, getMemoAutoWidth(title, content)));
        if (state.memoEditingId === noteId && state.editMemo) {
          state.editMemo.expandedWidth = width;
        }
        const noteEl = board.querySelector(`[data-note-id="${CSS.escape(noteId)}"]`);
        if (noteEl) {
          noteEl.style.width = `${width}px`;
        }
        const textarea = document.getElementById('edit-content');
        if (textarea) {
          textarea.style.width = '100%';
          textarea.style.overflow = 'auto';
        }
      }

      function applyLivePopupWidth(title, content) {
        const width = getMemoAutoWidth(title, content);
        state.newMemo.expandedWidth = width;
        const pop = document.querySelector('.memo-pop.add');
        if (pop) {
          pop.style.width = `${Math.max(420, Math.min(1100, width))}px`;
        }
        const textarea = document.getElementById('new-content');
        if (textarea) {
          textarea.style.width = '100%';
          textarea.style.overflow = 'auto';
        }
      }


      document.getElementById('new-memo-pop')?.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      document.getElementById('trash-pop')?.addEventListener('click', (e) => {
        e.stopPropagation();
      });


      document.getElementById('trash-toggle')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        state.trashOpen = !state.trashOpen;
        if (state.trashOpen) {
          try {
            await loadTrashMemosFromServer();
          } catch (err) {
            console.error(err);
          }
        }
        renderMemoTab();
      });
      document.getElementById('new-memo-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.newMemoOpen = true;
        renderMemoTab();
      });

      board.addEventListener('click', (e) => {
        if (e.target.closest('.memo-pop')) return;
        state.memoExpandedId = null;
        state.memoEditingId = null;
        renderMemoTab();
      });

      board.addEventListener('dragover', (e) => {
        const dt = e.dataTransfer;
        const types = dt && dt.types ? Array.from(dt.types) : [];
        if (!types.includes('text/plain')) return;
        e.preventDefault();
        dt.dropEffect = 'move';
      }, true);

      board.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        const notesLayer = board.querySelector('#memo-board-notes');
        const br = (notesLayer || board).getBoundingClientRect();
        let x = Math.round(e.clientX - br.left - memoDragOffset.x);
        let y = Math.round(e.clientY - br.top - memoDragOffset.y);
        x = Math.max(0, x);
        y = Math.max(0, y);
        const before = state.notes.find(n => String(n.id) === String(id));
        if (!before || !before.serverId) return;
        state.notes = state.notes.map(note => String(note.id) === String(id)
          ? {
              ...note,
              layout: { ...note.layout, x, y },
              originalLayout: { ...(note.originalLayout || note.layout), x, y }
            }
          : note);
        const moved = state.notes.find(n => String(n.id) === String(id));
        const layoutSaveSilent = { silent: true };
        try {
          await updateMemoOnServer(moved.serverId, {
            layout: moved.layout,
            originalLayout: moved.originalLayout
          }, layoutSaveSilent);
        } catch (err) {
          console.error(err);
          try {
            await loadMemosFromServer();
          } catch (_) { /* ignore */ }
        }
        renderMemoTab();
      }, true);

      board.querySelectorAll('[data-note-id]').forEach(noteEl => {
        const noteId = noteEl.dataset.noteId;

        noteEl.addEventListener('dragstart', (e) => {
          if (state.memoEditingId === noteId) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          const rect = noteEl.getBoundingClientRect();
          memoDragOffset.x = e.clientX - rect.left;
          memoDragOffset.y = e.clientY - rect.top;
          e.dataTransfer.setData('text/plain', String(noteId));
          e.dataTransfer.effectAllowed = 'move';
          try {
            e.dataTransfer.setData('application/x-memo-id', String(noteId));
          } catch (_) { /* ignore */ }
          state.memoDraggingId = noteId;
          bringToFront(noteId);
        });

        noteEl.addEventListener('dragend', (e) => {
          state.memoDraggingId = null;
          if (e.dataTransfer && e.dataTransfer.dropEffect === 'move') lastMemoDragMoved = true;
        });

        noteEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (lastMemoDragMoved) {
            lastMemoDragMoved = false;
            return;
          }
          if (state.memoEditingId === noteId) return;

          const isClosing = state.memoExpandedId === noteId;
          state.memoExpandedId = isClosing ? null : noteId;

          if (state.memoEditingId === noteId) state.memoEditingId = null;

          if (!isClosing) {
            bringToFront(noteId);
          }

          renderMemoTab();
        });

        noteEl.addEventListener('mousedown', () => bringToFront(noteId));
      });

      board.querySelectorAll('[data-memo-edit]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.memoEdit;
          const target = state.notes.find(n => n.id === id);
          if (!target) return;
          state.memoExpandedId = id;
          state.memoEditingId = id;
          state.editMemo = {
            title: target.title || '',
            tag: target.tag || '메모',
            pinned: !!target.pinned,
            color: target.layout?.color || (target.imageOnly ? '#f8fafc' : '#fef3c7'),
            imageOnly: !!target.imageOnly,
            content: target.content || '',
            expandedWidth: Math.max(420, Number(target.expandedWidth) || getMemoAutoWidth(target.title, target.content)),
          };
          bringToFront(id);
          renderMemoTab();
        });
      });

      board.querySelectorAll('[data-memo-cancel]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.memoEditingId = null;
          renderMemoTab();
        });
      });

      board.querySelectorAll('[data-memo-save]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.memoSave;
          const currentTarget = state.notes.find(n => n.id === id);
          const hasExistingImage = !!(currentTarget && currentTarget.image);
          if (!state.editMemo.title.trim() && !state.editMemo.content.trim() && !hasExistingImage) {
            window.alert('제목, 내용, 이미지 중 하나는 남겨주세요.');
            return;
          }
          if (!currentTarget || !currentTarget.serverId) {
            setPortalMemoFeedback('저장할 메모를 찾을 수 없습니다.', 'error');
            renderMemoTab();
            return;
          }
          const color = state.editMemo.color || currentTarget.layout?.color || '#fef3c7';
          const next = {
            ...currentTarget,
            title: state.editMemo.title.trim(),
            tag: state.editMemo.tag.trim() || '메모',
            pinned: !!state.editMemo.pinned,
            content: state.editMemo.content.trim(),
            expandedWidth: Math.max(420, Number(state.editMemo.expandedWidth) || getMemoAutoWidth(state.editMemo.title, state.editMemo.content)),
            layout: { ...currentTarget.layout, color },
            originalLayout: { ...(currentTarget.originalLayout || currentTarget.layout), color }
          };
          try {
            await updateMemoOnServer(currentTarget.serverId, next);
            await loadMemosFromServer();
            setPortalMemoFeedback('메모가 수정되었습니다.', 'success');
            state.memoEditingId = null;
            renderMemoTab();
          } catch (err) {
            console.error(err);
            setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderMemoTab();
          }
        });
      });

      board.querySelectorAll('[data-memo-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.memoDelete;
          const target = state.notes.find(n => n.id === id);
          if (!target) return;
          if (!window.confirm('메모를 휴지통으로 이동할까요?')) return;
          if (!target.serverId) {
            state.notes = state.notes.filter(n => n.id !== id);
            renderMemoTab();
            return;
          }
          try {
            await softDeleteMemoOnServer(target.serverId);
            await Promise.all([loadMemosFromServer(), loadTrashMemosFromServer()]);
            setPortalMemoFeedback('휴지통으로 이동했습니다.', 'success');
            if (state.memoExpandedId === id) state.memoExpandedId = null;
            if (state.memoEditingId === id) state.memoEditingId = null;
            renderMemoTab();
          } catch (err) {
            console.error(err);
            setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderMemoTab();
          }
        });
      });

      board.querySelectorAll('[data-new-color]').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
          e.stopPropagation();
          state.newMemo.color = swatch.dataset.newColor;
          renderMemoTab();
        });
      });

      board.querySelectorAll('[data-edit-color]').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
          e.stopPropagation();
          state.editMemo.color = swatch.dataset.editColor;
          renderMemoTab();
        });
      });

      document.getElementById('new-title')?.addEventListener('input', (e) => {
        state.newMemo.title = e.target.value;
        applyLivePopupWidth(state.newMemo.title, state.newMemo.content);
      });
      document.getElementById('new-tag')?.addEventListener('input', (e) => {
        state.newMemo.tag = e.target.value;
      });
      document.getElementById('new-content')?.addEventListener('input', (e) => {
        state.newMemo.content = e.target.value;
        applyLivePopupWidth(state.newMemo.title, state.newMemo.content);
      });
      document.getElementById('new-pinned')?.addEventListener('change', (e) => {
        state.newMemo.pinned = e.target.checked;
      });
      document.getElementById('new-image-only')?.addEventListener('change', (e) => {
        state.newMemo.imageOnly = e.target.checked;
        if (state.newMemo.imageOnly && !imageColorOptions.includes(state.newMemo.color)) state.newMemo.color = '#f8fafc';
        if (!state.newMemo.imageOnly && !colorOptions.includes(state.newMemo.color)) state.newMemo.color = '#fef3c7';
        renderMemoTab();
      });

      document.getElementById('new-cancel')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.newMemoOpen = false;
        renderMemoTab();
      });
      document.getElementById('new-save')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fileInput = document.getElementById('new-image');
        const hasImage = !!(fileInput && fileInput.files[0]);
        if (!state.newMemo.title.trim() && !state.newMemo.content.trim() && !hasImage) {
          window.alert('제목, 내용, 이미지 중 하나는 입력해주세요.');
          return;
        }
        const nextIndex = state.notes.length;
        const baseLayout = initialLayouts[nextIndex % initialLayouts.length];
        const readFileAsDataUrl = () => new Promise((resolve, reject) => {
          if (!fileInput || !fileInput.files[0]) return resolve('');
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
          fr.readAsDataURL(fileInput.files[0]);
        });
        try {
          let imageData = '';
          if (hasImage) imageData = await readFileAsDataUrl();
          const lx = baseLayout.x + (nextIndex % 3) * 18;
          const ly = baseLayout.y + (nextIndex % 4) * 16;
          const lc = state.newMemo.color || (state.newMemo.imageOnly ? '#f8fafc' : baseLayout.color);
          const draft = {
            title: state.newMemo.imageOnly ? '' : state.newMemo.title.trim(),
            tag: state.newMemo.tag.trim() || '메모',
            pinned: state.newMemo.pinned,
            imageOnly: !!state.newMemo.imageOnly,
            content: state.newMemo.imageOnly ? '' : state.newMemo.content.trim(),
            image: imageData,
            expandedWidth: Math.max(420, Number(state.newMemo.expandedWidth) || getMemoAutoWidth(state.newMemo.title, state.newMemo.content)),
            z: getNextZ(),
            layout: {
              x: lx,
              y: ly,
              rotate: baseLayout.rotate,
              color: lc
            },
            originalLayout: {
              x: lx,
              y: ly,
              rotate: baseLayout.rotate,
              color: lc
            }
          };
          await createMemoOnServer(draft);
          await loadMemosFromServer();
          setPortalMemoFeedback('메모가 저장되었습니다.', 'success');
          state.newMemo = { title: '', tag: '메모', pinned: false, imageOnly: false, color: '#fef3c7', content: '', expandedWidth: 420 };
          state.newMemoOpen = false;
          if (fileInput) fileInput.value = '';
          renderMemoTab();
        } catch (err) {
          console.error(err);
          setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
          renderMemoTab();
        }
      });

      document.getElementById('trash-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.trashOpen = false;
        renderMemoTab();
      });

      board.querySelectorAll('[data-trash-restore]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.trashRestore;
          const target = state.trash.find(t => t.id === id);
          if (!target || !target.serverId) return;
          try {
            await restoreMemoOnServer(target.serverId);
            await Promise.all([loadMemosFromServer(), loadTrashMemosFromServer()]);
            setPortalMemoFeedback('복원되었습니다.', 'success');
            renderMemoTab();
          } catch (err) {
            console.error(err);
            setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderMemoTab();
          }
        });
      });

      board.querySelectorAll('[data-trash-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.trashDelete;
          const target = state.trash.find(t => t.id === id);
          if (!target || !target.serverId) return;
          if (!window.confirm('휴지통에서 완전히 삭제하시겠습니까?')) return;
          try {
            await permanentDeleteMemoOnServer(target.serverId);
            await loadTrashMemosFromServer();
            setPortalMemoFeedback('삭제되었습니다.', 'success');
            renderMemoTab();
          } catch (err) {
            console.error(err);
            setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderMemoTab();
          }
        });
      });

      document.getElementById('edit-title')?.addEventListener('input', (e) => {
        state.editMemo.title = e.target.value;
        applyLiveMemoWidth(state.memoEditingId, state.editMemo.title, state.editMemo.content);
      });
      document.getElementById('edit-tag')?.addEventListener('input', (e) => {
        state.editMemo.tag = e.target.value;
      });
      document.getElementById('edit-content')?.addEventListener('input', (e) => {
        state.editMemo.content = e.target.value;
        applyLiveMemoWidth(state.memoEditingId, state.editMemo.title, state.editMemo.content);
      });
      document.getElementById('edit-pinned')?.addEventListener('change', (e) => {
        state.editMemo.pinned = e.target.checked;
      });
    }

