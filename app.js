/**
 * OnPoint Pros Prospecting Tool
 * Frontend JavaScript
 */

// ==================== CONFIG ====================
const CONFIG = {
    API_BASE: 'https://handyman-kpi-fastapi-backend.fly.dev',
    // Simple client-side auth (not secure, just for personal use)
    VALID_CREDS: {
        username: 'thuvo',
        passwordHash: '116bfe0b8eb0c9192ac020ed04c1d670c498a3849c160d733e44c9a6e394b7d8' // SHA-256 of password
    }
};

// ==================== STATE ====================
let state = {
    isLoggedIn: false,
    authToken: null,
    selectedCities: [],
    companies: [],
    fetchedPlaceIds: new Set(),
    stats: {
        companies: 0,
        contacts: 0,
        emails: 0,
        phones: 0
    },
    isSearching: false,
    isEnriching: false
};

// ==================== UTILS ====================
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function showError(message) {
    alert(message);
}

function updateStats() {
    document.getElementById('statCompanies').textContent = state.stats.companies;
    document.getElementById('statContacts').textContent = state.stats.contacts;
    document.getElementById('statEmails').textContent = state.stats.emails;
    document.getElementById('statPhones').textContent = state.stats.phones;
}

function setProgress(percent, text) {
    const progressDiv = document.getElementById('searchProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    if (percent === null) {
        progressDiv.classList.remove('active');
    } else {
        progressDiv.classList.add('active');
        progressBar.style.width = `${percent}%`;
        progressText.textContent = text || 'Processing...';
    }
}

// ==================== API CALLS ====================
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (state.authToken) {
        headers['Authorization'] = `Bearer ${state.authToken}`;
    }
    
    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, options);
    
    if (response.status === 401) {
        logout();
        throw new Error('Session expired');
    }
    
    return response.json();
}

