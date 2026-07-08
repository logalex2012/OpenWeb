async function waitForTimewebWidget(maxAttempts = 24) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const widget = document.querySelector("agent-chat-widget");
        if (widget && typeof widget.show === "function") {
            return widget;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
}

async function openTimewebAgent() {
    const widget = await waitForTimewebWidget();
    if (!widget) {
        return false;
    }
    widget.show();
    return true;
}

async function openTimewebAgentWithPrompt(prompt) {
    const text = (prompt || "").trim();
    if (text && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            /* clipboard may be blocked */
        }
    }

    const opened = await openTimewebAgent();
    return { opened, copied: Boolean(text) };
}
