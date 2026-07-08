const state = {
    channels: [],
    categories: [],
    activeChannelId: null,
    user: null,
    settings: null,
    team: [],
    lastMessageId: 0,
};

const SYNC_INTERVAL_MS = 2500;
const TYPING_HEARTBEAT_MS = 3000;
let syncTimer = null;
let lastTypingSentAt = 0;

const messagesEl = document.getElementById("messages");
const channelHead = document.getElementById("channel-head");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const agentPanel = document.getElementById("agent-panel");
const agentSettings = document.getElementById("agent-settings");
const agentPrompt = document.getElementById("agent-prompt");
const agentResult = document.getElementById("agent-result");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const membersPanel = document.getElementById("members-panel");
const channelSearch = document.getElementById("channel-search");

const avatarColors = [
    "linear-gradient(135deg, #5865f2, #00b0f4)",
    "linear-gradient(135deg, #eb459e, #faa61a)",
    "linear-gradient(135deg, #23a559, #5865f2)",
    "linear-gradient(135deg, #f0b232, #eb459e)",
    "linear-gradient(135deg, #00b0f4, #23a559)",
];

async function api(url, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (window.appCsrfToken && options.method && options.method !== "GET") {
        headers["X-CSRF-Token"] = window.appCsrfToken;
    }
    const response = await fetch(url, { headers, ...options });

    if (response.status === 401) {
        window.location.href = "/";
        return null;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || "Ошибка запроса");
    }
    return data;
}

window.appApi = api;
window.appState = state;
window.appCsrfToken = "";

async function initCsrfToken() {
    const data = await api("/api/csrf-token").catch(() => null);
    if (data?.csrf_token) {
        window.appCsrfToken = data.csrf_token;
    }
}

