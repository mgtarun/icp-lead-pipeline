// n8n Code node: "Check Existing Thread"
// Looks up the thread id in Supabase to tell new leads from replies.
// Source of truth is icp-lead-pipeline.json; this copy is for reading.

const emailData = $input.first().json;
const threadId = $('Lumen Living Gmail Trigger').first().json.threadId;

const result = await this.helpers.httpRequest({
  method: 'GET',
  url: `https://YOUR_PROJECT.supabase.co/rest/v1/crm_leads?conversation_id=eq.${threadId}&select=id,review_status,score,sender_name,path,pricing_tier,extracted_city,detected_language,email_body&limit=1`,
  headers: {
    'apikey': process.env.SUPABASE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
    'Content-Type': 'application/json'
  },
  json: true
});

const existingLead = result?.[0] || null;

return [{ json: {
  ...emailData,
  threadId,
  is_reply: existingLead !== null,
  existing_lead_id: existingLead?.id || null,
  existing_path: existingLead?.path || null,
  existing_pricing_tier: existingLead?.pricing_tier || null,
  existing_city: existingLead?.extracted_city || null,
  existing_language: existingLead?.detected_language || null,
  existing_review_status: existingLead?.review_status || null
}}];
