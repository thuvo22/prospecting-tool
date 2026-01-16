/**
 * OnPoint Pros Prospecting Tool
 * Frontend JavaScript with Step Tracking & Dashboard
 */

// ==================== CONFIG ====================
const CONFIG = {
    API_BASE: 'https://handyman-kpi-fastapi-backend.fly.dev',
    VALID_CREDS: { username: 'thuvo', passwordHash: '116bfe0b8eb0c9192ac020ed04c1d670c498a3849c160d733e44c9a6e394b7d8' }
};

// ==================== STATE ====================
let state = {
    isLoggedIn: false,
    authToken: null,
    selectedCities: [],
    companies: [],
    dashboardCompanies: [],
    fetchedPlaceIds: new Set(),
    stats: { companies: 0, contacts: 0, emails: 0, phones: 0 },
    isSearching: false,
    isEnriching: false,
    enrichStats: { apollo: 0, scraper: 0, hunter: 0 }
};

// ==================== UTILS ====================
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showError(message) { alert(message); }

function updateStats() {
    document.getElementById('statCompanies').textContent = state.stats.companies;
    document.getElementById('statContacts').textContent = state.stats.contacts;
    document.getElementById('statEmails').textContent = state.stats.emails;
    document.getElementById('statPhones').textContent = state.stats.phones;
}

// ==================== STEP PROGRESS ====================
function showStepProgress(title) {
    document.getElementById('stepProgress').classList.add('active');
    document.getElementById('stepTitle').textContent = title;
    document.getElementById('stepOverall').textContent = '';
    document.getElementById('stepProgressBar').style.width = '0%';
    // Reset all steps
    ['places', 'apollo', 'scraper', 'hunter'].forEach(step => {
        const el = document.querySelector(`[data-step="${step}"]`);
        el.className = 'step-item step-pending';
        document.getElementById(`step${step.charAt(0).toUpperCase() + step.slice(1)}Detail`).textContent = 'Waiting...';
    });
}

function updateStep(step, status, detail) {
    const el = document.querySelector(`[data-step="${step}"]`);
    el.className = `step-item step-${status}`;
    const detailEl = document.getElementById(`step${step.charAt(0).toUpperCase() + step.slice(1)}Detail`);
    detailEl.textContent = detail;
}

function setStepProgress(percent, overall) {
    document.getElementById('stepProgressBar').style.width = `${percent}%`;
    if (overall) document.getElementById('stepOverall').textContent = overall;
}

function hideStepProgress() {
    setTimeout(() => document.getElementById('stepProgress').classList.remove('active'), 2000);
}

// ==================== API CALLS ====================
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, options);
    if (response.status === 401) { logout(); throw new Error('Session expired'); }
    return response.json();
}

