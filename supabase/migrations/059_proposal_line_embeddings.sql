-- ============================================================================
-- 059_proposal_line_embeddings.sql
--
-- Stores per-line-item vector embeddings from accepted (signed) proposals.
-- Used by the AI proposal drafter to surface historically accurate pricing
-- for similar scopes instead of relying on static Bay Area guidelines.
--
-- Embedding model: text-embedding-3-small (1536 dims, OpenAI)
-- Stored text: "{item_name}: {description}"
-- ============================================================================

create table proposal_line_embeddings (
  id               uuid          primary key default gen_random_uuid(),
  tenant_id        uuid          not null references tenants(id) on delete cascade,
  proposal_id      uuid          not null references proposals(id) on delete cascade,
  -- soft ref — line items can be deleted but we keep the pricing signal
  line_item_id     uuid,
  item_name        text          not null,
  description      text          not null default '',
  unit_price_cents bigint        not null default 0,
  quantity         numeric(10,2) not null default 1,
  -- "{item_name}: {description}" — the text that was embedded
  chunk_text       text          not null,
  embedding        vector(1536),
  model            text          not null default 'text-embedding-3-small',
  created_at       timestamptz   not null default now()
);

alter table proposal_line_embeddings enable row level security;

create policy "tenant members select proposal_line_embeddings"
  on proposal_line_embeddings for select
  using (tenant_id in (select get_user_tenant_ids()));

create index proposal_line_embeddings_tenant_id_idx
  on proposal_line_embeddings(tenant_id);

-- IVFFlat approximate NN index (small lists — data grows incrementally)
create index proposal_line_embeddings_embedding_idx
  on proposal_line_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

-- ── RPC: similarity search ──────────────────────────────────────────────────
-- Called from the draft-proposal Netlify function via POST /rest/v1/rpc/...
-- Returns top-N most similar accepted line items for the same tenant.

create or replace function search_proposal_line_embeddings(
  p_tenant_id  uuid,
  p_embedding  vector(1536),
  p_limit      int  default 10
)
returns table (
  item_name        text,
  description      text,
  unit_price_cents bigint,
  quantity         numeric,
  similarity       float
)
language sql security definer
set search_path = public
as $$
  select
    item_name,
    description,
    unit_price_cents,
    quantity,
    1 - (embedding <=> p_embedding) as similarity
  from proposal_line_embeddings
  where tenant_id  = p_tenant_id
    and embedding  is not null
  order by embedding <=> p_embedding
  limit p_limit;
$$;
