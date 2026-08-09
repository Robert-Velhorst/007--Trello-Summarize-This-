// ================================
// Comprehensive Load Testing Script
// Advanced load testing scenarios for the Summarize This application
// ================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// ================================
// Custom Metrics
// ================================
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');
const requestCount = new Counter('request_count');
const activeUsers = new Gauge('active_users');
const throughput = new Rate('throughput');

// Endpoint-specific metrics
const authMetrics = {
  duration: new Trend('auth_duration'),
  success: new Rate('auth_success'),
  errors: new Counter('auth_errors'),
};

const summarizeMetrics = {
  duration: new Trend('summarize_duration'),
  success: new Rate('summarize_success'),
  errors: new Counter('summarize_errors'),
  queueTime: new Trend('summarize_queue_time'),
};

const transcribeMetrics = {
  duration: new Trend('transcribe_duration'),
  success: new Rate('transcribe_success'),
  errors: new Counter('transcribe_errors'),
  queueTime: new Trend('transcribe_queue_time'),
};

const databaseMetrics = {
  connectionTime: new Trend('db_connection_time'),
  queryTime: new Trend('db_query_time'),
  errors: new Counter('db_errors'),
};

// ================================
// Test Configuration
// ================================
export const options = {
  scenarios: {
    // Ramp-up load test
    ramp_up_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 50 },   // Ramp up to 50 users
        { duration: '10m', target: 100 }, // Ramp up to 100 users
        { duration: '15m', target: 200 }, // Ramp up to 200 users
        { duration: '10m', target: 200 }, // Stay at 200 users
        { duration: '5m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '2m',
    },
    
    // Spike test
    spike_test: {
      executor: 'ramping-vus',
      startTime: '45m',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 },  // Spike to 500 users
        { duration: '5m', target: 500 },  // Stay at spike
        { duration: '2m', target: 0 },    // Quick ramp down
      ],
      gracefulRampDown: '1m',
    },
    
    // Stress test
    stress_test: {
      executor: 'ramping-vus',
      startTime: '55m',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 300 },  // Ramp to stress level
        { duration: '10m', target: 600 }, // Increase stress
        { duration: '10m', target: 1000 }, // Maximum stress
        { duration: '5m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '2m',
    },
    
    // Constant load test
    constant_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30m',
    },
    
    // API-specific load test
    api_focused: {
      executor: 'per-vu-iterations',
      vus: 20,
      iterations: 100,
      maxDuration: '20m',
    },
  },
  
  thresholds: {
    // Overall performance thresholds
    'http_req_duration': ['p(95)<3000', 'p(99)<8000'],
    'http_req_failed': ['rate<0.1'], // Less than 10% errors under load
    
    // Endpoint-specific thresholds
    'auth_duration': ['p(95)<1000'],
    'auth_success': ['rate>0.95'],
    'summarize_duration': ['p(95)<5000'],
    'summarize_success': ['rate>0.85'],
    'transcribe_duration': ['p(95)<10000'],
    'transcribe_success': ['rate>0.80'],
    
    // Database performance
    'db_connection_time': ['p(95)<500'],
    'db_query_time': ['p(95)<1000'],
    
    // System capacity
    'throughput': ['rate>10'], // Minimum 10 requests per second
    'error_rate': ['rate<0.15'], // Less than 15% error rate under stress
  },
  
  // Test metadata
  tags: {
    test_type: 'comprehensive_load',
    environment: 'production-like',
    version: '1.0.0',
  },
};

// ================================
// Test Data
// ================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Shared test data arrays for better memory efficiency
const users = new SharedArray('users', function () {
  const userList = [];
  for (let i = 1; i <= 1000; i++) {
    userList.push({
      email: `loadtest${i}@example.com`,
      password: 'LoadTest123!',
      id: i,
    });
  }
  return userList;
});

