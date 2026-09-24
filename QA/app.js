<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>QA 시약 사용일지</title>
  <link rel="stylesheet" href="./style.css" />
  <link rel="stylesheet" href="../../common/mobile.css" />
  <link rel="stylesheet" href="../../common/theme.css" />
</head>
<body>
  <main class="usage-shell">
    <section class="usage-app">
      <header class="usage-appbar">
        <div class="brand-block">
          <strong class="qa-mark">QA</strong>
          <span class="app-title">시약 사용일지</span>
        </div>

        <nav class="usage-tabs" aria-label="사용일지 화면">
          <button id="usageInputTab" class="usage-tab active" type="button">사용입력</button>
          <button id="usageLogTab" class="usage-tab" type="button">사용일지</button>
        </nav>

        <div class="user-context">
          <span id="companyName" class="company-name">회사</span>
          <span class="context-dot">•</span>
          <span id="employeeName">사용자</span>
          <span id="employeeNo" class="employee-no"></span>
        </div>
      </header>

      <section id="usageInputView" class="screen">
        <div class="screen-title-row">
          <div class="screen-index">1</div>
          <h2>사용입력 화면 <span>(PC)</span></h2>
        </div>

        <div class="input-layout">
          <section class="panel input-panel">
            <div class="panel-title">사용정보 입력</div>

            <div class="form-stack">
              <label class="field">
                <span>사용일</span>
                <input id="usageDate" type="date" />
              </label>

              <div class="field product-search-wrap">
                <span>사용제품</span>
                <div class="search-input-row">
                  <input id="productSearch" type="search" placeholder="제품명 / 제조사 / 코드 / CAS 검색" autocomplete="off" />
                  <button id="productSearchBtn" class="search-btn" type="button" aria-label="제품 검색">⌕</button>
                </div>
                <div id="productResults" class="product-results" hidden></div>
              </div>

              <div id="selectedProduct" class="selected-product" hidden>
                <button id="clearProductBtn" class="selected-close" type="button" aria-label="선택 제품 해제">×</button>
                <strong id="selectedProductName">-</strong>
                <div id="selectedProductMeta" class="selected-meta">-</div>
                <div class="selected-info-row">
                  <span class="selected-label">CAS No.</span>
                  <div id="selectedProductCas" class="selected-cas"></div>
                </div>
                <div class="selected-info-row">
                  <span class="selected-label">물질명</span>
                  <span id="selectedMaterialName">-</span>
                </div>
              </div>

              <label class="field inline-field">
                <span>사용시간</span>
                <div class="suffix-input">
                  <input id="usageHours" type="number" min="0.01" max="23.99" step="0.01" inputmode="decimal" placeholder="예: 0.5" />
                  <b>시간</b>
                </div>
              </label>

              <label class="field inline-field">
                <span>사용량</span>
                <input id="quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="예: 100" />
              </label>

              <label class="field inline-field">
                <span>단위</span>
                <select id="unit">
                  <optgroup label="부피">
                    <option value="µL">µL</option>
                    <option value="mL" selected>mL</option>
                    <option value="L">L</option>
                  </optgroup>
                  <optgroup label="중량">
                    <option value="µg">µg</option>
                    <option value="mg">mg</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </optgroup>
                </select>
              </label>
            </div>

            <div id="inputMessage" class="message" aria-live="polite"></div>
            <button id="saveUsageBtn" class="save-btn" type="button">
              <span class="lock-icon">▣</span>
              사용내역 등록
            </button>
          </section>

          <section class="panel monthly-panel">
            <div class="panel-head">
              <h3>나의 월간 사용현황</h3>
              <div class="month-nav">
                <button id="prevMonthBtn" type="button" aria-label="이전 달">‹</button>
                <strong id="monthLabel">-</strong>
                <button id="nextMonthBtn" type="button" aria-label="다음 달">›</button>
              </div>
              <div class="metric-toggle">
                <button class="metric-btn active" data-monthly-metric="amount" type="button">사용량</button>
                <button class="metric-btn" data-monthly-metric="time" type="button">사용시간</button>
              </div>
            </div>

            <div id="monthlyMessage" class="message compact" aria-live="polite"></div>
            <div class="matrix-wrap monthly-wrap">
              <table id="monthlyTable" class="matrix-table monthly-table">
                <thead id="monthlyHead"></thead>
                <tbody id="monthlyBody">
                  <tr><td class="empty">월간 사용현황을 불러오는 중입니다.</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section id="usageLogView" class="screen" hidden>
        <div class="screen-title-row log-title-row">
          <div class="screen-index">2</div>
          <h2>사용일지 화면 <span>(PC)</span></h2>

          <div class="period-controls">
            <span class="period-label">조회기간</span>
            <select id="logYear"></select>
            <div class="period-mode">
              <button data-period-mode="month" type="button">월</button>
              <button data-period-mode="quarter" type="button">분기</button>
              <button data-period-mode="half" class="active" type="button">반기</button>
              <button data-period-mode="year" type="button">년</button>
            </div>
            <select id="periodDetail"></select>
          </div>

          <div class="metric-toggle log-metric-toggle">
            <button class="metric-btn active" data-log-metric="amount" type="button">사용량</button>
            <button class="metric-btn" data-log-metric="time" type="button">사용시간</button>
          </div>
        </div>

        <section class="panel log-panel">
          <div id="logMessage" class="message compact" aria-live="polite"></div>
          <div class="matrix-wrap log-wrap">
            <table id="logTable" class="matrix-table log-table">
              <thead id="logHead"></thead>
              <tbody id="logBody">
                <tr><td class="empty">사용일지를 불러오는 중입니다.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="../supabase.js"></script>
  <script src="./app.js"></script>
  <script src="../../common/common.js"></script>
</body>
</html>
