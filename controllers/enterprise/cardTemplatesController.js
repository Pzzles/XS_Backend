const { db, admin } = require('../../firebase.js');

// Helper function for standardized error responses
const sendError = (res, status, message, error = null) => {
    console.error(`${message}:`, error);
    res.status(status).send({ 
        success: false,
        message,
        ...(error && { error: error.message })
    });
};

// Create a new card template
exports.createCardTemplate = async (req, res) => {
    try {
        const { enterpriseId, departmentId } = req.params;
        const { 
            name, 
            description, 
            colorScheme, 
            companyLogo, 
            isDefault = false, 
            defaultFields = {} 
        } = req.body;
        
        if (!enterpriseId) {
            return sendError(res, 400, 'Enterprise ID is required');
        }
        
        if (!name) {
            return sendError(res, 400, 'Template name is required');
        }

        // Ensure defaultFields.socials is an empty object if not provided
        if (defaultFields && !defaultFields.socials) {
            defaultFields.socials = {};
        }

        // Convert template name to a URL-friendly slug for the ID
        const slugify = str => str.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
            
        const templateId = slugify(name);
        
        let templateRef;
        
        // Determine if this is department-level or enterprise-level template
        if (departmentId) {
            // Check if department exists
            const departmentRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('departments')
                .doc(departmentId);
                
            const departmentDoc = await departmentRef.get();
            
            if (!departmentDoc.exists) {
                return sendError(res, 404, 'Department not found');
            }
            
            templateRef = departmentRef.collection('cardTemplates').doc(templateId);
        } else {
            // Enterprise-level template
            const enterpriseRef = db.collection('enterprise').doc(enterpriseId);
            const enterpriseDoc = await enterpriseRef.get();
            
            if (!enterpriseDoc.exists) {
                return sendError(res, 404, 'Enterprise not found');
            }
            
            templateRef = enterpriseRef.collection('cardTemplates').doc(templateId);
        }
        
        // Check if template with this name already exists
        const templateDoc = await templateRef.get();
        if (templateDoc.exists) {
            return sendError(res, 409, 'A template with this name already exists');
        }
        
        // If setting as default, need to update any existing default
        if (isDefault) {
            let templateCollectionRef;
            if (departmentId) {
                templateCollectionRef = db.collection('enterprise')
                    .doc(enterpriseId)
                    .collection('departments')
                    .doc(departmentId)
                    .collection('cardTemplates');
            } else {
                templateCollectionRef = db.collection('enterprise')
                    .doc(enterpriseId)
                    .collection('cardTemplates');
            }
            
            // Find current default template
            const defaultTemplatesQuery = await templateCollectionRef.where('isDefault', '==', true).get();
            
            // Use transaction to ensure consistency
            await db.runTransaction(async (transaction) => {
                // Reset any existing defaults
                defaultTemplatesQuery.forEach(doc => {
                    transaction.update(doc.ref, { isDefault: false });
                });
                
                // Create the new template
                const templateData = {
                    name,
                    description: description || '',
                    colorScheme: colorScheme || '#1B2B5B',
                    companyLogo: companyLogo || null,
                    isDefault,
                    defaultFields,
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now()
                };
                
                transaction.set(templateRef, templateData);
            });
        } else {
            // Just create the new template without changing defaults
            const templateData = {
                name,
                description: description || '',
                colorScheme: colorScheme || '#1B2B5B',
                companyLogo: companyLogo || null,
                isDefault,
                defaultFields,
                createdAt: admin.firestore.Timestamp.now(),
                updatedAt: admin.firestore.Timestamp.now()
            };
            
            await templateRef.set(templateData);
        }
        
        // Get the created template
        const createdTemplateDoc = await templateRef.get();
        const createdTemplate = createdTemplateDoc.data();
        
        res.status(201).send({
            success: true,
            message: 'Card template created successfully',
            template: {
                id: templateId,
                ...createdTemplate,
                createdAt: createdTemplate.createdAt.toDate().toISOString(),
                updatedAt: createdTemplate.updatedAt.toDate().toISOString()
            }
        });
    } catch (error) {
        sendError(res, 500, 'Error creating card template', error);
    }
};