const testTexts = new SharedArray('texts', function () {
  return [
    // Short texts (100-300 words)
    'Performance testing is a critical aspect of software development that ensures applications can handle expected user loads. It involves simulating real-world usage patterns to identify bottlenecks and optimize system performance.',
    
    // Medium texts (300-800 words)
    'Load testing is a subset of performance testing that specifically focuses on determining how a system behaves under expected user loads. During load testing, we gradually increase the number of concurrent users to observe how the application responds. The primary goal is to identify the maximum operating capacity of an application and determine if the current infrastructure can support the expected user base. Load testing helps identify performance bottlenecks before they impact real users, ensuring a smooth user experience even during peak usage periods. Key metrics monitored during load testing include response time, throughput, resource utilization, and error rates.',
    
    // Long texts (800+ words)
    'Comprehensive performance testing encompasses multiple testing methodologies designed to evaluate different aspects of system performance under various conditions. Load testing establishes baseline performance metrics by simulating expected user loads, while stress testing pushes the system beyond normal operating capacity to identify breaking points and failure modes. Spike testing evaluates how the system handles sudden increases in load, which is crucial for applications that may experience viral content or flash sales. Volume testing focuses on the system\'s ability to handle large amounts of data, ensuring that database performance remains acceptable as data grows. Endurance testing, also known as soak testing, runs the system under normal load for extended periods to identify memory leaks, resource exhaustion, and other issues that only manifest over time. Each testing type provides unique insights into system behavior and helps identify different categories of performance issues. The combination of these testing approaches provides a comprehensive understanding of system capabilities and limitations, enabling teams to make informed decisions about infrastructure scaling, code optimization, and capacity planning.',
  ];
});

const testUrls = new SharedArray('urls', function () {
  return [
    'https://example.com/article/performance-testing-guide',
    'https://example.com/blog/load-testing-best-practices',
    'https://example.com/docs/api-performance-optimization',
    'https://example.com/tutorial/database-tuning',
    'https://example.com/whitepaper/scalability-patterns',
  ];
});

// ================================
// Utility Functions
// ================================
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function measureDatabaseOperation(operation, expectedDuration = 1000) {
  const start = Date.now();
  const result = operation();
  const duration = Date.now() - start;
  
  databaseMetrics.queryTime.add(duration);
  
  if (duration > expectedDuration) {
    databaseMetrics.errors.add(1);
  }
  
  return result;
}

function authenticateUser() {
  const virtualUser = typeof __VU === 'number' ? __VU : 1;
  const user = users[(Math.max(1, virtualUser) - 1) % users.length];
  const start = Date.now();
  
  const response = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password,
  }), {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'auth', user_id: user.id },
  });
  
  const duration = Date.now() - start;
  authMetrics.duration.add(duration);
  
  const success = check(response, {
    'auth status is 200': (r) => r.status === 200,
    'auth response time acceptable': (r) => r.timings.duration < 2000,
    'auth token received': (r) => r.json('token') !== undefined,
  });
  
  authMetrics.success.add(success);
  
  if (!success) {
    authMetrics.errors.add(1);
    errorRate.add(1);
  }
  
  return success ? response.json('token') : null;
}

