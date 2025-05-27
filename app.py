from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os
import re
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='frontend/build')

DATABASE = os.environ.get(
    'HSTRACKER_DB',
    os.path.join(os.path.dirname(__file__), 'homeschool_tracker.db')
)

def snake_case(s: str) -> str:
    # turn "My New Field" → "my_new_field"
    s = re.sub(r'[^\w]+', '_', s)    # non-alphanum → underscore
    s = re.sub(r'_+', '_', s)        # collapse repeats
    return s.strip('_').lower()

def get_previous_day_data(user_id, date):
    prev_date = (datetime.strptime(date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('''SELECT book_title, word_count, expected_weekly_reading_rate,
                     accumulated_reading_percent FROM daily_reports
                     WHERE user_id=? AND date=?''', (user_id, prev_date))
        return c.fetchone()

def get_accumulated_weekly_reading_percent(user_id, date, daily_reading_percent):
    date_obj = datetime.strptime(date, '%Y-%m-%d')
    # Find the previous Monday
    monday_date = date_obj - timedelta(days=date_obj.weekday())
    accumulated_percent = 0.0

    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('''
            SELECT SUM(daily_reading_percent) FROM daily_reports
            WHERE user_id = ? AND date BETWEEN ? AND ?
        ''', (user_id, monday_date.strftime('%Y-%m-%d'), date_obj.strftime('%Y-%m-%d')))
        result = c.fetchone()
        accumulated_percent = result[0] or 0.0

    return accumulated_percent

def get_last_explicit_field_value(user_id, date, field_name):
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute(f'''
            SELECT {field_name}, date FROM daily_reports
            WHERE user_id=? AND {field_name} IS NOT NULL AND date <= ?
            ORDER BY date DESC LIMIT 1
        ''', (user_id, date))
        result = c.fetchone()

        print(f"DEBUG: field {field_name}, user_id {user_id}, requested date {date}, result: {result}")

        # Verify explicitly set value is on or before the requested date
        if result:
            explicit_date = datetime.strptime(result[1], '%Y-%m-%d')
            requested_date = datetime.strptime(date, '%Y-%m-%d')
            if explicit_date <= requested_date:
                return result[0]
    return None

def get_last_explicit_field_date(user_id, date, field_name):
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute(f'''
            SELECT date FROM daily_reports
            WHERE user_id=? AND {field_name} IS NOT NULL AND date <= ?
            ORDER BY date DESC LIMIT 1
        ''', (user_id, date))
        result = c.fetchone()
    return result[0] if result else None

def _get_weekly_progress_data(user_id, date_str):
    try:
        d = datetime.strptime(date_str, '%Y-%m-%d')
    except ValueError: return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    monday = d - timedelta(days=(d.weekday()))
    sunday = monday + timedelta(days=6)
    day_before_monday = monday - timedelta(days=1)

    def get_full_plan(cursor, student_id, text_task_slugs):
        plan_data = {'expected_math_points': {}}
        # Initialize plan for text tasks
        for slug in text_task_slugs:
            plan_data[slug] = {}

        slugs_to_query = ['expected_math_points'] + list(text_task_slugs)
        placeholders = ','.join('?' * len(slugs_to_query)) # Create placeholders for query

        cursor.execute(f'''
            SELECT te.day_of_week, td.slug, te.value
            FROM task_entries te JOIN task_definitions td ON td.id = te.task_def_id
            WHERE te.student_id=? AND td.slug IN ({placeholders})
        ''', [student_id] + slugs_to_query) # Pass parameters correctly

        for day, slug, val in cursor.fetchall():
            day_plan = plan_data.get(slug, {}) # Get plan for this slug
             # Store plan value (check if it's non-empty for text tasks)
            is_planned = False
            if slug == 'expected_math_points':
                 try:
                     day_plan[day] = int(val) if val is not None else 0
                 except (ValueError, TypeError):
                     day_plan[day] = 0
            else: # Text task
                day_plan[day] = str(val or '').strip() # Store the text plan value
                is_planned = day_plan[day] != '' # Planned if text is not empty
            plan_data[slug] = day_plan # Update plan for this slug
        return plan_data

    with sqlite3.connect(DATABASE) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()


        # --- Fetch ALL slugs defined for the student ---
        c.execute("SELECT slug, label, field_type, is_default FROM task_definitions WHERE student_id=? AND (is_active=1 OR is_default=1) ORDER BY created_at", (user_id,))
        all_defs = c.fetchall()
        # Separate text slugs for later check
        text_task_defs = {row['slug']: row['label'] for row in all_defs if row['field_type'] == 'text' and not row['is_default']} # Only custom text tasks
        # --- ADD PRINT STATEMENT BELOW THIS LINE ---
        print(f"DEBUG (get_weekly_progress): Found text task defs: {text_task_defs}")

        plan = get_full_plan(c, user_id, text_task_defs.keys())
        math_plan = plan.get('expected_math_points', {})

        # --- Build field list dynamically including text slugs ---
        fields_to_select = ['date', 'actual_math_points', 'math_time', 'accumulated_reading_percent',
                           'word_count', 'expected_weekly_reading_rate', 'book_title']
        # Add text task slugs safely quoted
        fields_to_select.extend([f'"{slug}"' for slug in text_task_defs.keys()])
        select_clause = ', '.join(fields_to_select)

        # --- ADD PRINT STATEMENT BELOW THIS LINE ---
        print(f"DEBUG (get_weekly_progress): SELECT clause built: {select_clause}")

        c.execute(f'''
          SELECT {select_clause}
            FROM daily_reports
           WHERE user_id=? AND date BETWEEN ? AND ?
           ORDER BY date ASC
        ''', (user_id, monday.strftime('%Y-%m-%d'), sunday.strftime('%Y-%m-%d')))
        daily_reports = {r['date']: dict(r) for r in c.fetchall()}

        # Fetch context from day before Monday
        c.execute('''
            SELECT accumulated_reading_percent, book_title,
                   word_count, expected_weekly_reading_rate
            FROM daily_reports
            WHERE user_id = ? AND date <= ?
            ORDER BY date DESC LIMIT 1 ''',
            (user_id, day_before_monday.strftime('%Y-%m-%d')))
        prev_context_row = c.fetchone()
        
        prev_read = prev_context_row['accumulated_reading_percent'] if prev_context_row else 0
        prev_title = prev_context_row['book_title'] if prev_context_row else None
        current_applicable_rate = prev_context_row['expected_weekly_reading_rate'] if prev_context_row else None
        current_applicable_count = prev_context_row['word_count'] if prev_context_row else None
        if current_applicable_rate is None:
            c.execute("SELECT 1 FROM daily_reports WHERE user_id = ? AND expected_weekly_reading_rate IS NOT NULL LIMIT 1", (user_id,))
            if not c.fetchone(): current_applicable_rate = 35000

    # Initialize weekly totals
    total_actual_math_points = 0
    total_expected_math_points = 0
    total_actual_reading_percent = 0
    total_expected_reading_percent = 0

    # --- Initialize text task completion tracker ---
    text_task_completion = {slug: {day: False for day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
                           for slug in text_task_defs.keys()}
    # --- ADD PRINT STATEMENT BELOW THIS LINE ---
    print(f"DEBUG (get_weekly_progress): Initialized completion tracker: {text_task_completion}")
    # --- End Initialize ---

    daily_data_out = []
    for i in range(7):
        current = monday + timedelta(days=i)
        date_str = current.strftime('%Y-%m-%d')
        weekday_full = current.strftime('%A')
        weekday_short = current.strftime('%a')

        report_data = daily_reports.get(date_str, {})

        # Extract actuals
        act_pts = report_data.get('actual_math_points', 0) or 0
        act_time = report_data.get('math_time', 0) or 0
        acc_read = report_data.get('accumulated_reading_percent', prev_read) if report_data else prev_read
        current_title = report_data.get('book_title', None)

        # Update applicable rate/count
        todays_saved_rate = report_data.get('expected_weekly_reading_rate')
        todays_saved_count = report_data.get('word_count')
        if todays_saved_rate is not None: current_applicable_rate = todays_saved_rate
        if todays_saved_count is not None: current_applicable_count = todays_saved_count

        # Calculate Expected Reading Percent for the day
        exp_read_percent = 0
        if current_applicable_rate is not None and current_applicable_count is not None and current_applicable_count > 0:
            try: 
                # Calculate the percentage
                raw_percent = (100.0 * current_applicable_rate / current_applicable_count) / 7.0
                exp_read_percent = int(raw_percent + 0.5)
            except TypeError: pass

        # Get expected math points from plan
        exp_pts = math_plan.get(weekday_full, 0)
        exp_time = exp_pts * 2

        # Calculate daily reading delta
        dr = 0
        if acc_read is not None:
             if current_title != prev_title and current_title is not None: dr = acc_read
             elif prev_read is not None: dr = max(0, acc_read - prev_read)
             else: dr = acc_read

        # Update context for next iteration
        prev_read = acc_read
        prev_title = current_title

        # --- Check completion for text tasks ---
        for slug in text_task_defs.keys():
            task_value = report_data.get(slug)
            if task_value is not None and str(task_value).strip() != '':
                # Use weekday_short (e.g., 'Mon') which matches the dictionary keys
                if slug in text_task_completion and weekday_short in text_task_completion[slug]:
                    text_task_completion[slug][weekday_short] = True

        # Accumulate weekly totals
        total_actual_math_points += act_pts
        total_expected_math_points += exp_pts
        total_actual_reading_percent += dr
        total_expected_reading_percent += exp_read_percent

        # Append daily data
        daily_data_out.append({
            'date': date_str, 'day': weekday_full[:3],
            'expected_math_points': exp_pts, 'actual_math_points': act_pts,
            'math_time': act_time, 'expected_math_time': exp_time,
            'daily_reading_percent': dr,
            'expected_daily_reading_percent': exp_read_percent
        })


    # Prepare final response
    response_data = {
        "dailyData": daily_data_out,
        "summary": {
            "total_actual_math_points": total_actual_math_points,
            "total_expected_math_points": total_expected_math_points,
            "total_actual_reading_percent": round(total_actual_reading_percent),
            "total_expected_reading_percent": round(total_expected_reading_percent)
        },
        "textTasks": {
             "labels": text_task_defs, # Send slug->label mapping
             "completion": text_task_completion, # Send completion data {slug: {day: bool}}
             "plan": {slug: plan.get(slug, {}) for slug in text_task_defs.keys()}
        }
    }

    return response_data

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('SELECT id, role FROM users WHERE username=? AND password=?', (username, password))
        user = c.fetchone()

    if user:
        return jsonify({'status': 'success', 'user_id': user[0], 'role': user[1]}), 200
    else:
        return jsonify({'status': 'failure', 'message': 'Invalid credentials'}), 401

@app.route('/admin/users', methods=['GET'])
def get_users():
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('SELECT id, username FROM users WHERE role="student"')
        users = [{'id': row[0], 'username': row[1]} for row in c.fetchall()]
    return jsonify(users), 200

@app.route('/admin/add-user', methods=['POST'])
def add_user():
    data = request.json
    username = data['username']
    password = data['password']
    role = data.get('role', 'student')  # default role: student

    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        try:
            c.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', (username, password, role))
            conn.commit()
            new_user_id = c.lastrowid
            default_defs = [
                ('expected_math_points', 'Math (Pts)', 'number'),
                ('actual_math_points', 'Math (Pts)', 'number'),
                ('math_time', 'Math Time (mins)', 'number'),
                ('book_title', 'Book Title', 'text'),
                ('word_count', 'Word Count', 'number'),
                ('expected_daily_reading_percent', 'Expected Daily Reading (%)', 'number'),
                ('accumulated_reading_percent', 'Reading Progress (%)', 'number'),
                ('expected_weekly_reading_percent', 'Expected Weekly Reading Progress (%)', 'number'),
                ('expected_weekly_reading_rate', 'Number of Words Read per Week', 'number'),
                ('daily_reading_percent', 'Actual Daily Reading Progress (%)', 'number'),
                ('accumulated_weekly_reading_percent', 'Reading Progress (reset each week) (%)', 'number'),
            ]
            for slug, label, field_type in default_defs:
                c.execute('''
                INSERT INTO task_definitions
                    (student_id, slug, label, field_type, is_default, readonly)
                    VALUES (?, ?, ?, ?, 1, 0)
                    ''', (new_user_id, slug, label, field_type))
            conn.commit()
            return jsonify({'status': 'success', 'newUserId': new_user_id}), 201
        except sqlite3.IntegrityError:
            return jsonify({'status': 'failure', 'message': 'Username already exists'}), 409


# GET all task definitions for a student NEW FUNCTION
@app.route('/admin/user/<int:student_id>/task-definitions', methods=['GET'])
def get_task_definitions(student_id):
    with sqlite3.connect(DATABASE) as conn:
        conn.row_factory = sqlite3.Row
        c=conn.cursor()
        c.execute('''
          SELECT id, slug, label, field_type, readonly, is_default, is_active
            FROM task_definitions
           WHERE student_id=?
           ORDER BY is_default DESC, created_at
        ''', (student_id,))
        defs = [
          {'id':row['id'],'slug':row['slug'],'label':row['label'],
           'field_type':row['field_type'],'readonly':bool(row['readonly']), 
           'is_default':bool(row['is_default']), 'is_active':bool(row['is_active'])}
          for row in c.fetchall()
        ]
    return jsonify(defs), 200

# POST to create/update definitions in bulk NEW FUNCTION
@app.route('/admin/user/<int:student_id>/task-definitions', methods=['POST'])
def update_task_definitions(student_id):
    defs_payload = request.json  # list of {id?, slug, label, field_type}
    with sqlite3.connect(DATABASE) as conn:
      conn.row_factory = sqlite3.Row
      c=conn.cursor()
      # delete any custom defs not in incoming set
      incoming_db_ids = [d['id'] for d in defs_payload if d.get('id') and int(d['id']) > 0]
      if incoming_db_ids:
        placeholders = ','.join('?' * len(incoming_db_ids))
        c.execute(f'''
          DELETE FROM task_definitions
           WHERE student_id=? AND is_default=0
             AND id NOT IN ({placeholders})
        ''', [student_id]+incoming_db_ids)
      else:
        c.execute('DELETE FROM task_definitions WHERE student_id=? AND is_default=0', (student_id,))
      # update each
      for d in defs_payload:
        label = d.get('label', '').strip()
        field_type = d.get('field_type', 'text')
        is_active_val = 1 if d.get('is_active', True) else 0
        
        slug = d.get('slug')
        if not slug and label: # If slug is missing but label exists (likely a new item not yet fully processed client-side)
            slug = snake_case(label)
        elif not slug and not label: # Skip if no label or slug to work with
            continue
        
        if d.get('id') and int(d['id']) > 0:
          db_id = int(d['id'])
          c.execute('''
            UPDATE task_definitions
               SET label=?, field_type=?, is_active=?
             WHERE id=? AND student_id=? AND is_default=0
          ''', (label, field_type, is_active_val, db_id, student_id))
        else:
            if not label or not slug: # Need label and slug to insert
                continue
            # Check if slug already exists for this student to prevent UNIQUE constraint errors
            c.execute("SELECT id FROM task_definitions WHERE student_id=? AND slug=?", (student_id, slug))
            if c.fetchone():
                print(f"Skipping insert for duplicate slug '{slug}' for student {student_id}")
                continue

            # Add to daily_reports table if it's a new custom TEXT or NUMBER field
            # This logic was in your original code. Be careful with schema alterations on the fly.
            if d.get('field_type') in ('text', 'number') and not d.get('is_default'):
                # Check if column already exists
                c.execute(f"PRAGMA table_info(daily_reports)")
                existing_columns = {row['name'] for row in c.fetchall()}
                if slug not in existing_columns:
                    sql_type = 'INTEGER' if d['field_type'] == 'number' else 'TEXT'
                    try:
                        c.execute(f"ALTER TABLE daily_reports ADD COLUMN \"{slug}\" {sql_type}")
                        print(f"Added column {slug} to daily_reports for student {student_id}")
                    except Exception as e:
                        print(f"Error adding column {slug} to daily_reports: {e}")
            
            c.execute('''
                INSERT INTO task_definitions
                    (student_id, slug, label, field_type, is_default, readonly, is_active)
                VALUES (?, ?, ?, ?, 0, 0, ?)
            ''', (student_id, slug, label, field_type, is_active_val))
    conn.commit()
    # After all operations, fetch and return the complete, current list of definitions
    c.execute('''
        SELECT id, slug, label, field_type, readonly, is_default, is_active
        FROM task_definitions
        WHERE student_id=?
        ORDER BY is_default DESC, created_at
    ''', (student_id,))
    
    updated_defs_list = [
        {'id': row['id'], 'slug': row['slug'], 'label': row['label'],
            'field_type': row['field_type'], 'readonly': bool(row['readonly']),
            'is_default': bool(row['is_default']), 'is_active': bool(row['is_active'])}
        for row in c.fetchall()
    ]
    return jsonify(updated_defs_list), 200 # Return the updated list!

@app.route('/admin/user/<int:student_id>/task-entries', methods=['GET'])
def get_task_entries(student_id):
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('''
          SELECT td.slug, te.day_of_week, te.value
            FROM task_entries te
            JOIN task_definitions td ON td.id=te.task_def_id
           WHERE te.student_id=?
        ''', (student_id,))
        rows = c.fetchall()

    tasks = {d: {} for d in
             ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']}
    for slug, day, val in rows:
        tasks[day][slug] = val
    return jsonify(tasks), 200

@app.route('/admin/user/<int:student_id>/task-entries', methods=['POST'])
def update_task_entries(student_id):
    data = request.json  # { "Monday": {"math_points":"10",…}, … }
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        # map slug→id
        c.execute('SELECT id, slug, field_type FROM task_definitions WHERE student_id=?',
                  (student_id,))
        field_map = {r[1]: (r[0], r[2]) for r in c.fetchall()}
        # clear old entries
        c.execute('DELETE FROM task_entries WHERE student_id=?',
                  (student_id,))
        # insert new
        for day, tasks in data.items():
            for slug, val in tasks.items():
                tdid, field_type = field_map.get(slug, (None, None)) 
                if not tdid or val in (None, ''):
                    continue
                if field_type in ('number', 'percent'):
                    try:
                        int(val)
                    except ValueError:
                        return jsonify({
                            'status': 'failure',
                            'message': f'Task "{slug}" requires an integer value.'
                        }), 400
                c.execute('''
                    INSERT INTO task_entries
                    (student_id, task_def_id, day_of_week, value)
                    VALUES (?,?,?,?)
                    ''', (student_id, tdid, day, val))
        conn.commit()
    return jsonify({'status':'success'}), 200


@app.route('/admin/user/<int:user_id>/daily-report/<date>', methods=['GET'])
def get_daily_report(user_id, date):
    # DYNAMIC: pull every slug & type from task_definitions
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('''
            SELECT slug, field_type
            FROM task_definitions
            WHERE student_id=? AND (is_active=1 OR is_default=1)
            ORDER BY is_default DESC, created_at
            ''', (user_id,))
        defs = c.fetchall()

        fields = [slug for slug, _ in defs]
        numeric_fields = [slug for slug, ft in defs if ft in ('number','percent')]
        carry_forward_fields = ['book_title','word_count','expected_weekly_reading_rate']
        
        if not fields:
            # nothing defined yet → avoid bad SQL
            return jsonify({'exists': False, 'report': {}}), 200
        
        c.execute(f'''
            SELECT {', '.join(f'"{col}"' for col in fields)}
            FROM daily_reports
            WHERE user_id=? AND date=?
        ''', (user_id, date))
        row = c.fetchone()
        
    report_data = {}
    
    if row:
        for idx, field in enumerate(fields):
            value = row[idx]
            if value is None and field in carry_forward_fields:
                # explicitly fetch last set value
                value = get_last_explicit_field_value(user_id, date, field)

                # Explicitly check if the date of the fetched value is NOT in future
                if value is not None:
                    value_date = get_last_explicit_field_date(user_id, date, field)
                    if value_date and value_date > date:
                        value = None  # explicitly don't use future values

            if value is not None and field in numeric_fields:
                try:
                    if '.' in str(value):
                        value = float(value)
                    else:
                        value = int(value)
                except (ValueError, TypeError):
                    value = None  # fallback safely
            report_data[field] = value
    else:
        # No entry for this date, explicitly carry forward only specific fields
        for field in fields:
            if field in carry_forward_fields:
                value = get_last_explicit_field_value(user_id, date, field)

                # Explicit future-date safeguard here too
                if value is not None:
                    value_date = get_last_explicit_field_date(user_id, date, field)
                    if value_date and value_date > date:
                        value = None
            else:
                value = None

            if value is not None and field in numeric_fields:
                try:
                    if '.' in str(value):
                        value = float(value)
                    else:
                        value = int(value)
                except (ValueError, TypeError):
                    value = None
            report_data[field] = value

    return jsonify({'exists': bool(row), 'report': report_data}), 200

@app.route('/admin/user/<int:user_id>/daily-report/<date>', methods=['POST'])
def update_daily_report(user_id, date):
    data = request.json # Received payload from frontend
    print(f"--- update_daily_report Endpoint ---")
    print(f"Received request for user {user_id}, date {date}. Payload: {data}")

    with sqlite3.connect(DATABASE) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        # DYNAMIC: load all task slugs + types
        c.execute('''
            SELECT slug, field_type
            FROM task_definitions
            WHERE student_id=?
            ORDER BY is_default DESC, created_at
            ''', (user_id,))
        # Use dictionary comprehension for faster lookup
        defs_map = {row['slug']: row['field_type'] for row in c.fetchall()}
        fields = list(defs_map.keys()) # List of ALL slugs (column names)
        numeric_fields = {slug for slug, ft in defs_map.items() if ft in ('number', 'percent')}

        processed_data = {} # Dictionary to hold final values for DB
        # Define key slugs
        rate_slug = 'expected_weekly_reading_rate'
        count_slug = 'word_count'
        expected_percent_slug = 'expected_daily_reading_percent'
        # --- ADD book_title slug ---
        title_slug = 'book_title'

        # --- Determine word_count and rate for calculation ---
        current_word_count = None
        current_rate = None

        # Prioritize incoming data
        if count_slug in data and data[count_slug] not in [None, '']:
            try: current_word_count = int(data[count_slug])
            except (ValueError, TypeError): pass
        if rate_slug in data and data[rate_slug] not in [None, '']:
            try: current_rate = int(data[rate_slug])
            except (ValueError, TypeError): pass

        # If not in incoming data, fetch last known values
        if current_word_count is None:
            last_count = get_last_explicit_field_value(user_id, date, count_slug)
            if last_count is not None: current_word_count = int(last_count)
        if current_rate is None:
            last_rate = get_last_explicit_field_value(user_id, date, rate_slug)
            if last_rate is not None:
                try: current_rate = int(last_rate) # Try converting from DB
                except (ValueError, TypeError): pass # Ignore potential DB data errors
            else:
                # 3. Apply default ONLY if no incoming AND no previously saved value exists for rate
                # (We might refine this check slightly based on the 'never set' logic)
                # Let's check if a rate was *ever* set for this user before applying default
                c.execute("SELECT 1 FROM daily_reports WHERE user_id = ? AND expected_weekly_reading_rate IS NOT NULL LIMIT 1", (user_id,))
                if not c.fetchone():
                     print(f"Applying default rate (35000) for user {user_id} as no rate was ever set.")
                     current_rate = 35000
                # else: current_rate remains None if it was set previously but not found for this specific lookup

        print(f"Determined calculation values: current_word_count={current_word_count}, current_rate={current_rate}") # Log result
        # --- Calculate expected_daily_reading_percent ---
        calculated_expected_percent = None
        if current_rate is not None and current_word_count is not None and current_word_count > 0:
            try:
                raw_percent_for_storage = (100.0 * current_rate / current_word_count) / 7.0
                # If you want to store it rounded to an INTEGER with "round half up":
                # calculated_expected_percent = int(raw_percent_for_storage + 0.5)
                calculated_expected_percent = round(raw_percent_for_storage, 2)
            except TypeError: pass # Handles potential None types if logic above failed

        # --- Process all fields for saving ---
        for field in fields:
            value = None
            # Use calculated value for expected_daily_reading_percent
            if field == expected_percent_slug:
                value = calculated_expected_percent
            # Use determined values for rate and count
            elif field == rate_slug:
                 value = current_rate
                 print(f"  - Slug '{field}': Using determined value: {value}")
            elif field == count_slug:
                 value = current_word_count
                 print(f"  - Slug '{field}': Using determined value: {value}")
            # --- Does it correctly handle book_title and other text fields? ---
            elif field in data and data[field] not in [None, '']:
                 # Use incoming data if available
                 value = data[field]
                 print(f"  - Slug '{field}': Using value from incoming payload: '{value}'")
                 # Convert numeric fields safely (but this doesn't apply to book_title)
                 if field in numeric_fields:
                     try:
                         # Handle potential floats if needed, otherwise int
                         value = float(value) if '.' in str(value) else int(value)
                     except (ValueError, TypeError):
                         print(f"    - WARNING: Could not convert numeric field '{field}' value '{data[field]}' to number. Setting to None.")
                         value = None
            else:
                 # If not calculated and not in incoming payload, set to None (or handle carry-forward differently if needed)
                 # The previous logic implicitly set others to None if not handled above
                 value = None
                 print(f"  - Slug '{field}': No calculated/incoming value, setting to None.")

            processed_data[field] = value # Assign final value for this field
        # --- *** END PROBLEM AREA CHECK *** ---

        # Prepare for DB execution
        field_list_str = ', '.join(f'"{col}"' for col in fields)
        placeholder_str = ', '.join(['?'] * (len(fields) + 2))
        # Build list of values in the SAME order as 'fields' list
        values_list = [user_id, date] + [processed_data.get(f) for f in fields]

        # Debug print before execution
        print(f"Final processed data for DB: {processed_data}")
        print(f"Executing INSERT/REPLACE with fields: user_id, date, {field_list_str}")
        print(f"Values list for DB: {values_list}")

        try:
            c.execute(f'''
                INSERT OR REPLACE INTO daily_reports (
                    user_id, date, {field_list_str}
                ) VALUES ({placeholder_str})
            ''', values_list)
            conn.commit()
            print("Database commit successful.")
            return jsonify({'status': 'success'}), 200
        except Exception as e:
            print(f"Database error: {e}") # Log the specific error
            conn.rollback()
            return jsonify({'status': 'failure', 'message': f'Database error: {e}'}), 500


@app.route('/last-known-data/<int:user_id>/<date>', methods=['GET'])
def last_known_data(user_id, date):
    fields = ['book_title', 'word_count', 'accumulated_reading_percent', 'expected_weekly_reading_rate']
    data = {}

    for field in fields:
        data[field] = get_last_explicit_field_value(user_id, date, field)

    return jsonify(data), 200

@app.route('/admin/user/<int:user_id>/has-data', methods=['GET'])
def user_has_data(user_id):
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('SELECT COUNT(*) FROM daily_reports WHERE user_id=?', (user_id,))
        has_data = c.fetchone()[0] > 0
    return jsonify({'hasData': has_data}), 200

@app.route('/submit', methods=['POST'])
def submit_data():
    data = request.json
    user_id = data['user_id']
    date = data['date']

    prev_data = get_previous_day_data(user_id, date)
    book_title = data.get('book_title') or (prev_data[0] if prev_data else None)
    #print(f"SUBMIT endpoint received date: {date}, user_id: {user_id}, book_title: {book_title}")
    if 'word_count' in data and data['word_count'] not in [None, '']:
        word_count = int(data['word_count'])
    elif prev_data and prev_data[1] is not None:
        word_count = prev_data[1]
    else:
        word_count = None  # Important: allow explicit carry-forward here, don't set to 0!
    if data.get('expected_weekly_reading_rate') not in [None, '']:
        expected_weekly_reading_rate = int(data['expected_weekly_reading_rate'])
    elif prev_data and prev_data[2]:
        expected_weekly_reading_rate = int(prev_data[2])
    else:
        expected_weekly_reading_rate = 35000  # Explicit default applied here
    #expected_weekly_reading_rate = data.get('expected_weekly_reading_rate') or (prev_data[2] if prev_data else 35000)

    expected_weekly_reading_percent = (
        100 * expected_weekly_reading_rate / word_count
        if word_count else None
    )
    # <-- Explicitly handle expected_daily_reading_percent safely here -->
    if data.get('expected_daily_reading_percent') not in [None, '']:
        expected_daily_reading_percent = float(data['expected_daily_reading_percent'])
    elif expected_weekly_reading_percent is not None:
        expected_daily_reading_percent = expected_weekly_reading_percent / 7
    else:
        expected_daily_reading_percent = None

    accumulated_reading_percent = int(data.get('accumulated_reading_percent') or (prev_data[3] if prev_data else 0))
    #daily_reading_percent = None if prev_data is None else (accumulated_reading_percent - prev_data[3])
    daily_reading_percent = accumulated_reading_percent - int(prev_data[3] if prev_data else 0)
    accumulated_weekly_reading_percent = get_accumulated_weekly_reading_percent(user_id, date, daily_reading_percent)

    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('''INSERT INTO daily_reports (
            user_id, date, book_title, word_count, expected_weekly_reading_rate,
            expected_weekly_reading_percent, expected_daily_reading_percent, accumulated_reading_percent,
            daily_reading_percent, accumulated_weekly_reading_percent,
            expected_math_points, actual_math_points, math_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
            user_id, date, book_title, word_count, expected_weekly_reading_rate,
            expected_weekly_reading_percent, expected_daily_reading_percent, accumulated_reading_percent,
            daily_reading_percent, accumulated_weekly_reading_percent,
            int(data.get('expected_math_points') or 0), int(data.get('actual_math_points') or 0), int(data.get('math_time') or 0)
        ))
        conn.commit()

    return jsonify({'status':'success'}), 201

@app.route('/previous-day-data/<int:user_id>/<date>', methods=['GET'])
def previous_day_data(user_id, date):
    prev_data = get_previous_day_data(user_id, date)
    if prev_data:
        return jsonify({
            'book_title': prev_data[0],
            'word_count': prev_data[1],
            'accumulated_reading_percent': prev_data[3]
        }), 200
    else:
        return jsonify({}), 200

@app.route('/admin/user/<int:user_id>/daily-report/<date>/weekly-progress', methods=['GET'])
def get_weekly_progress(user_id, date):
    try:
        # Call the helper function
        progress_data = _get_weekly_progress_data(user_id, date)
        # Return the result as JSON
        return jsonify(progress_data), 200
    except ValueError as e:
        # Handle potential date format error from helper
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        # Catch other unexpected errors during calculation
        print(f"ERROR in get_weekly_progress for user {user_id}, date {date}: {e}") # Log error
        # Optionally include traceback: import traceback; traceback.print_exc()
        return jsonify({"error": "An internal server error occurred processing weekly progress."}), 500

@app.route('/weekly-progress/<int:user_id>/<date>', methods=['GET'])
def get_student_weekly_progress(user_id, date):
    try:
        # Call the SAME helper function
        progress_data = _get_weekly_progress_data(user_id, date)
        # Return the result as JSON
        return jsonify(progress_data), 200
    except ValueError as e:
        # Handle potential date format error from helper
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        # Catch other unexpected errors during calculation
        print(f"ERROR in get_student_weekly_progress for user {user_id}, date {date}: {e}") # Log error
        return jsonify({"error": "An internal server error occurred processing weekly progress."}), 500

# Serve React frontend
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

# --- ADD NEW ENDPOINT HERE ---
@app.route('/admin/task-definition/<int:definition_id>/set-active-status', methods=['POST'])
def set_task_definition_active_status(definition_id):
    print("Inside set_task_definition_active_status") 
    data = request.json
    new_status = data.get('is_active')

    if new_status is None or not isinstance(new_status, bool):
        return jsonify({'status': 'failure', 'message': 'Invalid or missing is_active status. Must be true or false.'}), 400

    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute('''
                UPDATE task_definitions
                SET is_active = ?
                WHERE id = ?
            ''', (1 if new_status else 0, definition_id))
            conn.commit()

            if c.rowcount == 0:
                return jsonify({'status': 'failure', 'message': 'Task definition not found.'}), 404
            
        return jsonify({'status': 'success', 'message': f'Task definition {definition_id} status set to {"active" if new_status else "inactive"}.'}), 200
    except Exception as e:
        print(f"Error updating task definition active status: {e}") # For server-side logging
        return jsonify({'status': 'failure', 'message': 'An error occurred while updating the task status.'}), 500

if __name__ == '__main__':
    app.run(debug=True)
