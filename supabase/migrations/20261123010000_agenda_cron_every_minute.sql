-- Process due reminders every minute rather than every ten minutes.
-- Existing authenticated cron endpoint and secret remain unchanged.
do $$
declare job_id bigint;
begin
 select jobid into job_id from cron.job where jobname='tendi-agenda-reminders' limit 1;
 if job_id is null then
   raise exception 'Expected agenda cron job not found';
 end if;
 perform cron.alter_job(job_id, schedule => '* * * * *');
end $$;