async function login(username, password) {
    if (username !== CONFIG.VALID_CREDS.username) throw new Error('Invalid credentials');
    const response = await fetch(`${CONFIG.API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'you@onpointpros.com', password: 'pass123' })
    });
    const data = await response.json();
    if (!response.ok || !data.token) throw new Error(data.detail || 'Login failed');
    return data.token;
}

async function fetchCities() {
    const result = await apiCall('/prospecting/cities');
    return result.ok ? result.cities : [];
}

async function searchCompanies(cities, companyType, minReviews, maxReviews, maxResults, excludePlaceIds) {
    const payload = { cities, companyType, minReviews, maxResults, excludePlaceIds: Array.from(excludePlaceIds) };
    if (maxReviews) payload.maxReviews = maxReviews;
    return await apiCall('/prospecting/search-companies', 'POST', payload);
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
            document.getElementById('eligibleBadge').textContent = result.eligibleCompanies || 0;
        }
    } catch (e) { console.error('Failed to fetch stats:', e); }
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
    tag.innerHTML = `${city.displayName}<span class="remove" onclick="removeCity('${city.name}')">&times;</span>`;
    container.appendChild(tag);
}

function removeCity(cityName) {
    state.selectedCities = state.selectedCities.filter(c => c !== cityName);
    const tag = document.querySelector(`.city-tag[data-city="${cityName}"]`);
    if (tag) tag.remove();
}

function renderCompanyRow(company, index) {
    const statusClass = company.enriched ? (company.contacts?.length ? 'enriched' : 'no-contact') : '';
    const statusBadge = company.enriched
        ? (company.contacts?.length ? '<span class="status-badge status-enriched">Enriched</span>' : '<span class="status-badge status-no-contact">No Contact</span>')
        : '<span class="status-badge status-pending">Pending</span>';
    
    const contact = company.contacts?.[0];
    const contactName = contact?.name || '-';
    const contactTitle = contact?.title ? `<br><small class="text-muted">${contact.title}</small>` : '';
    
    // Get email with validation status
    const emailContact = company.contacts?.find(c => c.email);
    let emailHtml = '';
    if (emailContact) {
        const isValid = emailContact.emailValid !== false;
        const validBadge = emailContact.source === 'website_scrape' 
            ? `<span class="valid-badge ${isValid ? 'valid-yes' : 'valid-no'}">${isValid ? '✓' : '✗'}</span>` 
            : '';
        emailHtml = isValid 
            ? `<a href="mailto:${emailContact.email}" class="email">${emailContact.email}</a>${validBadge}`
            : `<span class="invalid">${emailContact.email}</span>${validBadge}`;
    }
    
    const phone = company.contacts?.find(c => c.phone)?.phone || company.phone;
    const phoneHtml = phone ? `<br><span class="phone">${phone}</span>` : '';
    
    const source = contact?.source;
    const sourceBadge = source ? `<span class="source-badge source-${source === 'apollo' ? 'apollo' : source === 'website_scrape' ? 'scrape' : 'google'}">${source}</span>` : '';
    const employees = company.employeeCount ? `<span class="employee-badge">${company.employeeCount}</span>` : '-';
    
    return `
        <tr class="company-row ${statusClass}" data-index="${index}">
            <td><input type="checkbox" class="form-check-input row-select" data-index="${index}"></td>
            <td><strong>${company.name}</strong>${company.website ? `<br><a href="${company.website}" target="_blank" class="small text-muted">${company.domain || company.website}</a>` : ''}</td>
            <td><small>${company.address || '-'}</small></td>
            <td>${company.rating ? `<i class="bi bi-star-fill text-warning"></i> ${company.rating}` : '-'}<br><small class="text-muted">${company.reviewCount || 0} reviews</small></td>
            <td>${employees}</td>
            <td>${contactName}${contactTitle}${sourceBadge}</td>
            <td class="contact-info">${emailHtml}${phoneHtml}</td>
            <td>${statusBadge}</td>
            <td>${!company.enriched ? `<button class="btn btn-sm btn-outline-primary enrich-btn" data-index="${index}"><i class="bi bi-magic"></i></button>` : `<button class="btn btn-sm btn-outline-secondary" disabled><i class="bi bi-check"></i></button>`}</td>
        </tr>`;
}

function renderResults() {
    const tbody = document.getElementById('resultsBody');
    if (state.companies.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-5"><i class="bi bi-search" style="font-size: 3rem; opacity: 0.3;"></i><p class="mt-3">Select cities and company type, then click Search</p></td></tr>`;
        return;
    }
    tbody.innerHTML = state.companies.map((c, i) => renderCompanyRow(c, i)).join('');
    document.getElementById('resultCount').textContent = state.companies.length;
    
    const pendingCount = state.companies.filter(c => !c.enriched).length;
    const enrichAllBtn = document.getElementById('enrichAllBtn');
    if (pendingCount > 0) {
        enrichAllBtn.classList.remove('d-none');
        enrichAllBtn.innerHTML = `<i class="bi bi-magic me-1"></i>Enrich All (${pendingCount})`;
    } else {
        enrichAllBtn.classList.add('d-none');
    }
    
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (state.companies.length >= parseInt(document.getElementById('maxResults').value)) {
        loadMoreBtn.classList.remove('d-none');
    }
    
    document.querySelectorAll('.enrich-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await enrichSingleCompany(parseInt(btn.dataset.index));
        });
    });
}

