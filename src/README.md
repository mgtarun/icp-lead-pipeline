# Code nodes

Readable copies of the 25 JavaScript Code nodes in `icp-lead-pipeline.json`, grouped by pipeline stage. The workflow JSON is still the source of truth.


## 1. Ingest

| File | n8n node | What it does |
|---|---|---|
| [`extract_email_fields.js`](01_ingest/extract_email_fields.js) | Extract Email Fields | Normalises the Gmail trigger output into sender, subject, body and thread id. |
| [`check_existing_thread.js`](01_ingest/check_existing_thread.js) | Check Existing Thread | Looks up the thread id in Supabase to tell new leads from replies. |
| [`parse_original_body.js`](01_ingest/parse_original_body.js) | Parse Original Body | Reads the translation response and keeps both original and English text. |
| [`spam_check.js`](01_ingest/spam_check.js) | Spam Check | Fast keyword based spam filter that runs before the LLM spam check. |
| [`combine_spam_verdict.js`](01_ingest/combine_spam_verdict.js) | Code in JavaScript1 | Combines the keyword spam result with the LLM spam verdict (LLM needs confidence >= 70). |

## 2. Routing and extraction

| File | n8n node | What it does |
|---|---|---|
| [`parse_path.js`](02_routing_extraction/parse_path.js) | Parse Path | Parses the LLM path classifier output into k, consumer or retail. |
| [`parse_k_fields.js`](02_routing_extraction/parse_k_fields.js) | Parse K Fields | Validates the enterprise extraction JSON and maps it to scoring signals. |
| [`parse_confidence.js`](02_routing_extraction/parse_confidence.js) | Parse Confidence | Parses the LLM confidence check for the enterprise path. |
| [`parse_consumer_fields.js`](02_routing_extraction/parse_consumer_fields.js) | Parse Consumer Fields | Validates the consumer extraction JSON and maps it to scoring signals. |
| [`parse_retail_fields.js`](02_routing_extraction/parse_retail_fields.js) | Parse Retail Fields | Validates the retail extraction JSON and maps it to scoring signals. |
| [`prep_for_supabase.js`](02_routing_extraction/prep_for_supabase.js) | Prep for Supabase | Shapes the mapped fields into the crm_leads insert payload. |

## 3. Scoring and CRM

| File | n8n node | What it does |
|---|---|---|
| [`log_inbound_message.js`](03_scoring_crm/log_inbound_message.js) | Log Inbound Message | Writes the inbound email to crm_email_messages (conversation memory). |
| [`parse_reasons.js`](03_scoring_crm/parse_reasons.js) | Parse Reasons | Parses the LLM score reasons and validates them against the scored attributes. |
| [`build_crm_task_body.js`](03_scoring_crm/build_crm_task_body.js) | Code in JavaScript | Builds the Twenty CRM task title and markdown body from the scored lead. |
| [`parse_top_reasons.js`](03_scoring_crm/parse_top_reasons.js) | Parse Top Reasons | Picks the top reasons to show on the CRM task. |
| [`prepare_field_list.js`](03_scoring_crm/prepare_field_list.js) | Prepare Field List | Builds the list of Twenty CRM custom fields to create if missing. |

## 4. Reply (RAG + memory)

| File | n8n node | What it does |
|---|---|---|
| [`update_existing_lead.js`](04_reply/update_existing_lead.js) | Update Existing Lead | Merges new info from a reply into the existing lead row. |
| [`log_inbound_message_reply.js`](04_reply/log_inbound_message_reply.js) | Log Inbound Message (Reply) | Logs an inbound reply to the conversation history. |
| [`fetch_recent_messages.js`](04_reply/fetch_recent_messages.js) | Fetch Recent Messages | Loads the last messages on the thread via get_recent_email_messages. |
| [`rewrite_query.js`](04_reply/rewrite_query.js) | Rewrite Query | Rewrites the latest message plus history into a standalone search query for RAG. |
| [`find_relevant_chunks.js`](04_reply/find_relevant_chunks.js) | Find Relevant Chunks | Embeds the query (Hugging Face) and calls match_knowledge for top k context. |
| [`llm_generate_reply.js`](04_reply/llm_generate_reply.js) | LLM Generate Reply | Generates a grounded reply from retrieved context and thread history. |
| [`parse_reply.js`](04_reply/parse_reply.js) | Parse Reply | Extracts the reply text from the LLM response. |
| [`translation_reply.js`](04_reply/translation_reply.js) | Translation reply | Translates the reply back into the sender's original language. |
| [`log_outbound_message.js`](04_reply/log_outbound_message.js) | Log Outbound Message | Logs the outgoing reply to the conversation history. |
