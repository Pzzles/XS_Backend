const request = require('supertest');
const { app } = require('../server'); // Assuming server exports app
const { db } = require('../firebase');
const BillingService = require('../services/BillingService');
const PaystackService = require('../services/PaystackService');

// Mock Firebase
jest.mock('../firebase', () => ({
    db: {
        collection: jest.fn(() => ({
            doc: jest.fn(() => ({
                get: jest.fn(),
                set: jest.fn(),
                update: jest.fn(),
                delete: jest.fn()
            })),
            where: jest.fn(() => ({
                get: jest.fn(),
                limit: jest.fn(() => ({
                    get: jest.fn()
                }))
            })),
            add: jest.fn()
        }))
    },
    admin: {
        firestore: {
            Timestamp: {
                now: jest.fn(() => ({ toDate: () => new Date() }))
            }
        }
    }
}));

// Mock logger
jest.mock('../utils/logger', () => ({
    logActivity: jest.fn(),
    ACTIONS: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', VIEW: 'view' },
    RESOURCES: { SUBSCRIPTION: 'subscription', PAYMENT_METHOD: 'payment_method' }
}));

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
    authenticateUser: (req, res, next) => {
        req.user = { uid: 'test-user-123', email: 'test@example.com' };
        next();
    }
}));

describe('Billing System Tests', () => {
    let billingService;
    let paystackService;

    beforeEach(() => {
        jest.clearAllMocks();
        billingService = new BillingService();
        paystackService = new PaystackService();
    });

    describe('PaystackService', () => {
        beforeEach(() => {
            // Mock HTTPS module
            jest.doMock('https', () => ({
                request: jest.fn((options, callback) => {
                    const mockResponse = {
                        on: jest.fn((event, handler) => {
                            if (event === 'data') {
                                handler(JSON.stringify({
                                    status: true,
                                    data: {
                                        authorization_url: 'https://checkout.paystack.com/test',
                                        access_code: 'test_access_code',
                                        reference: 'test_reference_123'
                                    }
                                }));
                            } else if (event === 'end') {
                                handler();
                            }
                        })
                    };
                    
                    const mockRequest = {
                        on: jest.fn(),
                        write: jest.fn(),
                        end: jest.fn()
                    };
                    
                    setTimeout(() => callback(mockResponse), 0);
                    return mockRequest;
                })
            }));
        });

        test('should initialize transaction successfully', async () => {
            const params = {
                email: 'test@example.com',
                amount: 15999,
                plan: 'PLN_25xliarx7epm9ct'
            };

            const result = await paystackService.initializeTransaction(params);
            
            expect(result.status).toBe(true);
            expect(result.data.authorization_url).toBeDefined();
            expect(result.data.reference).toBeDefined();
        });

        test('should verify transaction successfully', async () => {
            const reference = 'test_reference_123';
            
            const result = await paystackService.verifyTransaction(reference);
            
            expect(result.status).toBe(true);
            expect(result.data).toBeDefined();
        });
    });

    describe('BillingService', () => {
        test('should create subscription successfully', async () => {
            // Mock user document
            const mockUserDoc = {
                exists: true,
                data: () => ({ email: 'test@example.com' })
            };
            
            db.collection().doc().get.mockResolvedValue(mockUserDoc);

            const result = await billingService.createSubscription('test-user-123', 'MONTHLY_PLAN', false);
            
            expect(result.status).toBe(true);
            expect(result.data.authorization_url).toBeDefined();
            expect(result.data.plan).toBeDefined();
        });

        test('should get subscription status', async () => {
            // Mock subscription document
            const mockSubscriptionDoc = {
                exists: true,
                data: () => ({
                    status: 'active',
                    planId: 'MONTHLY_PLAN',
                    startDate: new Date().toISOString(),
                    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                })
            };
            
            const mockUserDoc = {
                exists: true,
                data: () => ({ email: 'test@example.com' })
            };

            db.collection().doc().get
                .mockResolvedValueOnce(mockSubscriptionDoc)
                .mockResolvedValueOnce(mockUserDoc);

            const result = await billingService.getSubscriptionStatus('test-user-123');
            
            expect(result.status).toBe(true);
            expect(result.data.subscriptionStatus).toBe('active');
            expect(result.data.plan).toBeDefined();
        });

        test('should cancel subscription successfully', async () => {
            // Mock subscription document
            const mockSubscriptionDoc = {
                exists: true,
                data: () => ({
                    status: 'active',
                    subscriptionCode: 'SUB_test123'
                })
            };

            db.collection().doc().get.mockResolvedValue(mockSubscriptionDoc);
            db.collection().doc().update.mockResolvedValue();

            const result = await billingService.cancelSubscription('test-user-123');
            
            expect(result.status).toBe(true);
            expect(result.message).toContain('cancelled successfully');
        });

        test('should get payment methods', async () => {
            // Mock payment methods query
            const mockPaymentMethodsSnapshot = {
                forEach: jest.fn((callback) => {
                    const mockDoc = {
                        id: 'pm_123',
                        data: () => ({
                            last4: '1234',
                            brand: 'visa',
                            bank: 'First Bank',
                            isDefault: true,
                            createdAt: new Date().toISOString()
                        })
                    };
                    callback(mockDoc);
                })
            };

            db.collection().where().get.mockResolvedValue(mockPaymentMethodsSnapshot);

            const result = await billingService.getPaymentMethods('test-user-123');
            
            expect(result.status).toBe(true);
            expect(result.data).toBeInstanceOf(Array);
        });

        test('should get available plans', async () => {
            const result = await billingService.getAvailablePlans();
            
            expect(result.status).toBe(true);
            expect(result.data).toBeInstanceOf(Array);
            expect(result.data.length).toBeGreaterThan(0);
            expect(result.data[0]).toHaveProperty('id');
            expect(result.data[0]).toHaveProperty('name');
            expect(result.data[0]).toHaveProperty('amount');
        });
    });

    describe('API Endpoints', () => {
        test('GET /billing/subscriptions/plans should return available plans', async () => {
            const response = await request(app)
                .get('/billing/subscriptions/plans')
                .expect(200);

            expect(response.body.status).toBe(true);
            expect(response.body.data).toBeInstanceOf(Array);
        });

        test('GET /billing/subscriptions/status should return subscription status', async () => {
            // Mock subscription document
            const mockSubscriptionDoc = {
                exists: true,
                data: () => ({
                    status: 'active',
                    planId: 'MONTHLY_PLAN'
                })
            };

            const mockUserDoc = {
                exists: true,
                data: () => ({ email: 'test@example.com' })
            };

            db.collection().doc().get
                .mockResolvedValueOnce(mockSubscriptionDoc)
                .mockResolvedValueOnce(mockUserDoc);

            const response = await request(app)
                .get('/billing/subscriptions/status')
                .expect(200);

            expect(response.body.status).toBe(true);
            expect(response.body.data.subscriptionStatus).toBeDefined();
        });

        test('POST /billing/subscriptions/initialize should initialize subscription', async () => {
            // Mock user document
            const mockUserDoc = {
                exists: true,
                data: () => ({ email: 'test@example.com' })
            };

            db.collection().doc().get.mockResolvedValue(mockUserDoc);

            const response = await request(app)
                .post('/billing/subscriptions/initialize')
                .send({ planId: 'MONTHLY_PLAN' })
                .expect(200);

            expect(response.body.status).toBe(true);
            expect(response.body.data.authorization_url).toBeDefined();
        });

        test('GET /billing/payment-methods should return payment methods', async () => {
            // Mock payment methods query
            const mockPaymentMethodsSnapshot = {
                forEach: jest.fn()
            };

            db.collection().where().get.mockResolvedValue(mockPaymentMethodsSnapshot);

            const response = await request(app)
                .get('/billing/payment-methods')
                .expect(200);

            expect(response.body.status).toBe(true);
            expect(response.body.data).toBeInstanceOf(Array);
        });

        test('POST /billing/payment-methods should add payment method', async () => {
            const response = await request(app)
                .post('/billing/payment-methods')
                .send({ email: 'test@example.com' })
                .expect(200);

            expect(response.body.status).toBe(true);
            expect(response.body.data.authorization_url).toBeDefined();
        });

        test('POST /billing/subscriptions/cancel should cancel subscription', async () => {
            // Mock subscription document
            const mockSubscriptionDoc = {
                exists: true,
                data: () => ({
                    status: 'active',
                    subscriptionCode: 'SUB_test123'
                })
            };

            db.collection().doc().get.mockResolvedValue(mockSubscriptionDoc);
            db.collection().doc().update.mockResolvedValue();

            const response = await request(app)
                .post('/billing/subscriptions/cancel')
                .expect(200);

            expect(response.body.status).toBe(true);
            expect(response.body.message).toContain('cancelled');
        });
    });

    describe('Error Handling', () => {
        test('should handle missing plan ID in subscription initialization', async () => {
            const response = await request(app)
                .post('/billing/subscriptions/initialize')
                .send({})
                .expect(400);

            expect(response.body.status).toBe(false);
            expect(response.body.message).toContain('Plan ID is required');
        });

        test('should handle user not found error', async () => {
            // Mock user document not found
            const mockUserDoc = { exists: false };
            db.collection().doc().get.mockResolvedValue(mockUserDoc);

            const response = await request(app)
                .post('/billing/subscriptions/initialize')
                .send({ planId: 'MONTHLY_PLAN' })
                .expect(500);

            expect(response.body.status).toBe(false);
            expect(response.body.message).toContain('Failed to initialize subscription');
        });

        test('should handle invalid plan ID', async () => {
            const mockUserDoc = {
                exists: true,
                data: () => ({ email: 'test@example.com' })
            };

            db.collection().doc().get.mockResolvedValue(mockUserDoc);

            const response = await request(app)
                .post('/billing/subscriptions/initialize')
                .send({ planId: 'INVALID_PLAN' })
                .expect(500);

            expect(response.body.status).toBe(false);
            expect(response.body.message).toContain('Failed to initialize subscription');
        });
    });

    describe('Integration Tests', () => {
        test('should handle complete subscription flow', async () => {
            // Step 1: Get available plans
            const plansResponse = await request(app)
                .get('/billing/subscriptions/plans')
                .expect(200);

            expect(plansResponse.body.data.length).toBeGreaterThan(0);
            const planId = plansResponse.body.data[0].id;

            // Step 2: Initialize subscription
            const mockUserDoc = {
                exists: true,
                data: () => ({ email: 'test@example.com' })
            };

            db.collection().doc().get.mockResolvedValue(mockUserDoc);

            const initResponse = await request(app)
                .post('/billing/subscriptions/initialize')
                .send({ planId })
                .expect(200);

            expect(initResponse.body.data.authorization_url).toBeDefined();

            // Step 3: Check subscription status
            const mockSubscriptionDoc = {
                exists: true,
                data: () => ({
                    status: 'active',
                    planId: planId
                })
            };

            db.collection().doc().get
                .mockResolvedValueOnce(mockSubscriptionDoc)
                .mockResolvedValueOnce(mockUserDoc);

            const statusResponse = await request(app)
                .get('/billing/subscriptions/status')
                .expect(200);

            expect(statusResponse.body.data.plan.id).toBe(planId);
        });

        test('should handle payment method management flow', async () => {
            // Step 1: Get payment methods (should be empty initially)
            const mockEmptySnapshot = { forEach: jest.fn() };
            db.collection().where().get.mockResolvedValue(mockEmptySnapshot);

            const getResponse = await request(app)
                .get('/billing/payment-methods')
                .expect(200);

            expect(getResponse.body.data).toEqual([]);

            // Step 2: Add payment method
            const addResponse = await request(app)
                .post('/billing/payment-methods')
                .send({ email: 'test@example.com' })
                .expect(200);

            expect(addResponse.body.data.authorization_url).toBeDefined();

            // Step 3: Get payment methods (should now have one)
            const mockSnapshot = {
                forEach: jest.fn((callback) => {
                    const mockDoc = {
                        id: 'pm_123',
                        data: () => ({
                            last4: '1234',
                            brand: 'visa',
                            bank: 'First Bank',
                            isDefault: true
                        })
                    };
                    callback(mockDoc);
                })
            };

            db.collection().where().get.mockResolvedValue(mockSnapshot);

            const getAfterAddResponse = await request(app)
                .get('/billing/payment-methods')
                .expect(200);

            expect(getAfterAddResponse.body.data.length).toBe(1);
        });
    });
});

