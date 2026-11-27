// n8n Code node: "Find Relevant Chunks"
// Embeds the query (Hugging Face) and calls match_knowledge for top k context.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

// Use rewritten query if available (reply path only)
let rewrittenQuery = null;
try {
  rewrittenQuery = $('Rewrite Query').first()?.json?.rewrittenQuery || null;
} catch(e) {
  rewrittenQuery = null;
}

// Try input first (reply path), fall back to Read Scored Row (normal path)
const inputData = $input.first().json;
const leadData = inputData?.leadData || 
                 $('Read Scored Row from Supabase').first()?.json || 
                 inputData || 
                 {};

const subject = (leadData.subject || leadData.email_subject || '').toLowerCase();

// FIX: use translated_body as primary, email_body as fallback
const bodyText = (leadData.translated_body || 
                  leadData.email_body || 
                  leadData.original_body || '').toLowerCase();

// THIS LINE WAS MISSING — fullText combines subject + body
const fullText = bodyText; // use translated body only, skip French subject





// Extract product names by looking for known product keywords
const productTerms = [];
if (fullText.includes('stilt')) productTerms.push('Stilt Sofa');
if (fullText.includes('faifo') || fullText.includes('dining table')) productTerms.push('Faifo Dining Table');
if (fullText.includes('joss')) productTerms.push('Joss Lounge Chair');
if (fullText.includes('lola')) productTerms.push('Lola Dining Chair');
if (fullText.includes('knot')) productTerms.push('Knot Coffee Table');
if (fullText.includes('lodge')) productTerms.push('Lodge Bed');
if (fullText.includes('bow')) productTerms.push('Bow Barstool');
if (fullText.includes('inumbra')) productTerms.push('Inumbra Shelving');
if (fullText.includes('limen')) productTerms.push('Limen Sideboard');
if (fullText.includes('tonkin')) productTerms.push('Tonkin Side Table');
if (fullText.includes('foosball') || fullText.includes('dinh')) productTerms.push('DINH Foosball Table');
if (fullText.includes('chess')) productTerms.push('Chess Set');
if (fullText.includes('buom')) productTerms.push('Buom Armchair');
if (fullText.includes('ottoman')) productTerms.push('Joss Ottoman');

// ADD THIS RIGHT HERE
console.log('=== DEBUG ===');
console.log('translated_body:', leadData.translated_body);
console.log('email_body:', leadData.email_body);
console.log('bodyText:', bodyText);
console.log('fullText:', fullText.substring(0, 300));
console.log('productTerms after detection:', productTerms);
console.log('=============');

// ADD THIS RIGHT HERE
console.log('=== DEBUG ===');
console.log('translated_body:', leadData.translated_body);
console.log('email_body:', leadData.email_body);
console.log('bodyText:', bodyText);
console.log('fullText:', fullText.substring(0, 300));
console.log('productTerms after detection:', productTerms);
console.log('=============');
// Build embedding query — product names + path context
const pathContext = leadData.path === 'retail' 
  ? 'trade pricing lead time B2B' 
  : 'retail price availability';

// Use rewritten query if available, otherwise build from product terms
const query = rewrittenQuery || 
  (productTerms.length > 0
    ? productTerms.join(' ') + ' ' + pathContext
    : fullText.substring(0, 200));

// Generate embedding
const embeddingResponse = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction',
  headers: {
    'Authorization': 'Bearer ' + process.env.HF_API_KEY,
    'Content-Type': 'application/json'
  },
  body: { inputs: query },
  json: true
});

const vector = Array.isArray(embeddingResponse[0]) ? embeddingResponse[0] : embeddingResponse;
const vectorString = '[' + vector.join(',') + ']';

// Query Supabase match_knowledge
const matches = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://YOUR_PROJECT.supabase.co/rest/v1/rpc/match_knowledge',
  headers: {
    'apikey': process.env.SUPABASE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
    'Content-Type': 'application/json'
  },
  body: { query_embedding: vectorString, match_count: 10 },
  json: true
});

// Boost and rerank
const queryLower = query.toLowerCase();
const boosted = matches.map(r => {
  let boost = 0;
  const content = (r.content || '').toLowerCase();
  const product = (r.product || '').toLowerCase();

  // Strong boost for exact product name matches
  if (content.includes('stilt') && queryLower.includes('stilt')) boost += 30;
  if (content.includes('faifo') && queryLower.includes('faifo')) boost += 30;
  if (content.includes('joss') && queryLower.includes('joss')) boost += 30;
  if (content.includes('lola') && queryLower.includes('lola')) boost += 30;
  if (content.includes('knot') && queryLower.includes('knot')) boost += 30;
  if (content.includes('lodge') && queryLower.includes('lodge')) boost += 30;
  if (content.includes('bow') && queryLower.includes('bow')) boost += 30;
  if (content.includes('limen') && queryLower.includes('limen')) boost += 30;
  if (content.includes('inumbra') && queryLower.includes('inumbra')) boost += 30;
  if (content.includes('ottoman') && queryLower.includes('ottoman')) boost += 30;

  // Category boosts
  if (product.includes('sofa') && queryLower.includes('sofa')) boost += 10;
  if (product.includes('dining') && queryLower.includes('dining')) boost += 10;
  if (product.includes('bed') && queryLower.includes('bed')) boost += 10;
  if (product.includes('chair') && queryLower.includes('chair')) boost += 10;
  if (product.includes('table') && queryLower.includes('table')) boost += 10;

  // Retail path — boost B2B and pricing chunks
  if (leadData.path === 'retail') {
    if (content.includes('b2b') || content.includes('trade price') || content.includes('35%')) boost += 20;
    if (content.includes('minimum order') || content.includes('moq')) boost += 15;
    if (content.includes('lead time')) boost += 10;
  }

  // Penalise irrelevant products
  if (queryLower.includes('sofa') && product.includes('armchair') && !queryLower.includes('armchair')) boost -= 20;
  if (queryLower.includes('dining') && product.includes('coffee')) boost -= 10;

  return { ...r, boost };
});

const reranked = boosted.sort((a, b) => b.boost - a.boost);
const top4 = reranked.slice(0, 4);

const context = top4.map(r => r.content).join(' | ')
  .replace(/\n/g, ' ')
  .replace(/–/g, '-')
  .replace(/"/g, "'");

return [{ json: { context, leadData, historyText: inputData?.historyText || '' } }];
