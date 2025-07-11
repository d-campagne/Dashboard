// Global variables to store CSV data
let emergencyData = [];
let clusteredData = { active: [], sedentary: [] };
let userDetailedData = {};
let currentPage = 'home';
let previousPage = 'home';

// Page navigation
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageId + '-page').classList.add('active');
    
    // Update navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Set active nav button
    const navBtns = document.querySelectorAll('.nav-btn');
    if (pageId === 'home') navBtns[0].classList.add('active');
    else if (pageId === 'emergency') navBtns[1].classList.add('active');
    else if (pageId === 'groups') navBtns[2].classList.add('active');
    
    previousPage = currentPage;
    currentPage = pageId;
}

function goBack() {
    showPage(previousPage);
}

// CSV file loading functions
function loadEmergencyCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    Papa.parse(file, {
        header: true,
        complete: function(results) {
            // Assuming the CSV has a column for user IDs (adjust column name as needed)
            emergencyData = results.data.filter(row => row.user_id || row.id || row.ID || Object.values(row)[0]).map(row => {
                return row.user_id || row.id || row.ID || Object.values(row)[0];
            });
            
            console.log('Emergency data loaded:', emergencyData);
            populateEmergencyTable();
        },
        error: function(error) {
            console.error('Error parsing emergency CSV:', error);
            alert('Error reading emergency CSV file');
        }
    });
}

function loadClusteredCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            clusteredData = { active: [], sedentary: [] };

            const headers = results.meta.fields;
            const userCol = headers.includes('user_id') ? 'user_id' :
                            headers.includes('User ID') ? 'User ID' :
                            headers.includes('Id') ? 'Id' :
                            headers.includes('ID') ? 'ID' :
                            headers.includes('id') ? 'id' : null;

            const groupCol = headers.includes('Group') ? 'Group' :
                             headers.includes('group') ? 'group' :
                             headers.includes('GROUP') ? 'GROUP' : null;

            if (!userCol || !groupCol) {
                console.error("Missing required columns in clustered_users.csv");
                alert("CSV must contain 'Id' and 'group' columns (or similar).");
                return;
            }

            if (!Array.isArray(results.data) || results.data.length === 0) {
                alert("Clustered CSV file is empty or incorrectly formatted.");
                return;
            }

            const processedClusterData = results.data.filter(row =>
                row[userCol]?.trim() && row[groupCol] !== undefined && row[groupCol] !== null
            );

            processedClusterData.forEach(row => {
                const userId = row[userCol]?.trim();
                const groupStr = row[groupCol]?.toString().toLowerCase();

                if (groupStr && userId) {
                    if (groupStr.includes('active') || groupStr === '1') {
                        clusteredData.active.push(userId);
                    } else if (groupStr.includes('sedentary') || groupStr === '0') {
                        clusteredData.sedentary.push(userId);
                    }
                }
            });

            console.log('Clustered data loaded:', clusteredData);
            populateGroupsTables();
        },
        error: function(error) {
            console.error('Error parsing clustered CSV:', error);
            alert('Error reading clustered users CSV file');
        }
    });
}

function loadUserDataIPYNB(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.ipynb')) {
        alert('Please select a valid .ipynb file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const notebookContent = JSON.parse(e.target.result);
            parseNotebookData(notebookContent);
        } catch (error) {
            console.error('Error parsing notebook file:', error);
            alert('Error reading notebook file. Please ensure it\'s a valid .ipynb file.');
        }
    };
    reader.readAsText(file);
}

function parseNotebookData(notebook) {
    userDetailedData = {};
    
    // Look for cells containing data or dataframes
    notebook.cells.forEach(cell => {
        if (cell.cell_type === 'code' && cell.outputs) {
            cell.outputs.forEach(output => {
                // Check for data in different output formats
                if (output.data) {
                    // Handle text/plain output
                    if (output.data['text/plain']) {
                        parseTextOutput(output.data['text/plain']);
                    }
                    
                    // Handle application/json output
                    if (output.data['application/json']) {
                        parseJSONOutput(output.data['application/json']);
                    }
                }
                
                // Handle execution results
                if (output.execution_count && output.data) {
                    if (output.data['text/plain']) {
                        parseTextOutput(output.data['text/plain']);
                    }
                }
            });
        }
        
        // Also check cell source for hardcoded data
        if (cell.source && Array.isArray(cell.source)) {
            const sourceText = cell.source.join('');
            parseSourceForData(sourceText);
        }
    });
    
    console.log('User detailed data loaded from notebook:', userDetailedData);
}

