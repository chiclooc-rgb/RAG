require('dotenv').config();
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const fs = require('fs');

async function testUpload() {
    const apiKey = process.env.GEMINI_API_KEY;
    const fileManager = new GoogleAIFileManager(apiKey);

    // Create a dummy file
    fs.writeFileSync('test_upload.txt', 'Hello Gemini File API');

    try {
        console.log("Attempting to upload file...");
        const uploadResponse = await fileManager.uploadFile('test_upload.txt', {
            mimeType: 'text/plain',
            displayName: 'Test File',
        });

        console.log("Upload Success!");
        console.log("File URI:", uploadResponse.file.uri);
        console.log("File State:", uploadResponse.file.state);

    } catch (error) {
        console.error("Upload Failed:", error.message);
        if (error.response) {
            console.error("Error Details:", JSON.stringify(error.response, null, 2));
        }
    }
}

testUpload();
