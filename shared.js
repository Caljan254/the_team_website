// shared.js - Common JavaScript functions for all pages
const API_URL = 'http://localhost:3000/api';

// ==================== GLOBAL VARIABLES ====================
let currentUser = null;
let isAdminLoggedIn = false;
let members = []; // Fetched from server

// ==================== API FUNCTIONS ====================
async function fetchMembers() {
    try {
        const response = await fetch(`${API_URL}/members`);
        const result = await response.json();
        if (result.data) {
            members = result.data;
            updateDashboardStats(); // Update UI after fetch
        }
    } catch (error) {
        console.error('Error fetching members:', error);
        showNotification('Failed to load members', 'error');
    }
}

async function fetchStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        const stats = await response.json();
        
        // Update dashboard elements if they exist
        if (document.getElementById('total-members')) {
            document.getElementById('total-members').textContent = stats.totalMembers;
            document.getElementById('paid-members').textContent = stats.paidMembers;
            document.getElementById('pending-members').textContent = stats.pendingMembers;
            
            // Payment box
            document.getElementById('total-members-payment').textContent = stats.totalMembers;
            document.getElementById('paid-count').textContent = stats.paidMembers;
            document.getElementById('pending-count').textContent = stats.pendingMembers;

            // Financials
            const totalCollected = stats.paidMembers * 600;
            const expectedTotal = stats.totalMembers * 600;
            document.getElementById('total-collected').textContent = totalCollected;
            document.getElementById('expected-total').textContent = expectedTotal;

            // Progress Bar
            const progressPercentage = stats.totalMembers > 0 ? Math.round((stats.paidMembers / stats.totalMembers) * 100) : 0;
            document.getElementById('progress-percentage').textContent = `${progressPercentage}%`;
            document.getElementById('progress-fill').style.width = `${progressPercentage}%`;
            document.getElementById('payment-progress-text').textContent = `${stats.paidMembers} of ${stats.totalMembers} members paid`;
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

async function initiatePayment(phone, memberId) {
    if (!phone || !memberId) {
        showNotification('Please provide phone number and member ID', 'warning');
        return;
    }

    try {
        showLoading(true);
        showNotification('Initiating STK Push...', 'info');
        
        const response = await fetch(`${API_URL}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phone,
                amount: 600,
                memberId: memberId
            })
        });

        const result = await response.json();
        showLoading(false);

        if (result.ResponseCode === "0") {
            showNotification('Check your phone to enter PIN', 'success');
            
            // Polling for update (Simulation)
            setTimeout(() => {
                showNotification('Payment Confirmed!', 'success');
                fetchStats(); // Refresh stats
            }, 6000);
        } else {
            showNotification('Payment failed to initiate', 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Payment Error:', error);
        showNotification('Connection Error', 'error');
    }
}

// ==================== UI FUNCTIONS ====================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'sync-notification';
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.padding = '15px 25px';
    notification.style.background = type === 'success' ? '#2ecc71' : (type === 'error' ? '#e74c3c' : '#3498db');
    notification.style.color = 'white';
    notification.style.borderRadius = '8px';
    notification.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
    notification.style.zIndex = '10000';
    notification.style.display = 'flex';
    notification.style.alignItems = 'center';
    notification.style.gap = '10px';
    notification.style.animation = 'slideIn 0.5s forwards';

    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';

    notification.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 4000);
}

function showLoading(show) {
    if (show) {
        document.body.style.cursor = 'wait';
    } else {
        document.body.style.cursor = 'default';
    }
}

function checkAdminSession() {
    const admin = localStorage.getItem('adminLoggedIn');
    if (admin === 'true') {
        isAdminLoggedIn = true;
        currentUser = { name: localStorage.getItem('adminName') || 'Admin' };
    }
}

function updateAuthUI() {
    // Updates UI based on auth state
    // Currently purely preventing errors as we transitioned layout
    const authContainer = document.getElementById('authContainer');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const loginBtn = document.getElementById('loginButtonHeader');
    const signupBtn = document.getElementById('signupButtonHeader');
    const logoutBtn = document.getElementById('logoutButton');

    if (currentUser) {
        if (usernameDisplay) usernameDisplay.textContent = currentUser.name;
        if (loginBtn) loginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        if (logoutBtn) {
            logoutBtn.style.display = 'inline-block';
            logoutBtn.onclick = logout;
        }
        if (authContainer) authContainer.style.display = 'flex'; 
        // Note: authContainer might be hidden by CSS on mobile or globally in recent updates
    } else {
        if (authContainer) authContainer.style.display = 'none'; // Or block depending on design, strictly following user request to hide welcome
    }
}

function logout() {
    localStorage.removeItem('adminLoggedIn');
    localStorage.removeItem('adminName');
    window.location.reload();
}

function adminLogin(username, password) {
    // Simple mock admin login
    localStorage.setItem('adminLoggedIn', 'true');
    localStorage.setItem('adminName', username);
    window.location.href = 'index.html';
}

// ==================== INITIALIZATION// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    checkAdminSession();
    updateAuthUI();
    
    // Initial Load
    fetchMembers();
    fetchStats();
    
    // Auto refresh stats every 30 seconds
    setInterval(fetchStats, 30000);

    // Hamburger Menu Logic
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mainNav = document.getElementById('mainNav');

    if (hamburgerBtn && mainNav) {
        hamburgerBtn.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            
            // Toggle icon
            const icon = hamburgerBtn.querySelector('i');
            if (mainNav.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }

    // Payment Button Logic
    const payBtn = document.getElementById('user-payment-btn');
    if (payBtn) {
        payBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Ask for phone number (Mock for now, would likely come from logged in user)
            const phone = prompt("Enter your M-Pesa Phone Number:", "254");
            // Assuming current user ID is 1 (Mark) for demo if not logged in
            const memberId = currentUser ? currentUser.id : 1; 
            
            if (phone) {
                initiatePayment(phone, memberId);
            }
        });
    }
});