function parseTextOutput(textData) {
    const text = Array.isArray(textData) ? textData.join('') : textData;
    const lines = text.split('\n');

    lines.forEach(line => {
        const userIdMatch = line.match(/(\d{9})/); // 9-digit user ID
        if (!userIdMatch) return;

        const userId = userIdMatch[1];

        // Initialize if needed
        if (!userDetailedData[userId]) {
            userDetailedData[userId] = {
                activityData: { sedentary: 0, physical: 0 },
                hrvData: [],
                activityScoreData: []
            };
        }

        // Parse activity levels
        const sedentaryMatch = line.match(/sedentary[:\s]*(\d+\.?\d*)/i);
        const physicalMatch = line.match(/physical[:\s]*(\d+\.?\d*)/i);
        if (sedentaryMatch) userDetailedData[userId].activityData.sedentary = parseFloat(sedentaryMatch[1]);
        if (physicalMatch) userDetailedData[userId].activityData.physical = parseFloat(physicalMatch[1]);

        // Extract week (explicitly)
        const weekMatch = line.match(/week[:\s]*(\d+)/i);
        const weekNum = weekMatch ? parseInt(weekMatch[1]) : null;
        const weekLabel = weekNum ? `Week ${weekNum}` : null;

        // Parse HRV
        const hrvMatch = line.match(/hrv[:\s]*(\d+\.?\d*)/i);
        if (hrvMatch && weekLabel) {
            const hrvValue = parseFloat(hrvMatch[1]);
            const existingWeek = userDetailedData[userId].hrvData.find(entry => entry.week === weekLabel);
            if (!existingWeek) {
                userDetailedData[userId].hrvData.push({ week: weekLabel, hrv: hrvValue });
            }
        }

        // Parse activity score
        const scoreMatch = line.match(/activity_score[:\s]*(\d+\.?\d*)/i);
        if (scoreMatch && weekLabel) {
            const scoreValue = parseFloat(scoreMatch[1]);
            const existingWeek = userDetailedData[userId].activityScoreData.find(entry => entry.week === weekLabel);
            if (!existingWeek) {
                userDetailedData[userId].activityScoreData.push({ week: weekLabel, score: scoreValue });
            }
        }
    });

    // Optionally sort weekly data
    Object.values(userDetailedData).forEach(user => {
        user.hrvData.sort((a, b) => parseInt(a.week.split(' ')[1]) - parseInt(b.week.split(' ')[1]));
        user.activityScoreData.sort((a, b) => parseInt(a.week.split(' ')[1]) - parseInt(b.week.split(' ')[1]));
    });
}


function parseJSONOutput(jsonData) {
    // Handle structured JSON data
    if (Array.isArray(jsonData)) {
        jsonData.forEach(item => {
            if (item.user_id || item.id || item.ID) {
                const userId = item.user_id || item.id || item.ID;
                
                if (!userDetailedData[userId]) {
                    userDetailedData[userId] = {
                        activityData: { sedentary: 0, physical: 0 },
                        hrvData: [],
                        activityScoreData: []
                    };
                }
                
                // Extract data from JSON structure
                if (item.sedentary_percentage !== undefined) {
                    userDetailedData[userId].activityData.sedentary = item.sedentary_percentage;
                }
                if (item.physical_percentage !== undefined) {
                    userDetailedData[userId].activityData.physical = item.physical_percentage;
                }
                if (item.hrv !== undefined && item.week !== undefined) {
                    userDetailedData[userId].hrvData.push({
                        week: `Week ${item.week}`,
                        hrv: item.hrv
                    });
                }
                if (item.activity_score !== undefined && item.week !== undefined) {
                    userDetailedData[userId].activityScoreData.push({
                        week: `Week ${item.week}`,
                        score: item.activity_score
                    });
                }
            }
        });
    }
}

function parseSourceForData(sourceText) {
    // Look for hardcoded data in the source code
    const userIdMatches = sourceText.match(/\d{9}/g);
    if (userIdMatches) {
        userIdMatches.forEach(userId => {
            if (!userDetailedData[userId]) {
                userDetailedData[userId] = {
                    activityData: { sedentary: 0, physical: 0 },
                    hrvData: [],
                    activityScoreData: []
                };
            }
        });
    }
}

