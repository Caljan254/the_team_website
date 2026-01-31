// shared.js - Enhanced with Authentication & API Integration
const API_URL = 'http://localhost:3000/api';

// ==================== GLOBAL VARIABLES ====================
let currentUser = null;
let isAdminLoggedIn = false;
let members = [];
let payments = [];

// ==================== AUTHENTICATION FUNCTIONS ====================
async function checkAuthStatus() {
    try {
        // Check for token in localStorage first (this is what gets set after login)
        const token = localStorage.getItem('token') || getCookie('token');
        
        if (!token) {
            console.log('No token found, user not logged in');
            currentUser = null;
            isAdminLoggedIn = false;
            updateAuthUI();
            return null;
        }

        // Verify token with backend
        const response = await fetch(`${API_URL}/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            isAdminLoggedIn = currentUser?.role === 'admin';
            console.log('User authenticated:', currentUser?.email);
            updateAuthUI();
            return currentUser;
        } else {
            console.log('Token verification failed');
            clearAuth();
            return null;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        clearAuth();
        return null;
    }
}

function clearAuth() {
    localStorage.removeItem('token');
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    currentUser = null;
    isAdminLoggedIn = false;
    updateAuthUI();
}

async function loginUser(identifier, password) {
    try {
        showLoading(true, 'Logging in...');
        
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier, password }),
            credentials: 'include'
        });

        const data = await response.json();
        console.log('Login response:', data);

        if (response.ok) {
            // Store token in localStorage (IMPORTANT)
            if (data.token) {
                localStorage.setItem('token', data.token);
                console.log('Token saved to localStorage');
            }
            
            // Update current user IMMEDIATELY
            currentUser = data.user;
            isAdminLoggedIn = currentUser?.role === 'admin';
            
            showNotification('Login successful! Redirecting to dashboard...', 'success');
            
            // Update UI immediately
            updateAuthUI();
            
            // IMMEDIATE REDIRECT - No delay
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
            
            return data;
        } else {
            throw new Error(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Login failed. Please check your credentials.', 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

async function registerUser(userData) {
    try {
        showLoading(true, 'Creating your account...');
        
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
            credentials: 'include'
        });

        const data = await response.json();
        console.log('Registration response:', data);

        if (response.ok) {
            if (data.token) {
                localStorage.setItem('token', data.token);
                currentUser = data.user;
                isAdminLoggedIn = currentUser?.role === 'admin';
            }
            
            showNotification('Registration successful!', 'success');
            updateAuthUI();
            
            // Redirect to LOGIN page after registration (not dashboard)
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
            
            return data;
        } else {
            throw new Error(data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification(error.message || 'Registration failed. Please try again.', 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

async function logoutUser() {
    try {
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout API error:', error);
    }

    clearAuth();
    showNotification('Logged out successfully', 'success');
    
    // Redirect to login page
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1000);
}

// UPDATED: updateAuthUI function to show logout button
function updateAuthUI() {
    const authButtons = document.getElementById('authButtons');
    
    if (!authButtons) return;
    
    // Clear existing buttons
    authButtons.innerHTML = '';
    
    if (currentUser) {
        // User is logged in - show welcome text and red logout button
        authButtons.innerHTML = `
            <span class="welcome-text">Welcome, ${currentUser.name}</span>
            <button class="auth-btn" id="logoutBtn">
                Logout
            </button>
        `;
        
        // Add logout event listener
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logoutUser();
            });
        }
    } else {
        // User is not logged in
        // Check current page to decide which buttons to show
        const currentPage = window.location.pathname;
        
        if (currentPage.includes('login.html')) {
            // On login page, show only signup
            authButtons.innerHTML = `
                <a href="signup.html" class="auth-btn signup">Sign Up</a>
            `;
        } else if (currentPage.includes('signup.html')) {
            // On signup page, show only login
            authButtons.innerHTML = `
                <a href="login.html" class="auth-btn login">Login</a>
            `;
        } else {
            // On other pages, show both
            authButtons.innerHTML = `
                <a href="login.html" class="auth-btn login">Login</a>
                <a href="signup.html" class="auth-btn signup">Sign Up</a>
            `;
        }
    }
}

// ==================== UI FUNCTIONS ====================
function showNotification(message, type = 'info') {
    const existing = document.querySelectorAll('.sync-notification');
    existing.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = 'sync-notification';
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };

    notification.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
        <button class="notification-close">&times;</button>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s forwards;
        max-width: 400px;
        font-weight: 500;
    `;
    
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .notification-close {
                background: none;
                border: none;
                color: white;
                font-size: 1.2rem;
                cursor: pointer;
                margin-left: 10px;
            }
        `;
        document.head.appendChild(style);
    }
    
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });
    
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

function showLoading(show, message = 'Loading...') {
    let loader = document.getElementById('global-loader');
    
    if (show && !loader) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.innerHTML = `
            <div class="loader-overlay">
                <div class="loader-spinner"></div>
                <p>${message}</p>
            </div>
        `;
        
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        const loaderOverlay = loader.querySelector('.loader-overlay');
        loaderOverlay.style.cssText = `
            background: white;
            padding: 2rem;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        `;
        
        const loaderSpinner = loader.querySelector('.loader-spinner');
        loaderSpinner.style.cssText = `
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        `;
        
        document.body.appendChild(loader);
        
        if (!document.querySelector('#loader-styles')) {
            const style = document.createElement('style');
            style.id = 'loader-styles';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    } else if (!show && loader) {
        loader.remove();
    }
}

// ==================== UTILITY FUNCTIONS ====================
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize mobile menu
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mainNav = document.getElementById('mainNav');

    if (hamburgerBtn && mainNav) {
        hamburgerBtn.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            const icon = hamburgerBtn.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-times');
        });
    }

    // Check auth status on page load
    await checkAuthStatus();

    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
        if (mainNav?.classList.contains('active') && 
            !mainNav.contains(e.target) && 
            !hamburgerBtn?.contains(e.target)) {
            mainNav.classList.remove('active');
            if (hamburgerBtn) {
                const icon = hamburgerBtn.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
    });
});

// ==================== GLOBAL EXPORTS ====================
window.auth = {
    login: loginUser,
    register: registerUser,
    logout: logoutUser,
    check: checkAuthStatus,
    currentUser: () => currentUser,
    isAdmin: () => isAdminLoggedIn
};

window.utils = {
    showNotification,
    showLoading
};

window.currentUser = currentUser;
window.showNotification = showNotification;