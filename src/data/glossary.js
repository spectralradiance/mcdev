// A glossary of common web development and general technology terms.
// Each entry: { term, definition, category, tags }

const glossary = [
  // Web Fundamentals
  { term: 'HTTP', definition: 'The request-response protocol underlying data exchange on the web.', category: 'Web Fundamentals', tags: ['protocol', 'networking', 'foundational'] },
  { term: 'HTTPS', definition: 'HTTP secured with TLS encryption.', category: 'Web Fundamentals', tags: ['protocol', 'security', 'encryption'] },
  { term: 'URL', definition: 'The address used to locate a resource on the web.', category: 'Web Fundamentals', tags: ['addressing', 'foundational'] },
  { term: 'DNS', definition: 'Translates human-readable domain names into IP addresses.', category: 'Web Fundamentals', tags: ['networking', 'addressing'] },
  { term: 'REST', definition: 'An architectural style for designing networked APIs around stateless resource operations.', category: 'Web Fundamentals', tags: ['api', 'architecture'] },
  { term: 'WebSocket', definition: 'A protocol providing full-duplex communication over a single TCP connection.', category: 'Web Fundamentals', tags: ['protocol', 'real-time', 'networking'] },
  { term: 'CORS', definition: "A browser mechanism controlling requests between different origins.", category: 'Web Fundamentals', tags: ['security', 'browser'] },
  { term: 'Cookie', definition: 'A small piece of data stored by the browser and sent with requests to a domain.', category: 'Web Fundamentals', tags: ['browser', 'state'] },
  { term: 'Session', definition: 'A server-side mechanism for persisting state across multiple requests from the same client.', category: 'Web Fundamentals', tags: ['state', 'backend'] },
  { term: 'DOM', definition: 'The tree structure browsers build to represent an HTML page.', category: 'Web Fundamentals', tags: ['browser', 'frontend'] },
  { term: 'HTML', definition: 'The standard markup language for structuring web pages.', category: 'Web Fundamentals', tags: ['markup', 'frontend'] },
  { term: 'CSS', definition: 'The language used to style HTML documents.', category: 'Web Fundamentals', tags: ['styling', 'frontend'] },
  { term: 'Same-Origin Policy', definition: 'A browser security model restricting how documents from one origin interact with another.', category: 'Web Fundamentals', tags: ['security', 'browser'] },

  // Frontend
  { term: 'SPA', definition: 'A web app that loads once and updates content dynamically without full page reloads.', category: 'Frontend', tags: ['architecture', 'frontend'] },
  { term: 'SSR', definition: 'Generating HTML on the server before sending it to the browser.', category: 'Frontend', tags: ['rendering', 'performance'] },
  { term: 'CSR', definition: "Building the page's HTML in the browser via JavaScript.", category: 'Frontend', tags: ['rendering', 'frontend'] },
  { term: 'Hydration', definition: 'The process of attaching client-side interactivity to server-rendered HTML.', category: 'Frontend', tags: ['rendering', 'ssr'] },
  { term: 'Virtual DOM', definition: 'An in-memory representation of the DOM used to batch and optimize UI updates.', category: 'Frontend', tags: ['react', 'performance'] },
  { term: 'Component', definition: 'A reusable, self-contained unit of UI and logic in a frontend framework.', category: 'Frontend', tags: ['react', 'architecture'] },
  { term: 'State Management', definition: 'Techniques and libraries for tracking and updating application data over time.', category: 'Frontend', tags: ['react', 'architecture'] },
  { term: 'Props', definition: "Data passed into a component from its parent in frameworks like React.", category: 'Frontend', tags: ['react'] },
  { term: 'Hook', definition: 'A function that lets components use state and lifecycle features in React.', category: 'Frontend', tags: ['react'] },
  { term: 'JSX', definition: 'A syntax extension that lets you write HTML-like markup inside JavaScript.', category: 'Frontend', tags: ['react', 'syntax'] },
  { term: 'Bundler', definition: 'A tool that combines JavaScript modules and assets into optimized output files.', category: 'Frontend', tags: ['build-tools'] },
  { term: 'Transpiler', definition: 'A tool that converts source code from one language or version to another, e.g. Babel.', category: 'Frontend', tags: ['build-tools'] },
  { term: 'Polyfill', definition: "Code that implements a feature on browsers that don't natively support it.", category: 'Frontend', tags: ['compatibility', 'browser'] },
  { term: 'Responsive Design', definition: 'Designing layouts that adapt to different screen sizes and devices.', category: 'Frontend', tags: ['css', 'design'] },
  { term: 'Progressive Web App', definition: 'A web app that uses modern APIs to deliver app-like, installable experiences.', category: 'Frontend', tags: ['frontend', 'mobile'] },

  // Backend
  { term: 'API', definition: 'A defined contract for how software components communicate.', category: 'Backend', tags: ['foundational', 'integration'] },
  { term: 'Middleware', definition: 'Code that runs between a request and response to handle cross-cutting concerns.', category: 'Backend', tags: ['backend', 'architecture'] },
  { term: 'ORM', definition: 'A technique for mapping database tables to programming objects.', category: 'Backend', tags: ['database', 'backend'] },
  { term: 'Microservices', definition: 'An architecture style structuring an app as a suite of small, independently deployable services.', category: 'Backend', tags: ['architecture', 'backend'] },
  { term: 'Monolith', definition: 'An application built as a single, unified codebase and deployment unit.', category: 'Backend', tags: ['architecture', 'backend'] },
  { term: 'Serverless', definition: 'A cloud execution model where the provider manages infrastructure and scaling automatically.', category: 'Backend', tags: ['cloud', 'architecture'] },
  { term: 'Webhook', definition: 'A user-defined HTTP callback triggered by an event in another system.', category: 'Backend', tags: ['integration', 'api'] },
  { term: 'Cron Job', definition: 'A scheduled task that runs automatically at fixed times or intervals.', category: 'Backend', tags: ['scheduling', 'backend'] },
  { term: 'Message Queue', definition: 'A system that buffers and delivers messages asynchronously between services.', category: 'Backend', tags: ['architecture', 'async'] },
  { term: 'Idempotency', definition: 'A property where performing an operation multiple times has the same effect as once.', category: 'Backend', tags: ['api', 'reliability'] },

  // Networking
  { term: 'TCP/IP', definition: 'The foundational suite of protocols governing how data is transmitted across networks.', category: 'Networking', tags: ['protocol', 'foundational'] },
  { term: 'UDP', definition: 'A lightweight, connectionless transport protocol that trades reliability for speed.', category: 'Networking', tags: ['protocol', 'networking'] },
  { term: 'CDN', definition: 'A distributed set of servers that cache content closer to users.', category: 'Networking', tags: ['performance', 'infrastructure'] },
  { term: 'Load Balancer', definition: 'A component that distributes incoming traffic across multiple servers.', category: 'Networking', tags: ['infrastructure', 'scalability'] },
  { term: 'Proxy', definition: 'A server that acts as an intermediary for requests between a client and another server.', category: 'Networking', tags: ['networking', 'infrastructure'] },
  { term: 'Reverse Proxy', definition: 'A server that sits in front of backend servers and forwards client requests to them.', category: 'Networking', tags: ['networking', 'infrastructure'] },
  { term: 'Latency', definition: 'The time delay between a request being sent and a response being received.', category: 'Networking', tags: ['performance', 'networking'] },
  { term: 'Bandwidth', definition: 'The maximum rate of data transfer across a network connection.', category: 'Networking', tags: ['networking', 'performance'] },
  { term: 'IP Address', definition: 'A numerical label assigned to each device connected to a network.', category: 'Networking', tags: ['networking', 'addressing'] },
  { term: 'Port', definition: 'A numbered endpoint used to direct network traffic to a specific process on a device.', category: 'Networking', tags: ['networking'] },

  // Security
  { term: 'XSS', definition: 'Cross-Site Scripting; an attack that injects malicious scripts into trusted web pages.', category: 'Security', tags: ['vulnerability', 'security'] },
  { term: 'CSRF', definition: 'Cross-Site Request Forgery; an attack that tricks a user into performing unwanted actions on a site they trust.', category: 'Security', tags: ['vulnerability', 'security'] },
  { term: 'SQL Injection', definition: 'An attack that inserts malicious SQL through unsanitized input fields.', category: 'Security', tags: ['vulnerability', 'database'] },
  { term: 'TLS', definition: 'The cryptographic protocol securing data sent over networks.', category: 'Security', tags: ['encryption', 'protocol'] },
  { term: 'OAuth', definition: "An open standard for delegated authorization, letting apps access resources on a user's behalf.", category: 'Security', tags: ['auth', 'protocol'] },
  { term: 'JWT', definition: 'A compact, signed token format used for authentication and information exchange.', category: 'Security', tags: ['auth', 'token'] },
  { term: 'Encryption', definition: 'The process of encoding data so only authorized parties can read it.', category: 'Security', tags: ['security', 'cryptography'] },
  { term: 'Hashing', definition: 'A one-way transformation of data into a fixed-size value, used for integrity and lookups.', category: 'Security', tags: ['security', 'cryptography'] },
  { term: 'Salt', definition: 'Random data added to a password before hashing to defend against precomputed attacks.', category: 'Security', tags: ['security', 'cryptography'] },
  { term: 'Rate Limiting', definition: 'Restricting the number of requests a client can make in a given time window.', category: 'Security', tags: ['security', 'api'] },
  { term: 'Zero-Day', definition: 'A vulnerability that is exploited before the vendor has released a fix.', category: 'Security', tags: ['vulnerability', 'security'] },
  { term: 'Principle of Least Privilege', definition: 'Granting users and systems only the access needed to perform their function.', category: 'Security', tags: ['security', 'best-practice'] },

  // Databases
  { term: 'SQL', definition: 'The standard language for querying and managing relational databases.', category: 'Databases', tags: ['database', 'language'] },
  { term: 'NoSQL', definition: 'A category of databases that store data in non-relational formats like documents or key-value pairs.', category: 'Databases', tags: ['database'] },
  { term: 'ACID', definition: 'A set of properties (Atomicity, Consistency, Isolation, Durability) guaranteeing reliable database transactions.', category: 'Databases', tags: ['database', 'transactions'] },
  { term: 'Index', definition: 'A data structure that speeds up lookups on a database table at the cost of write overhead.', category: 'Databases', tags: ['database', 'performance'] },
  { term: 'Normalization', definition: 'Organizing relational data to reduce redundancy and improve integrity.', category: 'Databases', tags: ['database', 'design'] },
  { term: 'Sharding', definition: 'Splitting a database horizontally across multiple machines to scale storage and throughput.', category: 'Databases', tags: ['database', 'scalability'] },
  { term: 'Replication', definition: 'Copying data across multiple database nodes for redundancy and availability.', category: 'Databases', tags: ['database', 'reliability'] },
  { term: 'Transaction', definition: 'A sequence of database operations treated as a single atomic unit of work.', category: 'Databases', tags: ['database'] },
  { term: 'Schema', definition: 'The formal structure defining tables, fields, and relationships in a database.', category: 'Databases', tags: ['database', 'design'] },
  { term: 'Migration', definition: 'A versioned, scripted change to a database schema.', category: 'Databases', tags: ['database', 'devops'] },

  // DevOps & Infrastructure
  { term: 'CI/CD', definition: 'Continuous Integration/Continuous Deployment; automating the build, test, and release of code changes.', category: 'DevOps & Infrastructure', tags: ['devops', 'automation'] },
  { term: 'Docker', definition: 'A platform for packaging applications and dependencies into portable containers.', category: 'DevOps & Infrastructure', tags: ['containers', 'devops'] },
  { term: 'Container', definition: 'A lightweight, isolated unit that packages code and its dependencies to run consistently anywhere.', category: 'DevOps & Infrastructure', tags: ['containers', 'devops'] },
  { term: 'Kubernetes', definition: 'An open-source system for automating deployment, scaling, and management of containerized applications.', category: 'DevOps & Infrastructure', tags: ['containers', 'orchestration'] },
  { term: 'Orchestration', definition: 'The automated coordination of multiple systems or containers to work together.', category: 'DevOps & Infrastructure', tags: ['devops', 'containers'] },
  { term: 'Infrastructure as Code', definition: 'Managing and provisioning infrastructure through machine-readable configuration files.', category: 'DevOps & Infrastructure', tags: ['devops', 'automation'] },
  { term: 'Virtual Machine', definition: 'A software-based emulation of a physical computer running its own OS.', category: 'DevOps & Infrastructure', tags: ['infrastructure', 'virtualization'] },
  { term: 'Monitoring', definition: "Continuously collecting metrics about a system's health and performance.", category: 'DevOps & Infrastructure', tags: ['devops', 'observability'] },
  { term: 'Logging', definition: 'Recording events and data generated by running software for later analysis.', category: 'DevOps & Infrastructure', tags: ['devops', 'observability'] },
  { term: 'Observability', definition: "The ability to understand a system's internal state from its external outputs (logs, metrics, traces).", category: 'DevOps & Infrastructure', tags: ['devops', 'monitoring'] },

  // Cloud
  { term: 'IaaS', definition: 'Infrastructure as a Service; cloud-provided virtualized computing resources like servers and storage.', category: 'Cloud', tags: ['cloud'] },
  { term: 'PaaS', definition: 'Platform as a Service; a cloud environment for building and deploying apps without managing infrastructure.', category: 'Cloud', tags: ['cloud'] },
  { term: 'SaaS', definition: 'Software as a Service; software delivered over the internet on a subscription basis.', category: 'Cloud', tags: ['cloud'] },
  { term: 'Auto-scaling', definition: 'Automatically adjusting compute resources up or down based on demand.', category: 'Cloud', tags: ['cloud', 'scalability'] },
  { term: 'Availability Zone', definition: 'An isolated data center location within a cloud region, used for redundancy.', category: 'Cloud', tags: ['cloud', 'infrastructure'] },
  { term: 'Edge Computing', definition: "Processing data closer to where it's generated rather than in a centralized data center.", category: 'Cloud', tags: ['cloud', 'performance'] },

  // Software Architecture
  { term: 'MVC', definition: 'Model-View-Controller; a pattern separating data, presentation, and control logic.', category: 'Software Architecture', tags: ['architecture', 'pattern'] },
  { term: 'Design Pattern', definition: 'A reusable, general solution to a commonly occurring software design problem.', category: 'Software Architecture', tags: ['architecture', 'best-practice'] },
  { term: 'Dependency Injection', definition: "A technique where an object's dependencies are provided externally rather than created internally.", category: 'Software Architecture', tags: ['architecture', 'pattern'] },
  { term: 'Event-Driven Architecture', definition: 'A design where components communicate by producing and reacting to events.', category: 'Software Architecture', tags: ['architecture', 'async'] },
  { term: 'Coupling', definition: "The degree to which components depend on each other's internals.", category: 'Software Architecture', tags: ['architecture', 'design'] },
  { term: 'Cohesion', definition: 'The degree to which the responsibilities of a single module are related and focused.', category: 'Software Architecture', tags: ['architecture', 'design'] },

  // Version Control
  { term: 'Git', definition: 'A distributed version control system for tracking changes in source code.', category: 'Version Control', tags: ['vcs', 'tooling'] },
  { term: 'Branch', definition: 'An independent line of development within a version control repository.', category: 'Version Control', tags: ['git', 'vcs'] },
  { term: 'Merge', definition: 'Combining changes from one branch into another.', category: 'Version Control', tags: ['git', 'vcs'] },
  { term: 'Rebase', definition: 'Reapplying commits on top of another base branch to create a linear history.', category: 'Version Control', tags: ['git', 'vcs'] },
  { term: 'Pull Request', definition: 'A request to merge changes from one branch into another, typically with review.', category: 'Version Control', tags: ['git', 'collaboration'] },
  { term: 'Commit', definition: 'A saved snapshot of changes in a version control system.', category: 'Version Control', tags: ['git', 'vcs'] },

  // Testing & Quality
  { term: 'Unit Test', definition: 'A test that verifies the behavior of a single, isolated piece of code.', category: 'Testing & Quality', tags: ['testing'] },
  { term: 'Integration Test', definition: 'A test that verifies multiple components work correctly together.', category: 'Testing & Quality', tags: ['testing'] },
  { term: 'TDD', definition: 'Test-Driven Development; writing tests before writing the code that satisfies them.', category: 'Testing & Quality', tags: ['testing', 'methodology'] },
  { term: 'Mocking', definition: 'Replacing real dependencies with controlled fake objects during testing.', category: 'Testing & Quality', tags: ['testing'] },
  { term: 'Code Coverage', definition: 'A measurement of how much of a codebase is exercised by tests.', category: 'Testing & Quality', tags: ['testing', 'metrics'] },
  { term: 'Regression Testing', definition: "Re-running tests to ensure new changes haven't broken existing functionality.", category: 'Testing & Quality', tags: ['testing'] },

  // Performance
  { term: 'Caching', definition: 'Storing computed or fetched data temporarily to speed up future access.', category: 'Performance', tags: ['performance'] },
  { term: 'Lazy Loading', definition: "Deferring the loading of resources until they're actually needed.", category: 'Performance', tags: ['performance', 'frontend'] },
  { term: 'Minification', definition: 'Removing unnecessary characters from code to reduce file size.', category: 'Performance', tags: ['performance', 'build-tools'] },
  { term: 'Compression', definition: 'Encoding data to reduce its size for storage or transfer, e.g. gzip.', category: 'Performance', tags: ['performance', 'networking'] },
  { term: 'Big O Notation', definition: "A mathematical notation describing how an algorithm's runtime or memory scales with input size.", category: 'Performance', tags: ['algorithms', 'cs-fundamentals'] },
  { term: 'Debouncing', definition: "Delaying a function's execution until a burst of calls has stopped.", category: 'Performance', tags: ['performance', 'frontend'] },
  { term: 'Throttling', definition: 'Limiting how often a function can run over time.', category: 'Performance', tags: ['performance', 'frontend'] },

  // APIs & Data Formats
  { term: 'GraphQL', definition: 'A query language for APIs that lets clients request exactly the data they need.', category: 'APIs & Data Formats', tags: ['api', 'query-language'] },
  { term: 'JSON', definition: 'A lightweight, text-based data interchange format.', category: 'APIs & Data Formats', tags: ['data-format'] },
  { term: 'XML', definition: 'A markup language for encoding structured data.', category: 'APIs & Data Formats', tags: ['data-format'] },
  { term: 'gRPC', definition: 'A high-performance RPC framework using Protocol Buffers for communication between services.', category: 'APIs & Data Formats', tags: ['api', 'protocol'] },
  { term: 'Endpoint', definition: 'A specific URL where an API can be accessed by a client.', category: 'APIs & Data Formats', tags: ['api'] },

  // AI/ML & Data
  { term: 'Machine Learning', definition: 'A field of AI where systems learn patterns from data rather than explicit rules.', category: 'AI/ML & Data', tags: ['ai'] },
  { term: 'Neural Network', definition: 'A machine learning model loosely inspired by the brain, made of layered nodes.', category: 'AI/ML & Data', tags: ['ai', 'ml'] },
  { term: 'LLM', definition: 'Large Language Model; a neural network trained on vast text data to generate and understand language.', category: 'AI/ML & Data', tags: ['ai', 'nlp'] },
  { term: 'Training', definition: "The process of adjusting a model's parameters using data to improve its predictions.", category: 'AI/ML & Data', tags: ['ai', 'ml'] },
  { term: 'Inference', definition: 'Using a trained model to make predictions on new data.', category: 'AI/ML & Data', tags: ['ai', 'ml'] },
  { term: 'Embedding', definition: 'A numerical vector representation of data (like text) that captures semantic meaning.', category: 'AI/ML & Data', tags: ['ai', 'nlp'] },
  { term: 'Vector Database', definition: 'A database optimized for storing and searching high-dimensional embedding vectors.', category: 'AI/ML & Data', tags: ['ai', 'database'] },
  { term: 'Prompt Engineering', definition: 'Crafting inputs to a language model to elicit better or more reliable outputs.', category: 'AI/ML & Data', tags: ['ai', 'nlp'] },

  // General CS
  { term: 'Algorithm', definition: 'A finite, well-defined sequence of steps for solving a problem.', category: 'General CS', tags: ['cs-fundamentals'] },
  { term: 'Data Structure', definition: 'A particular way of organizing and storing data for efficient access and modification.', category: 'General CS', tags: ['cs-fundamentals'] },
  { term: 'Recursion', definition: 'A technique where a function solves a problem by calling itself on smaller subproblems.', category: 'General CS', tags: ['cs-fundamentals'] },
  { term: 'Compiler', definition: 'A program that translates source code into another language, typically machine code, before execution.', category: 'General CS', tags: ['cs-fundamentals', 'tooling'] },
  { term: 'Interpreter', definition: 'A program that executes source code directly, without a separate compilation step.', category: 'General CS', tags: ['cs-fundamentals', 'tooling'] },
  { term: 'Concurrency', definition: 'The ability of a system to handle multiple tasks making progress during overlapping time periods.', category: 'General CS', tags: ['cs-fundamentals', 'async'] },
  { term: 'Parallelism', definition: 'Executing multiple computations at literally the same time, typically across multiple cores.', category: 'General CS', tags: ['cs-fundamentals', 'performance'] },

  // Emerging / General Tech
  { term: 'Blockchain', definition: 'A distributed, append-only ledger secured by cryptographic linking of records.', category: 'Emerging Tech', tags: ['emerging-tech'] },
  { term: 'IoT', definition: 'Internet of Things; a network of physical devices embedded with sensors and connectivity.', category: 'Emerging Tech', tags: ['emerging-tech'] },
  { term: 'Quantum Computing', definition: 'A computing paradigm using quantum-mechanical phenomena to perform certain calculations exponentially faster.', category: 'Emerging Tech', tags: ['emerging-tech'] },
  { term: 'Augmented Reality', definition: 'Technology that overlays digital content onto the real world in real time.', category: 'Emerging Tech', tags: ['emerging-tech'] },
];

export default glossary;
