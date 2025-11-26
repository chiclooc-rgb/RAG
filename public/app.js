const fileInput = document.getElementById('fileInput');
const fileStatus = document.getElementById('fileStatus');
const fileList = document.getElementById('fileList');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatHistory = document.getElementById('chatHistory');

// Load file list on page load
async function loadFileList() {
    try {
        const response = await fetch('/api/files');
        const data = await response.json();

        // Clear file list
        fileList.innerHTML = '';

        if (data.count > 0) {
            // Show each file with details
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

            // Enable chat
            messageInput.disabled = false;
            sendBtn.disabled = false;
        } else {
            // Enable chat even without files (basic conversation mode)
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
        const response = await fetch(`/api/files/${fileId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            fileStatus.textContent = `${fileName} 삭제됨`;
            fileStatus.className = 'text-xs text-green-400 px-2';

            // Reload file list
            await loadFileList();

            // Clear chat history if no files left
            const filesResponse = await fetch('/api/files');
            const filesData = await filesResponse.json();
            if (filesData.count === 0) {
                chatHistory.innerHTML = `
                    <div class="flex flex-col items-center px-4">
                        <div class="w-full max-w-3xl flex flex-col">
                            <div class="flex-1 flex items-center justify-center py-6">
                                <div class="text-center">
                                    <div class="flex justify-start">
                                        <div class="bg-white dark:bg-navy-light/50 rounded-lg p-4 max-w-2xl shadow-sm">
                                            <p>안녕하세요! 검색할 매뉴얼 파일을 왼쪽 메뉴의 '문서 업로드'를 눌러 업로드해주세요.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
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

// Also bind fileInput2 for the center area upload button
const fileInput2 = document.getElementById('fileInput2');
if (fileInput2) {
    fileInput2.addEventListener('change', handleFileSelect);
}

async function handleFileSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    fileStatus.textContent = `업로드 중... (${files.length}개)`;
    fileStatus.className = 'text-xs text-blue-400 px-2';

    let successCount = 0;
    let failCount = 0;
    const failedFiles = []; // 실패한 파일의 이유를 저장

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
                // 실패 이유를 저장
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

        // Reload file list
        await loadFileList();

        // Enable chat
        messageInput.disabled = false;
        sendBtn.disabled = false;

        addSystemMessage(`${successCount}개 파일이 준비되었습니다. 질문을 시작하세요!`);
    }

    if (failCount > 0) {
        // 실패한 파일들에 대한 상세 메시지 표시
        fileStatus.textContent = `완료: ${successCount}개 업로드됨 (${failCount}개 실패)`;
        fileStatus.className = 'text-xs text-yellow-400 px-2';

        // 채팅창에 실패 메시지 표시
        let errorMessage = '파일 업로드 실패:\n\n';
        failedFiles.forEach((file, index) => {
            errorMessage += `${index + 1}. ${file.name}\n   → ${file.error}\n\n`;
        });

        addSystemMessage(errorMessage);
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

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: text })
        });

        // 에러 응답 확인
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

            // Update UI with markdown parsing
            const aiMessageDiv = document.getElementById(aiMessageId);
            const aiMessageContent = aiMessageDiv.querySelector('.ai-message-content');
            if (aiMessageContent) {
                aiMessageContent.innerHTML = parseMarkdown(fullText);
            }

            // Scroll to bottom
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

    } catch (error) {
        console.error('Chat error:', error);
        let errorMessage = error.message || '대화 중 오류가 발생했습니다.';

        // 서버에서 받은 한국어 오류 메시지를 그대로 사용하거나, 추가 처리
        if (errorMessage.includes('API') && errorMessage.includes('키')) {
            errorMessage = '⚠️ ' + errorMessage;
        } else if (errorMessage.includes('Network')) {
            errorMessage = '⚠️ 네트워크 연결 오류입니다. 인터넷 연결을 확인해주세요.';
        } else if (!errorMessage.includes('⚠️')) {
            errorMessage = '⚠️ ' + errorMessage;
        }

        aiMessageContent.innerHTML = errorMessage;
        aiMessageContent.className = 'text-red-400 font-semibold';
    }
}

