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
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
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
- 충원 사유, 요청 인원, 필요 시점, 영향도를 카드 형태로 정리
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
[시각화 선택 규칙]

- 핵심 수치 → 카드
- 사유/영향도 비교 → 카드 또는 표
- 담당자/조직 비교 → 표 또는 가로 막대
- 데이터가 부족하면 그래프를 만들지 말고 카드 + 설명으로 대체

--------------------------------
[출력 규칙]

- <!doctype>, html, head, body 태그 금지
- script 태그 절대 금지
- 기존 CSS class 구조 유지 (임의 class 생성 최소화)
- 데이터에 없는 값 생성 금지
- HTML은 반드시 닫힌 태그 구조로 작성하고 렌더링 오류가 없도록 할 것

--------------------------------
[데이터 누락 처리 규칙]

- 입력 데이터에 특정 항목이 없을 경우 해당 내용은 생략하거나 “데이터 확인 필요” 수준으로 간단히 표현하세요.

--------------------------------
[고정 정보]

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

보고서는 A4 세로 출력용 HTML “본문 조각”으로 작성하세요.

--------------------------------
[보고서 구조]
--------------------------------

각 부(1~4부)는 반드시 독립된 section(div)으로 구분하여 작성하세요.

1부. 해당월 현황

- monthlySummary와 monthlyKpi 데이터를 기반으로 작성
- 전체 인원, 위험/주의/정상 인원 분포를 카드 형태로 표현
- 핵심 KPI는 카드 또는 막대형 근거로 표현
- 출근미입력/퇴근미입력 등 출퇴근 누락 분석용 데이터는 보고서 본문에서 제외
- 문장은 단정하지 말고 “확인 필요”, “검토 필요” 수준으로 작성

--------------------------------

2부. 트렌드 분석

- trend 데이터를 기반으로 월별 변화 설명
- 데이터가 1개월이면 → 장기 추세를 단정하지 말고 기준점 설명만 수행
- 2~3개월이면 → 초기 변화 흐름 설명
- 3개월 이상이면 → 증가 / 감소 / 유지 흐름 설명
- 월별 변화가 명확하지 않으면 그래프를 억지로 만들지 말고 기준점 카드와 설명으로 대체

--------------------------------

3부. 담당자 리스크

- riskUsers 데이터를 기반으로 작성
- 위험 인원은 반드시 포함
- 주의 인원은 입력 데이터에 포함된 핵심 인원 중심으로 설명
- 표 또는 가로 막대 형태로 표현
- 각 인원의 issues와 trend를 근거로 설명
- 정상 인원 전체 목록은 작성하지 않음

--------------------------------

4부. 원인 가능성 및 종합 의견

- 데이터 기반으로만 가능성 제시
- 다음 관점에서 분석:
  · 업무 집중 여부
  · 근무 시간 편중
  · 특정 인원 리스크 집중
  · 운영 기준 편차 가능성

- 절대 단정하지 말고 가능성 중심으로 작성

- 마지막 문장은 반드시 다음 형식으로 마무리:
→ “현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.”

--------------------------------
[시각화 선택 규칙]

- 핵심 수치 → 카드
- 월별 변화 → 막대 또는 선 그래프
- 구성비 → 도넛 또는 비율 카드
- 담당자 비교 → 표 또는 가로 막대

- 데이터가 부족하면:
→ 그래프를 만들지 말고 카드 + 설명으로 대체

--------------------------------
[출력 규칙]

- <!doctype>, html, head, body 태그 금지
- script 태그 절대 금지
- 기존 CSS class 구조 유지 (임의 class 생성 최소화)
- 데이터에 없는 값 생성 금지
- HTML은 반드시 닫힌 태그 구조로 작성하고 렌더링 오류가 없도록 할 것
- 출근미입력/퇴근미입력 중심의 출퇴근 누락 분석은 포함하지 말 것

--------------------------------
[데이터 누락 처리 규칙]

- 입력 데이터에 특정 항목이 없을 경우:
  → 해당 내용은 생략하거나
  → “데이터 확인 필요” 수준으로 간단히 표현

--------------------------------
[고정 정보]

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
      max_output_tokens: 4500,
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

  if (!text.trim()) {
    throw new Error('OpenAI 응답이 비어 있습니다.');
  }

  return stripUnsafeHtml(text.trim());
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
    const dataHash = String(payload.dataHash || '').trim();
    const reportType = String(payload.reportType || '').trim();
    const forceRegenerate = !!payload.forceRegenerate;

    if (!reportKey || !dataHash || !reportType) {
      return json(res, 400, {
        ok: false,
        error: 'reportKey, dataHash, reportType이 필요합니다.',
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
      },
    });

    if (!forceRegenerate) {
      const { data: existing, error: readError } = await supabase
        .from('attendance_ai_reports')
        .select('*')
        .eq('report_key', reportKey)
        .eq('data_hash', dataHash)
        .maybeSingle();

      if (readError) {
        throw readError;
      }

      if (existing?.report_html) {
        return json(res, 200, {
          ok: true,
          fromCache: true,
          reportHtml: existing.report_html,
          reportId: existing.id,
          createdAt: existing.created_at,
          generatedAt: existing.generated_at,
        });
      }
    }

    const reportHtml = await callOpenAI(payload);

    const row = {
      report_key: reportKey,
      report_type: reportType,
      report_title: payload.reportTitle || null,
      scope_label: payload?.reportInfo?.scope || payload?.data?.scope || null,
      period_label: payload?.reportInfo?.month || payload?.data?.period || null,
      period_mode: payload?.data?.periodMode || null,
      data_hash: dataHash,
      payload,
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
      reportHtml,
      reportId: saved?.id || null,
      createdAt: saved?.created_at || null,
      generatedAt: saved?.generated_at || null,
    });
  } catch (error) {
    console.error('[generate-attendance-report]', error);

    return json(res, 500, {
      ok: false,
      error: error?.message || String(error),
    });
  }
};
