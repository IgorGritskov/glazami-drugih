-- Version 0.2.1. Run the whole file in Supabase SQL Editor as project owner.
-- No auth accounts, no public reads, no generic anonymous UPDATE policy.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists mirror_private;
revoke all on schema mirror_private from public, anon, authenticated;

create table if not exists public.mirror_sessions (
 id uuid primary key, profile_id text not null,
 created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
 last_step text, last_event_at timestamptz,
 result_viewed_at timestamptz, reward_opened_at timestamptz,
 create_mirror_clicked boolean not null default false,
 result_card_generated boolean not null default false, result_card_saved boolean not null default false,
 share_clicked boolean not null default false, share_success boolean not null default false,
 referred_by text, source text not null default 'direct' check (source in ('telegram','whatsapp','direct','test')),
 duration_seconds integer check (duration_seconds >= 0), lead_interest boolean not null default false
);
create table if not exists mirror_private.session_keys (
 session_id uuid primary key references public.mirror_sessions(id) on delete cascade,
 token_hash text not null
);
create table if not exists public.mirror_responses (
 session_id uuid primary key references public.mirror_sessions(id), profile_id text not null,
 familiarity_score integer not null check(familiarity_score between 1 and 10),
 relationship text not null, relationship_other text not null default '' check(length(relationship_other)<=120),
 strengths text[] not null check(cardinality(strengths)=3), potential text[] not null check(cardinality(potential) between 1 and 2),
 blind_spot text not null, blind_spot_other text not null default '' check(length(blind_spot_other)<=120),
 risks text[] not null check(cardinality(risks) between 1 and 2), risk_other text not null default '' check(length(risk_other)<=120),
 project_role text not null, trust_score integer not null check(trust_score between 1 and 10),
 trust_situations text[] not null check(cardinality(trust_situations) between 1 and 2),
 open_answer text not null default '' check(length(open_answer)<=300), created_at timestamptz not null default now()
);
create table if not exists public.mirror_events (
 id uuid primary key, session_id uuid not null references public.mirror_sessions(id),
 event_name text not null, created_at timestamptz not null default now(), step text, metadata jsonb not null default '{}'
);
create index if not exists mirror_events_session_idx on public.mirror_events(session_id,created_at);
create table if not exists public.mirror_feedback (
 id uuid primary key default gen_random_uuid(), session_id uuid not null unique references public.mirror_sessions(id),
 rating integer not null check(rating between 1 and 5),
 create_own_intent text not null check(create_own_intent in ('yes','maybe','no')),
 comment text check(length(comment)<=300), created_at timestamptz not null default now()
);
create table if not exists public.mirror_leads (
 id uuid primary key, telegram_username text not null check(telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'),
 created_at timestamptz not null default now(), source text not null default 'pilot' check(source='pilot')
);
create table if not exists public.mirror_shares (
 id uuid primary key default gen_random_uuid(), share_id text not null unique check(share_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
 created_at timestamptz not null default now(), source_session_id uuid not null references public.mirror_sessions(id)
);

-- RLS deliberately has NO anon/authenticated table policies: deny all direct access.
-- Writes are narrowly scoped RPCs below. Dashboard/SQL Editor owner can read.
alter table public.mirror_sessions enable row level security;
alter table public.mirror_responses enable row level security;
alter table public.mirror_events enable row level security;
alter table public.mirror_feedback enable row level security;
alter table public.mirror_leads enable row level security;
alter table public.mirror_shares enable row level security;
alter table mirror_private.session_keys enable row level security;
revoke all on public.mirror_sessions, public.mirror_responses, public.mirror_events, public.mirror_feedback, public.mirror_leads, public.mirror_shares from public, anon, authenticated;
revoke all on mirror_private.session_keys from public, anon, authenticated;

create or replace function public.mirror_ingest(
 p_session_id uuid, p_write_token text, p_profile_id text, p_created_at timestamptz,
 p_source text default 'direct', p_referred_by text default null,
 p_events jsonb default '[]', p_response jsonb default null,
 p_feedback jsonb default null, p_share_id text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare e jsonb; at_time timestamptz; name text; key_hash text; r jsonb; event_inserted integer;
begin
 if length(p_write_token) <> 72 or length(p_profile_id) > 80 or p_profile_id is null then raise exception 'Invalid session'; end if;
 if p_referred_by is not null and p_referred_by !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'Invalid referral'; end if;
 if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events)>50 then raise exception 'Invalid events'; end if;
 insert into public.mirror_sessions(id,profile_id,created_at,source,referred_by)
 values(p_session_id,p_profile_id,p_created_at,p_source,p_referred_by) on conflict(id) do nothing;
 insert into mirror_private.session_keys(session_id,token_hash)
 values(p_session_id,encode(extensions.digest(p_write_token,'sha256'),'hex')) on conflict(session_id) do nothing;
 select token_hash into key_hash from mirror_private.session_keys where session_id=p_session_id;
 if key_hash is distinct from encode(extensions.digest(p_write_token,'sha256'),'hex') then raise exception 'Invalid session capability'; end if;
 if not exists(select 1 from public.mirror_sessions where id=p_session_id and profile_id=p_profile_id) then raise exception 'Invalid profile'; end if;
 for e in select value from jsonb_array_elements(p_events) loop
  name := e->>'event_name'; at_time := (e->>'created_at')::timestamptz;
  if name not in ('app_opened','started','bio_completed','calibration_completed','question_1_completed','question_2_completed','question_3_completed','question_4_completed','question_5_completed','question_6_completed','open_answer_completed','open_answer_skipped','result_viewed','result_narrative_viewed','result_card_generated','result_card_saved','result_share_clicked','result_share_success','result_share_failed','reward_opened','create_mirror_clicked','pilot_feedback_viewed','pilot_feedback_submitted','lead_form_viewed','lead_submitted','referral_visit','step_viewed') then raise exception 'Invalid event'; end if;
  if length(coalesce(e->>'step',''))>80 or jsonb_typeof(coalesce(e->'metadata','{}'))<>'object' or octet_length(coalesce(e->'metadata','{}')::text)>1000 then raise exception 'Invalid metadata'; end if;
  if exists(select 1 from jsonb_object_keys(coalesce(e->'metadata','{}')) as fields(field_name) where field_name not in ('step','reason','method')) then raise exception 'Invalid metadata fields'; end if;
  insert into public.mirror_events(id,session_id,event_name,created_at,step,metadata)
  values((e->>'id')::uuid,p_session_id,name,at_time,e->>'step',coalesce(e->'metadata','{}')) on conflict(id) do nothing;
  get diagnostics event_inserted = row_count;
  if event_inserted = 0 then continue; end if;
  update public.mirror_sessions set
   last_step = case when e->>'step' is not null and (last_event_at is null or at_time>=last_event_at) then e->>'step' else last_step end,
   last_event_at = greatest(last_event_at,at_time),
   started_at = case when name='started' then least(started_at,at_time) else started_at end,
   result_viewed_at = case when name='result_viewed' then least(result_viewed_at,at_time) else result_viewed_at end,
   reward_opened_at = case when name='reward_opened' then least(reward_opened_at,at_time) else reward_opened_at end,
   create_mirror_clicked = create_mirror_clicked or name='create_mirror_clicked',
   result_card_generated = result_card_generated or name='result_card_generated',
   result_card_saved = result_card_saved or name='result_card_saved',
   share_clicked = share_clicked or name='result_share_clicked', share_success = share_success or name='result_share_success',
   lead_interest = lead_interest or name='lead_submitted'
  where id=p_session_id;
 end loop;
 if p_response is not null then
  r:=p_response;
  insert into public.mirror_responses(session_id,profile_id,familiarity_score,relationship,relationship_other,strengths,potential,blind_spot,blind_spot_other,risks,risk_other,project_role,trust_score,trust_situations,open_answer)
  values(p_session_id,p_profile_id,(r->>'familiarity_score')::integer,r->>'relationship',coalesce(r->>'relationship_other',''),array(select jsonb_array_elements_text(r->'strengths')),array(select jsonb_array_elements_text(r->'potential')),r->>'blind_spot',coalesce(r->>'blind_spot_other',''),array(select jsonb_array_elements_text(r->'risks')),coalesce(r->>'risk_other',''),r->>'project_role',(r->>'trust_score')::integer,array(select jsonb_array_elements_text(r->'trust_situations')),coalesce(r->>'open_answer','')) on conflict(session_id) do nothing;
  update public.mirror_sessions set completed_at=coalesce(completed_at,(r->>'completed_at')::timestamptz,now()),
   started_at=coalesce(started_at,(r->>'started_at')::timestamptz),
   duration_seconds=coalesce(duration_seconds,greatest(0,floor(extract(epoch from (coalesce((r->>'completed_at')::timestamptz,now())-(r->>'started_at')::timestamptz)))::integer)) where id=p_session_id;
 end if;
 if p_feedback is not null then
  insert into public.mirror_feedback(session_id,rating,create_own_intent,comment)
  values(p_session_id,(p_feedback->>'rating')::integer,p_feedback->>'create_own_intent',nullif(p_feedback->>'comment','')) on conflict(session_id) do nothing;
 end if;
 if p_share_id is not null then
  insert into public.mirror_shares(share_id,source_session_id) values(p_share_id,p_session_id) on conflict(share_id) do nothing;
 end if;
end; $$;

create or replace function public.mirror_submit_lead(p_id uuid, p_telegram_username text, p_source text default 'pilot')
returns void language plpgsql security definer set search_path = '' as $$
begin
 insert into public.mirror_leads(id,telegram_username,source) values(p_id,p_telegram_username,p_source) on conflict(id) do nothing;
end; $$;
revoke all on function public.mirror_ingest(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,text) from public;
revoke all on function public.mirror_submit_lead(uuid,text,text) from public;
grant execute on function public.mirror_ingest(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,text) to anon;
grant execute on function public.mirror_submit_lead(uuid,text,text) to anon;
