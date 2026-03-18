import './Footer.css';

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <p className="footer-text">
        &copy; {year} Alex Devlin &mdash; Built with React &amp; Vite
      </p>
    </footer>
  );
}

export default Footer;
