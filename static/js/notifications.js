const NOTIF_POLL_MS = 5000;

const notifBell = document.getElementById("notif-bell");
const notifBadge = document.getElementById("notif-badge");
const notifPanel = document.getElementById("notif-panel");
const notifList = document.getElementById("notif-list");
const notifMarkAll = document.getElementById("notif-mark-all");

const NOTIF_LABELS = {
    mention: (n) => `упомянул(а) вас в <strong>#${escNotif(n.channel_name)}</strong>`,
    thread_reply: (n) => `ответил(а) вам в треде <strong>#${escNotif(n.channel_name)}</strong>`,
    kanban_assigned: (n) => `назначил(а) вам карточку`,
};

function escNotif(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatNotifTime(iso) {
    const date = new Date(iso);
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function updateBadge(count) {
    if (!notifBadge) return;
    if (count > 0) {
        notifBadge.textContent = count > 9 ? "9+" : String(count);
        notifBadge.hidden = false;
    } else {
        notifBadge.hidden = true;
    }
}

async function pollNotifications() {
    const data = await window.appApi("/api/notifications").catch(() => null);
    if (!data) return;
    updateBadge(data.unread_count || 0);
    if (notifPanel && !notifPanel.hidden) {
        renderNotifList(data.notifications || []);
    }
}

function renderNotifList(notifications) {
    if (!notifList) return;
    if (!notifications.length) {
        notifList.innerHTML = `<p class="notif-empty">Пока нет уведомлений</p>`;
        return;
    }

    notifList.innerHTML = notifications
        .map((n) => {
            const label = (NOTIF_LABELS[n.type] || (() => "новое событие"))(n);
            return `
                <button type="button" class="notif-item ${n.is_read ? "" : "unread"}" data-id="${n.id}" data-channel-id="${n.channel_id || ""}" data-message-id="${n.message_id || ""}" data-actor="${escNotif(n.actor_name)}">
                    <span class="notif-item-icon">${n.actor_avatar_url ? `<img src="${n.actor_avatar_url}" alt="">` : "🔔"}</span>
                    <span class="notif-item-body">
                        <span class="notif-item-text"><strong>${escNotif(n.actor_name)}</strong> ${label}</span>
                        ${n.preview ? `<span class="notif-item-preview">${escNotif(n.preview.slice(0, 120))}</span>` : ""}
                        <span class="notif-item-time">${formatNotifTime(n.created_at)}</span>
                    </span>
                </button>
            `;
        })
        .join("");

    notifList.querySelectorAll(".notif-item").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const channelId = Number(btn.dataset.channelId) || null;
            const messageId = Number(btn.dataset.messageId) || null;
            const actor = btn.dataset.actor || "";

            await window.appApi(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => null);
            closeNotifPanel();

            if (channelId && window.appSelectChannel) {
                await window.appSelectChannel(channelId);
                if (messageId && window.openThread) {
                    window.openThread(messageId, channelId, actor);
                }
            }
            pollNotifications();
        });
    });
}

function openNotifPanel() {
    if (!notifPanel) return;
    notifPanel.hidden = false;
    pollNotifications();
}

function closeNotifPanel() {
    if (notifPanel) notifPanel.hidden = true;
}

notifBell?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (notifPanel?.hidden === false) {
        closeNotifPanel();
    } else {
        openNotifPanel();
    }
});

document.addEventListener("click", (e) => {
    if (notifPanel && !notifPanel.hidden && !notifPanel.contains(e.target) && e.target !== notifBell) {
        closeNotifPanel();
    }
});

notifMarkAll?.addEventListener("click", async () => {
    await window.appApi("/api/notifications/read-all", { method: "POST" }).catch(() => null);
    pollNotifications();
});

pollNotifications();
setInterval(pollNotifications, NOTIF_POLL_MS);
