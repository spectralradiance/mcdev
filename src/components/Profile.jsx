const Profile = () => {
  return (
    <div className="mb-16">
      <div className="mb-10">
        <h1 className="text-5xl font-bold mb-3">Matthew Cooper</h1>
        <p className="text-gray-400 mb-1">Portland, OR (open to remote)</p>
        <p className="text-sm text-gray-400 flex flex-wrap gap-x-4 gap-y-1 mt-2">
          <a href="mailto:matthewrcooper4@gmail.com" className="hover:text-white">matthewrcooper4@gmail.com</a>
          <a href="https://www.linkedin.com/in/matthewrussellcooper/" className="hover:text-white">LinkedIn</a>
          <a href="https://github.com/spectralradiance" className="hover:text-white">GitHub</a>
        </p>
        <p className="text-gray-400 mt-6 max-w-2xl leading-relaxed">
          Software engineer with 15+ years across web development, data pipelines, AI applications, and CRM
          integrations, plus four years teaching full-stack Python. I build and connect the systems organizations
          run on, from WordPress and React front ends to Django and FastAPI services, HubSpot and Airtable data,
          and local and API-based LLM pipelines. M.S. in Computer Science with a graduate certificate in data mining.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Experience</h2>
        <div className="space-y-8">
          <Job title="Independent Technical Consultant" period="Feb 2026 – Present">
            Technical work for mission-driven nonprofits: leading WordPress rebrands and redesigns with custom PHP,
            DNS migration, SEO, and CRM and email-marketing integrations, and building Python data analysis and
            map visualizations covering thousands of facilities for an advocacy research team.
          </Job>
          <Job title="Technical Manager" period="Aug 2021 – Apr 2025">
            Owned the technology stack for a 20-person nonprofit. Migrated 60,000 contacts and their donation
            histories into HubSpot with full data validation, built a Django service syncing Airtable survey data
            to the CRM in near real time, and connected forms, donations, and web data across platforms. Designed
            the Airtable data architecture behind quarterly reporting, built geographic analytics dashboards,
            launched two organizational websites, and trained staff on tools and workflows.
          </Job>
          <Job title="Lead Instructor, Full-Stack Python Bootcamp" period="May 2017 – Aug 2021">
            Designed a 15-week full-stack Python curriculum and taught 96 students across 14 cohorts through
            lectures, mob programming, and one-on-one mentoring, covering Python, Django, Flask, SQL, JavaScript,
            Vue, APIs, Git, algorithms, and deployment, along with career preparation.
          </Job>
          <Job title="Senior Software Developer" period="Jun 2012 – Jul 2015">
            Built an SMS/MMS public health campaign platform for a federal health agency reaching underserved rural
            communities abroad, with automated presentation-to-video conversion and an Android relay app. Also
            built a chemical compliance application and an ERP system for precious-metals sales and inventory, in
            C#, ASP.NET, AngularJS, SQL Server, and Azure.
          </Job>
          <Job title="Software Developer" period="Sep 2008 – Jun 2012">
            Delivered five client projects from design to deployment, including a touchscreen anatomy exhibit for a
            science museum and a real-time 3D globe visualizing global stock markets. Gathered requirements,
            trained clients, and ran user acceptance testing.
          </Job>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Projects</h2>
        <div className="space-y-6">
          <Project
            name="Ogma"
            href="https://github.com/spectralradiance/ogma"
            stack="Python, FastAPI, React, TypeScript, ChromaDB, PyTorch"
          >
            Local-first RAG and corpus-analysis platform for thousands of Markdown notes. Retrieves excerpts from a
            ChromaDB vector index built with sentence-transformers, models topics with BERTopic and KeyBERT, maps
            document-topic-keyword graphs with NetworkX, and generates long-form drafts with a 4-bit quantized Qwen
            model on a local GPU or through the Claude API. A FastAPI service runs GPU jobs through a serialized
            queue with live progress over Server-Sent Events.
          </Project>
          <Project
            name="deasil.org"
            href="https://deasil.org"
            source="https://github.com/spectralradiance/deasil"
            stack="Next.js, TypeScript"
          >
            Site hosting a suite of interactive web apps. Altar uses an LLM to interpret tarot readings. Aria is a
            browser-based generative music tracker with a node-graph synthesizer built on the Web Audio API that
            renders songs to WAV faster than real time.
          </Project>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Technical Skills</h2>
        <Skills />
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Education</h2>
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-lg">M.S. in Computer Science</p>
            <p className="text-gray-400 text-sm">Graduate Certificate in Data Mining · New Jersey Institute of Technology · 2015</p>
            <p className="text-gray-500 text-sm mt-1">Coursework: neural networks, genetic algorithms, classification, clustering, text mining</p>
          </div>
          <div>
            <p className="font-semibold text-lg">B.S. in Computer Science</p>
            <p className="text-gray-400 text-sm">Minor in Literary &amp; Cultural Studies · Rochester Institute of Technology · 2010</p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Volunteering</h2>
        <p className="text-gray-300 leading-relaxed">
          Habitat restoration and website maintenance for a local nature preserve (2023 – present); organizing
          monthly community events on processing emotions around the climate crisis (2023 – present); and
          coalition work with Portland City Council on legislation banning sales of new fur products, including
          the campaign website and social graphics (2018 – 2022).
        </p>
      </section>
    </div>
  );
};



