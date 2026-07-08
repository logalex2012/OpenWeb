// ===== GLOBAL STATE =====
let threadState = { parentMessageId: null, channelId: null };
let contextMenuTarget = null;
let voiceRecorder = null;
let voiceChunks = [];
let voiceStream = null;
let reminderPollInterval = null;

const escHtml = (t) => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ===== THREADS =====
const threadPanel = document.getElementById("thread-panel");
const threadMessages = document.getElementById("thread-messages");
const threadInput = document.getElementById("thread-input");
const threadForm = document.getElementById("thread-form");

function openThread(messageId, channelId, authorName) {
    threadState.parentMessageId = messageId;
    threadState.channelId = channelId;
    const head = document.getElementById("thread-parent-name");
    if (head) head.textContent = authorName ? `Тред: ${authorName}` : "Тред";
    threadPanel?.classList.add("open");
    loadThread();
}

async function loadThread() {
    if (!threadState.parentMessageId || !threadState.channelId) return;
    const data = await window.appApi(`/api/channels/${threadState.channelId}/messages/${threadState.parentMessageId}/thread`).catch(() => null);
    if (!data || !threadMessages) return;

    const renderMsg = (m) => {
        const name = m.author_name || "OpenWeb AI";
        const avatar = m.author_avatar_url
            ? `<img class="message-avatar" src="${m.author_avatar_url}" alt="${escHtml(name)}">`
            : `<div class="message-avatar" style="background:linear-gradient(135deg,#5865f2,#00b0f4)">${name[0].toUpperCase()}</div>`;
        return `<article class="message thread-msg">
            ${avatar}
            <div class="message-content">
                <div class="message-meta"><strong>${escHtml(name)}</strong><time>${new Date(m.created_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</time></div>
                <div class="message-body">${escHtml(m.content)}</div>
            </div>
        </article>`;
    };

    threadMessages.innerHTML = `
        <div class="thread-parent">${renderMsg(data.parent)}</div>
        <div class="thread-divider"><span>${data.replies.length} ответ${data.replies.length===1?"":"ов"}</span></div>
        ${data.replies.map(renderMsg).join("")}
    `;
    threadMessages.scrollTop = threadMessages.scrollHeight;
}

document.getElementById("thread-close")?.addEventListener("click", () => {
    threadPanel?.classList.remove("open");
    threadState.parentMessageId = null;
});

const threadMentionDropdown = document.getElementById("thread-mention-dropdown");
const threadMentions = threadInput && threadMentionDropdown && window.attachMentionAutocomplete
    ? window.attachMentionAutocomplete(threadInput, threadMentionDropdown)
    : null;

threadForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = threadInput?.value.trim();
    if (!content || !threadState.parentMessageId) return;
    const mentions = threadMentions?.getMentionIds() || [];
    threadInput.value = "";
    threadMentions?.reset();
    await window.appApi(`/api/channels/${threadState.channelId}/messages/${threadState.parentMessageId}/reply`, {
        method: "POST",
        body: JSON.stringify({ content, mentions }),
    }).catch(() => null);
    await loadThread();
});

threadInput?.addEventListener("input", () => {
    threadInput.style.height = "auto";
    threadInput.style.height = `${Math.min(threadInput.scrollHeight, 100)}px`;
});

window.openThread = openThread;

// ===== PINNED CHANNELS =====
async function loadPinnedChannels() {
    const data = await window.appApi("/api/channels/pinned").catch(() => null);
    if (!data) return;
    renderPinnedChannels(data.channels);
}

function renderPinnedChannels(channels) {
    let section = document.getElementById("pinned-channels-section");
    const container = document.getElementById("channel-sections");
    if (!container) return;

    if (!channels.length) {
        section?.remove();
        return;
    }

    if (!section) {
        section = document.createElement("section");
        section.className = "sidebar-section pinned-section";
        section.id = "pinned-channels-section";
        container.insertBefore(section, container.firstChild);
    }

    section.innerHTML = `
        <div class="sidebar-section-head">
            <p class="sidebar-label">⭐ Важное</p>
        </div>
        <ul class="channel-list">
            ${channels.map(ch => `
                <li>
                    <button class="channel-item" data-channel-id="${ch.id}" type="button">
                        <span class="channel-icon">${ch.icon || "#"}</span>
                        <span class="channel-name">${escHtml(ch.name)}</span>
                    </button>
                </li>
            `).join("")}
        </ul>
    `;

    section.querySelectorAll(".channel-item").forEach(btn => {
        btn.addEventListener("click", () => {
            if (window.appSelectChannel) window.appSelectChannel(Number(btn.dataset.channelId));
        });
    });
}

