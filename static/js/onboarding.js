const onboardingState = {
    step: 1,
    workspace_name: "",
    description: "",
    members: [],
};

const onboardingModal = document.getElementById("onboarding-modal");
const onboardingStatus = document.getElementById("onboarding-status");
const memberRows = document.getElementById("onboarding-member-rows");
const onboardingWorkspaceForm = document.getElementById("onboarding-workspace-form");

const roleLabels = {
    owner: "Владелец",
    admin: "Администратор",
    developer: "Разработчик",
    member: "Участник",
};

function showOnboardingStatus(message, isError = false) {
    onboardingStatus.textContent = message;
    onboardingStatus.hidden = false;
    onboardingStatus.classList.toggle("error", isError);
}

function hideOnboardingStatus() {
    onboardingStatus.hidden = true;
    onboardingStatus.classList.remove("error");
}

function setOnboardingStep(step) {
    onboardingState.step = step;
    document.querySelectorAll(".progress-step").forEach((item) => {
        item.classList.toggle("active", Number(item.dataset.step) <= step);
        item.classList.toggle("done", Number(item.dataset.step) < step);
    });
    document.querySelectorAll(".onboarding-step").forEach((section) => {
        section.classList.toggle("active", Number(section.dataset.onboardingStep) === step);
    });
    hideOnboardingStatus();
}

function createMemberRow(member = {}) {
    const row = document.createElement("div");
    row.className = "onboarding-member-row";
    row.innerHTML = `
        <label>
            Имя
            <input type="text" name="name" value="${member.name || ""}" placeholder="Имя Фамилия" required>
        </label>
        <label>
            Email
            <input type="email" name="email" value="${member.email || ""}" placeholder="email@company.ru" required>
        </label>
        <label>
            Роль
            <select name="role">
                <option value="member" ${member.role === "member" ? "selected" : ""}>Участник</option>
                <option value="developer" ${member.role === "developer" ? "selected" : ""}>Разработчик</option>
                <option value="admin" ${member.role === "admin" ? "selected" : ""}>Администратор</option>
            </select>
        </label>
        <button type="button" class="icon-btn member-remove" aria-label="Удалить участника">✕</button>
    `;

    row.querySelector(".member-remove").addEventListener("click", () => {
        row.remove();
    });

    return row;
}

function addMemberRow(member = {}) {
    memberRows.appendChild(createMemberRow(member));
}

function collectMembers() {
    return [...memberRows.querySelectorAll(".onboarding-member-row")]
        .map((row) => ({
            name: row.querySelector('[name="name"]').value.trim(),
            email: row.querySelector('[name="email"]').value.trim(),
            role: row.querySelector('[name="role"]').value,
        }))
        .filter((member) => member.name && member.email);
}

function openOnboarding() {
    onboardingModal.hidden = false;
    onboardingModal.classList.add("open");
    onboardingModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setOnboardingStep(1);
}

function closeOnboarding() {
    onboardingModal.hidden = true;
    onboardingModal.classList.remove("open");
    onboardingModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

async function finishOnboarding(members = []) {
    showOnboardingStatus("Создаём workspace...");

    try {
        const data = await window.appApi("/api/onboarding/setup", {
            method: "POST",
            body: JSON.stringify({
                workspace_name: onboardingState.workspace_name,
                description: onboardingState.description,
                members,
            }),
        });

        if (!data) return;

        closeOnboarding();

        if (window.appRefreshUser) {
            await window.appRefreshUser();
        }
        if (window.appInitWorkspace) {
            await window.appInitWorkspace();
        }
    } catch (error) {
        showOnboardingStatus(error.message, true);
    }
}

async function checkOnboardingRequired() {
    const data = await window.appApi("/api/onboarding/status");
    if (data?.required) {
        openOnboarding();
    } else {
        closeOnboarding();
    }
    return Boolean(data?.required);
}

onboardingWorkspaceForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(onboardingWorkspaceForm);
    onboardingState.workspace_name = (formData.get("workspace_name") || "").trim();
    onboardingState.description = (formData.get("description") || "").trim();

    if (!onboardingState.workspace_name) {
        showOnboardingStatus("Укажите название workspace", true);
        return;
    }

    setOnboardingStep(2);
});

