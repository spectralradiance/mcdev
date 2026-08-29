import { NavLink } from 'react-router-dom';

const linkClass = ({ isActive }) =>
  'hover:text-white transition-colors ' + (isActive ? 'text-white' : 'text-gray-400');

const Header = () => {
  return (
    <header className="w-full border-b border-gray-700 mb-8">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-white hover:text-gray-300 transition-colors">
          <img src="/logo_snowflake.svg" alt="" className="h-6 w-6 invert" />
          matthewcooper.dev
        </NavLink>
        <nav className="flex gap-6 text-sm">
          <NavLink to="/" end className={linkClass}>Home</NavLink>
          <NavLink to="/resume" className={linkClass}>Resume</NavLink>
          <NavLink to="/projects" className={linkClass}>Projects</NavLink>
          <NavLink to="/learn" className={linkClass}>Learn</NavLink>
        </nav>
      </div>
    </header>
  );
};

export default Header;
