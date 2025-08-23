-- Create leaderboard function for team performance tracking
create or replace function leaderboard_for_team(tid uuid)
returns table(user_id uuid, email text, replies int, meetings int)
language sql as $$
  select m.user_id,
         p.email,
         count(r.*) filter (where true) as replies,
         count(r.*) filter (where r.meeting_booked) as meetings
  from team_members m
  join profiles p on p.id = m.user_id
  left join ai_reply_events r on r.user_id = m.user_id and r.team_id = tid
  where m.team_id = tid
  group by m.user_id, p.email
  order by replies desc
$$; 