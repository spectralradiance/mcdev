import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const codepenEmbedUrl = (url) => {
  return url.replace('/pen/', '/embed/') + '?default-tab=result&theme-id=dark';
};

const ProjectCard = ({ project, onClick }) => {
  const { title, image, description } = project;

  return (
    <button
      onClick={() => onClick(project)}
      className="text-left bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
    >
      {image ? (
        <img
          src={image}
          alt={title}
          className="w-full h-48 object-cover bg-gray-800"
        />
      ) : (
        <div className="w-full h-48 bg-gray-800 flex items-center justify-center">
          <span className="text-gray-600 text-sm">No screenshot</span>
        </div>
      )}
      <div className="p-4">
        <h3 className="text-white font-semibold text-lg leading-tight">{title}</h3>
        {description && <p className="text-gray-400 text-sm mt-2 line-clamp-2">{description}</p>}
      </div>
    </button>
  );
};

const ImageModal = ({ src, alt, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 text-gray-300 hover:text-white text-3xl leading-none"
      >
        ×
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        className="max-w-full max-h-full rounded-lg object-contain"
      />
    </div>
  );
};

const ProjectDetail = ({ project, onBack }) => {
  const { title, description, embed } = project;
  const isGitHub = embed?.includes('github.com');
  const isCodePen = embed?.includes('codepen.io');
  const embedUrl = isCodePen ? codepenEmbedUrl(embed) : !isGitHub ? embed : null;
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
      >
        ← Back to projects
      </button>

      <h2 className="text-4xl font-bold text-white mb-6">{title}</h2>

      {description && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-2">About</h3>
          <p className="text-gray-300 leading-relaxed whitespace-pre-line">{description}</p>
        </div>
      )}

      {project.image && (
        <div className="mb-8">
          <button
            onClick={() => setLightboxOpen(true)}
            className="rounded-lg overflow-hidden border border-gray-800 hover:border-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <img
              src={project.image}
              alt={title}
              className="w-48 h-48 object-cover bg-gray-900"
            />
          </button>
          {lightboxOpen && (
            <ImageModal src={project.image} alt={title} onClose={() => setLightboxOpen(false)} />
          )}
        </div>
      )}

      {embed && isGitHub && (
        <div className="mb-8">
          <a
            href={embed}
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
            title={title}
            src={embedUrl}
            frameBorder="no"
            loading="lazy"
            allowFullScreen
          />
          {isCodePen && (
            <a
              href={embed}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              View on CodePen →
            </a>
          )}
        </div>
      )}
    </div>
  );
};

const isInternalPage = (embed) => typeof embed === 'string' && embed.startsWith('/');

const Projects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/projects.json')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setProjects(data);
        setLoading(false);
      })
      .catch((requestError) => {
        setError(requestError.message);
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

  const handleSelect = (project) => {
    if (isInternalPage(project.embed)) {
      navigate(project.embed);
      return;
    }
    setSelected(project);
  };

  return (
    <section>
      <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Projects</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <ProjectCard key={project.title} project={project} onClick={handleSelect} />
        ))}
      </div>
    </section>
  );
};

export default Projects;
