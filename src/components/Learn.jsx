import { Link } from 'react-router-dom';
import { Heading } from '../ui';

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

const cardClass = 'block bg-panel border border-line-soft rounded-lg p-4 hover:border-line-strong transition-colors';

const Learn = () => {
  return (
    <section>
      <Heading>Learn</Heading>
      <div className="space-y-3">
        {resources.map(({ to, href, title, description }) => {
          const body = (
            <>
              <h3 className="text-white font-semibold">
                {title}
                {href && <span className="ml-2 text-xs font-normal text-subtle">GitHub ↗</span>}
              </h3>
              <p className="text-muted text-sm mt-1">{description}</p>
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
