(function () {
  'use strict';

  const P = window.PatentCommon;
  const query = new URLSearchParams(location.search);

  const labels = {
    PATENT: '특허',
    UTILITY: '실용신안',
    DESIGN: '디자인',
    TRADEMARK: '상표'
  };

  const KIPRIS_SYNC_FIELDS = [
    'invention_title',
    'application_no',
    'application_date',
    'publication_no',
    'publication_date',
    'registration_no',
    'registration_date',
    'legal_status',
    'legal_status_detail',
    'expiration_date',
    'abstract_text',
    'public_notice_url',
    'registration_notice_url',
    'representative_image_url'
  ];

  const KIPRIS_ARRAY_FIELDS = [
    'applicant_names',
    'right_holder_names',
    'agent_names',
    'ipc_codes',
    'cpc_codes'
  ];

  let ctx = null;
  let patents = [];
  let deadlines = [];
  let employees = [];
  let divisions = [];
  let currentPatent = null;
  let detailData = null;
  let editingId = null;
  let duplicatePatentId = null;
  let duplicateCheckTimer = null;
  let bulkRefreshRunning = false;

  function arrayFromText(value) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeArray(value) {
    if (value == null) {
      return [];
    }

    return (Array.isArray(value) ? value : [value])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function uniqueArray(value) {
    return [...new Set(normalizeArray(value))];
  }

  function normalizeStatus(value) {
    const raw = P.clean(value || '');
    const compact = raw.replace(/\s+/g, '');
    const lower = compact.toLowerCase();

    if (
      compact.includes('소멸') ||
      compact.includes('만료') ||
      compact.includes('무효') ||
      lower.includes('extinct') ||
      lower.includes('expired')
    ) {
      return '소멸';
    }

    if (
      compact.includes('포기') ||
      compact.includes('취하') ||
      lower.includes('abandon') ||
      lower.includes('withdraw')
    ) {
      return '포기';
    }

    if (
      compact.includes('거절') ||
      lower.includes('reject')
    ) {
      return '거절';
    }

    if (
      compact.includes('등록') ||
      lower.includes('register')
    ) {
      return '등록';
    }

    if (
      compact.includes('심사') ||
      compact.includes('의견제출') ||
      compact.includes('보정') ||
      lower.includes('examin')
    ) {
      return '심사중';
    }

    if (
      compact.includes('출원') ||
      lower.includes('filed') ||
      lower.includes('application') ||
      lower.includes('pending')
    ) {
      return '출원중';
    }

    return raw;
  }

  function nextDeadline(patentId) {
    return deadlines.find((item) => (
      item.patent_id === patentId &&
      P.daysUntil(item.due_date) !== null
    )) || null;
  }

  function managerName(employeeNo) {
    if (!employeeNo) {
      return '-';
    }

    return employees.find(
      (item) => item.employee_no === employeeNo
    )?.name || employeeNo;
  }

  function divisionName(divisionCode) {
    if (!divisionCode) {
      return '-';
    }

    return divisions.find(
      (item) => item.division_code === divisionCode
    )?.division_name || divisionCode;
  }


  function normalizePatentNumber(value) {
    return String(value || '')
      .trim()
      .replace(/[^0-9A-Za-z]/g, '')
      .toUpperCase();
  }

  function hideDuplicatePatentNotice() {
    duplicatePatentId = null;

    const notice = document.getElementById(
      'duplicatePatentNotice'
    );

    if (notice) {
      notice.hidden = true;
      notice.innerHTML = '';
    }

    const lookupInput = document.getElementById(
      'lookupNo'
    );

    if (lookupInput) {
      lookupInput.classList.remove(
        'pat-input-duplicate'
      );
    }

    const saveButton = document.getElementById(
      'savePatentBtn'
    );

    if (saveButton) {
      saveButton.disabled = false;
    }
  }

  function showDuplicatePatentNotice(
    patent,
    matchedNumber = ''
  ) {
    if (!patent) {
      hideDuplicatePatentNotice();
      return;
    }

    if (
      editingId &&
      String(patent.id) === String(editingId)
    ) {
      hideDuplicatePatentNotice();
      return;
    }

    duplicatePatentId = patent.id;

    const notice = document.getElementById(
      'duplicatePatentNotice'
    );

    if (!notice) {
      return;
    }

    const appNo = patent.application_no || '-';
    const regNo = patent.registration_no || '-';
    const title = patent.invention_title || '등록된 특허';
    const status = P.patentStatusLabel(
      patent.legal_status
    );

    notice.innerHTML = `
      <div class="pat-duplicate-notice-title">
        이미 등록된 특허입니다.
      </div>
      <div class="pat-duplicate-notice-body">
        <strong>${P.escapeHtml(title)}</strong>
        <span>상태: ${P.escapeHtml(status || '-')}</span>
        <span>출원번호: ${P.escapeHtml(appNo)}</span>
        <span>등록번호: ${P.escapeHtml(regNo)}</span>
      </div>
      <div class="pat-duplicate-notice-help">
        같은 특허를 새로 등록할 수 없습니다.
        기존 특허를 목록에서 열어 수정해 주세요.
      </div>
    `;

    notice.hidden = false;

    const lookupInput = document.getElementById(
      'lookupNo'
    );

    if (lookupInput) {
      lookupInput.classList.add(
        'pat-input-duplicate'
      );
    }

    const saveButton = document.getElementById(
      'savePatentBtn'
    );

    if (saveButton) {
      saveButton.disabled = true;
    }
  }

  function findDuplicatePatentLocal(number) {
    const normalized = normalizePatentNumber(
      number
    );

    if (!normalized) {
      return null;
    }

    return patents.find((patent) => {
      if (
        editingId &&
        String(patent.id) === String(editingId)
      ) {
        return false;
      }

      const appNo = normalizePatentNumber(
        patent.application_no
      );

      const regNo = normalizePatentNumber(
        patent.registration_no
      );

      return (
        appNo === normalized ||
        regNo === normalized
      );
    }) || null;
  }

  function checkDuplicatePatentInput() {
    const lookupNo = P.val('lookupNo');
    const applicationNo = P.val(
      'f_application_no'
    );
    const registrationNo = P.val(
      'f_registration_no'
    );

    const candidates = [
      lookupNo,
      applicationNo,
      registrationNo
    ].filter(Boolean);

    let duplicate = null;
    let matched = '';

    for (const number of candidates) {
      duplicate = findDuplicatePatentLocal(
        number
      );

      if (duplicate) {
        matched = number;
        break;
      }
    }

    if (duplicate) {
      showDuplicatePatentNotice(
        duplicate,
        matched
      );
      return duplicate;
    }

    hideDuplicatePatentNotice();
    return null;
  }

  function scheduleDuplicatePatentCheck() {
    if (duplicateCheckTimer) {
      clearTimeout(duplicateCheckTimer);
    }

    duplicateCheckTimer = setTimeout(
      checkDuplicatePatentInput,
      180
    );
  }

  async function findDuplicatePatentInDb(
    payload
  ) {
    const checks = [];

    if (payload.application_no) {
      checks.push([
        'application_no',
        payload.application_no
      ]);
    }

    if (payload.registration_no) {
      checks.push([
        'registration_no',
        payload.registration_no
      ]);
    }

    for (const [field, value] of checks) {
      let query = P.companyQuery(
        'pat_master',
        'id,invention_title,application_no,registration_no,legal_status,division_code'
      )
        .eq(field, value)
        .limit(1);

      if (editingId) {
        query = query.neq(
          'id',
          editingId
        );
      }

      const result = await query.maybeSingle();

      if (result.error) {
        console.warn(
          '[Patent] 중복 특허 확인 실패:',
          result.error
        );
        continue;
      }

      if (result.data) {
        return result.data;
      }
    }

    return null;
  }

  function isPatentDuplicateConstraint(error) {
    const message = String(
      error?.message || ''
    ).toLowerCase();

    const details = String(
      error?.details || ''
    ).toLowerCase();

    const constraint = String(
      error?.constraint || ''
    ).toLowerCase();

    return (
      message.includes('duplicate key value') ||
      message.includes('unique constraint') ||
      details.includes('already exists') ||
      constraint.includes(
        'uq_pat_master_company_application_no'
      ) ||
      constraint.includes(
        'uq_pat_master_company_registration_no'
      )
    );
  }

  function extractKiprisPatent(data) {
    return data?.patent || data?.data || data || {};
  }

  function inventorNamesFromKipris(patentData) {
    if (!patentData?.inventors) {
      return [];
    }

    const values = Array.isArray(patentData.inventors)
      ? patentData.inventors
      : [patentData.inventors];

    return [...new Set(
      values
        .map((item) => {
          if (typeof item === 'string') {
            return item.trim();
          }

          return String(
            item?.name ||
            item?.inventor_name ||
            ''
          ).trim();
        })
        .filter(Boolean)
    )];
  }


  function isPastDate(value) {
    if (!value) {
      return false;
    }

    const date = new Date(
      `${String(value).slice(0, 10)}T23:59:59`
    );

    if (Number.isNaN(date.getTime())) {
      return false;
    }

    return date.getTime() < Date.now();
  }

  function applyExpirationStatusFallback(
    existingPatent,
    patentData,
    update
  ) {
    const expirationDate =
      update.expiration_date ||
      existingPatent.expiration_date;

    if (
      !existingPatent.registration_no &&
      !update.registration_no
    ) {
      return;
    }

    if (!isPastDate(expirationDate)) {
      return;
    }

    const meta =
      patentData?.kipris_meta || {};

    // ST.27에서 존속기간 이후 보호(G) 또는 만료 후
    // 권리 활성 이벤트를 확인한 경우 날짜만으로 소멸 처리하지 않습니다.
    if (
      meta.st27_has_post_term_protection === true ||
      meta.st27_active_after_expiration === true
    ) {
      return;
    }

    if (
      normalizeStatus(update.legal_status) === '소멸'
    ) {
      return;
    }

    update.legal_status = '소멸';

    if (
      !update.legal_status_detail ||
      normalizeStatus(
        update.legal_status_detail
      ) !== '소멸'
    ) {
      update.legal_status_detail =
        `존속기간 만료일 경과 (${String(expirationDate).slice(0, 10)})`;
    }
  }

  function comparableValue(value) {
    if (Array.isArray(value)) {
      return JSON.stringify(
        [...value]
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .sort()
      );
    }

    if (value == null) {
      return '';
    }

    return String(value).trim();
  }

  function buildKiprisUpdate(patentData, fullResponse) {
    const update = {};

    KIPRIS_SYNC_FIELDS.forEach((field) => {
      if (patentData[field] != null && patentData[field] !== '') {
        update[field] = patentData[field];
      }
    });

    KIPRIS_ARRAY_FIELDS.forEach((field) => {
      if (patentData[field] != null) {
        const values = uniqueArray(patentData[field]);

        if (values.length) {
          update[field] = values;
        }
      }
    });

    update.kipris_last_synced_at = new Date().toISOString();
    update.kipris_raw = fullResponse || patentData;
    update.updated_by_employee_no = ctx.session.employeeNo || null;

    return update;
  }

  function changedOfficialFields(existingPatent, update) {
    const fields = [
      ...KIPRIS_SYNC_FIELDS,
      ...KIPRIS_ARRAY_FIELDS
    ];

    return fields.filter((field) => (
      Object.prototype.hasOwnProperty.call(update, field) &&
      comparableValue(existingPatent[field]) !== comparableValue(update[field])
    ));
  }

  async function replaceInventorsFromKipris(
    patentId,
    patentData
  ) {
    const names = inventorNamesFromKipris(patentData);

    // API에서 발명자가 비어 오면 기존 데이터를 지우지 않습니다.
    if (!names.length) {
      return;
    }

    const deleteResult = await P.state.client
      .from('pat_inventors')
      .delete()
      .eq('patent_id', patentId)
      .eq('company_id', ctx.session.companyId);

    if (deleteResult.error) {
      throw deleteResult.error;
    }

    const rows = names.map((name, index) => (
      P.companyPayload({
        patent_id: patentId,
        inventor_name: name,
        display_order: index + 1,
        source: 'KIPRIS'
      })
    ));

    const insertResult = await P.state.client
      .from('pat_inventors')
      .insert(rows);

    if (insertResult.error) {
      throw insertResult.error;
    }
  }

  async function addKiprisStatusHistory(
    existingPatent,
    newStatus,
    patentData
  ) {
    const before = normalizeStatus(existingPatent.legal_status);
    const after = normalizeStatus(newStatus);

    if (!before || !after || before === after) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const payload = P.companyPayload({
      patent_id: existingPatent.id,
      event_date: today,
      event_type: 'STATUS_CHANGE',
      title: `KIPRIS 상태 갱신: ${before} → ${after}`,
      description: patentData.legal_status_detail || 'KIPRIS 자동갱신',
      source: 'KIPRIS',
      raw_data: {
        before,
        after,
        legal_status_detail: patentData.legal_status_detail || null
      },
      created_by_employee_no: ctx.session.employeeNo || null
    });

    const result = await P.state.client
      .from('pat_events')
      .insert(payload);

    if (result.error) {
      console.warn(
        '[Patent] 상태변경 이력 저장 실패:',
        result.error
      );
    }
  }

  async function updatePatentFromKipris(
    existingPatent,
    kiprisResponse
  ) {
    const patentData = extractKiprisPatent(kiprisResponse);
    const update = buildKiprisUpdate(
      patentData,
      kiprisResponse
    );

    applyExpirationStatusFallback(
      existingPatent,
      patentData,
      update
    );

    const changedFields = changedOfficialFields(
      existingPatent,
      update
    );

    const result = await P.state.client
      .from('pat_master')
      .update(update)
      .eq('id', existingPatent.id)
      .eq('company_id', ctx.session.companyId);

    if (result.error) {
      throw result.error;
    }

    await replaceInventorsFromKipris(
      existingPatent.id,
      patentData
    );

    if (
      Object.prototype.hasOwnProperty.call(
        update,
        'legal_status'
      )
    ) {
      await addKiprisStatusHistory(
        existingPatent,
        update.legal_status,
        {
          ...patentData,
          legal_status_detail:
            update.legal_status_detail ||
            patentData.legal_status_detail
        }
      );
    }

    return {
      patentData,
      update,
      changedFields
    };
  }

  async function init() {
    ctx = await P.resolveContext();

    if (!ctx.access.read) {
      document.querySelector('.pat-app').innerHTML = (
        '<div class="pat-error">' +
        '특허관리 접근 권한이 없습니다.' +
        '</div>'
      );
      return;
    }

    document.getElementById('newPatentBtn').disabled =
      !ctx.access.write;

    document.getElementById('bulkKiprisRefreshBtn').disabled =
      !ctx.access.write;

    await Promise.all([
      loadEmployees(),
      loadDivisions()
    ]);

    await loadList();

    bind();

    const openId = query.get('patent_id');

    if (openId) {
      await openDetail(openId);
    }
  }

  function bind() {
    const filterIds = [
      'searchInput',
      'divisionFilter',
      'countryFilter',
      'typeFilter',
      'statusFilter'
    ];

    filterIds.forEach((id) => {
      const element = document.getElementById(id);
      const eventName = id === 'searchInput'
        ? 'input'
        : 'change';

      element.addEventListener(
        eventName,
        renderList
      );
    });

    document
      .getElementById('refreshBtn')
      .addEventListener(
        'click',
        () => loadList().catch((error) => {
          P.toast(error.message, 'error');
        })
      );

    document
      .getElementById('bulkKiprisRefreshBtn')
      .addEventListener(
        'click',
        bulkRefreshKipris
      );

    document
      .getElementById('newPatentBtn')
      .addEventListener(
        'click',
        () => openPatentModal()
      );

    document
      .getElementById('savePatentBtn')
      .addEventListener(
        'click',
        savePatent
      );

    document
      .getElementById('kiprisLookupBtn')
      .addEventListener(
        'click',
        lookupKipris
      );


    [
      'lookupNo',
      'f_application_no',
      'f_registration_no'
    ].forEach((id) => {
      const input = document.getElementById(
        id
      );

      if (!input) {
        return;
      }

      input.addEventListener(
        'input',
        scheduleDuplicatePatentCheck
      );

      input.addEventListener(
        'change',
        checkDuplicatePatentInput
      );
    });

    document
      .getElementById('backBtn')
      .addEventListener(
        'click',
        showList
      );

    document
      .getElementById('editPatentBtn')
      .addEventListener(
        'click',
        () => openPatentModal(currentPatent)
      );

    document
      .getElementById('deletePatentBtn')
      .addEventListener(
        'click',
        deletePatent
      );

    document
      .getElementById('kiprisRefreshBtn')
      .addEventListener(
        'click',
        refreshKipris
      );

    document
      .querySelectorAll('[data-detail-tab]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => switchDetailTab(
            button.dataset.detailTab
          )
        );
      });

    document
      .getElementById('uploadFileBtn')
      .addEventListener(
        'click',
        uploadFile
      );

    document
      .getElementById('bulkRefreshCloseBtn')
      .addEventListener(
        'click',
        closeBulkRefreshModal
      );

    document
      .getElementById('bulkRefreshTopCloseBtn')
      .addEventListener(
        'click',
        closeBulkRefreshModal
      );

    window.addEventListener(
      'message',
      (event) => {
        if (event.data?.type !== 'portal-auth') {
          return;
        }

        setTimeout(
          () => loadList().catch(() => {}),
          100
        );
      }
    );
  }

  async function loadDivisions() {
    try {
      const result = await P.state.client
        .from('divisions')
        .select('division_code,division_name,is_active')
        .order('division_code');

      if (result.error) {
        throw result.error;
      }

      divisions = result.data || [];
    } catch (error) {
      console.warn(
        '[Patent] divisions 조회 실패:',
        error
      );

      divisions = [];
    }

    const filter = document.getElementById(
      'divisionFilter'
    );

    const formSelect = document.getElementById(
      'f_division_code'
    );

    const currentFilter = filter?.value || '';
    const currentForm = formSelect?.value || '';

    const filterOptions = divisions
      .map((division) => {
        const code = P.escapeHtml(
          division.division_code || ''
        );

        const name = P.escapeHtml(
          division.division_name ||
          division.division_code ||
          ''
        );

        const inactive = division.is_active === false
          ? ' (미사용)'
          : '';

        return (
          `<option value="${code}">` +
          `${name}${inactive}` +
          '</option>'
        );
      })
      .join('');

    if (filter) {
      filter.innerHTML = (
        '<option value="">전체 본부</option>' +
        filterOptions
      );

      if (
        divisions.some(
          (division) => (
            division.division_code === currentFilter
          )
        )
      ) {
        filter.value = currentFilter;
      }
    }

    if (formSelect) {
      formSelect.innerHTML = (
        '<option value="">선택</option>' +
        filterOptions
      );

      if (
        divisions.some(
          (division) => (
            division.division_code === currentForm
          )
        )
      ) {
        formSelect.value = currentForm;
      }
    }
  }

  async function loadEmployees() {
    try {
      const result = await P.state.client
        .from('employees')
        .select('employee_no,name,email')
        .eq(
          'company_id',
          ctx.session.companyId
        )
        .order('name');

      if (result.error) {
        throw result.error;
      }

      employees = result.data || [];
    } catch (error) {
      console.warn(error);
      employees = [];
    }

    const select = document.getElementById(
      'f_manager_employee_no'
    );

    const options = employees
      .map((employee) => {
        const employeeNo = P.escapeHtml(
          employee.employee_no
        );
        const name = P.escapeHtml(
          employee.name || employee.employee_no
        );

        return (
          `<option value="${employeeNo}">` +
          `${name} (${employeeNo})` +
          '</option>'
        );
      })
      .join('');

    select.innerHTML = (
      '<option value="">선택</option>' +
      options
    );
  }

  async function loadList() {
    const [patentResult, deadlineResult] =
      await Promise.all([
        P.companyQuery(
          'pat_master',
          '*'
        )
          .eq('is_active', true)
          .order(
            'created_at',
            { ascending: false }
          ),

        P.companyQuery(
          'pat_deadlines',
          'patent_id,title,due_date,status'
        )
          .eq('status', 'OPEN')
          .order(
            'due_date',
            { ascending: true }
          )
      ]);

    if (patentResult.error) {
      throw patentResult.error;
    }

    if (deadlineResult.error) {
      throw deadlineResult.error;
    }

    patents = patentResult.data || [];
    deadlines = deadlineResult.data || [];

    const countries = [
      ...new Set(
        patents
          .map((item) => item.country_code)
          .filter(Boolean)
      )
    ].sort();

    const countryFilter = document.getElementById(
      'countryFilter'
    );
    const currentValue = countryFilter.value;

    const countryOptions = countries
      .map((country) => (
        `<option value="${P.escapeHtml(country)}">` +
        `${P.escapeHtml(country)}` +
        '</option>'
      ))
      .join('');

    countryFilter.innerHTML = (
      '<option value="">전체 국가</option>' +
      countryOptions
    );

    countryFilter.value = currentValue;

    renderList();
  }

  function renderList() {
    const search = P.clean(
      document.getElementById('searchInput').value
    ).toLowerCase();

    const division = document.getElementById(
      'divisionFilter'
    ).value;

    const country = document.getElementById(
      'countryFilter'
    ).value;

    const type = document.getElementById(
      'typeFilter'
    ).value;

    const status = document.getElementById(
      'statusFilter'
    ).value;

    const rows = patents.filter((patent) => {
      const haystack = [
        patent.invention_title,
        patent.application_no,
        patent.registration_no,
        patent.internal_no,
        patent.division_code,
        divisionName(patent.division_code)
      ]
        .join(' ')
        .toLowerCase();

      const patentStatus = normalizeStatus(
        patent.legal_status
      );

      return (
        (!search || haystack.includes(search)) &&
        (!division || patent.division_code === division) &&
        (!country || patent.country_code === country) &&
        (!type || patent.ip_type === type) &&
        (!status || patentStatus === status)
      );
    });

    document.getElementById(
      'resultCount'
    ).textContent = `${rows.length}건`;

    document.getElementById(
      'patentBody'
    ).innerHTML = rows.length
      ? rows.map(renderPatentRow).join('')
      : (
        '<tr>' +
        '<td colspan="12" class="pat-empty">' +
        '조건에 맞는 특허가 없습니다.' +
        '</td>' +
        '</tr>'
      );

    document
      .querySelectorAll('#patentBody tr[data-id]')
      .forEach((row) => {
        row.addEventListener(
          'click',
          () => openDetail(
            row.dataset.id
          ).catch((error) => {
            P.toast(
              error.message,
              'error'
            );
          })
        );
      });
  }

  function renderPatentRow(patent, index) {
    const deadline = nextDeadline(
      patent.id
    );

    const nextDeadlineHtml = deadline
      ? (
        `<span class="pat-dday ${P.ddayClass(deadline.due_date)}">` +
        `${P.dday(deadline.due_date)}` +
        '</span>' +
        `<div class="row-sub">${P.escapeHtml(deadline.title)}</div>`
      )
      : '-';

    return `
      <tr
        class="clickable"
        data-id="${patent.id}"
      >
        <td>${index + 1}</td>

        <td>
          ${P.badge(
            patent.legal_status,
            P.patentStatusLabel(
              patent.legal_status
            )
          )}
        </td>

        <td>
          ${P.escapeHtml(
            divisionName(
              patent.division_code
            )
          )}
        </td>

        <td>
          ${P.escapeHtml(
            patent.registration_no || '-'
          )}
        </td>

        <td>
          <b>${P.escapeHtml(patent.invention_title)}</b>
          <div class="row-sub">
            ${P.escapeHtml(
              patent.application_no || ''
            )}
          </div>
        </td>

        <td>
          ${P.escapeHtml(
            patent.country_code || '-'
          )}
        </td>

        <td>
          ${P.escapeHtml(
            labels[patent.ip_type] ||
            patent.ip_type ||
            '-'
          )}
        </td>

        <td>
          ${P.fmtDate(
            patent.application_date
          )}
        </td>

        <td>
          ${P.fmtDate(
            patent.registration_date
          )}
        </td>

        <td>
          ${P.fmtDate(
            patent.expiration_date
          )}
        </td>

        <td>
          ${nextDeadlineHtml}
        </td>

        <td>
          ${P.escapeHtml(
            managerName(
              patent.manager_employee_no
            )
          )}
        </td>
      </tr>
    `;
  }

  function clearForm() {
    const fields = [
      'division_code',
      'internal_no',
      'application_no',
      'application_date',
      'publication_no',
      'publication_date',
      'registration_no',
      'registration_date',
      'legal_status',
      'expiration_date',
      'applicant_names',
      'right_holder_names',
      'agent_names',
      'inventors',
      'ipc_codes',
      'cpc_codes',
      'related_project',
      'related_product_technology',
      'abstract_text',
      'memo'
    ];

    fields.forEach((field) => {
      P.setVal(
        `f_${field}`,
        ''
      );
    });

    P.setVal(
      'f_ip_type',
      'PATENT'
    );
    P.setVal(
      'f_country_code',
      'KR'
    );
    P.setVal(
      'f_manager_employee_no',
      ''
    );
    P.setVal(
      'lookupNo',
      ''
    );

    hideDuplicatePatentNotice();
  }

  function openPatentModal(patent = null) {
    if (!ctx.access.write) {
      return;
    }

    editingId = null;
    clearForm();
    editingId = patent?.id || null;

    document.getElementById(
      'patentModalTitle'
    ).textContent = patent
      ? '특허 수정'
      : '특허 등록';

    if (patent) {
      const formValues = {
        division_code:
          patent.division_code,
        internal_no:
          patent.internal_no,
        ip_type:
          patent.ip_type,
        country_code:
          patent.country_code,
        invention_title:
          patent.invention_title,
        application_no:
          patent.application_no,
        application_date:
          patent.application_date,
        publication_no:
          patent.publication_no,
        publication_date:
          patent.publication_date,
        registration_no:
          patent.registration_no,
        registration_date:
          patent.registration_date,
        legal_status:
          normalizeStatus(
            patent.legal_status
          ),
        expiration_date:
          patent.expiration_date,
        manager_employee_no:
          patent.manager_employee_no,
        applicant_names:
          (patent.applicant_names || []).join(', '),
        right_holder_names:
          (patent.right_holder_names || []).join(', '),
        agent_names:
          (patent.agent_names || []).join(', '),
        ipc_codes:
          (patent.ipc_codes || []).join(', '),
        cpc_codes:
          (patent.cpc_codes || []).join(', '),
        related_project:
          patent.related_project,
        related_product_technology:
          patent.related_product_technology,
        abstract_text:
          patent.abstract_text,
        memo:
          patent.memo
      };

      Object.entries(
        formValues
      ).forEach(([field, value]) => {
        P.setVal(
          `f_${field}`,
          value || ''
        );
      });

      P.companyQuery(
        'pat_inventors',
        'inventor_name'
      )
        .eq('patent_id', patent.id)
        .order('display_order')
        .then((result) => {
          if (result.error) {
            return;
          }

          const names = (
            result.data || []
          )
            .map((item) => (
              item.inventor_name
            ))
            .join(', ');

          P.setVal(
            'f_inventors',
            names
          );
        });
    }

    P.modalOpen('patentModal');
  }

  function formPayload() {
    return P.companyPayload({
      division_code:
        P.val('f_division_code') || null,

      internal_no:
        P.val('f_internal_no') || null,

      ip_type:
        P.val('f_ip_type') || 'PATENT',

      country_code:
        (
          P.val('f_country_code') ||
          'KR'
        ).toUpperCase(),

      invention_title:
        P.val('f_invention_title').trim(),

      application_no:
        P.val('f_application_no') || null,

      application_date:
        P.val('f_application_date') || null,

      publication_no:
        P.val('f_publication_no') || null,

      publication_date:
        P.val('f_publication_date') || null,

      registration_no:
        P.val('f_registration_no') || null,

      registration_date:
        P.val('f_registration_date') || null,

      legal_status:
        P.val('f_legal_status') || null,

      expiration_date:
        P.val('f_expiration_date') || null,

      manager_employee_no:
        P.val('f_manager_employee_no') || null,

      applicant_names:
        arrayFromText(
          P.val('f_applicant_names')
        ),

      right_holder_names:
        arrayFromText(
          P.val('f_right_holder_names')
        ),

      agent_names:
        arrayFromText(
          P.val('f_agent_names')
        ),

      ipc_codes:
        arrayFromText(
          P.val('f_ipc_codes')
        ),

      cpc_codes:
        arrayFromText(
          P.val('f_cpc_codes')
        ),

      abstract_text:
        P.val('f_abstract_text') || null,

      related_project:
        P.val('f_related_project') || null,

      related_product_technology:
        P.val(
          'f_related_product_technology'
        ) || null,

      memo:
        P.val('f_memo') || null,

      updated_by_employee_no:
        ctx.session.employeeNo || null
    });
  }

  async function savePatent() {
    if (!ctx.access.write) {
      return;
    }

    const payload = formPayload();

    if (!payload.invention_title) {
      P.toast(
        '발명의 명칭을 입력해 주세요.',
        'warn'
      );
      return;
    }

    const localDuplicate =
      checkDuplicatePatentInput();

    if (localDuplicate) {
      P.toast(
        '이미 등록된 특허입니다. 입력창 상단의 안내를 확인해 주세요.',
        'warn',
        3600
      );
      return;
    }

    const dbDuplicate =
      await findDuplicatePatentInDb(
        payload
      );

    if (dbDuplicate) {
      showDuplicatePatentNotice(
        dbDuplicate,
        payload.application_no ||
        payload.registration_no
      );

      P.toast(
        '이미 등록된 특허입니다. 기존 특허를 확인해 주세요.',
        'warn',
        3600
      );
      return;
    }

    const button = this;
    button.disabled = true;

    try {
      let row;

      if (editingId) {
        const result = await P.state.client
          .from('pat_master')
          .update(payload)
          .eq('id', editingId)
          .eq(
            'company_id',
            ctx.session.companyId
          )
          .select()
          .single();

        if (result.error) {
          throw result.error;
        }

        row = result.data;
      } else {
        payload.created_by_employee_no =
          ctx.session.employeeNo || null;

        const result = await P.state.client
          .from('pat_master')
          .insert(payload)
          .select()
          .single();

        if (result.error) {
          throw result.error;
        }

        row = result.data;
      }

      const inventorNames = arrayFromText(
        P.val('f_inventors')
      );

      const deleteResult =
        await P.state.client
          .from('pat_inventors')
          .delete()
          .eq(
            'patent_id',
            row.id
          )
          .eq(
            'company_id',
            ctx.session.companyId
          );

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      if (inventorNames.length) {
        const inventorRows = inventorNames.map(
          (name, index) => (
            P.companyPayload({
              patent_id: row.id,
              inventor_name: name,
              display_order: index + 1,
              source: 'MANUAL'
            })
          )
        );

        const inventorResult =
          await P.state.client
            .from('pat_inventors')
            .insert(inventorRows);

        if (inventorResult.error) {
          throw inventorResult.error;
        }
      }

      P.modalClose('patentModal');

      P.toast(
        editingId
          ? '수정했습니다.'
          : '등록했습니다.'
      );

      editingId = null;

      await loadList();

      if (
        currentPatent?.id === row.id
      ) {
        await openDetail(row.id);
      }
    } catch (error) {
      if (
        isPatentDuplicateConstraint(
          error
        )
      ) {
        const duplicate =
          findDuplicatePatentLocal(
            payload.application_no
          ) ||
          findDuplicatePatentLocal(
            payload.registration_no
          );

        if (duplicate) {
          showDuplicatePatentNotice(
            duplicate,
            payload.application_no ||
            payload.registration_no
          );
        }

        P.toast(
          '이미 등록된 특허입니다. 출원번호 또는 등록번호를 확인해 주세요.',
          'warn',
          4200
        );
      } else {
        P.toast(
          error.message,
          'error'
        );
      }
    } finally {
      button.disabled = false;
    }
  }

  function applyKiprisData(data) {
    const patentData =
      extractKiprisPatent(data);

    const map = {
      invention_title:
        patentData.invention_title ||
        patentData.title,

      application_no:
        patentData.application_no,

      application_date:
        patentData.application_date,

      publication_no:
        patentData.publication_no,

      publication_date:
        patentData.publication_date,

      registration_no:
        patentData.registration_no,

      registration_date:
        patentData.registration_date,

      legal_status:
        normalizeStatus(
          patentData.legal_status ||
          patentData.status
        ),

      expiration_date:
        patentData.expiration_date,

      country_code:
        patentData.country_code || 'KR',

      abstract_text:
        patentData.abstract_text ||
        patentData.abstract
    };

    Object.entries(map).forEach(
      ([field, value]) => {
        if (!value) {
          return;
        }

        const maxLength = field.includes(
          'date'
        )
          ? 10
          : 9999;

        P.setVal(
          `f_${field}`,
          String(value).slice(
            0,
            maxLength
          )
        );
      }
    );

    if (patentData.applicant_names) {
      P.setVal(
        'f_applicant_names',
        uniqueArray(
          patentData.applicant_names
        ).join(', ')
      );
    }

    if (patentData.right_holder_names) {
      P.setVal(
        'f_right_holder_names',
        uniqueArray(
          patentData.right_holder_names
        ).join(', ')
      );
    }

    if (patentData.agent_names) {
      P.setVal(
        'f_agent_names',
        uniqueArray(
          patentData.agent_names
        ).join(', ')
      );
    }

    const inventors =
      inventorNamesFromKipris(
        patentData
      );

    if (inventors.length) {
      P.setVal(
        'f_inventors',
        inventors.join(', ')
      );
    }

    if (patentData.ipc_codes) {
      P.setVal(
        'f_ipc_codes',
        uniqueArray(
          patentData.ipc_codes
        ).join(', ')
      );
    }

    if (patentData.cpc_codes) {
      P.setVal(
        'f_cpc_codes',
        uniqueArray(
          patentData.cpc_codes
        ).join(', ')
      );
    }
  }

  async function lookupKipris() {
    const number = P.val(
      'lookupNo'
    ).trim();

    if (!number) {
      P.toast(
        '출원번호 또는 등록번호를 입력해 주세요.',
        'warn'
      );
      return;
    }

    const button = this;
    button.disabled = true;

    try {
      const data = await P.invokeKipris({
        action: 'lookup',
        number,
        company_id:
          ctx.session.companyId
      });

      applyKiprisData(data);

      const duplicate =
        checkDuplicatePatentInput();

      if (duplicate) {
        P.toast(
          'KIPRIS 조회는 완료했지만 이미 등록된 특허입니다.',
          'warn',
          3800
        );
      } else {
        P.toast(
          'KIPRIS 정보를 불러왔습니다.'
        );
      }
    } catch (error) {
      P.toast(
        error.message +
        ' Edge Function 설정 전에는 직접 입력해 주세요.',
        'error',
        4200
      );
    } finally {
      button.disabled = false;
    }
  }

  async function openDetail(id) {
    const cachedPatent = patents.find(
      (item) => item.id === id
    );

    const latestResult =
      await P.companyQuery(
        'pat_master',
        '*'
      )
        .eq('id', id)
        .maybeSingle();

    if (latestResult.error) {
      console.warn(
        '[Patent] 상세 최신정보 조회 실패, 목록 캐시를 사용합니다:',
        latestResult.error
      );
    }

    const patent =
      latestResult.data ||
      cachedPatent;

    if (!patent) {
      throw new Error(
        '특허 정보를 찾을 수 없습니다.'
      );
    }

    currentPatent = patent;

    const patentIndex = patents.findIndex(
      (item) => item.id === id
    );

    if (patentIndex >= 0) {
      patents[patentIndex] = {
        ...patents[patentIndex],
        ...patent
      };
    }

    const [
      inventorResult,
      eventResult,
      paymentResult,
      fileResult,
      deadlineResult
    ] = await Promise.all([
      P.companyQuery(
        'pat_inventors',
        '*'
      )
        .eq('patent_id', id)
        .order('display_order'),

      P.companyQuery(
        'pat_events',
        '*'
      )
        .eq('patent_id', id)
        .order(
          'event_date',
          { ascending: false }
        ),

      P.companyQuery(
        'pat_payments',
        '*'
      )
        .eq('patent_id', id)
        .order(
          'official_due_date',
          { ascending: false }
        ),

      P.companyQuery(
        'pat_files',
        '*'
      )
        .eq('patent_id', id)
        .order(
          'created_at',
          { ascending: false }
        ),

      P.companyQuery(
        'pat_deadlines',
        '*'
      )
        .eq('patent_id', id)
        .order(
          'due_date',
          { ascending: true }
        )
    ]);

    [
      inventorResult,
      eventResult,
      paymentResult,
      fileResult,
      deadlineResult
    ].forEach((result) => {
      if (result.error) {
        throw result.error;
      }
    });

    detailData = {
      inventors:
        inventorResult.data || [],
      events:
        eventResult.data || [],
      payments:
        paymentResult.data || [],
      files:
        fileResult.data || [],
      deadlines:
        deadlineResult.data || []
    };

    document
      .getElementById('listView')
      .classList.add('hidden');

    document
      .getElementById('detailView')
      .classList.remove('hidden');

    document.getElementById(
      'editPatentBtn'
    ).disabled = !ctx.access.write;

    document.getElementById(
      'deletePatentBtn'
    ).disabled = !ctx.access.admin;

    document.getElementById(
      'kiprisRefreshBtn'
    ).disabled = !ctx.access.write;

    renderHero();
    switchDetailTab('basic');

    history.replaceState(
      null,
      '',
      `?patent_id=${encodeURIComponent(id)}`
    );
  }

  function renderHero() {
    const patent = currentPatent;

    const next = detailData.deadlines.find(
      (item) => item.status === 'OPEN'
    );

    const remaining = P.daysUntil(
      patent.expiration_date
    );

    let progress = 0;

    if (
      patent.application_date &&
      patent.expiration_date
    ) {
      const start = new Date(
        patent.application_date
      );
      const end = new Date(
        patent.expiration_date
      );
      const now = new Date();

      progress = Math.max(
        0,
        Math.min(
          100,
          ((now - start) / (end - start)) * 100
        )
      );
    }

    const remainingHtml =
      remaining !== null
        ? ` (${P.dday(patent.expiration_date)})`
        : '';

    const nextHtml = next
      ? `
        <span class="pat-dday ${P.ddayClass(next.due_date)}">
          다음기한
          ${P.fmtDate(next.due_date)}
          ${P.dday(next.due_date)}
        </span>
      `
      : '';

    const progressHtml =
      patent.expiration_date
        ? `
          <div style="margin-top: 12px;">
            <div class="pat-progress">
              <span style="width: ${progress}%"></span>
            </div>
          </div>
        `
        : '';

    document.getElementById(
      'detailHero'
    ).innerHTML = `
      <div class="pat-detail-top">
        <div>
          <div class="pat-pill-row">
            ${P.badge(
              patent.legal_status,
              P.patentStatusLabel(
                patent.legal_status
              )
            )}
            <span class="pat-badge gold">
              ${P.escapeHtml(
                patent.country_code || 'KR'
              )}
            </span>
            <span class="pat-badge gray">
              ${P.escapeHtml(
                labels[patent.ip_type] ||
                patent.ip_type ||
                '특허'
              )}
            </span>
          </div>

          <div class="pat-detail-title">
            ${P.escapeHtml(
              patent.invention_title
            )}
          </div>

          <div class="pat-detail-meta">
            <span>
              사내번호
              ${P.escapeHtml(
                patent.internal_no || '-'
              )}
            </span>
            <span>
              출원일
              ${P.fmtDate(
                patent.application_date
              )}
            </span>
            <span>
              등록일
              ${P.fmtDate(
                patent.registration_date
              )}
            </span>
            <span>
              만료예정
              ${P.fmtDate(
                patent.expiration_date
              )}
              ${remainingHtml}
            </span>
            ${nextHtml}
          </div>
        </div>
      </div>

      ${progressHtml}
    `;
  }

  function showList() {
    currentPatent = null;
    detailData = null;

    document
      .getElementById('detailView')
      .classList.add('hidden');

    document
      .getElementById('listView')
      .classList.remove('hidden');

    history.replaceState(
      null,
      '',
      './index.html'
    );
  }

  function switchDetailTab(tab) {
    document
      .querySelectorAll('[data-detail-tab]')
      .forEach((button) => {
        button.classList.toggle(
          'active',
          button.dataset.detailTab === tab
        );
      });

    const element = document.getElementById(
      'detailContent'
    );

    if (tab === 'basic') {
      renderBasic(element);
    }

    if (tab === 'events') {
      renderEvents(element);
    }

    if (tab === 'inventors') {
      renderInventors(element);
    }

    if (tab === 'payments') {
      renderPayments(element);
    }

    if (tab === 'files') {
      renderFiles(element);
    }

    if (tab === 'memo') {
      renderMemo(element);
    }
  }

  function renderBasic(element) {
    const patent = currentPatent;

    element.innerHTML = `
      <div class="detail-basic-grid">
        <div>
          <dl class="pat-info-grid">
            <dt>본부</dt>
            <dd>
              ${P.escapeHtml(
                divisionName(
                  patent.division_code
                )
              )}
            </dd>

            <dt>사내 관리번호</dt>
            <dd>${P.escapeHtml(patent.internal_no || '-')}</dd>

            <dt>출원번호</dt>
            <dd>${P.escapeHtml(patent.application_no || '-')}</dd>

            <dt>출원일</dt>
            <dd>${P.fmtDate(patent.application_date)}</dd>

            <dt>공개번호</dt>
            <dd>${P.escapeHtml(patent.publication_no || '-')}</dd>

            <dt>공개일</dt>
            <dd>${P.fmtDate(patent.publication_date)}</dd>

            <dt>등록번호</dt>
            <dd>${P.escapeHtml(patent.registration_no || '-')}</dd>

            <dt>등록일</dt>
            <dd>${P.fmtDate(patent.registration_date)}</dd>

            <dt>존속기간 만료</dt>
            <dd>${P.fmtDate(patent.expiration_date)}</dd>

            <dt>출원인</dt>
            <dd>
              ${P.escapeHtml(
                (patent.applicant_names || []).join(', ') || '-'
              )}
            </dd>

            <dt>권리자</dt>
            <dd>
              ${P.escapeHtml(
                (patent.right_holder_names || []).join(', ') || '-'
              )}
            </dd>

            <dt>대리인</dt>
            <dd>
              ${P.escapeHtml(
                (patent.agent_names || []).join(', ') || '-'
              )}
            </dd>

            <dt>IPC</dt>
            <dd>
              ${P.escapeHtml(
                (patent.ipc_codes || []).join(', ') || '-'
              )}
            </dd>

            <dt>CPC</dt>
            <dd>
              ${P.escapeHtml(
                (patent.cpc_codes || []).join(', ') || '-'
              )}
            </dd>

            <dt>담당자</dt>
            <dd>
              ${P.escapeHtml(
                managerName(
                  patent.manager_employee_no
                )
              )}
            </dd>

            <dt>관련 연구과제</dt>
            <dd>${P.escapeHtml(patent.related_project || '-')}</dd>

            <dt>관련 제품/기술</dt>
            <dd>
              ${P.escapeHtml(
                patent.related_product_technology || '-'
              )}
            </dd>
          </dl>
        </div>

        <div class="detail-side">
          <div class="rights-box">
            <div class="pat-card-title">
              요약 정보
            </div>

            <div class="summary-list">
              <div class="summary-row">
                <span>현재 상태</span>
                <strong>
                  ${P.patentStatusLabel(
                    patent.legal_status
                  )}
                </strong>
              </div>

              <div class="summary-row">
                <span>발명자</span>
                <strong>
                  ${detailData.inventors.length}명
                </strong>
              </div>

              <div class="summary-row">
                <span>납부내역</span>
                <strong>
                  ${detailData.payments.length}건
                </strong>
              </div>

              <div class="summary-row">
                <span>첨부문서</span>
                <strong>
                  ${detailData.files.length}건
                </strong>
              </div>
            </div>
          </div>

          <div class="rights-box">
            <div class="pat-card-title">
              초록
            </div>
            <div class="pat-card-desc abstract-box">
              ${P.escapeHtml(
                patent.abstract_text ||
                '등록된 초록이 없습니다.'
              )}
            </div>
          </div>

          <div class="rights-box">
            <div class="pat-card-title">
              KIPRIS 동기화
            </div>
            <div class="pat-card-desc">
              최근 갱신:
              ${
                patent.kipris_last_synced_at
                  ? P.fmtDate(
                    patent.kipris_last_synced_at
                  )
                  : '미연동'
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEvents(element) {
    const addForm = ctx.access.write
      ? `
        <div class="events-add">
          <div class="event-add-row">
            <input
              id="eventDate"
              type="date"
              class="pat-input"
            />
            <input
              id="eventType"
              class="pat-input"
              placeholder="유형"
            />
            <input
              id="eventTitle"
              class="pat-input"
              placeholder="진행이력 제목"
            />
            <button
              id="addEventBtn"
              class="pat-btn primary"
              type="button"
            >
              이력 추가
            </button>
          </div>
        </div>
      `
      : '';

    const timeline = detailData.events.length
      ? detailData.events
        .map((event) => `
          <div class="pat-timeline-item">
            <div class="pat-timeline-date">
              ${P.fmtDate(event.event_date)}
            </div>
            <div class="pat-timeline-title">
              ${P.escapeHtml(event.title)}
            </div>
            <div class="pat-timeline-desc">
              ${P.escapeHtml(
                event.description ||
                event.event_type ||
                ''
              )}
            </div>
          </div>
        `)
        .join('')
      : (
        '<div class="pat-empty">' +
        '진행이력이 없습니다.' +
        '</div>'
      );

    element.innerHTML = `
      ${addForm}
      <div class="pat-timeline">
        ${timeline}
      </div>
    `;

    document
      .getElementById('addEventBtn')
      ?.addEventListener(
        'click',
        addEvent
      );
  }

  async function addEvent() {
    const date = P.val('eventDate');
    const type = P.val('eventType') || 'MANUAL';
    const title = P.val('eventTitle');

    if (!title) {
      P.toast(
        '제목을 입력해 주세요.',
        'warn'
      );
      return;
    }

    const result = await P.state.client
      .from('pat_events')
      .insert(
        P.companyPayload({
          patent_id: currentPatent.id,
          event_date: date || null,
          event_type: type,
          title,
          source: 'MANUAL',
          created_by_employee_no:
            ctx.session.employeeNo || null
        })
      );

    if (result.error) {
      P.toast(
        result.error.message,
        'error'
      );
      return;
    }

    P.toast(
      '진행이력을 추가했습니다.'
    );

    await openDetail(
      currentPatent.id
    );

    switchDetailTab('events');
  }

  function renderInventors(element) {
    const chips = detailData.inventors.length
      ? detailData.inventors
        .map((inventor) => `
          <span class="inventor-chip">
            ${P.escapeHtml(
              inventor.inventor_name
            )}
          </span>
        `)
        .join('')
      : (
        '<div class="pat-empty">' +
        '등록된 발명자가 없습니다.' +
        '</div>'
      );

    element.innerHTML = `
      <div class="inventor-list">
        ${chips}
      </div>

      <div class="pat-note form-top-gap">
        발명자는 employees와 자동 매칭하지 않고
        KIPRIS 또는 수기 입력 이름을 그대로 표시합니다.
      </div>
    `;
  }

  function renderPayments(element) {
    const rows = detailData.payments.length
      ? detailData.payments
        .map((payment) => `
          <tr>
            <td>
              ${P.paymentTypeLabel(
                payment.payment_type
              )}
            </td>
            <td>
              ${P.annualRangeLabel(
                payment.annual_year_from,
                payment.annual_year_to
              )}
            </td>
            <td>
              ${P.fmtDate(
                payment.official_due_date ||
                payment.invoice_due_date
              )}
            </td>
            <td>
              ${P.paymentMethodLabel(
                payment.payment_method
              )}
            </td>
            <td class="num">
              ${P.fmtMoney(
                payment.paid_amount ||
                payment.billed_amount,
                payment.currency
              )}
            </td>
            <td>
              ${P.badge(
                payment.status,
                P.paymentStatusLabel(
                  payment.status
                )
              )}
            </td>
            <td>
              ${P.fmtDate(
                payment.paid_date
              )}
            </td>
          </tr>
        `)
        .join('')
      : `
        <tr>
          <td
            colspan="7"
            class="pat-empty"
          >
            납부내역이 없습니다.
          </td>
        </tr>
      `;

    element.innerHTML = `
      <div class="pat-table-wrap">
        <table class="pat-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>대상연차</th>
              <th>납부기한</th>
              <th>방식</th>
              <th>금액</th>
              <th>상태</th>
              <th>지급일</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div style="margin-top: 10px;">
        <button
          class="pat-btn secondary"
          id="goPaymentsBtn"
          type="button"
        >
          납부관리로 이동
        </button>
      </div>
    `;

    document
      .getElementById('goPaymentsBtn')
      .addEventListener(
        'click',
        () => P.navigate(
          'management',
          {
            section: 'payments',
            patent_id: currentPatent.id
          }
        )
      );
  }

  function fileCategoryLabel(value) {
    const categoryLabels = {
      APPLICATION: '출원서',
      SPECIFICATION: '명세서',
      PUBLICATION: '공보',
      CERTIFICATE: '등록증',
      OFFICE_ACTION: '의견제출통지',
      RESPONSE: '의견서/보정서',
      INVOICE: '청구서',
      PAYMENT_PROOF: '납부/지급증빙',
      DRAWING: '도면',
      OTHER: '기타'
    };

    return categoryLabels[value] || value;
  }

  function renderFiles(element) {
    const uploadButton = ctx.access.write
      ? `
        <div style="margin-bottom: 10px;">
          <button
            id="openFileModalBtn"
            class="pat-btn primary"
            type="button"
          >
            ＋ 파일 업로드
          </button>
        </div>
      `
      : '';

    const rows = detailData.files.length
      ? detailData.files
        .map((file) => {
          const deleteButton = ctx.access.write
            ? `
              <button
                class="pat-btn danger"
                data-file-delete="${file.id}"
                type="button"
              >
                삭제
              </button>
            `
            : '';

          return `
            <tr>
              <td>
                ${fileCategoryLabel(
                  file.file_category
                )}
              </td>
              <td>
                ${P.escapeHtml(
                  file.original_file_name
                )}
              </td>
              <td>
                ${P.escapeHtml(
                  file.description || '-'
                )}
              </td>
              <td>
                ${P.fmtDate(
                  file.created_at
                )}
              </td>
              <td>
                <div class="file-actions">
                  <button
                    class="pat-btn"
                    data-file-open="${file.id}"
                    type="button"
                  >
                    열기
                  </button>
                  ${deleteButton}
                </div>
              </td>
            </tr>
          `;
        })
        .join('')
      : `
        <tr>
          <td
            colspan="5"
            class="pat-empty"
          >
            첨부문서가 없습니다.
          </td>
        </tr>
      `;

    element.innerHTML = `
      ${uploadButton}

      <div class="pat-table-wrap">
        <table class="pat-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>파일명</th>
              <th>설명</th>
              <th>등록일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    document
      .getElementById('openFileModalBtn')
      ?.addEventListener(
        'click',
        () => P.modalOpen(
          'fileModal'
        )
      );

    element
      .querySelectorAll('[data-file-open]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            const file = detailData.files.find(
              (item) => (
                item.id === button.dataset.fileOpen
              )
            );

            P.downloadPatentFile(
              file
            ).catch((error) => {
              P.toast(
                error.message,
                'error'
              );
            });
          }
        );
      });

    element
      .querySelectorAll('[data-file-delete]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          async () => {
            if (!confirm('파일을 삭제할까요?')) {
              return;
            }

            const file = detailData.files.find(
              (item) => (
                item.id ===
                button.dataset.fileDelete
              )
            );

            try {
              await P.deletePatentFile(
                file
              );

              P.toast(
                '삭제했습니다.'
              );

              await openDetail(
                currentPatent.id
              );

              switchDetailTab('files');
            } catch (error) {
              P.toast(
                error.message,
                'error'
              );
            }
          }
        );
      });
  }

  function renderMemo(element) {
    const saveButton = ctx.access.write
      ? `
        <div>
          <button
            id="saveMemoBtn"
            class="pat-btn primary"
            type="button"
          >
            메모 저장
          </button>
        </div>
      `
      : '';

    element.innerHTML = `
      <div class="memo-editor">
        <textarea
          id="memoText"
          class="pat-textarea"
          ${ctx.access.write ? '' : 'readonly'}
        >${P.escapeHtml(
          currentPatent.memo || ''
        )}</textarea>

        ${saveButton}
      </div>
    `;

    document
      .getElementById('saveMemoBtn')
      ?.addEventListener(
        'click',
        async () => {
          const result =
            await P.state.client
              .from('pat_master')
              .update({
                memo: P.val('memoText'),
                updated_by_employee_no:
                  ctx.session.employeeNo || null
              })
              .eq(
                'id',
                currentPatent.id
              )
              .eq(
                'company_id',
                ctx.session.companyId
              )
              .select()
              .single();

          if (result.error) {
            P.toast(
              result.error.message,
              'error'
            );
            return;
          }

          currentPatent =
            result.data;

          const patentIndex =
            patents.findIndex(
              (item) =>
                item.id === currentPatent.id
            );

          if (patentIndex >= 0) {
            patents[patentIndex] = {
              ...patents[patentIndex],
              ...currentPatent
            };
          }

          P.toast(
            '메모를 저장했습니다.'
          );
        }
      );
  }

  async function uploadFile() {
    const file =
      document.getElementById(
        'fileInput'
      ).files?.[0];

    if (!file) {
      P.toast(
        '파일을 선택해 주세요.',
        'warn'
      );
      return;
    }

    const button = this;
    button.disabled = true;

    try {
      await P.uploadPatentFile({
        patentId:
          currentPatent.id,
        file,
        category:
          P.val('fileCategory'),
        description:
          P.val('fileDesc')
      });

      P.modalClose('fileModal');

      document.getElementById(
        'fileInput'
      ).value = '';

      P.setVal(
        'fileDesc',
        ''
      );

      P.toast(
        '파일을 업로드했습니다.'
      );

      await openDetail(
        currentPatent.id
      );

      switchDetailTab('files');
    } catch (error) {
      P.toast(
        error.message,
        'error',
        4500
      );
    } finally {
      button.disabled = false;
    }
  }

  async function deletePatent() {
    if (
      !ctx.access.admin ||
      !currentPatent
    ) {
      return;
    }

    const confirmed = confirm(
      '이 특허와 연결된 이력/납부/파일 정보를 삭제할까요?'
    );

    if (!confirmed) {
      return;
    }

    const result = await P.state.client
      .from('pat_master')
      .delete()
      .eq(
        'id',
        currentPatent.id
      )
      .eq(
        'company_id',
        ctx.session.companyId
      );

    if (result.error) {
      P.toast(
        result.error.message,
        'error'
      );
      return;
    }

    P.toast(
      '특허를 삭제했습니다.'
    );

    showList();
    await loadList();
  }

  async function refreshKipris() {
    if (
      !ctx.access.write ||
      !currentPatent
    ) {
      return;
    }

    const number =
      currentPatent.application_no ||
      currentPatent.registration_no;

    if (!number) {
      P.toast(
        '출원번호 또는 등록번호가 없습니다.',
        'warn'
      );
      return;
    }

    const button = this;
    button.disabled = true;

    try {
      const data = await P.invokeKipris({
        action: 'lookup',
        number,
        company_id:
          ctx.session.companyId
      });

      await updatePatentFromKipris(
        currentPatent,
        data
      );

      P.toast(
        'KIPRIS 정보를 갱신했습니다.'
      );

      await loadList();
      await openDetail(
        currentPatent.id
      );
    } catch (error) {
      P.toast(
        error.message +
        ' Edge Function 설정을 확인해 주세요.',
        'error',
        4500
      );
    } finally {
      button.disabled = false;
    }
  }

  function resetBulkRefreshUi(total) {
    document.getElementById(
      'bulkTotalCount'
    ).textContent = String(total);

    document.getElementById(
      'bulkProcessedCount'
    ).textContent = '0';

    document.getElementById(
      'bulkUpdatedCount'
    ).textContent = '0';

    document.getElementById(
      'bulkUnchangedCount'
    ).textContent = '0';

    document.getElementById(
      'bulkFailedCount'
    ).textContent = '0';

    document.getElementById(
      'bulkProgressText'
    ).textContent = '갱신 준비 중';

    document.getElementById(
      'bulkProgressPercent'
    ).textContent = '0%';

    document.getElementById(
      'bulkProgressBar'
    ).style.width = '0%';

    document.getElementById(
      'bulkCurrentPatent'
    ).textContent =
      'KIPRIS 일괄갱신을 시작합니다.';

    document.getElementById(
      'bulkResultList'
    ).innerHTML = '';

    setBulkCloseDisabled(true);
  }

  function updateBulkSummary(
    processed,
    updated,
    unchanged,
    failed,
    total
  ) {
    const percent = total
      ? Math.round(
        (processed / total) * 100
      )
      : 0;

    document.getElementById(
      'bulkProcessedCount'
    ).textContent = String(processed);

    document.getElementById(
      'bulkUpdatedCount'
    ).textContent = String(updated);

    document.getElementById(
      'bulkUnchangedCount'
    ).textContent = String(unchanged);

    document.getElementById(
      'bulkFailedCount'
    ).textContent = String(failed);

    document.getElementById(
      'bulkProgressText'
    ).textContent = (
      processed < total
        ? `${processed} / ${total} 처리`
        : '갱신 완료'
    );

    document.getElementById(
      'bulkProgressPercent'
    ).textContent = `${percent}%`;

    document.getElementById(
      'bulkProgressBar'
    ).style.width = `${percent}%`;
  }

  function addBulkResult(
    patent,
    status,
    message
  ) {
    const statusLabels = {
      success: '갱신',
      unchanged: '변경없음',
      failed: '실패'
    };

    const item = document.createElement(
      'div'
    );

    item.className =
      'bulk-result-item';

    item.innerHTML = `
      <div class="bulk-result-status ${status}">
        ${statusLabels[status] || status}
      </div>
      <div class="bulk-result-main">
        <div class="bulk-result-title">
          ${P.escapeHtml(
            patent.invention_title ||
            patent.application_no ||
            patent.registration_no ||
            '특허'
          )}
        </div>
        <div class="bulk-result-sub">
          ${P.escapeHtml(
            patent.application_no ||
            patent.registration_no ||
            '-'
          )}
          ·
          ${P.escapeHtml(message || '')}
        </div>
      </div>
    `;

    document
      .getElementById('bulkResultList')
      .appendChild(item);
  }

  function setBulkCloseDisabled(disabled) {
    document.getElementById(
      'bulkRefreshCloseBtn'
    ).disabled = disabled;

    document.getElementById(
      'bulkRefreshTopCloseBtn'
    ).disabled = disabled;
  }

  function closeBulkRefreshModal() {
    if (bulkRefreshRunning) {
      return;
    }

    P.modalClose(
      'bulkRefreshModal'
    );
  }

  async function bulkRefreshKipris() {
    if (
      !ctx.access.write ||
      bulkRefreshRunning
    ) {
      return;
    }

    const targets = patents.filter(
      (patent) => (
        patent.application_no ||
        patent.registration_no
      )
    );

    if (!targets.length) {
      P.toast(
        '갱신할 출원번호 또는 등록번호가 없습니다.',
        'warn'
      );
      return;
    }

    const confirmed = confirm(
      `등록된 특허 ${targets.length}건의 ` +
      'KIPRIS 공식정보를 일괄 갱신할까요?\n\n' +
      '사내 관리정보와 납부/기한/첨부정보는 변경하지 않습니다.'
    );

    if (!confirmed) {
      return;
    }

    bulkRefreshRunning = true;

    const toolbarButton = document.getElementById(
      'bulkKiprisRefreshBtn'
    );
    toolbarButton.disabled = true;

    resetBulkRefreshUi(
      targets.length
    );

    P.modalOpen(
      'bulkRefreshModal'
    );

    let processed = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    try {
      for (const patent of targets) {
        const number =
          patent.application_no ||
          patent.registration_no;

        document.getElementById(
          'bulkCurrentPatent'
        ).textContent = (
          `${processed + 1}/${targets.length} ` +
          `${patent.invention_title || number} 조회 중`
        );

        try {
          const data = await P.invokeKipris({
            action: 'lookup',
            number,
            company_id:
              ctx.session.companyId
          });

          const result =
            await updatePatentFromKipris(
              patent,
              data
            );

          if (result.changedFields.length) {
            updated += 1;

            const beforeStatus =
              normalizeStatus(
                patent.legal_status
              );

            const afterStatus =
              normalizeStatus(
                result.update.legal_status ||
                patent.legal_status
              );

            const statusMessage =
              beforeStatus &&
              afterStatus &&
              beforeStatus !== afterStatus
                ? (
                  `${beforeStatus} → ${afterStatus}, ` +
                  `${result.changedFields.length}개 항목 변경`
                )
                : (
                  `${result.changedFields.length}개 항목 변경`
                );

            addBulkResult(
              patent,
              'success',
              statusMessage
            );
          } else {
            unchanged += 1;

            addBulkResult(
              patent,
              'unchanged',
              '공식정보 변경 없음'
            );
          }
        } catch (error) {
          failed += 1;

          addBulkResult(
            patent,
            'failed',
            error.message ||
            'KIPRIS 조회 실패'
          );
        }

        processed += 1;

        updateBulkSummary(
          processed,
          updated,
          unchanged,
          failed,
          targets.length
        );
      }

      document.getElementById(
        'bulkCurrentPatent'
      ).textContent = (
        `완료: 갱신 ${updated}건 · ` +
        `변경없음 ${unchanged}건 · ` +
        `실패 ${failed}건`
      );

      await loadList();

      if (failed) {
        P.toast(
          `KIPRIS 일괄갱신 완료: ` +
          `성공 ${updated + unchanged}건, ` +
          `실패 ${failed}건`,
          'warn',
          4500
        );
      } else {
        P.toast(
          `KIPRIS 일괄갱신 완료: ` +
          `${targets.length}건 처리`
        );
      }
    } finally {
      bulkRefreshRunning = false;

      toolbarButton.disabled =
        !ctx.access.write;

      setBulkCloseDisabled(false);
    }
  }

  init().catch((error) => {
    console.error(error);

    document.querySelector(
      '.pat-app'
    ).innerHTML = (
      '<div class="pat-error">' +
      P.escapeHtml(
        error.message
      ) +
      '</div>'
    );
  });
})();