function formatTime(iso) {
    const date = new Date(iso);
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function avatarGradient(name) {
    const index = (name?.charCodeAt(0) || 0) % avatarColors.length;
    return avatarColors[index];
}

function initials(name) {
    return (name || "?").slice(0, 1).toUpperCase();
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderMarkdownLite(text) {
    const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return escaped
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/^#### (.*)$/gm, "<h5>$1</h5>")
        .replace(/^### (.*)$/gm, "<h4>$1</h4>")
        .replace(/^## (.*)$/gm, "<h3>$1</h3>")
        .replace(/^---$/gm, "<hr>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/^- \[x\] (.+)$/gm, '<li class="task done"><input type="checkbox" checked disabled> $1</li>')
        .replace(/^- \[ \] (.+)$/gm, '<li class="task"><input type="checkbox" disabled> $1</li>')
        .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMessageAvatar(message) {
    const name = message.author_name || "OpenWeb AI";
    if (message.author_avatar_url) {
        return `<img class="message-avatar avatar-image ${message.is_agent ? "agent" : ""}" src="${message.author_avatar_url}" alt="${name}">`;
    }
    return `<div class="message-avatar ${message.is_agent ? "agent" : ""}" style="background:${avatarGradient(name)}">${initials(name)}</div>`;
}

function messageTemplate(message) {
    const name = message.author_name || "OpenWeb AI";
    const isPinned = message.is_pinned ? ' message-pinned' : '';
    const pinIndicator = message.is_pinned ? '<span class="pin-indicator" title="Закреплено">📌</span>' : '';

    const reactionsHtml = (message.reactions || []).map(r =>
        `<button class="reaction-btn ${r.mine ? 'mine' : ''}" data-message-id="${message.id}" data-emoji="${r.emoji}" type="button">${r.emoji} ${r.count}</button>`
    ).join("");

    const reactionPickerHtml = `<div class="reaction-picker" data-message-id="${message.id}">
        ${["👍","❤️","😂","😮","😢","🔥","✅","👀","🎉","💯"].map(e =>
            `<button class="reaction-picker-btn" data-message-id="${message.id}" data-emoji="${e}" type="button">${e}</button>`
        ).join("")}
    </div>`;

    const attachmentHtml = message.attachment ? renderAttachment(message.attachment) : "";
    const pollHtml = message.poll ? (window.renderPoll ? window.renderPoll(message.poll, message.channel_id) : "") : "";

    const isOwn = message.user_id && message.user_id === state.user?.id;
    const deleteBtn = isOwn ? `<button class="msg-action-btn msg-delete" data-message-id="${message.id}" title="Удалить">🗑</button>` : "";
    const pinBtn = `<button class="msg-action-btn msg-pin" data-message-id="${message.id}" title="${message.is_pinned ? 'Открепить' : 'Закрепить'}">📌</button>`;

    return `
        <article class="message ${message.is_agent ? "agent" : ""}${isPinned}" data-message-id="${message.id}">
            ${renderMessageAvatar(message)}
            <div class="message-content">
                <div class="message-meta">
                    <strong>${escapeHtml(name)}</strong>
                    <time>${formatTime(message.created_at)}</time>
                    ${pinIndicator}
                    ${message.reply_count > 0 ? `<button class="reply-count-btn msg-reply" data-message-id="${message.id}" data-author="${escapeHtml(name)}" type="button">${message.reply_count} ответ${message.reply_count === 1 ? "" : "а"}</button>` : ""}
                </div>
                <div class="message-body">${renderMarkdownLite(message.content)}</div>
                ${attachmentHtml}
                ${pollHtml}
                ${reactionsHtml ? `<div class="reactions-row">${reactionsHtml}</div>` : ""}
                <div class="message-actions">
                    <button class="msg-action-btn msg-reply" data-message-id="${message.id}" data-author="${escapeHtml(name)}" title="Ответить в треде">💬</button>
                    <button class="msg-action-btn msg-react-toggle" data-message-id="${message.id}" title="Реакция">😊</button>
                    ${pinBtn}
                    ${deleteBtn}
                </div>
                ${reactionPickerHtml}
            </div>
        </article>
    `;
}

function updateLastMessageId(messages) {
    messages.forEach((message) => {
        if (message.id > state.lastMessageId) state.lastMessageId = message.id;
    });
}

function renderMessages(messages) {
    if (!messages.length) {
        messagesEl.innerHTML = `<div class="chat-empty"><p>Пока нет сообщений. Начните обсуждение.</p></div>`;
        state.lastMessageId = 0;
        return;
    }

    messagesEl.innerHTML = messages.map(messageTemplate).join("");
    state.lastMessageId = 0;
    updateLastMessageId(messages);

    messagesEl.scrollTop = messagesEl.scrollHeight;
    bindMessageActions(messagesEl);
}

function isScrolledNearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
}

function appendNewMessages(messages) {
    if (!messages.length) return;

    const stickToBottom = isScrolledNearBottom();
    const emptyState = messagesEl.querySelector(".chat-empty");
    if (emptyState) emptyState.remove();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = messages.map(messageTemplate).join("");
    Array.from(wrapper.children).forEach((node) => {
        messagesEl.appendChild(node);
        bindMessageActions(node);
    });

    updateLastMessageId(messages);
    if (stickToBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function patchMessageNode(message) {
    const node = messagesEl.querySelector(`.message[data-message-id="${message.id}"]`);
    if (!node) return;
    node.outerHTML = messageTemplate(message);
    const freshNode = messagesEl.querySelector(`.message[data-message-id="${message.id}"]`);
    if (freshNode) bindMessageActions(freshNode);
}

function applyMessageUpdates(messages) {
    messages.forEach((message) => {
        if (message.deleted) {
            messagesEl.querySelector(`.message[data-message-id="${message.id}"]`)?.remove();
            return;
        }
        patchMessageNode(message);
    });
}

function renderAttachment(att) {
    const isImage = att.mime_type && att.mime_type.startsWith("image/");
    const isAudio = att.mime_type && att.mime_type.startsWith("audio/");
    const size = att.size > 1024 * 1024
        ? `${(att.size / 1024 / 1024).toFixed(1)} МБ`
        : `${Math.round(att.size / 1024)} КБ`;
    if (isImage) {
        return `<div class="attachment attachment-image">
            <a href="${att.url}" target="_blank" rel="noopener">
                <img src="${att.url}" alt="${escapeHtml(att.original_name)}" class="attach-preview-img" loading="lazy">
            </a>
            <span class="attach-name">${escapeHtml(att.original_name)} · ${size}</span>
        </div>`;
    }
    if (isAudio) {
        return `<div class="attachment attachment-audio">
            <span class="attach-audio-icon">🎤</span>
            <div class="attach-audio-body">
                <audio controls src="${att.url}" class="attach-audio-player" preload="metadata"></audio>
                <span class="attach-size">${size}</span>
            </div>
        </div>`;
    }
    return `<div class="attachment attachment-file">
        <a href="${att.url}" download="${escapeHtml(att.original_name)}" class="attach-file-link">
            <span class="attach-file-icon">📎</span>
            <span class="attach-file-info">
                <span class="attach-name">${escapeHtml(att.original_name)}</span>
                <span class="attach-size">${size}</span>
            </span>
        </a>
    </div>`;
}

function bindMessageActions(scope = messagesEl) {
    scope.querySelectorAll(".msg-react-toggle").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const msgId = btn.dataset.messageId;
            const picker = messagesEl.querySelector(`.reaction-picker[data-message-id="${msgId}"]`);
            if (picker) picker.classList.toggle("visible");
        });
    });

    scope.querySelectorAll(".reaction-picker-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const msgId = btn.dataset.messageId;
            const emoji = btn.dataset.emoji;
            const data = await api(`/api/messages/${msgId}/reactions`, {
                method: "POST",
                body: JSON.stringify({ emoji }),
            }).catch(() => null);
            if (data?.message) patchMessageNode(data.message);
        });
    });

    scope.querySelectorAll(".reaction-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const msgId = btn.dataset.messageId;
            const emoji = btn.dataset.emoji;
            const data = await api(`/api/messages/${msgId}/reactions`, {
                method: "POST",
                body: JSON.stringify({ emoji }),
            }).catch(() => null);
            if (data?.message) patchMessageNode(data.message);
        });
    });

    scope.querySelectorAll(".msg-pin").forEach(btn => {
        btn.addEventListener("click", async () => {
            const msgId = btn.dataset.messageId;
            const chId = state.activeChannelId;
            const data = await api(`/api/channels/${chId}/messages/${msgId}/pin`, { method: "PUT" }).catch(() => null);
            if (data?.message) patchMessageNode(data.message);
        });
    });

    scope.querySelectorAll(".msg-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!confirm("Удалить сообщение?")) return;
            const msgId = btn.dataset.messageId;
            const chId = state.activeChannelId;
            await api(`/api/channels/${chId}/messages/${msgId}`, { method: "DELETE" }).catch(() => null);
            messagesEl.querySelector(`.message[data-message-id="${msgId}"]`)?.remove();
        });
    });

    scope.querySelectorAll(".msg-reply").forEach(btn => {
        btn.addEventListener("click", () => {
            const msgId = Number(btn.dataset.messageId);
            const author = btn.dataset.author || "";
            const chId = state.activeChannelId;
            if (window.openThread) window.openThread(msgId, chId, author);
        });
    });
}

