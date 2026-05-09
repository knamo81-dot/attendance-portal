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


function normalizeAdditionalUserData(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item, index) => {
        if (item && typeof item === 'object') {
          return {
            id: item.id || item.key || `item_${index + 1}`,
            title: safeText(item.title || item.label || item.name || `추가 확인 자료 ${index + 1}`),
            value: item.value ?? item.content ?? item.text ?? item.memo ?? '',
            status: safeText(item.status || item.confirmStatus || item.checkedStatus || ''),
            confirmed: item.confirmed === true || item.checked === true || item.status === 'confirmed',
            note: safeText(item.note || item.memo || item.comment || ''),
          };
        }
        return {
          id: `item_${index + 1}`,
          title: `추가 확인 자료 ${index + 1}`,
          value: item,
          status: '',
          confirmed: true,
          note: '',
        };
      })
      .filter(item => item.title || item.value || item.note || item.status);

    return items.length ? items : null;
  }

  if (value && typeof value === 'object') {
    const normalized = {};
    Object.entries(value).forEach(([key, item]) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        normalized[key] = {
          title: safeText(item.title || item.label || item.name || key),
          value: item.value ?? item.content ?? item.text ?? item.memo ?? '',
          status: safeText(item.status || item.confirmStatus || item.checkedStatus || ''),
          confirmed: item.confirmed === true || item.checked === true || item.status === 'confirmed',
          note: safeText(item.note || item.memo || item.comment || ''),
        };
      } else {
        normalized[key] = item;
      }
    });

    return Object.keys(normalized).length ? normalized : null;
  }

  return String(value).trim() ? String(value).trim() : null;
}

