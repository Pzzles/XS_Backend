const https = require('https');

/**
 * PaystackService - Handles all Paystack API interactions
 * Centralized service for payment processing with Paystack
 */
class PaystackService {
    constructor() {
        this.baseUrl = 'api.paystack.co';
        this.secretKey = process.env.PAYSTACK_SECRET_KEY;
        
        if (!this.secretKey) {
            throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
        }
    }

    /**
     * Make HTTP request to Paystack API
     * @param {string} path - API endpoint path
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
     * @param {object} data - Request payload for POST/PUT requests
     * @returns {Promise<object>} API response data
     */
    async makeRequest(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.baseUrl,
                port: 443,
                path: path,
                method: method,
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(responseData);
                        resolve(parsedData);
                    } catch (error) {
                        console.error('Error parsing Paystack response:', error);
                        reject({
                            status: false,
                            message: 'Failed to parse Paystack response',
                            error: error.message
                        });
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Paystack request error:', error);
                reject({
                    status: false,
                    message: 'Paystack request failed',
                    error: error.message
                });
            });

            if (data && (method === 'POST' || method === 'PUT')) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    /**
     * Initialize a transaction for subscription or payment method setup
     * @param {object} params - Transaction parameters
     * @returns {Promise<object>} Paystack transaction response
     */
    async initializeTransaction(params) {
        try {
            const response = await this.makeRequest('/transaction/initialize', 'POST', params);
            
            if (!response.status) {
                throw new Error(response.message || 'Transaction initialization failed');
            }
            
            return response;
        } catch (error) {
            console.error('Error initializing transaction:', error);
            throw error;
        }
    }

    /**
     * Verify a transaction by reference
     * @param {string} reference - Transaction reference
     * @returns {Promise<object>} Transaction verification data
     */
    async verifyTransaction(reference) {
        try {
            const response = await this.makeRequest(`/transaction/verify/${reference}`);
            
            if (!response.status) {
                throw new Error(response.message || 'Transaction verification failed');
            }
            
            return response;
        } catch (error) {
            console.error('Error verifying transaction:', error);
            throw error;
        }
    }

    /**
     * Get customer details by customer code
     * @param {string} customerCode - Paystack customer code
     * @returns {Promise<object>} Customer data
     */
    async getCustomer(customerCode) {
        try {
            const response = await this.makeRequest(`/customer/${customerCode}`);
            
            if (!response.status) {
                throw new Error(response.message || 'Failed to retrieve customer');
            }
            
            return response;
        } catch (error) {
            console.error('Error getting customer:', error);
            throw error;
        }
    }

    /**
     * Create a new customer
     * @param {object} customerData - Customer information
     * @returns {Promise<object>} Created customer data
     */
    async createCustomer(customerData) {
        try {
            const response = await this.makeRequest('/customer', 'POST', customerData);
            
            if (!response.status) {
                throw new Error(response.message || 'Customer creation failed');
            }
            
            return response;
        } catch (error) {
            console.error('Error creating customer:', error);
            throw error;
        }
    }

    /**
     * Get subscription details by subscription code
     * @param {string} subscriptionCode - Paystack subscription code
     * @returns {Promise<object>} Subscription data
     */
    async getSubscription(subscriptionCode) {
        try {
            const response = await this.makeRequest(`/subscription/${subscriptionCode}`);
            
            if (!response.status) {
                throw new Error(response.message || 'Failed to retrieve subscription');
            }
            
            return response;
        } catch (error) {
            console.error('Error getting subscription:', error);
            throw error;
        }
    }

    /**
     * Cancel a subscription
     * @param {string} subscriptionCode - Paystack subscription code
     * @returns {Promise<object>} Cancellation response
     */
    async cancelSubscription(subscriptionCode) {
        try {
            const response = await this.makeRequest(`/subscription/disable`, 'POST', {
                code: subscriptionCode,
                token: subscriptionCode
            });
            
            return response;
        } catch (error) {
            console.error('Error canceling subscription:', error);
            throw error;
        }
    }

    /**
     * Create a new plan
     * @param {object} planData - Plan information
     * @returns {Promise<object>} Created plan data
     */
    async createPlan(planData) {
        try {
            const response = await this.makeRequest('/plan', 'POST', planData);
            
            if (!response.status) {
                throw new Error(response.message || 'Plan creation failed');
            }
            
            return response;
        } catch (error) {
            console.error('Error creating plan:', error);
            throw error;
        }
    }

    /**
     * Get all plans
     * @returns {Promise<object>} List of plans
     */
    async getPlans() {
        try {
            const response = await this.makeRequest('/plan');
            
            if (!response.status) {
                throw new Error(response.message || 'Failed to retrieve plans');
            }
            
            return response;
        } catch (error) {
            console.error('Error getting plans:', error);
            throw error;
        }
    }

    /**
     * Issue a refund for a transaction
     * @param {object} refundData - Refund parameters
     * @returns {Promise<object>} Refund response
     */
    async issueRefund(refundData) {
        try {
            const response = await this.makeRequest('/refund', 'POST', refundData);
            
            if (!response.status) {
                throw new Error(response.message || 'Refund failed');
            }
            
            return response;
        } catch (error) {
            console.error('Error issuing refund:', error);
            throw error;
        }
    }

    /**
     * Create a subscription
     * @param {object} subscriptionData - Subscription parameters
     * @returns {Promise<object>} Subscription creation response
     */
    async createSubscription(subscriptionData) {
        try {
            const response = await this.makeRequest('/subscription', 'POST', subscriptionData);
            
            if (!response.status) {
                throw new Error(response.message || 'Subscription creation failed');
            }
            
            return response;
        } catch (error) {
            console.error('Error creating subscription:', error);
            throw error;
        }
    }
}

module.exports = PaystackService;