document.addEventListener("click", () => {
    messagesEl.querySelectorAll(".reaction-picker.visible").forEach(p => p.classList.remove("visible"));
});

function renderEmptyChat() {
    stopSync();
    channelHead.innerHTML = `
        <h1>Выберите канал</h1>
        <p>Создайте раздел и канал в боковом меню или откройте существующий чат</p>
    `;
    messagesEl.innerHTML = `<div class="chat-empty"><p>Канал не выбран</p></div>`;
    messageInput.placeholder = "Сначала выберите или создайте канал";
    messageInput.disabled = true;
}

function renderTyping(typingUsers) {
    const el = document.getElementById("typing-indicator");
    if (!el) return;
    if (!typingUsers.length) {
        el.textContent = "";
        el.hidden = true;
        return;
    }
    const names = typingUsers.map((t) => t.name).join(", ");
    const verb = typingUsers.length === 1 ? "печатает…" : "печатают…";
    el.textContent = `${names} ${verb}`;
    el.hidden = false;
}

function stopSync() {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
    renderTyping([]);
}

async function pollSync(channelId) {
    const data = await api(`/api/channels/${channelId}/sync?after_id=${state.lastMessageId}`).catch(() => null);
    if (!data || state.activeChannelId !== channelId) return;

    if (data.new_messages?.length) appendNewMessages(data.new_messages);
    if (data.updated_messages?.length) applyMessageUpdates(data.updated_messages);
    renderTyping(data.typing || []);
}

function startSync(channelId) {
    stopSync();
    syncTimer = setInterval(() => pollSync(channelId), SYNC_INTERVAL_MS);
}

