create table public.drafts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, payload jsonb not null, created_at timestamptz not null default now());
alter table public.drafts enable row level security;
create policy "Own drafts only" on public.drafts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
insert into storage.buckets (id,name,public,file_size_limit) values ('assets','assets',false,52428800) on conflict do nothing;
create policy "Own assets only" on storage.objects for all to authenticated using (bucket_id='assets' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='assets' and (storage.foldername(name))[1]=auth.uid()::text);
create table public.generation_usage (user_id uuid not null references auth.users(id) on delete cascade, day date not null, count integer not null, primary key(user_id,day));
alter table public.generation_usage enable row level security;
create or replace function public.consume_generation() returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if auth.uid() is null then return false; end if;
 insert into public.generation_usage(user_id,day,count) values(auth.uid(),current_date,1)
 on conflict(user_id,day) do update set count=generation_usage.count+1 where generation_usage.count<20 returning count into n;
 return n is not null;
end; $$;
revoke all on function public.consume_generation() from public;
grant execute on function public.consume_generation() to authenticated;
