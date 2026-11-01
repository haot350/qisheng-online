import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export function openDatabase(path:string){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new Database(path);
 db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');db.pragma('synchronous = FULL');db.pragma('busy_timeout = 5000');
 db.exec(`
 CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,short_id TEXT NOT NULL UNIQUE,nickname TEXT NOT NULL,recovery_hash TEXT NOT NULL UNIQUE,created INTEGER NOT NULL,renamed INTEGER NOT NULL DEFAULT 0,auto_submit INTEGER NOT NULL DEFAULT 1,restricted INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,client_id TEXT NOT NULL,credential_hash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,config TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',summary TEXT,flags TEXT,submitted INTEGER,week TEXT,reason TEXT,acked INTEGER NOT NULL DEFAULT 0,UNIQUE(player_id,client_id));
 CREATE INDEX IF NOT EXISTS board_runs ON runs(status,week,submitted);CREATE INDEX IF NOT EXISTS player_runs ON runs(player_id,submitted DESC);
 CREATE TABLE IF NOT EXISTS events(run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,seq INTEGER NOT NULL,event TEXT NOT NULL,PRIMARY KEY(run_id,seq));
 CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT,player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,kind TEXT NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL,processed INTEGER NOT NULL DEFAULT 0,UNIQUE(player_id,run_id,kind));
 CREATE TABLE IF NOT EXISTS admin_sessions(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL,csrf TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,created INTEGER NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL);

 `);
 migrate(db);
 // Query indexes are additive; schema-6 account migrations require a schema-6 rollback build.
 db.exec(`CREATE INDEX IF NOT EXISTS feedback_reply_owner ON feedback_replies(feedback_id,id);
 CREATE INDEX IF NOT EXISTS feedback_image_owner ON feedback_images(feedback_id);
 CREATE INDEX IF NOT EXISTS feedback_followup_owner ON feedback_followups(feedback_id,created,id);
 CREATE INDEX IF NOT EXISTS issue_board_order ON issues(published,status,updated DESC,id);`);
 // Additive operations metadata keeps schema-6 rollback applications readable.
 // Commands created by this version are acked in the legacy table: older workers
 // must never consume commands they cannot validate or report accurately.
 db.exec(`CREATE TABLE IF NOT EXISTS room_runtime(room_id TEXT PRIMARY KEY,generation TEXT NOT NULL,revision INTEGER NOT NULL,signature TEXT NOT NULL,details TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS room_command_results(command_id TEXT PRIMARY KEY REFERENCES room_commands(id) ON DELETE CASCADE,request_key TEXT NOT NULL UNIQUE,actor TEXT NOT NULL,fingerprint TEXT NOT NULL,generation TEXT NOT NULL,revision INTEGER NOT NULL,state TEXT NOT NULL,expires INTEGER NOT NULL,updated INTEGER NOT NULL,outcome TEXT NOT NULL DEFAULT '',ban_minutes INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS room_command_pending ON room_command_results(state,expires);
 CREATE TABLE IF NOT EXISTS presence_minutes(minute INTEGER PRIMARY KEY,accounts INTEGER NOT NULL,guests INTEGER NOT NULL,sessions INTEGER NOT NULL,web INTEGER NOT NULL,native INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS presence_daily(day TEXT PRIMARY KEY,accounts_peak INTEGER NOT NULL,guests_peak INTEGER NOT NULL,sessions_peak INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS online_room_activity ON online_rooms(updated DESC,state);
 CREATE INDEX IF NOT EXISTS room_command_history ON room_commands(room_id,created DESC);
 `);
 return db;
}
export type RankingDatabase=ReturnType<typeof openDatabase>;

