-- PR 31B: read published commercial snapshots via the trusted server only.
-- Never grant service_role access to library_products.draft or product history.
-- No product updates, no publication changes and no automatic pricing.
grant select (product_id, version, content, published_at)
on table public.library_publications to service_role;