async function enrichSingleCompany(index) {
    const company = state.companies[index];
    if (company.enriched) return { cached: true };
    
    const btn = document.querySelector(`.enrich-btn[data-index="${index}"]`);
    if (btn) { btn.innerHTML = '<span class="loading-spinner"></span>'; btn.disabled = true; }
    
    let wasCached = false;
    
    try {
        if (!company.website) {
            const detailsResult = await getPlaceDetails(company.placeId);
            if (detailsResult.ok && detailsResult.details) {
                company.website = detailsResult.details.website;
                company.domain = detailsResult.details.domain;
                company.phone = detailsResult.details.phone;
                company.address = detailsResult.details.address;
            }
        }
        
        const result = await enrichCompany(company);
        
        if (result.ok) {
            company.enriched = true;
            company.contacts = result.contacts;
            company.employeeCount = result.employeeCount;
            company.domain = result.domain || company.domain;
            wasCached = result.cached || false;
            
            // Track source stats
            if (result.primarySource === 'apollo') state.enrichStats.apollo++;
            else if (result.primarySource === 'website_scrape') state.enrichStats.scraper++;
            
            state.stats.contacts += result.contacts?.length || 0;
            state.stats.emails += result.contacts?.filter(c => c.email && c.emailValid !== false).length || 0;
            state.stats.phones += result.contacts?.filter(c => c.phone).length || 0;
            updateStats();
        }
    } catch (err) {
        console.error('Enrich error:', err);
        company.enriched = true;
        company.contacts = [];
    }
    
    renderResults();
    return { cached: wasCached };
}

async function enrichAllCompanies() {
    const pending = state.companies.filter(c => !c.enriched);
    if (pending.length === 0) return;
    
    state.isEnriching = true;
    state.enrichStats = { apollo: 0, scraper: 0, hunter: 0 };
    document.getElementById('enrichAllBtn').disabled = true;
    
    showStepProgress(`Enriching ${pending.length} companies...`);
    updateStep('places', 'done', 'Complete');
    updateStep('apollo', 'active', 'Starting...');
    
    let cachedCount = 0, newCount = 0;
    
    for (let i = 0; i < state.companies.length; i++) {
        if (state.companies[i].enriched) continue;
        
        const progress = ((i + 1) / state.companies.length) * 100;
        setStepProgress(progress, `${i + 1} / ${state.companies.length}`);
        
        // Update step details
        updateStep('apollo', 'active', `${state.enrichStats.apollo} contacts`);
        updateStep('scraper', state.enrichStats.scraper > 0 ? 'done' : 'pending', `${state.enrichStats.scraper} scraped`);
        
        const result = await enrichSingleCompany(i);
        if (result?.cached) cachedCount++;
        else newCount++;
        
        if (!result?.cached) await new Promise(r => setTimeout(r, 500));
    }
    
    // Final step updates
    updateStep('apollo', 'done', `${state.enrichStats.apollo} contacts`);
    updateStep('scraper', state.enrichStats.scraper > 0 ? 'done' : 'pending', `${state.enrichStats.scraper} scraped`);
    updateStep('hunter', 'done', 'Validated');
    setStepProgress(100, `Done! ${cachedCount} cached, ${newCount} new`);
    
    hideStepProgress();
    state.isEnriching = false;
    document.getElementById('enrichAllBtn').disabled = false;
    await updateDbStats();
    renderResults();
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    const filterType = document.getElementById('filterType').value;
    const filterCity = document.getElementById('filterCity').value;
    const filterZip = document.getElementById('filterZip').value;
    const filterEligible = document.getElementById('filterEligible').value;
    const filterEnriched = document.getElementById('filterEnriched').value;
    
    try {
        // Determine enriched filter for API call
        const enrichedParam = filterEnriched === '' ? null : filterEnriched === 'true';
        const result = await fetchSavedCompanies(filterType, enrichedParam, 500);
        
        if (result.ok && result.companies) {
            let companies = result.companies;
            
            // Apply filters
            if (filterCity) {
                companies = companies.filter(c => c.searchedCities?.includes(filterCity.toLowerCase()));
            }
            if (filterZip) {
                companies = companies.filter(c => c.foundInZip === filterZip || c.address?.includes(filterZip));
            }
            
            // Filter by eligibility
            if (filterEligible === 'eligible') {
                companies = companies.filter(c => {
                    const hasValidEmail = c.contacts?.some(con => con.email && con.emailValid !== false);
                    const hasPhone = c.contacts?.some(con => con.phone) || c.phone;
                    return hasValidEmail || hasPhone;
                });
            } else if (filterEligible === 'email') {
                companies = companies.filter(c => c.contacts?.some(con => con.email && con.emailValid !== false));
            } else if (filterEligible === 'phone') {
                companies = companies.filter(c => c.contacts?.some(con => con.phone) || c.phone);
            }
            
            state.dashboardCompanies = companies;
            renderDashboard();
            
            // Update stats
            const allCompanies = result.companies;
            document.getElementById('dashTotalCompanies').textContent = allCompanies.length;
            
            const notEnrichedCount = allCompanies.filter(c => !c.enriched).length;
            const enrichBtn = document.getElementById('enrichDashboardBtn');
            if (notEnrichedCount > 0 && filterEnriched === 'false') {
                enrichBtn.classList.remove('d-none');
                enrichBtn.innerHTML = `<i class="bi bi-magic me-1"></i> Enrich All (${companies.length})`;
            } else {
                enrichBtn.classList.add('d-none');
            }
            
            document.getElementById('dashEligible').textContent = allCompanies.filter(c => {
                const hasValidEmail = c.contacts?.some(con => con.email && con.emailValid !== false);
                const hasPhone = c.contacts?.some(con => con.phone) || c.phone;
                return hasValidEmail || hasPhone;
            }).length;
            document.getElementById('dashWithEmail').textContent = allCompanies.filter(c => c.contacts?.some(con => con.email && con.emailValid !== false)).length;
            document.getElementById('dashWithPhone').textContent = allCompanies.filter(c => c.contacts?.some(con => con.phone) || c.phone).length;
        }
    } catch (err) {
        console.error('Dashboard load error:', err);
        showError('Failed to load dashboard: ' + err.message);
    }
}

