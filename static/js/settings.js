const settingsState = {
    profile: null,
    workspace: null,
    agent: null,
    channels: [],
};

const settingsModal = document.getElementById("settings-modal");
const settingsStatus = document.getElementById("settings-status");
const settingsTabs = document.querySelectorAll(".settings-tab");
const settingsSections = document.querySelectorAll(".settings-section");

const profileForm = document.getElementById("settings-profile");
const workspaceForm = document.getElementById("settings-workspace");
const agentForm = document.getElementById("settings-agent");
const securityForm = document.getElementById("settings-security");
const defaultChannelSelect = document.getElementById("settings-default-channel");
const avatarInput = document.getElementById("avatar-input");
const avatarRemoveBtn = document.getElementById("avatar-remove-btn");
const avatarPreview = document.getElementById("settings-avatar-preview");
const avatarFallback = document.getElementById("settings-avatar-fallback");

function showSettingsStatus(message, isError = false) {
    settingsStatus.textContent = message;
    settingsStatus.hidden = false;
    settingsStatus.classList.toggle("error", isError);
}

window.showSettingsStatus = showSettingsStatus;

function hideSettingsStatus() {
    settingsStatus.hidden = true;
    settingsStatus.classList.remove("error");
}

function switchSettingsTab(tabName) {
    settingsTabs.forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.settingsTab === tabName);
    });
    settingsSections.forEach((section) => {
        section.classList.toggle("active", section.dataset.settingsPanel === tabName);
    });
    hideSettingsStatus();
}

function resolveTheme(theme) {
    if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
}

function avatarMarkup(name, avatarUrl, className = "avatar") {
    if (avatarUrl) {
        return `<img class="${className} avatar-image" src="${avatarUrl}" alt="${name || "Аватар"}">`;
    }
    return `<span class="${className}">${(name || "?").slice(0, 1).toUpperCase()}</span>`;
}

function updateAvatarPreview(name, avatarUrl) {
    if (!avatarPreview) return;

    if (avatarUrl) {
        avatarPreview.innerHTML = `<img class="avatar avatar-lg avatar-image avatar-online" src="${avatarUrl}" alt="${name || "Аватар"}">`;
        if (avatarRemoveBtn) avatarRemoveBtn.hidden = false;
    } else {
        avatarPreview.innerHTML = `<span class="avatar avatar-lg avatar-online" id="settings-avatar-fallback">${(name || "?").slice(0, 1).toUpperCase()}</span>`;
        if (avatarRemoveBtn) avatarRemoveBtn.hidden = true;
    }
}

window.renderAvatarMarkup = avatarMarkup;

function applyWorkspaceSettings(settings) {
    if (!settings) return;

    document.documentElement.dataset.theme = resolveTheme(settings.theme);
    document.documentElement.classList.toggle("compact-ui", Boolean(settings.compact_mode));

    const workspaceName = document.getElementById("workspace-name");
    const workspaceSubtitle = document.getElementById("workspace-subtitle");
    if (workspaceName) {
        workspaceName.textContent = settings.workspace_name || "OpenWeb";
    }
    if (workspaceSubtitle) {
        workspaceSubtitle.textContent = "Панель управления";
    }
}

function applyProfileToSidebar(user, settings) {
    const userName = document.getElementById("user-name");
    const userMeta = document.getElementById("user-meta");
    const userAvatar = document.getElementById("user-avatar");

    if (!user) return;

    if (userName) userName.textContent = user.name;

    const avatarUrl = settings?.avatar_url || "";
    if (userAvatar) {
        if (avatarUrl) {
            userAvatar.outerHTML = `<img class="avatar avatar-online avatar-image" id="user-avatar" src="${avatarUrl}" alt="${user.name}">`;
        } else {
            if (userAvatar.tagName === "IMG") {
                userAvatar.outerHTML = `<span class="avatar avatar-online" id="user-avatar">${user.name.slice(0, 1).toUpperCase()}</span>`;
            } else {
                userAvatar.textContent = user.name.slice(0, 1).toUpperCase();
            }
        }
    }

    const metaParts = [];
    if (settings?.job_title) metaParts.push(settings.job_title);
    else if (user.company) metaParts.push(user.company);
    else metaParts.push(user.email);

    if (settings?.status_message) metaParts.push(settings.status_message);
    if (userMeta) userMeta.textContent = metaParts.join(" · ");
}

