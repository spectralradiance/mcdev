import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Profile from './components/Profile';
import Projects from './components/Projects';
import Portfolio from './components/Portfolio';
import ProgramsPage from './programs/page';
import WoodlandFortressPage from './programs/woodlandfortress/page';
import KybosPage from './programs/kybos/page';
import ApaxPage from './programs/apax/page';

function HomePage() {
  return (
    <>
      <Profile />
      <Projects />
    </>
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
          <Route path="/" element={<Contained><HomePage /></Contained>} />
          <Route path="/portfolio" element={<Contained><Portfolio /></Contained>} />
          <Route path="/resume" element={<Contained><Profile /></Contained>} />
          <Route path="/programs" element={<Contained><ProgramsPage /></Contained>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
