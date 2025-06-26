import * as React from 'react';
import { useState, useEffect } from 'react';
import { ResponsiveContainer, ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
let nextTempId = -1; // Initialize a counter for temporary IDs

export default function AdminTasksEditor({ onLogout }) {

  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'student' });
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  //const [userState, setUserState] = useState({ hasTasks: false, hasData: false });
  const [currentAction, setCurrentAction] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [entry, setEntry] = useState({ date: '' });
  const [definitions, setDefinitions] = useState([]);
  const [entries, setEntries] = useState({});
  const [newLabel, setNewLabel] = useState('');
  const [weeklyData, setWeeklyData] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [textTaskData, setTextTaskData] = useState(null);
  const [flash, setFlash] = useState(null);
  const [tierBounds, setTierBounds] = useState({ needsWorkMax: 0.88, goodMax: 0.98 });
  const [tierMsgs, setTierMsgs] = useState({ progress:{}, final:{} });
  const tierClasses = {
    excellent:  'p-4 my-4 rounded bg-green-100 border-l-4 border-green-600',
    good:       'p-4 my-4 rounded bg-blue-100  border-l-4 border-blue-600',
    needsWork:'p-4 my-4 rounded bg-red-100   border-l-4 border-red-600',
    noData:  'p-4 my-4 rounded bg-gray-100  border-l-4 border-gray-400'
  };
  const defaultMsgs = {
    progress: {
      excellent: 'Awesome — you’re on track for a great week!',
      good:      'You’re doing well - but keep focusing on your daily to-dos.',
      needsWork: 'Uh-oh - looks like you’re falling behind.  Try and make up some of your missed tasks'
    },
    final: {
      excellent: 'Woo!!  Goal achieved! Double pocket money this week! 🎉',
      good:      'A solid effort - try for a bonus next week!',
      needsWork: 'Tsk tsk – not enough effort. You’re on the chore roster next week!'
    }
  };
  

useEffect(() => {
  if (!selectedUser) {
    setDefinitions([]);
    setEntry({});     // clear any prior entry state
    return;
  }
  fetch(`/admin/user/${selectedUser}/task-definitions`)
    .then(res => res.json())
    .then(setDefinitions);
}, [selectedUser]);

useEffect(() => {
  fetch('/admin/tier-thresholds')
  .then(r=>r.json())
  .then(setTierBounds)
  .catch(console.error);
}, []);

useEffect(() => {
  fetch('/tier-messages')
    .then(r => r.json())
    .then(setTierMsgs)
    .catch(console.error);
}, []);

useEffect(() => {
  if (!selectedUser) return;
  // grab whatever the student already has set for each day/slug
  fetch(`/admin/user/${selectedUser}/task-entries`)
    .then(r => r.json())
    .then(initialEntries => {
      setEntries(initialEntries);
      // Now fetch the student's last word_count & weekly rate
      const today = new Date().toLocaleDateString('en-CA');
      fetch(`/last-known-data/${selectedUser}/${today}`)
      .then(r2 => r2.json())
      .then(({ word_count, expected_weekly_reading_rate }) => {
      // Compute percent if possible, else use blank
      const percent = (word_count && expected_weekly_reading_rate)
      ? Math.round((100 * expected_weekly_reading_rate / word_count) / 7)
      : '';
      // Inject it into every day's entries
      setEntries(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(day => {
          updated[day] = {
            ...updated[day],
            expected_daily_reading_percent: percent
          };
        });
        return updated;
      });
    });
  });
}, [selectedUser]);

useEffect(() => {
  if (!selectedUser || !selectedDate) {
    setEntry({});    // clear when no date/user
    return;
  }

   // Try to get an existing saved report
  fetch(`/admin/user/${selectedUser}/daily-report/${selectedDate}`)
    .then(r => r.json())
    .then(({ exists, report }) => {
      if (exists) {
        // we've got saved values → use them
        setEntry(report);
      } else {
        // no saved row → carry-forward built-ins
        fetch(`/last-known-data/${selectedUser}/${selectedDate}`)
          .then(r => r.json())
          .then(data => {
            const carry = ['book_title','word_count','accumulated_reading_percent','expected_weekly_reading_rate'];
            const newEntry = { date: selectedDate };
            definitions.forEach(def => {
              if (carry.includes(def.slug)) {
                // use last-known value, or 35000 for reading rate
                newEntry[def.slug] = (data[def.slug] != null)
                  ? data[def.slug]
                  : (def.slug === 'expected_weekly_reading_rate' ? 35000 : '');
              } else {
                newEntry[def.slug] = '';
              }
            });
            setEntry(newEntry);
          });
      }
    });
  }, [selectedUser, selectedDate, definitions]);