function renderDashboard() {
    const tbody = document.getElementById('dashboardBody');
    
    if (state.dashboardCompanies.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-5"><i class="bi bi-inbox" style="font-size: 3rem; opacity: 0.3;"></i><p class="mt-3">No companies match the filters</p></td></tr>`;
        document.getElementById('dashResultCount').textContent = 0;
        return;
    }
    
    document.getElementById('dashResultCount').textContent = state.dashboardCompanies.length;
    
    tbody.innerHTML = state.dashboardCompanies.map((c, idx) => {
        const contact = c.contacts?.[0];
        const emailContact = c.contacts?.find(con => con.email && con.emailValid !== false);
        const phoneContact = c.contacts?.find(con => con.phone);
        const phone = phoneContact?.phone || c.phone;
        
        const city = c.searchedCities?.[0] || '';
        const zip = c.foundInZip || '';
        
        const source = c.primarySource || contact?.source || '';
        const sourceBadge = source ? `<span class="source-badge source-${source === 'apollo' ? 'apollo' : 'scrape'}">${source}</span>` : '';
        
        const enrichedBadge = c.enriched 
            ? '<span class="badge bg-success">Enriched</span>' 
            : '<span class="badge bg-secondary">Pending</span>';
        
        return `
            <tr data-place-id="${c.placeId}">
                <td><strong>${c.companyName}</strong>${c.website ? `<br><a href="${c.website}" target="_blank" class="small text-muted">${c.domain || 'website'}</a>` : ''}</td>
                <td><small>${c.companyType?.replace('_', ' ') || '-'}</small></td>
                <td><small>${city}<br>${zip}</small></td>
                <td>${c.rating ? `<i class="bi bi-star-fill text-warning"></i> ${c.rating}` : '-'}</td>
                <td>${contact?.name || '-'}${contact?.title ? `<br><small class="text-muted">${contact.title}</small>` : ''}</td>
                <td class="contact-info">${emailContact ? `<a href="mailto:${emailContact.email}" class="email">${emailContact.email}</a>` : '-'}</td>
                <td class="contact-info">${phone ? `<span class="phone">${phone}</span>` : '-'}</td>
                <td>${enrichedBadge} ${sourceBadge}</td>
            </tr>`;
    }).join('');
}

