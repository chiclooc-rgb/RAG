const fileInput = document.getElementById('fileInput');
const fileStatus = document.getElementById('fileStatus');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatHistory = document.getElementById('chatHistory');

// Load file list on page load
async function loadFileList() {
    try {
        const response = await fetch('/api/files');
        const data = await response.json();

        // Update file count
        fileCount.textContent = data.count;

        // Clear file list (File Search Store manages files internally)
        fileList.innerHTML = '';

        if (data.count > 0) {
            const info = document.createElement('div');
            info.className = 'text-xs text-gray-400 px-2';
            info.textContent = `${data.count}개 문서가 File Search Store에 저장됨`;
            fileList.appendChild(info);

            // Enable chat
            messageInput.disabled = false;
            sendBtn.disabled = false;
        }
    } catch (error) {
        console.error('Failed to load file list:', error);
    }
}

// File Upload Handling
fileInput.addEventListener('change', handleFileSelect);

async function handleFileSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    fileStatus.textContent = `업로드 중... (${files.length}개)`;
    fileStatus.className = 'text-xs text-blue-400 px-2';

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            console.error(error);
            failCount++;
        }
    }

    if (successCount > 0) {
        fileStatus.textContent = `완료: ${successCount}개 업로드됨`;
        fileStatus.className = 'text-xs text-green-400 px-2';

        // Reload file list
        await loadFileList();

        // Enable chat
        messageInput.disabled = false;
        sendBtn.disabled = false;

        addSystemMessage(`${successCount}개 파일이 준비되었습니다. 질문을 시작하세요!`);
    }

    if (failCount > 0) {
        fileStatus.textContent += ` (${failCount}개 실패)`;
        fileStatus.className = 'text-xs text-yellow-400 px-2';
    }

    // Reset input
    fileInput.value = '';
}

// Chat Handling
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    // Add user message
    addMessage(text, 'user');
    messageInput.value = '';

    // Create placeholder for AI message
    const aiMessageId = addMessage('', 'ai', true);
    const aiMessageContent = document.getElementById(aiMessageId).querySelector('p');

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: text })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;

            // Update UI with markdown parsing (simple)
            aiMessageContent.innerHTML = parseMarkdown(fullText);

            // Scroll to bottom
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

    } catch (error) {
        console.error('Chat error:', error);
        let errorMessage = '오류가 발생했습니다: ' + error.message;

        // Handle specific error cases
        if (error.message.includes('429') || error.message.includes('Resource has been exhausted')) {
            errorMessage = '⚠️ API 사용량이 초과되었습니다. 잠시 후(약 1~2분) 다시 시도해주세요.';
        } else if (error.message.includes('503')) {
            errorMessage = '⚠️ 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.';
        }

        aiMessageContent.textContent = errorMessage;
        aiMessageContent.className = 'text-red-500 font-medium';
    }
}

function addMessage(text, type, isLoading = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = type === 'user' ? 'flex justify-end' : 'flex justify-start';

    const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    msgDiv.id = id;

    let innerHTML = '';
    if (type === 'user') {
        innerHTML = `
            <div class="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg p-4 max-w-2xl shadow-md">
                <p>${text}</p>
            </div>
        `;
    } else {
        innerHTML = `
            <div class="bg-white dark:bg-navy-light/50 rounded-lg p-4 max-w-2xl shadow-sm space-y-4">
                <p>${isLoading ? '생각 중...' : text}</p>
            </div>
        `;
    }

    msgDiv.innerHTML = innerHTML;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    return id;
}

function addSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex justify-start';
    msgDiv.innerHTML = `
        <div class="bg-white dark:bg-navy-light/50 rounded-lg p-4 max-w-2xl shadow-sm space-y-4 border-l-4 border-blue-500">
            <p>${text}</p>
        </div>
    `;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function parseMarkdown(text) {
    // Very basic markdown parser
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

// Load files on page load
loadFileList();
