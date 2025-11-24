const fs = require('fs');

async function testServerUpload() {
    // Create a dummy file
    const filePath = 'test_server_upload.txt';
    fs.writeFileSync(filePath, 'Hello Server Upload');

    const formData = new FormData();
    const file = new Blob([fs.readFileSync(filePath)], { type: 'text/plain' });
    formData.append('file', file, 'test_server_upload.txt');

    try {
        console.log("Sending request to server...");
        const response = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
        });

        const text = await response.text();
        console.log("Response Status:", response.status);
        console.log("Response Body:", text);

    } catch (error) {
        console.error("Request Failed:", error.message);
    }
}

testServerUpload();
