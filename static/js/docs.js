// Docs (Notion-like pages) feature
const docsState = {
    pages: [],
    currentPageId: null,
    channelId: null,
    previewTimeout: null,
};

const docsPanel = document.getElementById("docs-panel");
const docsList = document.getElementById("docs-list");
const docsEditorOverlay = document.getElementById("docs-editor-overlay");
const docsTitleInput = document.getElementById("docs-title-input");
const docsContentInput = document.getElementById("docs-content-input");
const docsPreview = document.getElementById("docs-preview");
const docsIconBtn = document.getElementById("docs-icon-btn");
const docsIconValue = document.getElementById("docs-icon-value");
const docsIconPicker = document.getElementById("docs-icon-picker");

function renderMarkdownFull(text) {
    return text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/^# (.+)$/gm, "<h1>$1</h1>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/^---$/gm, "<hr>")
        .replace(/^- \[x\] (.+)$/gm, '<li class="task done"><label><input type="checkbox" checked disabled> $1</label></li>')
        .replace(/^- \[ \] (.+)$/gm, '<li class="task"><label><input type="checkbox" disabled> $1</label></li>')
        .replace(/^- (.+)$/gm, "<li>$1</li>")
        .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\n\n+/g, "</p><p>")
        .replace(/^(?!<[hupla])(.+)$/gm, (m) => m.startsWith("<") ? m : `<p>${m}</p>`);
}

function updatePreview() {
    if (docsPreview) {
        docsPreview.innerHTML = renderMarkdownFull(docsContentInput?.value || "");
    }
}

function openDocsEditor(page = null) {
    docsState.currentPageId = page ? page.id : null;
    if (docsTitleInput) docsTitleInput.value = page ? page.title : "";
    if (docsContentInput) docsContentInput.value = page ? page.content : "";
    const icon = page ? (page.icon || "📄") : "📄";
    if (docsIconBtn) docsIconBtn.textContent = icon;
    if (docsIconValue) docsIconValue.value = icon;
    updatePreview();
    if (docsEditorOverlay) {
        docsEditorOverlay.hidden = false;
        docsEditorOverlay.classList.add("open");
    }
    docsTitleInput?.focus();
}

function closeDocsEditor() {
    if (docsEditorOverlay) {
        docsEditorOverlay.hidden = true;
        docsEditorOverlay.classList.remove("open");
    }
    if (docsIconPicker) docsIconPicker.hidden = true;
}

async function loadDocs(channelId = null) {
    docsState.channelId = channelId;
    const url = channelId ? `/api/docs?channel_id=${channelId}` : "/api/docs";
    const data = await window.appApi(url).catch(() => null);
    if (!data) return;
    docsState.pages = data.pages || [];
    renderDocsList();
}

function renderDocsList() {
    if (!docsList) return;
    if (!docsState.pages.length) {
        docsList.innerHTML = '<li class="docs-empty">Документов пока нет</li>';
        return;
    }
    docsList.innerHTML = docsState.pages.map(page => `
        <li class="docs-item" data-page-id="${page.id}">
            <button class="docs-item-btn" data-page-id="${page.id}" type="button">
                <span class="docs-item-icon">${page.icon || "📄"}</span>
                <span class="docs-item-title">${escapeHtml(page.title)}</span>
            </button>
            <button class="docs-item-delete" data-page-id="${page.id}" type="button" aria-label="Удалить">✕</button>
        </li>
    `).join("");

    docsList.querySelectorAll(".docs-item-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const page = docsState.pages.find(p => p.id === Number(btn.dataset.pageId));
            if (page) openDocsEditor(page);
        });
    });

    docsList.querySelectorAll(".docs-item-delete").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!confirm("Удалить документ?")) return;
            await window.appApi(`/api/docs/${btn.dataset.pageId}`, { method: "DELETE" }).catch(() => null);
            await loadDocs(docsState.channelId);
        });
    });
}

document.getElementById("open-docs-sidebar")?.addEventListener("click", () => {
    docsPanel?.classList.add("open");
    loadDocs(window.appState?.activeChannelId || null);
});

document.getElementById("toggle-docs")?.addEventListener("click", () => {
    docsPanel?.classList.toggle("open");
    if (docsPanel?.classList.contains("open")) {
        loadDocs(window.appState?.activeChannelId || null);
    }
});

document.getElementById("docs-close")?.addEventListener("click", () => {
    docsPanel?.classList.remove("open");
});

document.getElementById("create-doc-btn")?.addEventListener("click", () => {
    openDocsEditor(null);
});

document.getElementById("docs-editor-close")?.addEventListener("click", closeDocsEditor);

docsEditorOverlay?.addEventListener("click", (e) => {
    if (e.target === docsEditorOverlay) closeDocsEditor();
});

docsContentInput?.addEventListener("input", () => {
    clearTimeout(docsState.previewTimeout);
    docsState.previewTimeout = setTimeout(updatePreview, 250);
});

docsIconBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (docsIconPicker) docsIconPicker.hidden = !docsIconPicker.hidden;
});

docsIconPicker?.querySelectorAll(".docs-icon-option").forEach(btn => {
    btn.addEventListener("click", () => {
        const icon = btn.dataset.icon;
        if (docsIconBtn) docsIconBtn.textContent = icon;
        if (docsIconValue) docsIconValue.value = icon;
        if (docsIconPicker) docsIconPicker.hidden = true;
    });
});

document.addEventListener("click", () => {
    if (docsIconPicker && !docsIconPicker.hidden) docsIconPicker.hidden = true;
});

document.getElementById("docs-save-btn")?.addEventListener("click", async () => {
    const title = docsTitleInput?.value.trim();
    if (!title) { docsTitleInput?.focus(); return; }

    const body = {
        title,
        content: docsContentInput?.value || "",
        icon: docsIconValue?.value || "📄",
        channel_id: docsState.channelId || null,
    };

    const csrfToken = window.appCsrfToken || "";
    const headers = { "Content-Type": "application/json", "X-CSRF-Token": csrfToken };

    let data;
    if (docsState.currentPageId) {
        data = await window.appApi(`/api/docs/${docsState.currentPageId}`, {
            method: "PUT", headers, body: JSON.stringify(body),
        }).catch(() => null);
    } else {
        data = await window.appApi("/api/docs", {
            method: "POST", headers, body: JSON.stringify(body),
        }).catch(() => null);
    }

    if (data) {
        closeDocsEditor();
        await loadDocs(docsState.channelId);
    }
});

window.loadDocs = loadDocs;