// Get all card templates for a department or enterprise
exports.getAllCardTemplates = async (req, res) => {
    try {
        const { enterpriseId, departmentId } = req.params;
        
        if (!enterpriseId) {
            return sendError(res, 400, 'Enterprise ID is required');
        }

        let templatesRef;
        if (departmentId) {
            // Department-level templates
            templatesRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('departments')
                .doc(departmentId)
                .collection('cardTemplates');
        } else {
            // Enterprise-level templates
            templatesRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('cardTemplates');
        }
            
        const snapshot = await templatesRef.get();
        
        if (snapshot.empty) {
            return res.status(200).send({ 
                success: true,
                templates: [],
                message: 'No templates found'
            });
        }

        const templates = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            templates.push({
                id: doc.id,
                name: data.name,
                description: data.description,
                colorScheme: data.colorScheme,
                isDefault: data.isDefault,
                createdAt: data.createdAt.toDate().toISOString()
            });
        });

        res.status(200).send({
            success: true,
            templates
        });
    } catch (error) {
        sendError(res, 500, 'Error fetching card templates', error);
    }
};

// Get default card template
exports.getDefaultCardTemplate = async (req, res) => {
    try {
        const { enterpriseId, departmentId } = req.params;
        
        if (!enterpriseId) {
            return sendError(res, 400, 'Enterprise ID is required');
        }

        let templatesRef;
        if (departmentId) {
            // Department-level templates
            templatesRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('departments')
                .doc(departmentId)
                .collection('cardTemplates');
        } else {
            // Enterprise-level templates
            templatesRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('cardTemplates');
        }
            
        const snapshot = await templatesRef.where('isDefault', '==', true).limit(1).get();
        
        if (snapshot.empty) {
            // If department-level query is empty and we were looking for department template,
            // try to fall back to enterprise-level template
            if (departmentId) {
                return res.status(200).send({ 
                    success: true,
                    template: null,
                    message: 'No default template found for this department, try enterprise default'
                });
            }
            
            return res.status(200).send({ 
                success: true,
                template: null,
                message: 'No default template found'
            });
        }

        const defaultTemplate = snapshot.docs[0];
        const templateData = defaultTemplate.data();
        
        res.status(200).send({
            success: true,
            template: {
                id: defaultTemplate.id,
                ...templateData,
                createdAt: templateData.createdAt.toDate().toISOString(),
                updatedAt: templateData.updatedAt.toDate().toISOString()
            }
        });
    } catch (error) {
        sendError(res, 500, 'Error fetching default card template', error);
    }
};

// Get template by ID
exports.getCardTemplateById = async (req, res) => {
    try {
        const { enterpriseId, departmentId, templateId } = req.params;
        
        if (!enterpriseId || !templateId) {
            return sendError(res, 400, 'Enterprise ID and Template ID are required');
        }

        let templateRef;
        if (departmentId) {
            // Department-level template
            templateRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('departments')
                .doc(departmentId)
                .collection('cardTemplates')
                .doc(templateId);
        } else {
            // Enterprise-level template
            templateRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('cardTemplates')
                .doc(templateId);
        }
            
        const templateDoc = await templateRef.get();
        
        if (!templateDoc.exists) {
            return sendError(res, 404, 'Template not found');
        }

        const templateData = templateDoc.data();
        
        res.status(200).send({
            success: true,
            template: {
                id: templateDoc.id,
                ...templateData,
                createdAt: templateData.createdAt.toDate().toISOString(),
                updatedAt: templateData.updatedAt.toDate().toISOString()
            }
        });
    } catch (error) {
        sendError(res, 500, 'Error fetching card template', error);
    }
};

