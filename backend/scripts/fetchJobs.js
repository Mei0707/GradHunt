const { fetchLinkedInJobs } = require('../services/linkedinService');
const connectDB = require('../config/db');

connectDB();

const fetchAllJobs = async () => {
    try {
        console.log('Starting job fetch...');

        //fetch from linkedin
        await fetchLinkedInJobs();

        console.log('All jobs fetched successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        process.exit(1);
    }
};

fetchAllJobs();