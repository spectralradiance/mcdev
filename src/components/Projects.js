import React from 'react';
import { Typography, List, ListItem, ListItemText, Divider, Link } from '@mui/material';

const projects = [
  {
    name: 'Project 1',
    description: 'A brief description of your first project.',
    link: 'https://github.com/your-profile/project-1',
  },
  {
    name: 'Project 2',
    description: 'A brief description of your second project.',
    link: 'https://github.com/your-profile/project-2',
  },
  {
    name: 'Project 3',
    description: 'A brief description of your third project.',
    link: 'https://github.com/your-profile/project-3',
  },
];

const Projects = () => {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Sample Projects
      </Typography>
      <List>
        {projects.map((project, index) => (
          <React.Fragment key={project.name}>
            <ListItem alignItems="flex-start">
              <ListItemText
                primary={
                  <Link href={project.link} target="_blank" rel="noopener noreferrer">
                    {project.name}
                  </Link>
                }
                secondary={project.description}
              />
            </ListItem>
            {index < projects.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </List>
    </>
  );
};

export default Projects;