describe('Legacy Route Compatibility', () => {
    test('should maintain backward compatibility for old subscription routes', async () => {
        // Test that old routes still work via the unified controller
        // This is important for existing integrations
        
        const mockUserDoc = {
            exists: true,
            data: () => ({ email: 'test@example.com' })
        };

        db.collection().doc().get.mockResolvedValue(mockUserDoc);

        // Old route should still work
        const response = await request(app)
            .post('/billing/subscriptions/initialize')
            .send({ planId: 'MONTHLY_PLAN' })
            .expect(200);

        expect(response.body.status).toBe(true);
    });
});

describe('Performance Tests', () => {
    test('should handle multiple concurrent requests', async () => {
        const mockUserDoc = {
            exists: true,
            data: () => ({ email: 'test@example.com' })
        };

        const mockSubscriptionDoc = {
            exists: true,
            data: () => ({
                status: 'active',
                planId: 'MONTHLY_PLAN'
            })
        };

        db.collection().doc().get
            .mockResolvedValue(mockSubscriptionDoc)
            .mockResolvedValue(mockUserDoc);

        // Create multiple concurrent requests
        const requests = Array(10).fill().map(() => 
            request(app).get('/billing/subscriptions/status')
        );

        const responses = await Promise.all(requests);

        responses.forEach(response => {
            expect(response.status).toBe(200);
            expect(response.body.status).toBe(true);
        });
    });
});