document.getElementById("onboarding-back")?.addEventListener("click", () => setOnboardingStep(1));
document.getElementById("onboarding-add-member")?.addEventListener("click", () => addMemberRow());
document.getElementById("onboarding-finish")?.addEventListener("click", () => finishOnboarding(collectMembers()));
document.getElementById("onboarding-skip-team")?.addEventListener("click", () => finishOnboarding([]));

window.checkOnboardingRequired = checkOnboardingRequired;
window.renderMembersList = renderMembersList;
window.roleLabels = roleLabels;

function renderMembersList(members) {
    const list = document.getElementById("members-list");
    const countEl = document.getElementById("members-count");
    if (countEl) countEl.textContent = String(members.length);
    if (!list) return;

    if (!members.length) {
        list.innerHTML = `<li class="member-row"><span class="member-row-text"><small>Нет участников</small></span></li>`;
        return;
    }

    list.innerHTML = members
        .map((member) => {
            const online = member.status === "active";
            const avatarHtml = member.avatar_url
                ? `<img class="avatar avatar-image ${online ? "avatar-online" : ""}" src="${member.avatar_url}" alt="${member.name}">`
                : `<span class="avatar ${online ? "avatar-online" : ""}" style="background:linear-gradient(135deg,#5865f2,#eb459e)">${member.name.slice(0, 1).toUpperCase()}</span>`;
            return `
                <li class="member-row">
                    ${avatarHtml}
                    <div class="member-row-text">
                        <strong>${member.name}</strong>
                        <small>${member.email}</small>
                    </div>
                    <span class="status-pill ${online ? "on" : "off"}">${online ? "On" : "Off"}</span>
                </li>
            `;
        })
        .join("");
}

window.renderTeamList = renderMembersList;

function renderSettingsTeam(members) {
    const list = document.getElementById("settings-team-list");
    if (!list) return;

    list.innerHTML = members
        .map(
            (member) => {
                const avatarHtml = member.avatar_url
                    ? `<img class="settings-team-avatar avatar-image" src="${member.avatar_url}" alt="${member.name}">`
                    : `<span class="settings-team-avatar">${member.name.slice(0, 1).toUpperCase()}</span>`;
                const inviteBtn = member.status === "invited"
                    ? `<button type="button" class="footer-link-btn settings-team-resend" data-member-id="${member.id}">Скопировать ссылку</button>`
                    : "";
                return `
                <li class="settings-team-item">
                    <div class="settings-team-person">
                        ${avatarHtml}
                        <div>
                            <strong>${member.name}</strong>
                            <small>${member.email} · ${roleLabels[member.role] || member.role}</small>
                        </div>
                    </div>
                    <span class="team-badge ${member.status}">${member.status === "active" ? "Активен" : "Приглашён"}</span>
                    ${inviteBtn}
                </li>
            `;
            }
        )
        .join("");

    list.querySelectorAll(".settings-team-resend").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const memberId = btn.dataset.memberId;
            const data = await window.appApi(`/api/organization/members/${memberId}/resend-invite`, {
                method: "POST",
            }).catch(() => null);
            if (!data?.invite_path) return;

            const fullUrl = `${window.location.origin}${data.invite_path}`;
            try {
                await navigator.clipboard.writeText(fullUrl);
                if (window.showSettingsStatus) window.showSettingsStatus(`Ссылка скопирована: ${fullUrl}`);
            } catch (e) {
                if (window.showSettingsStatus) window.showSettingsStatus(fullUrl);
            }
        });
    });
}

window.renderSettingsTeam = renderSettingsTeam;