// ================================
// Test Scenarios
// ================================
function testTextSummarization(token) {
  return group('Text Summarization', () => {
    const text = getRandomElement(testTexts);
    const method = getRandomElement(['rule-based', 'ml', 'ai', 'hybrid']);
    const length = getRandomElement(['short', 'medium', 'long']);
    
    const start = Date.now();
    
    const response = http.post(`${BASE_URL}/api/summarize`, JSON.stringify({
      text: text,
      method: method,
      length: length,
      priority: 'normal',
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      tags: { 
        name: 'summarize_text',
        method: method,
        length: length,
      },
    });
    
    const duration = Date.now() - start;
    summarizeMetrics.duration.add(duration);
    
    const success = check(response, {
      'summarization status is 200 or 202': (r) => r.status === 200 || r.status === 202,
      'summarization response time acceptable': (r) => r.timings.duration < 8000,
      'summary content received': (r) => r.json('summary') !== undefined || r.json('jobId') !== undefined,
    });
    
    summarizeMetrics.success.add(success);
    
    if (!success) {
      summarizeMetrics.errors.add(1);
      errorRate.add(1);
    }
    
    // If async processing, track queue time
    if (response.status === 202 && response.json('jobId')) {
      summarizeMetrics.queueTime.add(response.json('estimatedTime') || 0);
    }
    
    throughput.add(1);
    requestCount.add(1);
  });
}

function testUrlSummarization(token) {
  return group('URL Summarization', () => {
    const url = getRandomElement(testUrls);
    const method = getRandomElement(['ai', 'hybrid']);
    
    const response = http.post(`${BASE_URL}/api/summarize/url`, JSON.stringify({
      url: url,
      method: method,
      length: 'medium',
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      tags: { 
        name: 'summarize_url',
        method: method,
      },
    });
    
    const success = check(response, {
      'URL summarization initiated': (r) => r.status === 202 || r.status === 200,
      'URL summarization response time acceptable': (r) => r.timings.duration < 5000,
    });
    
    summarizeMetrics.success.add(success);
    
    if (!success) {
      summarizeMetrics.errors.add(1);
      errorRate.add(1);
    }
    
    throughput.add(1);
    requestCount.add(1);
  });
}

function testTranscription(token) {
  return group('Audio Transcription', () => {
    const providers = ['openai', 'assemblyai', 'deepgram'];
    const provider = getRandomElement(providers);
    
    const response = http.post(`${BASE_URL}/api/transcribe`, JSON.stringify({
      audioUrl: `https://example.com/audio/sample-${randomIntBetween(1, 10)}.mp3`,
      provider: provider,
      language: 'en',
      options: {
        punctuation: true,
        diarization: false,
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      tags: { 
        name: 'transcribe',
        provider: provider,
      },
    });
    
    const success = check(response, {
      'transcription initiated': (r) => r.status === 202 || r.status === 200,
      'transcription response time acceptable': (r) => r.timings.duration < 10000,
    });
    
    transcribeMetrics.success.add(success);
    
    if (!success) {
      transcribeMetrics.errors.add(1);
      errorRate.add(1);
    }
    
    // Track queue time for async processing
    if (response.status === 202 && response.json('jobId')) {
      transcribeMetrics.queueTime.add(response.json('estimatedTime') || 0);
    }
    
    throughput.add(1);
    requestCount.add(1);
  });
}

function testUserOperations(token) {
  return group('User Operations', () => {
    // Test user profile
    const profileResponse = http.get(`${BASE_URL}/api/user/profile`, {
      headers: { 'Authorization': `Bearer ${token}` },
      tags: { name: 'user_profile' },
    });
    
    check(profileResponse, {
      'profile retrieved': (r) => r.status === 200,
      'profile response time acceptable': (r) => r.timings.duration < 500,
    });
    
    // Test credit balance
    const creditsResponse = http.get(`${BASE_URL}/api/user/credits`, {
      headers: { 'Authorization': `Bearer ${token}` },
      tags: { name: 'user_credits' },
    });
    
    check(creditsResponse, {
      'credits retrieved': (r) => r.status === 200,
      'credits response time acceptable': (r) => r.timings.duration < 300,
    });
    
    // Test history with pagination
    const historyResponse = http.get(`${BASE_URL}/api/user/history?limit=20&offset=${randomIntBetween(0, 100)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      tags: { name: 'user_history' },
    });
    
    check(historyResponse, {
      'history retrieved': (r) => r.status === 200,
      'history response time acceptable': (r) => r.timings.duration < 1000,
    });
    
    requestCount.add(3);
    throughput.add(3);
  });
}

function testFileUpload(token) {
  return group('File Upload', () => {
    // Simulate file upload for summarization
    const fileContent = generateRandomText(1000);
    
    const response = http.post(`${BASE_URL}/api/summarize/file`, {
      file: http.file(fileContent, 'test-document.txt', 'text/plain'),
      method: 'hybrid',
      length: 'medium',
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      tags: { name: 'file_upload' },
    });
    
    const success = check(response, {
      'file upload successful': (r) => r.status === 200 || r.status === 202,
      'file upload response time acceptable': (r) => r.timings.duration < 15000,
    });
    
    if (!success) {
      errorRate.add(1);
    }
    
    requestCount.add(1);
    throughput.add(1);
  });
}

function generateRandomText(wordCount) {
  const words = [
    'performance', 'testing', 'load', 'stress', 'application', 'system',
    'response', 'time', 'throughput', 'scalability', 'optimization',
    'database', 'server', 'infrastructure', 'monitoring', 'metrics',
  ];
  
  let text = '';
  for (let i = 0; i < wordCount; i++) {
    text += getRandomElement(words) + ' ';
  }
  return text.trim();
}

// ================================
// Main Test Function
// ================================
export default function() {
  activeUsers.add(1);
  
  // Authenticate user
  const token = authenticateUser();
  
  if (!token) {
    sleep(1);
    return;
  }
  
  // Weighted scenario distribution
  const scenario = Math.random();
  
  if (scenario < 0.35) {
    // 35% - Text summarization (most common)
    testTextSummarization(token);
  } else if (scenario < 0.55) {
    // 20% - URL summarization
    testUrlSummarization(token);
  } else if (scenario < 0.70) {
    // 15% - Transcription
    testTranscription(token);
  } else if (scenario < 0.85) {
    // 15% - User operations
    testUserOperations(token);
  } else {
    // 15% - File upload
    testFileUpload(token);
  }
  
  // Random think time between operations
  sleep(randomIntBetween(1, 5));
}

// ================================
// Setup and Teardown
// ================================
export function setup() {
  console.log('Starting comprehensive load test...');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Total test duration: ~85 minutes`);
  console.log(`Scenarios: ramp-up, spike, stress, constant load, API-focused`);
  
  // Verify application health
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    throw new Error(`Application not ready. Health check failed with status: ${healthResponse.status}`);
  }
  
  // Warm up the application
  console.log('Warming up application...');
  for (let i = 0; i < 10; i++) {
    http.get(`${BASE_URL}/health`);
    sleep(0.1);
  }
  
  console.log('Application warmed up. Starting load test...');
  return { 
    startTime: new Date().toISOString(),
    testConfig: options,
  };
}

export function teardown(data) {
  console.log('Comprehensive load test completed.');
  console.log(`Test started at: ${data.startTime}`);
  console.log(`Test completed at: ${new Date().toISOString()}`);
  
  // Generate summary metrics
  console.log('\n=== Test Summary ===');
  console.log(`Total requests: ${requestCount.count || 0}`);
  console.log(`Error rate: ${(errorRate.rate * 100).toFixed(2)}%`);
  console.log(`Average throughput: ${throughput.rate.toFixed(2)} req/s`);
}

// ================================
// Custom Report Generation
// ================================
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Calculate additional metrics
  const totalRequests = data.metrics.request_count?.values?.count || 0;
  const errorCount = data.metrics.error_rate?.values?.count || 0;
  const avgResponseTime = data.metrics.http_req_duration?.values?.avg || 0;
  
  // Add custom summary data
  data.customSummary = {
    totalRequests,
    errorCount,
    errorRate: totalRequests > 0 ? (errorCount / totalRequests * 100).toFixed(2) : 0,
    avgResponseTime: avgResponseTime.toFixed(2),
    testDuration: '~85 minutes',
    scenarios: ['ramp-up', 'spike', 'stress', 'constant', 'api-focused'],
  };
  
  return {
    [`/results/comprehensive-load-test-${timestamp}.html`]: htmlReport(data),
    [`/results/comprehensive-load-test-${timestamp}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

