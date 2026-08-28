import { Link } from 'react-router-dom';

const resources = [
  {
    to: '/glossary',
    title: 'Glossary',
    description: 'Common terms in web development and general technology.',
  },
];

const Learn = () => {
  return (
    <section>
      <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Learn</h2>
      <div className="space-y-3">
        {resources.map(({ to, title, description }) => (
          <Link
            key={to}
            to={to}
            className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-500 transition-colors"
          >
            <h3 className="text-white font-semibold">{title}</h3>
            <p className="text-gray-400 text-sm mt-1">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default Learn;