async function togglePinChannel(channelId) {
    const data = await window.appApi(`/api/channels/${channelId}/pin`, { method: "POST" }).catch(() => null);
    if (data) await loadPinnedChannels();
    return data;
}

window.togglePinChannel = togglePinChannel;
window.loadPinnedChannels = loadPinnedChannels;

// ===== GLOBAL SEARCH =====
const searchOverlay = document.getElementById("search-overlay");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
let searchTimeout = null;

function openSearch() {
    if (!searchOverlay) return;
    searchOverlay.hidden = false;
    searchOverlay.classList.add("open");
    searchInput?.focus();
}

function closeSearch() {
    if (!searchOverlay) return;
    searchOverlay.hidden = true;
    searchOverlay.classList.remove("open");
    if (searchInput) searchInput.value = "";
    if (searchResults) searchResults.innerHTML = '<p class="search-hint">Введите 2+ символа для поиска</p>';
}

document.getElementById("search-btn")?.addEventListener("click", openSearch);

searchOverlay?.addEventListener("click", (e) => {
    if (e.target === searchOverlay) closeSearch();
});

document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearch();
    }
    if (e.key === "Escape") {
        closeSearch();
        document.getElementById("context-menu")?.setAttribute("hidden", "");
    }
});

searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length < 2) {
        if (searchResults) searchResults.innerHTML = '<p class="search-hint">Введите 2+ символа для поиска</p>';
        return;
    }
    if (searchResults) searchResults.innerHTML = '<p class="search-hint">Поиск...</p>';
    searchTimeout = setTimeout(async () => {
        const data = await window.appApi(`/api/search?q=${encodeURIComponent(q)}`).catch(() => null);
        if (!data) return;
        renderSearchResults(data, q);
    }, 300);
});

function highlight(text, q) {
    const escaped = escHtml(text);
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return escaped.replace(re, "<mark>$1</mark>");
}

function renderSearchResults(data, q) {
    if (!searchResults) return;
    const msgs = data.messages || [];
    const pages = data.pages || [];

    if (!msgs.length && !pages.length) {
        searchResults.innerHTML = '<p class="search-hint">Ничего не найдено</p>';
        return;
    }

    let html = "";

    if (msgs.length) {
        html += `<div class="search-section-title">Сообщения</div>`;
        html += msgs.map(m => `
            <button class="search-result-item" data-channel-id="${m.channel_id}" data-message-id="${m.id}" type="button">
                <div class="search-result-meta">
                    <span class="search-result-channel">${m.channel_icon || "#"} ${escHtml(m.channel_name || "")}</span>
                    <time>${new Date(m.created_at).toLocaleDateString("ru-RU")}</time>
                </div>
                <div class="search-result-author">${escHtml(m.author_name || "")}</div>
                <div class="search-result-text">${highlight(m.content.slice(0, 200), q)}</div>
            </button>
        `).join("");
    }

    if (pages.length) {
        html += `<div class="search-section-title">Документы</div>`;
        html += pages.map(p => `
            <button class="search-result-item search-result-doc" data-page-id="${p.id}" type="button">
                <div class="search-result-meta"><span>${p.icon || "📄"} ${highlight(p.title, q)}</span></div>
                <div class="search-result-text">${highlight((p.content || "").slice(0, 150), q)}</div>
            </button>
        `).join("");
    }

    searchResults.innerHTML = html;

    searchResults.querySelectorAll(".search-result-item[data-channel-id]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const channelId = Number(btn.dataset.channelId);
            const messageId = btn.dataset.messageId ? Number(btn.dataset.messageId) : null;
            closeSearch();
            if (window.appSelectChannel) {
                await window.appSelectChannel(channelId);
                if (messageId) {
                    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
                    if (msgEl) {
                        msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
                        msgEl.classList.add("message-highlight");
                        setTimeout(() => msgEl.classList.remove("message-highlight"), 2000);
                    }
                }
            }
        });
    });

    searchResults.querySelectorAll(".search-result-item[data-page-id]").forEach(btn => {
        const pageId = Number(btn.dataset.pageId);
        const page = pages.find(p => p.id === pageId);
        btn.addEventListener("click", () => {
            closeSearch();
            document.getElementById("docs-panel")?.classList.add("open");
            if (page) openDocsEditor(page);
        });
    });
}

