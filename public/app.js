// UI Elements
const fileInput = document.getElementById('fileInput');
const fileStatus = document.getElementById('fileStatus');
const fileList = document.getElementById('fileList');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatHistory = document.getElementById('chatHistory');
const conversationList = document.getElementById('conversationList');
const newConversationBtn = document.getElementById('newConversationBtn');

// State
let currentConversationId = null;
let conversations = [];

// Base API endpoint helper (supports file:// or other dev hosts)
const apiBase = (() => {
    const origin = window.location.origin;
    // If running on localhost but not port 3000 (e.g. Live Server on 5500), point to backend on 3000
    if (origin.includes('localhost') && !origin.includes(':3000')) {
        return 'http://localhost:3000';
    }
    // Otherwise use current origin (production or localhost:3000)
    if (origin && origin !== 'file://') return origin;
    return 'http://localhost:3000';
})();

function apiFetch(path, options) {
    return fetch(`${apiBase}${path}`, options);
}

// Load conversations on page load
async function loadConversations() {
    try {
        const response = await apiFetch('/api/conversations');
        const data = await response.json();
        conversations = data.conversations || [];
        renderConversationList();
    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

// Render conversation list in left sidebar
function renderConversationList() {
    conversationList.innerHTML = '';

    if (conversations.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'text-xs text-gray-500 dark:text-gray-400 text-center py-6 px-2';
        emptyState.textContent = '대화가 없습니다.\n새 대화를 시작하세요.';
        conversationList.appendChild(emptyState);
        return;
    }

    conversations.forEach((conv) => {
        const convItem = document.createElement('div');
        convItem.className = `conversation-item px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${currentConversationId === conv.id
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-medium'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`;

        const titleEl = document.createElement('div');
        titleEl.className = 'truncate font-medium mb-1';
        titleEl.textContent = conv.title;

        const dateEl = document.createElement('div');
        dateEl.className = 'text-xs text-gray-500 dark:text-gray-400';
        dateEl.textContent = new Date(conv.created_at).toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric'
        });

        convItem.appendChild(titleEl);
        convItem.appendChild(dateEl);

        convItem.onclick = (e) => {
            e.stopPropagation();
            loadConversation(conv.id);
        };

        conversationList.appendChild(convItem);
    });
}

// Start new conversation
async function startNewConversation() {
    currentConversationId = null;
    messageInput.disabled = false;
    messageInput.focus();
    renderConversationList();
    showLandingPage();
}

// Load specific conversation
async function loadConversation(conversationId) {
    try {
        const response = await apiFetch(`/api/conversations/${conversationId}`);
        const data = await response.json();

        currentConversationId = conversationId;

        // Render messages
        chatHistory.innerHTML = '';
        const innerContainer = document.createElement('div');
        innerContainer.className = 'w-full max-w-3xl flex flex-col';
        chatHistory.appendChild(innerContainer);

        if (data.messages && data.messages.length > 0) {
            data.messages.forEach((msg) => {
                addMessage(msg.message, msg.role === 'user' ? 'user' : 'ai', false);
            });
        }

        renderConversationList();
        messageInput.disabled = false;
        messageInput.focus();
    } catch (error) {
        console.error('Failed to load conversation:', error);
    }
}

// Show landing page
function showLandingPage() {
    chatHistory.innerHTML = `
        <div class="w-full max-w-3xl flex flex-col">
            <div class="flex-1 flex items-center justify-center py-6">
                <div class="text-center">
                    <div class="mb-4 inline-block p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <span class="material-symbols-outlined text-blue-600 dark:text-blue-400 text-5xl">smart_toy</span>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">AI Manual Search</h3>
                    <p class="text-gray-600 dark:text-gray-400 text-sm mb-6">문서를 업로드하고 AI와 대화하세요.</p>
                </div>
            </div>
        </div>
    `;
}

