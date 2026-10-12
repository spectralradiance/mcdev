import { Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import smallProjects from '../small';

let projectsRequest = null;

// Fetched once and shared between the list and detail pages.
const loadProjects = () => {
  projectsRequest ??= fetch('/projects.json').then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
  return projectsRequest;
};

const useProjects = () => {
  const [state, setState] = useState({ projects: null, error: null });

  useEffect(() => {
    let active = true;
    loadProjects()
      .then((projects) => active && setState({ projects, error: null }))
      .catch((requestError) => {
        projectsRequest = null;
        if (active) setState({ projects: null, error: requestError.message });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
};

const projectHref = (project) => project.page ?? `/projects/${project.slug}`;

const ExternalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const LargeCard = ({ project }) => {
  const { title, image, description, tech } = project;

  return (
    <Link
      to={projectHref(project)}
      className="flex flex-col bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="w-full h-48 object-cover bg-gray-800" />
      ) : (
        <div className="w-full h-48 bg-gray-800 flex items-center justify-center">
          <span className="text-gray-500 text-2xl font-semibold tracking-wide">{title}</span>
        </div>
      )}
      <div className="p-4">
        <h3 className="text-white font-semibold text-lg leading-tight">{title}</h3>
        {description && <p className="text-gray-400 text-sm mt-2 line-clamp-3">{description}</p>}
        {tech?.length > 0 && (
          <p className="text-gray-500 text-xs mt-3">{tech.slice(0, 4).join(' · ')}</p>
        )}
      </div>
    </Link>
  );
};

const SmallCard = ({ project }) => {
  const { title, image, description } = project;

  return (
    <Link
      to={projectHref(project)}
      className="flex gap-3 items-start p-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="w-14 h-14 shrink-0 rounded object-cover bg-gray-800" />
      ) : (
        <div className="w-14 h-14 shrink-0 rounded bg-gray-800" />
      )}
      <div className="min-w-0">
        <h3 className="text-white font-semibold text-sm leading-tight">{title}</h3>
        {description && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{description}</p>}
      </div>
    </Link>
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

const Gallery = ({ images, title }) => {
  const [open, setOpen] = useState(null);

  return (
    <div className="mb-8 flex flex-wrap gap-3">
      {images.map((src) => (
        <button
          key={src}
          onClick={() => setOpen(src)}
          className="rounded-lg overflow-hidden border border-gray-800 hover:border-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <img src={src} alt={title} loading="lazy" className="w-48 h-48 object-cover bg-gray-900" />
        </button>
      ))}
      {open && <ImageModal src={open} alt={title} onClose={() => setOpen(null)} />}
    </div>
  );
};

const BackLink = () => (
  <Link to="/projects" className="mb-6 text-sm text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1">
    ← Back to projects
  </Link>
);

const SmallProjectDetail = ({ project }) => {
  const Demo = smallProjects[project.slug];

  return (
    <div>
      <BackLink />
      <h2 className="text-4xl font-bold text-white mb-3">{project.title}</h2>
      {project.description && <p className="text-gray-300 leading-relaxed mb-8">{project.description}</p>}

      {Demo ? (
        <div className="mb-6">
          <Suspense fallback={<p className="text-gray-400">Loading…</p>}>
            <Demo />
          </Suspense>
        </div>
      ) : (
        <p className="mb-6 text-gray-400">This one hasn&apos;t been ported yet.</p>
      )}

      {project.codepen && (
        <a
          href={project.codepen}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          Original on CodePen <ExternalIcon />
        </a>
      )}
    </div>
  );
};

const LargeProjectDetail = ({ project }) => {
  const { title, description, about, tech, repos, page } = project;
  const gallery = project.gallery ?? (project.image ? [project.image] : []);

  return (
    <div>
      <BackLink />
      <h2 className="text-4xl font-bold text-white mb-3">{title}</h2>
      {description && <p className="text-gray-300 leading-relaxed mb-6">{description}</p>}

      {tech?.length > 0 && (
        <ul className="mb-8 flex flex-wrap gap-2">
          {tech.map((name) => (
            <li key={name} className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-300">{name}</li>
          ))}
        </ul>
      )}

      {about && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-2">About</h3>
          <p className="text-gray-300 leading-relaxed whitespace-pre-line">{about}</p>
        </div>
      )}

      {gallery.length > 0 && <Gallery images={gallery} title={title} />}

      <div className="flex flex-wrap gap-3">
        {page && (
          <Link to={page} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-white text-black hover:bg-gray-200 transition-colors text-sm">
            Open {title}
          </Link>
        )}
        {repos?.map((repo) => (
          <a
            key={repo.url}
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors text-sm"
          >
            <ExternalIcon />
            {repos.length > 1 ? repo.label : 'View on GitHub'}
          </a>
        ))}
      </div>
    </div>
  );
};

export const ProjectDetail = () => {
  const { slug } = useParams();
  const { projects, error } = useProjects();

  if (error) return <p className="text-red-400">Failed to load projects: {error}</p>;
  if (!projects) return <p className="text-gray-400">Loading project…</p>;

  const project = projects.find((p) => p.slug === slug);
  if (!project) {
    return (
      <div>
        <BackLink />
        <p className="text-gray-400">No project called “{slug}”.</p>
      </div>
    );
  }
  return project.size === 'small'
    ? <SmallProjectDetail project={project} />
    : <LargeProjectDetail project={project} />;
};

const Projects = () => {
  const { projects, error } = useProjects();

  if (error) return <p className="text-red-400">Failed to load projects: {error}</p>;
  if (!projects) return <p className="text-gray-400">Loading projects…</p>;

  const large = projects.filter((p) => p.size !== 'small');
  const small = projects.filter((p) => p.size === 'small');

  return (
    <div className="space-y-14">
      <section>
        <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Projects</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {large.map((project) => <LargeCard key={project.slug} project={project} />)}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-2 border-b border-gray-700 pb-2">Small projects</h2>
        <p className="text-gray-400 text-sm mb-6">Sketches and experiments, each runnable right on its page.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {small.map((project) => <SmallCard key={project.slug} project={project} />)}
        </div>
      </section>
    </div>
  );
};

export default Projects;
