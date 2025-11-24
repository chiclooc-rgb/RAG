require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function testStream() {
    const apiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey: apiKey });

    try {
        console.log("Testing generateContentStream...");
        const result = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: "Hello",
        });

        console.log("Iterating stream (result itself)...");
        for await (const chunk of result) {
            console.log("Chunk keys:", Object.keys(chunk));
            console.log("Chunk content:", JSON.stringify(chunk, null, 2));

            // Try to find where the text is
            if (chunk.candidates && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
                console.log("Text found:", chunk.candidates[0].content.parts[0].text);
            }
            break;
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

testStream();
