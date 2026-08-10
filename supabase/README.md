# Supabase analytics schema

This directory creates a read-only `analytics` API surface over the production
tables. The `analytics_reader` role can use only the seven allowlisted views; it
has no permission on the pepper table or on source tables in `public`.

## 1. Apply the migration

Check that the source tables and columns in `PROJECT_SPEC.md` already exist in
the target project. Then use one of these methods.

With the Supabase CLI:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

`db push` records the migration in Supabase's migration history and skips it on
later pushes. Do not use a linked database reset against production.

With the Supabase MCP server, call `apply_migration` for the target project. Use
`0001_analytics_schema` as the migration name and the complete contents of
`migrations/0001_analytics_schema.sql` as the SQL. Apply it once to the intended
project and retain this file as the source of truth.

## 2. Replace the analytics pepper

The migration inserts an obvious placeholder so deployment cannot silently
invent a secret. In the Supabase SQL editor, while connected as an administrative
database role, replace it with a long random value:

```sql
UPDATE analytics.pepper
SET pepper = encode(extensions.gen_random_bytes(32), 'hex');
```

Confirm there is exactly one non-placeholder row without copying the value out:

```sql
SELECT count(*) = 1
       AND bool_and(pepper <> 'REPLACE_WITH_A_SECURE_RANDOM_ANALYTICS_PEPPER')
       AS pepper_is_ready
FROM analytics.pepper;
```

Changing the pepper changes every `user_hash`, so set it once before the first
extract and keep it stable. The migration explicitly withholds table access from
`analytics_reader`; never place the pepper in application configuration or the
AWS extractor secret.

## 3. Expose the schema to PostgREST

In the Supabase Dashboard, open **Project Settings > Data API** (called **API**
in older dashboard versions). Add `analytics` to **Exposed schemas** and save.
This is PostgREST's `db-schemas` setting: it must include `analytics`, or a
request using `Accept-Profile: analytics` returns `PGRST106`.

Exposing a schema does not grant database access. The migration grants the
`analytics_reader` role schema usage and read access only to the seven views.

## 4. Mint the restricted JWT

This project-specific machine token must be generated and stored only in a
trusted operator/backend environment.

1. In the Supabase Dashboard, copy the project's **legacy JWT secret** from the
   JWT/API settings. This procedure uses the project's symmetric HS256 secret;
   a publishable key, secret API key, or database password is not the signing
   secret.
2. In a temporary directory, install the signer with
   `npm install jsonwebtoken`.
3. Put the JWT secret in a temporary shell variable, mint a short-lived token,
   and capture the output. The `role` claim is exact and maps PostgREST to the
   `analytics_reader` Postgres role:

```sh
JWT_SECRET='paste-the-project-jwt-secret-here' node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({role:'analytics_reader'}, process.env.JWT_SECRET, {algorithm:'HS256', expiresIn:'24h'}))"
```

4. Store the resulting JWT in the AWS Secrets Manager secret used by the
   extractor, then clear the shell history/session containing `JWT_SECRET`.
   Rotate the JWT before it expires. Never commit either value.

The migration grants `analytics_reader` to Supabase's `authenticator` role so
PostgREST can assume it from the JWT. The role is `NOLOGIN`, so the token cannot
be used as a direct database login.

## 5. Test with curl

Set the project URL, the newly minted JWT, and a public gateway API key. On newer
projects use the publishable key; on legacy projects use the anon key. The
gateway key identifies the Supabase project, while the bearer JWT selects the
restricted database role.

```sh
export SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
export SUPABASE_API_KEY='YOUR_PUBLISHABLE_OR_LEGACY_ANON_KEY'
export ANALYTICS_READER_JWT='YOUR_MINTED_ANALYTICS_READER_JWT'

curl --fail-with-body --silent --show-error \
  "$SUPABASE_URL/rest/v1/v_pipeline_runs?select=id,created_at&limit=1" \
  -H "apikey: $SUPABASE_API_KEY" \
  -H "Authorization: Bearer $ANALYTICS_READER_JWT" \
  -H "Accept-Profile: analytics"
```

A successful request returns a JSON array. Also verify the boundary: replacing
`v_pipeline_runs` with `pepper` must return a permission/not-found response, and
using `Accept-Profile: public` must not make source tables readable with this
bearer JWT.

References: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas),
[custom roles and JWTs](https://supabase.com/docs/guides/storage/schema/custom-roles),
and [PostgREST schema selection](https://docs.postgrest.org/en/latest/references/api/schemas.html).
