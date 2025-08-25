const { db, admin } = require('../firebase');
const PaystackService = require('./PaystackService');
const { logActivity, ACTIONS, RESOURCES } = require('../utils/logger');
const { SUBSCRIPTION_PLANS, SUBSCRIPTION_CONSTANTS, getPlanById, getPlanByCode } = require('../config/subscriptionPlans');

/**
 * BillingService - Unified service for all billing operations
 * Centralizes subscription, payment method, and invoice management
 */
class BillingService {
    constructor() {
        this.paystack = new PaystackService();
    }

    // ============================================================================
    // SUBSCRIPTION MANAGEMENT
    // ============================================================================

    /**
     * Create a new subscription
     * @param {string} userId - User ID
     * @param {string} planId - Plan identifier
     * @param {boolean} trial - Whether this is a trial subscription
     * @returns {Promise<object>} Subscription creation result
     */
    async createSubscription(userId, planId, trial = false) {
        try {
            // Get user data
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                throw new Error('User not found');
            }

            const userData = userDoc.data();
            const userEmail = userData.email;

            // Get plan details
            const plan = getPlanById(planId);
            if (!plan) {
                throw new Error('Invalid plan ID');
            }

            const baseUrl = process.env.APP_URL;

            // Prepare Paystack transaction parameters
            const params = {
                email: userEmail,
                amount: trial ? SUBSCRIPTION_CONSTANTS.VERIFICATION_AMOUNT : plan.amount * 100, // R1 for trial, full amount for regular
                plan: trial ? undefined : plan.planCode, // No plan for trial verification
                callback_url: trial ? `${baseUrl}/subscription/trial/callback` : `${baseUrl}/subscription/callback`,
                metadata: {
                    planId: plan.id,
                    userId: userId,
                    isTrial: trial,
                    cancel_action: `${baseUrl}/subscription/cancel`
                }
            };

            // Initialize transaction with Paystack
            const response = await this.paystack.initializeTransaction(params);

            // Log subscription initialization
            await logActivity({
                action: ACTIONS.CREATE,
                resource: RESOURCES.SUBSCRIPTION,
                userId: userId,
                resourceId: userId,
                details: {
                    planId: planId,
                    planName: plan.name,
                    amount: trial ? SUBSCRIPTION_CONSTANTS.VERIFICATION_AMOUNT / 100 : plan.amount,
                    trial: trial,
                    reference: response.data.reference
                }
            });

            return {
                status: true,
                data: {
                    authorization_url: response.data.authorization_url,
                    access_code: response.data.access_code,
                    reference: response.data.reference,
                    plan: plan
                }
            };

        } catch (error) {
            console.error('Error creating subscription:', error);
            throw error;
        }
    }

    /**
     * Handle trial callback - verify R1 payment, refund, and create delayed subscription
     * @param {string} reference - Transaction reference
     * @returns {Promise<object>} Trial setup result
     */
    async handleTrialCallback(reference) {
        try {
            // Verify transaction with Paystack
            const paymentData = await this.paystack.verifyTransaction(reference);
            
            if (!paymentData.status || paymentData.data.status !== 'success') {
                throw new Error('Transaction verification failed');
            }

            const userEmail = paymentData.data.customer.email;
            const customerCode = paymentData.data.customer.customer_code;
            const metadata = paymentData.data.metadata || {};
            const planId = metadata.planId;
            const plan = getPlanById(planId);

            if (!plan) {
                throw new Error('Invalid plan ID in metadata');
            }

            // Find user by email
            const userSnapshot = await db.collection('users')
                .where('email', '==', userEmail)
                .limit(1)
                .get();

            if (userSnapshot.empty) {
                throw new Error('User not found');
            }

            const userDoc = userSnapshot.docs[0];
            const userId = userDoc.id;
            
            // Calculate trial end date
            const trialEndDate = new Date();
            trialEndDate.setMinutes(trialEndDate.getMinutes() + SUBSCRIPTION_CONSTANTS.TRIAL_MINUTES);
            
            // Step 1: Issue a refund for the verification amount
            const refundResult = await this.issueVerificationRefund(reference);
            console.log('Refund result:', refundResult);
            
            // Even if refund fails, continue with subscription setup
            if (!refundResult.status) {
                console.error('Failed to issue refund:', refundResult);
            }
            
            // Step 2: Create a subscription with Paystack that starts after trial
            const subscriptionResult = await this.createDelayedSubscription(
                customerCode, 
                plan.planCode, 
                userEmail,
                planId
            );
            
            console.log('Delayed subscription result:', subscriptionResult);

            if (subscriptionResult.status) {
                // Update user subscription status
                await userDoc.ref.update({
                    subscriptionStatus: 'trial',
                    plan: 'premium',
                    lastUpdated: new Date().toISOString()
                });
                
                // Store comprehensive subscription details
                await db.collection('subscriptions').doc(userId).set({
                    userId: userId,
                    email: userEmail,
                    planId: planId,
                    customerCode: customerCode,
                    reference: reference,
                    status: 'trial',
                    trialStartDate: new Date().toISOString(),
                    trialEndDate: trialEndDate.toISOString(),
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    paymentData: paymentData.data,
                    subscriptionData: subscriptionResult.data,
                    subscriptionCode: subscriptionResult.data?.subscription_code || null,
                    planCode: plan.planCode,
                    planName: plan.name,
                    planAmount: plan.amount,
                    planInterval: plan.interval
                });
                
                // Log trial subscription creation
                await logActivity({
                    action: ACTIONS.CREATE,
                    resource: RESOURCES.SUBSCRIPTION,
                    userId: userId,
                    resourceId: reference,
                    details: {
                        type: 'trial',
                        plan: plan.name,
                        amount: SUBSCRIPTION_CONSTANTS.VERIFICATION_AMOUNT / 100,
                        interval: plan.interval,
                        trialDays: SUBSCRIPTION_CONSTANTS.TRIAL_DAYS
                    }
                });

                // Store payment method
                try {
                    if (paymentData.data.authorization) {
                        await this.storePaymentMethod(userId, customerCode, paymentData.data.authorization);
                        console.log('Payment method stored successfully');
                    }
                } catch (paymentMethodError) {
                    console.error('Error storing payment method:', paymentMethodError);
                }

                return {
                    status: true,
                    message: 'Trial subscription setup successfully',
                    data: {
                        userId: userId,
                        trialEndDate: trialEndDate.toISOString(),
                        subscriptionCode: subscriptionResult.data?.subscription_code
                    }
                };
            } else {
                throw new Error('Failed to create delayed subscription');
            }

        } catch (error) {
            console.error('Error handling trial callback:', error);
            throw error;
        }
    }

    /**
     * Handle regular subscription callback - verify payment and activate subscription
     * @param {string} reference - Transaction reference
     * @returns {Promise<object>} Subscription activation result
     */
    async handleRegularSubscriptionCallback(reference) {
        try {
            // Verify transaction with Paystack
            const paymentData = await this.paystack.verifyTransaction(reference);
            
            if (!paymentData.status || paymentData.data.status !== 'success') {
                throw new Error('Transaction verification failed');
            }

            const userEmail = paymentData.data.customer.email;
            const metadata = paymentData.data.metadata || {};
            const planId = metadata.planId;
            const plan = getPlanById(planId);

            if (!plan) {
                throw new Error('Invalid plan ID in metadata');
            }

            // Find user by email
            const userSnapshot = await db.collection('users')
                .where('email', '==', userEmail)
                .limit(1)
                .get();

            if (userSnapshot.empty) {
                throw new Error('User not found');
            }

            const userDoc = userSnapshot.docs[0];
            const userId = userDoc.id;

            // Update user subscription status
            await userDoc.ref.update({
                subscriptionStatus: 'active',
                plan: 'premium',
                lastUpdated: new Date().toISOString()
            });

            // Calculate subscription end date
            const endDate = plan.interval === 'annually' 
                ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() 
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            // Store comprehensive subscription details
            await db.collection('subscriptions').doc(userId).set({
                userId: userId,
                email: userEmail,
                planId: planId || 'unknown',
                reference: reference,
                amount: paymentData.data.amount / 100,
                status: 'active',
                startDate: new Date().toISOString(),
                endDate: endDate,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                transactionData: paymentData.data,
                subscriptionCode: paymentData.data.subscription?.subscription_code || null,
                planCode: plan?.planCode || null,
                planName: plan?.name || 'Unknown Plan',
                planAmount: plan?.amount || 0,
                planInterval: plan?.interval || 'unknown',
                customerCode: paymentData.data.customer?.customer_code || null
            });

            // Log subscription creation
            await logActivity({
                action: ACTIONS.CREATE,
                resource: RESOURCES.SUBSCRIPTION,
                userId: userId,
                resourceId: reference,
                details: {
                    plan: planId || 'unknown',
                    amount: paymentData.data.amount / 100,
                    interval: plan?.interval || 'unknown'
                }
            });

            // Store payment method
            try {
                if (paymentData.data.authorization) {
                    await this.storePaymentMethod(userId, paymentData.data.customer.customer_code, paymentData.data.authorization);
                    console.log('Payment method stored successfully');
                }
            } catch (paymentMethodError) {
                console.error('Error storing payment method:', paymentMethodError);
            }

            return {
                status: true,
                message: 'Subscription activated successfully',
                data: {
                    userId: userId,
                    planId: planId,
                    amount: paymentData.data.amount / 100,
                    endDate: endDate
                }
            };

        } catch (error) {
            console.error('Error handling regular subscription callback:', error);
            throw error;
        }
    }

    /**
     * Handle subscription callback - determines if trial or regular subscription
     * @param {string} reference - Transaction reference
     * @returns {Promise<object>} Subscription setup result
     */
    async handleSubscriptionCallback(reference) {
        try {
            // Verify transaction to get metadata
            const paymentData = await this.paystack.verifyTransaction(reference);
            
            if (!paymentData.status || paymentData.data.status !== 'success') {
                throw new Error('Transaction verification failed');
            }

            const metadata = paymentData.data.metadata || {};
            const isTrial = metadata.isTrial === true;

            if (isTrial) {
                return await this.handleTrialCallback(reference);
            } else {
                return await this.handleRegularSubscriptionCallback(reference);
            }

        } catch (error) {
            console.error('Error handling subscription callback:', error);
            throw error;
        }
    }

    /**
     * Issue a refund for the verification amount
     * @param {string} reference - Transaction reference
     * @returns {Promise<object>} Refund result
     */
    async issueVerificationRefund(reference) {
        const params = {
            transaction: reference,
            merchant_note: "Refund for trial period verification"
        };

        return await this.paystack.issueRefund(params);
    }

    /**
     * Create a subscription with Paystack that starts after trial period
     * @param {string} customerCode - Customer code from Paystack
     * @param {string} planCode - Plan code
     * @param {string} email - User email
     * @param {string} planId - Plan ID
     * @returns {Promise<object>} Subscription creation result
     */
    async createDelayedSubscription(customerCode, planCode, email, planId) {
        // Calculate start date (TRIAL_MINUTES minutes from now)
        const startDate = new Date();
        startDate.setMinutes(startDate.getMinutes() + SUBSCRIPTION_CONSTANTS.TRIAL_MINUTES);
        const formattedStartDate = startDate.toISOString();
        
        const params = {
            customer: customerCode,
            plan: planCode,
            start_date: formattedStartDate
        };

        return await this.paystack.createSubscription(params);
    }

    /**
     * Cancel a subscription
     * @param {string} userId - User ID
     * @returns {Promise<object>} Cancellation result
     */
    async cancelSubscription(userId) {
        try {
            // Get current subscription
            const subscriptionDoc = await db.collection('subscriptions').doc(userId).get();
            if (!subscriptionDoc.exists) {
                throw new Error('No active subscription found');
            }

            const subscriptionData = subscriptionDoc.data();
            const subscriptionCode = subscriptionData.subscriptionCode;

            // Cancel with Paystack if we have a subscription code
            if (subscriptionCode) {
                await this.paystack.cancelSubscription(subscriptionCode);
            }

            // Update local subscription status
            await db.collection('subscriptions').doc(userId).update({
                status: 'cancelled',
                cancelledAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });

            // Update user subscription status
            await db.collection('users').doc(userId).update({
                subscriptionStatus: 'cancelled',
                subscriptionEnd: new Date().toISOString()
            });

            // Log cancellation
            await logActivity({
                action: ACTIONS.UPDATE,
                resource: RESOURCES.SUBSCRIPTION,
                userId: userId,
                resourceId: userId,
                details: {
                    action: 'cancelled',
                    subscriptionCode: subscriptionCode
                }
            });

            return {
                status: true,
                message: 'Subscription cancelled successfully'
            };

        } catch (error) {
            console.error('Error cancelling subscription:', error);
            throw error;
        }
    }

    /**
     * Update subscription plan
     * @param {string} userId - User ID
     * @param {string} newPlanId - New plan identifier
     * @returns {Promise<object>} Update result
     */
    async updateSubscription(userId, newPlanId) {
        try {
            // Get current subscription
            const subscriptionDoc = await db.collection('subscriptions').doc(userId).get();
            if (!subscriptionDoc.exists) {
                throw new Error('No active subscription found');
            }

            const currentSubscription = subscriptionDoc.data();
            const newPlan = getPlanById(newPlanId);
            
            if (!newPlan) {
                throw new Error('Invalid plan ID');
            }

            // Update subscription in database
            await db.collection('subscriptions').doc(userId).update({
                planId: newPlanId,
                planCode: newPlan.planCode,
                planName: newPlan.name,
                planAmount: newPlan.amount,
                planInterval: newPlan.interval,
                lastUpdated: new Date().toISOString()
            });

            // Log plan change
            await logActivity({
                action: ACTIONS.UPDATE,
                resource: RESOURCES.SUBSCRIPTION,
                userId: userId,
                resourceId: userId,
                details: {
                    action: 'plan_change',
                    oldPlanId: currentSubscription.planId,
                    newPlanId: newPlanId,
                    oldAmount: currentSubscription.planAmount,
                    newAmount: newPlan.amount
                }
            });

            return {
                status: true,
                message: 'Subscription plan updated successfully',
                data: {
                    newPlan: newPlan,
                    oldPlan: {
                        id: currentSubscription.planId,
                        name: currentSubscription.planName
                    }
                }
            };

        } catch (error) {
            console.error('Error updating subscription:', error);
            throw error;
        }
    }

    /**
     * Get subscription status
     * @param {string} userId - User ID
     * @returns {Promise<object>} Subscription status
     */
    async getSubscriptionStatus(userId) {
        try {
            // Check subscriptions collection first
            const subscriptionDoc = await db.collection('subscriptions').doc(userId).get();
            const userDoc = await db.collection('users').doc(userId).get();

            if (!userDoc.exists) {
                throw new Error('User not found');
            }

            const userData = userDoc.data();
            let subscriptionData = null;
            let status = 'inactive';

            if (subscriptionDoc.exists) {
                subscriptionData = subscriptionDoc.data();
                status = subscriptionData.status || 'inactive';
            }

            // Get current plan details
            let currentPlan = null;
            if (subscriptionData && subscriptionData.planId) {
                currentPlan = getPlanById(subscriptionData.planId);
            }

            return {
                status: true,
                data: {
                    subscriptionStatus: status,
                    plan: currentPlan,
                    startDate: subscriptionData?.startDate || null,
                    endDate: subscriptionData?.endDate || null,
                    customerCode: subscriptionData?.customerCode || userData.customerCode || null,
                    subscriptionCode: subscriptionData?.subscriptionCode || null,
                    nextBillingDate: subscriptionData?.endDate || null,
                    amount: subscriptionData?.planAmount || 0,
                    currency: 'ZAR'
                }
            };

        } catch (error) {
            console.error('Error getting subscription status:', error);
            throw error;
        }
    }

    // ============================================================================
    // PAYMENT METHODS MANAGEMENT
    // ============================================================================

    /**
     * Get user's payment methods
     * @param {string} userId - User ID
     * @returns {Promise<object>} Payment methods
     */
    async getPaymentMethods(userId) {
        try {
            // Get user's customer code
            const customerCode = await this.getCustomerCode(userId);
            
            if (!customerCode) {
                return {
                    status: true,
                    data: []
                };
            }

            // Get payment methods from database
            const paymentMethodsSnapshot = await db.collection('paymentMethods')
                .where('userId', '==', userId)
                .get();

            const paymentMethods = [];
            paymentMethodsSnapshot.forEach(doc => {
                const data = doc.data();
                paymentMethods.push({
                    id: doc.id,
                    last4: data.last4,
                    brand: data.brand,
                    bank: data.bank,
                    isDefault: data.isDefault || false,
                    createdAt: data.createdAt
                });
            });

            return {
                status: true,
                data: paymentMethods
            };

        } catch (error) {
            console.error('Error getting payment methods:', error);
            throw error;
        }
    }

    /**
     * Add a new payment method
     * @param {string} userId - User ID
     * @param {string} email - User email
     * @param {number} amount - Verification amount (default 100 kobo = R1)
     * @returns {Promise<object>} Payment method setup URL
     */
    async addPaymentMethod(userId, email, amount = 100) {
        try {
            const baseUrl = process.env.APP_URL;
            const customerCode = await this.getCustomerCode(userId);

            // Prepare Paystack request for payment method setup
            const params = {
                email: email,
                amount: amount,
                callback_url: `${baseUrl}/billing/payment-method/callback`,
                metadata: {
                    userId: userId,
                    isPaymentMethodSetup: true,
                    customerCode: customerCode || null
                }
            };

            const response = await this.paystack.initializeTransaction(params);

            return {
                status: true,
                data: {
                    authorization_url: response.data.authorization_url,
                    access_code: response.data.access_code,
                    reference: response.data.reference
                }
            };

        } catch (error) {
            console.error('Error adding payment method:', error);
            throw error;
        }
    }

    /**
     * Update a payment method
     * @param {string} userId - User ID
     * @param {string} paymentMethodId - Payment method ID
     * @param {object} updateData - Data to update
     * @returns {Promise<object>} Update result
     */
    async updatePaymentMethod(userId, paymentMethodId, updateData) {
        try {
            const paymentMethodRef = db.collection('paymentMethods').doc(paymentMethodId);
            const paymentMethodDoc = await paymentMethodRef.get();

            if (!paymentMethodDoc.exists) {
                throw new Error('Payment method not found');
            }

            const paymentMethodData = paymentMethodDoc.data();

            // Verify ownership
            if (paymentMethodData.userId !== userId) {
                throw new Error('Unauthorized');
            }

            // Prepare update
            const updates = {
                lastUpdated: new Date().toISOString(),
                ...updateData
            };

            // If setting as default, unset other defaults
            if (updateData.isDefault === true) {
                const otherMethodsSnapshot = await db.collection('paymentMethods')
                    .where('userId', '==', userId)
                    .where('isDefault', '==', true)
                    .get();

                const batch = db.batch();
                otherMethodsSnapshot.forEach(doc => {
                    if (doc.id !== paymentMethodId) {
                        batch.update(doc.ref, { isDefault: false });
                    }
                });

                if (!otherMethodsSnapshot.empty) {
                    await batch.commit();
                }
            }

            // Update the payment method
            await paymentMethodRef.update(updates);

            return {
                status: true,
                message: 'Payment method updated successfully'
            };

        } catch (error) {
            console.error('Error updating payment method:', error);
            throw error;
        }
    }

    /**
     * Delete a payment method
     * @param {string} userId - User ID
     * @param {string} paymentMethodId - Payment method ID
     * @returns {Promise<object>} Deletion result
     */
    async deletePaymentMethod(userId, paymentMethodId) {
        try {
            const paymentMethodRef = db.collection('paymentMethods').doc(paymentMethodId);
            const paymentMethodDoc = await paymentMethodRef.get();

            if (!paymentMethodDoc.exists) {
                throw new Error('Payment method not found');
            }

            const paymentMethodData = paymentMethodDoc.data();

            // Verify ownership
            if (paymentMethodData.userId !== userId) {
                throw new Error('Unauthorized');
            }

            // Delete from database
            await paymentMethodRef.delete();

            // If this was the default method, set another as default
            if (paymentMethodData.isDefault) {
                const otherMethodsSnapshot = await db.collection('paymentMethods')
                    .where('userId', '==', userId)
                    .limit(1)
                    .get();

                if (!otherMethodsSnapshot.empty) {
                    const firstOtherMethod = otherMethodsSnapshot.docs[0];
                    await firstOtherMethod.ref.update({ isDefault: true });
                }
            }

            return {
                status: true,
                message: 'Payment method deleted successfully'
            };

        } catch (error) {
            console.error('Error deleting payment method:', error);
            throw error;
        }
    }

    // ============================================================================
    // PLANS MANAGEMENT
    // ============================================================================

    /**
     * Get available subscription plans
     * @returns {Promise<object>} Available plans
     */
    async getAvailablePlans() {
        try {
            const plans = Object.values(SUBSCRIPTION_PLANS).map(plan => ({
                id: plan.id,
                name: plan.name,
                amount: plan.amount,
                interval: plan.interval,
                description: plan.description,
                currency: 'ZAR'
            }));

            return {
                status: true,
                data: plans
            };

        } catch (error) {
            console.error('Error getting plans:', error);
            throw error;
        }
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Get customer code for a user
     * @param {string} userId - User ID
     * @returns {Promise<string|null>} Customer code
     */
    async getCustomerCode(userId) {
        try {
            // Check user document first
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.customerCode) {
                    return userData.customerCode;
                }
            }

            // Check subscriptions collection
            const subscriptionDoc = await db.collection('subscriptions').doc(userId).get();
            if (subscriptionDoc.exists) {
                const subscriptionData = subscriptionDoc.data();
                return subscriptionData.customerCode || null;
            }

            return null;

        } catch (error) {
            console.error('Error getting customer code:', error);
            return null;
        }
    }

    /**
     * Calculate next billing date
     * @param {object} subscriptionData - Subscription data
     * @returns {string} Next billing date ISO string
     */
    calculateNextBilling(subscriptionData) {
        const planId = subscriptionData.planId || 'MONTHLY_PLAN';
        const plan = getPlanById(planId);
        
        if (plan && plan.interval === 'annually') {
            return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        } else {
            return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }
    }

    /**
     * Store payment method from authorization data
     * @param {string} userId - User ID
     * @param {string} customerCode - Customer code
     * @param {object} authorization - Authorization data from Paystack
     * @returns {Promise<object>} Storage result
     */
    async storePaymentMethod(userId, customerCode, authorization) {
        try {
            // Check if payment method already exists
            const existingMethodsSnapshot = await db.collection('paymentMethods')
                .where('userId', '==', userId)
                .where('authorization_code', '==', authorization.authorization_code)
                .limit(1)
                .get();

            if (!existingMethodsSnapshot.empty) {
                console.log('Payment method already exists for user:', userId);
                return { status: true, message: 'Payment method already exists' };
            }

            // Check if user has any existing payment methods
            const userMethodsSnapshot = await db.collection('paymentMethods')
                .where('userId', '==', userId)
                .get();

            const isDefault = userMethodsSnapshot.empty; // First payment method becomes default

            // Store payment method
            const paymentMethodData = {
                userId: userId,
                customerCode: customerCode,
                authorization_code: authorization.authorization_code,
                card_type: authorization.card_type,
                last4: authorization.last4,
                exp_month: authorization.exp_month,
                exp_year: authorization.exp_year,
                bank: authorization.bank,
                brand: authorization.brand,
                isDefault: isDefault,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            await db.collection('paymentMethods').add(paymentMethodData);

            return {
                status: true,
                message: 'Payment method stored successfully'
            };

        } catch (error) {
            console.error('Error storing payment method:', error);
            throw error;
        }
    }
}

module.exports = BillingService;
