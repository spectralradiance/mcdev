import { Link } from 'react-router-dom';

const resources = [
  {
    to: '/glossary',
    title: 'Glossary',
    description: 'Common terms in web development and general technology.',
  },
  {
    href: 'https://github.com/spectralradiance/python-fullstack',
    title: 'Python Full Stack',
    description:
      'A complete full-stack Python course: Python, HTML/CSS, Flask, Django and JavaScript, with labs, solutions and real student submissions.',
  },
];

const cardClass = 'block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-500 transition-colors';

const Learn = () => {
  return (
    <section>
      <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Learn</h2>
      <div className="space-y-3">
        {resources.map(({ to, href, title, description }) => {
          const body = (
            <>
              <h3 className="text-white font-semibold">
                {title}
                {href && <span className="ml-2 text-xs font-normal text-gray-500">GitHub ↗</span>}
              </h3>
              <p className="text-gray-400 text-sm mt-1">{description}</p>
            </>
          );
          return href ? (
            <a key={href} href={href} className={cardClass} target="_blank" rel="noopener noreferrer">
              {body}
            </a>
          ) : (
            <Link key={to} to={to} className={cardClass}>
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default Learn;
