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
  const isHiring = payload.reportType === 'hiring';

  const base = {
    reportType: payload.reportType,
    reportTitle: payload.reportTitle,
    data: payload.data,
    hiringInput: payload.hiringInput || null,
  };

  return `당신은 연구소 근태/인력운영 데이터를 해석해 경영진 검토용 보고서를 작성하는 분석가입니다.

작성 규칙:
- 출력은 HTML 본문 조각만 작성합니다. <!doctype>, html, body, script는 금지합니다.
- 기존 화면 CSS를 활용할 수 있도록 h2, p, ul, table.attReportTable, div.attReportHeaderTitle, div.attReportMeta, div.attReportIntro, div.attReportCards, div.attReportCard, div.attReportNote 구조를 사용합니다.
- 실제 데이터에 없는 수치나 이름은 만들지 않습니다.
- 단정하지 말고 "가능성", "검토 필요", "반복 확인 필요" 수준으로 표현합니다.
- 개인정보는 입력된 이름/사번/조직 정보 범위 안에서만 사용합니다.
- 보고서 제목, 작성일자, 보고대상, 분석기준을 상단에 표시합니다.
- ${isHiring
    ? '충원 보고서는 1) 충원 요청 개요 2) 퇴사/공백 정보 3) 근태 리스크 근거 4) 업무 재배분 가능성 5) 충원 검토 의견 6) 결론 순서로 작성합니다.'
    : '월별+트렌드 보고서는 1) 핵심 요약 2) 월별 진단 3) 트렌드 변화 4) 담당자 리스크 5) 원인 가능성 6) 관리 방향 7) 결론 순서로 작성합니다.'}

분석 데이터 JSON:
${JSON.stringify(base, null, 2)}`;
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
      scope_label: payload?.data?.scope || null,
      period_label: payload?.data?.period || null,
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
