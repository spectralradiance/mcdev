import './Hero.css';

function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">
        <div className="profile-photo-wrapper">
          <img
            src="/profile.svg"
            alt="Profile photo"
            className="profile-photo"
          />
        </div>
        <div className="bio">
          <h1 className="bio-name">Alex Devlin</h1>
          <p className="bio-title">Full-Stack Developer &amp; Open Source Enthusiast</p>
          <p className="bio-description">
            Hi! I&apos;m a passionate developer who loves building things for the web.
            I specialize in React, Node.js, and cloud infrastructure. When I&apos;m not
            coding, you&apos;ll find me hiking, reading sci-fi, or contributing to
            open-source projects.
          </p>
          <div className="bio-links">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="bio-link"
            >
              GitHub
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="bio-link"
            >
              LinkedIn
            </a>
            <a href="mailto:alex@example.com" className="bio-link">
              Email
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
