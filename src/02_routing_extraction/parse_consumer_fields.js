// n8n Code node: "Parse Consumer Fields"
// Validates the consumer extraction JSON and maps it to scoring signals.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;
let raw = item.choices?.[0]?.message?.content ?? '';
if (typeof raw !== 'string') { return [{ json: { parse_error: true, raw_output: raw } }]; }
raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
let parsed;
try { parsed = JSON.parse(raw); }
catch (e) { return [{ json: { parse_error: true, raw_output: raw } }]; }

const emailData = $('Parse Original Body').first()?.json || {};

// ── SOURCE CHANNEL ────────────────────────────────────────────
// Now decided by the LLM (per V5 doc §2.4). Code no longer infers
// from the body — just validate the key, fall back to cold_unknown.
const validChannels = ['paid_ad_click', 'direct_message', 'organic_comment', 'cold_unknown'];
const source_channel_signal = validChannels.includes(parsed.source_channel_signal)
  ? parsed.source_channel_signal
  : 'cold_unknown';

// ── CONTACT COMPLETENESS ──────────────────────────────────────
const hasName  = !!(parsed.sender_name  || emailData.from_name);
const hasEmail = !!(parsed.sender_email || emailData.from_email);
const hasPhone = !!(parsed.sender_phone);
const contactCount = [hasName, hasEmail, hasPhone].filter(Boolean).length;
const contact_completeness_signal =
  contactCount >= 3 ? 'full_contact'  :
  contactCount === 2 ? 'two_of_three' :
  contactCount === 1 ? 'minimal'      :
  'no_contact';

// ── FIELDS INFERRED ───────────────────────────────────────────
const fields_inferred = [
  (!parsed.purchase_intent_signal || parsed.purchase_intent_signal === '') ? 1 : 0,
  (!parsed.extracted_city || parsed.extracted_city === '')                  ? 1 : 0,
  (!parsed.product_fit_signal || parsed.product_fit_signal === '')          ? 1 : 0,
  (!parsed.buyer_urgency_signal || parsed.buyer_urgency_signal === '')      ? 1 : 0,
].reduce((a, b) => a + b, 0);
// Note: source_channel and contact_completeness are set/validated here,
// so they are never counted as inferred.

// ── BOOLEANS ─────────────────────────────────────────────────
const designer_flag  = parsed.designer_flag  === true || parsed.designer_flag  === 'true';
const price_shopping = parsed.price_shopping === true || parsed.price_shopping === 'true';
const is_custom      = parsed.is_custom      === true || parsed.is_custom      === 'true';

return [{ json: {
  path:                        'consumer',
  subject:                     emailData.subject           || '',
  from_name:                   emailData.from_name         || '',
  from_email:                  emailData.from_email        || '',
  detected_language:           emailData.detected_language || 'en',
  original_body:               emailData.original_body     || '',
  sender_name:                 parsed.sender_name          || emailData.from_name  || '',
  sender_email:                parsed.sender_email         || emailData.from_email || '',
  sender_phone:                parsed.sender_phone         || '',
  product_requested:           parsed.product_category     || '',
  purchase_intent_signal:      parsed.purchase_intent_signal  || 'no_signal',
  extracted_city:              parsed.extracted_city           || '',
  extracted_district:          parsed.extracted_district       || '',
  location_signal:             '',
  product_fit_signal:          parsed.product_fit_signal       || 'similar',
  buyer_urgency_signal:        parsed.buyer_urgency_signal     || 'normal',
  designer_flag,
  source_channel_signal,
  contact_completeness_signal,
  is_custom,
  price_shopping,
  fields_inferred
} }];
