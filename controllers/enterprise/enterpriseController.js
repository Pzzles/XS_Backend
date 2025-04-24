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

// Get all enterprises
exports.getAllEnterprises = async (req, res) => {
    try {
        const enterprisesRef = db.collection('enterprise');
        const snapshot = await enterprisesRef.get();
        
        if (snapshot.empty) {
            return res.status(200).send({ 
                success: true,
                enterprises: [],
                message: 'No enterprises found'
            });
        }

        const enterprises = [];
        snapshot.forEach(doc => {
            enterprises.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).send({
            success: true,
            enterprises
        });
    } catch (error) {
        sendError(res, 500, 'Error fetching enterprises', error);
    }
};

// Get a specific enterprise by ID
exports.getEnterpriseById = async (req, res) => {
    try {
        const { enterpriseId } = req.params;
        
        if (!enterpriseId) {
            return sendError(res, 400, 'Enterprise ID is required');
        }

        const enterpriseRef = db.collection('enterprise').doc(enterpriseId);
        const doc = await enterpriseRef.get();
        
        if (!doc.exists) {
            return sendError(res, 404, 'Enterprise not found');
        }

        res.status(200).send({
            success: true,
            enterprise: {
                id: doc.id,
                ...doc.data()
            }
        });
    } catch (error) {
        sendError(res, 500, 'Error fetching enterprise', error);
    }
};

// Create a new enterprise
exports.createEnterprise = async (req, res) => {
    try {
        const { name, description, industry, website, logoUrl, colorScheme, address, companySize } = req.body;
        
        if (!name) {
            return sendError(res, 400, 'Enterprise name is required');
        }

        // Convert enterprise name to a URL-friendly slug
        const slugify = str => str.toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove non-word chars
            .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
            .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
            
        const enterpriseId = slugify(name);
        
        // Check for duplicate enterprise name
        const duplicateCheck = await db.collection('enterprise')
            .where('name', '==', name)
            .get();
            
        if (!duplicateCheck.empty) {
            return sendError(res, 409, 'An enterprise with this name already exists');
        }
        
        // Check if an enterprise with this ID already exists
        const existingDocCheck = await db.collection('enterprise')
            .doc(enterpriseId)
            .get();
            
        if (existingDocCheck.exists) {
            return sendError(res, 409, 'An enterprise with a similar name already exists');
        }

        // Create enterprise data object
        const enterpriseData = {
            name,
            description: description || '',
            industry: industry || '',
            website: website || '',
            logoUrl: logoUrl || null,
            colorScheme: colorScheme || '#1B2B5B', // Default color scheme
            companySize: companySize || 'unknown', // Add company size field
            address: address || {},
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
            departmentCount: 0,
            employeeCount: 0
        };

        // Use the document reference with our custom ID
        const newEnterpriseRef = db.collection('enterprise').doc(enterpriseId);
        await newEnterpriseRef.set(enterpriseData);
        
        console.log(`Created enterprise with ID: ${enterpriseId}`);

        res.status(201).send({
            success: true,
            message: 'Enterprise created successfully',
            enterprise: {
                id: enterpriseId,
                ...enterpriseData,
                createdAt: enterpriseData.createdAt.toDate().toISOString(),
                updatedAt: enterpriseData.updatedAt.toDate().toISOString()
            }
        });
    } catch (error) {
        sendError(res, 500, 'Error creating enterprise', error);
    }
};

// Update an enterprise
exports.updateEnterprise = async (req, res) => {
    try {
        const { enterpriseId } = req.params;
        const { name, description, industry, website, logoUrl, colorScheme, address, companySize } = req.body;
        
        if (!enterpriseId) {
            return sendError(res, 400, 'Enterprise ID is required');
        }

        // Check if enterprise exists
        const enterpriseRef = db.collection('enterprise').doc(enterpriseId);
        const enterpriseDoc = await enterpriseRef.get();
        
        if (!enterpriseDoc.exists) {
            return sendError(res, 404, 'Enterprise not found');
        }

        // Check for duplicate name if name is being updated
        if (name && name !== enterpriseDoc.data().name) {
            const duplicateCheck = await db.collection('enterprise')
                .where('name', '==', name)
                .get();
                
            if (!duplicateCheck.empty) {
                return sendError(res, 409, 'An enterprise with this name already exists');
            }
        }

        // Prepare update data
        const updateData = {
            updatedAt: admin.firestore.Timestamp.now()
        };

        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (industry !== undefined) updateData.industry = industry;
        if (website !== undefined) updateData.website = website;
        if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
        if (colorScheme !== undefined) updateData.colorScheme = colorScheme;
        if (address !== undefined) updateData.address = address;
        if (companySize !== undefined) updateData.companySize = companySize;

        // Update the enterprise
        await enterpriseRef.update(updateData);

        // Get updated document
        const updatedDoc = await enterpriseRef.get();
        const updatedData = updatedDoc.data();

        res.status(200).send({
            success: true,
            message: 'Enterprise updated successfully',
            enterprise: {
                id: enterpriseId,
                ...updatedData,
                createdAt: updatedData.createdAt.toDate().toISOString(),
                updatedAt: updatedData.updatedAt.toDate().toISOString()
            }
        });
    } catch (error) {
        sendError(res, 500, 'Error updating enterprise', error);
    }
};

// Delete an enterprise
exports.deleteEnterprise = async (req, res) => {
    try {
        const { enterpriseId } = req.params;
        
        if (!enterpriseId) {
            return sendError(res, 400, 'Enterprise ID is required');
        }

        // Check if enterprise exists
        const enterpriseRef = db.collection('enterprise').doc(enterpriseId);
        const enterpriseDoc = await enterpriseRef.get();
        
        if (!enterpriseDoc.exists) {
            return sendError(res, 404, 'Enterprise not found');
        }

        // Check if enterprise has departments
        const departmentsSnapshot = await enterpriseRef.collection('departments').get();
        if (!departmentsSnapshot.empty) {
            return sendError(res, 409, 'Cannot delete an enterprise with departments. Delete departments first.');
        }

        // Delete the enterprise
        await enterpriseRef.delete();

        res.status(200).send({
            success: true,
            message: 'Enterprise deleted successfully',
            enterpriseId
        });
    } catch (error) {
        sendError(res, 500, 'Error deleting enterprise', error);
    }
};

// Get enterprise statistics
exports.getEnterpriseStats = async (req, res) => {
    try {
        const { enterpriseId } = req.params;
        
        if (!enterpriseId) {
            return sendError(res, 400, 'Enterprise ID is required');
        }

        const enterpriseRef = db.collection('enterprise').doc(enterpriseId);
        const enterpriseDoc = await enterpriseRef.get();
        
        if (!enterpriseDoc.exists) {
            return sendError(res, 404, 'Enterprise not found');
        }

        // Get department count
        const departmentsSnapshot = await enterpriseRef.collection('departments').get();
        const departmentCount = departmentsSnapshot.size;
        
        // Count employees across all departments
        let totalEmployeeCount = 0;
        const departmentStats = [];
        
        for (const deptDoc of departmentsSnapshot.docs) {
            const employeesSnapshot = await deptDoc.ref.collection('employees').get();
            const employeeCount = employeesSnapshot.size;
            totalEmployeeCount += employeeCount;
            
            departmentStats.push({
                id: deptDoc.id,
                name: deptDoc.data().name,
                employeeCount
            });
        }

        // Update the enterprise document with the counts
        await enterpriseRef.update({
            departmentCount,
            employeeCount: totalEmployeeCount,
            updatedAt: admin.firestore.Timestamp.now()
        });

        res.status(200).send({
            success: true,
            stats: {
                enterpriseId,
                name: enterpriseDoc.data().name,
                departmentCount,
                employeeCount: totalEmployeeCount,
                departments: departmentStats
            }
        });
    } catch (error) {
        sendError(res, 500, 'Error fetching enterprise statistics', error);
    }
}; 