function migrate(db:Database.Database){
 const version=Number(db.pragma('user_version',{simple:true}));if(version>6)throw Error('Database schema newer than application');
 if(version<2)db.transaction(()=>{db.exec(`
 ALTER TABLE runs ADD COLUMN mode TEXT;ALTER TABLE runs ADD COLUMN difficulty TEXT;
 ALTER TABLE runs ADD COLUMN rule_version TEXT;ALTER TABLE runs ADD COLUMN score REAL;ALTER TABLE runs ADD COLUMN elapsed REAL;
 ALTER TABLE runs ADD COLUMN hits INTEGER;ALTER TABLE runs ADD COLUMN best_combo INTEGER;
 UPDATE runs SET mode=json_extract(config,'$.mode'),difficulty=COALESCE(json_extract(config,'$.difficulty'),''),rule_version=json_extract(config,'$.ruleVersion'),score=json_extract(summary,'$.score'),elapsed=json_extract(summary,'$.elapsed'),hits=COALESCE(json_extract(summary,'$.hits'),0),best_combo=COALESCE(json_extract(summary,'$.bestCombo'),0);
 CREATE INDEX board_filter ON runs(status,mode,difficulty,rule_version,week,score DESC,elapsed,submitted);
 CREATE TABLE administrators(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,owner INTEGER NOT NULL DEFAULT 0,scopes TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);
 ALTER TABLE admin_sessions ADD COLUMN admin_id TEXT REFERENCES administrators(id) ON DELETE CASCADE;DELETE FROM admin_sessions;
 ALTER TABLE audit ADD COLUMN actor TEXT;
 CREATE TABLE feedback(id TEXT PRIMARY KEY,player_id TEXT REFERENCES players(id) ON DELETE SET NULL,receipt_hash TEXT NOT NULL,category TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,diagnostics TEXT,status TEXT NOT NULL DEFAULT 'received',issue_id TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,closed INTEGER);
 CREATE INDEX feedback_status ON feedback(status,created DESC);CREATE INDEX feedback_owner ON feedback(player_id,created DESC);
 CREATE TABLE feedback_images(id TEXT PRIMARY KEY,feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,image BLOB NOT NULL,bytes INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL);
 CREATE TABLE feedback_replies(id INTEGER PRIMARY KEY AUTOINCREMENT,feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,message TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE issues(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL,release_id TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,published INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE issue_votes(issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,PRIMARY KEY(issue_id,player_id));
 CREATE TABLE releases(id TEXT PRIMARY KEY,version TEXT NOT NULL UNIQUE,date TEXT NOT NULL,summary TEXT NOT NULL,changes TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
 CREATE TABLE telemetry_events(id INTEGER PRIMARY KEY AUTOINCREMENT,created INTEGER NOT NULL,day TEXT NOT NULL,event TEXT NOT NULL,page TEXT NOT NULL,mode TEXT NOT NULL,platform TEXT NOT NULL,version TEXT NOT NULL,code TEXT NOT NULL);
 CREATE INDEX telemetry_time ON telemetry_events(created);
 CREATE TABLE telemetry_daily(day TEXT NOT NULL,event TEXT NOT NULL,page TEXT NOT NULL,mode TEXT NOT NULL,platform TEXT NOT NULL,version TEXT NOT NULL,code TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,event,page,mode,platform,version,code));
 CREATE TABLE telemetry_sessions(day TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(day,hash));
 CREATE TABLE join_tickets(hash TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,mode TEXT NOT NULL,room_id TEXT,invite_code TEXT,expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE online_rooms(id TEXT PRIMARY KEY,worker TEXT NOT NULL,mode TEXT NOT NULL,state TEXT NOT NULL,players TEXT NOT NULL,max_players INTEGER NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,health TEXT);
 CREATE TABLE room_commands(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,action TEXT NOT NULL,player_id TEXT,reason TEXT,created INTEGER NOT NULL,acked INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE multiplayer_results(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,mode TEXT NOT NULL,rule_version TEXT NOT NULL,team_key TEXT,difficulty TEXT NOT NULL,team_count INTEGER NOT NULL,score REAL NOT NULL,elapsed REAL NOT NULL,won INTEGER NOT NULL,week TEXT NOT NULL,submitted INTEGER NOT NULL,result TEXT NOT NULL,content_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'valid');
 CREATE INDEX coop_board ON multiplayer_results(mode,status,difficulty,team_count,rule_version,week,score DESC,elapsed,submitted);
 CREATE TABLE multiplayer_participants(result_id TEXT NOT NULL REFERENCES multiplayer_results(id) ON DELETE CASCADE,player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,summary TEXT NOT NULL,qualified INTEGER NOT NULL,PRIMARY KEY(result_id,player_id));
 CREATE INDEX multiplayer_recent ON multiplayer_participants(player_id,result_id);
 CREATE TABLE operations(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE multiplayer_bans(player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,expires INTEGER NOT NULL,reason TEXT NOT NULL);
 PRAGMA user_version=2;
 `);})();
 if(version<3)db.transaction(()=>{db.exec(`
 CREATE TABLE issue_replies(id TEXT PRIMARY KEY,issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,message TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','published','withdrawn')),created INTEGER NOT NULL,updated INTEGER NOT NULL,published_at INTEGER);
 CREATE INDEX issue_reply_public ON issue_replies(issue_id,status,updated DESC);
 CREATE TABLE issue_internal_notes(issue_id TEXT PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,note TEXT NOT NULL,updated INTEGER NOT NULL);
 PRAGMA user_version=3;
 `);})();
 if(version<4)db.transaction(()=>{db.exec(`
 CREATE TABLE IF NOT EXISTS issue_resolutions(issue_id TEXT PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,kind TEXT NOT NULL,summary TEXT NOT NULL,effective INTEGER NOT NULL,release_id TEXT,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS feedback_resolutions(feedback_id TEXT PRIMARY KEY REFERENCES feedback(id) ON DELETE CASCADE,kind TEXT NOT NULL,summary TEXT NOT NULL,effective INTEGER NOT NULL,release_id TEXT,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS feedback_followups(id TEXT PRIMARY KEY,feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,client_id TEXT NOT NULL,message TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(feedback_id,client_id));
 CREATE TABLE IF NOT EXISTS feedback_followup_images(followup_id TEXT NOT NULL REFERENCES feedback_followups(id) ON DELETE CASCADE,image_id TEXT NOT NULL REFERENCES feedback_images(id) ON DELETE CASCADE,PRIMARY KEY(followup_id,image_id));
 CREATE TABLE IF NOT EXISTS feedback_operations(key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,response TEXT NOT NULL,created INTEGER NOT NULL);
 PRAGMA user_version=4;
 `);})();
 if(version<5)db.transaction(()=>{db.exec(`
 CREATE TABLE IF NOT EXISTS operational_config(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
 INSERT OR IGNORE INTO operational_config VALUES(1,0);
 CREATE TABLE IF NOT EXISTS mode_availability(entry TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,reason TEXT NOT NULL DEFAULT '',updated INTEGER NOT NULL DEFAULT 0);
 INSERT OR IGNORE INTO mode_availability(entry) VALUES('story'),('roam'),('dafei'),('escape-solo'),('escape-coop'),('escape-tdm'),('escape-ffa');
 CREATE TABLE IF NOT EXISTS announcements(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,priority TEXT NOT NULL,audiences TEXT NOT NULL,status TEXT NOT NULL,starts INTEGER NOT NULL,ends INTEGER,published INTEGER,link TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS announcement_active ON announcements(status,starts,ends);
 CREATE TABLE IF NOT EXISTS deployments(id TEXT PRIMARY KEY,version TEXT NOT NULL,site TEXT NOT NULL CHECK(site IN ('game','campus','backend')),verified INTEGER NOT NULL,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS deployment_version ON deployments(version,site,verified DESC);
 ${!(db.pragma('table_info(online_rooms)') as any[]).some(c=>c.name==='variant')?'ALTER TABLE online_rooms ADD COLUMN variant TEXT;':''}
 ${!(db.pragma('table_info(join_tickets)') as any[]).some(c=>c.name==='variant')?'ALTER TABLE join_tickets ADD COLUMN variant TEXT;':''}
 PRAGMA user_version=5;
 `);})();
 if(version<6)db.transaction(()=>{db.exec(`
 CREATE TABLE accounts(id TEXT PRIMARY KEY,player_id TEXT NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,recovery_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),avatar TEXT NOT NULL DEFAULT 'initials',featured TEXT NOT NULL DEFAULT '[]',public_profile INTEGER NOT NULL DEFAULT 0,sync_stats INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE account_appeals(id TEXT PRIMARY KEY,player_id TEXT REFERENCES players(id) ON DELETE SET NULL,username TEXT NOT NULL DEFAULT '',short_id TEXT NOT NULL DEFAULT '',message TEXT NOT NULL,receipt_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','approved','rejected')),response TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,updated INTEGER NOT NULL,reset_hash TEXT,reset_expires INTEGER,reset_used INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX account_appeals_status ON account_appeals(status,created DESC);
 CREATE TABLE achievement_sources(player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,source_id TEXT NOT NULL,mode TEXT NOT NULL,created INTEGER NOT NULL,evidence TEXT NOT NULL,PRIMARY KEY(player_id,source_id));
 CREATE TABLE player_achievements(player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,achievement_id TEXT NOT NULL,unlocked INTEGER NOT NULL,source_id TEXT NOT NULL,PRIMARY KEY(player_id,achievement_id));
 CREATE TABLE multiplayer_recording(result_id TEXT NOT NULL REFERENCES multiplayer_results(id) ON DELETE CASCADE,player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,enabled INTEGER NOT NULL,PRIMARY KEY(result_id,player_id));
 ALTER TABLE runs ADD COLUMN record_stats INTEGER NOT NULL DEFAULT 1;
 ALTER TABLE runs ADD COLUMN publish_board INTEGER NOT NULL DEFAULT 1;
 PRAGMA user_version=6;
 `);})();
}