async function sendTypingHeartbeat() {
    const now = Date.now();
    if (!state.activeChannelId || now - lastTypingSentAt < TYPING_HEARTBEAT_MS) return;
    lastTypingSentAt = now;
    await api(`/api/channels/${state.activeChannelId}/typing`, { method: "POST" }).catch(() => null);
}

async function selectChannel(channelId) {
    const channel = window.getChannelById?.(channelId) || state.channels.find((item) => item.id === channelId);
    if (!channel) return;

    stopSync();
    state.activeChannelId = channelId;
    window.setActiveChannelId?.(channelId);

    const icon = channel.icon || "#";
    channelHead.innerHTML = `
        <h1><span class="channel-icon-head">${icon}</span> ${channel.name}</h1>
        <p>${channel.description || ""}</p>
    `;
    messageInput.placeholder = `Напишите сообщение в ${channel.name}`;
    messageInput.disabled = false;
    closeSidebar();

    if (channel.channel_type === "agent") {
        agentPanel.classList.add("open");
    }

    const data = await api(`/api/channels/${channelId}/messages`);
    if (data) {
        renderMessages(data.messages);
        startSync(channelId);
    }
}

window.appSelectChannel = selectChannel;

function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarBackdrop.classList.remove("visible");
}

function openSidebar() {
    sidebar.classList.add("open");
    sidebarBackdrop.classList.add("visible");
}

function toggleMembersPanel() {
    membersPanel?.classList.toggle("open");
}

async function loadUser() {
    const data = await api("/api/me");
    if (!data) return;

    state.user = data.user;
    state.settings = data.settings;
    if (window.applyProfileToSidebar) {
        applyProfileToSidebar(state.user, state.settings);
    }
    if (window.applyWorkspaceSettings) {
        applyWorkspaceSettings(state.settings);
    }

    return data;
}

async function loadTeam() {
    const data = await api("/api/organization/members");
    if (!data) return;

    state.team = data.members;
    if (window.renderMembersList) {
        renderMembersList(data.members);
    }
    if (window.renderSettingsTeam) {
        renderSettingsTeam(data.members);
    }
}

window.appLoadTeam = loadTeam;
window.appRefreshUser = loadUser;

window.appInitWorkspace = async () => {
    await loadChannels();
    await loadAgentConfig();
    await loadTeam();
};

window.appOnChannelsLoaded = (data) => {
    state.categories = data.categories || [];
    state.channels = data.channels || [];
};

function syncAgentConfig(config) {
    if (!agentSettings || !config) return;
    agentSettings.name.value = config.name;
    agentSettings.tone.value = config.tone;
    agentSettings.querySelectorAll('input[name="platforms"]').forEach((input) => {
        input.checked = config.platforms.includes(input.value);
    });
}

window.appSyncAgentConfig = syncAgentConfig;

async function loadChannels() {
    const data = window.loadChannelsData ? await window.loadChannelsData() : await api("/api/channels");
    if (!data) return;

    state.categories = data.categories || [];
    state.channels = data.channels || [];

    if (!state.channels.length) {
        state.activeChannelId = null;
        renderEmptyChat();
        return;
    }

    const defaultSlug = state.settings?.default_channel_slug;
    const defaultChannel =
        state.channels.find((channel) => channel.slug === defaultSlug) || state.channels[0];

    if (defaultChannel) {
        await selectChannel(defaultChannel.id);
    }
}

async function loadAgentConfig() {
    const data = await api("/api/agent/config");
    if (!data) return;
    syncAgentConfig(data.config);
}

channelSearch?.addEventListener("input", (event) => {
    window.setChannelFilter?.(event.target.value);
});

