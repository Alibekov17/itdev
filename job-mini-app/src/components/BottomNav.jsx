import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Вакансии', icon: '💼' },
  { to: '/create', label: 'Создать', icon: '➕' },
  { to: '/responses', label: 'Отклики', icon: '📨' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => (
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