async function login(username, password) {
    // First do client-side check
    const passwordHash = await sha256(password);
    if (username !== CONFIG.VALID_CREDS.username) {
        throw new Error('Invalid credentials');
    }
    
    // Now get real API token - send as JSON
    const response = await fetch(`${CONFIG.API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'you@onpointpros.com',
            password: 'pass123'
        })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.token) {
        throw new Error(data.detail || 'Login failed');
    }
    
    return data.token;
}

async function fetchCities() {
    const result = await apiCall('/prospecting/cities');
    if (result.ok) {
        return result.cities;
    }
    return [];
}

async function searchCompanies(cities, companyType, minReviews, maxResults, excludePlaceIds) {
    return await apiCall('/prospecting/search-companies', 'POST', {
        cities,
        companyType,
        minReviews,
        maxResults,
        excludePlaceIds: Array.from(excludePlaceIds)
    });
}

async function enrichCompany(company) {
    return await apiCall('/prospecting/enrich-company', 'POST', {
        placeId: company.placeId,
        companyName: company.name,
        website: company.website,
        companyType: document.getElementById('companyType').value
    });
}

async function getPlaceDetails(placeId) {
    return await apiCall(`/prospecting/place-details/${placeId}`);
}

async function fetchProspectingStats() {
    return await apiCall('/prospecting/prospecting-stats');
}

async function fetchSavedCompanies(companyType = null, enriched = null, limit = 100, skip = 0) {
    let url = `/prospecting/saved-companies?limit=${limit}&skip=${skip}`;
    if (companyType) url += `&companyType=${encodeURIComponent(companyType)}`;
    if (enriched !== null) url += `&enriched=${enriched}`;
    return await apiCall(url);
}

async function updateDbStats() {
    try {
        const result = await fetchProspectingStats();
        if (result.ok) {
            document.getElementById('dbTotalCompanies').textContent = result.totalCompanies || 0;
            document.getElementById('dbEnrichedCompanies').textContent = result.enrichedCompanies || 0;
        }
    } catch (e) {
        console.error('Failed to fetch stats:', e);
    }
}

// ==================== UI FUNCTIONS ====================
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('d-none');
    document.getElementById('appScreen').classList.add('d-none');
}

function showAppScreen() {
    document.getElementById('loginScreen').classList.add('d-none');
    document.getElementById('appScreen').classList.remove('d-none');
    document.getElementById('userDisplay').textContent = CONFIG.VALID_CREDS.username;
}

function logout() {
    state.isLoggedIn = false;
    state.authToken = null;
    localStorage.removeItem('prospecting_token');
    showLoginScreen();
}

function addCityTag(city) {
    if (state.selectedCities.includes(city.name)) return;
    
    state.selectedCities.push(city.name);
    
    const container = document.getElementById('selectedCities');
    const tag = document.createElement('span');
    tag.className = 'city-tag';
    tag.dataset.city = city.name;
    tag.innerHTML = `
        ${city.displayName}
        <span class="remove" onclick="removeCity('${city.name}')">&times;</span>
    `;
    container.appendChild(tag);
}

function removeCity(cityName) {
    state.selectedCities = state.selectedCities.filter(c => c !== cityName);
    const tag = document.querySelector(`.city-tag[data-city="${cityName}"]`);
    if (tag) tag.remove();
}

function renderCompanyRow(company, index) {
    const statusClass = company.enriched 
        ? (company.contacts?.length ? 'enriched' : 'no-contact')
        : '';
    
    const statusBadge = company.enriched
        ? (company.contacts?.length 
            ? '<span class="status-badge status-enriched">Enriched</span>'
            : '<span class="status-badge status-no-contact">No Contact</span>')
        : '<span class="status-badge status-pending">Pending</span>';
    
    // Get primary contact
    const contact = company.contacts?.[0];
    const contactName = contact?.name || '-';
    const contactTitle = contact?.title ? `<br><small class="text-muted">${contact.title}</small>` : '';
    
    // Get email/phone
    const email = company.contacts?.find(c => c.email)?.email;
    const phone = company.contacts?.find(c => c.phone)?.phone || company.phone;
    
    const emailHtml = email ? `<a href="mailto:${email}" class="email">${email}</a>` : '';
    const phoneHtml = phone ? `<br><span class="phone">${phone}</span>` : '';
    
    // Source badge
    const source = contact?.source;
    const sourceBadge = source 
        ? `<span class="source-badge source-${source === 'apollo' ? 'apollo' : source === 'website_scrape' ? 'scrape' : 'google'}">${source}</span>`
        : '';
    
    // Employee count
    const employees = company.employeeCount 
        ? `<span class="employee-badge">${company.employeeCount}</span>`
        : '-';
    
    return `
        <tr class="company-row ${statusClass}" data-index="${index}">
            <td><input type="checkbox" class="form-check-input row-select" data-index="${index}"></td>
            <td>
                <strong>${company.name}</strong>
                ${company.website ? `<br><a href="${company.website}" target="_blank" class="small text-muted">${company.domain || company.website}</a>` : ''}
            </td>
            <td><small>${company.address || '-'}</small></td>
            <td>
                ${company.rating ? `<i class="bi bi-star-fill text-warning"></i> ${company.rating}` : '-'}
                <br><small class="text-muted">${company.reviewCount || 0} reviews</small>
            </td>
            <td>${employees}</td>
            <td>
                ${contactName}${contactTitle}
                ${sourceBadge}
            </td>
            <td class="contact-info">
                ${emailHtml}${phoneHtml}
            </td>
            <td>${statusBadge}</td>
            <td>
                ${!company.enriched ? `
                    <button class="btn btn-sm btn-outline-primary enrich-btn" data-index="${index}">
                        <i class="bi bi-magic"></i>
                    </button>
                ` : `
                    <button class="btn btn-sm btn-outline-secondary" disabled>
                        <i class="bi bi-check"></i>
                    </button>
                `}
            </td>
        </tr>
    `;
}

function renderResults() {
    const tbody = document.getElementById('resultsBody');
    
    if (state.companies.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-5">
                    <i class="bi bi-search" style="font-size: 3rem; opacity: 0.3;"></i>
                    <p class="mt-3">Select cities and company type, then click Search</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = state.companies.map((c, i) => renderCompanyRow(c, i)).join('');
    document.getElementById('resultCount').textContent = state.companies.length;
    
    // Show enrich all button if there are pending companies
    const pendingCount = state.companies.filter(c => !c.enriched).length;
    const enrichAllBtn = document.getElementById('enrichAllBtn');
    if (pendingCount > 0) {
        enrichAllBtn.classList.remove('d-none');
        enrichAllBtn.innerHTML = `<i class="bi bi-magic me-1"></i>Enrich All (${pendingCount})`;
    } else {
        enrichAllBtn.classList.add('d-none');
    }
    
    // Show load more if we hit the limit
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (state.companies.length >= parseInt(document.getElementById('maxResults').value)) {
        loadMoreBtn.classList.remove('d-none');
    }
    
    // Attach enrich button handlers
    document.querySelectorAll('.enrich-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(btn.dataset.index);
            await enrichSingleCompany(index);
        });
    });
}

async function enrichSingleCompany(index) {
    const company = state.companies[index];
    if (company.enriched) return;
    
    const btn = document.querySelector(`.enrich-btn[data-index="${index}"]`);
    if (btn) {
        btn.innerHTML = '<span class="loading-spinner"></span>';
        btn.disabled = true;
    }
    
    try {
        // First get place details if we don't have website
        if (!company.website) {
            const detailsResult = await getPlaceDetails(company.placeId);
            if (detailsResult.ok && detailsResult.details) {
                company.website = detailsResult.details.website;
                company.domain = detailsResult.details.domain;
                company.phone = detailsResult.details.phone;
                company.address = detailsResult.details.address;
            }
        }
        
        // Now enrich with Apollo/scraping
        const result = await enrichCompany(company);
        
        if (result.ok) {
            company.enriched = true;
            company.contacts = result.contacts;
            company.employeeCount = result.employeeCount;
            company.domain = result.domain || company.domain;
            
            // Update stats
            state.stats.contacts += result.contacts?.length || 0;
            state.stats.emails += result.contacts?.filter(c => c.email).length || 0;
            state.stats.phones += result.contacts?.filter(c => c.phone).length || 0;
            updateStats();
        }
    } catch (err) {
        console.error('Enrich error:', err);
        company.enriched = true;
        company.contacts = [];
    }
    
    renderResults();
}

async function enrichAllCompanies() {
    const pending = state.companies.filter(c => !c.enriched);
    if (pending.length === 0) return;
    
    state.isEnriching = true;
    document.getElementById('enrichAllBtn').disabled = true;
    
    for (let i = 0; i < state.companies.length; i++) {
        if (state.companies[i].enriched) continue;
        
        setProgress(
            ((i + 1) / state.companies.length) * 100,
            `Enriching ${i + 1} of ${state.companies.length}...`
        );
        
        await enrichSingleCompany(i);
        
        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 500));
    }
    
    setProgress(null);
    state.isEnriching = false;
    document.getElementById('enrichAllBtn').disabled = false;
    renderResults();
}

function exportToCSV() {
    if (state.companies.length === 0) {
        showError('No data to export');
        return;
    }
    
    const headers = [
        'Company Name',
        'Address',
        'Rating',
        'Review Count',
        'Website',
        'Domain',
        'Employee Count',
        'Contact Name',
        'Contact Title',
        'Email',
        'Phone',
        'Contact Source',
        'Place ID'
    ];
    
    const rows = state.companies.map(company => {
        const contact = company.contacts?.[0];
        return [
            company.name || '',
            (company.address || '').replace(/,/g, ';'),
            company.rating || '',
            company.reviewCount || '',
            company.website || '',
            company.domain || '',
            company.employeeCount || '',
            contact?.name || '',
            contact?.title || '',
            company.contacts?.find(c => c.email)?.email || '',
            company.contacts?.find(c => c.phone)?.phone || company.phone || '',
            contact?.source || '',
            company.placeId || ''
        ];
    });
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const date = new Date().toISOString().split('T')[0];
    const companyType = document.getElementById('companyType').value || 'companies';
    link.setAttribute('href', url);
    link.setAttribute('download', `prospecting_${companyType}_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== EVENT HANDLERS ====================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const token = await login(username, password);
        state.authToken = token;
        state.isLoggedIn = true;
        localStorage.setItem('prospecting_token', token);
        
        errorDiv.classList.add('d-none');
        showAppScreen();
        
        // Load cities
        const cities = await fetchCities();
        const citySelect = document.getElementById('citySelect');
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city.name;
            option.textContent = `${city.displayName} (${city.zipCount} ZIPs)`;
            option.dataset.city = JSON.stringify(city);
            citySelect.appendChild(option);
        });
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.classList.remove('d-none');
    }
});