function fillSettingsForms(data) {
    settingsState.profile = data.profile;
    settingsState.workspace = data.workspace;
    settingsState.agent = data.agent;
    settingsState.channels = data.channels || [];

    if (!profileForm || !workspaceForm || !agentForm) return;

    profileForm.name.value = data.profile.name || "";
    profileForm.job_title.value = data.workspace.job_title || "";
    profileForm.company.value = data.profile.company || "";
    profileForm.email.value = data.profile.email || "";
    profileForm.status_message.value = data.workspace.status_message || "";

    updateAvatarPreview(data.profile.name, data.workspace.avatar_url);

    workspaceForm.workspace_name.value = data.workspace.workspace_name || "OpenWeb";
    workspaceForm.theme.value = data.workspace.theme || "dark";
    workspaceForm.compact_mode.checked = Boolean(data.workspace.compact_mode);
    workspaceForm.notifications.checked = Boolean(data.workspace.notifications);

    if (defaultChannelSelect) {
        defaultChannelSelect.innerHTML = settingsState.channels.length
            ? settingsState.channels
                  .map(
                      (channel) => `
                    <option value="${channel.slug}" ${
                        channel.slug === data.workspace.default_channel_slug ? "selected" : ""
                    }>
                        ${channel.icon} ${channel.name}
                    </option>
                `
                  )
                  .join("")
            : `<option value="">Нет каналов</option>`;
    }

    agentForm.name.value = data.agent.name || "OpenWeb AI";
    agentForm.tone.value = data.agent.tone || "professional";
    const enabledInput = agentForm.querySelector('[name="enabled"]');
    if (enabledInput) enabledInput.checked = data.agent.enabled !== false;
    agentForm.querySelectorAll('input[name="platforms"]').forEach((input) => {
        input.checked = (data.agent.platforms || []).includes(input.value);
    });

    securityForm?.reset();
}

async function loadSettings() {
    const data = await window.appApi("/api/settings");
    if (!data) return null;

    fillSettingsForms(data);
    applyWorkspaceSettings(data.workspace);
    applyProfileToSidebar(data.profile, data.workspace);
    return data;
}

function openSettings(tabName = "profile") {
    if (!settingsModal) return;

    settingsModal.classList.add("open");
    settingsModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    switchSettingsTab(tabName);
    hideSettingsStatus();
    loadSettings();
    if (window.appLoadTeam) {
        window.appLoadTeam();
    }
    if (window.loadChannelsData) {
        window.loadChannelsData();
    }
}

function closeSettings() {
    if (!settingsModal) return;

    settingsModal.classList.remove("open");
    settingsModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    hideSettingsStatus();
}

async function uploadAvatar(file) {
    const formData = new FormData();
    formData.append("avatar", file);

    const response = await fetch("/api/settings/avatar", {
        method: "POST",
        body: formData,
    });

    if (response.status === 401) {
        window.location.href = "/";
        return null;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || "Не удалось загрузить фото");
    }
    return data;
}

settingsTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchSettingsTab(tab.dataset.settingsTab));
});

document.getElementById("open-settings")?.addEventListener("click", () => openSettings("profile"));
document.getElementById("settings-close")?.addEventListener("click", closeSettings);

settingsModal?.addEventListener("click", (event) => {
    if (event.target === settingsModal) {
        closeSettings();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && settingsModal?.classList.contains("open")) {
        closeSettings();
    }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (settingsState.workspace?.theme === "system") {
        applyWorkspaceSettings(settingsState.workspace);
    }
});

document.getElementById("avatar-upload-btn")?.addEventListener("click", () => avatarInput?.click());

avatarInput?.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    hideSettingsStatus();
    try {
        const data = await uploadAvatar(file);
        if (!data) return;

        settingsState.workspace = data.settings;
        updateAvatarPreview(settingsState.profile?.name, data.settings.avatar_url);
        applyProfileToSidebar(settingsState.profile, data.settings);
        showSettingsStatus("Аватар обновлён.");
    } catch (error) {
        showSettingsStatus(error.message, true);
    } finally {
        avatarInput.value = "";
    }
});

avatarRemoveBtn?.addEventListener("click", async () => {
    hideSettingsStatus();
    try {
        const data = await window.appApi("/api/settings/avatar", { method: "DELETE" });
        if (!data) return;

        settingsState.workspace = data.settings;
        updateAvatarPreview(settingsState.profile?.name, "");
        applyProfileToSidebar(settingsState.profile, data.settings);
        showSettingsStatus("Аватар удалён.");
    } catch (error) {
        showSettingsStatus(error.message, true);
    }
});

profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideSettingsStatus();

    try {
        const formData = new FormData(profileForm);
        const data = await window.appApi("/api/settings/profile", {
            method: "PUT",
            body: JSON.stringify({
                name: formData.get("name"),
                job_title: formData.get("job_title"),
                company: formData.get("company"),
                email: formData.get("email"),
                status_message: formData.get("status_message"),
            }),
        });

        if (data) {
            settingsState.profile = data.user;
            settingsState.workspace = data.settings;
            updateAvatarPreview(data.user.name, data.settings.avatar_url);
            applyProfileToSidebar(data.user, data.settings);
            if (window.appRefreshUser) {
                await window.appRefreshUser();
            }
            showSettingsStatus("Профиль сохранён.");
        }
    } catch (error) {
        showSettingsStatus(error.message, true);
    }
});

workspaceForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideSettingsStatus();

    try {
        const formData = new FormData(workspaceForm);
        const data = await window.appApi("/api/settings/workspace", {
            method: "PUT",
            body: JSON.stringify({
                workspace_name: formData.get("workspace_name"),
                theme: formData.get("theme"),
                compact_mode: workspaceForm.compact_mode.checked,
                notifications: workspaceForm.notifications.checked,
                default_channel_slug: formData.get("default_channel_slug"),
            }),
        });

        if (data) {
            settingsState.workspace = data.settings;
            applyWorkspaceSettings(data.settings);
            showSettingsStatus("Настройки пространства сохранены.");
        }
    } catch (error) {
        showSettingsStatus(error.message, true);
    }
});

agentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideSettingsStatus();

    const platforms = [...agentForm.querySelectorAll('input[name="platforms"]:checked')].map(
        (input) => input.value
    );
    const enabledInput = agentForm.querySelector('[name="enabled"]');

    try {
        const formData = new FormData(agentForm);
        const data = await window.appApi("/api/agent/config", {
            method: "PUT",
            body: JSON.stringify({
                name: formData.get("name"),
                tone: formData.get("tone"),
                platforms,
                enabled: enabledInput ? enabledInput.checked : true,
            }),
        });

        if (data) {
            settingsState.agent = data.config;
            if (window.appSyncAgentConfig) {
                window.appSyncAgentConfig(data.config);
            }
            showSettingsStatus("Настройки OpenWeb AI сохранены.");
        }
    } catch (error) {
        showSettingsStatus(error.message, true);
    }
});

securityForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideSettingsStatus();

    const formData = new FormData(securityForm);
    const newPassword = formData.get("new_password");
    const confirmPassword = formData.get("confirm_password");

    if (newPassword !== confirmPassword) {
        showSettingsStatus("Пароли не совпадают.", true);
        return;
    }

    try {
        await window.appApi("/api/settings/password", {
            method: "PUT",
            body: JSON.stringify({
                current_password: formData.get("current_password"),
                new_password: newPassword,
            }),
        });
        securityForm.reset();
        showSettingsStatus("Пароль обновлён.");
    } catch (error) {
        showSettingsStatus(error.message, true);
    }
});

document.getElementById("settings-add-member")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideSettingsStatus();

    const form = event.target;
    const formData = new FormData(form);

    try {
        const data = await window.appApi("/api/organization/members", {
            method: "POST",
            body: JSON.stringify({
                name: formData.get("name"),
                email: formData.get("email"),
                role: formData.get("role"),
            }),
        });

        if (data) {
            form.reset();
            if (window.appLoadTeam) {
                await window.appLoadTeam();
            }

            if (data.invite_path) {
                const fullUrl = `${window.location.origin}${data.invite_path}`;
                try {
                    await navigator.clipboard.writeText(fullUrl);
                    showSettingsStatus(`Приглашение создано. Ссылка скопирована: ${fullUrl}`);
                } catch (e) {
                    showSettingsStatus(`Приглашение создано. Отправьте эту ссылку участнику: ${fullUrl}`);
                }
            } else {
                showSettingsStatus("Участник добавлен в организацию.");
            }
        }
    } catch (error) {
        showSettingsStatus(error.message, true);
    }
});

window.openSettings = openSettings;
window.applyWorkspaceSettings = applyWorkspaceSettings;
window.applyProfileToSidebar = applyProfileToSidebar;
