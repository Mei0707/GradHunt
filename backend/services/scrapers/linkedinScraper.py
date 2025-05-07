import requests
from bs4 import BeautifulSoup
import random
import json
import time
import sys

def scrape_linkedin_jobs(title, location, num_jobs=25):
    """
    Scrape LinkedIn jobs for a specific title and location
    """
    print(f"Scraping LinkedIn jobs for {title} in {location}")
    
    # Empty list to store all jobs
    all_jobs = []
    
    # Scrape multiple pages
    for start in range(0, num_jobs, 25):
        list_url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={title}&location={location}&start={start}"
        
        # Send a get request to url with a user agent to avoid blocking
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }
        
        print(f"Requesting: {list_url}")
        response = requests.get(list_url, headers=headers)
        
        # Check if request was successful
        if response.status_code != 200:
            print(f"Failed to fetch jobs list: Status code {response.status_code}")
            break
        
        # Get the HTML
        list_data = response.text
        list_soup = BeautifulSoup(list_data, "html.parser")
        page_jobs = list_soup.find_all("li")
        
        print(f"Found {len(page_jobs)} jobs on this page")
        
        if len(page_jobs) == 0:
            break
        
        # Empty list store job id
        id_list = []
        
        for job in page_jobs:
            try:
                base_card_div = job.find("div", {"class": "base-card"})
                if base_card_div and base_card_div.get("data-entity-urn"):
                    job_id = base_card_div.get("data-entity-urn").split(":")[-1]
                    id_list.append(job_id)
            except Exception as e:
                print(f"Error extracting job ID: {e}")
        
        # Process each job
        for job_id in id_list:
            try:
                job_url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
                
                # Add a small delay to avoid rate limiting
                time.sleep(random.uniform(1, 3))
                
                job_response = requests.get(job_url, headers=headers)
                
                if job_response.status_code != 200:
                    print(f"Failed to fetch job {job_id}: Status code {job_response.status_code}")
                    continue
                
                job_soup = BeautifulSoup(job_response.text, "html.parser")
                
                # Create a dictionary to store job details
                job_post = {}
                job_post["id"] = f"linkedin-{job_id}"
                
                try:
                    job_post["title"] = job_soup.find("h2", {"class": lambda c: c and "top-card-layout__title" in c}).text.strip()
                except:
                    job_post["title"] = "Unknown Title"
                
                try:
                    job_post["company"] = job_soup.find("a", {"class": lambda c: c and "topcard__org-name-link" in c}).text.strip()
                except:
                    job_post["company"] = "Unknown Company"
                
                try:
                    job_post["location"] = job_soup.find("span", {"class": lambda c: c and "topcard__flavor" in c and "topcard__flavor--bullet" in c}).text.strip()
                except:
                    job_post["location"] = location
                
                try:
                    job_post["time_posted"] = job_soup.find("span", {"class": lambda c: c and "posted-time-ago__text" in c}).text.strip()
                except:
                    job_post["time_posted"] = "Recently"
                
                try:
                    job_post["num_applicants"] = job_soup.find("span", {"class": lambda c: c and "num-applicants__caption" in c}).text.strip()
                except:
                    job_post["num_applicants"] = "0 applicants"
                
                try:
                    job_post["description"] = job_soup.find("div", {"class": lambda c: c and "show-more-less-html" in c}).text.strip()[:300] + "..."
                except:
                    job_post["description"] = "No description available"
                
                try:
                    job_post["url"] = f"https://www.linkedin.com/jobs/view/{job_id}"
                except:
                    job_post["url"] = ""
                
                job_post["source"] = "LinkedIn"
                
                # Extract any salary information
                try:
                    salary_element = job_soup.find("span", string=lambda s: s and ("$" in s or "salary" in s.lower()))
                    if salary_element:
                        job_post["salary"] = salary_element.text.strip()
                except:
                    job_post["salary"] = "Not specified"
                
                all_jobs.append(job_post)
                print(f"Processed job: {job_post['title']} at {job_post['company']}")
                
            except Exception as e:
                print(f"Error processing job {job_id}: {e}")
        
        # Print progress
        print(f"Scraped {len(all_jobs)} jobs so far")
    
    # Return the results as JSON
    return all_jobs

if __name__ == "__main__":
    # Get arguments if provided, otherwise use defaults
    title = sys.argv[1] if len(sys.argv) > 1 else "Software Engineer"
    location = sys.argv[2] if len(sys.argv) > 2 else "New York"
    num_jobs = int(sys.argv[3]) if len(sys.argv) > 3 else 25
    
    jobs = scrape_linkedin_jobs(title, location, num_jobs)
    
    # Print results as JSON for easy parsing
    print(json.dumps(jobs, indent=2))
    
    # Save results to a file
    with open("linkedin_jobs.json", "w") as f:
        json.dump(jobs, f, indent=2)
        
    print(f"Scraped {len(jobs)} jobs and saved to linkedin_jobs.json")