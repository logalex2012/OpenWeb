const inviteForm = document.getElementById("invite-accept-form");
const inviteError = document.getElementById("invite-error");

inviteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (inviteError) inviteError.hidden = true;

    const formData = new FormData(inviteForm);
    const submitBtn = inviteForm.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch(`/api/invite/${window.inviteToken}/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: formData.get("name"),
                password: formData.get("password"),
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Не удалось принять приглашение");
        }
        window.location.href = data.redirect || "/app";
    } catch (error) {
        if (inviteError) {
            inviteError.textContent = error.message;
            inviteError.hidden = false;
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
});
