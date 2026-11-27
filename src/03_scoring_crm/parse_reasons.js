// n8n Code node: "Parse Reasons"
// Parses the LLM score reasons and validates them against the scored attributes.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const response = $input.first().json;
const prev = $node['Read Scored Row from Supabase'].json;

const ATTRIBUTE_MAX = {
  // K mode
  sector_fit: 20,
  revenue: 20,
  exec_sponsor: 20,
  ai_appetite: 15,
  budget_timeline: 15,
  relationship: 10,
  // D-consumer
  purchase_intent: 25,
  location: 20,
  product_fit: 20,
  source_channel: 15,
  buyer_urgency: 10,
  lead_completeness: 10,
  // D-retail
  wholesale_intent: 25,
  business_legitimacy: 20,
  order_volume: 20,
  product_range: 15,
};

function parseAttrScores(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

function cleanRaw(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/^json\s*/i, '')
    .replace(/\s*```$/, '');
}

function normalizeIcon(earned, max) {
  if (!max || max <= 0) return 'warn';
  const ratio = earned / max;
  if (ratio >= 0.7) return 'pass';
  if (ratio >= 0.3) return 'partial';
  return 'warn';
}

function buildText(name, earned, max) {
  const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
  if (earned === 0) return `${name} missing critical signal`;
  if (pct >= 70) return `${name} strongly supports qualification`;
  if (pct >= 30) return `${name} partially supports qualification`;
  return `${name} remains a weak signal`;
}

function canonicalAttributeName(name) {
  const value = String(name || '').trim();
  if (value === 'revenue_band') return 'revenue';
  return value;
}

function resolveMax(attribute, explicitMax) {
  const normalized = canonicalAttributeName(attribute);
  return Number(explicitMax ?? 0) || ATTRIBUTE_MAX[normalized] || 0;
}

function extractAttributeList(attributeScores) {
  if (!attributeScores) return [];

  const raw = typeof attributeScores === 'string'
    ? (() => { try { return JSON.parse(attributeScores); } catch { return null; } })()
    : attributeScores;

  if (Array.isArray(raw)) {
    return raw
      .map((item, index) => {
        const attribute = canonicalAttributeName(item.attribute ?? item.name ?? `attribute_${index + 1}`);
        return {
          attribute,
          earned: Number(item.earned ?? item.score ?? item.value ?? 0),
          max: resolveMax(attribute, item.max ?? item.weight ?? item.max_score)
        };
      })
      .filter(item => ATTRIBUTE_MAX[item.attribute]);
  }

  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .map(([attribute, value]) => {
        const normalized = canonicalAttributeName(attribute);
        if (!ATTRIBUTE_MAX[normalized]) return null;
        if (value && typeof value === 'object') {
          return {
            attribute: normalized,
            earned: Number(value.earned ?? value.score ?? value.value ?? 0),
            max: resolveMax(normalized, value.max ?? value.max_score ?? value.weight)
          };
        }
        return {
          attribute: normalized,
          earned: Number(value ?? 0),
          max: resolveMax(normalized)
        };
      })
      .filter(Boolean);
  }

  return [];
}

function fallbackReasons(attributeScores) {
  const list = extractAttributeList(attributeScores);
  if (!list.length) {
    return [
      { attribute: 'score', earned: Number(prev.score ?? 0), max: 100, icon: 'partial', text: 'Scoring completed in Supabase' },
      { attribute: 'confidence', earned: 0, max: 0, icon: 'partial', text: `Confidence ${prev.confidence_level ?? 'unknown'}` },
      { attribute: 'tier', earned: 0, max: 0, icon: 'partial', text: `Tier ${prev.tier ?? 'unassigned'}` }
    ];
  }

  const mustInclude = list.filter(item => item.max >= 15 && item.earned === 0);
  const ordered = [...list].sort((a, b) => b.earned - a.earned || b.max - a.max);
  const selected = [];

  for (const item of mustInclude) {
    if (!selected.find(entry => entry.attribute === item.attribute)) selected.push(item);
  }

  for (const item of ordered) {
    if (selected.length >= 3) break;
    if (!selected.find(entry => entry.attribute === item.attribute)) selected.push(item);
  }

  return selected.slice(0, 3).map(item => ({
    attribute: item.attribute,
    earned: item.earned,
    max: item.max,
    icon: normalizeIcon(item.earned, item.max),
    text: buildText(item.attribute, item.earned, item.max)
  }));
}

let raw = cleanRaw(
  response.choices?.[0]?.message?.content ??
  response.data?.choices?.[0]?.message?.content ??
  response.body?.choices?.[0]?.message?.content ??
  ''
);

console.log('CLEANED RAW:', JSON.stringify(raw));

const attrScores = parseAttrScores(prev.attribute_scores);

let reasons = null;
let reasonsSource = 'fallback';

if (raw) {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
if (!match) throw new Error('No JSON array found');
const parsed = JSON.parse(match[0]);
    console.log('PARSED OK, length:', parsed.length);
    if (Array.isArray(parsed) && parsed.length === 3) {
      reasons = parsed.map((item, index) => {
        const attribute = canonicalAttributeName(
          item.attribute ?? `attribute_${index + 1}`
        );
        const earned = Number(item.earned ?? attrScores[attribute] ?? 0);
        const max = resolveMax(attribute, item.max);
        return {
          attribute,
          earned,
          max,
          icon: ['pass', 'partial', 'warn'].includes(item.icon)
            ? item.icon
            : normalizeIcon(earned, max),
          text: String(item.text ?? buildText(attribute, earned, max))
        };
      });

      if (reasons.length === 3) {
        reasonsSource = 'llm';
      } else {
        reasons = null;
      }
    }
  } catch(e) {
    console.log('PARSE ERROR:', e.message);
    console.log('RAW THAT FAILED:', raw.substring(0, 200));
    reasons = null;
  }
}

console.log('REASONS SOURCE:', reasonsSource);

if (!reasons) {
  reasons = fallbackReasons(prev.attribute_scores);
}

return [{
  json: {
    ...prev,
    top_reasons: reasons,
    top_reasons_source: reasonsSource
  }
}];
