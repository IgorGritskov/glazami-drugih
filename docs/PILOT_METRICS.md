# Pilot Analytics · Version 0.2.1

Откройте Supabase → SQL Editor → New query. Запросы ниже работают после выполнения `supabase/schema.sql`. Это только документ для владельца: в публичном приложении нет dashboard или чтения таблиц.

Сессия — одно анонимное прохождение, **не человек**. Refresh сохраняет ID, «Пройти заново» / `reset=1` создаёт новый. Уникальные люди не идентифицируются. События повторных действий допустимы; funnel считается по уникальным строкам сессий. `src=test` можно исключать, добавив `where source <> 'test'` в запросы к сессиям или join с ними.

Главные показатели:

- Completion Rate = completed / started.
- Mirror Intent Rate = (yes + maybe) / submitted feedback.
- Strong Intent = yes / submitted feedback.
- Share Rate = sessions with successful share / result viewed.
- Referral Conversion = referred completed / referral visits.
- Lead Conversion = leads / completed (агрегированное отношение, контакты не соединяются с ответами).

Сначала смотрите completion и места ухода, затем среднюю оценку и intent. Проценты на 10–30 прохождениях показывайте вместе с абсолютными числами. Feedback необязателен: его intent описывает только оставивших оценку. Успех Web Share означает завершение системного share-вызова, а не доказанную публикацию. Скачивание PNG — событие сохранения, не успешный share. Непереданная при offline телеметрия попадёт в Dashboard после восстановления связи/следующего открытия.

## A. Total funnel

```sql
select count(*) as opened,
 count(*) filter(where started_at is not null) as started,
 count(*) filter(where completed_at is not null) as completed,
 count(*) filter(where result_viewed_at is not null) as result_viewed,
 count(*) filter(where reward_opened_at is not null) as reward_opened,
 count(*) filter(where create_mirror_clicked) as create_mirror_clicked,
 count(*) filter(where result_card_generated) as card_generated,
 count(*) filter(where result_card_saved) as card_saved,
 count(*) filter(where share_clicked) as share_clicked,
 count(*) filter(where share_success) as shared,
 count(*) filter(where lead_interest) as lead_interest,
 round(avg(duration_seconds) filter(where completed_at is not null),1) as average_duration_seconds,
 (select count(*) from public.mirror_leads) as voluntary_leads
from public.mirror_sessions;
```

## B. Conversion (percent)

```sql
with s as (
 select count(*)::numeric as opened,
 count(*) filter(where started_at is not null)::numeric as started,
 count(*) filter(where completed_at is not null)::numeric as completed,
 count(*) filter(where result_viewed_at is not null)::numeric as viewed,
 count(*) filter(where create_mirror_clicked)::numeric as create_clicked,
 count(*) filter(where share_success)::numeric as shared from public.mirror_sessions
), f as (
 select count(*)::numeric as submitted,
 count(*) filter(where create_own_intent in ('yes','maybe'))::numeric as positive,
 count(*) filter(where create_own_intent='yes')::numeric as strong from public.mirror_feedback
)
select round(100*started/nullif(opened,0),1) as start_rate,
 round(100*completed/nullif(started,0),1) as completion_rate,
 round(100*create_clicked/nullif(viewed,0),1) as create_click_rate,
 round(100*positive/nullif(submitted,0),1) as mirror_intent_rate,
 round(100*strong/nullif(submitted,0),1) as strong_intent,
 round(100*shared/nullif(viewed,0),1) as share_rate,
 round(100*(select count(*) from public.mirror_leads)/nullif(completed,0),1) as lead_rate
from s cross join f;
```

## C. Feedback

```sql
select count(*) as submitted_feedback, round(avg(rating),2) as average_rating
from public.mirror_feedback;

select create_own_intent, count(*) as responses,
 round(100.0*count(*)/nullif(sum(count(*)) over(),0),1) as percent
from public.mirror_feedback group by create_own_intent order by responses desc;

select created_at, rating, create_own_intent, comment
from public.mirror_feedback where nullif(trim(comment),'') is not null order by created_at desc;
```

## D. Answers

