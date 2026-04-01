# indeedScraper.py
import json
import requests
from bs4 import BeautifulSoup
import time
import random
import sys

def scrape_indeed_jobs(title, location, num_jobs=25):
    """
    Scrape Indeed jobs for a specific title and location
    """
    print(f"Scraping Indeed jobs for {title} in {location}")
    
    # Empty list to store all jobs
    all_jobs = []
    
    # Set up headers to look more like a browser
    headers = {
        "User-Agent": f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{random.randint(100, 120)}.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Referer": "https://www.indeed.com/"
    }
    
    # Format the query parameters
    formatted_title = title.replace(' ', '+')
    formatted_location = location.replace(' ', '+')
    
    # Start with page 0
    page = 0
    
    while len(all_jobs) < num_jobs:
        # Calculate the start parameter (10 jobs per page)
        start = page * 10
        
        # Construct the URL
        url = f"https://www.indeed.com/jobs?q={formatted_title}&l={formatted_location}&start={start}"
        print(f"Requesting page {page+1}: {url}")
        
        # Add a delay to avoid rate limiting
        time.sleep(random.uniform(2, 5))
        
        try:
            response = requests.get(url, headers=headers)
            
            if response.status_code == 429:
                print("Rate limited. Waiting longer before retrying...")
                time.sleep(60)  # Wait a full minute before trying again
                continue
                
            if response.status_code != 200:
                print(f"Failed to fetch jobs: Status code {response.status_code}")
                break
                
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Find job cards with updated selectors
            job_cards = soup.select("div.job_seen_beacon")
            
            if not job_cards:
                job_cards = soup.select("div.jobsearch-ResultsList > div.cardOutline")
            
            if not job_cards:
                print("No job cards found on this page. Site structure may have changed.")
                break
                
            print(f"Found {len(job_cards)} jobs on page {page+1}")
            
            if len(job_cards) == 0:
                break  # No more results
                
            # Process each job card
            for i, card in enumerate(job_cards):
                try:
                    # Try to find elements with various possible selectors
                    
                    # Job Title
                    title_element = (
                        card.select_one("h2.jobTitle span") or
                        card.select_one("h2.jobTitle") or
                        card.select_one("h2 span")
                    )
                    job_title = title_element.text.strip() if title_element else "Unknown Title"
                    
                    # Company
                    company_element = (
                        card.select_one("span.companyName") or
                        card.select_one("div.company_location span.companyName") or
                        card.select_one("div.company span")
                    )
                    company = company_element.text.strip() if company_element else "Unknown Company"
                    
                    # Location
                    location_element = (
                        card.select_one("div.companyLocation") or
                        card.select_one("div.company_location .companyLocation") or
                        card.select_one("div.location")
                    )
                    job_location = location_element.text.strip() if location_element else location
                    
                    # URL
                    link_element = card.select_one("h2.jobTitle a") or card.select_one("h2 a")
                    relative_url = link_element.get("href") if link_element else None
                    job_url = f"https://www.indeed.com{relative_url}" if relative_url else "#"
                    
                    # Job ID
                    job_id = relative_url.split("?")[0].split("_")[-1] if relative_url and "_" in relative_url else f"indeed-{int(time.time())}-{i}"
                    
                    # Description
                    summary_element = (
                        card.select_one("div.job-snippet") or
                        card.select_one("div.summary") or
                        card.select_one("td.resultContent div[class*='snippet']")
                    )
                    description = summary_element.text.strip() if summary_element else "No description available"
                    
                    # Salary
                    salary_element = (
                        card.select_one("div.salary-snippet-container") or
                        card.select_one("div.salarySnippet") or
                        card.select_one("span.salaryText")
                    )
                    salary = salary_element.text.strip() if salary_element else "Salary not specified"
                    
                    # Date posted
                    date_element = (
                        card.select_one("span.date") or
                        card.select_one("div.result-footer span.date") or
                        card.select_one("table.jobCardShelfContainer div.result-footer span.date")
                    )
                    date_posted = date_element.text.strip() if date_element else "Recently"
                    
                    job_data = {
                        "id": f"indeed-{job_id}",
                        "title": job_title,
                        "company": company,
                        "location": job_location,
                        "description": description[:300] + "..." if len(description) > 300 else description,
                        "salary": salary,
                        "url": job_url,
                        "time_posted": date_posted,
                        "source": "Indeed"
                    }
                    
                    all_jobs.append(job_data)
                    print(f"Processed job: {job_title} at {company}")
                    
                    # Break if we've reached our target number of jobs
                    if len(all_jobs) >= num_jobs:
                        break
                        
                except Exception as e:
                    print(f"Error processing job card: {e}")
            
            # Move to the next page
            page += 1
            
        except Exception as e:
            print(f"Error requesting page: {e}")
            break
    
    print(f"Total jobs scraped: {len(all_jobs)}")
    
    # Save results to a file
    with open("indeed_jobs.json", "w") as f:
        json.dump(all_jobs, f, indent=2)
        
    print(f"Scraped {len(all_jobs)} jobs and saved to indeed_jobs.json")
    
    return all_jobs

if __name__ == "__main__":
    # Get arguments if provided, otherwise use defaults
    title = sys.argv[1] if len(sys.argv) > 1 else "Software Engineer"
    location = sys.argv[2] if len(sys.argv) > 2 else "New York"
    num_jobs = int(sys.argv[3]) if len(sys.argv) > 3 else 25
    
    jobs = scrape_indeed_jobs(title, location, num_jobs)
    
    # Print results as JSON
    print(json.dumps(jobs))