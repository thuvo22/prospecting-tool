# OnPoint Pros Prospecting Tool

A web-based tool for discovering and enriching business contacts in the DFW area.

## Features

- **Multi-city search**: Select multiple DFW cities to search
- **Company type filtering**: Property Managers, Realtors, Plumbers, Electricians
- **Google Places integration**: Find businesses with ratings and reviews
- **Apollo enrichment**: Get contact names, titles, emails, phone numbers
- **Website scraping fallback**: Extract emails from company websites
- **CSV export**: Download results for use in CRM/outreach tools
- **Smart pagination**: Load more results without duplicates

## Setup

This is a static site designed for GitHub Pages deployment.

### Local Development

1. Serve the files with any static server:
   ```bash
   cd prospecting-tool
   python3 -m http.server 8080
   ```

2. Open http://localhost:8080

### GitHub Pages Deployment

1. Create a new repository on GitHub
2. Push this folder's contents to the repo
3. Go to Settings > Pages
4. Select "Deploy from a branch" and choose `main` / `root`
5. Your site will be available at `https://your-username.github.io/repo-name/`

## Backend

This tool requires the FastAPI backend deployed at:
- `https://handyman-kpi-fastapi-backend.fly.dev`

The backend provides:
- `/prospecting/cities` - List of searchable cities
- `/prospecting/company-types` - Available company types
- `/prospecting/search-companies` - Google Places search
- `/prospecting/enrich-company` - Apollo + website scraping
- `/prospecting/place-details/{place_id}` - Place details

## Authentication

Uses simple client-side authentication for personal use, with backend JWT tokens for API access.

## Usage

1. Login with your credentials
2. Select company type (e.g., Property Manager)
3. Add one or more cities from the dropdown
4. Click "Search Companies"
5. Click "Enrich All" to get contact details
6. Export to CSV when done

## Tech Stack

- HTML5 / CSS3 / JavaScript (vanilla)
- Bootstrap 5.3
- Bootstrap Icons
- Fetch API for HTTP requests
