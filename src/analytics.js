import { dateOnly, invalid } from './validation.js';

export function reportRange(params) {
  for (const key of params.keys()) if (!['from', 'to'].includes(key) || params.getAll(key).length !== 1) invalid();
  const from = dateOnly(params.get('from')), to = dateOnly(params.get('to'));
  const days = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1;
  if (days < 1 || days > 366) invalid();
  return { from, to };
}

// A single statement gives every component the same committed snapshot. Each
// source is aggregated independently, avoiding multiplied counts from joins.
export const reportSql = `WITH bounds AS (
  SELECT $2::date AS first_day, $3::date AS last_day,
    $2::date::timestamp AT TIME ZONE $4 AS start_at,
    ($3::date + 1)::timestamp AT TIME ZONE $4 AS end_at,
    statement_timestamp() AS as_of
), a AS (
  SELECT status, ends_at, (starts_at AT TIME ZONE $4)::date AS day
  FROM appointments, bounds WHERE clinic_id=$1 AND starts_at>=start_at AND starts_at<end_at
), ac AS (
  SELECT count(*)::int AS total,
    count(*) FILTER (WHERE status='scheduled')::int AS scheduled,
    count(*) FILTER (WHERE status='checked_in')::int AS checked_in,
    count(*) FILTER (WHERE status='cancelled')::int AS cancelled,
    count(*) FILTER (WHERE status='completed')::int AS completed,
    count(*) FILTER (WHERE status='no_show')::int AS no_show,
    count(*) FILTER (WHERE status='completed' AND ends_at<=bounds.as_of)::int AS ended_completed,
    count(*) FILTER (WHERE status='no_show' AND ends_at<=bounds.as_of)::int AS ended_no_show
  FROM a CROSS JOIN bounds
), rc AS (
  SELECT count(*)::int AS total,
    count(*) FILTER (WHERE status='pending')::int AS pending,
    count(*) FILTER (WHERE status='contacted')::int AS contacted,
    count(*) FILTER (WHERE status='closed')::int AS closed,
    count(*) FILTER (WHERE status IN ('pending','contacted') AND due_date<(bounds.as_of AT TIME ZONE $4)::date)::int AS overdue_open
  FROM recalls CROSS JOIN bounds WHERE clinic_id=$1 AND due_date BETWEEN first_day AND last_day
), dc AS (
  SELECT count(*)::int AS total,
    count(*) FILTER (WHERE status='draft')::int AS draft,
    count(*) FILTER (WHERE status='approved')::int AS approved,
    count(*) FILTER (WHERE status='rejected')::int AS rejected,
    count(*) FILTER (WHERE status='failed')::int AS failed,
    count(*) FILTER (WHERE status='simulated')::int AS simulated,
    COALESCE(sum(attempts),0)::int AS attempts
  FROM automation_drafts CROSS JOIN bounds WHERE clinic_id=$1 AND created_at>=start_at AND created_at<end_at
), daily AS (
  SELECT day, count(*)::int AS total,
    count(*) FILTER (WHERE status='completed' AND ends_at<=bounds.as_of)::int AS ended_completed,
    count(*) FILTER (WHERE status='no_show' AND ends_at<=bounds.as_of)::int AS ended_no_show
  FROM a CROSS JOIN bounds GROUP BY day
), series AS (
  SELECT first_day + n AS day FROM bounds CROSS JOIN LATERAL generate_series(0,last_day-first_day) n
)
SELECT jsonb_build_object(
  'from',first_day::text,'to',last_day::text,'timezone',$4::text,'as_of',as_of,
  'appointments',to_jsonb(ac) || jsonb_build_object(
    'resolved_outcomes',ended_completed+ended_no_show,
    'no_show_rate',ended_no_show::numeric / NULLIF(ended_completed+ended_no_show,0)),
  'recalls',to_jsonb(rc) || jsonb_build_object('closure_rate',rc.closed::numeric / NULLIF(rc.total,0)),
  'automation',to_jsonb(dc),
  'daily',(SELECT jsonb_agg(jsonb_build_object('date',s.day::text,'total',COALESCE(d.total,0),
    'ended_completed',COALESCE(d.ended_completed,0),'ended_no_show',COALESCE(d.ended_no_show,0)) ORDER BY s.day)
    FROM series s LEFT JOIN daily d ON s.day=d.day)
) AS data FROM bounds CROSS JOIN ac CROSS JOIN rc CROSS JOIN dc`;

export async function analytics(client, actor, params) {
  const { from, to } = reportRange(params);
  return (await client.query(reportSql, [actor.clinic_id, from, to, actor.timezone])).rows[0].data;
}
