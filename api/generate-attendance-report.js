const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function normalizeReportMode(payload = {}) {
  const mode = String(payload.mode || payload.reportMode || '').trim().toLowerCase();

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

function safeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function extractJsonText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const withoutFence = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return withoutFence.slice(start, end + 1);
  }

  return withoutFence;
}

function normalizeStory(raw = {}) {
  const story = raw && typeof raw === 'object' ? raw : {};
  const sections = story.sections && typeof story.sections === 'object' ? story.sections : {};

  const normalized = {
    meta: {
      reportType: safeText(story?.meta?.reportType || story.reportType, 'attendance'),
      reportMonth: safeText(story?.meta?.reportMonth || story.reportMonth || ''),
      tone: safeText(story?.meta?.tone, 'management_report'),
    },
    intro: safeText(story.intro || sections.intro),
    status: safeText(story.status || sections.status),
    judge: safeText(story.judge || sections.judge),
    reason: safeText(story.reason || sections.reason),
    trendStory: safeText(story.trendStory || sections.trendStory || story.trend),
    causeStory: safeText(story.causeStory || sections.causeStory || story.cause),
    monitoring: safeText(story.monitoring || sections.monitoring),
    conclusion: safeText(story.conclusion || sections.conclusion),
    cautions: Array.isArray(story.cautions) ? story.cautions.map(v => safeText(v)).filter(Boolean) : [],
  };

  if (!normalized.conclusion) {
    normalized.conclusion = '현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.';
  }

  if (!normalized.conclusion.endsWith('현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.')) {
    normalized.conclusion = `${normalized.conclusion.replace(/\s+$/g, '')}\n현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다.`;
  }

  return normalized;
}

function parseStoryJson(text = '') {
  const jsonText = extractJsonText(text);
  if (!jsonText) throw new Error('AI 응답이 비어 있습니다.');

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`AI JSON 파싱 실패: ${error.message}`);
  }

  return normalizeStory(parsed);
}

function parseSavedStory(value) {
  if (!value) return null;
  try {
    return normalizeStory(JSON.parse(String(value)));
  } catch (_) {
    return null;
  }
}

function buildStoryPrompt(payload) {
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

  const commonRules = `
반드시 JSON만 출력하세요. HTML, markdown 코드블록, 설명문, 주석은 절대 출력하지 마세요.
새로운 수치, 이름, 조직, 월, 원인을 임의로 생성하지 마세요.
데이터가 부족한 항목은 "추가 확인 필요" 또는 "추후 확인 필요"로 표현하세요.
단정 표현을 피하고 "가능성", "검토 필요", "확인 필요" 중심으로 작성하세요.
문장은 관리자가 읽는 월간 보고서 톤으로 작성하세요.
각 항목은 1~3문장으로 작성하고, 너무 길게 쓰지 마세요.
마지막 conclusion은 반드시 다음 문장으로 끝내세요: "현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다."
출근미입력/퇴근미입력 중심의 출퇴근 누락 분석은 포함하지 마세요.
`;

  if (isHiring) {
    return `당신은 연구소 근태/인력운영 데이터를 해석해 충원 검토 보고서의 스토리 문장을 작성하는 분석가입니다.

${commonRules}

[입력 데이터]
${JSON.stringify(dataForPrompt, null, 2)}

다음 JSON 구조로만 응답하세요.
{
  "meta": {
    "reportType": "hiring",
    "reportMonth": "입력 데이터 기준 월 또는 빈 문자열",
    "tone": "management_report"
  },
  "intro": "이 보고서의 분석 기준과 검토 목적",
  "status": "현재 충원 요청 및 공백 상황 요약",
  "judge": "충원 필요성에 대한 핵심 판단. 단정 금지",
  "reason": "판단 근거. 제공 데이터 기반",
  "trendStory": "근태/업무 흐름 관련 보조 해석. 데이터 없으면 추가 확인 필요",
  "causeStory": "공백 또는 운영 리스크의 가능 원인",
  "monitoring": "단기 확인 및 관리 방향",
  "conclusion": "최종 검토 의견. 마지막 문장은 고정 문장으로 끝낼 것",
  "cautions": ["데이터 해석 시 주의사항 1", "데이터 해석 시 주의사항 2"]
}`;
  }

  return `당신은 연구소 근태 데이터를 해석해 월간 근태 보고서의 스토리 문장을 작성하는 분석가입니다.

${commonRules}

[입력 데이터]
${JSON.stringify(dataForPrompt, null, 2)}

[작성 방향]
- 디자인/레이아웃/HTML은 프론트 고정 템플릿이 담당합니다.
- 당신은 보고서 박스에 들어갈 "스토리 문장"만 작성합니다.
- 데이터 나열이 아니라 "현재 상태 → 핵심 판단 → 근거 → 추후 확인"의 흐름으로 작성합니다.
- riskUsers에 있는 담당자만 언급할 수 있습니다.
- monthlySummary, monthlyKpi, riskUsers, trend를 우선 사용합니다.
- 데이터가 1개월뿐이면 장기 추세를 단정하지 말고 기준점 또는 추후 누적 확인으로 표현합니다.

다음 JSON 구조로만 응답하세요.
{
  "meta": {
    "reportType": "attendance",
    "reportMonth": "입력 데이터 기준 월 또는 빈 문자열",
    "tone": "management_report"
  },
  "intro": "분석 기준, 보고 구성, 주요 관점, 판단 방식을 연결하는 도입 문장",
  "status": "해당월 현재 상태 요약",
  "judge": "이번 보고서의 핵심 판단 한 단락",
  "reason": "핵심 판단의 데이터 근거 설명",
  "trendStory": "트렌드 또는 누적 관찰 관점의 해석",
  "causeStory": "가능 원인과 해석. 단정 금지",
  "monitoring": "다음 월 또는 단기 관리 방향",
  "conclusion": "종합 의견. 마지막 문장은 고정 문장으로 끝낼 것",
  "cautions": ["데이터 해석 시 주의사항 1", "데이터 해석 시 주의사항 2"]
}`;
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
      input: buildStoryPrompt(payload),
      temperature: 0.2,
      max_output_tokens: 2600,
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

  return parseStoryJson(text);
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

      const savedStory = parseSavedStory(existing.report_html);

      return json(res, 200, {
        ok: true,
        fromCache: true,
        sameData: existing.data_hash === dataHash,
        reportStory: savedStory,
        reportHtml: savedStory ? '' : existing.report_html,
        legacyReportHtml: savedStory ? null : existing.report_html,
        reportId: existing.id,
        createdAt: existing.created_at,
        generatedAt: existing.generated_at,
        savedDataHash: existing.data_hash,
        currentDataHash: dataHash,
      });
    }

    const reportStory = await callOpenAI({
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
      // 기존 DB 컬럼(report_html)을 유지하기 위해 JSON 문자열로 저장합니다.
      // 프론트에서는 응답의 reportStory를 우선 사용하세요.
      report_html: JSON.stringify(reportStory),
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
      reportStory,
      reportHtml: '',
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
