// ================================
// Baseline Performance Testing Script
// Comprehensive baseline measurements for the Summarize This application
// ================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// ================================
// Custom Metrics
// ================================
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');
const requestCount = new Counter('request_count');
const authSuccessRate = new Rate('auth_success_rate');
const summarizationSuccessRate = new Rate('summarization_success_rate');
const transcriptionSuccessRate = new Rate('transcription_success_rate');

// ================================
// Test Configuration
// ================================
export const options = {
  stages: [
    // Baseline measurement stages
    { duration: '2m', target: 1 },    // Single user baseline
    { duration: '5m', target: 5 },    // Light load
    { duration: '5m', target: 10 },   // Moderate load
    { duration: '5m', target: 20 },   // Higher load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  
  thresholds: {
    // Response time thresholds
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],
    'http_req_duration{name:health}': ['p(95)<100'],
    'http_req_duration{name:auth}': ['p(95)<500'],
    'http_req_duration{name:summarize}': ['p(95)<3000'],
    'http_req_duration{name:transcribe}': ['p(95)<5000'],
    
    // Success rate thresholds
    'http_req_failed': ['rate<0.05'], // Less than 5% errors
    'auth_success_rate': ['rate>0.95'],
    'summarization_success_rate': ['rate>0.90'],
    'transcription_success_rate': ['rate>0.85'],
    
    // Performance thresholds
    'http_reqs': ['count>1000'], // Minimum request count
    'error_rate': ['rate<0.05'],
  },
  
  // Test metadata
  tags: {
    test_type: 'baseline',
    environment: 'production-like',
    version: '1.0.0',
  },
};

// ================================
// Test Data
// ================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const testData = {
  users: [
    { email: 'user1@test.com', password: 'password123' },
    { email: 'user2@test.com', password: 'password123' },
    { email: 'user3@test.com', password: 'password123' },
  ],
  
  texts: [
    'This is a short text for summarization testing. It contains basic information about performance testing.',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Performance testing is crucial for ensuring application reliability. It helps identify bottlenecks, optimize resource usage, and improve user experience. This comprehensive testing approach includes load testing, stress testing, and capacity planning.',
  ],
  
  urls: [
    'https://example.com/article1',
    'https://example.com/article2',
    'https://example.com/article3',
  ],
};

// ================================
// Utility Functions
// ================================
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomText(length = 100) {
  const words = ['performance', 'testing', 'application', 'baseline', 'measurement', 'optimization', 'scalability', 'reliability'];
  let text = '';
  for (let i = 0; i < length; i++) {
    text += getRandomElement(words) + ' ';
  }
  return text.trim();
}

function authenticateUser() {
  const virtualUser = typeof __VU === 'number' ? __VU : 1;
  const user = testData.users[(Math.max(1, virtualUser) - 1) % testData.users.length];
  
  const loginResponse = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password,
  }), {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'auth' },
  });
  
  const authSuccess = check(loginResponse, {
    'authentication successful': (r) => r.status === 200,
    'auth response time < 500ms': (r) => r.timings.duration < 500,
    'auth token received': (r) => r.json('token') !== undefined,
  });
  
  authSuccessRate.add(authSuccess);
  
  if (authSuccess && loginResponse.json('token')) {
    return loginResponse.json('token');
  }
  
  return null;
}

