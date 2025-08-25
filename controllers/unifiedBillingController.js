const BillingService = require('../services/BillingService');
const { logActivity, ACTIONS, RESOURCES } = require('../utils/logger');

/**
 * UnifiedBillingController - New consolidated controller for all billing operations
 * Uses BillingService to handle subscriptions, payment methods, and invoices
 */

const billingService = new BillingService();

// ============================================================================
// SUBSCRIPTION ENDPOINTS
// ============================================================================

/**
 * Initialize a subscription
 */
const initializeSubscription = async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.uid;

        if (!planId) {
            return res.status(400).json({
                status: false,
                message: 'Plan ID is required'
            });
        }

        const result = await billingService.createSubscription(userId, planId, false);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error initializing subscription:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to initialize subscription',
            error: error.message
        });
    }
};

/**
 * Initialize a trial subscription
 */
const initializeTrialSubscription = async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.uid;

        if (!planId) {
            return res.status(400).json({
                status: false,
                message: 'Plan ID is required'
            });
        }

        const result = await billingService.createSubscription(userId, planId, true);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error initializing trial subscription:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to initialize trial subscription',
            error: error.message
        });
    }
};

/**
 * Get subscription status
 */
const getSubscriptionStatus = async (req, res) => {
    try {
        const userId = req.user.uid;
        const result = await billingService.getSubscriptionStatus(userId);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error getting subscription status:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to get subscription status',
            error: error.message
        });
    }
};

/**
 * Cancel subscription
 */
const cancelSubscription = async (req, res) => {
    try {
        const userId = req.user.uid;
        const result = await billingService.cancelSubscription(userId);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to cancel subscription',
            error: error.message
        });
    }
};

/**
 * Update subscription plan
 */
const updateSubscriptionPlan = async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.uid;

        if (!planId) {
            return res.status(400).json({
                status: false,
                message: 'Plan ID is required'
            });
        }

        const result = await billingService.updateSubscription(userId, planId);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error updating subscription plan:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to update subscription plan',
            error: error.message
        });
    }
};

/**
 * Get available subscription plans
 */
const getSubscriptionPlans = async (req, res) => {
    try {
        const result = await billingService.getAvailablePlans();
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error getting subscription plans:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to get subscription plans',
            error: error.message
        });
    }
};

// ============================================================================
// PAYMENT METHODS ENDPOINTS
// ============================================================================

/**
 * Get user's payment methods
 */
const getPaymentMethods = async (req, res) => {
    try {
        const userId = req.user.uid;
        const result = await billingService.getPaymentMethods(userId);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error getting payment methods:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to get payment methods',
            error: error.message
        });
    }
};

/**
 * Add a new payment method
 */
const addPaymentMethod = async (req, res) => {
    try {
        const userId = req.user.uid;
        const { email, amount = 100 } = req.body;
        
        const userEmail = email || req.user.email;
        if (!userEmail) {
            return res.status(400).json({
                status: false,
                message: 'Email is required'
            });
        }

        const result = await billingService.addPaymentMethod(userId, userEmail, amount);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error adding payment method:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to add payment method',
            error: error.message
        });
    }
};

/**
 * Update a payment method
 */
const updatePaymentMethod = async (req, res) => {
    try {
        const userId = req.user.uid;
        const { id: paymentMethodId } = req.params;
        const { isDefault } = req.body;

        if (!paymentMethodId) {
            return res.status(400).json({
                status: false,
                message: 'Payment method ID is required'
            });
        }

        // For now, we only support updating the default status
        // The BillingService would need to be extended for full update functionality
        const result = await billingService.updatePaymentMethod(userId, paymentMethodId, { isDefault });
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error updating payment method:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to update payment method',
            error: error.message
        });
    }
};

/**
 * Delete a payment method
 */
const deletePaymentMethod = async (req, res) => {
    try {
        const userId = req.user.uid;
        const { id: paymentMethodId } = req.params;

        if (!paymentMethodId) {
            return res.status(400).json({
                status: false,
                message: 'Payment method ID is required'
            });
        }

        const result = await billingService.deletePaymentMethod(userId, paymentMethodId);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('Error deleting payment method:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to delete payment method',
            error: error.message
        });
    }
};

// ============================================================================
// CALLBACK AND WEBHOOK HANDLERS
// ============================================================================

/**
 * Handle subscription callback from Paystack
 * This will be imported from the existing subscription controller for now
 */
const handleSubscriptionCallback = async (req, res) => {
    try {
        const reference = req.method === 'POST' ? req.body.data?.reference : req.query.reference;
        
        if (!reference) {
            console.error('No reference provided');
            return res.status(400).json({ message: 'No reference provided' });
        }

        console.log('Processing subscription reference:', reference);
        
        const result = await billingService.handleSubscriptionCallback(reference);
        
        // Redirect or respond based on request method
        if (req.method === 'GET') {
            // Determine redirect URL based on subscription type
            const metadata = result.data?.metadata || {};
            const isTrial = metadata.isTrial === true;
            
            if (isTrial) {
                return res.redirect('/subscription-trial-success.html');
            } else {
                return res.redirect('/subscription-success.html');
            }
        } else {
            return res.status(200).json(result);
        }

    } catch (error) {
        console.error('Subscription callback error:', error);
        
        if (req.method === 'GET') {
            return res.redirect('/subscription-failed.html');
        } else {
            return res.status(500).json({ 
                status: 'error',
                message: 'Internal server error',
                error: error.message
            });
        }
    }
};

/**
 * Handle subscription webhook from Paystack
 * This will be imported from the existing subscription controller for now
 */
const handleSubscriptionWebhook = require('../controllers/subscriptionController').handleSubscriptionWebhook;

/**
 * Handle payment method callback from Paystack
 * This will be imported from the existing billing controller for now
 */
const handlePaymentMethodCallback = require('../controllers/billingController').handlePaymentMethodCallback;

// ============================================================================
// LEGACY SUPPORT ENDPOINTS
// ============================================================================

/**
 * Get subscription logs (legacy)
 */
const getSubscriptionLogs = require('../controllers/subscriptionController').getSubscriptionLogs;

/**
 * Get subscription history (legacy)  
 */
const getSubscriptionHistory = require('../controllers/subscriptionController').getSubscriptionHistory;

/**
 * Cleanup user record (legacy)
 */
const cleanupUserRecord = require('../controllers/subscriptionController').cleanupUserRecord;

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Subscription management
    initializeSubscription,
    initializeTrialSubscription,
    getSubscriptionStatus,
    cancelSubscription,
    updateSubscriptionPlan,
    getSubscriptionPlans,
    
    // Payment methods
    getPaymentMethods,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    
    // Callbacks and webhooks
    handleSubscriptionCallback,
    handleSubscriptionWebhook,
    handlePaymentMethodCallback,
    
    // Legacy support
    getSubscriptionLogs,
    getSubscriptionHistory,
    cleanupUserRecord
};