function addMessage(text, type, isLoading = false) {
    // Get the inner container or create new structure
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
                <p class="text-sm leading-relaxed">${text}</p>
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

function addSystemMessage(text) {
    // Get the inner container or create new structure
    let innerContainer = chatHistory.querySelector('.max-w-3xl');
    if (!innerContainer) {
        chatHistory.innerHTML = '';
        innerContainer = document.createElement('div');
        innerContainer.className = 'w-full max-w-3xl flex flex-col';
        chatHistory.appendChild(innerContainer);
    }

    const container = document.createElement('div');
    container.className = 'flex justify-start p-4';

    // 텍스트에서 개행을 <br>로 변환하고 HTML 이스케이프 처리
    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    const formattedText = escapeHtml(text).replace(/\n/g, '<br>');

    container.innerHTML = `
        <div class="message-bubble bg-amber-50 dark:bg-amber-900/20 rounded-lg px-5 py-3 max-w-2xl shadow-sm border border-amber-200 dark:border-amber-800/50">
            <div style="white-space: pre-wrap; word-break: break-word;" class="text-amber-900 dark:text-amber-100 text-sm leading-relaxed">${formattedText}</div>
        </div>
    `;
    innerContainer.appendChild(container);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function parseMarkdown(text) {
    // Use marked library to parse markdown
    if (typeof marked !== 'undefined') {
        try {
            // Configure marked options
            marked.setOptions({
                breaks: true,
                gfm: true
            });
            const html = marked.parse(text);
            return `<div class="markdown-content">${html}</div>`;
        } catch (error) {
            console.error('Markdown parse error:', error);
            // Fallback to basic parsing
            return text
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
        }
    } else {
        // Fallback if marked is not loaded
        return text
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }
}

// Load chat history on page load
async function loadChatHistory() {
    try {
        const response = await fetch('/api/chat-history');
        const data = await response.json();

        if (data.history && data.history.length > 0) {
            // Clear initial message and container structure
            chatHistory.innerHTML = '';
            // Create fresh inner container
            const innerContainer = document.createElement('div');
            innerContainer.className = 'w-full max-w-3xl flex flex-col';
            chatHistory.appendChild(innerContainer);

            // Load each message
            data.history.forEach((msg) => {
                addMessage(msg.message, msg.role === 'user' ? 'user' : 'ai', false);
            });
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
    }
}

// Clear chat history
async function clearChatHistory() {
    if (!confirm('대화 기록을 모두 삭제하시겠습니까?')) {
        return;
    }

    try {
        const response = await fetch('/api/chat-history', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            chatHistory.innerHTML = `
                <div class="flex flex-col items-center px-4">
                    <div class="w-full max-w-3xl flex flex-col">
                        <div class="flex-1 flex items-center justify-center py-6">
                            <div class="text-center">
                                <div class="flex justify-start">
                                    <div class="bg-white dark:bg-navy-light/50 rounded-lg p-4 max-w-2xl shadow-sm">
                                        <p>안녕하세요! 검색할 매뉴얼 파일을 왼쪽 메뉴의 '문서 업로드'를 눌러 업로드해주세요.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            fileStatus.textContent = '대화 기록이 초기화되었습니다.';
            fileStatus.className = 'text-xs text-green-400 px-2';
        }
    } catch (error) {
        console.error('Error clearing chat history:', error);
        fileStatus.textContent = '대화 초기화 중 오류 발생';
        fileStatus.className = 'text-xs text-red-400 px-2';
    }
}

// Don't need separate handler - fileInput2 already uses handleFileSelect via HTML onclick

// Load files on page load
loadFileList();
loadChatHistory();