function makeDataHash(payload = {}) {
  const existing = String(payload.dataHash || '').trim();
  if (existing) return existing;

  const analysisLevel = normalizeAnalysisLevel(payload);
  const analysisModeGuide = buildAnalysisModeGuide(payload);

  const base = JSON.stringify({
    reportType: payload.reportType || null,
    reportTitle: payload.reportTitle || null,
    reportInfo: payload.reportInfo || null,
    monthlySummary: payload.monthlySummary || null,
    monthlyKpi: payload.monthlyKpi || null,
    riskUsers: payload.riskUsers || [],
    teamSummary: payload.teamSummary || [],
    analysisLevel,
    analysisGuide: payload.analysisGuide || null,
    analysisModeGuide,
    trend: payload.trend || null,
    visualDecisionHints: payload.visualDecisionHints || null,
    constraints: payload.constraints || null,
    data: payload.data || null,
    hiringInput: payload.hiringInput || null,
    additionalDataNeeded: payload.additionalDataNeeded || null,
    additionalUserData: normalizeAdditionalUserData(payload.additionalUserData),
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
    issueTitle: safeText(story.issueTitle || sections.issueTitle),
    issueDescription: safeText(story.issueDescription || sections.issueDescription || story.riskFlowStory || sections.riskFlowStory),
    causeIntro: safeText(story.causeIntro || sections.causeIntro || story.causeLead || sections.causeLead),
    cause1Title: safeText(story.cause1Title || sections.cause1Title),
    cause1Text: safeText(story.cause1Text || sections.cause1Text),
    cause2Title: safeText(story.cause2Title || sections.cause2Title),
    cause2Text: safeText(story.cause2Text || sections.cause2Text),
    shortTermTitle: safeText(story.shortTermTitle || sections.shortTermTitle),
    shortTermText: safeText(story.shortTermText || sections.shortTermText),
    nextMonthTitle: safeText(story.nextMonthTitle || sections.nextMonthTitle),
    nextMonthText: safeText(story.nextMonthText || sections.nextMonthText),
    summaryOpinion: safeText(story.summaryOpinion || sections.summaryOpinion || story.overallOpinion || sections.overallOpinion),
    bottomNote: safeText(story.bottomNote || sections.bottomNote),
    monitoring: safeText(story.monitoring || sections.monitoring),
    conclusion: safeText(story.conclusion || sections.conclusion),
    cautions: Array.isArray(story.cautions) ? story.cautions.map(v => safeText(v)).filter(Boolean) : [],
    additionalDataNeeded: Array.isArray(story.additionalDataNeeded)
      ? story.additionalDataNeeded.map(v => safeText(v)).filter(Boolean)
      : [],
    additionalDataUsageSummary: safeText(story.additionalDataUsageSummary || sections.additionalDataUsageSummary),
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


function normalizeAnalysisLevel(payload = {}) {
  const level = String(payload.analysisLevel || payload?.analysisGuide?.analysisLevel || '').trim();
  if (level === 'organization' || level === 'division' || level === 'team') return level;
  const scope = String(payload?.reportInfo?.scope || payload?.data?.scope || '').trim();
  if (scope.includes('팀')) return 'team';
  if (scope.includes('본부') || scope.includes('연구소')) return 'division';
  return 'organization';
}

function buildAnalysisModeGuide(payload = {}) {
  const analysisLevel = normalizeAnalysisLevel(payload);
  const teamSummary = Array.isArray(payload.teamSummary) ? payload.teamSummary : [];
  const riskUsers = Array.isArray(payload.riskUsers) ? payload.riskUsers : [];

  if (analysisLevel === 'team') {
    return `
[이번 보고서의 실제 분석 모드: 담당자 분석]
- 현재 선택 범위는 팀 단위입니다.
- 보고서의 중심 대상은 "담당자"입니다.
- riskUsers를 우선 사용해 담당자별 위험/주의 흐름, 반복 가능성, 관리 우선순위를 작성하세요.
- 팀 간 비교, 팀별 순위, 팀별 리스크 집중도 표현은 작성하지 마세요.
- 개인 이름은 riskUsers에 제공된 담당자만 언급할 수 있습니다.
- 제공된 담당자 수: ${riskUsers.length}명
`;
  }

  return `
[이번 보고서의 실제 분석 모드: 팀 분석]
- 현재 선택 범위는 ${analysisLevel === 'division' ? '본부/연구소' : '전체 조직'} 단위입니다.
- 보고서의 중심 대상은 "담당자 개인"이 아니라 "팀"입니다.
- 반드시 teamSummary를 우선 사용해 팀별 위험/주의 인원, 평균점수, 팀 간 편차, 특정 팀 집중 여부를 작성하세요.
- riskUsers는 팀별 집계를 설명하기 위한 보조 근거로만 사용하고, 특정 개인 이름은 꼭 필요한 경우가 아니면 언급하지 마세요.
- 표제, issueTitle, status, judge, reason, trendStory, summaryOpinion 모두 팀 비교 관점으로 작성하세요.
- "담당자 리스크 흐름", "개인별 위험", "특정 담당자" 중심 표현은 피하고, "팀별 리스크 집중도", "팀 간 편차", "조직 단위 관리 우선순위" 중심으로 표현하세요.
- teamSummary가 비어 있으면 팀 분석을 억지로 단정하지 말고 additionalDataNeeded에 "팀/본부 매칭 가능한 직원 마스터 데이터"를 포함하세요.
- 제공된 팀 요약 수: ${teamSummary.length}개
`;
}

function buildStoryPrompt(payload) {
  const reportType = String(payload.reportType || '').trim();
  const isHiring = reportType === 'hiring';
  const analysisLevel = normalizeAnalysisLevel(payload);
  const analysisModeGuide = buildAnalysisModeGuide(payload);

  const dataForPrompt = {
    reportType: payload.reportType || null,
    reportTitle: payload.reportTitle || null,
    reportInfo: payload.reportInfo || null,
    monthlySummary: payload.monthlySummary || null,
    monthlyKpi: payload.monthlyKpi || null,
    riskUsers: payload.riskUsers || [],
    teamSummary: payload.teamSummary || [],
    analysisLevel: payload.analysisLevel || null,
    analysisGuide: payload.analysisGuide || null,
    trend: payload.trend || null,
    visualDecisionHints: payload.visualDecisionHints || null,
    constraints: payload.constraints || null,
    data: payload.data || null,
    hiringInput: payload.hiringInput || null,
    additionalDataNeeded: payload.additionalDataNeeded || null,
    additionalUserData: normalizeAdditionalUserData(payload.additionalUserData),
  };

  const commonRules = `
반드시 JSON만 출력하세요. HTML, markdown 코드블록, 설명문, 주석은 절대 출력하지 마세요.

[보고 대상]
- 이 보고서는 팀장급 이상 관리자에게 보고되는 의사결정 참고자료입니다.
- 단순 요약문이 아니라, 관리자가 "현재 상태를 어떻게 판단하고 무엇을 조치해야 하는지" 이해할 수 있는 보고서 문장으로 작성하세요.

[작성 원칙]
- 새로운 수치, 이름, 조직, 월, 원인을 임의로 생성하지 마세요.
- 제공 데이터에 없는 내용은 단정하지 말고 "가능성", "검토 필요", "확인 필요"로 표현하세요.
- 데이터가 부족한 항목은 단순히 "추가 확인 필요"라고만 쓰지 말고, 어떤 자료가 왜 필요한지 설명하세요.
- 각 항목은 반드시 3~5문장으로 작성하세요. 2문장 이하 작성은 금지합니다.
- 각 항목에는 가능한 한 다음 4가지를 포함하세요:
  1) 현재 상태 또는 팩트
  2) 원인 또는 배경 가능성
  3) 조직 운영상 영향 또는 리스크
  4) 관리자 관점의 확인/조치 방향
- 단순 수치 반복, 일반론, "~필요합니다"만 반복하는 문장은 피하세요.
- 수치가 적거나 데이터가 단순해도, 보고서 문장으로서 판단 근거와 관리 방향을 포함하세요.
- 위험/주의 인원, 특정 팀 또는 담당자 집중 여부, 전월/누적 비교 가능 여부를 우선 검토하세요.
- 데이터가 1개월뿐이면 장기 추세를 단정하지 말고 "기준점", "향후 누적 관찰 필요"로 표현하세요.

[선택 범위별 분석 기준 - 반드시 준수]
- analysisLevel은 보고서의 분석 단위를 결정하는 최우선 기준입니다.
- analysisLevel이 "organization"이면 전체 조직 기준 보고서입니다. 이 경우 담당자 개인 분석이 아니라 teamSummary 기반의 "팀 간 비교 분석"을 작성하세요.
- analysisLevel이 "division"이면 본부 또는 연구소 기준 보고서입니다. 이 경우 해당 본부/연구소 소속 팀만 대상으로 "팀 간 비교 분석"을 작성하세요.
- analysisLevel이 "team"이면 팀 기준 보고서입니다. 이 경우 팀 간 비교는 금지하고 riskUsers 기반의 "담당자 분석"을 작성하세요.
- organization/division 보고서에서는 status, judge, reason, trendStory, issueTitle, issueDescription, summaryOpinion에 반드시 팀별 비교 관점을 포함하세요.
- organization/division 보고서에서는 "담당자 리스크 요약", "개인별 위험 흐름" 같은 개인 중심 표현을 피하고, "팀별 리스크 집중도", "팀 간 편차", "팀 단위 관리 우선순위"로 표현하세요.
- teamSummary가 제공된 경우 팀명은 가능한 한 "팀명(본부명)" 형식으로 언급하세요. 단, 동일 본부 내 비교에서는 첫 문단에서 본부 기준임을 밝히고 이후에는 팀명만 사용해도 됩니다.
- 전체/본부 보고서에서 특정 담당자 이름은 꼭 필요한 경우에만 제한적으로 언급하고, 기본적으로 팀 단위 판단을 우선하세요.

[금지 사항]
- 출근미입력/퇴근미입력 중심의 출퇴근 누락 분석은 포함하지 마세요.
- 근거 없이 특정 개인의 태도, 역량, 성실성 문제로 단정하지 마세요.
- 과장된 위기 표현이나 확정적 책임 판단은 피하세요.

[결론 규칙]
- conclusion은 실행 가능한 관리 방향을 포함해야 합니다.
- 마지막 conclusion은 반드시 다음 문장으로 끝내세요: "현재 기준으로는 추가적인 데이터 확인 및 운영 검토가 필요합니다."

[추가자료 반영 규칙]
- additionalUserData가 제공된 경우 이는 사용자가 확인 또는 보완한 추가자료입니다. 기존 근태 데이터와 충돌하지 않는 범위에서 우선 참고하세요.
- additionalUserData가 비어 있거나 불충분하면 추정하지 말고 additionalDataNeeded 배열에 추가 확인 필요 자료명을 담으세요.
- additionalDataUsageSummary에는 추가자료를 보고서 판단에 어떻게 반영했는지 1~2문장으로 작성하세요.
`;

  if (isHiring) {
    return `당신은 연구소 근태/인력운영 데이터를 해석해 충원 검토 보고서의 스토리 문장을 작성하는 분석가입니다.

${commonRules}

${analysisModeGuide}

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
  "additionalDataNeeded": ["보고서 신뢰도를 높이기 위해 추가 확인이 필요한 자료명. 없으면 빈 배열"],
  "additionalDataUsageSummary": "additionalUserData가 제공된 경우 반영 방식 요약. 없으면 빈 문자열",
  "cautions": ["데이터 해석 시 주의사항 1", "데이터 해석 시 주의사항 2"]
}`;
  }

  return `당신은 연구소 근태 데이터를 해석해 월간 근태 보고서의 스토리 문장을 작성하는 분석가입니다.

${commonRules}

${analysisModeGuide}

[입력 데이터]
${JSON.stringify(dataForPrompt, null, 2)}

[작성 방향]
- 디자인/레이아웃/HTML은 프론트 고정 템플릿이 담당합니다.
- 당신은 보고서 박스에 들어갈 "팀장급 이상 보고용 스토리 문장"만 작성합니다.
- 데이터 나열이 아니라 "현재 상태 → 핵심 판단 → 근거 → 조직 영향 → 관리자 조치 방향"의 흐름으로 작성합니다.
- riskUsers에 있는 담당자만 언급할 수 있습니다.
- monthlySummary, monthlyKpi, riskUsers, teamSummary, analysisLevel, analysisGuide, analysisModeGuide, trend를 우선 사용합니다.
- analysisLevel이 organization 또는 division이면 teamSummary 기반의 팀 비교 분석을 최우선으로 작성하세요. 이 경우 riskUsers는 보조 근거입니다.
- analysisLevel이 team이면 riskUsers 기반의 담당자 분석을 최우선으로 작성하세요. 이 경우 teamSummary는 보조 정보입니다.
- 위험/주의 인원이 특정 팀 또는 담당자에 집중되는지 우선 판단하되, analysisLevel에 맞는 단위만 중심으로 작성하세요.
- 각 섹션은 단순 설명이 아니라 관리자가 조치 여부를 판단할 수 있는 문장으로 작성하세요.
- 데이터가 1개월뿐이면 장기 추세를 단정하지 말고 기준점 또는 추후 누적 확인으로 표현합니다.

다음 JSON 구조로만 응답하세요.
{
  "meta": {
    "reportType": "attendance",
    "reportMonth": "입력 데이터 기준 월 또는 빈 문자열",
    "tone": "management_report"
  },
  "intro": "분석 기준, 보고 구성, 주요 관점, 판단 방식을 연결하는 도입 문장",
  "status": "해당월 현재 상태 요약. organization/division이면 팀별 분포와 팀 간 편차를 중심으로, team이면 담당자별 흐름을 중심으로 3~5문장 작성",
  "judge": "이번 보고서의 핵심 판단 한 단락. analysisLevel에 맞춰 팀 단위 또는 담당자 단위의 문제 수준, 긴급도, 관리 우선순위를 포함해 3~5문장으로 작성",
  "reason": "핵심 판단의 데이터 근거 설명. organization/division이면 teamSummary의 팀별 위험/주의/평균점수를 근거로, team이면 riskUsers를 근거로 3~5문장 작성",
  "trendStory": "2부 도입 설명. 해당 월을 기준점으로 트렌드를 어떻게 읽어야 하는지 3~5문장으로 작성",
  "issueTitle": "이번 데이터에서 AI가 주요 이슈로 판단한 동적 제목. 전체/본부 기준이면 팀별 리스크 집중도, 팀 간 편차, 조직 전반 리스크 확산 등을 우선하고, 팀 기준이면 담당자 리스크 흐름, 연장근무 증가 패턴 등을 우선",
  "issueDescription": "issueTitle에 대한 설명. analysisLevel에 맞춰 팀 비교 또는 담당자 분석 관점으로 왜 이 이슈를 봐야 하는지 3~5문장으로 작성",
  "causeStory": "가능 원인과 해석. 단정 금지",
  "causeIntro": "3부 원인 가능성 검토의 첫 설명 문단. 원인을 확정하지 않고 검토 관점을 설명",
  "cause1Title": "가능 원인 1 카드 제목",
  "cause1Text": "가능 원인 1 설명. 3~5문장",
  "cause2Title": "가능 원인 2 카드 제목",
  "cause2Text": "가능 원인 2 설명. 3~5문장",
  "shortTermTitle": "모니터링 및 검토 방향 카드 1 제목",
  "shortTermText": "단기 관리 방향 설명. 3~5문장",
  "nextMonthTitle": "모니터링 및 검토 방향 카드 2 제목",
  "nextMonthText": "다음 월 확인 방향 설명. 3~5문장",
  "summaryOpinion": "종합 의견 문단. analysisLevel에 따라 팀별 비교 또는 담당자별 관리 관점을 반영하고, 현재 조직 상태, 관리 우선순위, 다음 조치 방향을 팀장급 이상 보고용으로 3~5문장 작성",
  "monitoring": "다음 월 또는 단기 관리 방향 요약",
  "conclusion": "결론. 마지막 문장은 고정 문장으로 끝낼 것",
  "bottomNote": "보고서 맨 아래 안내 문구. 근태 데이터 기반이며 실제 운영 판단에는 업무 상황 등 보조 확인이 필요하다는 문장",
  "additionalDataNeeded": ["보고서 신뢰도를 높이기 위해 추가 확인이 필요한 자료명. 없으면 빈 배열"],
  "additionalDataUsageSummary": "additionalUserData가 제공된 경우 반영 방식 요약. 없으면 빈 문자열",
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
      max_output_tokens: 3200,
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