// ===== CONTEXT MENU =====
const contextMenu = document.getElementById("context-menu");
let ctxMessageId = null;
let ctxChannelId = null;

function showContextMenu(x, y, messageId, channelId) {
    ctxMessageId = messageId;
    ctxChannelId = channelId;
    if (!contextMenu) return;
    contextMenu.removeAttribute("hidden");
    contextMenu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    contextMenu.style.top = `${Math.min(y, window.innerHeight - 220)}px`;
}

document.addEventListener("click", (e) => {
    if (!contextMenu?.contains(e.target)) {
        contextMenu?.setAttribute("hidden", "");
    }
});

window.showContextMenu = showContextMenu;

document.getElementById("ctx-reply")?.addEventListener("click", () => {
    contextMenu?.setAttribute("hidden", "");
    if (ctxMessageId && ctxChannelId) {
        const msgEl = document.querySelector(`[data-message-id="${ctxMessageId}"] .message-meta strong`);
        openThread(ctxMessageId, ctxChannelId, msgEl?.textContent || "");
    }
});

async function createReminder(when) {
    contextMenu?.setAttribute("hidden", "");
    const data = await window.appApi("/api/reminders", {
        method: "POST",
        body: JSON.stringify({ message_id: ctxMessageId, when }),
    }).catch(() => null);
    if (data) {
        showReminderToast(`Напоминание установлено: ${when === "1h" ? "через 1 час" : when === "3h" ? "через 3 часа" : "завтра утром"}`);
        updateReminderBadge();
        if (remindersPanel?.classList.contains("open")) await loadRemindersList();
    }
}

document.getElementById("ctx-remind-1h")?.addEventListener("click", () => createReminder("1h"));
document.getElementById("ctx-remind-3h")?.addEventListener("click", () => createReminder("3h"));
document.getElementById("ctx-remind-tomorrow")?.addEventListener("click", () => createReminder("tomorrow"));

document.getElementById("ctx-pin-msg")?.addEventListener("click", async () => {
    contextMenu?.setAttribute("hidden", "");
    if (ctxMessageId && ctxChannelId) {
        await window.appApi(`/api/channels/${ctxChannelId}/messages/${ctxMessageId}/pin`, { method: "PUT" }).catch(() => null);
        if (window.appSelectChannel && window.appState?.activeChannelId) {
            await window.appSelectChannel(window.appState.activeChannelId);
        }
    }
});

// ===== REMINDERS =====
const remindersPanel = document.getElementById("reminders-panel");
const remindersList = document.getElementById("reminders-list");
const reminderBadge = document.getElementById("reminder-badge");

document.getElementById("open-reminders-sidebar")?.addEventListener("click", async () => {
    remindersPanel?.classList.toggle("open");
    if (remindersPanel?.classList.contains("open")) await loadRemindersList();
});

document.getElementById("reminders-close")?.addEventListener("click", () => {
    remindersPanel?.classList.remove("open");
});

async function loadRemindersList() {
    const data = await window.appApi("/api/reminders").catch(() => null);
    if (!data || !remindersList) return;
    if (!data.reminders.length) {
        remindersList.innerHTML = '<li class="reminders-empty">Нет активных напоминаний</li>';
        return;
    }
    remindersList.innerHTML = data.reminders.map(r => `
        <li class="reminder-item" data-id="${r.id}">
            <div class="reminder-time">⏰ ${new Date(r.remind_at).toLocaleString("ru-RU", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
            <div class="reminder-preview">${escHtml(r.message_preview || "Напоминание")}</div>
            <button class="reminder-delete" data-id="${r.id}" type="button">✕</button>
        </li>
    `).join("");

    remindersList.querySelectorAll(".reminder-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
            await window.appApi(`/api/reminders/${btn.dataset.id}`, { method: "DELETE" }).catch(() => null);
            btn.closest("li")?.remove();
            updateReminderBadge();
        });
    });
}

async function updateReminderBadge() {
    const data = await window.appApi("/api/reminders").catch(() => null);
    const count = data?.reminders?.length || 0;
    if (reminderBadge) {
        reminderBadge.textContent = count;
        reminderBadge.hidden = count === 0;
    }
}

