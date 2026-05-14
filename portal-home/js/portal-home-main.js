/* portal-home-main.js | 최종 렌더/운영 탭/bootstrap */

function applyZIndexControl() {
  document.querySelectorAll('.memo-note').forEach(note => {
    note.addEventListener('mousedown', () => {
      zIndexCounter++;
      note.style.zIndex = zIndexCounter;
    });
  });
}

function render() {
      state.page = 'home';
      if (state.tab === 'memo') renderMemoTab();
      else if (state.tab === 'schedule') renderScheduleTab();
      else if (state.tab === 'ops') renderOpsTab();
    }

    

function autoGrowTextarea(el) {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.max(el.scrollHeight, 140) + 'px';
    }

    function renderOpsTab() {
      const summaryCards = [
        { title: '긴급 확인', value: '1건', desc: '결재 지연 확인 필요', bg: '#fef2f2' },
        { title: '오늘 할 일', value: '4건', desc: '폐수 입력, 검토, 승인', bg: '#fffbeb' },
        { title: '생성 리포트', value: '1개', desc: '월간 운영자료 업데이트', bg: '#ecfdf5' },
      ];

      tabContent.innerHTML = `
        <div class="ops-grid">
          <div class="ops-col">
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div>
                  <div style="font-size:18px;font-weight:700;">연구소 운영 통합 정보</div>
                </div>
                <div style="display:flex;gap:8px;">
                  <button class="small-btn">오늘 업무</button>
                  <button class="small-btn dark">월간 결재</button>
                </div>
              </div>
              <div class="summary-grid">
                ${summaryCards.map(card => `
                  <div class="summary-box" style="background:${card.bg}">
                    <div class="summary-title">${card.title}</div>
                    <div class="summary-value">${card.value}</div>
                    <div class="summary-desc">${card.desc}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card">
              <div style="font-size:18px;font-weight:700;margin-bottom:14px;">운영 웹앱</div>
              <div class="app-grid">
                ${apps.map(app => `
                  <div class="app-box" style="background:${app.color}">
                    <div class="app-head">
                      <div class="app-name">${app.name}</div>
                      <div class="app-status">${app.status}</div>
                    </div>
                    <div class="app-desc">${app.desc}</div>
                    <button class="small-btn dark">바로 이동</button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="ops-col">
            <div class="card">
              <div style="font-size:18px;font-weight:700;margin-bottom:12px;">최근 알림</div>
              <div class="stack-list">
                ${notices.map(notice => `
                  <div class="stack-item">
                    <div style="font-size:12px;color:#64748b;margin-bottom:6px;">${notice.app && notice.app !== '-' ? `${notice.level} · ${notice.app}` : notice.level}</div>
                    <div style="font-weight:600;">${notice.title}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card">
              <div style="font-size:18px;font-weight:700;margin-bottom:12px;">빠른 메뉴</div>
              <div class="stack-list">
                ${['월별 결재 현황', '최근 수거 내역', '운영 관련자료', '저장/삭제 로그'].map(item => `
                  <div class="stack-item" style="font-weight:600;">${item}</div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function formatDateLabel(dateStr) {
      const [, month, day] = dateStr.split('-');
      return `${Number(month)}월 ${Number(day)}일`;
    }

    function escapeHtml(str) {
      return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function escapeAttr(str) {
      return escapeHtml(str).replaceAll('\n', '&#10;');
    }

    render();
    applyZIndexControl();
