const modal = document.getElementById("login-modal");
const authError = document.getElementById("auth-error");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const tabs = document.querySelectorAll(".tab");
const mobileNav = document.getElementById("mobile-nav");
const menuToggle = document.getElementById("menu-toggle");

function openModal(tabName = "login") {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    switchTab(tabName);
}

function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    authError.hidden = true;
}

function closeMobileNav() {
    if (!mobileNav || !menuToggle) return;
    mobileNav.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
}

function toggleMobileNav() {
    if (!mobileNav || !menuToggle) return;
    const isOpen = !mobileNav.hidden;
    mobileNav.hidden = isOpen;
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
}

function switchTab(name) {
    tabs.forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.tab === name);
    });
    loginForm.classList.toggle("active", name === "login");
    registerForm.classList.toggle("active", name === "register");
    authError.hidden = true;
}

async function submitAuth(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || "Не удалось выполнить запрос");
    }
    window.location.href = "/app";
}

const loginOpenSelectors = [
    "#open-login-header",
    "#open-login-header-cta",
    "#open-login-hero",
    "#open-login-business",
    "#open-login-audience-1",
    "#open-login-audience-2",
    "#open-login-platform",
    "#open-login-mobile",
    "#open-login-footer",
];

document.querySelectorAll(loginOpenSelectors.join(", ")).forEach((button) => {
    button?.addEventListener("click", () => {
        closeMobileNav();
        openModal("login");
    });
});

document.getElementById("open-login-footer-cta")?.addEventListener("click", () => {
    closeMobileNav();
    openModal("register");
});

document.getElementById("close-login")?.addEventListener("click", closeModal);

modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeModal();
        closeMobileNav();
    }
});

menuToggle?.addEventListener("click", toggleMobileNav);

mobileNav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileNav);
});

tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    authError.hidden = true;

    const formData = new FormData(loginForm);
    try {
        await submitAuth("/api/auth/login", {
            email: formData.get("email"),
            password: formData.get("password"),
        });
    } catch (error) {
        authError.textContent = error.message;
        authError.hidden = false;
    }
});

registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    authError.hidden = true;

    const formData = new FormData(registerForm);
    try {
        await submitAuth("/api/auth/register", {
            name: formData.get("name"),
            company: formData.get("company"),
            email: formData.get("email"),
            password: formData.get("password"),
        });
    } catch (error) {
        authError.textContent = error.message;
        authError.hidden = false;
    }
});

const animated = document.querySelectorAll("[data-animate]");
const observer = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.12 }
);

animated.forEach((element) => {
    const delay = element.dataset.delay;
    if (delay) {
        element.style.setProperty("--delay", delay);
    }
    observer.observe(element);
});

document.querySelector(".site-header")?.classList.add("visible");
