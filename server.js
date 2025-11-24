require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Multer setup - save files with original names
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Fix Korean filename encoding
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, originalName);
    }
});

const upload = multer({ storage: storage });

// Helper: Check if file is a supported document
const SUPPORTED_EXTENSIONS = ['.txt', '.pdf', '.md', '.csv'];
function isDocumentFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
}

// Gemini API Setup with new SDK
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

// File Search Store (will be created on startup)
let fileSearchStore = null;
let uploadedFileCount = 0;

// Create or get File Search Store on startup
async function initializeFileSearchStore() {
    console.log('Initializing File Search Store...');

    try {
        // Create a new File Search Store
        fileSearchStore = await ai.fileSearchStores.create({
            config: {
                displayName: 'gemini-rag-document-store'
            }
        });

        console.log(`✓ File Search Store created: ${fileSearchStore.name}`);

        // Load existing files from uploads/ directory
        await loadExistingFiles();

    } catch (error) {
        console.error('Failed to initialize File Search Store:', error);
        throw error;
    }
}

// Auto-load files from uploads/ on startup
async function loadExistingFiles() {
    console.log('Scanning uploads/ for existing files...');

    if (!fs.existsSync(uploadDir)) {
        console.log('No uploads directory found.');
        return;
    }

    const files = fs.readdirSync(uploadDir);

    for (const filename of files) {
        const filePath = path.join(uploadDir, filename);
        const stats = fs.statSync(filePath);

        if (!stats.isFile()) continue;

        // Only process document files
        if (!isDocumentFile(filename)) {
            console.log(`Skipping non-document file: ${filename}`);
            continue;
        }

        // Determine MIME type
        const ext = path.extname(filename).toLowerCase();
        let mimeType = 'text/plain';
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.csv') mimeType = 'text/csv';
        else if (ext === '.md') mimeType = 'text/markdown';

        // Create a temporary ASCII filename to avoid SDK encoding issues
        const tempFilename = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
        const tempFilePath = path.join(uploadDir, tempFilename);

        try {
            // Copy file to temp path
            fs.copyFileSync(filePath, tempFilePath);
            console.log(`Created temp file: ${tempFilename} for upload`);

            console.log(`Uploading ${filename} to Files API...`);

            // Step 1: Upload to Files API using temp file path
            const uploadedFile = await ai.files.upload({
                file: tempFilePath,
                config: {
                    displayName: filename,
                    mimeType: mimeType
                }
            });

            console.log(`File uploaded: ${uploadedFile.name}, importing to store...`);

            // Step 2: Import to File Search Store
            let operation = await ai.fileSearchStores.importFile({
                fileSearchStoreName: fileSearchStore.name,
                fileName: uploadedFile.name
            });

            // Wait for operation to complete
            while (!operation.done) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                operation = await ai.operations.get({ operation: operation });
            }

            uploadedFileCount++;
            console.log(`✓ Loaded: ${filename}`);

        } catch (error) {
            console.error(`Failed to load ${filename}:`, error.message);
        } finally {
            // Cleanup temp file
            if (fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (e) {
                    console.error(`Failed to delete temp file ${tempFilePath}:`, e.message);
                }
            }
        }
    }

    console.log(`Total files loaded: ${uploadedFileCount}`);
}

// Routes

// 1. Upload File
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Fix Korean filename encoding (Windows issue)
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

        // Check if uploaded file is a document
        if (!isDocumentFile(originalName)) {
            // Delete the uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Only document files are allowed (.txt, .pdf, .md, .csv)' });
        }

        // Use absolute path to avoid Windows path issues
        const filePath = path.resolve(req.file.path);
        const displayName = originalName;

        console.log(`Uploading ${displayName} to Files API...`);

        // Determine MIME type
        const ext = path.extname(displayName).toLowerCase();
        let mimeType = 'text/plain';
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.csv') mimeType = 'text/csv';
        else if (ext === '.md') mimeType = 'text/markdown';

        // Create a temporary ASCII filename to avoid SDK encoding issues
        const tempFilename = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
        const tempFilePath = path.join(uploadDir, tempFilename);

        try {
            // Copy file to temp path
            fs.copyFileSync(filePath, tempFilePath);
            console.log(`Created temp file: ${tempFilename} for upload`);

            // Step 1: Upload to Files API using temp file path
            const uploadedFile = await ai.files.upload({
                file: tempFilePath,
                config: {
                    displayName: displayName,
                    mimeType: mimeType
                }
            });

            console.log(`File uploaded: ${uploadedFile.name}, importing to store...`);

            // Step 2: Import to File Search Store
            let operation = await ai.fileSearchStores.importFile({
                fileSearchStoreName: fileSearchStore.name,
                fileName: uploadedFile.name
            });

            // Wait for operation to complete
            while (!operation.done) {
                console.log('Processing...');
                await new Promise((resolve) => setTimeout(resolve, 2000));
                operation = await ai.operations.get({ operation: operation });
            }

            uploadedFileCount++;
            console.log(`✓ File uploaded: ${displayName}`);

            res.json({
                success: true,
                message: 'File processed successfully',
                fileName: displayName,
                totalFiles: uploadedFileCount
            });

        } finally {
            // Cleanup temp file
            if (fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (e) {
                    console.error(`Failed to delete temp file ${tempFilePath}:`, e.message);
                }
            }
        }

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Chat (with File Search)
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (uploadedFileCount === 0) {
            return res.status(400).json({ error: 'Please upload a document first.' });
        }

        console.log(`Generating response for query: "${message}" with ${uploadedFileCount} file(s)`);

        // Use File Search tool with streaming
        const result = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: message,
            config: {
                tools: [{
                    fileSearch: {
                        fileSearchStoreNames: [fileSearchStore.name]
                    }
                }]
            }
        });

        // Set headers for streaming response
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');

        // Stream chunks to client
        for await (const chunk of result) {
            const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunkText) {
                res.write(chunkText);
            }
        }

        res.end();

    } catch (error) {
        console.error('Chat error:', error);
        if (error.response) {
            console.error('API Error Details:', JSON.stringify(error.response, null, 2));
        }
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.end();
        }
    }
});

// 3. Get file count
app.get('/api/files', (req, res) => {
    res.json({
        count: uploadedFileCount,
        storeName: fileSearchStore ? fileSearchStore.name : null
    });
});

// Start server
app.listen(port, async () => {
    console.log(`Server running at http://localhost:3000`);
    await initializeFileSearchStore();
    console.log('Ready to accept requests.');
});