// Update template by ID
exports.updateCardTemplate = async (req, res) => {
    try {
        const { enterpriseId, departmentId, templateId } = req.params;
        const { 
            name, 
            description, 
            colorScheme, 
            companyLogo, 
            isDefault, 
            defaultFields 
        } = req.body;
        
        if (!enterpriseId || !templateId) {
            return sendError(res, 400, 'Enterprise ID and Template ID are required');
        }

        let templateRef;
        let templateCollectionRef;
        
        if (departmentId) {
            // Department-level template
            templateRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('departments')
                .doc(departmentId)
                .collection('cardTemplates')
                .doc(templateId);
                
            templateCollectionRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('departments')
                .doc(departmentId)
                .collection('cardTemplates');
        } else {
            // Enterprise-level template
            templateRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('cardTemplates')
                .doc(templateId);
                
            templateCollectionRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('cardTemplates');
        }
            
        const templateDoc = await templateRef.get();
        
        if (!templateDoc.exists) {
            return sendError(res, 404, 'Template not found');
        }

        // Prepare update data
        const updateData = {
            updatedAt: admin.firestore.Timestamp.now()
        };

        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (colorScheme !== undefined) updateData.colorScheme = colorScheme;
        if (companyLogo !== undefined) updateData.companyLogo = companyLogo;
        if (defaultFields !== undefined) updateData.defaultFields = defaultFields;
        
        // Handle default status changes in a transaction if needed
        if (isDefault !== undefined) {
            updateData.isDefault = isDefault;
            
            if (isDefault === true) {
                // Need to update any existing defaults
                await db.runTransaction(async (transaction) => {
                    // Find and update current default templates
                    const defaultTemplatesQuery = await templateCollectionRef.where('isDefault', '==', true).get();
                    
                    defaultTemplatesQuery.forEach(doc => {
                        if (doc.id !== templateId) { // Don't update the current template yet
                            transaction.update(doc.ref, { isDefault: false });
                        }
                    });
                    
                    // Update the current template
                    transaction.update(templateRef, updateData);
                });
            } else {
                // Just update this template
                await templateRef.update(updateData);
            }
        } else {
            // No changes to default status, just update
            await templateRef.update(updateData);
        }
        
        // Get the updated template
        const updatedTemplateDoc = await templateRef.get();
        const updatedTemplateData = updatedTemplateDoc.data();
        
        res.status(200).send({
            success: true,
            message: 'Card template updated successfully',
            template: {
                id: templateId,
                ...updatedTemplateData,
                createdAt: updatedTemplateData.createdAt.toDate().toISOString(),
                updatedAt: updatedTemplateData.updatedAt.toDate().toISOString()
            }
        });
    } catch (error) {
        sendError(res, 500, 'Error updating card template', error);
    }
};

// Delete template by ID
exports.deleteCardTemplate = async (req, res) => {
    try {
        const { enterpriseId, departmentId, templateId } = req.params;
        
        if (!enterpriseId || !templateId) {
            return sendError(res, 400, 'Enterprise ID and Template ID are required');
        }

        let templateRef;
        if (departmentId) {
            // Department-level template
            templateRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('departments')
                .doc(departmentId)
                .collection('cardTemplates')
                .doc(templateId);
        } else {
            // Enterprise-level template
            templateRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('cardTemplates')
                .doc(templateId);
        }
            
        const templateDoc = await templateRef.get();
        
        if (!templateDoc.exists) {
            return sendError(res, 404, 'Template not found');
        }

        const templateData = templateDoc.data();
        
        // If this is the default template, don't allow deletion
        if (templateData.isDefault) {
            return sendError(res, 400, 'Cannot delete the default template. Set another template as default first.');
        }
        
        // Delete the template
        await templateRef.delete();
        
        res.status(200).send({
            success: true,
            message: 'Card template deleted successfully',
            templateId
        });
    } catch (error) {
        sendError(res, 500, 'Error deleting card template', error);
    }
};