function exportDashboardCSV() {
    if (state.dashboardCompanies.length === 0) {
        showError('No data to export');
        return;
    }
    
    const headers = ['Company Name', 'Type', 'City', 'ZIP', 'Address', 'Rating', 'Reviews', 'Website', 'Contact Name', 'Contact Title', 'Email', 'Phone', 'Source'];
    
    const rows = state.dashboardCompanies.map(c => {
        const contact = c.contacts?.[0];
        const emailContact = c.contacts?.find(con => con.email && con.emailValid !== false);
        const phone = c.contacts?.find(con => con.phone)?.phone || c.phone || '';
        return [
            c.companyName || '',
            c.companyType || '',
            c.searchedCities?.[0] || '',
            c.foundInZip || '',
            (c.address || '').replace(/,/g, ';'),
            c.rating || '',
            c.reviewCount || '',
            c.website || '',
            contact?.name || '',
            contact?.title || '',
            emailContact?.email || '',
            phone,
            c.primarySource || ''
        ];
    });
    
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `eligible_leads_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportToCSV() {
    if (state.companies.length === 0) { showError('No data to export'); return; }
    const headers = ['Company Name', 'Address', 'Rating', 'Review Count', 'Website', 'Domain', 'Employee Count', 'Contact Name', 'Contact Title', 'Email', 'Phone', 'Contact Source', 'Place ID'];
    const rows = state.companies.map(company => {
        const contact = company.contacts?.[0];
        return [company.name || '', (company.address || '').replace(/,/g, ';'), company.rating || '', company.reviewCount || '', company.website || '', company.domain || '', company.employeeCount || '', contact?.name || '', contact?.title || '', company.contacts?.find(c => c.email)?.email || '', company.contacts?.find(c => c.phone)?.phone || company.phone || '', contact?.source || '', company.placeId || ''];
    });
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `prospecting_${document.getElementById('companyType').value || 'companies'}_${new Date().toISOString().split('T')[0]}.csv`);
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
        await initApp();
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.classList.remove('d-none');
    }
});

document.getElementById('citySelect').addEventListener('change', (e) => {
    const selected = e.target.selectedOptions[0];
    if (selected && selected.dataset.city) {
        addCityTag(JSON.parse(selected.dataset.city));
        e.target.value = '';
    }
});

document.getElementById('searchBtn').addEventListener('click', async () => {
    const companyType = document.getElementById('companyType').value;
    const minReviews = parseInt(document.getElementById('minReviews').value) || 10;
    const maxReviews = parseInt(document.getElementById('maxReviews').value) || null;
    const maxResults = parseInt(document.getElementById('maxResults').value) || 100;
    
    if (!companyType) { showError('Please select a company type'); return; }
    if (state.selectedCities.length === 0) { showError('Please select at least one city'); return; }
    
    state.isSearching = true;
    state.companies = [];
    state.fetchedPlaceIds.clear();
    state.stats = { companies: 0, contacts: 0, emails: 0, phones: 0 };
    updateStats();
    document.getElementById('searchBtn').disabled = true;
    document.getElementById('loadMoreBtn').classList.add('d-none');
    
    showStepProgress('Searching companies...');
    updateStep('places', 'active', 'Searching...');
    
    try {
        const result = await searchCompanies(state.selectedCities, companyType, minReviews, maxReviews, maxResults, state.fetchedPlaceIds);
        
        if (result.ok) {
            state.companies = result.companies.map(c => ({ ...c, enriched: false, contacts: [] }));
            result.companies.forEach(c => state.fetchedPlaceIds.add(c.placeId));
            state.stats.companies = state.companies.length;
            updateStats();
            
            updateStep('places', 'done', `${result.returnedCount} found`);
            setStepProgress(100, `${result.returnedCount} companies`);
            await updateDbStats();
        } else {
            showError(result.error || 'Search failed');
            updateStep('places', 'error', 'Failed');
        }
    } catch (err) {
        console.error('Search error:', err);
        showError('Search failed: ' + err.message);
        updateStep('places', 'error', err.message);
    }
    
    hideStepProgress();
    state.isSearching = false;
    document.getElementById('searchBtn').disabled = false;
    renderResults();
});

document.getElementById('loadMoreBtn').addEventListener('click', async () => {
    const companyType = document.getElementById('companyType').value;
    const minReviews = parseInt(document.getElementById('minReviews').value) || 10;
    const maxReviews = parseInt(document.getElementById('maxReviews').value) || null;
    const maxResults = parseInt(document.getElementById('maxResults').value) || 100;
    
    document.getElementById('loadMoreBtn').disabled = true;
    showStepProgress('Loading more...');
    updateStep('places', 'active', 'Searching...');
    
    try {
        const result = await searchCompanies(state.selectedCities, companyType, minReviews, maxReviews, maxResults, state.fetchedPlaceIds);
        if (result.ok && result.companies.length > 0) {
            const newCompanies = result.companies.map(c => ({ ...c, enriched: false, contacts: [] }));
            state.companies = [...state.companies, ...newCompanies];
            result.companies.forEach(c => state.fetchedPlaceIds.add(c.placeId));
            state.stats.companies = state.companies.length;
            updateStats();
            updateStep('places', 'done', `+${result.returnedCount} more`);
            await updateDbStats();
        } else {
            updateStep('places', 'done', 'No more results');
            document.getElementById('loadMoreBtn').classList.add('d-none');
        }
    } catch (err) {
        console.error('Load more error:', err);
        showError('Failed to load more');
    }
    
    hideStepProgress();
    document.getElementById('loadMoreBtn').disabled = false;
    renderResults();
});

document.getElementById('enrichAllBtn').addEventListener('click', enrichAllCompanies);
document.getElementById('exportBtn').addEventListener('click', exportToCSV);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('selectAll').addEventListener('change', (e) => {
    document.querySelectorAll('.row-select').forEach(cb => cb.checked = e.target.checked);
});
document.getElementById('refreshStatsBtn').addEventListener('click', updateDbStats);
document.getElementById('applyFiltersBtn').addEventListener('click', loadDashboard);
document.getElementById('exportDashboardBtn').addEventListener('click', exportDashboardCSV);
document.getElementById('enrichDashboardBtn').addEventListener('click', enrichDashboardCompanies);

// Stat card click handlers - use event delegation
document.getElementById('dashStatCards').addEventListener('click', (e) => {
    const card = e.target.closest('.stat-card');
    if (!card) return;
    
    const filter = card.dataset.filter;
    
    // Update active state
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    
    // Set the filter dropdown
    const filterEligible = document.getElementById('filterEligible');
    if (filter === 'all') {
        filterEligible.value = 'all';
    } else if (filter === 'eligible') {
        filterEligible.value = 'eligible';
    } else if (filter === 'email') {
        filterEligible.value = 'email';
    } else if (filter === 'phone') {
        filterEligible.value = 'phone';
    }
    
    // Load dashboard with filter
    loadDashboard();
});

async function enrichDashboardCompanies() {
    const pending = state.dashboardCompanies.filter(c => !c.enriched);
    if (pending.length === 0) return;
    
    const btn = document.getElementById('enrichDashboardBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enriching...';
    
    showStepProgress(`Enriching ${pending.length} companies...`);
    updateStep('places', 'done', 'From DB');
    updateStep('apollo', 'active', 'Starting...');
    
    let enriched = 0;
    for (const company of pending) {
        try {
            const result = await apiCall('/prospecting/enrich-company', 'POST', {
                placeId: company.placeId,
                companyName: company.companyName,
                website: company.website,
                companyType: company.companyType
            });
            
            if (result.ok) {
                company.enriched = true;
                company.contacts = result.contacts;
                company.primarySource = result.primarySource;
                enriched++;
            }
        } catch (err) {
            console.error('Enrich error:', err);
        }
        
        const progress = ((enriched) / pending.length) * 100;
        setStepProgress(progress, `${enriched} / ${pending.length}`);
        updateStep('apollo', 'active', `${enriched} done`);
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
    }
    
    updateStep('apollo', 'done', `${enriched} enriched`);
    updateStep('scraper', 'done', 'Complete');
    updateStep('hunter', 'done', 'Validated');
    setStepProgress(100, `Done! ${enriched} enriched`);
    
    hideStepProgress();
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-magic me-1"></i> Enrich All';
    
    await updateDbStats();
    await loadDashboard();
}

// Tab change handler
document.querySelectorAll('#mainTabs .nav-link').forEach(tab => {
    tab.addEventListener('shown.bs.tab', (e) => {
        if (e.target.dataset.bsTarget === '#dashboardTab') {
            loadDashboard();
        }
    });
});

// ==================== INIT ====================
async function initApp() {
    try {
        const cities = await fetchCities();
        const citySelect = document.getElementById('citySelect');
        const filterCitySelect = document.getElementById('filterCity');
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city.name;
            option.textContent = `${city.displayName} (${city.zipCount} ZIPs)`;
            option.dataset.city = JSON.stringify(city);
            citySelect.appendChild(option);
            
            // Also add to dashboard filter
            const filterOption = document.createElement('option');
            filterOption.value = city.name;
            filterOption.textContent = city.displayName;
            filterCitySelect.appendChild(filterOption);
        });
        await updateDbStats();
    } catch (err) {
        console.error('Failed to init:', err);
        logout();
    }
}

(async function init() {
    const savedToken = localStorage.getItem('prospecting_token');
    if (savedToken) {
        state.authToken = savedToken;
        state.isLoggedIn = true;
        showAppScreen();
        await initApp();
    } else {
        showLoginScreen();
    }
})();