const Job = ({ title, period, children }) => (
  <div>
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-semibold text-lg">{title}</span>
      <span className="text-gray-500 text-sm">({period})</span>
    </p>
    <p className="text-gray-300 mt-2 leading-relaxed">{children}</p>
  </div>
);

const Project = ({ name, href, source, stack, children }) => (
  <div>
    <p className="flex flex-wrap items-baseline gap-x-2">
      <a href={href} className="font-semibold text-lg underline underline-offset-4 hover:text-gray-300">{name}</a>
      {source && <a href={source} className="text-sm text-gray-400 hover:text-white">(source)</a>}
      <span className="text-gray-500 text-sm">{stack}</span>
    </p>
    <p className="text-gray-300 mt-2 leading-relaxed">{children}</p>
  </div>
);

const SKILLS = [
  {
    category: 'Languages',
    items: ['Python', 'TypeScript', 'JavaScript', 'SQL', 'PHP', 'C#', 'C++', 'HTML', 'CSS'],
  },
  {
    category: 'Web',
    items: ['React', 'Next.js', 'Django', 'FastAPI', 'Flask', 'Vue', 'ASP.NET', 'Web Audio API'],
  },
  {
    category: 'AI / ML',
    items: ['LLM APIs (OpenAI, Anthropic)', 'Local LLMs (Qwen, Transformers)', '4-bit quantization', 'RAG', 'sentence-transformers', 'BERTopic', 'KeyBERT', 'PyTorch', 'AI coding assistants'],
  },
  {
    category: 'Data',
    items: ['pandas', 'PostgreSQL', 'Microsoft SQL Server', 'ChromaDB', 'Airtable', 'NetworkX', 'Data modeling', 'ETL & data migration', 'Geospatial analysis'],
  },
  {
    category: 'CMS & Web Ops',
    items: ['WordPress (custom PHP, Oxygen Builder)', 'Webflow', 'DNS', 'SEO (Semrush)', 'Web analytics'],
  },
  {
    category: 'CRM & Platforms',
    items: ['HubSpot', 'Neon CRM', 'EveryAction', 'Constant Contact', 'Fundraise Up', 'Typeform', 'Asana', 'Google Workspace'],
  },
  {
    category: 'DevOps & Tools',
    items: ['Git', 'Docker', 'AWS', 'GCP', 'Azure', 'PythonAnywhere', 'pytest'],
  },
];

const Skills = () => (
  <div className="space-y-5">
    {SKILLS.map(({ category, items }) => (
      <div key={category}>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">{category}</h3>
        <div className="flex flex-wrap gap-1.5">
          {items.map(skill => (
            <span key={skill} className="px-2.5 py-0.5 bg-gray-800 text-white text-sm rounded-full border border-gray-700">
              {skill}
            </span>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default Profile;
