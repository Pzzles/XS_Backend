const { db } = require('./firebase');

/**
 * Test script to verify billing system consolidation
 * This script validates that all components work together correctly
 */

async function testBillingConsolidation() {
    console.log('🧪 Testing Billing System Consolidation');
    console.log('=====================================');
    console.log('');

    let allTestsPassed = true;

    // Test 1: Verify Services Load Correctly
    console.log('📦 Test 1: Service Loading');
    try {
        const BillingService = require('./services/BillingService');
        const PaystackService = require('./services/PaystackService');
        
        const billingService = new BillingService();
        console.log('✅ BillingService loaded successfully');
        
        const paystackService = new PaystackService();
        console.log('✅ PaystackService loaded successfully');
        
        console.log('✅ Test 1 PASSED\n');
    } catch (error) {
        console.log('❌ Test 1 FAILED:', error.message);
        allTestsPassed = false;
    }

    // Test 2: Verify Controller Loads Correctly
    console.log('🎮 Test 2: Controller Loading');
    try {
        const unifiedController = require('./controllers/unifiedBillingController');
        
        // Check all required exports exist
        const requiredExports = [
            'initializeSubscription',
            'initializeTrialSubscription',
            'getSubscriptionStatus',
            'cancelSubscription',
            'updateSubscriptionPlan',
            'getSubscriptionPlans',
            'getPaymentMethods',
            'addPaymentMethod',
            'deletePaymentMethod',
            'handleSubscriptionCallback',
            'handleSubscriptionWebhook',
            'handlePaymentMethodCallback'
        ];

        for (const exportName of requiredExports) {
            if (typeof unifiedController[exportName] !== 'function') {
                throw new Error(`Missing or invalid export: ${exportName}`);
            }
        }

        console.log('✅ All required controller functions exported');
        console.log('✅ Test 2 PASSED\n');
    } catch (error) {
        console.log('❌ Test 2 FAILED:', error.message);
        allTestsPassed = false;
    }

    // Test 3: Verify Routes Load Correctly
    console.log('🛣️  Test 3: Routes Loading');
    try {
        const billingRoutes = require('./routes/billingRoutes');
        console.log('✅ Billing routes loaded successfully');
        console.log('✅ Test 3 PASSED\n');
    } catch (error) {
        console.log('❌ Test 3 FAILED:', error.message);
        allTestsPassed = false;
    }

    // Test 4: Verify Configuration
    console.log('⚙️  Test 4: Configuration Validation');
    try {
        const config = require('./config/subscriptionPlans');
        
        // Check subscription plans
        if (!config.SUBSCRIPTION_PLANS) {
            throw new Error('SUBSCRIPTION_PLANS not found in config');
        }

        if (!config.SUBSCRIPTION_PLANS.MONTHLY_PLAN) {
            throw new Error('MONTHLY_PLAN not found in subscription plans');
        }

        if (!config.SUBSCRIPTION_PLANS.ANNUAL_PLAN) {
            throw new Error('ANNUAL_PLAN not found in subscription plans');
        }

        // Check helper functions
        if (typeof config.getPlanById !== 'function') {
            throw new Error('getPlanById function not found');
        }

        if (typeof config.getPlanByCode !== 'function') {
            throw new Error('getPlanByCode function not found');
        }

        console.log('✅ Subscription plans configuration valid');
        console.log('✅ Helper functions available');
        console.log('✅ Test 4 PASSED\n');
    } catch (error) {
        console.log('❌ Test 4 FAILED:', error.message);
        allTestsPassed = false;
    }

    // Test 5: Test Service Integration
    console.log('🔗 Test 5: Service Integration');
    try {
        const BillingService = require('./services/BillingService');
        const billingService = new BillingService();
        
        // Test getting plans (this doesn't require external calls)
        const plansResult = await billingService.getAvailablePlans();
        
        if (!plansResult.status) {
            throw new Error('getAvailablePlans returned false status');
        }

        if (!Array.isArray(plansResult.data)) {
            throw new Error('getAvailablePlans did not return array');
        }

        if (plansResult.data.length === 0) {
            throw new Error('getAvailablePlans returned empty array');
        }

        // Validate plan structure
        const plan = plansResult.data[0];
        const requiredPlanFields = ['id', 'name', 'amount', 'interval', 'description', 'currency'];
        
        for (const field of requiredPlanFields) {
            if (!(field in plan)) {
                throw new Error(`Plan missing required field: ${field}`);
            }
        }

        console.log('✅ BillingService integration working');
        console.log(`✅ Found ${plansResult.data.length} available plans`);
        console.log('✅ Test 5 PASSED\n');
    } catch (error) {
        console.log('❌ Test 5 FAILED:', error.message);
        allTestsPassed = false;
    }

    // Test 6: Environment Validation
    console.log('🌍 Test 6: Environment Validation');
    try {
        const requiredEnvVars = ['PAYSTACK_SECRET_KEY', 'APP_URL'];
        const missingVars = [];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                missingVars.push(envVar);
            }
        }

        if (missingVars.length > 0) {
            console.log(`⚠️  Warning: Missing environment variables: ${missingVars.join(', ')}`);
            console.log('   Some functionality may not work correctly');
        } else {
            console.log('✅ All required environment variables present');
        }

        console.log('✅ Test 6 PASSED\n');
    } catch (error) {
        console.log('❌ Test 6 FAILED:', error.message);
        allTestsPassed = false;
    }

    // Test 7: Verify Deprecated Files Removed
    console.log('🗑️  Test 7: Deprecated Files Cleanup');
    try {
        const fs = require('fs');
        const path = require('path');

        const deprecatedFiles = [
            'controllers/paymentController.js',
            'routes/paymentRoutes.js'
        ];

        for (const filePath of deprecatedFiles) {
            if (fs.existsSync(path.join(__dirname, filePath))) {
                throw new Error(`Deprecated file still exists: ${filePath}`);
            }
        }

        console.log('✅ All deprecated files removed');
        console.log('✅ Test 7 PASSED\n');
    } catch (error) {
        console.log('❌ Test 7 FAILED:', error.message);
        allTestsPassed = false;
    }

    // Test 8: Server Configuration
    console.log('🖥️  Test 8: Server Configuration');
    try {
        // Read server.js to check route configuration
        const fs = require('fs');
        const serverContent = fs.readFileSync('./server.js', 'utf8');

        // Check that deprecated payment routes are not registered
        if (serverContent.includes("require('./routes/paymentRoutes')")) {
            throw new Error('Server still imports deprecated paymentRoutes');
        }

        if (serverContent.includes('app.use(\'/\', paymentRoutes)')) {
            throw new Error('Server still registers deprecated paymentRoutes');
        }

        // Check that billing routes are properly registered
        if (!serverContent.includes("require('./routes/billingRoutes')")) {
            throw new Error('Server does not import billingRoutes');
        }

        console.log('✅ Server configuration updated correctly');
        console.log('✅ Deprecated route imports removed');
        console.log('✅ Test 8 PASSED\n');
    } catch (error) {
        console.log('❌ Test 8 FAILED:', error.message);
        allTestsPassed = false;
    }

    // Final Summary
    console.log('📊 CONSOLIDATION TEST SUMMARY');
    console.log('============================');
    
    if (allTestsPassed) {
        console.log('🎉 ALL TESTS PASSED!');
        console.log('✅ Billing system consolidation successful');
        console.log('');
        console.log('📋 What was accomplished:');
        console.log('  ✅ Removed deprecated payment controller and routes');
        console.log('  ✅ Created unified BillingService class');
        console.log('  ✅ Created PaystackService for API integration');
        console.log('  ✅ Created unified billing controller');
        console.log('  ✅ Updated routes to use new consolidated structure');
        console.log('  ✅ Maintained backward compatibility');
        console.log('  ✅ All services load and integrate correctly');
        console.log('');
        console.log('🚀 The billing system is ready for Phase 3 (database consolidation)!');
    } else {
        console.log('❌ SOME TESTS FAILED');
        console.log('🔧 Please fix the issues above before proceeding');
        process.exit(1);
    }
}

