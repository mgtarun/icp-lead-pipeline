// n8n Code node: "Parse Reply"
// Extracts the reply text from the LLM response.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const raw = $input.first().json.choices?.[0]?.message?.content ?? '';
const leadData = $('Find Relevant Chunks').first()?.json?.leadData || {};
return [{ json: { reply: raw, leadData } }];
