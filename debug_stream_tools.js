require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function testStreamWithTools() {
    const apiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey: apiKey });

    // Use a dummy store name or one seen in logs if possible, 
    // or just create a quick one if needed, but for now let's try to list stores or just use a random one to see if it fails on the call itself.
    // Actually, if the store doesn't exist, it might throw.
    // Let's try to list stores first to get a valid one.

    try {
        console.log("Listing stores...");
        const stores = await ai.fileSearchStores.list();
        const storeName = stores.fileSearchStores?.[0]?.name;

        if (!storeName) {
            console.log("No stores found, skipping tool test.");
            return;
        }
        console.log("Using store:", storeName);

        console.log("Testing generateContentStream with tools...");
        const result = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: "What is in the text file?",
            config: {
                tools: [{
                    fileSearch: {
                        fileSearchStoreNames: [storeName]
                    }
                }]
            }
        });

        console.log("Result type:", typeof result);
        console.log("Result keys:", Object.keys(result));
        console.log("Is async iterable?", typeof result[Symbol.asyncIterator] === 'function');
        console.log("Has stream property?", result.stream !== undefined);

        if (typeof result[Symbol.asyncIterator] === 'function') {
            console.log("Iterating result...");
            for await (const chunk of result) {
                console.log("Chunk received");
                // console.log(JSON.stringify(chunk, null, 2));
                const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) console.log("Text:", text);
            }
        } else if (result.stream) {
            console.log("Iterating result.stream...");
            for await (const chunk of result.stream) {
                console.log("Chunk received");
            }
        } else {
            console.log("Result is not iterable and has no stream property.");
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

testStreamWithTools();
