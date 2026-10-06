import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { to: '/', label: 'Вакансии', icon: '💼' },
  { to: '/create', label: 'Разместить', icon: '➕' },
  { to: '/my-jobs', label: 'Мои', icon: '📋' },
  { to: '/responses', label: 'Отклики', icon: '📨' },
  { to: '/profile', label: 'Профиль', icon: '👤' },
];

export default function BottomNav() {
  const { isAdmin } = useAuth();
  const tabs = isAdmin
    ? [...TABS, { to: '/admin', label: 'Админ', icon: '🛡️' }]
    : TABS;

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => 'bottom-nav__item' + (isActive ? ' is-active' : '')}
        >
          <span className="bottom-nav__icon">{tab.icon}</span>
          <span className="bottom-nav__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