document.getElementById('citySelect').addEventListener('change', (e) => {
    const selected = e.target.selectedOptions[0];
    if (selected && selected.dataset.city) {
        const city = JSON.parse(selected.dataset.city);
        addCityTag(city);
        e.target.value = '';
    }
});

document.getElementById('searchBtn').addEventListener('click', async () => {
    const companyType = document.getElementById('companyType').value;
    const minReviews = parseInt(document.getElementById('minReviews').value) || 10;
    const maxResults = parseInt(document.getElementById('maxResults').value) || 100;
    
    if (!companyType) {
        showError('Please select a company type');
        return;
    }
    
    if (state.selectedCities.length === 0) {
        showError('Please select at least one city');
        return;
    }
    
    state.isSearching = true;
    state.companies = [];
    state.fetchedPlaceIds.clear();
    state.stats = { companies: 0, contacts: 0, emails: 0, phones: 0 };
    updateStats();
    
    document.getElementById('searchBtn').disabled = true;
    document.getElementById('loadMoreBtn').classList.add('d-none');
    setProgress(10, 'Searching companies...');
    
    try {
        const result = await searchCompanies(
            state.selectedCities,
            companyType,
            minReviews,
            maxResults,
            state.fetchedPlaceIds
        );
        
        if (result.ok) {
            state.companies = result.companies.map(c => ({
                ...c,
                enriched: false,
                contacts: []
            }));
            
            // Track fetched place IDs
            result.companies.forEach(c => state.fetchedPlaceIds.add(c.placeId));
            
            state.stats.companies = state.companies.length;
            updateStats();
            
            setProgress(100, `Found ${result.returnedCount} companies`);
            setTimeout(() => setProgress(null), 1500);
        } else {
            showError(result.error || 'Search failed');
            setProgress(null);
        }
    } catch (err) {
        console.error('Search error:', err);
        showError('Search failed: ' + err.message);
        setProgress(null);
    }
    
    state.isSearching = false;
    document.getElementById('searchBtn').disabled = false;
    renderResults();
});

