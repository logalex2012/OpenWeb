// Kanban board feature
const kanbanBoard = document.getElementById("kanban-board");
let kanbanState = { channelId: null, cards: [], dragCard: null };

function showKanban(channelId) {
    kanbanState.channelId = channelId;
    if (kanbanBoard) kanbanBoard.hidden = false;
    if (messagesEl) messagesEl.hidden = true;
    const composer = document.getElementById("message-form");
    if (composer) composer.hidden = true;
    loadKanban();
}

function hideKanban() {
    if (kanbanBoard) kanbanBoard.hidden = true;
    if (messagesEl) messagesEl.hidden = false;
    const composer = document.getElementById("message-form");
    if (composer) composer.hidden = false;
}

window.showKanban = showKanban;
window.hideKanban = hideKanban;

async function loadKanban() {
    if (!kanbanState.channelId) return;
    const data = await window.appApi(`/api/channels/${kanbanState.channelId}/kanban`).catch(() => null);
    if (!data) return;
    kanbanState.cards = data.cards;
    renderKanban(data.cards);
}

const COLUMN_LABELS = { todo: "К выполнению", progress: "В работе", done: "Готово" };

function renderKanban(cards) {
    const cols = { todo: [], progress: [], done: [] };
    cards.forEach(c => { if (cols[c.column]) cols[c.column].push(c); });

    ["todo", "progress", "done"].forEach(col => {
        const container = document.getElementById(`kanban-${col}`);
        if (!container) return;
        container.innerHTML = cols[col].map(card => renderCard(card)).join("");
        container.querySelectorAll(".kanban-card").forEach(bindCardEvents);
    });

    setupDragDrop();
}

function renderCard(card) {
    const colorClass = card.color ? `card-color-${card.color}` : "";
    return `<div class="kanban-card ${colorClass}" draggable="true" data-card-id="${card.id}" data-col="${card.column}">
        <div class="kanban-card-title">${escapeHtmlK(card.title)}</div>
        ${card.description ? `<div class="kanban-card-desc">${escapeHtmlK(card.description.slice(0, 100))}</div>` : ""}
        <div class="kanban-card-footer">
            <span class="kanban-card-author">${escapeHtmlK(card.created_by_name || "")}</span>
            <div class="kanban-card-actions">
                <button class="kanban-card-btn" data-action="edit" data-card-id="${card.id}" type="button" title="Редактировать">✏️</button>
                <button class="kanban-card-btn" data-action="delete" data-card-id="${card.id}" type="button" title="Удалить">🗑</button>
            </div>
        </div>
    </div>`;
}

function escapeHtmlK(t) {
    return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function bindCardEvents(cardEl) {
    cardEl.querySelector("[data-action='delete']")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Удалить карточку?")) return;
        const id = e.currentTarget.dataset.cardId;
        await window.appApi(`/api/channels/${kanbanState.channelId}/kanban/${id}`, { method: "DELETE" }).catch(() => null);
        await loadKanban();
    });

    cardEl.querySelector("[data-action='edit']")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.cardId;
        const card = kanbanState.cards.find(c => c.id === Number(id));
        if (!card) return;
        openCardModal(card);
    });
}

function openCardModal(card = null) {
    const existing = document.getElementById("kanban-card-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "kanban-card-modal";
    modal.className = "kanban-modal-overlay";
    modal.innerHTML = `
        <div class="kanban-modal glass-panel">
            <div class="kanban-modal-head">
                <h3>${card ? "Редактировать" : "Новая карточка"}</h3>
                <button class="icon-btn icon-btn-ghost" id="kanban-modal-close" type="button">✕</button>
            </div>
            <label>Название<input type="text" id="kcard-title" value="${card ? escapeHtmlK(card.title) : ""}" placeholder="Название задачи" maxlength="255"></label>
            <label>Описание<textarea id="kcard-desc" rows="3" placeholder="Подробнее...">${card ? escapeHtmlK(card.description || "") : ""}</textarea></label>
            <label>Колонка
                <select id="kcard-col">
                    <option value="todo" ${!card || card.column==="todo" ? "selected":""}>К выполнению</option>
                    <option value="progress" ${card?.column==="progress" ? "selected":""}>В работе</option>
                    <option value="done" ${card?.column==="done" ? "selected":""}>Готово</option>
                </select>
            </label>
            <button class="btn btn-accent btn-full" id="kcard-save" type="button">${card ? "Сохранить" : "Создать"}</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("kanban-modal-close")?.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById("kcard-save")?.addEventListener("click", async () => {
        const title = document.getElementById("kcard-title")?.value.trim();
        const desc = document.getElementById("kcard-desc")?.value.trim();
        const col = document.getElementById("kcard-col")?.value;
        if (!title) return;

        if (card) {
            await window.appApi(`/api/channels/${kanbanState.channelId}/kanban/${card.id}`, {
                method: "PUT",
                body: JSON.stringify({ title, description: desc, column: col }),
            }).catch(() => null);
        } else {
            await window.appApi(`/api/channels/${kanbanState.channelId}/kanban`, {
                method: "POST",
                body: JSON.stringify({ title, description: desc, column: col }),
            }).catch(() => null);
        }
        modal.remove();
        await loadKanban();
    });
}

// "+ Добавить" buttons
kanbanBoard?.querySelectorAll(".kanban-add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const col = btn.dataset.col;
        openCardModal({ column: col, title: "", description: "", id: null });
    });
});

// Drag & Drop
function setupDragDrop() {
    document.querySelectorAll(".kanban-card").forEach(card => {
        card.addEventListener("dragstart", (e) => {
            kanbanState.dragCard = Number(card.dataset.cardId);
            card.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            kanbanState.dragCard = null;
        });
    });

    document.querySelectorAll(".kanban-cards").forEach(zone => {
        zone.addEventListener("dragover", (e) => {
            e.preventDefault();
            zone.classList.add("drag-over");
        });
        zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
        zone.addEventListener("drop", async (e) => {
            e.preventDefault();
            zone.classList.remove("drag-over");
            const col = zone.closest(".kanban-col")?.dataset.col;
            if (!col || !kanbanState.dragCard) return;
            await window.appApi(`/api/channels/${kanbanState.channelId}/kanban/${kanbanState.dragCard}`, {
                method: "PUT",
                body: JSON.stringify({ column: col }),
            }).catch(() => null);
            await loadKanban();
        });
    });
}

// Hook into channel selection
const origSelectChannel = window.appSelectChannel;
if (origSelectChannel) {
    window.appSelectChannel = async (channelId) => {
        const ch = window.getChannelById?.(channelId);
        if (ch?.channel_type === "kanban") {
            showKanban(channelId);
        } else {
            hideKanban();
            await origSelectChannel(channelId);
        }
    };
}
