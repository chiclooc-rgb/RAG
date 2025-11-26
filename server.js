require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY are required in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✓ Connected to Supabase');

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

// Initialize database tables (Supabase tables should be created manually via SQL editor)
// This function verifies that tables exist
async function initializeDatabase() {
    try {
        // Check if files table exists by querying it
        const { data: filesData, error: filesError } = await supabase
            .from('files')
            .select('count')
            .limit(1);

        if (filesError && filesError.code === 'PGRST116') {
            console.error('Error: files table does not exist in Supabase. Please create it using the SQL editor.');
            console.error('Expected schema:');
            console.error(`
                CREATE TABLE files (
                    id TEXT PRIMARY KEY,
                    fileName TEXT NOT NULL UNIQUE,
                    fileSize INTEGER NOT NULL,
                    geminiFileName TEXT NOT NULL,
                    uploadedAt TIMESTAMP DEFAULT NOW(),
                    mimeType TEXT NOT NULL
                )
            `);
            throw new Error('Database tables not initialized');
        }

        // Check if conversations table exists
        const { data: convData, error: convError } = await supabase
            .from('conversations')
            .select('count')
            .limit(1);

        if (convError && convError.code === 'PGRST116') {
            console.error('Error: conversations table does not exist in Supabase. Please create it using the SQL editor.');
            console.error('Expected schema:');
            console.error(`
                CREATE TABLE conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            `);
            throw new Error('Database tables not initialized');
        }

        // Check if chat_history table exists
        const { data: chatData, error: chatError } = await supabase
            .from('chat_history')
            .select('count')
            .limit(1);

        if (chatError && chatError.code === 'PGRST116') {
            console.error('Error: chat_history table does not exist in Supabase. Please create it using the SQL editor.');
            console.error('Expected schema:');
            console.error(`
                CREATE TABLE chat_history (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
            `);
            throw new Error('Database tables not initialized');
        }

        console.log('✓ Database tables verified');
    } catch (error) {
        console.error('Database initialization error:', error.message);
        throw error;
    }
}

// Gemini API Setup with new SDK
// 명시적으로 .env 파일에서 키를 읽기 (환경 변수 무시)
let apiKey = process.env.GEMINI_API_KEY;

// .env 파일에서 직접 읽기 시도
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY=(.+)/);
        if (match && match[1]) {
            const keyFromFile = match[1].trim();
            if (keyFromFile && keyFromFile !== apiKey) {
                console.log('⚠️  Using API key from .env file instead of environment variable');
                apiKey = keyFromFile;
            }
        }
    }
} catch (error) {
    console.error('Error reading .env file:', error.message);
}

console.log('🔑 API Key Status:');
console.log('   - GEMINI_API_KEY loaded:', apiKey ? `Yes (${apiKey.substring(0, 20)}...)` : 'NO');
if (!apiKey) {
    console.error('Error: GEMINI_API_KEY is not set in environment variables or .env file.');
    process.exit(1);
}
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
            return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
        }

        // Fix Korean filename encoding (Windows issue)
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

        // Check if uploaded file is a document
        if (!isDocumentFile(originalName)) {
            // Delete the uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: '지원하지 않는 파일 형식입니다. (.txt, .pdf, .md, .csv만 가능)' });
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

            // Save file metadata to Supabase
            const fileId = uuidv4();
            const fileSize = fs.statSync(filePath).size;

            const { error: insertError } = await supabase
                .from('files')
                .insert({
                    id: fileId,
                    filename: displayName,
                    filesize: fileSize,
                    geminifilename: uploadedFile.name,
                    mimetype: mimeType
                });

            if (insertError) {
                console.error('Error saving file metadata:', insertError);
            } else {
                console.log(`✓ File metadata saved: ${fileId}`);
            }

            res.json({
                success: true,
                message: 'File processed successfully',
                fileName: displayName,
                totalFiles: uploadedFileCount,
                fileId: fileId
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

        // Log detailed error information for debugging
        if (error.response) {
            console.error('API Error Details:', JSON.stringify(error.response, null, 2));
        }
        if (error.status) {
            console.error('API Error Status:', error.status);
        }

        // 에러 메시지를 한국어로 변환
        let koreanError = '파일 업로드 중 오류가 발생했습니다.';

        if (error.message.includes('API key') || error.message.includes('INVALID_ARGUMENT') || error.message.includes('expired')) {
            koreanError = 'API 키 오류: API 키가 만료되었습니다. 새로운 API 키를 입력해주세요.';
        } else if (error.message.includes('File Search Store')) {
            koreanError = '파일 처리 중 오류가 발생했습니다. 다시 시도해주세요.';
        } else if (error.message.includes('429') || error.message.includes('Resource has been exhausted')) {
            koreanError = 'API 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요.';
        } else if (error.message.includes('503')) {
            koreanError = '서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.';
        } else if (error.status === 400) {
            koreanError = '요청이 잘못되었습니다. 파일 형식과 크기를 확인해주세요.';
        } else if (error.status === 401 || error.status === 403) {
            koreanError = '인증 오류: API 키가 유효하지 않습니다.';
        }

        res.status(500).json({ error: koreanError });
    }
});

