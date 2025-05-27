import { useState, useEffect } from 'react';

export default function HomeSchoolTracker({ userId }) {
    const [entry, setEntry] = useState({
      date: '',
      bookTitle: '',
      accumulatedReadingPercent: '',
      mathPoints: '',
      mathTime: '',
      codingNotes: '',
      scienceNotes: '',
      artHistoryCultureNotes: '',
      artPracticeNotes: '',
      writingNotes: '',
      physicalEducationNotes: '',
      socialInteractionNotes: '',
      choresNotes: '',
      miscellaneousNotes: '',
    });

  const [expectedTasks, setExpectedTasks] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEntry({ ...entry, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const response = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...entry,
        user_id: userId,
        math_points: entry.mathPoints,
        math_time: entry.mathTime,
      }),
    });
    const result = await response.json();
    alert(result.status);
  };
  
  useEffect(() => {
    if (entry.date) {
      fetch(`/expected-tasks/${userId}/${entry.date}`)
        .then(res => res.json())
        .then(data => setExpectedTasks(data.expectedTasks));

      fetch(`/previous-day-data/${userId}/${entry.date}`)
        .then(res => res.json())
        .then(data => {
          setEntry(prevEntry => ({
            ...prevEntry,
            bookTitle: data.bookTitle || '',
            accumulatedReadingPercent: data.accumulatedReadingPercent || '',
          }));
        });
    }
  }, [entry.date, userId]);
  

  return (
    <div className="max-w-3xl mx-auto p-6 font-sans">
      <h1 className="text-3xl font-semibold mb-4">Homeschool Daily Tracker</h1>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded shadow-md">
        <div>
          <label className="block">Date:</label>
          <input type="date" name="date" required className="w-full border p-2 rounded" onChange={handleInputChange} />
        </div>

        {expectedTasks && (
          <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 rounded">
            <strong>Expected Tasks:</strong> {expectedTasks}
          </div>
        )}

        <div>
          <label className="block">Math Points:</label>
          <input type="number" name="mathPoints" placeholder="Points earned" required className="w-full border p-2 rounded" onChange={handleInputChange} />
        </div>
        <div>
          <label className="block">Math Time (minutes):</label>
          <input type="number" name="mathTime" placeholder="Estimated time" className="w-full border p-2 rounded" onChange={handleInputChange} />
        </div>
        <div>
        <label className="block">Book Title:</label>
          <input type="text" name="bookTitle" className="w-full border p-2 rounded" onChange={handleInputChange} />
        </div>
        <div>
          <label className="block">Reading (% book completed):</label>
          <input type="number" name="accumulatedReadingPercent" className="w-full border p-2 rounded" onChange={handleInputChange} />
        </div>
        <div>
          <label className="block">Coding Progress:</label>
          <textarea name="codingNotes" rows="2" className="w-full border p-2 rounded" onChange={handleInputChange}></textarea>
        </div>

        {['Science', 'Art, History & Culture', 'Art Practice', 'Writing', 'Physical Education', 'Social Interaction', 'Chores', 'Miscellaneous'].map((subject) => (
          <div key={subject}>
            <label className="block">{subject}:</label>
            <textarea
              name={`${subject.charAt(0).toLowerCase() + subject.slice(1).replace(/[^a-zA-Z]/g, '').replace(/\s+(\w)/g, (_, c) => c.toUpperCase())}Notes`}
              rows="2"
              className="w-full border p-2 rounded"
              onChange={handleInputChange}
            ></textarea>
          </div>
        ))}

        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition">
          Submit Daily Report
        </button>
      </form>

      <div className="mt-6">
        <h2 className="text-2xl font-semibold">Weekly Progress Charts</h2>
        <div className="mt-4 p-4 bg-gray-200 rounded h-32 flex items-center justify-center text-gray-500">
          [Math Weekly Progress Chart Placeholder]
        </div>
        <div className="mt-4 p-4 bg-gray-200 rounded h-32 flex items-center justify-center text-gray-500">
          [Reading Weekly Progress Chart Placeholder]
        </div>
      </div>
    </div>
  );
}