function showReminderToast(text) {
    const toast = document.createElement("div");
    toast.className = "reminder-toast";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => { toast.classList.remove("visible"); setTimeout(() => toast.remove(), 300); }, 3000);
}

async function checkDueReminders() {
    const data = await window.appApi("/api/reminders/due").catch(() => null);
    if (!data?.reminders?.length) return;
    for (const r of data.reminders) {
        showReminderToast(`⏰ Напоминание: ${r.message_preview || "У вас напоминание!"}`);
    }
    updateReminderBadge();
}

// Poll every 60 seconds
reminderPollInterval = setInterval(checkDueReminders, 60000);
updateReminderBadge();

// ===== POLLS =====
const pollModalOverlay = document.getElementById("poll-modal-overlay");

document.getElementById("poll-modal-close")?.addEventListener("click", () => {
    if (pollModalOverlay) pollModalOverlay.hidden = true;
});
pollModalOverlay?.addEventListener("click", (e) => {
    if (e.target === pollModalOverlay) pollModalOverlay.hidden = true;
});

document.getElementById("poll-add-option")?.addEventListener("click", () => {
    const list = document.getElementById("poll-options-list");
    if (!list) return;
    const count = list.querySelectorAll(".poll-option-input").length;
    if (count >= 10) return;
    const row = document.createElement("div");
    row.className = "poll-option-row";
    row.innerHTML = `<input type="text" class="poll-option-input" placeholder="Вариант ${count + 1}" maxlength="200">`;
    list.appendChild(row);
});

document.getElementById("poll-create-btn")?.addEventListener("click", async () => {
    const question = document.getElementById("poll-question")?.value.trim();
    const options = [...document.querySelectorAll(".poll-option-input")].map(i => i.value.trim()).filter(Boolean);
    if (!question || options.length < 2) {
        alert("Укажите вопрос и минимум 2 варианта");
        return;
    }
    const channelId = window.appState?.activeChannelId;
    if (!channelId) return;

    const data = await window.appApi(`/api/channels/${channelId}/polls`, {
        method: "POST",
        body: JSON.stringify({ question, options }),
    }).catch(() => null);

    if (data) {
        if (pollModalOverlay) pollModalOverlay.hidden = true;
        if (window.appSelectChannel) await window.appSelectChannel(channelId);
    }
});

window.openPollModal = function() {
    if (!pollModalOverlay) return;
    document.getElementById("poll-question").value = "";
    document.getElementById("poll-options-list").innerHTML = `
        <div class="poll-option-row"><input type="text" class="poll-option-input" placeholder="Вариант 1" maxlength="200"></div>
        <div class="poll-option-row"><input type="text" class="poll-option-input" placeholder="Вариант 2" maxlength="200"></div>
    `;
    pollModalOverlay.hidden = false;
};

// ===== VOICE MESSAGES =====
const voiceBtn = document.getElementById("voice-btn");
let isRecording = false;
let recordingTimer = null;
let recordingSeconds = 0;

voiceBtn?.addEventListener("click", async () => {
    if (!window.appState?.activeChannelId) return;
    if (isRecording) {
        stopVoiceRecording();
    } else {
        await startVoiceRecording();
    }
});

async function startVoiceRecording() {
    try {
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceChunks = [];
        voiceRecorder = new MediaRecorder(voiceStream);
        voiceRecorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunks.push(e.data); };
        voiceRecorder.onstop = handleVoiceStop;
        voiceRecorder.start();
        isRecording = true;
        voiceBtn.textContent = "⏹";
        voiceBtn.classList.add("recording");
        voiceBtn.title = "Остановить запись";
        recordingSeconds = 0;
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            voiceBtn.title = `Остановить запись (${recordingSeconds}с)`;
            if (recordingSeconds >= 120) stopVoiceRecording(); // max 2 min
        }, 1000);
    } catch (e) {
        alert("Нет доступа к микрофону");
    }
}

function stopVoiceRecording() {
    if (voiceRecorder && isRecording) {
        voiceRecorder.stop();
        voiceStream?.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimer);
        isRecording = false;
        voiceBtn.textContent = "🎤";
        voiceBtn.classList.remove("recording");
        voiceBtn.title = "Голосовое сообщение";
    }
}