// Table population functions
function populateEmergencyTable() {
    const tbody = document.getElementById('emergency-tbody');
    tbody.innerHTML = '';
    
    emergencyData.forEach(userId => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 500;">${userId}</td>
            <td><button class="view-btn" onclick="showUserDetails('${userId}')">View Details</button></td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('emergency-count').textContent = `${emergencyData.length} users`;
}

function populateGroupsTables() {
    // Populate active users table
    const activeBody = document.getElementById('active-tbody');
    activeBody.innerHTML = '';
    
    clusteredData.active.forEach(userId => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 500;">${userId}</td>
            <td><button class="view-btn" onclick="showUserDetails('${userId}')">View Details</button></td>
        `;
        activeBody.appendChild(row);
    });
    
    // Populate sedentary users table
    const sedentaryBody = document.getElementById('sedentary-tbody');
    sedentaryBody.innerHTML = '';
    
    clusteredData.sedentary.forEach(userId => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 500;">${userId}</td>
            <td><button class="view-btn" onclick="showUserDetails('${userId}')">View Details</button></td>
        `;
        sedentaryBody.appendChild(row);
    });
}

// Search functionality
function filterEmergencyUsers() {
    const searchTerm = document.getElementById('emergency-search').value.toLowerCase();
    const rows = document.querySelectorAll('#emergency-tbody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const userId = row.cells[0].textContent.toLowerCase();
        if (userId.includes(searchTerm)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    document.getElementById('emergency-count').textContent = `${visibleCount} users`;
}

// User details page
function showUserDetails(userId) {
    document.getElementById('user-details-title').textContent = `User ${userId} Details`;
    
    // Show user details page
    showPage('user-details');
    
    // Generate or use real data for charts
    const userData = userDetailedData[userId] || generateMockUserData(userId);
    
    // Limit data to last 4 weeks
    const limitedHRVData = userData.hrvData.slice(-4); // Get last 4 entries
    const limitedActivityScoreData = userData.activityScoreData.slice(-4);
    
    // Create charts with limited data
    createActivityPieChart(userData.activityData);
    createHRVLineChart(limitedHRVData);
    createActivityBarChart(limitedActivityScoreData);
}

function generateMockUserData(userId) {
    // Generate mock data if real data is not available
    const isActive = Math.random() > 0.5;
    
    return {
        activityData: {
            sedentary: isActive ? 30 : 70,
            physical: isActive ? 70 : 30
        },
        hrvData: Array.from({ length: 12 }, (_, i) => ({
            week: `Week ${i + 1}`,
            hrv: Math.floor(Math.random() * 50) + (isActive ? 50 : 30)
        })),
        activityScoreData: Array.from({ length: 12 }, (_, i) => ({
            week: `Week ${i + 1}`,
            score: Math.floor(Math.random() * 40) + (isActive ? 60 : 20)
        }))
    };
}

// Chart creation functions
let activityChart, hrvChart, activityScoreChart;

function createActivityPieChart(data) {
    const ctx = document.getElementById('activity-pie-chart').getContext('2d');

    if (activityChart) {
        activityChart.destroy();
    }

    activityChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Sedentary', 'Physical'],
            datasets: [{
                data: [data.sedentary, data.physical],
                backgroundColor: ['#ef4444', '#22c55e'], // Red and Green
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'Activity Breakdown'
                }
            }
        }
    });
}

function createHRVLineChart(hrvData) {
    const ctx = document.getElementById('hrv-line-chart').getContext('2d');

    if (hrvChart) {
        hrvChart.destroy();
    }

    // Map week labels to 1-4 regardless of actual week numbers
    const labels = hrvData.map((entry, index) => `Week ${index + 1}`);

    hrvChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,  // Use the remapped labels
            datasets: [{
                label: 'HRV',
                data: hrvData.map(entry => entry.hrv),  // Keep original data values
                fill: false,
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f6',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true
                },
                title: {
                    display: true,
                    text: 'Heart Rate Variability (HRV) Over Time'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'HRV'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Week'
                    }
                }
            }
        }
    });
}

function createActivityBarChart(scoreData) {
    const ctx = document.getElementById('activity-bar-chart').getContext('2d');

    if (activityScoreChart) {
        activityScoreChart.destroy();
    }

    // Map week labels to 1-4 regardless of actual week numbers
    const labels = scoreData.map((entry, index) => `Week ${index + 1}`);

    activityScoreChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,  // Use the remapped labels
            datasets: [{
                label: 'Activity Score',
                data: scoreData.map(entry => entry.score),  // Keep original data values
                backgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true
                },
                title: {
                    display: true,
                    text: 'Weekly Activity Score'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Score'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Week'
                    }
                }
            }
        }
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Show home page by default
    showPage('home');
    
    // Add some sample data for demonstration
    // emergencyData = ['555395443', '877689301', '123456789', '987654321'];
    // clusteredData = {
    //     active: ['112233445', '223344556', '334455667', '445566778'],
    //     sedentary: ['555395443', '877689301', '987654321', '456789123']
    // };
    
    // Populate tables with sample data
    populateEmergencyTable();
    populateGroupsTables();
});