// File Management Functions
async function loadFileList() {
    try {
        const response = await apiFetch('/api/files');
        const data = await response.json();

        fileList.innerHTML = '';

        if (data.count > 0) {
            data.files.forEach((file) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item group flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer transition-colors text-sm';

                const fileInfo = document.createElement('div');
                fileInfo.className = 'flex items-center gap-2 flex-1 min-w-0';

                const fileIcon = document.createElement('span');
                fileIcon.className = 'material-symbols-outlined text-gray-400 flex-shrink-0';
                fileIcon.textContent = 'description';

                const fileName = document.createElement('div');
                fileName.className = 'flex-1 min-w-0';

                const fileNameText = document.createElement('div');
                fileNameText.className = 'font-medium text-gray-900 dark:text-white truncate text-sm';
                fileNameText.textContent = file.fileName;

                const fileSize = document.createElement('div');
                fileSize.className = 'text-xs text-gray-500 dark:text-gray-400';
                fileSize.textContent = `${(file.fileSize / 1024).toFixed(1)} KB`;

                fileName.appendChild(fileNameText);
                fileName.appendChild(fileSize);
                fileInfo.appendChild(fileIcon);
                fileInfo.appendChild(fileName);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0';
                deleteBtn.innerHTML = '<span class="material-symbols-outlined text-base">close</span>';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteFile(file.id, file.fileName);
                };

                fileItem.appendChild(fileInfo);
                fileItem.appendChild(deleteBtn);
                fileList.appendChild(fileItem);
            });

            messageInput.disabled = false;
            sendBtn.disabled = false;
        } else {
            messageInput.disabled = false;
            sendBtn.disabled = false;
        }
    } catch (error) {
        console.error('Failed to load file list:', error);
    }
}

