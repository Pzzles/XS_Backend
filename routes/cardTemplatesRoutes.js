const express = require('express');
const router = express.Router();
const cardTemplatesController = require('../controllers/enterprise/cardTemplatesController');
const { authenticateUser } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateUser);

// Department-level template routes
router.post('/enterprise/:enterpriseId/departments/:departmentId/card-templates', cardTemplatesController.createCardTemplate);
router.get('/enterprise/:enterpriseId/departments/:departmentId/card-templates', cardTemplatesController.getAllCardTemplates);
router.get('/enterprise/:enterpriseId/departments/:departmentId/card-templates/default', cardTemplatesController.getDefaultCardTemplate);
router.get('/enterprise/:enterpriseId/departments/:departmentId/card-templates/:templateId', cardTemplatesController.getCardTemplateById);
router.put('/enterprise/:enterpriseId/departments/:departmentId/card-templates/:templateId', cardTemplatesController.updateCardTemplate);
router.delete('/enterprise/:enterpriseId/departments/:departmentId/card-templates/:templateId', cardTemplatesController.deleteCardTemplate);

// Enterprise-level template routes
router.post('/enterprise/:enterpriseId/card-templates', cardTemplatesController.createCardTemplate);
router.get('/enterprise/:enterpriseId/card-templates', cardTemplatesController.getAllCardTemplates);
router.get('/enterprise/:enterpriseId/card-templates/default', cardTemplatesController.getDefaultCardTemplate);
router.get('/enterprise/:enterpriseId/card-templates/:templateId', cardTemplatesController.getCardTemplateById);
router.put('/enterprise/:enterpriseId/card-templates/:templateId', cardTemplatesController.updateCardTemplate);
router.delete('/enterprise/:enterpriseId/card-templates/:templateId', cardTemplatesController.deleteCardTemplate);

// Apply template to employee
router.post('/enterprise/:enterpriseId/departments/:departmentId/employees/:employeeId/apply-template', cardTemplatesController.applyTemplateToEmployee);

module.exports = router; 