```sql
select choice, count(*) as votes from public.mirror_responses r
cross join lateral unnest(r.strengths) as choices(choice) group by choice order by votes desc;

select choice, count(*) as votes from public.mirror_responses r
cross join lateral unnest(r.potential) as choices(choice) group by choice order by votes desc;

select blind_spot, count(*) as votes from public.mirror_responses group by blind_spot order by votes desc;

select choice, count(*) as votes from public.mirror_responses r
cross join lateral unnest(r.risks) as choices(choice) group by choice order by votes desc;

select project_role, count(*) as votes from public.mirror_responses group by project_role order by votes desc;

select round(avg(trust_score),2) as average_trust,
 round(avg(familiarity_score),2) as average_familiarity from public.mirror_responses;

select relationship, count(*) as votes from public.mirror_responses group by relationship order by votes desc;

select choice, count(*) as votes from public.mirror_responses r
cross join lateral unnest(r.trust_situations) as choices(choice) group by choice order by votes desc;

select created_at, open_answer, blind_spot_other, risk_other, relationship_other
from public.mirror_responses
where open_answer<>'' or blind_spot_other<>'' or risk_other<>'' or relationship_other<>''
order by created_at desc;
```

## E. Drop-off и этапы

Сессии без завершения могут ещё проходить анкету. Условие ниже ждёт 30 минут последней активности; это рабочий ориентир, не доказательство ухода. `step_viewed` фиксирует достигнутый экран, а события `question_*_completed` — успешный ответ. Refresh и повторный заход в результат не увеличивают число уникальных сессий.

```sql
select coalesce(last_step,'intro') as last_reached_step, count(*) as incomplete_sessions
from public.mirror_sessions where completed_at is null
and coalesce(last_event_at,created_at)<now()-interval '30 minutes'
group by last_step order by incomplete_sessions desc;

select step, count(distinct session_id) as sessions_reached
from public.mirror_events where event_name='step_viewed' group by step order by step;

select event_name, count(distinct session_id) as sessions
from public.mirror_events where event_name like 'question_%_completed'
or event_name in ('app_opened','started','bio_completed','calibration_completed','open_answer_completed','open_answer_skipped','result_viewed','reward_opened','create_mirror_clicked')
group by event_name order by event_name;
```

## F. Referral

Публичный `ref` — случайный share ID, а не ID исходного прохождения. `source_session_id` остаётся только в закрытой таблице shares. Приходы считаются по сессиям; повторное прохождение того же человека создаёт новую сессию. Если посетитель пришёл раньше регистрации share, ref сохранится и позже сопоставится. Несопоставленный ref показывается отдельно.

```sql
select count(*) filter(where referred_by is not null) as total_referral_visits,
 count(*) filter(where referred_by is not null and completed_at is not null) as completed_referral_visits,
 round(100.0*count(*) filter(where referred_by is not null and completed_at is not null)
 /nullif(count(*) filter(where referred_by is not null),0),1) as referral_conversion_percent
from public.mirror_sessions;

with shares as (select count(*)::numeric as total from public.mirror_shares),
 visits as (select count(*)::numeric as total from public.mirror_sessions s
 where exists(select 1 from public.mirror_shares sh where sh.share_id=s.referred_by))
select shares.total as successful_share_links, visits.total as attributed_new_sessions,
 round(visits.total/nullif(shares.total,0),2) as new_sessions_per_share,
 round(100.0*(select count(*) from public.mirror_shares sh
 where exists(select 1 from public.mirror_sessions s where s.referred_by=sh.share_id))
 /nullif(shares.total,0),1) as shares_with_visit_percent from shares cross join visits;

select sh.share_id, count(s.id) as new_sessions,
 count(s.id) filter(where s.completed_at is not null) as completed_sessions
from public.mirror_shares sh left join public.mirror_sessions s on s.referred_by=sh.share_id
group by sh.share_id order by new_sessions desc;

select source, count(*) as opened, count(*) filter(where completed_at is not null) as completed
from public.mirror_sessions group by source order by opened desc;
```

## Privacy и ограничения

Приложение не пишет в модель имя респондента, телефон, IP, user-agent, fingerprint или Telegram ID. Только добровольный username хранится в `mirror_leads`: без session ID, ref, ответов и токена. Для контактов всегда используется общий `source=pilot`; нет join с анкетой. SQL не делает вид, что временные метки или инфраструктурные логи провайдера обеспечивают абсолютную неидентифицируемость: статистика сессий технически псевдонимная. Внешний Supabase может иметь собственные служебные сетевые логи; наше приложение их не собирает.

Без login запись разрешена только через два RPC. RLS включён, прямые INSERT/UPDATE/SELECT для anon запрещены. `mirror_ingest` проверяет локальный случайный capability-token; его SHA-256 хранится в закрытой схеме. Это техническое право записи одной сессии, не идентификация человека. `mirror_submit_lead` не принимает session ID. Ни service-role key, ни credentials БД не нужны клиенту.
