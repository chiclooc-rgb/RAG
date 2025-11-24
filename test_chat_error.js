const fs = require('fs');
const path = require('path');

async function testChatError() {
    // 1. Create a dummy text file with Korean content
    const filePath = path.resolve('데미안_서문.txt');
    fs.writeFileSync(filePath, '새는 알에서 나오려고 투쟁한다. 알은 세계이다. 태어나려는 자는 하나의 세계를 깨뜨려야 한다.');

    // 2. Upload the file
    const formData = new FormData();
    // Node.js fetch FormData might need specific handling for non-ASCII filenames in headers if not handled by the lib
    // But let's try standard append
    const fileBlob = new Blob([fs.readFileSync(filePath)], { type: 'application/octet-stream' });
    formData.append('file', fileBlob, '데미안_서문.txt');

    console.log('Uploading file...');
    const uploadRes = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData
    });

    const uploadData = await uploadRes.json();
    console.log('Upload Result:', uploadData);

    if (!uploadData.success) {
        console.error('Upload failed, cannot proceed to chat test.');
        return;
    }

    // 3. Send a chat message
    console.log('Sending chat message...');
    const chatRes = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Summarize this file.' })
    });

    if (chatRes.ok) {
        console.log('Chat success!');
        // Read stream
        const reader = chatRes.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            process.stdout.write(decoder.decode(value));
        }
        console.log('\nDone.');
    } else {
        console.error('Chat failed!');
        console.error('Status:', chatRes.status);
        const errText = await chatRes.text();
        console.error('Error Body:', errText);
    }
}

testChatError();