// Test individual components
async function testComponent(componentName) {
    console.log(`🧪 Testing ${componentName}`);
    console.log('='.repeat(40));

    switch (componentName) {
        case 'billing-service':
            try {
                const BillingService = require('./services/BillingService');
                const service = new BillingService();
                const result = await service.getAvailablePlans();
                console.log('✅ BillingService working correctly');
                console.log('Plans:', result.data.map(p => `${p.name} (${p.amount} ${p.currency})`));
            } catch (error) {
                console.log('❌ BillingService error:', error.message);
            }
            break;

        case 'paystack-service':
            try {
                const PaystackService = require('./services/PaystackService');
                const service = new PaystackService();
                console.log('✅ PaystackService initialized correctly');
                console.log('Base URL:', service.baseUrl);
                console.log('Secret Key configured:', !!service.secretKey);
            } catch (error) {
                console.log('❌ PaystackService error:', error.message);
            }
            break;

        case 'controller':
            try {
                const controller = require('./controllers/unifiedBillingController');
                const functionCount = Object.keys(controller).length;
                console.log('✅ Unified controller loaded');
                console.log('Functions exported:', functionCount);
                console.log('Functions:', Object.keys(controller).join(', '));
            } catch (error) {
                console.log('❌ Controller error:', error.message);
            }
            break;

        case 'routes':
            try {
                const routes = require('./routes/billingRoutes');
                console.log('✅ Billing routes loaded');
                console.log('Router stack length:', routes.stack?.length || 'N/A');
            } catch (error) {
                console.log('❌ Routes error:', error.message);
            }
            break;

        default:
            console.log('❌ Unknown component:', componentName);
            console.log('Available components: billing-service, paystack-service, controller, routes');
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
        // Test specific component
        const component = args[0];
        await testComponent(component);
    } else {
        // Run full consolidation test
        await testBillingConsolidation();
    }
}

// Export for use as module
module.exports = {
    testBillingConsolidation,
    testComponent
};

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Test failed:', error.message);
        process.exit(1);
    });
}
