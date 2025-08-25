const https = require('https');
const { db } = require('./firebase');

/**
 * Integration test script for the new unified billing system
 * This script tests the actual API endpoints without mocks
 */

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const TEST_USER_TOKEN = process.env.TEST_USER_TOKEN; // You'll need to generate this

// Test configuration
const TEST_CONFIG = {
    userId: 'test-billing-user-' + Date.now(),
    email: 'test.billing@example.com',
    planId: 'MONTHLY_PLAN'
};

/**
 * Make HTTP request helper
 */
function makeRequest(path, method = 'GET', data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        data: parsedData
                    });
                } catch (error) {
                    reject(new Error('Failed to parse response: ' + responseData));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data && (method === 'POST' || method === 'PUT')) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

/**
 * Test suite runner
 */
class BillingIntegrationTest {
    constructor() {
        this.results = [];
        this.passed = 0;
        this.failed = 0;
    }

    async test(name, testFn) {
        console.log(`🧪 Running test: ${name}`);
        try {
            const startTime = Date.now();
            await testFn();
            const duration = Date.now() - startTime;
            
            console.log(`✅ PASSED: ${name} (${duration}ms)`);
            this.results.push({ name, status: 'PASSED', duration });
            this.passed++;
        } catch (error) {
            console.log(`❌ FAILED: ${name}`);
            console.log(`   Error: ${error.message}`);
            this.results.push({ name, status: 'FAILED', error: error.message });
            this.failed++;
        }
        console.log('');
    }

    async expect(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(`${message}: Expected ${expected}, got ${actual}`);
        }
    }

    async expectTruthy(value, message) {
        if (!value) {
            throw new Error(`${message}: Expected truthy value, got ${value}`);
        }
    }

    printSummary() {
        console.log('='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${this.results.length}`);
        console.log(`✅ Passed: ${this.passed}`);
        console.log(`❌ Failed: ${this.failed}`);
        console.log(`Success Rate: ${((this.passed / this.results.length) * 100).toFixed(1)}%`);
        console.log('');

        if (this.failed > 0) {
            console.log('Failed Tests:');
            this.results
                .filter(r => r.status === 'FAILED')
                .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
        }
    }
}

/**
 * Main test execution
 */
async function runIntegrationTests() {
    console.log('🚀 Starting Billing Integration Tests');
    console.log('='.repeat(60));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Test User ID: ${TEST_CONFIG.userId}`);
    console.log('');

    const tester = new BillingIntegrationTest();

    // Test 1: Get Subscription Plans
    await tester.test('Get Subscription Plans', async () => {
        const response = await makeRequest('/billing/subscriptions/plans', 'GET', null, TEST_USER_TOKEN);
        
        await tester.expect(response.statusCode, 200, 'Status code should be 200');
        await tester.expectTruthy(response.data.status, 'Response should have status true');
        await tester.expectTruthy(Array.isArray(response.data.data), 'Data should be an array');
        await tester.expectTruthy(response.data.data.length > 0, 'Should have at least one plan');
        
        const plan = response.data.data[0];
        await tester.expectTruthy(plan.id, 'Plan should have an ID');
        await tester.expectTruthy(plan.name, 'Plan should have a name');
        await tester.expectTruthy(plan.amount, 'Plan should have an amount');
    });

    // Test 2: Get Subscription Status (no active subscription)
    await tester.test('Get Subscription Status (Inactive)', async () => {
        const response = await makeRequest('/billing/subscriptions/status', 'GET', null, TEST_USER_TOKEN);
        
        await tester.expect(response.statusCode, 200, 'Status code should be 200');
        await tester.expectTruthy(response.data.status, 'Response should have status true');
        await tester.expectTruthy(response.data.data, 'Should have subscription data');
    });

    // Test 3: Initialize Subscription
    await tester.test('Initialize Subscription', async () => {
        const response = await makeRequest(
            '/billing/subscriptions/initialize', 
            'POST', 
            { planId: TEST_CONFIG.planId },
            TEST_USER_TOKEN
        );
        
        await tester.expect(response.statusCode, 200, 'Status code should be 200');
        await tester.expectTruthy(response.data.status, 'Response should have status true');
        await tester.expectTruthy(response.data.data.authorization_url, 'Should have authorization URL');
        await tester.expectTruthy(response.data.data.reference, 'Should have payment reference');
    });

    // Test 4: Get Payment Methods (empty)
    await tester.test('Get Payment Methods (Empty)', async () => {
        const response = await makeRequest('/billing/payment-methods', 'GET', null, TEST_USER_TOKEN);
        
        await tester.expect(response.statusCode, 200, 'Status code should be 200');
        await tester.expectTruthy(response.data.status, 'Response should have status true');
        await tester.expectTruthy(Array.isArray(response.data.data), 'Data should be an array');
    });

    // Test 5: Add Payment Method
    await tester.test('Add Payment Method', async () => {
        const response = await makeRequest(
            '/billing/payment-methods', 
            'POST', 
            { email: TEST_CONFIG.email },
            TEST_USER_TOKEN
        );
        
        await tester.expect(response.statusCode, 200, 'Status code should be 200');
        await tester.expectTruthy(response.data.status, 'Response should have status true');
        await tester.expectTruthy(response.data.data.authorization_url, 'Should have authorization URL');
    });

    // Test 6: Error Handling - Invalid Plan ID
    await tester.test('Error Handling - Invalid Plan ID', async () => {
        const response = await makeRequest(
            '/billing/subscriptions/initialize', 
            'POST', 
            { planId: 'INVALID_PLAN' },
            TEST_USER_TOKEN
        );
        
        await tester.expect(response.statusCode, 500, 'Status code should be 500 for invalid plan');
        await tester.expect(response.data.status, false, 'Response status should be false');
    });

    // Test 7: Error Handling - Missing Plan ID
    await tester.test('Error Handling - Missing Plan ID', async () => {
        const response = await makeRequest(
            '/billing/subscriptions/initialize', 
            'POST', 
            {},
            TEST_USER_TOKEN
        );
        
        await tester.expect(response.statusCode, 400, 'Status code should be 400 for missing plan ID');
        await tester.expect(response.data.status, false, 'Response status should be false');
    });

    // Test 8: Performance Test - Multiple Concurrent Requests
    await tester.test('Performance - Concurrent Plan Requests', async () => {
        const promises = Array(5).fill().map(() => 
            makeRequest('/billing/subscriptions/plans', 'GET', null, TEST_USER_TOKEN)
        );
        
        const startTime = Date.now();
        const responses = await Promise.all(promises);
        const duration = Date.now() - startTime;
        
        responses.forEach((response, index) => {
            if (response.statusCode !== 200) {
                throw new Error(`Request ${index + 1} failed with status ${response.statusCode}`);
            }
        });
        
        console.log(`   ⏱️  Completed 5 concurrent requests in ${duration}ms`);
    });

    tester.printSummary();
    
    if (tester.failed > 0) {
        process.exit(1);
    }
}