// 2. Chat (with File Search or basic chat)
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationId } = req.body;

        if (!conversationId) {
            return res.status(400).json({ error: '대화 ID가 필요합니다.' });
        }

        console.log(`Generating response for query: "${message}" in conversation: ${conversationId}`);

        // Save user message to history
        const userId = uuidv4();
        const { error: userError } = await supabase
            .from('chat_history')
            .insert({
                id: userId,
                conversation_id: conversationId,
                role: 'user',
                message: message
            });

        if (userError) {
            console.error('Error saving user message:', userError);
        }

        // Use File Search tool with streaming if files are uploaded, otherwise use basic chat
        let result;
        if (uploadedFileCount > 0 && fileSearchStore) {
            result = await ai.models.generateContentStream({
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
        } else {
            result = await ai.models.generateContentStream({
                model: "gemini-2.5-flash",
                contents: message
            });
        }

        // Set headers for streaming response
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');

        // Collect full response for saving
        let fullResponse = '';

        // Stream chunks to client
        for await (const chunk of result) {
            const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunkText) {
                res.write(chunkText);
                fullResponse += chunkText;
            }
        }

        // Save AI response to history
        const aiId = uuidv4();
        const { error: aiError } = await supabase
            .from('chat_history')
            .insert({
                id: aiId,
                conversation_id: conversationId,
                role: 'assistant',
                message: fullResponse
            });

        if (aiError) {
            console.error('Error saving AI response:', aiError);
        }

        res.end();

    } catch (error) {
        console.error('Chat error:', error);
        if (error.response) {
            console.error('API Error Details:', JSON.stringify(error.response, null, 2));
        }
        if (!res.headersSent) {
            // 에러 메시지를 한국어로 변환
            let koreanError = '대화 중 오류가 발생했습니다.';

            if (error.message.includes('API key')) {
                koreanError = 'API 키 오류: API 키가 만료되었습니다. 새로운 API 키를 입력해주세요.';
            } else if (error.message.includes('429') || error.message.includes('Resource has been exhausted')) {
                koreanError = 'API 사용량이 초과되었습니다. 잠시 후(약 1~2분) 다시 시도해주세요.';
            } else if (error.message.includes('503')) {
                koreanError = '서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.';
            } else if (error.message.includes('Network')) {
                koreanError = '네트워크 연결 오류입니다. 인터넷 연결을 확인해주세요.';
            }

            res.status(500).json({ error: koreanError });
        } else {
            res.end();
        }
    }
});

// 2.5. Validate API Key (test endpoint)
app.get('/api/validate-key', async (req, res) => {
    try {
        console.log('Validating API key...');

        // Try a simple API call to validate the key
        const testResult = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "안녕하세요. 저는 API 키 테스트입니다."
        });

        console.log('✓ API key is valid');
        res.json({
            valid: true,
            message: 'API 키가 유효합니다.'
        });
    } catch (error) {
        console.error('API key validation failed:', error.message);
        if (error.response) {
            console.error('API Error Details:', JSON.stringify(error.response, null, 2));
        }

        let isValid = false;
        let message = '알 수 없는 오류';

        if (error.message.includes('API key') || error.message.includes('expired') || error.message.includes('INVALID_ARGUMENT')) {
            message = 'API 키가 유효하지 않습니다. 새로운 API 키로 업데이트해주세요.';
        } else if (error.message.includes('Network')) {
            message = '네트워크 연결을 확인해주세요.';
        }

        res.json({
            valid: isValid,
            message: message,
            error: error.message
        });
    }
});

// 3. Get files list with metadata
app.get('/api/files', async (req, res) => {
    try {
        const { data: files, error } = await supabase
            .from('files')
            .select('id, filename, filesize, uploadedat')
            .order('uploadedat', { ascending: false });

        if (error) {
            console.error('Error fetching files:', error);
            return res.status(500).json({ error: '파일 목록을 불러올 수 없습니다.', details: error });
        }

        const mappedFiles = files ? files.map(f => ({
            id: f.id,
            fileName: f.filename,
            fileSize: f.filesize,
            uploadedAt: f.uploadedat
        })) : [];

        res.json({
            count: mappedFiles.length,
            files: mappedFiles,
            storeName: fileSearchStore ? fileSearchStore.name : null
        });
    } catch (error) {
        console.error('Error in /api/files:', error);
        res.status(500).json({ error: '파일 목록을 불러올 수 없습니다.', details: error.message });
    }
});

