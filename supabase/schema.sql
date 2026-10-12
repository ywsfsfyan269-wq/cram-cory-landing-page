-- Cram Cory / Supabase schema snapshot
-- Applied to project oxlojohdbpmfxhxuyyzq on 2026-10-12.
-- Keep service-role keys only in trusted server environment variables.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  unit_price_dzd integer not null check (unit_price_dzd > 0),
  currency text not null default 'DZD' check (currency = 'DZD'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) >= 3),
  phone_e164 text not null unique check (phone_e164 ~ '^\+213[0-9]{8,9}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_methods (
  code text primary key check (code in ('home', 'office')),
  name_ar text not null,
  fee_dzd integer not null check (fee_dzd >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default (
    'CC-' || to_char(now() at time zone 'Africa/Algiers', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  customer_id uuid not null references public.customers(id) on delete restrict,
  wilaya text not null check (char_length(trim(wilaya)) > 0),
  delivery_address text not null check (char_length(trim(delivery_address)) >= 5),
  delivery_method text not null references public.delivery_methods(code) on update cascade on delete restrict,
  subtotal_dzd integer not null check (subtotal_dzd >= 0),
  delivery_fee_dzd integer not null check (delivery_fee_dzd >= 0),
  total_dzd integer not null check (total_dzd = subtotal_dzd + delivery_fee_dzd),
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  unit_price_dzd integer not null check (unit_price_dzd > 0),
  quantity integer not null check (quantity between 1 and 5),
  line_total_dzd integer not null check (line_total_dzd = unit_price_dzd * quantity),
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status text,
  new_status text not null,
  note text,
  changed_by text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists public.order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  status text not null check (status in ('pending', 'sent', 'failed')),
  attempt_number integer not null default 1 check (attempt_number > 0),
  provider_message_id text,
  provider_http_status integer,
  error_message text,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_created_at_idx on public.orders (status, created_at desc);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_delivery_method_idx on public.orders (delivery_method);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists order_status_history_order_id_idx on public.order_status_history (order_id, created_at desc);
create index if not exists order_notifications_order_id_idx on public.order_notifications (order_id, attempted_at desc);

insert into public.products (slug, name, description, unit_price_dzd, currency, is_active)
values ('cram-cory-spf30', 'Cram Cory Avocado & Aloe Vera SPF 30',
        'كريم أفوكادو وألوفيرا بعامل حماية SPF 30', 1200, 'DZD', true)
on conflict (slug) do nothing;

insert into public.delivery_methods (code, name_ar, fee_dzd, is_active)
values ('home', 'التوصيل إلى المنزل', 700, true),
       ('office', 'التوصيل إلى المكتب', 400, true)
on conflict (code) do nothing;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists delivery_methods_set_updated_at on public.delivery_methods;
create trigger delivery_methods_set_updated_at before update on public.delivery_methods
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.record_order_status_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, previous_status, new_status, note, changed_by)
    values (new.id, null, new.status, 'تم إنشاء الطلب', 'system');
  elsif old.status is distinct from new.status then
    insert into public.order_status_history (order_id, previous_status, new_status, note, changed_by)
    values (new.id, old.status, new.status, null, 'system');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_record_status_change on public.orders;
create trigger orders_record_status_change after insert or update of status on public.orders
for each row execute function public.record_order_status_change();

create or replace function public.create_store_order(
  p_full_name text, p_phone text, p_wilaya text, p_delivery_address text,
  p_delivery_method text, p_quantity integer
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_unit_price integer;
  v_delivery_fee integer;
  v_subtotal integer;
  v_total integer;
  v_order_id uuid;
  v_order_number text;
  v_notification_id uuid;
begin
  if char_length(trim(coalesce(p_full_name, ''))) < 3
     or char_length(trim(coalesce(p_full_name, ''))) > 100 then
    raise exception using errcode = '22023', message = 'invalid_full_name';
  end if;
  if coalesce(p_phone, '') !~ '^\+213([567][0-9]{8}|[234][0-9]{7}|9[0-9]{8})$' then
    raise exception using errcode = '22023', message = 'invalid_phone';
  end if;
  if char_length(trim(coalesce(p_wilaya, ''))) < 1
     or char_length(trim(coalesce(p_wilaya, ''))) > 80 then
    raise exception using errcode = '22023', message = 'invalid_wilaya';
  end if;
  if char_length(trim(coalesce(p_delivery_address, ''))) < 5
     or char_length(trim(coalesce(p_delivery_address, ''))) > 240 then
    raise exception using errcode = '22023', message = 'invalid_delivery_address';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 5 then
    raise exception using errcode = '22023', message = 'invalid_quantity';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone, 0));
  if exists (
    select 1 from public.orders o
    join public.customers c on c.id = o.customer_id
    where c.phone_e164 = p_phone and o.created_at > now() - interval '20 seconds'
  ) then
    raise exception using errcode = '22023', message = 'duplicate_order_recently';
  end if;

  select d.fee_dzd into v_delivery_fee from public.delivery_methods d
  where d.code = p_delivery_method and d.is_active = true;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_delivery_method';
  end if;

  select p.id, p.name, p.unit_price_dzd into v_product_id, v_product_name, v_unit_price
  from public.products p where p.slug = 'cram-cory-spf30' and p.is_active = true;
  if not found then raise exception using errcode = 'P0001', message = 'product_unavailable'; end if;

  insert into public.customers (full_name, phone_e164)
  values (trim(p_full_name), p_phone)
  on conflict (phone_e164) do update set full_name = excluded.full_name, updated_at = now()
  returning id into v_customer_id;

  v_subtotal := v_unit_price * p_quantity;
  v_total := v_subtotal + v_delivery_fee;

  insert into public.orders (customer_id, wilaya, delivery_address, delivery_method,
    subtotal_dzd, delivery_fee_dzd, total_dzd, status)
  values (v_customer_id, trim(p_wilaya), trim(p_delivery_address), p_delivery_method,
    v_subtotal, v_delivery_fee, v_total, 'pending_confirmation')
  returning id, order_number into v_order_id, v_order_number;

  insert into public.order_items (order_id, product_id, product_name, unit_price_dzd, quantity, line_total_dzd)
  values (v_order_id, v_product_id, v_product_name, v_unit_price, p_quantity, v_subtotal);

  insert into public.order_notifications (order_id, channel, status, attempt_number)
  values (v_order_id, 'whatsapp', 'pending', 1)
  returning id into v_notification_id;

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number,
    'notification_id', v_notification_id, 'quantity', p_quantity,
    'unit_price_dzd', v_unit_price, 'subtotal_dzd', v_subtotal,
    'delivery_fee_dzd', v_delivery_fee, 'total_dzd', v_total,
    'status', 'pending_confirmation');
end;
$$;

create or replace function public.record_order_notification_result(
  p_notification_id uuid, p_status text, p_provider_message_id text default null,
  p_provider_http_status integer default null, p_error_message text default null
)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception using errcode = '22023', message = 'invalid_notification_status';
  end if;
  update public.order_notifications
  set status = p_status,
      provider_message_id = nullif(left(coalesce(p_provider_message_id, ''), 255), ''),
      provider_http_status = p_provider_http_status,
      error_message = case when p_status = 'failed'
        then left(coalesce(p_error_message, 'Notification failed'), 500) else null end,
      attempted_at = now()
  where id = p_notification_id and status = 'pending';
  if not found then
    raise exception using errcode = 'P0002', message = 'notification_not_found_or_already_recorded';
  end if;
  return true;
end;
$$;

alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.delivery_methods enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_notifications enable row level security;

revoke all on table public.products from anon, authenticated;
revoke all on table public.customers from anon, authenticated;
revoke all on table public.delivery_methods from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.order_status_history from anon, authenticated;
revoke all on table public.order_notifications from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.products to service_role;
grant select, insert, update, delete on table public.customers to service_role;
grant select, insert, update, delete on table public.delivery_methods to service_role;
grant select, insert, update, delete on table public.orders to service_role;
grant select, insert, update, delete on table public.order_items to service_role;
grant select, insert, update, delete on table public.order_status_history to service_role;
grant select, insert, update, delete on table public.order_notifications to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.record_order_status_change() from public, anon, authenticated;
revoke all on function public.create_store_order(text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_store_order(text, text, text, text, text, integer) to service_role;
revoke all on function public.record_order_notification_result(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.record_order_notification_result(uuid, text, text, integer, text) to service_role;

-- Supabase projects may contain a platform-created helper function with this name.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
