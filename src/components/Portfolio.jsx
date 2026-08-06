import { useState, useEffect } from 'react';

const codepenEmbedUrl = (url) => {
  // https://codepen.io/user/pen/ID → https://codepen.io/user/embed/ID
  return url.replace('/pen/', '/embed/') + '?default-tab=result&theme-id=dark';
};

const ProjectCard = ({ project, onClick }) => {
  const { Name, Subtitle, Category } = project.properties;
  const thumb = project.screencaps[0];

  return (
    <button
      onClick={() => onClick(project)}
      className="text-left bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
    >
      {thumb ? (
        <img
          src={thumb}
          alt={Name}
          className="w-full h-48 object-cover bg-gray-800"
        />
      ) : (
        <div className="w-full h-48 bg-gray-800 flex items-center justify-center">
          <span className="text-gray-600 text-sm">No screenshot</span>
        </div>
      )}
      <div className="p-4">
        <h3 className="text-white font-semibold text-lg leading-tight">{Name}</h3>
        {Subtitle && <p className="text-gray-400 text-sm mt-1">{Subtitle}</p>}
        {Category && (
          <span className="inline-block mt-3 text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">
            {Category}
          </span>
        )}
      </div>
    </button>
  );
};

const ProjectDetail = ({ project, onBack }) => {
  const { Name, Subtitle, Category, Technology, 'Code URL': codeUrl } = project.properties;
  const description = project.description || project.properties.Overview || '';
  const isGitHub = codeUrl?.includes('github.com');
  const embedUrl = codeUrl && !isGitHub ? codepenEmbedUrl(codeUrl) : null;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
      >
        ← Back to portfolio
      </button>

      <h2 className="text-4xl font-bold text-white mb-2">{Name}</h2>
      {Subtitle && <p className="text-xl text-gray-400 mb-4">{Subtitle}</p>}

      <div className="flex flex-wrap gap-2 mb-6">
        {Category && (
          <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300">{Category}</span>
        )}
        {(Technology || []).map((t) => (
          <span key={t} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300">{t}</span>
        ))}
      </div>

      {description && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-2">About</h3>
          <p className="text-gray-300 leading-relaxed whitespace-pre-line">{description}</p>
        </div>
      )}

      {project.screencaps.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Screenshots</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {project.screencaps.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`${Name} screenshot ${i + 1}`}
                className="rounded-lg w-full object-contain bg-gray-900 border border-gray-800"
              />
            ))}
          </div>
        </div>
      )}

      {codeUrl && isGitHub && (
        <div className="mb-8">
          <a
            href={codeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            View on GitHub
          </a>
        </div>
      )}

      {embedUrl && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Live Demo</h3>
          <iframe
            height="450"
            className="w-full rounded-lg border border-gray-800"
            scrolling="no"
            title={Name}
            src={embedUrl}
            frameBorder="no"
            loading="lazy"
            allowTransparency="true"
            allowFullScreen="true"
          />
          <a
            href={codeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            View on CodePen →
          </a>
        </div>
      )}
    </div>
  );
};

const Portfolio = () => {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/projects.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setProjects(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="text-gray-400">Loading projects…</p>;
  }

  if (error) {
    return <p className="text-red-400">Failed to load projects: {error}</p>;
  }

  if (selected) {
    return <ProjectDetail project={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <section>
      <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Portfolio</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} onClick={setSelected} />
        ))}
      </div>
    </section>
  );
};

export default Portfolio;