// ================================
// Test Scenarios
// ================================
function healthCheck() {
  const response = http.get(`${BASE_URL}/health`, {
    tags: { name: 'health' },
  });
  
  check(response, {
    'health check successful': (r) => r.status === 200,
    'health response time < 100ms': (r) => r.timings.duration < 100,
    'health response contains status': (r) => r.json('status') === 'ok',
  });
  
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testSummarization(token) {
  const text = getRandomElement(testData.texts);
  
  const response = http.post(`${BASE_URL}/api/summarize`, JSON.stringify({
    text: text,
    method: 'hybrid',
    length: 'medium',
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'summarize' },
  });
  
  const success = check(response, {
    'summarization successful': (r) => r.status === 200,
    'summarization response time < 3000ms': (r) => r.timings.duration < 3000,
    'summary content received': (r) => r.json('summary') !== undefined,
    'summary not empty': (r) => r.json('summary').length > 0,
  });
  
  summarizationSuccessRate.add(success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
  
  if (!success) {
    errorRate.add(1);
  }
}

function testUrlSummarization(token) {
  const url = getRandomElement(testData.urls);
  
  const response = http.post(`${BASE_URL}/api/summarize/url`, JSON.stringify({
    url: url,
    method: 'ai',
    length: 'short',
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'summarize_url' },
  });
  
  const success = check(response, {
    'URL summarization initiated': (r) => r.status === 202 || r.status === 200,
    'URL summarization response time < 2000ms': (r) => r.timings.duration < 2000,
  });
  
  summarizationSuccessRate.add(success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
  
  if (!success) {
    errorRate.add(1);
  }
}

function testTranscription(token) {
  // Simulate audio file upload for transcription
  const response = http.post(`${BASE_URL}/api/transcribe`, JSON.stringify({
    audioUrl: 'https://example.com/sample-audio.mp3',
    provider: 'openai',
    language: 'en',
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'transcribe' },
  });
  
  const success = check(response, {
    'transcription initiated': (r) => r.status === 202 || r.status === 200,
    'transcription response time < 5000ms': (r) => r.timings.duration < 5000,
  });
  
  transcriptionSuccessRate.add(success);
  responseTime.add(response.timings.duration);
  requestCount.add(1);
  
  if (!success) {
    errorRate.add(1);
  }
}

function testUserProfile(token) {
  const response = http.get(`${BASE_URL}/api/user/profile`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'user_profile' },
  });
  
  check(response, {
    'user profile retrieved': (r) => r.status === 200,
    'profile response time < 300ms': (r) => r.timings.duration < 300,
    'profile contains user data': (r) => r.json('user') !== undefined,
  });
  
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testCreditBalance(token) {
  const response = http.get(`${BASE_URL}/api/user/credits`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'credits' },
  });
  
  check(response, {
    'credit balance retrieved': (r) => r.status === 200,
    'credits response time < 200ms': (r) => r.timings.duration < 200,
    'credits balance is number': (r) => typeof r.json('balance') === 'number',
  });
  
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

function testHistory(token) {
  const response = http.get(`${BASE_URL}/api/user/history?limit=10`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'history' },
  });
  
  check(response, {
    'history retrieved': (r) => r.status === 200,
    'history response time < 500ms': (r) => r.timings.duration < 500,
    'history is array': (r) => Array.isArray(r.json('history')),
  });
  
  responseTime.add(response.timings.duration);
  requestCount.add(1);
}

// ================================
// Main Test Function
// ================================
export default function() {
  // Health check (no auth required)
  healthCheck();
  
  // Authenticate user
  const token = authenticateUser();
  
  if (token) {
    // Test authenticated endpoints
    testUserProfile(token);
    testCreditBalance(token);
    
    // Test core functionality with weighted distribution
    const scenario = Math.random();
    
    if (scenario < 0.4) {
      // 40% - Text summarization
      testSummarization(token);
    } else if (scenario < 0.6) {
      // 20% - URL summarization
      testUrlSummarization(token);
    } else if (scenario < 0.8) {
      // 20% - Transcription
      testTranscription(token);
    } else {
      // 20% - History and profile operations
      testHistory(token);
    }
  }
  
  // Random sleep between 1-3 seconds to simulate user behavior
  sleep(Math.random() * 2 + 1);
}

// ================================
// Setup and Teardown
// ================================
export function setup() {
  console.log('Starting baseline performance test...');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Test duration: ~19 minutes`);
  
  // Verify application is running
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    throw new Error(`Application not ready. Health check failed with status: ${healthResponse.status}`);
  }
  
  console.log('Application health check passed. Starting test...');
  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log('Baseline performance test completed.');
  console.log(`Test started at: ${data.startTime}`);
  console.log(`Test completed at: ${new Date().toISOString()}`);
}

// ================================
// Custom Report Generation
// ================================
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  return {
    [`/results/baseline-performance-${timestamp}.html`]: htmlReport(data),
    [`/results/baseline-performance-${timestamp}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

