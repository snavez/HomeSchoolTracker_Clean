import { useState } from 'react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const result = await response.json();
    if (result.status === 'success') {
      onLogin(result.user_id, result.role);
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-4 border rounded shadow-md">
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-700">
        Welcome to the Home School<br />Task Tracker!
      </h2>
      <h3 className="text-lg text-center mb-4 text-gray-500">Please Log In</h3>
      {error && <p className="text-red-500">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          className="border w-full mb-3 p-2"
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          className="border w-full mb-3 p-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="bg-blue-500 text-white px-4 py-2 rounded" type="submit">
          Login
        </button>
      </form>
    </div>
  );
}
