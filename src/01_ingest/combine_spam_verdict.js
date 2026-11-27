// n8n Code node: "Code in JavaScript1"
// Combines the keyword spam result with the LLM spam verdict (LLM needs confidence >= 70).
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const raw = $input.first().json.choices?.[0]?.message?.content || '{}';
let parsed = {};
try {
  parsed = JSON.parse(raw);
} catch(e) {
  parsed = { is_spam: false, confidence: 0, reason: 'parse error' };
}

const keywordSpam = $('Spam Check').first().json.is_spam;
const llmSpam = parsed.is_spam === true && parsed.confidence >= 70;
const is_spam = keywordSpam || llmSpam;

return [{ json: {
  ...$('Parse Original Body').first().json,
  is_spam,
  spam_reason: parsed.reason || '',
  spam_confidence: parsed.confidence || 0
} }];
