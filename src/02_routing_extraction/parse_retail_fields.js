// n8n Code node: "Parse Retail Fields"
// Validates the retail extraction JSON and maps it to scoring signals.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const item = $input.first().json;
let raw = item.choices?.[0]?.message?.content ?? '';
if (typeof raw !== 'string') { return [{ json: { parse_error: true, raw_output: raw } }]; }
raw = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
let parsed;
try { parsed = JSON.parse(raw); }
catch (e) { return [{ json: { parse_error: true, raw_output: raw } }]; }

const emailData = $('Parse Original Body').first()?.json || {};

// ── RELATIONSHIP SOURCE ───────────────────────────────────────
// Decided by the LLM (per V5 doc §5.6). Validate the key, fall back to unknown_inbound.
const validRelationship = ['partner_referral', 'trade_show', 'outbound_pursuit', 'unknown_inbound'];
const relationship_source_signal = validRelationship.includes(parsed.relationship_source_signal)
  ? parsed.relationship_source_signal
  : 'unknown_inbound';

// ── LEGITIMACY GUARD ──────────────────────────────────────────
// full_identity / name_address_only REQUIRE a proper business name.
// The LLM sometimes picks these even when company_name is empty —
// enforce the rule deterministically here.
let business_legitimacy_signal = parsed.business_legitimacy_signal || 'no_identity';
const hasCompanyName = !!(parsed.company_name && parsed.company_name.trim() !== '');

if (!hasCompanyName && (business_legitimacy_signal === 'full_identity' || business_legitimacy_signal === 'name_address_only')) {
  const hasAnyContact = !!(parsed.sender_email || parsed.sender_phone || emailData.from_email);
  business_legitimacy_signal = hasAnyContact ? 'unverified_claim' : 'no_identity';
}

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
// Count from absence — disqualifying signals are stated, not inferred.
const fields_inferred = [
  (!parsed.wholesale_intent_signal || parsed.wholesale_intent_signal === '') ? 1 : 0,
  (!business_legitimacy_signal     || business_legitimacy_signal     === '') ? 1 : 0,
  (!parsed.order_volume_signal     || parsed.order_volume_signal     === '') ? 1 : 0,
  (!parsed.product_range_signal    || parsed.product_range_signal    === '') ? 1 : 0,
  (relationship_source_signal === 'unknown_inbound')                          ? 1 : 0,
  (parsed.store_count === null || parsed.store_count === undefined)           ? 1 : 0,
].reduce((a, b) => a + b, 0);

// ── BOOLEANS ─────────────────────────────────────────────────
const price_shopping = parsed.price_shopping === true || parsed.price_shopping === 'true';

// ── STORE COUNT ───────────────────────────────────────────────
const store_count = (parsed.store_count !== null && parsed.store_count !== undefined && !isNaN(Number(parsed.store_count)))
  ? parseInt(parsed.store_count, 10)
  : null;

return [{ json: {
  path:                        'retail',
  subject:                     emailData.subject           || '',
  from_name:                   emailData.from_name         || '',
  from_email:                  emailData.from_email        || '',
  detected_language:           emailData.detected_language || 'en',
  original_body:               emailData.original_body     || '',
  sender_name:                 parsed.sender_name          || emailData.from_name  || '',
  sender_email:                parsed.sender_email         || emailData.from_email || '',
  sender_phone:                parsed.sender_phone         || '',
  company_name:                parsed.company_name         || '',
  store_count,
  extracted_city:              parsed.extracted_city       || '',
  extracted_district:          parsed.extracted_district   || '',
  location_signal:             '',
  wholesale_intent_signal:     parsed.wholesale_intent_signal     || 'no_b2b_signal',
  business_legitimacy_signal:  business_legitimacy_signal,
  order_volume_signal:         parsed.order_volume_signal         || 'no_volume_signal',
  product_range_signal:        parsed.product_range_signal        || 'general_with_furniture',
  relationship_source_signal,
  contact_completeness_signal,
  price_shopping,
  fields_inferred
} }];
