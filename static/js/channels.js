const channelState = {
    categories: [],
    channels: [],
    icons: ["#", "💬", "📢", "🎮", "💼", "⚙️", "🤖", "📝", "🚀", "📱", "🎨", "🔥", "⭐", "🔔", "📊", "🛠️", "💡", "🎯", "📌", "🗂️", "👥", "🔒", "🌐", "📎", "✅", "❓"],
    activeChannelId: null,
    filter: "",
};

const channelSectionsEl = document.getElementById("channel-sections");
const sidebarEmptyEl = document.getElementById("sidebar-empty");
const channelModal = document.getElementById("channel-modal");
const categoryModal = document.getElementById("category-modal");
const channelForm = document.getElementById("channel-form");
const categoryForm = document.getElementById("category-form");
const channelFormCategory = document.getElementById("channel-form-category");
const channelFormIcon = document.getElementById("channel-form-icon");
const channelIconPicker = document.getElementById("channel-icon-picker");
const channelModalStatus = document.getElementById("channel-modal-status");
const categoryModalStatus = document.getElementById("category-modal-status");

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function showModalStatus(el, message, isError = false) {
    el.textContent = message;
    el.hidden = false;
    el.classList.toggle("error", isError);
}

function hideModalStatus(el) {
    el.hidden = true;
    el.classList.remove("error");
}

