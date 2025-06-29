import sqlite3

DATABASE = 'homeschool_tracker.db'

def init_db():
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()

        # Users Table
        c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            full_name TEXT
        );
        ''')

        c.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ('admin', 'adminpass', 'admin'))
        

        # New: per‑student task definitions
        c.execute('''
        CREATE TABLE IF NOT EXISTS task_definitions (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id       INTEGER NOT NULL,
            slug             TEXT    NOT NULL,
            label            TEXT    NOT NULL,
            field_type       TEXT    NOT NULL,
            is_default       INTEGER NOT NULL DEFAULT 0,
            is_active        INTEGER NOT NULL DEFAULT 1,     
            readonly         INTEGER NOT NULL DEFAULT 0,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(student_id) REFERENCES users(id)
        );
        ''')

        # New: actual per‑week entries for each definition
        c.execute('''
        CREATE TABLE IF NOT EXISTS task_entries (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id       INTEGER NOT NULL,
            task_def_id      INTEGER NOT NULL,
            day_of_week      TEXT    NOT NULL,
            value            TEXT,
            FOREIGN KEY(student_id)  REFERENCES users(id),
            FOREIGN KEY(task_def_id) REFERENCES task_definitions(id)
        );
        ''')

        # Expected Tasks Table
        c.execute('''
        CREATE TABLE IF NOT EXISTS user_expected_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            day_of_week TEXT NOT NULL,
            expected_math_points INTEGER,
            actual_math_points INTEGER,
            math_time INTEGER,
            expected_daily_reading_percent REAL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        ''')

        # Daily Reports Table
        c.execute('''
        CREATE TABLE IF NOT EXISTS daily_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,

            book_title TEXT,
            word_count INTEGER,
            expected_weekly_reading_rate INTEGER DEFAULT 35000,
            expected_weekly_reading_percent REAL,
            expected_daily_reading_percent REAL,
            accumulated_reading_percent REAL DEFAULT 0,
            daily_reading_percent REAL,
            accumulated_weekly_reading_percent REAL,

            expected_math_points INTEGER,
            actual_math_points INTEGER,
            math_time INTEGER,
        
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        ''')

        # Results table
        c.execute('''
        CREATE TABLE IF NOT EXISTS weekly_results (
            user_id INTEGER,
            week     TEXT,      -- Monday date
            pct      REAL,
            tier     TEXT,
            PRIMARY KEY(user_id, week)
        ); 
        ''')

        # Configurable Tier thresholds
        c.execute('''
        CREATE TABLE IF NOT EXISTS tier_thresholds (
            id              INTEGER  PRIMARY KEY CHECK (id = 1),   -- always exactly one row
            needs_work_max  REAL     NOT NULL DEFAULT 0.88,        -- < this  → needsWork
            good_max        REAL     NOT NULL DEFAULT 0.98         -- < this  → good
        );
        ''')

        c.execute('INSERT OR IGNORE INTO tier_thresholds(id) VALUES (1)')
        
        # Configurable wording for the 3 tiers, both mid-week (“progress”) and Sunday (“final”)
        c.execute("""
        CREATE TABLE IF NOT EXISTS tier_messages (
            tier    TEXT NOT NULL,          -- excellent | good | needsWork
            scope   TEXT NOT NULL,          -- progress | final
            message TEXT NOT NULL,
            PRIMARY KEY(tier, scope)
        );
        """)
        
        c.executemany("""
            INSERT OR IGNORE INTO tier_messages(tier, scope, message) VALUES (?,?,?)
        """, [
            ('excellent','progress','Awesome — you’re on track for a great week!'),
            ('good',     'progress','You’re doing well - but keep focusing on your daily to-dos.'),
            ('needsWork','progress','Uh-oh - looks like you’re falling behind.  Try and make up some of your missed tasks'),

            ('excellent','final','Woo!!  Goal achieved! Double pocket money this week! 🎉'),
            ('good',     'final','A solid effort - try for a bonus next week!'),
            ('needsWork','final','Tsk tsk – not enough effort. You’re on the chore roster next week!')
        ])


        # Guarantee only one row per student per day
        c.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_user_date
            ON daily_reports(user_id, date)
        """)

        conn.commit()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
