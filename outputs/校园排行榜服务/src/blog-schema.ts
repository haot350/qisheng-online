/** Additive schema-8 blog storage. The caller owns the migration transaction. */
export const BLOG_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS blog_posts (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, draft_revision INTEGER NOT NULL DEFAULT 0,
 public_revision INTEGER, scheduled_revision INTEGER, scheduled_at INTEGER,
 comments_enabled INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blog_media (
 id TEXT PRIMARY KEY, image BLOB NOT NULL, bytes INTEGER NOT NULL, width INTEGER NOT NULL,
 height INTEGER NOT NULL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blog_revisions (
 post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
 title TEXT NOT NULL, excerpt TEXT NOT NULL, category TEXT NOT NULL, author TEXT NOT NULL,
 document TEXT NOT NULL, search_text TEXT NOT NULL, cover_id TEXT REFERENCES blog_media(id),
 created INTEGER NOT NULL, PRIMARY KEY(post_id,revision)
);
CREATE TABLE IF NOT EXISTS blog_media_refs (
 post_id TEXT NOT NULL, revision INTEGER NOT NULL, media_id TEXT NOT NULL REFERENCES blog_media(id),
 PRIMARY KEY(post_id,revision,media_id),
 FOREIGN KEY(post_id,revision) REFERENCES blog_revisions(post_id,revision) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS blog_publications (
 post_id TEXT PRIMARY KEY REFERENCES blog_posts(id) ON DELETE CASCADE,
 published INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blog_comments (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
 player_id TEXT REFERENCES players(id) ON DELETE SET NULL, parent_id TEXT REFERENCES blog_comments(id),
 official INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('published','hidden','deleted')),
 request_key TEXT NOT NULL UNIQUE, created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blog_reports (
 id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES blog_comments(id) ON DELETE CASCADE,
 player_id TEXT REFERENCES players(id) ON DELETE SET NULL, reason TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved')),
 created INTEGER NOT NULL, UNIQUE(comment_id,player_id)
);
CREATE TABLE IF NOT EXISTS blog_mutes (
 player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
 expires INTEGER NOT NULL, reason TEXT NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blog_schedule_due ON blog_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS blog_comment_page ON blog_comments(post_id,parent_id,created,id);
CREATE INDEX IF NOT EXISTS blog_comment_author ON blog_comments(player_id,created);
CREATE INDEX IF NOT EXISTS blog_reports_pending ON blog_reports(state,created);
`;