async function handleVoiceStop() {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
    const ext = mimeType === "audio/webm" ? "webm" : "ogg";
    const blob = new Blob(voiceChunks, { type: mimeType });
    const duration = recordingSeconds;
    if (duration < 1) return;

    const audioUrl = URL.createObjectURL(blob);
    const content = document.getElementById("attach-preview-content");
    const filename = document.getElementById("attach-preview-filename");
    const caption = document.getElementById("attach-caption-input");
    const overlay = document.getElementById("attach-preview-overlay");
    const sendBtn = document.getElementById("attach-preview-send");

    if (filename) filename.textContent = `🎤 Голосовое сообщение (${duration}с)`;
    if (content) content.innerHTML = `
        <div class="voice-preview">
            <audio controls src="${audioUrl}" class="voice-preview-player"></audio>
        </div>
    `;
    if (caption) caption.value = "";

    // Remove any previous voice handler
    if (sendBtn?._voiceHandler) {
        sendBtn.removeEventListener("click", sendBtn._voiceHandler);
        sendBtn._voiceHandler = null;
    }

    const voiceHandler = async () => {
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType });
        const formData = new FormData();
        formData.append("file", file);
        const cap = caption?.value.trim();
        if (cap) formData.append("caption", cap);
        sendBtn.disabled = true;
        try {
            const resp = await fetch(`/api/channels/${window.appState.activeChannelId}/attachments`, {
                method: "POST",
                headers: { "X-CSRF-Token": window.appCsrfToken || "" },
                body: formData,
            });
            if (resp.ok) {
                if (overlay) overlay.hidden = true;
                URL.revokeObjectURL(audioUrl);
                sendBtn.removeEventListener("click", voiceHandler);
                sendBtn._voiceHandler = null;
                if (window.appSelectChannel) await window.appSelectChannel(window.appState.activeChannelId);
            } else {
                const err = await resp.json().catch(() => ({}));
                alert(err.error || `Ошибка загрузки (${resp.status})`);
            }
        } catch (err) {
            alert("Не удалось отправить голосовое сообщение");
        } finally {
            sendBtn.disabled = false;
        }
    };

    if (sendBtn) {
        sendBtn._voiceHandler = voiceHandler;
        sendBtn.addEventListener("click", voiceHandler);
    }

    if (overlay) overlay.hidden = false;
}

// ===== /poll COMMAND DETECTION IN MESSAGE INPUT =====
messageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        const val = messageInput.value.trim();
        if (val.startsWith("/poll")) {
            e.preventDefault();
            messageInput.value = "";
            window.openPollModal?.();
        }
    }
});

// ===== INIT =====
// Load pinned channels on workspace init
const origInit = window.appInitWorkspace;
window.appInitWorkspace = async () => {
    if (origInit) await origInit();
    await loadPinnedChannels();
};

// Expose renderPoll for use in app.js renderMessages
window.renderPoll = function(poll, channelId) {
    if (!poll) return "";
    const bars = poll.options.map(o => `
        <button class="poll-option ${o.index === poll.user_vote ? "voted" : ""}"
                data-poll-id="${poll.id}" data-option="${o.index}" type="button">
            <div class="poll-option-bar" style="width:${o.percent}%"></div>
            <span class="poll-option-text">${escHtml(o.text)}</span>
            <span class="poll-option-votes">${o.votes} (${o.percent}%)</span>
        </button>
    `).join("");
    return `<div class="poll-card" data-poll-id="${poll.id}">
        <div class="poll-total">${poll.total_votes} голос${poll.total_votes === 1 ? "" : poll.total_votes < 5 ? "а" : "ов"}</div>
        ${bars}
    </div>`;
};

// Handle poll votes (delegated)
document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".poll-option[data-poll-id]");
    if (!btn) return;
    const pollId = btn.dataset.pollId;
    const optionIndex = btn.dataset.option;
    const data = await window.appApi(`/api/polls/${pollId}/vote`, {
        method: "POST",
        body: JSON.stringify({ option_index: parseInt(optionIndex) }),
    }).catch(() => null);
    if (data && window.appState?.activeChannelId) {
        await window.appSelectChannel(window.appState.activeChannelId);
    }
});

// Handle right-click on messages
document.addEventListener("contextmenu", (e) => {
    const msgEl = e.target.closest(".message[data-message-id]");
    if (!msgEl) return;
    e.preventDefault();
    const msgId = Number(msgEl.dataset.messageId);
    const chId = window.appState?.activeChannelId;
    showContextMenu(e.clientX, e.clientY, msgId, chId);
});
