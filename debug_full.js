require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

async function testFullFlow() {
    const apiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey: apiKey });

    try {
        console.log("Creating store...");
        const store = await ai.fileSearchStores.create({
            config: { displayName: 'debug_store' }
        });
        console.log("Store created:", store.name);

        console.log("Uploading file...");
        // Create a dummy file
        fs.writeFileSync('debug_test.txt', 'This is a test file for debugging.');

        const uploadResult = await ai.files.upload({
            file: 'debug_test.txt',
            config: { displayName: 'debug_test.txt', mimeType: 'text/plain' }
        });

        await ai.fileSearchStores.importFile({
            fileSearchStoreName: store.name,
            fileName: uploadResult.name
        });
        console.log("File uploaded and imported.");

        // Wait a bit for indexing (though importFile usually returns operation)
        // The SDK importFile returns an operation, we should wait for it.
        // But for this test, let's just try to generate content.

        console.log("Testing generateContentStream...");
        const result = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: "What is in the test file?",
            config: {
                tools: [{
                    fileSearch: {
                        fileSearchStoreNames: [store.name]
                    }
                }]
            }
        });

        console.log("Result:", result);

        if (!result) {
            console.error("Result is undefined!");
            return;
        }

        console.log("Is async iterable?", typeof result[Symbol.asyncIterator] === 'function');

        for await (const chunk of result) {
            console.log("Chunk received");
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) console.log("Text:", text);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

testFullFlow();
