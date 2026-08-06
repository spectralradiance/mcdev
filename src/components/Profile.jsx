import { useState } from 'react';

const Profile = () => {
  return (
    <div className="mb-16">
      <div className="mb-10">
        <h1 className="text-5xl font-bold mb-3">Matthew Cooper</h1>
        <p className="text-gray-400 mb-1">Portland, OR</p>
        <p className="text-xl text-gray-300 mt-3 font-light">
          Full-Stack Engineer&nbsp;&nbsp;·&nbsp;&nbsp;Systems &amp; Data Specialist&nbsp;&nbsp;·&nbsp;&nbsp;Educator
        </p>
        <p className="text-gray-400 mt-4 max-w-2xl leading-relaxed">
          Over a decade of experience across web development, database management, and technical instruction.
          I specialize in building flexible web architecture, custom data integrations, and scalable tech
          infrastructure for organizations.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="text-3xl font-bold mb-6 border-b border-gray-700 pb-2">Experience</h2>
        <Job
          title="Technical Consultant &amp; Manager"
          period="2021 – Present"
          bullets={[
            'Built Python/Django web applications to automate sync pipelines between database platforms and CRM systems, incorporating custom analytics dashboards and mapping APIs.',
            'Overhauled multi-platform tech stacks (Webflow, WordPress, HubSpot, Airtable), including seamless data migrations covering 60k+ record sets without loss of integrity.',
            'Led end-to-end web rebrands, managing DNS, keyword research, and CRM integration strategies.',
          ]}
        />
        <Job
          title="Lead Full-Stack Software Instructor"
          org="PDX Code Guild"
          period="2017 – 2021"
          bullets={[
            'Authored and delivered a 15-week immersive full-stack Python curriculum spanning CS fundamentals, web frameworks (Django/Flask), front-end tools, and SQL databases.',
            'Mentored 14 cohorts (96 students) from diverse technical backgrounds into production-ready software engineers.',
          ]}
        />
        <Job
          title="Software Developer &amp; Engineer"
          period="2008 – 2015"
          bullets={[
            'Engineered automated SMS/MMS campaign management software for rural public health initiatives (CDC), compliance tagging software, and custom ERP systems for international clients using C#, ASP.NET, and SQL.',
            'Developed interactive educational software, touch-screen exhibits, and real-time visualization applications using dynamic data feeds.',
          ]}
        />
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
            <p className="text-gray-400 text-sm">Graduate Certificate in Data Mining · New Jersey Institute of Technology</p>
          </div>
          <div>
            <p className="font-semibold text-lg">B.S. in Computer Science</p>
            <p className="text-gray-400 text-sm">Minor in Literary &amp; Cultural Studies · Rochester Institute of Technology</p>
          </div>
        </div>
      </section>
    </div>
  );
};



const Job = ({ title, org, period, partTime, bullets }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-8">
      <button
        className="flex flex-wrap items-baseline gap-2 mb-1 text-left w-full cursor-pointer hover:opacity-75"
        onClick={() => setOpen(o => !o)}
      >
        {title && <span className="font-semibold text-lg">{title},</span>}
        <span className="font-semibold text-lg text-gray-300">{org}</span>
        <span className="text-gray-500 text-sm">({period}{partTime ? ', Part-Time' : ''})</span>
        <span className="text-gray-500 text-sm ml-2">{open ? '▲' : '▼'}</span>
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <ul className="list-disc pl-6 text-white space-y-1 pt-3">
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
};

const EduItem = ({ title, subtitle, bullets }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6">
      <button
        className="flex flex-wrap items-baseline gap-2 mb-1 text-left w-full cursor-pointer hover:opacity-75"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-semibold text-lg">{title}</span>
        <span className="text-gray-500 text-sm ml-2">{open ? '▲' : '▼'}</span>
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <p className="text-gray-300 pt-2">{subtitle}</p>
          <ul className="list-disc pl-6 text-white space-y-1 pt-2">
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
};

const SKILLS = [
  {
    category: 'Languages & Frameworks',
    items: ['Python', 'Django', 'Flask', 'JavaScript', 'Vue.js', 'AngularJS', 'HTML5', 'CSS3', 'C#', 'ASP.NET', 'SQL'],
  },
  {
    category: 'CMS & Web Builders',
    items: ['Webflow', 'WordPress', 'Oxygen Builder', 'Sanity'],
  },
  {
    category: 'Data & Automation',
    items: ['Airtable', 'PostgreSQL', 'MySQL', 'REST APIs', 'Data Mining', 'Scripting', 'Semrush'],
  },
  {
    category: 'Platforms & Infrastructure',
    items: ['HubSpot CRM', 'Google Workspace', 'Asana', 'Typeform', 'Fundraise Up', 'Git / GitHub'],
  },
];

const Skills = () => (
  <div className="space-y-6">
    {SKILLS.map(({ category, items }) => (
      <div key={category}>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{category}</h3>
        <div className="flex flex-wrap gap-2">
          {items.map(skill => (
            <span key={skill} className="px-3 py-1 bg-gray-800 text-white text-sm rounded-full border border-gray-700">
              {skill}
            </span>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default Profile;
