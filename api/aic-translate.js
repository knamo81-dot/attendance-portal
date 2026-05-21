const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function safeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeLang(value) {
  const lang = safeText(value, '').toLowerCase();
  if (lang.startsWith('ko') || lang === 'kr' || lang === 'korean') return 'ko';
  if (lang.startsWith('en') || lang === 'english') return 'en';
  return '';
}

function detectTextLanguage(text) {
  const value = safeText(text);
  if (!value) return 'auto';

  const koreanCount = (value.match(/[가-힣]/g) || []).length;
  const latinCount = (value.match(/[A-Za-z]/g) || []).length;

  if (koreanCount > 0 && koreanCount >= latinCount * 0.25) return 'ko';
  if (latinCount > 0) return 'en';
  return 'auto';
}

function langLabel(lang) {
  return lang === 'ko' ? 'Korean' : 'English';
}

function normalizeTone(value) {
  const tone = safeText(value, 'business');
  const map = {
    business: 'formal business communication',
    meeting: 'clear and concise meeting conversation',
    polite: 'polite email-style business communication',
    casual: 'natural casual conversation'
  };
  return map[tone] || map.business;
}

function resolveTranslationPlan(payload) {
  const text = safeText(payload.text);
  const direction = safeText(payload.direction, 'auto');
  const detected = normalizeLang(payload.detectedSourceLang) || detectTextLanguage(text);
  const requestedSource = normalizeLang(payload.sourceLang);
  let sourceLang = detected || requestedSource || 'auto';
  let targetLang = normalizeLang(payload.targetLang);

  if (direction === 'ko-en') {
    sourceLang = 'ko';
    targetLang = 'en';
  } else if (direction === 'en-ko') {
    sourceLang = 'en';
    targetLang = 'ko';
  } else {
    if (sourceLang === 'ko') targetLang = 'en';
    else if (sourceLang === 'en') targetLang = 'ko';
    else {
      sourceLang = requestedSource || 'auto';
      targetLang = normalizeLang(payload.viewerLang) || 'en';
    }
  }

  if (!targetLang || targetLang === sourceLang) {
    targetLang = sourceLang === 'ko' ? 'en' : 'ko';
  }

  return { sourceLang, targetLang };
}

function buildPrompt(payload) {
  const text = safeText(payload.text);
  const tone = normalizeTone(payload.tone);
  const plan = resolveTranslationPlan(payload);

  const directionText =
    plan.sourceLang === 'auto'
      ? `Auto-detect the source language and translate to ${langLabel(plan.targetLang)}`
      : `${langLabel(plan.sourceLang)} to ${langLabel(plan.targetLang)}`;

  return [
    'You are an AI translator for an internal R&D collaboration chat.',
    'Translate the user message between Korean and English.',
    'Return only the translated message. Do not add explanations, markdown, labels, quotes, or alternatives.',
    '',
    `Direction: ${directionText}`,
    `Tone: ${tone}`,
    '',
    'Rules:',
    '- Preserve technical terms, product names, team names, person names, model names, and numbers as naturally as possible.',
    '- Do not invent facts.',
    '- If the input is already in the target language, lightly polish it in the requested tone.',
    '- Keep the translation concise and chat-friendly.',
    '',
    'Message:',
    text
  ].join('\n');
}

async function callOpenAI(payload) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 환경변수가 없습니다.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: buildPrompt(payload),
      temperature: 0.2,
      max_output_tokens: 900
    })
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

  return safeText(text);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'POST만 지원합니다.' });
  }

  try {
    const payload = req.body || {};
    const text = safeText(payload.text);

    if (!text) {
      return json(res, 400, { ok: false, error: 'text가 필요합니다.' });
    }

    const plan = resolveTranslationPlan(payload);
    const translated = await callOpenAI(payload);

    return json(res, 200, {
      ok: true,
      translated,
      sourceLang: plan.sourceLang,
      targetLang: plan.targetLang,
      model: OPENAI_MODEL
    });
  } catch (error) {
    console.error('[aic-translate]', error);
    return json(res, 500, {
      ok: false,
      error: error?.message || String(error)
    });
  }
};
