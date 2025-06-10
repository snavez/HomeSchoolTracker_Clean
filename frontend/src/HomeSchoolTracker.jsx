import { useState, useEffect } from 'react';
import { ResponsiveContainer, ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function HomeSchoolTracker({ userId, onLogout }) {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const [entry, setEntry] = useState({ date: todayStr });
  const [definitions, setDefinitions] = useState([]);
  const [entries, setEntries] = useState({});
  const [weeklyData, setWeeklyData] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [textTaskData, setTextTaskData] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    console.log(`Input changed: ${name}=${value}`);
    if (name === 'date') return;
    setEntry(prevEntry => ({ ...prevEntry, [name]: value }));
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('user');
      window.location.href = '/';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // 🛡 enforce whole numbers ≥0
    const isWhole = v => Number.isInteger(+v) && +v >= 0;
    const ints = ['actual_math_points','math_time','accumulated_reading_percent'];
    if (ints.some(slug => entry[slug] != null && entry[slug] !== '' && !isWhole(entry[slug]))) {
      alert('Please enter whole numbers ≥ 0 for points, time, and reading percent.');
      return;
    }

    const payload = {
      user_id: userId,
      date: entry.date,
      ...definitions.reduce((acc, def) => {
        const v = entry[def.slug];
        acc[def.slug] = (v !== undefined && v !== '') ? v : null;
        return acc;
      }, {})
    };

    console.log("Submitting data:", payload);

    try {
      const res = await fetch(`/admin/user/${userId}/daily-report/${entry.date}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.status === 'success') {
        //alert('Data submitted successfully!');
        const userIdentifier = userId; // Or userId for student
        const dateIdentifier = entry.date; // Or entry.date for student
        const isAdmin = typeof userId !== 'undefined'; // Crude check
        const endpoint = isAdmin
         ? `/admin/user/${userIdentifier}/daily-report/${dateIdentifier}/weekly-progress`
         : `/weekly-progress/${userIdentifier}/${dateIdentifier}`;

        if (userIdentifier && dateIdentifier) {
          console.log(`Refetching weekly data after save from: ${endpoint}`);
          fetch(endpoint) // Use the correct endpoint
            .then(r => r.ok ? r.json() : { dailyData: [], summary: null, textTasks: null }) // Handle potential errors & structure
            .then(data => {
              console.log("Refetched weekly data structure:", data);
              // --- UNPACK the response object ---
              setWeeklyData(data.dailyData || []);
              setWeeklySummary(data.summary || null);
              setTextTaskData(data.textTasks || null);
            })
            .catch(err => {
              console.error("Error refetching weekly data after save:", err);
              setWeeklyData([]); setWeeklySummary(null); setTextTaskData(null);
            });
        }
      } else {
         alert(`Submission failed: ${result.message || 'Please try again.'}`);
      }
    } catch (err) {
       console.error("Error submitting data:", err);
       alert('Error submitting data. Please check your connection.');
    }
  };
  
  // Load the shape of the form
  useEffect(() => {
    if (!userId) return;
    fetch(`/admin/user/${userId}/task-definitions`)
      .then(r => r.json())
      .then(setDefinitions);
  }, [userId]);

  // Load the student's weekly task plan so "Expected Today" works
  useEffect(() => {
    if (!userId) return;
    fetch(`/admin/user/${userId}/task-entries`)
      .then(r => r.json())
      .then(setEntries);
  }, [userId]);

  // --- REVISED: useEffect for loading daily form data ---
  useEffect(() => {
    // Guard clauses
    if (!entry.date || !userId || definitions.length === 0) {
        // Optionally clear fields, keeping date if desired
        // setEntry(prev => ({ date: prev.date, /* other fields null/empty */ }));
        return;
    };

    console.log(`STUDENT EFFECT: Fetching report for date: ${entry.date}, user: ${userId}`);

    fetch(`/admin/user/${userId}/daily-report/${entry.date}`) // Uses admin route
    .then(r => {
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
        return r.json();
     })
    .then(({ exists, report }) => {
      console.log("STUDENT EFFECT: Fetched daily report data:", { exists, report });
      const updatedEntry = { date: entry.date };

      if (exists) {
        // **** Report EXISTS for this specific date ****
        console.log("STUDENT EFFECT: Processing EXISTING report data:", report);
        definitions.forEach(def => {
            updatedEntry[def.slug] = (report[def.slug] !== null && report[def.slug] !== undefined)
                                        ? String(report[def.slug]) : '';
        });
        console.log("STUDENT EFFECT: Setting state from EXISTING report:", updatedEntry);
        setEntry(updatedEntry);

      } else {
        // **** NO report exists - Use carry-forward & PLANNED reading % ****
        console.log("STUDENT EFFECT: No report, using carry-forward & plan");
        fetch(`/last-known-data/${userId}/${entry.date}`) // Still need this for carry-forward
        .then(r => {
             if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
             return r.json();
        })
        .then(data => {
          console.log("STUDENT EFFECT: Carry-forward data received:", data);
          const carry = ['book_title','word_count','accumulated_reading_percent', 'expected_weekly_reading_rate'];
          // --- Determine weekday to look up the plan ---
          let weekday = '';
          try {
              weekday = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
          } catch { console.error("Invalid date for weekday lookup:", entry.date); }

          // --- Get PLANNED reading percent from 'entries' state ---
          const plannedReadingPercent = entries[weekday]?.['expected_daily_reading_percent'] || '';
          console.log(`STUDENT EFFECT: Using planned reading % for ${weekday}: ${plannedReadingPercent}`);

          definitions.forEach(def => {
            if (carry.includes(def.slug)) {
              // Use carried value if available, else default (e.g., rate)
               updatedEntry[def.slug] = (data[def.slug] != null)
                   ? String(data[def.slug])
                   : (def.slug === 'expected_weekly_reading_rate' ? '35000' : '');
            } else if (def.slug === 'expected_daily_reading_percent') {
               // --- Use the PLANNED percent for the form display ---
               updatedEntry[def.slug] = plannedReadingPercent;
            } else {
              // Default other fields to empty string
              updatedEntry[def.slug] = '';
            }
          });
           console.log("STUDENT EFFECT: Setting state from CARRY-FORWARD/PLAN:", updatedEntry);
          setEntry(updatedEntry); // Set state after processing carry-forward/plan
        })
        .catch(err => {
            console.error("Error fetching last-known data:", err);
             const resetEntry = { date: entry.date }; definitions.forEach(def => { resetEntry[def.slug] = ''; }); setEntry(resetEntry);
        });
      }
    })
    .catch(err => {
        console.error("Error fetching daily report:", err);
         const resetEntry = { date: entry.date }; definitions.forEach(def => { resetEntry[def.slug] = ''; }); setEntry(resetEntry);
    });
  // Add 'entries' to dependency array as we now rely on it in the 'else' block
  }, [entry.date, userId, definitions, entries]);
  
  // --- REVISED: Fetch weekly data (and summary/text tasks) ---
  useEffect(() => {
    // Use props/state from HomeSchoolTracker
    const userIdentifier = userId;
    const dateIdentifier = entry.date;
    const endpoint = `/weekly-progress/${userIdentifier}/${dateIdentifier}`; // Student endpoint

    if (!userIdentifier || !dateIdentifier) {
      setWeeklyData([]);
      setWeeklySummary(null);
      setTextTaskData(null); // Clear all related state
      return;
    };

    console.log(`STUDENT: Fetching weekly data from: ${endpoint}`);

    fetch(endpoint)
      .then(r => { /* ... (Error handling as provided previously) ... */
          if (!r.ok) { /* ... throw error ... */ }
          return r.json();
       })
      .then(data => {
        console.log("STUDENT: Fetched weekly data structure:", data);
        // --- UNPACK THE RESPONSE OBJECT ---
        setWeeklyData(data.dailyData || []);
        setWeeklySummary(data.summary || null);
        setTextTaskData(data.textTasks || null);
        console.log("STUDENT State Check - weeklySummary:", weeklySummary);
        console.log("STUDENT State Check - textTaskData:", textTaskData);
      })
      .catch(err => { /* ... (Error logging and state clearing as provided previously) ... */
        console.error("STUDENT: Error fetching or processing weekly data:", err);
        setWeeklyData([]); setWeeklySummary(null); setTextTaskData(null);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, entry.date]);
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-semibold">Homeschool Daily Tracker</h1>
        <button 
          className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow-md">
        <div>
          <label className="block">Date:</label>
          <input 
          type="date" 
          name="date" 
          value={entry.date} 
          disabled 
          className="border p-2 rounded text-gray-700 bg-gray-50 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          style={{ maxWidth: '180px' }} 
          onChange={handleInputChange}
          readonly 
          />
        </div>

        {entry.date && (
          <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 rounded">
            <strong>Expected Today:</strong>{' '}
            {(() => {
              let day = '';
              try {
                 day = new Date(entry.date + 'T00:00:00')
                    .toLocaleDateString('en-US',{ weekday:'long' });
              } catch (e) { console.error("Invalid date for 'Expected Today':", entry.date); }

              const todayTasks = entries[day] || {};
              return definitions
                .filter(def => todayTasks[def.slug])
                .map(def => `${def.label}: ${todayTasks[def.slug]}`)
                .join(', ') || 'None set';
            })()}
          </div>
        )}

       {definitions
        .filter(def =>
          (def.is_active ?? true) && (
          !def.is_default
          || [
            'actual_math_points',
            'math_time',
            'book_title',
            'accumulated_reading_percent'
          ].includes(def.slug)
          )
        )
       
       .map(def => (
        <div key={def.slug}>
          <label className="block">{def.label}:</label>
          {def.field_type === 'text' ? (
            <>
              {console.log(`Rendering text input for ${def.slug}, state value: '${entry[def.slug] || ''}'`)}
              <input
                type="text" // Explicitly set type
                name={def.slug}
                readOnly={def.readonly}
                className={`w-full border p-2 rounded ${def.readonly?'bg-gray-100':'border-gray-300'}`}
                value={entry[def.slug] || ''}
                onChange={handleInputChange}
              />
            </>
          ) : (
            <input
              type="number" // Explicitly set type
              min="0"
              name={def.slug}
              readOnly={def.readonly || def.slug === 'expected_daily_reading_percent'} // Keep expected % read-only
              className={`w-full border p-2 rounded ${
                  (def.readonly || def.slug === 'expected_daily_reading_percent')
                    ? 'bg-gray-100'
                    : 'border-gray-300'
              }`}
              step={def.field_type === 'percent' ? 0.1 : 1} // Use step for number/percent
              value={entry[def.slug] || ''}
              onChange={handleInputChange}
            />
          )}
        </div>
      ))}

        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition">
          Submit Daily Report
        </button>
      </form>

      <div className="mt-6">
        <h2 className="text-2xl font-semibold mb-4">Weekly Progress Charts</h2>
        {weeklyData.length > 0 ? (
          <>
            {/* Math Section */}
            <div className="mb-8 p-4 bg-white rounded shadow">
              <h3 className="font-medium mb-2">Math Progress</h3>
              {/* This div arranges the daily and summary charts */}
              <div className="flex flex-wrap md:flex-nowrap gap-4 items-start">
                {/* DAILY Math Chart */}
                <div className="flex-auto w-full md:w-auto min-w-[300px]">
                  <h4 className="font-normal mb-1 text-center text-gray-600">Daily: Points vs Time</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={weeklyData} margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        tickFormatter={(value, index) => {
                            const item = weeklyData[index];
                            if (!item || !item.date) return value;
                            const dateObj = new Date(item.date + 'T00:00:00');
                            const dayName = dateObj.toLocaleDateString('en-NZ', { weekday: 'short' });
                            const dayNum = dateObj.getDate();
                            const month = dateObj.getMonth() + 1;
                            const shortDate = `${dayNum}/${month}`;
                            return `${dayName} ${shortDate}`;
                        }}
                        interval={0}
                      />
                      <YAxis yAxisId="left" label={{ value: 'Points', angle: -90, position: 'insideLeft' }} />
                      <YAxis yAxisId="right" orientation="right" label={{ value: 'Time (min)', angle: 90, position: 'insideRight' }}/>
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="actual_math_points" name="Actual Points" fill="#7194da" />
                      <Bar yAxisId="left" dataKey="expected_math_points" name="Target Points" fill="#b30000" />
                      <Line yAxisId="right" type="monotone" dataKey="math_time" name="Actual Time (min)" stroke="#7194da" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="expected_math_time" name="Target Time (min)" stroke="#b30000" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {/* WEEKLY Math Summary Chart */}
                <div className="flex-shrink-0 w-full md:w-1/4 md:basis-1/4 md:pl-4 border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0">
                  <h4 className="font-normal mb-1 text-center text-gray-600">Weekly Total Points</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                        data={[{ // Data structure for the bar chart
                            name: 'Total', // Single category
                            Actual: weeklySummary.total_actual_math_points,
                            Target: weeklySummary.total_expected_math_points
                        }]}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="category" dataKey="name" hide/> {/* Hide 'Total' label */}
                        <YAxis type="number"  /> {/* Values on X-axis */}
                        <Tooltip />
                        <Legend />
                        {/* Ensure dataKeys match the keys in the data array above */}
                        <Bar dataKey="Actual" name="Actual Points" fill="#7194da" />
                        <Bar dataKey="Target" name="Target Points" fill="#b30000" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Reading Section */}
            <div className="bg-white p-4 rounded shadow">
              <h3 className="font-medium mb-2">Reading Progress</h3>
              {/* This div arranges the daily and summary charts */}
              <div className="flex flex-wrap md:flex-nowrap gap-4 items-start">

                {/* DAILY Reading Chart */}
                <div className="flex-auto w-full md:w-auto min-w-[300px]">
                  <h4 className="font-normal mb-1 text-center text-gray-600">Daily Reading Progress</h4>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={weeklyData} margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        tickFormatter={(value, index) => {
                            const item = weeklyData[index];
                            if (!item || !item.date) return value;
                            const dateObj = new Date(item.date + 'T00:00:00');
                            const dayName = dateObj.toLocaleDateString('en-NZ', { weekday: 'short' });
                            const dayNum = dateObj.getDate();
                            const month = dateObj.getMonth() + 1;
                            const shortDate = `${dayNum}/${month}`;
                            return `${dayName} ${shortDate}`;
                        }}
                        interval={0}
                      />
                      <YAxis label={{ value: 'Percent (%)', angle: -90, position: 'insideLeft' }}/>
                      <Tooltip />
                      <Legend />
                      <Line dataKey="daily_reading_percent" name="Actual % Read" stroke="#7194da" strokeWidth={2} />
                      <Line type="monotone" dataKey="expected_daily_reading_percent" name="Target % Read" stroke="#b30000" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* WEEKLY Reading Summary Chart */}
                <div className="flex-shrink-0 w-full md:w-1/4 md:basis-1/4 md:pl-4 border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0">
                  <h4 className="font-normal mb-1 text-center text-gray-600">Weekly Total Reading %</h4>
                  <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                          data={[{ // Data structure for the bar chart
                              name: 'Total', // Single category
                              Actual: weeklySummary.total_actual_reading_percent,
                              Target: weeklySummary.total_expected_reading_percent
                          }]}
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="category" dataKey="name" hide/> {/* Hide 'Total' label */}
                          <YAxis type="number"  /> {/* Values on X-axis */}
                          <Tooltip />
                          <Legend />
                          {/* Ensure dataKeys match the keys in the data array above */}
                          <Bar dataKey="Actual" name="Actual Reading %" fill="#7194da" />
                          <Bar dataKey="Target" name="Target Reading %" fill="#b30000" />
                      </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Weekly Text Task Summary Section */}
            <div className="mt-8">
              <h4 className="text-2xl font-semibold mb-4">Weekly Text Task Summary</h4>
              {/* Check if textTaskData and its labels exist */}
              {textTaskData && textTaskData.labels && Object.keys(textTaskData.labels).length > 0 ? (
                // --- Render the table ---
                <div className="overflow-x-auto bg-white p-4 rounded shadow"> {/* Added container styling */}
                  <table className="min-w-full border-collapse border border-gray-300 text-sm md:text-base"> {/* Table styling */}
                    <thead>
                      <tr className="bg-gray-100">
                        {/* Sticky header for task name */}
                        <th className="border px-3 py-2 text-left sticky left-0 bg-gray-100 z-10">Task</th>
                        {/* Day headers */}
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                            <th key={day} className="border px-3 py-2">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Iterate over the labels provided by the backend */}
                      {Object.entries(textTaskData.labels).map(([slug, label]) => (
                        <tr key={slug} className="hover:bg-gray-50">
                        {/* Task Label Cell (Leave as is) */}
                        <td className="border px-3 py-2 sticky left-0 bg-white z-10 font-medium">{label}</td>

                        {/* --- ULTRA-SIMPLIFIED DAY MAPPING --- */}
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(dayShort => {
                            // Define the map INSIDE the loop (less efficient, but safer for now)
                            const shortToLongDay = {
                                Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
                                Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday'
                            };
                            const dayLong = shortToLongDay[dayShort]; // Get corresponding long name

                            // Determine status based on plan (using dayLong) and completion (using dayShort)
                            const plannedValue = textTaskData.plan?.[slug]?.[dayLong];
                            const isPlanned = plannedValue && plannedValue.trim() !== '';
                            const isComplete = textTaskData.completion?.[slug]?.[dayShort];

                            // Optional: Keep this log for one more check
                            console.log(`Text Summary Check: ShortDay=${dayShort}, LongDay=${dayLong}, Slug=${slug}, PlannedVal='${plannedValue}', isPlanned=${isPlanned}, isComplete=${isComplete}`);

                            // Symbol determination logic (unchanged from before)
                            let symbol = <span className="text-gray-400 text-md" title="Not Planned, Not Done">-</span>;
                            let symbolTitle = "Not Planned, Not Done";
                            if (isPlanned && isComplete) {
                                symbol = <span className="text-green-600 text-xl font-bold" title="Planned & Done">✓</span>;
                                symbolTitle = "Planned & Done";
                            } else if (isPlanned && !isComplete) {
                                symbol = <span className="text-red-500 text-xl font-bold" title="Planned, Not Done">X</span>;
                                symbolTitle = "Planned, Not Done";
                            } else if (!isPlanned && isComplete) {
                                symbol = <span className="text-orange-500 text-xl font-bold" title="Not Planned, But Done">✓</span>;
                                symbolTitle = "Not Planned, But Done";
                            }

                            // Return the actual TD with the calculated symbol
                            return (
                              <td key={`${slug}-${dayShort}`} className="border px-2 py-2 text-center" title={symbolTitle}>
                                    {symbol}
                              </td>
                            );
                        })}
                      </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* --- ADDED: Legend --- */}
                  <div className="mt-3 text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Legend:</span>
                    <span><span className="text-green-600 font-bold">✓</span> Set task complete</span>
                    <span><span className="text-red-500 font-bold">X</span> Set task not done</span>
                    <span><span className="text-orange-500 font-bold">✓</span> Extra work</span>
                    <span><span className="text-gray-400">-</span> Not Set</span>
                  </div>
                </div>
              ) : textTaskData ? (
                // Message if textTaskData exists but no text tasks are defined
                <p className="p-4 bg-gray-100 rounded text-gray-500">No custom text tasks defined for this user.</p>
              ) : (
                // Message if data hasn't loaded yet
                <p className="p-4 bg-gray-100 rounded text-gray-500">Select a date to view text task summary.</p>
              )}
            </div>
          </>
        ) : (
          // Message if no data
          <p className="mt-6 text-gray-500">Select a date to view weekly progress charts.</p>
        )}
      </div>
    </div>
  );
}
