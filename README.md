# ICP Lead Scoring & Reply Pipeline

An end-to-end n8n pipeline that turns inbound sales emails into scored,
qualified CRM leads with auto-drafted replies. It classifies each email by
business path (enterprise / consumer / retail), extracts structured fields with
an LLM, scores the lead against an Ideal Customer Profile, writes it to a
database and CRM, and generates a grounded, language-matched reply. Built as a
prototype with a fictional brand ("Lumen Living") and sample data.

## What it does

1. **Trigger** — a Gmail trigger polls for new inbound email.
2. **Spam + language** — an LLM spam check filters junk; a translation step
   normalises non-English email to English for processing.
3. **Path routing** — the email is classified into a business path (enterprise
   "K", consumer, or retail) and routed accordingly.
4. **Extraction** — a path-specific LLM prompt extracts structured fields
   (sender, company, budget, timeline, intent, and more) and returns strict JSON.
5. **Scoring + persistence** — fields are mapped and inserted into Supabase,
   which scores the lead and assigns a tier; the pipeline reads the scored row
   back.
6. **Reasons** — an LLM generates concise, grounded justification for the score;
   top reasons are parsed out.
7. **CRM** — a task is created in Twenty CRM, with custom fields created on the
   fly as needed.
8. **Reply** — for replies on existing threads, the pipeline retrieves relevant
   context (RAG over a vector store), rewrites the query, generates a reply in
   the sender's language, and sends it via Gmail. Consumer/retail notifications
   are emailed to the sales inbox.
9. **Confidence + review** — an LLM confidence check and human-in-the-loop
   review status gate whether a reply is auto-sent or held for approval.

## Design notes

- **Deterministic where it matters** — scoring lives in the database (SQL/RPC),
  not the LLM, so lead scores are auditable and reproducible rather than
  model-dependent.
- **Human-in-the-loop** — replies carry a review status (`PENDING`, `APPROVED`,
  `REJECTED`, `OVERRIDDEN`) so nothing high-stakes is sent unchecked.
- **Conversation memory** — inbound and outbound messages are logged per thread,
  and existing threads are detected so leads are updated rather than duplicated.
- **Language matching** — inbound email is translated for processing and replies
  are generated back in the original language.

## Stack

- **n8n** — orchestration (57 nodes)
- **Gmail** — inbound trigger + outbound replies/notifications
- **Groq** — LLM extraction, scoring reasons, spam/confidence checks, replies
  (Llama 3.3 70B)
- **Hugging Face Inference** — embeddings (`all-MiniLM-L6-v2`) for retrieval
- **Supabase (pgvector)** — lead store, message log, and vector knowledge base
- **Twenty CRM** — task + custom-field creation via REST API

## Setup

1. Import `icp-lead-pipeline.json` into n8n (Workflows → Import from File).
2. Copy `.env.example` to `.env` and fill in your own keys. **Never commit `.env`.**
   ```bash
   cp .env.example .env
   ```
3. In n8n, add the credentials the workflow references (every credential ID in
   the JSON is a placeholder):
   - **Supabase** credential for the Supabase nodes.
   - **Gmail OAuth2** credential(s) for the triggers and send nodes.
   - Expose `GROQ_API_KEY`, `HF_API_KEY`, `SUPABASE_KEY`, and `TWENTY_API_KEY`
     to n8n as environment variables — the HTTP and code nodes read them via
     `{{ $env.GROQ_API_KEY }}` and `process.env.SUPABASE_KEY`.
4. Create the Supabase schema: a `crm_leads` table, a `messages` log table, a
   vector table with a `match_knowledge` RPC, and a scoring function/trigger that
   assigns `score` and `tier` on insert.
5. Point `TWENTY_HOST` / `SUPABASE_URL` / `N8N_HOST` at your own instances.

## Notes

- This is a prototype. The brand, clients, catalogue, and all data are sample /
  fictional.
- Every key, token, URL, and credential ID in the workflow is a placeholder —
  supply your own via `.env` / n8n credentials.
