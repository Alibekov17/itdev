import { Routes, Route, useLocation } from 'react-router-dom';
import JobList from './pages/JobList';
import JobDetail from './pages/JobDetail';
import CreateJob from './pages/CreateJob';
import MyJobs from './pages/MyJobs';
import MyResponses from './pages/MyResponses';
import ReceivedResponses from './pages/ReceivedResponses';
import MyComplaints from './pages/MyComplaints';
import Profile from './pages/Profile';
import Register from './pages/Register';
import Admin from './pages/Admin';
import AdminComplaints from './pages/AdminComplaints';
import AdminUsers from './pages/AdminUsers';
import NotFound from './pages/NotFound';
import BottomNav from './components/BottomNav';
import RequireAuth from './components/RequireAuth';
import RequireAdmin from './components/RequireAdmin';

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
            path="/edit/:id"
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
          <Route
            path="/received"
            element={
              <RequireAuth>
                <ReceivedResponses />
              </RequireAuth>
            }
          />
          <Route
            path="/my-complaints"
            element={
              <RequireAuth>
                <MyComplaints />
              </RequireAuth>
            }
          />
          <Route path="/profile" element={<Profile />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/complaints"
            element={
              <RequireAdmin>
                <AdminComplaints />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAdmin>
                <AdminUsers />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
