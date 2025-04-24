const express = require('express');
const router = express.Router();
const enterpriseController = require('../controllers/enterprise/enterpriseController');
const { authenticateUser } = require('../middleware/auth');

// Apply authentication to all enterprise routes
router.use(authenticateUser);

// Enterprise routes
router.get('/enterprises', enterpriseController.getAllEnterprises);
router.post('/enterprises', enterpriseController.createEnterprise);
router.get('/enterprises/:enterpriseId', enterpriseController.getEnterpriseById);
router.put('/enterprises/:enterpriseId', enterpriseController.updateEnterprise);
router.delete('/enterprises/:enterpriseId', enterpriseController.deleteEnterprise);
router.get('/enterprises/:enterpriseId/stats', enterpriseController.getEnterpriseStats);

module.exports = router; 