document.getElementById('loadMoreBtn').addEventListener('click', async () => {
    const companyType = document.getElementById('companyType').value;
    const minReviews = parseInt(document.getElementById('minReviews').value) || 10;
    const maxResults = parseInt(document.getElementById('maxResults').value) || 100;
    
    document.getElementById('loadMoreBtn').disabled = true;
    setProgress(10, 'Loading more...');
    
    try {
        const result = await searchCompanies(
            state.selectedCities,
            companyType,
            minReviews,
            maxResults,
            state.fetchedPlaceIds
        );
        
        if (result.ok && result.companies.length > 0) {
            const newCompanies = result.companies.map(c => ({
                ...c,
                enriched: false,
                contacts: []
            }));
            
            state.companies = [...state.companies, ...newCompanies];
            result.companies.forEach(c => state.fetchedPlaceIds.add(c.placeId));
            
            state.stats.companies = state.companies.length;
            updateStats();
            
            setProgress(100, `Loaded ${result.returnedCount} more`);
            setTimeout(() => setProgress(null), 1500);
        } else {
            setProgress(100, 'No more results');
            setTimeout(() => setProgress(null), 1500);
            document.getElementById('loadMoreBtn').classList.add('d-none');
        }
    } catch (err) {
        console.error('Load more error:', err);
        showError('Failed to load more');
        setProgress(null);
    }
    
    document.getElementById('loadMoreBtn').disabled = false;
    renderResults();
});

document.getElementById('enrichAllBtn').addEventListener('click', enrichAllCompanies);
document.getElementById('exportBtn').addEventListener('click', exportToCSV);
document.getElementById('logoutBtn').addEventListener('click', logout);

document.getElementById('selectAll').addEventListener('change', (e) => {
    document.querySelectorAll('.row-select').forEach(cb => {
        cb.checked = e.target.checked;
    });
});

// Load saved companies button
document.getElementById('loadSavedBtn').addEventListener('click', async () => {
    const companyType = document.getElementById('companyType').value;
    
    try {
        setProgress(50, 'Loading saved companies...');
        const result = await fetchSavedCompanies(companyType, null, 200);
        
        if (result.ok && result.companies) {
            // Convert to display format
            state.companies = result.companies.map(c => ({
                placeId: c.placeId,
                name: c.companyName,
                address: c.address,
                rating: c.rating,
                reviewCount: c.reviewCount,
                website: c.website,
                phone: c.phone,
                enriched: c.enriched || false,
                contacts: c.contacts || [],
                employeeCount: c.employeeCount,
                domain: c.domain,
                fromDatabase: true,
            }));
            
            // Add to fetched set
            result.companies.forEach(c => state.fetchedPlaceIds.add(c.placeId));
            
            state.stats.companies = state.companies.length;
            updateStats();
            renderResultsTable();
            
            document.getElementById('enrichAllBtn').classList.toggle('d-none', state.companies.length === 0);
            document.getElementById('exportBtn').classList.toggle('d-none', state.companies.length === 0);
            
            alert(`Loaded ${state.companies.length} saved companies`);
        }
    } catch (err) {
        showError('Failed to load saved companies: ' + err.message);
    } finally {
        setProgress(null);
    }
});

// Refresh stats button
document.getElementById('refreshStatsBtn').addEventListener('click', updateDbStats);

// ==================== INIT ====================
(async function init() {
    // Check for saved token
    const savedToken = localStorage.getItem('prospecting_token');
    if (savedToken) {
        state.authToken = savedToken;
        state.isLoggedIn = true;
        showAppScreen();
        
        // Load cities and stats
        try {
            const cities = await fetchCities();
            const citySelect = document.getElementById('citySelect');
            cities.forEach(city => {
                const option = document.createElement('option');
                option.value = city.name;
                option.textContent = `${city.displayName} (${city.zipCount} ZIPs)`;
                option.dataset.city = JSON.stringify(city);
                citySelect.appendChild(option);
            });
            
            // Load database stats
            await updateDbStats();
        } catch (err) {
            console.error('Failed to load cities:', err);
            logout();
        }
    } else {
        showLoginScreen();
    }
})();
