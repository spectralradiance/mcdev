import './Projects.css';

const projects = [
  {
    id: 1,
    title: 'DevTracker',
    description:
      'A full-stack project management app built with React and Node.js. Features include kanban boards, time tracking, and team collaboration.',
    tags: ['React', 'Node.js', 'PostgreSQL'],
    url: 'https://github.com',
    demo: 'https://example.com',
  },
  {
    id: 2,
    title: 'WeatherNow',
    description:
      'A real-time weather dashboard that aggregates data from multiple APIs. Includes 7-day forecasts, radar maps, and severe weather alerts.',
    tags: ['TypeScript', 'Next.js', 'OpenWeather API'],
    url: 'https://github.com',
    demo: 'https://example.com',
  },
  {
    id: 3,
    title: 'ML Notebook',
    description:
      'An interactive machine learning playground where users can train simple models in the browser using TensorFlow.js.',
    tags: ['JavaScript', 'TensorFlow.js', 'D3.js'],
    url: 'https://github.com',
    demo: 'https://example.com',
  },
  {
    id: 4,
    title: 'ChatFlow',
    description:
      'A lightweight real-time chat application with WebSocket support, message history, and emoji reactions.',
    tags: ['React', 'Socket.io', 'Express'],
    url: 'https://github.com',
    demo: null,
  },
  {
    id: 5,
    title: 'CLI Toolkit',
    description:
      'A collection of command-line utilities for automating common development tasks like project scaffolding and deployment checks.',
    tags: ['Go', 'CLI', 'Bash'],
    url: 'https://github.com',
    demo: null,
  },
  {
    id: 6,
    title: 'PixelCanvas',
    description:
      'A collaborative pixel-art editor inspired by r/place. Supports real-time multi-user painting on a shared canvas.',
    tags: ['React', 'WebSocket', 'Canvas API'],
    url: 'https://github.com',
    demo: 'https://example.com',
  },
];

function ProjectCard({ project }) {
  return (
    <article className="project-card">
      <h3 className="project-title">{project.title}</h3>
      <p className="project-description">{project.description}</p>
      <ul className="project-tags" aria-label="Technologies">
        {project.tags.map((tag) => (
          <li key={tag} className="project-tag">
            {tag}
          </li>
        ))}
      </ul>
      <div className="project-links">
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          className="project-link project-link--code"
        >
          View Code
        </a>
        {project.demo && (
          <a
            href={project.demo}
            target="_blank"
            rel="noopener noreferrer"
            className="project-link project-link--demo"
          >
            Live Demo
          </a>
        )}
      </div>
    </article>
  );
}

function Projects() {
  return (
    <section className="projects" id="projects">
      <div className="projects-inner">
        <h2 className="projects-heading">Projects</h2>
        <p className="projects-subheading">
          A selection of things I&apos;ve built &mdash; open source and otherwise.
        </p>
        <div className="projects-grid">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default Projects;
