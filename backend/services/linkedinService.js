const axios = require('axios');
const Job = require('../models/Jobs');

//LinkedIn API configuration
const LINKEDIN_API_KEY = process.env.LINKEDIN_API_KEY || 'example_12345';
const LINKEDIN_API_SECRET = process.env.LINKEDIN_API_SECRET || 'example_56789';
const LINKEDIN_BASE_URL = 'https://api.linkedin.com/v2';

//fetch jobs from LinkedIn
const fetchLinkedInJobs = async (keywords = 'software engineer', location = '') => {
    try {
        console.log('Fetching LinkedIn jobs...');

        //example
        const response = await axios.get(`${LINKEDIN_BASE_URL}/jobs`, {
            params: {
                keywords,
                location,
                count: 25,
            },
            headers: {
                'Authorization': `Bearer ${LINKEDIN_API_KEY}`,
                'Content-Type': `application/json`,
            }
        });

        const jobListings = response.data.elements.map(job => ({
            title: job.title,
            company: job.company.name,
            location: job.locationName,
            description: job.description,
            applyLink: job.applyMethod.companyApplyUrl,
            source: 'LinkedIn',
            jobType: determineJobType(job.title),
            datePosted: new Date(job.postingDate),
            skills: job.requiredSkills || [],
            isRemote: job.workRemoteAllowed || false
        }));

        //mock data
        const mockJobListings = [
            {
                title: "Software Engineer Intern",
                company: "TechCorp",
                location: "San Francisco, CA",
                description: "Looking for a passionate software engineering intern to join our team for the summer. Work on real-world projects using cutting-edge technologies.",
                applyLink: "https://techcorp.com/careers/intern2025",
                source: "LinkedIn",
                jobType: "Internship",
                datePosted: new Date(),
                skills: ["JavaScript", "React", "Node.js"],
                isRemote: false
            },
            {
                title: "Junior Frontend Developer",
                company: "WebSolutions Inc.",
                location: "New York, NY",
                description: "New grad position for frontend developers. Join our team building responsive web applications for Fortune 500 clients.",
                applyLink: "https://websolutions.com/apply/junior-dev",
                source: "LinkedIn",
                jobType: "Entry Level",
                datePosted: new Date(Date.now() - 86400000), // Yesterday
                skills: ["HTML", "CSS", "JavaScript", "Vue.js"],
                isRemote: true
            },
            {
                title: "Backend Engineer - New Grad",
                company: "DataSystems",
                location: "Seattle, WA",
                description: "Seeking recent graduates with strong CS fundamentals to join our backend team. Work on scalable systems that handle millions of requests.",
                applyLink: "https://datasystems.io/careers/newgrad",
                source: "LinkedIn",
                jobType: "Entry Level",
                datePosted: new Date(Date.now() - 172800000), // 2 days ago
                skills: ["Java", "Spring", "AWS", "Databases"],
                isRemote: false
            },
            {
                title: "Summer Tech Intern",
                company: "StartupXYZ",
                location: "Austin, TX",
                description: "Join our fast-paced startup as a summer intern. Work directly with our CTO on building new features for our main product.",
                applyLink: "https://startupxyz.com/summer-intern",
                source: "LinkedIn",
                jobType: "Internship",
                datePosted: new Date(Date.now() - 259200000), // 3 days ago
                skills: ["Python", "Django", "React", "Git"],
                isRemote: true
            },
            {
                title: "Graduate Software Developer",
                company: "EnterpriseApps",
                location: "Chicago, IL",
                description: "Excellent opportunity for recent graduates to join our development team. Full training provided in our tech stack.",
                applyLink: "https://enterpriseapps.com/careers/graduate",
                source: "LinkedIn",
                jobType: "Entry Level",
                datePosted: new Date(Date.now() - 345600000), // 4 days ago
                skills: ["C#", ".NET", "SQL", "Azure"],
                isRemote: false
            }
        ];

        //save jobs to database
        try {
            //clear existing jobs before adding new ones
            await Job.deleteMany({ source: 'LinkedIn' });

            await Job.insertMany(mockJobListings);
            console.log(`${mockJobListings.length} LinkedIn jobs fetched and saved`);
        } catch (dbError) {
            console.error('Error saving jobs to database:', dbError);
        }

        return mockJobListings;
    } catch (error) {
        console.error('Error fetching LinkedIn jobs:', error);
        throw error;
    }
};

//helper function to determin job type based on title
const determineJobType = (title) => {
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes('intern') || lowerTitle.includes('internship')) {
        return 'Internship';
    } else if (
        lowerTitle.includes('junior') ||
        lowerTitle.includes('entry') ||
        lowerTitle.includes('graduate') ||
        lowerTitle.includes('new grad')
    ) {
        return 'Entry Level';
    } else if (lowerTitle.includes('senior') || lowerTitle.includes('lead')) {
        return 'Senior';
    } else {
        return 'Mid Level';
    }
};

module.exports = {
    fetchLinkedInJobs
};