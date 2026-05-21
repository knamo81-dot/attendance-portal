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

function normalizeDirection(value, sourceLang) {
  const direction = safeText(value, 'auto');
  if (direction === 'ko-en') return 'Korean to English';
  if (direction === 'en-ko') return 'English to Korean';
  if (sourceLang === 'ko') return 'Korean to English';
  if (sourceLang === 'en') return 'English to Korean';
  return 'auto-detect the source language and translate to the other language between Korean and English';
}

function buildPrompt(payload) {
  const text = safeText(payload.text);
  const tone = normalizeTone(payload.tone);
  const direction = normalizeDirection(payload.direction, payload.sourceLang);

  return [
    'You are an AI translator for an internal R&D collaboration chat.',
    'Translate the user message between Korean and English.',
    'Return only the translated message. Do not add explanations, markdown, labels, quotes, or alternatives.',
    '',
    `Direction: ${direction}`,
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

    const translated = await callOpenAI(payload);

    return json(res, 200, {
      ok: true,
      translated,
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
