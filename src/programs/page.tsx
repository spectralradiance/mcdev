import { Link } from "react-router-dom";
import { Button, Box } from "@mui/material";

const projects = [
  {
    name: "Niamh",
    description: "A raytracer based in TypeScript.",
    url: "/programs/niamh",
  },
  {
    name: "Apax",
    description: "A pixel art editor.",
    url: "/programs/apax",
  },
  {
    name: "Vara",
    description: "A rune and ogham translator.",
    url: "/programs/vara",
  },
  {
    name: "Woodland Fortress",
    description: "Browse bands for the Woodland Fortress festival.",
    url: "/programs/woodlandfortress",
  },
];

export default function ProgramsPage() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1>Programs</h1>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        {projects.map((project) => (
          <Button
            key={project.name}
            component={Link}
            to={project.url}
            variant="contained"
          >
            {project.name}
          </Button>
        ))}
      </Box>
    </main>
  );
}