// Delete file function
async function deleteFile(fileId, fileName) {
    if (!confirm(`"${fileName}"을(를) 삭제하시겠습니까?`)) {
        return;
    }

    try {
        const response = await apiFetch(`/api/files/${fileId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            fileStatus.textContent = `${fileName} 삭제됨`;
            fileStatus.className = 'text-xs text-green-400 px-2';
            await loadFileList();
        } else {
            fileStatus.textContent = '파일 삭제 실패';
            fileStatus.className = 'text-xs text-red-400 px-2';
        }
    } catch (error) {
        console.error('Delete error:', error);
        fileStatus.textContent = '파일 삭제 중 오류 발생';
        fileStatus.className = 'text-xs text-red-400 px-2';
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
    const failedFiles = [];

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await apiFetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                successCount++;
            } else {
                failCount++;
                failedFiles.push({
                    name: file.name,
                    error: data.error
                });
                console.error(`파일 업로드 실패 [${file.name}]: ${data.error}`);
            }
        } catch (error) {
            failCount++;
            failedFiles.push({
                name: file.name,
                error: error.message || '알 수 없는 오류'
            });
            console.error(error);
        }
    }

    if (successCount > 0) {
        fileStatus.textContent = `완료: ${successCount}개 업로드됨`;
        fileStatus.className = 'text-xs text-green-400 px-2';
        await loadFileList();
        messageInput.disabled = false;
        sendBtn.disabled = false;
    }

    if (failCount > 0) {
        fileStatus.textContent = `완료: ${successCount}개 업로드됨 (${failCount}개 실패)`;
        fileStatus.className = 'text-xs text-yellow-400 px-2';
    }

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

    // If no conversation exists, create one
    if (!currentConversationId) {
        try {
            const createResponse = await apiFetch('/api/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: text.substring(0, 50) // Use first 50 chars as title
                })
            });

            const createData = await createResponse.json();
            if (createData.success) {
                currentConversationId = createData.conversationId;
                await loadConversations();
            } else {
                console.error('Failed to create conversation');
                alert('대화를 시작할 수 없습니다. 서버 상태를 확인해주세요.');
                return;
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            return;
        }
    }

    // Clear landing page and show inner container
    let innerContainer = chatHistory.querySelector('.max-w-3xl');
    if (!innerContainer) {
        chatHistory.innerHTML = '';
        innerContainer = document.createElement('div');
        innerContainer.className = 'w-full max-w-3xl flex flex-col';
        chatHistory.appendChild(innerContainer);
    }

    addMessage(text, 'user');
    messageInput.value = '';

    const aiMessageId = addMessage('', 'ai', true);

    try {
        const response = await apiFetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: text,
                conversationId: currentConversationId
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '알 수 없는 오류가 발생했습니다.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;

            const aiMessageDiv = document.getElementById(aiMessageId);
            const aiMessageContent = aiMessageDiv.querySelector('.ai-message-content');
            if (aiMessageContent) {
                aiMessageContent.innerHTML = parseMarkdown(fullText);
            }

            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

    } catch (error) {
        console.error('Chat error:', error);
        let errorMessage = error.message || '대화 중 오류가 발생했습니다.';

        if (errorMessage.includes('API') && errorMessage.includes('키')) {
            errorMessage = '⚠️ ' + errorMessage;
        } else if (errorMessage.includes('Network')) {
            errorMessage = '⚠️ 네트워크 연결 오류입니다. 인터넷 연결을 확인해주세요.';
        } else if (!errorMessage.includes('⚠️')) {
            errorMessage = '⚠️ ' + errorMessage;
        }

        const aiMessageDiv = document.getElementById(aiMessageId);
        const aiMessageContent = aiMessageDiv.querySelector('.ai-message-content');
        aiMessageContent.innerHTML = errorMessage;
        aiMessageContent.className = 'text-red-400 font-semibold';
    }
}

function addMessage(text, type, isLoading = false) {
    let innerContainer = chatHistory.querySelector('.max-w-3xl');
    if (!innerContainer) {
        chatHistory.innerHTML = '';
        innerContainer = document.createElement('div');
        innerContainer.className = 'w-full max-w-3xl flex flex-col';
        chatHistory.appendChild(innerContainer);
    }

    const container = document.createElement('div');
    const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    container.id = id;

    if (type === 'user') {
        container.className = 'flex justify-end p-4';
        container.innerHTML = `
            <div class="message-bubble bg-blue-600 text-white rounded-lg px-5 py-3 max-w-xl shadow-sm">
                <p class="text-sm leading-relaxed">${escapeHtml(text)}</p>
            </div>
        `;
    } else {
        container.className = 'flex justify-start p-4';
        if (isLoading) {
            container.innerHTML = `
                <div class="message-bubble bg-white dark:bg-slate-800 rounded-lg px-5 py-3 max-w-xl shadow-sm ai-message-content">
                    <div class="flex items-center gap-2">
                        <span class="pulse-dot text-blue-500">●</span>
                        <span class="pulse-dot text-blue-500">●</span>
                        <span class="pulse-dot text-blue-500">●</span>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="message-bubble bg-white dark:bg-slate-800 rounded-lg px-5 py-3 max-w-2xl shadow-sm ai-message-content">
                    ${text}
                </div>
            `;
        }
    }

    innerContainer.appendChild(container);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    return id;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function parseMarkdown(text) {
    if (typeof marked !== 'undefined') {
        try {
            marked.setOptions({
                breaks: true,
                gfm: true
            });
            const html = marked.parse(text);
            return `<div class="markdown-content">${html}</div>`;
        } catch (error) {
            console.error('Markdown parse error:', error);
            return escapeHtml(text).replace(/\n/g, '<br>');
        }
    } else {
        return escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }
}

// Clear all conversations
async function clearAllConversations() {
    if (!confirm('모든 대화를 삭제하시겠습니까?')) {
        return;
    }

    try {
        const response = await apiFetch('/api/conversations', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            currentConversationId = null;
            conversations = [];
            renderConversationList();
            showLandingPage();
            messageInput.disabled = true;
            sendBtn.disabled = true;
            fileStatus.textContent = '모든 대화가 삭제되었습니다.';
            fileStatus.className = 'text-xs text-green-400 px-2';
        }
    } catch (error) {
        console.error('Error clearing conversations:', error);
        fileStatus.textContent = '대화 삭제 중 오류 발생';
        fileStatus.className = 'text-xs text-red-400 px-2';
    }
}

// Initialize on page load
messageInput.disabled = false;
sendBtn.disabled = false;
loadFileList();
loadConversations();
showLandingPage();
