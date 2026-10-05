import { Routes, Route, useLocation } from 'react-router-dom';
import JobList from './pages/JobList';
import JobDetail from './pages/JobDetail';
import CreateJob from './pages/CreateJob';
import MyJobs from './pages/MyJobs';
import MyResponses from './pages/MyResponses';
import Profile from './pages/Profile';
import BottomNav from './components/BottomNav';
import RequireAuth from './components/RequireAuth';

export default function App() {
  const location = useLocation();
  // На экране деталей нижнее меню скрываем — там есть нативная кнопка «Назад».
  const hideNav = location.pathname.startsWith('/job/');

  return (
    <div className="app">
      <main className="app__content">
        <Routes>
          <Route path="/" element={<JobList />} />
          <Route path="/job/:id" element={<JobDetail />} />
          <Route
            path="/create"
            element={
              <RequireAuth>
                <CreateJob />
              </RequireAuth>
            }
          />
          <Route
            path="/my-jobs"
            element={
              <RequireAuth>
                <MyJobs />
              </RequireAuth>
            }
          />
          <Route
            path="/responses"
            element={
              <RequireAuth>
                <MyResponses />
              </RequireAuth>
            }
          />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<JobList />} />
        </Routes>
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
