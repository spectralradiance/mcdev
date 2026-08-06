import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Profile from './components/Profile';
import Projects from './components/Projects';
import Portfolio from './components/Portfolio';
import ProgramsPage from './programs/page';
import WoodlandFortressPage from './programs/woodlandfortress/page';

function HomePage() {
  return (
    <>
      <Profile />
      <Projects />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-12">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/resume" element={<Profile />} />
            <Route path="/programs" element={<ProgramsPage />} />
            <Route path="/programs/woodlandfortress" element={<WoodlandFortressPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