// loads all available users and runs only once on component mount [] dependency
useEffect(() => {
  fetch('/admin/users')
    .then(res => {
      if (!res.ok) throw new Error(`Error fetching users: ${res.status}`);
      return res.json();
    })
    .then(data => setUsers(data))
    .catch(err => console.error(err));
  }, []); 

 useEffect(() => {
  if (!selectedUser || !selectedDate) return;
  fetch(`/admin/user/${selectedUser}/daily-report/${selectedDate}/weekly-progress`)
    .then(r => r.json())
    .then(setWeeklyData)
    .catch(console.error);
  }, [selectedUser, selectedDate])  

useEffect(() => {
    // Only run calculation if user is selected AND Edit Tasks tab is active
    if (selectedUser && currentAction === 'editTasks') {
        console.log("EFFECT: Fetching and Recalculating reading % for Edit Tasks tab");
        const today = new Date().toLocaleDateString('en-CA'); // Use today to get latest known
        fetch(`/last-known-data/${selectedUser}/${today}`) // Fetch the absolute latest data
            .then(r => r.ok ? r.json() : {})
            .then(data => {
                const rate = data?.expected_weekly_reading_rate;
                const count = data?.word_count;
                let calculatedPercent = ''; // Default to blank
                if (rate != null && count != null && count > 0) {
                    try {
                        // Calculate and round to integer
                        calculatedPercent = String(Math.round((100.0 * rate / count) / 7.0));
                    } catch { /* Keep blank */ }
                }
                console.log("Calculated latest reading percent:", calculatedPercent);
                // --- BEGIN MODIFICATION ---
                // Update the entries state with the new percentage
                setEntries(prev => {
                  const updated = { ...prev };
                  Object.keys(updated).forEach(day => {
                    updated[day] = {
                      ...updated[day],
                      expected_daily_reading_percent: calculatedPercent
                    };
                  });
                  return updated;
                });
                // --- END MODIFICATION ---
            })
            .catch(err => {
                console.error("Error fetching last known data for calc:", err);
            });
    } else if (!selectedUser) {
         // Clear percent if no user selected or not on Edit Tasks tab
         // --- ADDED: Clear entries if no user or not on this tab to ensure consistency ---
         // setEntries(prev => {
         //   const cleared = { ...prev };
         //   Object.keys(cleared).forEach(day => {
         //     if (cleared[day]) { // Check if day entry exists
         //       cleared[day] = {
         //         ...cleared[day],
         //         expected_daily_reading_percent: '' // Clear the percent
         //       };
         //     }
         //   });
         //   return cleared;
         // });
         // --- END ADDED ---
    }
// Re-fetch and calculate ONLY when user changes OR when the editTasks tab becomes active
}, [selectedUser, currentAction]);

useEffect(() => {
  if (!selectedUser || !selectedDate) {
    setEntry({ date: selectedDate || '' });
    return;
  }
  if (definitions.length === 0) {
    console.log("DAILY FORM EFFECT: Skipping fetch, definitions not loaded yet.");
    return;
  } // Wait for definitions

  console.log(`DAILY FORM EFFECT: Triggered for user ${selectedUser}, date ${selectedDate}`);

  fetch(`/admin/user/${selectedUser}/daily-report/${selectedDate}`)
    .then(r => {
          if (!r.ok) { throw new Error(`HTTP error ${r.status}`); } // Basic error check
          return r.json();
      })
    .then(({ exists, report }) => {
      console.log(`DAILY FORM EFFECT: Received from backend: exists=${exists}`, JSON.parse(JSON.stringify(report || {})));
      const updatedEntry = { date: selectedDate };

      if (exists) {
         // If report exists, use its values directly
         console.log("DAILY FORM: Loading EXISTING report:", report);
         definitions.forEach(def => {
          const reportValue = report[def.slug];
          console.log(`  - Processing slug '${def.slug}': Report value is '${reportValue}' (Type: ${typeof reportValue})`);
          updatedEntry[def.slug] = (reportValue !== null && reportValue !== undefined)
                                         ? String(reportValue) : '';
         });
         console.log("DAILY FORM: Setting state from EXISTING report:", updatedEntry);
         setEntry(updatedEntry); // Set state right away

      } else {
         // If report DOES NOT exist, fetch last known to calculate display values
         console.log("DAILY FORM: No existing report, fetching last known for calculation");
         fetch(`/last-known-data/${selectedUser}/${selectedDate}`) // Use selectedDate
           .then(r => r.ok ? r.json() : {})
           .then(data => {
             console.log("DAILY FORM: Carry-forward data received:", data);
             const carry = ['book_title','word_count','accumulated_reading_percent','expected_weekly_reading_rate'];
             //const rate = data?.expected_weekly_reading_rate;
             //const count = data?.word_count;
             //let calculatedPercent = '';
             let weekday = ''; try { weekday = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }); } catch {}
             const plannedReadingPercent = entries[weekday]?.['expected_daily_reading_percent'] || '';

//             if (rate != null && count != null && count > 0) {
//                  try { calculatedPercent = String(Math.round((100.0 * rate / count) / 7.0)); } catch {}
//             }

             definitions.forEach(def => {
              let valueToSet = '';
              if (carry.includes(def.slug)) {
                 const carriedValue = data[def.slug];
                 valueToSet = (carriedValue != null) ? String(carriedValue) : (def.slug === 'expected_weekly_reading_rate' ? '35000' : '');
                 console.log(`  - Processing slug '${def.slug}': Carried value is '${carriedValue}', Setting to '${valueToSet}'`);
              } else if (def.slug === 'expected_daily_reading_percent') {
                 valueToSet = plannedReadingPercent;
                 console.log(`  - Processing slug '${def.slug}': Using planned value '${valueToSet}'`);
              } else {
                 valueToSet = ''; // Default other fields to blank
                 console.log(`  - Processing slug '${def.slug}': Setting to default empty string`);
              }
              updatedEntry[def.slug] = valueToSet;
           });
           // --- ADD LOG: Log the final entry object JUST before setting state (inside .then) ---
           console.log("DAILY FORM EFFECT (Carry-Forward): Final updatedEntry object:", JSON.parse(JSON.stringify(updatedEntry)));
           setEntry(updatedEntry); // Set state after processing carry-forward/plan
         })
         .catch(err => {
              console.error("Error fetching last known data:", err);
              const resetEntry = { date: selectedDate }; definitions.forEach(def => { resetEntry[def.slug] = ''; }); setEntry(resetEntry);
         });
        // Prevent setting state immediately if we are doing the inner fetch
        return;
     } // End of else block

     // --- ADD LOG: Log the final entry object JUST before setting state (if report existed) ---
     console.log("DAILY FORM EFFECT (Existing Report): Final updatedEntry object:", JSON.parse(JSON.stringify(updatedEntry)));
     setEntry(updatedEntry); // Set state right away if report existed

   })
    .catch(err => {
        console.error("Error fetching daily report:", err);
        const resetEntry = { date: selectedDate }; definitions.forEach(def => { resetEntry[def.slug] = ''; }); setEntry(resetEntry);
    });
}, [selectedUser, selectedDate, definitions, entries]);