// 4. Create new conversation
app.post('/api/conversations', async (req, res) => {
    try {
        const { title } = req.body;

        if (!title) {
            return res.status(400).json({ error: '대화 제목이 필요합니다.' });
        }

        const conversationId = uuidv4();
        const { error } = await supabase
            .from('conversations')
            .insert({
                id: conversationId,
                title: title
            });

        if (error) {
            console.error('Error creating conversation:', error);
            return res.status(500).json({ error: '대화 생성 실패' });
        }

        res.json({
            success: true,
            conversationId: conversationId
        });
    } catch (error) {
        console.error('Error in /api/conversations POST:', error);
        res.status(500).json({ error: '대화 생성 중 오류 발생' });
    }
});

// 5. Get all conversations
app.get('/api/conversations', async (req, res) => {
    try {
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('id, title, created_at, updated_at')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Error fetching conversations:', error);
            return res.status(500).json({ error: '대화 목록을 불러올 수 없습니다.' });
        }

        res.json({
            conversations: conversations || []
        });
    } catch (error) {
        console.error('Error in /api/conversations GET:', error);
        res.status(500).json({ error: '대화 목록을 불러올 수 없습니다.' });
    }
});

// 6. Get specific conversation
app.get('/api/conversations/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;

        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('id, title, created_at, updated_at')
            .eq('id', conversationId)
            .single();

        if (convError) {
            console.error('Error fetching conversation:', convError);
            return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
        }

        const { data: messages, error: msgError } = await supabase
            .from('chat_history')
            .select('id, role, message, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (msgError) {
            console.error('Error fetching messages:', msgError);
            return res.status(500).json({ error: '메시지를 불러올 수 없습니다.' });
        }

        res.json({
            conversation: conversation,
            messages: messages || []
        });
    } catch (error) {
        console.error('Error in /api/conversations/:id GET:', error);
        res.status(500).json({ error: '대화를 불러올 수 없습니다.' });
    }
});

// 7. Delete all conversations
app.delete('/api/conversations', async (req, res) => {
    try {
        // Delete all chat history first
        const { error: msgError } = await supabase
            .from('chat_history')
            .delete()
            .neq('conversation_id', 'null');

        if (msgError) {
            console.error('Error deleting messages:', msgError);
            return res.status(500).json({ error: '메시지 삭제 실패' });
        }

        // Delete all conversations
        const { error: convError } = await supabase
            .from('conversations')
            .delete()
            .neq('id', 'null');

        if (convError) {
            console.error('Error deleting conversations:', convError);
            return res.status(500).json({ error: '대화 삭제 실패' });
        }

        res.json({
            success: true,
            message: '모든 대화가 삭제되었습니다.'
        });
    } catch (error) {
        console.error('Error in /api/conversations DELETE:', error);
        res.status(500).json({ error: '대화 삭제 중 오류 발생' });
    }
});

// 6. Delete file
app.delete('/api/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;

        // Get file info from Supabase
        const { data: file, error: fetchError } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (fetchError || !file) {
            console.error('Error fetching file:', fetchError);
            return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
        }

        try {
            // Delete from File Search Store
            if (fileSearchStore && file.geminifilename) {
                const deleteResponse = await ai.fileSearchStores.removeFile({
                    fileSearchStoreName: fileSearchStore.name,
                    fileName: file.geminifilename
                });
                console.log(`✓ File removed from store: ${file.geminifilename}`);
            }

            // Delete from Supabase
            const { error: deleteError } = await supabase
                .from('files')
                .delete()
                .eq('id', fileId);

            if (deleteError) {
                console.error('Error deleting file from database:', deleteError);
                return res.status(500).json({ error: '파일 삭제에 실패했습니다.' });
            }

            uploadedFileCount--;
            console.log(`✓ File deleted: ${file.filename}`);
            res.json({
                success: true,
                message: '파일이 삭제되었습니다.',
                fileName: file.filename,
                totalFiles: uploadedFileCount
            });
        } catch (error) {
            console.error('Error deleting from File Search Store:', error);

            // 에러 메시지를 한국어로 변환
            let koreanError = '파일 삭제 중 오류가 발생했습니다.';
            if (error.message.includes('API key')) {
                koreanError = 'API 키 오류입니다. 새로운 API 키를 입력해주세요.';
            }

            res.status(500).json({ error: koreanError });
        }
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: '파일 삭제 중 오류가 발생했습니다.' });
    }
});

// Start server
app.listen(port, async () => {
    console.log(`Server running at http://localhost:3000`);

    // Initialize database
    try {
        await initializeDatabase();

        // Load existing files from Supabase
        const { data: files, error } = await supabase
            .from('files')
            .select('id', { count: 'exact' });

        if (!error && files) {
            uploadedFileCount = files.length;
            console.log(`✓ Loaded ${uploadedFileCount} files from Supabase`);
        }
    } catch (error) {
        console.error('Failed to initialize database:', error);
    }

    // Initialize File Search Store (non-blocking)
    initializeFileSearchStore().catch((error) => {
        console.error('Warning: File Search Store initialization failed. Chat will not work until API key is valid.');
        console.error('Error details:', error.message);
    });

    console.log('Ready to accept requests.');
});
