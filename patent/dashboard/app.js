(function () {
  'use strict';

  const P = window.PatentCommon;

  const colors = {
    registered: '#22c55e',
    examining: '#f59e0b',
    filed: '#3b82f6',
    extinct: '#ef4444',
    other: '#94a3b8'
  };

  const labels = {
    registered: '등록',
    examining: '심사중',
    filed: '출원중',
    extinct: '소멸',
    other: '기타'
  };

  let ctx = null;

  function patentDueDate(payment) {
    return (
      payment.official_due_date ||
      payment.invoice_due_date ||
      payment.planned_payment_date ||
      null
    );
  }

  function openDueManagement() {
    P.navigate('management', {
      section: 'payments'
    });
  }

  async function load() {
    ctx = await P.resolveContext();

    document.getElementById('companyName').textContent =
      ctx.session.companyName || '현재 회사';

    if (!ctx.access.read) {
      document.querySelector('.pat-app').innerHTML =
        '<div class="pat-error">' +
        '특허관리 접근 권한이 없습니다.' +
        '</div>';
      return;
    }

    const [
      patentResult,
      paymentResult,
      deadlineResult,
      eventResult
    ] = await Promise.all([
      P.companyQuery(
        'pat_master',
        [
          'id',
          'invention_title',
          'application_no',
          'registration_no',
          'country_code',
          'ip_type',
          'legal_status',
          'application_date',
          'registration_date',
          'expiration_date',
          'created_at'
        ].join(',')
      ).order(
        'created_at',
        { ascending: false }
      ),

      P.companyQuery(
        'pat_payments',
        [
          'id',
          'patent_id',
          'payment_type',
          'payment_title',
          'annual_year_from',
          'annual_year_to',
          'official_due_date',
          'invoice_due_date',
          'planned_payment_date',
          'status',
          'paid_amount',
          'billed_amount',
          'currency',
          'paid_date'
        ].join(',')
      ).neq(
        'status',
        'CANCELLED'
      ),

      P.companyQuery(
        'pat_deadlines',
        [
          'id',
          'patent_id',
          'deadline_type',
          'title',
          'due_date',
          'status'
        ].join(',')
      ).eq(
        'status',
        'OPEN'
      ),

      P.companyQuery(
        'pat_events',
        [
          'id',
          'patent_id',
          'event_date',
          'event_type',
          'title',
          'description'
        ].join(',')
      )
        .order(
          'event_date',
          { ascending: false }
        )
        .limit(8)
    ]);

    [
      patentResult,
      paymentResult,
      deadlineResult,
      eventResult
    ].forEach((result) => {
      if (result.error) {
        throw result.error;
      }
    });

    const patents = patentResult.data || [];
    const payments = paymentResult.data || [];
    const deadlines = deadlineResult.data || [];
    const events = eventResult.data || [];

    const patentMap = Object.fromEntries(
      patents.map((patent) => [
        patent.id,
        patent
      ])
    );

    renderKpis(
      patents,
      payments,
      deadlines
    );

    renderStatus(patents);
    renderYears(patents);

    renderDue(
      payments,
      deadlines,
      patentMap
    );

    renderRecentPatents(patents);

    renderEvents(
      events,
      patentMap
    );
  }

  function renderKpis(
    patents,
    payments,
    deadlines
  ) {
    const counts = {
      registered: 0,
      examining: 0,
      filed: 0,
      extinct: 0,
      other: 0
    };

    patents.forEach((patent) => {
      counts[
        P.classifyPatentStatus(
          patent.legal_status
        )
      ]++;
    });

    const duePayments = payments.filter(
      (payment) => {
        const dueDate =
          patentDueDate(payment);
        const days =
          P.daysUntil(dueDate);

        return (
          ![
            'PAID',
            'CANCELLED'
          ].includes(payment.status) &&
          days !== null &&
          days <= 30
        );
      }
    );

    const dueDeadlines = deadlines.filter(
      (deadline) => {
        const days =
          P.daysUntil(deadline.due_date);

        return (
          days !== null &&
          days <= 30
        );
      }
    );

    const currentYear =
      String(
        new Date().getFullYear()
      );

    const paidThisYear = payments
      .filter(
        (payment) => (
          payment.status === 'PAID' &&
          String(
            payment.paid_date || ''
          ).startsWith(
            currentYear
          )
        )
      )
      .reduce(
        (sum, payment) => (
          sum +
          Number(
            payment.paid_amount ||
            payment.billed_amount ||
            0
          )
        ),
        0
      );

    const data = [
      [
        '전체 특허',
        patents.length,
        '총 관리 건수',
        'gold'
      ],
      [
        '출원중',
        counts.filed,
        '현재 출원 상태',
        'blue'
      ],
      [
        '심사중',
        counts.examining,
        '심사 진행 중',
        'orange'
      ],
      [
        '등록',
        counts.registered,
        '권리 보유',
        'green'
      ],
      [
        '소멸',
        counts.extinct,
        '소멸·포기·거절',
        'red'
      ],
      [
        '납부임박',
        duePayments.length,
        '30일 이내',
        'orange'
      ],
      [
        '기한임박',
        dueDeadlines.length,
        (
          '30일 이내 · 올해 지급 ' +
          P.fmtMoney(
            paidThisYear
          )
        ),
        'red'
      ]
    ];

    document.getElementById(
      'kpis'
    ).innerHTML = data
      .map((item) => `
        <div class="pat-kpi ${item[3]}">
          <div class="pat-kpi-label">
            ${item[0]}
          </div>
          <div class="pat-kpi-value">
            ${item[1]}
          </div>
          <div class="pat-kpi-note">
            ${item[2]}
          </div>
        </div>
      `)
      .join('');
  }

  function renderStatus(patents) {
    const counts = {
      registered: 0,
      examining: 0,
      filed: 0,
      extinct: 0,
      other: 0
    };

    patents.forEach((patent) => {
      counts[
        P.classifyPatentStatus(
          patent.legal_status
        )
      ]++;
    });

    const total =
      Math.max(
        1,
        patents.length
      );

    let cursor = 0;
    const stops = [];

    Object.keys(counts).forEach(
      (key) => {
        const percent =
          (
            counts[key] /
            total
          ) * 100;

        if (percent <= 0) {
          return;
        }

        stops.push(
          `${colors[key]} ` +
          `${cursor}% ` +
          `${cursor + percent}%`
        );

        cursor += percent;
      }
    );

    document.getElementById(
      'statusDonut'
    ).style.background = stops.length
      ? `conic-gradient(${stops.join(',')})`
      : '#e2e8f0';

    document.getElementById(
      'donutTotal'
    ).textContent = patents.length;

    document.getElementById(
      'statusLegend'
    ).innerHTML = Object.keys(counts)
      .filter(
        (key) => (
          counts[key] > 0 ||
          key !== 'other'
        )
      )
      .map((key) => `
        <div class="legend-item">
          <span
            class="legend-dot"
            style="background: ${colors[key]};"
          ></span>
          <span class="legend-label">
            ${labels[key]}
          </span>
          <span class="legend-value">
            ${counts[key]}건
          </span>
        </div>
      `)
      .join('');
  }

  function renderYears(patents) {
    const currentYear =
      new Date().getFullYear();

    const years =
      Array.from(
        { length: 6 },
        (_, index) => (
          currentYear - 5 + index
        )
      );

    const stats = {};

    years.forEach((year) => {
      stats[year] = {
        filed: 0,
        registered: 0
      };
    });

    patents.forEach((patent) => {
      const applicationYear = Number(
        String(
          patent.application_date || ''
        ).slice(0, 4)
      );

      const registrationYear = Number(
        String(
          patent.registration_date || ''
        ).slice(0, 4)
      );

      if (stats[applicationYear]) {
        stats[applicationYear].filed++;
      }

      if (stats[registrationYear]) {
        stats[registrationYear].registered++;
      }
    });

    const maxCount = Math.max(
      1,
      ...years.flatMap((year) => [
        stats[year].filed,
        stats[year].registered
      ])
    );

    const maxBarHeight = 145;

    document.getElementById(
      'yearChart'
    ).innerHTML = years
      .map((year) => {
        const filedCount =
          stats[year].filed;

        const registeredCount =
          stats[year].registered;

        const filedHeight =
          Math.max(
            2,
            (
              filedCount /
              maxCount
            ) * maxBarHeight
          );

        const registeredHeight =
          Math.max(
            2,
            (
              registeredCount /
              maxCount
            ) * maxBarHeight
          );

        return `
          <div class="year-col">
            <div class="year-bars">
              <div
                class="year-bar filed"
                title="출원 ${filedCount}건"
                style="height: ${filedHeight}px;"
              >
                <span class="year-bar-value">
                  ${filedCount}
                </span>
              </div>

              <div
                class="year-bar registered"
                title="등록 ${registeredCount}건"
                style="height: ${registeredHeight}px;"
              >
                <span class="year-bar-value">
                  ${registeredCount}
                </span>
              </div>
            </div>

            <div class="year-label">
              ${year}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderDue(
    payments,
    deadlines,
    patentMap
  ) {
    const items = [];

    payments
      .filter(
        (payment) => (
          ![
            'PAID',
            'CANCELLED'
          ].includes(
            payment.status
          )
        )
      )
      .forEach((payment) => {
        const date =
          patentDueDate(payment);

        if (!date) {
          return;
        }

        items.push({
          kind: 'payment',
          date,
          title:
            payment.payment_title ||
            P.paymentTypeLabel(
              payment.payment_type
            ),
          sub:
            (
              patentMap[
                payment.patent_id
              ]?.invention_title ||
              '특허'
            ) +
            ' · ' +
            P.annualRangeLabel(
              payment.annual_year_from,
              payment.annual_year_to
            ),
          patentId:
            payment.patent_id
        });
      });

    deadlines.forEach(
      (deadline) => {
        items.push({
          kind: 'deadline',
          date:
            deadline.due_date,
          title:
            deadline.title ||
            P.deadlineTypeLabel(
              deadline.deadline_type
            ),
          sub:
            patentMap[
              deadline.patent_id
            ]?.invention_title ||
            '특허',
          patentId:
            deadline.patent_id
        });
      }
    );

    items.sort(
      (a, b) => (
        String(a.date)
          .localeCompare(
            String(b.date)
          )
      )
    );

    const near =
      items.slice(0, 6);

    const element =
      document.getElementById(
        'dueList'
      );

    if (!near.length) {
      element.innerHTML =
        '<div class="pat-empty">' +
        '예정된 납부·기한 항목이 없습니다.' +
        '</div>';
      return;
    }

    element.innerHTML = near
      .map((item) => `
        <div
          class="due-item"
          data-kind="${item.kind}"
        >
          <div
            class="due-icon ${
              P.daysUntil(item.date) <= 7
                ? 'red'
                : ''
            }"
          >
            ${
              item.kind === 'payment'
                ? '₩'
                : '◷'
            }
          </div>

          <div>
            <div class="due-title">
              ${P.escapeHtml(
                item.title
              )}
            </div>
            <div class="due-sub">
              ${P.escapeHtml(
                item.sub
              )}
            </div>
          </div>

          <div class="due-date">
            ${P.fmtDate(item.date)}
            <strong
              class="pat-dday ${P.ddayClass(item.date)}"
            >
              ${P.dday(item.date)}
            </strong>
          </div>
        </div>
      `)
      .join('');
  }

  function renderRecentPatents(
    patents
  ) {
    const rows = [...patents]
      .sort(
        (a, b) => (
          String(
            b.registration_date ||
            b.created_at ||
            ''
          ).localeCompare(
            String(
              a.registration_date ||
              a.created_at ||
              ''
            )
          )
        )
      )
      .slice(0, 6);

    document.getElementById(
      'recentPatentBody'
    ).innerHTML = rows.length
      ? rows
        .map((patent) => `
          <tr
            class="clickable"
            data-id="${patent.id}"
          >
            <td>
              ${P.escapeHtml(
                patent.registration_no ||
                patent.application_no ||
                '-'
              )}
            </td>
            <td>
              ${P.escapeHtml(
                patent.invention_title
              )}
            </td>
            <td>
              ${P.escapeHtml(
                patent.country_code ||
                '-'
              )}
            </td>
            <td>
              ${P.fmtDate(
                patent.registration_date
              )}
            </td>
            <td>
              ${P.badge(
                patent.legal_status,
                P.patentStatusLabel(
                  patent.legal_status
                )
              )}
            </td>
          </tr>
        `)
        .join('')
      : (
        '<tr>' +
        '<td colspan="5" class="pat-empty">' +
        '등록된 특허가 없습니다.' +
        '</td>' +
        '</tr>'
      );

    document
      .querySelectorAll(
        '#recentPatentBody tr[data-id]'
      )
      .forEach((row) => {
        row.addEventListener(
          'click',
          () => P.navigate(
            'list',
            {
              patent_id:
                row.dataset.id
            }
          )
        );
      });
  }

  function renderEvents(
    events,
    patentMap
  ) {
    const element =
      document.getElementById(
        'eventList'
      );

    if (!events.length) {
      element.innerHTML =
        '<div class="pat-empty">' +
        '최근 진행이력이 없습니다.' +
        '</div>';
      return;
    }

    element.innerHTML = events
      .map((event) => `
        <div class="event-row">
          <div class="event-date">
            ${P.fmtDate(
              event.event_date
            )}
          </div>

          <div>
            <div class="event-title">
              ${P.escapeHtml(
                event.title
              )}
            </div>
            <div class="event-patent">
              ${P.escapeHtml(
                patentMap[
                  event.patent_id
                ]?.invention_title ||
                '-'
              )}
            </div>
          </div>

          ${P.badge(
            event.event_type,
            event.event_type ||
            '이력'
          )}
        </div>
      `)
      .join('');
  }

  document
    .getElementById('refreshBtn')
    .addEventListener(
      'click',
      () => load().catch(
        (error) => {
          P.toast(
            error.message,
            'error'
          );
        }
      )
    );

  document
    .getElementById('goListBtn')
    .addEventListener(
      'click',
      () => P.navigate('list')
    );

  document
    .getElementById('goManagementBtn')
    .addEventListener(
      'click',
      openDueManagement
    );

  load().catch((error) => {
    console.error(error);

    document.querySelector(
      '.pat-app'
    ).innerHTML =
      '<div class="pat-error">' +
      P.escapeHtml(
        error.message
      ) +
      '</div>';
  });
