import { NavLink } from 'react-router-dom';

const linkClass = ({ isActive }) =>
  'hover:text-white transition-colors ' + (isActive ? 'text-white' : 'text-gray-400');

const Header = () => {
  return (
    <header className="w-full border-b border-gray-700 mb-8">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <NavLink to="/" className="text-xl font-bold tracking-tight text-white hover:text-gray-300 transition-colors">
          matthewcooper.dev
        </NavLink>
        <nav className="flex gap-6 text-sm">
          <NavLink to="/" end className={linkClass}>Home</NavLink>
          <NavLink to="/resume" className={linkClass}>Resume</NavLink>
          <NavLink to="/projects" className={linkClass}>Projects</NavLink>
        </nav>
      </div>
    </header>
  );
};

export default Header;
