const fetch = require('node-fetch');

async function testChat() {
    try {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '데미안 서문의 내용은 무엇인가요?' })
        });

        const text = await response.text();
        console.log('Chat Response:', text);
    } catch (error) {
        console.error('Error:', error);
    }
}

testChat();