// Apply template to employee card
exports.applyTemplateToEmployee = async (req, res) => {
    try {
        const { enterpriseId, departmentId, employeeId } = req.params;
        const { templateId, overrideFields = {} } = req.body;
        
        if (!enterpriseId || !departmentId || !employeeId) {
            return sendError(res, 400, 'Enterprise ID, Department ID, and Employee ID are required');
        }
        
        if (!templateId) {
            return sendError(res, 400, 'Template ID is required');
        }

        // Get the employee
        const employeeRef = db.collection('enterprise')
            .doc(enterpriseId)
            .collection('departments')
            .doc(departmentId)
            .collection('employees')
            .doc(employeeId);
            
        const employeeDoc = await employeeRef.get();
        
        if (!employeeDoc.exists) {
            return sendError(res, 404, 'Employee not found');
        }
        
        const employeeData = employeeDoc.data();
        
        // Check if employee has a card reference
        if (!employeeData.cardsRef) {
            return sendError(res, 404, 'Employee has no associated card');
        }
        
        // Get the template - first try department level
        let templateDoc;
        
        // Try department template first
        let departmentTemplateRef = db.collection('enterprise')
            .doc(enterpriseId)
            .collection('departments')
            .doc(departmentId)
            .collection('cardTemplates')
            .doc(templateId);
            
        templateDoc = await departmentTemplateRef.get();
        
        // If template not found at department level, try enterprise level
        if (!templateDoc.exists) {
            const enterpriseTemplateRef = db.collection('enterprise')
                .doc(enterpriseId)
                .collection('cardTemplates')
                .doc(templateId);
                
            templateDoc = await enterpriseTemplateRef.get();
            
            if (!templateDoc.exists) {
                return sendError(res, 404, 'Template not found at department or enterprise level');
            }
        }
        
        const templateData = templateDoc.data();
        
        // Get the employee's card
        const cardsRef = employeeData.cardsRef;
        const cardsDoc = await cardsRef.get();
        
        if (!cardsDoc.exists || !cardsDoc.data().cards || !Array.isArray(cardsDoc.data().cards)) {
            return sendError(res, 404, 'Employee card data is invalid or not found');
        }
        
        const cardsData = cardsDoc.data();
        
        // Update the card with template data and overrides
        let updatedCards = [...cardsData.cards];
        
        // Usually update the first card (main card)
        if (updatedCards.length > 0) {
            const mainCard = updatedCards[0];
            
            // Initialize socials if it doesn't exist
            if (!mainCard.socials) {
                mainCard.socials = {};
            }
            
            // Apply template defaults
            const updatedCard = {
                ...mainCard,
                // Apply template values
                colorScheme: templateData.colorScheme || mainCard.colorScheme
            };
            
            // Apply template default fields
            if (templateData.defaultFields) {
                if (templateData.defaultFields.company) updatedCard.company = templateData.defaultFields.company;
                if (templateData.defaultFields.title) updatedCard.occupation = templateData.defaultFields.title;
                
                // Ensure socials is properly initialized in the updated card
                if (!updatedCard.socials) {
                    updatedCard.socials = {};
                }
                
                // Apply template socials if they exist
                if (templateData.defaultFields.socials) {
                    updatedCard.socials = { 
                        ...updatedCard.socials, 
                        ...templateData.defaultFields.socials 
                    };
                }
            }
            
            // Apply logo if specified in template
            if (templateData.companyLogo) {
                updatedCard.companyLogo = templateData.companyLogo;
            }
            
            // Ensure socials is initialized before applying overrides
            if (!updatedCard.socials) {
                updatedCard.socials = {};
            }
            
            // Apply user overrides on top of template
            if (overrideFields.company) updatedCard.company = overrideFields.company;
            if (overrideFields.title) updatedCard.occupation = overrideFields.title;
            if (overrideFields.colorScheme) updatedCard.colorScheme = overrideFields.colorScheme;
            if (overrideFields.socials) {
                updatedCard.socials = { 
                    ...updatedCard.socials, 
                    ...overrideFields.socials 
                };
            }
            if (overrideFields.companyLogo) updatedCard.companyLogo = overrideFields.companyLogo;
            
            // Update the card in the array
            updatedCards[0] = updatedCard;
            
            // Update the card document
            await cardsRef.update({
                cards: updatedCards
            });
            
            // Update employee with template reference
            await employeeRef.update({
                cardTemplateRef: templateDoc.ref,
                cardTemplateId: templateId,
                updatedAt: admin.firestore.Timestamp.now()
            });
            
            // Format the updated card for response
            const formattedCard = {
                ...updatedCard,
                createdAt: updatedCard.createdAt && updatedCard.createdAt.toDate 
                    ? updatedCard.createdAt.toDate().toISOString()
                    : (updatedCard.createdAt || new Date().toISOString())
            };
            
            res.status(200).send({
                success: true,
                message: 'Template applied to employee card successfully',
                card: formattedCard,
                templateId: templateId,
                templateName: templateData.name
            });
        } else {
            return sendError(res, 404, 'No cards found for this employee');
        }
    } catch (error) {
        sendError(res, 500, 'Error applying template to employee card', error);
    }
}; 