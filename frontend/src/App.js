import { useState } from 'react';
import Login from './Login';
import HomeSchoolTracker from './HomeSchoolTracker';
import AdminTasksEditor from './AdminTasksEditor';

function App() {
  const [user, setUser] = useState(null);

  const handleLogin = (userId, role) => {
    setUser({ userId, role });
  };

  return (
    <div className="app">
      {user ? (
        user.role === 'admin' ? (
          <AdminTasksEditor />
        ) : (
          <HomeSchoolTracker userId={user.userId} />
        )
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App; 
