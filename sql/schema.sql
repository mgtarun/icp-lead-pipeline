-- =====================================================================
-- ICP Lead Scoring & Reply Pipeline : Supabase / Postgres schema
-- Run once in the Supabase SQL Editor before importing the n8n workflow.
--
-- Contents
--   1. Extensions
--   2. Tables      : crm_leads, crm_email_messages, delivery_zones, knowledge
--   3. Scoring     : score_crm_lead (Enterprise "K" path)
--                    score_consumer_lead (Consumer path)
--                    score_retail_lead (Retail path)
--   4. RPCs        : match_knowledge (RAG), get_recent_email_messages (memory)
--   5. Triggers
--
-- Design note: lead scores are computed here in SQL, not by the LLM.
-- The LLM only extracts structured signals; scoring is deterministic,
-- auditable and reproducible.
-- =====================================================================


-- 1. EXTENSIONS ---------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector for RAG


-- 2. TABLES -------------------------------------------------------------

-- One row per lead. Path specific signal columns are filled by the LLM
-- extraction step; score / tier / flags are filled by the scoring triggers.
create table if not exists public.crm_leads (
  id                          uuid primary key default gen_random_uuid(),
  path                        text default 'k',          -- 'k' | 'consumer' | 'retail'
  title                       text,
  conversation_id             text,                      -- Gmail thread id
  email_subject               text,
  email_body                  text,
  original_body               text,
  translated_body             text,
  detected_language           text default 'en',

  -- contact
  sender_name                 text,
  sender_email                text,
  sender_phone                text,
  company_name                text,
  team_size                   integer,

  -- K path (enterprise) signals
  sector_fit_signal           text,
  sector_fit_confidence       text,
  stated_revenue_aud          bigint,
  exec_sponsor_signal         text,
  ai_appetite_signal          text,
  budget_timeline_signal      text,
  budget_signal               text,
  timeline_signal             text,
  relationship_signal         text,
  cannot_influence            boolean default false,

  -- Consumer path signals
  purchase_intent_signal      text,
  product_requested           text,
  product_fit_signal          text,
  source_channel_signal       text,
  buyer_urgency_signal        text,
  contact_completeness_signal text,
  designer_flag               boolean not null default false,
  is_custom                   boolean not null default false,

  -- Retail path signals
  wholesale_intent_signal     text,
  business_legitimacy_signal  text,
  order_volume_signal         text,
  product_range_signal        text,
  relationship_source_signal  text,
  store_count                 integer,

  -- shared signals
  price_shopping              boolean default false,
  location_signal             text,
  extracted_city              text,
  extracted_district          text,
  fields_inferred             integer default 0,         -- how many fields the LLM had to infer

  -- scoring output (written by triggers)
  raw_score                   integer,
  penalty_total               integer default 0,
  score                       integer,
  confidence_score            integer,
  confidence_level            text,
  tier                        text,
  recommended_action          text,
  attribute_scores            jsonb,
  tp_flags                    jsonb default '[]'::jsonb, -- "touch point" flags that force human review
  top_reasons                 jsonb,
  pricing_tier                text check (pricing_tier in ('retail', 'b2b_trade', 'pending_b2b_verification')),

  -- reply + human in the loop
  draft_email                 text,
  auto_reply_sent             boolean default false,
  customer_replied            boolean not null default false,
  review_status               text,                      -- PENDING | APPROVED | REJECTED | OVERRIDDEN
  reviewer_note               text,
  reviewer_email              text,
  reviewed_at                 timestamptz,
  decided_at                  timestamptz,
  sla_deadline                timestamptz,

  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

create index if not exists crm_leads_conversation_idx on public.crm_leads (conversation_id);


-- Conversation memory: every inbound and outbound email per thread.
create table if not exists public.crm_email_messages (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references public.crm_leads (id) on delete cascade,
  conversation_id   text not null,
  channel           text not null default 'email',
  direction         text not null check (direction in ('inbound', 'outbound')),
  message_text      text,
  translated_text   text,
  detected_language text default 'en',
  metadata          jsonb default '{}'::jsonb,
  created_at        timestamptz default now()
);

create index if not exists crm_email_messages_conv_idx
  on public.crm_email_messages (conversation_id, created_at desc);


-- Delivery zones used by consumer and retail scoring (location attribute).
create table if not exists public.delivery_zones (
  id         uuid primary key default gen_random_uuid(),
  country    text not null,
  city       text not null,
  zone_type  text not null check (zone_type in ('local', 'domestic', 'international')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);


-- RAG knowledge base: product and policy snippets with embeddings.
-- 384 dims = sentence-transformers/all-MiniLM-L6-v2
create table if not exists public.knowledge (
  id         uuid primary key default gen_random_uuid(),
  category   text,
  product    text,
  content    text,
  embedding  vector(384),
  created_at timestamptz default now()
);

create index if not exists knowledge_embedding_idx
  on public.knowledge using hnsw (embedding vector_cosine_ops);


-- 3. SCORING FUNCTIONS --------------------------------------------------
-- Each path has six weighted attributes summing to 100, minus penalties.
-- Any tp_flag forces the lead into human review.

-- 3a. Enterprise "K" path -------------------------------------------------
create or replace function public.score_crm_lead()
returns trigger
language plpgsql
as $$
declare
  s_sector   int := 0;  s_revenue  int := 0;  s_sponsor  int := 0;
  s_appetite int := 0;  s_budget   int := 0;  s_relation int := 0;
  p_total    int := 0;
  conf_inferred int := 0;
  raw   int := 0;
  final int := 0;
  tp    jsonb := '[]'::jsonb;
begin
  if coalesce(new.path, 'k') != 'k' then
    return new;
  end if;

  -- 1. Sector fit [20]
  s_sector := case new.sector_fit_signal
    when 'core' then 20 when 'adjacent' then 12
    when 'problem_match' then 6 else 0 end;
  if new.sector_fit_signal in ('problem_match', 'no_fit') then
    tp := tp || '["TP3"]'::jsonb;
  end if;

  -- 2. Revenue band [20]  (sweet spot AUD 20M to 300M)
  s_revenue := case
    when new.stated_revenue_aud is null then 0
    when new.stated_revenue_aud between 20000000 and 300000000 then 20
    when new.stated_revenue_aud between 10000000 and 19999999
      or new.stated_revenue_aud between 300000001 and 500000000 then 12
    when new.stated_revenue_aud between 5000000 and 9999999 then 6
    else 0 end;
  if new.stated_revenue_aud is not null
     and (new.stated_revenue_aud < 5000000 or new.stated_revenue_aud > 500000000) then
    tp := tp || '["TP2"]'::jsonb;
  end if;

  -- 3. Executive sponsor [20]
  s_sponsor := case new.exec_sponsor_signal
    when 'named_mandate' then 20 when 'engaged_no_mandate' then 12
    when 'will_find' then 6 else 0 end;
  if new.exec_sponsor_signal in ('engaged_no_mandate', 'will_find') then
    tp := tp || '["TP1"]'::jsonb;
  end if;

  -- 4. AI appetite [15]
  s_appetite := case new.ai_appetite_signal
    when 'mandate_approved' then 15 when 'mandate_pending' then 10
    when 'personal_initiative' then 5 else 0 end;

  -- 5. Budget + timeline [15]
  s_budget := case new.budget_timeline_signal
    when 'both_clear' then 15 when 'one_clear' then 10
    when 'both_approximate' then 5 else 0 end;
  if new.budget_timeline_signal = 'neither' then
    tp := tp || '["TP1"]'::jsonb;
  end if;

  -- 6. Relationship source [10]
  s_relation := case new.relationship_signal
    when 'trusted_intro' then 10 when 'general_intro' then 7
    when 'event_met' then 4 else 0 end;
  if new.relationship_signal in ('trusted_intro', 'general_intro') then
    tp := tp || '["TP5"]'::jsonb;
  end if;

  raw := s_sector + s_revenue + s_sponsor + s_appetite + s_budget + s_relation;

  -- Penalties
  if new.exec_sponsor_signal = 'none' then
    p_total := p_total + 20;
    tp := tp || '["TP3"]'::jsonb;
  end if;
  if new.budget_timeline_signal = 'neither' then p_total := p_total + 15; end if;
  if new.price_shopping = true          then p_total := p_total + 30; end if;
  if new.cannot_influence = true        then p_total := p_total + 25; end if;

  final := greatest(0, raw - p_total);

  -- Confidence: fewer inferred fields = higher confidence
  conf_inferred := least(coalesce(new.fields_inferred, 0), 6);
  new.confidence_level := case
    when conf_inferred = 0 and coalesce(new.sector_fit_confidence, 'inferred') = 'stated' then 'High'
    when conf_inferred <= 2 then 'Medium'
    else 'Low' end;
  new.confidence_score := greatest(0, 100 - conf_inferred * 17);

  new.raw_score     := raw;
  new.penalty_total := p_total;
  new.score         := final;

  new.tier := case
    when final >= 75 then 'High priority'
    when final >= 40 then 'Medium priority'
    when final >= 1  then 'Low priority'
    else 'Flagged' end;

  new.recommended_action := case
    when final >= 75 then 'Review — high priority'
    when final >= 40 then 'Review — medium priority'
    else 'Review — low priority' end;

  new.tp_flags := (select jsonb_agg(distinct v) from jsonb_array_elements_text(tp) v);
  if jsonb_array_length(coalesce(new.tp_flags, '[]'::jsonb)) > 0 then
    new.tier := 'Flagged — ' || new.tier;
  end if;

  new.attribute_scores := jsonb_build_object(
    'sector_fit', s_sector, 'revenue', s_revenue, 'exec_sponsor', s_sponsor,
    'ai_appetite', s_appetite, 'budget_timeline', s_budget,
    'relationship', s_relation, 'penalty_total', p_total);

  new.path := coalesce(new.path, 'k');
  return new;
end;
$$;


-- 3b. Consumer path ------------------------------------------------------
create or replace function public.score_consumer_lead()
returns trigger
language plpgsql
as $$
declare
  s_intent int := 0;  s_location int := 0;  s_product int := 0;
  s_channel int := 0; s_urgency int := 0;   s_completeness int := 0;
  raw_total int := 0; penalty int := 0;     final_score int := 0;
  tp jsonb := '[]'::jsonb;
  zone_result text;
begin
  if coalesce(new.path, 'consumer') != 'consumer' then
    return new;
  end if;

  -- 1. Purchase intent [25]
  s_intent := case new.purchase_intent_signal
    when 'direct_intent' then 25 when 'high_interest' then 16
    when 'passive_interest' then 8 else 0 end;
  if new.purchase_intent_signal in ('passive_interest', 'no_signal') then
    tp := tp || '["TP1"]'::jsonb;
  end if;

  -- 2. Location [20]  (hard disqualify if outside every delivery zone)
  if coalesce(new.extracted_city, '') = '' then
    new.location_signal := 'no_address';
    tp := tp || '["TP6"]'::jsonb;
  else
    select zone_type into zone_result
      from public.delivery_zones
     where city ilike new.extracted_city and active
     limit 1;

    if zone_result = 'local' then
      s_location := 20; new.location_signal := 'local_zone';
    elsif zone_result = 'domestic' then
      s_location := 14; new.location_signal := 'domestic';
    elsif zone_result = 'international' then
      s_location := 8;  new.location_signal := 'international';
    else
      new.score := 0; new.raw_score := 0; new.penalty_total := 0;
      new.tier := 'Disqualified'; new.recommended_action := 'Reject';
      new.confidence_level := 'High'; new.confidence_score := 0;
      new.tp_flags := '["DISQUALIFIED","ADDRESS_OUTSIDE_ALL_ZONES"]'::jsonb;
      new.location_signal := 'no_address';
      return new;
    end if;
  end if;

  -- 3. Product fit [20]  (hard disqualify if unavailable)
  if new.product_fit_signal = 'unavailable' then
    new.score := 0; new.raw_score := 0; new.penalty_total := 0;
    new.tier := 'Disqualified'; new.recommended_action := 'Reject';
    new.confidence_level := 'High'; new.confidence_score := 0;
    new.tp_flags := '["DISQUALIFIED","PRODUCT_UNAVAILABLE"]'::jsonb;
    new.attribute_scores := jsonb_build_object(
      'purchase_intent', s_intent, 'location', s_location, 'product_fit', 0,
      'source_channel', 0, 'buyer_urgency', 0, 'lead_completeness', 0);
    return new;
  end if;
  s_product := case new.product_fit_signal
    when 'similar' then 13 when 'custom_order' then 5 else 13 end;

  -- 4. Source channel [15]
  s_channel := case new.source_channel_signal
    when 'paid_ad_click' then 15 when 'direct_message' then 11
    when 'organic_comment' then 6 else 0 end;

  -- 5. Buyer urgency [10]
  s_urgency := case new.buyer_urgency_signal
    when 'immediate' then 10 when 'normal' then 5
    when 'unknown' then 0 else 5 end;
  if new.buyer_urgency_signal = 'unknown' then
    tp := tp || '["TP3"]'::jsonb;
  end if;
  if new.designer_flag and new.buyer_urgency_signal = 'immediate' then
    tp := tp || '["designer_urgent"]'::jsonb;
  end if;

  -- 6. Lead completeness [10]
  s_completeness := case new.contact_completeness_signal
    when 'full_contact' then 10 when 'two_of_three' then 7
    when 'minimal' then 3 when 'no_contact' then 0 else 7 end;
  if new.contact_completeness_signal in ('minimal', 'no_contact') then
    tp := tp || '["TP6"]'::jsonb;
  end if;

  raw_total := s_intent + s_location + s_product + s_channel + s_urgency + s_completeness;

  if new.price_shopping then penalty := penalty + 20; end if;
  if new.designer_flag then tp := tp || '["TP5"]'::jsonb; end if;

  final_score := greatest(0, raw_total - penalty);

  new.confidence_level := case
    when coalesce(new.fields_inferred, 0) = 0  then 'High'
    when coalesce(new.fields_inferred, 0) <= 2 then 'Medium'
    else 'Low' end;
  new.confidence_score := greatest(0, 100 - coalesce(new.fields_inferred, 0) * 17);

  new.tier := case
    when final_score >= 75 then 'Hot'
    when final_score >= 50 then 'Warm'
    else 'Cold' end;

  if jsonb_array_length(tp) > 0 then
    new.recommended_action := 'Review';
  else
    new.recommended_action := case
      when final_score >= 75 then 'Approve'
      when final_score <  50 then 'Reject'
      else 'Review' end;
  end if;

  new.pricing_tier := case when new.designer_flag then 'pending_b2b_verification' else 'retail' end;

  new.score         := final_score;
  new.raw_score     := raw_total;
  new.penalty_total := penalty;
  new.tp_flags := (select jsonb_agg(distinct v) from jsonb_array_elements_text(tp) v);
  new.attribute_scores := jsonb_build_object(
    'purchase_intent', s_intent, 'location', s_location, 'product_fit', s_product,
    'source_channel', s_channel, 'buyer_urgency', s_urgency,
    'lead_completeness', s_completeness, 'penalty_total', penalty);

  return new;
end;
$$;


-- 3c. Retail (B2B) path --------------------------------------------------
-- Hard rule: retail leads are never auto approved or auto rejected.
create or replace function public.score_retail_lead()
returns trigger
language plpgsql
as $$
declare
  s_wholesale int := 0;  s_legitimacy int := 0;  s_volume int := 0;
  s_range int := 0;      s_location int := 0;    s_relationship int := 0;
  raw_total int := 0;    penalty int := 0;       final_score int := 0;
  tp jsonb := '[]'::jsonb;
  zone_result text;
begin
  if coalesce(new.path, 'retail') != 'retail' then
    return new;
  end if;

  -- 1. Wholesale intent [25]
  s_wholesale := case new.wholesale_intent_signal
    when 'explicit_wholesale' then 25 when 'moq_volume' then 18
    when 'range_inquiry' then 10 else 0 end;
  if new.wholesale_intent_signal = 'no_b2b_signal' then tp := tp || '["TP7"]'::jsonb; end if;
  if new.wholesale_intent_signal = 'range_inquiry' then tp := tp || '["TP3"]'::jsonb; end if;

  -- 2. Business legitimacy [20]
  s_legitimacy := case new.business_legitimacy_signal
    when 'full_identity' then 20 when 'name_address_only' then 13
    when 'unverified_claim' then 6 else 0 end;
  if new.business_legitimacy_signal in ('unverified_claim', 'no_identity') then
    tp := tp || '["TP1"]'::jsonb;
  end if;
  if new.business_legitimacy_signal = 'no_identity' then
    tp := tp || '["TP6"]'::jsonb;
    penalty := penalty + 20;
  end if;

  -- 3. Order volume [20]
  s_volume := case new.order_volume_signal
    when 'high_volume' then 20 when 'clear_single' then 14
    when 'small_unstated' then 7 else 0 end;
  if new.order_volume_signal in ('small_unstated', 'no_volume_signal') then
    tp := tp || '["TP1"]'::jsonb;
  end if;

  -- 4. Product range [15]  (hard disqualify if no overlap)
  if new.product_range_signal = 'no_overlap' then
    new.score := 0; new.raw_score := 0; new.penalty_total := 0;
    new.tier := 'Disqualified'; new.recommended_action := 'Reject';
    new.confidence_level := 'High'; new.confidence_score := 0;
    new.tp_flags := '["DISQUALIFIED","NO_PRODUCT_OVERLAP"]'::jsonb;
    new.attribute_scores := jsonb_build_object(
      'wholesale_intent', s_wholesale, 'business_legitimacy', s_legitimacy,
      'order_volume', s_volume, 'product_range', 0, 'location', 0, 'relationship', 0);
    return new;
  end if;
  s_range := case new.product_range_signal
    when 'specialist' then 15 when 'general_with_furniture' then 10
    when 'adjacent_category' then 6 else 10 end;

  -- 5. Location [10]
  if coalesce(new.extracted_city, '') = '' then
    new.location_signal := 'no_address';
    tp := tp || '["TP6"]'::jsonb;
  else
    select zone_type into zone_result
      from public.delivery_zones
     where city ilike new.extracted_city and active
     limit 1;

    if zone_result = 'local' then
      s_location := 10; new.location_signal := 'local_zone';
    elsif zone_result = 'domestic' then
      s_location := 8;  new.location_signal := 'domestic';
    elsif zone_result = 'international' then
      s_location := 5;  new.location_signal := 'international';
    else
      new.location_signal := 'no_address';
      tp := tp || '["TP6"]'::jsonb;
    end if;
  end if;

  -- 6. Relationship source [10]
  s_relationship := case new.relationship_source_signal
    when 'partner_referral' then 10 when 'trade_show' then 8
    when 'outbound_pursuit' then 4 else 2 end;
  if new.relationship_source_signal in ('partner_referral', 'trade_show') then
    tp := tp || '["TP5"]'::jsonb;
  end if;

  raw_total   := s_wholesale + s_legitimacy + s_volume + s_range + s_location + s_relationship;
  final_score := greatest(0, raw_total - penalty);

  new.confidence_level := case
    when coalesce(new.fields_inferred, 0) = 0  then 'High'
    when coalesce(new.fields_inferred, 0) <= 2 then 'Medium'
    else 'Low' end;
  new.confidence_score := greatest(0, 100 - coalesce(new.fields_inferred, 0) * 17);

  new.tier := case
    when final_score >= 75 then 'High priority'
    when final_score >= 50 then 'Standard'
    else 'Low priority' end;

  if jsonb_array_length(tp) > 0 then
    new.recommended_action := 'Review — flagged';
  else
    new.recommended_action := case
      when final_score >= 75 then 'Review — high priority'
      when final_score >= 50 then 'Review — standard'
      else 'Review — low priority' end;
  end if;

  new.pricing_tier := case
    when new.wholesale_intent_signal in ('explicit_wholesale', 'moq_volume', 'range_inquiry')
      then 'b2b_trade' else 'retail' end;

  new.score         := final_score;
  new.raw_score     := raw_total;
  new.penalty_total := penalty;
  new.tp_flags := (select jsonb_agg(distinct v) from jsonb_array_elements_text(tp) v);
  new.attribute_scores := jsonb_build_object(
    'wholesale_intent', s_wholesale, 'business_legitimacy', s_legitimacy,
    'order_volume', s_volume, 'product_range', s_range, 'location', s_location,
    'relationship', s_relationship, 'penalty_total', penalty);

  return new;
end;
$$;


-- Keep updated_at fresh on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- 4. RPCs (called from n8n via /rest/v1/rpc/...) --------------------------

-- RAG: top k knowledge snippets by cosine similarity.
create or replace function public.match_knowledge(
  query_embedding vector(384),
  match_count     integer default 4
)
returns table (id uuid, category text, product text, content text, similarity double precision)
language sql
stable
as $$
  select k.id, k.category, k.product, k.content,
         1 - (k.embedding <=> query_embedding) as similarity
    from public.knowledge k
   where k.embedding is not null
   order by k.embedding <=> query_embedding
   limit match_count;
$$;

-- Conversation memory: last N messages on a thread.
create or replace function public.get_recent_email_messages(
  p_conversation_id text,
  p_limit           integer default 5
)
returns table (direction text, message_text text, created_at timestamptz)
language sql
stable
as $$
  select m.direction, m.message_text, m.created_at
    from public.crm_email_messages m
   where m.conversation_id = p_conversation_id
   order by m.created_at desc
   limit p_limit;
$$;


-- 5. TRIGGERS -------------------------------------------------------------
-- Leads are scored once, on insert. Later updates (review status, replies)
-- never re-score a lead. Each function also exits early unless the path matches.

drop trigger if exists trigger_icp_score_on_insert      on public.crm_leads;
drop trigger if exists trigger_consumer_score_on_insert on public.crm_leads;
drop trigger if exists trigger_retail_score_on_insert   on public.crm_leads;
drop trigger if exists trg_crm_leads_updated            on public.crm_leads;

create trigger trigger_icp_score_on_insert
  before insert on public.crm_leads
  for each row execute function public.score_crm_lead();

create trigger trigger_consumer_score_on_insert
  before insert on public.crm_leads
  for each row when (new.path = 'consumer')
  execute function public.score_consumer_lead();

create trigger trigger_retail_score_on_insert
  before insert on public.crm_leads
  for each row when (new.path = 'retail')
  execute function public.score_retail_lead();

create trigger trg_crm_leads_updated
  before update on public.crm_leads
  for each row execute function public.set_updated_at();
