import { Routes, Route, useLocation } from 'react-router-dom';
import JobList from './pages/JobList';
import JobDetail from './pages/JobDetail';
import CreateJob from './pages/CreateJob';
import MyResponses from './pages/MyResponses';
import BottomNav from './components/BottomNav';

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
          <Route path="/create" element={<CreateJob />} />
          <Route path="/responses" element={<MyResponses />} />
          <Route path="*" element={<JobList />} />
        </Routes>
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
