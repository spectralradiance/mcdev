import { BrowserRouter, Link, Navigate, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Profile from './components/Profile';
import Projects from './components/Projects';
import Glossary from './components/Glossary';
import Learn from './components/Learn';
import WoodlandFortressPage from './programs/woodlandfortress/page';
import KybosPage from './programs/kybos/page';
import ApaxPage from './programs/apax/page';
import NiamhPage from './programs/niamh/page';

function HomePage() {
  return (
    <main className="space-y-20 pb-8">
      <section className="max-w-2xl pt-8">
        <h1 className="text-4xl font-bold sm:text-6xl">Matthew Cooper</h1>
        <p className="mt-4 text-xl font-light leading-relaxed text-gray-300">
          Software Engineer · Data &amp; AI Systems · Educator
        </p>
        <p className="mt-6 leading-relaxed text-gray-400">
          I’m a Portland-based software engineer with 15+ years across web development, data pipelines, AI
          applications, and CRM integrations, plus four years teaching full-stack Python. I build and connect
          the systems organizations run on, from WordPress and React front ends to Django and FastAPI
          services, HubSpot and Airtable data, and local and API-based LLM pipelines.
        </p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to="/resume" className="text-white underline underline-offset-4 hover:text-gray-300">Resume</Link>
          <Link to="/projects" className="text-white underline underline-offset-4 hover:text-gray-300">Projects</Link>
          <a href="https://github.com/spectralradiance" className="text-gray-400 hover:text-white">GitHub</a>
          <a href="https://www.linkedin.com/in/matthewrussellcooper/" className="text-gray-400 hover:text-white">LinkedIn</a>
          <a href="mailto:matthewrcooper4@gmail.com" className="text-gray-400 hover:text-white">Email</a>
        </div>
      </section>

      <section aria-labelledby="hire-me-heading" className="border-t border-gray-700 pt-10">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">Work with me</p>
          <h2 id="hire-me-heading" className="mt-2 text-3xl font-bold sm:text-4xl">Hire me</h2>
          <p className="mt-4 leading-relaxed text-gray-400">
            I take on select consulting and photography projects in Portland and beyond. Tell me what you’re
            planning, where you’re stuck, or what you want to remember.
          </p>
        </div>

        <div className="mt-10 grid gap-px border border-gray-700 bg-gray-700 md:grid-cols-2">
          <article className="bg-black p-6 sm:p-8">
            <p className="text-sm text-gray-500">01</p>
            <h3 className="mt-6 text-2xl font-semibold">Technical consulting</h3>
            <p className="mt-4 leading-relaxed text-gray-400">
              Practical help with web applications, data systems, integrations, and technical strategy. I can
              untangle an existing stack, guide a migration, or build the missing piece.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-gray-300">
              <li>Web architecture &amp; application development</li>
              <li>Data migrations, automation &amp; APIs</li>
              <li>Technical audits, planning &amp; training</li>
            </ul>
          </article>

          <article className="bg-black p-6 sm:p-8">
            <p className="text-sm text-gray-500">02</p>
            <h3 className="mt-6 text-2xl font-semibold">Photography</h3>
            <p className="mt-4 leading-relaxed text-gray-400">
              Candid, attentive photography for people and gatherings, with an emphasis on natural moments,
              honest atmosphere, and images that still feel like you.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-gray-300">
              <li>Events &amp; live performances</li>
              <li>Portraits &amp; creative sessions</li>
              <li>On-location work in the Portland area</li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}

const Contained = ({ children }) => (
  <div className="max-w-4xl mx-auto px-6 py-12">{children}</div>
);

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-black text-white">
        <Header />
        <Routes>
          <Route path="/programs/kybos" element={<KybosPage />} />
          <Route path="/programs/woodlandfortress" element={<WoodlandFortressPage />} />
          <Route path="/programs/apax" element={<Contained><ApaxPage /></Contained>} />
          <Route path="/programs/niamh" element={<Contained><NiamhPage /></Contained>} />
          <Route path="/" element={<Contained><HomePage /></Contained>} />
          <Route path="/projects" element={<Contained><Projects /></Contained>} />
          <Route path="/glossary" element={<Contained><Glossary /></Contained>} />
          <Route path="/learn" element={<Contained><Learn /></Contained>} />
          <Route path="/resume" element={<Contained><Profile /></Contained>} />
          <Route path="/programs" element={<Navigate to="/projects" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
