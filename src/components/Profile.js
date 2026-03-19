import React from 'react';
import { Typography, Avatar, Box } from '@mui/material';

const Profile = () => {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Avatar
        alt="Your Name"
        src="https://via.placeholder.com/150"
        sx={{ width: 150, height: 150, margin: '0 auto', mb: 2 }}
      />
      <Typography variant="h5">Your Name</Typography>
      <Typography variant="body1" sx={{ mt: 1 }}>
        Your bio goes here. Tell us about yourself, your skills, and your passions.
      </Typography>
    </Box>
  );
};

export default Profile;