function attachMentionAutocomplete(textareaEl, dropdownEl) {
    let pendingMentions = [];
    let activeIndex = 0;
    let currentMatches = [];

    function findMentionFragment() {
        const cursor = textareaEl.selectionStart;
        const value = textareaEl.value.slice(0, cursor);
        const at = value.lastIndexOf("@");
        if (at === -1) return null;
        const fragment = value.slice(at + 1);
        if (/\s/.test(fragment)) return null;
        return { at, fragment };
    }

    function hideDropdown() {
        dropdownEl.hidden = true;
        dropdownEl.innerHTML = "";
        currentMatches = [];
    }

    function renderDropdown(matches) {
        currentMatches = matches;
        activeIndex = 0;
        if (!matches.length) {
            hideDropdown();
            return;
        }
        dropdownEl.innerHTML = matches
            .map((m, i) => `<button type="button" class="mention-dropdown-item ${i === 0 ? "active" : ""}" data-index="${i}">${escapeHtml(m.name)}</button>`)
            .join("");
        dropdownEl.hidden = false;
        dropdownEl.querySelectorAll(".mention-dropdown-item").forEach((btn) => {
            btn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                pickMention(Number(btn.dataset.index));
            });
        });
    }

    function pickMention(index) {
        const member = currentMatches[index];
        const match = findMentionFragment();
        if (!member || !match) {
            hideDropdown();
            return;
        }
        const before = textareaEl.value.slice(0, match.at);
        const after = textareaEl.value.slice(match.at + 1 + match.fragment.length);
        textareaEl.value = `${before}@${member.name} ${after}`;
        const newCursor = `${before}@${member.name} `.length;
        textareaEl.focus();
        textareaEl.setSelectionRange(newCursor, newCursor);
        if (!pendingMentions.some((m) => m.id === member.id)) {
            pendingMentions.push(member);
        }
        hideDropdown();
    }

    textareaEl.addEventListener("input", () => {
        const match = findMentionFragment();
        if (!match) {
            hideDropdown();
            return;
        }
        const query = match.fragment.toLowerCase();
        const matches = (state.team || [])
            .filter((m) => m.name.toLowerCase().includes(query))
            .slice(0, 6);
        renderDropdown(matches);
    });

    textareaEl.addEventListener("keydown", (e) => {
        if (dropdownEl.hidden || !currentMatches.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % currentMatches.length;
            dropdownEl.querySelectorAll(".mention-dropdown-item").forEach((el, i) => el.classList.toggle("active", i === activeIndex));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
            dropdownEl.querySelectorAll(".mention-dropdown-item").forEach((el, i) => el.classList.toggle("active", i === activeIndex));
        } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pickMention(activeIndex);
        } else if (e.key === "Escape") {
            hideDropdown();
        }
    });

    document.addEventListener("click", (e) => {
        if (e.target !== textareaEl) hideDropdown();
    });

    return {
        getMentionIds() {
            return pendingMentions
                .filter((m) => textareaEl.value.includes(`@${m.name}`))
                .map((m) => m.id);
        },
        reset() {
            pendingMentions = [];
            hideDropdown();
        },
    };
}

const messageMentions = attachMentionAutocomplete(messageInput, document.getElementById("mention-dropdown"));
window.attachMentionAutocomplete = attachMentionAutocomplete;

messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = messageInput.value.trim();
    if (!content || !state.activeChannelId || messageInput.disabled) return;

    const mentions = messageMentions.getMentionIds();
    messageInput.value = "";
    messageInput.style.height = "auto";
    messageMentions.reset();

    const data = await api(`/api/channels/${state.activeChannelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, mentions }),
    });

    if (data?.message) {
        appendNewMessages([data.message]);
    }
});

// File attachment upload with preview modal
const attachBtn = document.getElementById("attach-btn");
const attachInput = document.getElementById("attach-input");
const dragDropOverlay = document.getElementById("drag-drop-overlay");
const chatPanel = document.querySelector(".chat-panel");
const attachPreviewOverlay = document.getElementById("attach-preview-overlay");
const attachPreviewContent = document.getElementById("attach-preview-content");
const attachPreviewFilename = document.getElementById("attach-preview-filename");
const attachCaptionInput = document.getElementById("attach-caption-input");

let _pendingFiles = [];

function formatFileSize(bytes) {
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
    return `${Math.round(bytes / 1024)} КБ`;
}

function showAttachPreview(files) {
    _pendingFiles = Array.from(files);
    if (!_pendingFiles.length) return;

    const file = _pendingFiles[0];
    const isImage = file.type.startsWith("image/");

    if (attachPreviewFilename) {
        attachPreviewFilename.textContent = _pendingFiles.length > 1
            ? `${_pendingFiles.length} файла`
            : file.name;
    }

    if (attachPreviewContent) {
        if (isImage && _pendingFiles.length === 1) {
            const url = URL.createObjectURL(file);
            attachPreviewContent.innerHTML = `
                <div class="attach-preview-img-wrap">
                    <img src="${url}" alt="${escapeHtml(file.name)}" class="attach-preview-img-large">
                </div>
                <p class="attach-preview-meta">${escapeHtml(file.name)} · ${formatFileSize(file.size)}</p>
            `;
        } else {
            attachPreviewContent.innerHTML = _pendingFiles.map(f => `
                <div class="attach-preview-file-row">
                    <span class="attach-preview-file-icon">${f.type.startsWith("image/") ? "🖼" : "📎"}</span>
                    <div>
                        <div class="attach-preview-file-name">${escapeHtml(f.name)}</div>
                        <div class="attach-preview-file-size">${formatFileSize(f.size)}</div>
                    </div>
                </div>
            `).join("");
        }
    }

    if (attachCaptionInput) attachCaptionInput.value = "";
    if (attachPreviewOverlay) attachPreviewOverlay.hidden = false;
    setTimeout(() => attachCaptionInput?.focus(), 50);
}

function closeAttachPreview() {
    if (attachPreviewOverlay) attachPreviewOverlay.hidden = true;
    _pendingFiles = [];
    if (attachInput) attachInput.value = "";
    // Revoke any blob URLs
    attachPreviewContent?.querySelectorAll("img[src^='blob:']").forEach(img => URL.revokeObjectURL(img.src));
}

async function uploadFile(file, caption = "") {
    const formData = new FormData();
    formData.append("file", file);
    if (caption) formData.append("caption", caption);
    const response = await fetch(`/api/channels/${state.activeChannelId}/attachments`, {
        method: "POST",
        headers: { "X-CSRF-Token": window.appCsrfToken || "" },
        body: formData,
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка загрузки файла");
    }
    return response.json();
}

attachBtn?.addEventListener("click", () => {
    if (!state.activeChannelId) return;
    attachInput?.click();
});

attachInput?.addEventListener("change", () => {
    if (attachInput.files?.length) showAttachPreview(attachInput.files);
});

document.getElementById("attach-preview-cancel")?.addEventListener("click", closeAttachPreview);
attachPreviewOverlay?.addEventListener("click", (e) => {
    if (e.target === attachPreviewOverlay) closeAttachPreview();
});

document.getElementById("attach-preview-send")?.addEventListener("click", async () => {
    if (!_pendingFiles.length || !state.activeChannelId) return;
    const caption = attachCaptionInput?.value.trim() || "";
    const sendBtn = document.getElementById("attach-preview-send");
    if (sendBtn) sendBtn.disabled = true;

    try {
        // First file gets the caption, rest upload silently
        await uploadFile(_pendingFiles[0], caption);
        for (let i = 1; i < _pendingFiles.length; i++) {
            await uploadFile(_pendingFiles[i], "");
        }
        closeAttachPreview();
        await selectChannel(state.activeChannelId);
    } catch (e) {
        alert(e.message);
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
});

// Send on Ctrl+Enter in caption
attachCaptionInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById("attach-preview-send")?.click();
    }
});

chatPanel?.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (state.activeChannelId && dragDropOverlay) dragDropOverlay.hidden = false;
});

chatPanel?.addEventListener("dragleave", (e) => {
    if (!chatPanel.contains(e.relatedTarget) && dragDropOverlay) dragDropOverlay.hidden = true;
});

chatPanel?.addEventListener("drop", (e) => {
    e.preventDefault();
    if (dragDropOverlay) dragDropOverlay.hidden = true;
    if (!state.activeChannelId) return;
    const files = e.dataTransfer?.files;
    if (files?.length) showAttachPreview(files);
});

// Call functionality
document.getElementById("start-call-btn")?.addEventListener("click", async () => {
    if (!state.activeChannelId) return;
    const overlay = document.getElementById("call-modal-overlay");
    const joinBtn = document.getElementById("call-join-btn");
    const endBtn = document.getElementById("call-end-btn");
    const statusText = document.getElementById("call-status-text");
    if (!overlay) return;

    const data = await api(`/api/channels/${state.activeChannelId}/calls/active`).catch(() => null);
    let callData = data?.call;

    overlay.hidden = false;
    overlay.classList.add("open");

    if (callData) {
        if (statusText) statusText.textContent = `Активный звонок (начат: ${formatTime(callData.created_at)})`;
        if (endBtn) endBtn.hidden = false;
        joinBtn.onclick = () => window.open(callData.jitsi_url, "_blank");
        endBtn.onclick = async () => {
            await api(`/api/channels/${state.activeChannelId}/calls/${callData.id}`, { method: "DELETE" }).catch(() => null);
            overlay.hidden = true;
            overlay.classList.remove("open");
            if (state.activeChannelId) await selectChannel(state.activeChannelId);
        };
    } else {
        if (statusText) statusText.textContent = "Начать видеозвонок через Jitsi Meet";
        if (endBtn) endBtn.hidden = true;
        joinBtn.onclick = async () => {
            const res = await api(`/api/channels/${state.activeChannelId}/calls`, { method: "POST" }).catch(() => null);
            if (res?.call) {
                window.open(res.call.jitsi_url, "_blank");
                overlay.hidden = true;
                overlay.classList.remove("open");
                if (state.activeChannelId) await selectChannel(state.activeChannelId);
            }
        };
    }
});

document.getElementById("call-modal-close")?.addEventListener("click", () => {
    const overlay = document.getElementById("call-modal-overlay");
    if (overlay) { overlay.hidden = true; overlay.classList.remove("open"); }
});

agentSettings.addEventListener("submit", async (event) => {
    event.preventDefault();
    const platforms = [...agentSettings.querySelectorAll('input[name="platforms"]:checked')].map(
        (input) => input.value
    );

    await api("/api/agent/config", {
        method: "PUT",
        body: JSON.stringify({
            name: agentSettings.name.value,
            tone: agentSettings.tone.value,
            platforms,
        }),
    });

    agentResult.textContent = "Настройки агента сохранены.";
});

document.getElementById("run-agent")?.addEventListener("click", async () => {
    const prompt = agentPrompt.value.trim();
    if (!prompt) {
        agentResult.textContent = "Опишите задачу для OpenWeb AI.";
        return;
    }

    agentResult.textContent = "Открываю OpenWeb AI...";
    const { opened, copied } = await openTimewebAgentWithPrompt(prompt);

    if (opened) {
        agentResult.textContent = copied
            ? "Задача скопирована в буфер. Вставьте её в чат OpenWeb AI."
            : "Чат OpenWeb AI открыт. Отправьте задачу в диалоге.";
        agentPanel.classList.remove("open");
        return;
    }

    agentResult.textContent = "Не удалось загрузить OpenWeb AI. Проверьте интернет и обновите страницу.";
});

document.getElementById("open-timeweb-agent")?.addEventListener("click", async () => {
    agentResult.textContent = "";
    const opened = await openTimewebAgent();
    if (opened) {
        agentPanel.classList.remove("open");
        return;
    }
    agentResult.textContent = "Не удалось загрузить OpenWeb AI. Проверьте интернет и обновите страницу.";
});

document.getElementById("toggle-agent")?.addEventListener("click", async () => {
    const opened = await openTimewebAgent();
    if (!opened) {
        agentPanel.classList.add("open");
        agentResult.textContent = "OpenWeb AI загружается... Попробуйте снова через несколько секунд.";
    }
});

document.getElementById("agent-close")?.addEventListener("click", () => {
    agentPanel.classList.remove("open");
});

document.getElementById("toggle-members")?.addEventListener("click", toggleMembersPanel);
document.getElementById("members-close")?.addEventListener("click", () => {
    membersPanel?.classList.remove("open");
});

document.getElementById("sidebar-open")?.addEventListener("click", openSidebar);
document.getElementById("sidebar-close")?.addEventListener("click", closeSidebar);
sidebarBackdrop?.addEventListener("click", closeSidebar);

document.getElementById("open-settings-rail")?.addEventListener("click", () => {
    if (window.openSettings) openSettings("workspace");
});

document.getElementById("workspace-switcher")?.addEventListener("click", () => {
    if (window.openSettings) openSettings("workspace");
});

document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
});

messageInput?.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
    if (messageInput.value.trim()) sendTypingHeartbeat();
});

async function init() {
    const csrfPromise = initCsrfToken();
    renderEmptyChat();
    await loadUser();
    await csrfPromise;
    const needsOnboarding = window.checkOnboardingRequired
        ? await checkOnboardingRequired()
        : false;

    if (!needsOnboarding) {
        await Promise.all([loadChannels(), loadAgentConfig(), loadTeam()]);
    }
}

init();