/**
 * Test the services directly (unit test style)
 */
async function runServiceTests() {
    console.log('🔧 Testing Services Directly');
    console.log('='.repeat(60));

    const tester = new BillingIntegrationTest();

    // Test BillingService directly
    await tester.test('BillingService - Get Plans', async () => {
        const BillingService = require('./services/BillingService');
        const billingService = new BillingService();
        
        const result = await billingService.getAvailablePlans();
        
        await tester.expectTruthy(result.status, 'Should return success status');
        await tester.expectTruthy(Array.isArray(result.data), 'Should return array of plans');
        await tester.expectTruthy(result.data.length > 0, 'Should have at least one plan');
    });

    // Test PaystackService configuration
    await tester.test('PaystackService - Configuration', async () => {
        const PaystackService = require('./services/PaystackService');
        
        // This will throw if PAYSTACK_SECRET_KEY is not set
        const paystackService = new PaystackService();
        
        await tester.expectTruthy(paystackService.secretKey, 'Should have secret key configured');
        await tester.expect(paystackService.baseUrl, 'api.paystack.co', 'Should have correct base URL');
    });

    tester.printSummary();
}

/**
 * Run all tests
 */
async function main() {
    try {
        console.log('🧪 BILLING SYSTEM INTEGRATION TESTS');
        console.log('====================================');
        console.log('');

        // Check environment
        if (!process.env.PAYSTACK_SECRET_KEY) {
            console.log('⚠️  Warning: PAYSTACK_SECRET_KEY not set. Some tests may fail.');
        }

        if (!TEST_USER_TOKEN) {
            console.log('⚠️  Warning: TEST_USER_TOKEN not set. API tests will be skipped.');
            console.log('   To run API tests, set TEST_USER_TOKEN environment variable.');
            console.log('');
        }

        // Run service tests first (these don't require network calls)
        await runServiceTests();
        console.log('');

        // Run integration tests if we have a token
        if (TEST_USER_TOKEN) {
            await runIntegrationTests();
        } else {
            console.log('⏭️  Skipping API integration tests (no TEST_USER_TOKEN)');
        }

        console.log('🎉 All tests completed!');

    } catch (error) {
        console.error('💥 Test suite failed:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = {
    runIntegrationTests,
    runServiceTests,
    BillingIntegrationTest,
    makeRequest
};

// Run if called directly
if (require.main === module) {
    main();
}