const handleInputChange = ({target:{name,value}}) =>
  setEntry(e=>({ ...e, [name]:value }));
  
const handleLogout = () => {
  if (onLogout) {
    onLogout();  // call parent logout handler if provide
  } else {
    // If you're managing state locally (no parent handler provided):
    // Clear local storage/session if you're storing auth data there
    localStorage.removeItem('user'); // if you're using localStorage
    // Reload or redirect to login
    window.location.href = '/';
  }
};

const submitData = async (payload) => {
  try {
    console.log("Submitting data:", payload);

    const res = await fetch(`/admin/user/${payload.user_id}/daily-report/${payload.date}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    
    return result;
  } catch (err) {
    console.error("Error submitting data:", err);
    alert('Error submitting data. Please check your connection.');
  }
};
  
const submitNewUser = async (e) => {
  e.preventDefault();
  // Define the payload for submitting the new user
  const payload = {
    username: newUser.username,
    password: newUser.password,
    role: newUser.role || 'student',  // Default to 'student' if no role is provided
  };
 // Call submitData to send the payload
  try {
    const res = await fetch('/admin/add-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (res.ok && result.status === 'success') {
      //alert('User added successfully');
      setShowAddUserForm(false);
      setUsers([...users, { id: result.newUserId, username: newUser.username }]);
      setNewUser({ username: '', password: '', role: 'student' });
    } else {
      alert(result.message || 'Failed to add user');
    }
  } catch (err) {
    console.error('Error adding user:', err);
    alert('Error adding user. Please try again.');
  }
};

const handleNewUserChange = (e) => {
  const { name, value } = e.target;
  setNewUser(prev => ({ ...prev, [name]: value }));
};

const handleUserChange = (e) => {
  const userId = e.target.value ? parseInt(e.target.value, 10) : null;
  setSelectedUser(userId);

  if (userId !== null) {
   
  } else {
  
  }
  setCurrentAction('');
  setSelectedDate('');
};


// Save the student's daily report using the dynamic definitions
const saveDailyReport = async () => {
  // 🛡 Ensure integer ≥ 0 for our three key fields
  if (!selectedDate) {
    alert("Please select a date before saving the report.");
    return; // Stop the function if no date is selected
  }
  const isWhole = v => Number.isInteger(+v) && +v >= 0;
  if (
    !isWhole(entry.actual_math_points) ||
    !isWhole(entry.math_time) ||
    !isWhole(entry.accumulated_reading_percent)
  ) {
    alert('Please enter whole numbers ≥ 0 for points, time, and reading percent.');
    return;
  }
  // Build the payload from selectedUser, selectedDate, and definitions
  const payload = {
    user_id: selectedUser,
    date: selectedDate,
    ...definitions.reduce((acc, def) => {
      const v = entry[def.slug];
      acc[def.slug] = (v !== undefined && v !== '') ? v : null;
      return acc;
    }, {})
  };

  console.log("--- saveDailyReport ---");
  console.log("Sending Payload to Backend:", JSON.parse(JSON.stringify(payload)));

  try {
  // Call submitData to send the data to the backend and capture the result
    const result = await submitData(payload);  // <-- Capture the result here
    console.log("Backend Save Response (from submitData):", result);

    // Handle the result directly here
    if (result && result.status === 'success') { 
      //alert('Report saved successfully!');
      // --- ADDED: Re-fetch weekly data after successful save ---
      const userIdentifier = selectedUser; // Or userId for student
      const dateIdentifier = selectedDate; // Or entry.date for student
      const isAdmin = typeof selectedUser !== 'undefined'; // Crude check
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
      // --- END ADDED ---
    } else {
      alert(`Error saving report: ${result?.message || 'Unknown error from backend.'}`);
    }
  } catch (err) {
    console.error("Error occurred *during* submitData call or processing its result:", err);
    alert('A critical error occurred while trying to save. Please check console.');
  }
};

  // Update a definition's label (or type) in state
  const updateDefinition = (id, key, value) => {
    console.log(`--- updateDefinition ---`);
    console.log(`Attempting to update ID: ${id}, Key: ${key}, New Value: '${value}'`);
    
    setDefinitions(currentDefs => {
      // Log the state of definitions *before* the update
      // We use JSON.stringify and JSON.parse for a deep copy to avoid logging issues with mutable objects
      console.log("Definitions BEFORE update:", JSON.parse(JSON.stringify(currentDefs)));

      const newDefs = currentDefs.map(def => {
          if (def.id === id) {
              // This is the definition we want to change
              console.log(`Found matching definition to update: ID=${def.id}, Old Label='${def.label}'`);
              // Create a NEW object with the updated property
              return { ...def, [key]: value }; // 'key' will be 'label' in this case
          }
          // For all other definitions, return them as they were (no change)
          return def;
      });

      // Log the state of definitions *after* the update
      console.log("Definitions AFTER update:", JSON.parse(JSON.stringify(newDefs)));
      console.log(`--- end updateDefinition ---`);
      return newDefs; // Return the new array for React to set as state
    });
  };

// Update an entry value for a given day + slug
  const updateEntry = (day, slug, value) => {
    setEntries(e => ({
      ...e,
      [day]: { ...e[day], [slug]: value }
    }));
  };

// Add a brand-new definition (blank)
  const addNewDefinition = () => {
    const slug = newLabel.toLowerCase().replace(/\s+/g,'_');
    setDefinitions(defs => [
        ...defs,
        {
          id: nextTempId--, // Use the counter and decrement it
          slug,
          label: newLabel,
          field_type: 'text', // Default field type, admin can change
          readonly: false,
          is_default: false, // New custom tasks are not defaults
          is_active: true,
          // Add a flag to indicate it's a new, unsaved item
          isNew: true
        }
    ]);
    setNewLabel('');
  };

  // --- REVISED: Fetch weekly chart data (and summary/text tasks) ---
  useEffect(() => {
    // Use state variables from AdminTasksEditor
    const userIdentifier = selectedUser;
    const dateIdentifier = selectedDate;
    const endpoint = `/admin/user/${userIdentifier}/daily-report/${dateIdentifier}/weekly-progress`; // Admin endpoint

    if (!userIdentifier || !dateIdentifier) {
      setWeeklyData([]);
      setWeeklySummary(null);
      setTextTaskData(null); // Clear all related state
      return;
    };

    console.log(`ADMIN: Fetching weekly data from: ${endpoint}`);

    fetch(endpoint)
      .then(r => { /* ... (Error handling as provided previously) ... */
          if (!r.ok) { /* ... throw error ... */ }
          return r.json();
      })
      .then(data => {
        console.log("ADMIN: Fetched weekly data structure:", data);
        // --- UNPACK THE RESPONSE OBJECT ---
        setWeeklyData(data.dailyData || []);
        setWeeklySummary(data.summary || null);
        setTextTaskData(data.textTasks || null);
      })
      .catch(err => { /* ... (Error logging and state clearing as provided previously) ... */
        console.error("ADMIN: Error fetching or processing weekly data:", err);
        setWeeklyData([]); setWeeklySummary(null); setTextTaskData(null);
      });
  // Dependencies for AdminTasksEditor
  }, [selectedUser, selectedDate]);

  console.log("ADMIN State Check - weeklySummary:", weeklySummary);
  console.log("ADMIN State Check - textTaskData:", textTaskData);

  // Add these new handler functions within the AdminTasksEditor component

  const handleSetTaskActiveStatus = async (definitionId, isActive) => {
    try {
      const res = await fetch(`/admin/task-definition/${definitionId}/set-active-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) {
        const errorResult = await res.json();
        throw new Error(errorResult.message || `HTTP error! status: ${res.status}`);
      }
      // Update local definitions state
      setDefinitions(currentDefs =>
        currentDefs.map(def =>
          def.id === definitionId ? { ...def, is_active: isActive } : def
        )
      );

      // If reactivating, clear its entries in the weekly schedule
      if (isActive) {
        const definitionToClear = definitions.find(d => d.id === definitionId);
        if (definitionToClear) {
          setEntries(prevEntries => {
            const updatedEntries = { ...prevEntries };
            Object.keys(updatedEntries).forEach(day => {
              if (updatedEntries[day] && definitionToClear.slug in updatedEntries[day]) {
                updatedEntries[day][definitionToClear.slug] = ''; // Clear the value
              }
            });
            return updatedEntries;
          });
        }
      }
      // Optionally, provide user feedback (e.g., a toast notification)
      // alert(`Task status updated successfully.`);
    } catch (err) {
      console.error(`Error updating task status for ${definitionId}:`, err);
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="w-full flex justify-between items-center bg-gray-100 p-4 border border-blue-500">
        {flash && (
          <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50">
            {flash}
          </div>
        )}
        <h2 className="text-2xl font-bold">Admin Interface</h2>
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded ${
              currentAction === ''            // '' = the user-page we start on
                ? 'bg-blue-700 text-white'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
            onClick={() => setCurrentAction('')}
          >
            Users
          </button>
          <button
            className={`px-4 py-2 rounded ${
              currentAction === 'dashboard'
                ? 'bg-green-700 text-white'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
            onClick={() => setCurrentAction('dashboard')}
          >
            Dashboard
          </button>

          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </div>
      
      {currentAction !== 'dashboard' && (
        <>
          <div className="mb-4">
            <h3 className="text-xl font-semibold mb-2">Users</h3>
            <div className="flex items-center gap-x-4">
              <select
                className="border p-2 rounded"
                onChange={handleUserChange}
                value={selectedUser || ''}
              >
              {users.length > 0 ? (
                <>
                  <option value="">Select user</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </>
              ) : (
                <option value="">None</option>
              )}
            </select>
            <button
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition"
              onClick={() => setShowAddUserForm(true)}
            >
              Add New User
            </button>
        

          {showAddUserForm && (
            <form className="mt-4 p-4 border rounded" onSubmit={submitNewUser}>
                <input name="username" placeholder="Username" required onChange={handleNewUserChange} className="border p-2 w-full mb-2"/>
                <input name="password" placeholder="Password" required type="password" onChange={handleNewUserChange} className="border p-2 w-full mb-2"/>
                <select name="role" onChange={handleNewUserChange} className="border p-2 w-full mb-2">
                    <option value="student">Student</option>
                    <option value="admin">Admin</option>
                </select>
                <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded">Add User</button>
                <button type="button" className="bg-red-500 text-white px-4 py-2 rounded ml-2"
                  onClick={() => setShowAddUserForm(false)}>Cancel</button>
            </form>
          )}
            </div>
          </div>
          
          <div className="mt-4 flex space-x-2">
            {users.length > 0 && selectedUser && (
            <> 
              {/* "Tab" buttons always visible once a user is selected: */}
              <button
                className={
                  `px-4 py-2 rounded ${
                    currentAction === 'editTasks'
                      ? 'bg-blue-700 text-white'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`
                }
                onClick={() => setCurrentAction('editTasks')}
              >
                Edit Expected Tasks
              </button>
              <button
                className={
                  `px-4 py-2 rounded ${
                    currentAction === 'configureUser'
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-500 text-white hover:bg-gray-600'
                  }`
                }
                onClick={() => setCurrentAction('configureUser')}
              >
                View/Edit Daily Report
              </button>
            </>
            )}
          </div>
        </>
      )}
      
      {/* === START: DASHBOARD Section === */}
      {currentAction === 'dashboard' && (
        <div className="mt-4 p-4 border rounded">
          <h3 className="text-lg font-semibold mb-4">Tier Thresholds</h3>
      
          <label className="block mb-2">
            <span className="text-gray-700">Needs-Work&nbsp;&lt;&nbsp;Max&nbsp;(0-1)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={tierBounds.needsWorkMax}
              onChange={e =>
                setTierBounds({ ...tierBounds, needsWorkMax: parseFloat(e.target.value) })
              }
              className="mt-1 block w-full border p-2 rounded"
            />
          </label>
      
          <label className="block mb-4">
            <span className="text-gray-700">Good&nbsp;&lt;&nbsp;Max&nbsp;(0-1)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={tierBounds.goodMax}
              onChange={e =>
                setTierBounds({ ...tierBounds, goodMax: parseFloat(e.target.value) })
              }
              className="mt-1 block w-full border p-2 rounded"
            />
          </label>
          
          <h3 className="text-lg font-semibold my-4">Tier Messages</h3>
            {['progress','final'].map(scope => (
              <div key={scope} className="mb-6">
                <h4 className="font-medium mb-2">
                  {scope==='progress' ? 'Mid-week' : 'Final / Sunday'}
                </h4>
                {['excellent','good','needsWork'].map(tier => (
                  <label key={tier} className="block mb-2">
                    <span className="text-gray-700 capitalize">{tier}</span>
                    <textarea
                      rows={2}
                      className="mt-1 block w-full border p-2 rounded"
                      value={tierMsgs?.[scope]?.[tier] ?? ''}
                      onChange={e =>
                        setTierMsgs(m => ({
                          ...m,
                          [scope]: { ...m[scope], [tier]: e.target.value }
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ))}

          <button
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={async () => {
              if (
                tierBounds.needsWorkMax <= 0 ||
                tierBounds.needsWorkMax >= tierBounds.goodMax ||
                tierBounds.goodMax > 1          
              ) {
                alert('“Good Max” may be up to 1.00 and must be greater than “Needs-Work Max”.');
                return;                          // stop — nothing is sent to the server
              }
              
              try {
                // save thresholds
                const tRes = await fetch('/admin/tier-thresholds', {
                  method:'POST',
                  headers:{'Content-Type':'application/json'},
                  body:JSON.stringify(tierBounds)
                });
                // save messages
                const mRes = await fetch('/admin/tier-messages', {
                  method:'POST',
                  headers:{'Content-Type':'application/json'},
                  body:JSON.stringify(tierMsgs)
                });
                
                if (!tRes.ok || !mRes.ok) {
                  const errRes = tRes.ok ? mRes : tRes;
                  const { message = '' } = await errRes.json().catch(() => ({}));
                  alert(message || 'Save failed');
                  return;
                }

                setCurrentAction('');        // return to Users page
                setFlash('Config Updated');  // toast for 3 s
                setTimeout(()=>setFlash(null), 2000);
              } 
              
              catch (err) {
                alert(err.message);
              }
            }}
          >
            Save &amp; Exit Dashboard
          </button>
        </div>
      )}
      {/* === END: DASHBOARD Section === */}

      {/* === START: CONFIGURE USER Section === */}
      {selectedUser && currentAction==='configureUser' && (
        <div className="mt-4 p-4 border rounded">
          <h3>Edit Daily Report</h3>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border p-2 rounded mb-2"
          />
          
          {/* Expected Tasks block */}
          {selectedDate && (
            <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 rounded mb-4">
              <strong>Expected Today:</strong>{' '}
              {(() => {
                const day = new Date(selectedDate)
                  .toLocaleDateString('en-US',{ weekday:'long' });
                const todayTasks = entries[day] || {};
                return definitions
                  .filter(def => todayTasks[def.slug])
                  .map(def => `${def.label}: ${todayTasks[def.slug]}`)
                  .join(', ') || 'None set';
              })()}
            </div>
          )}
          
          {selectedDate && definitions.length > 0 && (
            <>
              <form onSubmit={e => { e.preventDefault(); saveDailyReport(); }}>
                {definitions
                  .filter(def => def.is_active && (
                    !def.is_default ||
                    ['actual_math_points','math_time','book_title','word_count','accumulated_reading_percent', 'expected_weekly_reading_rate']
                    .includes(def.slug)
                  ))
                  .map(def => (
                  <div key={def.slug} className="mb-2">
                    <label>{def.label}</label>
                    <input
                      type={def.field_type==='number'?'number':'text'}
                      step={def.field_type==='number' ? "1" : undefined}
                      min={def.field_type==='number' ? "0" : undefined}
                      name={def.slug}
                      value={String(entry[def.slug] ?? '')}
                      onChange={handleInputChange}
                      readOnly={def.readonly || def.slug === 'expected_daily_reading_percent'}
                      className={
                        `w-full border p-2 rounded ${
                          (def.readonly || def.slug === 'expected_daily_reading_percent')
                            ? 'bg-gray-100'
                            : 'border-gray-300'
                      }`
                      }
                    />
                  </div>
                ))}
                <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded">
                  Save Report
                </button>
              </form>

              {/* === Weekly Progress Charts Section === */}

              {selectedDate && definitions.length > 0 && ( // Check if data can be loaded
                <div className="mt-6">
                  <h3 className="text-xl font-semibold mb-2">Weekly Progress Charts</h3>
                  {weeklySummary?.effort && (() => {
                    const e = weeklySummary.effort;
                    return (
                      <div className={tierClasses[e.tier]}>
                        <strong>{
                          (tierMsgs?.[e.scope === 'final' ? 'final' : 'progress']?.[e.tier])
                          ?? defaultMsgs[e.scope][e.tier]
                        }
                        </strong>
                        <div className="mt-1 text-sm">
                          Overall {(e.overall_pct*100).toFixed(0)} %
                          {e.scope==='final' && (() => {
                            const bits = [];
                            if (e.extra_math_points) bits.push(`${e.extra_math_points} extra maths point${e.extra_math_points>1?'s':''}`);
                            if (e.extra_reading_percent) bits.push(`${e.extra_reading_percent}% extra reading`);
                            if (e.extras)
                              bits.push(...Object.entries(e.extras)
                                .map(([slug,n]) => `${n} extra ${(textTaskData?.labels?.[slug]||slug)} task${n>1?'s':''}`));
                            return bits.length ? `  (+${bits.join(', ')})` : '';
                          })()}
                        </div>
                      </div>
                    );
                  })()}
                  
                  
                  {/* Check if weeklyData is loaded */}
                  {weeklyData.length > 0 ? (
                    <>
                      {/* Math Section */}
                      <div className="mb-8 p-4 bg-white rounded shadow">
                        <h4 className="font-medium mb-2">Math Progress</h4>
                        {/* This div arranges the daily and summary charts */}
                        <div className="flex flex-wrap md:flex-nowrap gap-4 items-start">
                          {/* This div holds the DAILY chart */}
                          <div className="flex-auto w-full md:w-auto min-w-[300px]">
                            <h5 className="font-normal mb-1 text-center text-gray-600">Daily: Points vs Time</h5>
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
                        
                          {/* Weekly Math Summary Chart */}
                          <div className="flex-shrink-0 w-full md:w-1/4 md:basis-1/4 md:pl-4 border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0">
                            <h5 className="font-normal mb-1 text-center text-gray-600">Weekly Total Points</h5>
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
                        <h4 className="font-medium mb-2">Reading Progress</h4>
                        {/* This div arranges the daily and summary charts */}
                          <div className="flex flex-wrap md:flex-nowrap gap-4 items-start">
                            {/* This div holds the DAILY chart */}
                            <div className="flex-auto w-full md:w-auto min-w-[300px]">
                            <h5 className="font-normal mb-1 text-center text-gray-600">Daily Reading Progress</h5>
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
                          
                          {/* Weekly Reading Summary Chart */}
                          <div className="flex-shrink-0 w-full md:w-1/4 md:basis-1/4 md:pl-4 border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0">
                            <h5 className="font-normal mb-1 text-center text-gray-600">Weekly Total Reading %</h5>
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
                </div> // Closes the main div for charts area
              )} 
            </>
          )}
        </div>
      )}
      {/* === END: CONFIGURE USER Section === */}
      

      {/* === START: EDIT TASKS Section === */}  
      {currentAction==='editTasks' && (
          <div className="mt-4 p-4 border rounded">
              <h3 className="font-semibold mb-2">Add/Edit Weekly Expected Tasks</h3>
              <div>

                {/* === START: Active Tasks Section === */}
                <h4 className="font-medium mt-4 mb-2 text-lg">Active Tasks</h4>
                <div className="overflow-x-auto mb-4">
                    <table className="table-fixed min-w-full lg:min-w-[1400px] border-collapse border border-gray-400">
                      <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-4 py-2 sticky left-0 bg-gray-100 z-10 w-1/4">Task</th>
                        {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
                          .map(day => (
                          <th key={day} className="border px-4 py-2">{day}</th>
                        ))}
                        <th className="border px-4 py-2 w-auto">Actions</th> {/* Added Actions column header */}
                      </tr>
                    </thead>
                    <tbody>
                      {definitions
                        .filter(def=> (
                          def.is_active && (
                            !def.is_default
                          || ['expected_math_points','expected_daily_reading_percent']
                              .includes(def.slug)
                          )
                        ))

                        .map(def => (
                        <tr key={def.id}>
                          <td className="border px-4 py-2 sticky left-0 bg-white z-10 align-top">
                            <input
                              type="text"
                              value={def.label}
                              onChange={e => updateDefinition(def.id, 'label', e.target.value)}
                              className="w-full border p-1 rounded mb-1"
                              disabled={def.readonly || def.is_default}
                            />
                            <select
                              value={def.field_type}
                              onChange={e => updateDefinition(def.id, 'field_type', e.target.value)}
                              className="mt-1 border p-1 rounded w-full"
                              disabled={def.readonly || def.is_default}
                            >
                              <option value="text">Text</option>
                              <option value="number">Number</option>
                              <option value="percent">Percent</option>
                            </select>
                        </td>
                        {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
                          
                          .map(day => (
                            <td key={day} className="border px-1 py-1 align-top">
                              <textarea
                                rows={2}
                                value={entries[day]?.[def.slug] || ''}
                                onChange={e => updateEntry(day, def.slug, e.target.value)}
                                readOnly={false}
                                className={`w-full border p-1 rounded resize-none border-gray-300`}
                              />
                            </td>
                          ))}
                          <td className="border px-2 py-1 text-center align-middle"> {/* Added Actions cell, align-middle */}
                            {!def.is_default && ( // Only allow deactivating non-default tasks
                              <button
                                onClick={() => handleSetTaskActiveStatus(def.id, false)}
                                className="bg-red-500 hover:bg-red-700 text-white text-xs py-1 px-2 rounded"
                                >
                                Deactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      
                      {/* "Add new task" row */}
                      <tr>
                        <td className="border px-4 py-2 sticky left-0 bg-white z-10 align-top">
                          <input
                            placeholder="New task label"
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            className="w-full border p-1 rounded mb-1"
                          />
                          <button
                            type="button"
                            onClick={addNewDefinition}
                            className="mt-1 bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                          >
                            Add New Task
                          </button>
                        </td>
                        <td colSpan={8} className="border"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* === END: Active Tasks Section === */}
                
                {/* EXISTING SAVE BUTTONS - THESE ARE UNCHANGED AND IMPORTANT! */}
                <div className="mt-4 mb-6">
                  <button
                    type="button"
                    onClick={async () => {
                      // This is the original logic for saving definitions
                      try {
                        const res = await fetch(`/admin/user/${selectedUser}/task-definitions`, {
                          method: 'POST',
                          headers: {'Content-Type':'application/json'},
                          body: JSON.stringify(definitions)
                        });
                        if (!res.ok) {
                          const errData = await res.json().catch(() => ({}));
                          throw new Error(`HTTP error! status: ${res.status}. ${errData.message || 'Failed to save definitions.'}`);
                        }
                        const updatedDefinitionsFromServer = await res.json(); // Get the updated list
                        setDefinitions(updatedDefinitionsFromServer); // <--- UPDATE STATE HERE
                      } catch (err) {
                          console.error("Error saving definitions:", err);
                          alert(`Error saving definitions: ${err.message}`);
                      }
                    }}
                    className="mt-4 bg-blue-500 text-white px-4 py-2 rounded mr-2 hover:bg-blue-600 transition">
                    Save Field Definitions
                  </button>

                  {/* The existing "Save Weekly Entries" button */}
                  <button
                    type="button"
                    onClick={async () => {
                      // Directly save the current 'entries' state
                      console.log("Saving weekly entries payload:", entries); // Debug
                      try {
                          const res = await fetch(`/admin/user/${selectedUser}/task-entries`, {
                                method: 'POST',
                                headers: {'Content-Type':'application/json'},
                                body: JSON.stringify(entries) // Send the current entries state
                          });
                          if (!res.ok) {
                              const errData = await res.json().catch(() => ({})); // Try get error msg
                              throw new Error(`HTTP error! status: ${res.status}. ${errData.message || ''}`);
                            }
                          const result = await res.json();
                          if(result.status === 'success'){
                                //alert('Weekly entries saved');
                                // No need to setEntries(payload) as entries IS the source
                          } else {
                              alert(`Error saving weekly entries: ${result.message || 'Unknown error'}`);
                          }
                      } catch (err) {
                          console.error("Error saving weekly entries:", err);
                          alert(`Error saving weekly entries. ${err.message}`);
                      }
                    }}
                    className="mt-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition">
                    Save Weekly Entries
                  </button>
                </div>

                {/* === START: Deactivated Tasks Section === */}
                <h4 className="font-medium mt-8 mb-2 text-lg">Deactivated Tasks</h4>
                <div className="overflow-x-auto mb-4">
                  <table className="table-fixed min-w-full lg:min-w-[600px] border-collapse border border-gray-400">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-4 py-2 w-3/4">Task Name</th>
                        <th className="border px-4 py-2 w-1/4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {definitions
                        .filter(def => !def.is_active && !def.is_default) // Show inactive, non-default
                        .map(def => (
                          <tr key={def.id || def.slug}>
                            <td className="border px-4 py-2 font-medium">{def.label}</td>
                            <td className="border px-2 py-1 text-center">
                              <button
                                onClick={() => handleSetTaskActiveStatus(def.id, true)}
                                className="bg-green-500 hover:bg-green-700 text-white text-xs py-1 px-2 rounded"
                              >
                                Reactivate
                              </button>
                            </td>
                          </tr>
                        ))}
                      {definitions.filter(def => !def.is_active && !def.is_default).length === 0 && (
                        <tr>
                          <td colSpan="2" className="text-center py-3 border text-gray-500">No deactivated tasks.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* === END: Deactivated Tasks Section === */}
            </div>
          </div>
        )}
        {/* === END: EDIT TASKS Section === */}
    </div>
    
  );
}