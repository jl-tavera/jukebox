# Namespaced source ids as the public playlist identifier

`docs/design/DESIGN.md` §02 specifies `playlists.id` as an "internal id, not the source's". We are
deviating: a playlist's id is its source name and its id on that source, joined by a colon —
`spotify:37i9dQZF1DXcBWIGoYBM5M`. This is what appears in API paths, in D1, and in the client's
sqlite. Track ids follow the same scheme.

The id stays collision-free when Apple Music and YouTube arrive, because the source name namespaces
it. It is deterministic, so `POST /playlists` is idempotent with no lookup, and staging and
production agree on ids for the same playlist. And it is readable, which matters more than it
sounds: every log line and every D1 row says which playlist it is without a join.

## Considered options

**An opaque hash of `(source, source_id)`.** Identical determinism and collision properties, and it
was the first recommendation. Rejected because `a3f91c…` tells a reader nothing, so every
investigation starts with a database query — a cost paid daily to buy opacity nobody needs.

**A random id assigned on first insert.** Requires a D1 lookup on every `POST` to discover whether
this URL is already tracked, and gives staging and production different ids for the same playlist.

**The bare Spotify id, unnamespaced.** Collides the moment a second source's id format overlaps,
and an id alone no longer says which source it belongs to.

## Consequences

Ids are guessable and enumerable. This costs nothing here: DESIGN §05 already establishes that
there is no auth, every response derives from public data, and every caller gets an identical
answer. There is nothing to enumerate that is not already public.

The id embeds a source name, which is deliberately *not* a violation of the §03 rule that Spotify
vocabulary stays inside the adapter. `source` is a domain concept — it is a column on `playlists`
and a term in `CONTEXT.md`. The banned vocabulary is Spotify's own: `snapshot_id`, `market`, `uri`,
`available_markets`.

If a source ever changes a playlist's id, the Jukebox id changes with it and the old one dangles.
Spotify ids are stable, so this is accepted rather than solved.
