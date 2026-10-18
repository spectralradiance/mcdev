import { Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import projects from '../data/projects.json';
import smallProjects from '../small';
import SourceCode from './SourceCode';
import { Heading } from '../ui';

const projectHref = (project) => project.page ?? `/projects/${project.slug}`;

const ExternalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const Icon = ({ project, className = '' }) => (
  <img
    src={project.art}
    alt=""
    className={'shrink-0 rounded-lg border border-line-soft bg-[#0a0a0a] p-2 ' + className}
  />
);

const Category = ({ children }) => (
  <p className="text-[11px] font-semibold uppercase tracking-widest text-subtle">{children}</p>
);

const cardClass =
  'flex items-start gap-4 bg-panel border border-line-soft rounded-lg hover:border-line-strong transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500';

const LargeCard = ({ project }) => {
  const { title, category, description, tech } = project;

  return (
    <Link to={projectHref(project)} className={cardClass + ' p-4'}>
      <Icon project={project} className="w-20 h-20" />
      <div className="min-w-0">
        <Category>{category}</Category>
        <h3 className="mt-1 text-white font-semibold text-lg leading-tight">{title}</h3>
        {description && <p className="text-muted text-sm mt-2">{description}</p>}
        <p className="text-subtle text-xs mt-3">{tech.join(' · ')}</p>
      </div>
    </Link>
  );
};

const SmallCard = ({ project }) => {
  const { title, category, description } = project;

  return (
    <Link to={projectHref(project)} className={cardClass + ' p-3'}>
      <Icon project={project} className="w-14 h-14" />
      <div className="min-w-0">
        <Category>{category}</Category>
        <h3 className="mt-0.5 text-white font-semibold text-sm leading-tight">{title}</h3>
        {description && <p className="text-muted text-xs mt-1">{description}</p>}
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
        className="absolute top-4 right-4 text-soft hover:text-white text-3xl leading-none"
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
          className="rounded-lg overflow-hidden border border-line-soft hover:border-line-strong transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <img src={src} alt={title} loading="lazy" className="h-48 w-auto max-w-full bg-panel" />
        </button>
      ))}
      {open && <ImageModal src={open} alt={title} onClose={() => setOpen(null)} />}
    </div>
  );
};

const BackLink = () => (
  <Link to="/projects" className="mb-6 text-sm text-muted hover:text-white transition-colors inline-flex items-center gap-1">
    ← Back to projects
  </Link>
);

const TechList = ({ tech }) => (
  <ul className="mb-8 flex flex-wrap gap-2">
    {tech.map((name) => (
      <li key={name} className="rounded border border-line px-2 py-0.5 text-xs text-soft">{name}</li>
    ))}
  </ul>
);

const About = ({ about, features }) => (
  <>
    {about && <p className="text-soft leading-relaxed whitespace-pre-line mb-4">{about}</p>}
    {features?.length > 0 && (
      <ul className="mb-8 list-disc space-y-1 pl-5 text-sm text-muted marker:text-faint">
        {features.map((feature) => <li key={feature}>{feature}</li>)}
      </ul>
    )}
  </>
);

const SmallProjectDetail = ({ project }) => {
  const entry = smallProjects[project.slug];
  const Demo = entry?.component;

  return (
    <div>
      <BackLink />
      <div className="mb-3 flex items-center gap-4">
        <Icon project={project} className="w-16 h-16" />
        <div>
          <Category>{project.category}</Category>
          <h2 className="mt-1 text-4xl font-bold text-white">{project.title}</h2>
        </div>
      </div>
      {project.description && <p className="text-soft leading-relaxed mb-4">{project.description}</p>}
      <TechList tech={project.tech} />
      <About about={project.about} features={project.features} />

      {Demo ? (
        <div className="mb-6">
          <Suspense fallback={<p className="text-muted">Loading…</p>}>
            <Demo />
          </Suspense>
        </div>
      ) : (
        <p className="mb-6 text-muted">This one hasn&apos;t been ported yet.</p>
      )}

      {project.codepen && (
        <a
          href={project.codepen}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-white transition-colors"
        >
          Original on CodePen <ExternalIcon />
        </a>
      )}

      {entry && <SourceCode key={project.slug} files={entry.files} />}
    </div>
  );
};

const LargeProjectDetail = ({ project }) => {
  const { title, category, description, about, tech, repos, page, gallery = [] } = project;

  return (
    <div>
      <BackLink />
      <div className="mb-3 flex items-center gap-4">
        <Icon project={project} className="w-20 h-20" />
        <div>
          <Category>{category}</Category>
          <h2 className="mt-1 text-4xl font-bold text-white">{title}</h2>
        </div>
      </div>
      {description && <p className="text-soft leading-relaxed mb-4">{description}</p>}
      <TechList tech={tech} />

      {about && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-2">About</h3>
          <p className="text-soft leading-relaxed whitespace-pre-line">{about}</p>
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-raised text-soft hover:bg-strong transition-colors text-sm"
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
  const project = projects.find((p) => p.slug === slug);
  if (!project) {
    return (
      <div>
        <BackLink />
        <p className="text-muted">No project called “{slug}”.</p>
      </div>
    );
  }
  return project.size === 'small'
    ? <SmallProjectDetail project={project} />
    : <LargeProjectDetail project={project} />;
};

const Projects = () => {
  const large = projects.filter((p) => p.size !== 'small');
  const small = projects.filter((p) => p.size === 'small');

  return (
    <div className="space-y-14">
      <section>
        <Heading>Projects</Heading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {large.map((project) => <LargeCard key={project.slug} project={project} />)}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-2 border-b border-line pb-2">Small projects</h2>
        <p className="text-muted text-sm mb-6">Sketches and experiments, each runnable right on its page.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {small.map((project) => <SmallCard key={project.slug} project={project} />)}
        </div>
      </section>
    </div>
  );
};

export default Projects;
