const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function stripUnsafeHtml(html = '') {
  return String(html || '')
    .replace(/```html/gi, '')
    .replace(/```/g, '')
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(/<html[\s\S]*?>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[\s\S]*?>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[\s\S]*?>/gi, '')
    .replace(/<\/body>/gi, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .trim();
}

function normalizeReportMode(payload = {}) {
  const mode = String(payload.mode || payload.reportMode || '').trim().toLowerCase();

  // 프론트 버튼 분리용
  // - 기존 보고서 불러오기: mode/loadExisting/load/cache 또는 forceRegenerate:false
  // - 보고서 다시 생성: mode/regenerate 또는 forceRegenerate:true 또는 기본값
  if (
    mode === 'load' ||
    mode === 'loadexisting' ||
    mode === 'cache' ||
    mode === 'saved' ||
    payload.loadExisting === true ||
    payload.forceRegenerate === false
  ) {
    return 'load';
  }

  return 'regenerate';
}

function makeDataHash(payload = {}) {
  // 프론트에서 dataHash를 보내는 구조를 우선 사용합니다.
  // 혹시 누락되면 서버에서도 동일 데이터 기준으로 캐시 키를 만들 수 있게 보조 생성합니다.
  const existing = String(payload.dataHash || '').trim();
  if (existing) return existing;

  const base = JSON.stringify({
    reportType: payload.reportType || null,
    reportTitle: payload.reportTitle || null,
    reportInfo: payload.reportInfo || null,
    monthlySummary: payload.monthlySummary || null,
    monthlyKpi: payload.monthlyKpi || null,
    riskUsers: payload.riskUsers || [],
    trend: payload.trend || null,
    visualDecisionHints: payload.visualDecisionHints || null,
    constraints: payload.constraints || null,
    data: payload.data || null,
    hiringInput: payload.hiringInput || null,
  });

  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `server-${Math.abs(hash)}`;
}

function buildPrompt(payload) {
  const reportType = String(payload.reportType || '').trim();
  const isHiring = reportType === 'hiring';

  const dataForPrompt = {
    reportType: payload.reportType || null,
    reportTitle: payload.reportTitle || null,
    reportInfo: payload.reportInfo || null,
    monthlySummary: payload.monthlySummary || null,
    monthlyKpi: payload.monthlyKpi || null,
    riskUsers: payload.riskUsers || [],
    trend: payload.trend || null,
    visualDecisionHints: payload.visualDecisionHints || null,
    constraints: payload.constraints || null,
    data: payload.data || null,
    hiringInput: payload.hiringInput || null,
  };

  if (isHiring) {
    return `당신은 연구소 근태/인력운영 데이터를 해석해 충원 검토 보고서를 작성하는 분석가입니다.

입력 데이터는 이미 시스템에서 계산되었거나 사용자가 입력한 결과입니다.
새로운 수치, 이름, 조직, 해석을 임의로 생성하지 말고 제공된 데이터만 사용하세요.

========================
[입력 데이터]
${JSON.stringify(dataForPrompt, null, 2)}
========================

보고서는 A4 세로 출력용 HTML “본문 조각”으로 작성하세요.

--------------------------------
[충원 보고서 구조]
--------------------------------

각 부는 반드시 독립된 section 또는 div로 구분하여 작성하세요.

1부. 충원 요청 개요
- hiringInput과 reportInfo를 기반으로 작성
- 충원 사유, 요청 인원, 필요 시점, 영향도를 card 구조로 정리
- 단정하지 말고 “검토 필요”, “확인 필요” 수준으로 표현

2부. 공백 및 운영 리스크
- 퇴사/퇴사 예정 정보가 있으면 해당 정보를 기반으로 작성
- 근태 리스크 또는 업무 집중 관련 데이터가 있으면 근거로 사용
- 데이터가 없으면 “추가 확인 필요” 수준으로 간단히 표현

3부. 업무 재배분 가능성
- 현재 데이터로 확인 가능한 범위에서만 작성
- 대체 가능성, 업무 분산 가능성, 조직 영향 가능성을 구분
- 새로운 담당자명이나 조직명은 만들지 마세요.

4부. 충원 검토 의견 및 결론
- 충원 필요성을 단정하지 말고 검토 의견으로 작성
- 마지막 문장은 반드시 다음 흐름으로 마무리하세요.
→ “현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.”

--------------------------------
[출력 규칙]

- <!doctype>, html, head, body 태그 금지
- script 태그 절대 금지
- 기존 CSS class 구조 유지
- 데이터에 없는 값 생성 금지
- HTML은 반드시 닫힌 태그 구조로 작성하고 렌더링 오류가 없도록 할 것

작성부서: 연구지원팀
작성자: 김남호 차장`;
  }

  return `당신은 연구소 근태 데이터를 해석해 월간 근태 보고서를 작성하는 분석가입니다.

입력 데이터는 이미 시스템에서 계산된 결과입니다.
새로운 수치, 이름, 조직, 해석을 임의로 생성하지 말고 제공된 데이터만 사용하세요.

========================
[입력 데이터]
${JSON.stringify(dataForPrompt, null, 2)}
========================

보고서는 A4 세로 출력/PDF용 HTML “본문 조각”으로 작성하세요.
전체 html/head/body 태그는 절대 작성하지 말고, 아래 템플릿 스타일에 맞는 본문만 작성하세요.

==================================================
[가장 중요한 출력 원칙]
==================================================

이번 보고서는 단순 텍스트 요약이 아니라 “시각화된 A4 보고서”입니다.

반드시 다음 요소를 포함하세요.
- section.page 구조
- pageHeader 구조
- coverBand 또는 partBadge
- cards / card 구조의 KPI 카드
- storyBox 구조의 해석 문단
- evidenceBox + barRow 구조의 근거 시각화
- chartBox 구조의 트렌드 시각화
- table 구조의 담당자 리스크
- conclusion 구조의 결론 박스

텍스트만 나열하는 보고서는 금지합니다.
KPI를 단순 문장이나 세로 목록으로만 쓰지 마세요.
표만 단독으로 쓰지 말고, 카드/그래프/해석 박스를 함께 배치하세요.

==================================================
[반드시 사용할 CSS class 구조]
==================================================

아래 class 이름을 사용해서 HTML을 작성하세요.
새로운 class는 꼭 필요한 경우에만 최소한으로 사용하세요.

페이지:
- section.page
- header.pageHeader
- div.docLabel
- div.docTitle
- div.docMeta
- footer.pageFooter

상단 강조:
- div.coverBand
- div.partBadge
- div.partBadge.blue
- div.partBadge.amber
- p.sectionLead

카드:
- div.cards
- div.card
- div.card.red
- div.card.amber
- div.card.green
- div.card.blue
- div.card .k
- div.card .v
- div.card .s

해석/근거:
- div.storyBox
- div.storyBox.blue
- div.storyBox.amber
- div.twoCol
- div.evidenceBox
- div.evidenceTitle

막대 근거:
- div.barRow
- div.barLabel
- div.barBg
- div.bar
- div.bar.red
- div.bar.amber
- div.bar.blue
- div.barVal

트렌드:
- div.chartBox
- div.chartTitle
- div.chartMock
- div.monthBar
- div.monthBar.active
- div.num
- div.col
- div.m
- div.miniGrid
- div.miniNote

표/상태:
- table
- span.pill
- span.pill.red
- span.pill.amber
- span.pill.green
- span.pill.gray

결론:
- div.conclusion

==================================================
[보고서 전체 구조]
==================================================

반드시 3개 section.page로 작성하세요.

--------------------------------
1페이지. 해당월 현황
--------------------------------

필수 포함:
1) pageHeader
   - docLabel: Attendance Report
   - docTitle: "{분석월} 근태 현황 및 트렌드 분석 보고서"
   - docMeta: 작성일자, 보고대상, 작성부서, 작성자

2) coverBand
   - "1부 · 해당월 현황"
   - 해당월 요약 제목
   - 이번 보고서가 무엇을 보는지 짧게 설명

3) cards 4개
   - 전체 인원
   - 위험 인원
   - 주의 인원
   - 정상 인원 또는 월간 판단
   monthlySummary 데이터를 사용하세요.

4) storyBox
   - 해당월 상태를 스토리텔링 방식으로 해석
   - 단정하지 말고 “확인 필요”, “검토 필요”, “가능성” 중심

5) twoCol
   - 왼쪽 evidenceBox: monthlyKpi 기반 막대형 리스크 근거
   - 오른쪽 evidenceBox: 담당자 리스크 요약 또는 상태 요약 표

monthlyKpi 막대형 근거에는 출근미입력/퇴근미입력은 절대 포함하지 마세요.
사용 가능 KPI 예:
- overtimeCount
- holidayWorkCount
- averageOvertimeHours
- riskEmployeeCount
- operationalRiskScore

출근미입력/퇴근미입력 등 출퇴근 누락 분석용 데이터는 보고서 본문에서 제외하세요.

--------------------------------
2페이지. 트렌드 분석
--------------------------------

필수 포함:
1) pageHeader
2) partBadge.blue
3) cards 4개
   - 기준월 위험 인원
   - 주요 리스크
   - 기간 기준
   - 현재 데이터 월 또는 추세 판단

4) chartBox
   - trend 데이터를 기반으로 월별 흐름을 chartMock 구조로 표현
   - 데이터가 1개월뿐이면 장기 추세를 단정하지 말고 기준점으로 설명
   - 데이터가 부족하더라도 chartBox는 포함하되, “기준점” 또는 “누적 예정” 형태로 표현

5) miniGrid
   - 현재 판단
   - 다음 확인
   - 관리 포인트

6) 담당자 리스크 흐름 table
   - riskUsers 데이터를 사용
   - 위험 인원은 반드시 포함
   - 주의 인원은 입력 데이터에 포함된 인원 중심
   - 정상 인원 전체 목록은 쓰지 마세요.

--------------------------------
3페이지. 원인 가능성 및 종합 의견
--------------------------------

필수 포함:
1) pageHeader
2) partBadge.amber
3) sectionLead
   - 단정하지 않고 원인 가능성 중심

4) twoCol evidenceBox
   - 가능 원인 1: 업무 집중
   - 가능 원인 2: 근무 시간 편중 또는 휴식 부족
   단, 데이터에 없는 이름/수치는 만들지 마세요.

5) 모니터링 및 검토 방향 twoCol
   - 단기 관리 방향
   - 다음 월 확인 방향

6) conclusion
   - 마지막 문장은 반드시 다음 문장으로 끝내세요.
   “현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.”

==================================================
[데이터 해석 규칙]
==================================================

- monthlySummary, monthlyKpi, riskUsers, trend 데이터를 우선 사용하세요.
- payload.data 안에 같은 정보가 있으면 보조로 사용하세요.
- 실제 데이터에 없는 수치, 이름, 조직, 월은 만들지 마세요.
- riskUsers에 없는 담당자 이름은 만들지 마세요.
- 데이터가 없는 항목은 “데이터 확인 필요” 수준으로 표현하거나 생략하세요.
- 출근미입력/퇴근미입력 중심의 출퇴근 누락 분석은 포함하지 마세요.
- 단정적 표현 금지:
  “문제입니다”, “위험합니다”, “충원이 필요합니다”처럼 확정하지 마세요.
- 권장 표현:
  “확인 필요”, “검토 필요”, “가능성이 있습니다”, “추후 확인이 필요합니다.”

==================================================
[시각화 생성 세부 규칙]
==================================================

카드:
- 핵심 수치 3~4개는 반드시 cards/card로 표현합니다.
- 숫자는 card .v에 넣고, 의미는 card .s에 넣습니다.

막대:
- KPI 비교는 barRow 구조를 사용합니다.
- 가장 큰 값을 100%로 두고 나머지는 상대 비율로 width를 설정하세요.
- width는 5% 이상 100% 이하로 지정하세요.
- 출근미입력/퇴근미입력은 제외하세요.

트렌드:
- trend.months가 있으면 각 월을 monthBar로 만듭니다.
- 현재 분석월은 monthBar active로 표시합니다.
- 데이터가 없거나 부족한 월은 "예정" 또는 "-"로 표시합니다.
- 1개월 데이터만 있으면 “기준점”이라고 설명하세요.

담당자:
- riskUsers 배열을 기반으로 표를 작성합니다.
- status가 위험이면 pill.red, 주의면 pill.amber를 사용하세요.
- issues와 trend를 근거로 “확인 필요사항”을 작성하세요.

==================================================
[출력 금지]
==================================================

- <!doctype>, html, head, body 태그 금지
- script 태그 절대 금지
- markdown 코드블록 금지
- 설명문 없이 HTML만 출력
- 원본 데이터 JSON을 그대로 출력 금지
- 출근미입력/퇴근미입력 항목 출력 금지

==================================================
[고정 정보]
==================================================

작성부서: 연구지원팀
작성자: 김남호 차장`;
}

async function callOpenAI(payload) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 환경변수가 없습니다.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: buildPrompt(payload),
      temperature: 0.25,
      max_output_tokens: 7000,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI API 오류: ${response.status}`);
  }

  const text =
    data.output_text ||
    (Array.isArray(data.output)
      ? data.output
          .flatMap(item => item.content || [])
          .map(c => c.text || '')
          .join('\n')
      : '');

  const clean = stripUnsafeHtml(text);

  if (!clean) {
    throw new Error('OpenAI 응답이 비어 있습니다.');
  }

  return clean;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, {
      ok: false,
      error: 'POST만 지원합니다.',
    });
  }

  try {
    if (!SUPABASE_URL) {
      throw new Error('SUPABASE_URL 환경변수가 없습니다.');
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
    }

    const payload = req.body || {};
    const reportKey = String(payload.reportKey || '').trim();
    const reportType = String(payload.reportType || '').trim();
    const dataHash = makeDataHash(payload);
    const reportMode = normalizeReportMode(payload);

    if (!reportKey || !reportType) {
      return json(res, 400, {
        ok: false,
        error: 'reportKey, reportType이 필요합니다.',
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
      },
    });

    // [기존 보고서 불러오기]
    // 저장된 report_key 기준 최신 보고서를 불러옵니다.
    // dataHash까지 일치하면 sameData:true, 데이터가 바뀐 상태의 과거 보고서면 sameData:false로 알려줍니다.
    if (reportMode === 'load') {
      const { data: existing, error: readError } = await supabase
        .from('attendance_ai_reports')
        .select('*')
        .eq('report_key', reportKey)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (readError) {
        throw readError;
      }

      if (!existing?.report_html) {
        return json(res, 404, {
          ok: false,
          fromCache: false,
          error: '저장된 기존 보고서가 없습니다. 보고서 다시 생성을 먼저 실행하세요.',
        });
      }

      return json(res, 200, {
        ok: true,
        fromCache: true,
        sameData: existing.data_hash === dataHash,
        reportHtml: existing.report_html,
        reportId: existing.id,
        createdAt: existing.created_at,
        generatedAt: existing.generated_at,
        savedDataHash: existing.data_hash,
        currentDataHash: dataHash,
      });
    }

    // [보고서 다시 생성]
    // 항상 OpenAI를 호출해서 현재 프롬프트/현재 데이터 기준으로 새 보고서를 생성하고,
    // report_key 기준으로 기존 보고서를 덮어씁니다.
    const reportHtml = await callOpenAI({
      ...payload,
      dataHash,
    });

    const row = {
      report_key: reportKey,
      report_type: reportType,
      report_title: payload.reportTitle || null,
      scope_label: payload?.reportInfo?.scope || payload?.data?.scope || null,
      period_label: payload?.reportInfo?.month || payload?.data?.period || null,
      period_mode: payload?.data?.periodMode || null,
      data_hash: dataHash,
      payload: {
        ...payload,
        dataHash,
        reportMode: 'regenerate',
      },
      report_html: reportHtml,
      model: OPENAI_MODEL,
      generated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await supabase
      .from('attendance_ai_reports')
      .upsert(row, {
        onConflict: 'report_key',
      })
      .select('id, created_at, generated_at')
      .single();

    if (saveError) {
      throw saveError;
    }

    return json(res, 200, {
      ok: true,
      fromCache: false,
      sameData: true,
      reportHtml,
      reportId: saved?.id || null,
      createdAt: saved?.created_at || null,
      generatedAt: saved?.generated_at || null,
      dataHash,
    });
  } catch (error) {
    console.error('[generate-attendance-report]', error);

    return json(res, 500, {
      ok: false,
      error: error?.message || String(error),
    });
  }
};