function openOverlay(modal) {
    modal.hidden = false;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeOverlay(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;
    if (!document.querySelector(".channel-modal-overlay.open, .settings-overlay.open, .onboarding-overlay.open")) {
        document.body.style.overflow = "";
    }
}

function buildIconPicker() {
    if (!channelIconPicker) return;
    channelIconPicker.innerHTML = channelState.icons
        .map(
            (icon) => `
                <button
                    type="button"
                    class="icon-picker-btn ${icon === channelFormIcon.value ? "active" : ""}"
                    data-icon="${escapeHtml(icon)}"
                    aria-label="Иконка ${escapeHtml(icon)}"
                >${icon}</button>
            `
        )
        .join("");

    channelIconPicker.querySelectorAll(".icon-picker-btn").forEach((button) => {
        button.addEventListener("click", () => {
            channelFormIcon.value = button.dataset.icon;
            channelIconPicker.querySelectorAll(".icon-picker-btn").forEach((item) => {
                item.classList.toggle("active", item === button);
            });
        });
    });
}

function fillCategorySelect(selectedId = "") {
    if (!channelFormCategory) return;
    const options = ['<option value="">Без раздела</option>'].concat(
        channelState.categories.map(
            (category) =>
                `<option value="${category.id}" ${String(category.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(category.name)}</option>`
        )
    );
    channelFormCategory.innerHTML = options.join("");
}

function filteredChannels() {
    const query = channelState.filter.trim().toLowerCase();
    if (!query) return channelState.channels;
    return channelState.channels.filter(
        (channel) =>
            channel.name.toLowerCase().includes(query) ||
            channel.slug.includes(query) ||
            (channel.description || "").toLowerCase().includes(query)
    );
}

function renderChannelButton(channel) {
    const icon = channel.icon || "#";
    return `
        <li>
            <button
                class="channel-item ${channel.id === channelState.activeChannelId ? "active" : ""}"
                data-channel-id="${channel.id}"
                type="button"
            >
                <span class="channel-icon" aria-hidden="true">${icon}</span>
                <span class="channel-name">${escapeHtml(channel.name)}</span>
            </button>
        </li>
    `;
}

function renderChannelSections() {
    const channels = filteredChannels();
    const hasAny = channelState.channels.length > 0;
    const hasVisible = channels.length > 0;

    if (sidebarEmptyEl) {
        sidebarEmptyEl.hidden = hasAny;
    }
    if (!channelSectionsEl) return;

    if (!hasVisible && channelState.filter) {
        channelSectionsEl.innerHTML = `<p class="sidebar-search-empty">Ничего не найдено</p>`;
        return;
    }

    if (!hasAny) {
        channelSectionsEl.innerHTML = "";
        return;
    }

    const byCategory = new Map();
    channelState.categories.forEach((category) => byCategory.set(category.id, []));
    const uncategorized = [];

    channels.forEach((channel) => {
        if (channel.category_id && byCategory.has(channel.category_id)) {
            byCategory.get(channel.category_id).push(channel);
        } else {
            uncategorized.push(channel);
        }
    });

    const sections = channelState.categories
        .map((category) => {
            const items = byCategory.get(category.id) || [];
            if (!items.length && channelState.filter) return "";
            return `
                <section class="sidebar-section" data-category-id="${category.id}">
                    <div class="sidebar-section-head">
                        <p class="sidebar-label">${escapeHtml(category.name)}</p>
                        <button
                            type="button"
                            class="sidebar-section-add"
                            data-add-channel-to="${category.id}"
                            title="Добавить канал в раздел"
                        >+</button>
                    </div>
                    <ul class="channel-list">
                        ${items.map(renderChannelButton).join("") || `<li class="channel-list-empty"><small>Пусто</small></li>`}
                    </ul>
                </section>
            `;
        })
        .join("");

    const uncategorizedSection =
        uncategorized.length > 0
            ? `
                <section class="sidebar-section">
                    <div class="sidebar-section-head">
                        <p class="sidebar-label">Без раздела</p>
                    </div>
                    <ul class="channel-list">
                        ${uncategorized.map(renderChannelButton).join("")}
                    </ul>
                </section>
            `
            : "";

    channelSectionsEl.innerHTML = sections + uncategorizedSection;

    channelSectionsEl.querySelectorAll(".channel-item").forEach((button) => {
        button.addEventListener("click", () => {
            if (window.appSelectChannel) {
                window.appSelectChannel(Number(button.dataset.channelId));
            }
        });
    });

    channelSectionsEl.querySelectorAll("[data-add-channel-to]").forEach((button) => {
        button.addEventListener("click", () => {
            openChannelModal(Number(button.dataset.addChannelTo));
        });
    });
}

function openChannelModal(categoryId = "") {
    channelForm.reset();
    channelFormIcon.value = "#";
    fillCategorySelect(categoryId);
    buildIconPicker();
    hideModalStatus(channelModalStatus);
    openOverlay(channelModal);
    channelForm.name.focus();
}

function openCategoryModal() {
    categoryForm.reset();
    hideModalStatus(categoryModalStatus);
    openOverlay(categoryModal);
    categoryForm.name.focus();
}

async function loadChannelsData() {
    const data = await window.appApi("/api/channels");
    if (!data) return null;

    channelState.categories = data.categories || [];
    channelState.channels = data.channels || [];
    renderChannelSections();
    fillCategorySelect();

    if (window.appOnChannelsLoaded) {
        window.appOnChannelsLoaded(data);
    }

    return data;
}

window.loadChannelsData = loadChannelsData;
window.renderChannelSections = renderChannelSections;
window.setChannelFilter = (value) => {
    channelState.filter = value;
    renderChannelSections();
};
window.setActiveChannelId = (channelId) => {
    channelState.activeChannelId = channelId;
    renderChannelSections();
};
window.getChannelById = (channelId) => channelState.channels.find((item) => item.id === channelId);

document.getElementById("add-channel-btn")?.addEventListener("click", () => openChannelModal());
document.getElementById("add-category-btn")?.addEventListener("click", openCategoryModal);
document.getElementById("sidebar-empty-create")?.addEventListener("click", () => openChannelModal());

document.getElementById("channel-modal-close")?.addEventListener("click", () => closeOverlay(channelModal));
document.getElementById("category-modal-close")?.addEventListener("click", () => closeOverlay(categoryModal));

channelModal?.addEventListener("click", (event) => {
    if (event.target === channelModal) closeOverlay(channelModal);
});
categoryModal?.addEventListener("click", (event) => {
    if (event.target === categoryModal) closeOverlay(categoryModal);
});

channelForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideModalStatus(channelModalStatus);

    const formData = new FormData(channelForm);
    const categoryId = formData.get("category_id");

    try {
        const data = await window.appApi("/api/channels", {
            method: "POST",
            body: JSON.stringify({
                name: formData.get("name"),
                description: formData.get("description"),
                icon: formData.get("icon"),
                category_id: categoryId ? Number(categoryId) : null,
            }),
        });

        if (!data) return;

        closeOverlay(channelModal);
        await loadChannelsData();

        if (window.appSelectChannel) {
            await window.appSelectChannel(data.channel.id);
        }
    } catch (error) {
        showModalStatus(channelModalStatus, error.message, true);
    }
});

categoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideModalStatus(categoryModalStatus);

    const formData = new FormData(categoryForm);

    try {
        const data = await window.appApi("/api/channel-categories", {
            method: "POST",
            body: JSON.stringify({ name: formData.get("name") }),
        });

        if (!data) return;

        closeOverlay(categoryModal);
        await loadChannelsData();
    } catch (error) {
        showModalStatus(categoryModalStatus, error.message, true);
    }
});

buildIconPicker();
